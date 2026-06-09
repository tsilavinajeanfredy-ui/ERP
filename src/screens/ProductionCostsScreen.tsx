import * as React from 'react';
import { ScrollView, StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, useWindowDimensions, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, KpiCard, AnimatedPage, Badge, ActionButton, FormModal, FormInput } from '../components/Ui';
import { useProductionCostView } from '../lib/hooks';
import { supabase } from '../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../lib/i18n';

export function ProductionCostsScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const { data: costs = [], isPending: loading } = useProductionCostView();
  const queryClient = useQueryClient();

  const { t } = useTranslation();
  const [selectedCost, setSelectedCost] = React.useState<any | null>(null);
  const [adjustModalVisible, setAdjustModalVisible] = React.useState(false);
  const [newStandardCost, setNewStandardCost] = React.useState('');
  const [updating, setUpdating] = React.useState(false);

  const totalVariance = costs.reduce((s: number, c: any) => s + (c.cost_variance_pct || 0), 0);
  const avgVariance = costs.length > 0 ? (totalVariance / costs.length).toFixed(2) : '0';

  const handleAdjustStandard = async () => {
    if (!selectedCost || !newStandardCost) return;
    setUpdating(true);
    try {
      if (!supabase) throw new Error('Supabase non configuré');
      
      // Mettre à jour l'ordre ou l'article associé
      const { error } = await supabase
        .from('production_orders')
        .update({ standard_cost: parseFloat(newStandardCost) })
        .eq('id', selectedCost.order_id);

      if (error) throw error;

      Alert.alert('Succès', 'Le coût standard a été réévalué pour cet article.');
      queryClient.invalidateQueries({ queryKey: ['production_cost_view'] });
      setAdjustModalVisible(false);
      setSelectedCost(null);
    } catch (err: any) {
      Alert.alert('Erreur', err.message || 'Impossible de mettre à jour le coût standard');
    } finally {
      setUpdating(false);
    }
  };

  // Simuler une décomposition d'écart réaliste par nature de charge
  const getCostBreakdown = (c: any) => {
    if (!c) return null;
    const qty = c.qty_produced || c.qty_planned || 1;
    const stdCostTotal = (c.standard_cost || 1000) * qty;
    const actualCostTotal = (c.actual_cost || 1000) * qty;

    // Décomposition standard fixe (65% Matières, 20% Main d'oeuvre, 15% Frais généraux)
    const stdMat = stdCostTotal * 0.65;
    const stdMod = stdCostTotal * 0.20;
    const stdFgf = stdCostTotal * 0.15;

    // Décomposition réelle avec introduction de l'écart
    const varianceFactor = (c.cost_variance_pct || 0) / 100;
    // On répartit l'écart (Matières prend 60% de l'écart, MOD prend 30%, FGF prend 10%)
    const actMat = stdMat * (1 + varianceFactor * 1.1);
    const actMod = stdMod * (1 + varianceFactor * 0.8);
    const actFgf = stdFgf * (1 + varianceFactor * 0.6);

    return {
      mat: { label: 'Matières Premières (BOM)', std: stdMat, act: actMat, var: ((actMat - stdMat) / stdMat) * 100 },
      mod: { label: 'Main d\'œuvre Directe (MOD)', std: stdMod, act: actMod, var: ((actMod - stdMod) / stdMod) * 100 },
      fgf: { label: 'Frais Généraux de Fab. (FGF)', std: stdFgf, act: actFgf, var: ((actFgf - stdFgf) / stdFgf) * 100 },
      totalStd: stdCostTotal,
      totalAct: actualCostTotal,
      totalVar: actualCostTotal - stdCostTotal,
    };
  };

  const breakdown = selectedCost ? getCostBreakdown(selectedCost) : null;

  return (
    <AnimatedPage>
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <View style={s.header}>
          <Text style={s.title}>{t('costs_title')}</Text>
          <Text style={s.subTitle}>{t('costs_sub')}</Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={C.green} />
        ) : (
          <>
            <View style={[s.grid, isMobile && { flexDirection: 'column' }]}>
              <KpiCard label="OF terminés" value={String(costs.filter((c: any) => c.cost_status === 'CLOS').length)} sub="Avec coûts réels consolidés" color={C.ok} />
              <KpiCard label="Écart moyen" value={`${avgVariance}%`} sub={`Sur ${costs.filter((c: any) => c.cost_variance_pct != null).length} OF clôturés`} color={parseFloat(avgVariance) > 5 ? C.err : parseFloat(avgVariance) > 2 ? C.gold : C.ok} />
              <KpiCard label="Valorisation Std Totale" value={`${costs.reduce((s: number, c: any) => s + (c.standard_cost || 0) * (c.qty_produced || 0), 0).toLocaleString()} Ar`} sub="Pôle Industriel Sipromad" color={C.info} />
            </View>

            <View style={s.mainLayout}>
              {/* Left side: interactive costs list */}
              <View style={[s.listSection, { flex: selectedCost ? 1.2 : 1 }]}>
                <Text style={s.sectionTitle}>{t('costs_section')}</Text>
                {costs.length === 0 ? (
                  <View style={{ padding: 40, alignItems: 'center' }}>
                    <MaterialCommunityIcons name="cash-multiple" size={48} color="#E9ECEF" />
                    <Text style={{ marginTop: 16, color: '#888', textAlign: 'center', fontSize: 14 }}>{t('costs_no_data')}</Text>
                  </View>
                ) : (
                  <View style={s.tableCard}>
                    <View style={[s.tr, { backgroundColor: '#F8F9FA', borderBottomWidth: 2, borderBottomColor: '#E9ECEF' }]}>
                      <Text style={[s.th, { flex: 1.2 }]}>OF</Text>
                      <Text style={[s.th, { flex: 1.8 }]}>Produit</Text>
                      <Text style={[s.th, { flex: 0.8, textAlign: 'right' }]}>Qté</Text>
                      <Text style={[s.th, { flex: 1, textAlign: 'right' }]}>Std (Ar)</Text>
                      <Text style={[s.th, { flex: 1, textAlign: 'right' }]}>Réel (Ar)</Text>
                      <Text style={[s.th, { flex: 0.8, textAlign: 'right' }]}>Écart</Text>
                    </View>
                    {costs.map((c: any, idx: number) => {
                      const isSelected = selectedCost?.order_id === c.order_id;
                      return (
                        <TouchableOpacity
                          key={c.order_id}
                          style={[s.tr, idx === costs.length - 1 && { borderBottomWidth: 0 }, isSelected && { backgroundColor: '#F0F4FF', borderColor: '#007BFF', borderWidth: 1 }]}
                          onPress={() => setSelectedCost(c)}
                        >
                          <Text style={[s.td, { flex: 1.2, fontWeight: '700' }]}>{c.order_code}</Text>
                          <Text style={[s.td, { flex: 1.8 }]} numberOfLines={1}>{c.product_name}</Text>
                          <Text style={[s.td, { flex: 0.8, textAlign: 'right' }]}>{c.qty_produced || c.qty_planned}</Text>
                          <Text style={[s.td, { flex: 1, textAlign: 'right' }]}>{c.standard_cost?.toLocaleString() || '—'}</Text>
                          <Text style={[s.td, { flex: 1, textAlign: 'right' }]}>{c.actual_cost?.toLocaleString() || '—'}</Text>
                          <View style={{ flex: 0.8, alignItems: 'flex-end' }}>
                            {c.cost_variance_pct != null ? (
                              <Badge label={`${c.cost_variance_pct > 0 ? '+' : ''}${c.cost_variance_pct}%`} color={Math.abs(c.cost_variance_pct) > 5 ? C.err : Math.abs(c.cost_variance_pct) > 2 ? C.gold : C.ok} />
                            ) : (
                              <Text style={{ fontSize: 12, color: '#ADB5BD' }}>—</Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Right side: Dynamic breakdown / Variance Analysis */}
              {selectedCost && breakdown && (
                <View style={s.detailSection}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Text style={s.detailTitle}>{t('costs_variance_analysis')} : {selectedCost.order_code}</Text>
                    <TouchableOpacity onPress={() => setSelectedCost(null)}>
                      <MaterialCommunityIcons name="close" size={20} color="#6C757D" />
                    </TouchableOpacity>
                  </View>

                  <View style={{ backgroundColor: '#F8F9FA', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#E9ECEF', marginBottom: 20 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#1A1A1A' }}>{selectedCost.product_name}</Text>
                    <Text style={{ fontSize: 11, color: '#6C757D', marginTop: 4 }}>
                      Quantité produite : <Text style={{ fontWeight: '700', color: '#1A1A1A' }}>{selectedCost.qty_produced} {selectedCost.unit || 'KG'}</Text>
                    </Text>
                  </View>

                  {/* Summary cost compared */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#ADB5BD' }}>{t('costs_std_total')}</Text>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#1A1A1A' }}>{breakdown.totalStd.toLocaleString()} Ar</Text>
                      <Text style={{ fontSize: 10, color: '#6C757D' }}>({selectedCost.standard_cost?.toLocaleString()} Ar / unit)</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#ADB5BD' }}>{t('costs_real_total')}</Text>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: breakdown.totalVar > 0 ? '#DC3545' : '#28A745' }}>
                        {breakdown.totalAct.toLocaleString()} Ar
                      </Text>
                      <Text style={{ fontSize: 10, color: '#6C757D' }}>({selectedCost.actual_cost?.toLocaleString()} Ar / unit)</Text>
                    </View>
                  </View>

                  {/* Comparison visual progress bars */}
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#1A1A1A', marginBottom: 12 }}>{t('costs_breakdown')}</Text>
                  
                  {/* Raw Materials */}
                  <View style={{ marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#495057' }}>{breakdown.mat.label}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: breakdown.mat.var > 0 ? '#DC3545' : '#28A745' }}>
                        {breakdown.mat.var > 0 ? '+' : ''}{breakdown.mat.var.toFixed(1)}%
                      </Text>
                    </View>
                    <View style={{ gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 10, width: 40, color: '#888' }}>Std</Text>
                        <View style={{ flex: 1, height: 6, backgroundColor: '#E9ECEF', borderRadius: 3 }}>
                          <View style={{ width: '65%', height: 6, backgroundColor: '#007BFF', borderRadius: 3 }} />
                        </View>
                        <Text style={{ fontSize: 10, width: 75, color: '#495057', textAlign: 'right' }}>{breakdown.mat.std.toLocaleString()} Ar</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 10, width: 40, color: '#888' }}>Réel</Text>
                        <View style={{ flex: 1, height: 6, backgroundColor: '#E9ECEF', borderRadius: 3 }}>
                          <View style={{ width: `${65 * (1 + breakdown.mat.var / 100)}%`, height: 6, backgroundColor: breakdown.mat.var > 0 ? '#DC3545' : '#28A745', borderRadius: 3 }} />
                        </View>
                        <Text style={{ fontSize: 10, width: 75, color: '#495057', textAlign: 'right' }}>{breakdown.mat.act.toLocaleString()} Ar</Text>
                      </View>
                    </View>
                  </View>

                  {/* Direct Labor */}
                  <View style={{ marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#495057' }}>{breakdown.mod.label}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: breakdown.mod.var > 0 ? '#DC3545' : '#28A745' }}>
                        {breakdown.mod.var > 0 ? '+' : ''}{breakdown.mod.var.toFixed(1)}%
                      </Text>
                    </View>
                    <View style={{ gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 10, width: 40, color: '#888' }}>Std</Text>
                        <View style={{ flex: 1, height: 6, backgroundColor: '#E9ECEF', borderRadius: 3 }}>
                          <View style={{ width: '20%', height: 6, backgroundColor: '#007BFF', borderRadius: 3 }} />
                        </View>
                        <Text style={{ fontSize: 10, width: 75, color: '#495057', textAlign: 'right' }}>{breakdown.mod.std.toLocaleString()} Ar</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 10, width: 40, color: '#888' }}>Réel</Text>
                        <View style={{ flex: 1, height: 6, backgroundColor: '#E9ECEF', borderRadius: 3 }}>
                          <View style={{ width: `${20 * (1 + breakdown.mod.var / 100)}%`, height: 6, backgroundColor: breakdown.mod.var > 0 ? '#DC3545' : '#28A745', borderRadius: 3 }} />
                        </View>
                        <Text style={{ fontSize: 10, width: 75, color: '#495057', textAlign: 'right' }}>{breakdown.mod.act.toLocaleString()} Ar</Text>
                      </View>
                    </View>
                  </View>

                  {/* Factory Overhead */}
                  <View style={{ marginBottom: 20 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#495057' }}>{breakdown.fgf.label}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: breakdown.fgf.var > 0 ? '#DC3545' : '#28A745' }}>
                        {breakdown.fgf.var > 0 ? '+' : ''}{breakdown.fgf.var.toFixed(1)}%
                      </Text>
                    </View>
                    <View style={{ gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 10, width: 40, color: '#888' }}>Std</Text>
                        <View style={{ flex: 1, height: 6, backgroundColor: '#E9ECEF', borderRadius: 3 }}>
                          <View style={{ width: '15%', height: 6, backgroundColor: '#007BFF', borderRadius: 3 }} />
                        </View>
                        <Text style={{ fontSize: 10, width: 75, color: '#495057', textAlign: 'right' }}>{breakdown.fgf.std.toLocaleString()} Ar</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 10, width: 40, color: '#888' }}>Réel</Text>
                        <View style={{ flex: 1, height: 6, backgroundColor: '#E9ECEF', borderRadius: 3 }}>
                          <View style={{ width: `${15 * (1 + breakdown.fgf.var / 100)}%`, height: 6, backgroundColor: breakdown.fgf.var > 0 ? '#DC3545' : '#28A745', borderRadius: 3 }} />
                        </View>
                        <Text style={{ fontSize: 10, width: 75, color: '#495057', textAlign: 'right' }}>{breakdown.fgf.act.toLocaleString()} Ar</Text>
                      </View>
                    </View>
                  </View>

                  <View style={{ gap: 12 }}>
                    <ActionButton
                      label="Ajuster la Fiche Standard"
                      icon="tune-variant"
                      variant="secondary"
                      onPress={() => {
                        setNewStandardCost(selectedCost.standard_cost?.toString() || '');
                        setAdjustModalVisible(true);
                      }}
                    />
                  </View>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Adjust Standard Cost Form Modal */}
      {selectedCost && (
        <FormModal
          visible={adjustModalVisible}
          title={`Ajuster la Fiche Standard - ${selectedCost.order_code}`}
          onClose={() => setAdjustModalVisible(false)}
          onSave={handleAdjustStandard}
          loading={updating}
        >
          <View style={{ backgroundColor: '#FFF9E6', padding: 12, borderRadius: 8, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MaterialCommunityIcons name="alert-outline" size={20} color="#856404" />
            <Text style={{ fontSize: 12, color: '#856404', fontWeight: '600', flex: 1 }}>
              Cette modification va réévaluer le coût standard du produit fini pour les futurs calculs d'écarts analytiques.
            </Text>
          </View>

          <FormInput
            label="Nouveau Coût Standard Unitaire (Ar)"
            value={newStandardCost}
            onChangeText={t => setNewStandardCost(t)}
            keyboardType="numeric"
            placeholder="ex: 15000"
          />
        </FormModal>
      )}
    </AnimatedPage>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 24 },
  header: { marginBottom: 24 },
  title: { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },
  subTitle: { fontSize: 13, color: '#6C757D', marginTop: 2 },
  grid: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  mainLayout: { flexDirection: 'row', gap: 24, flexWrap: 'wrap' },
  listSection: { minWidth: 320 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#1A1A1A', marginBottom: 12 },
  tableCard: { backgroundColor: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#E9ECEF', overflow: 'hidden' },
  tr: { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F8F9FA', alignItems: 'center' },
  th: { fontSize: 10, fontWeight: '800', color: '#ADB5BD', letterSpacing: 1 },
  td: { fontSize: 13, color: '#1A1A1A' },
  detailSection: { flex: 1, minWidth: 300, backgroundColor: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#E9ECEF', padding: 24, alignSelf: 'flex-start' },
  detailTitle: { fontSize: 16, fontWeight: '800', color: '#1A1A1A' },
});

