import * as React from 'react';
import {
  ScrollView, StyleSheet, Text, View, TouchableOpacity, Platform
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, AnimatedPage, Badge, KpiCard } from '../components/Ui';
import { useDaImport, useDaLocal } from '../lib/hooks';
import { useTranslation } from '../lib/i18n';
import type { DaImport, DaLocal } from '../lib/database.types';

// ─── Types locaux ─────────────────────────────────────────────────────────────
type PlanType = 'import' | 'local';
type PlanStatut = 'planifie' | 'en_route' | 'arrive' | 'complete';
type Priorite = 'normal' | 'urgent' | 'critique';

interface PlanningItem {
  id: string;
  sourceType: PlanType;
  sourceId: string;
  numero: string;
  supplierName: string;
  supplierId: string;
  articleName: string;
  quantite: number;
  unite: string;
  dateArrivee: string;
  statut: PlanStatut;
  transporteur?: string;
  dock?: string;
  priorite: Priorite;
  // statut local (override UI, non persisté)
  statutLocal?: PlanStatut;
}

const STATUT_META: Record<PlanStatut, { label: string; color: string; icon: string }> = {
  planifie:  { label: 'Planifié',  color: C.info,    icon: 'clock-outline' },
  en_route:  { label: 'En route',  color: C.gold,    icon: 'truck-fast' },
  arrive:    { label: 'Arrivé',    color: C.ok,      icon: 'map-marker-check' },
  complete:  { label: 'Complété',  color: '#888',    icon: 'check-circle-outline' },
};

const PRIORITE_META: Record<Priorite, { color: string }> = {
  normal:   { color: '#888' },
  urgent:   { color: '#F5A623' },
  critique: { color: C.danger },
};

// Convertit un DaImport en PlanningItem
function daImportToItem(da: DaImport): PlanningItem {
  const daStatusToStatut = (): PlanStatut => {
    if (da.status === 'LIVRE' || da.status === 'CLOS') return 'complete';
    const step = da.current_step;
    if (step === 'RECEPTION') return 'arrive';
    if (step === 'ETA' || step === 'CONNAISSEMENT' || step === 'DEDOUANEMENT' || step === 'EXPEDITION') return 'en_route';
    return 'planifie';
  };
  return {
    id: `import-${da.id}`,
    sourceType: 'import',
    sourceId: da.id,
    numero: da.code,
    supplierName: da.supplier?.name || '—',
    supplierId: da.supplier_id,
    articleName: da.article?.name || '—',
    quantite: da.qty_kg || 0,
    unite: 'kg',
    dateArrivee: da.eta_date || new Date().toISOString().split('T')[0],
    statut: daStatusToStatut(),
    priorite: da.status === 'RETARD' ? 'critique' : 'normal',
  };
}

// Convertit un DaLocal en PlanningItem
function daLocalToItem(da: DaLocal): PlanningItem {
  const stepToStatut = (): PlanStatut => {
    if (da.status === 'LIVRE' || da.status === 'CLOS') return 'complete';
    if (da.current_step === 'RECEPTION') return 'arrive';
    if (da.current_step === 'COMMANDE') return 'en_route';
    return 'planifie';
  };
  return {
    id: `local-${da.id}`,
    sourceType: 'local',
    sourceId: da.id,
    numero: da.code,
    supplierName: da.supplier?.name || '—',
    supplierId: da.supplier_id,
    articleName: da.article?.name || '—',
    quantite: da.qty_requested,
    unite: da.unit,
    dateArrivee: (da as any).expected_date || new Date().toISOString().split('T')[0],
    statut: stepToStatut(),
    priorite: da.status === 'RETARD' ? 'critique' : 'normal',
  };
}

