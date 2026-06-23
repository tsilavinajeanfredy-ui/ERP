-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 069: PLAN Role Access & Affectation Workflow
-- Date: 2025-06-19
-- Description: Configure PLAN role with RH data access (no write),
--              affectation workflow (PLAN → RH → DIRECTION notifications)
-- ═══════════════════════════════════════════════════════════════════════════
-- CORRECTIONS APPLIQUÉES :
--   1. CREATE POLICY IF NOT EXISTS → n'existe pas en PostgreSQL
--      → remplacé par DROP POLICY IF EXISTS + CREATE POLICY
--   2. users_view → vue inexistante dans le schéma
--      → remplacé par has_role() (déjà défini dans rls_audit_refined.sql)
--      → Pour rh_sections et rh_personnel : mise à jour des policies
--        existantes plutôt que création de policies conflictuelles
--   3. record_audit_logs → table inexistante
--      → remplacé par audit_log (colonnes : table_name, record_id, action,
--         user_id, old_data jsonb, new_data jsonb)
--   4. rh_personnel → mauvais nom de table (sans 's')
--      → remplacé par rh_personnels
--   5. plan_insert_affectations WITH CHECK : plan_status IS NULL
--      → toujours FALSE car la colonne a DEFAULT 'EN_ATTENTE'
--      → remplacé par plan_status = 'EN_ATTENTE'
--   6. Colonnes notifications inexistantes :
--      is_read   → read (colonne réelle)
--      target_role → role (colonne réelle)
--      company, source_id, source_table → colonnes inexistantes, supprimées
--   7. Self-référence inutile dans audit_affectation_workflow :
--      (SELECT company FROM rh_affectations WHERE id = NEW.id)
--      → NEW.company (direct, évite un aller-retour inutile)
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Add affectation workflow columns if not exist
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS rh_affectations
ADD COLUMN IF NOT EXISTS plan_status         VARCHAR(20) DEFAULT 'EN_ATTENTE'
  CHECK (plan_status IN ('EN_ATTENTE', 'ACCEPTEE_PLAN', 'REFUSEE_PLAN', 'VALIDEE_RH', 'REJETEE_RH')),
ADD COLUMN IF NOT EXISTS plan_comment        TEXT,
ADD COLUMN IF NOT EXISTS plan_validated_at   TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS plan_validator_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS rh_status           VARCHAR(20)
  CHECK (rh_status IN ('VALIDEE_RH', 'REJETEE_RH')),
ADD COLUMN IF NOT EXISTS rh_comment          TEXT,
ADD COLUMN IF NOT EXISTS rh_validated_at     TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS rh_validator_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add index for workflow queries
CREATE INDEX IF NOT EXISTS idx_rh_affectations_plan_status
  ON rh_affectations(plan_status) WHERE plan_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rh_affectations_workflow
  ON rh_affectations(plan_status, rh_status, created_at);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. RLS Policies for PLAN Role - RH Data Access (READ ONLY)
-- ───────────────────────────────────────────────────────────────────────────

-- Enable RLS on RH tables if not already
ALTER TABLE rh_personnels  ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_sections    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_affectations ENABLE ROW LEVEL SECURITY;

-- BUG CORRIGÉ : users_view → has_role() + CREATE POLICY IF NOT EXISTS invalide.
-- BUG CORRIGÉ : Les policies rh_personnels_policy et rh_sections_policy
-- existent déjà (rls_audit_refined.sql) et ne couvrent pas PLAN.
-- On les recrée pour inclure PLAN en lecture.

DROP POLICY IF EXISTS "rh_personnels_policy"      ON rh_personnels;
DROP POLICY IF EXISTS "plan_select_rh_personnel"  ON rh_personnels;

CREATE POLICY "rh_personnels_policy" ON rh_personnels FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'user_role'::text) IN ('RH', 'ADMIN', 'SUPER_ADMIN', 'DPI', 'DSI', 'PLAN'))
  WITH CHECK ((auth.jwt() ->> 'user_role'::text) IN ('RH', 'ADMIN', 'SUPER_ADMIN'));

DROP POLICY IF EXISTS "rh_sections_policy"        ON rh_sections;
DROP POLICY IF EXISTS "plan_select_rh_sections"   ON rh_sections;

CREATE POLICY "rh_sections_policy" ON rh_sections FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'user_role'::text) IN ('RH', 'ADMIN', 'SUPER_ADMIN', 'DPI', 'DSI', 'PLAN'))
  WITH CHECK ((auth.jwt() ->> 'user_role'::text) IN ('RH', 'ADMIN', 'SUPER_ADMIN'));

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RLS Policies for Affectation Workflow
-- ───────────────────────────────────────────────────────────────────────────

