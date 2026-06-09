-- ============================================================================
-- Migration 048 : Correction RLS DELETE et UPDATE pour DSI / SUPER_ADMIN
-- Problème : le bouton "Supprimer" ne fonctionnait pas pour les admins car
-- aucune politique DELETE n'autorisait explicitement ces rôles.
-- ============================================================================

-- ─── HELPER : lecture du rôle courant ────────────────────────────────────────
-- On réutilise la fonction get_user_role() déjà créée dans les migrations précédentes.

-- ─── TABLE : lots ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "lots_delete_admin" ON lots;
CREATE POLICY "lots_delete_admin" ON lots
  FOR DELETE
  USING (
    get_user_role() IN ('DSI', 'SUPER_ADMIN', 'MAGA')
  );

DROP POLICY IF EXISTS "lots_update_admin" ON lots;
CREATE POLICY "lots_update_admin" ON lots
  FOR UPDATE
  USING (
    get_user_role() IN ('DSI', 'SUPER_ADMIN', 'MAGA', 'TLAB', 'RQ')
  );

-- ─── TABLE : fnc ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "fnc_delete_admin" ON fnc;
CREATE POLICY "fnc_delete_admin" ON fnc
  FOR DELETE
  USING (
    get_user_role() IN ('DSI', 'SUPER_ADMIN', 'RQ')
  );

-- ─── TABLE : fcq_dossiers ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "fcq_delete_admin" ON fcq_dossiers;
CREATE POLICY "fcq_delete_admin" ON fcq_dossiers
  FOR DELETE
  USING (
    get_user_role() IN ('DSI', 'SUPER_ADMIN', 'TLAB', 'RQ')
  );

-- ─── TABLE : da_import ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "da_import_delete_admin" ON da_import;
CREATE POLICY "da_import_delete_admin" ON da_import
  FOR DELETE
  USING (
    get_user_role() IN ('DSI', 'SUPER_ADMIN', 'RACH')
  );

-- ─── TABLE : da_local ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "da_local_delete_admin" ON da_local;
CREATE POLICY "da_local_delete_admin" ON da_local
  FOR DELETE
  USING (
    get_user_role() IN ('DSI', 'SUPER_ADMIN', 'RACH')
  );

-- ─── TABLE : instruments ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "instruments_delete_admin" ON instruments;
CREATE POLICY "instruments_delete_admin" ON instruments
  FOR DELETE
  USING (
    get_user_role() IN ('DSI', 'SUPER_ADMIN', 'RESPONSABLE')
  );

-- ─── TABLE : suppliers ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "suppliers_delete_admin" ON suppliers;
CREATE POLICY "suppliers_delete_admin" ON suppliers
  FOR DELETE
  USING (
    get_user_role() IN ('DSI', 'SUPER_ADMIN', 'RACH')
  );

-- ─── TABLE : articles ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "articles_delete_admin" ON articles;
CREATE POLICY "articles_delete_admin" ON articles
  FOR DELETE
  USING (
    get_user_role() IN ('DSI', 'SUPER_ADMIN')
  );

-- ─── TABLE : users ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users_delete_admin" ON users;
CREATE POLICY "users_delete_admin" ON users
  FOR DELETE
  USING (
    get_user_role() IN ('DSI', 'SUPER_ADMIN')
  );

-- ─── TABLE : supplier_evaluations ───────────────────────────────────────────
DROP POLICY IF EXISTS "supplier_eval_delete_admin" ON supplier_evaluations;
CREATE POLICY "supplier_eval_delete_admin" ON supplier_evaluations
  FOR DELETE
  USING (
    get_user_role() IN ('DSI', 'SUPER_ADMIN', 'RACH')
  );

-- ─── TABLE : complaints ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "complaints_delete_admin" ON complaints;
CREATE POLICY "complaints_delete_admin" ON complaints
  FOR DELETE
  USING (
    get_user_role() IN ('DSI', 'SUPER_ADMIN', 'RQ')
  );

-- ─── TABLE : maintenance_tasks ───────────────────────────────────────────────
DROP POLICY IF EXISTS "maintenance_delete_admin" ON maintenance_tasks;
CREATE POLICY "maintenance_delete_admin" ON maintenance_tasks
  FOR DELETE
  USING (
    get_user_role() IN ('DSI', 'SUPER_ADMIN', 'RESPONSABLE')
  );

-- ─── TABLE : qc_specifications ───────────────────────────────────────────────
DROP POLICY IF EXISTS "qc_spec_delete_admin" ON qc_specifications;
CREATE POLICY "qc_spec_delete_admin" ON qc_specifications
  FOR DELETE
  USING (
    get_user_role() IN ('DSI', 'SUPER_ADMIN', 'RQ', 'TLAB')
  );