// ─── Composant principal ──────────────────────────────────────────────────────
export function PlanningLogistiqueScreen() {

  // Données Supabase
  const { data: daImports = [], isPending: loadingImport } = useDaImport();
  const { data: daLocals = [],  isPending: loadingLocal  } = useDaLocal(0, 100);

  // Construire la liste unifiée
  const allItems: PlanningItem[] = React.useMemo(() => {
    const imports = daImports.map(daImportToItem);
    const locals  = daLocals.map(daLocalToItem);
    return [...imports, ...locals];
  }, [daImports, daLocals]);

  // Overrides de statut local (non persistés — futur: persistance via planning_logistique)
  const { t } = useTranslation();
  const [statutOverrides, setStatutOverrides] = React.useState<Record<string, PlanStatut>>({});

  const items: PlanningItem[] = allItems.map(item => ({
    ...item,
    statut: statutOverrides[item.id] ?? item.statut,
  }));

  const [selectedDate, setSelectedDate] = React.useState<string>('tous');
  const [filterType, setFilterType] = React.useState<string>('tous');
  const [selId, setSelId] = React.useState<string | null>(null);

  // Filtre : date souple (±3j) ou "tous"
  const filtered = items.filter(item => {
    const matchDate = selectedDate === 'tous' || item.dateArrivee === selectedDate;
    const matchType = filterType === 'tous' || item.sourceType === filterType;
    return matchDate && matchType;
  });

  const stats = {
    planifies: filtered.filter(i => i.statut === 'planifie').length,
    enRoute:   filtered.filter(i => i.statut === 'en_route').length,
    arrives:   filtered.filter(i => i.statut === 'arrive').length,
    completes: filtered.filter(i => i.statut === 'complete').length,
  };

  const handleUpdateStatut = (id: string, newStatut: PlanStatut) => {
    setStatutOverrides(prev => ({ ...prev, [id]: newStatut }));
  };

  const loading = loadingImport || loadingLocal;

  const typeColor: Record<PlanType, string> = {
    import: C.info,
    local:  '#9B59B6',
  };
  const typeIcon: Record<PlanType, string> = {
    import: 'ferry',
    local:  'map-marker',
  };
  const typeLabel: Record<PlanType, string> = {
    import: 'IMPORT',
    local:  'LOCAL',
  };

  return (
    <AnimatedPage>
      <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.title}>{t('planning_title')}</Text>
            <Text style={s.subtitle}>{t('planning_sub')}</Text>
          </View>
        </View>

        {/* Date Selector */}
        <View style={s.dateBar}>
          <TouchableOpacity
            style={s.dateArrow}
            onPress={() => {
              if (selectedDate === 'tous') return;
              const d = new Date(selectedDate);
              d.setDate(d.getDate() - 1);
              setSelectedDate(d.toISOString().split('T')[0]);
            }}
          >
            <MaterialCommunityIcons name="chevron-left" size={24} color={C.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSelectedDate(selectedDate === 'tous' ? new Date().toISOString().split('T')[0] : 'tous')} style={{ flex: 1 }}>
            <Text style={s.dateLabel}>
              {selectedDate === 'tous'
                ? 'Toutes les dates'
                : new Date(selectedDate + 'T00:00:00').toLocaleDateString('fr-FR', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                  })}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.dateArrow}
            onPress={() => {
              if (selectedDate === 'tous') return;
              const d = new Date(selectedDate);
              d.setDate(d.getDate() + 1);
              setSelectedDate(d.toISOString().split('T')[0]);
            }}
          >
            <MaterialCommunityIcons name="chevron-right" size={24} color={C.primary} />
          </TouchableOpacity>
        </View>

        {/* Filters */}
        <View style={s.filtersRow}>
          {['tous', 'import', 'local'].map(f => (
            <TouchableOpacity
              key={f}
              style={[s.filterChip, filterType === f && s.filterChipActive]}
              onPress={() => setFilterType(f)}
            >
              <Text style={[s.filterChipText, filterType === f && s.filterChipTextActive]}>
                {f === 'tous' ? 'Tous' : f === 'import' ? 'Import' : 'Local'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* KPIs */}
        <View style={s.kpiRow}>
          <KpiCard label="Planifiés"  value={String(stats.planifies)}  icon="clock-outline"       color={C.info}  />
          <KpiCard label="En Route"   value={String(stats.enRoute)}    icon="truck-fast"           color={C.gold}  />
          <KpiCard label="Arrivés"    value={String(stats.arrives)}    icon="map-marker-check"     color={C.ok}    />
          <KpiCard label="Complétés"  value={String(stats.completes)}  icon="check-circle-outline" color="#888"    />
        </View>

        {/* Liste */}
        {loading ? (
          <View style={s.empty}>
            <Text style={s.emptyText}>{t('loading')}</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={s.empty}>
            <MaterialCommunityIcons name="truck-outline" size={48} color="#CCC" />
            <Text style={s.emptyText}>{t('planning_no_deliveries')}</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => setSelectedDate('tous')}>
              <Text style={s.emptyBtnText}>{t('planning_see_all')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.list}>
            {[...filtered]
              .sort((a, b) => a.dateArrivee.localeCompare(b.dateArrivee))
              .map(item => {
                const isSelected = selId === item.id;
                const sm = STATUT_META[item.statut];
                const pm = PRIORITE_META[item.priorite];

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[s.card, isSelected && s.cardSelected]}
                    onPress={() => setSelId(isSelected ? null : item.id)}
                  >
                    <View style={s.cardTop}>
                      <View style={[s.typeBadge, { backgroundColor: typeColor[item.sourceType] + '20' }]}>
                        <MaterialCommunityIcons name={typeIcon[item.sourceType] as any} size={16} color={typeColor[item.sourceType]} />
                        <Text style={[s.typeText, { color: typeColor[item.sourceType] }]}>
                          {typeLabel[item.sourceType]}
                        </Text>
                      </View>
                      <Text style={s.cardNumero}>{item.numero}</Text>
                      {item.priorite !== 'normal' && (
                        <View style={[s.prioriteBadge, { backgroundColor: pm.color + '20' }]}>
                          <Text style={[s.prioriteText, { color: pm.color }]}>{item.priorite.toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }} />
                      <Badge label={sm.label} color={sm.color} />
                    </View>

                    <Text style={s.cardArticle}>{item.articleName}</Text>
                    <Text style={s.cardParty}>{item.supplierName}</Text>

                    <View style={s.cardMeta}>
                      <View style={s.metaItem}>
                        <MaterialCommunityIcons name="calendar" size={14} color="#888" />
                        <Text style={s.metaText}>
                          {new Date(item.dateArrivee + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        </Text>
                      </View>
                      <View style={s.metaItem}>
                        <MaterialCommunityIcons name="scale" size={14} color="#888" />
                        <Text style={s.metaText}>{item.quantite} {item.unite}</Text>
                      </View>
                    </View>

                    {isSelected && (
                      <View style={s.cardDetail}>
                        <View style={s.detailRow}>
                          <Text style={s.detailLabel}>Fournisseur</Text>
                          <Text style={s.detailValue}>{item.supplierName}</Text>
                        </View>
                        <View style={s.detailRow}>
                          <Text style={s.detailLabel}>Article</Text>
                          <Text style={s.detailValue}>{item.articleName}</Text>
                        </View>
                        <View style={s.detailRow}>
                          <Text style={s.detailLabel}>Réf.</Text>
                          <Text style={[s.detailValue, s.mono]}>{item.numero}</Text>
                        </View>
                        <View style={s.detailRow}>
                          <Text style={s.detailLabel}>ETA</Text>
                          <Text style={s.detailValue}>
                            {new Date(item.dateArrivee + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })}
                          </Text>
                        </View>

                        {/* Mise à jour statut */}
                        {item.statut !== 'complete' && (
                          <View style={s.statutActions}>
                            <Text style={s.detailLabel}>{t('planning_update_status')}</Text>
                            <View style={s.statutBtns}>
                              {(['planifie', 'en_route', 'arrive', 'complete'] as PlanStatut[])
                                .filter(st => st !== item.statut)
                                .map(st => (
                                  <TouchableOpacity
                                    key={st}
                                    style={[s.statutBtn, { borderColor: STATUT_META[st].color }]}
                                    onPress={() => handleUpdateStatut(item.id, st)}
                                  >
                                    <MaterialCommunityIcons
                                      name={STATUT_META[st].icon as any}
                                      size={14}
                                      color={STATUT_META[st].color}
                                    />
                                    <Text style={[s.statutBtnText, { color: STATUT_META[st].color }]}>
                                      {STATUT_META[st].label}
                                    </Text>
                                  </TouchableOpacity>
                                ))}
                            </View>
                          </View>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
          </View>
        )}
      </ScrollView>
    </AnimatedPage>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: C.bg },
  header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 24, paddingBottom: 16 },
  title:           { fontSize: 22, fontWeight: '800', color: C.primary },
  subtitle:        { fontSize: 13, color: '#888', marginTop: 4 },
  dateBar:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginBottom: 16, gap: 12 },
  dateArrow:       { padding: 8, borderRadius: 8, backgroundColor: '#F0F0F0' },
  dateLabel:       { fontSize: 15, fontWeight: '700', color: C.primary, textAlign: 'center', flex: 1 },
  filtersRow:      { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  filterChip:      { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F0F0F0' },
  filterChipActive:     { backgroundColor: C.primary },
  filterChipText:       { fontSize: 13, fontWeight: '600', color: '#666' },
  filterChipTextActive: { color: '#FFF' },
  kpiRow:          { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 12, marginBottom: 16 },
  list:            { paddingHorizontal: 16, gap: 10 },
  card:            { backgroundColor: '#FFF', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E8E8E8' },
  cardSelected:    { borderColor: C.primary, borderWidth: 2 },
  cardTop:         { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  typeBadge:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  typeText:        { fontSize: 11, fontWeight: '800' },
  cardNumero:      { fontSize: 14, fontWeight: '700', color: C.primary },
  prioriteBadge:   { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  prioriteText:    { fontSize: 11, fontWeight: '700' },
  cardArticle:     { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 2 },
  cardParty:       { fontSize: 12, color: '#888', marginBottom: 10 },
  cardMeta:        { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  metaItem:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:        { fontSize: 12, color: '#888' },
  cardDetail:      { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F0F0F0', gap: 8 },
  detailRow:       { flexDirection: 'row', justifyContent: 'space-between' },
  detailLabel:     { fontSize: 13, color: '#888' },
  detailValue:     { fontSize: 13, fontWeight: '600', color: C.primary },
  mono:            { fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier' },
  statutActions:   { marginTop: 8 },
  statutBtns:      { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  statutBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5 },
  statutBtnText:   { fontSize: 12, fontWeight: '700' },
  empty:           { alignItems: 'center', paddingVertical: 60 },
  emptyText:       { fontSize: 15, color: '#AAA', marginTop: 12 },
  emptyBtn:        { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: C.primary, borderRadius: 8 },
  emptyBtnText:    { color: '#FFF', fontWeight: '700' },
});
