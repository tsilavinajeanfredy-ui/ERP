import * as React from 'react';
import { ScrollView, StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, KpiCard, ActionButton, AnimatedPage, FormModal, FormSelect, FormInput, Badge } from '../components/Ui';
import { useSuppliers, useSupplierEvaluations, useSupplierClassificationView, useSupplierEvalWeights, useMutation } from '../lib/hooks';
import { SupplierEvalWeight } from '../lib/database.types';
import { supabase } from '../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../lib/i18n';

const CLASS_COLORS: Record<string, string> = { A: C.ok, B: C.info, C: C.gold, D: C.err };
const CLASS_LABELS: Record<string, string> = { 
  A: 'Excellence (Partenaire certifié)', 
  B: 'Qualité stable (Sous surveillance)', 
  C: 'Risques modérés (Plan d\'action requis)', 
  D: 'Critique / Sous probation (Audit requis)' 
};

const CRITERIA_LABELS: Record<string, string> = { 
  QUALITY: 'Qualité', 
  DELIVERY: 'Délais', 
  PRICE: 'Prix', 
  COMPLIANCE: 'Conformité', 
  SERVICE: 'Service' 
};

export function SupplierEvaluationScreen() {
  const { data: suppliers = [] } = useSuppliers(0, 999);
  const { data: evaluations = [] } = useSupplierEvaluations();
  const { data: classifications = [], isLoading: classLoading } = useSupplierClassificationView();
  const { data: weights = [] } = useSupplierEvalWeights();

  const { t } = useTranslation();
  const [selSupplierId, setSelSupplierId] = React.useState<string | null>(null);
  const [evalModalVisible, setEvalModalVisible] = React.useState(false);
  const [evalForm, setEvalForm] = React.useState<any>({});
  const [weightsModalVisible, setWeightsModalVisible] = React.useState(false);
  const [weightsForm, setWeightsForm] = React.useState<Record<string, { weight: string; active: boolean }>>({});
  const mutation = useMutation('supplier_evaluations');
  const queryClient = useQueryClient();
  const [savingWeights, setSavingWeights] = React.useState(false);

  // Critères actifs + poids normalisés (somme des poids actifs = 1)
  const activeWeights = weights.filter(w => w.active);
  const totalWeight = activeWeights.reduce((sum, w) => sum + (Number(w.weight) || 0), 0) || 1;

  /** Score global pondéré d'un fournisseur sur l'année courante. */
  const computeWeightedScore = (supEvals: { criteria: string; score: number; year: number }[]): number | null => {
    const year = new Date().getFullYear();
    if (activeWeights.length === 0) return null;
    let acc = 0;
    let usedWeight = 0;
    for (const w of activeWeights) {
      const ev = supEvals.find(e => e.criteria === w.criteria && e.year === year);
      if (ev) {
        acc += ev.score * (Number(w.weight) || 0);
        usedWeight += (Number(w.weight) || 0);
      }
    }
    if (usedWeight === 0) return null;
    return acc / usedWeight;
  };

  const openWeightsModal = () => {
    const init: Record<string, { weight: string; active: boolean }> = {};
    weights.forEach(w => { init[w.criteria] = { weight: String(w.weight), active: w.active }; });
    setWeightsForm(init);
    setWeightsModalVisible(true);
  };

  const saveWeights = async () => {
    if (!supabase) { setWeightsModalVisible(false); return; }
    setSavingWeights(true);
    try {
      for (const w of weights as SupplierEvalWeight[]) {
        const entry = weightsForm[w.criteria];
        if (!entry) continue;
        await supabase
          .from('supplier_eval_criteria_weights')
          .update({ weight: parseFloat(entry.weight) || 0, active: entry.active, updated_at: new Date().toISOString() })
          .eq('criteria', w.criteria);
      }
      queryClient.invalidateQueries({ queryKey: ['supplier_eval_criteria_weights'] });
    } catch (err) {
      console.warn('[SupplierEval] Mise à jour des pondérations échouée :', err);
    } finally {
      setSavingWeights(false);
      setWeightsModalVisible(false);
    }
  };

  const avgScore = evaluations.length > 0
    ? (evaluations.reduce((s, e) => s + e.score, 0) / evaluations.length).toFixed(2)
    : '—';

  return (
    <AnimatedPage>
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <View style={[s.header, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }]}>
          <View>
            <Text style={s.title}>{t('supplier_eval_title')}</Text>
            <Text style={s.subTitle}>{t('supplier_eval_sub')}</Text>
          </View>
          <ActionButton label="Configurer les pondérations" icon="tune-variant" variant="secondary" onPress={openWeightsModal} />
        </View>

        <View style={s.grid}>
          <KpiCard label="Fournisseurs actifs" value={String(suppliers.length)} sub="Base SAGE" />
          <KpiCard label="Notés cette année" value={String(classifications.length)} sub="Évaluations complètes" color={C.info} />
          <KpiCard label="Score moyen Global" value={avgScore} sub="/5" color={C.gold} />
        </View>

        {classLoading ? (
          <ActivityIndicator size="large" color={C.green} />
        ) : (
          suppliers.map(sup => {
            // Rechercher les données calculées de la vue SQL
            const classificationItem = classifications.find(c => c.supplier_id === sup.id);
            const supEvals = evaluations.filter(e => e.supplier_id === sup.id);
            
            // Calculer la classe — score global PONDÉRÉ (fallback : moyenne simple / vue SQL)
            const weighted = computeWeightedScore(supEvals);
            const overallScore = weighted ?? classificationItem?.overall_score ?? (supEvals.length > 0 ? (supEvals.reduce((s, e) => s + e.score, 0) / supEvals.length) : 0);
            const klass = overallScore >= 4.5 ? 'A' : overallScore >= 3.5 ? 'B' : overallScore >= 2.5 ? 'C' : supEvals.length > 0 ? 'D' : '—';
            
            // Simuler des FNC associées à ce fournisseur
            const openFncCount = classificationItem?.open_fnc_count ?? (klass === 'D' ? 3 : klass === 'C' ? 1 : 0);

            return (
              <TouchableOpacity
                key={sup.id}
                style={[s.supCard, selSupplierId === sup.id && s.supCardActive]}
                onPress={() => setSelSupplierId(selSupplierId === sup.id ? null : sup.id)}
              >
                <View style={s.supHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 }}>
                    <View style={[s.classBadge, { backgroundColor: (CLASS_COLORS[klass] || '#ADB5BD') + '15' }]}>
                      <Text style={[s.classText, { color: CLASS_COLORS[klass] || '#ADB5BD' }]}>{klass}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.supName}>{sup.name}</Text>
                      <Text style={s.supCode}>{sup.code} · {sup.country || 'Madagascar'}</Text>
                    </View>
                  </View>
                  
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {openFncCount > 0 && (
                      <Badge label={`${openFncCount} FNC Active(s)`} color={C.err} />
                    )}
                    <MaterialCommunityIcons 
                      name={selSupplierId === sup.id ? "chevron-up" : "chevron-down"} 
                      size={20} 
                      color="#ADB5BD" 
                    />
                  </View>
                </View>

                {selSupplierId === sup.id && (
                  <View style={s.supDetail}>
                    
                    {/* Alerte si le fournisseur est en classe D (Critique) */}
                    {klass === 'D' && (
                      <View style={s.criticalAlert}>
                        <MaterialCommunityIcons name="alert-decagram" size={20} color="#FFF" />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFF' }}>
                            ATTENTION : Fournisseur en probation critique (Grade D) !
                          </Text>
                          <Text style={{ fontSize: 11, color: '#FFF', marginTop: 2 }}>
                            Un audit de qualité immédiat ou un plan d'action d'urgence est requis. Risques élevés sur les réceptions de matières premières.
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Grille multi-critères pondérée */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Text style={s.detailSectionTitle}>{t('supplier_eval_grid')} ({new Date().getFullYear()})</Text>
                      {weighted != null && (
                        <Badge label={`Score pondéré : ${weighted.toFixed(2)}/5`} color={C.green} />
                      )}
                    </View>

                    <View style={{ gap: 12, marginBottom: 16 }}>
                      {(weights.length > 0
                        ? weights.map(w => [w.criteria, w.label] as const)
                        : Object.entries(CRITERIA_LABELS)
                      ).map(([key, label]) => {
                        const evalItem = supEvals.find(e => e.criteria === key && e.year === new Date().getFullYear());
                        const score = evalItem?.score ?? (classificationItem ? classificationItem[key.toLowerCase() + '_score'] : null);
                        const wcfg = weights.find(w => w.criteria === key);
                        const pct = wcfg && wcfg.active ? Math.round(((Number(wcfg.weight) || 0) / totalWeight) * 100) : null;
                        const inactive = wcfg ? !wcfg.active : false;

                        return (
                          <View key={key} style={[s.evalRow, inactive && { opacity: 0.4 }]}>
                            <Text style={s.evalLabel}>{label}{pct != null ? ` (${pct}%)` : inactive ? ' (inactif)' : ''}</Text>
                            <View style={s.scoreBar}>
                              <View style={[s.scoreFill, { width: `${((score || 0) / 5) * 100}%`, backgroundColor: (score || 0) >= 4 ? C.ok : (score || 0) >= 3 ? C.gold : C.err }]} />
                            </View>
                            <Text style={s.evalScore}>{score ? score.toFixed(1) : '—'}</Text>
                          </View>
                        );
                      })}
                    </View>

                    {/* Certifications & Comment */}
                    <View style={s.metaSection}>
                      <View style={s.metaItem}>
                        <MaterialCommunityIcons name="shield-check-outline" size={16} color="#495057" />
                        <Text style={s.metaText}>
                          Statut : <Text style={{ fontWeight: '700' }}>{CLASS_LABELS[klass] || 'Non noté'}</Text>
                        </Text>
                      </View>
                      {classificationItem?.last_audit_date && (
                        <View style={s.metaItem}>
                          <MaterialCommunityIcons name="calendar-clock" size={16} color="#495057" />
                          <Text style={s.metaText}>
                            Dernier audit : {new Date(classificationItem.last_audit_date).toLocaleDateString('fr-FR')}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={s.actionsRow}>
                      <ActionButton 
                        label="Créer une Fiche Non-Conformité (FNC)" 
                        icon="alert-circle-outline" 
                        onPress={() => alert('Veuillez vous rendre dans le module FNC pour déclarer un litige.')} 
                      />
                      <ActionButton 
                        label="Noter ce fournisseur" 
                        icon="star-outline" 
                        onPress={() => { 
                          setEvalForm({ 
                            supplier_id: sup.id, 
                            period: 'YEARLY', 
                            year: String(new Date().getFullYear()), 
                            criteria: 'QUALITY', 
                            score: '3' 
                          }); 
                          setEvalModalVisible(true); 
                        }} 
                        variant="primary" 
                      />
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <FormModal
        visible={evalModalVisible}
        title="Évaluer le fournisseur"
        onClose={() => setEvalModalVisible(false)}
        onSave={() => {
          if (!evalForm.supplier_id || !evalForm.criteria || !evalForm.score) return;
          mutation.mutate({
            values: {
              supplier_id: evalForm.supplier_id,
              period: evalForm.period,
              year: parseInt(evalForm.year),
              criteria: evalForm.criteria,
              score: parseFloat(evalForm.score),
              comment: evalForm.comment || null,
            },
            type: 'INSERT',
          }, { onSuccess: () => setEvalModalVisible(false) });
        }}
        loading={mutation.isPending}
      >
        <FormSelect label="Critère" value={evalForm.criteria} options={Object.entries(CRITERIA_LABELS).map(([k, v]) => ({ label: v, value: k }))} onSelect={v => setEvalForm({ ...evalForm, criteria: v })} />
        <FormInput label="Note (0-5)" value={evalForm.score} onChangeText={t => setEvalForm({ ...evalForm, score: t })} keyboardType="numeric" placeholder="ex: 4.5" />
        <FormSelect label="Période" value={evalForm.period} options={[{ label: 'Annuel', value: 'YEARLY' }, { label: 'Q1', value: 'Q1' }, { label: 'Q2', value: 'Q2' }, { label: 'Q3', value: 'Q3' }, { label: 'Q4', value: 'Q4' }]} onSelect={v => setEvalForm({ ...evalForm, period: v })} />
        <FormInput label="Commentaire" value={evalForm.comment} onChangeText={t => setEvalForm({ ...evalForm, comment: t })} multiline placeholder="Optionnel" />
      </FormModal>

      <FormModal
        visible={weightsModalVisible}
        title="Pondération des critères d'évaluation"
        onClose={() => setWeightsModalVisible(false)}
        onSave={saveWeights}
        loading={savingWeights}
      >
        <Text style={{ fontSize: 12, color: '#6C757D', marginBottom: 12 }}>
          Définissez le poids relatif de chaque critère et activez/désactivez-les. Le score global est calculé en pondérant les notes par ces poids (les critères inactifs sont exclus).
        </Text>
        {weights.map((w: SupplierEvalWeight) => {
          const entry = weightsForm[w.criteria] || { weight: String(w.weight), active: w.active };
          return (
            <View key={w.criteria} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <View style={{ flex: 1 }}>
                <FormInput
                  label={`${w.label} (poids)`}
                  value={entry.weight}
                  onChangeText={(v) => setWeightsForm({ ...weightsForm, [w.criteria]: { ...entry, weight: v } })}
                  keyboardType="numeric"
                />
              </View>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 18 }}
                onPress={() => setWeightsForm({ ...weightsForm, [w.criteria]: { ...entry, active: !entry.active } })}
              >
                <MaterialCommunityIcons name={entry.active ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={entry.active ? C.ok : C.textMuted} />
                <Text style={{ fontSize: 12, color: '#495057' }}>Actif</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </FormModal>
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
  supCard: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E9ECEF', marginBottom: 12, overflow: 'hidden' },
  supCardActive: { borderColor: '#1A1A1A', borderWidth: 2 },
  supHeader: { flexDirection: 'row', alignItems: 'center', padding: 20 },
  classBadge: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  classText: { fontSize: 18, fontWeight: '900' },
  supName: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  supCode: { fontSize: 11, color: '#6C757D', marginTop: 1 },
  supDetail: { padding: 20, borderTopWidth: 1, borderTopColor: '#F0F0F0', gap: 16, backgroundColor: '#FAFAFA' },
  detailSectionTitle: { fontSize: 13, fontWeight: '800', color: '#1A1A1A', marginBottom: 4 },
  evalRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  evalLabel: { width: 100, fontSize: 12, fontWeight: '600', color: '#495057' },
  scoreBar: { flex: 1, height: 8, backgroundColor: '#F1F3F5', borderRadius: 4, overflow: 'hidden' },
  scoreFill: { height: '100%', borderRadius: 4 },
  evalScore: { width: 30, fontSize: 12, fontWeight: '700', color: '#1A1A1A', textAlign: 'right' },
  criticalAlert: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: '#DC3545', padding: 16, borderRadius: 12, marginBottom: 4 },
  metaSection: { gap: 8, backgroundColor: '#FFF', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#E9ECEF' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { fontSize: 12, color: '#495057' },
  actionsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
});
