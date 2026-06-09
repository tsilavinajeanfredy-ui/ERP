import * as React from 'react';
import { View, Text, Animated, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useInternalNotifications, useMutation } from '../lib/hooks';
import { playNotificationSound, soundForNotifType } from '../lib/notificationSound';
import { stripEmoji } from '../lib/notifIcons';

/**
 * Analyse le titre d'une notification.
 * Si le titre commence par un tag entre crochets comme [LOT], [LABO], [OK]…
 * il est affiché comme un badge coloré suivi du texte.
 * Tous les emojis résiduels sont supprimés.
 */
function TitleWithTag({ title, accentColor, textColor }: { title: string; accentColor: string; textColor: string }) {
  const clean = stripEmoji(title).trim();
  const tagMatch = clean.match(/^\[([A-Z0-9]+)\]\s*/);

  if (tagMatch) {
    const tag = tagMatch[1];
    const rest = clean.slice(tagMatch[0].length);
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 2 }}>
        <View style={{
          backgroundColor: accentColor + '22',
          borderRadius: 3,
          paddingHorizontal: 5,
          paddingVertical: 1,
          borderWidth: 1,
          borderColor: accentColor + '55',
        }}>
          <Text style={{ fontSize: 9, fontWeight: '800', color: accentColor, letterSpacing: 0.6 }}>
            {tag}
          </Text>
        </View>
        <Text style={{ fontSize: 13, fontWeight: '700', color: textColor, flex: 1 }} numberOfLines={1}>
          {rest}
        </Text>
      </View>
    );
  }

  return (
    <Text style={{ fontSize: 13, fontWeight: '700', color: textColor, marginBottom: 2 }} numberOfLines={1}>
      {clean}
    </Text>
  );
}

