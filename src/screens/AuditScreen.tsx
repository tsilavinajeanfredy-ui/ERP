import * as React from 'react';
import {
  ScrollView, StyleSheet, Text, View, ActivityIndicator,
  TouchableOpacity, Platform, useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, AnimatedPage, ActionButton, PaginationControls } from '../components/Ui';
import { useAuditLogs } from '../lib/hooks';
import { useTranslation } from '../lib/i18n';
import { useSearch } from '../lib/search';
import { generatePdf, getPdfTemplate } from '../lib/pdf';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const ACTION_CONFIG = {
  INSERT: { color: '#10B981', bg: '#F0FDF4', border: '#BBF7D0', icon: 'plus-circle',   label: 'CRÉATION'     },
  UPDATE: { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', icon: 'pencil-circle',  label: 'MODIFICATION' },
  DELETE: { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: 'minus-circle',   label: 'SUPPRESSION'  },
} as const;

type ActionType = keyof typeof ACTION_CONFIG;

const TABLE_LABELS: Record<string, string> = {
  lots: 'Lots / Stock',
  users: 'Utilisateurs',
  articles: 'Articles',
  fcq_dossiers: 'Dossiers FCQ',
  fnc: 'FNC',
  da_import: 'Achats Import',
  da_local: 'Achats Local',
  of_orders: 'Ordres de Fabrication',
  reception_lines: 'Réceptions',
  bom_headers: 'Nomenclatures',
  instruments: 'Instruments',
  suppliers: 'Fournisseurs',
  inventory_campaigns: 'Inventaires',
  audit_log: 'Journal Audit',
};

function getTableLabel(name: string) {
  return TABLE_LABELS[name] || name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    time: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
  };
}

function shortId(id: string) {
  return id ? id.split('-')[0].toUpperCase() : '—';
}

// ─── Labels lisibles pour les champs techniques ───────────────────────────────
const FIELD_LABELS: Record<string, string> = {
  // Champs communs
  id: 'Identifiant',
  created_at: 'Créé le',
  updated_at: 'Modifié le',
  status: 'Statut',
  notes: 'Notes',
  code: 'Code',
  name: 'Nom',
  description: 'Description',
  // Lots / Stock / Qualité
  cqlib_status: 'Statut qualité',
  cqlib_decided_at: 'Décision qualité le',
  cqlib_decided_by: 'Décision qualité par',
  lot_number: 'Numéro de lot',
  expiry_date: 'Date d\'expiration',
  quantity: 'Quantité',
  unit: 'Unité',
  location: 'Emplacement',
  // Fournisseurs / Achats
  supplier_id: 'Fournisseur',
  article_id: 'Article',
  requested_by: 'Demandé par',
  amount_currency: 'Montant devise',
  amount_mga: 'Montant MGA',
  currency: 'Devise',
  current_step: 'Étape actuelle',
  eta_date: 'ETA',
  qty_kg: 'Quantité (kg)',
  qty_container: 'Nb conteneurs',
  lead_time_days: 'Délai (jours)',
  incoterm: 'Incoterm',
  // Utilisateurs / RH
  full_name: 'Nom complet',
  email: 'Email',
  role: 'Rôle',
  // Production
  of_number: 'N° Ordre de fabrication',
  planned_qty: 'Quantité planifiée',
  actual_qty: 'Quantité réelle',
  // Divers
  origin: 'Origine',
  country: 'Pays',
  phone: 'Téléphone',
  address: 'Adresse',
  documents: 'Documents',
  validated_by: 'Validé par',
  validated_at: 'Validé le',
};

function getFieldLabel(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  // Tentative auto : remplacer _ par espace + capitaliser
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Vérifie si une valeur ressemble à un UUID
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatFieldValue(key: string, value: any): string {
  if (value === null || value === undefined || value === '') return '—';
  const str = String(value);
  // UUIDs : afficher seulement les 8 premiers caractères
  if (UUID_REGEX.test(str)) return str.split('-')[0].toUpperCase() + '…';
  // Dates ISO
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str)) {
    const d = new Date(str);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  // Dates simples YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-');
    return `${d}/${m}/${y}`;
  }
  return str;
}

// Affiche uniquement les champs qui ont réellement changé (UPDATE)
function getChangedFields(oldData: any, newData: any): { key: string; old: any; new: any }[] {
  if (!oldData || !newData) return [];
  return Object.keys(newData)
    .filter(k => {
      const skip = ['updated_at', 'created_at'];
      if (skip.includes(k)) return false;
      return String(oldData[k] ?? '') !== String(newData[k] ?? '');
    })
    .map(k => ({ key: k, old: oldData[k], new: newData[k] }));
}

