-- ─────────────────────────────────────────────────────────────────────────
-- 068 : Correction faille IDOR sur les RPC de notifications
-- ─────────────────────────────────────────────────────────────────────────
-- Contexte : notify_mark_all_read(p_user_id) et notify_clear_read(p_user_id)
-- (migration 026) sont en SECURITY DEFINER (elles s'exécutent avec les
-- privilèges du propriétaire et CONTOURNENT le RLS de la table
-- notifications). Le paramètre p_user_id est fourni par l'appelant et
-- n'était jamais vérifié par rapport à l'utilisateur authentifié.
--
-- Risque : tout utilisateur authentifié peut appeler ces RPC via l'API
-- PostgREST (supabase.rpc(...)) avec un p_user_id ARBITRAIRE (un autre
-- utilisateur). Comme la fonction tourne en SECURITY DEFINER, elle ignore
-- le RLS et exécute :
--   WHERE user_id = p_user_id OR role = public.get_role()
-- → un utilisateur malveillant peut donc marquer comme lues (ou, pire,
-- supprimer après 30 jours) TOUTES les notifications personnelles d'un
-- AUTRE utilisateur (alertes qualité, validations de congé, etc.), sans
-- jamais y avoir accès — un déni de notification / sabotage silencieux.
--
-- Correctif : le paramètre p_user_id n'est plus fait confiance. L'identité
-- est désormais TOUJOURS dérivée de auth.uid() côté serveur, quelle que
-- soit la valeur transmise par le client. Le paramètre est conservé (pour
-- compatibilité de signature) mais n'a plus aucun effet.

CREATE OR REPLACE FUNCTION notify_mark_all_read(p_user_id uuid DEFAULT NULL)
RETURNS int AS $$
DECLARE
  v_count int;
  v_uid uuid;
BEGIN
  -- ⚠️ Ne JAMAIS faire confiance à p_user_id : il est ignoré pour empêcher
  -- un utilisateur de marquer comme lues les notifications d'un autre.
  v_uid := (SELECT id FROM public.users WHERE auth_id = auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;

  UPDATE public.notifications
  SET read = true, read_at = now()
  WHERE (user_id = v_uid OR role = public.get_role())
    AND read = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION notify_clear_read(p_user_id uuid DEFAULT NULL)
RETURNS int AS $$
DECLARE
  v_count int;
  v_uid uuid;
BEGIN
  -- ⚠️ Même correctif : p_user_id ignoré, identité dérivée de auth.uid().
  v_uid := (SELECT id FROM public.users WHERE auth_id = auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;

  DELETE FROM public.notifications
  WHERE (user_id = v_uid OR role = public.get_role())
    AND read = true
    AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Note : le frontend appelait par erreur 'notify_delete_all_read' (nom
-- inexistant en base) au lieu de 'notify_clear_read' → le bouton "Effacer
-- les notifications lues" échouait silencieusement à chaque clic. Corrigé
-- côté client dans src/lib/hooks.ts (useClearReadNotifications).
