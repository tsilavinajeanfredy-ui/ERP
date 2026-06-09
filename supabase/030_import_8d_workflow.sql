-- ==============================================================================
-- ERP GSI - MIGRATION 030 : WORKFLOW 8D DANS ACHATS IMPORTS
-- ==============================================================================

-- 1. Lien entre DA Import et FNC (non-conformité fournisseur)
ALTER TABLE public.da_import
ADD COLUMN IF NOT EXISTS fnc_id uuid REFERENCES public.fnc(id),
ADD COLUMN IF NOT EXISTS quality_alert_at timestamptz;

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

-- 2. Vue 8D pour les imports
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
