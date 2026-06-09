-- ==============================================================================
-- ERP GSI - MIGRATION 039 : DIAGNOSTIC DU SYSTÈME D'AUTHENTIFICATION (auth & public)
-- À exécuter dans le SQL Editor de Supabase pour identifier la cause exacte de l'erreur 500
-- ==============================================================================

SELECT 
  'Triggers on auth.users'::text as verification,
  tgname::text as detail,
  (SELECT proname FROM pg_proc WHERE pg_proc.oid = tgfoid)::text as trigger_function
FROM pg_trigger 
WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal

UNION ALL

SELECT 
  'Triggers on public.users'::text as verification,
  tgname::text as detail,
  (SELECT proname FROM pg_proc WHERE pg_proc.oid = tgfoid)::text as trigger_function
FROM pg_trigger 
WHERE tgrelid = 'public.users'::regclass AND NOT tgisinternal

UNION ALL

SELECT 
  'Missing auth.users row'::text as verification,
  email::text as detail,
  null::text as trigger_function
FROM public.users u
WHERE email LIKE '%@gsi.mg' 
AND NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = u.auth_id)

UNION ALL

SELECT 
  'Missing auth.identities row'::text as verification,
  email::text as detail,
  null::text as trigger_function
FROM public.users u
WHERE email LIKE '%@gsi.mg' 
AND EXISTS (SELECT 1 FROM auth.users au WHERE au.id = u.auth_id)
AND NOT EXISTS (SELECT 1 FROM auth.identities ai WHERE ai.user_id = u.auth_id);
