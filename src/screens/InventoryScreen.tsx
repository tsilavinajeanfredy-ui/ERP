import * as React from 'react';
import { ScrollView, StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, useWindowDimensions, Platform, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, KpiCard, ActionButton, AnimatedPage, FormModal, FormInput, FormSelect, FormDatePicker } from '../components/Ui';
import { ScannerModal } from '../components/ScannerModal';
import { useInventoryCampaigns, useMutation, useDepots, useOfflineInventory, useArticles, useLots, useInventoryEcartsView, useReconcileInventory, useInventorySheets, useUserProfile, usePermissions, useNotification } from '../lib/hooks';
import { useReconcileInventoryAuto, useQuarantineAlerts } from '../lib/hooks/signatures';
import { supabase } from '../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../lib/i18n';
import { generatePdf, getPdfTemplate } from '../lib/pdf';
import { playNotificationSound } from '../lib/notificationSound';
import { N } from '../lib/notifIcons';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const exportToXLSX = async (data: any[], filename: string) => {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventaire');
  if (Platform.OS === 'web') {
    XLSX.writeFile(wb, filename);
  } else {
    try {
      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const uri = FileSystem.documentDirectory + filename;
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert("Erreur", "Le partage n'est pas disponible sur cet appareil.");
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Erreur", "Impossible d'exporter le fichier Excel.");
    }
  }
};

const exportToCSV = async (data: any[], filename: string) => {
  const csv = Papa.unparse(data);
  if (Platform.OS === 'web') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else {
    try {
      const uri = FileSystem.documentDirectory + filename;
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert("Erreur", "Le partage n'est pas disponible sur cet appareil.");
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Erreur", "Impossible d'exporter le fichier CSV.");
    }
  }
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  EN_PREPARATION: { label: 'En préparation', color: '#ADB5BD' },
  EN_COURS: { label: 'En cours', color: C.info },
  TERMINE: { label: 'Terminé', color: C.gold },
  VALIDE: { label: 'Validé', color: C.ok },
};

