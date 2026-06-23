import * as React from 'react';
import { ScrollView, StyleSheet, Text, View, ActivityIndicator, useWindowDimensions, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, KpiCard, ActionButton, Badge, AnimatedPage, FormModal, FormInput, FormSelect, SectionTitle, DataTable, PaginationControls } from '../components/Ui';
import { useComplaints, useLots, useFcqDossiers, useUserProfile, useMutation, useNotification } from '../lib/hooks';
import { useTranslation } from '../lib/i18n';
import { useSearch } from '../lib/search';
import { generatePdf, getPdfTemplate } from '../lib/pdf';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  OUVERTE: { label: 'Ouverte', color: C.err },
  EN_ANALYSE: { label: 'En analyse', color: C.info },
  TRAITEE: { label: 'Traitée', color: C.gold },
  CLOTUREE: { label: 'Clôturée', color: C.ok },
};

const SEVERITY_MAP: Record<string, { label: string; color: string }> = {
  MINEURE: { label: 'Mineure', color: C.info },
  MAJEURE: { label: 'Majeure', color: C.gold },
  CRITIQUE: { label: 'Critique', color: C.err },
};

const ESCALATION_MAP: Record<number, { label: string; color: string }> = {
  0: { label: 'Aucune', color: C.textMuted },
  1: { label: 'Niveau 1 — RQ', color: C.gold },
  2: { label: 'Niveau 2 — DPI', color: C.err },
  3: { label: 'Niveau 3 — Direction', color: C.err },
};

/** Une réclamation non clôturée dont l'échéance (J+1) est dépassée est en retard. */
function isOverdue(c: { status: string; due_by?: string | null }): boolean {
  return c.status !== 'CLOTUREE' && !!c.due_by && new Date(c.due_by).getTime() < Date.now();
}