// ─── Composant badge action ───────────────────────────────────────────────────
function ActionBadge({ action }: { action: ActionType }) {
  const cfg = ACTION_CONFIG[action] || ACTION_CONFIG.INSERT;
  return (
    <View style={[ds.actionBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <MaterialCommunityIcons name={cfg.icon as any} size={13} color={cfg.color} />
      <Text style={[ds.actionBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ─── Ligne de log ─────────────────────────────────────────────────────────────
function LogCard({ log, onPress }: { log: any; onPress: () => void }) {
  const { date, time } = formatDate(log.created_at);
  const action = (log.action as ActionType) || 'INSERT';
  const cfg = ACTION_CONFIG[action] || ACTION_CONFIG.INSERT;
  const userName = log.user?.full_name || log.user?.email || 'Système';
  const initials = userName.split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase() || '').join('').slice(0, 2);
  const changedFields = action === 'UPDATE' ? getChangedFields(log.old_data, log.new_data) : [];

  return (
    <TouchableOpacity style={ds.card} onPress={onPress} activeOpacity={0.75}>
      {/* Barre colorée gauche */}
      <View style={[ds.cardAccent, { backgroundColor: cfg.color }]} />

      <View style={ds.cardBody}>
        {/* Ligne 1 : avatar + nom + date */}
        <View style={ds.cardTop}>
          <View style={[ds.avatar, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
            <Text style={[ds.avatarText, { color: cfg.color }]}>{initials}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={ds.userName}>{userName}</Text>
            <View style={ds.dateRow}>
              <MaterialCommunityIcons name="calendar" size={11} color="#9CA3AF" />
              <Text style={ds.dateText}>{date}</Text>
              <MaterialCommunityIcons name="clock-outline" size={11} color="#9CA3AF" style={{ marginLeft: 6 }} />
              <Text style={ds.dateText}>{time}</Text>
            </View>
          </View>
          <ActionBadge action={action} />
        </View>

        {/* Ligne 2 : table + ID */}
        <View style={ds.cardMeta}>
          <View style={ds.tableChip}>
            <MaterialCommunityIcons name="table" size={12} color="#6B7280" />
            <Text style={ds.tableChipText}>{getTableLabel(log.table_name)}</Text>
          </View>
          <View style={ds.idChip}>
            <Text style={ds.idChipText}>Réf. {shortId(log.record_id)}</Text>
          </View>
        </View>

        {/* Ligne 3 : champs modifiés (UPDATE seulement) */}
        {action === 'UPDATE' && changedFields.length > 0 && (
          <View style={ds.changesRow}>
            {changedFields.slice(0, 3).map(({ key, old: o, new: n }) => (
              <View key={key} style={ds.changeChip}>
                <Text style={ds.changeKey}>{getFieldLabel(key)}</Text>
                <Text style={ds.changeOld} numberOfLines={1}>{formatFieldValue(key, o)}</Text>
                <MaterialCommunityIcons name="arrow-right" size={10} color="#9CA3AF" />
                <Text style={ds.changeNew} numberOfLines={1}>{formatFieldValue(key, n)}</Text>
              </View>
            ))}
            {changedFields.length > 3 && (
              <Text style={ds.moreFields}>+{changedFields.length - 3} champs…</Text>
            )}
          </View>
        )}

        {/* INSERT : résumé des données créées */}
        {action === 'INSERT' && log.new_data && (
          <View style={ds.insertSummary}>
            {Object.entries(log.new_data as Record<string, any>)
              .filter(([k]) => !['id', 'created_at', 'updated_at'].includes(k))
              .slice(0, 3)
              .map(([k, v]) => (
                <Text key={k} style={ds.insertField} numberOfLines={1}>
                  <Text style={ds.insertFieldKey}>{getFieldLabel(k)}: </Text>
                  <Text style={ds.insertFieldVal}>{formatFieldValue(k, v)}</Text>
                </Text>
              ))}
          </View>
        )}

        {/* Indicateur : cliquer pour détails */}
        <View style={ds.cardFooter}>
          <MaterialCommunityIcons name="chevron-right" size={14} color="#D1D5DB" />
          <Text style={ds.cardFooterText}>Toucher pour voir tous les détails</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Modal détail ─────────────────────────────────────────────────────────────
function DetailModal({ log, onClose }: { log: any; onClose: () => void }) {
  const action = (log.action as ActionType) || 'INSERT';
  const cfg = ACTION_CONFIG[action] || ACTION_CONFIG.INSERT;
  const changedFields = action === 'UPDATE' ? getChangedFields(log.old_data, log.new_data) : [];
  const { date, time } = formatDate(log.created_at);

  return (
    <View style={ds.modalOverlay}>
      <View style={ds.modalBox}>
        {/* Header */}
        <View style={[ds.modalHeader, { borderBottomColor: cfg.border }]}>
          <View style={[ds.modalHeaderIcon, { backgroundColor: cfg.bg }]}>
            <MaterialCommunityIcons name={cfg.icon as any} size={22} color={cfg.color} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={ds.modalTitle}>Détail de l'action</Text>
            <Text style={[ds.modalSubtitle, { color: cfg.color }]}>{cfg.label} · {getTableLabel(log.table_name)}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={ds.modalClose}>
            <MaterialCommunityIcons name="close" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        <ScrollView style={ds.modalScroll} showsVerticalScrollIndicator={false}>
          {/* Infos générales */}
          <View style={ds.modalSection}>
            <Text style={ds.modalSectionTitle}>INFORMATIONS GÉNÉRALES</Text>
            <View style={ds.modalInfoGrid}>
              {[
                { label: 'Utilisateur', value: log.user?.full_name || log.user?.email || 'Système', icon: 'account' },
                { label: 'Date', value: `${date} à ${time}`, icon: 'calendar-clock' },
                { label: 'Table', value: getTableLabel(log.table_name), icon: 'table' },
                { label: 'ID Enregistrement', value: log.record_id, icon: 'identifier', mono: true },
              ].map(item => (
                <View key={item.label} style={ds.modalInfoRow}>
                  <MaterialCommunityIcons name={item.icon as any} size={15} color="#9CA3AF" />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={ds.modalInfoLabel}>{item.label}</Text>
                    <Text style={[ds.modalInfoValue, item.mono && ds.mono]}>{item.value}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Changements (UPDATE) */}
          {action === 'UPDATE' && (
            <View style={ds.modalSection}>
              <Text style={ds.modalSectionTitle}>CHAMPS MODIFIÉS ({changedFields.length})</Text>
              {changedFields.length === 0 ? (
                <Text style={ds.emptyText}>Aucun changement significatif détecté.</Text>
              ) : (
                changedFields.map(({ key, old: o, new: n }) => (
                  <View key={key} style={ds.diffRow}>
                    <Text style={ds.diffKey}>{getFieldLabel(key)}</Text>
                    <View style={ds.diffValues}>
                      <View style={[ds.diffVal, ds.diffValOld]}>
                        <Text style={ds.diffValOldText} numberOfLines={2}>{formatFieldValue(key, o)}</Text>
                      </View>
                      <MaterialCommunityIcons name="arrow-right" size={16} color="#9CA3AF" />
                      <View style={[ds.diffVal, ds.diffValNew]}>
                        <Text style={ds.diffValNewText} numberOfLines={2}>{formatFieldValue(key, n)}</Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {/* Données complètes (INSERT / DELETE) */}
          {(action === 'INSERT' || action === 'DELETE') && (
            <View style={ds.modalSection}>
              <Text style={ds.modalSectionTitle}>
                {action === 'INSERT' ? 'DONNÉES CRÉÉES' : 'DONNÉES SUPPRIMÉES'}
              </Text>
              <View style={ds.jsonBlock}>
                {Object.entries((action === 'INSERT' ? log.new_data : log.old_data) || {}).map(([k, v]) => (
                  <View key={k} style={ds.jsonRow}>
                    <Text style={ds.jsonKey}>{getFieldLabel(k)}</Text>
                    <Text style={ds.jsonVal} numberOfLines={2}>{formatFieldValue(k, v)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={{ height: 20 }} />
        </ScrollView>

        <TouchableOpacity style={ds.modalCloseBtn} onPress={onClose}>
          <Text style={ds.modalCloseBtnText}>Fermer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Écran principal ──────────────────────────────────────────────────────────
export function AuditScreen() {
  const { t } = useTranslation();
  const { searchQuery } = useSearch();
  const { width } = useWindowDimensions();
  const isMobile = width < 640;

  const [filter, setFilter] = React.useState<'ALL' | ActionType>('ALL');
  const [selectedLog, setSelectedLog] = React.useState<any | null>(null);
  const [page, setPage] = React.useState(0);
  const { data: logResponse, isPending: loading } = useAuditLogs(page, 20);
  const logs = (logResponse as any)?.data || [];
  const totalCount = (logResponse as any)?.count || 0;

  const filteredLogs = logs.filter((log: any) => {
    const matchesAction = filter === 'ALL' || log.action === filter;
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q
      || log.table_name?.toLowerCase().includes(q)
      || log.user?.full_name?.toLowerCase().includes(q)
      || log.user?.email?.toLowerCase().includes(q)
      || log.record_id?.toLowerCase().includes(q);
    return matchesAction && matchesSearch;
  });

  const handleExportPdf = () => {
    const tableRows = filteredLogs.map((log: any) => `
      <tr>
        <td>${new Date(log.created_at).toLocaleString('fr-FR')}</td>
        <td>${log.user?.full_name || log.user?.email || 'Système'}</td>
        <td><span class="badge badge-${log.action === 'INSERT' ? 'ok' : log.action === 'UPDATE' ? 'info' : 'err'}">${log.action}</span></td>
        <td>${getTableLabel(log.table_name)}</td>
        <td>${log.record_id}</td>
      </tr>`).join('');
    generatePdf(getPdfTemplate("Journal d'Audit", `
      <div class="summary-card">
        <strong>Filtre :</strong> ${filter === 'ALL' ? 'Tous' : filter} &nbsp;·&nbsp;
        <strong>Événements :</strong> ${filteredLogs.length}
      </div>
      <table><thead><tr>
        <th>Date</th><th>Utilisateur</th><th>Action</th><th>Table</th><th>ID</th>
      </tr></thead><tbody>${tableRows}</tbody></table>`
    ), 'Audit_Log.pdf');
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F6F8' }}>
        <ActivityIndicator size="large" color={C.green} />
        <Text style={{ marginTop: 12, color: '#6B7280', fontSize: 13 }}>Chargement du journal…</Text>
      </View>
    );
  }

  return (
    <AnimatedPage>
      <ScrollView style={ds.container} contentContainerStyle={ds.content} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={[ds.header, isMobile && { flexDirection: 'column', gap: 12 }]}>
          <View>
            <Text style={ds.title}>Journal d'Audit</Text>
            <Text style={ds.subtitle}>Traçabilité complète · Toutes les actions enregistrées</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <View style={ds.countBadge}>
              <MaterialCommunityIcons name="history" size={14} color="#1E513B" />
              <Text style={ds.countText}><Text style={{ fontWeight: '800' }}>{totalCount}</Text> événements</Text>
            </View>
            <ActionButton label="Export PDF" icon="file-pdf-box" onPress={handleExportPdf} />
          </View>
        </View>

        {/* ── Filtres ── */}
        <View style={ds.filters}>
          {([
            { value: 'ALL',    label: 'Tout',          icon: 'format-list-bulleted', count: logs.length },
            { value: 'INSERT', label: 'Créations',     icon: 'plus-circle',          count: logs.filter((l: any) => l.action === 'INSERT').length },
            { value: 'UPDATE', label: 'Modifications', icon: 'pencil-circle',        count: logs.filter((l: any) => l.action === 'UPDATE').length },
            { value: 'DELETE', label: 'Suppressions',  icon: 'minus-circle',         count: logs.filter((l: any) => l.action === 'DELETE').length },
          ] as const).map(f => {
            const active = filter === f.value;
            const cfg = f.value !== 'ALL' ? ACTION_CONFIG[f.value] : null;
            return (
              <TouchableOpacity
                key={f.value}
                style={[ds.filterBtn, active && (cfg ? { backgroundColor: cfg.bg, borderColor: cfg.border } : ds.filterBtnActiveAll)]}
                onPress={() => setFilter(f.value)}
              >
                <MaterialCommunityIcons
                  name={f.icon as any}
                  size={14}
                  color={active ? (cfg?.color || '#1E513B') : '#9CA3AF'}
                />
                <Text style={[ds.filterBtnText, active && { color: cfg?.color || '#1E513B', fontWeight: '700' }]}>
                  {f.label}
                </Text>
                {f.count > 0 && (
                  <View style={[ds.filterCount, active && { backgroundColor: cfg?.color || '#1E513B' }]}>
                    <Text style={[ds.filterCountText, active && { color: '#FFF' }]}>{f.count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Liste des logs ── */}
        {filteredLogs.length === 0 ? (
          <View style={ds.empty}>
            <MaterialCommunityIcons name="history" size={52} color="#E5E7EB" />
            <Text style={ds.emptyTitle}>Aucun événement</Text>
            <Text style={ds.emptySubtitle}>{searchQuery ? 'Aucun résultat pour cette recherche' : 'Le journal est vide'}</Text>
          </View>
        ) : (
          <>
            {filteredLogs.map((log: any) => (
              <LogCard key={log.id} log={log} onPress={() => setSelectedLog(log)} />
            ))}
            <PaginationControls
              currentPage={page}
              totalItems={totalCount}
              limit={20}
              onPageChange={(p) => setPage(p)}
              loading={loading}
            />
          </>
        )}

        <View style={ds.footer}>
          <MaterialCommunityIcons name="shield-lock" size={15} color="#9CA3AF" />
          <Text style={ds.footerText}>Journal immuable — toutes les actions sont enregistrées automatiquement</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Modal détail ── */}
      {selectedLog && (
        <DetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </AnimatedPage>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const ds = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },
  content: { padding: 20, paddingBottom: 40 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 12, color: '#6B7280', marginTop: 3 },
  countBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F0FDF4', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#BBF7D0' },
  countText: { fontSize: 13, color: '#1E513B' },

  // Filtres
  filters: { flexDirection: 'row', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 24, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB' },
  filterBtnActiveAll: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  filterBtnText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  filterCount: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  filterCountText: { fontSize: 11, fontWeight: '700', color: '#6B7280' },

  // Card
  card: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 14, marginBottom: 10, overflow: 'hidden', ...Platform.select({ web: { boxShadow: '0px 2px 8px rgba(0,0,0,0.05)' }, default: { shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 2 } }) },
  cardAccent: { width: 4 },
  cardBody: { flex: 1, padding: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  avatarText: { fontSize: 13, fontWeight: '800' },
  userName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  dateText: { fontSize: 11, color: '#9CA3AF' },

  // Action badge
  actionBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  actionBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  // Meta (table + ID)
  cardMeta: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tableChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F9FAFB', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  tableChipText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  idChip: { backgroundColor: '#F9FAFB', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  idChipText: { fontSize: 12, fontWeight: '600', color: '#6B7280', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  // Changements (UPDATE)
  changesRow: { gap: 4, marginBottom: 6 },
  changeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFBEB', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#FDE68A' },
  changeKey: { fontSize: 11, fontWeight: '700', color: '#92400E', minWidth: 60 },
  changeOld: { fontSize: 11, color: '#DC2626', textDecorationLine: 'line-through', flex: 1 },
  changeNew: { fontSize: 11, color: '#10B981', fontWeight: '600', flex: 1 },
  moreFields: { fontSize: 11, color: '#9CA3AF', fontStyle: 'italic', marginLeft: 4 },

  // INSERT summary
  insertSummary: { gap: 3, marginBottom: 6 },
  insertField: { fontSize: 12, color: '#374151' },
  insertFieldKey: { fontWeight: '600', color: '#6B7280' },
  insertFieldVal: { color: '#111827' },

  // Footer de card
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  cardFooterText: { fontSize: 11, color: '#D1D5DB' },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 60, backgroundColor: '#FFF', borderRadius: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151', marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: '#9CA3AF', marginTop: 4 },
  emptyText: { fontSize: 13, color: '#9CA3AF', fontStyle: 'italic', padding: 8 },

  // Footer page
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 30 },
  footerText: { fontSize: 12, color: '#9CA3AF' },

  // Modal overlay
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalBox: { backgroundColor: '#FFF', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '90%', overflow: 'hidden', ...Platform.select({ web: { boxShadow: '0px 8px 24px rgba(0,0,0,0.25)' }, default: { shadowColor: '#000', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 8 }, shadowRadius: 24, elevation: 12 } }) },
  modalHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
  modalHeaderIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  modalSubtitle: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  modalClose: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  modalScroll: { maxHeight: 500 },
  modalSection: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalSectionTitle: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', letterSpacing: 1, marginBottom: 14 },
  modalInfoGrid: { gap: 12 },
  modalInfoRow: { flexDirection: 'row', alignItems: 'flex-start' },
  modalInfoLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
  modalInfoValue: { fontSize: 13, color: '#111827', fontWeight: '600', marginTop: 2 },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 },

  // Diff
  diffRow: { marginBottom: 12 },
  diffKey: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 6, textTransform: 'capitalize' },
  diffValues: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  diffVal: { flex: 1, padding: 8, borderRadius: 8 },
  diffValOld: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  diffValOldText: { fontSize: 12, color: '#DC2626', textDecorationLine: 'line-through' },
  diffValNew: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0' },
  diffValNewText: { fontSize: 12, color: '#10B981', fontWeight: '600' },

  // JSON block
  jsonBlock: { gap: 6 },
  jsonRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  jsonKey: { fontSize: 12, fontWeight: '600', color: '#6B7280', textTransform: 'capitalize', flex: 1 },
  jsonVal: { fontSize: 12, color: '#111827', flex: 2, textAlign: 'right' },

  // Close button
  modalCloseBtn: { margin: 16, paddingVertical: 14, backgroundColor: '#111827', borderRadius: 12, alignItems: 'center' },
  modalCloseBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
