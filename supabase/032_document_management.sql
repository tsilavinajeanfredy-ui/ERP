-- ==============================================================================
-- ERP GSI - MIGRATION 032 : GESTION DOCUMENTAIRE
-- ==============================================================================

-- 1. Table de métadonnées des documents
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  file_path text NOT NULL,
  bucket text NOT NULL DEFAULT 'documents',
  mime_type text,
  file_size bigint,
  reference_type text, -- 'DA_IMPORT', 'DA_LOCAL', 'FNC', 'FOURNISSEUR', 'ARTICLE', 'OF'
  reference_id uuid,
  category text, -- 'CONTRAT', 'CERTIFICAT', 'FICHE_TECHNIQUE', 'DEVIS', 'FACTURE', 'RAPPORT'
  tags text[],
  uploaded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Index
CREATE INDEX IF NOT EXISTS idx_documents_reference ON documents(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);

-- 3. RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_documents" ON documents;
CREATE POLICY "auth_read_documents" ON documents
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_documents" ON documents;
CREATE POLICY "auth_insert_documents" ON documents
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_documents" ON documents;
CREATE POLICY "auth_delete_documents" ON documents
  FOR DELETE TO authenticated USING (
    uploaded_by = (SELECT id FROM users WHERE auth_id = auth.uid())
    OR public.get_role() = 'ADMIN'
  );
