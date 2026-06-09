-- ============================================================================
-- ERP GSI — Audit et Affinage des Politiques RLS
-- Remplace les politiques génériques "auth_read_all_v2" par des politiques
-- granulaires table par table, rôle par rôle.
--
-- À exécuter dans le SQL Editor Supabase.
-- Valider avec l'équipe Finance avant déploiement en production.
-- ============================================================================

-- ─── Helper: récupère le rôle de l'utilisateur courant ─────────────────────
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- ─── Helper: check multi-rôles ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION has_role(VARIADIC roles TEXT[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_id = auth.uid()
      AND role = ANY(roles)
  );
$$;

-- ============================================================================
-- TABLE: users
-- Lecture : soi-même + ADMIN/SUPER_ADMIN/DPI/DSI
-- Écriture : ADMIN/SUPER_ADMIN uniquement
-- ============================================================================
DROP POLICY IF EXISTS "users_select" ON users;
DROP POLICY IF EXISTS "users_update" ON users;
DROP POLICY IF EXISTS "users_insert" ON users;
DROP POLICY IF EXISTS "users_delete" ON users;

CREATE POLICY "users_select" ON users FOR SELECT TO authenticated
  USING (
    auth_id = auth.uid()
    OR has_role('ADMIN', 'SUPER_ADMIN', 'DPI', 'DSI')
  );

CREATE POLICY "users_update" ON users FOR UPDATE TO authenticated
  USING (has_role('ADMIN', 'SUPER_ADMIN'))
  WITH CHECK (has_role('ADMIN', 'SUPER_ADMIN'));

CREATE POLICY "users_insert" ON users FOR INSERT TO authenticated
  WITH CHECK (has_role('ADMIN', 'SUPER_ADMIN'));

CREATE POLICY "users_delete" ON users FOR DELETE TO authenticated
  USING (has_role('SUPER_ADMIN'));

-- ============================================================================
-- TABLE: lots (Lots de production/réception)
-- Lecture : tous les rôles opérationnels
-- Écriture : TLAB, RQ, RPROD, MAGA, ADMIN, SUPER_ADMIN
-- ============================================================================
DROP POLICY IF EXISTS "lots_select" ON lots;
DROP POLICY IF EXISTS "lots_write" ON lots;

CREATE POLICY "lots_select" ON lots FOR SELECT TO authenticated
  USING (has_role('ADMIN', 'SUPER_ADMIN', 'DPI', 'RQ', 'TLAB', 'RPROD', 'MAGA', 'PLAN', 'COMPTA', 'DSI'));

CREATE POLICY "lots_write" ON lots FOR ALL TO authenticated
  USING (has_role('ADMIN', 'SUPER_ADMIN', 'TLAB', 'RQ', 'RPROD', 'MAGA'))
  WITH CHECK (has_role('ADMIN', 'SUPER_ADMIN', 'TLAB', 'RQ', 'RPROD', 'MAGA'));

-- ============================================================================
-- TABLE: fcq_dossiers (Fiches Contrôle Qualité)
-- Lecture : tous rôles qualité + management
-- Écriture : TLAB, RQ, ADMIN, SUPER_ADMIN
-- ============================================================================
DROP POLICY IF EXISTS "fcq_select" ON fcq_dossiers;
DROP POLICY IF EXISTS "fcq_write" ON fcq_dossiers;

CREATE POLICY "fcq_select" ON fcq_dossiers FOR SELECT TO authenticated
  USING (has_role('ADMIN', 'SUPER_ADMIN', 'DPI', 'RQ', 'TLAB', 'RPROD', 'MAGA', 'DSI'));

CREATE POLICY "fcq_write" ON fcq_dossiers FOR ALL TO authenticated
  USING (has_role('ADMIN', 'SUPER_ADMIN', 'TLAB', 'RQ'))
  WITH CHECK (has_role('ADMIN', 'SUPER_ADMIN', 'TLAB', 'RQ'));

-- ============================================================================
-- TABLE: fnc (Fiches Non-Conformité)
-- Lecture : RQ + management + auditeurs
-- Écriture : RQ, TLAB, ADMIN, SUPER_ADMIN
-- ============================================================================
DROP POLICY IF EXISTS "fnc_select" ON fnc;
DROP POLICY IF EXISTS "fnc_write" ON fnc;

CREATE POLICY "fnc_select" ON fnc FOR SELECT TO authenticated
  USING (has_role('ADMIN', 'SUPER_ADMIN', 'DPI', 'RQ', 'TLAB', 'DSI'));

CREATE POLICY "fnc_write" ON fnc FOR ALL TO authenticated
  USING (has_role('ADMIN', 'SUPER_ADMIN', 'RQ', 'TLAB'))
  WITH CHECK (has_role('ADMIN', 'SUPER_ADMIN', 'RQ', 'TLAB'));

-- ============================================================================
-- TABLE: production_orders
-- Lecture : RPROD, PLAN, DPI + management
-- Écriture : RPROD, PLAN, ADMIN, SUPER_ADMIN
-- ============================================================================
DROP POLICY IF EXISTS "production_orders_select" ON production_orders;
DROP POLICY IF EXISTS "production_orders_write" ON production_orders;

CREATE POLICY "production_orders_select" ON production_orders FOR SELECT TO authenticated
  USING (has_role('ADMIN', 'SUPER_ADMIN', 'DPI', 'RPROD', 'PLAN', 'MAGA', 'DSI', 'COMPTA'));

CREATE POLICY "production_orders_write" ON production_orders FOR ALL TO authenticated
  USING (has_role('ADMIN', 'SUPER_ADMIN', 'RPROD', 'PLAN'))
  WITH CHECK (has_role('ADMIN', 'SUPER_ADMIN', 'RPROD', 'PLAN'));

-- ============================================================================
-- TABLE: da_import / da_local (Demandes d'Achat)
-- Lecture : RACH, COMPTA, DPI + management
-- Écriture : RACH, ADMIN, SUPER_ADMIN
-- ============================================================================
DROP POLICY IF EXISTS "da_import_select" ON da_import;
DROP POLICY IF EXISTS "da_import_write" ON da_import;
DROP POLICY IF EXISTS "da_local_select" ON da_local;
DROP POLICY IF EXISTS "da_local_write" ON da_local;

CREATE POLICY "da_import_select" ON da_import FOR SELECT TO authenticated
  USING (has_role('ADMIN', 'SUPER_ADMIN', 'DPI', 'RACH', 'COMPTA', 'PLAN', 'DSI'));

CREATE POLICY "da_import_write" ON da_import FOR ALL TO authenticated
  USING (has_role('ADMIN', 'SUPER_ADMIN', 'RACH'))
  WITH CHECK (has_role('ADMIN', 'SUPER_ADMIN', 'RACH'));

CREATE POLICY "da_local_select" ON da_local FOR SELECT TO authenticated
  USING (has_role('ADMIN', 'SUPER_ADMIN', 'DPI', 'RACH', 'COMPTA', 'PLAN', 'MAGA', 'DSI'));

CREATE POLICY "da_local_write" ON da_local FOR ALL TO authenticated
  USING (has_role('ADMIN', 'SUPER_ADMIN', 'RACH'))
  WITH CHECK (has_role('ADMIN', 'SUPER_ADMIN', 'RACH'));

-- ============================================================================
-- TABLE: stocks / inventory_campaigns / inventory_counts
-- Lecture : MAGA, RPROD, PLAN, DPI + management
-- Écriture : MAGA, ADMIN, SUPER_ADMIN
-- ============================================================================
DROP POLICY IF EXISTS "inventory_campaigns_select" ON inventory_campaigns;
DROP POLICY IF EXISTS "inventory_campaigns_write" ON inventory_campaigns;
DROP POLICY IF EXISTS "inventory_counts_select" ON inventory_counts;
DROP POLICY IF EXISTS "inventory_counts_write" ON inventory_counts;

CREATE POLICY "inventory_campaigns_select" ON inventory_campaigns FOR SELECT TO authenticated
  USING (has_role('ADMIN', 'SUPER_ADMIN', 'DPI', 'MAGA', 'RPROD', 'PLAN', 'COMPTA', 'DSI'));

CREATE POLICY "inventory_campaigns_write" ON inventory_campaigns FOR ALL TO authenticated
  USING (has_role('ADMIN', 'SUPER_ADMIN', 'MAGA'))
  WITH CHECK (has_role('ADMIN', 'SUPER_ADMIN', 'MAGA'));

CREATE POLICY "inventory_counts_select" ON inventory_counts FOR SELECT TO authenticated
  USING (has_role('ADMIN', 'SUPER_ADMIN', 'DPI', 'MAGA', 'RPROD', 'PLAN', 'DSI'));

CREATE POLICY "inventory_counts_write" ON inventory_counts FOR ALL TO authenticated
  USING (has_role('ADMIN', 'SUPER_ADMIN', 'MAGA'))
  WITH CHECK (has_role('ADMIN', 'SUPER_ADMIN', 'MAGA'));

-- ============================================================================
-- TABLE: rh_* — Politiques RH affinées (remplace USING(true))
-- Lecture + écriture : RH, ADMIN, SUPER_ADMIN
-- Lecture seule DPI/DSI (reporting)
-- ============================================================================
DROP POLICY IF EXISTS "rh_societes_authenticated" ON rh_societes;
DROP POLICY IF EXISTS "rh_sections_authenticated" ON rh_sections;
DROP POLICY IF EXISTS "rh_personnels_authenticated" ON rh_personnels;
DROP POLICY IF EXISTS "rh_heures_hebdo_authenticated" ON rh_heures_hebdo;
DROP POLICY IF EXISTS "rh_affectations_demandes_authenticated" ON rh_affectations_demandes;
DROP POLICY IF EXISTS "rh_affectations_authenticated" ON rh_affectations;
DROP POLICY IF EXISTS "rh_budget_heures_authenticated" ON rh_budget_heures;

-- Sociétés / Sections : référentiel, lecture RH + management
CREATE POLICY "rh_societes_policy" ON rh_societes FOR ALL TO authenticated
  USING (has_role('RH', 'ADMIN', 'SUPER_ADMIN', 'DPI', 'DSI'))
  WITH CHECK (has_role('RH', 'ADMIN', 'SUPER_ADMIN'));

CREATE POLICY "rh_sections_policy" ON rh_sections FOR ALL TO authenticated
  USING (has_role('RH', 'ADMIN', 'SUPER_ADMIN', 'DPI', 'DSI'))
  WITH CHECK (has_role('RH', 'ADMIN', 'SUPER_ADMIN'));

-- Personnels : données sensibles — RH uniquement en écriture
CREATE POLICY "rh_personnels_policy" ON rh_personnels FOR ALL TO authenticated
  USING (has_role('RH', 'ADMIN', 'SUPER_ADMIN', 'DPI', 'DSI'))
  WITH CHECK (has_role('RH', 'ADMIN', 'SUPER_ADMIN'));

CREATE POLICY "rh_heures_hebdo_policy" ON rh_heures_hebdo FOR ALL TO authenticated
  USING (has_role('RH', 'ADMIN', 'SUPER_ADMIN', 'DPI', 'DSI'))
  WITH CHECK (has_role('RH', 'ADMIN', 'SUPER_ADMIN'));

-- Affectations demandes : les opérateurs peuvent voir leurs propres demandes
CREATE POLICY "rh_affectations_demandes_policy" ON rh_affectations_demandes FOR ALL TO authenticated
  USING (
    has_role('RH', 'ADMIN', 'SUPER_ADMIN', 'DPI', 'DSI')
    OR requested_by = auth.uid()
  )
  WITH CHECK (has_role('RH', 'ADMIN', 'SUPER_ADMIN'));

CREATE POLICY "rh_affectations_policy" ON rh_affectations FOR ALL TO authenticated
  USING (has_role('RH', 'ADMIN', 'SUPER_ADMIN', 'DPI', 'DSI'))
  WITH CHECK (has_role('RH', 'ADMIN', 'SUPER_ADMIN'));

CREATE POLICY "rh_budget_heures_policy" ON rh_budget_heures FOR ALL TO authenticated
  USING (has_role('RH', 'ADMIN', 'SUPER_ADMIN', 'DPI', 'DSI', 'COMPTA'))
  WITH CHECK (has_role('RH', 'ADMIN', 'SUPER_ADMIN'));

-- ============================================================================
-- Supabase Audit Logs — À activer dans le dashboard Supabase :
-- Settings → Logs → Enable Auth Audit Logs
-- Settings → Logs → Enable Database Audit Logs
-- Configurer la rétention à 90 jours minimum.
-- ============================================================================
