-- ==============================================================================
-- MIGRATION 059 : RÉCLAMATIONS — CIRCUIT J+1, ESCALADE & LIAISON FCQ (Module 5)
-- ==============================================================================
-- - due_by          : échéance de traitement (J+1 par défaut)
-- - escalation_level: 0 = aucune, 1 = RQ, 2 = DPI, 3 = ADMIN/Direction
-- - escalated_at    : date de la dernière escalade
-- - fcq_id          : liaison réclamation → dossier FCQ (traçabilité CQ-Lab)
-- (Idempotente.)

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS due_by timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalation_level integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fcq_id uuid REFERENCES public.fcq_dossiers(id);

CREATE INDEX IF NOT EXISTS idx_complaints_due_by ON public.complaints(due_by);

-- Échéance J+1 automatique à la création (si non fournie)
CREATE OR REPLACE FUNCTION public.set_complaint_due_by()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.due_by IS NULL THEN
    NEW.due_by := COALESCE(NEW.opened_at, now()) + INTERVAL '1 day';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_complaint_due_by ON public.complaints;
CREATE TRIGGER trg_complaint_due_by
  BEFORE INSERT ON public.complaints
  FOR EACH ROW
  EXECUTE FUNCTION public.set_complaint_due_by();

-- Vue des réclamations en retard (non clôturées, échéance dépassée)
CREATE OR REPLACE VIEW public.overdue_complaints AS
SELECT
  c.id,
  c.code,
  c.client_name,
  c.severity,
  c.status,
  c.opened_at,
  c.due_by,
  c.escalation_level,
  c.escalated_at,
  EXTRACT(DAY FROM (now() - c.due_by)) AS days_overdue
FROM public.complaints c
WHERE c.status <> 'CLOTUREE'
  AND c.due_by IS NOT NULL
  AND now() > c.due_by
ORDER BY c.due_by ASC;

ALTER VIEW public.overdue_complaints SET (security_invoker = true);

-- Escalade automatique : à appeler par cron / Edge Function.
-- Paliers : J+1 → RQ (niveau 1), J+3 → DPI (niveau 2), J+6 → ADMIN (niveau 3).
CREATE OR REPLACE FUNCTION public.escalate_overdue_complaints()
RETURNS integer AS $$
DECLARE
  rec RECORD;
  desired_level integer;
  target_role text;
  escalated_count integer := 0;
BEGIN
  FOR rec IN
    SELECT * FROM public.complaints
    WHERE status <> 'CLOTUREE'
      AND due_by IS NOT NULL
      AND now() > due_by
  LOOP
    desired_level := 1;
    IF now() > rec.due_by + INTERVAL '2 days' THEN desired_level := 2; END IF;
    IF now() > rec.due_by + INTERVAL '5 days' THEN desired_level := 3; END IF;

    IF desired_level > rec.escalation_level THEN
      target_role := CASE desired_level
        WHEN 1 THEN 'RQ'
        WHEN 2 THEN 'DPI'
        ELSE 'ADMIN'
      END;

      UPDATE public.complaints
        SET escalation_level = desired_level,
            escalated_at = now()
        WHERE id = rec.id;

      INSERT INTO public.notifications (role, title, message, type, category, metadata)
      VALUES (
        target_role,
        '[RÉCLAMATION] Escalade niveau ' || desired_level || ' — ' || rec.code,
        'Réclamation ' || rec.code || ' (' || rec.client_name || ', sévérité ' || rec.severity ||
          ') non traitée dans les délais. Escalade niveau ' || desired_level || '.',
        'error',
        'QUALITY',
        jsonb_build_object('kind', 'COMPLAINT_ESCALATION', 'complaint_id', rec.id,
                           'escalation_level', desired_level, 'screen', 'Complaints')
      );

      escalated_count := escalated_count + 1;
    END IF;
  END LOOP;

  RETURN escalated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.escalate_overdue_complaints() IS 'Escalade les réclamations en retard (J+1/J+3/J+6) et notifie RQ/DPI/ADMIN. À planifier via cron.';
