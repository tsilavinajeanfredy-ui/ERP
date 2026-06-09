-- ==============================================================================
-- ERP GSI - MIGRATION 026 : NOTIFICATIONS PUSH & EMAIL
-- Colonnes catégorie, lecture, et fonction de marquage en masse
-- ==============================================================================

-- 1. Ajout de la catégorie métier pour filtrage côté client
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS category text CHECK (category IN ('QUALITY', 'PRODUCTION', 'PURCHASING', 'STOCK', 'SYSTEM'));

-- 2. Ajout de la date de lecture (différente du booléen read)
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- 3. Index pour les requêtes de notifications non lues
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(read) WHERE read = false;

-- 4. Fonction pour marquer toutes les notifications comme lues pour un utilisateur
CREATE OR REPLACE FUNCTION notify_mark_all_read(p_user_id uuid DEFAULT NULL)
RETURNS int AS $$
DECLARE
  v_count int;
  v_uid uuid;
BEGIN
  v_uid := COALESCE(p_user_id, (SELECT id FROM public.users WHERE auth_id = auth.uid()));
  UPDATE public.notifications
  SET read = true, read_at = now()
  WHERE (user_id = v_uid OR role = public.get_role())
    AND read = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Fonction pour supprimer les notifications lues (nettoyage)
CREATE OR REPLACE FUNCTION notify_clear_read(p_user_id uuid DEFAULT NULL)
RETURNS int AS $$
DECLARE
  v_count int;
  v_uid uuid;
BEGIN
  v_uid := COALESCE(p_user_id, (SELECT id FROM public.users WHERE auth_id = auth.uid()));
  DELETE FROM public.notifications
  WHERE (user_id = v_uid OR role = public.get_role())
    AND read = true
    AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
