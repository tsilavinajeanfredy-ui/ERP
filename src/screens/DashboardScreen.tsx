import * as React from 'react';
import { ScrollView, StyleSheet, Text, View, Platform, useWindowDimensions, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, KpiCard, ActionButton, AnimatedPage, ExportOverlay, SectionTitle, Badge, FormModal } from '../components/Ui';
import {
  useExport, useLots, useInstruments, useFnc, useFcqDossiers, useProductionOrders,
  useUserProfile, useStockAlerts, useTRS, useDaLocal, useDaImport,
  useRhPersonnel, useRhSections, useRhAffectations,
  useMaintenanceTasks, useSupplierClassificationView,
  useStockTransfers, getArticleUnitValue, useForecasts, useDashboardPreferences,
} from '../lib/hooks';
import { useRealMRP } from '../lib/mrp';
import { useTranslation } from '../lib/i18n';
import AnimatedBar from '../components/AnimatedBar';

type DrilldownKey = 'stock' | 'qualite' | 'mrp' | 'quarantaine' | 'production' | 'instruments' | 'fnc' | 'stockalerts' | null;

// ── Styles partagés pour le bloc PDP ────────────────────────────────────────
const pdpBadgeStyle = (pct: number): object => ({
  paddingHorizontal: 12,
  paddingVertical: 4,
  borderRadius: 20,
  backgroundColor: pct >= 90 ? C.ok : pct >= 70 ? C.gold : C.err,
});
const pdpBarBg: object = { height: 10, backgroundColor: '#E9ECEF', borderRadius: 5, overflow: 'hidden', marginBottom: 6 };
const pdpBarFill: object = { height: 10, borderRadius: 5 };
const pdpBarSub: object = { fontSize: 11, color: '#6C757D', fontWeight: '600' };

// ─── Composant partagé BackButton ──────────────────────────────────────────
function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={s.backBtn} onPress={onPress}>
      <MaterialCommunityIcons name="arrow-left" size={18} color={C.primary} />
      <Text style={s.backBtnText}>Retour au tableau de bord</Text>
    </TouchableOpacity>
  );
}

