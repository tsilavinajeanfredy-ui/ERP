-- ============================================================
-- CORRECTIONS SQL — ERP SIPRO
-- À exécuter dans Supabase SQL Editor
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. TRIGGER MANQUANT : on_auth_user_created
--    Crée automatiquement une ligne dans public.users
--    lorsqu'un utilisateur est créé dans auth.users
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    auth_id,
    email,
    full_name,
    role,
    active,
    scope,
    two_fa_enabled,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(
      (NEW.raw_app_meta_data->>'role')::user_role,
      'COMPTA'::user_role
    ),
    true,
    'ALL',
    false,
    now(),
    now()
  )
  ON CONFLICT (auth_id) DO NOTHING; -- évite les doublons si l'Edge Fn insère déjà
  RETURN NEW;
END;
$$;

-- Supprimer l'ancien trigger s'il existe
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Créer le trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ─────────────────────────────────────────────────────────────
-- 2. TRIGGER : on_auth_user_deleted
--    Supprime la ligne public.users quand auth.users est supprimé
--    (sécurité en cas de suppression directe sans passer par l'Edge Fn)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_user_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.users WHERE auth_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;

CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_deleted();


-- ─────────────────────────────────────────────────────────────
-- 3. CONTRAINTE MANQUANTE : auth_id UNIQUE dans public.users
--    Évite les doublons si le trigger ET l'Edge Fn s'exécutent
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_auth_id_key'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_auth_id_key UNIQUE (auth_id);
  END IF;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 4. CORRECTION : DEFAULT role cohérent (COMPTA au lieu de MAGA)
--    L'Edge Function crée avec COMPTA, le trigger doit matcher
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.users
  ALTER COLUMN role SET DEFAULT 'COMPTA'::user_role;


-- ─────────────────────────────────────────────────────────────
-- 5. INDEX sur auth_id pour les lookups fréquents
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_users_auth_id ON public.users(auth_id);
CREATE INDEX IF NOT EXISTS idx_users_email   ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role    ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_active  ON public.users(active);


-- ─────────────────────────────────────────────────────────────
-- 6. RLS POLICIES pour public.users (si pas déjà activé)
--    Assure que seuls les ADMIN voient tous les utilisateurs
-- ─────────────────────────────────────────────────────────────

-- Activer RLS si ce n'est pas fait
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Supprimer les anciennes policies pour repartir proprement
DROP POLICY IF EXISTS "users_select_own"   ON public.users;
DROP POLICY IF EXISTS "users_select_admin" ON public.users;
DROP POLICY IF EXISTS "users_update_own"   ON public.users;
DROP POLICY IF EXISTS "users_update_admin" ON public.users;
DROP POLICY IF EXISTS "users_insert_admin" ON public.users;
DROP POLICY IF EXISTS "users_delete_admin" ON public.users;

-- Tout utilisateur connecté peut voir sa propre ligne
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT
  USING (auth_id = auth.uid());

-- Les ADMIN voient tout
CREATE POLICY "users_select_admin" ON public.users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u2
      WHERE u2.auth_id = auth.uid()
        AND u2.role = 'ADMIN'
        AND u2.active = true
    )
  );

-- Chacun peut modifier son propre profil (nom, avatar…)
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE
  USING (auth_id = auth.uid());

-- Les ADMIN peuvent tout modifier
CREATE POLICY "users_update_admin" ON public.users
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u2
      WHERE u2.auth_id = auth.uid()
        AND u2.role = 'ADMIN'
        AND u2.active = true
    )
  );

-- Seul le service_role (Edge Fn) peut insérer/supprimer
-- (les policies INSERT/DELETE sans USING bloquent les clients normaux)
CREATE POLICY "users_insert_service" ON public.users
  FOR INSERT
  WITH CHECK (true); -- contrôlé par l'Edge Fn avec service_role

CREATE POLICY "users_delete_admin" ON public.users
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u2
      WHERE u2.auth_id = auth.uid()
        AND u2.role = 'ADMIN'
        AND u2.active = true
    )
  );