export function ComplaintsScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 992;
  const { searchQuery } = useSearch();
  const { profile } = useUserProfile();
  const notify = useNotification();

  const [page, setPage] = React.useState(0);
  const limit = 20;
  const { t } = useTranslation();
  const { data: complaints = [], count: complaintsCount, isPending: loading } = useComplaints(page, limit);
  const { data: lots = [] } = useLots(0, 100);
  const { data: fcqDossiers = [] } = useFcqDossiers(0, 100);

  const [selId, setSelId] = React.useState<string | null>(null);
  const [modalVisible, setModalVisible] = React.useState(false);
  const [detailModalVisible, setDetailModalVisible] = React.useState(false);
  const [formData, setFormData] = React.useState<any>({});

  const mutation = useMutation('complaints', () => { setModalVisible(false); setDetailModalVisible(false); });

  React.useEffect(() => { setPage(0); }, [searchQuery]);

  const filtered = complaints.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return c.code.toLowerCase().includes(q) || c.client_name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
  });

  const openCount = complaints.filter(c => c.status === 'OUVERTE').length;
  const analysisCount = complaints.filter(c => c.status === 'EN_ANALYSE').length;
  const closedCount = complaints.filter(c => c.status === 'CLOTUREE').length;
  const overdueCount = complaints.filter(c => isOverdue(c)).length;

  const handleAdd = () => {
    const year = new Date().getFullYear();
    const count = complaints.length + 1;
    setFormData({
      code: `REC-${year}-${count.toString().padStart(4, '0')}`,
      status: 'OUVERTE',
      severity: 'MAJEURE',
      origin: 'CLIENT',
      opened_by: profile?.id,
    });
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!formData.client_name || !formData.description) {
      Alert.alert('Champs manquants', 'Veuillez renseigner le client et la description.');
      return;
    }
    mutation.mutate({ values: formData, type: 'INSERT' });
    notify.mutate({
      to_role: 'ADMIN',
      subject: 'Nouvelle réclamation créée',
      message: `Une nouvelle réclamation a été enregistrée${profile?.full_name ? ' par ' + profile.full_name : ''}.`,
      type: 'internal',
      category: 'QUALITY',
      metadata: { category: 'QUALITY', screen: 'Complaints' },
    });
  };

  const handleStatusChange = (id: string, newStatus: string) => {
    mutation.mutate({
      id,
      values: {
        status: newStatus,
        ...(newStatus === 'CLOTUREE' ? { closed_at: new Date().toISOString(), closed_by: profile?.id } : {}),
      },
      type: 'UPDATE',
    });
  };

  const handleEscalate = (c: any) => {
    const nextLevel = Math.min((c.escalation_level || 0) + 1, 3);
    const targetRole = nextLevel === 1 ? 'RQ' : nextLevel === 2 ? 'DPI' : 'ADMIN';
    mutation.mutate({
      id: c.id,
      values: { escalation_level: nextLevel, escalated_at: new Date().toISOString() },
      type: 'UPDATE',
    });
    notify.mutate({
      to_role: targetRole,
      subject: `[RÉCLAMATION] Escalade niveau ${nextLevel} — ${c.code}`,
      message: `Réclamation ${c.code} (${c.client_name}, sévérité ${c.severity}) escaladée au niveau ${nextLevel}.`,
      type: 'error',
      category: 'QUALITY',
      metadata: { category: 'QUALITY', screen: 'Complaints', complaint_id: c.id, escalation_level: nextLevel },
    });
  };

  const generateReportPdf = (complaint: any) => {
    const html = getPdfTemplate(`RAPPORT RÉCLAMATION ${complaint.code}`, `
      <div class="summary-card">
        <strong>CLIENT :</strong> ${complaint.client_name}<br/>
        <strong>SÉVÉRITÉ :</strong> ${complaint.severity}<br/>
        <strong>ORIGINE :</strong> ${complaint.origin}<br/>
        <strong>DATE :</strong> ${new Date(complaint.opened_at).toLocaleDateString('fr-FR')}<br/>
        <strong>STATUT :</strong> ${complaint.status}
      </div>
      <h3>Description</h3><p>${complaint.description}</p>
      ${complaint.root_cause ? `<h3>Cause Racine</h3><p>${complaint.root_cause}</p>` : ''}
      ${complaint.corrective_action ? `<h3>Action Corrective</h3><p>${complaint.corrective_action}</p>` : ''}
      ${complaint.preventive_action ? `<h3>Action Préventive</h3><p>${complaint.preventive_action}</p>` : ''}
    `);
    generatePdf(html, `Reclamation_${complaint.code}.pdf`);
  };

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={C.green} />
      </View>
    );
  }

  return (
    <AnimatedPage>
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <View style={[s.headerRow, isMobile && { flexDirection: 'column', alignItems: 'flex-start', gap: 16 }]}>
          <View>
            <Text style={s.title}>{t('complaints_title')}</Text>
            <Text style={s.subTitle}>{t('complaints_sub')}</Text>
          </View>
          <View style={s.actions}>
            <ActionButton label="Nouvelle Réclamation" icon="plus" variant="primary" onPress={handleAdd} />
          </View>
        </View>

        <View style={[s.grid, isMobile && { flexDirection: 'column' }]}>
          <KpiCard label="Ouvertes" value={String(openCount)} sub="À traiter" color={C.err} />
          <KpiCard label="En analyse" value={String(analysisCount)} sub="En cours" color={C.info} />
          <KpiCard label="En retard" value={String(overdueCount)} sub="Échéance J+1 dépassée" color={C.gold} />
          <KpiCard label="Clôturées" value={String(closedCount)} sub="Ce mois" color={C.ok} />
        </View>

        <View style={{ height: 24 }} />
        <SectionTitle>LISTE DES RÉCLAMATIONS</SectionTitle>
        <View style={s.tableContainer}>
          {filtered.length === 0 ? (
            <View style={s.emptyState}>
              <MaterialCommunityIcons name="comment-remove-outline" size={64} color="#E9ECEF" />
              <Text style={s.emptyText}>{t('complaints_no_results')}</Text>
            </View>
          ) : (
            <DataTable
              data={filtered}
              columns={[
                { key: 'code', label: 'Code', flex: 0.8 },
                { key: 'client_name', label: 'Client', flex: 1.2 },
                { key: 'description', label: 'Description', flex: 2, render: (item: any) => (
                  <Text style={s.tableCellText} numberOfLines={1}>{item.description}</Text>
                )},
                { key: 'severity', label: 'Sévérité', flex: 0.7, render: (item: any) => (
                  <Badge label={item.severity} color={SEVERITY_MAP[item.severity]?.color || C.textMuted} />
                )},
                { key: 'status', label: 'Statut', flex: 0.9, render: (item: any) => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Badge label={STATUS_MAP[item.status]?.label || item.status} color={STATUS_MAP[item.status]?.color || C.textMuted} />
                    {isOverdue(item) && <Badge label="Retard" color={C.err} />}
                    {(item.escalation_level || 0) > 0 && <Badge label={`N${item.escalation_level}`} color={C.gold} />}
                  </View>
                )},
                { key: 'opened_at', label: 'Date', flex: 0.7, render: (item: any) => (
                  <Text style={s.tableCellText}>{new Date(item.opened_at).toLocaleDateString()}</Text>
                )},
              ]}
              onRowPress={(item) => { setSelId(item.id); setDetailModalVisible(true); }}
            />
          )}
          <PaginationControls currentPage={page} totalItems={complaintsCount} limit={limit} onPageChange={setPage} loading={loading} />
        </View>
      </ScrollView>

      <FormModal
        visible={modalVisible}
        title="Nouvelle Réclamation"
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
        loading={mutation.isPending}
      >
        <FormInput label="N° Réclamation" value={formData.code ?? ''} editable={false} style={{ backgroundColor: '#F1F3F5', color: '#6C757D' }} />
        <FormInput label="Client *" value={formData.client_name ?? ''} onChangeText={val => setFormData({ ...formData, client_name: val })} />
        <FormInput label="Réf. Client" value={formData.client_ref ?? ''} onChangeText={val => setFormData({ ...formData, client_ref: val })} />
        <FormSelect
          label="Origine"
          value={formData.origin ?? ''}
          options={[
            { label: 'Client', value: 'CLIENT' },
            { label: 'Interne', value: 'INTERNE' },
            { label: 'Transporteur', value: 'TRANSPORTEUR' },
            { label: 'Autre', value: 'AUTRE' },
          ]}
          onSelect={v => setFormData({ ...formData, origin: v })}
        />
        <FormSelect
          label="Sévérité"
          value={formData.severity ?? ''}
          options={[
            { label: 'Mineure', value: 'MINEURE' },
            { label: 'Majeure', value: 'MAJEURE' },
            { label: 'Critique', value: 'CRITIQUE' },
          ]}
          onSelect={v => setFormData({ ...formData, severity: v })}
        />
        <FormSelect
          label="Lot concerné"
          value={formData.lot_id ?? ''}
          options={lots.map(l => ({ label: `${l.code} - ${l.article?.name || ''}`, value: l.id }))}
          onSelect={v => setFormData({ ...formData, lot_id: v })}
        />
        <FormSelect
          label="Dossier FCQ lié (traçabilité CQ-Lab)"
          value={formData.fcq_id ?? ''}
          options={fcqDossiers
            .filter((f: any) => !formData.lot_id || f.lot_id === formData.lot_id)
            .map((f: any) => ({ label: `${f.code} (${f.fcq_type})`, value: f.id }))}
          onSelect={v => setFormData({ ...formData, fcq_id: v })}
          searchable
        />
        <FormInput label="Description *" value={formData.description ?? ''} onChangeText={val => setFormData({ ...formData, description: val })} multiline />
        <FormInput label="Qté concernée" value={formData.qty_concerned ?? ''} onChangeText={val => setFormData({ ...formData, qty_concerned: val })} keyboardType="numeric" />
      </FormModal>

      <FormModal
        visible={detailModalVisible}
        title={`Détails ${complaints.find(c => c.id === selId)?.code || ''}`}
        onClose={() => { setDetailModalVisible(false); setSelId(null); }}
        onSave={() => { setDetailModalVisible(false); setSelId(null); }}
        hideSaveButton
      >
        {(() => {
          const c = complaints.find(x => x.id === selId);
          if (!c) return null;
          return (
            <View>
              <View style={s.detailSection}>
                <SectionTitle>INFORMATIONS GÉNÉRALES</SectionTitle>
                <View style={s.detailRow}><Text style={s.detailLabel}>{t('complaints_client')}:</Text><Text style={s.detailValue}>{c.client_name}</Text></View>
                <View style={s.detailRow}><Text style={s.detailLabel}>{t('status')}:</Text><Badge label={STATUS_MAP[c.status]?.label || c.status} color={STATUS_MAP[c.status]?.color || C.textMuted} /></View>
                <View style={s.detailRow}><Text style={s.detailLabel}>{t('severity')}:</Text><Badge label={c.severity} color={SEVERITY_MAP[c.severity]?.color || C.textMuted} /></View>
                <View style={s.detailRow}><Text style={s.detailLabel}>{t('complaints_origin')}:</Text><Text style={s.detailValue}>{c.origin}</Text></View>
                <View style={s.detailRow}><Text style={s.detailLabel}>{t('complaints_date')}:</Text><Text style={s.detailValue}>{new Date(c.opened_at).toLocaleDateString()}</Text></View>
                {c.due_by ? (
                  <View style={s.detailRow}>
                    <Text style={s.detailLabel}>Échéance (J+1):</Text>
                    <Text style={[s.detailValue, isOverdue(c) && { color: C.err }]}>
                      {new Date(c.due_by).toLocaleString('fr-FR')}{isOverdue(c) ? ' — EN RETARD' : ''}
                    </Text>
                  </View>
                ) : null}
                <View style={s.detailRow}>
                  <Text style={s.detailLabel}>Escalade:</Text>
                  <Badge label={ESCALATION_MAP[c.escalation_level || 0]?.label || '—'} color={ESCALATION_MAP[c.escalation_level || 0]?.color || C.textMuted} />
                </View>
                {c.fcq_id ? (
                  <View style={s.detailRow}>
                    <Text style={s.detailLabel}>Dossier FCQ:</Text>
                    <Text style={s.detailValue}>{fcqDossiers.find((f: any) => f.id === c.fcq_id)?.code || c.fcq_id}</Text>
                  </View>
                ) : null}
              </View>
              <View style={s.detailSection}>
                <SectionTitle>ACTIONS</SectionTitle>
                {c.status !== 'CLOTUREE' && (c.escalation_level || 0) < 3 && (
                  <View style={{ marginBottom: 12 }}>
                    <ActionButton
                      label={isOverdue(c) ? `Escalader (retard) → niveau ${Math.min((c.escalation_level || 0) + 1, 3)}` : `Escalader → niveau ${Math.min((c.escalation_level || 0) + 1, 3)}`}
                      icon="arrow-up-bold-circle-outline"
                      variant={isOverdue(c) ? 'primary' : 'secondary'}
                      onPress={() => handleEscalate(c)}
                    />
                  </View>
                )}
                {c.status === 'OUVERTE' && (
                  <ActionButton label="Passer en analyse" icon="magnify" onPress={() => handleStatusChange(c.id, 'EN_ANALYSE')} />
                )}
                {c.status === 'EN_ANALYSE' && (
                  <>
                    <FormInput label="Cause racine" value={c.root_cause || ''} onChangeText={v => setFormData({ ...formData, root_cause: v })} multiline />
                    <FormInput label="Action corrective" value={c.corrective_action || ''} onChangeText={v => setFormData({ ...formData, corrective_action: v })} multiline />
                    <FormInput label="Action préventive" value={c.preventive_action || ''} onChangeText={v => setFormData({ ...formData, preventive_action: v })} multiline />
                    <ActionButton label="Marquer Traitée" icon="check-circle" variant="primary" onPress={() => {
                      mutation.mutate({
                        id: c.id,
                        values: {
                          root_cause: formData.root_cause || c.root_cause,
                          corrective_action: formData.corrective_action || c.corrective_action,
                          preventive_action: formData.preventive_action || c.preventive_action,
                          status: 'TRAITEE',
                        },
                        type: 'UPDATE',
                      });
                    }} />
                  </>
                )}
                {c.status === 'TRAITEE' && (
                  <ActionButton label="Clôturer la réclamation" icon="lock" variant="primary" onPress={() => handleStatusChange(c.id, 'CLOTUREE')} />
                )}
              </View>
              <View style={{ marginTop: 16 }}>
                <ActionButton label="Exporter PDF" icon="file-pdf-box" onPress={() => generateReportPdf(c)} />
              </View>
            </View>
          );
        })()}
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
  actions: { flexDirection: 'row', gap: 12 },
  grid: { flexDirection: 'row', gap: 16 },
  tableContainer: { flex: 1, backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E9ECEF', overflow: 'hidden' },
  emptyState: { justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  emptyText: { marginTop: 16, fontSize: 15, color: '#ADB5BD', fontWeight: '600' },
  tableCellText: { fontSize: 13, color: '#1A1A1A', fontWeight: '500' },
  detailSection: { marginBottom: 24 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  detailLabel: { width: 120, fontSize: 13, color: '#6C757D' },
  detailValue: { flex: 1, fontSize: 13, fontWeight: '600', color: '#1A1A1A' },
});
