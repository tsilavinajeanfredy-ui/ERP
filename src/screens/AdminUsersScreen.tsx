import * as React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  useWindowDimensions,
  Alert,
  TouchableOpacity,
  Modal,
  Platform,
  Clipboard,
  TextInput,
  FlatList,
  Pressable,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  C,
  ActionButton,
  AnimatedPage,
  Badge,
  KpiCard,
  DataTable,
  FormModal,
  FormInput,
  FormSelect,
  SectionTitle,
  PaginationControls,
} from '../components/Ui';
import { useUsers, useMutation, usePermissions } from '../lib/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { env } from '../lib/env';
import { useSearch } from '../lib/search';
import { useTranslation } from '../lib/i18n';
import { UserRole } from '../lib/database.types';

const ROLES: { label: string; value: UserRole }[] = [
  { label: 'Administrateur', value: 'ADMIN' },
  { label: 'Direction (DPI)', value: 'DPI' },
  { label: 'Resp. Qualité (RQ)', value: 'RQ' },
  { label: 'Technicien Labo', value: 'TLAB' },
  { label: 'Resp. Production', value: 'RPROD' },
  { label: 'Magasinier', value: 'MAGA' },
  { label: 'Acheteur', value: 'RACH' },
  { label: 'Planificateur', value: 'PLAN' },
  { label: 'RH', value: 'RH' },
  { label: 'Comptabilité', value: 'COMPTA' },
];

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function invokeWithTimeout(
  fn: () => Promise<{ data: any; error: any }>,
  timeoutMs = 12000
): Promise<{ data: any; error: any }> {
  return Promise.race([
    fn(),
    new Promise<{ data: null; error: { message: string } }>((resolve) =>
      setTimeout(
        () => resolve({ data: null, error: { message: `Timeout dépassé (${timeoutMs / 1000}s). Vérifiez votre connexion.` } }),
        timeoutMs
      )
    ),
  ]);
}

// ─── SVG icons pour toast (sans emoji) ───────────────────────────────────────
const SVG_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const SVG_CROSS = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const SVG_INFO  = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';

// ─── Feedback web (remplace Alert.alert qui ne fonctionne pas sur web) ────────
function showWebFeedback(type: 'success' | 'error' | 'info', message: string) {
  if (Platform.OS !== 'web') {
    Alert.alert(type === 'success' ? 'Succès' : type === 'error' ? 'Erreur' : 'Info', message);
    return;
  }
  // Sur web : toast centré via overlay DOM
  const existing = document.getElementById('erp-toast-wrap');
  if (existing) existing.remove();

  const bg   = type === 'success' ? '#1E513B' : type === 'error' ? '#DC2626' : '#0D6EFD';
  const icon = type === 'success' ? SVG_CHECK  : type === 'error' ? SVG_CROSS  : SVG_INFO;

  const wrap = document.createElement('div');
  wrap.id = 'erp-toast-wrap';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;pointer-events:none;';

  const box = document.createElement('div');
  box.id = 'erp-toast-box';
  box.style.cssText = `background:${bg};color:#fff;padding:16px 22px;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.3);font-family:system-ui,sans-serif;font-size:14px;font-weight:600;display:flex;align-items:center;gap:12px;max-width:420px;min-width:220px;opacity:0;transform:scale(0.88);transition:opacity 0.25s ease,transform 0.25s ease;`;
  box.innerHTML = '<span style="flex-shrink:0;display:flex;align-items:center;">' + icon + '</span><span style="line-height:1.4;">' + message + '</span>';

  wrap.appendChild(box);
  document.body.appendChild(wrap);

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      box.style.opacity = '1';
      box.style.transform = 'scale(1)';
    });
  });

  // Animate out
  setTimeout(() => {
    box.style.opacity = '0';
    box.style.transform = 'scale(0.9)';
    setTimeout(() => wrap.remove(), 320);
  }, 3500);
}

function webConfirm(message: string): boolean {
  if (Platform.OS === 'web') return window.confirm(message);
  return false;
}

