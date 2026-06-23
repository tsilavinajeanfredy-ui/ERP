-- ==============================================================================
-- MIGRATION 062 : ALERTE LOTS EN QUARANTAINE / BLOQUÉS > 7 JOURS (Module 4)
-- ==============================================================================
-- Le hook useQuarantineAlerts() interroge la vue `lots_quarantine_alerts` qui
-- n'existait dans aucune migration. Cette vue liste les lots non statués
-- (QUARANTAINE) ou bloqués (BLOQUE) depuis plus de 7 jours.
-- Colonnes consommées par l'UI : lot_id, lot_code, article_name, days_in_status,
-- cqlib_status. (Idempotente.)

CREATE OR REPLACE VIEW public.lots_quarantine_alerts AS
SELECT
  l.id   AS lot_id,
  l.code AS lot_code,
  a.name AS article_name,
  a.code AS article_code,
  l.cqlib_status,
  l.qty_current,
  l.unit,
  l.depot_id,
  COALESCE(l.cqlib_decided_at, l.reception_date::timestamptz, l.created_at) AS status_since,
  FLOOR(
    EXTRACT(EPOCH FROM (now() - COALESCE(l.cqlib_decided_at, l.reception_date::timestamptz, l.created_at))) / 86400
  )::int AS days_in_status
FROM public.lots l
JOIN public.articles a ON a.id = l.article_id
WHERE l.cqlib_status IN ('QUARANTAINE', 'BLOQUE')
  AND l.qty_current > 0
  AND now() - COALESCE(l.cqlib_decided_at, l.reception_date::timestamptz, l.created_at) > INTERVAL '7 days';

ALTER VIEW public.lots_quarantine_alerts SET (security_invoker = true);

-- Notification quotidienne (cron / Edge Function) : alerte RQ + MAGA pour
-- chaque lot resté en quarantaine/bloqué > 7 jours. Retourne le nb d'alertes.
CREATE OR REPLACE FUNCTION public.notify_quarantine_overdue()
RETURNS integer AS $$
DECLARE
  rec RECORD;
  n integer := 0;
BEGIN
  FOR rec IN SELECT * FROM public.lots_quarantine_alerts LOOP
    -- Évite les doublons : une alerte par lot et par jour
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE metadata->>'kind' = 'QUARANTINE_OVERDUE'
        AND metadata->>'lot_id' = rec.lot_id::text
        AND created_at::date = CURRENT_DATE
    ) THEN
      INSERT INTO public.notifications (role, title, message, type, category, metadata)
      VALUES (
        'RQ',
        '[QUALITÉ] Lot ' || rec.cqlib_status || ' depuis ' || rec.days_in_status || ' j — ' || rec.lot_code,
        'Le lot ' || rec.lot_code || ' (' || rec.article_name || ') est en ' || rec.cqlib_status ||
          ' depuis ' || rec.days_in_status || ' jours. Décision qualité requise.',
        'warning',
        'QUALITY',
        jsonb_build_object('kind', 'QUARANTINE_OVERDUE', 'lot_id', rec.lot_id,
                           'days_in_status', rec.days_in_status, 'screen', 'Inventory')
      );
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON VIEW public.lots_quarantine_alerts IS 'Lots en QUARANTAINE/BLOQUE depuis > 7 jours (Module 4).';
