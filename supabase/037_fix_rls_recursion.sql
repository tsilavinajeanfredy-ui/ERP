-- ==============================================================================
-- ERP GSI - MIGRATION 037 : CORRECTIF DE RÉCURSION INFINIE RLS
-- Résout l'erreur 500 / 400 "Database error querying schema" lors de la connexion
-- ==============================================================================

-- 1. Création d'une fonction de vérification d'authentification robuste
-- SECURITY DEFINER permet d'exécuter la requête avec les privilèges du créateur (bypass RLS)
-- et ainsi d'éviter l'auto-référence infinie sur la table public.users.
CREATE OR REPLACE FUNCTION public.is_authenticated_user()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users WHERE auth_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. Mise à jour automatique de toutes les politiques de lecture RLS sur toutes les tables
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
    LOOP
        -- Suppression de l'ancienne politique récursive (si elle existe)
        EXECUTE format('DROP POLICY IF EXISTS "auth_read_all_v2" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "auth_read_all_v3" ON %I', t);
        
        -- Création de la nouvelle politique non-récursive via le helper SECURITY DEFINER
        EXECUTE format('CREATE POLICY "auth_read_all_v3" ON %I FOR SELECT TO authenticated USING (public.is_authenticated_user())', t);
    END LOOP;
END $$;

COMMENT ON FUNCTION public.is_authenticated_user() IS 'Vérifie de manière non-récursive si l''utilisateur connecté est enregistré dans la table publique.';
