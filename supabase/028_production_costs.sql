-- ==============================================================================
-- ERP GSI - MIGRATION 028 : COÛTS DE PRODUCTION (STANDARD vs RÉEL)
-- ==============================================================================

-- 1. Coût standard par article
ALTER TABLE public.articles
ADD COLUMN IF NOT EXISTS standard_cost numeric(14,4) DEFAULT 0;

-- 2. Coûts réels sur les ordres de fabrication
ALTER TABLE public.production_orders
ADD COLUMN IF NOT EXISTS actual_cost numeric(14,4),
ADD COLUMN IF NOT EXISTS estimated_cost numeric(14,4),
ADD COLUMN IF NOT EXISTS cost_breakdown jsonb; -- { "raw_materials": ..., "labor": ..., "overhead": ... }

-- 3. Vue des écarts de coûts
CREATE OR REPLACE VIEW production_cost_view AS
SELECT
  po.id AS order_id,
  po.code AS order_code,
  a.id AS product_id,
  a.code AS product_code,
  a.name AS product_name,
  a.standard_cost,
  po.qty_planned,
  po.qty_produced,
  po.estimated_cost,
  po.actual_cost,
  CASE
    WHEN po.estimated_cost > 0 THEN ROUND(((po.actual_cost - po.estimated_cost) / po.estimated_cost) * 100, 2)
    ELSE NULL
  END AS cost_variance_pct,
  CASE
    WHEN po.status = 'TERMINE' AND po.actual_cost IS NOT NULL THEN 'CLOS'
    WHEN po.status = 'TERMINE' THEN 'EN_ATTENTE_COUT'
    ELSE po.status
  END AS cost_status,
  po.started_at,
  po.completed_at
FROM production_orders po
JOIN articles a ON a.id = po.product_id;

ALTER VIEW production_cost_view SET (security_invoker = true);
