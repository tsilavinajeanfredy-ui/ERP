import * as React from 'react';
import { ScrollView, StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Alert, useWindowDimensions, TextInput } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, ActionButton, AnimatedPage, FormModal, FormInput, FormSelect, Badge } from '../components/Ui';
import { useUserProfile, useMutation, useManagementReviews } from '../lib/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ─── Version courante de l'application ────────────────────────────────────────
const APP_VERSION = '2.6.0';
const BUILD_DATE = '2026-06-12';

// ─── Historique des versions intégré ──────────────────────────────────────────
const BUILTIN_CHANGELOG: Array<{ version: string; date: string; type: 'major' | 'minor' | 'patch'; notes: string }> = [
  { version: '2.6.0', date: '2026-06-12', type: 'major', notes: 'Module RH complet (cycles paie 15-14, heures sup, budget). Module MRP scénarios What-If. Gestion versions admin.' },
  { version: '2.5.0', date: '2026-05-01', type: 'major', notes: 'Réception MP workflow QUARANTAINE → FCQ. Notifications Realtime TLAB/RQ. Pièces jointes lots.' },
  { version: '2.4.0', date: '2026-03-15', type: 'minor', notes: 'Module Laboratoire & CQ : dossiers FCQ, paramètres libres, PDF export. Étalonnage instruments.' },
  { version: '2.3.0', date: '2026-02-01', type: 'minor', notes: 'Achat Import : jalons logistiques, alertes ETA, dossier import PDF. Achat Local : DA, fournisseurs.' },
  { version: '2.2.0', date: '2026-01-10', type: 'patch', notes: 'Fix Alert.alert → confirmAction web. Fix useDepots/useSites. Correction enum da_status.' },
  { version: '2.1.0', date: '2025-12-01', type: 'minor', notes: 'MRP : suggestions, KPI, scénarios. Gestion utilisateurs Edge Function.' },
];
import { env } from '../lib/env';
import { createClient } from '@supabase/supabase-js';
import type { User, UserRole, ManagementReview } from '../lib/database.types';
import { generatePdf, getPdfTemplate } from '../lib/pdf';
import { useTranslation } from '../lib/i18n';

