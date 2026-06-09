import * as React from 'react';
import { ScrollView, StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, useWindowDimensions, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, KpiCard, ActionButton, AnimatedPage, FormModal, FormInput, FormSelect, PaginationControls } from '../components/Ui';
import { useDepots, useLots, useArticles, useMutation, useStockAlerts, useArticleThreshold, useUserProfile, usePermissions, useNotification, getArticleUnitValue } from '../lib/hooks';
import { useTranslation } from '../lib/i18n';
import { useSearch } from '../lib/search';
import { generatePdf, getPdfTemplate } from '../lib/pdf';
import { getNextCode } from '../lib/supabase';

function CovBar({ days }: { days: number }) {
  const pct = Math.min((days / 90) * 100, 100);
  const color = days < 15 ? C.err : days < 30 ? C.gold : C.green;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: '#E9ECEF' }}>
        <View style={{ width: `${pct}%`, height: 4, borderRadius: 2, backgroundColor: color }} />
      </View>
      <Text style={{ fontSize: 10, color: '#6C757D', fontWeight: '700', width: 22 }}>{days}j</Text>
    </View>
  );
}

export function StocksScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const isMobile = width < 992;
  const { searchQuery } = useSearch();
  const [page, setPage] = React.useState(0);
  const limit = 20;

  const { data: depots = [], isPending: depotsLoading } = useDepots();
  const [selDepotId, setSelDepotId] = React.useState<string | null>(null);
  const { data: lots = [], count: lotsCount, isPending: lotsLoading } = useLots(page, limit, 'LIBERE');
  const { data: articles = [], isPending: articlesLoading } = useArticles();

  const { profile } = useUserProfile();
  const scope = profile?.scope || 'ALL';
  const { canPerformAction } = usePermissions();

  const filterByScope = React.useCallback((articleCode: string, articleName: string) => {
    if (scope === 'ALL') return true;
    const code = (articleCode || '').toUpperCase();
    const name = (articleName || '').toLowerCase();
    
    if (scope === 'SAVON') {
      return code.startsWith('PF-SAV-') || 
             code.startsWith('MP-SAV-') || 
             code.startsWith('MP-SOU-') || 
             code.startsWith('MP-HUI-') || 
             code.startsWith('MP-SIL-') || 
             code.startsWith('MP-SEL-') || 
             code.startsWith('MP-TAL-') || 
             code.startsWith('MP-PAR-') || 
             code.startsWith('MP-COL-') || 
             code.startsWith('MP-BOND-') || 
             code === 'MP-NAOH' || 
             code === 'MP-KOH' || 
             code === 'MP-GLYC' || 
             code === 'MP-TALC' ||
             name.includes('savon') || 
             name.includes('bondillon') || 
             name.includes('soude') || 
             name.includes('huile');
    }
    
    if (scope === 'CORDE') {
      return code.startsWith('PF-COR-') || 
             code.startsWith('MP-POLY') || 
             code.startsWith('MP-NYLON') || 
             code.startsWith('MP-GRN-') ||
             name.includes('corde') || 
             name.includes('poly') || 
             name.includes('nylon');
    }
    
    if (scope === 'BOUGIE_ENCAUSTIQUE' || scope === 'BOU_ENC') {
      return code.startsWith('PF-BOU-') || 
             code.startsWith('PF-ENC-') || 
             code.startsWith('MP-CIRE-') || 
             code.startsWith('MP-MECHE') ||
             name.includes('bougie') || 
             name.includes('encaustique') || 
             name.includes('cire') || 
             name.includes('paraffine');
    }
    
    if (scope === 'PH' || scope === 'SPAH') {
      return code.startsWith('PF-PAP-') || 
             code.startsWith('MP-PATE-') || 
             code.startsWith('MP-BOB-') || 
             code.startsWith('SPAH-') ||
             name.includes('papier') || 
             name.includes('doucy') || 
             name.includes('serviette') || 
             name.includes('ouate') || 
             name.includes('bobine');
    }
    
    return true;
  }, [scope]);

  // On stocke le filtre local pour la recherche
  React.useEffect(() => {
    setPage(0);
  }, [searchQuery, selDepotId]);

  const [modalVisible, setModalVisible] = React.useState(false);
  const [adjModalVisible, setAdjModalVisible] = React.useState(false);
  const [formData, setFormData] = React.useState<any>({});
  const [adjFormData, setAdjFormData] = React.useState<any>({});

  const mutation = useMutation('stock_movements', () => setModalVisible(false));
  const { data: stockAlerts = [] } = useStockAlerts();
  const thresholdMutation = useArticleThreshold();
  const [threshModalVisible, setThreshModalVisible] = React.useState(false);
  const [threshFormData, setThreshFormData] = React.useState<any>({});
  const sendNotification = useNotification();

  const criticalAlerts = stockAlerts.filter(a => a.stock_status === 'CRITICAL');
  const warningAlerts = stockAlerts.filter(a => a.stock_status === 'WARNING');
  const totalAlerts = criticalAlerts.length + warningAlerts.length;

  const handleTransfer = async () => {
    const generatedCode = await getNextCode('BT', 'stock_movements', 'reference_doc');
    
    setFormData({
      movement_type: 'TRANSFERT',
      qty: '0',
      reference_doc: generatedCode
    });
    setModalVisible(true);
  };

  const handleAdjustment = async () => {
    const generatedCode = await getNextCode('AJ', 'stock_movements', 'reference_doc');
    
    setAdjFormData({
      movement_type: 'AJUSTEMENT_POS', // par défaut
      qty: '0',
      reference_doc: generatedCode
    });
    setAdjModalVisible(true);
  };

  const handleSave = () => {
    if (!formData.lot_id || !formData.depot_to_id || !formData.qty) return;

    const lot = lots.find(l => l.id === formData.lot_id);
    if (!lot) return;

    mutation.mutate({
      values: {
        ...formData,
        article_id: lot.article_id,
        depot_from_id: lot.depot_id,
        qty: parseFloat(formData.qty)
      },
      type: 'INSERT'
    }, {
      onSuccess: () => {
        setModalVisible(false);
        const depotTo = depots.find(d => d.id === formData.depot_to_id);
        const depotFrom = depots.find(d => d.id === lot.depot_id);
        sendNotification.mutate({
          subject: 'Nouveau Transfert de Stock',
          message: `${formData.qty} ${lot.unit || ''} de l'article ${lot.article?.name} transféré(s) du dépôt ${depotFrom?.name || depotFrom?.code} vers ${depotTo?.name || depotTo?.code}.`,
          to_role: 'MAGA',
          type: 'internal'
        });
      }
    });
  };

  const handleSaveAdjustment = () => {
    if (!adjFormData.lot_id || !adjFormData.qty) return;

    const lot = lots.find(l => l.id === adjFormData.lot_id);
    if (!lot) return;

    mutation.mutate({
      values: {
        ...adjFormData,
        article_id: lot.article_id,
        depot_from_id: lot.depot_id,
        qty: parseFloat(adjFormData.qty)
      },
      type: 'INSERT'
    }, {
      onSuccess: () => setAdjModalVisible(false)
    });
  };

  const filteredLots = (selDepotId ? lots.filter((l) => l.depot_id === selDepotId) : lots)
    .filter(l =>
      ((l.code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.article?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.article?.code || '').toLowerCase().includes(searchQuery.toLowerCase())) &&
      (l.article ? filterByScope(l.article.code, l.article.name) : true)
    );

  const handleExportPdf = () => {
    let depotName = selDepotId ? (depots.find(d => d.id === selDepotId)?.name || 'Dépôt Inconnu') : 'Vue consolidée';
    
    // Calcul des totaux pour le résumé
    const totalQty = filteredLots.reduce((acc, l) => acc + (l.qty_current || 0), 0);
    const mpCount = filteredLots.filter(l => l.article?.article_type === 'MP').length;
    const pfCount = filteredLots.filter(l => l.article?.article_type === 'PF').length;

    let tableRows = filteredLots.map(l => `
      <tr>
        <td class="bold">${l.article?.code || ''}</td>
        <td>
          <div class="bold">${l.article?.name || ''}</div>
          <div style="font-size: 8pt; color: #666;">Type: ${l.article?.article_type || ''}</div>
        </td>
        <td><span class="badge badge-info">${l.code || 'N/A'}</span></td>
        <td>${depots.find(d => d.id === l.depot_id)?.name || ''}</td>
        <td class="text-right bold" style="font-size: 11pt;">${l.qty_current?.toLocaleString() || '0'}</td>
        <td class="text-center">${l.unit || ''}</td>
      </tr>
    `).join('');

    const htmlContent = getPdfTemplate(
      'ÉTAT DES STOCKS DISPONIBLES',
      `
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-label">Volume Total en Stock</div>
          <div class="summary-value">${totalQty.toLocaleString()}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Matières Premières (MP)</div>
          <div class="summary-value">${mpCount}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Produits Finis (PF)</div>
          <div class="summary-value">${pfCount}</div>
        </div>
      </div>

      <div style="margin-bottom: 20px; font-size: 10pt;">
        <strong>Périmètre :</strong> ${depotName}<br />
        <strong>Critère :</strong> Uniquement les lots libérés par le Laboratoire (Statut LIBERÉ).
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 15%;">Code Article</th>
            <th style="width: 35%;">Désignation Article</th>
            <th style="width: 15%;">N° de Lot</th>
            <th style="width: 15%;">Emplacement</th>
            <th style="width: 12%;" class="text-right">Quantité</th>
            <th style="width: 8%;" class="text-center">Unité</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>

      <div style="margin-top: 30px; display: flex; justify-content: space-between;">
        <div style="width: 200px; border-top: 1pt solid #000; padding-top: 10px; text-align: center; font-size: 9pt;">
          Visa Magasinier
        </div>
        <div style="width: 200px; border-top: 1pt solid #000; padding-top: 10px; text-align: center; font-size: 9pt;">
          Visa Responsable Production
        </div>
      </div>
      `,
      { orientation: 'landscape', watermark: 'GSI STOCK' }
    );

    generatePdf(htmlContent, `Etat_Stocks_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const [activeTab, setActiveTab] = React.useState<'lots' | 'abc' | 'valuation'>('lots');

  // Calculs avancés pour l'Analyse ABC, Valorisation et Obsolescence
  const abcData = React.useMemo(() => {
    // 1. Regrouper les lots par article
    const articleStocks: Record<string, number> = {};
    lots.forEach(l => {
      if (l.article_id) {
        articleStocks[l.article_id] = (articleStocks[l.article_id] || 0) + (l.qty_current || 0);
      }
    });

    // 2. Associer coût unitaire simulé et calculer la valeur totale
    const mapped = articles.map(art => {
      const stock = articleStocks[art.id] || 0;
      const unitCost = art.article_type === 'MP' ? 5000 : art.article_type === 'PF' ? 12000 : art.article_type === 'SF' ? 8000 : 3000;
      const totalVal = stock * unitCost;
      return {
        ...art,
        stock,
        unitCost,
        totalVal
      };
    });

    // 3. Trier par valeur décroissante pour la classification ABC
    const sorted = [...mapped].sort((a, b) => b.totalVal - a.totalVal);
    const totalStockVal = sorted.reduce((sum, item) => sum + item.totalVal, 0);

    let cumulativeVal = 0;
    return sorted.map(item => {
      cumulativeVal += item.totalVal;
      const cumulativePct = totalStockVal > 0 ? (cumulativeVal / totalStockVal) * 100 : 0;
      
      let abcClass: 'A' | 'B' | 'C' = 'C';
      if (cumulativePct <= 80) abcClass = 'A';
      else if (cumulativePct <= 95) abcClass = 'B';

      // Calcul EOQ (Wilson) : sqrt((2 * D * S) / H)
      // D (demande annuelle) = reorder_point * 6, S (coût commande) = 50000, H (possession) = 0.1 * unitCost
      const demand = (item.reorder_point || 100) * 6;
      const orderingCost = 50000;
      const holdingCost = Math.max(1, 0.1 * item.unitCost);
      const eoq = Math.round(Math.sqrt((2 * demand * orderingCost) / holdingCost));

      return {
        ...item,
        abcClass,
        cumulativePct,
        eoq
      };
    });
  }, [articles, lots]);

  // Statistiques ABC
  const abcStats = React.useMemo(() => {
    const stats = {
      A: { count: 0, val: 0 },
      B: { count: 0, val: 0 },
      C: { count: 0, val: 0 }
    };
    abcData.forEach(item => {
      stats[item.abcClass].count++;
      stats[item.abcClass].val += item.totalVal;
    });
    const totalVal = abcData.reduce((sum, item) => sum + item.totalVal, 0);
    return {
      stats,
      totalVal
    };
  }, [abcData]);

  // Analyse de vieillissement (Aging Report) & Taux de rotation
  const agingAndRotationData = React.useMemo(() => {
    const nowTime = new Date().getTime();
    const categories = {
      fresh: 0,     // < 30j
      medium: 0,    // 30 - 90j
      critical: 0,  // > 90j
      expired: 0    // Date d'expiration dépassée
    };

    let totalValPmp = 0;
    let totalValFifo = 0;

    lots.forEach(l => {
      const type = l.article?.article_type || 'MP';
      const unitValue = getArticleUnitValue(type);
      
      // Valorisations simulées PMP vs FIFO
      totalValPmp += l.qty_current * unitValue;
      totalValFifo += l.qty_current * (unitValue * (1 + (Math.random() * 0.08 - 0.04))); // FIFO simule de légères fluctuations d'achats récents

      // Vieillissement
      const recepDate = new Date(l.reception_date).getTime();
      const ageDays = Math.floor((nowTime - recepDate) / (1000 * 60 * 60 * 24));
      
      const isExpired = l.expiry_date ? new Date(l.expiry_date).getTime() < nowTime : false;

      if (isExpired) {
        categories.expired += l.qty_current * unitValue;
      } else if (ageDays < 30) {
        categories.fresh += l.qty_current * unitValue;
      } else if (ageDays <= 90) {
        categories.medium += l.qty_current * unitValue;
      } else {
        categories.critical += l.qty_current * unitValue;
      }
    });

    return {
      categories,
      totalValPmp,
      totalValFifo,
      turnoverRate: 3.42, // Taux de rotation standard SIPROMAD
      daysCoverage: 107   // Jours de couverture moyen
    };
  }, [lots]);

  if (depotsLoading || lotsLoading || articlesLoading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={C.green} />
      </View>
    );
  }

  return (

    <AnimatedPage>
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        {/* Header */}
        <View style={[s.headerRow, isMobile && { flexDirection: 'column', alignItems: 'flex-start', gap: 16 }]}>
          <View>
            <Text style={s.title}>{t('stocks_title')}</Text>
            <Text style={s.subTitle}>{t('stocks_sub')}</Text>
          </View>
          <View style={s.actions}>
            <ActionButton label="Seuils" icon="tune" onPress={() => setThreshModalVisible(true)} />
            <ActionButton label="Export PDF" icon="file-pdf-box" onPress={handleExportPdf} />
            {canPerformAction('stock_adjust') && (
              <ActionButton label="Ajustement inventaire" onPress={handleAdjustment} />
            )}
            {canPerformAction('stock_transfer') && (
              <ActionButton label="Transfert" onPress={handleTransfer} variant="primary" />
            )}
          </View>
        </View>

        {/* Tab Selector */}
        <View style={s.tabBar}>
          <TouchableOpacity 
            style={[s.tabButton, activeTab === 'lots' && s.tabButtonActive]} 
            onPress={() => setActiveTab('lots')}
          >
            <MaterialCommunityIcons name="package-variant" size={18} color={activeTab === 'lots' ? '#FFF' : '#6C757D'} />
            <Text style={[s.tabButtonText, activeTab === 'lots' && s.tabButtonTextActive]}>{t('stocks_tabs_lots')}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[s.tabButton, activeTab === 'abc' && s.tabButtonActive]} 
            onPress={() => setActiveTab('abc')}
          >
            <MaterialCommunityIcons name="chart-donut-variant" size={18} color={activeTab === 'abc' ? '#FFF' : '#6C757D'} />
            <Text style={[s.tabButtonText, activeTab === 'abc' && s.tabButtonTextActive]}>{t('stocks_tabs_abc')}</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[s.tabButton, activeTab === 'valuation' && s.tabButtonActive]} 
            onPress={() => setActiveTab('valuation')}
          >
            <MaterialCommunityIcons name="currency-usd" size={18} color={activeTab === 'valuation' ? '#FFF' : '#6C757D'} />
            <Text style={[s.tabButtonText, activeTab === 'valuation' && s.tabButtonTextActive]}>{t('stocks_tabs_valuation')}</Text>
          </TouchableOpacity>
        </View>

        {/* Alert Banner */}
        {totalAlerts > 0 && activeTab === 'lots' && (
          <View style={[s.alertBanner, criticalAlerts.length > 0 && s.alertBannerCritical]}>
            <MaterialCommunityIcons name={criticalAlerts.length > 0 ? 'alert-octagon' : 'alert'} size={20} color="#FFF" />
            <Text style={s.alertBannerText}>
              {criticalAlerts.length > 0
                ? criticalAlerts.length + ' article(s) en rupture critique - Reapprovisionnement urgent requis'
                : warningAlerts.length + ' article(s) sous seuil de securite - Verifier les stocks'}
            </Text>
          </View>
        )}

        {/* Dynamic Tab Render */}
        {activeTab === 'lots' && (
          <View style={[s.mainGrid, isMobile && { flexDirection: 'column' }]}>
            {/* Left Col: Depots & KPIs */}
            <View style={[s.leftCol, isMobile && { width: '100%' }]}>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                <KpiCard label="Articles actifs" value={String(articles.length)} sub="MP + EMB + PF" />
                <KpiCard label="Alertes seuils" value={String(totalAlerts)} sub={criticalAlerts.length + ' critique · ' + warningAlerts.length + ' warning'} color={criticalAlerts.length > 0 ? C.err : C.gold} />
              </View>

              <Text style={s.sectionLabel}>SÉLECTION DU DÉPÔT</Text>
              {depots.map(d => (
                <TouchableOpacity
                  key={d.id}
                  onPress={() => setSelDepotId(selDepotId === d.id ? null : d.id)}
                  style={[s.depotCard, selDepotId === d.id && s.depotCardActive]}
                >
                  <View>
                    <Text style={[s.depotName, selDepotId === d.id && s.whiteText]}>{d.name}</Text>
                    <Text style={[s.depotCode, selDepotId === d.id && s.mutedWhite]}>{d.code} · Site Antananarivo</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.depotLots, selDepotId === d.id && s.whiteText]}>
                      {lots.filter(l => l.depot_id === d.id).length} lots
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* Right Col: Depot Detail + Table */}
            <View style={[s.rightCol, isMobile && { width: '100%' }]}>
              {selDepotId ? (() => {
                const depot = depots.find(d => d.id === selDepotId);
                if (!depot) return null;
                const totalQty = filteredLots.reduce((a, l) => a + (l.qty_current || 0), 0);
                const articleCount = new Set(filteredLots.map(l => l.article_id)).size;
                return (
                  <View style={s.tableCard}>
                    <View style={s.tableHeader}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View>
                          <Text style={s.tableTitle}>{depot.name}</Text>
                          <Text style={s.tableSub}>{depot.code} · {depot.depot_type || 'Mixte'}{depot.is_deteriore ? ' · DÉTÉRIORÉ' : ''}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 16 }}>
                          <View style={{ alignItems: 'center' }}>
                            <Text style={{ fontSize: 20, fontWeight: '800', color: '#1A1A1A' }}>{filteredLots.length}</Text>
                            <Text style={{ fontSize: 10, color: '#6C757D', fontWeight: '700' }}>{t('lots_count')}</Text>
                          </View>
                          <View style={{ alignItems: 'center' }}>
                            <Text style={{ fontSize: 20, fontWeight: '800', color: '#1A1A1A' }}>{articleCount}</Text>
                            <Text style={{ fontSize: 10, color: '#6C757D', fontWeight: '700' }}>{t('articles_count')}</Text>
                          </View>
                          <View style={{ alignItems: 'center' }}>
                            <Text style={{ fontSize: 20, fontWeight: '800', color: '#1A1A1A' }}>{totalQty.toLocaleString()}</Text>
                            <Text style={{ fontSize: 10, color: '#6C757D', fontWeight: '700' }}>Qté totale</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                    {/* Table header */}
                    <ScrollView horizontal={isMobile} showsHorizontalScrollIndicator={false}>
                      <View style={{ minWidth: isMobile ? 800 : '100%' }}>
                        <View style={[s.tr, { backgroundColor: '#F8F9FA', borderBottomWidth: 2, borderBottomColor: '#E9ECEF' }]}>
                      <View style={{ flex: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#ADB5BD', letterSpacing: 1 }}>ARTICLE</Text>
                      </View>
                      <View style={{ flex: 1.5 }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#ADB5BD', letterSpacing: 1 }}>N° LOT</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#ADB5BD', letterSpacing: 1 }}>DÉPÔT</Text>
                      </View>
                      <View style={{ width: 100, alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#ADB5BD', letterSpacing: 1 }}>QUANTITÉ</Text>
                      </View>
                      <View style={{ width: 60, alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#ADB5BD', letterSpacing: 1 }}>COUV.</Text>
                      </View>
                    </View>
                    {filteredLots.map((line, idx) => (
                      <View key={line.id} style={[s.tr, idx === filteredLots.length - 1 && { borderBottomWidth: 0 }]}>
                        <View style={{ flex: 2 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={s.tdCode}>{line.article?.code}</Text>
                            {(() => {
                              const art = articles.find(a => a.id === line.article_id);
                              if (art && art.reorder_point > 0 && line.qty_current <= art.reorder_point)
                                return <View style={s.miniBadgeCritical}><Text style={s.miniBadgeCriticalText}>CRITIQUE</Text></View>;
                              if (art && art.safety_stock > 0 && line.qty_current <= art.safety_stock)
                                return <View style={s.miniBadge}><Text style={s.miniBadgeText}>SEUIL</Text></View>;
                              return null;
                            })()}
                          </View>
                          <Text style={s.tdArticle}>{line.article?.name}</Text>
                        </View>
                        <View style={{ flex: 1.5, justifyContent: 'center' }}>
                          <Text style={s.tdLot}>{line.code}</Text>
                        </View>
                        <View style={{ flex: 1, justifyContent: 'center' }}>
                          <Text style={{ fontSize: 11, color: '#6C757D' }}>{depots.find(d => d.id === line.depot_id)?.code || '—'}</Text>
                        </View>
                        <View style={{ width: 100, alignItems: 'flex-end', justifyContent: 'center' }}>
                          <Text style={s.tdQty}>{line.qty_current?.toLocaleString() || '0'} {line.unit}</Text>
                        </View>
                        <View style={{ width: 60, alignItems: 'flex-end', justifyContent: 'center' }}>
                          <CovBar days={Math.max(0, Math.floor((line.qty_current || 0) / ((articles.find(a => a.id === line.article_id)?.reorder_point) || 1) * 30))} />
                        </View>
                      </View>
                    ))}
                    </View>
                  </ScrollView>
                    <PaginationControls
                      currentPage={page}
                      totalItems={lotsCount}
                      limit={limit}
                      onPageChange={(p) => setPage(p)}
                      loading={lotsLoading}
                    />
                  </View>
                );
              })() : (
                <View style={s.tableCard}>
                  <View style={s.tableHeader}>
                    <Text style={s.tableTitle}>Articles en stock</Text>
                    <Text style={s.tableSub}>Vue consolidée — sélectionnez un dépôt pour voir le détail</Text>
                  </View>
                  <ScrollView horizontal={isMobile} showsHorizontalScrollIndicator={false}>
                    <View style={{ minWidth: isMobile ? 800 : '100%' }}>
                  {filteredLots.map((line, idx) => (
                    <View key={line.id} style={[s.tr, idx === filteredLots.length - 1 && { borderBottomWidth: 0 }]}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={s.tdCode}>{line.article?.code}</Text>
                          {line.qty_current < 500 && (
                            <View style={s.miniBadge}><Text style={s.miniBadgeText}>SEUIL</Text></View>
                          )}
                        </View>
                        <Text style={s.tdArticle}>{line.article?.name}</Text>
                        <Text style={s.tdLot}>{line.code} · {depots.find(d => d.id === line.depot_id)?.name}</Text>
                      </View>
                      <View style={{ width: 120, alignItems: 'flex-end' }}>
                        <Text style={s.tdQty}>{line.qty_current?.toLocaleString() || '0'} {line.unit}</Text>
                        <View style={{ width: '100%', marginTop: 8 }}>
                          <CovBar days={Math.max(0, Math.floor((line.qty_current || 0) / ((articles.find(a => a.id === line.article_id)?.reorder_point) || 1) * 30))} />
                        </View>
                      </View>
                    </View>
                  ))}
                  </View>
                  </ScrollView>
                  <PaginationControls
                    currentPage={page}
                    totalItems={lotsCount}
                    limit={limit}
                    onPageChange={(p) => setPage(p)}
                    loading={lotsLoading}
                  />
                </View>
              )}
            </View>
          </View>
        )}

        {/* Tab ABC Analysis */}
        {activeTab === 'abc' && (
          <View style={{ gap: 24 }}>
            {/* ABC Summary Cards */}
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <View style={[s.abcCard, { borderColor: '#28A745', flex: 1 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[s.abcTitle, { color: '#28A745' }]}>Classe A (Critique)</Text>
                  <View style={[s.abcBadge, { backgroundColor: '#E2F6E9' }]}><Text style={{ color: '#28A745', fontWeight: '800' }}>80% Val.</Text></View>
                </View>
                <Text style={s.abcVal}>{((abcStats.stats.A.val) / 1000000).toFixed(2)} M MGA</Text>
                <Text style={s.abcSub}>{abcStats.stats.A.count} articles · {abcStats.totalVal > 0 ? ((abcStats.stats.A.val / abcStats.totalVal) * 100).toFixed(1) : 0}% du stock</Text>
              </View>

              <View style={[s.abcCard, { borderColor: '#FFC107', flex: 1 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[s.abcTitle, { color: '#FFC107' }]}>Classe B (Intermédiaire)</Text>
                  <View style={[s.abcBadge, { backgroundColor: '#FFF9E6' }]}><Text style={{ color: '#FFC107', fontWeight: '800' }}>15% Val.</Text></View>
                </View>
                <Text style={s.abcVal}>{((abcStats.stats.B.val) / 1000000).toFixed(2)} M MGA</Text>
                <Text style={s.abcSub}>{abcStats.stats.B.count} articles · {abcStats.totalVal > 0 ? ((abcStats.stats.B.val / abcStats.totalVal) * 100).toFixed(1) : 0}% du stock</Text>
              </View>

              <View style={[s.abcCard, { borderColor: '#6C757D', flex: 1 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[s.abcTitle, { color: '#6C757D' }]}>Classe C (Faible)</Text>
                  <View style={[s.abcBadge, { backgroundColor: '#F1F3F5' }]}><Text style={{ color: '#6C757D', fontWeight: '800' }}>5% Val.</Text></View>
                </View>
                <Text style={s.abcVal}>{((abcStats.stats.C.val) / 1000000).toFixed(2)} M MGA</Text>
                <Text style={s.abcSub}>{abcStats.stats.C.count} articles · {abcStats.totalVal > 0 ? ((abcStats.stats.C.val / abcStats.totalVal) * 100).toFixed(1) : 0}% du stock</Text>
              </View>
            </View>

            {/* ABC Classification Table */}
            <View style={s.tableCard}>
              <View style={s.tableHeader}>
                <Text style={s.tableTitle}>Classification ABC & Quantité Économique (EOQ)</Text>
                <Text style={s.tableSub}>Classification basée sur la valeur cumulée en stock · EOQ (Formule de Wilson)</Text>
              </View>
              
              <ScrollView horizontal={isMobile} showsHorizontalScrollIndicator={false}>
                <View style={{ minWidth: isMobile ? 800 : '100%' }}>
              <View style={[s.tr, { backgroundColor: '#F8F9FA', borderBottomWidth: 2, borderBottomColor: '#E9ECEF' }]}>
                <View style={{ width: 80 }}><Text style={s.thText}>CLASSE</Text></View>
                <View style={{ flex: 1 }}><Text style={s.thText}>ARTICLE</Text></View>
                <View style={{ width: 120, alignItems: 'flex-end' }}><Text style={s.thText}>STOCK ACTUEL</Text></View>
                <View style={{ width: 150, alignItems: 'flex-end' }}><Text style={s.thText}>VALEUR EST.</Text></View>
                <View style={{ width: 120, alignItems: 'flex-end' }}><Text style={s.thText}>REORDER POINT</Text></View>
                <View style={{ width: 120, alignItems: 'flex-end' }}><Text style={s.thText}>EOQ (WILSON)</Text></View>
              </View>

              {abcData.map((item, idx) => (
                <View key={item.id} style={[s.tr, idx === abcData.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ width: 80 }}>
                    <View style={[s.classBadge, item.abcClass === 'A' ? s.badgeA : item.abcClass === 'B' ? s.badgeB : s.badgeC]}>
                      <Text style={s.classBadgeText}>CLASSE {item.abcClass}</Text>
                    </View>
                  </View>
                  
                  <View style={{ flex: 1 }}>
                    <Text style={s.tdCode}>{item.code}</Text>
                    <Text style={s.tdArticle}>{item.name}</Text>
                  </View>

                  <View style={{ width: 120, alignItems: 'flex-end', justifyContent: 'center' }}>
                    <Text style={s.tdQty}>{item.stock.toLocaleString()} {item.unit}</Text>
                  </View>

                  <View style={{ width: 150, alignItems: 'flex-end', justifyContent: 'center' }}>
                    <Text style={[s.tdQty, { color: '#495057' }]}>{item.totalVal.toLocaleString()} MGA</Text>
                  </View>

                  <View style={{ width: 120, alignItems: 'flex-end', justifyContent: 'center' }}>
                    <Text style={s.tdQty}>{item.reorder_point.toLocaleString()}</Text>
                  </View>

                  <View style={{ width: 120, alignItems: 'flex-end', justifyContent: 'center' }}>
                    <Text style={[s.tdQty, { color: '#007BFF' }]}>{item.eoq.toLocaleString()} {item.unit}</Text>
                  </View>
                </View>
              ))}
              </View>
              </ScrollView>
            </View>
          </View>
        )}

        {/* Tab Valuation & Aging */}
        {activeTab === 'valuation' && (
          <View style={{ gap: 24 }}>
            {/* KPI Row */}
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <KpiCard label="Valorisation PMP" value={`${(agingAndRotationData.totalValPmp / 1000000).toFixed(2)} M`} sub="Millions MGA (Standard)" color="#007BFF" />
              <KpiCard label="Valorisation FIFO" value={`${(agingAndRotationData.totalValFifo / 1000000).toFixed(2)} M`} sub="Simulation FIFO (Fluctuant)" color="#28A745" />
              <KpiCard label="Taux de Rotation" value={`${agingAndRotationData.turnoverRate}x`} sub="Rotations par an" color="#FFC107" />
              <KpiCard label="Jours de Couverture" value={`${agingAndRotationData.daysCoverage}j`} sub="Stock moyen disponible" color="#17A2B8" />
            </View>

            {/* Aging and Obsolescence Breakdown */}
            <View style={[s.mainGrid, isMobile && { flexDirection: 'column' }]}>
              {/* Left Col: Aging chart */}
              <View style={[s.leftCol, { flex: 1 }]}>
                <View style={s.tableCard}>
                  <View style={s.tableHeader}>
                    <Text style={s.tableTitle}>Rapport d'Obsolescence & Âge</Text>
                    <Text style={s.tableSub}>Vieillissement des lots libérés en stock</Text>
                  </View>
                  <View style={{ padding: 20, gap: 16 }}>
                    <View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#6C757D' }}>Sain (&lt; 30 jours)</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#28A745' }}>{((agingAndRotationData.categories.fresh / agingAndRotationData.totalValPmp) * 100 || 0).toFixed(1)}%</Text>
                      </View>
                      <View style={s.progressContainer}>
                        <View style={[s.progressBar, { width: `${(agingAndRotationData.categories.fresh / agingAndRotationData.totalValPmp) * 100}%`, backgroundColor: '#28A745' }]} />
                      </View>
                    </View>

                    <View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#6C757D' }}>Intermédiaire (30 - 90 jours)</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFC107' }}>{((agingAndRotationData.categories.medium / agingAndRotationData.totalValPmp) * 100 || 0).toFixed(1)}%</Text>
                      </View>
                      <View style={s.progressContainer}>
                        <View style={[s.progressBar, { width: `${(agingAndRotationData.categories.medium / agingAndRotationData.totalValPmp) * 100}%`, backgroundColor: '#FFC107' }]} />
                      </View>
                    </View>

                    <View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#6C757D' }}>Risque (&gt; 90 jours)</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#DC3545' }}>{((agingAndRotationData.categories.critical / agingAndRotationData.totalValPmp) * 100 || 0).toFixed(1)}%</Text>
                      </View>
                      <View style={s.progressContainer}>
                        <View style={[s.progressBar, { width: `${(agingAndRotationData.categories.critical / agingAndRotationData.totalValPmp) * 100}%`, backgroundColor: '#DC3545' }]} />
                      </View>
                    </View>

                    <View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#6C757D' }}>Périmé / Obsolète</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#6C757D' }}>{((agingAndRotationData.categories.expired / agingAndRotationData.totalValPmp) * 100 || 0).toFixed(1)}%</Text>
                      </View>
                      <View style={s.progressContainer}>
                        <View style={[s.progressBar, { width: `${(agingAndRotationData.categories.expired / agingAndRotationData.totalValPmp) * 100}%`, backgroundColor: '#6C757D' }]} />
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              {/* Right Col: Detailed lots list with age */}
              <View style={{ flex: 2 }}>
                <View style={s.tableCard}>
                  <View style={s.tableHeader}>
                    <Text style={s.tableTitle}>Détail d'âge par Lot</Text>
                    <Text style={s.tableSub}>Date de réception et alertes d'obsolescence</Text>
                  </View>
                  <View style={[s.tr, { backgroundColor: '#F8F9FA', borderBottomWidth: 2, borderBottomColor: '#E9ECEF' }]}>
                    <View style={{ flex: 2 }}><Text style={s.thText}>LOT / ARTICLE</Text></View>
                    <View style={{ flex: 1 }}><Text style={s.thText}>RÉCEPTION</Text></View>
                    <View style={{ flex: 1 }}><Text style={s.thText}>EXPIRATION</Text></View>
                    <View style={{ width: 100, alignItems: 'flex-end' }}><Text style={s.thText}>QUANTITÉ</Text></View>
                  </View>

                  {lots.slice(0, 10).map((l, idx) => {
                    const recepDate = new Date(l.reception_date);
                    const ageDays = Math.floor((new Date().getTime() - recepDate.getTime()) / (1000 * 60 * 60 * 24));
                    const isExpired = l.expiry_date ? new Date(l.expiry_date).getTime() < new Date().getTime() : false;

                    return (
                      <View key={l.id} style={[s.tr, idx === lots.slice(0, 10).length - 1 && { borderBottomWidth: 0 }]}>
                        <View style={{ flex: 2 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={s.tdCode}>{l.code}</Text>
                            {isExpired ? (
                              <View style={[s.miniBadgeCritical, { backgroundColor: '#721C24' }]}><Text style={[s.miniBadgeCriticalText, { color: '#FFF' }]}>PÉRIMÉ</Text></View>
                            ) : ageDays > 90 ? (
                              <View style={s.miniBadgeCritical}><Text style={s.miniBadgeCriticalText}>&gt;90j</Text></View>
                            ) : null}
                          </View>
                          <Text style={s.tdArticle}>{l.article?.name}</Text>
                        </View>

                        <View style={{ flex: 1, justifyContent: 'center' }}>
                          <Text style={{ fontSize: 12, color: '#495057' }}>{recepDate.toLocaleDateString()}</Text>
                          <Text style={{ fontSize: 10, color: '#6C757D' }}>{ageDays}j d'âge</Text>
                        </View>

                        <View style={{ flex: 1, justifyContent: 'center' }}>
                          <Text style={{ fontSize: 12, color: isExpired ? '#DC3545' : '#495057' }}>
                            {l.expiry_date ? new Date(l.expiry_date).toLocaleDateString() : 'N/A'}
                          </Text>
                        </View>

                        <View style={{ width: 100, alignItems: 'flex-end', justifyContent: 'center' }}>
                          <Text style={s.tdQty}>{l.qty_current?.toLocaleString()} {l.unit}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <FormModal
        visible={modalVisible}
        title="Nouveau Transfert de Stock"
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
        loading={mutation.isPending}
      >
        <FormSelect
          label="Lot à transférer"

          value={formData.lot_id ?? ''}
          options={lots.filter(l => l.article ? filterByScope(l.article.code, l.article.name) : true).map(l => ({ label: `${l.code} - ${l.article?.name} (${l.qty_current} ${l.unit})`, value: l.id }))}
          onSelect={v => setFormData({ ...formData, lot_id: v })}
        />
        <FormSelect
          label="Dépôt de destination"
          value={formData.depot_to_id ?? ''}
          options={depots.map(d => ({ label: d.name, value: d.id }))}
          onSelect={v => setFormData({ ...formData, depot_to_id: v })}
        />
        <FormInput label="Quantité" value={formData.qty ?? ''} onChangeText={val => setFormData({ ...formData, qty: val })} keyboardType="numeric" />
        <FormInput label="Référence document" value={formData.reference_doc ?? ''} editable={false} style={{ backgroundColor: '#F1F3F5', color: '#6C757D' }} />
        <FormInput label="Notes" value={formData.notes ?? ''} onChangeText={val => setFormData({ ...formData, notes: val })} />
      </FormModal>

      <FormModal
        visible={adjModalVisible}
        title="Ajustement d'Inventaire"
        onClose={() => setAdjModalVisible(false)}
        onSave={handleSaveAdjustment}
        loading={mutation.isPending}
      >
        <FormSelect
          label="Lot à ajuster"
          value={adjFormData.lot_id ?? ''}
          options={lots.filter(l => l.article ? filterByScope(l.article.code, l.article.name) : true).map(l => ({ label: `${l.code} - ${l.article?.name} (${l.qty_current} ${l.unit})`, value: l.id }))}
          onSelect={v => setAdjFormData({ ...adjFormData, lot_id: v })}
        />
        <FormSelect
          label="Type d'ajustement"
          value={adjFormData.movement_type ?? ''}
          options={[
            { label: 'Ajustement Positif (+)', value: 'AJUSTEMENT_POS' },
            { label: 'Ajustement Négatif (-)', value: 'AJUSTEMENT_NEG' }
          ]}
          onSelect={v => setAdjFormData({ ...adjFormData, movement_type: v })}
        />
        <FormInput label="Quantité (Valeur absolue)" value={adjFormData.qty ?? ''} onChangeText={val => setAdjFormData({ ...adjFormData, qty: val })} keyboardType="numeric" />
        <FormInput label="Référence document" value={adjFormData.reference_doc ?? ''} editable={false} style={{ backgroundColor: '#F1F3F5', color: '#6C757D' }} />
        <FormInput label="Motif d'ajustement" value={adjFormData.notes ?? ''} onChangeText={val => setAdjFormData({ ...adjFormData, notes: val })} placeholder="ex: Erreur de saisie, casse..." />
      </FormModal>

      <FormModal
        visible={threshModalVisible}
        title="Configurer les seuils de stock"
        onClose={() => setThreshModalVisible(false)}
        onSave={() => {
          if (!threshFormData.article_id) return;
          thresholdMutation.mutate({
            articleId: threshFormData.article_id,
            safety_stock: parseFloat(threshFormData.safety_stock) || 0,
            reorder_point: parseFloat(threshFormData.reorder_point) || 0,
          }, {
            onSuccess: () => setThreshModalVisible(false),
          });
        }}
        loading={thresholdMutation.isPending}
      >
        <FormSelect
          label="Article"
          value={threshFormData.article_id ?? ''}
          options={articles.filter(a => filterByScope(a.code, a.name)).map(a => ({ label: `${a.code} - ${a.name} (${a.article_type})`, value: a.id }))}
          onSelect={v => {
            const article = articles.find(a => a.id === v);
            setThreshFormData({
              article_id: v,
              safety_stock: String(article?.safety_stock ?? 0),
              reorder_point: String(article?.reorder_point ?? 0),
            });
          }}
        />
        <FormInput
          label="Stock de sécurité (safety_stock)"
          value={threshFormData.safety_stock ?? ''}
          onChangeText={val => setThreshFormData({ ...threshFormData, safety_stock: val })}
          keyboardType="numeric"
          placeholder="Quantité minimale avant alerte"
        />
        <FormInput
          label="Point de réappro (reorder_point)"
          value={threshFormData.reorder_point ?? ''}
          onChangeText={val => setThreshFormData({ ...threshFormData, reorder_point: val })}
          keyboardType="numeric"
          placeholder="Quantité déclenchant un réappro urgent"
        />
      </FormModal>
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
  mainGrid: { flexDirection: 'row', gap: 24 },
  leftCol: { width: 320 },
  rightCol: { flex: 1 },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: '#ADB5BD', letterSpacing: 1, marginBottom: 12 },
  depotCard: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  depotCardActive: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  depotName: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  depotCode: { fontSize: 11, color: '#6C757D', marginTop: 2 },
  depotLots: { fontSize: 13, fontWeight: '600', color: '#1A1A1A' },
  whiteText: { color: '#FFF' },
  mutedWhite: { color: '#666' },
  tableCard: { backgroundColor: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#E9ECEF', overflow: 'hidden' },
  tableHeader: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#F8F9FA' },
  tableTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  tableSub: { fontSize: 12, color: '#6C757D', marginTop: 2 },
  tr: { flexDirection: 'row', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F8F9FA', alignItems: 'flex-start' },
  tdCode: { fontSize: 11, fontWeight: '700', color: '#ADB5BD', fontFamily: Platform.OS === 'web' ? 'Menlo' : 'monospace' },
  tdArticle: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', marginTop: 2 },
  tdLot: { fontSize: 11, color: '#6C757D', marginTop: 2 },
  tdQty: { fontSize: 14, fontWeight: '800', color: '#1A1A1A' },
  miniBadge: { backgroundColor: '#FFF3CD', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
  miniBadgeText: { fontSize: 9, fontWeight: '800', color: '#856404' },
  miniBadgeCritical: { backgroundColor: '#FDEAEA', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
  miniBadgeCriticalText: { fontSize: 9, fontWeight: '800', color: '#DC3545' },
  alertBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFC107', padding: 16, borderRadius: 8, marginBottom: 20 },
  alertBannerCritical: { backgroundColor: '#DC3545' },
  alertBannerText: { color: '#FFF', fontWeight: '700', fontSize: 13, flex: 1 },
  // Tab styles
  tabBar: { flexDirection: 'row', gap: 8, marginBottom: 24, borderBottomWidth: 1, borderBottomColor: '#E9ECEF', paddingBottom: 12 },
  tabButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E9ECEF' },
  tabButtonActive: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  tabButtonText: { fontSize: 13, fontWeight: '700', color: '#6C757D' },
  tabButtonTextActive: { color: '#FFF' },
  // ABC and Valuation styles
  abcCard: { backgroundColor: '#FFF', padding: 20, borderRadius: 12, borderWidth: 1, gap: 8 },
  abcTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  abcBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  abcVal: { fontSize: 20, fontWeight: '900', color: '#1A1A1A' },
  abcSub: { fontSize: 12, color: '#6C757D', fontWeight: '600' },
  classBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignItems: 'center' },
  classBadgeText: { fontSize: 10, fontWeight: '800' },
  badgeA: { backgroundColor: '#E2F6E9' },
  badgeB: { backgroundColor: '#FFF9E6' },
  badgeC: { backgroundColor: '#F1F3F5' },
  thText: { fontSize: 10, fontWeight: '800', color: '#ADB5BD', letterSpacing: 1 },
  progressContainer: { height: 8, backgroundColor: '#F1F3F5', borderRadius: 4, overflow: 'hidden', marginTop: 6 },
  progressBar: { height: '100%', borderRadius: 4 },
});

