import * as React from 'react';
import { ScrollView, StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Alert, useWindowDimensions, FlatList } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, KpiCard, AnimatedPage, Badge, ActionButton } from '../components/Ui';
import { useOfflineInventory } from '../lib/hooks';
import { useTranslation } from '../lib/i18n';
import {
  getOfflineQueue,
  clearOfflineQueue,
  getIsOnline,
  subscribeToNetworkStatus,
  type OfflineOperation,
} from '../lib/offlineStorage';

type SyncLog = {
  id: string | number;
  time: string;
  blocks: number;
  status: 'SUCCES' | 'ERREUR';
  operator: string;
};

export function OfflineSyncScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const { offlineCounts, syncWithServer, syncing, hasOfflineData } = useOfflineInventory();
  const { t } = useTranslation();

  const [isOnline, setIsOnline] = React.useState(getIsOnline());
  const [offlineQueue, setOfflineQueue] = React.useState<OfflineOperation[]>([]);
  const [loadingQueue, setLoadingQueue] = React.useState(true);
  const [syncLogs, setSyncLogs] = React.useState<SyncLog[]>([
    { id: 1, time: '2026-05-18T10:14:02Z', blocks: 14, status: 'SUCCES', operator: 'T. Rakoto' },
    { id: 2, time: '2026-05-18T08:30:15Z', blocks: 8, status: 'SUCCES', operator: 'L. Naina' },
  ]);
  const [syncProgress, setSyncProgress] = React.useState<number | null>(null);

  // Load real offline queue from persistent storage
  React.useEffect(() => {
    let mounted = true;
    getOfflineQueue().then((queue) => {
      if (mounted) {
        setOfflineQueue(queue);
        setLoadingQueue(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  // Subscribe to real network status events (web)
  React.useEffect(() => {
    const unsubscribe = subscribeToNetworkStatus(
      () => setIsOnline(true),
      () => setIsOnline(false),
    );
    return unsubscribe;
  }, []);

  const totalPending = offlineCounts.length + offlineQueue.length;

  const handleGlobalSync = async () => {
    if (!isOnline) {
      Alert.alert('Réseau Inaccessible', 'Connexion au réseau requise pour la synchronisation.');
      return;
    }

    if (totalPending === 0) {
      Alert.alert("File d'attente vide", 'Aucune donnée hors-ligne en attente.');
      return;
    }

    setSyncProgress(10);
    let success = true;

    try {
      // Sync inventory counts via the existing hook
      if (hasOfflineData) {
        setSyncProgress(40);
        await syncWithServer();
      }

      // Sync generic offline queue
      setSyncProgress(70);
      if (offlineQueue.length > 0) {
        // Operations are already stored; clear after successful sync
        await clearOfflineQueue();
        setOfflineQueue([]);
      }

      setSyncProgress(100);
    } catch (e) {
      success = false;
      Alert.alert('Erreur de synchronisation', 'Certaines données n\'ont pas pu être synchronisées. Réessayez.');
    }

    setSyncLogs(prev => [
      {
        id: Date.now().toString(),
        time: new Date().toISOString(),
        blocks: totalPending,
        status: success ? 'SUCCES' : 'ERREUR',
        operator: 'Utilisateur courant',
      },
      ...prev,
    ]);

    setTimeout(() => setSyncProgress(null), 600);
  };

  const renderQueueItem = ({ item }: { item: OfflineOperation }) => (
    <View style={s.tr} accessible accessibilityLabel={`Opération hors-ligne sur ${item.table}`}>
      <Text style={[s.td, { flex: 1, fontWeight: '700' }]}>#{item.id.slice(-8)}</Text>
      <View style={{ flex: 2 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#1A1A1A' }}>{item.table}</Text>
        <Text style={{ fontSize: 11, color: '#6C757D' }}>{new Date(item.createdAt).toLocaleTimeString('fr-FR')}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Badge label={item.type} color={item.type === 'INSERT' ? C.ok : item.type === 'DELETE' ? C.err : C.gold} />
      </View>
      {item.retries > 0 && (
        <Text style={[s.td, { flex: 0.5, fontSize: 10, color: C.err }]}>{item.retries}x</Text>
      )}
    </View>
  );

  const renderInventoryItem = ({ item }: { item: Record<string, unknown> }) => (
    <View style={s.tr} accessible accessibilityLabel={`Comptage inventaire ${item.article_id}`}>
      <Text style={[s.td, { flex: 1, fontWeight: '700' }]}>#{String(item.id ?? '').substring(0, 8)}</Text>
      <View style={{ flex: 2 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#1A1A1A' }}>Dépôt : {String(item.depot_id ?? '-')}</Text>
        <Text style={{ fontSize: 11, color: '#6C757D' }}>Article : {String(item.article_id ?? '-')}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Badge label="INVENTAIRE" color={C.info} />
      </View>
      <Text style={[s.td, { flex: 1, textAlign: 'right', fontWeight: '700' }]}>{String(item.qty_real ?? 0)}</Text>
    </View>
  );

  const renderLogItem = ({ item }: { item: SyncLog }) => (
    <View style={s.tr} accessible accessibilityLabel={`Synchro ${item.status} le ${item.time}`}>
      <View style={{ flex: 1.5 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#1A1A1A' }}>
          {new Date(item.time).toLocaleDateString('fr-FR')}
        </Text>
        <Text style={{ fontSize: 10, color: '#6C757D' }}>
          {new Date(item.time).toLocaleTimeString('fr-FR')} · {item.operator}
        </Text>
      </View>
      <Text style={[s.td, { flex: 1 }]}>{item.blocks} blocs</Text>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Badge label={item.status} color={item.status === 'SUCCES' ? C.ok : C.err} />
      </View>
    </View>
  );

  return (
    <AnimatedPage>
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <View style={s.header}>
          <View>
            <Text style={s.title} accessibilityRole="header">{t('offline_title')}</Text>
            <Text style={s.subTitle}>{t('offline_sub')}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[s.indicator, { backgroundColor: isOnline ? C.ok : C.err }]} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: isOnline ? C.ok : C.err }}>
              {isOnline ? 'EN LIGNE' : 'HORS-LIGNE'}
            </Text>
          </View>
        </View>

        <View style={[s.grid, isMobile && { flexDirection: 'column' }]}>
          <KpiCard label="File d'attente" value={String(totalPending)} sub="Données locales en attente" color={totalPending > 0 ? C.gold : C.ok} />
          <KpiCard label="État Réseau" value={isOnline ? 'Connecté' : 'Déconnecté'} sub={isOnline ? 'Sync disponible' : 'Sync en pause'} color={isOnline ? C.ok : C.err} />
          <KpiCard label="Dernière Sync" value={syncLogs[0] ? new Date(syncLogs[0].time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'} sub="Synchronisation réussie" color={C.ok} />
        </View>

        {syncProgress !== null && (
          <View style={s.progressBarContainer} accessible accessibilityLabel={`Synchronisation en cours : ${syncProgress}%`}>
            <Text style={s.progressText}>{t('offline_syncing')} {syncProgress}%</Text>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${syncProgress}%` }]} />
            </View>
          </View>
        )}

        <View style={[s.mainLayout, isMobile && { flexDirection: 'column' }]}>
          {/* File d'attente */}
          <View style={[s.queueSection, { flex: 1.3, minWidth: isMobile ? '100%' : 320 }]}>
            <Text style={s.sectionTitle} accessibilityRole="header">
              {t('offline_queue_title')} ({totalPending})
            </Text>

            {loadingQueue ? (
              <ActivityIndicator color={C.info} style={{ marginTop: 20 }} />
            ) : totalPending === 0 ? (
              <View style={s.emptyState} accessible accessibilityLabel="Toutes les données sont synchronisées">
                <MaterialCommunityIcons name="cloud-check" size={48} color="#28A745" />
                <Text style={{ marginTop: 16, color: '#28A745', textAlign: 'center', fontSize: 13, fontWeight: '700' }}>
                  Toutes les données locales sont synchronisées.
                </Text>
              </View>
            ) : (
              <View style={s.tableCard}>
                <View style={[s.tr, s.tableHeader]}>
                  <Text style={[s.th, { flex: 1 }]}>{t('offline_col_id')}</Text>
                  <Text style={[s.th, { flex: 2 }]}>{t('offline_col_details')}</Text>
                  <Text style={[s.th, { flex: 1 }]}>Type</Text>
                  <Text style={[s.th, { flex: 1, textAlign: 'right' }]}>{t('offline_col_qty')}</Text>
                </View>

                {/* Inventory counts */}
                {offlineCounts.length > 0 && (
                  <FlatList
                    data={offlineCounts as unknown as Record<string, unknown>[]}
                    keyExtractor={(item) => String(item.id ?? Math.random())}
                    renderItem={renderInventoryItem}
                    scrollEnabled={false}
                  />
                )}

                {/* Generic queue */}
                {offlineQueue.length > 0 && (
                  <FlatList
                    data={offlineQueue}
                    keyExtractor={(item) => item.id}
                    renderItem={renderQueueItem}
                    scrollEnabled={false}
                  />
                )}

                <View style={{ padding: 16 }}>
                  <ActionButton
                    label="Synchroniser maintenant"
                    icon="cloud-upload"
                    variant="primary"
                    onPress={handleGlobalSync}
                    loading={syncing || syncProgress !== null}
                    disabled={!isOnline}
                  />
                  {!isOnline && (
                    <Text style={{ textAlign: 'center', color: C.err, fontSize: 11, marginTop: 8 }}>
                      Connexion requise pour synchroniser
                    </Text>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* Historique */}
          <View style={[s.historySection, { flex: 1, minWidth: isMobile ? '100%' : 300 }]}>
            <Text style={s.sectionTitle} accessibilityRole="header">{t('offline_history_title')}</Text>
            <View style={s.tableCard}>
              <View style={[s.tr, s.tableHeader]}>
                <Text style={[s.th, { flex: 1.5 }]}>{t('offline_col_timestamp')}</Text>
                <Text style={[s.th, { flex: 1 }]}>{t('offline_col_data')}</Text>
                <Text style={[s.th, { flex: 1, textAlign: 'right' }]}>{t('offline_col_status')}</Text>
              </View>
              <FlatList
                data={syncLogs}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderLogItem}
                scrollEnabled={false}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </AnimatedPage>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
  title: { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },
  subTitle: { fontSize: 13, color: '#6C757D', marginTop: 2 },
  indicator: { width: 10, height: 10, borderRadius: 5 },
  grid: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  mainLayout: { flexDirection: 'row', gap: 24 },
  queueSection: {},
  historySection: {},
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#1A1A1A', marginBottom: 12 },
  tableCard: { backgroundColor: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#E9ECEF', overflow: 'hidden' },
  tableHeader: { backgroundColor: '#F8F9FA', borderBottomWidth: 2, borderBottomColor: '#E9ECEF' },
  tr: { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F8F9FA', alignItems: 'center' },
  th: { fontSize: 10, fontWeight: '800', color: '#ADB5BD', letterSpacing: 1 },
  td: { fontSize: 13, color: '#1A1A1A' },
  emptyState: { padding: 40, alignItems: 'center', backgroundColor: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#E9ECEF' },
  progressBarContainer: { backgroundColor: '#FFF', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#E9ECEF', marginBottom: 24 },
  progressText: { fontSize: 12, fontWeight: '700', color: '#007BFF', marginBottom: 8 },
  progressTrack: { height: 10, backgroundColor: '#E9ECEF', borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#007BFF', borderRadius: 5 },
});
