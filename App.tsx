import 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';

import { NavigationContainer, DefaultTheme, Theme } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { StatusBar } from 'expo-status-bar';
import * as React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator, Platform, useWindowDimensions, Alert, Text, StyleSheet } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppShellHeader } from './src/components/AppShellHeader';
import { SidebarContent } from './src/components/SidebarContent';
import { LoginScreen } from './src/screens/LoginScreen';
import { useUserProfile, useMutation, useRealtimeSync } from './src/lib/hooks';
import { supabase } from './src/lib/supabase';
import { Session } from '@supabase/supabase-js';
import { LanguageProvider, useTranslation } from './src/lib/i18n';
import { SearchProvider } from './src/lib/search';
import { TwoFactorScreen } from './src/screens/TwoFactorScreen';
import { ProfileModal } from './src/components/ProfileModal';
import { SidebarContext } from './src/lib/SidebarContext';
import { NotificationToastProvider } from './src/components/NotificationToast';
import { ConfirmDialog } from './src/components/Ui';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { initMonitoring, setMonitoringUser, clearMonitoringUser } from './src/lib/monitoring';
import { registerForPushNotificationsAsync, savePushTokenForUser } from './src/lib/notifications';

// ─── Lazy-loaded screens — chargés à la première navigation ─────────────────
// TOUS les screens sont lazy pour minimiser le bundle initial (~80KB vs ~840KB)
const _LazyDashboardScreen = React.lazy(() => import('./src/screens/DashboardScreen').then(m => ({ default: m.DashboardScreen })));
const _LazyLaboratoryScreen = React.lazy(() => import('./src/screens/LaboratoryScreen').then(m => ({ default: m.LaboratoryScreen })));
const _LazyReceptionScreen = React.lazy(() => import('./src/screens/ReceptionScreen').then(m => ({ default: m.ReceptionScreen })));
const _LazyProductionScreen = React.lazy(() => import('./src/screens/ProductionScreen').then(m => ({ default: m.ProductionScreen })));
const _LazyStocksScreen = React.lazy(() => import('./src/screens/StocksScreen').then(m => ({ default: m.StocksScreen })));
const _LazyFncScreen = React.lazy(() => import('./src/screens/FncScreen').then(m => ({ default: m.FncScreen })));
const _LazyAuditScreen = React.lazy(() => import('./src/screens/AuditScreen').then(m => ({ default: m.AuditScreen })));
const _LazyComplaintsScreen = React.lazy(() => import('./src/screens/ComplaintsScreen').then(m => ({ default: m.ComplaintsScreen })));
const _LazyInventoryScreen = React.lazy(() => import('./src/screens/InventoryScreen').then(m => ({ default: m.InventoryScreen })));
const _LazyPurchasingImportScreen = React.lazy(() => import('./src/screens/PurchasingImportScreen').then(m => ({ default: m.PurchasingImportScreen })));
const _LazyPurchasingLocalScreen = React.lazy(() => import('./src/screens/PurchasingLocalScreen').then(m => ({ default: m.PurchasingLocalScreen })));
const _LazyMrpScreen = React.lazy(() => import('./src/screens/MrpScreen').then(m => ({ default: m.MrpScreen })));
// Note: keep these screens statically imported to avoid runtime chunk loading errors
const _LazyReferentialScreen = React.lazy(() => import('./src/screens/ReferentialScreen').then(m => ({ default: m.ReferentialScreen })));
const _LazyAdminScreen = React.lazy(() => import('./src/screens/AdminScreen').then(m => ({ default: m.AdminScreen })));
const _LazyAdminUsersScreen = React.lazy(() => import('./src/screens/AdminUsersScreen').then(m => ({ default: m.AdminUsersScreen })));
const _LazyRhScreen = React.lazy(() => import('./src/screens/RhScreen').then(m => ({ default: m.RhScreen })));
const _LazyEdgeFunctionTestScreen = React.lazy(() => import('./src/screens/EdgeFunctionTestScreen').then(m => ({ default: m.EdgeFunctionTestScreen })));
const _LazyReceptionPFScreen = React.lazy(() => import('./src/screens/ReceptionPFScreen').then(m => ({ default: m.ReceptionPFScreen })));
const _LazyPlanningLogistiqueScreen = React.lazy(() => import('./src/screens/PlanningLogistiqueScreen').then(m => ({ default: m.PlanningLogistiqueScreen })));
const _LazyShippingScreen = React.lazy(() => import('./src/screens/ShippingScreen').then(m => ({ default: m.ShippingScreen })));
const _LazyTraceabilityScreen = React.lazy(() => import('./src/screens/TraceabilityScreen').then(m => ({ default: m.TraceabilityScreen })));
const _LazySupplierEvaluationScreen = React.lazy(() => import('./src/screens/SupplierEvaluationScreen').then(m => ({ default: m.SupplierEvaluationScreen })));
const _LazyProductionCostsScreen = React.lazy(() => import('./src/screens/ProductionCostsScreen').then(m => ({ default: m.ProductionCostsScreen })));
const _LazyDocumentsScreen = React.lazy(() => import('./src/screens/DocumentsScreen').then(m => ({ default: m.DocumentsScreen })));
const _LazyMaintenanceScreen = React.lazy(() => import('./src/screens/MaintenanceScreen').then(m => ({ default: m.MaintenanceScreen })));
const _LazySageSyncScreen = React.lazy(() => import('./src/screens/SageSyncScreen').then(m => ({ default: m.SageSyncScreen })));
const _LazyMetrologyScreen = React.lazy(() => import('./src/screens/MetrologyScreen').then(m => ({ default: m.MetrologyScreen })));
const _LazyOfflineSyncScreen = React.lazy(() => import('./src/screens/OfflineSyncScreen').then(m => ({ default: m.OfflineSyncScreen })));
const _LazyInstrumentsScreen = React.lazy(() => import('./src/screens/InstrumentsScreen').then(m => ({ default: m.InstrumentsScreen })));
const _LazyCalibrationManagementScreen = React.lazy(() => import('./src/screens/CalibrationManagementScreen'));

