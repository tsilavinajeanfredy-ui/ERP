-- ==============================================================================
-- MIGRATION 060 : ÉVALUATION FOURNISSEUR — PONDÉRATION CONFIGURABLE DES CRITÈRES
-- ==============================================================================
-- Permet de pondérer chaque critère (QUALITY, DELIVERY, PRICE, COMPLIANCE,
-- SERVICE) et d'activer/désactiver des critères. Le score global pondéré est
-- calculé côté application à partir de ces poids.
-- (Idempotente.)

CREATE TABLE IF NOT EXISTS public.supplier_eval_criteria_weights (
  criteria   text PRIMARY KEY,
  label      text NOT NULL,
  weight     numeric(5,2) NOT NULL DEFAULT 1 CHECK (weight >= 0),
  active     boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Pondérations par défaut (somme = 1.00)
INSERT INTO public.supplier_eval_criteria_weights (criteria, label, weight, sort_order) VALUES
  ('QUALITY',    'Qualité',    0.35, 1),
  ('DELIVERY',   'Délais',     0.25, 2),
  ('PRICE',      'Prix',       0.15, 3),
  ('COMPLIANCE', 'Conformité', 0.15, 4),
  ('SERVICE',    'Service',    0.10, 5)
ON CONFLICT (criteria) DO NOTHING;

ALTER TABLE public.supplier_eval_criteria_weights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "weights_read_all" ON public.supplier_eval_criteria_weights;
CREATE POLICY "weights_read_all"
  ON public.supplier_eval_criteria_weights
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "weights_admin_write" ON public.supplier_eval_criteria_weights;
CREATE POLICY "weights_admin_write"
  ON public.supplier_eval_criteria_weights
  FOR ALL TO authenticated
  USING (public.get_role() IN ('ADMIN', 'RQ', 'RACH', 'DPI'))
  WITH CHECK (public.get_role() IN ('ADMIN', 'RQ', 'RACH', 'DPI'));
