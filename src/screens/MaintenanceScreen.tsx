import * as React from 'react';
import { ScrollView, StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Alert, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, KpiCard, AnimatedPage, Badge, ActionButton, FormModal, FormInput, FormSelect } from '../components/Ui';
import { useMaintenanceTasks } from '../lib/hooks';
import { useTranslation } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';

const URGENCY_COLORS: Record<string, string> = { EN_RETARD: C.err, A_FAIRE: C.gold, DANS_TEMPS: C.ok, PLANIFIE: '#ADB5BD' };
const PRIORITY_COLORS: Record<string, string> = { CRITIQUE: C.err, HAUTE: C.gold, NORMAL: C.info, BASSE: '#ADB5BD' };

export function MaintenanceScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const { data: tasks = [], isPending: loading } = useMaintenanceTasks();
  const queryClient = useQueryClient();

  const { t } = useTranslation();
  const [selectedTask, setSelectedTask] = React.useState<any | null>(null);
  const [sosModalVisible, setSosModalVisible] = React.useState(false);
  const [checklist, setChecklist] = React.useState<Record<string, boolean>>({});
  
  // États pour le signalement de panne SOS
  const [sosData, setSosData] = React.useState({
    equipment_name: '',
    equipment_type: 'PRODUCTION',
    description: '',
    priority: 'CRITIQUE',
  });
  const [savingSos, setSavingSos] = React.useState(false);
  const [completingTask, setCompletingTask] = React.useState(false);

  // Champ équipement : liste déroulante + option personnaliser
  const [isCustomEquipment, setIsCustomEquipment] = React.useState(false);
  const [customEquipmentName, setCustomEquipmentName] = React.useState('');

  // Équipements fixes GSI (savon, bougie, encaustique) + ceux déjà en GMAO
  const GSI_EQUIPMENT: { label: string; value: string; group: string }[] = [
    // ── Savon ────────────────────────────────────────────────────────────────
    { label: 'Réacteur de saponification',        value: 'Réacteur de saponification',        group: 'Savon' },
    { label: 'Malaxeur / Pétrisseur savon',        value: 'Malaxeur / Pétrisseur savon',        group: 'Savon' },
    { label: 'Découpeur / Calibreur barres',       value: 'Découpeur / Calibreur barres',       group: 'Savon' },
    { label: 'Mouleuse savon barre',               value: 'Mouleuse savon barre',               group: 'Savon' },
    { label: 'Refroidisseur tunnel savon',         value: 'Refroidisseur tunnel savon',         group: 'Savon' },
    { label: 'Étampeuse / Stampeuse barres',       value: 'Étampeuse / Stampeuse barres',       group: 'Savon' },
    { label: 'Emballeuse savon',                   value: 'Emballeuse savon',                   group: 'Savon' },
    // ── Bougie ───────────────────────────────────────────────────────────────
    { label: 'Fondoir cire (tank chauffant)',      value: 'Fondoir cire (tank chauffant)',      group: 'Bougie' },
    { label: 'Pompe doseuse / Remplisseuse',       value: 'Pompe doseuse / Remplisseuse',       group: 'Bougie' },
    { label: 'Convoyeur de refroidissement',       value: 'Convoyeur de refroidissement',       group: 'Bougie' },
    { label: 'Machine mèche / Mèchage',            value: 'Machine mèche / Mèchage',            group: 'Bougie' },
    { label: 'Machine emballage bougie',           value: 'Machine emballage bougie',           group: 'Bougie' },
    // ── Encaustique ──────────────────────────────────────────────────────────
    { label: 'Cuve de mélange chauffante',         value: 'Cuve de mélange chauffante',         group: 'Encaustique' },
    { label: 'Agitateur mécanique encaustique',    value: 'Agitateur mécanique encaustique',    group: 'Encaustique' },
    { label: 'Conditionneuse pots / bidons',       value: 'Conditionneuse pots / bidons',       group: 'Encaustique' },
    { label: 'Étiqueteuse automatique',            value: 'Étiqueteuse automatique',            group: 'Encaustique' },
    // ── Utilités communes ────────────────────────────────────────────────────
    { label: 'Chaudière vapeur principale',        value: 'Chaudière vapeur principale',        group: 'Utilités' },
    { label: 'Compresseur air comprimé',           value: 'Compresseur air comprimé',           group: 'Utilités' },
    { label: 'Groupe électrogène',                 value: 'Groupe électrogène',                 group: 'Utilités' },
    { label: 'Système traitement eau',             value: 'Système traitement eau',             group: 'Utilités' },
    { label: 'Pompe de transfert matière',         value: 'Pompe de transfert matière',         group: 'Utilités' },
    { label: 'Groupe froid / Climatisation',       value: 'Groupe froid / Climatisation',       group: 'Utilités' },
    // ── Laboratoire ──────────────────────────────────────────────────────────
    { label: 'Étuve de séchage labo',              value: 'Étuve de séchage labo',              group: 'Laboratoire' },
    { label: 'Balance analytique',                 value: 'Balance analytique',                 group: 'Laboratoire' },
    { label: 'pH-mètre',                           value: 'pH-mètre',                           group: 'Laboratoire' },
    { label: 'Viscosimètre',                       value: 'Viscosimètre',                       group: 'Laboratoire' },
  ];

  const equipmentOptions = React.useMemo(() => {
    const seen = new Set<string>();
    const opts: { label: string; value: string }[] = [];

    // 1. Équipements déjà en GMAO (depuis les tâches existantes)
    for (const task of tasks) {
      const name = (task.equipment_name || '').trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        opts.push({ label: name, value: name });
      }
    }

    // 2. Équipements GSI fixes (si pas déjà dans la GMAO)
    for (const eq of GSI_EQUIPMENT) {
      if (!seen.has(eq.value)) {
        seen.add(eq.value);
        opts.push({ label: `[${eq.group}] ${eq.label}`, value: eq.value });
      }
    }

    // 3. Option saisie libre en bas
    opts.push({ label: '➕  Autre / Personnaliser...', value: '__CUSTOM__' });
    return opts;
  }, [tasks]);

  const overdue = tasks.filter((t: any) => t.urgency === 'EN_RETARD');
  const dueSoon = tasks.filter((t: any) => t.urgency === 'A_FAIRE');

  const handleTaskPress = (task: any) => {
    setSelectedTask(task);
    // Initialiser une checklist standard pour l'intervention préventive
    setChecklist({
      'Nettoyage et vidange complets': false,
      'Contrôle de lubrification et des niveaux': false,
      'Vérification des connexions électriques': false,
      'Test de sécurité et d\'arrêt d\'urgence': false,
    });
  };

  const toggleChecklistItem = (item: string) => {
    setChecklist(prev => ({ ...prev, [item]: !prev[item] }));
  };

  const handleCompleteTask = async () => {
    if (!selectedTask) return;
    const allChecked = Object.values(checklist).every(v => v);
    if (!allChecked) {
      Alert.alert('Checklist incomplète', 'Veuillez valider toutes les étapes de maintenance préventive avant de certifier l\'intervention.');
      return;
    }

    setCompletingTask(true);
    try {
      if (!supabase) throw new Error('Supabase non configuré');

      // Calculer la prochaine échéance en fonction de la fréquence
      const nextDue = new Date();
      nextDue.setDate(nextDue.getDate() + (selectedTask.frequency_days || 30));

      const { error } = await supabase
        .from('maintenance_tasks')
        .update({
          last_performed_at: new Date().toISOString(),
          next_due_at: nextDue.toISOString(),
          status: 'PLANIFIE',
        })
        .eq('id', selectedTask.id);

      if (error) throw error;

      Alert.alert('Intervention Validée', `Maintenance préventive complétée pour ${selectedTask.equipment_name}. Prochaine échéance planifiée au ${nextDue.toLocaleDateString('fr-FR')}.`);
      queryClient.invalidateQueries({ queryKey: ['maintenance_calendar_view'] });
      setSelectedTask(null);
    } catch (err: any) {
      Alert.alert('Erreur', err.message || 'Impossible d\'enregistrer l\'intervention');
    } finally {
      setCompletingTask(false);
    }
  };

  const handleSendSos = async () => {
    const finalEquipmentName = isCustomEquipment ? customEquipmentName.trim() : sosData.equipment_name;
    if (!finalEquipmentName || !sosData.description) {
      Alert.alert('Champs obligatoires', 'Veuillez saisir le nom de l\'équipement en panne et la description du défaut.');
      return;
    }

    setSavingSos(true);
    try {
      if (!supabase) throw new Error('Supabase non configuré');

      const randomId = Math.floor(Math.random() * 9000 + 1000).toString();
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('maintenance_tasks')
        .insert({
          code: `MT-SOS-${randomId}`,
          equipment_name: finalEquipmentName,
          equipment_type: sosData.equipment_type,
          description: `[SOS CURATIF] ${sosData.description}`,
          priority: sosData.priority,
          // 'urgency' est un champ calculé dans la VIEW maintenance_calendar_view, pas une colonne réelle
          frequency_days: 0,
          status: 'EN_COURS',        // Panne = intervention immédiate EN_COURS
          next_due_at: now,
          last_performed_at: null,
        });

      if (error) throw error;

      // Notifier l'équipe maintenance
      try {
        await supabase.from('notifications').insert([
          {
            role: 'ADMIN',
            title: '🚨 SOS PANNE — ' + finalEquipmentName,
            message: `Panne signalée sur ${finalEquipmentName} (${sosData.equipment_type}). Priorité : ${sosData.priority}. Détail : ${sosData.description}`,
            type: 'error',
            metadata: { screen: 'MaintenanceScreen', equipment: finalEquipmentName, category: 'MAINTENANCE' },
          },
        ]);
      } catch (_) { /* notifications non bloquantes */ }

      Alert.alert('🚨 SOS Transmis', `Panne signalée pour : ${finalEquipmentName}\n\nL'équipe de maintenance curative a été alertée.`);
      queryClient.invalidateQueries({ queryKey: ['maintenance_calendar_view'] });
      setSosModalVisible(false);
      setSosData({ equipment_name: '', equipment_type: 'PRODUCTION', description: '', priority: 'CRITIQUE' });
      setIsCustomEquipment(false);
      setCustomEquipmentName('');
    } catch (err: any) {
      Alert.alert('Erreur', err.message || 'Impossible de signaler la panne');
    } finally {
      setSavingSos(false);
    }
  };

  return (
    <AnimatedPage>
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <View style={s.header}>
          <View>
            <Text style={s.title}>{t('maintenance_title')}</Text>
            <Text style={s.subTitle}>{t('maintenance_sub')}</Text>
          </View>
          <ActionButton
            label="SOS PANNE / CURATIF"
            icon="alert-circle"
            variant="primary"
            color={C.err}
            onPress={() => setSosModalVisible(true)}
          />
        </View>

        <View style={[s.grid, isMobile && { flexDirection: 'column' }]}>
          <KpiCard label="En retard" value={String(overdue.length)} sub="Interventions urgentes" color={overdue.length > 0 ? C.err : C.ok} />
          <KpiCard label="À faire (7j)" value={String(dueSoon.length)} sub="Échéances imminentes" color={dueSoon.length > 0 ? C.gold : C.ok} />
          <KpiCard label="Disponibilité GMAO" value={`${Math.round(((tasks.length - overdue.length) / (tasks.length || 1)) * 100)}%`} sub="Taux de conformité" color={C.ok} />
        </View>

        <View style={s.mainLayout}>
          {/* Tâches Planifiées */}
          <View style={[s.listSection, { flex: selectedTask ? 1.2 : 1 }]}>
            <Text style={s.sectionTitle}>{t('maintenance_calendar')}</Text>
            {loading ? (
              <ActivityIndicator size="large" color={C.green} />
            ) : tasks.length === 0 ? (
              <View style={{ padding: 60, alignItems: 'center' }}>
                <MaterialCommunityIcons name="wrench-outline" size={64} color="#E9ECEF" />
                <Text style={{ marginTop: 16, color: '#888', fontSize: 14 }}>{t('maintenance_no_tasks')}</Text>
              </View>
            ) : (
              <View style={s.tableCard}>
                <View style={[s.tr, { backgroundColor: '#F8F9FA', borderBottomWidth: 2, borderBottomColor: '#E9ECEF' }]}>
                  <Text style={[s.th, { flex: 1.5 }]}>Équipement</Text>
                  <Text style={[s.th, { flex: 1 }]}>{t('maintenance_frequency')}</Text>
                  <Text style={[s.th, { flex: 1 }]}>{t('maintenance_next')}</Text>
                  <Text style={[s.th, { flex: 0.7, textAlign: 'right' }]}>{t('maintenance_priority')}</Text>
                  <Text style={[s.th, { flex: 0.7, textAlign: 'right' }]}>{t('maintenance_urgency')}</Text>
                </View>
                {[...overdue, ...dueSoon, ...tasks.filter((t: any) => t.urgency === 'DANS_TEMPS' || t.urgency === 'PLANIFIE')].map((t: any, idx: number) => {
                  const isSelected = selectedTask?.id === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[s.tr, idx === tasks.length - 1 && { borderBottomWidth: 0 }, isSelected && { backgroundColor: '#FFF5F5', borderColor: C.err, borderWidth: 1 }]}
                      onPress={() => handleTaskPress(t)}
                    >
                      <View style={{ flex: 1.5 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#1A1A1A' }}>{t.equipment_name}</Text>
                        <Text style={{ fontSize: 11, color: '#6C757D' }}>{t.code} · {t.equipment_type || '—'}</Text>
                      </View>
                      <Text style={[s.td, { flex: 1 }]}>{t.frequency_days === 0 ? 'SOS Panne' : `${t.frequency_days}j`}</Text>
                      <Text style={[s.td, { flex: 1 }]}>{t.next_due_at ? new Date(t.next_due_at).toLocaleDateString('fr-FR') : '—'}</Text>
                      <View style={{ flex: 0.7, alignItems: 'flex-end' }}>
                        <Badge label={t.priority} color={PRIORITY_COLORS[t.priority] || '#ADB5BD'} />
                      </View>
                      <View style={{ flex: 0.7, alignItems: 'flex-end' }}>
                        <Badge label={t.urgency} color={URGENCY_COLORS[t.urgency] || '#ADB5BD'} />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* Fiche d'Intervention Préventive */}
          {selectedTask && (
            <View style={s.detailSection}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={s.detailTitle}>{t('maintenance_intervention_title')}</Text>
                <TouchableOpacity onPress={() => setSelectedTask(null)}>
                  <MaterialCommunityIcons name="close" size={20} color="#6C757D" />
                </TouchableOpacity>
              </View>

              <View style={{ backgroundColor: '#F8F9FA', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#E9ECEF', marginBottom: 20 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#1A1A1A' }}>{selectedTask.equipment_name}</Text>
                <Text style={{ fontSize: 11, color: '#6C757D', marginTop: 4 }}>
                  Code GMAO : <Text style={{ fontWeight: '700', color: '#1A1A1A' }}>{selectedTask.code}</Text> · Type : {selectedTask.equipment_type}
                </Text>
              </View>

              {selectedTask.description && (
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#ADB5BD', marginBottom: 4 }}>DESCRIPTION DE LA TÂCHE :</Text>
                  <Text style={{ fontSize: 13, color: '#495057', fontStyle: 'italic' }}>{selectedTask.description}</Text>
                </View>
              )}

              {/* Checklist GMAO */}
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#1A1A1A', marginBottom: 12 }}>{t('maintenance_checklist')}</Text>
              <View style={{ gap: 8, marginBottom: 24 }}>
                {Object.keys(checklist).map(item => {
                  const isChecked = checklist[item];
                  return (
                    <TouchableOpacity
                      key={item}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: isChecked ? '#E2F6E9' : '#FFF', borderRadius: 8, borderWidth: 1, borderColor: isChecked ? '#28A745' : '#E9ECEF' }}
                      onPress={() => toggleChecklistItem(item)}
                    >
                      <MaterialCommunityIcons name={isChecked ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"} size={20} color={isChecked ? "#28A745" : "#ADB5BD"} />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: isChecked ? '#1E7E34' : '#495057', flex: 1 }}>{item}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <ActionButton
                label="Signer et Clôturer l'Intervention"
                icon="check-decagram"
                variant="primary"
                onPress={handleCompleteTask}
                loading={completingTask}
              />
            </View>
          )}
        </View>
      </ScrollView>

      {/* SOS Panne / Curatif Modal */}
      <FormModal
        visible={sosModalVisible}
        title="SIGNALER PANNE / RETRAIT SOS URGENT"
        onClose={() => setSosModalVisible(false)}
        onSave={handleSendSos}
        loading={savingSos}
      >
        <View style={{ backgroundColor: '#FDEAEA', padding: 12, borderRadius: 8, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <MaterialCommunityIcons name="alert-decagram" size={24} color="#DC3545" />
          <Text style={{ fontSize: 12, color: '#DC3545', fontWeight: '700', flex: 1 }}>
            DANGER : Ce signalement déclenche une panne bloquante immédiate sur la ligne de production.
          </Text>
        </View>

        {/* Sélection équipement : liste GMAO + personnaliser */}
        <FormSelect
          label="Nom de l'équipement en panne"
          value={isCustomEquipment ? '__CUSTOM__' : (sosData.equipment_name || '')}
          options={equipmentOptions}
          onSelect={v => {
            if (v === '__CUSTOM__') {
              setIsCustomEquipment(true);
              setSosData({ ...sosData, equipment_name: '' });
            } else {
              setIsCustomEquipment(false);
              setCustomEquipmentName('');
              setSosData({ ...sosData, equipment_name: v });
            }
          }}
          placeholder="Sélectionner un équipement..."
        />
        {isCustomEquipment && (
          <FormInput
            label="Nom personnalisé de l'équipement"
            value={customEquipmentName}
            onChangeText={setCustomEquipmentName}
            placeholder="ex: Convoyeur principal Silo C"
            autoFocus
          />
        )}

        <FormSelect
          label="Type de Matériel"
          value={sosData.equipment_type}
          options={[
            { label: 'Matériel de Production', value: 'PRODUCTION' },
            { label: 'Instrumentation de Laboratoire', value: 'LABORATORY' },
            { label: 'Énergie / Électricité', value: 'POWER' },
          ]}
          onSelect={v => setSosData({ ...sosData, equipment_type: v })}
        />

        <FormSelect
          label="Priorité de l'intervention"
          value={sosData.priority}
          options={[
            { label: 'CRITIQUE (Ligne arrêtée - SOS)', value: 'CRITIQUE' },
            { label: 'HAUTE (Ligne ralentie)', value: 'HAUTE' },
            { label: 'NORMAL (Dysfonctionnement mineur)', value: 'NORMAL' },
          ]}
          onSelect={v => setSosData({ ...sosData, priority: v })}
        />

        <FormInput
          label="Description détaillée de l'anomalie"
          value={sosData.description}
          onChangeText={t => setSosData({ ...sosData, description: t })}
          placeholder="ex: Bourrage mécanique au niveau de la bande de transport, surchauffe moteur."
          multiline
        />
      </FormModal>
    </AnimatedPage>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
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

