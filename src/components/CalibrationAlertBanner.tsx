// ─────────────────────────────────────────────────────────────────────────────
// CalibrationAlertBanner.tsx
// À ajouter dans src/components/
// Affiche une bannière pour les instruments en retard d'étalonnage
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useOverdueInstruments, useNotificationsByType } from '../lib/hooks/calibration';
import { C } from './Ui';

interface CalibrationAlertBannerProps {
  onPress?: () => void;
  compact?: boolean;
}

export function CalibrationAlertBanner({ onPress, compact = false }: CalibrationAlertBannerProps) {
  const { data: overdueInstruments = [] } = useOverdueInstruments();
  const { data: reminders = [] } = useNotificationsByType('CALIBRATION_REMINDER');

  if (overdueInstruments.length === 0 && reminders.length === 0) {
    return null;
  }

  const overdueCount = overdueInstruments.length;
  const reminderCount = reminders.length;
  const totalAlerts = overdueCount + reminderCount;

  if (compact) {
    return (
      <TouchableOpacity
        onPress={onPress}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 8,
          backgroundColor: overdueCount > 0 ? '#FFE5E5' : '#FFF3CD',
          borderLeftWidth: 4,
          borderLeftColor: overdueCount > 0 ? C.err : C.gold,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <MaterialCommunityIcons
          name={overdueCount > 0 ? 'alert-circle' : 'alert'}
          size={20}
          color={overdueCount > 0 ? C.err : C.gold}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: overdueCount > 0 ? C.err : '#856404' }}>
            {overdueCount > 0
              ? `⚠️ ${overdueCount} instrument(s) en retard`
              : `📅 ${reminderCount} rappel(s) d'étalonnage`}
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={overdueCount > 0 ? C.err : C.gold} />
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={{
        marginBottom: 16,
        paddingHorizontal: 12,
        paddingVertical: 16,
        backgroundColor: overdueCount > 0 ? '#FFE5E5' : '#FFF3CD',
        borderRadius: 8,
        borderLeftWidth: 4,
        borderLeftColor: overdueCount > 0 ? C.err : C.gold,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <MaterialCommunityIcons
          name={overdueCount > 0 ? 'alert-circle' : 'calendar-alert'}
          size={24}
          color={overdueCount > 0 ? C.err : C.gold}
          style={{ marginTop: 2 }}
        />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: '700',
              color: overdueCount > 0 ? C.err : '#856404',
              marginBottom: 4,
            }}
          >
            {overdueCount > 0
              ? `⚠️ ${overdueCount} instrument(s) en retard d'étalonnage`
              : `📅 ${reminderCount} rappel(s) d'étalonnage attendus`}
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: overdueCount > 0 ? '#721C24' : '#856404',
              lineHeight: 18,
            }}
          >
            {overdueCount > 0
              ? 'Des instruments n\'ont pas été étalonnés selon le calendrier. Veuillez programmer une calibration dès que possible.'
              : 'Certains instruments doivent être étalonnés dans les 7 prochains jours.'}
          </Text>
          {overdueInstruments.length > 0 && (
            <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.1)' }}>
              {overdueInstruments.slice(0, 3).map((inst: any) => (
                <Text key={inst.id} style={{ fontSize: 11, color: C.err, marginBottom: 4 }}>
                  • {inst.name} (en retard depuis {Math.abs(Math.floor(inst.days_overdue))} jours)
                </Text>
              ))}
              {overdueInstruments.length > 3 && (
                <Text style={{ fontSize: 11, color: C.err, fontStyle: 'italic' }}>
                  +{overdueInstruments.length - 3} autre(s)
                </Text>
              )}
            </View>
          )}
          <TouchableOpacity
            onPress={onPress}
            style={{
              marginTop: 10,
              paddingHorizontal: 12,
              paddingVertical: 6,
              backgroundColor: overdueCount > 0 ? C.err : C.gold,
              borderRadius: 4,
              alignSelf: 'flex-start',
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFF' }}>
              Voir les détails
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
  },
  bannerError: {
    backgroundColor: '#FFE5E5',
    borderLeftColor: C.err,
  },
  bannerWarning: {
    backgroundColor: '#FFF3CD',
    borderLeftColor: C.gold,
  },
});
