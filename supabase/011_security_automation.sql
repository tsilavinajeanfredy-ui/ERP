-- Activer l'extension pour la recherche textuelle performante (trigrammes)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Fonction pour verrouiller un lot si le CQ est NON_CONFORME
CREATE OR REPLACE FUNCTION public.enforce_lot_quarantine()
RETURNS TRIGGER AS $$
BEGIN
    -- Si le statut du dossier d'analyse passe à NON_CONFORME
    IF (NEW.status = 'NON_CONFORME') THEN
        -- On met à jour le lot associé pour le bloquer immédiatement
        UPDATE public.lots 
        SET cqlib_status = 'BLOQUE',
            updated_at = NOW()
        WHERE id = NEW.lot_id;
        
        -- Notification automatique au Responsable Qualité (RQ)
        INSERT INTO public.notifications (role, title, message, type, metadata)
        VALUES (
            'RQ',
            'ALERTE : Lot bloqué automatiquement',
            'Le lot ' || NEW.lot_id || ' a été bloqué suite à un résultat d''analyse NON_CONFORME.',
            'error',
            jsonb_build_object('lot_id', NEW.lot_id, 'category', 'QUALITY')
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Création du trigger sur la table fcq_dossiers
DROP TRIGGER IF EXISTS trg_enforce_lot_quarantine ON public.fcq_dossiers;
CREATE TRIGGER trg_enforce_lot_quarantine
AFTER UPDATE OF status ON public.fcq_dossiers
FOR EACH ROW
EXECUTE FUNCTION public.enforce_lot_quarantine();

-- 3. Indexation de performance pour la recherche d'articles et de lots
CREATE INDEX IF NOT EXISTS idx_articles_code_trgm ON public.articles USING gin (code gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_lots_reception_date ON public.lots (reception_date DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log (created_at DESC);

COMMENT ON FUNCTION public.enforce_lot_quarantine IS 'Assure le blocage immédiat des lots en cas de non-conformité détectée au laboratoire.';