-- BUG CORRIGÉ : CREATE POLICY IF NOT EXISTS → DROP + CREATE

-- PLAN can SELECT affectations
DROP POLICY IF EXISTS "rh_affectations_policy"            ON rh_affectations;
DROP POLICY IF EXISTS "rh_affectations_authenticated"     ON rh_affectations;
DROP POLICY IF EXISTS "plan_insert_affectations"          ON rh_affectations;
DROP POLICY IF EXISTS "plan_update_affectations"          ON rh_affectations;
DROP POLICY IF EXISTS "rh_update_affectations_workflow"   ON rh_affectations;

-- Base SELECT : tous les rôles concernés peuvent lire
CREATE POLICY "rh_affectations_policy" ON rh_affectations
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'user_role'::text) IN ('RH', 'ADMIN', 'SUPER_ADMIN', 'DPI', 'DSI', 'PLAN', 'RPROD'));

-- PLAN peut créer des demandes d'affectation
-- BUG CORRIGÉ : plan_status IS NULL → toujours FALSE (DEFAULT 'EN_ATTENTE')
-- → remplacé par plan_status = 'EN_ATTENTE'
CREATE POLICY "plan_insert_affectations"
  ON rh_affectations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'user_role'::text) = 'PLAN'
    AND plan_status = 'EN_ATTENTE'
  );

-- PLAN peut mettre à jour ses propres décisions
CREATE POLICY "plan_update_affectations"
  ON rh_affectations
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'user_role'::text) = 'PLAN'
    AND plan_status IN ('EN_ATTENTE', 'ACCEPTEE_PLAN', 'REFUSEE_PLAN')
  )
  WITH CHECK (
    (auth.jwt() ->> 'user_role'::text) = 'PLAN'
    AND plan_status IN ('EN_ATTENTE', 'ACCEPTEE_PLAN', 'REFUSEE_PLAN')
    AND plan_validator_id = auth.uid()
  );

