-- ==============================================================================
-- ERP GSI - MIGRATION 034 : FONCTIONNALITÉS INDUSTRIELLES AVANCÉES
-- (Inventaire multi-niveaux, verrous Métrologie ISO 9001 & Cascade de rappel)
-- ==============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. INFRASTRUCTURE D'INVENTAIRE : SIGNATURES MULTI-NIVEAUX
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.inventory_campaigns 
ADD COLUMN IF NOT EXISTS signature_maga text,
ADD COLUMN IF NOT EXISTS signature_maga_at timestamptz,
ADD COLUMN IF NOT EXISTS signature_rach text,
ADD COLUMN IF NOT EXISTS signature_rach_at timestamptz,
ADD COLUMN IF NOT EXISTS signature_dpi text,
ADD COLUMN IF NOT EXISTS signature_dpi_at timestamptz;

-- Fonction de validation de réconciliation finale
CREATE OR REPLACE FUNCTION public.reconcile_inventory(campaign_id uuid, admin_user_id uuid)
RETURNS void AS $$
DECLARE
  cnt RECORD;
BEGIN
  -- Vérifier que la campagne existe et a les signatures requises
  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_campaigns 
    WHERE id = campaign_id 
      AND signature_maga IS NOT NULL 
      AND signature_rach IS NOT NULL 
      AND signature_dpi IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Réconciliation impossible : Circuit d''approbations multi-signatures incomplet (MAGA, RACH et DPI requis).';
  END IF;

  -- Boucler sur chaque écart d'inventaire pour générer les écritures de régularisation automatique
  FOR cnt IN 
    SELECT c.article_id, c.depot_id, c.stock_theorique, c.stock_physique, c.ecart
    FROM public.inventory_counts c
    WHERE c.campaign_id = campaign_id AND c.ecart <> 0
  LOOP
    -- 1. Créer un mouvement de stock d'ajustement
    INSERT INTO public.stock_movements (
      lot_id,
      article_id,
      depot_from_id,
      depot_to_id,
      movement_type,
      qty,
      reference_doc,
      performed_by,
      notes
    )
    SELECT 
      l.id,
      cnt.article_id,
      CASE WHEN cnt.ecart < 0 THEN cnt.depot_id ELSE NULL END, -- Sortie d'ajustement
      CASE WHEN cnt.ecart > 0 THEN cnt.depot_id ELSE NULL END, -- Entrée d'ajustement
      'AJUSTEMENT',
      ABS(cnt.ecart),
      'REGUL-INV-' || campaign_id,
      admin_user_id,
      'Régularisation d''inventaire automatique suite à écart constaté de ' || cnt.ecart
    FROM public.lots l
    WHERE l.article_id = cnt.article_id AND l.depot_id = cnt.depot_id
    LIMIT 1;

    -- 2. Mettre à jour la quantité courante du lot principal associé
    UPDATE public.lots
    SET qty_current = GREATEST(0, qty_current + cnt.ecart),
        updated_at = now()
    WHERE id IN (
      SELECT id FROM public.lots 
      WHERE article_id = cnt.article_id AND depot_id = cnt.depot_id
      LIMIT 1
    );
  END LOOP;

  -- Marquer la campagne d'inventaire comme Validée
  UPDATE public.inventory_campaigns
  SET status = 'VALIDE',
      completed_at = now(),
      validated_by = admin_user_id,
      updated_at = now()
  WHERE id = campaign_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ──────────────────────────────────────────────────────────────────────────────
-- 2. VERROU MÉTROLOGIQUE ISO 9001 (RÈGLE §4.5)
-- ──────────────────────────────────────────────────────────────────────────────
-- Déclencheur qui bloque la validation d'une FCQ si l'instrument de mesure sélectionné
-- est déclaré non conforme ('ECHU' ou 'A_ETALONNER').
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


-- ──────────────────────────────────────────────────────────────────────────────
-- 3. RAPPEL DE LOTS EN CASCADE (RECALL MANAGEMENT & GENEALOGIE)
-- ──────────────────────────────────────────────────────────────────────────────
-- Fonction récursive pour bloquer instantanément un lot suspect et propager le blocage
-- à tous les lots de produits finis ou semi-finis dérivés.
CREATE OR REPLACE FUNCTION public.cascade_recall_lot(suspect_lot_id uuid, reason text, rq_user_id uuid)
RETURNS void AS $$
DECLARE
  child_lot RECORD;
  fnc_code text;
BEGIN
  -- 1. Bloquer le lot suspect primaire
  UPDATE public.lots
  SET cqlib_status = 'BLOQUE',
      cqlib_decided_by = rq_user_id,
      cqlib_decided_at = now(),
      updated_at = now()
  WHERE id = suspect_lot_id;

  -- 2. Créer une Fiche de Non-Conformité (FNC) pour ce lot
  fnc_code := 'FNC-RECALL-' || UPPER(SUBSTRING(gen_random_uuid()::text FROM 1 FOR 6));
  
  INSERT INTO public.fnc (
    code,
    lot_id,
    severity,
    status,
    description,
    root_cause,
    opened_by,
    opened_at
  ) VALUES (
    fnc_code,
    suspect_lot_id,
    'CRITIQUE',
    'OUVERTE',
    'RAPPEL ET BLOCAGE D''URGENCE : ' || reason,
    'Suspicion de contamination/défaut détectée. Rappel automatique en cascade déclenché.',
    rq_user_id,
    now()
  );

  -- 3. Identifier les lots descendants via la généalogie de fabrication (production_orders)
  -- Pour chaque ordre de fabrication qui a consommé ce lot suspect comme composant BOM
  -- et qui a généré un lot de produit fini.
  FOR child_lot IN
    SELECT distinct l_desc.id AS desc_id, l_desc.code AS desc_code
    FROM public.stock_movements sm_consume
    -- Mouvement de sortie de matière première consommé par un ordre de production
    JOIN public.production_orders po ON po.code = sm_consume.reference_doc
    -- Lots de produits finis générés par ce même ordre de production
    JOIN public.lots l_desc ON l_desc.article_id = po.product_id
    WHERE sm_consume.lot_id = suspect_lot_id
      AND sm_consume.movement_type = 'SORTIE'
      AND l_desc.cqlib_status <> 'BLOQUE'
  LOOP
    -- Bloquer récursivement le lot enfant détecté
    PERFORM public.cascade_recall_lot(child_lot.desc_id, 'Rappel propagé en cascade depuis le lot parent suspect #' || suspect_lot_id, rq_user_id);
  END LOOP;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