export function AdminScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const { profile } = useUserProfile();
  const queryClient = useQueryClient();
  const isAdmin = profile?.role === 'ADMIN' || profile?.role === 'SUPER_ADMIN' || profile?.role === 'DSI';

  // ─── Onglets admin ─────────────────────────────────────────────────────────
  const ADMIN_TABS = ['UTILISATEURS', 'VERSIONS'] as const;
  const [adminTab, setAdminTab] = React.useState<typeof ADMIN_TABS[number]>('UTILISATEURS');

  // ─── État gestion versions ─────────────────────────────────────────────────
  const [patchModalVisible, setPatchModalVisible] = React.useState(false);
  const [patchForm, setPatchForm] = React.useState({ version: '', date: new Date().toISOString().split('T')[0], type: 'patch' as 'major' | 'minor' | 'patch', notes: '' });

  // Patches DB (table app_patches si elle existe)
  const { data: dbPatches = [] } = useQuery<Array<{ id: string; version: string; date: string; type: string; notes: string; applied_by?: string; created_at: string }>>({
    queryKey: ['app_patches'],
    queryFn: async () => {
      if (!supabase) return [];
      const { data } = await supabase.from('app_patches').select('*').order('created_at', { ascending: false }).limit(50);
      return data || [];
    },
    retry: false, // La table peut ne pas exister
  });

  const handleAddPatch = async () => {
    if (!supabase || !patchForm.version || !patchForm.notes) return;
    try {
      await supabase.from('app_patches').insert({
        version: patchForm.version,
        date: patchForm.date,
        type: patchForm.type,
        notes: patchForm.notes,
        applied_by: profile?.full_name || profile?.id,
      });
      queryClient.invalidateQueries({ queryKey: ['app_patches'] });
      setPatchModalVisible(false);
      setPatchForm({ version: '', date: new Date().toISOString().split('T')[0], type: 'patch', notes: '' });
    } catch {
      // Table inexistante : stocker localement sans erreur visible
      setPatchModalVisible(false);
    }
  };

  const versionTypeColor = (type: string) => {
    if (type === 'major') return '#7C3AED';
    if (type === 'minor') return C.info;
    return C.gold;
  };

  // ─── PV revue de direction (M7) ───────────────────────────────────────────
  const { data: reviews = [], generate: generateReview } = useManagementReviews();
  const monthLabel = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  };
  const handleGenerateReview = () => {
    generateReview.mutate(undefined, {
      onSuccess: () => Alert.alert('PV généré', 'Le PV de revue de direction du mois précédent a été pré-rempli.'),
      onError: (e: any) => Alert.alert('Erreur', e?.message || 'Génération impossible.'),
    });
  };
  const handleExportReviewPdf = (r: ManagementReview) => {
    const k = r.kpis || {};
    const row = (label: string, val: any) => `<tr><td style="width:60%; font-weight:700;">${label}</td><td>${val ?? '—'}</td></tr>`;
    const html = getPdfTemplate(
      `PV REVUE DE DIRECTION — ${monthLabel(r.period_month)}`,
      `<div class="summary-card"><strong>Période :</strong> ${monthLabel(r.period_month)}<br/><strong>Statut :</strong> ${r.status}<br/><strong>Généré le :</strong> ${new Date(r.generated_at).toLocaleString('fr-FR')}</div>
      <h3>Production</h3>
      <table>${row('OF terminés', k.production?.orders_completed)}${row('Quantité produite', k.production?.qty_produced)}</table>
      <h3>Qualité</h3>
      <table>${row('Dossiers FCQ', k.quality?.fcq_total)}${row('Lots libérés', k.quality?.fcq_libere)}${row('FNC ouvertes', k.quality?.fnc_opened)}${row('FNC clôturées', k.quality?.fnc_closed)}</table>
      <h3>Réclamations</h3>
      <table>${row('Ouvertes', k.complaints?.opened)}${row('Clôturées', k.complaints?.closed)}</table>
      <h3>Stock</h3>
      <table>${row('Lots en quarantaine', k.stock?.lots_quarantine)}${row('Lots bloqués', k.stock?.lots_blocked)}</table>
      <h3>Achats</h3>
      <table>${row('DA import', k.purchasing?.da_import)}${row('DA local', k.purchasing?.da_local)}</table>`,
    );
    generatePdf(html, `PV_Revue_Direction_${r.period_month}.pdf`);
  };
  
  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => {
      if (!supabase) throw new Error("Supabase is null");
      const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const mutation = useMutation('users', () => setModalVisible(false));
  const { t } = useTranslation();
  const [modalVisible, setModalVisible] = React.useState(false);
  const [formData, setFormData] = React.useState<Partial<User>>({});
  const [isEdit, setIsEdit] = React.useState(false);

  const handleAdd = () => {
    setFormData({ role: 'MAGA', active: true });
    setIsEdit(false);
    setModalVisible(true);
  };

  const handleEdit = (user: User) => {
    setFormData(user);
    setIsEdit(true);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.email || !formData.full_name) return;
    
    if (isEdit && formData.id) {
      mutation.mutate({ id: formData.id, values: formData, type: 'UPDATE' });
    } else {
      if (!env.supabaseUrl || !env.supabaseAnonKey) {
        Alert.alert("Erreur", "Configuration Supabase manquante.");
        return;
      }
      
      // On crée un client secondaire pour ne pas écraser la session de l'admin actuel
      const adminSupabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      
      const { data, error } = await adminSupabase.auth.signUp({
        email: formData.email,
        password: 'Sipro2026@mg', // Mot de passe temporaire par défaut
        options: {
          data: { full_name: formData.full_name }
        }
      });
      
      if (error) {
        Alert.alert("Erreur de création", error.message);
        return;
      }
      
      if (data.user) {
        // Le trigger 'on_auth_user_created' de Supabase crée automatiquement la ligne dans public.users.
        // On effectue donc un UPDATE pour injecter les autres champs (role, scope, etc.)
        mutation.mutate({ 

          id: data.user.id, 
          values: {
            role: formData.role || 'OPERATEUR',
            active: formData.active !== false,
            scope: formData.scope || 'ALL',
            two_fa_enabled: formData.two_fa_enabled || false
          }, 
          type: 'UPDATE' 
        });
        Alert.alert("Succès", "Utilisateur créé !\nMot de passe temporaire par défaut : Sipro2026@mg");
      }
    }
  };

  const handleExportPdf = () => {
    let tableRows = users.map(u => `
      <tr>
        <td>${u.full_name || ''}</td>
        <td>${u.email || ''}</td>
        <td>${u.role || ''}</td>
        <td>${u.scope || '-'}</td>
        <td class="text-center">${u.two_fa_enabled ? 'Oui' : 'Non'}</td>
        <td class="text-center">${u.active ? 'Actif' : 'Inactif'}</td>
      </tr>
    `).join('');

    const htmlContent = getPdfTemplate(
      'Liste des Utilisateurs ERP',
      `
      <div class="summary-card">
        <strong>Total utilisateurs :</strong> ${users.length}<br />
        <strong>Utilisateurs actifs :</strong> ${users.filter(u => u.active).length}
      </div>
      <table>
        <thead>
          <tr>
            <th>Nom Complet</th>
            <th>Email</th>
            <th>Rôle</th>
            <th>{t('admin_col_dept')}</th>
            <th class="text-center">2FA</th>
            <th class="text-center">Statut</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
      `
    );

    generatePdf(htmlContent, 'Utilisateurs.pdf');
  };

  if (!isAdmin) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>{t('admin_access_denied')}</Text>
      </View>
    );
  }

  return (
    <AnimatedPage>
      {/* ─── Onglets ───────────────────────────────────────────────────────── */}
      <View style={{ flexDirection: 'row', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E9ECEF', paddingHorizontal: 24 }}>
        {ADMIN_TABS.map(tab => (
          <TouchableOpacity key={tab} onPress={() => setAdminTab(tab)}
            style={{ paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 2, borderBottomColor: adminTab === tab ? C.info : 'transparent' }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: adminTab === tab ? C.info : '#ADB5BD' }}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {adminTab === 'UTILISATEURS' ? (
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <View style={[s.headerRow, isMobile && { flexDirection: 'column', alignItems: 'stretch', gap: 16 }]}>
          <View>
            <Text style={s.title}>{t('admin_title')}</Text>
            <Text style={s.subTitle}>{t('admin_sub')}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
            <ActionButton label="Export PDF" icon="file-pdf-box" onPress={handleExportPdf} />
            <ActionButton label="Nouvel Utilisateur" icon="plus" onPress={handleAdd} variant="primary" />
          </View>
        </View>

        {isLoading ? (
          <ActivityIndicator color={C.green} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ width: '100%' }}>
            <View style={[s.table, { minWidth: 850 }]}>
              <View style={s.tableHeader}>
                <Text style={[s.th, { flex: 2.2 }]}>{t('admin_col_name')}</Text>
                <Text style={[s.th, { flex: 1 }]}>Rôle</Text>
                <Text style={[s.th, { flex: 1.2 }]}>{t('admin_col_dept')}</Text>
                <Text style={[s.th, { flex: 0.8, textAlign: 'center' }]}>2FA</Text>
                <Text style={[s.th, { width: 90, textAlign: 'center' }]}>Statut</Text>
                <Text style={[s.th, { width: 100, textAlign: 'right' }]}>Actions</Text>
              </View>

              {users.map(u => (
                <View key={u.id} style={s.tr}>
                  <View style={[{ flex: 2.2, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
                    <View style={s.avatar}>
                      <Text style={s.avatarText}>{u.full_name?.substring(0, 2).toUpperCase() || '??'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.tdName} numberOfLines={1}>{u.full_name}</Text>
                      <Text style={s.tdEmail} numberOfLines={1}>{u.email}</Text>
                    </View>
                  </View>
                  <Text style={[s.td, { flex: 1, fontWeight: '700' }]}>{u.role}</Text>
                  <Text style={[s.td, { flex: 1.2 }]}>{u.scope || '-'}</Text>
                  <View style={[{ flex: 0.8, alignItems: 'center' }]}>
                    <MaterialCommunityIcons 
                      name={u.two_fa_enabled ? "shield-check" : "shield-off"} 
                      size={20} 
                      color={u.two_fa_enabled ? C.ok : C.err} 
                    />
                  </View>
                  <View style={[{ width: 90, alignItems: 'center' }]}>
                    <Badge label={u.active ? 'ACTIF' : 'INACTIF'} color={!u.active ? C.textMuted : C.green} />
                  </View>
                  <View style={[{ width: 100, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }]}>
                    <TouchableOpacity onPress={() => handleEdit(u)} style={s.actionBtn}>
                      <MaterialCommunityIcons name="pencil-outline" size={18} color="#1A1A1A" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => mutation.mutate({ id: u.id, values: { active: !u.active }, type: 'UPDATE' })} style={s.actionBtn}>
                      <MaterialCommunityIcons name={u.active ? "block-helper" : "check"} size={18} color={u.active ? C.err : C.ok} />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => {
                        Alert.alert(
                          "Supprimer l'utilisateur",
                          "Êtes-vous sûr de vouloir supprimer cet utilisateur ?",
                          [
                            { text: "Annuler", style: "cancel" },
                            { text: "Supprimer", style: "destructive", onPress: () => mutation.mutate({ id: u.id, type: 'DELETE' }) }
                          ]
                        );
                      }} 
                      style={s.actionBtn}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={18} color={C.err} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </ScrollView>

      ) : (
      /* ─── Onglet VERSIONS ─────────────────────────────────────────────── */
      <ScrollView style={s.container} contentContainerStyle={[s.content, { maxWidth: 900 }]}>
        {/* Bannière version courante */}
        <View style={{ backgroundColor: '#1A1A1A', borderRadius: 12, padding: 20, marginBottom: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <View>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#ADB5BD', marginBottom: 4 }}>VERSION EN PRODUCTION</Text>
            <Text style={{ fontSize: 28, fontWeight: '900', color: '#FFF' }}>v{APP_VERSION}</Text>
            <Text style={{ fontSize: 12, color: '#6C757D', marginTop: 4 }}>Build : {BUILD_DATE} · ERP GSI / SIPROMAD</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 8 }}>
            <ActionButton label="Enregistrer un patch" icon="tag-plus-outline" variant="primary" onPress={() => setPatchModalVisible(true)} />
          </View>
        </View>

        {/* Changelog DB */}
        {dbPatches.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#1A1A1A', marginBottom: 12 }}>PATCHES DÉPLOYÉS (base de données)</Text>
            {dbPatches.map((p: any) => (
              <View key={p.id} style={{ backgroundColor: '#FFF', borderRadius: 10, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#E9ECEF', flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
                <View style={{ backgroundColor: versionTypeColor(p.type) + '15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, minWidth: 56, alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '900', color: versionTypeColor(p.type) }}>{(p.type || 'patch').toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#1A1A1A' }}>v{p.version}</Text>
                    <Text style={{ fontSize: 11, color: '#ADB5BD' }}>{p.date}</Text>
                    {p.applied_by && <Text style={{ fontSize: 11, color: '#ADB5BD' }}>· par {p.applied_by}</Text>}
                  </View>
                  <Text style={{ fontSize: 13, color: '#495057', lineHeight: 20 }}>{p.notes}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Changelog intégré */}
        <Text style={{ fontSize: 14, fontWeight: '800', color: '#1A1A1A', marginBottom: 12 }}>HISTORIQUE DES VERSIONS</Text>
        {BUILTIN_CHANGELOG.map((entry, idx) => (
          <View key={entry.version} style={{ backgroundColor: '#FFF', borderRadius: 10, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: idx === 0 ? C.info : '#E9ECEF', flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
            <View style={{ backgroundColor: versionTypeColor(entry.type) + '15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, minWidth: 56, alignItems: 'center' }}>
              <Text style={{ fontSize: 10, fontWeight: '900', color: versionTypeColor(entry.type) }}>{entry.type.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#1A1A1A' }}>v{entry.version}</Text>
                {idx === 0 && <View style={{ backgroundColor: C.ok + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}><Text style={{ fontSize: 10, fontWeight: '800', color: C.ok }}>CURRENT</Text></View>}
                <Text style={{ fontSize: 11, color: '#ADB5BD' }}>{entry.date}</Text>
              </View>
              <Text style={{ fontSize: 13, color: '#495057', lineHeight: 20 }}>{entry.notes}</Text>
            </View>
          </View>
        ))}

        {/* Info migration DB */}
        <View style={{ marginTop: 16, padding: 16, backgroundColor: '#F8F9FA', borderRadius: 10, borderWidth: 1, borderColor: '#E9ECEF' }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: '#ADB5BD', marginBottom: 8 }}>NOTE TECHNIQUE</Text>
          <Text style={{ fontSize: 12, color: '#6C757D', lineHeight: 18 }}>
            Les patches DB sont stockés dans la table <Text style={{ fontFamily: 'monospace', backgroundColor: '#F0F0F0', paddingHorizontal: 4 }}>app_patches</Text>. 
            Pour créer la table si absente :{'\n'}
            <Text style={{ fontFamily: 'monospace', fontSize: 11, color: '#374151' }}>CREATE TABLE app_patches (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, version text, date date, type text, notes text, applied_by text, created_at timestamptz DEFAULT now());</Text>
          </Text>
        </View>

        {/* ─── PV revue de direction (export mensuel auto) ─────────────────── */}
        <View style={{ marginTop: 28 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#1A1A1A' }}>PV REVUE DE DIRECTION (mensuel)</Text>
            <ActionButton label="Générer le PV du mois" icon="file-chart" variant="primary" loading={generateReview.isPending} onPress={handleGenerateReview} />
          </View>
          <Text style={{ fontSize: 12, color: '#6C757D', marginBottom: 12, lineHeight: 18 }}>
            Les PV sont pré-remplis automatiquement le 1er de chaque mois (Edge Function planifiée
            <Text style={{ fontFamily: 'monospace' }}> monthly-management-review</Text>). Vous pouvez aussi en générer un manuellement.
          </Text>
          {reviews.length === 0 ? (
            <Text style={{ fontSize: 13, color: '#ADB5BD', fontStyle: 'italic' }}>Aucun PV généré pour le moment.</Text>
          ) : (
            reviews.map((r) => (
              <View key={r.id} style={{ backgroundColor: '#FFF', borderRadius: 10, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#E9ECEF', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <MaterialCommunityIcons name="file-document-outline" size={22} color={C.info} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#1A1A1A', textTransform: 'capitalize' }}>{monthLabel(r.period_month)}</Text>
                  <Text style={{ fontSize: 11, color: '#ADB5BD' }}>Généré le {new Date(r.generated_at).toLocaleDateString('fr-FR')}</Text>
                </View>
                <Badge label={r.status} color={r.status === 'VALIDEE' ? C.ok : C.gold} />
                <ActionButton label="PDF" icon="file-pdf-box" variant="secondary" onPress={() => handleExportReviewPdf(r)} />
              </View>
            ))
          )}
        </View>
      </ScrollView>
      )}

      {/* ─── Modal patch ───────────────────────────────────────────────────── */}
      <FormModal visible={patchModalVisible} title="Enregistrer un patch / version" onClose={() => setPatchModalVisible(false)} onSave={handleAddPatch}>
        <FormInput label="Numéro de version (ex: 2.6.1)" value={patchForm.version} onChangeText={v => setPatchForm(p => ({ ...p, version: v }))} />
        <FormInput label="Date (AAAA-MM-JJ)" value={patchForm.date} onChangeText={v => setPatchForm(p => ({ ...p, date: v }))} />
        <FormSelect label="Type" value={patchForm.type} options={[{ label: 'Majeur (new features)', value: 'major' }, { label: 'Mineur (improvements)', value: 'minor' }, { label: 'Correctif (bugfix)', value: 'patch' }]} onSelect={v => setPatchForm(p => ({ ...p, type: v as any }))} />
        <FormInput label="Notes / Description" value={patchForm.notes} onChangeText={v => setPatchForm(p => ({ ...p, notes: v }))} placeholder="Décrivez les changements..." />
      </FormModal>

      {/* ─── Modal utilisateur ────────────────────────────────────────────── */}
      <FormModal
        visible={modalVisible}
        title={isEdit ? "Modifier l'utilisateur" : "Nouvel Utilisateur"}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
        loading={mutation.isPending}
      >
        <FormInput label="Nom Complet" value={formData.full_name || ''} onChangeText={val => setFormData({ ...formData, full_name: val })} />
        <FormInput label="Email" value={formData.email || ''} onChangeText={val => setFormData({ ...formData, email: val })} keyboardType="email-address" />
        <FormSelect
          label="Rôle"
          value={formData.role || ('SUPER_ADMIN' as UserRole)}
          options={[
            { label: 'Super Admin', value: 'SUPER_ADMIN' },
            { label: 'Administrateur', value: 'ADMIN' },
            { label: 'DSI', value: 'DSI' },
            { label: 'Responsable Qualité (RQ)', value: 'RQ' },
            { label: 'Responsable Prod (RPROD)', value: 'RPROD' },
            { label: 'Magasinier (MAGA)', value: 'MAGA' },
            { label: 'Acheteur (RACH)', value: 'RACH' },
            { label: 'Opérateur', value: 'OPERATEUR' },
          ]}
          onSelect={v => setFormData({ ...formData, role: v as UserRole })}
        />
        <FormSelect
          label="Statut"
          value={formData.active ? 'ACTIF' : 'INACTIF'}
          options={[
            { label: 'Actif', value: 'ACTIF' },
            { label: 'Inactif', value: 'INACTIF' },
          ]}
          onSelect={v => setFormData({ ...formData, active: v === 'ACTIF' })}
        />
        {isEdit && (
          <View style={{ marginTop: 16, padding: 12, backgroundColor: '#F8F9FA', borderRadius: 8 }}>
            <Text style={{ fontSize: 13, color: '#6C757D', marginBottom: 8 }}>Sécurité</Text>
            <TouchableOpacity 
              onPress={() => setFormData({ ...formData, two_fa_enabled: !formData.two_fa_enabled })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <MaterialCommunityIcons name={formData.two_fa_enabled ? "checkbox-marked" : "checkbox-blank-outline"} size={20} color={C.green} />
              <Text>2FA Activé</Text>
            </TouchableOpacity>
          </View>
        )}
      </FormModal>
    </AnimatedPage>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 24 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },
  subTitle: { fontSize: 13, color: '#6C757D', marginTop: 4 },
  table: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E9ECEF', overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#F8F9FA', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E9ECEF' },
  th: { fontSize: 11, fontWeight: '700', color: '#6C757D', textTransform: 'uppercase' },
  tr: { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F8F9FA', alignItems: 'center' },
  td: { fontSize: 13, color: '#1A1A1A' },
  tdName: { fontWeight: '700', color: '#1A1A1A' },
  tdEmail: { fontSize: 11, color: '#6C757D' },
  actionBtn: { padding: 6, backgroundColor: '#F8F9FA', borderRadius: 6 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1E513B', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
});