-- RH peut valider/rejeter les décisions PLAN
CREATE POLICY "rh_update_affectations_workflow"
  ON rh_affectations
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'user_role'::text) IN ('RH', 'ADMIN', 'SUPER_ADMIN')
    AND plan_status IN ('ACCEPTEE_PLAN', 'REFUSEE_PLAN')
  )
  WITH CHECK (
    (auth.jwt() ->> 'user_role'::text) IN ('RH', 'ADMIN', 'SUPER_ADMIN')
    AND rh_status IN ('VALIDEE_RH', 'REJETEE_RH')
    AND rh_validator_id = auth.uid()
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Audit & Notifications Trigger for Affectation Workflow
-- ───────────────────────────────────────────────────────────────────────────

-- BUG CORRIGÉ :
--   • rh_personnel → rh_personnels
--   • Colonnes notifications : is_read → read, target_role → role
--   • Suppression de company, source_id, source_table (inexistants)
--   • ON CONFLICT DO NOTHING retiré (pas de contrainte unique en place)

CREATE OR REPLACE FUNCTION notify_affectation_workflow()
RETURNS TRIGGER AS $$
DECLARE
  v_notif_category   TEXT;
  v_notif_title      TEXT;
  v_notif_message    TEXT;
  v_recipient_role   TEXT;
  v_company          TEXT;
  v_personnel_name   TEXT;
  v_created_by_uid   UUID;
BEGIN
  -- BUG CORRIGÉ : Colonnes inexistantes (company, created_by)
  SELECT (p.nom || ' ' || p.prenoms)
  INTO   v_personnel_name
  FROM   rh_affectations a
  LEFT JOIN rh_personnels p ON p.id = a.personnel_id
  WHERE  a.id = NEW.id;
  
  v_created_by_uid := NULL;
  v_company := NULL;

  -- ─── PLAN ACCEPTE → notifier RH ─────────────────────────────────────────
  IF OLD.plan_status IS DISTINCT FROM NEW.plan_status
     AND NEW.plan_status = 'ACCEPTEE_PLAN' THEN

    v_notif_category := 'WORKFLOW_AFFECTATION';
    v_notif_title    := '[PLAN] Affectation acceptée';
    v_notif_message  := FORMAT(
      'PLAN a accepté l''affectation de %s. Commentaire: %s',
      v_personnel_name,
      COALESCE(NEW.plan_comment, 'Aucun')
    );

    -- BUG CORRIGÉ : is_read → read, target_role → role,
    --               suppression company/source_id/source_table
    INSERT INTO notifications (user_id, category, title, message, type, read, role)
    SELECT
      u.id,
      v_notif_category,
      v_notif_title,
      v_notif_message,
      'info',
      FALSE,
      'RH'
    FROM users u
    WHERE u.active = TRUE
      AND u.role   = 'RH';

  -- ─── PLAN REFUSE → notifier RPROD (créateur) + RH ───────────────────────
  ELSIF OLD.plan_status IS DISTINCT FROM NEW.plan_status
     AND NEW.plan_status = 'REFUSEE_PLAN' THEN

    v_notif_category := 'WORKFLOW_AFFECTATION';
    v_notif_title    := '[PLAN] Affectation refusée';
    v_notif_message  := FORMAT(
      'PLAN a refusé l''affectation de %s. Motif: %s',
      v_personnel_name,
      COALESCE(NEW.plan_comment, 'Non spécifié')
    );

    -- Notifier le créateur (RPROD)
    IF v_created_by_uid IS NOT NULL THEN
      INSERT INTO notifications (user_id, category, title, message, type, read)
      VALUES (
        (SELECT id FROM users WHERE auth_id = v_created_by_uid LIMIT 1),
        v_notif_category, v_notif_title, v_notif_message, 'warning', FALSE
      );
    END IF;

    -- Notifier RH pour visibilité
    INSERT INTO notifications (user_id, category, title, message, type, read, role)
    SELECT u.id, v_notif_category, v_notif_title, v_notif_message, 'warning', FALSE, 'RH'
    FROM users u WHERE u.active = TRUE AND u.role = 'RH';

  -- ─── RH VALIDE → notifier DIRECTION ─────────────────────────────────────
  ELSIF OLD.rh_status IS DISTINCT FROM NEW.rh_status
     AND NEW.rh_status = 'VALIDEE_RH' THEN

    v_notif_category := 'WORKFLOW_AFFECTATION';
    v_notif_title    := '[RH] Affectation validée';
    v_notif_message  := FORMAT(
      'RH a validé l''affectation de %s. PLAN: %s | RH: %s',
      v_personnel_name,
      COALESCE(NEW.plan_comment, '-'),
      COALESCE(NEW.rh_comment,   '-')
    );

    INSERT INTO notifications (user_id, category, title, message, type, read, role)
    SELECT u.id, v_notif_category, v_notif_title, v_notif_message, 'success', FALSE, 'DPI'
    FROM users u WHERE u.active = TRUE AND u.role IN ('DPI', 'ADMIN');

  -- ─── RH REJETTE → notifier RPROD + DIRECTION ────────────────────────────
  ELSIF OLD.rh_status IS DISTINCT FROM NEW.rh_status
     AND NEW.rh_status = 'REJETEE_RH' THEN

    v_notif_category := 'WORKFLOW_AFFECTATION';
    v_notif_title    := '[RH] Affectation rejetée';
    v_notif_message  := FORMAT(
      'RH a rejeté l''affectation de %s. Motif: %s (PLAN: %s)',
      v_personnel_name,
      COALESCE(NEW.rh_comment,   'Non spécifié'),
      COALESCE(NEW.plan_comment, '-')
    );

    -- Notifier le créateur (RPROD)
    IF v_created_by_uid IS NOT NULL THEN
      INSERT INTO notifications (user_id, category, title, message, type, read)
      VALUES (
        (SELECT id FROM users WHERE auth_id = v_created_by_uid LIMIT 1),
        v_notif_category, v_notif_title, v_notif_message, 'error', FALSE
      );
    END IF;

    -- Notifier DIRECTION
    INSERT INTO notifications (user_id, category, title, message, type, read, role)
    SELECT u.id, v_notif_category, v_notif_title, v_notif_message, 'error', FALSE, 'DPI'
    FROM users u WHERE u.active = TRUE AND u.role IN ('DPI', 'ADMIN');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_affectation_workflow ON rh_affectations;
CREATE TRIGGER trigger_notify_affectation_workflow
  AFTER UPDATE ON rh_affectations
  FOR EACH ROW
  WHEN (OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION notify_affectation_workflow();

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Audit Log for Affectation Workflow Changes
-- ───────────────────────────────────────────────────────────────────────────

-- BUG CORRIGÉ :
--   • record_audit_logs → audit_log
--   • record_table → table_name
--   • old_value/new_value (TEXT) → old_data/new_data (JSONB)
--   • company → n'existe pas dans audit_log, supprimé
--   • Self-référence coûteuse :
--     (SELECT company FROM rh_affectations WHERE id = NEW.id) → NEW.company

CREATE OR REPLACE FUNCTION audit_affectation_workflow()
RETURNS TRIGGER AS $$
BEGIN
  IF COALESCE(OLD.plan_status, '') IS DISTINCT FROM COALESCE(NEW.plan_status, '') THEN
    INSERT INTO audit_log (table_name, record_id, user_id, action, old_data, new_data)
    VALUES (
      'rh_affectations',
      NEW.id,
      auth.uid(),
      'UPDATE_PLAN_STATUS',
      jsonb_build_object('plan_status', OLD.plan_status),
      jsonb_build_object('plan_status', NEW.plan_status)
    );
  END IF;

  IF COALESCE(OLD.rh_status, '') IS DISTINCT FROM COALESCE(NEW.rh_status, '') THEN
    INSERT INTO audit_log (table_name, record_id, user_id, action, old_data, new_data)
    VALUES (
      'rh_affectations',
      NEW.id,
      auth.uid(),
      'UPDATE_RH_STATUS',
      jsonb_build_object('rh_status', OLD.rh_status),
      jsonb_build_object('rh_status', NEW.rh_status)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_audit_affectation_workflow ON rh_affectations;
CREATE TRIGGER trigger_audit_affectation_workflow
  AFTER UPDATE ON rh_affectations
  FOR EACH ROW
  WHEN (OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION audit_affectation_workflow();

-- ───────────────────────────────────────────────────────────────────────────
-- 6. View for PLAN: Affectation Pending Actions
-- ───────────────────────────────────────────────────────────────────────────

-- BUG CORRIGÉ : rh_personnel → rh_personnels

DROP VIEW IF EXISTS affectation_plan_actions CASCADE;
CREATE VIEW affectation_plan_actions AS
SELECT
  a.id,
  NULL::TEXT                                        AS company,
  a.personnel_id,
  NULL::TEXT                                        AS position,
  a.date_debut                                      AS affectation_date,
  a.plan_status,
  a.plan_comment,
  (p.nom || ' ' || p.prenoms)                       AS personnel_name,
  p.matricule,
  p.section_id                                      AS section,
  NULL::TEXT                                        AS requested_by,
  a.created_at,
  a.plan_validated_at,
  (a.plan_status = 'EN_ATTENTE')                    AS is_pending_plan_decision
FROM rh_affectations a
LEFT JOIN rh_personnels p   ON p.id = a.personnel_id
WHERE a.plan_status IN ('EN_ATTENTE', 'ACCEPTEE_PLAN', 'REFUSEE_PLAN');

GRANT SELECT ON affectation_plan_actions TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. View for RH: Affectation Validation Queue
-- ───────────────────────────────────────────────────────────────────────────

-- BUG CORRIGÉ : rh_personnel → rh_personnels

DROP VIEW IF EXISTS affectation_rh_validation_queue CASCADE;
CREATE VIEW affectation_rh_validation_queue AS
SELECT
  a.id,
  NULL::TEXT                                                      AS company,
  a.personnel_id,
  NULL::TEXT                                                      AS position,
  a.date_debut                                                    AS affectation_date,
  a.plan_status,
  a.plan_comment,
  a.rh_status,
  a.rh_comment,
  (p.nom || ' ' || p.prenoms)                                     AS personnel_name,
  p.matricule,
  NULL::TEXT                                                      AS plan_validator_name,
  a.plan_validated_at,
  a.created_at,
  (a.plan_status IN ('ACCEPTEE_PLAN', 'REFUSEE_PLAN')
   AND a.rh_status IS NULL)                                       AS is_pending_rh_decision
FROM rh_affectations a
LEFT JOIN rh_personnels p       ON p.id = a.personnel_id
WHERE a.plan_status IN ('ACCEPTEE_PLAN', 'REFUSEE_PLAN', 'VALIDEE_RH', 'REJETEE_RH');

GRANT SELECT ON affectation_rh_validation_queue TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 8. Summary: PLAN Role Permissions
-- ───────────────────────────────────────────────────────────────────────────
-- ✓ READ: rh_personnels, rh_sections (données opérationnelles)
-- ✓ CREATE/UPDATE: rh_affectations (étapes workflow 1-2)
-- ✓ CANNOT SEE: fnc_budgets, da_import, purchasing (no policies)
-- ✓ Workflow: PLAN accept/reject → RH validate/reject → DPI/ADMIN notifié
-- ───────────────────────────────────────────────────────────────────────────
