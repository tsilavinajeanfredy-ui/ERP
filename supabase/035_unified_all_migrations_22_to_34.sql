-- ==============================================================================
-- ERP GSI - CONSOLIDATION DES MIGRATIONS DE 022 À 034
-- Script unifié complet pour l'éditeur SQL de Supabase
-- ==============================================================================

BEGIN;

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

-- ==============================================================================
-- 022 : STOCKS - ALERTES & SEUILS
-- ==============================================================================
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

  SELECT COALESCE(SUM(qty_current), 0) INTO v_total_stock
  FROM lots
  WHERE article_id = NEW.article_id AND cqlib_status = 'LIBERE';

  IF v_total_stock <= v_safety_stock THEN
    INSERT INTO notifications (role, title, message, type, metadata)
    VALUES (
      'MAGA',
      'ALERTE STOCK : Seuil de sécurité atteint',
      format('L''article %s (%s) est en dessous du stock de sécurité (%s). Stock actuel : %s.',
        v_article_name, v_article_code, v_safety_stock, v_total_stock),
      'warning',
      jsonb_build_object('article_id', NEW.article_id, 'total_stock', v_total_stock, 'safety_stock', v_safety_stock)
    );

    INSERT INTO notifications (role, title, message, type, metadata)
    VALUES (
      'RACH',
      'RÉAPPROVISIONNEMENT : Stock bas',
      format('Article %s (%s) : stock total %s, seuil de sécurité %s. Prévoyez réapprovisionnement.',
        v_article_name, v_article_code, v_total_stock, v_safety_stock),
      'warning',
      jsonb_build_object('article_id', NEW.article_id, 'total_stock', v_total_stock, 'safety_stock', v_safety_stock)
    );

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


-- ==============================================================================
-- 023 : INVENTAIRE - RÉCONCILIATION AUTOMATISÉE
-- ==============================================================================
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

CREATE OR REPLACE FUNCTION process_inventory_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'TERMINE' AND OLD.status IS DISTINCT FROM 'TERMINE' THEN
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

DROP TRIGGER IF EXISTS trig_inventory_completion ON inventory_campaigns;
CREATE TRIGGER trig_inventory_completion
  AFTER UPDATE ON inventory_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION process_inventory_completion();


-- ==============================================================================
-- 024 : MRP - LEAD TIMES & ALERTES
-- ==============================================================================
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS manufacturing_lead_time_days int NOT NULL DEFAULT 0;

-- Création dynamique de la vue pour contourner la compilation statique de PostgreSQL si le renommage de qty n'a pas encore été validé
DO $$
BEGIN
  -- 1. S'assurer de l'existence de la colonne qty dans da_local de manière ultra-robuste
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

  -- 2. Exécuter la création de la vue dynamiquement
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

  -- 3. Configurer les droits invoker sur la vue
  EXECUTE 'ALTER VIEW mrp_alerts_view SET (security_invoker = true);';
END $$;


-- ==============================================================================
-- 025 : TRAÇABILITÉ COMPLÈTE
-- ==============================================================================
ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS parent_lot_id uuid REFERENCES public.lots(id);
ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS production_order_id uuid REFERENCES public.production_orders(id);

CREATE INDEX IF NOT EXISTS idx_lots_parent_lot_id ON public.lots(parent_lot_id);
CREATE INDEX IF NOT EXISTS idx_lots_production_order_id ON public.lots(production_order_id);

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


-- ==============================================================================
-- 026 : NOTIFICATIONS PUSH
-- ==============================================================================
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS category text CHECK (category IN ('QUALITY', 'PRODUCTION', 'PURCHASING', 'STOCK', 'SYSTEM'));
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(read) WHERE read = false;


-- ==============================================================================
-- 027 : ÉVALUATION FOURNISSEURS - CLASSEMENT A/B/C
-- ==============================================================================
CREATE OR REPLACE FUNCTION compute_supplier_classification(
  p_supplier_id uuid,
  p_period eval_period DEFAULT 'YEARLY',
  p_year int DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)
)
RETURNS text AS $$
DECLARE
  v_quality NUMERIC;
  v_delivery NUMERIC;
  v_price NUMERIC;
  v_compliance NUMERIC;
  v_service NUMERIC;
  v_avg NUMERIC;
  v_classification text;