// ─── Personnalisation du tableau de bord (M7) ───────────────────────────────
function useDashboardCustomizer(profile: any, sections: { key: string; label: string }[]) {
  const userId = profile?.id;
  const { hiddenSections, save } = useDashboardPreferences(userId);
  const [visible, setVisible] = React.useState(false);
  const [draft, setDraft] = React.useState<string[]>([]);
  const hiddenKey = hiddenSections.join(',');
  React.useEffect(() => { setDraft(hiddenSections); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [hiddenKey]);

  const hiddenSet = React.useMemo(() => new Set(hiddenSections), [hiddenKey]);
  const isHidden = (key: string) => hiddenSet.has(key);
  const toggle = (key: string) => setDraft((d) => (d.includes(key) ? d.filter((k) => k !== key) : [...d, key]));

  const button = (
    <ActionButton label="Personnaliser" icon="cog" variant="secondary" onPress={() => { setDraft(hiddenSections); setVisible(true); }} />
  );

  const modal = (
    <FormModal
      visible={visible}
      title="Personnaliser le tableau de bord"
      onClose={() => setVisible(false)}
      onSave={() => { save.mutate({ hidden_sections: draft }); setVisible(false); }}
      loading={save.isPending}
    >
      <Text style={{ fontSize: 12, color: '#6C757D', marginBottom: 12 }}>
        Choisissez les sections à afficher sur votre tableau de bord. Vos préférences sont enregistrées par utilisateur.
      </Text>
      {sections.map((sec) => {
        const hidden = draft.includes(sec.key);
        return (
          <TouchableOpacity
            key={sec.key}
            onPress={() => toggle(sec.key)}
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F3F5', gap: 12 }}
          >
            <MaterialCommunityIcons name={hidden ? 'checkbox-blank-outline' : 'checkbox-marked'} size={22} color={hidden ? '#ADB5BD' : C.ok} />
            <Text style={{ fontSize: 14, color: '#1A1A1A', fontWeight: '600' }}>{sec.label}</Text>
          </TouchableOpacity>
        );
      })}
    </FormModal>
  );

  return { isHidden, button, modal };
}

// ─── Header commun ──────────────────────────────────────────────────────────
function DashboardHeader({
  title, subtitle, isMobile, actions,
}: { title: string; subtitle: string; isMobile: boolean; actions?: React.ReactNode }) {
  return (
    <View style={[s.headerRow, isMobile && { flexDirection: 'column', alignItems: 'flex-start', gap: 16 }]}>
      <View>
        <Text style={s.title}>{title}</Text>
        <Text style={s.subTitle}>{subtitle}</Text>
      </View>
      {actions && <View style={{ flexDirection: 'row', gap: 12 }}>{actions}</View>}
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD RH
// ════════════════════════════════════════════════════════════════════════════
function DashboardRH({ isMobile, dateStr }: { isMobile: boolean; dateStr: string }) {
  const { data: personnel = [], isLoading: rhLoading } = useRhPersonnel();
  const { data: sections = [] } = useRhSections();
  const { data: affectations = [] } = useRhAffectations();

  const totalPersonnel = personnel.length;
  const actifs = personnel.filter(p => p.actif).length;
  const inactifs = totalPersonnel - actifs;
  const affEnAttente = affectations.filter(a => a.statut === 'EN_ATTENTE').length;
  const affApprouvees = affectations.filter(a => a.statut === 'APPROUVE').length;

  // Heures supp
  const totalHeursSup = personnel.reduce((acc, p) => acc + (p.heures_supp_derniere_semaine || 0), 0);
  const avgHeursSup = totalPersonnel > 0 ? (totalHeursSup / totalPersonnel).toFixed(1) : '0';

  // Répartition par section
  const bySect: Record<string, number> = {};
  personnel.forEach(p => {
    const nom = p.section_nom || 'N/A';
    bySect[nom] = (bySect[nom] || 0) + 1;
  });
  const topSections = Object.entries(bySect).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <AnimatedPage>
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <DashboardHeader
          title="Tableau de Bord — Ressources Humaines"
          subtitle={`${dateStr} · SIPROMAD POLE INDUSTRIEL`}
          isMobile={isMobile}
        />

        {/* KPIs RH */}
        <View style={[s.grid, isMobile && { flexDirection: 'column' }]}>
          <KpiCard label="Effectif Total" value={String(totalPersonnel)} sub="Tous contrats" color={C.info} icon="account-group" loading={rhLoading} />
          <KpiCard label="Actifs" value={String(actifs)} sub="Présents" color={C.ok} icon="account-check" loading={rhLoading} />
          <KpiCard label="Inactifs / Absents" value={String(inactifs)} sub="Hors effectif actif" color={inactifs > 0 ? C.gold : C.ok} icon="account-off" loading={rhLoading} />
          <KpiCard label="Affectations en attente" value={String(affEnAttente)} sub="À approuver" color={affEnAttente > 0 ? C.err : C.ok} icon="account-arrow-right" loading={rhLoading} />
          <KpiCard label="Affectations approuvées" value={String(affApprouvees)} sub="En cours" color={C.info} icon="account-arrow-left" loading={rhLoading} />
          <KpiCard label="H. Supp moy / pers" value={`${avgHeursSup}h`} sub="Dernière semaine" color={C.gold} icon="clock-alert" loading={rhLoading} />
        </View>

        {/* Tableau personnel par section */}
        <View style={{ marginTop: 32 }}>
          <SectionTitle>Répartition par Section</SectionTitle>
          <View style={[s.mainGrid, isMobile && { flexDirection: 'column' }]}>
            <View style={[s.card, { flex: 2 }]}>
              <View style={s.tableHeader}>
                <Text style={s.tableHeaderCell}>SECTION</Text>
                <Text style={[s.tableHeaderCell, { textAlign: 'right' }]}>EFFECTIF</Text>
                <Text style={[s.tableHeaderCell, { textAlign: 'right' }]}>RÉPARTITION</Text>
              </View>
              {topSections.map(([nom, count]) => (
                <View key={nom} style={s.tableRow}>
                  <Text style={[s.tableCellCode, { flex: 2 }]}>{nom}</Text>
                  <Text style={[s.tableCellName, { textAlign: 'right' }]}>{count} pers.</Text>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <AnimatedBar value={totalPersonnel > 0 ? (count / totalPersonnel) * 100 : 0} color={C.info} />
                  </View>
                </View>
              ))}
            </View>

            {/* Demandes d'affectation récentes */}
            <View style={[s.card, { flex: 1 }]}>
              <Text style={s.cardTitle}>Affectations Récentes</Text>
              {affectations.slice(0, 6).map((a: any) => (
                <View key={a.id} style={s.alertItem}>
                  <MaterialCommunityIcons name="account-arrow-right" size={18} color={a.statut === 'EN_ATTENTE' ? C.gold : a.statut === 'APPROUVE' ? C.ok : C.err} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.alertTitle}>{a.section_demandeur} → {a.section_fournisseur}</Text>
                    <Text style={s.alertSub}>{a.nb_personnes} pers. · {a.date_debut?.slice(0, 10)}</Text>
                  </View>
                  <Badge label={a.statut} color={a.statut === 'EN_ATTENTE' ? C.gold : a.statut === 'APPROUVE' ? C.ok : C.err} />
                </View>
              ))}
              {affectations.length === 0 && <Text style={s.emptyText}>Aucune affectation enregistrée.</Text>}
            </View>
          </View>
        </View>

        {/* Liste personnel récent */}
        <View style={{ marginTop: 32 }}>
          <SectionTitle>Personnel — Dernière mise à jour</SectionTitle>
          <View style={s.card}>
            <View style={s.tableHeader}>
              <Text style={s.tableHeaderCell}>MATRICULE</Text>
              <Text style={s.tableHeaderCell}>NOM COMPLET</Text>
              <Text style={s.tableHeaderCell}>SECTION</Text>
              <Text style={[s.tableHeaderCell, { textAlign: 'right' }]}>H. SUPP</Text>
            </View>
            {personnel.slice(0, 10).map((p) => (
              <View key={p.id} style={s.tableRow}>
                <Text style={s.tableCellCode}>{p.matricule}</Text>
                <Text style={s.tableCellName} numberOfLines={1}>{p.nom_complet}</Text>
                <Text style={[s.tableCellName, { flex: 1, color: '#6C757D' }]} numberOfLines={1}>{p.section_nom}</Text>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Badge
                    label={`${p.heures_supp_derniere_semaine || 0}h`}
                    color={(p.heures_supp_derniere_semaine || 0) > 10 ? C.err : (p.heures_supp_derniere_semaine || 0) > 0 ? C.gold : C.ok}
                  />
                </View>
              </View>
            ))}
            {personnel.length === 0 && <Text style={s.emptyText}>Aucun personnel enregistré.</Text>}
          </View>
        </View>
      </ScrollView>
    </AnimatedPage>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD RPROD (+ RESPONSABLE SAVON, CORDE, etc.)
// ════════════════════════════════════════════════════════════════════════════
function DashboardRPROD({
  isMobile, dateStr, userScope, profile,
}: { isMobile: boolean; dateStr: string; userScope: string; profile: any }) {
  const { data: prodOrders = [], isPending: prodLoading } = useProductionOrders();
  const { data: lots = [], isPending: lotsLoading } = useLots();
  const { data: fncs = [] } = useFnc();
  const { data: maintenanceTasks = [] } = useMaintenanceTasks();
  const { results: mrpResults, runMRP, calculating: mrpLoading } = useRealMRP();

  React.useEffect(() => {
    runMRP();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const GLOBAL_ROLES = ['ADMIN', 'RQ', 'DPI', 'RPROD', 'RACH', 'PLAN'];
  const isGlobalRole = GLOBAL_ROLES.includes(profile?.role || '');
  const scopeToLineCode: Record<string, string> = {
    SAVON: 'SAV', BOU_ENC: 'BOU', BOUGIE_ENCAUSTIQUE: 'BOU',
    SPAH: 'SPAH', PH: 'SPAH', CORDE: 'CORDE',
  };
  const userLineCode = scopeToLineCode[userScope] || undefined;
  const { data: trsData } = useTRS(isGlobalRole ? undefined : userLineCode);
  const trsValue: number | null = isGlobalRole ? trsData?.trs_global_pct ?? null : trsData?.trs_pct ?? null;
  const trsLabel = isGlobalRole ? 'TRS Global' : trsData?.line_name ? `TRS ${trsData.line_name}` : 'TRS';

  const filteredProd = prodOrders.filter((o: any) => {
    if (userScope === 'ALL' || !o.product) return true;
    const family = o.product.family;
    if (userScope === 'SAVON') return family === 'SIPF003';
    if (userScope === 'PH' || userScope === 'SPAH') return family === 'SIPF009' || family === 'SPAH';
    if (userScope === 'CORDE') return family === 'SIPF002';
    if (userScope === 'BOU_ENC' || userScope === 'BOUGIE_ENCAUSTIQUE') return family === 'SIPF001' || family === 'SIPF004';
    return true;
  });

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  // "Production du jour" = quantité de lots PF effectivement LIBÉRÉS par le labo
  // aujourd'hui (et non simplement les OF clôturés) — un OF clôturé ne devient
  // de la "vraie" production que validée par le contrôle qualité.
  const dailyProdQty = lots
    .filter((l: any) => {
      if (l.article?.article_type !== 'PF') return false;
      if (l.cqlib_status !== 'LIBERE') return false;
      if (!l.cqlib_decided_at?.startsWith(todayStr)) return false;
      if (userScope === 'ALL') return true;
      const family = l.article?.family;
      if (userScope === 'SAVON') return family === 'SIPF003';
      if (userScope === 'PH' || userScope === 'SPAH') return family === 'SIPF009' || family === 'SPAH';
      if (userScope === 'CORDE') return family === 'SIPF002';
      if (userScope === 'BOU_ENC' || userScope === 'BOUGIE_ENCAUSTIQUE') return family === 'SIPF001' || family === 'SIPF004';
      return true;
    })
    .reduce((acc: number, l: any) => acc + (l.qty_received || 0), 0);

  const enCours = filteredProd.filter((o: any) => o.status === 'EN_COURS').length;
  const planifie = filteredProd.filter((o: any) => o.status === 'PLANIFIE').length;
  const termine = filteredProd.filter((o: any) => o.status === 'TERMINE').length;
  const openFnc = fncs.filter(f => f.status === 'OUVERTE').length;
  const maintenanceUrgente = maintenanceTasks.filter((t: any) => t.priority === 'HIGH' || t.priority === 'CRITICAL').length;

  const quarantineCount = lots.filter(l => l.cqlib_status === 'QUARANTAINE').length;

  const [drilldown, setDrilldown] = React.useState<DrilldownKey>(null);

  const { isHidden, button: customizeBtn, modal: customizeModal } = useDashboardCustomizer(profile, [
    { key: 'prod_kpis', label: 'Indicateurs production' },
    { key: 'prod_of', label: 'Ordres de fabrication' },
    { key: 'prod_alerts', label: 'Alertes opérationnelles' },
    { key: 'prod_mrp', label: 'Alertes MRP — réapprovisionnement' },
  ]);

  if (drilldown === 'production') {
    return (
      <AnimatedPage>
        <ScrollView style={s.container} contentContainerStyle={s.content}>
          <BackButton onPress={() => setDrilldown(null)} />
          <Text style={s.drillTitle}>Ordres de Fabrication — {userScope}</Text>
          <Text style={s.drillSub}>{filteredProd.length} OF en cours ou planifiés</Text>
          {filteredProd.map((o: any) => (
            <View key={o.id} style={s.drillRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.drillRowTitle}>{o.code}</Text>
                <Text style={s.drillRowSub}>{o.product?.name || '—'} · {o.qty_planned} {o.product?.unit}</Text>
              </View>
              <Badge label={o.status} color={o.status === 'TERMINE' ? C.ok : o.status === 'EN_COURS' ? C.info : C.gold} />
            </View>
          ))}
        </ScrollView>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage>
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <DashboardHeader
          title={`Tableau de Bord — Production · ${userScope}`}
          subtitle={`${dateStr} · SIPROMAD POLE INDUSTRIEL`}
          isMobile={isMobile}
          actions={<View style={{ flexDirection: 'row', gap: 8 }}><ActionButton label="Recalculer MRP" icon="refresh" onPress={() => runMRP()} loading={mrpLoading} />{customizeBtn}</View>}
        />

        {/* KPIs Production */}
        {!isHidden('prod_kpis') && (
        <View style={[s.grid, isMobile && { flexDirection: 'column' }]}>
          <KpiCard label="Production du Jour" value={dailyProdQty.toLocaleString()} sub={userScope === 'PH' ? 'Balles' : 'Kg / Pcs'} color={C.gold} icon="factory" loading={prodLoading} onPress={() => setDrilldown('production')} />
          <KpiCard label="OF en cours" value={String(enCours)} sub="En fabrication" color={C.info} icon="progress-wrench" loading={prodLoading} onPress={() => setDrilldown('production')} />
          <KpiCard label="OF planifiés" value={String(planifie)} sub="À démarrer" color={C.gold} icon="calendar-clock" loading={prodLoading} onPress={() => setDrilldown('production')} />
          <KpiCard label="OF terminés" value={String(termine)} sub="Ce mois" color={C.ok} icon="check-circle" loading={prodLoading} onPress={() => setDrilldown('production')} />
          <KpiCard
            label={trsLabel}
            value={trsValue != null ? `${trsValue}%` : '—'}
            sub="Disponibilité · Performance · Qualité"
            color={trsValue == null ? C.info : trsValue >= 85 ? C.ok : trsValue >= 70 ? C.gold : C.err}
            icon="chart-line"
            loading={prodLoading}
          />
          <KpiCard label="FNC Ouvertes" value={String(openFnc)} sub="Non-conformités actives" color={openFnc > 0 ? C.err : C.ok} icon="alert-octagon" loading={prodLoading} />
        </View>
        )}

        {/* Tableau OF */}
        {!isHidden('prod_of') && (
        <View style={{ marginTop: 32 }}>
          <SectionTitle>Ordres de Fabrication — {userScope}</SectionTitle>
          <ScrollView
            horizontal={isMobile}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={isMobile ? { minWidth: 620 } : undefined}
          >
            <View style={s.card}>
              <View style={s.tableHeader}>
                <Text style={s.tableHeaderCell}>OF #</Text>
                <Text style={s.tableHeaderCell}>PRODUIT</Text>
                <Text style={s.tableHeaderCell}>QTÉ PLANIFIÉE</Text>
                <Text style={[s.tableHeaderCell, { textAlign: 'right' }]}>STATUT</Text>
              </View>
              {filteredProd.slice(0, 8).map((o: any) => (
                <TouchableOpacity key={o.id} style={s.tableRow} onPress={() => setDrilldown('production')}>
                  <Text style={s.tableCellCode}>{o.code}</Text>
                  <Text style={s.tableCellName} numberOfLines={1}>{o.product?.name || '—'}</Text>
                  <Text style={[s.tableCellName, { textAlign: 'center' }]}>{o.qty_planned} {o.product?.unit}</Text>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Badge label={o.status} color={o.status === 'TERMINE' ? C.ok : o.status === 'EN_COURS' ? C.info : C.gold} />
                  </View>
                </TouchableOpacity>
              ))}
              {filteredProd.length === 0 && <Text style={s.emptyText}>Aucun OF pour ce périmètre.</Text>}
            </View>
          </ScrollView>
        </View>
        )}

        {/* Alertes maintenance + quarantaine */}
        {!isHidden('prod_alerts') && (
        <View style={{ marginTop: 32 }}>
          <SectionTitle>Alertes Opérationnelles</SectionTitle>
          <View style={[s.mainGrid, isMobile && { flexDirection: 'column' }]}>
            <View style={[s.card, { flex: 1 }]}>
              <Text style={s.cardTitle}>Maintenance Urgente</Text>
              {maintenanceTasks.filter((t: any) => t.priority === 'HIGH' || t.priority === 'CRITICAL').slice(0, 5).map((t: any) => (
                <View key={t.id} style={s.alertItem}>
                  <MaterialCommunityIcons name="wrench-clock" size={18} color={t.priority === 'CRITICAL' ? C.err : C.gold} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.alertTitle}>{t.equipment_name || t.task_name || '—'}</Text>
                    <Text style={s.alertSub}>{t.next_due_at ? new Date(t.next_due_at).toLocaleDateString('fr-FR') : '—'}</Text>
                  </View>
                  <Badge label={t.priority} color={t.priority === 'CRITICAL' ? C.err : C.gold} />
                </View>
              ))}
              {maintenanceUrgente === 0 && <Text style={s.emptyText}>Aucune maintenance urgente.</Text>}
            </View>

            <View style={[s.card, { flex: 1 }]}>
              <Text style={s.cardTitle}>Lots en Quarantaine</Text>
              {lots.filter(l => l.cqlib_status === 'QUARANTAINE').slice(0, 5).map((l) => (
                <View key={l.id} style={s.alertItem}>
                  <MaterialCommunityIcons name="beaker-outline" size={18} color={C.gold} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.alertTitle}>{l.code}</Text>
                    <Text style={s.alertSub}>{l.article?.name || '—'} · {l.qty_current} {l.unit}</Text>
                  </View>
                  <Badge label="QUARANTAINE" color={C.gold} />
                </View>
              ))}
              {quarantineCount === 0 && <Text style={s.emptyText}>Aucun lot en quarantaine.</Text>}
            </View>
          </View>
        </View>
        )}

        {/* MRP */}
        {!isHidden('prod_mrp') && mrpResults.length > 0 && (
          <View style={{ marginTop: 32 }}>
            <SectionTitle>Alertes MRP — Réapprovisionnement</SectionTitle>
            <View style={s.card}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {mrpResults.slice(0, 6).map(item => (
                  <View key={item.id} style={s.mrpWidget}>
                    <Text style={s.mrpWidgetCode}>{item.code}</Text>
                    <Text style={s.mrpWidgetName} numberOfLines={1}>{item.name}</Text>
                    <View style={s.mrpWidgetBar}>
                      <View style={[s.mrpWidgetFill, {
                        width: `${Math.max(10, Math.min(100, (item.stock / item.needs) * 100))}%`,
                        backgroundColor: item.priority >= 2 ? C.err : C.gold,
                      }]} />
                    </View>
                    <Text style={s.mrpWidgetStatus}>{item.action.replace(/_/g, ' ')}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        )}
        {customizeModal}
      </ScrollView>
    </AnimatedPage>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD COMPTA
// ════════════════════════════════════════════════════════════════════════════
function DashboardCOMPTA({ isMobile, dateStr }: { isMobile: boolean; dateStr: string }) {
  const { data: daLocal = [], isPending: localLoading } = useDaLocal();
  const { data: daImport = [], isPending: importLoading } = useDaImport();
  const { data: lots = [] } = useLots();

  const releasedLots = lots.filter(l => l.cqlib_status === 'LIBERE');
  const valuation = releasedLots.reduce((acc, lot) => {
    const type = lot.article?.article_type || 'MP';
    const unitValue = getArticleUnitValue(type);
    return acc + (lot.qty_current * unitValue);
  }, 0);

  const daLocalEnCours = (daLocal as any[]).filter((d: any) => d.status !== 'RECEPTION' && d.status !== 'ANNULE').length;
  const daLocalRecu = (daLocal as any[]).filter((d: any) => d.status === 'RECEPTION').length;
  const daImportEnCours = (daImport as any[]).filter((d: any) => d.status === 'EN_COURS').length;
  const daImportTotal = (daImport as any[]).length;

  // Valeur commandes locales en cours
  const valCmdsEnCours = (daLocal as any[])
    .filter((d: any) => d.status !== 'RECEPTION' && d.status !== 'ANNULE')
    .reduce((acc: number, d: any) => acc + (d.amount_mga || 0), 0);

  return (
    <AnimatedPage>
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <DashboardHeader
          title="Tableau de Bord — Comptabilité & Achats"
          subtitle={`${dateStr} · SIPROMAD POLE INDUSTRIEL`}
          isMobile={isMobile}
        />

        {/* KPIs Compta */}
        <View style={[s.grid, isMobile && { flexDirection: 'column' }]}>
          <KpiCard label="Stock valorisé" value={`${(valuation / 1000000).toFixed(1)} M`} sub="Millions MGA (lots libérés)" color={C.info} icon="currency-usd" loading={localLoading} />
          <KpiCard label="Cmdes locales actives" value={String(daLocalEnCours)} sub="En cours de traitement" color={daLocalEnCours > 0 ? C.gold : C.ok} icon="file-document" loading={localLoading} />
          <KpiCard label="Cmdes locales reçues" value={String(daLocalRecu)} sub="Réceptionnées" color={C.ok} icon="package-variant-closed" loading={localLoading} />
          <KpiCard label="Valeur cmdes actives" value={`${(valCmdsEnCours / 1000000).toFixed(2)} M`} sub="MGA engagés" color={C.gold} icon="cash-multiple" loading={localLoading} />
          <KpiCard label="Importations actives" value={String(daImportEnCours)} sub="DA import en cours" color={daImportEnCours > 0 ? C.gold : C.ok} icon="airplane-landing" loading={importLoading} />
          <KpiCard label="Total importations" value={String(daImportTotal)} sub="Historique" color={C.info} icon="file-chart" loading={importLoading} />
        </View>

        {/* Commandes locales */}
        <View style={{ marginTop: 32 }}>
          <SectionTitle>Demandes d'Achat Locales — Récentes</SectionTitle>
          <View style={s.card}>
            <View style={s.tableHeader}>
              <Text style={s.tableHeaderCell}>DA #</Text>
              <Text style={s.tableHeaderCell}>FOURNISSEUR</Text>
              <Text style={s.tableHeaderCell}>MONTANT</Text>
              <Text style={[s.tableHeaderCell, { textAlign: 'right' }]}>STATUT</Text>
            </View>
            {(daLocal as any[]).slice(0, 8).map((d: any) => (
              <View key={d.id} style={s.tableRow}>
                <Text style={s.tableCellCode}>{d.code}</Text>
                <Text style={s.tableCellName} numberOfLines={1}>{d.supplier?.name || '—'}</Text>
                <Text style={[s.tableCellName, { textAlign: 'center' }]}>{d.amount_mga ? `${(d.amount_mga / 1000).toFixed(0)} k` : '—'}</Text>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Badge label={d.status} color={d.status === 'RECEPTION' ? C.ok : d.status === 'COMMANDE' ? C.info : d.status === 'ANNULE' ? C.err : C.gold} />
                </View>
              </View>
            ))}
            {daLocal.length === 0 && <Text style={s.emptyText}>Aucune commande locale.</Text>}
          </View>
        </View>

        {/* Valorisation du stock par type */}
        <View style={{ marginTop: 32 }}>
          <SectionTitle>Valorisation Stock par Catégorie</SectionTitle>
          <View style={s.card}>
            {(['MP', 'PF', 'SF', 'CO'] as const).map(type => {
              const lotsType = releasedLots.filter(l => (l.article?.article_type || 'MP') === type);
              const valType = lotsType.reduce((acc, l) => {
                const uv = type === 'MP' ? 5000 : type === 'PF' ? 12000 : type === 'SF' ? 8000 : 3000;
                return acc + l.qty_current * uv;
              }, 0);
              return (
                <View key={type} style={s.drillRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.drillRowTitle}>{type}</Text>
                    <Text style={s.drillRowSub}>{lotsType.length} lot(s)</Text>
                  </View>
                  <Text style={s.drillRowValue}>{(valType / 1000000).toFixed(2)} M MGA</Text>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </AnimatedPage>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD RACH (Responsable Achats)
// ════════════════════════════════════════════════════════════════════════════
function DashboardRACH({ isMobile, dateStr }: { isMobile: boolean; dateStr: string }) {
  const { data: daLocal = [], isPending: localLoading } = useDaLocal();
  const { data: daImport = [], isPending: importLoading } = useDaImport();
  const { data: stockAlerts = [] } = useStockAlerts();
  const { data: supplierViews = [] } = useSupplierClassificationView();
  const { results: mrpResults, runMRP } = useRealMRP();

  React.useEffect(() => {
    runMRP();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const daLocalEnCours = (daLocal as any[]).filter((d: any) => d.status !== 'RECEPTION' && d.status !== 'ANNULE').length;
  const daLocalValidation = (daLocal as any[]).filter((d: any) => d.status === 'VALIDATION').length;
  const daImportEnCours = (daImport as any[]).filter((d: any) => d.status === 'EN_COURS').length;
  const criticalStockCount = stockAlerts.filter(a => a.stock_status === 'CRITICAL').length;
  const warningStockCount = stockAlerts.filter(a => a.stock_status === 'WARNING').length;
  const mrpUrgent = mrpResults.filter(r => r.priority >= 2).length;

  return (
    <AnimatedPage>
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <DashboardHeader
          title="Tableau de Bord — Responsable Achats"
          subtitle={`${dateStr} · SIPROMAD POLE INDUSTRIEL`}
          isMobile={isMobile}
        />

        {/* KPIs Achats */}
        <View style={[s.grid, isMobile && { flexDirection: 'column' }]}>
          <KpiCard label="DA locales actives" value={String(daLocalEnCours)} sub="En traitement" color={daLocalEnCours > 0 ? C.gold : C.ok} icon="file-document" loading={localLoading} />
          <KpiCard label="En attente validation" value={String(daLocalValidation)} sub="À valider / approuver" color={daLocalValidation > 0 ? C.err : C.ok} icon="file-clock" loading={localLoading} />
          <KpiCard label="DA importation actives" value={String(daImportEnCours)} sub="Importation en cours" color={daImportEnCours > 0 ? C.gold : C.ok} icon="airplane-landing" loading={importLoading} />
          <KpiCard label="Alertes stock critiques" value={String(criticalStockCount)} sub="Rupture imminente" color={criticalStockCount > 0 ? C.err : C.ok} icon="package-variant-closed-remove" loading={localLoading} />
          <KpiCard label="Articles sous seuil" value={String(warningStockCount)} sub="Réapprovisionnement recommandé" color={warningStockCount > 0 ? C.gold : C.ok} icon="alert-circle" loading={localLoading} />
          <KpiCard label="Besoins MRP urgents" value={String(mrpUrgent)} sub="Demandes à lancer" color={mrpUrgent > 0 ? C.err : C.ok} icon="factory" loading={localLoading} />
        </View>

        {/* DA locales */}
        <View style={{ marginTop: 32 }}>
          <SectionTitle>Demandes d'Achat Locales</SectionTitle>
          <View style={s.card}>
            <View style={s.tableHeader}>
              <Text style={s.tableHeaderCell}>DA #</Text>
              <Text style={s.tableHeaderCell}>FOURNISSEUR</Text>
              <Text style={s.tableHeaderCell}>ARTICLE</Text>
              <Text style={[s.tableHeaderCell, { textAlign: 'right' }]}>STATUT</Text>
            </View>
            {(daLocal as any[]).slice(0, 8).map((d: any) => (
              <View key={d.id} style={s.tableRow}>
                <Text style={s.tableCellCode}>{d.code}</Text>
                <Text style={s.tableCellName} numberOfLines={1}>{d.supplier?.name || '—'}</Text>
                <Text style={[s.tableCellName, { color: '#6C757D' }]} numberOfLines={1}>{d.article?.name || '—'}</Text>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Badge label={d.status} color={d.status === 'RECEPTION' ? C.ok : d.status === 'COMMANDE' ? C.info : d.status === 'VALIDATION' ? C.err : C.gold} />
                </View>
              </View>
            ))}
            {daLocal.length === 0 && <Text style={s.emptyText}>Aucune commande locale.</Text>}
          </View>
        </View>

        {/* Alertes stock + MRP */}
        <View style={{ marginTop: 32 }}>
          <SectionTitle>Alertes Stock & Réapprovisionnement</SectionTitle>
          <View style={[s.mainGrid, isMobile && { flexDirection: 'column' }]}>
            <View style={[s.card, { flex: 1 }]}>
              <Text style={s.cardTitle}>Articles Sous Seuil</Text>
              {stockAlerts.filter(a => a.stock_status !== 'OK').slice(0, 6).map((a: any) => (
                <View key={a.id} style={s.alertItem}>
                  <MaterialCommunityIcons name="package-variant-closed" size={18} color={a.stock_status === 'CRITICAL' ? C.err : C.gold} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.alertTitle}>{a.code} — {a.name}</Text>
                    <Text style={s.alertSub}>Stock: {a.qty_current} | Seuil: {a.reorder_point}</Text>
                  </View>
                  <Badge label={a.stock_status} color={a.stock_status === 'CRITICAL' ? C.err : C.gold} />
                </View>
              ))}
              {criticalStockCount + warningStockCount === 0 && <Text style={s.emptyText}>Tous les articles sont en stock.</Text>}
            </View>

            <View style={[s.card, { flex: 1 }]}>
              <Text style={s.cardTitle}>Besoins MRP Urgents</Text>
              {mrpResults.filter(r => r.priority >= 2).slice(0, 6).map(item => (
                <View key={item.id} style={s.alertItem}>
                  <MaterialCommunityIcons name="factory" size={18} color={C.err} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.alertTitle}>{item.code} — {item.name}</Text>
                    <Text style={s.alertSub}>Stock: {item.stock} | Besoin: {item.needs}</Text>
                  </View>
                  <Badge label={item.action} color={C.err} />
                </View>
              ))}
              {mrpUrgent === 0 && <Text style={s.emptyText}>Aucun besoin urgent MRP.</Text>}
            </View>
          </View>
        </View>
      </ScrollView>
    </AnimatedPage>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD GLOBAL (ADMIN / DPI / PLAN / RQ / TLAB / MAGA / OPERATEUR)
// ════════════════════════════════════════════════════════════════════════════
function DashboardGlobal({
  isMobile, dateStr, profile,
}: { isMobile: boolean; dateStr: string; profile: any }) {
  const { exporting, progress, triggerExport } = useExport();
  const { data: lots = [], isPending: lotsLoading } = useLots();
  const { data: instruments = [] } = useInstruments();
  const { data: fcqDossiers = [] } = useFcqDossiers();
  const { data: fncs = [] } = useFnc();
  const { data: prodOrders = [], isPending: prodLoading } = useProductionOrders();
  const { results: mrpResults, runMRP, calculating: mrpLoading } = useRealMRP();

  React.useEffect(() => {
    runMRP();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: stockAlerts = [] } = useStockAlerts();
  const { data: stockTransfers = [], isPending: transfersLoading } = useStockTransfers();
  const { raw: forecastRaw } = useForecasts();
  const { t } = useTranslation();

  // ── Calcul PDP total (tous les objectifs de production_forecasts pour l'année en cours) ──
  const currentYear = new Date().getFullYear();
  const totalPDP = React.useMemo(() => {
    return (forecastRaw as any[]).filter((r: any) => r.year === currentYear).reduce((acc: number, r: any) => acc + (r.qty || 0), 0);
  }, [forecastRaw, currentYear]);

  const userScope = profile?.scope || 'ALL';
  const GLOBAL_ROLES = ['ADMIN', 'RQ', 'DPI', 'RPROD', 'RACH', 'PLAN'];
  const isGlobalRole = GLOBAL_ROLES.includes(profile?.role || '');
  const scopeToLineCode: Record<string, string> = {
    SAVON: 'SAV', BOU_ENC: 'BOU', BOUGIE_ENCAUSTIQUE: 'BOU',
    SPAH: 'SPAH', PH: 'SPAH', CORDE: 'CORDE',
  };
  const userLineCode = scopeToLineCode[userScope] || undefined;
  const { data: trsData } = useTRS(isGlobalRole ? undefined : userLineCode);

  const trsValue: number | null = isGlobalRole ? trsData?.trs_global_pct ?? null : trsData?.trs_pct ?? null;
  const trsLabel = isGlobalRole ? 'TRS Global' : trsData?.line_name ? `TRS ${trsData.line_name}` : 'TRS';
  const trsDisponibilite: number | null = isGlobalRole ? trsData?.disponibilite_globale_pct ?? null : trsData?.disponibilite_pct ?? null;
  const trsPerformance: number | null = isGlobalRole ? trsData?.performance_globale_pct ?? null : trsData?.performance_pct ?? null;
  const trsQualite: number | null = isGlobalRole ? trsData?.qualite_globale_pct ?? null : trsData?.qualite_pct ?? null;

  const releasedLots = lots.filter(l => l.cqlib_status === 'LIBERE');
  const valuation = releasedLots.reduce((acc, lot) => {
    const type = lot.article?.article_type || 'MP';
    const unitValue = getArticleUnitValue(type);
    return acc + (lot.qty_current * unitValue);
  }, 0);

  const validatedFcq = fcqDossiers.filter(f => f.status === 'VALIDE' || f.status === 'COMPLET');
  const fpy = validatedFcq.length > 0
    ? (validatedFcq.filter(f => f.decision === 'LIBERE').length / validatedFcq.length) * 100
    : 100;

  const alertsCount = instruments.filter(i => i.status === 'ECHU' || i.status === 'A_ETALONNER').length;
  const quarantineCount = lots.filter(l => l.cqlib_status === 'QUARANTAINE').length;
  const mrpUrgentCount = mrpResults.filter(r => r.priority >= 2).length;

  const filteredProd = prodOrders.filter((o: any) => {
    if (userScope === 'ALL' || !o.product) return true;
    const family = o.product.family;
    if (userScope === 'SAVON') return family === 'SIPF003';
    if (userScope === 'PH' || userScope === 'SPAH') return family === 'SIPF009' || family === 'SPAH';
    if (userScope === 'CORDE') return family === 'SIPF002';
    if (userScope === 'BOU_ENC' || userScope === 'BOUGIE_ENCAUSTIQUE') return family === 'SIPF001' || family === 'SIPF004';
    return true;
  });

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  // "Production du jour" = quantité de lots PF effectivement LIBÉRÉS par le labo
  // aujourd'hui (et non simplement les OF clôturés) — un OF clôturé ne devient
  // de la "vraie" production que validée par le contrôle qualité.
  const dailyProdQty = lots
    .filter((l: any) => {
      if (l.article?.article_type !== 'PF') return false;
      if (l.cqlib_status !== 'LIBERE') return false;
      if (!l.cqlib_decided_at?.startsWith(todayStr)) return false;
      if (userScope === 'ALL') return true;
      const family = l.article?.family;
      if (userScope === 'SAVON') return family === 'SIPF003';
      if (userScope === 'PH' || userScope === 'SPAH') return family === 'SIPF009' || family === 'SPAH';
      if (userScope === 'CORDE') return family === 'SIPF002';
      if (userScope === 'BOU_ENC' || userScope === 'BOUGIE_ENCAUSTIQUE') return family === 'SIPF001' || family === 'SIPF004';
      return true;
    })
    .reduce((acc: number, l: any) => acc + (l.qty_received || 0), 0);

  const globalLoading = lotsLoading || prodLoading || mrpLoading;

  const [drilldown, setDrilldown] = React.useState<DrilldownKey>(null);

  // ── DRILLDOWN PANELS ──
  if (drilldown === 'stock') {
    const byType: Record<string, { count: number; qty: number }> = {};
    releasedLots.forEach(l => {
      const t = l.article?.article_type || 'MP';
      if (!byType[t]) byType[t] = { count: 0, qty: 0 };
      byType[t].count++;
      byType[t].qty += l.qty_current;
    });
    return (
      <AnimatedPage>
        <ScrollView style={s.container} contentContainerStyle={s.content}>
          <BackButton onPress={() => setDrilldown(null)} />
          <Text style={s.drillTitle}>Valorisation du Stock</Text>
          <Text style={s.drillSub}>{`Valeur totale estimée : ${(valuation / 1000000).toFixed(2)} M MGA`}</Text>
          {Object.entries(byType).map(([type, data]) => (
            <View key={type} style={s.drillRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.drillRowTitle}>{type}</Text>
                <Text style={s.drillRowSub}>{data.count} lot(s) - {data.qty.toLocaleString()} unités</Text>
              </View>
              <Text style={s.drillRowValue}>{((data.qty * (type === 'PF' ? 12000 : 5000)) / 1000000).toFixed(2)} M</Text>
            </View>
          ))}
        </ScrollView>
      </AnimatedPage>
    );
  }

  if (drilldown === 'qualite') {
    return (
      <AnimatedPage>
        <ScrollView style={s.container} contentContainerStyle={s.content}>
          <BackButton onPress={() => setDrilldown(null)} />
          <Text style={s.drillTitle}>Performance Qualité (FPY)</Text>
          <Text style={s.drillSub}>{`Taux de conformité : ${fpy.toFixed(1)}%`}</Text>
          {fcqDossiers.slice(0, 20).map((f: any) => (
            <View key={f.id} style={s.drillRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.drillRowTitle}>{f.code}</Text>
                <Text style={s.drillRowSub}>{f.lot?.code || '—'} · {f.status?.replace(/_/g, ' ')}</Text>
              </View>
              <Badge label={f.decision || f.status} color={f.decision === 'LIBERE' ? C.ok : f.decision === 'BLOQUE' ? C.err : C.gold} />
            </View>
          ))}
        </ScrollView>
      </AnimatedPage>
    );
  }

  if (drilldown === 'mrp') {
    return (
      <AnimatedPage>
        <ScrollView style={s.container} contentContainerStyle={s.content}>
          <BackButton onPress={() => setDrilldown(null)} />
          <Text style={s.drillTitle}>Alertes MRP & Réapprovisionnement</Text>
          <Text style={s.drillSub}>{`${mrpUrgentCount} article(s) en rupture critique`}</Text>
          {mrpResults.map(item => (
            <View key={item.id} style={s.drillRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.drillRowTitle}>{item.code} — {item.name}</Text>
                <Text style={s.drillRowSub}>Stock: {item.stock} | Besoin: {item.needs}</Text>
              </View>
              <Badge label={item.action} color={item.priority >= 2 ? C.err : C.gold} />
            </View>
          ))}
        </ScrollView>
      </AnimatedPage>
    );
  }

  if (drilldown === 'quarantaine') {
    const qLots = lots.filter(l => l.cqlib_status === 'QUARANTAINE');
    return (
      <AnimatedPage>
        <ScrollView style={s.container} contentContainerStyle={s.content}>
          <BackButton onPress={() => setDrilldown(null)} />
          <Text style={s.drillTitle}>Lots en Quarantaine</Text>
          <Text style={s.drillSub}>{`${qLots.length} lot(s) - attente d'analyse laboratoire`}</Text>
          {qLots.map(l => (
            <View key={l.id} style={s.drillRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.drillRowTitle}>{l.code}</Text>
                <Text style={s.drillRowSub}>{l.article?.name || '—'} · {l.qty_current} {l.unit}</Text>
              </View>
              <Badge label="QUARANTAINE" color={C.gold} />
            </View>
          ))}
        </ScrollView>
      </AnimatedPage>
    );
  }

  if (drilldown === 'production') {
    return (
      <AnimatedPage>
        <ScrollView style={s.container} contentContainerStyle={s.content}>
          <BackButton onPress={() => setDrilldown(null)} />
          <Text style={s.drillTitle}>Ordres de Fabrication — {userScope}</Text>
          <Text style={s.drillSub}>{`${filteredProd.length} OF en cours ou planifiés`}</Text>
          {filteredProd.map((o: any) => (
            <View key={o.id} style={s.drillRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.drillRowTitle}>{o.code}</Text>
                <Text style={s.drillRowSub}>{o.product?.name || '—'} · {o.qty_planned} {o.product?.unit}</Text>
              </View>
              <Badge label={o.status} color={o.status === 'TERMINE' ? C.ok : o.status === 'EN_COURS' ? C.info : C.gold} />
            </View>
          ))}
        </ScrollView>
      </AnimatedPage>
    );
  }

  if (drilldown === 'instruments') {
    const problematic = instruments.filter(i => i.status === 'ECHU' || i.status === 'A_ETALONNER');
    return (
      <AnimatedPage>
        <ScrollView style={s.container} contentContainerStyle={s.content}>
          <BackButton onPress={() => setDrilldown(null)} />
          <Text style={s.drillTitle}>Instruments — Calibration</Text>
          <Text style={s.drillSub}>{`${problematic.length} instrument(s) à calibrer ou échus`}</Text>
          {problematic.map((i: any) => (
            <View key={i.id} style={s.drillRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.drillRowTitle}>{i.code} — {i.name}</Text>
                <Text style={s.drillRowSub}>Prochaine calibration: {i.next_calibration_at ? new Date(i.next_calibration_at).toLocaleDateString('fr-FR') : '—'}</Text>
              </View>
              <Badge label={i.status} color={i.status === 'ECHU' ? C.err : C.gold} />
            </View>
          ))}
        </ScrollView>
      </AnimatedPage>
    );
  }

  if (drilldown === 'fnc') {
    const openFnc = fncs.filter(f => f.status === 'OUVERTE' || f.status === 'EN_COURS');
    return (
      <AnimatedPage>
        <ScrollView style={s.container} contentContainerStyle={s.content}>
          <BackButton onPress={() => setDrilldown(null)} />
          <Text style={s.drillTitle}>FNC Ouvertes — Actions Correctives</Text>
          <Text style={s.drillSub}>{`${openFnc.length} fiche(s) de non-conformité active(s)`}</Text>
          {openFnc.map((f: any) => (
            <View key={f.id} style={s.drillRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.drillRowTitle}>{f.code}</Text>
                <Text style={s.drillRowSub} numberOfLines={2}>{f.description}</Text>
              </View>
              <Badge label={f.severity} color={f.severity === 'CRITIQUE' ? C.err : f.severity === 'MAJEURE' ? C.gold : C.info} />
            </View>
          ))}
        </ScrollView>
      </AnimatedPage>
    );
  }

  if (drilldown === 'stockalerts') {
    return (
      <AnimatedPage>
        <ScrollView style={s.container} contentContainerStyle={s.content}>
          <BackButton onPress={() => setDrilldown(null)} />
          <Text style={s.drillTitle}>Alertes Stock</Text>
          <Text style={s.drillSub}>{`${stockAlerts.filter(a => a.stock_status !== 'OK').length} article(s) sous le seuil de réapprovisionnement`}</Text>
          {stockAlerts.filter(a => a.stock_status !== 'OK').map((a: any) => (
            <View key={a.id} style={s.drillRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.drillRowTitle}>{a.code} — {a.name}</Text>
                <Text style={s.drillRowSub}>Stock actuel: {a.qty_current} | Seuil: {a.reorder_point}</Text>
              </View>
              <Badge label={a.stock_status} color={a.stock_status === 'CRITICAL' ? C.err : C.gold} />
            </View>
          ))}
        </ScrollView>
      </AnimatedPage>
    );
  }

  // ── MAIN GLOBAL DASHBOARD ──
  return (
    <AnimatedPage>
      <ExportOverlay visible={exporting} progress={progress} />
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <DashboardHeader
          title={t('bi_dashboard_title')}
          subtitle={`${dateStr} · SIPROMAD POLE INDUSTRIEL`}
          isMobile={isMobile}
          actions={
            <>
              <ActionButton label={t('refresh_bi')} icon="refresh" onPress={() => runMRP()} loading={mrpLoading} />
              <ActionButton
                label={t('monthly_reporting')}
                icon="file-chart"
                onPress={() => triggerExport("Reporting Mensuel", `
                  <h2>Résumé de Performance</h2>
                  <table>
                    <tr><th>Indicateur</th><th>Valeur</th></tr>
                    <tr><td>Valo Stock</td><td>${(valuation / 1000000).toFixed(1)} M</td></tr>
                    <tr><td>FPY Qualité</td><td>${fpy.toFixed(1)}%</td></tr>
                    <tr><td>Alertes MRP</td><td>${mrpUrgentCount}</td></tr>
                    <tr><td>Lots en Quarantaine</td><td>${quarantineCount}</td></tr>
                  </table>
                `)}
              />
            </>
          }
        />

        <View style={[s.grid, isMobile && { flexDirection: 'column' }]}>
          <KpiCard label={t('stock_valuation')} value={`${(valuation / 1000000).toFixed(1)} M`} sub={t('millions_mga')} color={C.info} icon="currency-usd" loading={globalLoading} onPress={() => setDrilldown('stock')} />
          <KpiCard label={t('quality_fpy')} value={`${fpy.toFixed(1)}%`} sub={t('first_pass_yield')} color={C.green} icon="check-decagram" loading={globalLoading} onPress={() => setDrilldown('qualite')} />
          <KpiCard label={t('mrp_alerts_kpi')} value={String(mrpUrgentCount)} sub={t('critical_reorder')} color={mrpUrgentCount > 0 ? C.err : C.ok} icon="factory" loading={globalLoading} onPress={() => setDrilldown('mrp')} />
          <KpiCard label={t('quarantine_lots_kpi')} value={String(quarantineCount)} sub={t('waiting_lab')} color={quarantineCount > 5 ? C.gold : C.info} icon="beaker-outline" loading={globalLoading} onPress={() => setDrilldown('quarantaine')} />
          <KpiCard label={t('daily_production')} value={dailyProdQty.toLocaleString()} sub={userScope === 'PH' ? 'Balles' : 'Kg / Pcs'} color={C.gold} icon="factory" loading={globalLoading} onPress={() => setDrilldown('production')} />
          <KpiCard
            label={trsLabel}
            value={trsValue != null ? `${trsValue}%` : '—'}
            sub={`D:${trsDisponibilite ?? '—'}% · P:${trsPerformance ?? '—'}% · Q:${trsQualite ?? '—'}%`}
            color={trsValue == null ? C.info : trsValue >= 85 ? C.ok : trsValue >= 70 ? C.gold : C.err}
            icon="chart-line"
            loading={globalLoading}
          />
        </View>

        {/* ── SECTION PDP / PLANIFICATION / PRODUCTION RÉELLE (ADMIN · DPI · PLAN) ── */}
        {['ADMIN', 'DPI', 'PLAN'].includes(profile?.role || '') && (() => {
          const totalPlanifie = filteredProd.reduce((acc: number, o: any) => acc + (o.qty_planned || 0), 0);
          const totalReel = filteredProd.reduce((acc: number, o: any) => acc + (o.qty_produced || 0), 0);

          const pctPdpVsPlanif  = totalPDP > 0 ? Math.min(Math.round((totalPlanifie / totalPDP) * 100), 999) : 0;
          const pctPdpVsReel    = totalPDP > 0 ? Math.min(Math.round((totalReel      / totalPDP) * 100), 999) : 0;
          const pctPlanifVsReel = totalPlanifie > 0 ? Math.min(Math.round((totalReel / totalPlanifie) * 100), 999) : 0;

          const barColor = (pct: number) => pct >= 90 ? C.ok : pct >= 70 ? C.gold : C.err;

          return (
            <View style={{ marginTop: 32 }}>
              <SectionTitle>Suivi PDP — Objectifs · Planification · Production Réelle</SectionTitle>

              {/* 3 KPI totaux */}
              <View style={[s.grid, { marginBottom: 20 }, isMobile && { flexDirection: 'column' }]}>
                <KpiCard
                  label="Total Objectif PDP"
                  value={totalPDP.toLocaleString()}
                  sub={`Forecast ${currentYear}`}
                  color="#6366F1"
                  icon="target"
                  loading={globalLoading}
                />
                <KpiCard
                  label="Total Planification (OF)"
                  value={totalPlanifie.toLocaleString()}
                  sub="Ordres de fabrication — Qté planifiée"
                  color={C.info}
                  icon="calendar-clock"
                  loading={globalLoading}
                />
                <KpiCard
                  label="Total Production Réelle"
                  value={totalReel.toLocaleString()}
                  sub="Qté produite (OF terminés)"
                  color={C.ok}
                  icon="factory"
                  loading={globalLoading}
                />
              </View>

              {/* Barres de taux */}
              <View style={s.card}>
                <Text style={[s.cardTitle, { marginBottom: 20 }]}>Taux d'Atteinte des Objectifs</Text>

                {/* PDP vs Planification */}
                <View style={{ marginBottom: 20 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#6366F1' }} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#1A1A1A' }}>PDP vs Planification OF</Text>
                    </View>
                    <View style={[pdpBadgeStyle(pctPdpVsPlanif)]}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFF' }}>{pctPdpVsPlanif}%</Text>
                    </View>
                  </View>
                  <View style={pdpBarBg}>
                    <View style={[pdpBarFill, { width: `${Math.min(pctPdpVsPlanif, 100)}%`, backgroundColor: barColor(pctPdpVsPlanif) }]} />
                  </View>
                  <Text style={pdpBarSub}>
                    Objectif PDP : {totalPDP.toLocaleString()} · Planifié : {totalPlanifie.toLocaleString()}
                  </Text>
                </View>

                {/* PDP vs Production Réelle */}
                <View style={{ marginBottom: 20 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.ok }} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#1A1A1A' }}>PDP vs Production Réelle</Text>
                    </View>
                    <View style={[pdpBadgeStyle(pctPdpVsReel)]}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFF' }}>{pctPdpVsReel}%</Text>
                    </View>
                  </View>
                  <View style={pdpBarBg}>
                    <View style={[pdpBarFill, { width: `${Math.min(pctPdpVsReel, 100)}%`, backgroundColor: barColor(pctPdpVsReel) }]} />
                  </View>
                  <Text style={pdpBarSub}>
                    Objectif PDP : {totalPDP.toLocaleString()} · Réel : {totalReel.toLocaleString()}
                  </Text>
                </View>

                {/* Planification vs Production Réelle */}
                <View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.info }} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#1A1A1A' }}>Production Réelle vs Planification</Text>
                    </View>
                    <View style={[pdpBadgeStyle(pctPlanifVsReel)]}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFF' }}>{pctPlanifVsReel}%</Text>
                    </View>
                  </View>
                  <View style={pdpBarBg}>
                    <View style={[pdpBarFill, { width: `${Math.min(pctPlanifVsReel, 100)}%`, backgroundColor: barColor(pctPlanifVsReel) }]} />
                  </View>
                  <Text style={pdpBarSub}>
                    Planifié : {totalPlanifie.toLocaleString()} · Réel : {totalReel.toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>
          );
        })()}

        <View style={[s.mainGrid, { marginTop: 32 }, isMobile && { flexDirection: 'column' }]}>
          <View style={[s.card, { flex: 2 }]}>
            <View style={s.cardHeader}>
              <Text style={s.cardTitle}>{t('perf_qualite')}</Text>
              <Badge label={t('real_time_badge')} color={C.ok} />
            </View>
            <View style={s.biRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.biLabel}>{t('global_conformity')}</Text>
                <AnimatedBar value={fpy} color={C.ok} />
              </View>
              <View style={{ flex: 1, marginLeft: 20 }}>
                <Text style={s.biLabel}>{t('lab_efficiency')}</Text>
                <AnimatedBar value={85} color={C.info} />
              </View>
            </View>
            <View style={s.tableHeader}>
              <Text style={s.tableHeaderCell}>{t('recent_lot')}</Text>
              <Text style={s.tableHeaderCell}>{t('article')}</Text>
              <Text style={[s.tableHeaderCell, { textAlign: 'right' }]}>{t('status')}</Text>
            </View>
            {lots.slice(0, 4).map((lot) => (
              <TouchableOpacity key={lot.id} style={s.tableRow} onPress={() => setDrilldown('qualite')}>
                <Text style={s.tableCellCode}>{lot.code}</Text>
                <Text style={s.tableCellName} numberOfLines={1}>{lot.article?.name}</Text>
                <Badge label={lot.cqlib_status} color={lot.cqlib_status === 'LIBERE' ? C.ok : lot.cqlib_status === 'BLOQUE' ? C.err : C.gold} />
              </TouchableOpacity>
            ))}
          </View>

          <View style={[s.card, { flex: 1 }]}>
            <Text style={s.cardTitle}>{t('maintenance_sos')}</Text>
            <TouchableOpacity style={s.alertItem} onPress={() => setDrilldown('instruments')}>
              <MaterialCommunityIcons name="wrench-clock" size={20} color={alertsCount > 0 ? C.err : C.ok} />
              <View style={{ flex: 1 }}>
                <Text style={s.alertTitle}>{alertsCount} {t('instruments_expired')}</Text>
                <Text style={s.alertSub}>{t('calibration_iso')}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={16} color="#CCC" />
            </TouchableOpacity>
            <TouchableOpacity style={s.alertItem} onPress={() => setDrilldown('fnc')}>
              <MaterialCommunityIcons name="alert-octagon" size={20} color={fncs.filter(f => f.status === 'OUVERTE').length > 0 ? C.err : C.ok} />
              <View style={{ flex: 1 }}>
                <Text style={s.alertTitle}>{fncs.filter(f => f.status === 'OUVERTE').length} {t('open_fnc_count')}</Text>
                <Text style={s.alertSub}>{t('corrective_actions_8d')}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={16} color="#CCC" />
            </TouchableOpacity>
            <TouchableOpacity style={s.alertItem} onPress={() => setDrilldown('stockalerts')}>
              <MaterialCommunityIcons name="package-variant-closed" size={20} color={stockAlerts.filter(a => a.stock_status === 'CRITICAL').length > 0 ? C.err : C.ok} />
              <View style={{ flex: 1 }}>
                <Text style={s.alertTitle}>{stockAlerts.filter(a => a.stock_status !== 'OK').length} alertes stock</Text>
                <Text style={s.alertSub}>{stockAlerts.filter(a => a.stock_status === 'CRITICAL').length} critique · {stockAlerts.filter(a => a.stock_status === 'WARNING').length} sous seuil</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={16} color="#CCC" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── GRAPHIQUE PRODUCTION : Objectif / Planifié / Réalisé par mois ── */}
        <ProductionChart
          forecastRaw={forecastRaw as any[]}
          prodOrders={prodOrders}
          isMobile={isMobile}
        />

        <View style={{ marginTop: 32 }}>
          <SectionTitle>{t('mrp_supply_analysis')}</SectionTitle>
          <View style={s.card}>
            {mrpResults.length === 0 ? (
              <View style={s.emptyState}>
                <MaterialCommunityIcons name="chart-bell-curve-cumulative" size={40} color="#E9ECEF" />
                <Text style={s.emptyText}>{t('no_mrp_alerts')}</Text>
              </View>
            ) : (() => {
              const top10 = [...mrpResults]
                .sort((a, b) => b.priority - a.priority)
                .slice(0, 10);
              const colW = { code: 90, article: isMobile ? 160 : 220, num: 84, statut: 130 };
              const rowMinWidth = colW.code + colW.article + colW.num * 3 + colW.statut + 16 * 5;
              return (
                <View>
                  <ScrollView horizontal={isMobile} showsHorizontalScrollIndicator={isMobile}>
                    <View style={isMobile ? { minWidth: rowMinWidth } : { flex: 1 }}>
                      {/* En-tête tableau */}
                      <View style={[s.tableHeader, { backgroundColor: '#F8FAFC' }]}>
                        <Text style={[s.tableHeaderCell, { flex: isMobile ? undefined : 1.2, width: isMobile ? colW.code : undefined }]}>CODE</Text>
                        <Text style={[s.tableHeaderCell, { flex: isMobile ? undefined : 3, width: isMobile ? colW.article : undefined }]}>ARTICLE</Text>
                        <Text style={[s.tableHeaderCell, { flex: isMobile ? undefined : 1, width: isMobile ? colW.num : undefined, textAlign: 'right' }]}>STOCK</Text>
                        <Text style={[s.tableHeaderCell, { flex: isMobile ? undefined : 1, width: isMobile ? colW.num : undefined, textAlign: 'right' }]}>BESOIN</Text>
                        <Text style={[s.tableHeaderCell, { flex: isMobile ? undefined : 1, width: isMobile ? colW.num : undefined, textAlign: 'right' }]}>ÉCART</Text>
                        <Text style={[s.tableHeaderCell, { flex: isMobile ? undefined : 1.5, width: isMobile ? colW.statut : undefined, textAlign: 'center' }]}>STATUT</Text>
                      </View>

                      {top10.map((item, idx) => {
                        const isCritical = item.priority >= 2;
                        const ecart = (item.stock || 0) - (item.needs || 0);
                        const statusColor = isCritical ? '#DC3545' : '#F59E0B';
                        const statusBg = isCritical ? '#FEF2F2' : '#FFFBEB';
                        const statusLabel = item.action?.replace(/_/g, ' ') || 'RUPTURE RISQUE';
                        return (
                          <TouchableOpacity
                            key={item.id}
                            style={[
                              s.tableRow,
                              { borderLeftWidth: 3, borderLeftColor: statusColor },
                              idx % 2 === 0 ? { backgroundColor: '#FAFBFC' } : {},
                            ]}
                            onPress={() => setDrilldown('mrp')}
                          >
                            <Text style={[s.tableCellCode, { flex: isMobile ? undefined : 1.2, width: isMobile ? colW.code : undefined }]}>{item.code}</Text>
                            <Text
                              style={[s.tableCellName, { flex: isMobile ? undefined : 3, width: isMobile ? colW.article : undefined }]}
                              numberOfLines={isMobile ? 2 : 1}
                            >
                              {item.name}
                            </Text>
                            <Text style={[s.tableCellCode, { flex: isMobile ? undefined : 1, width: isMobile ? colW.num : undefined, textAlign: 'right', color: '#475569' }]}>
                              {(item.stock || 0).toLocaleString()}
                            </Text>
                            <Text style={[s.tableCellCode, { flex: isMobile ? undefined : 1, width: isMobile ? colW.num : undefined, textAlign: 'right', color: '#475569' }]}>
                              {(item.needs || 0).toLocaleString()}
                            </Text>
                            <Text style={[s.tableCellCode, { flex: isMobile ? undefined : 1, width: isMobile ? colW.num : undefined, textAlign: 'right', fontWeight: '700', color: ecart < 0 ? '#DC3545' : '#10B981' }]}>
                              {ecart >= 0 ? '+' : ''}{ecart.toLocaleString()}
                            </Text>
                            <View style={{ flex: isMobile ? undefined : 1.5, width: isMobile ? colW.statut : undefined, alignItems: 'center' }}>
                              <View style={{ backgroundColor: statusBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: statusColor + '40' }}>
                                <Text style={{ fontSize: 10, fontWeight: '800', color: statusColor }}>
                                  {statusLabel}
                                </Text>
                              </View>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>

                  {/* Bouton voir détails */}
                  <TouchableOpacity
                    onPress={() => setDrilldown('mrp')}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#6366F1' }}
                  >
                    <MaterialCommunityIcons name="chart-timeline-variant" size={18} color="#6366F1" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#6366F1' }}>
                      Voir l'analyse MRP complète ({mrpResults.length} articles)
                    </Text>
                    <MaterialCommunityIcons name="arrow-right" size={16} color="#6366F1" />
                  </TouchableOpacity>
                </View>
              );
            })()}
          </View>
        </View>
      </ScrollView>
    </AnimatedPage>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMPOSANT : Graphique Production en courbes (Objectif / Planifié / Réalisé)
// ════════════════════════════════════════════════════════════════════════════
const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const CURVE_COLORS = { objectif: '#6366F1', planifie: '#3B82F6', realise: '#10B981' };

function ProductionChart({
  forecastRaw,
  prodOrders,
  isMobile,
}: {
  forecastRaw: any[];
  prodOrders: any[];
  isMobile: boolean;
}) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = React.useState(currentYear);
  const [tooltip, setTooltip] = React.useState<{
    month: number; objectif: number; planifie: number; realise: number;
    orders: any[]; curve: 'objectif' | 'planifie' | 'realise' | null;
  } | null>(null);
  const [activeCurve, setActiveCurve] = React.useState<'objectif' | 'planifie' | 'realise' | null>(null);

  const years = React.useMemo(() => {
    const ys = new Set<number>([currentYear - 1, currentYear, currentYear + 1]);
    forecastRaw.forEach(r => ys.add(r.year));
    prodOrders.forEach((o: any) => {
      if (o.planned_date) ys.add(new Date(o.planned_date).getFullYear());
      if (o.created_at) ys.add(new Date(o.created_at).getFullYear());
    });
    return Array.from(ys).sort((a, b) => a - b);
  }, [forecastRaw, prodOrders, currentYear]);

  // Données par mois pour l'année sélectionnée
  const monthlyData = React.useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      // Objectif PDP
      const objectif = forecastRaw
        .filter(r => r.year === selectedYear && r.month === month)
        .reduce((acc, r) => acc + (r.qty || 0), 0);

      // OF planifiés (qty_planned) pour ce mois
      const ofMois = prodOrders.filter((o: any) => {
        const d = o.planned_date || o.created_at;
        if (!d) return false;
        const dt = new Date(d);
        return dt.getFullYear() === selectedYear && (dt.getMonth() + 1) === month;
      });
      const planifie = ofMois.reduce((acc: number, o: any) => acc + (o.qty_planned || 0), 0);

      // OF terminés (qty_produced) pour ce mois — statut TERMINE ou CLOTURE
      const ofTermines = prodOrders.filter((o: any) => {
        if (o.status !== 'TERMINE' && o.status !== 'CLOTURE') return false;
        const d = o.updated_at || o.planned_date;
        if (!d) return false;
        const dt = new Date(d);
        return dt.getFullYear() === selectedYear && (dt.getMonth() + 1) === month;
      });
      const realise = ofTermines.reduce((acc: number, o: any) => acc + (o.qty_produced || 0), 0);

      return { month, objectif, planifie, realise, orders: ofMois };
    });
  }, [forecastRaw, prodOrders, selectedYear]);

  const maxVal = React.useMemo(() => {
    const vals = monthlyData.flatMap(d => [d.objectif, d.planifie, d.realise]);
    return Math.max(...vals, 1);
  }, [monthlyData]);

  // Dimensions SVG web
  const W = isMobile ? 380 : 960;
  const H = 300;
  const PAD = { top: 30, right: 30, bottom: 44, left: 72 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const xPos = (i: number) => PAD.left + (i / 11) * chartW;
  const yPos = (v: number) => PAD.top + chartH - (v / maxVal) * chartH;

  // Courbe lisse via Bézier cubique (tension 0.4)
  const buildPath = (key: 'objectif' | 'planifie' | 'realise') => {
    const pts = monthlyData.map((d, i) => ({ x: xPos(i), y: yPos(d[key]) }));
    if (pts.length < 2) return '';
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const cpX = (curr.x - prev.x) * 0.4;
      d += ` C ${prev.x + cpX} ${prev.y}, ${curr.x - cpX} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    return d;
  };

  const yTicks = React.useMemo(() => {
    const steps = 6;
    return Array.from({ length: steps + 1 }, (_, i) => Math.round((i / steps) * maxVal));
  }, [maxVal]);

  const formatY = (v: number) => {
    if (v === 0) return '0';
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 10_000) return `${Math.round(v / 1_000)}k`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
    return v.toLocaleString();
  };

  const handlePointPress = (d: typeof monthlyData[0], curve: 'objectif' | 'planifie' | 'realise') => {
    if (tooltip?.month === d.month && tooltip?.curve === curve) {
      setTooltip(null);
    } else {
      setTooltip({ ...d, curve });
      setActiveCurve(curve);
    }
  };

  return (
    <View style={{ marginTop: 32 }}>
      <SectionTitle>Production — Objectif · Planifié · Réalisé</SectionTitle>
      <View style={[s.card, { padding: 0 }]}>

        {/* Header avec filtre année */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E293B' }}>
            Suivi mensuel {selectedYear}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {years.map(y => (
              <TouchableOpacity
                key={y}
                onPress={() => { setSelectedYear(y); setTooltip(null); }}
                style={{
                  paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
                  backgroundColor: y === selectedYear ? '#6366F1' : '#F1F5F9',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: y === selectedYear ? '#FFF' : '#64748B' }}>
                  {y}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Légende cliquable */}
        <View style={{ flexDirection: 'row', gap: 20, paddingHorizontal: 16, paddingTop: 12 }}>
          {(['objectif', 'planifie', 'realise'] as const).map(k => (
            <TouchableOpacity
              key={k}
              onPress={() => setActiveCurve(activeCurve === k ? null : k)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: activeCurve && activeCurve !== k ? 0.35 : 1 }}
            >
              <View style={{ width: 24, height: 3, borderRadius: 2, backgroundColor: CURVE_COLORS[k] }} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#475569' }}>
                {k === 'objectif' ? 'Objectif PDP' : k === 'planifie' ? 'Planifié (OF)' : 'Réalisé'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* SVG Graphique */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ width: W, height: H + 10, paddingBottom: 8 }}>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
              {/* Grille verticale légère */}
              {monthlyData.map((_, i) => (
                <line key={`vg-${i}`} x1={xPos(i)} y1={PAD.top} x2={xPos(i)} y2={H - PAD.bottom}
                  stroke="#F1F5F9" strokeWidth="1" />
              ))}
              {/* Grille horizontale */}
              {yTicks.map((tick, ti) => (
                <g key={`tick-${ti}`}>
                  <line
                    x1={PAD.left} y1={yPos(tick)} x2={W - PAD.right} y2={yPos(tick)}
                    stroke="#E2E8F0" strokeWidth="1" strokeDasharray="4,3"
                  />
                  <text x={PAD.left - 10} y={yPos(tick) + 4} textAnchor="end" fontSize="11" fill="#64748B" fontWeight="500">
                    {formatY(tick)}
                  </text>
                </g>
              ))}

              {/* Labels mois X */}
              {MONTHS_FR.map((m, i) => (
                <text key={m} x={xPos(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#64748B" fontWeight="600">{m}</text>
              ))}

              {/* Axe Y */}
              <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke="#E2E8F0" strokeWidth="1" />

              {/* Courbes */}
              {(['objectif', 'planifie', 'realise'] as const).map(k => (
                <path
                  key={k}
                  d={buildPath(k)}
                  fill="none"
                  stroke={CURVE_COLORS[k]}
                  strokeWidth={activeCurve && activeCurve !== k ? 1.5 : 3}
                  opacity={activeCurve && activeCurve !== k ? 0.2 : 1}
                />
              ))}

              {/* Points cliquables */}
              {monthlyData.map((d, i) => (
                <g key={`pts-${i}`}>
                  {(['objectif', 'planifie', 'realise'] as const).map(k => {
                  const isSelected = tooltip?.month === d.month && tooltip?.curve === k;
                  const isDimmed = activeCurve && activeCurve !== k;
                  return (
                    <circle
                      key={k}
                      cx={xPos(i)}
                      cy={yPos(d[k])}
                      r={isSelected ? 7 : 4}
                      fill={isSelected ? CURVE_COLORS[k] : '#FFF'}
                      stroke={CURVE_COLORS[k]}
                      strokeWidth={isSelected ? 0 : 2}
                      opacity={isDimmed ? 0.2 : 1}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handlePointPress(d, k)}
                    />
                  );
                })}
                </g>
              ))}
            </svg>
          </View>
        </ScrollView>

        {/* Tooltip détails */}
        {tooltip && (
          <View style={{ margin: 16, marginTop: 0, padding: 16, backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: CURVE_COLORS[tooltip.curve!] }} />
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#1E293B' }}>
                  {MONTHS_FR[tooltip.month - 1]} {selectedYear} — {tooltip.curve === 'objectif' ? 'Objectif PDP' : tooltip.curve === 'planifie' ? 'Planifié (OF)' : 'Réalisé'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setTooltip(null)}>
                <MaterialCommunityIcons name="close" size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* 3 valeurs */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
              {(['objectif', 'planifie', 'realise'] as const).map(k => (
                <View key={k} style={{ flex: 1, padding: 10, backgroundColor: tooltip.curve === k ? CURVE_COLORS[k] + '15' : '#FFF', borderRadius: 8, borderWidth: 1, borderColor: tooltip.curve === k ? CURVE_COLORS[k] + '40' : '#E2E8F0', alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#94A3B8', marginBottom: 4 }}>
                    {k === 'objectif' ? 'OBJECTIF' : k === 'planifie' ? 'PLANIFIÉ' : 'RÉALISÉ'}
                  </Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: CURVE_COLORS[k] }}>
                    {tooltip[k].toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>

            {/* OF du mois */}
            {tooltip.orders.length > 0 ? (
              <View>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 8 }}>
                  ORDRES DE FABRICATION ({tooltip.orders.length})
                </Text>
                {tooltip.orders.slice(0, 5).map((o: any) => (
                  <View key={o.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#F1F5F9', gap: 10 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', width: 110 }}>{o.code}</Text>
                    <Text style={{ flex: 1, fontSize: 12, color: '#64748B' }} numberOfLines={1}>{o.product?.name || '—'}</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Text style={{ fontSize: 11, color: CURVE_COLORS.planifie, fontWeight: '700' }}>
                        P: {(o.qty_planned || 0).toLocaleString()}
                      </Text>
                      {o.status === 'TERMINE' && (
                        <Text style={{ fontSize: 11, color: CURVE_COLORS.realise, fontWeight: '700' }}>
                          R: {(o.qty_produced || 0).toLocaleString()}
                        </Text>
                      )}
                    </View>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: o.status === 'TERMINE' ? '#D1FAE5' : o.status === 'EN_COURS' ? '#DBEAFE' : '#FEF3C7' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: o.status === 'TERMINE' ? '#065F46' : o.status === 'EN_COURS' ? '#1D4ED8' : '#92400E' }}>
                        {o.status}
                      </Text>
                    </View>
                  </View>
                ))}
                {tooltip.orders.length > 5 && (
                  <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 6, textAlign: 'center' }}>
                    + {tooltip.orders.length - 5} autres OF ce mois
                  </Text>
                )}
              </View>
            ) : (
              <Text style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic' }}>
                Aucun ordre de fabrication pour {MONTHS_FR[tooltip.month - 1]} {selectedYear}
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL — Routeur de rôle
// ════════════════════════════════════════════════════════════════════════════
export function DashboardScreen() {
  const { profile } = useUserProfile();
  const { t, lang } = useTranslation();
  const { width } = useWindowDimensions();
  const isMobile = width < 992;

  const now = new Date();
  const locale = lang === 'FR' ? 'fr-FR' : 'en-US';
  const dateStr = now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const role = profile?.role || '';
  const userScope = profile?.scope || 'ALL';

  // ── Routing par rôle ──────────────────────────────────────────────────────
  if (role === 'RH') {
    return <DashboardRH isMobile={isMobile} dateStr={dateStr} />;
  }

  if (role === 'COMPTA') {
    return <DashboardCOMPTA isMobile={isMobile} dateStr={dateStr} />;
  }

  if (role === 'RACH') {
    return <DashboardRACH isMobile={isMobile} dateStr={dateStr} />;
  }

  // RPROD, RESPONSABLE, OPERATEUR → vue production filtrée par scope
  if (role === 'RPROD' || role === 'RESPONSABLE' || role === 'OPERATEUR' || role === 'MAGA') {
    return <DashboardRPROD isMobile={isMobile} dateStr={dateStr} userScope={userScope} profile={profile} />;
  }

  // ADMIN, DPI, PLAN, RQ, TLAB, SUPER_ADMIN, DSI → vue globale BI complète
  return <DashboardGlobal isMobile={isMobile} dateStr={dateStr} profile={profile} />;
}

// ─── Styles partagés ─────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 24 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  title: { fontSize: 20, fontWeight: '900', color: '#1A1A1A', letterSpacing: 1 },
  subTitle: { fontSize: 13, color: '#6C757D', marginTop: 4, fontWeight: '600' },
  grid: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  mainGrid: { flexDirection: 'row', gap: 24 },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 24, ...Platform.select({ web: { boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }, default: { elevation: 2 } }) },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#495057', letterSpacing: 0.5, marginBottom: 12 },
  biRow: { flexDirection: 'row', marginBottom: 25 },
  biLabel: { fontSize: 11, fontWeight: '700', color: '#ADB5BD', marginBottom: 8, textTransform: 'uppercase' },
  tableHeader: { flexDirection: 'row', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F1F3F5', marginBottom: 12, gap: 16, paddingRight: Platform.OS === 'web' ? 8 : 0 },
  tableHeaderCell: { flex: 1, fontSize: 11, fontWeight: '800', color: '#ADB5BD', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F8F9FA', gap: 16 },
  tableCellCode: { flex: 1, fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
  tableCellName: { flex: 1, fontSize: 13, color: '#495057' },
  tableScrollArea: {
    maxHeight: 260,
    ...Platform.select({
      web: { overflowY: 'scroll' as any, overflowX: 'hidden' as any, scrollbarWidth: 'thin' as any, scrollbarColor: '#CBD5E1 #F8FAFC' as any },
      default: {},
    }),
  },
  qtyBadge: {
    backgroundColor: '#1A1A2E',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-end',
  },
  qtyBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 0.3,
  },
  depotChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  depotChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    flexShrink: 1,
  },
  alertItem: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, backgroundColor: '#F8F9FA', borderRadius: 12, marginBottom: 12 },
  alertTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  alertSub: { fontSize: 12, color: '#6C757D' },
  mrpWidget: { width: 160, marginRight: 20, padding: 16, backgroundColor: '#F8F9FA', borderRadius: 12, borderWidth: 1, borderColor: '#E9ECEF' },
  mrpWidgetCode: { fontSize: 10, fontWeight: '800', color: '#ADB5BD' },
  mrpWidgetName: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', marginTop: 4, marginBottom: 12 },
  mrpWidgetBar: { height: 4, backgroundColor: '#E9ECEF', borderRadius: 2, marginBottom: 8, overflow: 'hidden' },
  mrpWidgetFill: { height: '100%', borderRadius: 2 },
  mrpWidgetStatus: { fontSize: 10, fontWeight: '800', color: '#495057' },
  emptyState: { padding: 40, alignItems: 'center' },
  emptyText: { marginTop: 16, color: '#ADB5BD', textAlign: 'center', fontSize: 14, maxWidth: 300 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#EEF4FF', borderRadius: 8, alignSelf: 'flex-start' },
  backBtnText: { fontSize: 14, fontWeight: '700', color: C.primary },
  drillTitle: { fontSize: 22, fontWeight: '900', color: '#1A1A1A', marginBottom: 6 },
  drillSub: { fontSize: 14, color: '#6C757D', marginBottom: 24 },
  drillRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, backgroundColor: '#FFF', borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#F0F0F0', gap: 12, ...Platform.select({ web: { boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }, default: { elevation: 1 } }) },
  drillRowTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  drillRowSub: { fontSize: 12, color: '#6C757D', marginTop: 2 },
  drillRowValue: { fontSize: 16, fontWeight: '800', color: C.primary },
});