// ─── Wrapper Suspense pour les écrans lazy ────────────────────────────────────
function LazyScreen({ component: Component }: { component: React.ComponentType<object> }) {
  return (
    <React.Suspense fallback={
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1A1A1A" />
      </View>
    }>
      <Component />
    </React.Suspense>
  );
}


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // staleTime global à 30s : évite les requêtes en rafale à chaque focus/mount
      // Les hooks transactionnels (lots, FCQ, bons_entree) surchargent avec staleTime: 0
      staleTime: 30_000,
      gcTime: 5 * 60_000, // Garde les données en cache 5 minutes
      retry: (failureCount, error: any) => {
        const msg = (error?.message || '').toLowerCase();
        if (msg.includes('does not exist') || msg.includes('relation')) return false;
        return failureCount < 2;
      },
      // Pas de refetch au focus sur web : évite la tempête de requêtes
      // quand 50-150 users changent d'onglet simultanément
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: true,
    },
  },
});

const Drawer = createDrawerNavigator();

const SipromadTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#1A1A1A',
    background: '#F8F9FA',
  },
};

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const WARNING_TIME = 60 * 1000; // 1 minute avant déconnexion


// ─── Named lazy screen wrappers (required by React Navigation) ──────────────
const LazyDashboardScreen = () => <LazyScreen component={_LazyDashboardScreen} />;
const LazyLaboratoryScreen = () => <LazyScreen component={_LazyLaboratoryScreen} />;
const LazyReceptionScreen = () => <LazyScreen component={_LazyReceptionScreen} />;
const LazyProductionScreen = () => <LazyScreen component={_LazyProductionScreen} />;
const LazyStocksScreen = () => <LazyScreen component={_LazyStocksScreen} />;
const LazyFncScreen = () => <LazyScreen component={_LazyFncScreen} />;
const LazyComplaintsScreen = () => <LazyScreen component={_LazyComplaintsScreen} />;
const LazyInventoryScreen = () => <LazyScreen component={_LazyInventoryScreen} />;
const LazyPurchasingImportScreen = () => <LazyScreen component={_LazyPurchasingImportScreen} />;
const LazyPurchasingLocalScreen = () => <LazyScreen component={_LazyPurchasingLocalScreen} />;
const LazyMrpScreen = () => <LazyScreen component={_LazyMrpScreen} />;
const LazyAuditScreen = () => <LazyScreen component={_LazyAuditScreen} />;
const LazyReferentialScreen = () => <LazyScreen component={_LazyReferentialScreen} />;
const LazyAdminScreen = () => <LazyScreen component={_LazyAdminScreen} />;
const LazyAdminUsersScreen = () => <LazyScreen component={_LazyAdminUsersScreen} />;
const LazyRhScreen = () => <LazyScreen component={_LazyRhScreen} />;
const LazyEdgeFunctionTestScreen = () => <LazyScreen component={_LazyEdgeFunctionTestScreen} />;
const LazyReceptionPFScreen = () => <LazyScreen component={_LazyReceptionPFScreen} />;
const LazyPlanningLogistiqueScreen = () => <LazyScreen component={_LazyPlanningLogistiqueScreen} />;
const LazyShippingScreen = () => <LazyScreen component={_LazyShippingScreen} />;
const LazyTraceabilityScreen = () => <LazyScreen component={_LazyTraceabilityScreen} />;
const LazySupplierEvaluationScreen = () => <LazyScreen component={_LazySupplierEvaluationScreen} />;
const LazyProductionCostsScreen = () => <LazyScreen component={_LazyProductionCostsScreen} />;
const LazyDocumentsScreen = () => <LazyScreen component={_LazyDocumentsScreen} />;
const LazyMaintenanceScreen = () => <LazyScreen component={_LazyMaintenanceScreen} />;
const LazySageSyncScreen = () => <LazyScreen component={_LazySageSyncScreen} />;
const LazyMetrologyScreen = () => <LazyScreen component={_LazyMetrologyScreen} />;
const LazyOfflineSyncScreen = () => <LazyScreen component={_LazyOfflineSyncScreen} />;
const LazyInstrumentsScreen = () => <LazyScreen component={_LazyInstrumentsScreen} />;
const LazyCalibrationManagementScreen = () => <LazyScreen component={_LazyCalibrationManagementScreen} />;