BEGIN
  SELECT score INTO v_quality FROM supplier_evaluations
    WHERE supplier_id = p_supplier_id AND period = p_period AND year = p_year AND criteria = 'QUALITY';
  SELECT score INTO v_delivery FROM supplier_evaluations
    WHERE supplier_id = p_supplier_id AND period = p_period AND year = p_year AND criteria = 'DELIVERY';
  SELECT score INTO v_price FROM supplier_evaluations
    WHERE supplier_id = p_supplier_id AND period = p_period AND year = p_year AND criteria = 'PRICE';
  SELECT score INTO v_compliance FROM supplier_evaluations
    WHERE supplier_id = p_supplier_id AND period = p_period AND year = p_year AND criteria = 'COMPLIANCE';
  SELECT score INTO v_service FROM supplier_evaluations
    WHERE supplier_id = p_supplier_id AND period = p_period AND year = p_year AND criteria = 'SERVICE';

  v_avg := (COALESCE(v_quality, 3) + COALESCE(v_delivery, 3) + COALESCE(v_price, 3) +
            COALESCE(v_compliance, 3) + COALESCE(v_service, 3)) / 5.0;

  IF v_avg >= 4.5 THEN v_classification := 'A';
  ELSIF v_avg >= 3.5 THEN v_classification := 'B';
  ELSIF v_avg >= 2.5 THEN v_classification := 'C';
  ELSE v_classification := 'D';
  END IF;

  INSERT INTO supplier_evaluation_summary (supplier_id, period, year, overall_score, evaluation_count, classification, evaluated_at)
  VALUES (p_supplier_id, p_period, p_year, v_avg, 5, v_classification, now())
  ON CONFLICT (supplier_id, period, year) DO UPDATE SET
    overall_score = v_avg,
    classification = v_classification,
    evaluated_at = now();

  RETURN v_classification;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE VIEW supplier_classification_view AS
SELECT DISTINCT ON (s.id)
  s.id AS supplier_id,
  s.code AS supplier_code,
  s.name AS supplier_name,
  s.country,
  s.rating AS current_rating,
  ses.overall_score,
  ses.classification,
  ses.period,
  ses.year AS eval_year,
  ses.evaluated_at AS last_evaluated_at,
  COUNT(DISTINCT fnc.id) FILTER (WHERE fnc.status = 'OUVERTE') AS open_fnc_count,
  COUNT(DISTINCT di.id) FILTER (WHERE di.status IN ('EN_COURS', 'RETARD')) AS active_orders
FROM suppliers s
LEFT JOIN supplier_evaluation_summary ses ON ses.supplier_id = s.id
LEFT JOIN fnc ON fnc.supplier_id = s.id
LEFT JOIN da_import di ON di.supplier_id = s.id
WHERE s.active = true
GROUP BY s.id, s.code, s.name, s.country, s.rating, ses.overall_score, ses.classification, ses.period, ses.year, ses.evaluated_at
ORDER BY s.id, ses.evaluated_at DESC NULLS LAST;

ALTER VIEW supplier_classification_view SET (security_invoker = true);


-- ==============================================================================
-- 028 : COÛTS DE PRODUCTION
-- ==============================================================================
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS standard_cost numeric(14,4) DEFAULT 0;
ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS actual_cost numeric(14,4),
  ADD COLUMN IF NOT EXISTS estimated_cost numeric(14,4),
  ADD COLUMN IF NOT EXISTS cost_breakdown jsonb;

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