// ─── Role color mapping ───────────────────────────────────────────────────────
const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  ADMIN:  { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
  DPI:    { bg: '#F5F3FF', text: '#7C3AED', border: '#DDD6FE' },
  RQ:     { bg: '#FFF7ED', text: '#EA580C', border: '#FED7AA' },
  TLAB:   { bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0' },
  RPROD:  { bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE' },
  MAGA:   { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0' },
  RACH:   { bg: '#FDF4FF', text: '#9333EA', border: '#E9D5FF' },
  PLAN:   { bg: '#F0F9FF', text: '#0284C7', border: '#BAE6FD' },
  RH:     { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  COMPTA: { bg: '#F8FAFC', text: '#475569', border: '#CBD5E1' },
};

function getRoleStyle(role: string) {
  return ROLE_COLORS[role] || { bg: '#F8FAFC', text: '#475569', border: '#CBD5E1' };
}

function getAvatarColor(name: string): string {
  const colors = ['#1E513B', '#7C3AED', '#EA580C', '#0284C7', '#DC2626', '#9333EA', '#2563EB', '#15803D'];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

// ─────────────────────────────────────────────────────────────────────────────
export function AdminUsersScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 640;   // kept for modal
  const isTablet = width >= 640 && width < 1024;

  const { t } = useTranslation();
  const { searchQuery } = useSearch();
  const [page, setPage] = React.useState(0);
  const limit = 20;
  const queryClient = useQueryClient();

  const { data: users = [], count: usersCount, isPending: loading } = useUsers(page, limit);

  const [modalVisible, setModalVisible] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<any>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [formData, setFormData] = React.useState<any>({
    full_name: '', email: '', role: 'COMPTA' as UserRole,
    active: true, two_fa_enabled: false, scope: 'ALL',
  });

  const [selectedStatusFilter, setSelectedStatusFilter] = React.useState<string>('ALL');
  const [selectedRoleFilter, setSelectedRoleFilter] = React.useState<string>('ALL');

  const [customPassword, setCustomPassword] = React.useState('Sipro2026@mg');
  const [copiedPassword, setCopiedPassword] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  // ─── Modale de confirmation de suppression (remplace window.confirm bloqué) ─
  const [confirmModal, setConfirmModal] = React.useState<{
    visible: boolean;
    step: 1 | 2;
    user: any | null;
  }>({ visible: false, step: 1, user: null });

  // ─── Génération mot de passe ───────────────────────────────────────────────
  const generatePassword = () => {
    const up = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lo = 'abcdefghijklmnopqrstuvwxyz';
    const nu = '0123456789';
    const sp = '!@#$%^&*_+~';
    const all = up + lo + nu + sp;
    let pwd = up[Math.floor(Math.random() * up.length)]
      + lo[Math.floor(Math.random() * lo.length)]
      + nu[Math.floor(Math.random() * nu.length)]
      + sp[Math.floor(Math.random() * sp.length)];
    for (let i = 4; i < 12; i++) pwd += all[Math.floor(Math.random() * all.length)];
    setCustomPassword(pwd.split('').sort(() => 0.5 - Math.random()).join(''));
    setCopiedPassword(false);
  };

  const copyToClipboard = () => {
    Clipboard.setString(customPassword);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2000);
  };

  const mutation = useMutation('users', () => {
    setModalVisible(false);
    setEditingUser(null);
  });

  // deleteMutation removed — executeDelete calls supabase directly

  // ─── Filtrage ──────────────────────────────────────────────────────────────
  const filteredUsers = users.filter((u: any) => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
    const matchStatus = selectedStatusFilter === 'ALL'
      || (selectedStatusFilter === 'ACTIVE' && u.active)
      || (selectedStatusFilter === 'INACTIVE' && !u.active);
    const matchRole = selectedRoleFilter === 'ALL' || u.role === selectedRoleFilter;
    return matchSearch && matchStatus && matchRole;
  });

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleAdd = () => {
    setEditingUser(null);
    setFormData({ full_name: '', email: '', role: 'COMPTA', active: true, two_fa_enabled: false, scope: 'ALL' });
    generatePassword();
    setModalVisible(true);
  };

  const handleEdit = (user: any) => {
    setEditingUser(user);
    setFormData({
      full_name: user.full_name, email: user.email, role: user.role,
      active: user.active, two_fa_enabled: user.two_fa_enabled, scope: user.scope || 'ALL',
    });
    setModalVisible(true);
  };

  // ─── SAVE (create ou update) ───────────────────────────────────────────────
  const handleSave = async () => {
    if (!formData.full_name?.trim() || !formData.email?.trim()) {
      showWebFeedback('error', "Veuillez remplir le nom et l'email.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      showWebFeedback('error', 'Adresse email invalide.');
      return;
    }

    // ── UPDATE ───────────────────────────────────────────────────────────────
    if (editingUser) {
      // Note: changement d'email auth nécessite droits admin (Dashboard Supabase)
      // On met à jour uniquement public.users ici
      setIsSaving(true);
      mutation.mutate(
        {
          id: editingUser.id,
          values: {
            full_name: formData.full_name.trim(),
            email: formData.email.trim(),
            role: formData.role,
            active: formData.active,
            scope: formData.scope || 'ALL',
            two_fa_enabled: formData.two_fa_enabled,
          },
          type: 'UPDATE',
        },
        {
          onSuccess: () => {
            setIsSaving(false);
            queryClient.invalidateQueries({ queryKey: ['users'] });
            setModalVisible(false);
            setEditingUser(null);
            showWebFeedback('success', `Utilisateur "${formData.full_name}" mis à jour.`);
          },
          onError: (e: any) => {
            setIsSaving(false);
            showWebFeedback('error', e.message || 'Impossible de modifier l\'utilisateur.');
          },
        }
      );
      return;
    }

    // ── CREATE — via Edge Function manage-user (contourne la confirmation email) ──
    if (!supabase) { showWebFeedback('error', 'Client Supabase non initialisé.'); return; }

    setIsSaving(true);
    try {
      // Passer par l'Edge Function pour créer avec email_confirm: true
      // → le compte est immédiatement utilisable, pas besoin de cliquer le lien email
      const { data: fnResult, error: fnError } = await supabase.functions.invoke('manage-user', {
        body: {
          action: 'create',
          email: formData.email.trim(),
          full_name: formData.full_name.trim(),
          role: formData.role || 'COMPTA',
          active: formData.active !== false,
          scope: formData.scope || 'ALL',
          two_fa_enabled: formData.two_fa_enabled || false,
          password: customPassword,
        },
      });
      if (fnError) throw fnError;
      if (fnResult?.error) throw new Error(fnResult.error);

      await sleep(800);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setModalVisible(false);
      setEditingUser(null);
      showWebFeedback('success', `Compte créé pour ${formData.email}. Mot de passe : ${customPassword}`);
    } catch (err: any) {
      const msg = err.message || 'Impossible de créer le compte.';
      if (msg.includes('already registered') || msg.includes('existe déjà') || msg.includes('already been registered')) {
        showWebFeedback('error', 'Un compte existe déjà avec cette adresse email.');
      } else {
        showWebFeedback('error', msg);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // ─── DEACTIVATE / REACTIVATE ───────────────────────────────────────────────
  const handleDeactivate = (user: any) => {
    const action = user.active ? 'Désactiver' : 'Réactiver';
    const confirmMsg = `${action} "${user.full_name}" (${user.email}) ?`;

    const doAction = async () => {
      // Direct update sur public.users — pas besoin d'Edge Function pour activer/désactiver
      mutation.mutate(
        { id: user.id, values: { active: !user.active }, type: 'UPDATE' },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            showWebFeedback('success', `${user.full_name} : ${user.active ? 'désactivé' : 'réactivé'}.`);
          },
          onError: (e: any) => {
            showWebFeedback('error', `Erreur : ${e?.message || 'Impossible de modifier le statut.'}`);
          },
        }
      );
    };

    if (Platform.OS === 'web') {
      // Sur web, window.confirm est souvent bloqué — on exécute directement
      doAction();
    } else {
      Alert.alert(action, confirmMsg, [
        { text: 'Annuler', style: 'cancel' },
        { text: action, style: user.active ? 'destructive' : 'default', onPress: doAction },
      ]);
    }
  };

  // ─── DELETE — appel Supabase direct (évite Alert.alert bloquant du hook) ────
  const executeDelete = async (user: any) => {
    if (!supabase) { showWebFeedback('error', 'Client Supabase non initialisé.'); return; }
    setDeletingId(user.id);
    try {
      // ── Libérer les FK avant suppression ──────────────────────────────────
      // instruments.owner_id → NULL pour éviter la contrainte FK
      const { error: fkError } = await supabase
        .from('instruments')
        .update({ owner_id: null })
        .eq('owner_id', user.id);
      if (fkError) console.warn('instruments owner_id nullify warning:', fkError.message);

      // ── Suppression via Edge Function manage-user ──────────────────────────
      // IMPORTANT : supprimer uniquement public.users laisse auth.users intact.
      // Le trigger Supabase recrée alors public.users au prochain événement auth,
      // ce qui fait "réapparaître" l'utilisateur. On passe par l'Edge Function
      // qui supprime les deux (public.users EN PREMIER, puis auth.users).
      const { data: fnResult, error: fnError } = await supabase.functions.invoke('manage-user', {
        body: {
          action: 'delete',
          auth_id: user.auth_id,   // supprime auth.users (et donc public.users via cascade)
          user_id: user.id,        // fallback si auth_id absent
        },
      });
      if (fnError) throw fnError;
      if (fnResult?.error) throw new Error(fnResult.error);

      // ── Log audit : tracer la suppression ──────────────────────────────────
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const currentUserId = session?.user?.id
          ? (await supabase.from('users').select('id').eq('auth_id', session.user.id).single()).data?.id
          : null;

        await supabase.from('audit_log').insert({
          table_name: 'users',
          record_id: user.id,
          action: 'DELETE',
          old_data: {
            id: user.id,
            full_name: user.full_name,
            email: user.email,
            role: user.role,
            active: user.active,
            scope: user.scope,
          },
          new_data: null,
          ...(currentUserId ? { user_id: currentUserId } : {}),
        });
      } catch (auditErr) {
        // Ne pas bloquer l'UX si le log échoue — juste tracer en console
        console.warn('Audit log DELETE failed:', auditErr);
      }
      // ───────────────────────────────────────────────────────────────────────

      queryClient.invalidateQueries({ queryKey: ['users'] });
      showWebFeedback('success', `"${user.full_name || user.email}" supprimé.`);
    } catch (e: any) {
      console.error('executeDelete error:', e);
      showWebFeedback('error', `Erreur suppression : ${e?.message || 'Erreur inconnue'}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDelete = (user: any) => {
    if (Platform.OS !== 'web') {
      const msg1 = `Supprimer "${user.full_name || user.email}" ?\n\nCette action est irréversible.`;
      Alert.alert('Supprimer ' + (user.full_name || user.email) + ' ?', msg1, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => executeDelete(user) },
      ]);
    } else {
      // Sur web : modale personnalisée (window.confirm est bloqué dans beaucoup de contextes)
      setConfirmModal({ visible: true, step: 1, user });
    }
  };

  // ─── KPI counts ───────────────────────────────────────────────────────────
  const totalUsers   = users.length;
  const activeUsers  = users.filter((u: any) => u.active).length;
  const twoFaUsers   = users.filter((u: any) => u.two_fa_enabled).length;
  const adminCount   = users.filter((u: any) => u.role === 'ADMIN').length;

  // ─── Responsive layout ───────────────────────────────────────────────────
  // mobile  < 640 → cards stacked
  // tablet  640–1024 → table compact (no scope/2fa)
  // desktop > 1024 → table full

  const isCard = width < 640;
  const isCompact = width >= 640 && width < 1024;
  const tableNeedsScroll = isCompact || width < 900;

  // ── Mobile Card ────────────────────────────────────────────────────────────
  const renderCard = ({ item, index }: { item: any; index: number }) => {
    const initials = (item.full_name || item.email || '?')
      .split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase() || '').join('');
    const avatarColor = getAvatarColor(item.full_name || item.email);
    const isDeleting = deletingId === item.id;
    const roleStyle = getRoleStyle(item.role);

    return (
      <View style={[styles.card, !item.active && styles.cardInactive]}>
        {/* Top row */}
        <View style={styles.cardTop}>
          <View style={[styles.avatarMd, { backgroundColor: avatarColor }]}>
            <Text style={styles.avatarMdText}>{initials}</Text>
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={2}>{item.full_name || '—'}</Text>
            <Text style={styles.cardEmail}>{item.email}</Text>
          </View>
          <View style={[styles.statusPill, item.active ? styles.statusActive : styles.statusInactive]}>
            <View style={[styles.statusDot, { backgroundColor: item.active ? '#6EE7B7' : '#D1D5DB' }]} />
            <Text style={[styles.statusPillText, { color: item.active ? '#FFF' : '#6B7280' }]}>
              {item.active ? 'ACTIF' : 'INACTIF'}
            </Text>
          </View>
        </View>

        {/* Tags row */}
        <View style={styles.cardTags}>
          <View style={[styles.rolePill, { backgroundColor: roleStyle.bg, borderColor: roleStyle.border }]}>
            <Text style={[styles.rolePillText, { color: roleStyle.text }]}>{item.role}</Text>
          </View>
          <View style={styles.scopeTag}>
            <Text style={styles.scopeTagText}>{item.scope || 'ALL'}</Text>
          </View>
          {item.two_fa_enabled && (
            <View style={styles.shieldTag}>
              <MaterialCommunityIcons name="shield-check" size={11} color="#7C3AED" />
              <Text style={styles.shieldTagText}>2FA</Text>
            </View>
          )}
        </View>

        {/* Action row */}
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.cardActionBtn} onPress={() => handleEdit(item)}>
            <MaterialCommunityIcons name="pencil-outline" size={15} color="#6B7280" />
            <Text style={styles.cardActionText}>Modifier</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.cardActionBtn, styles.cardActionWarn]} onPress={() => handleDeactivate(item)}>
            <MaterialCommunityIcons
              name={item.active ? 'cancel' : 'play-circle-outline'}
              size={15}
              color={item.active ? '#DC2626' : '#10B981'}
            />
            <Text style={[styles.cardActionText, { color: item.active ? '#DC2626' : '#10B981' }]}>
              {item.active ? 'Désactiver' : 'Réactiver'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.cardActionBtn, styles.cardActionDanger]}
            onPress={() => handleDelete(item)}
            disabled={isDeleting}
          >
            {isDeleting
              ? <ActivityIndicator size="small" color="#DC2626" />
              : <MaterialCommunityIcons name="trash-can-outline" size={15} color="#DC2626" />
            }
            <Text style={[styles.cardActionText, { color: '#DC2626' }]}>Supprimer</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ── Desktop/Tablet Table ───────────────────────────────────────────────────
  const renderTableHeader = () => (
    <View style={[styles.tableRow, styles.tableHeaderRow]}>
      <View style={[styles.tableCell, styles.colName]}>
        <Text style={styles.tableHeadText}>NOM / EMAIL</Text>
      </View>
      <View style={[styles.tableCell, styles.colRole]}>
        <Text style={styles.tableHeadText}>RÔLE</Text>
      </View>
      {!isCompact && (
        <View style={[styles.tableCell, styles.colScope]}>
          <Text style={styles.tableHeadText}>PORTÉE</Text>
        </View>
      )}
      {!isCompact && (
        <View style={[styles.tableCell, styles.col2fa]}>
          <Text style={[styles.tableHeadText, { textAlign: 'center' }]}>2FA</Text>
        </View>
      )}
      <View style={[styles.tableCell, styles.colStatus]}>
        <Text style={[styles.tableHeadText, { textAlign: 'center' }]}>STATUT</Text>
      </View>
      <View style={[styles.tableCell, styles.colActions]}>
        <Text style={[styles.tableHeadText, { textAlign: 'center' }]}>ACTIONS</Text>
      </View>
    </View>
  );

  const renderTableRow = ({ item, index }: { item: any; index: number }) => {
    const initials = (item.full_name || item.email || '?')
      .split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase() || '').join('');
    const avatarColor = getAvatarColor(item.full_name || item.email);
    const isDeleting = deletingId === item.id;
    const roleStyle = getRoleStyle(item.role);

    return (
      <View style={[
        styles.tableRow,
        styles.tableDataRow,
        index % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd,
        !item.active && { opacity: 0.55 },
      ]}>
        {/* NOM / EMAIL — flexible, ne coupe plus */}
        <View style={[styles.tableCell, styles.colName, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
          <View style={[styles.avatarSmall, { backgroundColor: avatarColor, flexShrink: 0 }]}>
            <Text style={styles.avatarSmallText}>{initials}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.tdName} numberOfLines={2}>{item.full_name || '—'}</Text>
            <Text style={styles.tdEmail} numberOfLines={1} ellipsizeMode="tail">{item.email}</Text>
          </View>
        </View>

        {/* RÔLE */}
        <View style={[styles.tableCell, styles.colRole]}>
          <View style={[styles.rolePill, { backgroundColor: roleStyle.bg, borderColor: roleStyle.border }]}>
            <Text style={[styles.rolePillText, { color: roleStyle.text }]}>{item.role}</Text>
          </View>
        </View>

        {/* PORTÉE */}
        {!isCompact && (
          <View style={[styles.tableCell, styles.colScope]}>
            <Text style={styles.tdDept}>{item.scope || 'ALL'}</Text>
          </View>
        )}

        {/* 2FA */}
        {!isCompact && (
          <View style={[styles.tableCell, styles.col2fa, { alignItems: 'center' }]}>
            <MaterialCommunityIcons
              name={item.two_fa_enabled ? 'shield-check' : 'shield-off-outline'}
              size={18}
              color={item.two_fa_enabled ? '#7C3AED' : '#D1D5DB'}
            />
          </View>
        )}

        {/* STATUT */}
        <View style={[styles.tableCell, styles.colStatus, { alignItems: 'center' }]}>
          <View style={[styles.statusPill, item.active ? styles.statusActive : styles.statusInactive]}>
            <View style={[styles.statusDot, { backgroundColor: item.active ? '#6EE7B7' : '#D1D5DB' }]} />
            <Text style={[styles.statusPillText, { color: item.active ? '#FFF' : '#6B7280' }]}>
              {item.active ? 'ACTIF' : 'INACTIF'}
            </Text>
          </View>
        </View>

        {/* ACTIONS */}
        <View style={[styles.tableCell, styles.colActions, { flexDirection: 'row', justifyContent: 'center', gap: 6 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => handleEdit(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons name="pencil-outline" size={16} color="#6B7280" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, styles.iconBtnWarn]} onPress={() => handleDeactivate(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons name={item.active ? 'cancel' : 'play-circle-outline'} size={16} color={item.active ? '#DC2626' : '#10B981'} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, styles.iconBtnDanger]}
            onPress={() => handleDelete(item)}
            disabled={isDeleting}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {isDeleting
              ? <ActivityIndicator size="small" color="#DC2626" />
              : <MaterialCommunityIcons name="trash-can-outline" size={16} color="#DC2626" />
            }
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F6F8' }}>
        <ActivityIndicator size="large" color={C.green} />
        <Text style={{ marginTop: 12, color: '#6B7280', fontSize: 13 }}>Chargement des utilisateurs…</Text>
      </View>
    );
  }

  return (
    <AnimatedPage>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

        {/* ── KPI Cards ──────────────────────────────────────────────── */}
        <View style={[styles.kpiRow, isMobile && styles.kpiRowMobile]}>
          {[
            { label: 'Total', value: String(totalUsers), icon: 'account-group', color: '#1E513B' },
            { label: 'Actifs', value: String(activeUsers), icon: 'account-check', color: '#10B981' },
            { label: '2FA activé', value: String(twoFaUsers), icon: 'shield-check', color: '#7C3AED' },
            { label: 'Admins', value: String(adminCount), icon: 'shield-crown', color: '#DC2626' },
          ].map((k) => (
            <View key={k.label} style={[styles.kpiCard, isMobile && styles.kpiCardMobile]}>
              <View style={[styles.kpiIcon, { backgroundColor: k.color + '18' }]}>
                <MaterialCommunityIcons name={k.icon as any} size={20} color={k.color} />
              </View>
              <View>
                <Text style={styles.kpiValue}>{k.value}</Text>
                <Text style={styles.kpiLabel}>{k.label}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Header ────────────────────────────────────────────────── */}
        <View style={[styles.headerSection, isMobile && styles.headerSectionMobile]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Gestion des Utilisateurs</Text>
            <Text style={styles.subtitle}>
              {filteredUsers.length} utilisateur{filteredUsers.length !== 1 ? 's' : ''} · {activeUsers} actif{activeUsers !== 1 ? 's' : ''}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <TouchableOpacity style={styles.addButton} onPress={handleAdd} activeOpacity={0.85}>
              <MaterialCommunityIcons name="plus" size={17} color="#FFF" />
              <Text style={styles.addButtonText}>Ajouter</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Filtres ───────────────────────────────────────────────── */}
        <View style={styles.filtersRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
            {[
              { label: 'Tous', value: 'ALL' },
              { label: 'Actifs', value: 'ACTIVE' },
              { label: 'Inactifs', value: 'INACTIVE' },
            ].map((f) => (
              <TouchableOpacity
                key={f.value}
                style={[styles.chip, selectedStatusFilter === f.value && styles.chipActive]}
                onPress={() => setSelectedStatusFilter(f.value)}
              >
                <Text style={[styles.chipText, selectedStatusFilter === f.value && styles.chipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.chipDivider} />
            {['ALL', ...ROLES.map(r => r.value)].map((rv) => {
              const lbl = rv === 'ALL' ? 'Tous rôles' : rv;
              return (
                <TouchableOpacity
                  key={rv}
                  style={[styles.chip, selectedRoleFilter === rv && styles.chipActive]}
                  onPress={() => setSelectedRoleFilter(rv)}
                >
                  <Text style={[styles.chipText, selectedRoleFilter === rv && styles.chipTextActive]}>{lbl}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Liste users : cards mobile / table desktop ─────────── */}
        {isCard ? (
          /* ── MOBILE : cards empilées ── */
          <View style={styles.cardList}>
            {filteredUsers.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="account-off-outline" size={52} color="#D1D5DB" />
                <Text style={styles.emptyTitle}>Aucun utilisateur trouvé</Text>
                <Text style={styles.emptySubtitle}>Modifiez les filtres ou ajoutez un utilisateur</Text>
              </View>
            ) : (
              <FlatList
                data={filteredUsers}
                renderItem={renderCard}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              />
            )}
          </View>
        ) : (
          /* ── TABLETTE / DESKTOP : table full width ── */
          <ScrollView
            horizontal={tableNeedsScroll}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={tableNeedsScroll ? { minWidth: 760 } : undefined}
          >
            <View style={styles.tableCard}>
              {renderTableHeader()}
              {filteredUsers.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons name="account-off-outline" size={52} color="#D1D5DB" />
                  <Text style={styles.emptyTitle}>Aucun utilisateur trouvé</Text>
                  <Text style={styles.emptySubtitle}>Modifiez les filtres ou ajoutez un utilisateur</Text>
                </View>
              ) : (
                <FlatList
                  data={filteredUsers}
                  renderItem={renderTableRow}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                />
              )}
            </View>
          </ScrollView>
        )}

        {/* ── Pagination ────────────────────────────────────────────── */}
        <PaginationControls
          currentPage={page}
          limit={limit}
          totalItems={usersCount || 0}
          onPageChange={setPage}
        />

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Modal Ajout / Édition ──────────────────────────────────── */}
      <Modal
        visible={modalVisible}
        animationType={isMobile ? 'slide' : 'fade'}
        transparent
        onRequestClose={() => !isSaving && setModalVisible(false)}
      >
        <View style={[styles.modalOverlay, !isMobile && styles.modalOverlayCentered]}>
          <View style={[styles.modalContent, !isMobile && styles.modalContentDesktop]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={styles.modalIconBadge}>
                    <MaterialCommunityIcons
                      name={editingUser ? 'account-edit' : 'account-plus'}
                      size={20} color="#1E513B"
                    />
                  </View>
                  <View>
                    <Text style={styles.modalTitle}>
                      {editingUser ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}
                    </Text>
                    <Text style={styles.modalSubtitle}>
                      {editingUser ? editingUser.email : 'Remplissez les informations ci-dessous'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => !isSaving && setModalVisible(false)} style={styles.closeBtn}>
                  <MaterialCommunityIcons name="close" size={22} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {/* Form */}
              <View style={styles.formContainer}>
                <View style={[styles.formRow, !isMobile && { flexDirection: 'row', gap: 12 }]}>
                  <View style={{ flex: 1 }}>
                    <FormInput
                      label="Nom complet *"
                      placeholder="Jean Dupont"
                      value={formData.full_name}
                      onChangeText={(text: string) => setFormData({ ...formData, full_name: text })}
                      editable={!isSaving}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FormInput
                      label="Email *"
                      placeholder="jean@sipro.mg"
                      value={formData.email}
                      onChangeText={(text: string) => setFormData({ ...formData, email: text })}
                      keyboardType="email-address"
                      editable={!isSaving && !editingUser}
                    />
                  </View>
                </View>

                <View style={[styles.formRow, !isMobile && { flexDirection: 'row', gap: 12 }]}>
                  <View style={{ flex: 1 }}>
                    <FormSelect
                      label="Rôle *"
                      value={formData.role}
                      options={ROLES}
                      onSelect={(role: string) => setFormData({ ...formData, role })}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FormSelect
                      label="Portée d'accès"
                      value={formData.scope}
                      options={[
                        { label: 'Tous les modules', value: 'ALL' },
                        { label: 'Production', value: 'PROD' },
                        { label: 'Qualité', value: 'QA' },
                        { label: 'Achats', value: 'ACHATS' },
                      ]}
                      onSelect={(scope: string) => setFormData({ ...formData, scope })}
                    />
                  </View>
                </View>

                {/* Mot de passe (création uniquement) */}
                {!editingUser && (
                  <View style={styles.passwordSection}>
                    <Text style={styles.sectionLabel}>Mot de passe temporaire</Text>
                    <View style={styles.passwordRow}>
                      <TextInput
                        style={styles.passwordInput}
                        value={customPassword}
                        editable={false}
                        selectTextOnFocus
                      />
                      <TouchableOpacity style={styles.pwdActionBtn} onPress={copyToClipboard}>
                        <MaterialCommunityIcons
                          name={copiedPassword ? 'check-circle' : 'content-copy'}
                          size={16} color={copiedPassword ? '#10B981' : '#6B7280'}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.pwdActionBtn, { backgroundColor: '#1E513B' }]} onPress={generatePassword}>
                        <MaterialCommunityIcons name="refresh" size={16} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                    {copiedPassword && (
                      <Text style={{ fontSize: 11, color: '#10B981', marginTop: 4 }}>✓ Copié dans le presse-papier</Text>
                    )}
                  </View>
                )}

                {/* Toggles */}
                <View style={styles.togglesRow}>
                  <View style={styles.toggleItem}>
                    <View>
                      <Text style={styles.toggleLabel}>Compte actif</Text>
                      <Text style={styles.toggleHint}>L'utilisateur peut se connecter</Text>
                    </View>
                    <Pressable
                      style={[styles.toggle, formData.active && styles.toggleOn]}
                      onPress={() => setFormData({ ...formData, active: !formData.active })}
                    >
                      <View style={[styles.toggleThumb, formData.active && styles.toggleThumbOn]} />
                    </Pressable>
                  </View>

                  <View style={styles.toggleItem}>
                    <View>
                      <Text style={styles.toggleLabel}>Authentification 2FA</Text>
                      <Text style={styles.toggleHint}>Double authentification requise</Text>
                    </View>
                    <Pressable
                      style={[styles.toggle, formData.two_fa_enabled && styles.toggleOn]}
                      onPress={() => setFormData({ ...formData, two_fa_enabled: !formData.two_fa_enabled })}
                    >
                      <View style={[styles.toggleThumb, formData.two_fa_enabled && styles.toggleThumbOn]} />
                    </Pressable>
                  </View>
                </View>
              </View>

              {/* Footer */}
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setModalVisible(false)}
                  disabled={isSaving}
                >
                  <Text style={styles.cancelButtonText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, isSaving && { opacity: 0.65 }]}
                  onPress={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <><ActivityIndicator size="small" color="#FFF" /><Text style={styles.saveButtonText}>En cours…</Text></>
                  ) : (
                    <>
                      <MaterialCommunityIcons name={editingUser ? 'content-save-outline' : 'account-plus-outline'} size={16} color="#FFF" />
                      <Text style={styles.saveButtonText}>{editingUser ? 'Mettre à jour' : 'Créer le compte'}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Modale de confirmation de suppression ─────────────────────── */}
      <Modal
        visible={confirmModal.visible}
        animationType="fade"
        transparent
        onRequestClose={() => setConfirmModal({ visible: false, step: 1, user: null })}
      >
        <View style={[styles.modalOverlay, styles.modalOverlayCentered]}>
          <View style={[styles.modalContent, { maxWidth: 420, padding: 0, overflow: 'hidden' }]}>
            {/* Header danger */}
            <View style={{ backgroundColor: '#FEF2F2', padding: 20, borderBottomWidth: 1, borderBottomColor: '#FECACA', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="trash-can-outline" size={20} color="#FFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#991B1B' }}>
                  {confirmModal.step === 1 ? 'Supprimer cet utilisateur ?' : 'Confirmer la suppression'}
                </Text>
                <Text style={{ fontSize: 12, color: '#DC2626', marginTop: 2 }}>
                  {confirmModal.step === 1 ? 'Cette action est irréversible' : 'Dernière confirmation requise'}
                </Text>
              </View>
            </View>

            {/* Body */}
            <View style={{ padding: 20 }}>
              {confirmModal.step === 1 ? (
                <>
                  <Text style={{ fontSize: 14, color: '#374151', lineHeight: 22 }}>
                    Vous êtes sur le point de supprimer l'utilisateur :
                  </Text>
                  <View style={{ marginTop: 12, padding: 14, backgroundColor: '#F9FAFB', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB' }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>
                      {confirmModal.user?.full_name || '—'}
                    </Text>
                    <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>
                      {confirmModal.user?.email}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#EFF6FF', borderRadius: 6 }}>
                        <Text style={{ fontSize: 11, color: '#2563EB', fontWeight: '600' }}>{confirmModal.user?.role}</Text>
                      </View>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: confirmModal.user?.active ? '#F0FDF4' : '#F3F4F6', borderRadius: 6 }}>
                        <Text style={{ fontSize: 11, color: confirmModal.user?.active ? '#16A34A' : '#6B7280', fontWeight: '600' }}>
                          {confirmModal.user?.active ? 'ACTIF' : 'INACTIF'}
                        </Text>
                      </View>
                    </View>
                  </View>
                </>
              ) : (
                <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#DC2626" />
                  <Text style={{ fontSize: 14, color: '#374151', textAlign: 'center', marginTop: 12, lineHeight: 22 }}>
                    Supprimer définitivement{'\n'}
                    <Text style={{ fontWeight: '700', color: '#111827' }}>
                      {confirmModal.user?.full_name || confirmModal.user?.email}
                    </Text>
                    {'\n'}et toutes ses données associées ?
                  </Text>
                </View>
              )}
            </View>

            {/* Footer */}
            <View style={{ flexDirection: 'row', gap: 10, padding: 16, paddingTop: 0 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center' }}
                onPress={() => setConfirmModal({ visible: false, step: 1, user: null })}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#DC2626', alignItems: 'center' }}
                onPress={() => {
                  if (confirmModal.step === 1) {
                    setConfirmModal(prev => ({ ...prev, step: 2 }));
                  } else {
                    const user = confirmModal.user;
                    setConfirmModal({ visible: false, step: 1, user: null });
                    executeDelete(user);
                  }
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                  {confirmModal.step === 2 && (
                    <MaterialCommunityIcons name="trash-can-outline" size={16} color="#FFF" />
                  )}
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>
                    {confirmModal.step === 1 ? 'Continuer' : 'Supprimer définitivement'}
                  </Text>
                  {confirmModal.step === 1 && (
                    <MaterialCommunityIcons name="arrow-right" size={16} color="#FFF" />
                  )}
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </AnimatedPage>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES RESPONSIVE
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },

  // ── KPI ────────────────────────────────────────────────────────────────────
  kpiRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, flexWrap: 'wrap' },
  kpiRowMobile: {},
  kpiCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFF', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#E9ECEF', flex: 1, minWidth: 130,
    ...Platform.select({ web: { boxShadow: '0px 2px 4px rgba(0,0,0,0.04)' }, default: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4 } }), elevation: 1,
  },
  kpiCardMobile: { flexBasis: '45%' },
  kpiIcon: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  kpiValue: { fontSize: 22, fontWeight: '800', color: '#111827' },
  kpiLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },

  // ── Page header ─────────────────────────────────────────────────────────────
  headerSection: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 10, flexWrap: 'wrap',
  },
  headerSectionMobile: {},
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  addButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1E513B', paddingVertical: 9, paddingHorizontal: 14,
    borderRadius: 8, ...Platform.select({ web: { boxShadow: '0px 2px 6px rgba(0,0,0,0.3)' }, default: { shadowColor: '#1E513B', shadowOpacity: 0.3, shadowRadius: 6 } }), elevation: 3,
  },
  addButtonText: { color: '#FFF', fontWeight: '700', fontSize: 13 },

  // ── Filters ────────────────────────────────────────────────────────────────
  filtersRow: { paddingHorizontal: 16, marginBottom: 12 },
  chip: {
    paddingHorizontal: 11, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFF',
  },
  chipActive: { backgroundColor: '#1E513B', borderColor: '#1E513B' },
  chipText: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  chipTextActive: { color: '#FFF' },
  chipDivider: { width: 1, backgroundColor: '#E9ECEF', marginHorizontal: 4 },

  // ── Mobile cards ──────────────────────────────────────────────────────────
  cardList: { paddingHorizontal: 12, paddingBottom: 8 },
  card: {
    backgroundColor: '#FFF', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#E9ECEF',
    ...Platform.select({ web: { boxShadow: '0px 2px 6px rgba(0,0,0,0.05)' }, default: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6 } }), elevation: 2,
  },
  cardInactive: { opacity: 0.55 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  cardInfo: { flex: 1, minWidth: 0 },
  cardName: { fontSize: 14, fontWeight: '700', color: '#111827', flexWrap: 'wrap' },
  cardEmail: { fontSize: 12, color: '#6B7280', marginTop: 2, flexWrap: 'wrap' },
  cardTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  cardActions: {
    flexDirection: 'row', gap: 8, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  cardActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 8, borderRadius: 8, backgroundColor: '#F3F4F6',
  },
  cardActionWarn: { backgroundColor: '#FFF7F7' },
  cardActionDanger: { backgroundColor: '#FFF7F7' },
  cardActionText: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  scopeTag: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    backgroundColor: '#F0F9FF', borderWidth: 1, borderColor: '#BAE6FD',
  },
  scopeTagText: { fontSize: 10, fontWeight: '700', color: '#0284C7' },
  shieldTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
    backgroundColor: '#F5F3FF', borderWidth: 1, borderColor: '#DDD6FE',
  },
  shieldTagText: { fontSize: 10, fontWeight: '700', color: '#7C3AED' },

  // Avatar mobile card
  avatarMd: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarMdText: { color: '#FFF', fontWeight: '800', fontSize: 14 },

  // ── Table (tablet / desktop) ──────────────────────────────────────────────
  tableCard: {
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: '#FFF', borderRadius: 12,
    borderWidth: 1, borderColor: '#E9ECEF', overflow: 'hidden',
    ...Platform.select({ web: { boxShadow: '0px 2px 8px rgba(0,0,0,0.04)' }, default: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8 } }), elevation: 2,
    // table fills available width — rows use flex so no scroll needed
    alignSelf: 'stretch',
  },
  tableRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  tableHeaderRow: {
    backgroundColor: '#F9FAFB', borderBottomWidth: 1, borderBottomColor: '#E9ECEF', minHeight: 42,
  },
  tableDataRow: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6', minHeight: 64 },
  tableRowEven: { backgroundColor: '#FFF' },
  tableRowOdd:  { backgroundColor: '#FAFBFC' },
  tableCell: { paddingHorizontal: 10, paddingVertical: 10, justifyContent: 'center' },
  tableHeadText: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.8, textTransform: 'uppercase' },

  // Columns — flex fills 100% of parent width
  colName:    { flex: 4, minWidth: 0 },     // biggest: nom + email complets
  colRole:    { flex: 1.4, minWidth: 0 },
  colScope:   { flex: 1.2, minWidth: 0 },
  col2fa:     { flex: 0.6, minWidth: 0 },
  colStatus:  { flex: 1.2, minWidth: 0 },
  colActions: { flex: 1.4, minWidth: 0 },

  // Avatar in table
  avatarSmall: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  avatarSmallText: { color: '#FFF', fontWeight: '800', fontSize: 12 },

  // Cell text
  tdName:  { fontSize: 13, fontWeight: '700', color: '#111827' },
  tdEmail: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  tdDept:  { fontSize: 11, color: '#6B7280', fontWeight: '500' },

  // Role pill
  rolePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1, alignSelf: 'flex-start' },
  rolePillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },

  // Status pill
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, alignSelf: 'center' },
  statusActive:   { backgroundColor: '#1E513B' },
  statusInactive: { backgroundColor: '#E5E7EB' },
  statusDot:   { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },

  // Icon buttons (table)
  iconBtn: { width: 30, height: 30, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' },
  iconBtnWarn:   { backgroundColor: '#FFF7F7' },
  iconBtnDanger: { backgroundColor: '#FFF7F7' },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 56, gap: 8 },
  emptyTitle:    { fontSize: 15, color: '#6B7280', fontWeight: '700' },
  emptySubtitle: { fontSize: 12, color: '#9CA3AF' },

  // ── Modal ─────────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
  },
  modalOverlayCentered: { justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: {
    backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32,
    maxHeight: Platform.OS === 'web' ? '90vh' as any : '95%',
  },
  modalContentDesktop: {
    borderRadius: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    width: '100%', maxWidth: 640,
    ...Platform.select({ web: { boxShadow: '0px 2px 20px rgba(0,0,0,0.2)' }, default: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20 } }), elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  modalIconBadge: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: '#F0FDF4',
    justifyContent: 'center', alignItems: 'center',
  },
  modalTitle:    { fontSize: 16, fontWeight: '800', color: '#111827' },
  modalSubtitle: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  closeBtn: { padding: 6, borderRadius: 8, backgroundColor: '#F3F4F6' },

  formContainer: { gap: 0, marginBottom: 8 },
  formRow: { marginBottom: 4 },

  // Password
  passwordSection: { marginVertical: 8, gap: 8 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 },
  passwordRow: { flexDirection: 'row', gap: 6 },
  passwordInput: {
    flex: 1, backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#E9ECEF',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 12, fontFamily: Platform.select({ web: 'monospace', default: 'Courier New' }),
    color: '#1F2937',
  },
  pwdActionBtn: {
    width: 38, height: 38, borderRadius: 8, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E9ECEF',
  },

  // Toggles
  togglesRow: {
    gap: 14, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: '#F3F4F6', marginTop: 8,
  },
  toggleItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleLabel: { fontSize: 13, fontWeight: '600', color: '#1F2937' },
  toggleHint:  { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  toggle: { width: 46, height: 26, borderRadius: 13, backgroundColor: '#E9ECEF', justifyContent: 'center', paddingHorizontal: 2 },
  toggleOn: { backgroundColor: '#1E513B' },
  toggleThumb:   { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFF', alignSelf: 'flex-start', ...Platform.select({ web: { boxShadow: '0px 2px 2px rgba(0,0,0,0.15)' }, default: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2 } }), elevation: 2 },
  toggleThumbOn: { alignSelf: 'flex-end' },

  // Footer
  modalFooter: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelButton: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center' },
  cancelButtonText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  saveButton: {
    flex: 2, flexDirection: 'row', paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#1E513B', alignItems: 'center', justifyContent: 'center', gap: 6,
    ...Platform.select({ web: { boxShadow: '0px 2px 6px rgba(0,0,0,0.3)' }, default: { shadowColor: '#1E513B', shadowOpacity: 0.3, shadowRadius: 6 } }), elevation: 3,
  },
  saveButtonText: { fontSize: 14, fontWeight: '700', color: '#FFF' },

  // Legacy stubs
  statsGrid: {}, statCard: {}, statValue: {}, statLabel: {},
  filterSection: {}, listContent: {}, userCard: {}, userCardInactive: {},
  cardHeader: {}, headerInfo: {}, userName: {}, userEmail: {},
  statusBadge: {}, statusActive2: {}, statusInactive2: {}, statusDot2: {}, statusText: {},
  badgeRow: {}, roleBadge: {}, roleBadgeText: {}, shieldBadge: {}, shieldText: {},
  scopeBadge: {}, scopeText: {}, actionButtonsRow: {}, actionBtn: {},
  editBtn: {}, editBtnText: {}, deactivateBtn: {}, deactivateBtnText: {}, deleteBtn: {},
  avatarLarge: {}, avatarText: {},
});
