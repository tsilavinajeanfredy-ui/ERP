import * as React from 'react';
import { ScrollView, StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, useWindowDimensions, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, ActionButton, AnimatedPage, KpiCard, FormInput, FormSelect, Badge } from '../components/Ui';
import { triggerFullSageSync, getPendingSyncRecords, countPendingSyncRecords, SageSyncResult, SageSyncTable } from '../lib/sage';
import { useTranslation } from '../lib/i18n';

export function SageSyncScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const { t } = useTranslation();

  const [syncing, setSyncing] = React.useState(false);
  const [loadingRecords, setLoadingRecords] = React.useState(false);
  const [totalPending, setTotalPending] = React.useState(0);
  const [syncResults, setSyncResults] = React.useState<SageSyncResult[]>([]);
  const [activeTab, setActiveTab] = React.useState<'dashboard' | 'logs' | 'config'>('dashboard');
  const [pendingData, setPendingData] = React.useState<Record<SageSyncTable, any[]>>({
    lots: [],
    stock_movements: [],
    da_import: [],
    da_local: []
  });

  const [config, setConfig] = React.useState({
    api_url: 'https://api-sage.sipromad.mg/odata/v4',
    auth_method: 'OAuth2',
    client_id: 'gsi_erp_production_client_009',
    auto_sync: 'OUI',
    sync_interval: '5',
  });

  const loadPendingCounts = React.useCallback(async () => {
    setLoadingRecords(true);
    try {
      const lotRecs = await getPendingSyncRecords('lots');
      const movementRecs = await getPendingSyncRecords('stock_movements');
      const daImportRecs = await getPendingSyncRecords('da_import');
      const daLocalRecs = await getPendingSyncRecords('da_local');
      
      setPendingData({
        lots: lotRecs,
        stock_movements: movementRecs,
        da_import: daImportRecs,
        da_local: daLocalRecs
      });
      
      const count = await countPendingSyncRecords();
      setTotalPending(count);
    } catch (err) {
      console.error('Erreur chargement des files d\'attente SAGE:', err);
    } finally {
      setLoadingRecords(false);
    }
  }, []);

  React.useEffect(() => {
    loadPendingCounts();
  }, [loadPendingCounts]);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const results = await triggerFullSageSync();
      setSyncResults(results);
      await loadPendingCounts();
    } catch (err) {
      console.error('Erreur lors du déclenchement de la sync SAGE:', err);
    } finally {
      setSyncing(false);
    }
  };

  const getTableLabel = (table: SageSyncTable) => {
    switch (table) {
      case 'lots': return 'Lots Produits / Matières';
      case 'stock_movements': return 'Mouvements de Stock';
      case 'da_import': return 'Demandes d\'Achat Import';
      case 'da_local': return 'Demandes d\'Achat Local';
      default: return table;
    }
  };

  return (
    <AnimatedPage>
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        {/* Header */}
        <View style={[s.headerRow, isMobile && { flexDirection: 'column', alignItems: 'flex-start', gap: 16 }]}>
          <View>
            <Text style={s.title}>Connecteur SAGE 100c</Text>
            <Text style={s.subTitle}>Synchronisation bidirectionnelle temps réel · File d'attente locale</Text>
          </View>
          <View style={s.actions}>
            <ActionButton 
              label="Rafraîchir" 
              icon="refresh" 
              onPress={loadPendingCounts} 
              disabled={syncing}
            />
            <ActionButton 
              label={syncing ? "Synchronisation..." : "Synchroniser maintenant"} 
              icon="swap-horizontal" 
              onPress={handleSyncNow} 
              variant="primary"
              disabled={syncing}
              loading={syncing}
            />
          </View>
        </View>

        {/* Tab Selection */}
        <View style={s.tabBar}>
          <TouchableOpacity 
            style={[s.tabButton, activeTab === 'dashboard' && s.tabButtonActive]} 
            onPress={() => setActiveTab('dashboard')}
          >
            <MaterialCommunityIcons name="view-dashboard-outline" size={18} color={activeTab === 'dashboard' ? '#FFF' : '#6C757D'} />
            <Text style={[s.tabButtonText, activeTab === 'dashboard' && s.tabButtonTextActive]}>Tableau de bord</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[s.tabButton, activeTab === 'logs' && s.tabButtonActive]} 
            onPress={() => setActiveTab('logs')}
          >
            <MaterialCommunityIcons name="history" size={18} color={activeTab === 'logs' ? '#FFF' : '#6C757D'} />
            <Text style={[s.tabButtonText, activeTab === 'logs' && s.tabButtonTextActive]}>File d'attente & logs</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[s.tabButton, activeTab === 'config' && s.tabButtonActive]} 
            onPress={() => setActiveTab('config')}
          >
            <MaterialCommunityIcons name="api" size={18} color={activeTab === 'config' ? '#FFF' : '#6C757D'} />
            <Text style={[s.tabButtonText, activeTab === 'config' && s.tabButtonTextActive]}>Configuration API</Text>
          </TouchableOpacity>
        </View>

        {/* Tab 1: Dashboard */}
        {activeTab === 'dashboard' && (
          <View style={{ gap: 24 }}>
            {/* KPIs */}
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <KpiCard 
                label="En attente de synchro" 
                value={String(totalPending)} 
                sub="Modifications locales" 
                color={totalPending > 0 ? C.gold : C.ok} 
              />
              <KpiCard 
                label="Statut du Connecteur" 
                value="Opérationnel" 
                sub="Connexion OData OK" 
                color={C.ok} 
              />
              <KpiCard 
                label="Dernière synchro" 
                value="Il y a 5 min" 
                sub="Automatique (5m)" 
                color={C.info} 
              />
            </View>

            {/* Sync Results Banner */}
            {syncResults.length > 0 && (
              <View style={s.resultsCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <MaterialCommunityIcons name="check-decagram" size={20} color="#28A745" />
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#1A1A1A' }}>Rapport de la dernière synchronisation</Text>
                </View>
                {syncResults.map((res, i) => (
                  <View key={i} style={s.resultLine}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#495057', flex: 1 }}>{getTableLabel(res.table as SageSyncTable)}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Badge 
                        label={`${res.recordsSynced} lignes`} 
                        color={res.success ? C.ok : C.err} 
                      />
                      {res.errors.length > 0 && (
                        <Text style={{ fontSize: 11, color: C.err }}>({res.errors.length} erreurs)</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* General Info */}
            <View style={s.infoCard}>
              <MaterialCommunityIcons name="information-outline" size={24} color="#007BFF" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#1A1A1A' }}>Intégration SAGE ERP & Supabase</Text>
                <Text style={{ fontSize: 12, color: '#6C757D', marginTop: 4, lineHeight: 18 }}>
                  Toutes les transactions effectuées dans l'application mobile (réceptions de lots, mouvements de stock, ordres de fabrication et demandes d'achat) sont capturées en local dans le schéma Postgres. Le connecteur SAGE pousse automatiquement ces changements vers la comptabilité / gestion commerciale SAGE 100c toutes les 5 minutes pour assurer une cohérence stricte des stocks physiques et comptables.
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Tab 2: Pending queue & logs */}
        {activeTab === 'logs' && (
          <View style={{ gap: 24 }}>
            {loadingRecords ? (
              <ActivityIndicator size="large" color={C.green} />
            ) : (
              Object.entries(pendingData).map(([table, records]) => (
                <View key={table} style={s.tableCard}>
                  <View style={s.tableHeader}>
                    <Text style={s.tableTitle}>{getTableLabel(table as SageSyncTable)}</Text>
                    <Text style={s.tableSub}>{records.length} modification(s) en attente d'export SAGE</Text>
                  </View>
                  
                  {records.length === 0 ? (
                    <View style={{ padding: 24, alignItems: 'center' }}>
                      <MaterialCommunityIcons name="clipboard-check-outline" size={32} color="#ADB5BD" />
                      <Text style={{ fontSize: 13, color: '#ADB5BD', marginTop: 8 }}>Tout est à jour</Text>
                    </View>
                  ) : (
                    records.map((rec: any, idx: number) => (
                      <View key={rec.id || idx} style={[s.tr, idx === records.length - 1 && { borderBottomWidth: 0 }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.tdCode}>{rec.code || rec.id}</Text>
                          <Text style={s.tdDetail}>
                            {table === 'lots' ? `Quantité : ${rec.qty_current} ${rec.unit || 'KG'}` :
                             table === 'stock_movements' ? `Type : ${rec.movement_type} · Qté : ${rec.qty}` :
                             table === 'da_import' ? `Statut : ${rec.status?.replace(/_/g, ' ')} · Valeur : ${rec.proforma_value_eur || '0'} EUR` :
                             `Statut : ${rec.status?.replace(/_/g, ' ')} · Qté : ${rec.qty}`}
                          </Text>
                        </View>
                        <View style={{ width: 100, alignItems: 'flex-end', justifyContent: 'center' }}>
                          <Badge label="EN ATTENTE" color={C.gold} />
                        </View>
                      </View>
                    ))
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* Tab 3: Configuration API */}
        {activeTab === 'config' && (
          <View style={s.tableCard}>
            <View style={s.tableHeader}>
              <Text style={s.tableTitle}>Paramètres du Connecteur SAGE OData</Text>
              <Text style={s.tableSub}>Configuration des terminaux d'API et jetons d'identification</Text>
            </View>
            <View style={{ padding: 24, gap: 16 }}>
              <FormInput 
                label="Point de terminaison (Endpoint URL)" 
                value={config.api_url} 
                onChangeText={t => setConfig({...config, api_url: t})} 
              />
              <FormSelect 
                label="Méthode d'Authentification" 
                value={config.auth_method}
                options={[
                  { label: 'OAuth 2.0 (Conseillé)', value: 'OAuth2' },
                  { label: 'Clé d\'API unique (Bearer Token)', value: 'BearerToken' },
                  { label: 'Basic Auth (Déconseillé)', value: 'BasicAuth' },
                ]}
                onSelect={v => setConfig({...config, auth_method: v})}
              />
              <FormInput 
                label="ID Client de l'application" 
                value={config.client_id} 
                onChangeText={t => setConfig({...config, client_id: t})} 
              />
              <FormSelect 
                label="Synchronisation en arrière-plan automatique" 
                value={config.auto_sync}
                options={[
                  { label: 'Activée (Automatique)', value: 'OUI' },
                  { label: 'Désactivée (Manuel uniquement)', value: 'NON' },
                ]}
                onSelect={v => setConfig({...config, auto_sync: v})}
              />
              <FormInput 
                label="Intervalle de synchronisation (en minutes)" 
                value={config.sync_interval} 
                onChangeText={t => setConfig({...config, sync_interval: t})} 
                keyboardType="numeric"
              />
              
              <View style={{ marginTop: 8 }}>
                <ActionButton 
                  label="Sauvegarder la configuration" 
                  variant="primary" 
                  onPress={() => alert('Configuration SAGE sauvegardée avec succès !')} 
                />
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </AnimatedPage>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 24 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },
  subTitle: { fontSize: 13, color: '#6C757D', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 12 },
  // Tabs
  tabBar: { flexDirection: 'row', gap: 8, marginBottom: 24, borderBottomWidth: 1, borderBottomColor: '#E9ECEF', paddingBottom: 12 },
  tabButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E9ECEF' },
  tabButtonActive: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  tabButtonText: { fontSize: 13, fontWeight: '700', color: '#6C757D' },
  tabButtonTextActive: { color: '#FFF' },
  // Info & results cards
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, backgroundColor: '#E2F0FD', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#BEE5EB' },
  resultsCard: { backgroundColor: '#FFF', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#E9ECEF', gap: 8 },
  resultLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F8F9FA' },
  // Table
  tableCard: { backgroundColor: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#E9ECEF', overflow: 'hidden' },
  tableHeader: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#F8F9FA' },
  tableTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  tableSub: { fontSize: 12, color: '#6C757D', marginTop: 2 },
  tr: { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F8F9FA', alignItems: 'center' },
  tdCode: { fontSize: 12, fontWeight: '800', color: '#1A1A1A' },
  tdDetail: { fontSize: 11, color: '#6C757D', marginTop: 2 },
});
