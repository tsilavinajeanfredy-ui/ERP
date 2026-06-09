-- ==============================================================================
-- ERP GSI - MIGRATION 040 : RESTAURATION ET RÉPARATION COMPLÈTE DE L'AUTH
-- À exécuter dans le SQL Editor de Supabase pour résoudre définitivement l'erreur 500
-- ==============================================================================

-- 1. Nettoyage des anciennes entrées invalides dans auth.users
DELETE FROM auth.users WHERE email IN (
  'dpi@gsi.mg', 
  'rq@gsi.mg', 
  'tlab@gsi.mg', 
  'rprod@gsi.mg', 
  'maga@gsi.mg', 
  'rach@gsi.mg', 
  'plan@gsi.mg'
);

-- 2. Insertion des comptes d'authentification avec les UUIDs exacts de public.users
-- Cela garantit une intégrité référentielle parfaite et évite tout conflit d'identifiant.
INSERT INTO auth.users (
  instance_id, 
  id, 
  aud, 
  role, 
  email, 
  encrypted_password, 
  email_confirmed_at, 
  raw_app_meta_data, 
  raw_user_meta_data, 
  created_at, 
  updated_at
) VALUES
('00000000-0000-0000-0000-000000000000', '32f5d552-6635-4dcd-84b2-8859fc48bcb9', 'authenticated', 'authenticated', 'dpi@gsi.mg', crypt('Sipro2026@mg', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Direction Pôle Industriel", "role":"DPI"}', now(), now()),
('00000000-0000-0000-0000-000000000000', '435ad337-8e3b-4193-b3d7-2072f3052136', 'authenticated', 'authenticated', 'rq@gsi.mg', crypt('Sipro2026@mg', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Responsable Qualité", "role":"RQ"}', now(), now()),
('00000000-0000-0000-0000-000000000000', '18c5c191-57f7-4051-9273-212a75e32900', 'authenticated', 'authenticated', 'tlab@gsi.mg', crypt('Sipro2026@mg', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Technicien Laboratoire", "role":"TLAB"}', now(), now()),
('00000000-0000-0000-0000-000000000000', 'd12db18c-b960-4409-a6a1-a426013b8617', 'authenticated', 'authenticated', 'rprod@gsi.mg', crypt('Sipro2026@mg', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Responsable Production", "role":"RPROD"}', now(), now()),
('00000000-0000-0000-0000-000000000000', '088cd3a4-6b01-4014-aeeb-c54ebf8f958e', 'authenticated', 'authenticated', 'maga@gsi.mg', crypt('Sipro2026@mg', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Magasinier", "role":"MAGA"}', now(), now()),
('00000000-0000-0000-0000-000000000000', '27c97198-c2a6-459b-be74-cfb5a8e73386', 'authenticated', 'authenticated', 'rach@gsi.mg', crypt('Sipro2026@mg', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Responsable Achats", "role":"RACH"}', now(), now()),
('00000000-0000-0000-0000-000000000000', '5348c786-603b-4291-a709-a1237f87cdd2', 'authenticated', 'authenticated', 'plan@gsi.mg', crypt('Sipro2026@mg', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Planificateur", "role":"PLAN"}', now(), now());

-- 3. Synchronisation et liaison automatique des identités (auth.identities) pour tous les comptes GSI
DO $$
DECLARE
    has_provider_id boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' 
        AND table_name = 'identities' 
        AND column_name = 'provider_id'
    ) INTO has_provider_id;

    IF has_provider_id THEN
        INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
        SELECT id, id, jsonb_build_object('sub', id, 'email', email), 'email', id::text, now(), now(), now()
        FROM auth.users
        WHERE email LIKE '%@gsi.mg'
        AND NOT EXISTS (SELECT 1 FROM auth.identities WHERE auth.identities.user_id = auth.users.id);
    ELSE
        INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        SELECT id, id, jsonb_build_object('sub', id, 'email', email), 'email', now(), now(), now()
        FROM auth.users
        WHERE email LIKE '%@gsi.mg'
        AND NOT EXISTS (SELECT 1 FROM auth.identities WHERE auth.identities.user_id = auth.users.id);
    END IF;
END $$;
