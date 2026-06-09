-- ============================================================================
-- ERP GSI — Supplier Evaluation Module (Phase 6)
-- Évaluation fournisseurs avec scoring multi-critères et suivi historique
-- ============================================================================

-- ─── ENUM pour les critères d'évaluation ────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'eval_criteria') THEN
    CREATE TYPE eval_criteria AS ENUM ('QUALITY', 'DELIVERY', 'PRICE', 'COMPLIANCE', 'SERVICE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'eval_period') THEN
    CREATE TYPE eval_period AS ENUM ('Q1', 'Q2', 'Q3', 'Q4', 'YEARLY');
  END IF;
END $$;

-- ─── TABLE : supplier_evaluations ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  period eval_period NOT NULL DEFAULT 'YEARLY',
  year int NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  criteria eval_criteria NOT NULL,
  score numeric(3,2) NOT NULL CHECK (score >= 0 AND score <= 5),
  comment text,
  evaluated_by uuid REFERENCES users(id),
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(supplier_id, period, year, criteria)
);

-- ─── TABLE : supplier_evaluation_summary ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_evaluation_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  period eval_period NOT NULL DEFAULT 'YEARLY',
  year int NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  overall_score numeric(3,2),
  evaluation_count int NOT NULL DEFAULT 0,
  classification text, -- 'A' (excellent), 'B' (bon), 'C' (moyen), 'D' (faible)
  notes text,
  evaluated_by uuid REFERENCES users(id),
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(supplier_id, period, year)
);

-- ─── INDEXES ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_supplier_eval_supplier ON supplier_evaluations(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_eval_summary_supplier ON supplier_evaluation_summary(supplier_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE supplier_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_evaluation_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_all" ON supplier_evaluations;
CREATE POLICY "auth_read_all" ON supplier_evaluations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin_all" ON supplier_evaluations;
CREATE POLICY "admin_all" ON supplier_evaluations FOR ALL TO authenticated USING (public.get_role() = 'ADMIN');

DROP POLICY IF EXISTS "auth_read_all" ON supplier_evaluation_summary;
CREATE POLICY "auth_read_all" ON supplier_evaluation_summary FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin_all" ON supplier_evaluation_summary;
CREATE POLICY "admin_all" ON supplier_evaluation_summary FOR ALL TO authenticated USING (public.get_role() = 'ADMIN');

-- RACH (Acheteurs) peuvent aussi évaluer les fournisseurs
DROP POLICY IF EXISTS "rach_write" ON supplier_evaluations;
CREATE POLICY "rach_write" ON supplier_evaluations FOR INSERT TO authenticated WITH CHECK (public.get_role() = 'RACH');
DROP POLICY IF EXISTS "rach_update" ON supplier_evaluations;
CREATE POLICY "rach_update" ON supplier_evaluations FOR UPDATE TO authenticated USING (public.get_role() = 'RACH') WITH CHECK (true);

DROP POLICY IF EXISTS "rach_write" ON supplier_evaluation_summary;
CREATE POLICY "rach_write" ON supplier_evaluation_summary FOR INSERT TO authenticated WITH CHECK (public.get_role() = 'RACH');
DROP POLICY IF EXISTS "rach_update" ON supplier_evaluation_summary;
CREATE POLICY "rach_update" ON supplier_evaluation_summary FOR UPDATE TO authenticated USING (public.get_role() = 'RACH') WITH CHECK (true);
