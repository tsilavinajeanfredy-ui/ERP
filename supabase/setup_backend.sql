-- ==============================================================================
-- ERP GSI - SCRIPT DE DÉPLOIEMENT BACKEND SUPABASE
-- CCTP Phase 4, 5 et 6 : Automatisation, Traçabilité et Sécurité
-- À exécuter dans le SQL Editor de Supabase
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TRIGGERS : GÉNÉRATION AUTOMATIQUE DES CODES MÉTIER (FNC, AJ, INV)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_business_code()
RETURNS TRIGGER AS $$
DECLARE
  prefix TEXT;
  seq_val INT;
  year_str TEXT;
  regex_pattern TEXT;
BEGIN
  year_str := to_char(CURRENT_DATE, 'YYYY');
  
  IF TG_TABLE_NAME = 'fnc' THEN
    prefix := 'FNC-';
  ELSIF TG_TABLE_NAME = 'inventory_campaigns' THEN
    prefix := 'INV-';
  ELSIF TG_TABLE_NAME = 'stock_movements' THEN
    IF NEW.type IN ('AJUSTEMENT_POS', 'AJUSTEMENT_NEG') THEN
      prefix := 'AJ-';
    ELSE
      RETURN NEW; -- Ne génère pas de code pour les autres mouvements
    END IF;
  ELSIF TG_TABLE_NAME = 'articles' THEN
    -- Utilise le type de l'article selon le CCTP (MP, PF, EMB, SF) pour éviter les doublons
    prefix := COALESCE(NEW.article_type, 'ART') || '-';
  ELSE
    prefix := 'CODE-';
  END IF;

  -- Pattern pour extraire le numéro de la fin du code
  regex_pattern := '^' || prefix || year_str || '-';

  -- Cherche le plus grand numéro existant pour l'année en cours
  EXECUTE format('
    SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(code, ''%s'', '''') AS INTEGER)), 0) + 1 
    FROM %I 
    WHERE code LIKE ''%s%s-%%''', 
    regex_pattern, TG_TABLE_NAME, prefix, year_str
  ) INTO seq_val;

  -- Assigne le nouveau code au format PREFIX-YYYY-000X
  NEW.code := prefix || year_str || '-' || lpad(seq_val::text, 4, '0');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Application des triggers
DROP TRIGGER IF EXISTS trig_fnc_code ON fnc;
CREATE TRIGGER trig_fnc_code 
  BEFORE INSERT ON fnc 
  FOR EACH ROW 
  WHEN (NEW.code IS NULL OR NEW.code = '') 
  EXECUTE FUNCTION generate_business_code();

DROP TRIGGER IF EXISTS trig_inv_code ON inventory_campaigns;
CREATE TRIGGER trig_inv_code 
  BEFORE INSERT ON inventory_campaigns 
  FOR EACH ROW 
  WHEN (NEW.code IS NULL OR NEW.code = '') 
  EXECUTE FUNCTION generate_business_code();

DROP TRIGGER IF EXISTS trig_article_code ON articles;
CREATE TRIGGER trig_article_code 
  BEFORE INSERT ON articles 
  FOR EACH ROW 
  WHEN (NEW.code IS NULL OR NEW.code = '') 
  EXECUTE FUNCTION generate_business_code();


-- ------------------------------------------------------------------------------
-- 2. TRIGGER : TRAÇABILITÉ GLOBALE (AUDIT LOGS)
-- Exigence CCTP §4.3 (Traçabilité inviolable)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_audit_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (table_name, record_id, action, new_data, user_id)
    VALUES (TG_TABLE_NAME, NEW.id, TG_OP, row_to_json(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- On n'enregistre que s'il y a eu un vrai changement de données
    IF row_to_json(OLD) IS DISTINCT FROM row_to_json(NEW) THEN
      INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, user_id)
      VALUES (TG_TABLE_NAME, NEW.id, TG_OP, row_to_json(OLD), row_to_json(NEW), auth.uid());
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (table_name, record_id, action, old_data, user_id)
    VALUES (TG_TABLE_NAME, OLD.id, TG_OP, row_to_json(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Application du trigger sur les tables critiques
DROP TRIGGER IF EXISTS trig_audit_fnc ON fnc;
CREATE TRIGGER trig_audit_fnc AFTER INSERT OR UPDATE OR DELETE ON fnc FOR EACH ROW EXECUTE FUNCTION log_audit_changes();

DROP TRIGGER IF EXISTS trig_audit_lots ON lots;
CREATE TRIGGER trig_audit_lots AFTER INSERT OR UPDATE OR DELETE ON lots FOR EACH ROW EXECUTE FUNCTION log_audit_changes();


-- ------------------------------------------------------------------------------
-- 3. TRIGGER : CRÉATION AUTOMATIQUE FNC SUR BLOCAGE DE LOT
-- Exigence CCTP §10.3.4 (Règle Qualité)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_create_fnc_on_block()
RETURNS TRIGGER AS $$
BEGIN
  -- Si le statut passe à BLOQUE
  IF NEW.cqlib_status = 'BLOQUE' AND OLD.cqlib_status IS DISTINCT FROM 'BLOQUE' THEN
    INSERT INTO fnc (lot_id, lot_code, description, status, severity, created_by)
    VALUES (
      NEW.id, 
      NEW.code, 
      'Non-conformité détectée lors de l''analyse Laboratoire (FCQ). Passage automatique en statut BLOQUÉ. Requiert investigation.', 
      'OUVERTE', 
      'MAJEURE', 
      'Système (Déclencheur)'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_auto_fnc ON lots;
CREATE TRIGGER trig_auto_fnc 
  AFTER UPDATE ON lots 
  FOR EACH ROW 
  EXECUTE FUNCTION auto_create_fnc_on_block();


-- ------------------------------------------------------------------------------
-- 4. FONCTION (RPC) : AJUSTEMENT DE STOCK TRANSACTIONNEL
-- Garanti l'intégrité entre la table lots (qty_current) et stock_movements
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION process_stock_adjustment(
  p_lot_id UUID,
  p_qty NUMERIC,
  p_reason TEXT,
  p_type TEXT
) RETURNS VOID AS $$
BEGIN
  -- 1. Insérer le mouvement de stock
  INSERT INTO stock_movements (lot_id, type, quantity, reason, created_by)
  VALUES (p_lot_id, p_type, p_qty, p_reason, auth.uid());

  -- 2. Mettre à jour la quantité du lot
  IF p_type = 'AJUSTEMENT_POS' THEN
    UPDATE lots SET qty_current = qty_current + p_qty WHERE id = p_lot_id;
  ELSIF p_type = 'AJUSTEMENT_NEG' THEN
    UPDATE lots SET qty_current = qty_current - p_qty WHERE id = p_lot_id;
  ELSE
    RAISE EXCEPTION 'Type de mouvement invalide pour un ajustement : %', p_type;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ------------------------------------------------------------------------------
-- 5. FONCTION (RPC) : CALCULATE_MRP (Simulation dynamique Besoins Nets)
-- Évite de faire des centaines de requêtes côté Frontend
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_mrp(
  p_product_id UUID,
  p_simulated_demand NUMERIC
) RETURNS TABLE (
  component_id UUID,
  component_code TEXT,
  component_name TEXT,
  component_type TEXT,
  real_stock NUMERIC,
  gross_needs NUMERIC,
  net_needs NUMERIC,
  action_recommended TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH components AS (
    -- On récupère la nomenclature validée
    SELECT 
      bl.component_id,
      bl.quantity AS qty_per_unit,
      a.code,
      a.name,
      a.article_type,
      a.safety_stock
    FROM bom_headers bh
    JOIN bom_lines bl ON bl.bom_header_id = bh.id
    JOIN articles a ON a.id = bl.component_id
    WHERE bh.product_id = p_product_id AND bh.status = 'VALIDE'
  ),
  stock_calc AS (
    -- On aggrège le vrai stock disponible via les lots libérés
    SELECT 
      l.article_id, 
      COALESCE(SUM(l.qty_current), 0) AS total_stock
    FROM lots l
    WHERE l.cqlib_status = 'LIBERE'
    GROUP BY l.article_id
  )
  SELECT 
    c.component_id,
    c.code,
    c.name,
    c.article_type,
    COALESCE(sc.total_stock, 0) AS real_stock,
    (c.qty_per_unit * p_simulated_demand) AS gross_needs,
    GREATEST(0, (c.qty_per_unit * p_simulated_demand) - COALESCE(sc.total_stock, 0)) AS net_needs,
    CASE 
      WHEN GREATEST(0, (c.qty_per_unit * p_simulated_demand) - COALESCE(sc.total_stock, 0)) > COALESCE(c.safety_stock, 500) THEN 'COMMANDE_URGENTE'
      WHEN GREATEST(0, (c.qty_per_unit * p_simulated_demand) - COALESCE(sc.total_stock, 0)) > 0 THEN 'RECOMMANDER'
      ELSE 'RAS'
    END AS action_recommended
  FROM components c
  LEFT JOIN stock_calc sc ON sc.article_id = c.component_id;
END;
$$ LANGUAGE plpgsql;
