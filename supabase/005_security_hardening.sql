-- ==============================================================================
-- ERP GSI - SCRIPT DE DURCISSEMENT DE SÉCURITÉ (RLS & RÔLES)
-- À exécuter dans le SQL Editor de Supabase
-- ==============================================================================

-- 1. Mise à jour de l'énumération des rôles
-- Ajout des rôles manquants s'ils n'existent pas déjà
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'user_role' AND e.enumlabel = 'SUPER_ADMIN') THEN
        ALTER TYPE user_role ADD VALUE 'SUPER_ADMIN';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'user_role' AND e.enumlabel = 'DSI') THEN
        ALTER TYPE user_role ADD VALUE 'DSI';
    END IF;
END $$;

-- 2. Création d'une fonction helper sécurisée pour obtenir le rôle via auth.uid()
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS user_role AS $$
  SELECT role FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 3. Harmonisation des politiques RLS pour utiliser auth.uid()
-- Note : On boucle sur les tables pour appliquer une politique de lecture de base sécurisée

DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
    LOOP
        -- Supprimer les anciennes politiques basées sur l'email si elles existent
        EXECUTE format('DROP POLICY IF EXISTS "auth_read_all" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "admin_all" ON %I', t);
        
        -- Politique de lecture : Autorisé si l'utilisateur existe dans public.users (lié par auth.uid())
        EXECUTE format('CREATE POLICY "auth_read_all_v2" ON %I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid()))', t);
        
        -- Politique Admin : Contrôle total pour ADMIN et SUPER_ADMIN
        -- Note : On cast en TEXT pour éviter l'erreur "unsafe use of new value" dans la même transaction
        EXECUTE format('CREATE POLICY "admin_all_v2" ON %I FOR ALL TO authenticated USING (public.get_auth_role()::text IN (''ADMIN'', ''SUPER_ADMIN''))', t);
    END LOOP;
END $$;

-- 4. Sécurisation spécifique des politiques métier
-- Exemple pour le module Qualité (RQ)
DROP POLICY IF EXISTS "rq_write" ON public.qc_specifications;
CREATE POLICY "rq_write_v2" 
  ON public.qc_specifications FOR ALL 
  TO authenticated 
  USING (public.get_auth_role()::text IN ('RQ', 'ADMIN', 'SUPER_ADMIN'));

-- Exemple pour le Laboratoire (TLAB)
DROP POLICY IF EXISTS "tlab_write" ON public.fcq_results;
CREATE POLICY "tlab_write_v2" 
  ON public.fcq_results FOR INSERT 
  TO authenticated 
  WITH CHECK (public.get_auth_role()::text = 'TLAB');
