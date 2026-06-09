-- ==============================================================================
-- MIGRATION 052 : REFRESH DU SCHEMA CACHE POSTGREST
-- À exécuter dans : Supabase Dashboard > SQL Editor
-- ==============================================================================

-- Force PostgREST à recharger son cache de schéma
-- (nécessaire après un ALTER TABLE pour éviter PGRST204)
NOTIFY pgrst, 'reload schema';
