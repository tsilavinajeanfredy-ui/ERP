import * as React from 'react';
import { ScrollView, StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Alert, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, KpiCard, AnimatedPage, Badge, ActionButton, FormModal, FormInput } from '../components/Ui';
import { useInstruments } from '../lib/hooks';
import { useTranslation } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { generatePdf, getPdfTemplate } from '../lib/pdf';
import { useQueryClient } from '@tanstack/react-query';

export function MetrologyScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const { data: instruments = [], isPending: loading } = useInstruments();
  const queryClient = useQueryClient();

  const { t } = useTranslation();
  const [selectedInst, setSelectedInst] = React.useState<any | null>(null);
  const [testModalVisible, setTestModalVisible] = React.useState(false);
  const [calibrating, setCalibrating] = React.useState(false);

  // Essais de calibration
  const [standardWeight, setStandardWeight] = React.useState('500.00');
  const [trials, setTrials] = React.useState(['', '', '', '', '']);

  const instOk = instruments.filter(i => i.status === 'ETALONNE');
  const instAlert = instruments.filter(i => i.status === 'ECHU' || i.status === 'A_ETALONNER');

  const handleStartCalibration = (inst: any) => {
    setSelectedInst(inst);
    setStandardWeight(inst.tolerance ? '100.00' : '500.00');
    setTrials(['', '', '', '', '']);
    setTestModalVisible(true);
  };

  const handleSaveCalibration = async () => {
    if (!selectedInst) return;
    const stdVal = parseFloat(standardWeight);
    if (isNaN(stdVal) || stdVal <= 0) {
      Alert.alert('Valeur invalide', 'Veuillez saisir une valeur cible standard valide.');
      return;
    }

    const valTrials = trials.map(t => parseFloat(t));
    if (valTrials.some(isNaN)) {
      Alert.alert('Essais incomplets', 'Veuillez saisir les résultats pour les 5 essais requis.');
      return;
    }

    // Calculs de métrologie
    const sum = valTrials.reduce((s, v) => s + v, 0);
    const avg = sum / valTrials.length;
    
    // Écart-type (Standard Deviation)
    const squareDiffs = valTrials.map(value => Math.pow(value - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((s, v) => s + v, 0) / squareDiffs.length;
    const stdDev = Math.sqrt(avgSquareDiff);

    // Écart maximum
    const maxError = Math.max(...valTrials.map(v => Math.abs(v - stdVal)));
    const toleranceLimit = selectedInst.tolerance || 0.05;
    const isConforming = maxError <= toleranceLimit;

    setCalibrating(true);
    try {
      if (!supabase) throw new Error('Supabase non configuré');

      const nextDueDate = new Date();
      nextDueDate.setMonth(nextDueDate.getMonth() + 6); // Prochain étalonnage dans 6 mois

      // Mettre à jour le statut de l'instrument
      const { error: instErr } = await supabase
        .from('instruments')
        .update({
          status: isConforming ? 'ETALONNE' : 'ECHU',
          last_calibration_at: new Date().toISOString(),
          next_calibration_at: nextDueDate.toISOString(),
        })
        .eq('id', selectedInst.id);

      if (instErr) throw instErr;

      // Ajouter au journal d'étalonnage
      await supabase.from('calibration_log').insert({
        instrument_id: selectedInst.id,
        calibration_date: new Date().toISOString().split('T')[0],
        next_due_date: nextDueDate.toISOString().split('T')[0],
        result: isConforming ? 'CONFORME' : 'NON_CONFORME',
        notes: `Test Standard ${stdVal}g. Moyenne: ${avg.toFixed(3)}g. Écart max: ${maxError.toFixed(3)}g. Écart-type: ${stdDev.toFixed(4)}.`,
      });

      // Générer le certificat PDF d'étalonnage officiel
      const html = getPdfTemplate(
        `CERTIFICAT D'ÉTALONNAGE - GSI METROLOGIE`,
        `<div style="text-align:center; margin-bottom:20px;">
          <h2 style="color:#28A745; margin-bottom:5px;">CERTIFICAT DE CONFORMITÉ & D'ÉTALONNAGE</h2>
          <span style="font-size:10pt; color:#666;">Laboratoire National de Métrologie Sipromad GSI</span>
        </div>
        <table style="width:100%; border-collapse:collapse; margin-bottom:25px;">
          <tr style="background:#F8F9FA;">
            <th style="padding:8px; border:1px solid #E9ECEF; text-align:left;">Code Instrument</th>
            <td style="padding:8px; border:1px solid #E9ECEF;">${selectedInst.code}</td>
          </tr>
          <tr>
            <th style="padding:8px; border:1px solid #E9ECEF; text-align:left;">Désignation</th>
            <td style="padding:8px; border:1px solid #E9ECEF;">${selectedInst.name}</td>
          </tr>
          <tr style="background:#F8F9FA;">
            <th style="padding:8px; border:1px solid #E9ECEF; text-align:left;">Type / Spécification</th>
            <td style="padding:8px; border:1px solid #E9ECEF;">${selectedInst.type || 'Sartorius'}</td>
          </tr>
          <tr>
            <th style="padding:8px; border:1px solid #E9ECEF; text-align:left;">Norme de Tolérance</th>
            <td style="padding:8px; border:1px solid #E9ECEF;">± ${toleranceLimit} g</td>
          </tr>
        </table>

        <h3 style="border-bottom:1px solid #28A745; padding-bottom:5px; color:#28A745;">Résultats des Mesures & Essais</h3>
        <table style="width:100%; border-collapse:collapse; margin-bottom:25px; text-align:center;">
          <thead>
            <tr style="background:#E2F6E9;">
              <th style="padding:8px; border:1px solid #28A745;">Cible Standard</th>
              <th style="padding:8px; border:1px solid #28A745;">Essai 1</th>
              <th style="padding:8px; border:1px solid #28A745;">Essai 2</th>
              <th style="padding:8px; border:1px solid #28A745;">Essai 3</th>
              <th style="padding:8px; border:1px solid #28A745;">Essai 4</th>
              <th style="padding:8px; border:1px solid #28A745;">Essai 5</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:8px; border:1px solid #E9ECEF; font-weight:700;">${stdVal} g</td>
              ${valTrials.map(t => `<td style="padding:8px; border:1px solid #E9ECEF;">${t} g</td>`).join('')}
            </tr>
          </tbody>
        </table>

        <h3 style="border-bottom:1px solid #28A745; padding-bottom:5px; color:#28A745;">Analyse Statistique & Jugement</h3>
        <table style="width:100%; border-collapse:collapse; margin-bottom:25px;">
          <tr>
            <th style="padding:8px; border:1px solid #E9ECEF; text-align:left; width:50%;">Moyenne des mesures :</th>
            <td style="padding:8px; border:1px solid #E9ECEF; font-weight:700;">${avg.toFixed(3)} g</td>
          </tr>
          <tr>
            <th style="padding:8px; border:1px solid #E9ECEF; text-align:left;">Écart Maximum constaté :</th>
            <td style="padding:8px; border:1px solid #E9ECEF; font-weight:700; color: ${isConforming ? '#28A745' : '#DC3545'};">${maxError.toFixed(3)} g</td>
          </tr>
          <tr>
            <th style="padding:8px; border:1px solid #E9ECEF; text-align:left;">Écart-Type calculé (σ) :</th>
            <td style="padding:8px; border:1px solid #E9ECEF;">${stdDev.toFixed(4)}</td>
          </tr>
          <tr style="background:#E2F6E9;">
            <th style="padding:8px; border:1px solid #E9ECEF; text-align:left;">JUGEMENT MÉTROLOGIQUE :</th>
            <td style="padding:8px; border:1px solid #E9ECEF; font-weight:800; color:#1E7E34;">
              ${isConforming ? 'CONFORME (APTE AUX ESSAIS DE LABORATOIRE CQ)' : 'NON CONFORME (HORS SPÉCIFICATION)'}
            </td>
          </tr>
        </table>

        <div style="margin-top:30px; font-size:9pt; color:#666; text-align:center;">
          Certificat n° CER-MET-${selectedInst.code}-${Math.floor(Math.random() * 1000)} émis le ${new Date().toLocaleDateString('fr-FR')}.<br/>
          <strong>Prochaine date limite d'étalonnage obligatoire :</strong> ${nextDueDate.toLocaleDateString('fr-FR')}
        </div>`,
        { orientation: 'portrait', watermark: isConforming ? 'CONFORME' : 'ALERTE HORS CQ' }
      );
      generatePdf(html, `Certificat_Etalonnage_${selectedInst.code}.pdf`);

      Alert.alert(
        isConforming ? 'Calibration Conforme' : 'Calibration Non-Conforme',
        isConforming
          ? `L'instrument ${selectedInst.name} est validé conforme. Le certificat PDF a été généré.`
          : `L'instrument ${selectedInst.name} est hors tolérance (${maxError.toFixed(3)}g > limit ${toleranceLimit}g). Il a été bloqué qualité.`
      );

      queryClient.invalidateQueries({ queryKey: ['instruments'] });
      setTestModalVisible(false);
      setSelectedInst(null);
    } catch (err: any) {
      Alert.alert('Erreur', err.message || 'Impossible d\'enregistrer les résultats d\'étalonnage');
    } finally {
      setCalibrating(false);
    }
  };

  return (
    <AnimatedPage>
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <View style={s.header}>
          <Text style={s.title}>{t('metrology_title')}</Text>
          <Text style={s.subTitle}>{t('metrology_sub')}</Text>
        </View>

        <View style={[s.grid, isMobile && { flexDirection: 'column' }]}>
          <KpiCard label="Instruments OK" value={String(instOk.length)} sub="Étalonnés conformes" color={C.ok} />
          <KpiCard label="Échus / Alertes" value={String(instAlert.length)} sub="À étalonner d'urgence" color={instAlert.length > 0 ? C.err : C.ok} />
          <KpiCard label="Total Parc" value={String(instruments.length)} sub="Appareils de mesure" color={C.info} />
        </View>

        <View style={s.mainLayout}>
          <View style={{ flex: 1 }}>
            <Text style={s.sectionTitle}>{t('metrology_instruments_section')}</Text>
            {loading ? (
              <ActivityIndicator size="large" color={C.green} />
            ) : instruments.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <MaterialCommunityIcons name="scale" size={48} color="#E9ECEF" />
                <Text style={{ marginTop: 16, color: '#888', fontSize: 14 }}>{t('metrology_no_instruments')}</Text>
              </View>
            ) : (
              <View style={s.tableCard}>
                <View style={[s.tr, { backgroundColor: '#F8F9FA', borderBottomWidth: 2, borderBottomColor: '#E9ECEF' }]}>
                  <Text style={[s.th, { flex: 1.2 }]}>Code</Text>
                  <Text style={[s.th, { flex: 2 }]}>Instrument</Text>
                  <Text style={[s.th, { flex: 1 }]}>Dernier Test</Text>
                  <Text style={[s.th, { flex: 1 }]}>Date Limite</Text>
                  <Text style={[s.th, { flex: 1, textAlign: 'right' }]}>Tolérance</Text>
                  <Text style={[s.th, { flex: 0.8, textAlign: 'right' }]}>Action</Text>
                </View>
                {instruments.map((inst: any, idx: number) => (
                  <View key={inst.id} style={[s.tr, idx === instruments.length - 1 && { borderBottomWidth: 0 }]}>
                    <Text style={[s.td, { flex: 1.2, fontWeight: '700' }]}>{inst.code}</Text>
                    <View style={{ flex: 2 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#1A1A1A' }}>{inst.name}</Text>
                      <Text style={{ fontSize: 11, color: '#6C757D' }}>Type : {inst.type || 'Sartorius'}</Text>
                    </View>
                    <Text style={[s.td, { flex: 1 }]}>{inst.last_calibration_at ? new Date(inst.last_calibration_at).toLocaleDateString('fr-FR') : '—'}</Text>
                    <Text style={[s.td, { flex: 1, color: inst.status !== 'ETALONNE' ? C.err : '#1A1A1A' }]}>
                      {inst.next_calibration_at ? new Date(inst.next_calibration_at).toLocaleDateString('fr-FR') : '—'}
                    </Text>
                    <Text style={[s.td, { flex: 1, textAlign: 'right', fontWeight: '700' }]}>± {inst.tolerance || 0.05} g</Text>
                    <View style={{ flex: 0.8, alignItems: 'flex-end' }}>
                      <ActionButton
                        label="Étalonner"
                        icon="calculator"
                        variant="secondary"
                        onPress={() => handleStartCalibration(inst)}
                      />
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Calibration Test Modal */}
      {selectedInst && (
        <FormModal
          visible={testModalVisible}
          title={`Essais d'Étalonnage - ${selectedInst.name}`}
          onClose={() => setTestModalVisible(false)}
          onSave={handleSaveCalibration}
          loading={calibrating}
        >
          <View style={{ backgroundColor: '#FFF9E6', padding: 12, borderRadius: 8, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MaterialCommunityIcons name="shield-check" size={24} color="#856404" />
            <Text style={{ fontSize: 12, color: '#856404', fontWeight: '600', flex: 1 }}>
              NORMES ISO 9001 : Effectuez 5 mesures successives de la masse étalon de référence pour confirmer la répétabilité et la conformité.
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
            <View style={{ flex: 1 }}>
              <FormInput
                label="Valeur Étalon Référence (g)"
                value={standardWeight}
                onChangeText={t => setStandardWeight(t)}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#1A1A1A' }}>Tolérance Spécifiée :</Text>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#007BFF', marginTop: 4 }}>± {selectedInst.tolerance || 0.05} g</Text>
            </View>
          </View>

          <Text style={{ fontSize: 12, fontWeight: '800', color: '#1A1A1A', marginBottom: 8 }}>Saisie des 5 Essais de pesée (g) :</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            {trials.map((trial, index) => (
              <View key={index} style={{ flex: 1 }}>
                <FormInput
                  label={`E${index + 1}`}
                  value={trial}
                  onChangeText={t => {
                    const newTrials = [...trials];
                    newTrials[index] = t;
                    setTrials(newTrials);
                  }}
                  keyboardType="numeric"
                  placeholder="0.00"
                />
              </View>
            ))}
          </View>
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
  mainLayout: { flexDirection: 'row', gap: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#1A1A1A', marginBottom: 12 },
  tableCard: { backgroundColor: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#E9ECEF', overflow: 'hidden' },
  tr: { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F8F9FA', alignItems: 'center' },
  th: { fontSize: 10, fontWeight: '800', color: '#ADB5BD', letterSpacing: 1 },
  td: { fontSize: 13, color: '#1A1A1A' },
});
