-- ============================================================================
-- ERP GSI — CRÉATION DU SUPER ADMIN & SYNC AUTH
-- À exécuter dans le SQL Editor de Supabase
-- ============================================================================

-- 1. Activer l'extension pour les mots de passe (si non présente)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Création de l'utilisateur dans auth.users
-- Note: Le mot de passe par défaut est 'GsiAdmin2026!'
-- Le trigger 'on_auth_user_created' défini dans 001_schema.sql 
-- créera automatiquement l'entrée correspondante dans public.users.

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin@gsi.mg',
  crypt('Sipro2026@mg', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Super Administrateur GSI", "role":"ADMIN"}',
  now(),
  now(),
  '',
  '',
  '',
  ''
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@gsi.mg');

-- 3. S'assurer que le rôle est bien ADMIN dans la table publique 
-- (au cas où le seed aurait été exécuté avant le trigger)
UPDATE public.users 
SET role = 'ADMIN', active = true 
WHERE email = 'admin@gsi.mg';

-- 4. Attribution des droits sur les schémas pour l'API Supabase
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
