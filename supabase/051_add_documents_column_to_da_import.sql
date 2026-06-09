-- ==============================================================================
-- MIGRATION 051 : AJOUT COLONNE documents (JSONB) À LA TABLE da_import
-- À exécuter dans : Supabase Dashboard > SQL Editor
-- ==============================================================================

-- Ajouter la colonne documents (tableau JSON de pièces jointes)
ALTER TABLE da_import
  ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Index GIN pour les recherches dans les documents
CREATE INDEX IF NOT EXISTS idx_da_import_documents
  ON da_import USING gin(documents);

-- Vérification
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'da_import' AND column_name = 'documents';
