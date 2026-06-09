import * as React from 'react';
import { ScrollView, StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, useWindowDimensions, Platform, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, KpiCard, ActionButton, AnimatedPage, FormModal, FormInput, FormSelect, PaginationControls, Badge } from '../components/Ui';
import { useDaLocal, useUserProfile, useMutation, useNotification, useArticles, useSuppliers, useLots, confirmAction } from '../lib/hooks';
import { useTranslation } from '../lib/i18n';
import { supabase, getNextCode } from '../lib/supabase';
import { generatePdf, getPdfTemplate } from '../lib/pdf';
import { SupplierCreateModal } from '../components/SupplierCreateModal';

const STEP_MAP: Record<string, number> = { 'SAISIE': 0, 'VALIDATION': 1, 'COMMANDE': 2, 'RECEPTION': 3 };

export function PurchasingLocalScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 992;
  const { t } = useTranslation();
  const LOCAL_STEPS = [t('local_step_entry'), t('local_step_valid'), t('local_step_po'), t('local_step_rec')];

  const [page, setPage] = React.useState(0);
  const limit = 20;

  const { profile } = useUserProfile();
  const notify = useNotification();
  const role = profile?.role;
  const { data: dossiers = [], count: dossiersCount, isLoading: loading } = useDaLocal(page, limit);
  const { data: articles = [] } = useArticles(0, 500, 'MP');
  const { data: suppliers = [] } = useSuppliers(0, 100);
  const [selId, setSelId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<'da' | 'reception_mp'>('da');
  const [isGeneratingPdf, setIsGeneratingPdf] = React.useState(false);

  const [modalVisible, setModalVisible] = React.useState(false);
  const [formData, setFormData] = React.useState<any>({});
  const [editMode, setEditMode] = React.useState<'create' | 'update'>('create');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const isAdmin = role === 'ADMIN';

  const mutation = useMutation('da_local', () => {
    setModalVisible(false);
    setEditingId(null);
    setEditMode('create');
  });
  const saving = mutation.isPending;

  const [supplierModalVisible, setSupplierModalVisible] = React.useState(false);

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={C.green} />
      </View>
    );
  }

  const dossier = dossiers.find((d) => d.id === selId);
  const canCreate = role === 'RACH' || role === 'ADMIN';
  const canValidate = role === 'DPI' || role === 'ADMIN';
  const canReceive = role === 'MAGA' || role === 'ADMIN';

  const handleNextStep = () => {
    if (!dossier) return;
    const steps = ['SAISIE', 'VALIDATION', 'COMMANDE', 'RECEPTION'];
    const currentIndex = steps.indexOf(dossier.current_step);
    if (currentIndex < steps.length - 1) {
      const nextStep = steps[currentIndex + 1];
      const updates: any = { current_step: nextStep };
      if (nextStep === 'RECEPTION') updates.status = 'LIVRE';
      mutation.mutate({ id: dossier.id, values: updates, type: 'UPDATE' });
    }
  };

  const handleAdd = async () => {
    const year = new Date().getFullYear();
    let newCode = `DA-LOC-${year}-PEND`;
    try {
      newCode = await getNextCode('DA-LOC', 'da_local', 'code');
    } catch {}
    
    setEditMode('create');
    setEditingId(null);
    setFormData({
      code: newCode,
      status: 'EN_COURS',
      current_step: 'SAISIE',
      request_date: new Date().toISOString().split('T')[0]
    });
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!formData.article_id) return;

    // Garantir un code valide (evite le fallback "PEND" bloquant)
    const safeCode = formData.code && !formData.code.endsWith('-PEND')
      ? formData.code
      : `DA-LOC-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

    const values = {
      code: safeCode,
      article_id: formData.article_id,
      supplier_id: formData.supplier_id || null,
      qty_requested: parseFloat(formData.qty || '0'),
      unit: formData.unit || 'kg',
      amount_mga: parseFloat(formData.amount_mga || '0'),
      current_step: formData.current_step || 'SAISIE',
      status: formData.status || 'EN_COURS',
      request_date: formData.request_date || new Date().toISOString().split('T')[0],
      notes: formData.notes || null,
      requested_by: profile?.id || null,
    };

    if (editMode === 'update' && editingId) {
      mutation.mutate({ id: editingId, values, type: 'UPDATE' });
    } else {
      mutation.mutate({ values, type: 'INSERT' });
      notify.mutate({
        to_role: 'ADMIN',
        subject: 'Nouvelle demande d\'achat local',
        message: `Une nouvelle DA locale a été créée${profile?.full_name ? ' par ' + profile.full_name : ''} : ${values.code}`,
        type: 'internal',
        category: 'PURCHASING',
        metadata: { category: 'PURCHASING', screen: 'PurchasingLocal' },
      });
    }
  };

  const handlePrintDA = async (da: any) => {
    setIsGeneratingPdf(true);
    try {
      const today = new Date().toLocaleDateString('fr-FR');
      const template = getPdfTemplate(
        `DEMANDE D'ACHAT LOCAL — ${da.code}`,
        `
        <div class="summary-card">
          <strong>Référence :</strong> ${da.code}<br />
          <strong>Date de demande :</strong> ${da.request_date ? new Date(da.request_date).toLocaleDateString('fr-FR') : today}<br />
          <strong>Demandeur :</strong> ${profile?.full_name || 'Service Achats'}<br />
          <strong>Statut :</strong> ${da.current_step}
        </div>

        <h3>Détails de la Demande</h3>
        <table>
          <thead>
            <tr><th>Paramètre</th><th class="text-right">Valeur</th></tr>
          </thead>
          <tbody>
            <tr><td>Article</td><td class="text-right">${da.article?.name || '—'}</td></tr>
            <tr><td>Fournisseur</td><td class="text-right">${da.supplier?.name || '—'}</td></tr>
            <tr><td>Quantité commandée</td><td class="text-right">${da.qty_requested} ${da.unit}</td></tr>
            <tr><td>Montant (Ar)</td><td class="text-right">${da.amount_mga?.toLocaleString()} Ar</td></tr>
            <tr><td>Étape actuelle</td><td class="text-right">${da.current_step}</td></tr>
            <tr><td>Statut</td><td class="text-right">${da.status}</td></tr>
            ${da.notes ? `<tr><td>Notes</td><td class="text-right">${da.notes}</td></tr>` : ''}
          </tbody>
        </table>

        <div class="summary-card" style="margin-top:24px; border-top: 2px solid #1A1A1A;">
          <p style="font-size:11px; color:#666;">Généré le ${today} · GSI ERP · Demande d'Achat Local</p>
          <br/><br/>
          <p style="font-size:12px;"><strong>Visa Responsable Achats :</strong> ___________________________</p>
          <br/>
          <p style="font-size:12px;"><strong>Visa DPI / Validation :</strong> ___________________________</p>
        </div>
        `
      );
      await generatePdf(template, `DA_LOCAL_${da.code}`);
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de générer le PDF.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <AnimatedPage>
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        {/* Header */}
        <View style={[s.headerRow, isMobile && { flexDirection: 'column', alignItems: 'flex-start', gap: 16 }]}>
          <View>
            <Text style={s.title}>{t('purchasing_local_title')}</Text>
            <Text style={s.subTitle}>{t('purchasing_local_sub')}</Text>
          </View>
          <View style={s.actions}>
            <ActionButton label={t('suppliers')} onPress={() => setSupplierModalVisible(true)} />
            {activeTab === 'da' && <ActionButton label={t('new_da_local')} onPress={handleAdd} variant="primary" />}
          </View>
        </View>

        {/* ── Onglets ─────────────────────────────────────────────────── */}
        <View style={s.tabRow}>
          <TouchableOpacity
            style={[s.tab, activeTab === 'da' && s.tabActive]}
            onPress={() => { setActiveTab('da'); setSelId(null); }}
          >
            <MaterialCommunityIcons name="file-document-outline" size={16} color={activeTab === 'da' ? '#FFF' : '#6C757D'} />
            <Text style={[s.tabLabel, activeTab === 'da' && s.tabLabelActive]}>Demandes d'Achat</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tab, activeTab === 'reception_mp' && s.tabActive]}
            onPress={() => { setActiveTab('reception_mp'); setSelId(null); }}
          >
            <MaterialCommunityIcons name="package-variant-closed" size={16} color={activeTab === 'reception_mp' ? '#FFF' : '#6C757D'} />
            <Text style={[s.tabLabel, activeTab === 'reception_mp' && s.tabLabelActive]}>Réception MP</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'da' ? (
          <>
        <View style={[s.grid, isMobile && { flexDirection: 'column' }]}>
          <KpiCard label={t('to_validate_dpi')} value={String(dossiers.filter(d => d.current_step === 'VALIDATION').length)} sub={t('loading')} color={C.gold} />
          <KpiCard label={t('bc_in_progress')} value={String(dossiers.filter(d => d.current_step === 'COMMANDE').length)} sub={t('loading')} color={C.info} />
          <KpiCard label={t('deliveries_month')} value="24" sub="Site Antananarivo" />
        </View>

        <View style={{ height: 24 }} />

        <View style={[s.mainGrid, isMobile && { flexDirection: 'column' }]}>
          {/* List */}
          <View style={[s.listCol, isMobile && { width: '100%' }]}>
            {dossiers.map((d) => (
              <TouchableOpacity
                key={d.id}
                onPress={() => setSelId(selId === d.id ? null : d.id)}
                style={[s.dCard, selId === d.id && s.dCardActive]}
              >
                <View style={s.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.dRef, selId === d.id && { color: '#FFF' }]}>{d.code}</Text>
                    <Text style={[s.dArticle, selId === d.id && { color: '#FFF' }]}>{d.article?.name}</Text>
                    <Text style={[s.dSup, selId === d.id && { color: '#ADB5BD' }]}>{d.supplier?.name}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <View style={[s.statusBadge, { backgroundColor: d.current_step === 'VALIDATION' ? C.gold + '20' : '#F8F9FA' }]}>
                      <Text style={[s.statusText, { color: d.current_step === 'VALIDATION' ? C.gold : '#1A1A1A' }]}>{d.current_step}</Text>
                    </View>
                    <Text style={[s.dAmount, selId === d.id && { color: '#FFF' }]}>{d.amount_mga.toLocaleString()} Ar</Text>
                    {/* Bouton imprimer DA */}
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation?.(); handlePrintDA(d); }}
                      style={[s.printBtn, selId === d.id && { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.3)' }]}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      {isGeneratingPdf ? (
                        <ActivityIndicator size={12} color={selId === d.id ? '#FFF' : C.info} />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="printer-outline" size={13} color={selId === d.id ? '#FFF' : C.info} />
                          <Text style={[s.printBtnLabel, selId === d.id && { color: '#FFF' }]}>Imprimer</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
            
            <PaginationControls
              currentPage={page}
              totalItems={dossiersCount}
              limit={limit}
              onPageChange={(p) => setPage(p)}
              loading={loading}
            />
          </View>

          {/* Detail */}
          {dossier && (
            <View style={[s.detailCol, isMobile && { width: '100%' }]}>
              <View style={s.detailCard}>
                <View style={s.detailHeader}>
                  <Text style={s.detailTitle}>{t('detailed_tracking')} — {dossier.code}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {isAdmin && (
                      <ActionButton
                        label="Modifier"
                        icon="pencil-outline"
                        variant="secondary"
                        onPress={() => {
                          setEditMode('update');
                          setEditingId(dossier.id);
                          setFormData({
                            code: dossier.code,
                            article_id: dossier.article_id,
                            supplier_id: dossier.supplier_id,
                            qty: String(dossier.qty_requested || ''),
                            unit: dossier.unit || 'kg',
                            amount_mga: String(dossier.amount_mga || ''),
                            current_step: dossier.current_step,
                            status: dossier.status,
                            notes: dossier.notes || '',
                            request_date: dossier.created_at,
                          });
                          setModalVisible(true);
                        }}
                      />
                    )}
                    {isAdmin && (
                      <ActionButton
                        label="Supprimer"
                        icon="trash-can-outline"
                        onPress={() => {
                          confirmAction(
                            'Confirmer',
                            `Supprimer la demande ${dossier.code} ?`,
                            () => mutation.mutate({ id: dossier.id, type: 'DELETE' })
                          );
                        }}
                      />
                    )}
                    <ActionButton label="Imprimer DA" icon="printer-outline" variant="secondary" onPress={() => handlePrintDA(dossier)} />
                    <TouchableOpacity onPress={() => setSelId(null)}><MaterialCommunityIcons name="close" size={20} color="#666" /></TouchableOpacity>
                  </View>
                </View>

                {/* Workflow Stepper */}
                <View style={s.workflow}>
                  {LOCAL_STEPS.map((step, i) => {
                    const isActive = i === STEP_MAP[dossier.current_step];
                    const isPast = i < STEP_MAP[dossier.current_step];
                    return (
                      <View key={i} style={s.wfItem}>
                        <View style={[s.wfCircle, (isPast || isActive) && { borderColor: C.info, backgroundColor: isPast ? C.info : '#FFF' }]}>
                          {isPast ? <MaterialCommunityIcons name="check" size={12} color="#FFF" /> : <Text style={[s.wfNum, isActive && { color: C.info }]}>{i + 1}</Text>}
                        </View>
                        <Text style={[s.wfLabel, isActive && { fontWeight: '700', color: '#1A1A1A' }]}>{step}</Text>
                        {i < LOCAL_STEPS.length - 1 && <View style={[s.wfLine, isPast && { backgroundColor: C.info }]} />}
                      </View>
                    );
                  })}
                </View>

                <View style={s.detailContent}>
                  <View style={s.infoGrid}>
                    <View style={s.infoBox}><Text style={s.infoLabel}>{t('qty_ordered')}</Text><Text style={s.infoValue}>{dossier.qty_requested} {dossier.unit}</Text></View>
                    <View style={s.infoBox}><Text style={s.infoLabel}>{t('total_amount')}</Text><Text style={s.infoValue}>{dossier.amount_mga.toLocaleString()} Ar</Text></View>
                    <View style={s.infoBox}><Text style={s.infoLabel}>{t('suppliers')}</Text><Text style={s.infoValue}>{dossier.supplier?.name}</Text></View>
                    <View style={s.infoBox}><Text style={s.infoLabel}>{t('file_status')}</Text><Text style={s.infoValue}>{dossier.status}</Text></View>
                  </View>

                  {/* Deliveries list if any */}
                  {(dossier.deliveries?.length ?? 0) > 0 && (
                    <View style={{ marginTop: 24 }}>
                      <Text style={s.subSectionTitle}>{t('reception_history')}</Text>
                      {dossier.deliveries?.map((liv, _i) => (
                        <View key={liv.id} style={s.livRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.livDate}>{new Date(liv.delivery_date).toLocaleDateString()}</Text>
                            <Text style={s.livQty}>{liv.qty_delivered} {liv.unit} reçus</Text>
                          </View>
                          <View style={[s.ecartBadge, { backgroundColor: (liv.ecart_pct ?? 0) > 5 ? C.err + '10' : C.ok + '10' }]}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: (liv.ecart_pct ?? 0) > 5 ? C.err : C.ok }}>ÉCART: {liv.ecart_pct ?? 0}%</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={{ height: 32 }} />

                  {dossier.status !== 'CLOS' && dossier.status !== 'LIVRE' ? (
                    <View style={s.detailActions}>
                      {saving ? (
                        <ActivityIndicator color={C.info} />
                      ) : (
                        <>
                          {dossier.current_step === 'SAISIE' && canCreate && <ActionButton label={t('send_to_validation')} onPress={handleNextStep} variant="primary" />}
                          {dossier.current_step === 'VALIDATION' && canValidate && <ActionButton label={t('approve_dpi')} onPress={handleNextStep} variant="primary" />}
                          {dossier.current_step === 'COMMANDE' && canReceive && <ActionButton label={t('enter_delivery')} onPress={handleNextStep} variant="primary" />}
                          {canCreate && <ActionButton label={t('cancel_da')} onPress={() => mutation.mutate({ id: dossier.id, values: { status: 'ANNULE' }, type: 'UPDATE' })} />}
                        </>
                      )}
                    </View>
                  ) : (
                    <View style={s.closedBox}>
                      <MaterialCommunityIcons name="check-circle" size={20} color={C.ok} />
                      <Text style={s.closedText}>{t('success')}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          )}
        </View>
          </>
        ) : (
          /* ── Onglet Réception MP ──────────────────────────────────── */
          <ReceptionMPTab profile={profile} articles={articles} suppliers={suppliers} />
        )}
      </ScrollView>

      <FormModal
        visible={modalVisible}
        title={t('new_da_local')}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
        loading={mutation.isPending}
      >
        {/* Référence auto-générée — affichée mais non modifiable */}
        <FormInput
          label="Référence DA"
          value={formData.code?.endsWith('-PEND') ? 'Génération en cours…' : (formData.code || '')}
          editable={false}
          style={{ backgroundColor: '#F1F3F5', color: '#6C757D' }}
        />
        <FormSelect
          label="Article — Matières Premières"
          value={formData.article_id ?? ''}
          options={articles.map(a => ({ label: `[${a.family || 'MP'}] ${a.name}`, value: a.id }))}
          onSelect={v => setFormData({ ...formData, article_id: v })}
          searchable
        />
        <FormSelect
          label={t('suppliers')}
          value={formData.supplier_id ?? ''}
          options={suppliers.map(s => ({ label: s.name, value: s.id }))}
          onSelect={v => setFormData({ ...formData, supplier_id: v })}
        />
        <FormInput label={t('qty_ordered')} value={formData.qty ?? ''} onChangeText={val => setFormData({ ...formData, qty: val })} keyboardType="numeric" />
        <FormSelect
          label="Unité"
          value={formData.unit || 'kg'}
          options={[
            { label: 'Tonne (T)', value: 'T' },
            { label: 'Kilogramme (kg)', value: 'kg' },
            { label: 'Litre (L)', value: 'L' },
            { label: 'Pièce (PCE)', value: 'PCE' },
          ]}
          onSelect={v => setFormData({ ...formData, unit: v })}
        />
        <FormInput label={t('total_amount')} value={formData.amount_mga ?? ''} onChangeText={val => setFormData({ ...formData, amount_mga: val })} keyboardType="numeric" />
        {/* Date picker natif web — défaut = aujourd'hui, change chaque jour */}
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 }}>Date de demande</Text>
          {Platform.OS === 'web' ? (
            <input
              type="date"
              value={formData.request_date || new Date().toISOString().split('T')[0]}
              max={new Date().toISOString().split('T')[0]}
              onChange={e => setFormData({ ...formData, request_date: e.target.value })}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10,
                border: '1px solid #E9ECEF', fontSize: 14, color: '#1A1A1A',
                backgroundColor: '#FFF', outline: 'none', boxSizing: 'border-box',
              }}
            />
          ) : (
            <FormInput
              label=""
              value={formData.request_date || new Date().toISOString().split('T')[0]}
              onChangeText={val => setFormData({ ...formData, request_date: val })}
              placeholder="AAAA-MM-JJ"
            />
          )}
        </View>
        <FormInput label={t('notes_obs')} value={formData.notes ?? ''} onChangeText={val => setFormData({ ...formData, notes: val })} />
      </FormModal>

      {/* Modal liste fournisseurs */}
      <FormModal
        visible={supplierModalVisible}
        title={t('suppliers')}
        onClose={() => setSupplierModalVisible(false)}
        onSave={() => setSupplierModalVisible(false)}
        hideSaveButton
      >
        {suppliers.length === 0 ? (
          <Text style={{ color: '#888', textAlign: 'center', padding: 20 }}>Aucun fournisseur enregistré</Text>
        ) : (
          suppliers.map((sup, i) => (
            <View key={sup.id} style={{ paddingVertical: 12, borderBottomWidth: i < suppliers.length - 1 ? 1 : 0, borderBottomColor: '#F0F0F0' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#1A1A1A' }}>{sup.name}</Text>
              {sup.country && <Text style={{ fontSize: 12, color: '#888' }}>{sup.country}</Text>}
              {sup.contact_name && <Text style={{ fontSize: 12, color: '#888' }}>{sup.contact_name}{sup.contact_email ? ` · ${sup.contact_email}` : ''}</Text>}
              {sup.lead_time_days && <Text style={{ fontSize: 12, color: '#888' }}>Délai : {sup.lead_time_days} j</Text>}
            </View>
          ))
        )}
      </FormModal>
    </AnimatedPage>
  );
}

// ─── Composant Réception MP ───────────────────────────────────────────────────
function ReceptionMPTab({ profile, articles, suppliers }: { profile: any; articles: any[]; suppliers: any[] }) {
  const { data: lots = [], isLoading: lotsLoading } = useLots(0, 100);
  const lotsMutation = useMutation('lots', () => setModalVisible(false));
  const [modalVisible, setModalVisible] = React.useState(false);
  const [formData, setFormData] = React.useState<any>({});
  const [editLotId, setEditLotId] = React.useState<string | null>(null);
  const [supplierModalVisible, setSupplierModalVisible] = React.useState(false);
  const isAdmin = profile?.role === 'ADMIN';

  // Filtrer uniquement les lots de réception MP (famille MP)
  const mpLots = lots.filter((l: any) =>
    l.article?.family === 'MP' || l.article?.family === 'mp' ||
    l.type === 'MP' || l.lot_type === 'MP'
  );

  const handleAdd = () => {
    const today = new Date().toISOString().split('T')[0];
    setFormData({
      reception_date: today,
      status: 'QUARANTINE',
      qty: '',
      unit: 'kg',
    });
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!formData.article_id || !formData.qty) return;
    const values = {
      article_id: formData.article_id,
      supplier_id: formData.supplier_id || null,
      qty: parseFloat(formData.qty || '0'),
      unit: formData.unit || 'kg',
      reception_date: formData.reception_date,
      status: formData.status || 'QUARANTINE',
      notes: formData.notes || null,
      lot_type: 'MP',
    };

    if (editLotId) {
      lotsMutation.mutate({ id: editLotId, values, type: 'UPDATE' });
      setEditLotId(null);
    } else {
      lotsMutation.mutate({ values, type: 'INSERT' });
    }
    setModalVisible(false);
  };

  const getStatusColor = (status: string) => {
    if (status === 'LIBERE' || status === 'RELEASED') return C.ok;
    if (status === 'BLOQUE' || status === 'BLOCKED') return C.err;
    return C.gold;
  };

  const getStatusLabel = (status: string) => {
    if (status === 'LIBERE' || status === 'RELEASED') return 'LIBÉRÉ';
    if (status === 'BLOQUE' || status === 'BLOCKED') return 'BLOQUÉ';
    return 'QUARANTAINE';
  };

  if (lotsLoading) return <ActivityIndicator size="large" color={C.green} style={{ marginTop: 40 }} />;

  return (
    <View>
      {/* KPIs */}
      <View style={[s.grid, { flexDirection: 'row' }]}>
        <KpiCard label="Total Lots MP" value={String(mpLots.length)} sub="Réceptionnés" color={C.info} />
        <KpiCard label="En Quarantaine" value={String(mpLots.filter((l: any) => l.status === 'QUARANTINE' || l.status === 'QUARANTAINE').length)} sub="En attente labo" color={C.gold} />
        <KpiCard label="Libérés" value={String(mpLots.filter((l: any) => l.status === 'LIBERE' || l.status === 'RELEASED').length)} sub="Conformes" color={C.ok} />
        <KpiCard label="Bloqués" value={String(mpLots.filter((l: any) => l.status === 'BLOQUE' || l.status === 'BLOCKED').length)} sub="Non conformes" color={C.err} />
      </View>

      <View style={{ height: 24 }} />

      {/* Bouton + */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <Text style={s.subSectionTitle}>Lots Matières Premières reçus</Text>
        <ActionButton label="Nouvelle Réception MP" icon="plus" variant="primary" onPress={handleAdd} />
      </View>

      {/* Bannière info */}
      <View style={[s.infoBanner]}>
        <MaterialCommunityIcons name="shield-lock-outline" size={18} color={C.gold} />
        <Text style={s.infoBannerText}>
          Tous les lots MP réceptionnés sont en <Text style={{ fontWeight: '800' }}>QUARANTAINE</Text>. La libération est effectuée par le laboratoire après analyse qualité.
        </Text>
      </View>

      <View style={{ height: 16 }} />

      {/* Liste des lots MP */}
      {mpLots.length === 0 ? (
        <View style={s.emptyState}>
          <MaterialCommunityIcons name="package-variant" size={40} color="#CED4DA" />
          <Text style={s.emptyText}>Aucun lot MP réceptionné</Text>
        </View>
      ) : (
        mpLots.map((lot: any) => (
          <View key={lot.id} style={s.lotCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <View style={[s.dotStatus, { backgroundColor: getStatusColor(lot.status) }]} />
                  <Text style={s.lotCode}>{lot.code || lot.id?.substring(0, 8).toUpperCase()}</Text>
                </View>
                <Text style={s.lotArticle}>{lot.article?.name || '—'}</Text>
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MaterialCommunityIcons name="scale" size={12} color="#6C757D" />
                    <Text style={s.lotMeta}>{lot.qty} {lot.unit}</Text>
                  </View>
                  {lot.reception_date && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <MaterialCommunityIcons name="calendar" size={12} color="#6C757D" />
                      <Text style={s.lotMeta}>{new Date(lot.reception_date).toLocaleDateString('fr-FR')}</Text>
                    </View>
                  )}
                  {lot.supplier?.name && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <MaterialCommunityIcons name="truck-outline" size={12} color="#6C757D" />
                      <Text style={s.lotMeta}>{lot.supplier.name}</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={[s.statusBadge, { backgroundColor: getStatusColor(lot.status) + '20' }]}>
                <Text style={[s.statusText, { color: getStatusColor(lot.status) }]}>{getStatusLabel(lot.status)}</Text>
              </View>
            </View>            {isAdmin && (
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 12, justifyContent: 'flex-end' }}>
                <TouchableOpacity
                  onPress={() => {
                    setEditLotId(lot.id);
                    setFormData({
                      ...lot,
                      qty: String(lot.qty || ''),
                      unit: lot.unit || 'kg',
                      reception_date: lot.reception_date || new Date().toISOString().split('T')[0],
                    });
                    setModalVisible(true);
                  }}
                  style={s.iconButton}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={18} color={C.info} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    confirmAction(
                      'Confirmation',
                      `Supprimer le lot ${lot.code || lot.id?.substring(0, 8).toUpperCase()} ?`,
                      () => lotsMutation.mutate({ id: lot.id, type: 'DELETE' })
                    );
                  }}
                  style={s.iconButton}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color={C.err} />
                </TouchableOpacity>
              </View>
            )}          </View>
        ))
      )}

      {/* Modal nouvelle réception */}
      <FormModal
        visible={modalVisible}
        title={editLotId ? "Modifier la Réception MP" : "Nouvelle Réception MP"}
        onClose={() => { setModalVisible(false); setEditLotId(null); }}
        onSave={handleSave}
        loading={lotsMutation.isPending}
      >
        <FormSelect
          label="Article — Matières Premières"
          value={formData.article_id ?? ''}
          options={articles.map((a: any) => ({ label: `[${a.family || 'MP'}] ${a.name}`, value: a.id }))}
          onSelect={v => setFormData({ ...formData, article_id: v })}
          searchable
        />
        <FormSelect
          label="Fournisseur"
          value={formData.supplier_id ?? ''}
          options={suppliers.map((s: any) => ({ label: s.name, value: s.id }))}
          onSelect={v => setFormData({ ...formData, supplier_id: v })}
          emptyMessage={
            <TouchableOpacity
              onPress={() => setSupplierModalVisible(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 4 }}
            >
              <MaterialCommunityIcons name="plus-circle-outline" size={16} color="#2563EB" />
              <Text style={{ fontSize: 13, color: '#2563EB', fontWeight: '600' }}>Ajouter un fournisseur</Text>
            </TouchableOpacity>
          }
        />
        <FormInput label="Quantité reçue" value={formData.qty ?? ''} onChangeText={v => setFormData({ ...formData, qty: v })} keyboardType="numeric" />
        <FormSelect
          label="Unité"
          value={formData.unit || 'kg'}
          options={[
            { label: 'Tonne (T)', value: 'T' },
            { label: 'Kilogramme (kg)', value: 'kg' },
            { label: 'Litre (L)', value: 'L' },
            { label: 'Pièce (PCE)', value: 'PCE' },
          ]}
          onSelect={v => setFormData({ ...formData, unit: v })}
        />
        <FormInput label="Date de réception" value={formData.reception_date ?? ''} onChangeText={v => setFormData({ ...formData, reception_date: v })} />
        <FormInput label="Notes / Observations" value={formData.notes ?? ''} onChangeText={v => setFormData({ ...formData, notes: v })} />
      </FormModal>

      <SupplierCreateModal
        visible={supplierModalVisible}
        onClose={() => setSupplierModalVisible(false)}
        onCreated={(id, _name) => {
          setSupplierModalVisible(false);
          if (id) setFormData((prev: any) => ({ ...prev, supplier_id: id }));
        }}
      />
    </View>
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
  mainGrid: { flexDirection: 'row', gap: 24 },
  listCol: { flex: 1 },
  detailCol: { flex: 1.2 },

  // ── Onglets ─────────────────────────────────────────────────────────────
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 24, borderBottomWidth: 1, borderBottomColor: '#E9ECEF', paddingBottom: 0 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 8, borderBottomWidth: 2, borderBottomColor: 'transparent',
    backgroundColor: 'transparent',
  },
  tabActive: { backgroundColor: '#1A1A1A', borderBottomColor: '#1A1A1A', borderRadius: 8 },
  tabLabel: { fontSize: 13, fontWeight: '600', color: '#6C757D' },
  tabLabelActive: { color: '#FFF' },

  // ── Bouton imprimer inline ───────────────────────────────────────────────
  printBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
    borderWidth: 1, borderColor: C.info + '40',
    backgroundColor: C.info + '10',
  },
  printBtnLabel: { fontSize: 11, fontWeight: '600', color: C.info },

  // ── Réception MP ─────────────────────────────────────────────────────────
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: C.gold + '15', borderRadius: 10,
    borderWidth: 1, borderColor: C.gold + '40',
    padding: 14,
  },
  infoBannerText: { flex: 1, fontSize: 13, color: '#6C757D', lineHeight: 20 },
  lotCard: {
    backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E9ECEF',
    padding: 16, marginBottom: 10,
    ...Platform.select({ web: { boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }, default: { elevation: 1 } }),
  },
  dotStatus: { width: 8, height: 8, borderRadius: 4 },
  lotCode: { fontSize: 12, fontWeight: '700', color: '#ADB5BD', fontFamily: Platform.OS === 'web' ? 'Menlo' : 'monospace' },
  lotArticle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  lotMeta: { fontSize: 11, color: '#6C757D' },
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 14, color: '#ADB5BD' },

  dCard: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E9ECEF', padding: 20, marginBottom: 12 },
  dCardActive: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  dRef: { fontSize: 11, fontWeight: '700', color: '#ADB5BD', fontFamily: Platform.OS === 'web' ? 'Menlo' : 'monospace' },
  dArticle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginTop: 4 },
  dSup: { fontSize: 12, color: '#6C757D', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 10, fontWeight: '800' },
  dAmount: { fontSize: 15, fontWeight: '800', color: '#1A1A1A' },
  iconButton: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#F8F9FA', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E9ECEF' },
  detailCard: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E9ECEF', overflow: 'hidden' },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F8F9FA' },
  detailTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  workflow: { flexDirection: 'row', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F8F9FA' },
  wfItem: { flex: 1, alignItems: 'center', position: 'relative' },
  wfCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#E9ECEF', alignItems: 'center', justifyContent: 'center', zIndex: 2, backgroundColor: '#FFF' },
  wfNum: { fontSize: 10, fontWeight: '800', color: '#ADB5BD' },
  wfLabel: { fontSize: 9, color: '#ADB5BD', marginTop: 8, textAlign: 'center' },
  wfLine: { position: 'absolute', height: 2, backgroundColor: '#E9ECEF', width: '100%', top: 11, left: '50%', zIndex: 1 },
  detailContent: { padding: 20 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  infoBox: { width: '45%' },
  infoLabel: { fontSize: 11, color: '#ADB5BD', fontWeight: '700', textTransform: 'uppercase' },
  infoValue: { fontSize: 13, fontWeight: '600', color: '#1A1A1A', marginTop: 4 },
  subSectionTitle: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', marginBottom: 12 },
  livRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F8F9FA' },
  livDate: { fontSize: 11, color: '#ADB5BD' },
  livQty: { fontSize: 13, fontWeight: '600', color: '#1A1A1A', marginTop: 2 },
  ecartBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  detailActions: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  closedBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, backgroundColor: '#F8F9FA', borderRadius: 8 },
  closedText: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
});
