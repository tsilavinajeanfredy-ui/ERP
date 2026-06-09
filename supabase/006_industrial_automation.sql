-- ==============================================================================
-- ERP GSI - MIGRATION 006 : AUTOMATISATION INDUSTRIELLE & NOTIFICATIONS
-- CCTP Phase 2 : Validation Cascade & Alertes Critiques
-- ==============================================================================

-- 1. Amélioration du schéma d'inventaire pour la traçabilité par lot
ALTER TABLE public.inventory_counts 
ADD COLUMN IF NOT EXISTS lot_id UUID REFERENCES public.lots(id);

-- 2. TRIGGER : Notifications sur Blocage de Lot (Qualité)
CREATE OR REPLACE FUNCTION notify_lot_blocked()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cqlib_status = 'BLOQUE' AND OLD.cqlib_status IS DISTINCT FROM 'BLOQUE' THEN
    -- Notification pour le Responsable Qualité (RQ)
    INSERT INTO notifications (role, title, message, type, metadata)
    VALUES (
      'RQ',
      'ALERTE QUALITÉ : Lot Bloqué',
      format('Le lot %s de l''article %s a été bloqué suite à une non-conformité.', NEW.code, (SELECT name FROM articles WHERE id = NEW.article_id)),
      'error',
      jsonb_build_object('lot_id', NEW.id, 'article_id', NEW.article_id)
    );
    
    -- Notification pour l'ADMIN
    INSERT INTO notifications (role, title, message, type)
    VALUES ('ADMIN', 'Blocage Lot : ' || NEW.code, 'Un blocage critique a été détecté par le système.');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_notify_blocked ON lots;
CREATE TRIGGER trig_notify_blocked 
  AFTER UPDATE ON lots 
  FOR EACH ROW 
  EXECUTE FUNCTION notify_lot_blocked();

-- 3. TRIGGER : Alertes de Stock Bas (Rupture imminent)
CREATE OR REPLACE FUNCTION notify_low_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_safety_stock NUMERIC;
  v_article_name TEXT;
BEGIN
  SELECT safety_stock, name INTO v_safety_stock, v_article_name 
  FROM articles WHERE id = NEW.article_id;

  IF NEW.qty_current < v_safety_stock AND OLD.qty_current >= v_safety_stock THEN
    INSERT INTO notifications (role, title, message, type)
    VALUES (
      'MAGA',
      'ALERTE STOCK : Seuil de sécurité atteint',
      format('L''article %s est en dessous du stock de sécurité (%s). Prévoir réapprovisionnement.', v_article_name, v_safety_stock),
      'warning'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_notify_low_stock ON lots;
CREATE TRIGGER trig_notify_low_stock 
  AFTER UPDATE ON lots 
  FOR EACH ROW 
  EXECUTE FUNCTION notify_low_stock();

-- 4. TRIGGER : Validation Cascade (Inventaire -> Mouvements de Stock)
CREATE OR REPLACE FUNCTION process_inventory_completion()
RETURNS TRIGGER AS $$
BEGIN
  -- Si la campagne passe à TERMINE
  IF NEW.status = 'TERMINE' AND OLD.status IS DISTINCT FROM 'TERMINE' THEN
    -- Pour chaque ligne d'inventaire avec un écart
    INSERT INTO stock_movements (lot_id, article_id, depot_id, type, quantity, reason, created_by)
    SELECT 
      ic.lot_id, 
      ic.article_id, 
      ic.depot_id,
      CASE WHEN ic.ecart > 0 THEN 'AJUSTEMENT_POS' ELSE 'AJUSTEMENT_NEG' END,
      ABS(ic.ecart),
      'Régularisation Inventaire Campagne : ' || NEW.code,
      NEW.validated_by
    FROM inventory_counts ic
    WHERE ic.campaign_id = NEW.id AND ic.ecart <> 0;

    -- Mise à jour des quantités réelles dans la table lots
    -- On utilise la valeur comptée (physique) comme nouvelle référence
    UPDATE lots l
    SET qty_current = ic.stock_physique
    FROM inventory_counts ic
    WHERE ic.lot_id = l.id AND ic.campaign_id = NEW.id AND ic.stock_physique IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_inventory_completion ON inventory_campaigns;
CREATE TRIGGER trig_inventory_completion 
  AFTER UPDATE ON inventory_campaigns 
  FOR EACH ROW 
  EXECUTE FUNCTION process_inventory_completion();
