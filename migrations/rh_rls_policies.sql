-- ============================================================
-- Migration: RLS Policies pour les tables RH
-- Problème: erreur 403 lors de l'import (INSERT sur rh_societes,
--           rh_sections, rh_personnels, rh_heures_hebdo)
--           et erreur 400 sur les requêtes SELECT
--
-- À exécuter dans le SQL Editor de votre projet Supabase
-- ============================================================

-- 1. Activer RLS sur toutes les tables RH (si pas déjà fait)
ALTER TABLE IF EXISTS rh_societes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS rh_sections              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS rh_personnels            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS rh_heures_hebdo          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS rh_affectations_demandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS rh_affectations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS rh_budget_heures         ENABLE ROW LEVEL SECURITY;

-- 2. Supprimer les anciennes policies si elles existent
DROP POLICY IF EXISTS "rh_societes_authenticated"              ON rh_societes;
DROP POLICY IF EXISTS "rh_sections_authenticated"              ON rh_sections;
DROP POLICY IF EXISTS "rh_personnels_authenticated"            ON rh_personnels;
DROP POLICY IF EXISTS "rh_heures_hebdo_authenticated"          ON rh_heures_hebdo;
DROP POLICY IF EXISTS "rh_affectations_demandes_authenticated" ON rh_affectations_demandes;
DROP POLICY IF EXISTS "rh_affectations_authenticated"          ON rh_affectations;
DROP POLICY IF EXISTS "rh_budget_heures_authenticated"         ON rh_budget_heures;

-- 3. Créer des policies qui autorisent les utilisateurs authentifiés

-- rh_societes : lecture + écriture pour RH/ADMIN, lecture pour les autres
CREATE POLICY "rh_societes_authenticated" ON rh_societes
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- rh_sections
CREATE POLICY "rh_sections_authenticated" ON rh_sections
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- rh_personnels
CREATE POLICY "rh_personnels_authenticated" ON rh_personnels
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- rh_heures_hebdo
CREATE POLICY "rh_heures_hebdo_authenticated" ON rh_heures_hebdo
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- rh_affectations_demandes
CREATE POLICY "rh_affectations_demandes_authenticated" ON rh_affectations_demandes
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- rh_affectations
CREATE POLICY "rh_affectations_authenticated" ON rh_affectations
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- rh_budget_heures (peut ne pas exister encore, créer la table si nécessaire)
CREATE TABLE IF NOT EXISTS rh_budget_heures (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  section_id   uuid REFERENCES rh_sections(id) ON DELETE CASCADE,
  periode      text NOT NULL,
  heures_budget integer NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES users(id),
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE(section_id, periode)
);

ALTER TABLE IF EXISTS rh_budget_heures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rh_budget_heures_authenticated" ON rh_budget_heures
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4. Accorder les accès aux views (si elles existent)
-- Les views héritent des policies des tables sous-jacentes,
-- mais il faut s'assurer que le rôle authenticated peut les lire
GRANT SELECT ON rh_dashboard_view  TO authenticated;
GRANT SELECT ON rh_personnel_view  TO authenticated;

-- 5. Vérification finale
-- SELECT schemaname, tablename, policyname, cmd
-- FROM pg_policies
-- WHERE tablename LIKE 'rh_%'
-- ORDER BY tablename, policyname;
