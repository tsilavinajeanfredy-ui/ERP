-- ============================================================================
-- ERP GSI — Sector-Specific Production Accounts & Scope Support
-- ============================================================================

-- 1. Mise à jour de la fonction trigger pour synchroniser le 'scope' de auth vers public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (auth_id, email, full_name, role, scope)
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    COALESCE((new.raw_user_meta_data->>'role')::user_role, 'MAGA'),
    new.raw_user_meta_data->>'scope'
  )
  ON CONFLICT (email) DO UPDATE SET 
    auth_id = EXCLUDED.auth_id,
    full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
    role = COALESCE(EXCLUDED.role, public.users.role),
    scope = COALESCE(EXCLUDED.scope, public.users.scope);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Création d'une fonction temporaire pour créer et mettre à jour proprement les comptes de test
CREATE OR REPLACE FUNCTION public.safe_create_test_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_role user_role,
  p_scope text
) RETURNS void AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- A. Récupération ou création de l'identifiant dans auth.users
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
  
  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, 
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      p_email,
      crypt(p_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('full_name', p_full_name, 'role', p_role::text, 'scope', p_scope),
      now(),
      now()
    );
  ELSE
    -- Mise à jour des métadonnées pour l'utilisateur existant
    UPDATE auth.users 
    SET raw_user_meta_data = jsonb_build_object('full_name', p_full_name, 'role', p_role::text, 'scope', p_scope),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  -- B. Insertion ou mise à jour forcée du profil public correspondant
  INSERT INTO public.users (auth_id, email, full_name, role, scope, active, two_fa_enabled)
  VALUES (v_user_id, p_email, p_full_name, p_role, p_scope, true, false)
  ON CONFLICT (email) DO UPDATE SET
    auth_id = EXCLUDED.auth_id,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    scope = EXCLUDED.scope,
    active = true;

  -- C. Validation finale du mot de passe sur le compte auth
  UPDATE auth.users 
  SET encrypted_password = crypt(p_password, gen_salt('bf')),
      email_confirmed_at = now()
  WHERE id = v_user_id;

  -- D. Synchronisation et liaison automatique des identités (auth.identities)
  IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'auth' 
      AND table_name = 'identities' 
      AND column_name = 'provider_id'
  ) THEN
      INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
      VALUES (v_user_id, v_user_id, jsonb_build_object('sub', v_user_id, 'email', p_email), 'email', v_user_id::text, now(), now(), now())
      ON CONFLICT (provider, provider_id) DO NOTHING;
  ELSE
      INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (v_user_id, v_user_id, jsonb_build_object('sub', v_user_id, 'email', p_email), 'email', now(), now(), now())
      ON CONFLICT (id) DO NOTHING;
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Exécution de la création sécurisée des 4 comptes sectoriels RPROD avec mot de passe "Sipro2026@mg"
SELECT public.safe_create_test_user('prod.savon@gsi.mg', 'Sipro2026@mg', 'Responsable Prod - Savon', 'RPROD', 'SAVON');
SELECT public.safe_create_test_user('prod.corde@gsi.mg', 'Sipro2026@mg', 'Responsable Prod - Corde', 'RPROD', 'CORDE');
SELECT public.safe_create_test_user('prod.bougie@gsi.mg', 'Sipro2026@mg', 'Responsable Prod - Bougie & Encaustique', 'RPROD', 'BOUGIE_ENCAUSTIQUE');
SELECT public.safe_create_test_user('prod.spah@gsi.mg', 'Sipro2026@mg', 'Responsable Prod - SPAH / Papier', 'RPROD', 'PH');

-- 4. Nettoyage de la fonction d'initialisation temporaire
DROP FUNCTION public.safe_create_test_user(text, text, text, user_role, text);
