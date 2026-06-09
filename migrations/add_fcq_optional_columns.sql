-- ============================================================
-- Migration : colonnes optionnelles fcq_dossiers
-- À exécuter dans Supabase Dashboard → SQL Editor
-- ============================================================

-- Ajouter les colonnes manquantes si elles n'existent pas encore
ALTER TABLE fcq_dossiers
  ADD COLUMN IF NOT EXISTS results          jsonb    DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS out_of_spec_count integer  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motif_decision   text,
  ADD COLUMN IF NOT EXISTS observation_rq   text,
  ADD COLUMN IF NOT EXISTS controleur_nom   text,
  ADD COLUMN IF NOT EXISTS quantite_controlee numeric;

-- Colonnes optionnelles dans lots (pour cqlib)
ALTER TABLE lots
  ADD COLUMN IF NOT EXISTS cqlib_status     text,
  ADD COLUMN IF NOT EXISTS cqlib_decided_by uuid     REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cqlib_decided_at timestamptz;

-- Forcer le rechargement du schema cache PostgREST
NOTIFY pgrst, 'reload schema';
