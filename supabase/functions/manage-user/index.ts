// @ts-nocheck
// supabase/functions/manage-user/index.ts  — VERSION CORRIGÉE
//
// FIX CRITIQUE :
//   - action 'delete' : supprime maintenant public.users EN PREMIER puis auth.users
//   - action 'create' : gère les doublons email + retry plus robuste
//   - action 'unban'  : nouveau — réactive un utilisateur banni
//   - Toutes les actions synchronisent public.users correctement
//   - Réponses JSON cohérentes avec message descriptif

import { serve } from 'https://deno.land/std@0.170.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Non autorisé : header Authorization manquant.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Vérifier que l'appelant est un ADMIN actif
    const { data: { user: callerAuth }, error: callerAuthErr } = await userClient.auth.getUser();
    if (callerAuthErr || !callerAuth) return json({ error: 'Session invalide ou expirée.' }, 401);

    const { data: callerProfile, error: profileErr } = await adminClient
      .from('users')
      .select('role, active')
      .eq('auth_id', callerAuth.id)
      .single();

    if (profileErr || !callerProfile) return json({ error: 'Profil appelant introuvable.' }, 403);
    if (callerProfile.role !== 'ADMIN' || !callerProfile.active)
      return json({ error: 'Accès refusé : rôle ADMIN requis.' }, 403);

    const payload = await req.json();
    const { action } = payload;
    if (!action) return json({ error: 'Paramètre "action" requis.' }, 400);

    // ══════════════════════════════════════════════════════════════════
    //  CREATE
    // ══════════════════════════════════════════════════════════════════
    if (action === 'create') {
      const { email, full_name, role, active, scope, two_fa_enabled, password } = payload;
      if (!email || !full_name) return json({ error: 'email et full_name requis.' }, 400);

      const { data: existing } = await adminClient
        .from('users').select('id').eq('email', email.trim()).maybeSingle();
      if (existing) return json({ error: 'Un compte avec cet email existe déjà.' }, 409);

      const { data: newAuthUser, error: createErr } = await adminClient.auth.admin.createUser({
        email: email.trim(),
        password: password || 'Sipro2026@mg',
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createErr) return json({ error: createErr.message }, 400);
      if (!newAuthUser.user) return json({ error: 'Création auth échouée.' }, 500);

      const authId = newAuthUser.user.id;

      let publicUser = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        const { data } = await adminClient.from('users').select('id').eq('auth_id', authId).maybeSingle();
        if (data) { publicUser = data; break; }
      }

      const profileData = {
        auth_id: authId,
        full_name: full_name.trim(),
        email: email.trim(),
        role: role || 'COMPTA',
        active: active !== false,
        scope: scope || 'ALL',
        two_fa_enabled: two_fa_enabled || false,
        updated_at: new Date().toISOString(),
      };

      if (publicUser) {
        await adminClient.from('users').update(profileData).eq('auth_id', authId);
      } else {
        const { error: insErr } = await adminClient.from('users')
          .insert({ ...profileData, created_at: new Date().toISOString() });
        if (insErr?.code === '23505') {
          await adminClient.from('users').update(profileData).eq('auth_id', authId);
        }
      }

      return json({ success: true, user_id: authId, message: `Compte créé pour ${email}` });
    }

    // ══════════════════════════════════════════════════════════════════
    //  DELETE — FIX : supprime public.users EN PREMIER
    // ══════════════════════════════════════════════════════════════════
    if (action === 'delete') {
      const { auth_id, user_id } = payload;
      if (!auth_id && !user_id) return json({ error: 'auth_id ou user_id requis.' }, 400);

      if (auth_id && auth_id === callerAuth.id)
        return json({ error: 'Impossible de supprimer votre propre compte.' }, 403);

      // 1. Supprimer public.users EN PREMIER (avant auth pour éviter les contraintes FK)
      if (auth_id) {
        await adminClient.from('users').delete().eq('auth_id', auth_id);
      } else if (user_id) {
        await adminClient.from('users').delete().eq('id', user_id);
      }

      // 2. Supprimer auth.users (révoque l'accès)
      if (auth_id) {
        const { error: deleteAuthErr } = await adminClient.auth.admin.deleteUser(auth_id);
        if (deleteAuthErr && !deleteAuthErr.message?.toLowerCase().includes('not found')) {
          return json({ error: deleteAuthErr.message }, 400);
        }
      }

      return json({ success: true, message: 'Utilisateur supprimé définitivement.' });
    }

    // ══════════════════════════════════════════════════════════════════
    //  UPDATE_EMAIL
    // ══════════════════════════════════════════════════════════════════
    if (action === 'update_email') {
      const { auth_id, email } = payload;
      if (!auth_id || !email) return json({ error: 'auth_id et email requis.' }, 400);

      const { error: updateErr } = await adminClient.auth.admin.updateUserById(auth_id, {
        email: email.trim(), email_confirm: true,
      });
      if (updateErr) return json({ error: updateErr.message }, 400);

      await adminClient.from('users')
        .update({ email: email.trim(), updated_at: new Date().toISOString() })
        .eq('auth_id', auth_id);

      return json({ success: true });
    }

    // ══════════════════════════════════════════════════════════════════
    //  BAN
    // ══════════════════════════════════════════════════════════════════
    if (action === 'ban') {
      const { auth_id } = payload;
      if (!auth_id) return json({ error: 'auth_id requis.' }, 400);

      const { error: banErr } = await adminClient.auth.admin.updateUserById(auth_id, {
        ban_duration: '87600h',
      });
      if (banErr) return json({ error: banErr.message }, 400);

      await adminClient.from('users')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('auth_id', auth_id);

      return json({ success: true });
    }

    // ══════════════════════════════════════════════════════════════════
    //  UNBAN — nouveau : réactivation
    // ══════════════════════════════════════════════════════════════════
    if (action === 'unban') {
      const { auth_id } = payload;
      if (!auth_id) return json({ error: 'auth_id requis.' }, 400);

      const { error: unbanErr } = await adminClient.auth.admin.updateUserById(auth_id, {
        ban_duration: 'none',
      });
      if (unbanErr) return json({ error: unbanErr.message }, 400);

      await adminClient.from('users')
        .update({ active: true, updated_at: new Date().toISOString() })
        .eq('auth_id', auth_id);

      return json({ success: true });
    }

    // ══════════════════════════════════════════════════════════════════
    //  UPDATE_ROLE
    // ══════════════════════════════════════════════════════════════════
    if (action === 'update_role') {
      const { auth_id, role, full_name, scope } = payload;
      if (!auth_id) return json({ error: 'auth_id requis.' }, 400);

      const updateAuthData: any = {};
      if (role) updateAuthData.app_metadata = { provider: 'email', providers: ['email'], role };
      if (full_name) updateAuthData.user_metadata = { full_name };

      if (Object.keys(updateAuthData).length > 0) {
        const { error } = await adminClient.auth.admin.updateUserById(auth_id, updateAuthData);
        if (error) return json({ error: error.message }, 400);
      }

      const publicUpdate: any = { updated_at: new Date().toISOString() };
      if (role) publicUpdate.role = role;
      if (full_name) publicUpdate.full_name = full_name;
      if (scope !== undefined) publicUpdate.scope = scope;

      await adminClient.from('users').update(publicUpdate).eq('auth_id', auth_id);
      return json({ success: true });
    }

    return json({ error: `Action inconnue : ${action}` }, 400);

  } catch (err: any) {
    console.error('manage-user error:', err);
    return json({ error: err.message || 'Erreur interne.' }, 500);
  }
});
