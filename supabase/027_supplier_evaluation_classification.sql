-- ==============================================================================
-- ERP GSI - MIGRATION 027 : ÉVALUATION FOURNISSEURS - CLASSEMENT A/B/C
-- Fonction de calcul du score global + vue synthétique
-- ==============================================================================

-- 1. Fonction de calcul du score global et classification
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

  -- Upsert summary
  INSERT INTO supplier_evaluation_summary (supplier_id, period, year, overall_score, evaluation_count, classification, evaluated_at)
  VALUES (p_supplier_id, p_period, p_year, v_avg, 5, v_classification, now())
  ON CONFLICT (supplier_id, period, year) DO UPDATE SET
    overall_score = v_avg,
    classification = v_classification,
    evaluated_at = now();

  RETURN v_classification;
END;
$$ LANGUAGE plpgsql;

-- 2. Vue synthétique des fournisseurs avec leur dernière classification
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
