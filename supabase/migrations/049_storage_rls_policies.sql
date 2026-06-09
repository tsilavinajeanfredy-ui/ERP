-- ==============================================================================
-- MIGRATION 049 : AJOUT DES POLICIES RLS POUR LE STORAGE (storage.objects)
-- ==============================================================================

-- Les buckets ont été créés dans 001_schema.sql, mais les policies RLS
-- pour storage.objects n'avaient pas été définies.

-- Permettre aux utilisateurs authentifiés de lire les documents
CREATE POLICY "Allow auth read documents" 
ON storage.objects FOR SELECT TO authenticated 
USING (bucket_id = 'documents');

-- Permettre aux utilisateurs authentifiés d'uploader des documents
CREATE POLICY "Allow auth insert documents" 
ON storage.objects FOR INSERT TO authenticated 
WITH CHECK (bucket_id = 'documents');

-- Permettre aux utilisateurs authentifiés de modifier/écraser des documents
CREATE POLICY "Allow auth update documents" 
ON storage.objects FOR UPDATE TO authenticated 
USING (bucket_id = 'documents');

-- Permettre aux utilisateurs authentifiés de supprimer des documents
CREATE POLICY "Allow auth delete documents" 
ON storage.objects FOR DELETE TO authenticated 
USING (bucket_id = 'documents');
