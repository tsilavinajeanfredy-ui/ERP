// ─────────────────────────────────────────────────────────────────────────────
// BONUS HOOKS pour Module 2 : Notifications & Calibration
// À ajouter dans src/lib/hooks/quality.ts ou src/lib/hooks.ts
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { env } from '../env';

// ─── NOTIFICATION HOOKS ────────────────────────────────────────────────────

/**
 * Récupérer toutes les notifications non lues de l'utilisateur
 * @returns Notifications triées par date (les plus récentes d'abord)
 */
export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('read', false)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60000, // Refetch toutes les minutes
  });
}

/**
 * Récupérer les notifications par catégorie applicative (metadata.kind),
 * ex: CALIBRATION_REMINDER. La colonne `type` réelle ne contient que
 * info/warning/error/success ; le type métier est porté par metadata.kind.
 */
export function useNotificationsByType(kind: string) {
  return useQuery({
    queryKey: ['notifications', kind],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('metadata->>kind', kind)
        .eq('read', false)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60000,
  });
}

/**
 * Marquer une notification comme lue
 */
export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (notificationId: string) => {
      if (!supabase) throw new Error('Supabase not initialized');
      const { error } = await supabase
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/**
 * Marquer toutes les notifications comme lues
 */
export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error('Supabase not initialized');
      const { error } = await supabase
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('read', false);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/**
 * Compter les notifications non lues
 */
export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: ['unreadNotificationCount'],
    queryFn: async () => {
      if (!supabase) return 0;
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('read', false);
      
      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 30000, // Check every 30 seconds
  });
}

// ─── CALIBRATION REMINDER HOOKS ────────────────────────────────────────────

/**
 * Récupérer tous les instruments en retard d'étalonnage
 */
export function useOverdueInstruments() {
  return useQuery({
    queryKey: ['overdueInstruments'],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('overdue_instruments')
        .select('*')
        .order('next_calibration_at', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 3600000, // Refetch toutes les heures
  });
}

/**
 * Récupérer toutes les calibrations à venir (dans les 30 jours)
 */
export function useUpcomingCalibrations(daysAhead = 30) {
  return useQuery({
    queryKey: ['upcomingCalibrations', daysAhead],
    queryFn: async () => {
      if (!supabase) return [];
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + daysAhead);
      
      const { data, error } = await supabase
        .from('upcoming_calibrations')
        .select('*')
        .lte('next_calibration_at', targetDate.toISOString())
        .order('next_calibration_at', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 3600000,
  });
}

/**
 * Récupérer le calendrier d'étalonnage pour un instrument
 */
export function useCalibrationSchedule(instrumentId: string) {
  return useQuery({
    queryKey: ['calibrationSchedule', instrumentId],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('calibration_schedules')
        .select('*')
        .eq('instrument_id', instrumentId)
        .order('scheduled_date', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
  });
}

/**
 * Créer ou mettre à jour un calendrier d'étalonnage
 */
export function useCreateOrUpdateCalibrationSchedule() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (schedule: {
      instrument_id: string;
      scheduled_date: string;
      notes?: string;
    }) => {
      if (!supabase) throw new Error('Supabase not initialized');
      const { data, error } = await supabase
        .from('calibration_schedules')
        .upsert([{
          ...schedule,
          updated_at: new Date().toISOString(),
        }])
        .select();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['calibrationSchedule', variables.instrument_id],
      });
      queryClient.invalidateQueries({ queryKey: ['upcomingCalibrations'] });
    },
  });
}

/**
 * Marquer une calibration comme complétée
 */
export function useCompleteCalibrationSchedule() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      scheduleId,
      completedAt,
      notes,
    }: {
      scheduleId: string;
      completedAt: string;
      notes?: string;
    }) => {
      if (!supabase) throw new Error('Supabase not initialized');
      const { data: profile } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('calibration_schedules')
        .update({
          completed_at: completedAt,
          completed_by: profile?.user?.id,
          notes,
        })
        .eq('id', scheduleId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calibrationSchedule'] });
      queryClient.invalidateQueries({ queryKey: ['overdueInstruments'] });
      queryClient.invalidateQueries({ queryKey: ['upcomingCalibrations'] });
    },
  });
}

/**
 * Récupérer les fréquences d'étalonnage référentiel
 */
export function useCalibrationFrequencies() {
  return useQuery({
    queryKey: ['calibrationFrequencies'],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('calibration_frequencies')
        .select('*')
        .order('instrument_type');
      
      if (error) throw error;
      return data || [];
    },
  });
}

/**
 * Déclencher manuellement l'envoi de rappels (pour admin/test)
 */
export function useTriggerCalibrationReminders() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error('Supabase not initialized');
      const session = await supabase.auth.getSession();
      const response = await fetch(
        `${env.supabaseUrl}/functions/v1/send-calibration-reminders`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.data.session?.access_token}`,
            'apikey': env.supabaseAnonKey ?? '',
          },
        }
      );
      
      if (!response.ok) throw new Error('Failed to trigger reminders');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// ─── STATS & ANALYTICS HOOKS ──────────────────────────────────────────────

/**
 * Récupérer les statistiques de calibration
 */
export function useCalibrationStats() {
  return useQuery({
    queryKey: ['calibrationStats'],
    queryFn: async () => {
      if (!supabase) return { overdue: 0, ok: 0, unreadReminders: 0, total: 0 };
      // Instruments en retard
      const { count: overdueCount } = await supabase
        .from('overdue_instruments')
        .select('*', { count: 'exact', head: true });
      
      // Instruments OK
      const { count: okCount } = await supabase
        .from('instruments')
        .select('*', { count: 'exact', head: true })
        .gt('next_calibration_at', new Date().toISOString());
      
      // Notifications non lues (rappels d'étalonnage)
      const { count: unreadNotifications } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('read', false)
        .eq('metadata->>kind', 'CALIBRATION_REMINDER');
      
      return {
        overdue: overdueCount || 0,
        ok: okCount || 0,
        unreadReminders: unreadNotifications || 0,
        total: (overdueCount || 0) + (okCount || 0),
      };
    },
    refetchInterval: 300000, // 5 minutes
  });
}
