-- ==============================================================================
-- ERP GSI - 044_auto_create_fcq_dossiers.sql
-- Phase 5 : Automatisation du Contrôle Qualité à la Réception/Production
-- Création automatique d'un dossier FCQ en attente pour tout lot mis en QUARANTAINE
-- ==============================================================================

-- 1. Fonction trigger pour créer automatiquement le dossier FCQ
CREATE OR REPLACE FUNCTION public.auto_create_fcq_dossier()
RETURNS TRIGGER AS $$
DECLARE
  v_article_type text;
  v_fcq_type text;
  v_year text;
  v_seq_val int;
  v_code text;
BEGIN
  -- L'automatisation s'applique uniquement aux lots en QUARANTAINE
  IF NEW.cqlib_status = 'QUARANTAINE' THEN
    -- Éviter les doublons si un dossier existe déjà pour ce lot
    IF EXISTS (SELECT 1 FROM public.fcq_dossiers WHERE lot_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    -- Récupérer le type d'article (MP, PF, SF, EMB)
    SELECT article_type INTO v_article_type 
    FROM public.articles 
    WHERE id = NEW.article_id;

    -- Déterminer le type de dossier FCQ selon le type d'article
    IF v_article_type = 'MP' THEN
      v_fcq_type := 'FCQ-MP';
    ELSIF v_article_type = 'PF' THEN
      v_fcq_type := 'FCQ-PF';
    ELSE
      v_fcq_type := 'FCQ-SF';
    END IF;

    -- Générer le code unique séquentiel annuel (ex: FCQ-2026-0001)
    v_year := to_char(CURRENT_DATE, 'YYYY');
    
    SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(code, '^FCQ-' || v_year || '-', '') AS INTEGER)), 0) + 1
    INTO v_seq_val
    FROM public.fcq_dossiers
    WHERE code LIKE 'FCQ-' || v_year || '-%';

    v_code := 'FCQ-' || v_year || '-' || lpad(v_seq_val::text, 4, '0');

    -- Insérer le nouveau dossier FCQ en attente
    INSERT INTO public.fcq_dossiers (code, lot_id, fcq_type, status)
    VALUES (v_code, NEW.id, v_fcq_type, 'EN_ATTENTE');
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Sécurité : on n'interrompt pas la création du lot principal en cas d'anomalie
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Liaison du trigger sur la table public.lots
DROP TRIGGER IF EXISTS tr_auto_create_fcq_dossier ON public.lots;
CREATE TRIGGER tr_auto_create_fcq_dossier
AFTER INSERT OR UPDATE OF cqlib_status ON public.lots
FOR EACH ROW
WHEN (NEW.cqlib_status = 'QUARANTAINE')
EXECUTE FUNCTION public.auto_create_fcq_dossier();

COMMENT ON FUNCTION public.auto_create_fcq_dossier() IS 'Génère automatiquement une fiche de contrôle qualité (FCQ) en attente pour tout lot placé en quarantaine.';