const TYPE_CONFIG = {
  info:     { icon: 'information-outline',  bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8', accent: '#3B82F6' },
  warning:  { icon: 'alert-outline',        bg: '#FFFBEB', border: '#FDE68A', text: '#92400E', accent: '#F59E0B' },
  error:    { icon: 'alert-circle-outline', bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', accent: '#EF4444' },
  success:  { icon: 'check-circle-outline', bg: '#F0FDF4', border: '#BBF7D0', text: '#14532D', accent: '#22C55E' },
  critical: { icon: 'bell-alert-outline',   bg: '#FFF7ED', border: '#FDBA74', text: '#9A3412', accent: '#F97316' },
  release:  { icon: 'lock-open-check-outline', bg: '#ECFDF5', border: '#6EE7B7', text: '#065F46', accent: '#10B981' },
  creation: { icon: 'plus-circle-outline',  bg: '#F5F3FF', border: '#C4B5FD', text: '#4C1D95', accent: '#7C3AED' },
} as const;

type ToastType = keyof typeof TYPE_CONFIG;

const TOAST_DURATION = 6000;
const MAX_TOASTS = 4;

interface ToastItem {
  id: string;
  title: string;
  message: string;
  type: ToastType;
  translateY: Animated.Value;
  opacity: Animated.Value;
}

/** Détermine le type visuel du toast selon les métadonnées de la notif DB */
function resolveToastType(n: any): ToastType {
  const cat: string = n.category || n.metadata?.category || '';
  const step: string = n.metadata?.step || '';
  const type: string = n.type || 'info';

  if (cat === 'PURCHASING') {
    if (step === 'RECEPTION' || step === 'ETA') return 'critical';
    return 'info';
  }
  if (cat === 'QUALITY') {
    const subj: string = n.subject || '';
    if (subj.includes('LIBERE') || subj.includes('libéré') || subj.includes('Libér')) return 'release';
    if (subj.includes('BLOQUE') || subj.includes('bloqué') || subj.includes('Bloqu')) return 'error';
    return 'warning';
  }
  if (cat === 'CREATION' || subjectIncludes(n.subject, ['créé', 'créée', 'nouveau', 'nouvelle', 'Nouveau', 'Création'])) return 'creation';

  if (type === 'error')   return 'error';
  if (type === 'success') return 'success';
  if (type === 'warning') return 'warning';
  return 'info';
}

function subjectIncludes(subject: string | undefined, keywords: string[]): boolean {
  if (!subject) return false;
  return keywords.some(k => subject.includes(k));
}

export function NotificationToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const { data: notifications = [] } = useInternalNotifications();
  const markReadMutation = useMutation('notifications');
  const STORAGE_KEY = 'erp_seen_notifs_v1';
  const seenIds = React.useRef<Set<string>>(new Set());

  // Load persisted seen ids from sessionStorage/localStorage once
  React.useEffect(() => {
    try {
      const raw = (typeof sessionStorage !== 'undefined') ? sessionStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const arr = JSON.parse(raw || '[]');
        seenIds.current = new Set(arr);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  const dismiss = React.useCallback((id: string, translateY: Animated.Value, opacity: Animated.Value) => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -100, duration: 260, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => setToasts(prev => prev.filter(t => t.id !== id)));
  }, []);

  const addToast = React.useCallback((item: Omit<ToastItem, 'translateY' | 'opacity'>) => {
    const translateY = new Animated.Value(-100);
    const opacity = new Animated.Value(0);

    setToasts(prev => [...prev, { ...item, translateY, opacity }].slice(-MAX_TOASTS));

    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, tension: 130, friction: 11, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    const duration = item.type === 'critical' ? 9000 : item.type === 'error' ? 8000 : TOAST_DURATION;
    setTimeout(() => dismiss(item.id, translateY, opacity), duration);
  }, [dismiss]);

  // Surveiller les nouvelles notifications non lues
  React.useEffect(() => {
    const newOnes = (notifications as any[]).filter(n => !n.read && !seenIds.current.has(n.id));
    newOnes.forEach(n => {
      seenIds.current.add(n.id);
      try {
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(seenIds.current)));
      } catch (e) {}

      // Résoudre le type visuel
      const toastType = resolveToastType(n);

      addToast({
        id: n.id,
        title: n.title || n.subject || 'Notification',
        message: n.message || n.body || '',
        type: toastType,
      });

      // Jouer le son correspondant (unique par situation)
      const soundType = soundForNotifType(
        n.type || 'info',
        n.category || n.metadata?.category,
        n.metadata
      );

      // Override pour les types enrichis
      const finalSound =
        toastType === 'release'   ? 'release' :
        toastType === 'critical'  ? 'critical' :
        toastType === 'creation'  ? 'creation' :
        toastType === 'error'     ? 'error' :
        toastType === 'success'   ? 'success' :
        toastType === 'warning'   ? 'warning' :
        soundType;

      // Play sound only if this id wasn't previously seen (guard double-mounts)
      try {
        const persisted = (typeof sessionStorage !== 'undefined') ? JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]') : [];
        if (!persisted.includes(n.id)) {
          playNotificationSound(finalSound as any);
        }
      } catch (e) {
        playNotificationSound(finalSound as any);
      }

      // Marquer la notification comme lue pour éviter qu'elle soit re-affichée
      // lors de changements d'onglet ou de rafraîchissements rapides.
      try {
        markReadMutation.mutate({ id: n.id, values: { read: true }, type: 'UPDATE' });
      } catch (e) {
        // ignore
      }
    });
  }, [notifications, addToast]);

  const handleDismiss = (toast: ToastItem) => {
    dismiss(toast.id, toast.translateY, toast.opacity);
    markReadMutation.mutate({
      id: toast.id,
      values: { read: true },
      type: 'UPDATE',
    });
  };

  return (
    <>
      {children}
      <View style={[styles.container, { pointerEvents: 'box-none' as any }]}>
        {toasts.map((toast, index) => {
          const cfg = TYPE_CONFIG[toast.type] || TYPE_CONFIG.info;
          return (
            <Animated.View
              key={toast.id}
              style={[
                styles.toast,
                {
                  backgroundColor: cfg.bg,
                  borderColor: cfg.border,
                  borderLeftColor: cfg.accent,
                  transform: [{ translateY: toast.translateY }],
                  opacity: toast.opacity,
                  marginTop: index * 7,
                },
              ]}
            >
              {/* Barre d'accent latérale */}
              <View style={[styles.accentBar, { backgroundColor: cfg.accent }]} />

              {/* Icône */}
              <MaterialCommunityIcons
                name={cfg.icon as any}
                size={21}
                color={cfg.accent}
                style={{ marginHorizontal: 12, alignSelf: 'center' }}
              />

              {/* Contenu textuel */}
              <View style={styles.content}>
                <TitleWithTag title={toast.title} accentColor={cfg.accent} textColor={cfg.text} />
                <Text style={styles.message} numberOfLines={3}>
                  {toast.message}
                </Text>
              </View>

              {/* Bouton fermeture */}
              <TouchableOpacity
                onPress={() => handleDismiss(toast)}
                style={styles.closeBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons name="close" size={15} color="#9CA3AF" />
              </TouchableOpacity>

              {/* Indicateur de progression (barre basse) */}
              <View style={[styles.progressBar, { backgroundColor: cfg.accent + '40' }]} />
            </Animated.View>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 18 : 66,
    right: 18,
    width: 348,
    zIndex: 9999,
    gap: 8,
  } as any,
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 13,
    borderWidth: 1,
    minHeight: 62,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0px 6px 18px rgba(0,0,0,0.10)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.10,
        shadowRadius: 14,
      },
    }),
    elevation: 10,
  },
  accentBar:   { width: 4, alignSelf: 'stretch' },
  content:     { flex: 1, paddingVertical: 11, paddingRight: 4 },
  title:       { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  message:     { fontSize: 12, color: '#6B7280', lineHeight: 17 },
  closeBtn:    { padding: 10, alignSelf: 'flex-start' },
  progressBar: { position: 'absolute', bottom: 0, left: 4, right: 0, height: 2, borderRadius: 1 },
});
