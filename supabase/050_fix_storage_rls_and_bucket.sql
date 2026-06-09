-- ==============================================================================
-- MIGRATION 050 : CORRECTIF COMPLET DU BUCKET 'documents' + POLICIES RLS STORAGE
-- À exécuter dans : Supabase Dashboard > SQL Editor
-- ==============================================================================

-- 1. S'assurer que le bucket 'documents' existe et est public
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  true,
  10485760, -- 10 Mo
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- 2. Supprimer les anciennes policies si elles existent (évite les conflits)
DROP POLICY IF EXISTS "Allow auth read documents"   ON storage.objects;
DROP POLICY IF EXISTS "Allow auth insert documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow auth update documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow auth delete documents" ON storage.objects;

-- 3. Recréer les policies proprement
-- SELECT : tout utilisateur authentifié peut lire
CREATE POLICY "Allow auth read documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'documents');

-- INSERT : tout utilisateur authentifié peut uploader
CREATE POLICY "Allow auth insert documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');

-- UPDATE : tout utilisateur authentifié peut écraser un fichier existant
CREATE POLICY "Allow auth update documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'documents')
WITH CHECK (bucket_id = 'documents');

-- DELETE : tout utilisateur authentifié peut supprimer
CREATE POLICY "Allow auth delete documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'documents');

-- 4. Vérification : lister les policies créées
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname ILIKE '%documents%';
