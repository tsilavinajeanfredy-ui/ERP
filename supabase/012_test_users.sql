-- ============================================================================
-- ERP GSI — Insertion des utilisateurs de test et d'administration
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Réinitialisation des comptes d'authentification dans auth.users (sauf le super admin admin@gsi.mg)
-- IMPORTANT : On ne supprime pas de la table public.users afin de préserver l'intégrité référentielle (ex: instruments, OF, FNC)
DELETE FROM auth.users WHERE email LIKE '%@gsi.mg' AND email <> 'admin@gsi.mg';

-- 2. Création des utilisateurs dans auth.users
-- Tous les utilisateurs partagent le mot de passe par défaut : Sipro2026@mg
-- Le trigger 'on_auth_user_created' va automatiquement copier ces utilisateurs dans public.users.

-- ADMIN
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'admin@gsi.mg', crypt('Sipro2026@mg', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Administrateur système", "role":"ADMIN"}', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@gsi.mg');

-- DPI
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'dpi@gsi.mg', crypt('Sipro2026@mg', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Direction Pôle Industriel", "role":"DPI"}', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'dpi@gsi.mg');

-- RQ
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'rq@gsi.mg', crypt('Sipro2026@mg', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Responsable Qualité", "role":"RQ"}', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'rq@gsi.mg');

-- TLAB
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'tlab@gsi.mg', crypt('Sipro2026@mg', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Technicien Laboratoire", "role":"TLAB"}', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'tlab@gsi.mg');

-- RPROD
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'rprod@gsi.mg', crypt('Sipro2026@mg', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Responsable Production", "role":"RPROD"}', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'rprod@gsi.mg');

-- MAGA
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'maga@gsi.mg', crypt('Sipro2026@mg', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Magasinier", "role":"MAGA"}', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'maga@gsi.mg');

-- RACH
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'rach@gsi.mg', crypt('Sipro2026@mg', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Responsable Achats", "role":"RACH"}', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'rach@gsi.mg');

-- PLAN
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'plan@gsi.mg', crypt('Sipro2026@mg', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Planificateur", "role":"PLAN"}', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'plan@gsi.mg');


-- 3. Mise à jour des mots de passe pour les utilisateurs existants au cas où ils auraient été créés précédemment
UPDATE auth.users SET encrypted_password = crypt('Sipro2026@mg', gen_salt('bf')) WHERE email IN ('admin@gsi.mg', 'dpi@gsi.mg', 'rq@gsi.mg', 'tlab@gsi.mg', 'rprod@gsi.mg', 'maga@gsi.mg', 'rach@gsi.mg', 'plan@gsi.mg');


-- 4. Synchronisation robuste et respect strict de la configuration 2FA demandée par rôle
UPDATE public.users SET role = 'ADMIN', two_fa_enabled = true, active = true, site = 'Antananarivo' WHERE email = 'admin@gsi.mg';
UPDATE public.users SET role = 'DPI', two_fa_enabled = true, active = true, site = 'Antananarivo' WHERE email = 'dpi@gsi.mg';
UPDATE public.users SET role = 'RQ', two_fa_enabled = true, active = true, site = 'Antananarivo' WHERE email = 'rq@gsi.mg';
UPDATE public.users SET role = 'TLAB', two_fa_enabled = false, active = true, site = 'Antananarivo' WHERE email = 'tlab@gsi.mg';
UPDATE public.users SET role = 'RPROD', two_fa_enabled = false, active = true, site = 'Antananarivo' WHERE email = 'rprod@gsi.mg';
UPDATE public.users SET role = 'MAGA', two_fa_enabled = false, active = true, site = 'Antananarivo' WHERE email = 'maga@gsi.mg';
UPDATE public.users SET role = 'RACH', two_fa_enabled = false, active = true, site = 'Antananarivo' WHERE email = 'rach@gsi.mg';
UPDATE public.users SET role = 'PLAN', two_fa_enabled = false, active = true, site = 'Antananarivo' WHERE email = 'plan@gsi.mg';

-- 5. Attribution des droits sur les schémas pour l'API Supabase
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
