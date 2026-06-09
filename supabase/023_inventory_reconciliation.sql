-- ==============================================================================
-- ERP GSI - MIGRATION 023 : INVENTAIRE - RÉCONCILIATION AUTOMATISÉE
-- Remplace le trigger buggé de la migration 006 (colonnes inexistantes)
-- ==============================================================================

-- 1. Vue des écarts d'inventaire pour suivi
CREATE OR REPLACE VIEW inventory_ecarts_view AS
SELECT
  ic.id AS count_id,
  ic.campaign_id,
  cam.code AS campaign_code,
  cam.label AS campaign_label,
  ic.article_id,
  a.code AS article_code,
  a.name AS article_name,
  a.article_type,
  ic.depot_id,
  d.code AS depot_code,
  d.name AS depot_name,
  ic.lot_id,
  l.code AS lot_code,
  ic.stock_theorique,
  ic.stock_physique,
  ic.ecart,
  ic.ecart_pct,
  ic.is_major,
  ic.counted_by,
  u.full_name AS counted_by_name,
  ic.counted_at,
  ic.notes,
  cam.status AS campaign_status,
  CASE
    WHEN ic.ecart IS NULL THEN 'NON_COMPTE'
    WHEN ic.ecart = 0 THEN 'CONFORME'
    WHEN ABS(ic.ecart_pct) <= 2 THEN 'ECART_MINEUR'
    ELSE 'ECART_MAJEUR'
  END AS reconciliation_status
FROM inventory_counts ic
JOIN inventory_campaigns cam ON cam.id = ic.campaign_id
JOIN articles a ON a.id = ic.article_id
JOIN depots d ON d.id = ic.depot_id
LEFT JOIN lots l ON l.id = ic.lot_id
LEFT JOIN users u ON u.id = ic.counted_by;

ALTER VIEW inventory_ecarts_view SET (security_invoker = true);

-- 2. Trigger corrigé pour la validation des campagnes
--    (remplace la version buggée de 006_industrial_automation.sql)
CREATE OR REPLACE FUNCTION process_inventory_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_movement_type movement_type;
BEGIN
  IF NEW.status = 'TERMINE' AND OLD.status IS DISTINCT FROM 'TERMINE' THEN
    -- Pour chaque ligne d'inventaire avec un écart non nul
    INSERT INTO stock_movements (lot_id, article_id, depot_from_id, movement_type, qty, notes, performed_by)
    SELECT
      ic.lot_id,
      ic.article_id,
      ic.depot_id,
      'AJUSTEMENT'::movement_type,
      ic.ecart,
      'Réconciliation Inventaire - Campagne: ' || NEW.code || ' - ' || COALESCE(ic.notes, ''),
      NEW.validated_by
    FROM inventory_counts ic
    WHERE ic.campaign_id = NEW.id
      AND ic.ecart IS NOT NULL
      AND ic.ecart <> 0;

    -- Mise à jour des lots avec la valeur comptée (stock_physique)
    UPDATE lots l
    SET qty_current = ic.stock_physique
    FROM inventory_counts ic
    WHERE ic.lot_id = l.id
      AND ic.campaign_id = NEW.id
      AND ic.stock_physique IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recrée le trigger (même nom que dans 006, écrase l'ancienne version buggée)
DROP TRIGGER IF EXISTS trig_inventory_completion ON inventory_campaigns;
CREATE TRIGGER trig_inventory_completion
  AFTER UPDATE ON inventory_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION process_inventory_completion();

-- 3. Fonction utilitaire pour réconciliation manuelle
CREATE OR REPLACE FUNCTION reconcile_inventory(campaign_id uuid, performed_by uuid DEFAULT NULL)
RETURNS TABLE(
  movement_id uuid,
  article_code text,
  ecart numeric,
  status text
) AS $$
BEGIN
  RETURN QUERY
  WITH inserted AS (
    INSERT INTO stock_movements (lot_id, article_id, depot_from_id, movement_type, qty, notes, performed_by)
    SELECT
      ic.lot_id,
      ic.article_id,
      ic.depot_id,
      'AJUSTEMENT'::movement_type,
      ic.ecart,
      'Réconciliation manuelle - Campagne: ' || (SELECT code FROM inventory_campaigns WHERE id = campaign_id),
      performed_by
    FROM inventory_counts ic
    WHERE ic.campaign_id = reconcile_inventory.campaign_id
      AND ic.ecart IS NOT NULL
      AND ic.ecart <> 0
    RETURNING id
  ),
  updated AS (
    UPDATE lots l
    SET qty_current = ic.stock_physique
    FROM inventory_counts ic
    WHERE ic.lot_id = l.id
      AND ic.campaign_id = reconcile_inventory.campaign_id
      AND ic.stock_physique IS NOT NULL
  )
  SELECT
    m.id,
    a.code,
    ic.ecart,
    'RECONCILIE'::text
  FROM inventory_counts ic
  JOIN inserted m ON TRUE
  JOIN articles a ON a.id = ic.article_id
  WHERE ic.campaign_id = reconcile_inventory.campaign_id
    AND ic.ecart IS NOT NULL
    AND ic.ecart <> 0;
END;
$$ LANGUAGE plpgsql;
