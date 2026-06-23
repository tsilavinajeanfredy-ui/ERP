import * as React from 'react';
import { View, Text, Animated, TouchableOpacity, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useInternalNotifications, useUserProfile } from '../lib/hooks';
import { supabase } from '../lib/supabase';
import { playNotificationSound, soundForNotifType } from '../lib/notificationSound';
import { stripEmoji } from '../lib/notifIcons';

/**
 * Analyse le titre d'une notification.
 * Si le titre commence par un tag entre crochets comme [LOT], [LABO], [OK]…
 * il est affiché comme un badge coloré suivi du texte.
 * Tous les emojis résiduels sont supprimés.
 */
function TitleWithTag({ title, accentColor, textColor }: { title: string; accentColor: string; textColor: string }) {
  const clean = stripEmoji(title ?? '').trim();
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
  info:     { icon: 'information-outline',     bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8', accent: '#3B82F6' },
  warning:  { icon: 'alert-outline',           bg: '#FFFBEB', border: '#FDE68A', text: '#92400E', accent: '#F59E0B' },
  error:    { icon: 'alert-circle-outline',    bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', accent: '#EF4444' },
  success:  { icon: 'check-circle-outline',    bg: '#F0FDF4', border: '#BBF7D0', text: '#14532D', accent: '#22C55E' },
  critical: { icon: 'bell-alert-outline',      bg: '#FFF7ED', border: '#FDBA74', text: '#9A3412', accent: '#F97316' },
  release:  { icon: 'lock-open-check-outline', bg: '#ECFDF5', border: '#6EE7B7', text: '#065F46', accent: '#10B981' },
  creation: { icon: 'plus-circle-outline',     bg: '#F5F3FF', border: '#C4B5FD', text: '#4C1D95', accent: '#7C3AED' },
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
  /** Progress 1→0 over the toast lifetime */
  progress: Animated.Value;
  duration: number;
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

/** Toast individuel avec barre de progression animée */
function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (toast: ToastItem) => void;
}) {
  const cfg = TYPE_CONFIG[toast.type] || TYPE_CONFIG.info;

  // Largeur animée de la barre de progression (100% → 0%)
  const progressWidth = toast.progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          backgroundColor: cfg.bg,
          borderColor: cfg.border,
          transform: [{ translateY: toast.translateY }],
          opacity: toast.opacity,
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
        onPress={() => onDismiss(toast)}
        style={styles.closeBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <MaterialCommunityIcons name="close" size={15} color="#9CA3AF" />
      </TouchableOpacity>

      {/* Barre de progression animée */}
      <View style={[styles.progressTrack, { backgroundColor: cfg.accent + '25' }]}>
        <Animated.View
          style={[styles.progressFill, { backgroundColor: cfg.accent, width: progressWidth }]}
        />
      </View>
    </Animated.View>
  );
}

export function NotificationToastProvider({ children }: { children: React.ReactNode }) {
  const { width: screenWidth } = useWindowDimensions();
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const { data: notifications = [] } = useInternalNotifications();
  const { profile } = useUserProfile();
  // Bloquer les toasts pendant l'écran 2FA pour éviter la rafale après validation
  const CRITICAL_ROLES_2FA = ['ADMIN', 'DPI', 'RQ', 'SUPER_ADMIN', 'DSI'];
  const [is2FABlocked, setIs2FABlocked] = React.useState(false);
  React.useEffect(() => {
    if (!profile || !CRITICAL_ROLES_2FA.includes(profile.role)) { setIs2FABlocked(false); return; }
    supabase?.auth.getSession().then(({ data }: { data: any }) => {
      const aal = (data.session as any)?.user?.aal ?? data.session?.user?.app_metadata?.aal;
      const verified = typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem('gsi_2fa_verified') === 'true'
        : false;
      setIs2FABlocked(!verified && aal !== 'aal2');
    });
  }, [profile?.id, profile?.role]);
  const STORAGE_KEY = 'erp_seen_notifs_v1';
  const seenIds = React.useRef<Set<string>>(new Set());
  // Séparé de seenIds : track les IDs pour lesquels le son a DÉJÀ joué.
  // Une fois un son joué pour un ID, il ne rejouera JAMAIS même si la notif
  // revient dans le tableau (ex: invalidation Realtime, changement de page).
  const soundedIds = React.useRef<Set<string>>(new Set());

  // Largeur responsive du toast : max 348px, mais s'adapte aux petits écrans
  const toastWidth = Math.min(348, screenWidth - 32);
  const toastRight = screenWidth < 480 ? (screenWidth - toastWidth) / 2 : 18;

  // Indicateur de premier chargement : on ne joue jamais de son au montage initial
  const isFirstLoad = React.useRef(true);

  // Charger les IDs déjà vus depuis sessionStorage
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
      Animated.timing(translateY, { toValue: -100, duration: 260, useNativeDriver: false }),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: false }),
    ]).start(() => setToasts(prev => prev.filter(t => t.id !== id)));
  }, []);

  const addToast = React.useCallback((item: Omit<ToastItem, 'translateY' | 'opacity' | 'progress' | 'duration'>) => {
    const translateY = new Animated.Value(-100);
    const opacity = new Animated.Value(0);
    const progress = new Animated.Value(1);

    const duration = item.type === 'critical' ? 9000 : item.type === 'error' ? 8000 : TOAST_DURATION;
    const fullItem: ToastItem = { ...item, translateY, opacity, progress, duration };

    setToasts(prev => [...prev, fullItem].slice(-MAX_TOASTS));

    // Animation d'entrée
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, tension: 130, friction: 11, useNativeDriver: false }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: false }),
    ]).start();

    // Barre de progression : 1 → 0 sur toute la durée
    Animated.timing(progress, {
      toValue: 0,
      duration,
      useNativeDriver: false,
    }).start();

    setTimeout(() => dismiss(item.id, translateY, opacity), duration);
  }, [dismiss]);

  // Buffer pour grouper les notifications rapprochées (évite les doubles toasts)
  const pendingRef = React.useRef<any[]>([]);
  const debounceRef = React.useRef<any>(null);

  // Surveiller les nouvelles notifications non lues
  React.useEffect(() => {
    const newOnes = (notifications as any[]).filter(n => !n.read && !seenIds.current.has(n.id));

    // Premier chargement : marquer toutes les notifs existantes comme vues SANS son ni toast
    // Évite le son intempestif à chaque rechargement de page ou navigation
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      newOnes.forEach(n => {
        seenIds.current.add(n.id);
      });
      // Persister dans sessionStorage pour les rechargements ultérieurs
      try {
        if (typeof sessionStorage !== 'undefined')
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(seenIds.current)));
      } catch (e) {}
      return;
    }

    if (newOnes.length === 0) return;

    // Pendant la 2FA : enregistrer comme vus sans afficher de toast
    // Evite la rafale de toasts après validation
    if (is2FABlocked) {
      newOnes.forEach(n => {
        seenIds.current.add(n.id);
        try {
          if (typeof sessionStorage !== 'undefined')
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(seenIds.current)));
        } catch (e) {}
      });
      return;
    }

    newOnes.forEach(n => {
      seenIds.current.add(n.id);
      try {
        if (typeof sessionStorage !== 'undefined')
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(seenIds.current)));
      } catch (e) {}
      pendingRef.current.push(n);
      // ⚠️ NE PAS marquer comme lu ici : le toast n'est qu'un aperçu temporaire.
      // Le badge de la cloche doit rester exact tant que l'utilisateur n'a pas
      // réellement ouvert/cliqué la notification dans le panneau (AppShellHeader).
    });

    // Debounce 800ms : afficher un seul toast pour tout le batch
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const batch = pendingRef.current.splice(0);
      if (batch.length === 0) return;

      const priority = ['error', 'critical', 'release', 'warning', 'creation', 'success', 'info'] as ToastType[];
      const sorted = batch
        .map(n => ({ n, type: resolveToastType(n) }))
        .sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type));

      const best = sorted[0];
      const n = best.n;
      const toastType = best.type;

      const title = n.title || n.subject || 'Notification';
      const message = batch.length > 1
        ? `${n.message || n.body || ''} (+${batch.length - 1} autre${batch.length > 2 ? 's' : ''})`
        : (n.message || n.body || '');

      addToast({ id: n.id, title, message, type: toastType });

      const finalSound =
        toastType === 'release'  ? 'release' :
        toastType === 'critical' ? 'critical' :
        toastType === 'creation' ? 'creation' :
        toastType === 'error'    ? 'error' :
        toastType === 'success'  ? 'success' :
        toastType === 'warning'  ? 'warning' :
        soundForNotifType(n.type || 'info', n.category || n.metadata?.category, n.metadata);

      // Jouer le son UNE SEULE FOIS par notification (même si la notif
      // revient dans le tableau suite à une invalidation Realtime ou navigation).
      const soundKey = n.id;
      if (!soundedIds.current.has(soundKey)) {
        soundedIds.current.add(soundKey);
        playNotificationSound(finalSound as any);
      }
    }, 800);
  }, [notifications, addToast, is2FABlocked]);

  const handleDismiss = (toast: ToastItem) => {
    dismiss(toast.id, toast.translateY, toast.opacity);
    // ⚠️ Fermer le toast (croix ou timeout) ne marque plus la notification comme
    // lue : seul un clic explicite sur la notification dans le panneau de la
    // cloche (AppShellHeader) doit faire disparaître le badge correspondant.
  };

  return (
    <>
      {children}
      <View
        style={[
          styles.container,
          {
            width: toastWidth,
            right: toastRight,
            // Sur mobile centré, sur desktop à droite
            left: screenWidth < 480 ? (screenWidth - toastWidth) / 2 : undefined,
            pointerEvents: 'box-none',
          },
        ]}
      >
        {toasts.map((toast, index) => (
          <View key={toast.id} style={{ marginTop: index * 7 }}>
            <ToastCard toast={toast} onDismiss={handleDismiss} />
          </View>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 18 : 66,
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
      web: { boxShadow: '0px 6px 18px rgba(0,0,0,0.11)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.11,
        shadowRadius: 14,
        elevation: 10,
      },
    }),
  },
  accentBar:     { width: 4, alignSelf: 'stretch' },
  content:       { flex: 1, paddingVertical: 11, paddingRight: 4 },
  message:       { fontSize: 12, color: '#6B7280', lineHeight: 17 },
  closeBtn:      { padding: 10, alignSelf: 'flex-start' },
  progressTrack: { position: 'absolute', bottom: 0, left: 4, right: 0, height: 2, borderRadius: 1, overflow: 'hidden' },
  progressFill:  { height: 2, borderRadius: 1 },
});
