-- ==============================================================================
-- ERP GSI - MIGRATION 055 : STOCK FINAL
-- Vue d'état de stock final basée sur les lots (qty_current)
-- ==============================================================================

CREATE OR REPLACE VIEW final_stock_view AS
SELECT
  l.article_id,
  a.code AS article_code,
  a.name AS article_name,
  a.article_type,
  a.unit,
  l.depot_id,
  d.code AS depot_code,
  d.name AS depot_name,
  COALESCE(SUM(l.qty_current), 0) AS qty_final,
  COUNT(DISTINCT l.id) AS lot_count
FROM lots l
LEFT JOIN articles a ON a.id = l.article_id
LEFT JOIN depots d ON d.id = l.depot_id
WHERE l.cqlib_status = 'LIBERE'
GROUP BY
  l.article_id,
  a.code,
  a.name,
  a.article_type,
  a.unit,
  l.depot_id,
  d.code,
  d.name;

ALTER VIEW final_stock_view SET (security_invoker = true);
