-- ==============================================================================
-- ERP GSI - MIGRATION 025 : TRAÇABILITÉ COMPLÈTE
-- Lien lots → OF, généalogie ascendante/descendante
-- ==============================================================================

-- 1. Colonnes de traçabilité sur lots
ALTER TABLE public.lots
ADD COLUMN IF NOT EXISTS parent_lot_id uuid REFERENCES public.lots(id);

ALTER TABLE public.lots
ADD COLUMN IF NOT EXISTS production_order_id uuid REFERENCES public.production_orders(id);

-- 2. Index pour requêtes de traçabilité
CREATE INDEX IF NOT EXISTS idx_lots_parent_lot_id ON public.lots(parent_lot_id);
CREATE INDEX IF NOT EXISTS idx_lots_production_order_id ON public.lots(production_order_id);

-- 3. Vue généalogique des lots (ascendante + descendante)
CREATE OR REPLACE VIEW lot_genealogy_view AS
SELECT
  l.id AS lot_id,
  l.code AS lot_code,
  l.article_id,
  a.code AS article_code,
  a.name AS article_name,
  a.article_type,
  l.qty_current,
  l.unit,
  l.cqlib_status,
  l.reception_date,
  l.expiry_date,
  l.origin,
  l.batch_supplier,
  l.parent_lot_id,
  pl.code AS parent_lot_code,
  pl.article_id AS parent_article_id,
  pa.code AS parent_article_code,
  pa.name AS parent_article_name,
  l.production_order_id,
  po.code AS production_order_code,
  po.status AS production_order_status,
  po.qty_planned,
  po.qty_produced,
  l.supplier_id,
  s.name AS supplier_name,
  l.depot_id,
  d.code AS depot_code,
  d.name AS depot_name,
  l.bon_entree_id,
  be.code AS bon_entree_code
FROM lots l
LEFT JOIN lots pl ON pl.id = l.parent_lot_id
LEFT JOIN articles a ON a.id = l.article_id
LEFT JOIN articles pa ON pa.id = pl.article_id
LEFT JOIN production_orders po ON po.id = l.production_order_id
LEFT JOIN suppliers s ON s.id = l.supplier_id
LEFT JOIN depots d ON d.id = l.depot_id
LEFT JOIN bons_entree be ON be.id = l.bon_entree_id;

ALTER VIEW lot_genealogy_view SET (security_invoker = true);

-- 4. Vue descendante : tous les lots issus d'un lot parent donné
CREATE OR REPLACE VIEW lot_downstream_view AS
SELECT
  l.id AS child_lot_id,
  l.code AS child_lot_code,
  l.article_id AS child_article_id,
  a.code AS child_article_code,
  a.name AS child_article_name,
  l.qty_current AS child_qty,
  l.cqlib_status AS child_status,
  l.reception_date AS child_reception_date,
  l.parent_lot_id,
  pl.code AS parent_lot_code,
  pl.article_id AS parent_article_id,
  pa.code AS parent_article_code,
  pa.name AS parent_article_name
FROM lots l
JOIN lots pl ON pl.id = l.parent_lot_id
JOIN articles a ON a.id = l.article_id
JOIN articles pa ON pa.id = pl.article_id;

ALTER VIEW lot_downstream_view SET (security_invoker = true);