-- ==============================================================================
-- 029 : PLANNING LOGISTIQUE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS carriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  contact_name text,
  contact_phone text,
  contact_email text,
  vehicle_type text,
  capacity_kg numeric(10,2),
  cost_per_km numeric(10,2),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  carrier_id uuid REFERENCES carriers(id),
  driver_name text,
  vehicle_plate text,
  planned_date date NOT NULL,
  departure_time time,
  estimated_km numeric(8,2),
  status text NOT NULL DEFAULT 'PLANIFIE' CHECK (status IN ('PLANIFIE', 'EN_COURS', 'TERMINE', 'ANNULE')),
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES delivery_routes(id) ON DELETE CASCADE,
  stop_order int NOT NULL,
  stop_type text NOT NULL CHECK (stop_type IN ('DEPOT', 'CLIENT', 'FOURNISSEUR')),
  reference_id uuid,
  reference_type text,
  address text,
  contact_name text,
  contact_phone text,
  planned_arrival timestamptz,
  actual_arrival timestamptz,
  status text NOT NULL DEFAULT 'EN_ATTENTE' CHECK (status IN ('EN_ATTENTE', 'CHARGE', 'LIVRE', 'ANNULE')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW logistics_calendar_view AS
SELECT
  dr.id AS route_id,
  dr.code AS route_code,
  dr.label AS route_label,
  dr.planned_date,
  dr.status AS route_status,
  c.name AS carrier_name,
  c.vehicle_type,
  dr.driver_name,
  dr.vehicle_plate,
  dr.estimated_km,
  COUNT(drs.id) AS stop_count,
  COUNT(drs.id) FILTER (WHERE drs.status = 'LIVRE') AS completed_stops
FROM delivery_routes dr
LEFT JOIN carriers c ON c.id = dr.carrier_id
LEFT JOIN delivery_route_stops drs ON drs.route_id = dr.id
GROUP BY dr.id, dr.code, dr.label, dr.planned_date, dr.status, c.name, c.vehicle_type, dr.driver_name, dr.vehicle_plate, dr.estimated_km
ORDER BY dr.planned_date DESC;

ALTER VIEW logistics_calendar_view SET (security_invoker = true);


-- ==============================================================================
-- 030 : WORKFLOW 8D DANS ACHATS IMPORTS
-- ==============================================================================
ALTER TABLE public.da_import ADD COLUMN IF NOT EXISTS fnc_id uuid REFERENCES public.fnc(id);
ALTER TABLE public.da_import ADD COLUMN IF NOT EXISTS quality_alert_at timestamptz;

-- Ajout des colonnes 8D manquantes sur la table fnc
ALTER TABLE public.fnc 
  ADD COLUMN IF NOT EXISTS d1_team text,
  ADD COLUMN IF NOT EXISTS d3_containment text,
  ADD COLUMN IF NOT EXISTS d4_root_cause text,
  ADD COLUMN IF NOT EXISTS d5_planned_actions text,
  ADD COLUMN IF NOT EXISTS d6_implemented_actions text,
  ADD COLUMN IF NOT EXISTS d7_preventive_actions text,
  ADD COLUMN IF NOT EXISTS d8_closure_notes text,
  ADD COLUMN IF NOT EXISTS d8_signature text,
  ADD COLUMN IF NOT EXISTS assigned_to text;

CREATE OR REPLACE VIEW import_8d_workflow_view AS
SELECT
  di.id AS import_id,
  di.code AS import_code,
  a.code AS article_code,
  a.name AS article_name,
  s.name AS supplier_name,
  s.code AS supplier_code,
  di.status AS import_status,
  di.current_step AS import_step,
  fnc.id AS fnc_id,
  fnc.code AS fnc_code,
  fnc.severity,
  fnc.status AS fnc_status,
  fnc.d1_team,
  fnc.d3_containment,
  fnc.d4_root_cause,
  fnc.d5_planned_actions,
  fnc.d6_implemented_actions,
  fnc.d7_preventive_actions,
  fnc.d8_closure_notes,
  fnc.opened_at AS fnc_opened_at,
  fnc.closed_at AS fnc_closed_at,
  CASE
    WHEN fnc.status IS NULL THEN 'NON_OUVERT'
    WHEN fnc.status = 'OUVERTE' THEN 'D1_D2'
    WHEN fnc.d3_containment IS NOT NULL AND fnc.d4_root_cause IS NULL THEN 'D3'
    WHEN fnc.d4_root_cause IS NOT NULL AND fnc.d5_planned_actions IS NULL THEN 'D4'
    WHEN fnc.d5_planned_actions IS NOT NULL AND fnc.d6_implemented_actions IS NULL THEN 'D5'
    WHEN fnc.d6_implemented_actions IS NOT NULL AND fnc.d7_preventive_actions IS NULL THEN 'D6'
    WHEN fnc.d7_preventive_actions IS NOT NULL AND fnc.d8_closure_notes IS NULL THEN 'D7'
    WHEN fnc.status = 'CLOTUREE' THEN 'D8_CLOS'
    ELSE 'EN_COURS'
  END AS d8_step,
  di.quality_alert_at
FROM da_import di
LEFT JOIN articles a ON a.id = di.article_id
LEFT JOIN suppliers s ON s.id = di.supplier_id
LEFT JOIN fnc ON fnc.id = di.fnc_id;

ALTER VIEW import_8d_workflow_view SET (security_invoker = true);


-- ==============================================================================
-- 031 : REPORTING / BI
-- ==============================================================================
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


-- ==============================================================================
-- 032 : GESTION DOCUMENTAIRE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  file_path text NOT NULL,
  bucket text NOT NULL DEFAULT 'documents',
  mime_type text,
  file_size bigint,
  reference_type text,
  reference_id uuid,
  category text,
  tags text[],
  uploaded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_reference ON documents(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_documents" ON documents;
CREATE POLICY "auth_read_documents" ON documents FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_documents" ON documents;
CREATE POLICY "auth_insert_documents" ON documents FOR INSERT TO authenticated WITH CHECK (true);


-- ==============================================================================
-- 033 : MAINTENANCE PRÉVENTIVE (GMAO)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS maintenance_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  equipment_name text NOT NULL,
  equipment_type text,
  frequency_days int NOT NULL,
  last_performed_at timestamptz,
  next_due_at timestamptz,
  assigned_to uuid REFERENCES users(id),
  description text,
  status text NOT NULL DEFAULT 'PLANIFIE' CHECK (status IN ('PLANIFIE', 'EN_COURS', 'TERMINE', 'ANNULE')),
  priority text DEFAULT 'NORMAL' CHECK (priority IN ('BASSE', 'NORMAL', 'HAUTE', 'CRITIQUE')),
  estimated_duration_min int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maint_next_due ON maintenance_tasks(next_due_at);
CREATE INDEX IF NOT EXISTS idx_maint_status ON maintenance_tasks(status);

CREATE OR REPLACE VIEW maintenance_calendar_view AS
SELECT
  mt.id, mt.code, mt.equipment_name, mt.equipment_type, mt.frequency_days,
  mt.last_performed_at, mt.next_due_at,
  mt.assigned_to, u.full_name AS assigned_name,
  mt.status, mt.priority, mt.estimated_duration_min,
  CASE
    WHEN mt.next_due_at IS NULL THEN 'PLANIFIE'
    WHEN mt.next_due_at < now() THEN 'EN_RETARD'
    WHEN mt.next_due_at < now() + interval '7 days' THEN 'A_FAIRE'
    ELSE 'DANS_TEMPS'
  END AS urgency
FROM maintenance_tasks mt
LEFT JOIN users u ON u.id = mt.assigned_to;


-- ==============================================================================
-- 034 : FONCTIONNALITÉS INDUSTRIELLES AVANCÉES
-- ==============================================================================
ALTER TABLE public.inventory_campaigns 
ADD COLUMN IF NOT EXISTS signature_maga text,
ADD COLUMN IF NOT EXISTS signature_maga_at timestamptz,
ADD COLUMN IF NOT EXISTS signature_rach text,
ADD COLUMN IF NOT EXISTS signature_rach_at timestamptz,
ADD COLUMN IF NOT EXISTS signature_dpi text,
ADD COLUMN IF NOT EXISTS signature_dpi_at timestamptz;

CREATE OR REPLACE FUNCTION public.reconcile_inventory(campaign_id uuid, admin_user_id uuid)
RETURNS void AS $$
DECLARE
  cnt RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_campaigns 
    WHERE id = campaign_id 
      AND signature_maga IS NOT NULL 
      AND signature_rach IS NOT NULL 
      AND signature_dpi IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Réconciliation impossible : Circuit d''approbations multi-signatures incomplet (MAGA, RACH et DPI requis).';
  END IF;

  FOR cnt IN 
    SELECT c.article_id, c.depot_id, c.stock_theorique, c.stock_physique, c.ecart
    FROM public.inventory_counts c
    WHERE c.campaign_id = campaign_id AND c.ecart <> 0
  LOOP
    INSERT INTO public.stock_movements (
      lot_id, article_id, depot_from_id, depot_to_id, movement_type, qty, reference_doc, performed_by, notes
    )
    SELECT 
      l.id, cnt.article_id,
      CASE WHEN cnt.ecart < 0 THEN cnt.depot_id ELSE NULL END,
      CASE WHEN cnt.ecart > 0 THEN cnt.depot_id ELSE NULL END,
      'AJUSTEMENT', ABS(cnt.ecart), 'REGUL-INV-' || campaign_id, admin_user_id,
      'Régularisation d''inventaire suite à écart constaté de ' || cnt.ecart
    FROM public.lots l
    WHERE l.article_id = cnt.article_id AND l.depot_id = cnt.depot_id
    LIMIT 1;

    UPDATE public.lots
    SET qty_current = GREATEST(0, qty_current + cnt.ecart), updated_at = now()
    WHERE id IN (
      SELECT id FROM public.lots WHERE article_id = cnt.article_id AND depot_id = cnt.depot_id LIMIT 1
    );
  END LOOP;

  UPDATE public.inventory_campaigns
  SET status = 'VALIDE', completed_at = now(), validated_by = admin_user_id, updated_at = now()
  WHERE id = campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.check_laboratory_instrument_conformity()
RETURNS trigger AS $$
DECLARE
  inst_status public.instrument_status;
  inst_name text;
BEGIN
  IF NEW.instrument_id IS NOT NULL THEN
    SELECT status, name INTO inst_status, inst_name
    FROM public.instruments
    WHERE id = NEW.instrument_id;

    IF inst_status = 'ECHU' OR inst_status = 'A_ETALONNER' THEN
      RAISE EXCEPTION 'BLOCAGE QUALITÉ ISO 9001 : L''instrument de laboratoire "%" est déclaré non conforme (statut: %). Il est strictement interdit d''utiliser un instrument non étalonné pour valider des fiches de contrôle.', inst_name, inst_status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_check_laboratory_instrument_conformity ON public.fcq_dossiers;
CREATE TRIGGER tr_check_laboratory_instrument_conformity
BEFORE INSERT OR UPDATE ON public.fcq_dossiers
FOR EACH ROW
EXECUTE FUNCTION public.check_laboratory_instrument_conformity();

CREATE OR REPLACE FUNCTION public.cascade_recall_lot(suspect_lot_id uuid, reason text, rq_user_id uuid)
RETURNS void AS $$
DECLARE
  child_lot RECORD;
  fnc_code text;
BEGIN
  UPDATE public.lots
  SET cqlib_status = 'BLOQUE', cqlib_decided_by = rq_user_id, cqlib_decided_at = now(), updated_at = now()
  WHERE id = suspect_lot_id;

  fnc_code := 'FNC-RECALL-' || UPPER(SUBSTRING(gen_random_uuid()::text FROM 1 FOR 6));
  
  INSERT INTO public.fnc (
    code, lot_id, severity, status, description, root_cause, opened_by, opened_at
  ) VALUES (
    fnc_code, suspect_lot_id, 'CRITIQUE', 'OUVERTE', 'RAPPEL ET BLOCAGE D''URGENCE : ' || reason,
    'Suspicion de contamination/défaut détectée. Rappel automatique en cascade déclenché.', rq_user_id, now()
  );

  FOR child_lot IN
    SELECT distinct l_desc.id AS desc_id
    FROM public.stock_movements sm_consume
    JOIN public.production_orders po ON po.code = sm_consume.reference_doc
    JOIN public.lots l_desc ON l_desc.article_id = po.product_id
    WHERE sm_consume.lot_id = suspect_lot_id
      AND sm_consume.movement_type = 'SORTIE'
      AND l_desc.cqlib_status <> 'BLOQUE'
  LOOP
    PERFORM public.cascade_recall_lot(child_lot.desc_id, 'Rappel propagé en cascade depuis le lot parent suspect #' || suspect_lot_id, rq_user_id);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
