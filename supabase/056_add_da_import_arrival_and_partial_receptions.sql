-- ==============================================================================
-- MIGRATION 056 : SUPPORT DES JALONS D'ARRIVÉE IMPORT ET DES RÉCEPTIONS PARTIELLES
-- ==============================================================================

-- Étapes physiques du workflow Import (Tamatave / Usine)
ALTER TYPE public.da_import_step
  ADD VALUE IF NOT EXISTS 'ARRIVEE_TAMATAVE' AFTER 'ETA';

ALTER TYPE public.da_import_step
  ADD VALUE IF NOT EXISTS 'ARRIVEE_USINE' AFTER 'ARRIVEE_TAMATAVE';

-- Dates de suivi pour les arrivées physiques
ALTER TABLE public.da_import
  ADD COLUMN IF NOT EXISTS date_arrivee_tamatave date,
  ADD COLUMN IF NOT EXISTS date_arrivee_usine date,
  ADD COLUMN IF NOT EXISTS partial_receptions jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Index pour les réceptions partielles stockées en JSONB
CREATE INDEX IF NOT EXISTS idx_da_import_partial_receptions
  ON public.da_import USING gin (partial_receptions);
