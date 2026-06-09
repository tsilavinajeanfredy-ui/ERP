-- ==============================================================================
-- ERP GSI - MIGRATION 031 : REPORTING / BI - VUES AGGRÉGÉES
-- ==============================================================================

-- 1. Vue BI : Stock par type d'article
CREATE OR REPLACE VIEW bi_stock_by_type AS
SELECT
  a.article_type,
  COUNT(DISTINCT l.id) AS lot_count,
  COUNT(DISTINCT a.id) AS article_count,
  COALESCE(SUM(l.qty_current), 0) AS total_qty,
  COALESCE(SUM(l.qty_current * COALESCE(a.standard_cost, 0)), 0) AS total_value
FROM articles a
LEFT JOIN lots l ON l.article_id = a.id AND l.cqlib_status = 'LIBERE'
WHERE a.active = true
GROUP BY a.article_type;

-- 2. Vue BI : Production mensuelle
CREATE OR REPLACE VIEW bi_monthly_production AS
SELECT
  DATE_TRUNC('month', po.completed_at) AS month,
  a.article_type,
  a.family,
  COUNT(DISTINCT po.id) AS order_count,
  COALESCE(SUM(po.qty_produced), 0) AS total_produced,
  COALESCE(SUM(po.actual_cost), 0) AS total_cost,
  COALESCE(SUM(po.qty_planned), 0) AS total_planned
FROM production_orders po
JOIN articles a ON a.id = po.product_id
WHERE po.status = 'TERMINE'
GROUP BY DATE_TRUNC('month', po.completed_at), a.article_type, a.family
ORDER BY month DESC;

-- 3. Vue BI : Qualité - Taux de conformité
CREATE OR REPLACE VIEW bi_quality_fpy AS
SELECT
  DATE_TRUNC('month', fcq.created_at) AS month,
  COUNT(*) AS total_dossiers,
  COUNT(*) FILTER (WHERE fcq.decision = 'LIBERE') AS liberes,
  ROUND(
    (COUNT(*) FILTER (WHERE fcq.decision = 'LIBERE')::numeric / NULLIF(COUNT(*), 0)) * 100,
    2
  ) AS fpy_pct
FROM fcq_dossiers fcq
GROUP BY DATE_TRUNC('month', fcq.created_at)
ORDER BY month DESC;

-- 4. Vue BI : Achats - Dépenses par fournisseur
CREATE OR REPLACE VIEW bi_purchasing_by_supplier AS
SELECT
  s.id AS supplier_id,
  s.code AS supplier_code,
  s.name AS supplier_name,
  COUNT(DISTINCT di.id) AS import_count,
  COUNT(DISTINCT dl.id) AS local_count,
  COALESCE(SUM(di.amount_currency), 0) AS total_import_amount,
  COALESCE(SUM(dl.amount_mga), 0) AS total_local_amount
FROM suppliers s
LEFT JOIN da_import di ON di.supplier_id = s.id
LEFT JOIN da_local dl ON dl.supplier_id = s.id
WHERE s.active = true
GROUP BY s.id, s.code, s.name;
