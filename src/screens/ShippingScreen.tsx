import * as React from 'react';
import { ScrollView, StyleSheet, Text, View, TouchableOpacity, useWindowDimensions, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, KpiCard, ActionButton, AnimatedPage, FormModal, FormInput, FormSelect, SectionTitle, DataTable, PaginationControls, ExportOverlay, LoadingSpinner } from '../components/Ui';
import { useLots, useAllArticles, useDepots, useUserProfile, useMutation, usePermissions, useExport } from '../lib/hooks';
import { supabase } from '../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { confirmShow } from '../components/Ui';
import { useTranslation } from '../lib/i18n';
import { useSearch } from '../lib/search';

function TypeFilterChip({ label, count, active, onPress }: { label: string; count: number; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.chip, active && s.chipActive]}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
      <View style={[s.chipBadge, active && s.chipBadgeActive]}>
        <Text style={[s.chipBadgeText, active && s.chipBadgeTextActive]}>{count}</Text>
      </View>
    </TouchableOpacity>
  );
}

export function ShippingScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 992;
  const { searchQuery } = useSearch();
  const { canPerformAction } = usePermissions();
  const { profile } = useUserProfile();
  const { exporting, progress, triggerExport } = useExport();

  const { t } = useTranslation();
  const [page, setPage] = React.useState(0);
  const limit = 20;

  const { data: lots = [], count: lotsCount, isPending: lotsLoading } = useLots(page, limit, 'LIBERE');
  const { data: articles = [] } = useAllArticles();
  const { data: depots = [] } = useDepots();

  const [selId, setSelId] = React.useState<string | null>(null);
  const [modalVisible, setModalVisible] = React.useState(false);
  const [formData, setFormData] = React.useState<any>({});
  const [beTypeFilter, setBeTypeFilter] = React.useState<'ALL' | 'PF' | 'MP'>('ALL');

  const mutation = useMutation('stock_movements', () => { setModalVisible(false); setSelId(null); });
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const handleDeleteLot = (lot: any) => {
    confirmShow(
      'Supprimer le lot',
      `Supprimer le lot "${lot.code}" (${lot.article?.name || ''}) ?\n\nTous les mouvements, dossiers FCQ et fiches NC associés seront supprimés.`,
      async () => {
        if (!supabase) return;
        setDeletingId(lot.id);
        try {
          // La migration 050 ajoute ON DELETE CASCADE/SET NULL sur toutes les FK → lots
          // Un seul DELETE suffit, Postgres gère la cascade automatiquement
          const { error } = await supabase.from('lots').delete().eq('id', lot.id);
          if (error) throw error;
          queryClient.invalidateQueries({ queryKey: ['lots'] });
          queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
        } catch (err: any) {
          Alert.alert('Erreur', err.message || 'Suppression impossible');
        } finally {
          setDeletingId(null);
        }
      },
      undefined,
      true
    );
  };

  const pfLots = lots.filter(l => l.article?.article_type === 'PF');
  const mpLots = lots.filter(l => l.article?.article_type === 'MP');

  const [typeFilter, setTypeFilter] = React.useState<'PF' | 'MP'>('PF');
  const lotsForFilter = typeFilter === 'PF' ? pfLots : mpLots;

  const filteredLots = lotsForFilter.filter(l => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return l.code.toLowerCase().includes(q) || l.article?.name?.toLowerCase().includes(q) || l.article?.code?.toLowerCase().includes(q);
  });

  React.useEffect(() => { setPage(0); }, [searchQuery, typeFilter]);

  const handleCreateBe = (lotId: string | null = selId) => {
    setBeTypeFilter('ALL');
    setFormData({
      lot_id: lotId,
      movement_type: 'SORTIE',
      unit: 'kg',
      performed_by: profile?.id,
      created_at: new Date().toISOString(),
    });
    setModalVisible(true);
  };

  const handleSaveBe = () => {
    if (!formData.lot_id || !formData.qty || !formData.depot_to_id) {
      Alert.alert('Champs manquants', 'Veuillez renseigner le lot, la quantité et le dépôt de destination.');
      return;
    }
    const selectedLot = lots.find(l => l.id === formData.lot_id);
    mutation.mutate({
      values: {
        lot_id: formData.lot_id,
        article_id: selectedLot?.article_id,
        depot_from_id: selectedLot?.depot_id,
        depot_to_id: formData.depot_to_id,
        movement_type: 'SORTIE',
        qty: parseFloat(formData.qty),
        unit: formData.unit || 'kg',
        reference_doc: `BE-${new Date().toISOString().slice(0, 10)}-${Date.now().toString().slice(-4)}`,
        performed_by: profile?.id,
        notes: formData.notes,
      },
      type: 'INSERT',
    });
  };

  const generateBePdf = async (lot: any) => {
    const depot = depots.find(d => d.id === lot.depot_id);
    const ref = `BE-${new Date().toISOString().slice(0, 10)}-${lot.code.slice(-4)}`;
    triggerExport(`BON D'EXPÉDITION ${ref}`, `
      <div class="summary-card">
        <strong>LOT :</strong> ${lot.code}<br/>
        <strong>ARTICLE :</strong> ${lot.article?.name || 'N/A'}<br/>
        <strong>QUANTITÉ :</strong> ${lot.qty_current} ${lot.unit}<br/>
        <strong>DÉPÔT :</strong> ${lot.depot?.name || depots.find((d: any) => d.id === lot.depot_id)?.name || 'N/A'}<br/>
        <strong>ORIGINE :</strong> ${lot.origin || 'N/A'}<br/>
        <strong>STATUT CQ-LIB :</strong> ${lot.cqlib_status}
      </div>
      <p>Document généré le ${new Date().toLocaleString('fr-FR')} par ${profile?.full_name || 'Système'}.</p>
    `);
  };

  if (lotsLoading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <LoadingSpinner size="large" color={C.green} />
      </View>
    );
  }

  return (
    <AnimatedPage>
      <ExportOverlay visible={exporting} progress={progress} />
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <View style={[s.headerRow, isMobile && { flexDirection: 'column', alignItems: 'flex-start', gap: 16 }]}>
          <View>
            <Text style={s.title}>{t('shipping_title')}</Text>
            <Text style={s.subTitle}>{t('shipping_sub')}</Text>
          </View>
          <View style={s.actions}>
            {canPerformAction('create_be') && (
              <ActionButton label="Nouveau BE" icon="truck-plus" variant="primary" onPress={() => { setSelId(null); handleCreateBe(null); }} />
            )}
          </View>
        </View>

        <View style={[s.grid, isMobile && { flexDirection: 'column' }]}>
          <KpiCard label="PF Disponibles" value={String(pfLots.length)} sub="Lots libérés" color={C.ok} />
          <KpiCard label="MP Disponibles" value={String(mpLots.length)} sub="Lots libérés" color={C.info} />
          <KpiCard
            label="Total Articles"
            value={String(articles.filter(a => a.article_type === typeFilter).length)}
            sub={typeFilter === 'PF' ? 'PF actifs' : 'MP actifs'}
            color={C.gold}
          />
        </View>

        <View style={{ height: 24 }} />

        <View style={s.filterRow}>
          <TypeFilterChip label="Produits Finis" count={pfLots.length} active={typeFilter === 'PF'} onPress={() => setTypeFilter('PF')} />
          <TypeFilterChip label="Matières Premières" count={mpLots.length} active={typeFilter === 'MP'} onPress={() => setTypeFilter('MP')} />
        </View>

        <SectionTitle>{typeFilter === 'PF' ? 'LOTS PRODUITS FINIS DISPONIBLES' : 'LOTS MATIÈRES PREMIÈRES DISPONIBLES'}</SectionTitle>
        <View style={s.tableContainer}>
          {filteredLots.length === 0 ? (
            <View style={s.emptyState}>
              <MaterialCommunityIcons name="package-variant-closed" size={64} color="#E9ECEF" />
              <Text style={s.emptyText}>{typeFilter === 'PF' ? t('shipping_no_lots') : 'Aucun lot de matière première libéré disponible.'}</Text>
            </View>
          ) : (
            <DataTable
              data={filteredLots}
              columns={[
                { key: 'code', label: 'Lot', flex: 1 },
                { key: 'article', label: 'Article', flex: 1.5, render: (item: any) => <Text style={s.tableCellText}>{item.article?.name || 'N/A'}</Text> },
                { key: 'qty_current', label: 'Qté', flex: 0.8, render: (item: any) => <Text style={s.tableCellText}>{item.qty_current} {item.unit}</Text> },
                { key: 'depot_id', label: 'Dépôt', flex: 1, render: (item: any) => {
                  // Utilise le join depot (depuis useLots) sinon fallback sur depots[]
                  const d = item.depot || depots.find((dep: any) => dep.id === item.depot_id);
                  return <Text style={s.tableCellText}>{d?.code || d?.name || 'N/A'}</Text>;
                }},
                { key: 'reception_date', label: 'Date', flex: 0.8, render: (item: any) => <Text style={s.tableCellText}>{new Date(item.reception_date).toLocaleDateString()}</Text> },
                { key: 'pdf', label: '', flex: 0.4, render: (item: any) => (
                  <TouchableOpacity onPress={() => generateBePdf(item)}>
                    <MaterialCommunityIcons name="file-pdf-box" size={22} color={C.err} />
                  </TouchableOpacity>
                )},
                { key: 'delete', label: '', flex: 0.4, render: (item: any) => (
                  canPerformAction('create_be') ? (
                    <TouchableOpacity
                      onPress={() => handleDeleteLot(item)}
                      disabled={deletingId === item.id}
                      style={{ opacity: deletingId === item.id ? 0.4 : 1, padding: 4 }}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={20} color={C.err} />
                    </TouchableOpacity>
                  ) : null
                )},
              ]}
              onRowPress={(item) => { setSelId(item.id); handleCreateBe(item.id); }}
            />
          )}
          <PaginationControls currentPage={page} totalItems={lotsCount} limit={limit} onPageChange={setPage} loading={lotsLoading} />
        </View>
      </ScrollView>

      <FormModal
        visible={modalVisible}
        title="Nouveau Bon d'Expédition"
        onClose={() => setModalVisible(false)}
        onSave={handleSaveBe}
        loading={mutation.isPending}
      >
        <Text style={s.modalFilterLabel}>Filtrer la liste des lots</Text>
        <View style={s.modalFilterRow}>
          <TouchableOpacity
            onPress={() => {
              setBeTypeFilter('ALL');
              setFormData((f: any) => ({ ...f, lot_id: '' }));
            }}
            style={[s.modalChip, beTypeFilter === 'ALL' && s.modalChipActive]}
          >
            <Text style={[s.modalChipText, beTypeFilter === 'ALL' && s.modalChipTextActive]}>Tous</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setBeTypeFilter('PF');
              setFormData((f: any) => ({ ...f, lot_id: '' }));
            }}
            style={[s.modalChip, beTypeFilter === 'PF' && s.modalChipActive]}
          >
            <Text style={[s.modalChipText, beTypeFilter === 'PF' && s.modalChipTextActive]}>Produits Finis</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setBeTypeFilter('MP');
              setFormData((f: any) => ({ ...f, lot_id: '' }));
            }}
            style={[s.modalChip, beTypeFilter === 'MP' && s.modalChipActive]}
          >
            <Text style={[s.modalChipText, beTypeFilter === 'MP' && s.modalChipTextActive]}>Matières Premières</Text>
          </TouchableOpacity>
        </View>

        <FormSelect
          label="Lot à expédier"
          value={formData.lot_id ?? ''}
          options={lots
            .filter(l => l.article?.article_type === 'PF' || l.article?.article_type === 'MP')
            .filter(l => beTypeFilter === 'ALL' || l.article?.article_type === beTypeFilter)
            .map(l => ({
              label: `${l.code} - ${l.article?.name || ''} (${l.article?.article_type === 'MP' ? 'MP' : 'PF'})`,
              value: l.id,
            }))}
          onSelect={v => setFormData({ ...formData, lot_id: v })}
        />
        <FormInput label="Quantité" value={formData.qty ?? ''} onChangeText={val => setFormData({ ...formData, qty: val })} keyboardType="decimal-pad" />
        <FormSelect
          label="Dépôt de destination"
          value={formData.depot_to_id ?? ''}
          options={depots.map(d => ({ label: `${d.code} - ${d.name}`, value: d.id }))}
          onSelect={v => setFormData({ ...formData, depot_to_id: v })}
        />
        <FormInput label="Notes" value={formData.notes ?? ''} onChangeText={val => setFormData({ ...formData, notes: val })} multiline />
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
  filterRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E9ECEF',
  },
  chipActive: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  chipText: { fontSize: 13, fontWeight: '700', color: '#6C757D' },
  chipTextActive: { color: '#FFF' },
  chipBadge: { backgroundColor: '#F1F3F5', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1, minWidth: 20, alignItems: 'center' },
  chipBadgeActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  chipBadgeText: { fontSize: 11, fontWeight: '800', color: '#6C757D' },
  chipBadgeTextActive: { color: '#FFF' },
  modalFilterLabel: { fontSize: 12, fontWeight: '700', color: '#6C757D', marginBottom: 8, textTransform: 'uppercase' },
  modalFilterRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  modalChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: '#F1F3F5', borderWidth: 1, borderColor: '#E9ECEF' },
  modalChipActive: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  modalChipText: { fontSize: 12, fontWeight: '700', color: '#6C757D' },
  modalChipTextActive: { color: '#FFF' },
});
