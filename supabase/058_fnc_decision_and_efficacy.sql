-- ==============================================================================
-- MIGRATION 058 : DÉCISIONS FNC TYPÉES + VÉRIFICATION D'EFFICACITÉ (Module 5)
-- ==============================================================================
-- - decision_type : décision qualité typée déclenchant un workflow
--     BLOQUE      → maintien du blocage (notif RQ)
--     DETERIORE   → rebut / mise au rebut (notif MAGA)
--     RETOUR      → retour fournisseur, alerte achat (notif RACH)
--     TRI         → tri / sous-OF de tri (notif RPROD)
--     REWORK      → reprise / OF de correction (notif RPROD)
-- - efficacy_checked : la vérification d'efficacité (D6) doit être validée
--   AVANT toute clôture (gate appliqué côté UI + trigger DB).
-- (Idempotente.)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fnc_decision') THEN
    CREATE TYPE fnc_decision AS ENUM ('BLOQUE', 'DETERIORE', 'RETOUR', 'TRI', 'REWORK');
  END IF;
END $$;

ALTER TABLE public.fnc
  ADD COLUMN IF NOT EXISTS decision_type fnc_decision,
  ADD COLUMN IF NOT EXISTS decision_notes text,
  ADD COLUMN IF NOT EXISTS decision_at timestamptz,
  ADD COLUMN IF NOT EXISTS decision_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS efficacy_checked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS efficacy_notes text,
  ADD COLUMN IF NOT EXISTS efficacy_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS efficacy_checked_by uuid REFERENCES public.users(id);

-- Gate : interdire le passage à CLOTUREE sans vérification d'efficacité validée.
CREATE OR REPLACE FUNCTION public.enforce_fnc_efficacy_before_close()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'CLOTUREE' AND COALESCE(OLD.status, '') <> 'CLOTUREE' THEN
    IF NEW.efficacy_checked IS NOT TRUE THEN
      RAISE EXCEPTION 'Clôture FNC impossible : la vérification d''efficacité (D6) doit être validée avant clôture.';
    END IF;
    IF NEW.decision_type IS NULL THEN
      RAISE EXCEPTION 'Clôture FNC impossible : une décision qualité (BLOQUE/DETERIORE/RETOUR/TRI/REWORK) doit être saisie.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fnc_efficacy_before_close ON public.fnc;
CREATE TRIGGER trg_fnc_efficacy_before_close
  BEFORE UPDATE ON public.fnc
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_fnc_efficacy_before_close();

COMMENT ON COLUMN public.fnc.decision_type IS 'Décision qualité typée déclenchant un workflow (BLOQUE/DETERIORE/RETOUR/TRI/REWORK)';
COMMENT ON COLUMN public.fnc.efficacy_checked IS 'Vérification d''efficacité des actions correctives (D6) — requise avant clôture';
