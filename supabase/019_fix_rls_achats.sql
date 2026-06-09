-- Migration 019 : Correction RLS pour les tables d'achats
-- Problème : da_import et da_local renvoyaient 400 pour les utilisateurs non-RACH
-- Cause : le policy "adh_read_all" n'était pas appliqué correctement sur ces tables
-- Solution : recréer les policies avec les bons rôles (RACH + ADMIN)

-- ─── DA Import ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_read_all" ON da_import;
DROP POLICY IF EXISTS "admin_all" ON da_import;
DROP POLICY IF EXISTS "rach_all" ON da_import;

CREATE POLICY "auth_read_all" ON da_import FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_all" ON da_import FOR ALL TO authenticated USING (public.get_role() = 'ADMIN');
CREATE POLICY "rach_all" ON da_import FOR ALL TO authenticated USING (public.get_role() = 'RACH');

-- ─── DA Local ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_read_all" ON da_local;
DROP POLICY IF EXISTS "admin_all" ON da_local;
DROP POLICY IF EXISTS "rach_all" ON da_local;

CREATE POLICY "auth_read_all" ON da_local FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_all" ON da_local FOR ALL TO authenticated USING (public.get_role() = 'ADMIN');
CREATE POLICY "rach_all" ON da_local FOR ALL TO authenticated USING (public.get_role() = 'RACH');

-- ─── Exchange Rates ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_read_all" ON exchange_rates;
DROP POLICY IF EXISTS "admin_all" ON exchange_rates;

CREATE POLICY "auth_read_all" ON exchange_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_all" ON exchange_rates FOR ALL TO authenticated USING (public.get_role() = 'ADMIN');

-- ─── BOM Headers (production) ──────────────────────────────────────────────
DROP POLICY IF EXISTS "rprod_write" ON bom_headers;
CREATE POLICY "rprod_write" ON bom_headers FOR INSERT TO authenticated WITH CHECK (public.get_role() IN ('RPROD', 'ADMIN'));
DROP POLICY IF EXISTS "rprod_update" ON bom_headers;
CREATE POLICY "rprod_update" ON bom_headers FOR UPDATE TO authenticated USING (public.get_role() IN ('RPROD', 'ADMIN')) WITH CHECK (true);
DROP POLICY IF EXISTS "rprod_delete" ON bom_headers;
CREATE POLICY "rprod_delete" ON bom_headers FOR DELETE TO authenticated USING (public.get_role() IN ('RPROD', 'ADMIN'));

-- ─── BOM Lines ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "rprod_write" ON bom_lines;
CREATE POLICY "rprod_write" ON bom_lines FOR INSERT TO authenticated WITH CHECK (public.get_role() IN ('RPROD', 'ADMIN'));
DROP POLICY IF EXISTS "rprod_update" ON bom_lines;
CREATE POLICY "rprod_update" ON bom_lines FOR UPDATE TO authenticated USING (public.get_role() IN ('RPROD', 'ADMIN')) WITH CHECK (true);
DROP POLICY IF EXISTS "rprod_delete" ON bom_lines;
CREATE POLICY "rprod_delete" ON bom_lines FOR DELETE TO authenticated USING (public.get_role() IN ('RPROD', 'ADMIN'));

-- ─── Production Orders ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "rprod_write" ON production_orders;
CREATE POLICY "rprod_write" ON production_orders FOR INSERT TO authenticated WITH CHECK (public.get_role() IN ('RPROD', 'ADMIN'));
DROP POLICY IF EXISTS "rprod_update" ON production_orders;
CREATE POLICY "rprod_update" ON production_orders FOR UPDATE TO authenticated USING (public.get_role() IN ('RPROD', 'ADMIN')) WITH CHECK (true);
