-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 070: RH Budget Management Enhancement
-- Date: 2025-06-19
-- Description: Add columns for budget edit/delete tracking and soft-delete
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Enhance rh_budget_heures table with soft-delete and edit tracking
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS rh_budget_heures
ADD COLUMN IF NOT EXISTS is_deleted        BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS deleted_at        TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS edit_count        INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_modified_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS last_modified_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for active budgets query
CREATE INDEX IF NOT EXISTS idx_rh_budget_heures_active
  ON rh_budget_heures(section_id, is_deleted) WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_rh_budget_heures_deleted
  ON rh_budget_heures(deleted_at) WHERE is_deleted = TRUE;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Update RLS to filter deleted budgets
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_all_rh_budget_heures"  ON rh_budget_heures;
DROP POLICY IF EXISTS "rh_own_rh_budget_heures"     ON rh_budget_heures;
DROP POLICY IF EXISTS "plan_select_rh_budget_heures" ON rh_budget_heures;

CREATE POLICY "admin_all_rh_budget_heures"
  ON rh_budget_heures
  FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'user_role'::text) IN ('ADMIN', 'SUPER_ADMIN'))
  WITH CHECK ((auth.jwt() ->> 'user_role'::text) IN ('ADMIN', 'SUPER_ADMIN'));

CREATE POLICY "rh_own_rh_budget_heures"
  ON rh_budget_heures
  FOR ALL
  TO authenticated
  USING (
    (auth.jwt() ->> 'user_role'::text) = 'RH'
    AND is_deleted = FALSE
  )
  WITH CHECK (
    (auth.jwt() ->> 'user_role'::text) = 'RH'
    AND is_deleted = FALSE
  );

CREATE POLICY "plan_select_rh_budget_heures"
  ON rh_budget_heures
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() ->> 'user_role'::text) = 'PLAN'
    AND is_deleted = FALSE
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Soft-delete function with audit logging
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION soft_delete_rh_budget(
  p_budget_id UUID
)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
  v_budget_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM rh_budget_heures
    WHERE id         = p_budget_id
      AND is_deleted = FALSE
  ) INTO v_budget_exists;

  IF NOT v_budget_exists THEN
    RETURN QUERY SELECT FALSE, 'Budget not found or already deleted'::TEXT;
    RETURN;
  END IF;

  UPDATE rh_budget_heures
  SET
    is_deleted = TRUE,
    deleted_at = NOW(),
    deleted_by = auth.uid()
  WHERE id = p_budget_id;

  INSERT INTO audit_log (table_name, record_id, user_id, action, old_data, new_data)
  VALUES (
    'rh_budget_heures',
    p_budget_id,
    auth.uid(),
    'SOFT_DELETE',
    jsonb_build_object('is_deleted', FALSE),
    jsonb_build_object('is_deleted', TRUE, 'deleted_at', NOW())
  );

  RETURN QUERY SELECT TRUE, 'Budget deleted successfully'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Audit trigger for budget modifications
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION audit_rh_budget_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.edit_count       := COALESCE(OLD.edit_count, 0) + 1;
    NEW.last_modified_at := NOW();
    NEW.last_modified_by := auth.uid();

    IF OLD.heures_budget IS DISTINCT FROM NEW.heures_budget THEN
      INSERT INTO audit_log (table_name, record_id, user_id, action, old_data, new_data)
      VALUES (
        'rh_budget_heures',
        NEW.id,
        auth.uid(),
        'EDIT_HEURES',
        jsonb_build_object('heures_budget', OLD.heures_budget),
        jsonb_build_object('heures_budget', NEW.heures_budget)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_audit_rh_budget_changes ON rh_budget_heures;
CREATE TRIGGER trigger_audit_rh_budget_changes
  BEFORE UPDATE ON rh_budget_heures
  FOR EACH ROW
  WHEN (OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION audit_rh_budget_changes();

-- ───────────────────────────────────────────────────────────────────────────
-- 5. View for displaying active budgets with edit metadata
-- ───────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS rh_budgets_active CASCADE;
CREATE VIEW rh_budgets_active AS
SELECT
  b.id,
  s.societe_id AS company,
  b.periode AS period,
  b.section_id AS section,
  b.heures_budget AS montant_total,
  b.edit_count,
  b.created_at,
  b.last_modified_at,
  (SELECT full_name FROM users WHERE auth_id = b.last_modified_by LIMIT 1) AS last_modified_by_name,
  b.created_by,
  (SELECT full_name FROM users WHERE auth_id = b.created_by::uuid LIMIT 1) AS created_by_name,
  FALSE AS is_deleted
FROM rh_budget_heures b
LEFT JOIN rh_sections s ON s.id = b.section_id
WHERE b.is_deleted = FALSE;

GRANT SELECT ON rh_budgets_active TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. View for audit trail (RH/ADMIN only)
-- ───────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS rh_budgets_audit_trail CASCADE;
CREATE VIEW rh_budgets_audit_trail AS
SELECT
  b.id,
  s.societe_id AS company,
  b.periode AS period,
  b.section_id AS section,
  b.heures_budget AS montant_total,
  b.is_deleted,
  b.deleted_at,
  (SELECT full_name FROM users WHERE auth_id = b.deleted_by LIMIT 1) AS deleted_by_name,
  b.edit_count,
  COUNT(al.id)       AS audit_log_count,
  MAX(al.created_at) AS last_audit_change
FROM rh_budget_heures b
LEFT JOIN rh_sections s ON s.id = b.section_id
LEFT JOIN audit_log al
       ON al.record_id  = b.id
      AND al.table_name = 'rh_budget_heures'
GROUP BY b.id, s.societe_id, b.periode, b.section_id,
         b.heures_budget, b.is_deleted, b.deleted_at, b.deleted_by,
         b.edit_count;

GRANT SELECT ON rh_budgets_audit_trail TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
