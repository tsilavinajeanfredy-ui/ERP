import * as React from 'react';
import { ScrollView, StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, useWindowDimensions, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, KpiCard, ActionButton, AnimatedPage, FormModal, FormInput, FormSelect, SectionTitle, DataTable, PaginationControls, ExportOverlay } from '../components/Ui';
import { useLots, useArticles, useDepots, useUserProfile, useMutation, usePermissions, useExport } from '../lib/hooks';
import { useTranslation } from '../lib/i18n';
import { useSearch } from '../lib/search';

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
  const { data: articles = [] } = useArticles();
  const { data: depots = [] } = useDepots();

  const [selId, setSelId] = React.useState<string | null>(null);
  const [modalVisible, setModalVisible] = React.useState(false);
  const [formData, setFormData] = React.useState<any>({});

  const mutation = useMutation('stock_movements', () => { setModalVisible(false); setSelId(null); });

  const pfLots = lots.filter(l => l.article?.article_type === 'PF');
  const mpLots = lots.filter(l => l.article?.article_type === 'MP');

  const filteredLots = pfLots.filter(l => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return l.code.toLowerCase().includes(q) || l.article?.name?.toLowerCase().includes(q) || l.article?.code?.toLowerCase().includes(q);
  });

  React.useEffect(() => { setPage(0); }, [searchQuery]);

  const handleCreateBe = () => {
    setFormData({
      lot_id: selId,
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
        <strong>DÉPÔT :</strong> ${depot?.name || 'N/A'}<br/>
        <strong>ORIGINE :</strong> ${lot.origin || 'N/A'}<br/>
        <strong>STATUT CQ-LIB :</strong> ${lot.cqlib_status}
      </div>
      <p>Document généré le ${new Date().toLocaleString('fr-FR')} par ${profile?.full_name || 'Système'}.</p>
    `);
  };

  if (lotsLoading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={C.green} />
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
              <ActionButton label="Nouveau BE" icon="truck-plus" variant="primary" onPress={() => setSelId(null)} />
            )}
          </View>
        </View>

        <View style={[s.grid, isMobile && { flexDirection: 'column' }]}>
          <KpiCard label="PF Disponibles" value={String(pfLots.length)} sub="Lots libérés" color={C.ok} />
          <KpiCard label="MP Disponibles" value={String(mpLots.length)} sub="Lots libérés" color={C.info} />
          <KpiCard label="Total Articles" value={String(articles.filter(a => a.article_type === 'PF').length)} sub="PF actifs" color={C.gold} />
        </View>

        <View style={{ height: 24 }} />

        <SectionTitle>LOTS PRODUITS FINIS DISPONIBLES</SectionTitle>
        <View style={s.tableContainer}>
          {filteredLots.length === 0 ? (
            <View style={s.emptyState}>
              <MaterialCommunityIcons name="package-variant-closed" size={64} color="#E9ECEF" />
              <Text style={s.emptyText}>{t('shipping_no_lots')}</Text>
            </View>
          ) : (
            <DataTable
              data={filteredLots}
              columns={[
                { key: 'code', label: 'Lot', flex: 1 },
                { key: 'article', label: 'Article', flex: 1.5, render: (item: any) => <Text style={s.tableCellText}>{item.article?.name || 'N/A'}</Text> },
                { key: 'qty_current', label: 'Qté', flex: 0.8, render: (item: any) => <Text style={s.tableCellText}>{item.qty_current} {item.unit}</Text> },
                { key: 'depot_id', label: 'Dépôt', flex: 1, render: (item: any) => {
                  const d = depots.find(dep => dep.id === item.depot_id);
                  return <Text style={s.tableCellText}>{d?.code || 'N/A'}</Text>;
                }},
                { key: 'reception_date', label: 'Date', flex: 0.8, render: (item: any) => <Text style={s.tableCellText}>{new Date(item.reception_date).toLocaleDateString()}</Text> },
                { key: 'actions', label: '', flex: 0.5, render: (item: any) => (
                  <TouchableOpacity onPress={() => generateBePdf(item)}>
                    <MaterialCommunityIcons name="file-pdf-box" size={22} color={C.err} />
                  </TouchableOpacity>
                )},
              ]}
              onRowPress={(item) => { setSelId(item.id); handleCreateBe(); }}
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
        <FormSelect
          label="Lot à expédier"
          value={formData.lot_id ?? ''}
          options={lots.filter(l => l.article?.article_type === 'PF').map(l => ({ label: `${l.code} - ${l.article?.name || ''}`, value: l.id }))}
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
});
