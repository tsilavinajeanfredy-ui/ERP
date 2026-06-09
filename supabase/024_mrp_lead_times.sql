-- ==============================================================================
-- ERP GSI - MIGRATION 024 : MRP - LEAD TIMES & ALERTES
-- Ajout délais de fabrication + vue alertes MRP
-- ==============================================================================
-- Alignement ultra-robuste de la colonne de quantité pour da_local avec la définition standard (qty)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'da_local' 
      AND column_name = 'qty'
  ) THEN
    IF EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'da_local' 
        AND column_name = 'qty_kg'
    ) THEN
      ALTER TABLE public.da_local RENAME COLUMN qty_kg TO qty;
    ELSE
      ALTER TABLE public.da_local ADD COLUMN qty numeric(14,4) NOT NULL DEFAULT 0;
    END IF;
  END IF;
END $$;

-- 1. Ajout du délai de fabrication aux articles (en jours)
ALTER TABLE public.articles
ADD COLUMN IF NOT EXISTS manufacturing_lead_time_days int NOT NULL DEFAULT 0;

-- 2. Vue MRP Alertes : articles avec stock prévu insuffisant
-- Création dynamique de la vue pour contourner la compilation statique de PostgreSQL
DO $$
BEGIN
  -- S'assurer de l'existence de la colonne qty dans da_local de manière ultra-robuste
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'da_local' 
      AND column_name = 'qty'
  ) THEN
    IF EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'da_local' 
        AND column_name = 'qty_kg'
    ) THEN
      ALTER TABLE public.da_local RENAME COLUMN qty_kg TO qty;
    ELSE
      ALTER TABLE public.da_local ADD COLUMN qty numeric(14,4) NOT NULL DEFAULT 0;
    END IF;
  END IF;

  EXECUTE 'CREATE OR REPLACE VIEW mrp_alerts_view AS
  WITH stock_aggregate AS (
    SELECT
      l.article_id,
      COALESCE(SUM(l.qty_current), 0) AS total_stock,
      COUNT(DISTINCT l.id) AS lot_count
    FROM lots l
    WHERE l.cqlib_status = ''LIBERE''
    GROUP BY l.article_id
  ),
  incoming_orders AS (
    SELECT
      di.article_id,
      COALESCE(SUM(di.qty_kg), 0) AS incoming_qty
    FROM da_import di
    WHERE di.status NOT IN (''LIVRE'', ''CLOS'', ''ANNULE'')
    GROUP BY di.article_id
    UNION ALL
    SELECT
      dl.article_id,
      COALESCE(SUM(dl.qty), 0) AS incoming_qty
    FROM da_local dl
    WHERE dl.status NOT IN (''LIVRE'', ''CLOS'', ''ANNULE'')
    GROUP BY dl.article_id
  ),
  total_incoming AS (
    SELECT
      article_id,
      SUM(incoming_qty) AS incoming_qty
    FROM incoming_orders
    GROUP BY article_id
  )
  SELECT
    a.id AS article_id,
    a.code AS article_code,
    a.name AS article_name,
    a.article_type,
    a.unit,
    a.safety_stock,
    a.reorder_point,
    a.manufacturing_lead_time_days,
    sup.lead_time_days AS supplier_lead_time_days,
    sup.name AS supplier_name,
    COALESCE(sa.total_stock, 0) AS total_stock,
    COALESCE(ti.incoming_qty, 0) AS incoming_qty,
    COALESCE(sa.total_stock, 0) + COALESCE(ti.incoming_qty, 0) AS projected_stock,
    CASE
      WHEN COALESCE(sa.total_stock, 0) + COALESCE(ti.incoming_qty, 0) <= a.reorder_point THEN ''CRITICAL''
      WHEN COALESCE(sa.total_stock, 0) + COALESCE(ti.incoming_qty, 0) <= a.safety_stock THEN ''WARNING''
      ELSE ''OK''
    END AS mrp_status,
    CASE
      WHEN COALESCE(sa.total_stock, 0) + COALESCE(ti.incoming_qty, 0) < a.reorder_point
        THEN CURRENT_DATE + GREATEST(a.manufacturing_lead_time_days, COALESCE(sup.lead_time_days, 7))
      ELSE NULL
    END AS estimated_replenishment_date
  FROM articles a
  LEFT JOIN stock_aggregate sa ON sa.article_id = a.id
  LEFT JOIN total_incoming ti ON ti.article_id = a.id
  LEFT JOIN suppliers sup ON sup.id = a.default_supplier_id
  WHERE a.active = TRUE;';

  EXECUTE 'ALTER VIEW mrp_alerts_view SET (security_invoker = true);';
END $$;

-- 3. Fonction d'alerte MRP pour créer des notifications
CREATE OR REPLACE FUNCTION check_mrp_alerts()
RETURNS TABLE(
  article_id uuid,
  article_code text,
  article_name text,
  alert_type text,
  message text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mav.article_id,
    mav.article_code,
    mav.article_name,
    CASE
      WHEN mav.mrp_status = 'CRITICAL' THEN 'RUPTURE_IMMINENTE'
      WHEN mav.mrp_status = 'WARNING' THEN 'SEUIL_ATTENTE'
      ELSE 'OK'
    END,
    CASE
      WHEN mav.mrp_status = 'CRITICAL'
        THEN format('Alerte MRP : %s (%s) - Stock projeté %s, point de réappro %s',
             mav.article_name, mav.article_code, mav.projected_stock, mav.reorder_point)
      WHEN mav.mrp_status = 'WARNING'
        THEN format('Alerte MRP : %s (%s) - Stock projeté %s, seuil sécurité %s',
             mav.article_name, mav.article_code, mav.projected_stock, mav.safety_stock)
      ELSE NULL
    END
  FROM mrp_alerts_view mav
  WHERE mav.mrp_status IN ('CRITICAL', 'WARNING');
END;
$$ LANGUAGE plpgsql;
