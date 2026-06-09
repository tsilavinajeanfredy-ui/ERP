-- ============================================================================
-- ERP GSI — Fix RLS lots (MP vs PF) + Table scénarios MRP
-- ============================================================================

-- ─── Fix RLS lots : MAGA → MP, RPROD → PF, ADMIN → tout ──
DROP POLICY IF EXISTS "maga_write" ON lots;
CREATE POLICY "maga_write" ON lots FOR INSERT TO authenticated WITH CHECK (
  public.get_role() = 'MAGA'
  AND EXISTS (SELECT 1 FROM articles WHERE id = article_id AND article_type = 'MP')
);

DROP POLICY IF EXISTS "rprod_write" ON lots;
CREATE POLICY "rprod_write" ON lots FOR INSERT TO authenticated WITH CHECK (
  public.get_role() = 'RPROD'
  AND EXISTS (SELECT 1 FROM articles WHERE id = article_id AND article_type = 'PF')
);

-- ─── Colonnes manquantes sur bons_entree ─────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bons_entree' AND column_name = 'article_id') THEN
    ALTER TABLE bons_entree ADD COLUMN article_id uuid REFERENCES articles(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bons_entree' AND column_name = 'unit') THEN
    ALTER TABLE bons_entree ADD COLUMN unit text NOT NULL DEFAULT 'kg';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bons_entree' AND column_name = 'reference_doc') THEN
    ALTER TABLE bons_entree ADD COLUMN reference_doc text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bons_entree' AND column_name = 'carrier') THEN
    ALTER TABLE bons_entree ADD COLUMN carrier text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bons_entree' AND column_name = 'package_count') THEN
    ALTER TABLE bons_entree ADD COLUMN package_count int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bons_entree' AND column_name = 'status') THEN
    ALTER TABLE bons_entree ADD COLUMN status text NOT NULL DEFAULT 'BROUILLON';
  END IF;
END $$;

-- RLS bons_entree : MAGA + ADMIN peuvent insérer
DROP POLICY IF EXISTS "maga_write" ON bons_entree;
CREATE POLICY "maga_write" ON bons_entree FOR INSERT TO authenticated WITH CHECK (public.get_role() IN ('MAGA', 'ADMIN'));

-- ─── Table : mrp_scenarios (What-If) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mrp_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  horizon_days int NOT NULL DEFAULT 90,
  article_filter text NOT NULL DEFAULT 'ALL',
  site_id uuid REFERENCES sites(id),
  demand_change numeric(5,2),
  created_by uuid REFERENCES users(id),
  results jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mrp_scenarios_created ON mrp_scenarios(created_at DESC);

ALTER TABLE mrp_scenarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read_all" ON mrp_scenarios;
CREATE POLICY "auth_read_all" ON mrp_scenarios FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin_all" ON mrp_scenarios;
CREATE POLICY "admin_all" ON mrp_scenarios FOR ALL TO authenticated USING (public.get_role() = 'ADMIN');
DROP POLICY IF EXISTS "dpi_rprod_write" ON mrp_scenarios;
CREATE POLICY "dpi_rprod_write" ON mrp_scenarios FOR INSERT TO authenticated WITH CHECK (public.get_role() IN ('DPI', 'RPROD', 'ADMIN'));
DROP POLICY IF EXISTS "dpi_rprod_update" ON mrp_scenarios;
CREATE POLICY "dpi_rprod_update" ON mrp_scenarios FOR UPDATE TO authenticated USING (public.get_role() IN ('DPI', 'RPROD', 'ADMIN')) WITH CHECK (true);