export function InventoryScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const { t } = useTranslation();
  const { profile } = useUserProfile();
  const { canPerformAction, role } = usePermissions();
  const notify = useNotification();
  const [scannerVisible, setScannerVisible] = React.useState(false);

  const { data: campaigns = [], isPending: loading } = useInventoryCampaigns();
  const { data: depots = [] } = useDepots();
  const [selId, setSelId] = React.useState<string | null>(null);
  const { offlineCounts, addOfflineCount, syncWithServer, syncing, hasOfflineData } = useOfflineInventory();
  const { data: articles = [] } = useArticles();
  const { data: lots = [] } = useLots();

  const [modalVisible, setModalVisible] = React.useState(false);
  const [countModalVisible, setCountModalVisible] = React.useState(false);
  const [formData, setFormData] = React.useState<any>({});
  const [countData, setCountData] = React.useState<any>({});

  const mutation = useMutation('inventory_campaigns', () => setModalVisible(false));
  const reconcileMutation = useReconcileInventory();
  const reconcileAutoMutation = useReconcileInventoryAuto();
  const { data: quarantineAlerts = [] } = useQuarantineAlerts();
  const { data: ecarts = [] } = useInventoryEcartsView(selId ?? undefined);
  const { data: inventorySheets = [] } = useInventorySheets(selId ?? undefined);
  const queryClient = useQueryClient();
  const [generatingSheets, setGeneratingSheets] = React.useState(false);
  const [histModalVisible, setHistModalVisible] = React.useState(false);
  const [reconcileModalVisible, setReconcileModalVisible] = React.useState(false);

  // États pour la validation multi-niveaux
  const [lvl1Approved, setLvl1Approved] = React.useState(false);
  const [lvl2Approved, setLvl2Approved] = React.useState(false);
  const [lvl3Approved, setLvl3Approved] = React.useState(false);


  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={C.green} />
      </View>
    );
  }

  const activeCamp = campaigns.find(c => c.status === 'EN_COURS');

  const handleAdd = () => {
    const year = new Date().getFullYear();
    const count = campaigns.length + 1;
    const generatedCode = `INV-${year}-${count.toString().padStart(3, '0')}`;
    setFormData({ 
      code: generatedCode,
      status: 'EN_PREPARATION',
      zones: '1',
      start_date: new Date().toISOString().split('T')[0]
    });
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!formData.code || !formData.label) return;
    mutation.mutate({
      values: {
        ...formData,
        zones: parseInt(formData.zones, 10)
      },
      type: 'INSERT'
    }, {
      onSuccess: () => {
        // 🔔 Notification — nouvelle campagne d'inventaire créée
        const notifSubject = `${N.inventory} Nouvelle campagne d'inventaire — ${formData.code}`;
        const notifMsg = [
          `Campagne : ${formData.label}`,
          `Code : ${formData.code}`,
          `Zones : ${formData.zones}`,
          profile?.full_name && `Créée par : ${profile.full_name}`,
        ].filter(Boolean).join('\n');
        (['ADMIN', 'MAGA', 'RACH'] as const).forEach(r => {
          notify.mutate({
            to_role: r,
            subject: notifSubject,
            message: notifMsg,
            type: 'info',
            category: 'STOCK',
            metadata: { category: 'STOCK', screen: 'Inventory', code: formData.code },
          });
        });
        playNotificationSound('creation');
      }
    });
  };

  const handleOfflineSave = () => {
    if (!countData.article_id || !countData.qty_counted) return;
    addOfflineCount({
      campaign_id: selId!,
      article_id: countData.article_id,
      depot_id: countData.depot_id,
      lot_id: countData.lot_id,
      qty_counted: parseFloat(countData.qty_counted),
      unit: articles.find(a => a.id === countData.article_id)?.unit || 'KG',
      notes: countData.notes,
    });
    setCountModalVisible(false);
  };

  const handleGenerateSheets = async () => {
    if (!selId) return;
    if (!supabase) { Alert.alert('Hors-ligne', 'Connexion requise pour générer les fiches.'); return; }
    if (inventorySheets.length > 0) {
      Alert.alert('Déjà généré', `Cette campagne possède déjà ${inventorySheets.length} fiche(s) pré-numérotée(s).`);
      return;
    }
    setGeneratingSheets(true);
    try {
      const { data, error } = await supabase.rpc('generate_inventory_sheets', { p_campaign_id: selId });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['inventory_sheets'] });
      Alert.alert('Fiches générées', `${typeof data === 'number' ? data : 0} fiche(s) pré-numérotée(s) créée(s).`);
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Génération des fiches impossible.');
    } finally {
      setGeneratingSheets(false);
    }
  };

  const handlePrintSheets = () => {
    const camp = campaigns.find(c => c.id === selId);
    if (!camp) return;
    // Fiches pré-numérotées persistées si disponibles, sinon fallback (numérotation à la volée)
    const source: { article_id: string | null; sheet_number: number }[] = inventorySheets.length > 0
      ? inventorySheets.map(sh => ({ article_id: sh.article_id, sheet_number: sh.sheet_number }))
      : articles.map((a, idx) => ({ article_id: a.id, sheet_number: idx + 1 }));
    const rows = source.map((src) => {
      const a = articles.find(x => x.id === src.article_id);
      const theo = lots.filter(l => l.article_id === src.article_id).reduce((s, l) => s + (l.qty_current || 0), 0);
      const sheetNum = String(src.sheet_number).padStart(4, '0');
      const sheetId = `${camp.code}/${sheetNum}`;
      if (!a) {
        return `
        <tr>
          <td style="width:8%; font-family:monospace; font-size:9pt; color:#6C757D;">${sheetId}</td>
          <td colspan="6" style="color:#ADB5BD;">—</td>
        </tr>`;
      }
      return `
        <tr>
          <td style="width:8%; font-family:monospace; font-size:9pt; color:#6C757D;">${sheetId}</td>
          <td style="width:12%;">${a.code}</td>
          <td style="width:30%;">${a.name}</td>
          <td style="width:13%;">${a.article_type || '—'}</td>
          <td style="width:10%; text-align:right;">${theo.toLocaleString()}</td>
          <td style="width:10%;">${a.unit || 'KG'}</td>
          <td style="width:17%;"><span style="border-bottom:1px solid #000; display:inline-block; min-width:90px;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></td>
        </tr>`;
    }).join('');
    const html = getPdfTemplate(
      `FICHE DE COMPTAGE - ${camp.code}`,
      `<p style="font-size:10pt; margin-bottom:20px;">Campagne : <strong>${camp.label || camp.code}</strong> · Date : ${new Date().toLocaleDateString('fr-FR')}</p>
      <table><thead><tr>
        <th style="width:8%;">N° Fiche</th><th style="width:12%;">Code</th><th style="width:30%;">Article</th><th style="width:13%;">Type</th>
        <th style="width:10%;" class="text-right">Stock</th><th style="width:10%;">Unité</th><th style="width:17%;" class="text-center">Compté</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <p style="margin-top:20px; font-size:9pt; color:#666;">Signature compteur 1 : ___________________  Signature compteur 2 : ___________________</p>`,
      { orientation: 'landscape', watermark: 'INVENTAIRE' },
    );
    generatePdf(html, `Fiche_Comptage_${camp.code}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleGenerateEcart = () => {
    if (!offlineCounts.length && !selId) {
      Alert.alert('Aucun comptage', 'Saisissez des comptages ou sélectionnez une campagne avant de générer les écarts.');
      return;
    }
    const ecarts = offlineCounts.map(c => {
      const theo = lots.filter(l => l.article_id === c.article_id && (!c.lot_id || l.id === c.lot_id))
        .reduce((s, l) => s + (l.qty_current || 0), 0);
      const diff = (c.qty_counted || 0) - theo;
      const article = articles.find(a => a.id === c.article_id);
      return {
        article: article ? `${article.code} - ${article.name}` : c.article_id,
        theorique: theo,
        compte: c.qty_counted || 0,
        ecart: diff,
        pct: theo ? Math.round((diff / theo) * 100) : 0,
      };
    });
    const rows = ecarts.map(e => `
      <tr>
        <td>${e.article}</td>
        <td class="text-right">${e.theorique.toLocaleString()}</td>
        <td class="text-right">${e.compte.toLocaleString()}</td>
        <td class="text-right" style="color:${e.ecart < 0 ? '#DC3545' : '#28A745'}; font-weight:700;">${e.ecart > 0 ? '+' : ''}${e.ecart.toLocaleString()}</td>
        <td class="text-right">${e.pct}%</td>
      </tr>`).join('');
    const totalTheo = ecarts.reduce((s, e) => s + e.theorique, 0);
    const totalCompte = ecarts.reduce((s, e) => s + e.compte, 0);
    const totalEcart = ecarts.reduce((s, e) => s + e.ecart, 0);
    const html = getPdfTemplate(
      'ÉCARTS D\'INVENTAIRE',
      `<p style="font-size:10pt; margin-bottom:20px;">Généré le ${new Date().toLocaleDateString('fr-FR')}</p>
      <table><thead><tr>
        <th style="width:40%;">Article</th><th style="width:15%;" class="text-right">Théorique</th>
        <th style="width:15%;" class="text-right">Compté</th><th style="width:15%;" class="text-right">Écart</th>
        <th style="width:15%;" class="text-right">%</th>
      </tr></thead><tbody>${rows}</tbody>
      <tfoot><tr style="font-weight:800; border-top:2px solid #000;">
        <td>TOTAL</td><td class="text-right">${totalTheo.toLocaleString()}</td>
        <td class="text-right">${totalCompte.toLocaleString()}</td>
        <td class="text-right" style="color:${totalEcart < 0 ? '#DC3545' : '#28A745'};">${totalEcart > 0 ? '+' : ''}${totalEcart.toLocaleString()}</td>
        <td class="text-right">—</td>
      </tr></tfoot></table>`,
      { orientation: 'landscape', watermark: 'ÉCARTS INVENTAIRE' },
    );
    generatePdf(html, `Ecarts_Inventaire_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <AnimatedPage>
      <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* Header */}
      <View style={[s.headerRow, isMobile && { flexDirection: 'column', alignItems: 'flex-start', gap: 16 }]}>
        <View>
          <Text style={s.title}>{t('inventory_title')}</Text>
          <Text style={s.subTitle}>{t('inventory_sub')}</Text>
        </View>
        <View style={s.actions}>
          {hasOfflineData && (
            <ActionButton 
              label={`Sync (${offlineCounts.length})`} 
              onPress={syncWithServer} 
              loading={syncing}
              icon="cloud-upload"
              variant="secondary"
              color={C.gold}
            />
          )}
          <ActionButton label="Historique PV" onPress={() => setHistModalVisible(true)} />
          {canPerformAction('create_inventory') && (
            <ActionButton label="+ Nouvelle campagne" onPress={handleAdd} variant="primary" />
          )}
        </View>

      </View>

      {/* KPI Grid */}
      <View style={[s.grid, isMobile && { flexDirection: 'column' }]}>
        <KpiCard 
          label="Campagne active" 
          value={activeCamp ? activeCamp.code : 'Aucune'} 
          sub={activeCamp ? 'Saisie en cours' : '—'} 
          color={activeCamp ? C.info : '#ADB5BD'} 
        />
        <KpiCard 
          label="Écarts à valider" 
          value="2" 
          sub="Lot MP / Lot EMB" 
          color={C.gold} 
        />
        <KpiCard 
          label="Taux de précision" 
          value="98.2%" 
          sub="Dernier inventaire" 
          color={C.ok} 
        />
      </View>

      <View style={{ height: 24 }} />

      {/* Bannière alertes quarantaine */}
      {quarantineAlerts.length > 0 && (
        <View style={{ backgroundColor: '#FFF3CD', borderRadius: 8, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10, borderLeftWidth: 4, borderLeftColor: '#FFC107' }}>
          <MaterialCommunityIcons name="alert" size={20} color="#856404" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#856404' }}>
              {quarantineAlerts.length} lot(s) bloqué(s)/quarantaine depuis +7 jours
            </Text>
            {quarantineAlerts.slice(0, 3).map((a: any) => (
              <Text key={a.lot_id} style={{ fontSize: 11, color: '#856404', marginTop: 2 }}>
                {'• '}{a.lot_code} ({a.article_name}) — {a.days_in_status}j en {a.cqlib_status}
              </Text>
            ))}
            {quarantineAlerts.length > 3 && (
              <Text style={{ fontSize: 11, color: '#856404', marginTop: 2 }}>+ {quarantineAlerts.length - 3} autre(s)</Text>
            )}
          </View>
        </View>
      )}

      <Text style={s.sectionLabel}>CAMPAGNES RÉCENTES</Text>
      
      <View style={[s.listGrid, isMobile && { flexDirection: 'column' }]}>
        {campaigns.map((c) => {
          const pct = c.status === 'VALIDE' ? 100 : c.status === 'EN_COURS' ? 65 : 0;
          const status = STATUS_MAP[c.status] || STATUS_MAP.EN_PREPARATION;
          
          return (
            <TouchableOpacity 
              key={c.id} 
              onPress={() => setSelId(selId === c.id ? null : c.id)}
              style={[s.campCard, selId === c.id && s.campCardActive]}
            >
              <View style={s.campHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.campCode}>{c.code}</Text>
                  <Text style={s.campLabel}>{c.label}</Text>
                </View>
                <View style={[s.statusBadge, { backgroundColor: status.color + '15' }]}>
                  <Text style={[s.statusText, { color: status.color }]}>{status.label}</Text>
                </View>
              </View>

              <View style={s.progSection}>
                <View style={s.progBar}>
                  <View style={[s.progFill, { width: `${pct}%`, backgroundColor: status.color }]} />
                </View>
                <View style={s.progInfo}>
                   <Text style={s.progPct}>{pct}% complété</Text>
                   <Text style={s.progZones}>{c.zones} zones rattachées</Text>
                </View>
              </View>

              <View style={s.campFooter}>
                 <MaterialCommunityIcons name="calendar" size={14} color="#ADB5BD" />
                 <Text style={s.campDate}>{c.period || 'Non définie'}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {selId && (() => {
        const camp = campaigns.find(c => c.id === selId);
        const filteredEcarts = ecarts.filter(e => e.ecart !== 0);
        return (
          <View style={{ gap: 24, marginTop: 24 }}>
            {/* Action Bar */}
            <View style={s.detailSection}>
              <Text style={s.detailTitle}>{t('inventory_campaign_actions')} {camp?.code}</Text>
              <View style={s.detailActions}>
                {canPerformAction('create_inventory') && (
                  <>
                    <ActionButton 
                      label="Saisir comptages" 
                      onPress={() => {
                        setCountData({ campaign_id: selId, depot_id: depots[0]?.id });
                        setCountModalVisible(true);
                      }} 
                      variant="primary" 
                    />
                    <ActionButton 
                      label="Scanner" 
                      icon="barcode-scan"
                      onPress={() => setScannerVisible(true)} 
                      variant="primary" 
                    />
                  </>
                )}
                {canPerformAction('create_inventory') && (
                  <ActionButton
                    label={generatingSheets ? 'Génération…' : inventorySheets.length > 0 ? `Fiches pré-numérotées (${inventorySheets.length})` : 'Générer fiches pré-numérotées'}
                    icon="format-list-numbered"
                    onPress={handleGenerateSheets}
                  />
                )}
                <ActionButton label="Imprimer fiches" icon="printer" onPress={handlePrintSheets} />
                <ActionButton label="Générer rapport PDF" icon="file-pdf-box" onPress={handleGenerateEcart} />
                <ActionButton
                  label="Export CSV"
                  icon="file-delimited-outline"
                  onPress={() => {
                    const camp = campaigns.find(c => c.id === selId);
                    const data = ecarts.map(e => ({
                      Campagne: camp?.code || selId,
                      Code: e.article_code,
                      Article: e.article_name,
                      Type: e.article_type,
                      Dépôt: e.depot_name,
                      'Code Dépôt': e.depot_code,
                      Lot: e.lot_code || '',
                      Théorique: e.stock_theorique ?? 0,
                      Physique: e.stock_physique ?? '',
                      Écart: e.ecart ?? '',
                      'Écart %': e.ecart_pct ?? '',
                      Unité: (e as any).unit || 'KG',
                      Statut: e.reconciliation_status,
                      Majeur: e.is_major ? 'Oui' : 'Non',
                    }));
                    exportToCSV(data, `Inventaire_${camp?.code || selId}_${new Date().toISOString().split('T')[0]}.csv`);
                  }}
                />
                <ActionButton
                  label="Export Excel"
                  icon="microsoft-excel"
                  onPress={() => {
                    const camp = campaigns.find(c => c.id === selId);
                    const data = ecarts.map(e => ({
                      Campagne: camp?.code || selId,
                      Code: e.article_code,
                      Article: e.article_name,
                      Type: e.article_type,
                      Dépôt: e.depot_name,
                      'Code Dépôt': e.depot_code,
                      Lot: e.lot_code || '',
                      Théorique: e.stock_theorique ?? 0,
                      Physique: e.stock_physique ?? '',
                      Écart: e.ecart ?? '',
                      'Écart %': e.ecart_pct ?? '',
                      Unité: (e as any).unit || 'KG',
                      Statut: e.reconciliation_status,
                      Majeur: e.is_major ? 'Oui' : 'Non',
                    }));
                    exportToXLSX(data, `Inventaire_${camp?.code || selId}_${new Date().toISOString().split('T')[0]}.xlsx`);
                  }}
                  color={C.ok}
                />
                {camp?.status !== 'VALIDE' && (canPerformAction('create_inventory') || canPerformAction('validate_inventory') || role === 'RACH') && (
                  <>
                    <ActionButton
                      label="Rapprochement auto"
                      icon="calculator-variant"
                      loading={reconcileAutoMutation.isPending}
                      onPress={() => {
                        if (!selId || !profile?.id) return;
                        reconcileAutoMutation.mutate({ campaignId: selId, userId: profile.id }, {
                          onSuccess: (data: any[]) => {
                            const majeurs = data?.filter((r: any) => r.ecart_status === 'MAJEUR' || r.ecart_status === 'CRITIQUE').length ?? 0;
                            Alert.alert(
                              'Rapprochement terminé',
                              `${data?.length ?? 0} articles analysés. ${majeurs > 0 ? majeurs + ' écart(s) majeur(s) détecté(s).' : 'Aucun écart critique.'}`,
                            );
                          },
                          onError: (err: any) => Alert.alert('Erreur', err.message),
                        });
                      }}
                      color={C.info}
                    />
                    <ActionButton
                      label="Réconcilier les stocks"
                      icon="check-circle"
                      onPress={() => setReconcileModalVisible(true)}
                      color={C.ok}
                      variant="primary"
                    />
                  </>
                )}
              </View>

              {filteredEcarts.length > 0 && (
                <View style={{ marginTop: 16, backgroundColor: '#FFF9DB', padding: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MaterialCommunityIcons name="alert-decagram" size={18} color="#856404" />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#856404' }}>
                    {filteredEcarts.length} écart(s) détecté(s) — {ecarts.filter(e => e.is_major).length} écart(s) majeur(s) (seuil de tolérance dépassé).
                  </Text>
                </View>
              )}
            </View>

            {/* Local offline counts table */}
            {offlineCounts.filter(c => c.campaign_id === selId).length > 0 && (
              <View style={s.tableCard}>
                <View style={[s.tableHeader, { backgroundColor: '#FFF9E6' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <MaterialCommunityIcons name="cloud-sync" size={18} color="#856404" />
                    <Text style={[s.tableTitle, { color: '#856404' }]}>Comptages saisis (En attente de synchronisation)</Text>
                  </View>
                  <Text style={s.tableSub}>Ces données sont enregistrées sur votre appareil. Cliquez sur Sync pour les envoyer au serveur.</Text>
                </View>
                <View style={[s.tr, { backgroundColor: '#F8F9FA', borderBottomWidth: 2, borderBottomColor: '#E9ECEF' }]}>
                  <View style={{ flex: 2 }}><Text style={s.thText}>ARTICLE / LOT</Text></View>
                  <View style={{ flex: 1 }}><Text style={s.thText}>DÉPÔT</Text></View>
                  <View style={{ width: 100, alignItems: 'flex-end' }}><Text style={s.thText}>COMPTÉ</Text></View>
                </View>
                {offlineCounts.filter(c => c.campaign_id === selId).map((c, idx, arr) => {
                  const article = articles.find(a => a.id === c.article_id);
                  const depot = depots.find(d => d.id === c.depot_id);
                  const lot = lots.find(l => l.id === c.lot_id);
                  return (
                    <View key={idx} style={[s.tr, idx === arr.length - 1 && { borderBottomWidth: 0 }]}>
                      <View style={{ flex: 2 }}>
                        <Text style={s.tdCode}>{article?.code || 'Inconnu'}</Text>
                        <Text style={s.tdArticle}>{article?.name}</Text>
                        {lot && <Text style={{ fontSize: 11, color: '#6C757D', marginTop: 2 }}>Lot: {lot.code}</Text>}
                      </View>
                      <View style={{ flex: 1, justifyContent: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#495057', fontWeight: '600' }}>{depot?.name || '—'}</Text>
                      </View>
                      <View style={{ width: 100, alignItems: 'flex-end', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 13, color: '#1A1A1A', fontWeight: '800' }}>{c.qty_counted} {c.unit}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Discrepancy analysis table */}
            <View style={s.tableCard}>
              <View style={s.tableHeader}>
                <Text style={s.tableTitle}>{t('inventory_variance_title')}</Text>
                <Text style={s.tableSub}>{t('inventory_variance_sub')}</Text>
              </View>

              <View style={[s.tr, { backgroundColor: '#F8F9FA', borderBottomWidth: 2, borderBottomColor: '#E9ECEF' }]}>
                <View style={{ flex: 2 }}><Text style={s.thText}>ARTICLE / LOT</Text></View>
                <View style={{ flex: 1 }}><Text style={s.thText}>{t('inventory_depot_col')}</Text></View>
                <View style={{ width: 100, alignItems: 'flex-end' }}><Text style={s.thText}>THÉORIQUE</Text></View>
                <View style={{ width: 100, alignItems: 'flex-end' }}><Text style={s.thText}>PHYSIQUE</Text></View>
                <View style={{ width: 100, alignItems: 'flex-end' }}><Text style={s.thText}>ÉCART</Text></View>
                <View style={{ width: 60, alignItems: 'center' }}><Text style={s.thText}>UNITÉ</Text></View>
                <View style={{ width: 120, alignItems: 'flex-end' }}><Text style={s.thText}>STATUT / GRAVITÉ</Text></View>
              </View>

              {ecarts.length === 0 ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <MaterialCommunityIcons name="clipboard-check-outline" size={40} color="#ADB5BD" />
                  <Text style={{ color: '#ADB5BD', fontSize: 14, marginTop: 12 }}>{t('inventory_no_counts')}</Text>
                </View>
              ) : (
                ecarts.map((e, idx) => {
                  const isEcart = e.ecart !== 0;
                  const isNegative = (e.ecart || 0) < 0;
                  return (
                    <View key={e.count_id || idx} style={[s.tr, idx === ecarts.length - 1 && { borderBottomWidth: 0 }]}>
                      <View style={{ flex: 2 }}>
                        <Text style={s.tdCode}>{e.article_code}</Text>
                        <Text style={s.tdArticle}>{e.article_name}</Text>
                        {e.lot_code && <Text style={{ fontSize: 11, color: '#6C757D', marginTop: 2 }}>Lot: {e.lot_code}</Text>}
                      </View>
                      
                      <View style={{ flex: 1, justifyContent: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#495057', fontWeight: '600' }}>{e.depot_name}</Text>
                        <Text style={{ fontSize: 10, color: '#ADB5BD' }}>{e.depot_code}</Text>
                      </View>

                      <View style={{ width: 100, alignItems: 'flex-end', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 13, color: '#495057' }}>{e.stock_theorique?.toLocaleString()} {(e as any).unit || 'KG'}</Text>
                      </View>

                      <View style={{ width: 100, alignItems: 'flex-end', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 13, color: '#1A1A1A', fontWeight: '700' }}>
                          {e.stock_physique !== null ? `${e.stock_physique.toLocaleString()} ${(e as any).unit || 'KG'}` : '—'}
                        </Text>
                      </View>

                      <View style={{ width: 100, alignItems: 'flex-end', justifyContent: 'center' }}>
                        {isEcart ? (
                          <Text style={{ fontSize: 13, fontWeight: '800', color: isNegative ? '#DC3545' : '#28A745' }}>
                            {isNegative ? '' : '+'}{e.ecart?.toLocaleString()} ({e.ecart_pct}%)
                          </Text>
                        ) : (
                          <Text style={{ fontSize: 13, color: '#28A745', fontWeight: '700' }}>{t('inventory_conform')}</Text>
                        )}
                      </View>

                      <View style={{ width: 60, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#6C757D', backgroundColor: '#F1F3F5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          {(e as any).unit || 'KG'}
                        </Text>
                      </View>

                      <View style={{ width: 120, alignItems: 'flex-end', justifyContent: 'center' }}>
                        {e.reconciliation_status === 'CONFORME' ? (
                          <View style={[s.classBadge, s.badgeA]}><Text style={[s.classBadgeText, { color: '#28A745' }]}>CONFORME</Text></View>
                        ) : e.is_major ? (
                          <View style={[s.classBadge, { backgroundColor: '#FDEAEA' }]}><Text style={[s.classBadgeText, { color: '#DC3545' }]}>ÉCART MAJEUR</Text></View>
                        ) : (
                          <View style={[s.classBadge, s.badgeB]}><Text style={[s.classBadgeText, { color: '#856404' }]}>ÉCART MINEUR</Text></View>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </View>
        );
      })()}
    </ScrollView>

    <FormModal
      visible={modalVisible}
      title="Nouvelle Campagne d'Inventaire"
      onClose={() => setModalVisible(false)}
      onSave={handleSave}
      loading={mutation.isPending}
    >
      <FormInput
        label="Code Campagne"
        value={formData.code ?? ''}
        editable={false} 
        style={{ backgroundColor: '#F1F3F5', color: '#6C757D' }}
      />
      <FormInput
        label="Libellé"
        value={formData.label ?? ''}
        onChangeText={val => setFormData({...formData, label: val})}
        placeholder="ex: Inventaire Trimestriel Q2 2026"
      />
      <FormInput
        label="Période"
        value={formData.period ?? ''}
        onChangeText={val => setFormData({...formData, period: val})}
        placeholder="ex: Q2 2026"
      />
      <FormDatePicker
        label="Date de début"
        value={formData.start_date ?? ''}
        onChangeDate={t => setFormData({...formData, start_date: t})}
      />
      <FormInput
        label="Nombre de zones"
        value={formData.zones ?? ''}
        onChangeText={val => setFormData({...formData, zones: val})}
        keyboardType="numeric"
      />
      <FormSelect
        label="Statut initial"
        value={formData.status ?? ''}
        options={[
          { label: 'En préparation', value: 'EN_PREPARATION' },
          { label: 'En cours', value: 'EN_COURS' },
        ]}
        onSelect={v => setFormData({...formData, status: v})}
      />
    </FormModal>

    <FormModal
      visible={countModalVisible}
      title="Saisie de Comptage (Mode Offline compatible)"
      onClose={() => setCountModalVisible(false)}
      onSave={handleOfflineSave}
    >
      <View style={s.offlineNotice}>
        <MaterialCommunityIcons name="wifi-off" size={16} color={C.gold} />
        <Text style={s.offlineNoticeText}>{t('offline_notice_msg')}</Text>
      </View>

      <FormSelect
        label="Article"
        value={countData.article_id ?? ''}
        options={articles.map(a => ({ label: `${a.code} - ${a.name}`, value: a.id }))}
        onSelect={v => setCountData({...countData, article_id: v})}
        searchable
      />
      
      <FormSelect
        label="Lot (Optionnel)"
        value={countData.lot_id ?? ''}
        options={lots.filter(l => l.article_id === countData.article_id).map(l => ({ label: l.code, value: l.id }))}
        onSelect={v => setCountData({...countData, lot_id: v})}
      />

      <FormSelect
        label="Dépôt"
        value={countData.depot_id ?? ''}
        options={depots.map(d => ({ label: d.name, value: d.id }))}
        onSelect={v => setCountData({...countData, depot_id: v})}
      />

      <FormInput
        label="Quantité comptée"
        value={countData.qty_counted ?? ''}
        onChangeText={val => setCountData({...countData, qty_counted: val})}
        keyboardType="numeric"
        placeholder="0.00"
      />

      <FormInput
        label="Notes / Observation"
        value={countData.notes ?? ''}
        onChangeText={val => setCountData({...countData, notes: val})}
        multiline
      />
    </FormModal>

      {/* Modal Historique PV */}
      <FormModal
        visible={histModalVisible}
        title="Historique Procès-Verbaux"
        onClose={() => setHistModalVisible(false)}
        onSave={() => setHistModalVisible(false)}
        hideSaveButton
      >
        {campaigns.filter(c => c.status === 'VALIDE' || c.status === 'TERMINE').length === 0 ? (
          <Text style={{ color: '#888', textAlign: 'center', padding: 20 }}>{t('inventory_no_pv')}</Text>
        ) : (
          campaigns.filter(c => c.status === 'VALIDE' || c.status === 'TERMINE').map((c, i, arr) => (
            <View key={c.id} style={{ paddingVertical: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: '#F0F0F0' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1A1A1A' }}>{c.code}</Text>
                <Text style={{ fontSize: 12, color: c.status === 'VALIDE' ? '#28A745' : '#888', fontWeight: '600' }}>{c.status?.replace(/_/g, ' ')}</Text>
              </View>
              {c.label && <Text style={{ fontSize: 13, color: '#555', marginTop: 2 }}>{c.label}</Text>}
              {c.period && <Text style={{ fontSize: 12, color: '#888' }}>{t('inventory_period')} : {c.period}</Text>}
              {c.completed_at && <Text style={{ fontSize: 12, color: '#888' }}>{t('inventory_closed_at')} : {new Date(c.completed_at).toLocaleDateString('fr-FR')}</Text>}
            </View>
          ))
        )}
      </FormModal>

      <FormModal
        visible={reconcileModalVisible}
        title="Réconciliation d'inventaire & Approbations"
        onClose={() => setReconcileModalVisible(false)}
        onSave={() => {
          if (!selId) return;
          if (!lvl1Approved || !lvl2Approved || !lvl3Approved) {
            Alert.alert('Signatures requises', 'Le procès-verbal de réconciliation doit être signé par tous les niveaux (Magasinier, Contrôle de Gestion, Direction) avant validation.');
            return;
          }
          reconcileMutation.mutate({ campaignId: selId }, {
            onSuccess: () => {
              setReconcileModalVisible(false);
              setLvl1Approved(false);
              setLvl2Approved(false);
              setLvl3Approved(false);

              // 🔔 Notification — inventaire validé
              const camp = campaigns.find(c => c.id === selId);
              const notifSubject = `${N.ok} Inventaire valide — ${camp?.code || selId}`;
              const notifMsg = [
                `Campagne : ${camp?.label || camp?.code || selId}`,
                `Réconciliation approuvée par tous les niveaux`,
                profile?.full_name && `Validé par : ${profile.full_name}`,
              ].filter(Boolean).join('\n');
              (['ADMIN', 'MAGA', 'RACH', 'DG'] as const).forEach(r => {
                notify.mutate({
                  to_role: r,
                  subject: notifSubject,
                  message: notifMsg,
                  type: 'success',
                  category: 'STOCK',
                  metadata: { category: 'STOCK', screen: 'Inventory', campaign_id: selId },
                });
              });
              playNotificationSound('success');
            },
          });
        }}
        loading={reconcileMutation.isPending}
      >
        {ecarts.length === 0 ? (
          <Text style={{ color: '#888', textAlign: 'center', padding: 20 }}>
            Aucune donnée d'écart pour cette campagne.
          </Text>
        ) : (
          <>
            {/* Tableau des Écarts */}
            <View style={{ backgroundColor: '#F8F9FA', padding: 16, borderRadius: 8, marginBottom: 20, borderWidth: 1, borderColor: '#E9ECEF' }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#1A1A1A', marginBottom: 12 }}>Écarts de comptage à régulariser :</Text>
              {ecarts.filter(e => e.ecart !== 0).map(e => (
                <View key={e.count_id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E9ECEF' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#1A1A1A' }}>{e.article_code}</Text>
                    <Text style={{ fontSize: 11, color: '#6C757D' }}>{e.article_name}</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: (e.ecart || 0) < 0 ? '#DC3545' : '#28A745' }}>
                    {(e.ecart || 0) > 0 ? '+' : ''}{e.ecart?.toFixed(2)}
                  </Text>
                </View>
              ))}
            </View>

            {/* Workflow d'approbation multi-niveaux */}
            <View style={{ gap: 12, marginBottom: 20, backgroundColor: '#FFF', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#E9ECEF' }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#1A1A1A', marginBottom: 4 }}>
                Circuit de Signatures (PV d'Inventaire GSI)
              </Text>
              <Text style={{ fontSize: 11, color: '#6C757D', marginBottom: 8 }}>
                Chaque responsable doit certifier les écarts selon ses prérogatives de rôle.
              </Text>

              {/* Niveau 1 : Magasinier */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F3F5' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#495057' }}>Niveau 1 : Certification Magasinier (Saisie terrain)</Text>
                  <Text style={{ fontSize: 11, color: lvl1Approved ? '#28A745' : '#888' }}>
                    {lvl1Approved ? '✓ Certifié et signé électroniquement' : 'En attente du rôle MAGA'}
                  </Text>
                </View>
                {!lvl1Approved ? (
                  (profile?.role === 'MAGA' || profile?.role === 'ADMIN') ? (
                    <TouchableOpacity style={s.approvalBtn} onPress={() => setLvl1Approved(true)}>
                      <Text style={s.approvalBtnText}>Signer</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={s.badgePending}><Text style={s.badgePendingText}>En attente</Text></View>
                  )
                ) : (
                  <MaterialCommunityIcons name="check-circle" size={24} color="#28A745" />
                )}
              </View>

              {/* Niveau 2 : Contrôle de gestion */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F3F5' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#495057' }}>Niveau 2 : Validation Valorisation (Contrôle de Gestion)</Text>
                  <Text style={{ fontSize: 11, color: lvl2Approved ? '#28A745' : '#888' }}>
                    {lvl2Approved ? '✓ Écarts financiers validés' : 'En attente du rôle RACH (Acheteur/Gestionnaire)'}
                  </Text>
                </View>
                {!lvl2Approved ? (
                  (profile?.role === 'RACH' || profile?.role === 'ADMIN') ? (
                    <TouchableOpacity style={s.approvalBtn} onPress={() => setLvl2Approved(true)}>
                      <Text style={s.approvalBtnText}>Signer</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={s.badgePending}><Text style={s.badgePendingText}>En attente</Text></View>
                  )
                ) : (
                  <MaterialCommunityIcons name="check-circle" size={24} color="#28A745" />
                )}
              </View>

              {/* Niveau 3 : Direction */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#495057' }}>Niveau 3 : Approbation & Clôture (Direction Générale)</Text>
                  <Text style={{ fontSize: 11, color: lvl3Approved ? '#28A745' : '#888' }}>
                    {lvl3Approved ? '✓ PV d\'inventaire approuvé pour régularisation' : 'En attente du rôle DPI / Direction'}
                  </Text>
                </View>
                {!lvl3Approved ? (
                  (profile?.role === 'DPI' || profile?.role === 'ADMIN') ? (
                    <TouchableOpacity style={s.approvalBtn} onPress={() => setLvl3Approved(true)}>
                      <Text style={s.approvalBtnText}>Signer</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={s.badgePending}><Text style={s.badgePendingText}>En attente</Text></View>
                  )
                ) : (
                  <MaterialCommunityIcons name="check-circle" size={24} color="#28A745" />
                )}
              </View>
            </View>

            {(!lvl1Approved || !lvl2Approved || !lvl3Approved) ? (
              <View style={{ backgroundColor: '#FDEAEA', padding: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <MaterialCommunityIcons name="lock-outline" size={16} color="#DC3545" />
                <Text style={{ fontSize: 11, color: '#DC3545', fontWeight: '700', flex: 1 }}>
                  La validation en comptabilité est verrouillée. Veuillez compléter toutes les signatures requises.
                </Text>
              </View>
            ) : (
              <View style={{ backgroundColor: '#E2F6E9', padding: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <MaterialCommunityIcons name="shield-check" size={16} color="#28A745" />
                <Text style={{ fontSize: 11, color: '#28A745', fontWeight: '700', flex: 1 }}>
                  Toutes les signatures sont réunies ! Cliquez sur "Enregistrer" pour régulariser automatiquement les stocks.
                </Text>
              </View>
            )}

            <Text style={{ fontSize: 11, color: '#856404', backgroundColor: '#FFF9DB', padding: 12, borderRadius: 8 }}>
              Régularisation automatique : L'approbation finale va générer instantanément les écritures d'ajustements de stocks en base.
            </Text>
          </>
        )}
      </FormModal>

      <ScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScan={(data) => {
          // On essaie de trouver l'article correspondant (par code article ou code de lot)
          const lot = lots.find(l => l.code.toUpperCase() === data.toUpperCase());
          const article = articles.find(a => a.code.toUpperCase() === data.toUpperCase());
          
          if (lot) {
            setCountData({ campaign_id: selId, depot_id: lot.depot_id, article_id: lot.article_id, lot_id: lot.id });
          } else if (article) {
            setCountData({ campaign_id: selId, depot_id: depots[0]?.id, article_id: article.id });
          } else {
            Alert.alert("Scanner", `Code non reconnu : ${data}`);
            return;
          }
          setCountModalVisible(true);
        }}
      />
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
  grid: { flexDirection: 'row', gap: 16 },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: '#ADB5BD', letterSpacing: 1, marginBottom: 12 },
  listGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  campCard: {
    backgroundColor: '#FFF',
    width: '48%',
    minWidth: 300,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    padding: 20,
  },
  campCardActive: { borderColor: '#1A1A1A', borderWidth: 2 },
  campHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  campCode: { fontSize: 11, fontWeight: '700', color: '#ADB5BD', fontFamily: Platform.OS === 'web' ? 'Menlo' : 'monospace' },
  campLabel: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginTop: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '700' },
  progSection: { marginBottom: 20 },
  progBar: { height: 6, backgroundColor: '#F8F9FA', borderRadius: 3, overflow: 'hidden' },
  progFill: { height: 6, borderRadius: 3 },
  progInfo: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  progPct: { fontSize: 12, fontWeight: '600', color: '#1A1A1A' },
  progZones: { fontSize: 12, color: '#6C757D' },
  campFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: '#F8F9FA', paddingTop: 16 },
  campDate: { fontSize: 12, color: '#ADB5BD' },
  detailSection: { marginTop: 24, padding: 24, backgroundColor: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#E9ECEF' },
  detailTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 16 },
  detailActions: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  offlineNotice: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF9DB', padding: 12, borderRadius: 8, marginBottom: 16 },
  offlineNoticeText: { fontSize: 12, color: '#856404', fontWeight: '600' },
  // Table, badge, and text styles for Ecarts
  tableCard: { backgroundColor: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#E9ECEF', overflow: 'hidden', marginTop: 16 },
  tableHeader: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#F8F9FA' },
  tableTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  tableSub: { fontSize: 12, color: '#6C757D', marginTop: 2 },
  tr: { flexDirection: 'row', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F8F9FA', alignItems: 'flex-start' },
  thText: { fontSize: 10, fontWeight: '800', color: '#ADB5BD', letterSpacing: 1 },
  tdCode: { fontSize: 11, fontWeight: '700', color: '#ADB5BD', fontFamily: Platform.OS === 'web' ? 'Menlo' : 'monospace' },
  tdArticle: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', marginTop: 2 },
  classBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignItems: 'center' },
  classBadgeText: { fontSize: 9, fontWeight: '800' },
  badgeA: { backgroundColor: '#E2F6E9' },
  badgeB: { backgroundColor: '#FFF9E6' },
  approvalBtn: { backgroundColor: '#1A1A1A', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  approvalBtnText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  badgePending: { backgroundColor: '#FFE3E3', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  badgePendingText: { color: '#DC3545', fontSize: 10, fontWeight: '700' },
});


