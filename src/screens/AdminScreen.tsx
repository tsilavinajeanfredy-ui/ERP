import * as React from 'react';
import { ScrollView, StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Alert, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, ActionButton, AnimatedPage, FormModal, FormInput, FormSelect, Badge } from '../components/Ui';
import { useUserProfile, useMutation } from '../lib/hooks';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { env } from '../lib/env';
import { createClient } from '@supabase/supabase-js';
import type { User, UserRole } from '../lib/database.types';
import { generatePdf, getPdfTemplate } from '../lib/pdf';
import { useTranslation } from '../lib/i18n';

export function AdminScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const { profile } = useUserProfile();
  const isAdmin = profile?.role === 'ADMIN' || profile?.role === 'SUPER_ADMIN' || profile?.role === 'DSI';
  
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
