import * as React from 'react';
import {
  ScrollView, StyleSheet, Text, View, TouchableOpacity,
  ActivityIndicator, useWindowDimensions, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  C, ActionButton, AnimatedPage, KpiCard, FormModal, FormInput,
  FormSelect, Badge, DataTable, SectionTitle,
} from '../components/Ui';
import {
  useSites, useMRPScenarios, useSaveMRPScenario, usePermissions,
  useUserProfile, useMutation, useSuppliers, useNotification,
} from '../lib/hooks';
import { useRealMRP, MRPResult } from '../lib/mrp';
import { useTranslation } from '../lib/i18n';
import { supabase, getNextCode } from '../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatAgo(minutes: number): string {
  if (minutes < 2)  return 'À l\'instant';
  if (minutes < 60) return `Il y a ${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `Il y a ${h}h${m}m` : `Il y a ${h}h`;
}

// ─── Composant MrpScreen ─────────────────────────────────────────────────────

export function MrpScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 992;
  const { calculating, progress, status, runMRP, results } = useRealMRP();
  const { t } = useTranslation();
  const { data: sites = [] } = useSites();
  const { canPerformAction } = usePermissions();
  const { profile } = useUserProfile();
  const queryClient = useQueryClient();

  // ── Fournisseurs pour le sélecteur de la modale DA ───────────────────────
  const { data: suppliers = [] } = useSuppliers(0, 200);
  const notify = useNotification();
  const daMutation = useMutation('da_local');

  const scope = profile?.scope || 'ALL';

  // ── Filtrage par scope utilisateur ──────────────────────────────────────
  const filterByScope = React.useCallback((articleCode: string, articleName: string) => {
    if (scope === 'ALL') return true;
    const code = (articleCode || '').toUpperCase();
    const name = (articleName || '').toLowerCase();

    if (scope === 'SAVON') {
      return code.startsWith('PF-SAV-') || code.startsWith('MP-SAV-') ||
             code.startsWith('MP-SOU-') || code.startsWith('MP-HUI-') ||
             code.startsWith('MP-SIL-') || code.startsWith('MP-SEL-') ||
             code.startsWith('MP-TAL-') || code.startsWith('MP-PAR-') ||
             code.startsWith('MP-COL-') || code.startsWith('MP-BOND-') ||
             code === 'MP-NAOH' || code === 'MP-KOH' || code === 'MP-GLYC' || code === 'MP-TALC' ||
             name.includes('savon') || name.includes('bondillon') ||
             name.includes('soude') || name.includes('huile');
    }
    if (scope === 'CORDE') {
      return code.startsWith('PF-COR-') || code.startsWith('MP-POLY') ||
             code.startsWith('MP-NYLON') || code.startsWith('MP-GRN-') ||
             name.includes('corde') || name.includes('poly') || name.includes('nylon');
    }
    if (scope === 'BOUGIE_ENCAUSTIQUE' || scope === 'BOU_ENC') {
      return code.startsWith('PF-BOU-') || code.startsWith('PF-ENC-') ||
             code.startsWith('MP-CIRE-') || code.startsWith('MP-MECHE') ||
             name.includes('bougie') || name.includes('encaustique') ||
             name.includes('cire') || name.includes('paraffine');
    }
    if (scope === 'PH' || scope === 'SPAH') {
      return code.startsWith('PF-PAP-') || code.startsWith('MP-PATE-') ||
             code.startsWith('MP-BOB-') || code.startsWith('SPAH-') ||
             name.includes('papier') || name.includes('doucy') ||
             name.includes('serviette') || name.includes('ouate') || name.includes('bobine');
    }
    return true;
  }, [scope]);

  // ── État local ───────────────────────────────────────────────────────────
  const [configVisible,    setConfigVisible]    = React.useState(false);
  const [scenariosVisible, setScenariosVisible] = React.useState(false);
  const [config, setConfig] = React.useState<any>({
    horizon_days:   '90',
    article_filter: 'ALL',
    site_id:        '',
  });

  // ── Scénarios ────────────────────────────────────────────────────────────
  const { data: scenarios = [] } = useMRPScenarios();
  const saveScenario = useSaveMRPScenario();
  const [saveSuccess, setSaveSuccess] = React.useState(false);

  // ── KPI dynamiques ───────────────────────────────────────────────────────
  const [lastSessionMeta, setLastSessionMeta] = React.useState<{
    calculatedAt:  Date | null;
    minutesAgo:    number;
    totalArticles: number;
    nbUrgent:      number;
  }>({ calculatedAt: null, minutesAgo: 0, totalArticles: 0, nbUrgent: 0 });

  // Rafraîchit le "il y a Xmin" chaque minute
  React.useEffect(() => {
    const interval = setInterval(() => {
      setLastSessionMeta(prev => prev.calculatedAt
        ? { ...prev, minutesAgo: Math.round((Date.now() - prev.calculatedAt.getTime()) / 60000) }
        : prev
      );
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Charge la dernière session au montage
  React.useEffect(() => {
    if (!supabase) return;
    supabase
      .from('mrp_last_session_summary')
      .select('*')
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const calcDate = new Date(data.calculated_at);
        setLastSessionMeta({
          calculatedAt:  calcDate,
          minutesAgo:    Math.round((Date.now() - calcDate.getTime()) / 60000),
          totalArticles: data.total_articles ?? 0,
          nbUrgent:      (data.nb_rupture ?? 0) + (data.nb_urgent ?? 0),
        });
      });
  }, []);

  // ── Persistance des résultats en base (mrp_suggestions) ─────────────────
  const persistResults = React.useCallback(async (
    mrpResults: MRPResult[],
    sessionId: string,
  ) => {
    if (!supabase || mrpResults.length === 0) return;
    const rows = mrpResults.map(r => ({
      session_id:              sessionId,
      calculated_by:           profile?.id ?? null,
      article_id:              r.id,
      article_code:            r.code,
      article_name:            r.name,
      article_type:            r.type as 'MP' | 'PF' | 'EMB',
      stock_libere:            r.stock,
      besoins_bruts:           r.needs,
      besoins_nets:            r.net,
      commandes_cours:         r.incomingOrders,
      safety_stock:            r.safety,
      action:                  r.action,
      priority:                r.priority,
      manufacturing_lead_time: r.manufacturingLeadTime,
      supplier_lead_time:      r.supplierLeadTime,
      total_lead_time:         r.totalLeadTime,
      recommended_order_date:  r.recommendedOrderDate ?? null,
      source_products:         r.sourceProducts ? JSON.stringify(r.sourceProducts) : null,
    }));

    // Upsert par lots de 100 pour éviter les timeouts
    for (let i = 0; i < rows.length; i += 100) {
      await supabase.from('mrp_suggestions').insert(rows.slice(i, i + 100));
    }

    // Mise à jour KPI
    const now = new Date();
    const nbUrgent = mrpResults.filter(r =>
      r.action === 'RUPTURE_RISQUE' || r.action === 'COMMANDE_URGENTE'
    ).length;
    setLastSessionMeta({
      calculatedAt:  now,
      minutesAgo:    0,
      totalArticles: mrpResults.length,
      nbUrgent,
    });
    queryClient.invalidateQueries({ queryKey: ['mrp_last_session_summary'] });
  }, [profile?.id, queryClient]);

  // ── Lancement MRP ────────────────────────────────────────────────────────
  const handleLaunch = async () => {
    setConfigVisible(false);
    const sessionId = crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const freshResults = await runMRP({ demand_change: config.demand_change });
    if (freshResults.length > 0) await persistResults(freshResults, sessionId);
  };

  const handleSaveScenario = async () => {
    if (!config.scenario_name) return;
    const sessionId = crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const freshResults = await runMRP({ demand_change: config.demand_change });
    if (freshResults.length === 0) return;
    await persistResults(freshResults, sessionId);
    saveScenario.mutate(
      {
        name:           config.scenario_name,
        description:    config.scenario_desc || '',
        horizon_days:   parseInt(config.horizon_days) || 90,
        article_filter: config.article_filter,
        site_id:        config.site_id || undefined,
        demand_change:  parseFloat(config.demand_change) || undefined,
        results:        freshResults,
      },
      {
        onSuccess: () => {
          setSaveSuccess(true);
          setTimeout(() => { setSaveSuccess(false); setConfigVisible(false); }, 1500);
        },
      },
    );
  };

  // ── Modale DA depuis MRP ─────────────────────────────────────────────────
  const [daModalVisible,    setDaModalVisible]    = React.useState(false);
  const [daForm,            setDaForm]            = React.useState<any>({});
  const [daSaving,          setDaSaving]          = React.useState(false);
  const [daSuccess,         setDaSuccess]         = React.useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = React.useState<MRPResult | null>(null);

  const handleOpenDaModal = (item: MRPResult) => {
    if (item.action === 'RAS') return;
    setSelectedSuggestion(item);
    setDaForm({
      article_id:    item.id,
      article_code:  item.code,
      article_name:  item.name,
      qty_requested: String(Math.ceil(item.net)),
      unit:          'kg',
      notes:         `Généré par MRP — Besoin net : ${item.net.toLocaleString()} kg · Action : ${item.action}`,
      supplier_id:   '',
      amount_mga:    '',
    });
    setDaModalVisible(true);
  };

  const handleSaveDA = async () => {
    if (!supabase || !daForm.article_id) return;
    setDaSaving(true);
    try {
      const year = new Date().getFullYear();
      let code = `DA-LOC-${year}-MRP`;
      try { code = await getNextCode('DA-LOC', 'da_local', 'code'); } catch {}

      const values = {
        code,
        article_id:    daForm.article_id,
        supplier_id:   daForm.supplier_id || null,
        qty_requested: parseFloat(daForm.qty_requested) || 0,
        unit:          daForm.unit || 'kg',
        amount_mga:    parseFloat(daForm.amount_mga) || 0,
        current_step:  'SAISIE',
        status:        'EN_COURS',
        request_date:  new Date().toISOString().split('T')[0],
        notes:         daForm.notes || null,
        requested_by:  profile?.id || null,
      };

      const { data: inserted, error } = await supabase
        .from('da_local')
        .insert(values)
        .select('id')
        .single();

      if (error) throw error;

      // Marquer la suggestion comme convertie
      if (selectedSuggestion && inserted) {
        await supabase
          .from('mrp_suggestions')
          .update({ suggestion_status: 'CONVERTED', da_local_id: inserted.id })
          .eq('article_id', selectedSuggestion.id)
          .eq('suggestion_status', 'PENDING');
      }

      // Notification RACH + ADMIN
      notify.mutate({
        to_role: 'RACH',
        subject: 'DA créée depuis MRP',
        message: `DA créée automatiquement depuis le calcul MRP : ${code} — ${daForm.article_name} — ${values.qty_requested} ${values.unit}`,
        type: 'internal',
        category: 'PURCHASING',
        metadata: { category: 'PURCHASING', screen: 'MRP', source: 'mrp_suggestion' },
      });

      queryClient.invalidateQueries({ queryKey: ['da_local'] });
      setDaSuccess(true);
      setTimeout(() => {
        setDaSuccess(false);
        setDaModalVisible(false);
        setSelectedSuggestion(null);
      }, 1800);
    } catch (err: any) {
      console.error('Erreur création DA depuis MRP:', err);
    } finally {
      setDaSaving(false);
    }
  };

  // ── Résultats filtrés ────────────────────────────────────────────────────
  const filteredResults = React.useMemo(() => {
    if (results.length === 0) return [];
    return results
      .filter(r => filterByScope(r.code, r.name))
      .filter(r => {
        if (config.article_filter === 'MP')    return r.type === 'MP' || r.code?.startsWith('MP-');
        if (config.article_filter === 'PF')    return r.type === 'PF' || r.code?.startsWith('PF-');
        if (config.article_filter === 'MP_PF') return r.type === 'MP' || r.type === 'PF';
        return true;
      });
  }, [results, filterByScope, config.article_filter]);

  const criticalItems = React.useMemo(
    () => filteredResults.filter(r => r.action === 'RUPTURE_RISQUE' || r.action === 'COMMANDE_URGENTE'),
    [filteredResults],
  );
  const mpCritical = criticalItems.filter(r =>
    r.type === 'MP' || r.code?.startsWith('MP-') ||
    r.code?.startsWith('SPAH-') || r.code?.startsWith('SICD-')
  );
  const pfCritical = criticalItems.filter(r => r.type === 'PF' || r.code?.startsWith('PF-'));

  // ── KPI display values ───────────────────────────────────────────────────
  const kpiTotal  = status === 'COMPLETED' ? filteredResults.length : lastSessionMeta.totalArticles;
  const kpiUrgent = status === 'COMPLETED' ? criticalItems.length   : lastSessionMeta.nbUrgent;
  const kpiAgo    = status === 'COMPLETED'
    ? 'À l\'instant'
    : (lastSessionMeta.calculatedAt ? formatAgo(lastSessionMeta.minutesAgo) : '—');

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <AnimatedPage>
      <ScrollView style={s.container} contentContainerStyle={s.content}>

        {/* ── En-tête ─────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View>
            <Text style={s.title}>{t('mrp_engine_title')}</Text>
            <Text style={s.subTitle}>{t('mrp_engine_sub')}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <ActionButton
              label="Scénarios"
              icon="folder-multiple-outline"
              variant="secondary"
              onPress={() => setScenariosVisible(true)}
            />
            {canPerformAction('run_mrp') && (
              <ActionButton
                label={calculating ? t('calculating') : t('run_full_mrp')}
                icon="play-circle-outline"
                variant="primary"
                onPress={() => setConfigVisible(true)}
                disabled={calculating}
              />
            )}
          </View>
        </View>

        {/* ── KPI cards — dynamiques ──────────────────────────────────── */}
        <View style={[s.grid, isMobile && { flexDirection: 'column' }]}>
          <KpiCard
            label={t('articles_to_process')}
            value={kpiTotal > 0 ? String(kpiTotal) : '—'}
            sub={kpiTotal > 0 ? 'Articles calculés (dernier run)' : 'Aucun calcul effectué'}
          />
          <KpiCard
            label={t('last_calc')}
            value={kpiAgo}
            sub={status === 'COMPLETED' ? t('success') : (lastSessionMeta.calculatedAt ? 'Dernier calcul réussi' : 'Jamais calculé')}
            color={lastSessionMeta.calculatedAt ? C.ok : '#ADB5BD'}
          />
          <KpiCard
            label={t('mrp_alerts')}
            value={kpiUrgent > 0 ? String(kpiUrgent) : '0'}
            sub={kpiUrgent > 0 ? t('immediate_action') : 'Aucune alerte critique'}
            color={kpiUrgent > 0 ? C.err : C.ok}
          />
        </View>

        {/* ── Worker card ─────────────────────────────────────────────── */}
        <View style={s.workerCard}>
          <View style={s.workerHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <MaterialCommunityIcons
                name="server-network"
                size={24}
                color={calculating ? C.info : '#ADB5BD'}
              />
              <View>
                <Text style={s.workerTitle}>Worker MRP #01</Text>
                <Text style={s.workerStatus}>
                  {status === 'RUNNING'   ? t('worker_status_running')   :
                   status === 'COMPLETED' ? t('worker_status_completed') : t('worker_status_idle')}
                </Text>
              </View>
            </View>
            {calculating && <ActivityIndicator size="small" color={C.info} />}
          </View>

          {calculating && (
            <View style={s.progressSection}>
              <View style={s.progressBarBg}>
                <View style={[s.progressBarFill, { width: `${progress * 100}%` }]} />
              </View>
              <View style={s.progressMeta}>
                <Text style={s.progressText}>{Math.round(progress * 100)}% articles calculés</Text>
                <Text style={s.progressTime}>Temps estimé : {'<'} 30s</Text>
              </View>
            </View>
          )}

          {status === 'COMPLETED' && (
            <View style={s.successMsg}>
              <MaterialCommunityIcons name="check-decagram" size={20} color={C.ok} />
              <Text style={s.successText}>
                {filteredResults.length} article(s) calculés · {criticalItems.length} alerte(s) ·
                Résultats persistés en base.
              </Text>
            </View>
          )}

          {!calculating && config.horizon_days && (
            <View style={s.configSummary}>
              <MaterialCommunityIcons name="tune" size={16} color="#ADB5BD" />
              <Text style={s.configText}>
                Horizon : {config.horizon_days}j ·
                Articles : {config.article_filter === 'ALL' ? 'Tous' : config.article_filter} ·
                {config.site_id
                  ? ` Site : ${sites.find(s => s.id === config.site_id)?.name}`
                  : ' Tous les sites'}
              </Text>
            </View>
          )}
        </View>

        {/* ── Résultats MRP ───────────────────────────────────────────── */}
        {filteredResults.length > 0 && status !== 'RUNNING' && (
          <View style={s.resultsSection}>

            {/* Bannière alerte */}
            {criticalItems.length > 0 && (
              <View style={s.mrpWarningBanner}>
                <MaterialCommunityIcons name="alert-circle-outline" size={24} color="#FFF" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFF' }}>
                    ALERTE MRP : {criticalItems.length} article(s) à approvisionner d'urgence !
                  </Text>
                  <Text style={{ fontSize: 12, color: '#F1F3F5', marginTop: 2 }}>
                    {mpCritical.length > 0 ? `${mpCritical.length} Matière(s) première(s)` : ''}
                    {mpCritical.length > 0 && pfCritical.length > 0 ? ' · ' : ''}
                    {pfCritical.length > 0 ? `${pfCritical.length} Produit(s) fini(s)` : ''}
                    {mpCritical.length === 0 && pfCritical.length === 0
                      ? 'Des risques de rupture identifiés pour certains composants.' : ''}
                    {'  '}
                    <Text style={{ fontWeight: '700', textDecorationLine: 'underline' }}>
                      Tapez une ligne pour créer une DA
                    </Text>
                  </Text>
                </View>
              </View>
            )}

            <SectionTitle>{t('mrp_results')}</SectionTitle>

            {/* Hint tap-to-DA */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 4 }}>
              <MaterialCommunityIcons name="gesture-tap" size={14} color="#ADB5BD" />
              <Text style={{ fontSize: 11, color: '#ADB5BD' }}>
                Tapez une ligne RECOMMANDER / URGENTE pour créer une Demande d'Achat
              </Text>
            </View>

            <View style={s.tableContainer}>
              <DataTable
                data={filteredResults}
                columns={[
                  { key: 'code', label: t('code'), flex: 0.7 },
                  {
                    key: 'type', label: 'Type', flex: 0.45,
                    render: (item: any) => (
                      <View style={{
                        paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6,
                        backgroundColor: item.type === 'PF' ? '#EFF6FF' : item.type === 'MP' ? '#F0FFF4' : '#F3F4F6',
                        alignSelf: 'flex-start',
                      }}>
                        <Text style={{
                          fontSize: 10, fontWeight: '800',
                          color: item.type === 'PF' ? '#1D4ED8' : item.type === 'MP' ? '#15803D' : '#374151',
                        }}>{item.type || '—'}</Text>
                      </View>
                    ),
                  },
                  { key: 'name', label: t('articles'), flex: 1.5 },
                  {
                    key: 'stock', label: t('stocks'), flex: 0.8,
                    render: (item: any) => <Text style={s.tdData}>{item.stock.toLocaleString()}</Text>,
                  },
                  {
                    key: 'needs', label: 'Besoins bruts', flex: 0.8,
                    render: (item: any) => <Text style={s.tdData}>{item.needs.toLocaleString()}</Text>,
                  },
                  {
                    key: 'net', label: 'Besoins nets', flex: 0.8,
                    render: (item: any) => (
                      <Text style={[s.tdData, item.net > 0 && { color: C.err, fontWeight: '800' }]}>
                        {item.net.toLocaleString()}
                      </Text>
                    ),
                  },
                  {
                    key: 'totalLeadTime', label: 'Délai', flex: 0.7,
                    render: (item: any) => (
                      <View>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#1A1A1A' }}>
                          {item.totalLeadTime}j
                        </Text>
                        <Text style={{ fontSize: 10, color: '#ADB5BD' }}>
                          Fab {item.manufacturingLeadTime}j / Fourn {item.supplierLeadTime}j
                        </Text>
                      </View>
                    ),
                  },
                  {
                    key: 'action', label: 'Action recommandée', flex: 1.8,
                    render: (item: any) => (
                      <View style={{ flexDirection: 'column', gap: 4 }}>
                        <Badge
                          label={item.action}
                          color={
                            item.action === 'RAS' ? C.ok :
                            item.action.includes('URGENT') || item.action.includes('RUPTURE') ? C.err : C.gold
                          }
                        />
                        {item.recommendedOrderDate && (
                          <Text style={{ fontSize: 10, color: '#6C757D' }}>
                            Commander avant le {item.recommendedOrderDate}
                          </Text>
                        )}
                        {item.action !== 'RAS' && (
                          <TouchableOpacity
                            style={s.createDaBtn}
                            onPress={() => handleOpenDaModal(item)}
                          >
                            <MaterialCommunityIcons name="plus-circle-outline" size={12} color={C.info} />
                            <Text style={s.createDaBtnText}>Créer DA</Text>
                          </TouchableOpacity>
                        )}
                        {item.sourceProducts && item.sourceProducts.length > 0 && (
                          <View style={{ marginTop: 2 }}>
                            <Text style={{ fontSize: 9, color: '#ADB5BD', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                              Généré par :
                            </Text>
                            {item.sourceProducts.slice(0, 2).map((sp: any, i: number) => (
                              <Text key={i} style={{ fontSize: 9, color: '#6C757D' }}>
                                {sp.productCode} · {sp.qty.toLocaleString()} {item.type === 'MP' ? 'kg' : 'u'}
                              </Text>
                            ))}
                            {item.sourceProducts.length > 2 && (
                              <Text style={{ fontSize: 9, color: '#ADB5BD' }}>
                                +{item.sourceProducts.length - 2} autre(s)
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                    ),
                  },
                ]}
                onRowPress={(item: any) => {
                  if (item.action !== 'RAS') handleOpenDaModal(item);
                }}
              />
            </View>
          </View>
        )}

        {/* ── Historique audit ────────────────────────────────────────── */}
        <View style={s.historySection}>
          <Text style={s.historyTitle}>{t('audit_log_calc')}</Text>
          {lastSessionMeta.calculatedAt ? (
            <View style={s.auditRow}>
              <Text style={s.auditDate}>
                {lastSessionMeta.calculatedAt.toLocaleDateString('fr-FR')},{' '}
                {lastSessionMeta.calculatedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <Text style={s.auditUser}>{profile?.full_name || 'Utilisateur'}</Text>
              <Text style={s.auditAction}>
                Calcul complet ({lastSessionMeta.totalArticles} art.)
              </Text>
              <Text style={s.auditResult}>OK</Text>
            </View>
          ) : (
            <View style={s.auditRow}>
              <Text style={{ fontSize: 13, color: '#ADB5BD', fontStyle: 'italic' }}>
                Aucun calcul MRP enregistré. Lancez un premier calcul.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Modale Scénarios ─────────────────────────────────────────────── */}
      <FormModal
        visible={scenariosVisible}
        title="Scénarios What-If MRP"
        onClose={() => setScenariosVisible(false)}
        onSave={() => setScenariosVisible(false)}
        hideSaveButton
      >
        {scenarios.length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <MaterialCommunityIcons name="database-search-outline" size={48} color="#CCC" />
            <Text style={{ marginTop: 12, color: '#888', textAlign: 'center' }}>
              Aucun scénario sauvegardé.{'\n'}Lancez un calcul MRP puis sauvegardez-le.
            </Text>
          </View>
        ) : (
          scenarios.map((sc: any) => (
            <TouchableOpacity
              key={sc.id}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                padding: 16, backgroundColor: '#F8F9FA', borderRadius: 8,
                marginBottom: 8, borderWidth: 1, borderColor: '#E9ECEF',
              }}
              onPress={() => {
                setConfig({
                  horizon_days:   String(sc.horizon_days || 90),
                  article_filter: sc.article_filter || 'ALL',
                  site_id:        sc.site_id || '',
                  scenario_name:  sc.name,
                  demand_change:  sc.demand_change ? String(sc.demand_change) : '',
                });
                setScenariosVisible(false);
                runMRP({ demand_change: sc.demand_change ? String(sc.demand_change) : undefined });
              }}
            >
              <MaterialCommunityIcons name="file-chart-outline" size={24} color={C.info} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: '#1A1A1A' }}>{sc.name}</Text>
                <Text style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {sc.horizon_days}j · {sc.article_filter} ·{' '}
                  {sc.demand_change ? `Variation : ${sc.demand_change}%` : 'Demande normale'}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </FormModal>

      {/* ── Modale Config MRP ────────────────────────────────────────────── */}
      <FormModal
        visible={configVisible}
        title={t('mrp_config_title')}
        onClose={() => setConfigVisible(false)}
        onSave={handleLaunch}
        saveLabel={t('run_full_mrp')}
        loading={calculating}
      >
        <View style={{ padding: 12, backgroundColor: '#FFF9E6', borderRadius: 8, borderWidth: 1, borderColor: '#FFC107', marginBottom: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <MaterialCommunityIcons name="alert-outline" size={18} color="#856404" style={{ marginTop: 1 }} />
          <Text style={{ fontSize: 13, color: '#856404', fontWeight: '600', flex: 1 }}>
            {t('mrp_config_warn')}
          </Text>
        </View>
        <FormInput
          label={t('horizon_days')}
          value={config.horizon_days}
          onChangeText={(v: string) => setConfig({ ...config, horizon_days: v })}
          keyboardType="numeric"
          placeholder="ex: 90"
        />
        <FormSelect
          label={t('article_filter')}
          value={config.article_filter}
          options={[
            { label: t('all_active_articles'), value: 'ALL' },
            { label: t('mp_only'),             value: 'MP' },
            { label: t('pf_only'),             value: 'PF' },
            { label: 'Matières & Produits finis', value: 'MP_PF' },
          ]}
          onSelect={(v: string) => setConfig({ ...config, article_filter: v })}
        />
        <FormSelect
          label={t('site_prod')}
          value={config.site_id}
          options={[
            { label: t('all_sites'), value: '' },
            ...sites.map(s => ({ label: s.name, value: s.id })),
          ]}
          onSelect={(v: string) => setConfig({ ...config, site_id: v })}
        />
        <FormInput
          label="Variation demande (%)"
          value={config.demand_change || ''}
          onChangeText={(v: string) => setConfig({ ...config, demand_change: v })}
          keyboardType="numeric"
          placeholder="ex: 20 (pour +20%)"
        />

        {/* Section sauvegarde scénario */}
        <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: '#E9ECEF', paddingTop: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#6C757D', marginBottom: 8 }}>
            SAUVEGARDER LE SCÉNARIO
          </Text>
          <Text style={{ fontSize: 11, color: '#ADB5BD', marginBottom: 10 }}>
            Remplissez le nom pour activer "Lancer &amp; Sauvegarder". Sinon, utilisez "Lancer le calcul".
          </Text>
          <FormInput
            label="Nom du scénario"
            value={config.scenario_name || ''}
            onChangeText={(v: string) => setConfig({ ...config, scenario_name: v })}
            placeholder="Mon scénario"
          />
          <FormInput
            label="Description"
            value={config.scenario_desc || ''}
            onChangeText={(v: string) => setConfig({ ...config, scenario_desc: v })}
            placeholder="Optionnel"
          />
          {saveScenario.isError && (
            <View style={{ padding: 10, backgroundColor: '#FFF0F0', borderRadius: 8, borderWidth: 1, borderColor: '#DC3545', marginTop: 8, flexDirection: 'row', gap: 8 }}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#DC3545" />
              <Text style={{ fontSize: 12, color: '#DC3545', flex: 1 }}>
                Erreur de sauvegarde : {(saveScenario.error as any)?.message || 'Vérifiez votre connexion.'}
              </Text>
            </View>
          )}
          {saveSuccess && (
            <View style={{ padding: 10, backgroundColor: '#F0FFF4', borderRadius: 8, borderWidth: 1, borderColor: '#2F9E44', marginTop: 8, flexDirection: 'row', gap: 8 }}>
              <MaterialCommunityIcons name="check-circle-outline" size={16} color="#2F9E44" />
              <Text style={{ fontSize: 12, color: '#2F9E44', flex: 1 }}>Scénario sauvegardé avec succès !</Text>
            </View>
          )}
          <View style={{ marginTop: 8 }}>
            <ActionButton
              label={saveScenario.isPending ? 'Sauvegarde...' : 'Lancer & Sauvegarder'}
              icon="content-save-outline"
              variant="secondary"
              onPress={handleSaveScenario}
              disabled={calculating || saveScenario.isPending || !config.scenario_name}
            />
          </View>
        </View>
      </FormModal>

      {/* ── Modale Créer DA depuis MRP ───────────────────────────────────── */}
      <FormModal
        visible={daModalVisible}
        title="Créer une Demande d'Achat"
        onClose={() => { setDaModalVisible(false); setDaSuccess(false); }}
        onSave={handleSaveDA}
        saveLabel={daSaving ? 'Création...' : 'Créer la DA'}
        loading={daSaving}
      >
        {/* Contexte MRP */}
        {selectedSuggestion && (
          <View style={s.daContextBox}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={s.daContextCode}>{selectedSuggestion.code}</Text>
              <Badge
                label={selectedSuggestion.action}
                color={selectedSuggestion.action.includes('RUPTURE') ? C.err : C.gold}
              />
            </View>
            <Text style={s.daContextName}>{selectedSuggestion.name}</Text>
            <View style={s.daContextRow}>
              <View style={s.daContextStat}>
                <Text style={s.daContextStatLabel}>Stock libéré</Text>
                <Text style={s.daContextStatValue}>{selectedSuggestion.stock.toLocaleString()} kg</Text>
              </View>
              <View style={s.daContextStat}>
                <Text style={s.daContextStatLabel}>Besoins bruts</Text>
                <Text style={s.daContextStatValue}>{selectedSuggestion.needs.toLocaleString()} kg</Text>
              </View>
              <View style={s.daContextStat}>
                <Text style={[s.daContextStatLabel, { color: C.err }]}>Besoins nets</Text>
                <Text style={[s.daContextStatValue, { color: C.err }]}>{selectedSuggestion.net.toLocaleString()} kg</Text>
              </View>
            </View>
            {selectedSuggestion.recommendedOrderDate && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                <MaterialCommunityIcons name="calendar-clock" size={14} color="#856404" />
                <Text style={{ fontSize: 12, color: '#856404', fontWeight: '600' }}>
                  Commander avant le {selectedSuggestion.recommendedOrderDate}
                  {' '}(délai fournisseur : {selectedSuggestion.supplierLeadTime}j)
                </Text>
              </View>
            )}
          </View>
        )}

        <FormInput
          label="Quantité à commander (kg)"
          value={daForm.qty_requested || ''}
          onChangeText={(v: string) => setDaForm({ ...daForm, qty_requested: v })}
          keyboardType="numeric"
          placeholder="ex: 5000"
        />
        <FormSelect
          label="Fournisseur"
          value={daForm.supplier_id || ''}
          options={[
            { label: '— Sélectionner un fournisseur —', value: '' },
            ...suppliers.map((s: any) => ({ label: s.name, value: s.id })),
          ]}
          onSelect={(v: string) => setDaForm({ ...daForm, supplier_id: v })}
        />
        <FormSelect
          label="Unité"
          value={daForm.unit || 'kg'}
          options={[
            { label: 'kg', value: 'kg' },
            { label: 'L',  value: 'L' },
            { label: 'u',  value: 'u' },
          ]}
          onSelect={(v: string) => setDaForm({ ...daForm, unit: v })}
        />
        <FormInput
          label="Montant estimé (MGA)"
          value={daForm.amount_mga || ''}
          onChangeText={(v: string) => setDaForm({ ...daForm, amount_mga: v })}
          keyboardType="numeric"
          placeholder="Optionnel"
        />
        <FormInput
          label="Notes"
          value={daForm.notes || ''}
          onChangeText={(v: string) => setDaForm({ ...daForm, notes: v })}
          placeholder="Contexte MRP pré-rempli"
        />

        {daSuccess && (
          <View style={{ padding: 12, backgroundColor: '#F0FFF4', borderRadius: 8, borderWidth: 1, borderColor: '#2F9E44', marginTop: 12, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <MaterialCommunityIcons name="check-circle-outline" size={18} color="#2F9E44" />
            <Text style={{ fontSize: 13, color: '#2F9E44', fontWeight: '700', flex: 1 }}>
              DA créée avec succès ! Visible dans l'écran Achats Local.
            </Text>
          </View>
        )}
      </FormModal>
    </AnimatedPage>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content:   { padding: 24 },
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  title:     { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },
  subTitle:  { fontSize: 13, color: '#6C757D', marginTop: 4 },
  grid:      { flexDirection: 'row', gap: 16, marginBottom: 32 },

  workerCard:   { backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#E9ECEF', padding: 24, marginBottom: 32 },
  workerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  workerTitle:  { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  workerStatus: { fontSize: 13, color: '#6C757D', marginTop: 2 },

  progressSection: { marginTop: 10 },
  progressBarBg:   { height: 8, backgroundColor: '#F1F3F5', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: C.info },
  progressMeta:    { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  progressText:    { fontSize: 13, fontWeight: '600', color: '#1A1A1A' },
  progressTime:    { fontSize: 12, color: '#ADB5BD' },

  successMsg:  { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F0FFF4', padding: 16, borderRadius: 12, marginTop: 10 },
  successText: { color: '#2F9E44', fontSize: 14, fontWeight: '600', flex: 1 },

  configSummary: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, padding: 12, backgroundColor: '#F8F9FA', borderRadius: 8 },
  configText:    { fontSize: 12, color: '#6C757D', flex: 1 },

  resultsSection:   { marginTop: 8, marginBottom: 32 },
  tableContainer:   { height: 420, backgroundColor: '#FFF', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E9ECEF', marginTop: 12 },
  mrpWarningBanner: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: '#DC3545', padding: 20, borderRadius: 12, marginBottom: 20 },

  tdData: { fontSize: 13, color: '#1A1A1A', fontWeight: '600', fontFamily: Platform.OS === 'web' ? 'JetBrains Mono' : 'monospace' },

  createDaBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: C.info, alignSelf: 'flex-start' },
  createDaBtnText: { fontSize: 11, color: C.info, fontWeight: '700' },

  historySection: { marginTop: 8 },
  historyTitle:   { fontSize: 12, fontWeight: '800', color: '#ADB5BD', letterSpacing: 1, marginBottom: 16 },
  auditRow:       { flexDirection: 'row', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E9ECEF', alignItems: 'center', gap: 20 },
  auditDate:      { width: 120, fontSize: 13, color: '#6C757D' },
  auditUser:      { width: 150, fontSize: 13, fontWeight: '600', color: '#1A1A1A' },
  auditAction:    { flex: 1, fontSize: 13, color: '#495057' },
  auditResult:    { width: 80, fontSize: 12, color: C.ok, fontWeight: '700', textAlign: 'right' },

  // Modale DA — contexte MRP
  daContextBox:       { backgroundColor: '#F8F9FA', borderRadius: 12, borderWidth: 1, borderColor: '#E9ECEF', padding: 16, marginBottom: 16 },
  daContextCode:      { fontSize: 13, fontWeight: '800', color: '#1A1A1A', fontFamily: Platform.OS === 'web' ? 'JetBrains Mono' : 'monospace' },
  daContextName:      { fontSize: 14, fontWeight: '600', color: '#495057', marginBottom: 12 },
  daContextRow:       { flexDirection: 'row', gap: 12 },
  daContextStat:      { flex: 1, backgroundColor: '#FFF', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E9ECEF', alignItems: 'center' },
  daContextStatLabel: { fontSize: 10, color: '#ADB5BD', fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  daContextStatValue: { fontSize: 16, fontWeight: '800', color: '#1A1A1A' },
});