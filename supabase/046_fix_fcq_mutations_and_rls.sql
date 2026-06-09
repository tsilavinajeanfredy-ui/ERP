-- ==============================================================================
-- ERP GSI - MIGRATION 046 : CORRECTIFS DES MUTATIONS ET POLITIQUES RLS SUR FCQ_DOSSIERS
-- À exécuter dans le SQL Editor de Supabase
-- ==============================================================================

-- 1. CORRECTION DU DÉCLENCHEUR DE QUARANTAINE AUTOMATIQUE (Enum Check Fix)
-- Corrige le plantage lors de la comparaison de NEW.status avec 'NON_CONFORME'
CREATE OR REPLACE FUNCTION public.enforce_lot_quarantine()
RETURNS TRIGGER AS $$
BEGIN
    -- Si le dossier est validé et que la décision finale est de bloquer le lot ('BLOQUE')
    IF (NEW.status = 'VALIDE' AND NEW.decision = 'BLOQUE') THEN
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
            'Le lot avec l''ID ' || NEW.lot_id || ' a été bloqué automatiquement suite à un résultat d''analyse BLOQUÉ.',
            'error',
            jsonb_build_object('lot_id', NEW.lot_id, 'category', 'QUALITY')
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. AJOUT DES POLITIQUES RLS MANQUANTES SUR FCQ_DOSSIERS
-- Autorise la création (INSERT) pour le rôle TLAB (Technicien Labo) et les administrateurs
DROP POLICY IF EXISTS "tlab_insert" ON public.fcq_dossiers;
CREATE POLICY "tlab_insert" ON public.fcq_dossiers 
  FOR INSERT TO authenticated 
  WITH CHECK (public.get_auth_role()::text IN ('TLAB', 'ADMIN', 'SUPER_ADMIN'));

-- Harmonise et sécurise les politiques de mise à jour (UPDATE) existantes
DROP POLICY IF EXISTS "tlab_update" ON public.fcq_dossiers;
CREATE POLICY "tlab_update" ON public.fcq_dossiers 
  FOR UPDATE TO authenticated 
  USING (public.get_auth_role()::text IN ('TLAB', 'ADMIN', 'SUPER_ADMIN')) 
  WITH CHECK (true);

DROP POLICY IF EXISTS "rq_decision" ON public.fcq_dossiers;
CREATE POLICY "rq_decision" ON public.fcq_dossiers 
  FOR UPDATE TO authenticated 
  USING (public.get_auth_role()::text IN ('RQ', 'ADMIN', 'SUPER_ADMIN')) 
  WITH CHECK (true);

-- Politique de suppression (DELETE) explicite sur les fiches de contrôle pour les administrateurs
DROP POLICY IF EXISTS "admin_delete_fcq" ON public.fcq_dossiers;
CREATE POLICY "admin_delete_fcq" ON public.fcq_dossiers 
  FOR DELETE TO authenticated 
  USING (public.get_auth_role()::text IN ('ADMIN', 'SUPER_ADMIN'));

-- 3. EXPLICATION POUR LE VERROU ISO 9001 (INSTRUMENTS HORS ÉTALONNAGE)
-- Si l'instrument est 'A_ETALONNER' (comme BAL-01 par défaut), l'exception levée est voulue par les règles ISO 9001.
-- Pour pouvoir insérer/modifier des fiches de tests sans bloquer la conformité de l'instrument,
-- assurez-vous d'utiliser un instrument opérationnel (comme PHM-01 ou VIS-01 qui ont le statut 'ETALONNE' dans les graines).
