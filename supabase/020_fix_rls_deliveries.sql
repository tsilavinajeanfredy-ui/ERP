-- ============================================================================
-- Fix RLS: da_local_deliveries was missing policies (RLS enabled, no policies)
-- ============================================================================

-- da_local_deliveries
ALTER TABLE da_local_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_all" ON da_local_deliveries;
DROP POLICY IF EXISTS "admin_all" ON da_local_deliveries;
DROP POLICY IF EXISTS "rach_all" ON da_local_deliveries;

CREATE POLICY "auth_read_all" ON da_local_deliveries FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_all" ON da_local_deliveries FOR ALL TO authenticated USING (public.get_role() = 'ADMIN');
CREATE POLICY "rach_all" ON da_local_deliveries FOR ALL TO authenticated USING (public.get_role() = 'RACH');
