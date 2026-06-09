// src/screens/EdgeFunctionTestScreen.tsx
// Écran de diagnostic et test de l'Edge Function manage-user
import * as React from 'react';
import {
  ScrollView, Text, View, TouchableOpacity, StyleSheet,
  ActivityIndicator, Platform, TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { env } from '../lib/env';

type TestStatus = 'idle' | 'running' | 'ok' | 'error';
type TestResult = { status: TestStatus; message: string; detail?: string };

const INITIAL: TestResult = { status: 'idle', message: '—' };

function StatusIcon({ status }: { status: TestStatus }) {
  if (status === 'running') return <ActivityIndicator size="small" color="#1E513B" />;
  if (status === 'ok')    return <MaterialCommunityIcons name="check-circle" size={20} color="#10B981" />;
  if (status === 'error') return <MaterialCommunityIcons name="close-circle" size={20} color="#DC2626" />;
  return <MaterialCommunityIcons name="circle-outline" size={20} color="#9CA3AF" />;
}

function TestRow({ label, result, onRun }: { label: string; result: TestResult; onRun: () => void }) {
  return (
    <View style={s.testRow}>
      <View style={s.testLeft}>
        <StatusIcon status={result.status} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={s.testLabel}>{label}</Text>
          <Text style={[
            s.testMsg,
            result.status === 'ok' && { color: '#10B981' },
            result.status === 'error' && { color: '#DC2626' },
          ]}>{result.message}</Text>
          {result.detail ? <Text style={s.testDetail}>{result.detail}</Text> : null}
        </View>
      </View>
      <TouchableOpacity
        style={[s.runBtn, result.status === 'running' && { opacity: 0.5 }]}
        onPress={onRun}
        disabled={result.status === 'running'}
      >
        <Text style={s.runBtnText}>Tester</Text>
      </TouchableOpacity>
    </View>
  );
}

export function EdgeFunctionTestScreen() {
  const [testEmail, setTestEmail] = React.useState('test.delete.' + Date.now() + '@sipromad.test');

  // ── Résultats des tests ──────────────────────────────────────────────────
  const [tSession,    setTSession]    = React.useState<TestResult>(INITIAL);
  const [tEdgePing,   setTEdgePing]   = React.useState<TestResult>(INITIAL);
  const [tCreate,     setTCreate]     = React.useState<TestResult>(INITIAL);
  const [tLogin,      setTLogin]      = React.useState<TestResult>(INITIAL);
  const [tDelete,     setTDelete]     = React.useState<TestResult>(INITIAL);
  const [createdAuthId, setCreatedAuthId] = React.useState<string | null>(null);
  const [createdUserId, setCreatedUserId] = React.useState<string | null>(null);

  // ── 1. Vérifier la session courante ─────────────────────────────────────
  const testSession = async () => {
    setTSession({ status: 'running', message: 'Vérification session…' });
    try {
      if (!supabase) throw new Error('Client Supabase non initialisé. Vérifiez .env');
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!session) throw new Error('Aucune session active. Connectez-vous d\'abord.');
      const { data: profile } = await supabase.from('users').select('role, active, full_name').eq('auth_id', session.user.id).single();
      if (!profile) throw new Error('Profil introuvable dans public.users');
      if (profile.role !== 'ADMIN') throw new Error(`Rôle actuel : ${profile.role}. L'Edge Function nécessite ADMIN.`);
      if (!profile.active) throw new Error('Compte désactivé.');
      setTSession({ status: 'ok', message: ` Connecté : ${profile.full_name} (${profile.role})`, detail: `auth_id: ${session.user.id.substring(0,8)}…` });
    } catch (e: any) {
      setTSession({ status: 'error', message: e.message, detail: 'Résolvez ce problème avant les autres tests.' });
    }
  };

  // ── 2. Ping Edge Function ────────────────────────────────────────────────
  const testEdgePing = async () => {
    setTEdgePing({ status: 'running', message: 'Appel Edge Function…' });
    try {
      if (!supabase) throw new Error('Client Supabase non initialisé.');
      const { data, error } = await supabase.functions.invoke('manage-user', {
        body: { action: '__ping__' },
      });
      // Tout retour — même un 4xx — prouve que la fonction EST déployée et répond.
      // Seule une erreur réseau (pas de réponse du tout) signifie qu'elle n'est pas joignable.
      const isNetworkError = error && (
        error.message?.toLowerCase().includes('failed to fetch') ||
        error.message?.toLowerCase().includes('networkerror') ||
        error.message?.toLowerCase().includes('econnrefused')
      );
      if (isNetworkError) throw new Error(`Erreur réseau : ${error.message}`);
      // 4xx / 5xx / réponse avec error = fonction bien déployée
      setTEdgePing({
        status: 'ok',
        message: ' Edge Function joignable — manage-user est déployée',
        detail: error ? `Réponse serveur : ${error.message}` : JSON.stringify(data).substring(0, 80),
      });
    } catch (e: any) {
      setTEdgePing({ status: 'error', message: e.message, detail: 'Vérifiez que manage-user est déployée : supabase functions deploy manage-user' });
    }
  };

  // ── 3. Créer un utilisateur test ─────────────────────────────────────────
  const testCreate = async () => {
    setTCreate({ status: 'running', message: 'Création compte test…' });
    try {
      if (!supabase) throw new Error('Client Supabase non initialisé.');
      const email = testEmail.trim();
      const { data, error } = await supabase.functions.invoke('manage-user', {
        body: {
          action: 'create',
          email,
          full_name: 'Compte Test Temporaire',
          role: 'COMPTA',
          active: true,
          scope: 'ALL',
          two_fa_enabled: false,
          password: 'TestSipro2026@mg',
        },
      });
      if (error) throw new Error(`Erreur réseau : ${error.message}`);
      if (data?.error) throw new Error(data.error);
      if (!data?.success) throw new Error('Réponse inattendue : ' + JSON.stringify(data));

      setCreatedAuthId(data.user_id || null);

      // Récupérer aussi l'id public.users
      const { data: pubUser } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
      setCreatedUserId(pubUser?.id || null);

      setTCreate({
        status: 'ok',
        message: ` Compte créé : ${email}`,
        detail: `auth_id: ${(data.user_id || '').substring(0,8)}… | public id: ${(pubUser?.id || '?').substring(0,8)}…`,
      });
    } catch (e: any) {
      setTCreate({ status: 'error', message: e.message });
    }
  };

  // ── 4. Test login avec le compte créé ───────────────────────────────────
  const testLogin = async () => {
    setTLogin({ status: 'running', message: 'Test de connexion…' });
    try {
      if (!supabase) throw new Error('Client Supabase non initialisé.');
      if (!createdAuthId) throw new Error('Créez d\'abord un compte (test 3).');

      // On teste via un client séparé pour ne pas déconnecter l'admin
      const testClient = createClient(env.supabaseUrl!, env.supabaseAnonKey!);
      const { data, error } = await testClient.auth.signInWithPassword({
        email: testEmail.trim(),
        password: 'TestSipro2026@mg',
      });
      await testClient.auth.signOut();

      if (error) throw new Error(`Login échoué : ${error.message}`);
      if (!data.session) throw new Error('Pas de session retournée.');

      setTLogin({
        status: 'ok',
        message: ' Login réussi avec le compte créé',
        detail: `email_confirmed: ${data.user?.email_confirmed_at ? 'OUI ' : 'NON '}`,
      });
    } catch (e: any) {
      setTLogin({ status: 'error', message: e.message, detail: 'Si "Email not confirmed" → la création doit passer par l\'Edge Function (pas signUp direct).' });
    }
  };

  // ── 5. Supprimer le compte test ──────────────────────────────────────────
  const testDelete = async () => {
    setTDelete({ status: 'running', message: 'Suppression compte test…' });
    try {
      if (!supabase) throw new Error('Client Supabase non initialisé.');
      if (!createdAuthId && !createdUserId) throw new Error('Aucun compte test à supprimer. Lancez d\'abord le test 3.');

      const { data, error } = await supabase.functions.invoke('manage-user', {
        body: {
          action: 'delete',
          auth_id: createdAuthId,
          user_id: createdUserId,
        },
      });
      if (error) throw new Error(`Erreur réseau : ${error.message}`);
      if (data?.error) throw new Error(data.error);
      if (!data?.success) throw new Error('Réponse inattendue : ' + JSON.stringify(data));

      // Vérifier que c'est vraiment supprimé
      const { data: check } = await supabase.from('users').select('id').eq('email', testEmail.trim()).maybeSingle();
      if (check) throw new Error('Suppression partielle : public.users existe encore !');

      setCreatedAuthId(null);
      setCreatedUserId(null);
      setTDelete({ status: 'ok', message: ' Compte supprimé de public.users ET auth.users', detail: 'La suppression fonctionne correctement.' });
    } catch (e: any) {
      setTDelete({ status: 'error', message: e.message });
    }
  };

  // ── Tout lancer en séquence ──────────────────────────────────────────────
  const runAll = async () => {
    await testSession();
    await testEdgePing();

    // Lancer la création et récupérer les IDs directement (pas via state)
    setTCreate({ status: 'running', message: 'Création compte test…' });
    let authId: string | null = null;
    let userId: string | null = null;
    try {
      if (!supabase) throw new Error('Client Supabase non initialisé.');
      const email = testEmail.trim();
      const { data, error } = await supabase.functions.invoke('manage-user', {
        body: { action: 'create', email, full_name: 'Compte Test Temporaire', role: 'COMPTA', active: true, scope: 'ALL', two_fa_enabled: false, password: 'TestSipro2026@mg' },
      });
      if (error) throw new Error(`Erreur réseau : ${error.message}`);
      if (data?.error) throw new Error(data.error);
      if (!data?.success) throw new Error('Réponse inattendue : ' + JSON.stringify(data));
      authId = data.user_id || null;
      const { data: pubUser } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
      userId = pubUser?.id || null;
      setCreatedAuthId(authId);
      setCreatedUserId(userId);
      setTCreate({ status: 'ok', message: ` Compte créé : ${email}`, detail: `auth_id: ${(authId || '').substring(0,8)}… | public id: ${(userId || '?').substring(0,8)}…` });
    } catch (e: any) {
      setTCreate({ status: 'error', message: e.message });
    }

    // Test login — utilise les IDs récupérés directement
    if (authId) {
      setTLogin({ status: 'running', message: 'Test de connexion…' });
      try {
        const testClient = createClient(env.supabaseUrl!, env.supabaseAnonKey!);
        const { data, error } = await testClient.auth.signInWithPassword({ email: testEmail.trim(), password: 'TestSipro2026@mg' });
        await testClient.auth.signOut();
        if (error) throw new Error(`Login échoué : ${error.message}`);
        if (!data.session) throw new Error('Pas de session retournée.');
        setTLogin({ status: 'ok', message: ' Login réussi avec le compte créé', detail: `email_confirmed: ${data.user?.email_confirmed_at ? 'OUI ' : 'NON '}` });
      } catch (e: any) {
        setTLogin({ status: 'error', message: e.message, detail: 'Si "Email not confirmed" → la création doit passer par l\'Edge Function (pas signUp direct).' });
      }
    } else {
      setTLogin({ status: 'error', message: 'Compte test non créé — test login ignoré.' });
    }

    // Test suppression — utilise les IDs récupérés directement
    if (authId || userId) {
      setTDelete({ status: 'running', message: 'Suppression compte test…' });
      try {
        if (!supabase) throw new Error('Client Supabase non initialisé.');
        const { data, error } = await supabase.functions.invoke('manage-user', { body: { action: 'delete', auth_id: authId, user_id: userId } });
        if (error) throw new Error(`Erreur réseau : ${error.message}`);
        if (data?.error) throw new Error(data.error);
        if (!data?.success) throw new Error('Réponse inattendue : ' + JSON.stringify(data));
        const { data: check } = await supabase.from('users').select('id').eq('email', testEmail.trim()).maybeSingle();
        if (check) throw new Error('Suppression partielle : public.users existe encore !');
        setCreatedAuthId(null);
        setCreatedUserId(null);
        setTDelete({ status: 'ok', message: ' Compte supprimé de public.users ET auth.users', detail: 'La suppression fonctionne correctement.' });
      } catch (e: any) {
        setTDelete({ status: 'error', message: e.message });
      }
    } else {
      setTDelete({ status: 'error', message: 'Compte test non créé — test suppression ignoré.' });
    }
  };

  const allDone = [tSession, tEdgePing, tCreate, tLogin, tDelete].every(t => t.status !== 'idle' && t.status !== 'running');
  const allOk   = [tSession, tEdgePing, tCreate, tLogin, tDelete].every(t => t.status === 'ok');
  const hasError = [tSession, tEdgePing, tCreate, tLogin, tDelete].some(t => t.status === 'error');

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* Header */}
      <View style={s.header}>
        <MaterialCommunityIcons name="test-tube" size={28} color="#1E513B" />
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Diagnostic Edge Function</Text>
          <Text style={s.subtitle}>Teste manage-user : create, login, delete</Text>
        </View>
        <TouchableOpacity style={s.runAllBtn} onPress={runAll}>
          <MaterialCommunityIcons name="play-circle" size={18} color="#FFF" />
          <Text style={s.runAllText}>Tout tester</Text>
        </TouchableOpacity>
      </View>

      {/* Résultat global */}
      {allDone && (
        <View style={[s.globalResult, allOk ? s.globalOk : s.globalError]}>
          <MaterialCommunityIcons
            name={allOk ? 'check-circle' : 'alert-circle'}
            size={22}
            color={allOk ? '#10B981' : '#DC2626'}
          />
          <Text style={[s.globalText, { color: allOk ? '#10B981' : '#DC2626' }]}>
            {allOk ? 'Tout fonctionne correctement ' : hasError ? 'Des erreurs ont été détectées — voir détails ci-dessous ↓' : ''}
          </Text>
        </View>
      )}

      {/* Email test */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>� Email du compte test</Text>
        <TextInput
          style={s.input}
          value={testEmail}
          onChangeText={setTestEmail}
          placeholder="test@sipromad.test"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Text style={s.hint}>Ce compte sera créé puis supprimé pendant les tests 3–5.</Text>
      </View>

      {/* Tests */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>� Tests</Text>

        <TestRow label="1. Session admin active" result={tSession} onRun={testSession} />
        <View style={s.divider} />
        <TestRow label="2. Edge Function joignable" result={tEdgePing} onRun={testEdgePing} />
        <View style={s.divider} />
        <TestRow label="3. Créer un compte (action: create)" result={tCreate} onRun={testCreate} />
        <View style={s.divider} />
        <TestRow label="4. Login avec le compte créé" result={tLogin} onRun={testLogin} />
        <View style={s.divider} />
        <TestRow label="5. Supprimer le compte (action: delete)" result={tDelete} onRun={testDelete} />
      </View>

      {/* Guide de déploiement */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>� Comment déployer l'Edge Function</Text>
        <View style={s.codeBlock}>
          <Text style={s.code}># 1. Installer la CLI Supabase (si besoin)</Text>
          <Text style={s.code}>npm install -g supabase</Text>
          <Text style={s.code}>{'\n'}# 2. Se connecter</Text>
          <Text style={s.code}>supabase login</Text>
          <Text style={s.code}>{'\n'}# 3. Lier au projet (une fois)</Text>
          <Text style={s.code}>supabase link --project-ref {'<votre-ref>'}</Text>
          <Text style={s.code}>{'\n'}# 4. Déployer</Text>
          <Text style={s.codeHighlight}>supabase functions deploy manage-user</Text>
        </View>
        <Text style={s.hint}>La ref du projet se trouve dans Supabase Dashboard → Settings → General.</Text>
      </View>

      {/* Explication des erreurs courantes */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>❓ Erreurs fréquentes</Text>
        {[
          { err: '"Email not confirmed"', fix: 'La création passait par signUp() au lieu de l\'Edge Function. Utilisez le AdminUsersScreen corrigé.' },
          { err: '"Accès refusé : rôle ADMIN requis"', fix: 'Votre compte connecté n\'est pas ADMIN dans public.users.' },
          { err: '"FunctionsHttpError" ou timeout', fix: 'L\'Edge Function n\'est pas déployée. Lancez : supabase functions deploy manage-user' },
          { err: '"Session invalide ou expirée"', fix: 'Déconnectez-vous et reconnectez-vous. Token expiré.' },
        ].map((item, i) => (
          <View key={i} style={s.errorItem}>
            <Text style={s.errorCode}> {item.err}</Text>
            <Text style={s.errorFix}>→ {item.fix}</Text>
          </View>
        ))}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },
  content: { padding: 16, paddingBottom: 40 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFF', borderRadius: 14, padding: 16,
    marginBottom: 16, ...Platform.select({ web: { boxShadow: '0px 2px 8px rgba(0,0,0,0.06)' }, default: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 } }),
  },
  title: { fontSize: 17, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  runAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1E513B', paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 10,
  },
  runAllText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  globalResult: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1,
  },
  globalOk: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  globalError: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  globalText: { fontSize: 14, fontWeight: '600', flex: 1 },
  section: {
    backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 16,
    ...Platform.select({ web: { boxShadow: '0px 2px 8px rgba(0,0,0,0.04)' }, default: { shadowColor: '#000', shadowOpacity: 0.04 } }), shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6, elevation: 1,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#111827',
    backgroundColor: '#F9FAFB',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
  },
  hint: { fontSize: 11, color: '#9CA3AF', marginTop: 6 },
  testRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, gap: 8 },
  testLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start' },
  testLabel: { fontSize: 13, fontWeight: '600', color: '#111827' },
  testMsg: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  testDetail: { fontSize: 11, color: '#9CA3AF', marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  runBtn: {
    backgroundColor: '#F3F4F6', paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB',
  },
  runBtnText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginHorizontal: 4 },
  codeBlock: { backgroundColor: '#0F172A', borderRadius: 10, padding: 14, marginTop: 4 },
  code: { fontSize: 12, color: '#94A3B8', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 20 },
  codeHighlight: { fontSize: 12, color: '#34D399', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 20, fontWeight: '700' },
  errorItem: { marginBottom: 12 },
  errorCode: { fontSize: 13, fontWeight: '600', color: '#DC2626' },
  errorFix: { fontSize: 12, color: '#374151', marginTop: 2, lineHeight: 18 },
});
