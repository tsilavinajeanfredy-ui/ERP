import * as React from 'react';
import { StyleSheet, Text, View, ScrollView, Image, TouchableOpacity, Platform } from 'react-native';
import { DrawerContentComponentProps } from '@react-navigation/drawer';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { SidebarItem } from './Ui';
import { useTranslation } from '../lib/i18n';
import { useUserProfile, usePermissions, useSidebarCounts } from '../lib/hooks';
import { SidebarContext } from '../lib/SidebarContext';
import { Modal } from 'react-native';

export function SidebarContent(props: DrawerContentComponentProps) {
  const { t } = useTranslation();
  const { profile } = useUserProfile();
  const { canAccessScreen } = usePermissions();
  const { isCollapsed } = React.useContext(SidebarContext);
  const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false);

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    supabase?.auth.signOut();
  };

  const nav = (route: string, params?: object) => {
    (props.navigation.navigate as unknown as (name: string, params?: object) => void)(route, params);
  };

  const focusedRoute = props.state.routes[props.state.index];
  const currentRoute = focusedRoute.name;
  // Onglet RH actif (l'écran RH lit ce paramètre pour afficher la bonne section)
  const rhActiveTab =
    currentRoute === 'Rh'
      ? ((focusedRoute.params as { tab?: string } | undefined)?.tab ?? 'personnels')
      : null;
  const { counts } = useSidebarCounts(currentRoute);

  return (
    <View style={s.container}>
      {/* Branding */}
      <View style={[s.brand, isCollapsed && { justifyContent: 'center', paddingHorizontal: 0 }]}>
        <Image
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          source={require('../../public/photos/logo.png')}
          style={s.logo}
          resizeMode="contain"
        />
        {!isCollapsed && <Text style={s.brandText}>GROUPE SIPROMAD</Text>}
      </View>

      {/* Sub-header */}
      {!isCollapsed && (
        <View style={s.subHeader}>
          <Text style={s.erpText}>ERP GSI</Text>
          <Text style={s.modulesText}>Qualité · Production · Achats</Text>
        </View>
      )}

      <ScrollView style={s.menu} contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        {/* Section PILOTAGE */}
        {!isCollapsed && <Text style={s.sectionTitle}>{t('pilotage')}</Text>}
        {canAccessScreen('Dashboard') && (
          <SidebarItem label={t('dashboard')} icon="view-dashboard-outline" active={currentRoute === 'Dashboard'} isCollapsed={isCollapsed} onPress={() => nav('Dashboard')} />
        )}
        {canAccessScreen('Audit') && (
          <SidebarItem label={t('audit')} icon="shield-search" active={currentRoute === 'Audit'} isCollapsed={isCollapsed} onPress={() => nav('Audit')} />
        )}
        {canAccessScreen('Referential') && (
          <SidebarItem label={t('referential')} icon="database-cog-outline" active={currentRoute === 'Referential'} isCollapsed={isCollapsed} onPress={() => nav('Referential')} />
        )}
        {canAccessScreen('Shipping') && (
          <SidebarItem label={t('shipping')} icon="truck-fast" badge={counts.shipping} active={currentRoute === 'Shipping'} isCollapsed={isCollapsed} onPress={() => nav('Shipping')} />
        )}
        {canAccessScreen('Fnc') && (
          <SidebarItem label={t('fnc')} icon="alert-circle-outline" active={currentRoute === 'Fnc'} isCollapsed={isCollapsed} onPress={() => nav('Fnc')} />
        )}
        {canAccessScreen('Complaints') && (
          <SidebarItem label={t('complaints')} icon="comment-alert-outline" active={currentRoute === 'Complaints'} isCollapsed={isCollapsed} onPress={() => nav('Complaints')} />
        )}
        {canAccessScreen('AdminUsers') && (
          <SidebarItem label="Gestion Utilisateurs" icon="account-cog-outline" active={currentRoute === 'AdminUsers'} isCollapsed={isCollapsed} onPress={() => nav('AdminUsers')} />
        )}
        {canAccessScreen('Admin') && (
          <SidebarItem label="Connecteur SAGE" icon="swap-horizontal" active={currentRoute === 'SageSync'} isCollapsed={isCollapsed} onPress={() => nav('SageSync')} />
        )}
        {canAccessScreen('EdgeFunctionTest') && (
          <SidebarItem label="Diagnostic Serveur" icon="test-tube" active={currentRoute === 'EdgeFunctionTest'} isCollapsed={isCollapsed} onPress={() => nav('EdgeFunctionTest')} />
        )}
        <SidebarItem label="File de Synchro" icon="cloud-sync" active={currentRoute === 'OfflineSync'} isCollapsed={isCollapsed} onPress={() => nav('OfflineSync')} />



        <View style={{ height: 20 }} />

        {/* Section OPÉRATIONS */}
        {!isCollapsed && <Text style={s.sectionTitle}>{t('operations')}</Text>}
        {canAccessScreen('Reception') && (
          <SidebarItem label={t('reception')} icon="email-receive-outline" badge={counts.reception} active={currentRoute === 'Reception'} isCollapsed={isCollapsed} onPress={() => nav('Reception')} />
        )}
        {canAccessScreen('ReceptionPF') && (
          <SidebarItem label="Réception PF" icon="package-down" badge={counts.receptionPF} active={currentRoute === 'ReceptionPF'} isCollapsed={isCollapsed} onPress={() => nav('ReceptionPF')} />
        )}
        {canAccessScreen('Laboratory') && (
          <SidebarItem label={t('laboratory')} icon="flask-outline" badge={counts.laboratory} active={currentRoute === 'Laboratory'} isCollapsed={isCollapsed} onPress={() => nav('Laboratory')} />
        )}
        {canAccessScreen('Production') && (
          <SidebarItem label={t('nav_production')} icon="factory" active={currentRoute === 'Production'} isCollapsed={isCollapsed} onPress={() => nav('Production')} />
        )}
        {canAccessScreen('Stocks') && (
          <SidebarItem label={t('stocks')} icon="package-variant-closed" badge={counts.stocks} active={currentRoute === 'Stocks'} isCollapsed={isCollapsed} onPress={() => nav('Stocks')} />
        )}
        {canAccessScreen('Inventory') && (
          <SidebarItem label={t('inventory')} icon="clipboard-list-outline" active={currentRoute === 'Inventory'} isCollapsed={isCollapsed} onPress={() => nav('Inventory')} />
        )}
        {canAccessScreen('Mrp') && (
          <SidebarItem label={t('mrp')} icon="calculator-variant" active={currentRoute === 'Mrp'} isCollapsed={isCollapsed} onPress={() => nav('Mrp')} />
        )}
        {canAccessScreen('Maintenance') && (
          <SidebarItem label="GMAO / Maintenance" icon="wrench-outline" active={currentRoute === 'Maintenance'} isCollapsed={isCollapsed} onPress={() => nav('Maintenance')} />
        )}
        {canAccessScreen('Metrology') && (
          <SidebarItem label="Métrologie CQ" icon="scale-balance" active={currentRoute === 'Metrology'} isCollapsed={isCollapsed} onPress={() => nav('Metrology')} />
        )}
        {canAccessScreen('Instruments') && (
          <SidebarItem label="Instruments" icon="tune" active={currentRoute === 'Instruments'} isCollapsed={isCollapsed} onPress={() => nav('Instruments')} />
        )}
        {canAccessScreen('CalibrationManagement') && (
          <SidebarItem label="Calendrier Étalonnage" icon="calendar-clock-outline" active={currentRoute === 'CalibrationManagement'} isCollapsed={isCollapsed} onPress={() => nav('CalibrationManagement')} />
        )}


        <View style={{ height: 20 }} />

        {/* Section RESSOURCES HUMAINES */}
        {canAccessScreen('Rh') && (
          <>
            {!isCollapsed && <Text style={s.sectionTitle}>RESSOURCES HUMAINES</Text>}
            <SidebarItem label="Personnels"   icon="account-group-outline"  active={rhActiveTab === 'personnels'}   isCollapsed={isCollapsed} onPress={() => nav('Rh', { tab: 'personnels' })} />
            <SidebarItem label="Affectations" icon="account-switch-outline" active={rhActiveTab === 'affectations'} isCollapsed={isCollapsed} onPress={() => nav('Rh', { tab: 'affectations' })} />
            <SidebarItem label="Heures Supp." icon="clock-alert-outline"    active={rhActiveTab === 'heures_sup'}   isCollapsed={isCollapsed} onPress={() => nav('Rh', { tab: 'heures_sup' })} />
            <SidebarItem label="Saisie"       icon="pencil-plus-outline"    active={rhActiveTab === 'saisie'}       isCollapsed={isCollapsed} onPress={() => nav('Rh', { tab: 'saisie' })} />
            <SidebarItem label="Budget"       icon="chart-bar"              active={rhActiveTab === 'budget'}       isCollapsed={isCollapsed} onPress={() => nav('Rh', { tab: 'budget' })} />
            <SidebarItem label="Congés"       icon="beach"                  active={rhActiveTab === 'conges'}       isCollapsed={isCollapsed} onPress={() => nav('Rh', { tab: 'conges' })} />
            <SidebarItem label="Imports"      icon="history"                active={rhActiveTab === 'historique'}   isCollapsed={isCollapsed} onPress={() => nav('Rh', { tab: 'historique' })} />
            <View style={{ height: 20 }} />
          </>
        )}

        {/* Section APPROVISIONNEMENTS */}
        {!isCollapsed && <Text style={s.sectionTitle}>{t('approvisionnements')}</Text>}
        {canAccessScreen('PurchasingImport') && (
          <SidebarItem label={t('purchasingImport')} icon="ship-wheel" badge={counts.purchasingImport} active={currentRoute === 'PurchasingImport'} isCollapsed={isCollapsed} onPress={() => nav('PurchasingImport')} />
        )}
        {canAccessScreen('PurchasingLocal') && (
          <SidebarItem label={t('purchasingLocal')} icon="truck-delivery-outline" active={currentRoute === 'PurchasingLocal'} isCollapsed={isCollapsed} onPress={() => nav('PurchasingLocal')} />
        )}
        {canAccessScreen('PlanningLogistique') && (
          <SidebarItem label={t('logistic_planning')} icon="calendar-clock" active={currentRoute === 'PlanningLogistique'} isCollapsed={isCollapsed} onPress={() => nav('PlanningLogistique')} />
        )}
      </ScrollView>

      {/* User Info Bottom */}
      <View style={[s.userFooter, isCollapsed && { justifyContent: 'center', paddingHorizontal: 0, flexDirection: 'column' }]}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{profile?.full_name?.substring(0, 2).toUpperCase() || '??'}</Text>
        </View>
        {!isCollapsed && (
          <View style={{ flex: 1 }}>
            <Text style={s.userName} numberOfLines={1}>{profile?.full_name || 'Utilisateur'}</Text>
            <Text style={s.userRole}>{profile?.role || 'Chargement...'}</Text>
          </View>
        )}
        <TouchableOpacity onPress={handleLogout} style={isCollapsed && { marginTop: 12 }}>
          <MaterialCommunityIcons name="logout" size={isCollapsed ? 20 : 18} color="#666" />
        </TouchableOpacity>
      </View>

      {/* Logout Confirmation Modal */}
      <Modal visible={showLogoutConfirm} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.logoutModal}>
            <View style={s.logoutHeader}>
              <MaterialCommunityIcons name="logout-variant" size={24} color="#D4A017" />
              <Text style={s.logoutTitle}>Déconnexion</Text>
            </View>
            <Text style={s.logoutText}>Êtes-vous sûr de vouloir fermer votre session sécurisée GSI ERP ?</Text>
            <View style={s.logoutActions}>
              <TouchableOpacity style={s.logoutBtnCancel} onPress={() => setShowLogoutConfirm(false)}>
                <Text style={s.logoutBtnCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.logoutBtnConfirm} onPress={confirmLogout}>
                <Text style={s.logoutBtnConfirmText}>Se Déconnecter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111', // Matches sidebar color
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  logo: {
    width: 24,
    height: 24,
  },
  brandText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subHeader: {
    padding: 20,
    paddingTop: 16,
  },
  erpText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  modulesText: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  menu: {
    flex: 1,
    paddingHorizontal: 12,
    ...Platform.select({
      web: { overflow: 'auto' as any },
      default: {},
    }),
  },
  sectionTitle: {
    color: '#555',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  userFooter: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#222',
    backgroundColor: '#0D0D0D',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E513B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  userName: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  userRole: {
    color: '#666',
    fontSize: 11,
  },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center'
  },
  logoutModal: {
    backgroundColor: '#FFF', width: 340, borderRadius: 16, padding: 24,
    ...Platform.select({ web: { boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }, default: { elevation: 10 } }),
  },
  logoutHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  logoutTitle: { fontSize: 20, fontWeight: '800', color: '#1A1A1A' },
  logoutText: { fontSize: 14, color: '#495057', lineHeight: 22, marginBottom: 24 },
  logoutActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  logoutBtnCancel: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#F8F9FA' },
  logoutBtnCancelText: { color: '#495057', fontWeight: '700' },
  logoutBtnConfirm: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#DC3545' },
  logoutBtnConfirmText: { color: '#FFF', fontWeight: '700' }
});
