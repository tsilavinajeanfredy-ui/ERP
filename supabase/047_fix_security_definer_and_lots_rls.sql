-- ==============================================================================
-- ERP GSI - MIGRATION 047 : CORRECTIFS SECURITY DEFINER & RLS SUR LOTS
-- À exécuter dans le SQL Editor de Supabase
-- ==============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. REDÉFINITION DE sync_lot_cqlib_status EN SECURITY DEFINER
--    Raison : Cette fonction est appelée par un déclencheur (trigger) sur
--    fcq_dossiers. Quand un utilisateur RQ valide un dossier, le trigger
--    s'exécute sous les permissions de cet utilisateur, qui n'a pas de policy
--    UPDATE sur la table lots. En ajoutant SECURITY DEFINER, la fonction
--    s'exécute avec les droits du propriétaire de la fonction (postgres/admin),
--    contournant proprement la RLS interne.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_lot_cqlib_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'VALIDE' AND NEW.decision IS NOT NULL THEN
    UPDATE public.lots
    SET cqlib_status = NEW.decision,
        updated_at   = NOW()
    WHERE id = NEW.lot_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-attacher le trigger (DROP + CREATE pour s'assurer de l'état propre)
DROP TRIGGER IF EXISTS tr_sync_lot_cqlib_status ON public.fcq_dossiers;
CREATE TRIGGER tr_sync_lot_cqlib_status
AFTER UPDATE ON public.fcq_dossiers
FOR EACH ROW
EXECUTE FUNCTION public.sync_lot_cqlib_status();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. REDÉFINITION DE enforce_lot_quarantine EN SECURITY DEFINER
--    Même raisonnement : ce trigger écrit dans lots et dans notifications,
--    tables protégées par RLS. SECURITY DEFINER permet le bypass interne.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_lot_quarantine()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.status = 'VALIDE' AND NEW.decision = 'BLOQUE') THEN
    UPDATE public.lots
    SET cqlib_status = 'BLOQUE',
        updated_at   = NOW()
    WHERE id = NEW.lot_id;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_lot_quarantine ON public.fcq_dossiers;
CREATE TRIGGER trg_enforce_lot_quarantine
AFTER UPDATE ON public.fcq_dossiers
FOR EACH ROW
EXECUTE FUNCTION public.enforce_lot_quarantine();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. POLITIQUE RLS UPDATE EXPLICITE SUR public.lots
--    Les mises à jour directes depuis le client (lotMutation dans LaboratoryScreen)
--    sont bloquées car il n'existe aucune politique UPDATE pour le rôle RQ.
--    La politique admin_all_v2 (FOR ALL) couvre déjà ADMIN/SUPER_ADMIN.
--    On ajoute une policy dédiée UPDATE pour RQ.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "rq_update_lots" ON public.lots;
CREATE POLICY "rq_update_lots"
  ON public.lots
  FOR UPDATE
  TO authenticated
  USING (public.get_auth_role()::text IN ('RQ', 'ADMIN', 'SUPER_ADMIN'))
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SÉCURITÉ : owner des fonctions SECURITY DEFINER doit être superuser/admin
--    (Supabase utilise postgres comme owner par défaut — pas de changement nécessaire)
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON FUNCTION public.sync_lot_cqlib_status IS
  'Synchronise le statut CQ du lot après validation du dossier FCQ. SECURITY DEFINER pour bypasser RLS interne.';

COMMENT ON FUNCTION public.enforce_lot_quarantine IS
  'Bloque automatiquement le lot et génère une notification RQ en cas de décision BLOQUE. SECURITY DEFINER.';
