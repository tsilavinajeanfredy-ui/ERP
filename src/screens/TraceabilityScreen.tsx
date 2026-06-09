import * as React from 'react';
import { ScrollView, StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Alert, Platform} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, AnimatedPage, FormSelect, Badge, ActionButton, FormModal, FormInput } from '../components/Ui';
import { useLots, useLotGenealogy, useLotDownstream, useRecallLot } from '../lib/hooks';
import { generatePdf, getPdfTemplate } from '../lib/pdf';
import { useTranslation } from '../lib/i18n';


export function TraceabilityScreen() {
  const { data: lots = [] } = useLots(0, 999);
  const { t } = useTranslation();
  const [selLotId, setSelLotId] = React.useState<string | null>(null);
  const { data: genealogy, isPending: genLoading } = useLotGenealogy(selLotId ?? undefined);
  const { data: downstream = [], isPending: downLoading } = useLotDownstream(selLotId ?? undefined);

  // États pour la procédure de rappel (Recall Management)
  const [recallModalVisible, setRecallModalVisible] = React.useState(false);
  const [recallData, setRecallData] = React.useState<any>({
    reason: '',
    severity: 'CRITIQUE',
  });
  const recallMutation = useRecallLot();


  return (
    <AnimatedPage>
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <View style={s.header}>
          <View>
            <Text style={s.title}>{t('trace_title')}</Text>
            <Text style={s.subTitle}>{t('trace_sub')}</Text>
          </View>
        </View>

        <View style={{ marginBottom: 24 }}>
          <FormSelect
            label="Sélectionner un lot"
            value={selLotId ?? ''}
            options={lots.map(l => ({ label: `${l.code} - ${l.article?.name || ''} (${l.qty_current} ${l.unit})`, value: l.id }))}
            onSelect={v => setSelLotId(v)}
          />
        </View>

        {genLoading || downLoading ? (
          <ActivityIndicator size="large" color={C.green} />
        ) : selLotId && genealogy ? (() => {
          return (
            <View style={s.mainLayout}>
              {/* Left Column: Visual Tree Visualization */}
              <View style={s.treeContainer}>
                <Text style={s.sectionTitle}>{t('trace_tree_title')}</Text>
                
                {/* 1. Parent Node (Upstream) */}
                {genealogy.parent_lot_id ? (
                  <View style={s.nodeGroup}>
                    <TouchableOpacity 
                      style={[s.treeNode, s.parentLabelNode]}
                      onPress={() => setSelLotId(genealogy.parent_lot_id!)}
                    >
                      <View style={s.nodeHeader}>
                        <MaterialCommunityIcons name="arrow-up-bold-box-outline" size={16} color="#007BFF" />
                        <Text style={s.nodeBadgeText}>{t('trace_parent_badge')}</Text>
                      </View>
                      <Text style={s.nodeCode}>{genealogy.parent_lot_code}</Text>
                      <Text style={s.nodeArticle}>{genealogy.parent_article_name}</Text>
                      <Text style={s.nodeSub}>{genealogy.parent_article_code}</Text>
                    </TouchableOpacity>
                    
                    {/* Visual Connection Line */}
                    <View style={s.connectorLine} />
                    <MaterialCommunityIcons name="chevron-down" size={20} color="#007BFF" style={{ marginTop: -8, marginBottom: 4 }} />
                  </View>
                ) : (
                  <View style={s.nodeGroup}>
                    <View style={[s.treeNode, s.emptyNode]}>
                      <Text style={s.emptyNodeText}>{t('trace_no_parent')}</Text>
                    </View>
                    <View style={s.connectorLineDashed} />
                    <MaterialCommunityIcons name="chevron-down" size={20} color="#ADB5BD" style={{ marginTop: -8, marginBottom: 4 }} />
                  </View>
                )}

                {/* 2. Active Node (Center) */}
                <View style={s.nodeGroup}>
                  <View style={[s.treeNode, s.activeNode]}>
                    <View style={s.nodeHeaderActive}>
                      <MaterialCommunityIcons name="target" size={16} color="#FFF" />
                      <Text style={s.nodeBadgeTextActive}>{t('trace_current_badge')}</Text>
                    </View>
                    <Text style={[s.nodeCode, { color: '#FFF' }]}>{genealogy.lot_code}</Text>
                    <Text style={[s.nodeArticle, { color: '#FFF' }]}>{genealogy.article_name}</Text>
                    <Text style={[s.nodeSub, { color: '#E9ECEF' }]}>{genealogy.article_code} · {genealogy.qty_current} {genealogy.unit}</Text>
                  </View>
                  
                  {/* Connector leading downstream */}
                  <View style={s.connectorLine} />
                  <MaterialCommunityIcons name="chevron-down" size={20} color="#28A745" style={{ marginTop: -8, marginBottom: 4 }} />
                </View>

                {/* 3. Downstream Nodes (Children) */}
                {downstream.length > 0 ? (
                  <View style={{ width: '100%', gap: 12 }}>
                    <Text style={s.downstreamHeader}>{t('trace_downstream_header')} ({downstream.length})</Text>
                    <View style={s.childrenGrid}>
                      {downstream.map((child) => (
                        <TouchableOpacity
                          key={child.lot_id}
                          style={[s.treeNode, s.childNodeNode]}
                          onPress={() => setSelLotId(child.lot_id)}
                        >
                          <View style={s.nodeHeader}>
                            <MaterialCommunityIcons name="arrow-down-bold-box-outline" size={16} color="#28A745" />
                            <Text style={[s.nodeBadgeText, { color: '#28A745' }]}>{t('trace_downstream_badge')}</Text>
                          </View>
                          <Text style={s.nodeCode}>{child.lot_code}</Text>
                          <Text style={s.nodeArticle}>{child.article_name}</Text>
                          <Text style={s.nodeSub}>{child.article_code} · {child.qty_current} {child.unit}</Text>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                            <Badge label={child.cqlib_status} color={child.cqlib_status === 'LIBERE' ? C.ok : child.cqlib_status === 'BLOQUE' ? C.err : C.gold} />
                            <MaterialCommunityIcons name="arrow-right" size={16} color="#28A745" />
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : (
                  <View style={[s.treeNode, s.emptyNode]}>
                    <Text style={s.emptyNodeText}>{t('trace_no_downstream')}</Text>
                  </View>
                )}
              </View>

              {/* Right Column: Fiche Lot (Detailed properties) */}
              <View style={s.detailsContainer}>
                <View style={s.card}>
                  <Text style={s.cardTitle}>{t('trace_info_title')}</Text>
                  <View style={s.infoGrid}>
                    <View style={s.infoItem}>
                      <Text style={s.infoLabel}>{t('trace_unique_code')}</Text>
                      <Text style={s.infoValue}>{genealogy.lot_code}</Text>
                    </View>
                    <View style={s.infoItem}>
                      <Text style={s.infoLabel}>Article</Text>
                      <Text style={s.infoValue}>{genealogy.article_name} ({genealogy.article_code})</Text>
                    </View>
                    <View style={s.infoItem}>
                      <Text style={s.infoLabel}>{t('trace_article_type')}</Text>
                      <Text style={s.infoValue}>{genealogy.article_type}</Text>
                    </View>
                    <View style={s.infoItem}>
                      <Text style={s.infoLabel}>{t('trace_current_stock')}</Text>
                      <Text style={s.infoValue}>{genealogy.qty_current} {genealogy.unit}</Text>
                    </View>
                    <View style={s.infoItem}>
                      <Text style={s.infoLabel}>{t('trace_quality_status')}</Text>
                      <Badge label={genealogy.cqlib_status} color={genealogy.cqlib_status === 'LIBERE' ? C.ok : genealogy.cqlib_status === 'BLOQUE' ? C.err : C.gold} />
                    </View>
                    <View style={s.infoItem}>
                      <Text style={s.infoLabel}>Origine</Text>
                      <Text style={s.infoValue}>{genealogy.origin || 'Achat extérieur'}</Text>
                    </View>
                    <View style={s.infoItem}>
                      <Text style={s.infoLabel}>Date Réception</Text>
                      <Text style={s.infoValue}>{new Date(genealogy.reception_date).toLocaleDateString('fr-FR')}</Text>
                    </View>
                    <View style={s.infoItem}>
                      <Text style={s.infoLabel}>Fournisseur</Text>
                      <Text style={s.infoValue}>{genealogy.supplier_name || '—'}</Text>
                    </View>
                    <View style={s.infoItem}>
                      <Text style={s.infoLabel}>Dépôt / Silo</Text>
                      <Text style={s.infoValue}>{genealogy.depot_name || '—'} ({genealogy.depot_code})</Text>
                    </View>
                    <View style={s.infoItem}>
                      <Text style={s.infoLabel}>N° Ordre Fab.</Text>
                      <Text style={s.infoValue}>{genealogy.production_order_code || '—'}</Text>
                    </View>
                  </View>

                  <View style={{ marginTop: 20, gap: 12 }}>
                    <ActionButton
                      label="Lancer Procédure de Rappel"
                      icon="alert-octagon"
                      variant="primary"
                      color={C.err}
                      onPress={() => {
                        setRecallData({
                          reason: '',
                          severity: 'CRITIQUE',
                        });
                        setRecallModalVisible(true);
                      }}
                    />
                  </View>
                </View>
              </View>
            </View>
          );
        })() : selLotId ? (
          <Text style={{ color: '#888', textAlign: 'center', padding: 40 }}>Lot non trouvé</Text>
        ) : (
          <View style={s.emptyState}>
            <MaterialCommunityIcons name="family-tree" size={48} color="#E9ECEF" />
            <Text style={s.emptyText}>Sélectionnez un lot pour afficher sa traçabilité</Text>
          </View>
        )}
      </ScrollView>

      {/* Modale de Procédure de Rappel / Retrait */}
      {selLotId && genealogy && (
        <FormModal
          visible={recallModalVisible}
          title={`Rappel & Retrait Urgent - Lot ${genealogy.lot_code}`}
          onClose={() => setRecallModalVisible(false)}
          onSave={() => {
            if (!recallData.reason) {
              Alert.alert('Motif requis', 'Veuillez saisir le motif du rappel de lot.');
              return;
            }
            const childLotIds = downstream.map(d => d.lot_id);
            recallMutation.mutate({
              lotId: selLotId,
              childLotIds,
              reason: recallData.reason,
              severity: recallData.severity,
            }, {
              onSuccess: () => {
                // Générer également le PDF d'alerte officielle de retrait
                const rows = downstream.map(d => `
                  <tr>
                    <td>${d.lot_code}</td>
                    <td>${d.article_name}</td>
                    <td class="text-right">${d.qty_current} ${d.unit}</td>
                    <td>${d.depot_name || '—'}</td>
                  </tr>`).join('');

                const html = getPdfTemplate(
                  `AVIS DE RETRAIT URGENT - ${genealogy.lot_code}`,
                  `<p style="font-size:12pt; color:#DC3545; font-weight:700; margin-bottom:20px;">
                    ALERTE RAPPEL SANITAIRE / QUALITÉ - DIFFUSION IMMÉDIATE
                  </p>
                  <div style="background:#FFF5F5; border:1px solid #DC3545; padding:15px; border-radius:6px; margin-bottom:20px;">
                    <strong>Article d'origine :</strong> ${genealogy.article_name} (${genealogy.article_code})<br/>
                    <strong>N° de Lot initial incriminé :</strong> ${genealogy.lot_code}<br/>
                    <strong>Motif du retrait :</strong> ${recallData.reason}<br/>
                    <strong>Niveau d'Urgence :</strong> ${recallData.severity}
                  </div>
                  <h3 style="border-bottom:1px solid #DC3545; padding-bottom:5px; color:#DC3545;">Lots descendants à bloquer immédiatement en stock</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Code Lot</th><th>Désignation Article</th><th class="text-right">Quantité</th><th>Dépôt/Emplacement</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td class="bold">${genealogy.lot_code} (Initial)</td>
                        <td>${genealogy.article_name}</td>
                        <td class="text-right bold">${genealogy.qty_current} ${genealogy.unit}</td>
                        <td>${genealogy.depot_name || '—'}</td>
                      </tr>
                      ${rows}
                    </tbody>
                  </table>
                  <p style="margin-top:30px; font-size:9pt; color:#666; font-style:italic;">
                    Procédure émise automatiquement par le pôle Traçabilité & Qualité ERP GSI le ${new Date().toLocaleDateString('fr-FR')}.
                  </p>`,
                  { orientation: 'portrait', watermark: 'RAPPEL CRITIQUE' }
                );
                generatePdf(html, `Avis_Retrait_${genealogy.lot_code}.pdf`);

                Alert.alert('Rappel Initié', `Le lot ${genealogy.lot_code} et ses ${childLotIds.length} sous-lots ont été bloqués avec succès. La Fiche de Non-Conformité (FNC) a été créée.`);
                setRecallModalVisible(false);
              }
            });
          }}
          loading={recallMutation.isPending}
        >
          <View style={{ backgroundColor: '#FDEAEA', padding: 12, borderRadius: 8, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MaterialCommunityIcons name="alert-octagon" size={24} color="#DC3545" />
            <Text style={{ fontSize: 12, color: '#DC3545', fontWeight: '700', flex: 1 }}>
              DANGER : Cette action va bloquer instantanément en stock le lot sélectionné ainsi que tous les lots dérivés.
            </Text>
          </View>

          <FormInput
            label="Motif du Rappel (Contamination, écart physico-chimique...)"
            value={recallData.reason ?? ''}
            onChangeText={val => setRecallData({ ...recallData, reason: val })}
            placeholder="ex: Contamination microbiologique détectée au laboratoire"
            multiline
          />

          <FormSelect
            label="Gravité du Rappel"
            value={recallData.severity ?? ''}
            options={[
              { label: 'CRITIQUE (Retrait immédiat sous 2h + Alerte)', value: 'CRITIQUE' },
              { label: 'MAJEUR (Retrait sous 24h)', value: 'MAJEUR' },
            ]}
            onSelect={v => setRecallData({ ...recallData, severity: v })}
          />

          <View style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 }}>
              Lots impactés par cette procédure ({1 + downstream.length}) :
            </Text>
            <View style={{ backgroundColor: '#F8F9FA', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E9ECEF', gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#DC3545' }}>• {genealogy.lot_code} (Lot Initial - {genealogy.article_name})</Text>
              {downstream.map(d => (
                <Text key={d.lot_id} style={{ fontSize: 12, color: '#495057' }}>
                  • {d.lot_code} (Lot dérivé - {d.article_name})
                </Text>
              ))}
            </View>
          </View>
        </FormModal>
      )}
    </AnimatedPage>
  );
}


const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },
  subTitle: { fontSize: 13, color: '#6C757D', marginTop: 2 },
  card: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E9ECEF', padding: 20, marginBottom: 20 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  infoGrid: { marginTop: 16 },
  infoItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F8F9FA' },
  infoLabel: { fontSize: 12, fontWeight: '700', color: '#ADB5BD', width: 120 },
  infoValue: { fontSize: 13, fontWeight: '600', color: '#1A1A1A', flex: 1, textAlign: 'right' },
  emptyState: { padding: 40, alignItems: 'center' },
  emptyText: { marginTop: 16, fontSize: 14, color: '#888', textAlign: 'center' },
  // Interactive Tree Styles
  mainLayout: { flexDirection: 'row', gap: 24, flexWrap: 'wrap' },
  treeContainer: { flex: 1.3, minWidth: 320, backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E9ECEF', padding: 24, alignItems: 'center', gap: 4 },
  detailsContainer: { flex: 1, minWidth: 300 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1A1A1A', marginBottom: 20, alignSelf: 'flex-start' },
  nodeGroup: { alignItems: 'center', width: '100%' },
  treeNode: {
    width: '90%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    backgroundColor: '#F8F9FA',
    gap: 4,
  },
  parentLabelNode: { borderColor: '#CCE5FF', backgroundColor: '#F0F7FF' },
  childNodeNode: { width: '100%', borderColor: '#D4EDDA', backgroundColor: '#F4FBF7' },
  activeNode: {
    width: '95%',
    backgroundColor: '#1A1A1A',
    borderColor: '#1A1A1A',
    ...Platform.select({ web: { boxShadow: '0px 6px 12px rgba(0,0,0,0.15)' }, default: { shadowColor: '#1A1A1A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12 } }),
    elevation: 8,
  },
  emptyNode: { borderColor: '#E9ECEF', backgroundColor: '#F8F9FA', borderStyle: 'dashed', paddingVertical: 12 },
  emptyNodeText: { fontSize: 12, color: '#ADB5BD', fontStyle: 'italic', textAlign: 'center' },
  nodeHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  nodeHeaderActive: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  nodeBadgeText: { fontSize: 9, fontWeight: '800', color: '#007BFF', letterSpacing: 0.5 },
  nodeBadgeTextActive: { fontSize: 9, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 },
  nodeCode: { fontSize: 14, fontWeight: '800', color: '#1A1A1A' },
  nodeArticle: { fontSize: 13, fontWeight: '700', color: '#495057' },
  nodeSub: { fontSize: 11, color: '#6C757D' },
  connectorLine: { width: 2, height: 28, backgroundColor: '#007BFF' },
  connectorLineDashed: { width: 2, height: 28, backgroundColor: '#ADB5BD', borderStyle: 'dashed' },
  downstreamHeader: { fontSize: 12, fontWeight: '800', color: '#ADB5BD', letterSpacing: 0.5, marginTop: 12 },
  childrenGrid: { width: '100%', gap: 12 },
});

