-- ============================================================================
-- ERP GSI — Workflow auto FNC→Fournisseur (Phase 6)
-- - Ajoute supplier_id (+ colonnes manquantes lot_code, article_name, created_by) à fnc
-- - Trigger auto-set supplier_id depuis lots.supplier_id sur INSERT/UPDATE de lot_id
-- - Trigger auto-évaluation fournisseur (QUALITY) à la clôture d'une FNC
-- ============================================================================

-- ─── Colonnes manquantes sur fnc ─────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fnc' AND column_name = 'supplier_id') THEN
    ALTER TABLE fnc ADD COLUMN supplier_id uuid REFERENCES suppliers(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fnc' AND column_name = 'lot_code') THEN
    ALTER TABLE fnc ADD COLUMN lot_code text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fnc' AND column_name = 'article_name') THEN
    ALTER TABLE fnc ADD COLUMN article_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fnc' AND column_name = 'created_by') THEN
    ALTER TABLE fnc ADD COLUMN created_by text;
  END IF;
END $$;

-- ─── Index ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fnc_supplier ON fnc(supplier_id);
CREATE INDEX IF NOT EXISTS idx_fnc_status ON fnc(status);

-- ─── Trigger 1 : auto-set supplier_id + lot_code + article_name depuis lots ──
CREATE OR REPLACE FUNCTION fnc_set_supplier()
RETURNS TRIGGER AS $$
DECLARE
  v_supplier_id uuid;
  v_lot_code text;
  v_article_name text;
BEGIN
  IF NEW.lot_id IS NOT NULL THEN
    SELECT l.supplier_id, l.code, a.name
    INTO v_supplier_id, v_lot_code, v_article_name
    FROM lots l
    LEFT JOIN articles a ON a.id = l.article_id
    WHERE l.id = NEW.lot_id;

    NEW.supplier_id := v_supplier_id;
    NEW.lot_code := v_lot_code;
    NEW.article_name := v_article_name;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_fnc_set_supplier ON fnc;
CREATE TRIGGER trig_fnc_set_supplier
  BEFORE INSERT OR UPDATE OF lot_id ON fnc
  FOR EACH ROW
  EXECUTE FUNCTION fnc_set_supplier();

-- ─── Trigger 2 : auto-évaluation fournisseur sur clôture FNC ─────────────────
-- Quand une FNC liée à un fournisseur est clôturée, met à jour la note QUALITÉ
-- du fournisseur pour le trimestre en cours (moyenne des sévérités des FNC)
CREATE OR REPLACE FUNCTION fnc_close_auto_evaluate()
RETURNS TRIGGER AS $$
DECLARE
  v_avg_score numeric(3,2);
  v_period eval_period;
  v_current_month int;
  v_fnc_count int;
BEGIN
  IF NEW.status = 'CLOTUREE' AND OLD.status IS DISTINCT FROM 'CLOTUREE' AND NEW.supplier_id IS NOT NULL THEN
    v_current_month := EXTRACT(MONTH FROM CURRENT_DATE);
    IF v_current_month <= 3 THEN v_period := 'Q1';
    ELSIF v_current_month <= 6 THEN v_period := 'Q2';
    ELSIF v_current_month <= 9 THEN v_period := 'Q3';
    ELSE v_period := 'Q4';
    END IF;

    -- Compte et moyenne des FNC clôturées pour ce fournisseur dans le trimestre
    SELECT COUNT(*), ROUND(AVG(
      CASE severity
        WHEN 'CRITIQUE' THEN 1.0
        WHEN 'MAJEURE'  THEN 2.0
        WHEN 'MINEURE'  THEN 3.0
        ELSE 2.5
      END
    )::numeric, 2)
    INTO v_fnc_count, v_avg_score
    FROM fnc
    WHERE supplier_id = NEW.supplier_id
      AND status = 'CLOTUREE'
      AND closed_at >= DATE_TRUNC('quarter', CURRENT_DATE);

    -- Insère ou met à jour la ligne d'évaluation QUALITÉ
    INSERT INTO supplier_evaluations (supplier_id, period, year, criteria, score, comment, evaluated_by)
    VALUES (
      NEW.supplier_id,
      v_period,
      EXTRACT(YEAR FROM CURRENT_DATE)::int,
      'QUALITY',
      COALESCE(v_avg_score, 3.0),
      format('Score auto basé sur %s FNC clôturées au %s %s (dernière: %s)',
        v_fnc_count, v_period, EXTRACT(YEAR FROM CURRENT_DATE), NEW.code),
      NEW.closed_by
    )
    ON CONFLICT (supplier_id, period, year, criteria) DO UPDATE
      SET score = EXCLUDED.score,
          comment = EXCLUDED.comment,
          evaluated_by = EXCLUDED.evaluated_by,
          evaluated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_fnc_auto_evaluate ON fnc;
CREATE TRIGGER trig_fnc_auto_evaluate
  AFTER UPDATE OF status ON fnc
  FOR EACH ROW
  EXECUTE FUNCTION fnc_close_auto_evaluate();
