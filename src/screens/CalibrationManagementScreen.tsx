// ─────────────────────────────────────────────────────────────────────────────
// CalibrationManagementScreen.tsx
// À ajouter dans src/screens/
// Gestion complète des calendriers d'étalonnage, instruments en retard
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import {
  ScrollView,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, ActionButton, AnimatedPage, Badge, KpiCard, FormModal, FormInput, FormDatePicker } from '../components/Ui';
import { CalibrationAlertBanner } from '../components/CalibrationAlertBanner';
import {
  useOverdueInstruments,
  useUpcomingCalibrations,
  useCalibrationStats,
  useCompleteCalibrationSchedule,
  useCreateOrUpdateCalibrationSchedule,
  useTriggerCalibrationReminders,
} from '../lib/hooks/calibration';
import { useTranslation } from '../lib/i18n';
import { confirmAction } from '../lib/hooks';

const TABS = ['RETARD', 'A_VENIR', 'STATS', 'HISTORIQUE'];

export default function CalibrationManagementScreen() {
  const t = useTranslation();
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('RETARD');
  const [selectedInstrument, setSelectedInstrument] = useState<string | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);

  // Queries
  const { data: overdueInstruments = [], isLoading: loadingOverdue } = useOverdueInstruments();
  const { data: upcomingCalibrations = [], isLoading: loadingUpcoming } = useUpcomingCalibrations(30);
  const { data: stats = { overdue: 0, ok: 0, unreadReminders: 0, total: 0 }, isLoading: loadingStats } = useCalibrationStats();

  // Mutations
  const completeScheduleMutation = useCompleteCalibrationSchedule();
  const createScheduleMutation = useCreateOrUpdateCalibrationSchedule();
  const triggerRemindersMutation = useTriggerCalibrationReminders();

  // Form state
  const [scheduleForm, setScheduleForm] = useState({ scheduled_date: '', notes: '' });

  const isLoading = loadingOverdue || loadingUpcoming || loadingStats;

  // ─────────────────────────────────────────────────────────────────────────

  const handleCompleteCalibration = (instrumentId: string) => {
    confirmAction(
      'Valider calibration',
      'Confirmer que l\'étalonnage a été effectué ?',
      () => {
        completeScheduleMutation.mutate(
          {
            scheduleId: instrumentId, // Assume it's schedule ID
            completedAt: new Date().toISOString(),
            notes: 'Calibration effectuée',
          },
          {
            onSuccess: () => {
              Alert.alert('Succès', 'Calibration validée');
            },
            onError: (err: any) => {
              Alert.alert('Erreur', err?.message || 'Impossible de valider');
            },
          }
        );
      }
    ,
    'success'
  );
  };

  const handleScheduleCalibration = async () => {
    if (!selectedInstrument || !scheduleForm.scheduled_date) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }

    createScheduleMutation.mutate(
      {
        instrument_id: selectedInstrument,
        scheduled_date: scheduleForm.scheduled_date,
        notes: scheduleForm.notes || undefined,
      },
      {
        onSuccess: () => {
          Alert.alert('Succès', 'Calibration programmée');
          setShowScheduleModal(false);
          setScheduleForm({ scheduled_date: '', notes: '' });
          setSelectedInstrument(null);
        },
        onError: (err: any) => {
          Alert.alert('Erreur', err?.message || 'Impossible de programmer');
        },
      }
    );
  };

  const handleTriggerReminders = () => {
    confirmAction(
      'Envoyer rappels',
      'Déclencher manuellement l\'envoi des rappels d\'étalonnage ?',
      () => {
        triggerRemindersMutation.mutate(undefined, {
          onSuccess: () => {
            Alert.alert('Succès', 'Rappels envoyés à tous les utilisateurs');
          },
          onError: (err: any) => {
            Alert.alert('Erreur', err?.message || 'Impossible d\'envoyer les rappels');
          },
        });
      }
    ,
    'warning'
  );
  };

  // ─────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <AnimatedPage>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={C.info} />
        </View>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage>
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16 }}>
        {/* Alerte en retard */}
        {overdueInstruments.length > 0 && (
          <CalibrationAlertBanner />
        )}

        {/* Stats KPIs */}
        {activeTab === 'STATS' && (
          <View style={{ marginBottom: 16, gap: 12 }}>
            <KpiCard
              label="Instruments en retard"
              value={stats.overdue.toString()}
              color={stats.overdue > 0 ? C.err : C.ok}
              icon="alert-circle"
            />
            <KpiCard
              label="Instruments OK"
              value={stats.ok.toString()}
              color={C.ok}
              icon="check-circle"
            />
            <KpiCard
              label="Rappels non lus"
              value={stats.unreadReminders.toString()}
              color={C.info}
              icon="bell"
            />
            <KpiCard
              label="Total instruments"
              value={stats.total.toString()}
              color={C.info}
              icon="tools"
            />
          </View>
        )}

        {/* Tabs */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={{
                flex: 1,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 6,
                backgroundColor: activeTab === tab ? C.info : '#EEF2F5',
                borderWidth: activeTab === tab ? 0 : 1,
                borderColor: '#D1D9E0',
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: activeTab === tab ? '#FFF' : '#495057',
                  textAlign: 'center',
                }}
              >
                {tab === 'RETARD'
                  ? `EN RETARD (${overdueInstruments.length})`
                  : tab === 'A_VENIR'
                  ? `À VENIR (${upcomingCalibrations.length})`
                  : tab === 'STATS'
                  ? 'STATISTIQUES'
                  : 'HISTORIQUE'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* RETARD TAB */}
        {activeTab === 'RETARD' && (
          <>
            {overdueInstruments.length === 0 ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <MaterialCommunityIcons name="check-circle" size={48} color={C.ok} />
                <Text style={{ fontSize: 14, fontWeight: '600', marginTop: 8, color: C.ok }}>
                  ✓ Aucun instrument en retard
                </Text>
              </View>
            ) : (
              overdueInstruments.map((inst: any) => (
                <View
                  key={inst.id}
                  style={{
                    padding: 12,
                    backgroundColor: '#FFE5E5',
                    borderRadius: 8,
                    marginBottom: 10,
                    borderLeftWidth: 4,
                    borderLeftColor: C.err,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: C.err }}>
                        {inst.name}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#721C24', marginTop: 2 }}>
                        N° série: {inst.serial_number || '—'}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#721C24' }}>
                        Lieu: {inst.location || '—'}
                      </Text>
                      <View style={{ marginTop: 6 }}>
                        <Badge
                          label={`Retard: ${Math.abs(Math.floor(inst.days_overdue))} jours`}
                          color={C.err}
                        />
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        setSelectedInstrument(inst.id);
                        setShowScheduleModal(true);
                      }}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        backgroundColor: C.err,
                        borderRadius: 6,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#FFF' }}>
                        Programmer
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {/* A_VENIR TAB */}
        {activeTab === 'A_VENIR' && (
          <>
            {upcomingCalibrations.length === 0 ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <MaterialCommunityIcons name="calendar-check" size={48} color={C.ok} />
                <Text style={{ fontSize: 14, fontWeight: '600', marginTop: 8, color: C.ok }}>
                  ✓ Aucune calibration à venir
                </Text>
              </View>
            ) : (
              upcomingCalibrations.map((cal: any) => (
                <View
                  key={cal.id}
                  style={{
                    padding: 12,
                    backgroundColor: '#FFF3CD',
                    borderRadius: 8,
                    marginBottom: 10,
                    borderLeftWidth: 4,
                    borderLeftColor: C.gold,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#856404' }}>
                        {cal.name}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#856404', marginTop: 2 }}>
                        À faire le: {new Date(cal.next_calibration_at).toLocaleDateString('fr-FR')}
                      </Text>
                      <View style={{ marginTop: 6 }}>
                        <Badge
                          label={`J-${Math.floor(cal.days_until_due)}`}
                          color={cal.days_until_due <= 7 ? C.err : C.gold}
                        />
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleCompleteCalibration(cal.id)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        backgroundColor: C.ok,
                        borderRadius: 6,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#FFF' }}>
                        Valider
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {/* HISTORIQUE TAB (Placeholder) */}
        {activeTab === 'HISTORIQUE' && (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <MaterialCommunityIcons name="history" size={48} color={C.textMuted} />
            <Text style={{ fontSize: 14, fontWeight: '600', marginTop: 8, color: C.textMuted }}>
              Historique des calibrations
            </Text>
            <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 4, textAlign: 'center' }}>
              Disponible dans MetrologyScreen avec calibration_log table
            </Text>
          </View>
        )}

        {/* Action buttons */}
        <View style={{ marginTop: 16, gap: 8 }}>
          <ActionButton
            label="Programmer une calibration"
            icon="calendar-plus"
            onPress={() => setShowScheduleModal(true)}
            variant="primary"
          />
          <ActionButton
            label="Envoyer rappels (admin)"
            icon="bell-outline"
            onPress={handleTriggerReminders}
            variant="secondary"
            loading={triggerRemindersMutation.isPending}
          />
        </View>
      </ScrollView>

      {/* Modal : Programmer calibration */}
      <FormModal
        visible={showScheduleModal}
        title="Programmer une calibration"
        onClose={() => setShowScheduleModal(false)}
        onSave={handleScheduleCalibration}
        loading={createScheduleMutation.isPending}
      >
        <FormDatePicker
          label="Date d'étalonnage"
          value={scheduleForm.scheduled_date}
          onChangeDate={(date) => setScheduleForm({ ...scheduleForm, scheduled_date: date })}
        />
        <FormInput
          label="Notes (optionnel)"
          value={scheduleForm.notes}
          onChangeText={(text) => setScheduleForm({ ...scheduleForm, notes: text })}
          placeholder="Ex: Besoin de pièces de rechange"
          multiline
        />
      </FormModal>
    </AnimatedPage>
  );
}
