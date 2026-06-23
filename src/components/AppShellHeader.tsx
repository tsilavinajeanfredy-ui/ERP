import * as React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  Modal,
  ScrollView,
  Vibration,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DrawerHeaderProps } from '@react-navigation/drawer';
import { useTranslation } from '../lib/i18n';
import { useSearch } from '../lib/search';
import {
  useInternalNotifications,
  useMutation,
  useUserProfile,
  useMarkAllRead,
  useClearReadNotifications,
} from '../lib/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { C } from './Ui';
import { SidebarContext } from '../lib/SidebarContext';
import { ScannerModal } from './ScannerModal';
import { stripEmoji } from '../lib/notifIcons';

/** Parse et affiche le préfixe [TAG] d'un titre de notification comme badge coloré */
function NotifTitleWithTag({
  title,
  unread,
  highPriority,
}: {
  title: string;
  unread: boolean;
  highPriority: boolean;
}) {
  const clean = stripEmoji(title ?? '').trim();
  const tagMatch = clean.match(/^\[([A-Z0-9]+)\]\s*/);
  const baseColor = highPriority ? '#DC3545' : unread ? '#1A1A1A' : '#6C757D';
  const tagColor = highPriority ? '#DC3545' : '#1A56DB';

  if (tagMatch) {
    const tag = tagMatch[1];
    const rest = clean.slice(tagMatch[0].length);
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          flexWrap: 'wrap',
          marginBottom: 4,
        }}
      >
        <View
          style={{
            backgroundColor: tagColor + '18',
            borderRadius: 3,
            paddingHorizontal: 5,
            paddingVertical: 1,
            borderWidth: 1,
            borderColor: tagColor + '44',
          }}
        >
          <Text style={{ fontSize: 9, fontWeight: '800', color: tagColor, letterSpacing: 0.6 }}>
            {tag}
          </Text>
        </View>
        <Text
          style={[
            s.notifItemTitle,
            { color: baseColor, fontWeight: unread ? '700' : '500', marginBottom: 0, flex: 1 },
          ]}
          numberOfLines={1}
        >
          {rest}
        </Text>
      </View>
    );
  }

  return (
    <Text
      style={[s.notifItemTitle, { color: baseColor, fontWeight: unread ? '700' : '500' }]}
      numberOfLines={1}
    >
      {clean}
    </Text>
  );
}

/** Mapping des routes vers leurs catégories respectives pour les fils d'Ariane */
const CATEGORY_MAP: Record<string, string> = {
  Dashboard: 'pilotage',
  Audit: 'pilotage',
  Referential: 'pilotage',
  Shipping: 'pilotage',
  Reception: 'operations',
  Laboratory: 'operations',
  Production: 'operations',
  Stocks: 'operations',
  Inventory: 'operations',
  Mrp: 'operations',
  Fnc: 'operations', // Added FNC screen
  PurchasingImport: 'approvisionnements',
  PurchasingLocal: 'approvisionnements',
};

/** Type pour les catégories de filtrage */
type NotifCategory = 'ALL' | 'QUALITY' | 'PRODUCTION' | 'PURCHASING';