function AppContent() {
  const { profile, loading: profileLoading } = useUserProfile();

  // Initialize error monitoring once user is authenticated
  React.useEffect(() => {
    if (profile?.id) {
      setMonitoringUser(profile.id, profile.email, profile.role);
      initMonitoring(profile.id, profile.email, profile.role);
    }
  }, [profile?.id]);

  const [session, setSession] = React.useState<Session | null>(null);

  // Enregistrer pour les push notifications sur mobile
  React.useEffect(() => {
    if (session && profile?.id) {
      registerForPushNotificationsAsync().then(token => {
        if (token) {
          console.log("Push token récupéré (pour alertes MRP/Stock) :", token);
          savePushTokenForUser(profile.id, token);
        }
      });
    }
  }, [session, profile?.id]);

  // Start global realtime sync to keep dropdowns and lists up-to-date
  useRealtimeSync();
  const [loading, setLoading] = React.useState(true);
  const [showWarning, setShowWarning] = React.useState(false);
  const [secondsLeft, setSecondsLeft] = React.useState(60);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
  const [showWelcome, setShowWelcome] = React.useState(false);
  const [showProfile, setShowProfile] = React.useState(false);

  const userMutation = useMutation('users');
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isLargeScreen = width >= 768;
  const { t } = useTranslation();

  // État de vérification 2FA pour la session courante.
  // Se remet à false à chaque nouvelle connexion (SIGNED_IN).
  const [is2FAVerifiedForSession, setIs2FAVerifiedForSession] = React.useState(() => {
    if (Platform.OS === 'web') {
      return sessionStorage.getItem('gsi_2fa_verified') === 'true';
    }
    return false;
  });

  React.useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session }, error }: { data: { session: any }; error: any }) => {
      if (error) {
        console.warn('[App] Refresh token invalide, déconnexion automatique.');
        // Force local signOut to clear corrupted localStorage without server call
        clearMonitoringUser(); supabase?.auth.signOut({ scope: 'local' }).catch(() => null);
        if (Platform.OS === 'web') {
          localStorage.removeItem('sb-zrwdljoebagrczvhsdto-auth-token');
          sessionStorage.clear();
        }
        setSession(null);
      } else {
        setSession(session);
        // Vérifier si la session correspond à la 2FA stockée
        if (Platform.OS === 'web' && session) {
          const storedUser = sessionStorage.getItem('gsi_2fa_user');
          if (storedUser !== session.user.id) {
            setIs2FAVerifiedForSession(false);
            sessionStorage.removeItem('gsi_2fa_verified');
          }
        }
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: any, session: any) => {
      if (event === 'SIGNED_IN') {
        // Nouvelle connexion : réinitialiser la vérification 2FA de session si c'est un autre utilisateur
        if (Platform.OS === 'web') {
          const storedUser = sessionStorage.getItem('gsi_2fa_user');
          if (session && storedUser !== session.user.id) {
            setIs2FAVerifiedForSession(false);
            sessionStorage.removeItem('gsi_2fa_verified');
            sessionStorage.setItem('gsi_2fa_user', session.user.id);
            sessionStorage.removeItem('gsi_welcome_shown');
          }
        } else {
          setIs2FAVerifiedForSession(false);
        }
        setSession(session);
        // ⚠️ showWelcome différé après validation 2FA (voir onVerify callback).
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setIs2FAVerifiedForSession(false);
        if (Platform.OS === 'web') {
          sessionStorage.removeItem('gsi_2fa_verified');
          sessionStorage.removeItem('gsi_2fa_user');
          sessionStorage.removeItem('gsi_welcome_shown');
        } else {
          (global as any).gsiWelcomeShown = false;
        }
      } else if (event === 'TOKEN_REFRESHED') {
        setSession(session);
      } else {
        setSession(session);
      }
    });

    if (Platform.OS === 'web') {
      const style = document.createElement('style');
      style.innerHTML = `
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; border-radius: 4px; }
        ::-webkit-scrollbar-thumb { background: #c1c9d2; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #a5b0bc; }
        * { scrollbar-width: thin; scrollbar-color: #c1c9d2 transparent; }
      `;
      document.head.appendChild(style);
    }

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Global handler: if any unhandled rejection or error contains
  // "Invalid Refresh Token" (Supabase Auth), force a local sign-out,
  // clear storage and reload so the user is sent to login.
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleRejection = (ev: any) => {
      const err = ev?.reason ?? ev;
      const msg = (err?.message || String(err || '')).toLowerCase();
      if (msg.includes('invalid refresh token') || msg.includes('refresh token not found')) {
        try {
          supabase?.auth.signOut({ scope: 'local' }).catch(() => null);
          // Remove Supabase keys and clear session storage
          try {
            Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k));
          } catch (e) {}
          try { sessionStorage.clear(); } catch (e) {}
          window.location.reload();
        } catch (e) {}
      }
    };

    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('error', handleRejection as EventListener);
    return () => {
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('error', handleRejection as EventListener);
    };
  }, []);
  // Logique de déconnexion automatique
  const resetInactivityTimer = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    setShowWarning(false);

    if (session) {
      // Timer pour afficher l'avertissement (après 14 minutes)
      warningTimerRef.current = setTimeout(() => {
        setShowWarning(true);
        setSecondsLeft(60);

        // Interval pour le compte à rebours du bandeau
        countdownIntervalRef.current = setInterval(() => {
          setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
      }, INACTIVITY_TIMEOUT - WARNING_TIME);

      // Timer pour la déconnexion effective (après 15 minutes)
      timerRef.current = setTimeout(() => {
        clearMonitoringUser(); supabase?.auth.signOut();
        setShowWarning(false);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

        Alert.alert(
          "Session expirée",
          "Votre session a été clôturée automatiquement après 15 minutes d'inactivité pour votre sécurité.",
          [{ text: "Se reconnecter" }]
        );
      }, INACTIVITY_TIMEOUT);
    }
  }, [session]);

  // Gestion des événements Web (Souris, Clavier, Scroll)
  React.useEffect(() => {
    if (isWeb && session) {
      const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
      // mousemove séparé avec throttle 5s pour ne pas spammer resetInactivityTimer
      let mousemoveThrottle: ReturnType<typeof setTimeout> | null = null;

      const handleActivity = () => resetInactivityTimer();
      const handleMouseMove = () => {
        if (!mousemoveThrottle) {
          mousemoveThrottle = setTimeout(() => {
            resetInactivityTimer();
            mousemoveThrottle = null;
          }, 5000);
        }
      };

      events.forEach(event => window.addEventListener(event, handleActivity));
      window.addEventListener('mousemove', handleMouseMove);
      resetInactivityTimer();

      return () => {
        events.forEach(event => window.removeEventListener(event, handleActivity));
        window.removeEventListener('mousemove', handleMouseMove);
        if (mousemoveThrottle) clearTimeout(mousemoveThrottle);
        if (timerRef.current) clearTimeout(timerRef.current);
        if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      };
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [isWeb, session, resetInactivityTimer]);


  if (loading || profileLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1A1A1A" />
      </View>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  // CCTP §4.2 — Enforcement 2FA à chaque nouvelle session pour les rôles critiques.
  // is2FAVerifiedForSession se remet à false à chaque SIGNED_IN.
  const CRITICAL_ROLES_2FA = ['ADMIN', 'DPI', 'RQ', 'SUPER_ADMIN', 'DSI'];
  const requires2FA = profile && CRITICAL_ROLES_2FA.includes(profile.role);
  const must2FA = requires2FA && !is2FAVerifiedForSession;

  if (must2FA) {
    return (
      <TwoFactorScreen
        userEmail={session.user?.email}
        userName={profile?.full_name}
        onVerify={async () => {
          // Rafraîchir le token pour obtenir un JWT AAL2 après vérification 2FA
          // Sans ce refresh, les requêtes REST utilisent encore le token AAL1 → 404
          const { error: refreshError } = await supabase!.auth.refreshSession();
          if (refreshError) {
            console.warn('[App] Erreur refresh session après 2FA:', refreshError.message);
          } else {
          }

          setIs2FAVerifiedForSession(true);
          if (Platform.OS === 'web' && session) {
            sessionStorage.setItem('gsi_2fa_verified', 'true');
            sessionStorage.setItem('gsi_2fa_user', session.user.id);
          }
          // Afficher le message de bienvenue APRÈS validation 2FA
          const hasShown2FA = Platform.OS === 'web'
            ? sessionStorage.getItem('gsi_welcome_shown') === 'true'
            : (global as any).gsiWelcomeShown === true;
          if (!hasShown2FA) {
            setShowWelcome(true);
            if (Platform.OS === 'web') sessionStorage.setItem('gsi_welcome_shown', 'true');
            else (global as any).gsiWelcomeShown = true;
          }
          // Si c'est la première fois (setup), activer définitivement la 2FA sur le compte
          if (profile && !profile.two_fa_enabled) {
            userMutation.mutate({ id: profile.id, values: { two_fa_enabled: true }, type: 'UPDATE' });
          }
        }}
        onSignOut={() => supabase?.auth.signOut()}
      />
    );
  }

  return (
    <View
      style={{ flex: 1 }}
      onStartShouldSetResponderCapture={() => {
        resetInactivityTimer();
        return false; // Permet aux composants enfants de recevoir l'événement
      }}
    >
      {showWarning && (
        <View style={styles.warningBanner}>
          <MaterialCommunityIcons name="clock-alert-outline" size={18} color="#FFF" />
          <Text style={styles.warningText}>
            Déconnexion de sécurité dans {secondsLeft}s. Touchez l'écran pour rester connecté.
          </Text>
        </View>
      )}

      {/* Message de bienvenue / SOS à l'ouverture de session */}
      {showWelcome && session && (
        <View style={styles.welcomeOverlay}>
          <View style={styles.welcomeBox}>
            <View style={styles.welcomeHeader}>
              <MaterialCommunityIcons name="hand-wave" size={28} color="#D4A017" />
              <Text style={styles.welcomeTitle}>Bienvenue, {profile?.full_name || session.user.email} !</Text>
            </View>
            <Text style={styles.welcomeText}>
              Vous êtes connecté(e) sur le portail ERP GSI. N'oubliez pas de consulter vos notifications et tâches en attente (SOS) pour la journée.
            </Text>
            <View style={styles.welcomeActions}>
              <Text onPress={() => { setShowWelcome(false); }} style={styles.welcomeBtnText}>C'est noté, fermer</Text>
            </View>
          </View>
        </View>
      )}

      <SidebarContext.Provider value={{ isCollapsed: isSidebarCollapsed, toggleSidebar: () => setIsSidebarCollapsed(!isSidebarCollapsed), setShowProfile }}>
        <NavigationContainer theme={SipromadTheme}>
          <Drawer.Navigator
            drawerContent={(props) => <SidebarContent {...props} />}
            screenOptions={{
              header: (props) => <AppShellHeader {...props} />,
              drawerType: isWeb && isLargeScreen ? 'permanent' : 'front',
              drawerStyle: {
                width: isSidebarCollapsed ? 80 : 280,
                borderRightWidth: 0,
                backgroundColor: '#1A1A1A',
                ...Platform.select({ web: { transition: 'width 0.3s' } })
              } as any,
              sceneContainerStyle: {
                backgroundColor: '#F8F9FA',
              },
            }}
          >
          <Drawer.Screen name="Dashboard" component={LazyDashboardScreen} options={{ title: t('dashboard') }} />
          <Drawer.Screen name="Reception" component={LazyReceptionScreen} options={{ title: t('reception') }} />
          <Drawer.Screen name="Laboratory" component={LazyLaboratoryScreen} options={{ title: t('laboratory') }} />
          <Drawer.Screen name="Production" component={LazyProductionScreen} options={{ title: t('production') }} />
          <Drawer.Screen name="Stocks" component={LazyStocksScreen} options={{ title: t('stocks') }} />
          <Drawer.Screen name="Inventory" component={LazyInventoryScreen} options={{ title: t('inventory') }} />
          <Drawer.Screen name="Mrp" component={LazyMrpScreen} options={{ title: t('mrp') }} />
          <Drawer.Screen name="Audit" component={LazyAuditScreen} options={{ title: t('audit') }} />
          <Drawer.Screen name="Fnc" component={LazyFncScreen} options={{ title: t('fnc') }} />
          <Drawer.Screen name="Complaints" component={LazyComplaintsScreen} options={{ title: t('complaints') }} />
          <Drawer.Screen name="Referential" component={LazyReferentialScreen} options={{ title: t('referential') }} />
          <Drawer.Screen name="Admin" component={LazyAdminScreen} options={{ title: 'Administration' }} />
          <Drawer.Screen name="AdminUsers" component={LazyAdminUsersScreen} options={{ title: 'Gestion Utilisateurs' }} />
          <Drawer.Screen name="Rh" component={LazyRhScreen} options={{ title: 'RH & Affectations' }} />
          <Drawer.Screen name="EdgeFunctionTest" component={LazyEdgeFunctionTestScreen} options={{ title: '🔧 Diagnostic Edge Function' }} />
          <Drawer.Screen name="SageSync" component={LazySageSyncScreen} options={{ title: 'Synchro SAGE' }} />
          <Drawer.Screen name="PurchasingImport" component={LazyPurchasingImportScreen} options={{ title: t('purchasingImport') }} />

          <Drawer.Screen name="PurchasingLocal" component={LazyPurchasingLocalScreen} options={{ title: t('purchasingLocal') }} />
          <Drawer.Screen name="ReceptionPF" component={LazyReceptionPFScreen} options={{ title: 'Réception Produits Finis' }} />
          <Drawer.Screen name="PlanningLogistique" component={LazyPlanningLogistiqueScreen} options={{ title: t('logistic_planning') }} />
          <Drawer.Screen name="Shipping" component={LazyShippingScreen} options={{ title: t('shipping') }} />
          <Drawer.Screen name="Traceability" component={LazyTraceabilityScreen} options={{ title: 'Traçabilité' }} />
          <Drawer.Screen name="SupplierEvaluation" component={LazySupplierEvaluationScreen} options={{ title: 'Éval. fournisseurs' }} />
          <Drawer.Screen name="ProductionCosts" component={LazyProductionCostsScreen} options={{ title: 'Coûts production' }} />
          <Drawer.Screen name="Documents" component={LazyDocumentsScreen} options={{ title: 'Documents' }} />
          <Drawer.Screen name="Maintenance" component={LazyMaintenanceScreen} options={{ title: 'Maintenance' }} />
          <Drawer.Screen name="Metrology" component={LazyMetrologyScreen} options={{ title: 'Métrologie CQ' }} />
          <Drawer.Screen name="Instruments" component={LazyInstrumentsScreen} options={{ title: 'Instruments' }} />
          <Drawer.Screen name="CalibrationManagement" component={LazyCalibrationManagementScreen} options={{ title: 'Calendrier Étalonnage' }} />
          <Drawer.Screen name="OfflineSync" component={LazyOfflineSyncScreen} options={{ title: 'File de Synchro' }} />
        </Drawer.Navigator>
      </NavigationContainer>
    </SidebarContext.Provider>
    <ProfileModal visible={showProfile} onClose={() => setShowProfile(false)} profile={profile || null} />
    </View>
  );
}

const styles = StyleSheet.create({
  warningBanner: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 0 : 40,
    left: 0,
    right: 0,
    backgroundColor: '#D4A017', // Or Sipromad
    paddingVertical: 10,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    gap: 10,
  },
  warningText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  welcomeOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10000,
    justifyContent: 'center', alignItems: 'center'
  },
  welcomeBox: {
    backgroundColor: '#FFF', width: 400, maxWidth: '90%', borderRadius: 16, padding: 24,
    ...Platform.select({ web: { boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }, default: { elevation: 10 } })
  },
  welcomeHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  welcomeTitle: { fontSize: 20, fontWeight: '800', color: '#1A1A1A', flex: 1 },
  welcomeText: { fontSize: 14, color: '#495057', lineHeight: 22, marginBottom: 24 },
  welcomeActions: { alignItems: 'flex-end' },
  welcomeBtnText: { backgroundColor: '#1A1A1A', color: '#FFF', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, fontWeight: '700', overflow: 'hidden' },
});
export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <LanguageProvider>
            <SearchProvider>
              <NotificationToastProvider>
                <AppContent />
                <ConfirmDialog />
              </NotificationToastProvider>
            </SearchProvider>
          </LanguageProvider>
        </QueryClientProvider>
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
