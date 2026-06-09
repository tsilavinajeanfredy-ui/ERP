-- ==============================================================================
-- ERP GSI - MIGRATION 022 : STOCKS - ALERTES & SEUILS
-- Vue agrégée des alertes stocks + amélioration trigger notification
-- ==============================================================================

-- 1. Vue agrégée : statut seuil par article tous dépôts confondus
CREATE OR REPLACE VIEW stock_alerts_view AS
SELECT
  a.id AS article_id,
  a.code AS article_code,
  a.name AS article_name,
  a.article_type,
  a.unit,
  a.safety_stock,
  a.reorder_point,
  COALESCE(SUM(l.qty_current), 0) AS total_stock,
  COUNT(DISTINCT l.depot_id) AS depot_count,
  COUNT(DISTINCT l.id) AS lot_count,
  CASE
    WHEN COALESCE(SUM(l.qty_current), 0) <= a.reorder_point THEN 'CRITICAL'
    WHEN COALESCE(SUM(l.qty_current), 0) <= a.safety_stock THEN 'WARNING'
    ELSE 'OK'
  END AS stock_status,
  CASE
    WHEN a.safety_stock > 0 THEN GREATEST(0, ROUND((COALESCE(SUM(l.qty_current), 0) / a.safety_stock) * 100))
    ELSE NULL
  END AS coverage_pct
FROM articles a
LEFT JOIN lots l ON l.article_id = a.id AND l.cqlib_status = 'LIBERE'
WHERE a.active = true
GROUP BY a.id, a.code, a.name, a.article_type, a.unit, a.safety_stock, a.reorder_point;
ALTER VIEW stock_alerts_view SET (security_invoker = true);

-- 3. Amélioration du déclencheur de stock bas pour notifier RACH et RPROD aussi
CREATE OR REPLACE FUNCTION notify_low_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_safety_stock NUMERIC;
  v_article_name TEXT;
  v_article_code TEXT;
  v_total_stock NUMERIC;
BEGIN
  SELECT safety_stock, name, code INTO v_safety_stock, v_article_name, v_article_code
  FROM articles WHERE id = NEW.article_id;

  -- Somme totale tous dépôts pour cet article
  SELECT COALESCE(SUM(qty_current), 0) INTO v_total_stock
  FROM lots
  WHERE article_id = NEW.article_id AND cqlib_status = 'LIBERE';

  IF v_total_stock <= v_safety_stock THEN
    -- MAGA : magasinier
    INSERT INTO notifications (role, title, message, type, metadata)
    VALUES (
      'MAGA',
      'ALERTE STOCK : Seuil de sécurité atteint',
      format('L''article %s (%s) est en dessous du stock de sécurité (%s). Stock actuel : %s.',
        v_article_name, v_article_code, v_safety_stock, v_total_stock),
      'warning',
      jsonb_build_object('article_id', NEW.article_id, 'total_stock', v_total_stock, 'safety_stock', v_safety_stock)
    );

    -- RACH : acheteur
    INSERT INTO notifications (role, title, message, type, metadata)
    VALUES (
      'RACH',
      'RÉAPPROVISIONNEMENT : Stock bas',
      format('Article %s (%s) : stock total %s, seuil de sécurité %s. Prévoyez réapprovisionnement.',
        v_article_name, v_article_code, v_total_stock, v_safety_stock),
      'warning',
      jsonb_build_object('article_id', NEW.article_id, 'total_stock', v_total_stock, 'safety_stock', v_safety_stock)
    );

    -- RPROD : responsable production (si PF ou SF)
    IF EXISTS (SELECT 1 FROM articles WHERE id = NEW.article_id AND article_type IN ('PF', 'SF')) THEN
      INSERT INTO notifications (role, title, message, type, metadata)
      VALUES (
        'RPROD',
        'PRODUCTION : Composant critique en rupture',
        format('Le stock de %s (%s) est critique (%s). Vérifiez disponibilité production.',
          v_article_name, v_article_code, v_total_stock),
        'warning',
        jsonb_build_object('article_id', NEW.article_id, 'total_stock', v_total_stock, 'safety_stock', v_safety_stock)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