/** Composant interne pour les jetons de filtre */
function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && s.chipActive]}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function AppShellHeader(props: DrawerHeaderProps) {
  const { lang, setLang, t } = useTranslation();
  const { searchQuery, setSearchQuery } = useSearch();
  const { data: notifications = [] } = useInternalNotifications();
  const [showNotifs, setShowNotifs] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [activeFilter, setActiveFilter] = React.useState<NotifCategory>('ALL');
  const markReadMutation = useMutation('notifications');
  const queryClient = useQueryClient();
  const markAllRead = useMarkAllRead();
  const clearRead = useClearReadNotifications();
  const { toggleSidebar, setShowProfile } = React.useContext(SidebarContext);
  const { profile } = useUserProfile();
  const [showScanner, setShowScanner] = React.useState(false);
  const { width: screenWidth } = useWindowDimensions();
  const isMobile = screenWidth < 600;

  // ── Filtrage des notifications par rôle ──────────────────────────────────
  // Chaque rôle ne voit que les notifications pertinentes à son périmètre.
  const roleNotifFilter = (n: any): boolean => {
    const cat = n.metadata?.category;
    const title = n.title?.toLowerCase() || '';
    const msg = n.message?.toLowerCase() || '';
    const role = profile?.role;

    // ⚠️ Notification personnelle (user_id ciblé) → toujours visible
    if (n.user_id && profile?.id && n.user_id === profile.id) return true;

    // ── DPI / ADMIN / SUPER_ADMIN / DSI / DG : voient TOUT ─────────────────
    if (role === 'DPI' || role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'DSI' || role === 'DG') {
      return true;
    }

    // ── RH : uniquement section RH (congés, absences, affectations, paie) ───
    if (role === 'RH') {
      return (
        cat === 'RH' ||
        title.includes('congé') || title.includes('conge') ||
        title.includes('absence') || title.includes('affectation') ||
        title.includes('paie') || title.includes('salaire') ||
        title.includes('rh') || title.includes('recrutement') ||
        msg.includes('congé') || msg.includes('conge') ||
        msg.includes('absence') || msg.includes('affectation') || msg.includes('rh')
      );
    }

    // ── RACH (Acheteur) : achats + réception MP ──────────────────────────────
    if (role === 'RACH') {
      return (
        cat === 'PURCHASING' ||
        title.includes('da') || title.includes('achat') ||
        title.includes('commande') || title.includes('réception mp') ||
        title.includes('reception mp') || title.includes('matière') ||
        msg.includes('da') || msg.includes('achat') || msg.includes('réception mp')
      );
    }

    // ── MAGA (Magasinier) : stocks + réception MP/PF ─────────────────────────
    if (role === 'MAGA') {
      return (
        cat === 'STOCK' || cat === 'PURCHASING' ||
        title.includes('stock') || title.includes('rupture') ||
        title.includes('seuil') || title.includes('réception') ||
        title.includes('reception') || title.includes('livraison') ||
        title.includes('inventaire')
      );
    }

    // ── RQ / TLAB (Qualité / Labo) : qualité + FNC + quarantaine ─────────────
    if (role === 'RQ' || role === 'TLAB') {
      return (
        cat === 'QUALITY' ||
        title.includes('fnc') || title.includes('anomalie') ||
        title.includes('quarantaine') || title.includes('fcq') ||
        title.includes('blocage') || title.includes('analyse') ||
        title.includes('étalonnage') || title.includes('calibration') ||
        title.includes('réclamation')
      );
    }

    // ── RPROD / CHEF_LIGNE / OPERATEUR : production + MRP ────────────────────
    if (role === 'RPROD' || role === 'CHEF_LIGNE' || role === 'OPERATEUR') {
      return (
        cat === 'PRODUCTION' ||
        title.includes('of') || title.includes('production') ||
        title.includes('mrp') || title.includes('ordre de fab') ||
        title.includes('fabrication') || title.includes('nomenclature')
      );
    }

    // ── PLAN (Planificateur) : production + achats + logistique ──────────────
    if (role === 'PLAN') {
      return (
        cat === 'PRODUCTION' || cat === 'PURCHASING' ||
        title.includes('plan') || title.includes('of') ||
        title.includes('mrp') || title.includes('da') ||
        title.includes('livraison') || title.includes('expédition') ||
        title.includes('shipping')
      );
    }

    // ── COMPTA : finance + achats ─────────────────────────────────────────────
    if (role === 'COMPTA') {
      return (
        cat === 'PURCHASING' ||
        title.includes('facture') || title.includes('paiement') ||
        title.includes('compta') || title.includes('budget') ||
        title.includes('da') || title.includes('bon de commande')
      );
    }

    // ── RESPONSABLE : tout sauf RH ────────────────────────────────────────────
    if (role === 'RESPONSABLE') return cat !== 'RH';

    // Autres rôles non mappés : SYSTEM uniquement
    return cat === 'SYSTEM' || !cat;
  };

  const unreadCount = notifications.filter((n) => !n.read && roleNotifFilter(n)).length;
  // ── Initialiser à -1 pour ne pas sonner au premier chargement ────────────
  const prevUnreadCountRef = React.useRef(-1);
  // ── AudioContext persistant (évite de le recréer à chaque notif) ─────────
  const audioCtxRef = React.useRef<any>(null);

  const getAudioCtx = React.useCallback(() => {
    if (Platform.OS !== 'web') return null;
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AC();
      }
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  React.useEffect(() => {
    // Premier rendu : initialiser le ref sans jouer de son
    if (prevUnreadCountRef.current === -1) {
      prevUnreadCountRef.current = unreadCount;
      return;
    }

    if (unreadCount > prevUnreadCountRef.current) {
      const hasQuarantineNotif = notifications.some(
        (n) =>
          !n.read &&
          n.metadata?.category === 'QUALITY' &&
          n.title?.toLowerCase().includes('quarantaine'),
      );

      if (Platform.OS !== 'web') {
        Vibration.vibrate(hasQuarantineNotif ? [0, 200, 100, 200] : 200);
      } else {
        try {
          const ctx = getAudioCtx();
          if (!ctx) return;

          const playSound = () => {
            if (hasQuarantineNotif) {
              const playBeep = (startTime: number) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(880, startTime);
                osc.frequency.linearRampToValueAtTime(440, startTime + 0.25);
                gain.gain.setValueAtTime(0.4, startTime);
                gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.25);
                osc.start(startTime);
                osc.stop(startTime + 0.25);
              };
              playBeep(ctx.currentTime);
              playBeep(ctx.currentTime + 0.35);
            } else {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.type = 'sine';
              osc.frequency.setValueAtTime(587.33, ctx.currentTime);
              osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
              gain.gain.setValueAtTime(0.3, ctx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
              osc.start(ctx.currentTime);
              osc.stop(ctx.currentTime + 0.4);
            }
          };

          if (ctx.state === 'suspended') {
            ctx
              .resume()
              .then(playSound)
              .catch(() => null);
          } else {
            playSound();
          }
        } catch (e) {
          if (__DEV__) console.warn('[Audio] Non supporté ou bloqué :', e);
        }

        // Toast géré par NotificationToastProvider — rien à faire ici
      }
    }
    prevUnreadCountRef.current = unreadCount;
  }, [unreadCount, notifications, getAudioCtx]);

  // Filtrage des notifications (rôle + filtre catégorie actif)
  const filteredNotifications = notifications.filter((n) => {
    // Appliquer d'abord le filtre rôle
    if (!roleNotifFilter(n)) return false;

    if (activeFilter === 'ALL') return true;
    const cat = n.metadata?.category;
    // On filtre soit par la catégorie définie, soit par déduction via le titre pour la rétro-compatibilité
    if (activeFilter === 'QUALITY')
      return cat === 'QUALITY' || n.title?.includes('FCQ') || n.title?.includes('FNC');
    if (activeFilter === 'PRODUCTION')
      return cat === 'PRODUCTION' || n.title?.includes('OF') || n.title?.includes('MRP');
    if (activeFilter === 'PURCHASING')
      return cat === 'PURCHASING' || n.title?.includes('DA') || n.title?.includes('Achats');
    return true;
  });

  // Détermine la catégorie (Pilotage, Opérations, etc.) basée sur la route
  const categoryKey = CATEGORY_MAP[props.route.name] || 'pilotage';

  // Traduction du nom de la route si aucun titre n'est fourni dans les options
  const routeKey = (props.route.name.charAt(0).toLowerCase() + props.route.name.slice(1)) as any;
  const routeLabel = props.options.title ?? t(routeKey as any);

  const handleScan = (data: string) => {
    if (Platform.OS !== 'web') Vibration.vibrate(50);
    setShowScanner(false);
    // Logique de redirection GSI-ERP
    if (data.startsWith('gsi-erp://')) {
      const parts = data.replace('gsi-erp://', '').split('/');
      const type = parts[0];
      const idOrCode = parts[1];

      if (type === 'lot') {
        (props.navigation as any).navigate('Stocks', { filter: idOrCode });
      } else if (type === 'fnc') {
        (props.navigation as any).navigate('Fnc', { filter: idOrCode });
      }
    } else {
      // Recherche simple par code
      setSearchQuery(data);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      <View style={s.container}>
        {/* Left Side: Breadcrumbs */}
        <View style={s.left}>
          <TouchableOpacity
            onPress={() => {
              toggleSidebar();
              if (Platform.OS !== 'web') {
                (props.navigation as any).toggleDrawer?.();
              }
            }}
            style={s.iconBtn}
          >
            <MaterialCommunityIcons name="menu" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <View style={s.breadcrumbs}>
            <Text style={s.crumbMuted}>GSI / {t(categoryKey as any)} / </Text>
            <Text style={s.crumbActive}>{routeLabel}</Text>
          </View>
        </View>

        {/* Center: Search Bar */}
        <View style={s.center}>
          <View style={s.searchBox}>
            <MaterialCommunityIcons name="magnify" size={18} color="#999" />
            <TextInput
              placeholder={t('search')}
              style={s.searchInput}
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <TouchableOpacity style={s.scanIcon} onPress={() => setShowScanner(true)}>
              <MaterialCommunityIcons name="qrcode-scan" size={20} color={C.info} />
            </TouchableOpacity>
            <View style={s.searchKey}>
              <Text style={s.keyText}>
                {Platform.OS === 'ios' || Platform.OS === 'web' ? '⌘K' : 'Ctrl+K'}
              </Text>
            </View>
          </View>
        </View>

        {/* Right Side: Actions */}
        <View style={s.right}>
          <View style={s.langSwitcher}>
            <TouchableOpacity
              onPress={() => setLang('FR')}
              style={[s.langBtn, lang === 'FR' && s.langBtnActive]}
            >
              <Text style={[s.langText, lang === 'FR' && s.langTextActive]}>FR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setLang('EN')}
              style={[s.langBtn, lang === 'EN' && s.langBtnActive]}
            >
              <Text style={[s.langText, lang === 'EN' && s.langTextActive]}>EN</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => {
              setShowNotifs(true);
              // Badge conservé à l'ouverture : il diminue au fur et à mesure
              // que l'utilisateur consulte chaque notification.
            }}
          >
            <MaterialCommunityIcons name="bell-outline" size={22} color="#1A1A1A" />
            {unreadCount > 0 && (
              <View style={s.notifBadge}>
                <Text style={s.notifBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={() => setShowSettings(true)}>
            <MaterialCommunityIcons name="cog-outline" size={22} color="#1A1A1A" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Notification Modal (Pro Look) */}
      <Modal visible={showNotifs} transparent animationType="fade">
        <TouchableOpacity
          style={[s.modalOverlay, isMobile && s.modalOverlayMobile]}
          activeOpacity={1}
          onPress={() => setShowNotifs(false)}
        >
          <View style={[s.notifPanel, isMobile && s.notifPanelMobile]}>
            <View style={s.notifHeader}>
              <Text style={s.notifTitle}>{t('notifications')}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {unreadCount > 0 && (
                  <TouchableOpacity style={{ padding: 4 }} onPress={() => markAllRead.mutate()}>
                    <MaterialCommunityIcons name="check-all" size={20} color={C.info} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={{ padding: 4 }} onPress={() => clearRead.mutate()}>
                  <MaterialCommunityIcons name="delete-sweep-outline" size={20} color="#6C757D" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowNotifs(false)}>
                  <MaterialCommunityIcons name="close" size={20} color="#6C757D" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Filtres Métier */}
            <View style={s.filterRow}>
              <FilterChip
                label={t('all')}
                active={activeFilter === 'ALL'}
                onPress={() => setActiveFilter('ALL')}
              />
              <FilterChip
                label={t('filter_quality')}
                active={activeFilter === 'QUALITY'}
                onPress={() => setActiveFilter('QUALITY')}
              />
              <FilterChip
                label={t('filter_production')}
                active={activeFilter === 'PRODUCTION'}
                onPress={() => setActiveFilter('PRODUCTION')}
              />
              <FilterChip
                label={t('filter_purchasing')}
                active={activeFilter === 'PURCHASING'}
                onPress={() => setActiveFilter('PURCHASING')}
              />
            </View>

            <ScrollView style={{ maxHeight: isMobile ? screenWidth * 0.75 : 400 }}>
              {filteredNotifications.length === 0 ? (
                <Text style={s.emptyNotifs}>{t('notif_empty_category')}</Text>
              ) : (
                filteredNotifications.map((n) => {
                  const isCriticalStock =
                    (profile?.role === 'MAGA' || profile?.role === 'RACH') &&
                    (n.title?.toLowerCase().includes('stock') ||
                      n.title?.toLowerCase().includes('rupture') ||
                      n.title?.toLowerCase().includes('seuil') ||
                      n.message?.toLowerCase().includes('seuil'));

                  const isQualityAlert =
                    profile?.role === 'RQ' &&
                    (n.title?.toLowerCase().includes('fnc') ||
                      n.title?.toLowerCase().includes('anomalie') ||
                      n.title?.toLowerCase().includes('blocage'));

                  const isHighPriority = isCriticalStock || isQualityAlert;

                  return (
                    <TouchableOpacity
                      key={n.id}
                      style={[
                        s.notifItem,
                        !n.read && s.notifUnread,
                        isHighPriority && s.highPriorityNotif,
                      ]}
                      onPress={() => {
                        // Marquer comme lu (optimistic update local cache) puis naviguer
                        try {
                          const key = ['notifications', profile?.id, profile?.role];
                          const current: any[] =
                            (queryClient.getQueryData(key) as any[]) || notifications || [];
                          const updated = current.map((x: any) =>
                            x.id === n.id ? { ...x, read: true } : x,
                          );
                          queryClient.setQueryData(key, updated);
                          // Mettre aussi à jour la clé générique pour le badge
                          queryClient.setQueryData(['notifications'], (old: any[]) =>
                            Array.isArray(old) ? old.map((x: any) => x.id === n.id ? { ...x, read: true } : x) : old
                          );
                        } catch (e) {
                          // ignore cache errors
                        }
                        markReadMutation.mutate({
                          id: n.id,
                          values: { read: true },
                          type: 'UPDATE',
                        });
                        setShowNotifs(false);
                        // Navigation intelligente selon le type de notification
                        const nav = props.navigation as any;
                        const meta = n.metadata || {};
                        const title = n.title?.toLowerCase() || '';
                        const msg = n.message?.toLowerCase() || '';
                        if (meta.screen) {
                          // Navigation explicite via metadata.screen
                          nav.navigate(meta.screen, meta.params || {});
                        } else if (
                          title.includes('quarantaine') ||
                          title.includes('rpf') ||
                          msg.includes('quarantaine')
                        ) {
                          nav.navigate('ReceptionPF', meta.lot_id ? { filter: meta.lot_id } : {});
                        } else if (
                          title.includes('fnc') ||
                          title.includes('anomalie') ||
                          title.includes('non-conformit')
                        ) {
                          nav.navigate('Fnc', meta.fnc_id ? { filter: meta.fnc_id } : {});
                        } else if (
                          title.includes('of') ||
                          title.includes('ordre de fab') ||
                          title.includes('production')
                        ) {
                          nav.navigate('Production');
                        } else if (
                          title.includes('stock') ||
                          title.includes('rupture') ||
                          title.includes('seuil') ||
                          msg.includes('stock')
                        ) {
                          nav.navigate('Stocks');
                        } else if (
                          meta.category === 'PURCHASING' &&
                          (title.includes('da import') ||
                            title.includes('[rec]') ||
                            title.includes('[eta]') ||
                            title.includes('[exp]') ||
                            title.includes('[bl]') ||
                            title.includes('[dou]') ||
                            title.includes('[fin]'))
                        ) {
                          nav.navigate(
                            'PurchasingImport',
                            meta.da_import_id ? { filter: meta.da_import_id } : {},
                          );
                        } else if (
                          title.includes('da') ||
                          title.includes('achat') ||
                          title.includes('commande')
                        ) {
                          nav.navigate('PurchasingLocal');
                        } else if (
                          title.includes('réception') ||
                          title.includes('reception') ||
                          title.includes('lot')
                        ) {
                          nav.navigate('Reception');
                        } else if (
                          title.includes('laboratoire') ||
                          title.includes('analyse') ||
                          title.includes('fcq')
                        ) {
                          nav.navigate('Laboratory');
                        }
                        // Si aucun match : on reste sur l'écran actuel (notification lue)
                      }}
                    >
                      <View style={s.notifIcon}>
                        <MaterialCommunityIcons
                          name={isHighPriority ? 'bell-ring-outline' : 'alert-decagram'}
                          size={20}
                          color={isHighPriority ? '#DC3545' : n.read ? '#ADB5BD' : C.info}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 2,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <NotifTitleWithTag
                              title={n.title}
                              unread={!n.read}
                              highPriority={isHighPriority}
                            />
                          </View>
                          {isHighPriority && (
                            <View style={s.priorityBadge}>
                              <Text style={s.priorityBadgeText}>URGENT</Text>
                            </View>
                          )}
                        </View>
                        <Text
                          style={[
                            s.notifItemMsg,
                            isHighPriority && { color: '#333', fontWeight: '500' },
                          ]}
                        >
                          {n.message}
                        </Text>
                        <Text style={s.notifDate}>
                          {new Date(n.created_at).toLocaleDateString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Settings Modal */}
      <Modal visible={showSettings} transparent animationType="fade">
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSettings(false)}
        >
          <View style={s.settingsPanel}>
            <View style={s.settingsHeader}>
              <View>
                <Text style={s.notifTitle}>{t('param_label')}</Text>
                <Text style={{ fontSize: 12, color: '#6C757D', marginTop: 2 }}>
                  {profile?.full_name}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#6C757D" />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16, gap: 12 }}>
              <TouchableOpacity
                style={s.settingsItem}
                onPress={() => {
                  setShowSettings(false);
                  if (setShowProfile) setShowProfile(true);
                }}
              >
                <MaterialCommunityIcons name="account-outline" size={20} color="#1A1A1A" />
                <Text style={s.settingsItemText}>{t('my_profile')}</Text>
              </TouchableOpacity>
              {profile?.role === 'ADMIN' && (
                <TouchableOpacity
                  style={s.settingsItem}
                  onPress={() => {
                    setShowSettings(false);
                    (props.navigation as any).navigate('AdminUsers');
                  }}
                >
                  <MaterialCommunityIcons name="shield-account-outline" size={20} color="#1A56DB" />
                  <Text style={[s.settingsItemText, { color: '#1A56DB' }]}>
                    {t('manage_users_link')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <ScannerModal
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleScan}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E9ECEF',
    borderBottomWidth: 1,
  },
  container: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 20,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  breadcrumbs: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  crumbMuted: { fontSize: 13, color: '#ADB5BD' },
  crumbActive: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },

  center: {
    flex: 1.5,
  },
  searchBox: {
    backgroundColor: '#F8F9FA',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      },
    }),
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingHorizontal: 8,
    color: '#1A1A1A',
    ...Platform.select({
      web: { outlineStyle: 'none' },
    }),
  },
  searchKey: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E9ECEF',
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  keyText: { fontSize: 10, color: '#ADB5BD', fontWeight: '700' },
  scanIcon: {
    paddingHorizontal: 10,
    borderLeftWidth: 1,
    borderLeftColor: '#E9ECEF',
    marginRight: 4,
  },

  right: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  langSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 2,
    marginRight: 8,
  },
  langBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  langBtnActive: {
    backgroundColor: '#FFF',
    ...Platform.select({
      web: { boxShadow: '0 2px 4px rgba(0,0,0,0.05)' },
      default: { elevation: 2 },
    }),
  },
  langText: { fontSize: 12, fontWeight: '600', color: '#ADB5BD' },
  langTextActive: { fontSize: 12, fontWeight: '700', color: '#1A1A1A' },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  notifBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#FA5252',
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  notifBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 60,
    paddingRight: 20,
  },
  modalOverlayMobile: {
    alignItems: 'center',
    paddingRight: 0,
    paddingTop: 80,
    paddingHorizontal: 12,
  },
  notifPanel: {
    width: 360,
    backgroundColor: '#FFF',
    borderRadius: 12,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 10px 30px rgba(0,0,0,0.1)' },
      default: { elevation: 10 },
    }),
  },
  notifPanelMobile: {
    width: '100%',
    maxWidth: 420,
  },
  notifHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F5',
  },
  notifTitle: { fontSize: 16, fontWeight: '800', color: '#1A1A1A' },
  filterRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F5',
  },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F8F9FA' },
  chipActive: { backgroundColor: '#E8F0FE' },
  chipText: { fontSize: 11, fontWeight: '600', color: '#6C757D' },
  chipTextActive: { color: '#1A56DB' },
  emptyNotifs: { padding: 32, textAlign: 'center', color: '#ADB5BD', fontSize: 13 },
  notifItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F9FA',
    gap: 12,
  },
  notifUnread: { backgroundColor: '#F8F9FA' },
  notifIcon: { marginTop: 2 },
  notifItemTitle: { fontSize: 13, color: '#1A1A1A', marginBottom: 4 },
  notifItemMsg: { fontSize: 12, color: '#6C757D', lineHeight: 18, marginBottom: 6 },
  notifDate: { fontSize: 10, color: '#ADB5BD', fontWeight: '600' },
  settingsPanel: {
    width: 300,
    backgroundColor: '#FFF',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 10,
    ...Platform.select({
      web: { boxShadow: '0 10px 30px rgba(0,0,0,0.1)' },
      default: { elevation: 10 },
    }),
  },
  settingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F5',
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
    gap: 12,
  },
  settingsItemText: { fontSize: 13, fontWeight: '600', color: '#1A1A1A' },
  highPriorityNotif: {
    backgroundColor: '#FFF0F0',
    borderColor: '#FFC1C1',
    borderWidth: 1,
    borderRadius: 8,
    marginHorizontal: 8,
    marginVertical: 4,
  },
  priorityBadge: {
    backgroundColor: '#DC3545',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priorityBadgeText: { color: '#FFF', fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
});
