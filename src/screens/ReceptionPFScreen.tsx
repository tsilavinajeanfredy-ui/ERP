import * as React from 'react';
import {
  ScrollView, StyleSheet, Text, View, TouchableOpacity,
  Alert, ActivityIndicator, useWindowDimensions
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  C, ActionButton, AnimatedPage, Badge, FormModal,
  FormInput, FormSelect, FormDatePicker, KpiCard
} from '../components/Ui';
import { useLots, useArticles, usePFWithBom, useMutation, useNotification, useUserProfile, usePermissions, useDepots, confirmAction } from '../lib/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../lib/i18n';
import { useSearch } from '../lib/search';
import { supabase, getNextCode, computeExpiryDate } from '../lib/supabase';
import { N } from '../lib/notifIcons';

const TABS = ['TOUT', 'EN_ATTENTE', 'QUARANTAINE', 'LIBERE', 'BLOQUE'];
const TAB_LABELS: Record<string, string> = {
  TOUT: 'TOUT',
  EN_ATTENTE: 'EN ATTENTE',
  QUARANTAINE: 'QUARANTAINE',
  LIBERE: 'LIBÉRÉ',
  BLOQUE: 'BLOQUÉ',
};

// ─── Composant : Résultat Global Contrôle Physico-Chimique ──────────────────
function FcqGlobalResult({ lotId }: { lotId: string }) {
  const [result, setResult] = React.useState<{
    label: string; color: string; icon: string;
  } | null>(null);

  React.useEffect(() => {
    if (!supabase || !lotId) return;
    let cancelled = false;

    (async () => {
      const { data: dossier } = await supabase
        .from('fcq_dossiers')
        .select('id, status, decision')
        .eq('lot_id', lotId)
        .maybeSingle();

      if (cancelled) return;

      if (!dossier || dossier.status === 'EN_ATTENTE') {
        setResult({ label: 'EN ATTENTE', color: '#F5A623', icon: 'clock' });
        return;
      }

      if (dossier.decision === 'LIBERE') {
        setResult({ label: 'CONFORME', color: '#28A745', icon: 'check' });
        return;
      }
      if (dossier.decision === 'REJETE' || dossier.decision === 'BLOQUE') {
        setResult({ label: 'NON CONFORME', color: '#DC3545', icon: 'cross' });
        return;
      }

      const { data: results } = await supabase
        .from('fcq_results')
        .select('is_conform')
        .eq('fcq_id', dossier.id);

      if (cancelled) return;

      if (!results || results.length === 0 || results.some((r: any) => r.is_conform === null)) {
        setResult({ label: 'EN ATTENTE', color: '#F5A623', icon: 'clock' });
        return;
      }

      const allConform = results.every((r: any) => r.is_conform === true);
      setResult(allConform
        ? { label: 'CONFORME', color: '#28A745', icon: 'check' }
        : { label: 'NON CONFORME', color: '#DC3545', icon: 'cross' }
      );
    })();

    return () => { cancelled = true; };
  }, [lotId]);

  if (!result) return null;

  return (
    <View style={{
      marginTop: 12, padding: 14, borderRadius: 10,
      backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#E9ECEF',
    }}>
      <Text style={{ fontSize: 10, fontWeight: '800', color: '#ADB5BD', marginBottom: 8 }}>
        ANALYSE PHYSICO-CHIMIQUE & RÉSULTATS
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 13, color: '#495057', fontWeight: '600' }}>Résultat Global Contrôle :</Text>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          backgroundColor: result.color + '20', paddingHorizontal: 10,
          paddingVertical: 4, borderRadius: 6,
        }}>
          <MaterialCommunityIcons
            name={
              result.icon === 'check' ? 'check-circle' :
              result.icon === 'cross' ? 'close-circle' :
              'clock-outline'
            }
            size={16}
            color={result.color}
          />
          <Text style={{ fontSize: 13, fontWeight: '800', color: result.color }}>{result.label}</Text>
        </View>
      </View>
    </View>
  );
}
// ────────────────────────────────────────────────────────────────────────────

export function ReceptionPFScreen() {
  const { profile } = useUserProfile();
  const notify = useNotification();
  const { t } = useTranslation();
  const { canPerformAction } = usePermissions();
  const { searchQuery } = useSearch();
  const { width } = useWindowDimensions();
  const isMobile = width < 992;

  // Fetch all lots and filter by type PF (finished product) — those with no supplier_id
  // Charger suffisamment de lots pour ne pas tronquer les PF derrière les MP
  const { data: lots = [], isPending: loading } = useLots(0, 200);
  const [activeTab, setActiveTab] = React.useState<string>('EN_ATTENTE');
  // Reset vers EN_ATTENTE à chaque fois qu'on revient sur l'écran
  useFocusEffect(
    React.useCallback(() => {
      setActiveTab('EN_ATTENTE');
    }, [])
  );
  // usePFWithBom : uniquement les PF ayant un BOM, synchronisé en temps réel
  const { data: articles = [] } = usePFWithBom();
  const { data: depots = [] } = useDepots();

  // Scope filtering logic
  const scope = profile?.scope || 'ALL';
  const filterByScope = React.useCallback((articleName: string) => {
    if (scope === 'ALL') return true;
    const name = articleName.toLowerCase();
    if (scope === 'SAVON') return name.includes('savon') || name.includes('bondillon');
    if (scope === 'PH' || scope === 'SPAH') return name.includes('papier') || name.includes('doucy') || name.includes('serviette') || name.includes('spah') || name.includes('ouate');
    if (scope === 'BOUGIE_ENCAUSTIQUE' || scope === 'BOU_ENC') return name.includes('bougie') || name.includes('encaustique');
    if (scope === 'CORDE') return name.includes('corde') || name.includes('sisal') || name.includes('nylon');
    return true;
  }, [scope]);

  const filteredArticles = React.useMemo(() => articles.filter((a: any) => filterByScope(a.name)), [articles, filterByScope]);
  const [selId, setSelId] = React.useState<string | null>(null);
  // ── Sélection multiple lots PF ──
  const [selectedPfLotIds, setSelectedPfLotIds] = React.useState<string[]>([]);
  const togglePfLotSelect = React.useCallback((id: string) => {
    setSelectedPfLotIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);
  const togglePfLotSelectAll = React.useCallback((ids: string[]) => {
    setSelectedPfLotIds((prev) => prev.length === ids.length ? [] : ids);
  }, []);
  const [modalVisible, setModalVisible] = React.useState(false);
  const [formData, setFormData] = React.useState<any>({ qty_received: '0' });
  const [editId, setEditId] = React.useState<string | null>(null);
  const isAdmin = profile?.role === 'ADMIN';

  const getScopePrefix = React.useCallback(() => {
    if (scope === 'SAVON') return 'SAV';
    if (scope === 'BOUGIE_ENCAUSTIQUE' || scope === 'BOU_ENC') return 'BOU';
    if (scope === 'CORDE') return 'COR';
    if (scope === 'PH' || scope === 'SPAH') return 'PH';
    return 'GEN'; // General
  }, [scope]);

  const mutation = useMutation('lots', () => {
    if (editId) {
      setEditId(null);
    }
    setModalVisible(false);
  });
  const deleteMutation = useMutation('lots', () => {
    // deletion feedback handled by confirmAction
  });
  const queryClient = useQueryClient();
  const [isDeletingLot, setIsDeletingLot] = React.useState(false);

  const deleteLotCascade = async (lot: any) => {
    if (!supabase) return;
    setIsDeletingLot(true);
    try {
      // 1. FCQ : supprimer fcq_results puis fcq_dossiers
      const { data: fcqDossiers = [], error: fcqErr } = await supabase
        .from('fcq_dossiers').select('id').eq('lot_id', lot.id);
      if (fcqErr) throw fcqErr;
      for (const dossier of (fcqDossiers as any[])) {
        // Supprimer les enfants du dossier FCQ
        const { error: resErr } = await supabase.from('fcq_results').delete().eq('fcq_id', dossier.id);
        if (resErr) throw resErr;
        const { error: fncFcqErr } = await supabase.from('fnc').delete().eq('fcq_id', dossier.id);
        if (fncFcqErr) throw fncFcqErr;
        const { error: qtlErr } = await supabase.from('quality_traceability_logs').delete().eq('fcq_id', dossier.id);
        if (qtlErr) throw qtlErr;
        // Supprimer le dossier FCQ
        const { error: dosErr } = await supabase.from('fcq_dossiers').delete().eq('id', dossier.id);
        if (dosErr) throw dosErr;
      }

      // 2. FNC liées au lot
      const { error: fncErr } = await supabase.from('fnc').delete().eq('lot_id', lot.id);
      if (fncErr) throw fncErr;

      // 3. Mouvements de stock
      const { error: mvtErr } = await supabase.from('stock_movements').delete().eq('lot_id', lot.id);
      if (mvtErr) throw mvtErr;

      // 4. Comptages inventaire
      const { error: invErr } = await supabase.from('inventory_counts').delete().eq('lot_id', lot.id);
      if (invErr) throw invErr;

      // 5. Réclamations
      const { error: compErr } = await supabase.from('complaints').delete().eq('lot_id', lot.id);
      if (compErr) throw compErr;

      // 6. Lots enfants (parent_lot_id)
      const { error: childErr } = await supabase.from('lots').update({ parent_lot_id: null }).eq('parent_lot_id', lot.id);
      if (childErr) throw childErr;

      // 7. Supprimer le lot
      const { error: lotErr } = await supabase.from('lots').delete().eq('id', lot.id);
      if (lotErr) throw lotErr;

      await queryClient.refetchQueries({ queryKey: ['lots'] });
      queryClient.invalidateQueries({ queryKey: ['fcq_dossiers'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      setSelId(null);
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Erreur lors de la suppression du lot.');
    } finally {
      setIsDeletingLot(false);
    }
  };

  // Note : la création du dossier FCQ est gérée automatiquement par le trigger
  // SQL tr_auto_create_fcq_dossier (migration 044) — pas besoin de le créer en front.

  const handleDeleteSelectedPfLots = () => {
    if (selectedPfLotIds.length === 0) return;
    const sel = pfLots.filter((l: any) => selectedPfLotIds.includes(l.id));
    confirmAction(
      'Supprimer les lots PF sélectionnés',
      `Supprimer définitivement ${sel.length} lot${sel.length > 1 ? 's' : ''} PF ?\n\n${sel.slice(0, 5).map((l: any) => l.code).join(', ')}${sel.length > 5 ? '...' : ''}\n\nCette action est irréversible.`,
      async () => {
        setIsDeletingLot(true);
        try {
          for (const lot of sel) {
            // FCQ cascade
            const { data: dossiers = [] } = await supabase!.from('fcq_dossiers').select('id').eq('lot_id', lot.id);
            for (const d of (dossiers as any[])) {
              await supabase!.from('fnc').delete().eq('fcq_id', d.id);
              await supabase!.from('fcq_results').delete().eq('fcq_id', d.id);
              await supabase!.from('quality_traceability_logs').delete().eq('fcq_id', d.id);
              await supabase!.from('fcq_dossiers').delete().eq('id', d.id);
            }
            await supabase!.from('fnc').delete().eq('lot_id', lot.id);
            await supabase!.from('stock_movements').delete().eq('lot_id', lot.id);
            await supabase!.from('inventory_counts').delete().eq('lot_id', lot.id);
            await supabase!.from('complaints').delete().eq('lot_id', lot.id);
            await supabase!.from('lots').update({ parent_lot_id: null }).eq('parent_lot_id', lot.id);
            await supabase!.from('lots').delete().eq('id', lot.id);
          }
          await queryClient.refetchQueries({ queryKey: ['lots'] });
          queryClient.invalidateQueries({ queryKey: ['fcq_dossiers'] });
          queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
          setSelectedPfLotIds([]);
          setSelId(null);
        } catch (err: any) {
          Alert.alert('Erreur', err?.message || 'Erreur lors de la suppression des lots PF.');
        } finally {
          setIsDeletingLot(false);
        }
      }
    ,
    'danger'
  );
  };

  const normalizeStatus = (value?: string) => String(value || '').trim().toUpperCase();

  const pfLots = lots.filter((l: any) => {
    const isPF = l.article?.article_type === 'PF';
    const matchesTab = activeTab === 'TOUT' || normalizeStatus(l.cqlib_status) === normalizeStatus(activeTab);
    const matchesSearch =
      (l.code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.article?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.origin || '').toLowerCase().includes(searchQuery.toLowerCase());
    return isPF && matchesTab && matchesSearch;
  });

  const handleAdd = async () => {
    const year = new Date().getFullYear();
    const scopePrefix = getScopePrefix();
    
    let rpfCode = `RPF-${scopePrefix}-${year}-PEND`;
    let ofCode = `OF-${scopePrefix}-${year}-PEND`;
    let lotCode = `LOT-${scopePrefix}-${year}-PEND`;

    try {
      rpfCode = await getNextCode(`RPF-${scopePrefix}`, 'lots', 'code');
      const parts = rpfCode.split('-');
      const sequenceNum = parts[parts.length - 1] || '001';
      ofCode = `OF-${scopePrefix}-${year}-${sequenceNum}`;
      lotCode = `LOT-${scopePrefix}-${year}-${sequenceNum}`;
    } catch {}
    
    setFormData({
      code: rpfCode,
      qty_received: '0',
      qty_current: '0',
      unit: 'kg',
      cqlib_status: 'EN_ATTENTE',
      reception_date: new Date().toISOString().split('T')[0],
      of_number: ofCode,
      supplier_lot: lotCode,
    });
    setEditId(null);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.article_id || parseFloat(formData.qty_received) <= 0) {
      Alert.alert('Données invalides', "L'article et une quantité positive sont requis.");
      return;
    }

    const prepareValues = async () => {
      const scopePrefix = getScopePrefix();
      const year = new Date().getFullYear();
      let finalCode = formData.code;
      if (!editId) {
        try {
          finalCode = await getNextCode(`RPF-${scopePrefix}`, 'lots', 'code');
        } catch {
          // fallback: garde le code affiché dans le formulaire
        }
      }
      return {
        code: finalCode,
        article_id: formData.article_id,
        depot_id: formData.depot_id || null,
        unit: formData.unit || 'kg',
        qty_received: parseFloat(formData.qty_received) || 0,
        qty_current: parseFloat(formData.qty_received) || 0,
        cqlib_status: 'EN_ATTENTE',
        reception_date: formData.reception_date || new Date().toISOString().split('T')[0],
        expiry_date: computeExpiryDate(
          formData.reception_date || new Date().toISOString().split('T')[0],
          articles.find((a: any) => a.id === formData.article_id)?.shelf_life_days
        ),
        batch_supplier: formData.supplier_lot || null,
        // ── Lien OF structuré (migration 073) ──
        of_number: formData.of_number || null,
        origin: formData.of_number || null,   // renseigné aussi dans origin pour rétrocompat
      };
    };

    const values = await prepareValues();
    if (editId) {
      mutation.mutate({ id: editId, values, type: 'UPDATE' });
    } else {
      mutation.mutate({ values, type: 'INSERT' });
      // Notifier le magasinier qu'un nouveau lot est en attente de validation
      notify.mutate({
        to_role: 'MAGA',
        subject: N.lot + ' Nouveau lot PF a valider',
        message: `Un nouveau lot de réception PF ${values.code} est EN ATTENTE de votre validation${profile?.full_name ? ' (créé par ' + profile.full_name + ')' : ''}.`,
        type: 'internal',
        category: 'STOCK',
        metadata: { category: 'STOCK', screen: 'ReceptionPF' },
      });
      notify.mutate({
        to_role: 'ADMIN',
        subject: 'Nouvelle réception PF enregistrée',
        message: `Un nouveau lot de réception PF a été créé${profile?.full_name ? ' par ' + profile.full_name : ''} : ${values.code}`,
        type: 'internal',
        category: 'STOCK',
        metadata: { category: 'STOCK', screen: 'ReceptionPF' },
      });
    }
  };

  const articleOptions = filteredArticles.map((a: any) => ({ label: a.name, value: a.id }));
  const depotOptions = depots.map((d: any) => ({ label: `${d.code} - ${d.name}`, value: d.id }));
  const unitOptions = [
    { label: 'kg', value: 'kg' },
    { label: 'L', value: 'L' },
    { label: 'unité', value: 'unité' },
    { label: 'carton', value: 'carton' },
    { label: 'palette', value: 'palette' },
    { label: 'caisse', value: 'caisse' },
  ];

  // KPIs filtered to PF lots only
  const pfLotsAll = lots.filter((l: any) => l.article?.article_type === 'PF');
  const kpiAll = pfLotsAll.length;
  const kpiEA = pfLotsAll.filter((l: any) => l.cqlib_status === 'EN_ATTENTE').length;
  const kpiQ = pfLotsAll.filter((l: any) => l.cqlib_status === 'QUARANTAINE').length;
  const kpiLib = pfLotsAll.filter((l: any) => l.cqlib_status === 'LIBERE').length;
  const kpiBlq = pfLotsAll.filter((l: any) => l.cqlib_status === 'BLOQUE').length;

  return (
    <AnimatedPage>
      <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.title}>{t('reception_pf_title')}</Text>
            <Text style={s.subtitle}>{t('reception_pf_sub')}</Text>
          </View>
          {canPerformAction('create_lot') && (
            <ActionButton
              label={t("new_rpf")}
              icon="plus"
              onPress={handleAdd}
              color={C.primary}
            />
          )}
        </View>

        {/* KPI Cards */}
        <View style={s.kpiRow}>
          <KpiCard label="Total Lots PF" value={kpiAll > 0 ? String(kpiAll) : ''} icon="package-variant" color={C.primary} />
          <KpiCard label="En Attente" value={kpiEA > 0 ? String(kpiEA) : ''} icon="clock-outline" color="#F5A623" />
          <KpiCard label="En Quarantaine" value={kpiQ > 0 ? String(kpiQ) : ''} icon="lock-outline" color={C.gold} />
          <KpiCard label="Libérés" value={kpiLib > 0 ? String(kpiLib) : ''} icon="check-circle-outline" color={C.ok} />
          <KpiCard label="Bloqués" value={kpiBlq > 0 ? String(kpiBlq) : ''} icon="close-circle-outline" color={C.danger} />
        </View>

        {/* Workflow notice */}
        <View style={s.quarantineNotice}>
          <MaterialCommunityIcons name="information-outline" size={20} color={C.gold} />
          <Text style={s.quarantineText}>
            Flux : Planification → Clôture → <Text style={{ fontWeight: '800' }}>EN ATTENTE</Text> (magasinier valide) → <Text style={{ fontWeight: '800' }}>QUARANTAINE</Text> (labo + RQ analysent) → <Text style={{ fontWeight: '800' }}>LIBÉRÉ</Text> ou <Text style={{ fontWeight: '800' }}>BLOQUÉ</Text>.
          </Text>
        </View>

        {/* Tabs */}
        <View style={s.tabs}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab}
              style={[s.tab, activeTab === tab && s.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
                {TAB_LABELS[tab] || tab}
              </Text>
              {tab === 'EN_ATTENTE' && pfLotsAll.filter((l: any) => l.cqlib_status === 'EN_ATTENTE').length > 0 && (
                <View style={{
                  backgroundColor: '#F5A623', borderRadius: 10,
                  minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center',
                  marginLeft: 6, paddingHorizontal: 4,
                }}>
                  <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>
                    {pfLotsAll.filter((l: any) => l.cqlib_status === 'EN_ATTENTE').length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Lots List */}
        {loading ? (
          <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
        ) : pfLots.length === 0 ? (
          <View style={s.empty}>
            <MaterialCommunityIcons name="package-variant-closed" size={48} color="#CCC" />
            <Text style={s.emptyText}>{t('no_pf_lots')}</Text>
          </View>
        ) : (
          <View style={s.list}>
            {/* Header sélection tout */}
            {pfLots.length > 0 && (
              <TouchableOpacity
                onPress={() => togglePfLotSelectAll(pfLots.map((l: any) => l.id))}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  backgroundColor: '#F8F9FA',
                  borderRadius: 8,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: '#E9ECEF',
                }}
              >
                <MaterialCommunityIcons
                  name={
                    pfLots.length > 0 && pfLots.every((l: any) => selectedPfLotIds.includes(l.id))
                      ? 'checkbox-marked'
                      : pfLots.some((l: any) => selectedPfLotIds.includes(l.id))
                        ? 'minus-box'
                        : 'checkbox-blank-outline'
                  }
                  size={18}
                  color={selectedPfLotIds.length > 0 ? '#2563EB' : '#94A3B8'}
                />
                <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '600' }}>
                  {selectedPfLotIds.length > 0
                    ? `${selectedPfLotIds.length} lot(s) PF sélectionné(s) — Désélectionner tout`
                    : `Sélectionner tous les lots PF (${pfLots.length})`}
                </Text>
              </TouchableOpacity>
            )}
            {pfLots.map((lot: any) => {
              const isSelected = selId === lot.id;
              const isChecked = selectedPfLotIds.includes(lot.id);
              const statusColor =
                lot.cqlib_status === 'EN_ATTENTE' ? '#F5A623' :
                lot.cqlib_status === 'QUARANTAINE' ? C.gold :
                lot.cqlib_status === 'LIBERE' ? C.ok :
                lot.cqlib_status === 'BLOQUE' ? C.danger : C.info;

              return (
                <View key={lot.id} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
                  <TouchableOpacity
                    onPress={() => togglePfLotSelect(lot.id)}
                    style={{ paddingTop: 16, paddingHorizontal: 4 }}
                  >
                    <MaterialCommunityIcons
                      name={isChecked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                      size={18}
                      color={isChecked ? '#2563EB' : '#CBD5E1'}
                    />
                  </TouchableOpacity>
                <TouchableOpacity
                  style={[s.card, { flex: 1 }, isSelected && s.cardSelected, isChecked && !isSelected && { borderColor: '#93C5FD', borderWidth: 1.5 }]}
                  onPress={() => setSelId(isSelected ? null : lot.id)}
                >
                  <View style={s.cardHeader}>
                    <View style={s.cardLeft}>
                      <View style={[s.statusDot, { backgroundColor: statusColor }]} />
                      <View>
                        <Text style={s.cardCode}>{lot.code}</Text>
                        <Text style={s.cardArticle}>{lot.article?.name || '—'}</Text>
                      </View>
                    </View>
                    <Badge
                      label={lot.cqlib_status || 'N/A'}
                      color={statusColor}
                    />
                  </View>

                  <View style={s.cardMeta}>
                    <View style={s.metaItem}>
                      <MaterialCommunityIcons name="scale" size={14} color="#888" />
                      <Text style={s.metaText}>{lot.qty_current ?? lot.qty_received ?? 0} {lot.unit}</Text>
                    </View>
                    <View style={s.metaItem}>
                      <MaterialCommunityIcons name="calendar" size={14} color="#888" />
                      <Text style={s.metaText}>{lot.reception_date || '—'}</Text>
                    </View>
                    {lot.depot && (
                      <View style={s.metaItem}>
                        <MaterialCommunityIcons name="warehouse" size={14} color="#888" />
                        <Text style={s.metaText}>{lot.depot.code}</Text>
                      </View>
                    )}
                  </View>

                  {isSelected && (
                    <View style={s.cardDetail}>
                      {canPerformAction('create_lot') && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-start' }}>
                          {lot.cqlib_status === 'EN_ATTENTE' && (
                            <View style={{ marginRight: 8, marginBottom: 8 }}>
                              <ActionButton
                                label="Valider → Quarantaine"
                                icon="check-circle-outline"
                                variant="primary"
                                color={C.gold}
                                onPress={() => {
                                  confirmAction(
                                    'Valider la réception',
                                    `Placer le lot "${lot.code}" en QUARANTAINE pour contrôle qualité ?`,
                                    () => {
                                      mutation.mutate({ id: lot.id, values: { cqlib_status: 'QUARANTAINE' }, type: 'UPDATE' }, {
                                        onSuccess: async () => {
                                          // Le trigger SQL crée le dossier FCQ automatiquement
                                          // Forcer le rechargement immédiat des lots
                                          await queryClient.refetchQueries({ queryKey: ['lots'] });
                                          // Basculer vers l'onglet QUARANTAINE pour voir le lot
                                          setActiveTab('QUARANTAINE');
                                          setSelId(null);
                                        }
                                      });
                                      notify.mutate({
                                        to_role: 'TLAB',
                                        subject: N.lab + ' Lot en quarantaine — analyse requise',
                                        message: `Le lot ${lot.code} (${lot.article?.name || ''}) a été validé par le magasinier et placé en QUARANTAINE. Veuillez procéder au contrôle qualité.`,
                                        type: 'internal',
                                        category: 'QUALITY',
                                        metadata: { category: 'QUALITY', screen: 'ReceptionPF', lot_id: lot.id },
                                      });
                                      notify.mutate({
                                        to_role: 'RQ',
                                        subject: N.lab + ' Lot en quarantaine — controle qualite',
                                        message: `Le lot ${lot.code} (${lot.article?.name || ''}) est en attente de contrôle qualité laboratoire.`,
                                        type: 'internal',
                                        category: 'QUALITY',
                                        metadata: { category: 'QUALITY', screen: 'ReceptionPF', lot_id: lot.id },
                                      });
                                    }
                                  ,
    'success'
  );
                                }}
                              />
                            </View>
                          )}
                          <View style={{ marginRight: 8, marginBottom: 8 }}>
                            <ActionButton
                              label="Modifier"
                              icon="pencil-outline"
                              variant="secondary"
                              onPress={() => {
                                setEditId(lot.id);
                                setFormData({
                                  ...lot,
                                  qty_received: String(lot.qty_received || 0),
                                  unit: lot.unit || 'kg',
                                });
                                setModalVisible(true);
                              }}
                            />
                          </View>
                          <View style={{ marginRight: 8, marginBottom: 8 }}>
                            <ActionButton
                              label={isDeletingLot ? 'Suppression...' : 'Supprimer'}
                              icon="trash-can-outline"
                              disabled={isDeletingLot || deleteMutation.isPending}
                              onPress={() => {
                                confirmAction(
                                  'Supprimer le lot',
                                  `Êtes-vous sûr de vouloir supprimer "${lot.code}" ? Cette action est irréversible.`,
                                  () => deleteLotCascade(lot)
                                ,
    'danger'
  );
                              }}
                            />
                          </View>
                        </View>
                      )}
                      {/* Grille de détails — affichage en 2 colonnes fixes */}
                      {[
                        { label: t('internal_lot_number'), value: lot.code },
                        { label: t('article_label'), value: lot.article?.name || '—' },
                        { label: t('qty_received'), value: `${lot.qty_received ?? 0} ${lot.unit || 'kg'}` },
                        { label: t('reception_date'), value: lot.reception_date || '—' },
                        { label: t('cq_status'), value: lot.cqlib_status, highlight: statusColor },
                        ...(lot.notes ? [{ label: t('observations'), value: lot.notes }] : []),
                      ].map((row, i) => (
                        <View key={i} style={{ flexDirection: 'row', marginBottom: 8, gap: 8 }}>
                          <Text style={{ fontSize: 13, color: '#888', width: 130, flexShrink: 0 }}>{row.label}</Text>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: (row as any).highlight || C.primary, flex: 1, flexWrap: 'wrap' }}>{row.value}</Text>
                        </View>
                      ))}
                      <View style={[s.quarantineNotice, { marginTop: 12, marginHorizontal: 0 }]}>
                        <MaterialCommunityIcons name="information-outline" size={16} color={C.gold} />
                        <Text style={[s.quarantineText, { fontSize: 12 }]}>
                          {t('liberation_lab_only')}
                        </Text>
                      </View>
                      {/* Résultat Global FCQ */}
                      <FcqGlobalResult lotId={lot.id} />
                    </View>
                  )}
                </TouchableOpacity>
                </View>
              );
            })}
            {/* Barre d'actions sélection PF */}
            {selectedPfLotIds.length > 0 && (
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#1E40AF',
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 10,
                marginTop: 8,
                gap: 8,
              }}>
                <MaterialCommunityIcons name="package-variant-closed" size={16} color="#93C5FD" />
                <Text style={{ color: '#FFF', fontWeight: '700', flex: 1, fontSize: 12 }}>
                  {selectedPfLotIds.length} lot PF sélectionné{selectedPfLotIds.length > 1 ? 's' : ''}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    const sel = pfLots.filter((l: any) => selectedPfLotIds.includes(l.id));
                    Alert.alert('Lots PF sélectionnés', sel.slice(0, 5).map((l: any) => `${l.code} · ${l.cqlib_status}`).join('\n'));
                  }}
                  style={{ backgroundColor: '#3B82F6', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}
                >
                  <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '600' }}>Détail</Text>
                </TouchableOpacity>
                {isAdmin && (
                  <TouchableOpacity
                    onPress={handleDeleteSelectedPfLots}
                    disabled={isDeletingLot}
                    style={{ backgroundColor: '#DC2626', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 3, opacity: isDeletingLot ? 0.5 : 1 }}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={13} color="#FFF" />
                    <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '600' }}>{isDeletingLot ? '...' : 'Supprimer'}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => setSelectedPfLotIds([])}
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}
                >
                  <Text style={{ color: '#FFF', fontSize: 11 }}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* New RPF Modal */}
      <FormModal
        visible={modalVisible}
        title={t("rpf_modal_title")}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
        loading={mutation.isPending}
      >
        <FormInput
          label="N° Réception PF"
          value={formData.code || ''}
          onChangeText={v => setFormData((p: any) => ({ ...p, code: v }))}
          placeholder="RPF-2026-001"
        />
        <FormSelect
          label="Article (Produit Fini) *"
          value={formData.article_id || ''}
          onSelect={v => setFormData((p: any) => ({ ...p, article_id: v }))}
          options={articleOptions}
        />
        <FormSelect
          label="Unité *"
          value={formData.unit || ''}
          onSelect={v => setFormData((p: any) => ({ ...p, unit: v }))}
          options={unitOptions}
        />
        <FormInput
          label="Quantité reçue *"
          value={String(formData.qty_received || '')}
          onChangeText={v => setFormData((p: any) => ({ ...p, qty_received: v }))}
          placeholder="0"
          keyboardType="numeric"
        />
        <FormInput
          label="N° Ordre de Fabrication (OF)"
          value={formData.of_number || ''}
          onChangeText={v => setFormData((p: any) => ({ ...p, of_number: v }))}
          placeholder="OF-2026-001"
        />
        <FormInput
          label="N° Lot de production"
          value={formData.supplier_lot || ''}
          onChangeText={v => setFormData((p: any) => ({ ...p, supplier_lot: v }))}
          placeholder="LOT-PF-2026-..."
        />
        <FormDatePicker
          label="Date de réception"
          value={formData.reception_date || ''}
          onChangeDate={v => setFormData((p: any) => ({ ...p, reception_date: v }))}
        />
        <FormSelect
          label="Dépôt de destination"
          value={formData.depot_id || ''}
          onSelect={v => setFormData((p: any) => ({ ...p, depot_id: v }))}
          options={depotOptions}
        />
        <FormInput
          label="Observations"
          value={formData.notes || ''}
          onChangeText={v => setFormData((p: any) => ({ ...p, notes: v }))}
          placeholder="Remarques sur le produit..."
          multiline
        />
        {/* EN_ATTENTE reminder inside modal */}
        <View style={[s.quarantineNotice, { marginHorizontal: 0, marginTop: 8 }]}>
          <MaterialCommunityIcons name="clock-outline" size={16} color={C.gold} />
          <Text style={[s.quarantineText, { fontSize: 12 }]}>
            Ce lot sera créé en <Text style={{ fontWeight: '800' }}>EN ATTENTE</Text>. Le magasinier devra le valider avant le passage en QUARANTAINE pour contrôle qualité.
          </Text>
        </View>
      </FormModal>
    </AnimatedPage>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: 24, paddingBottom: 16,
  },
  title: { fontSize: 22, fontWeight: '800', color: C.primary },
  subtitle: { fontSize: 13, color: '#888', marginTop: 4 },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 12, marginBottom: 16 },
  quarantineNotice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#FFF9E6', borderWidth: 1, borderColor: '#F5C842',
    borderRadius: 8, padding: 12, marginHorizontal: 16, marginBottom: 16,
  },
  quarantineText: { flex: 1, fontSize: 13, color: '#7D6200', lineHeight: 19 },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  tab: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#F0F0F0',
    flexDirection: 'row', alignItems: 'center',
  },
  tabActive: { backgroundColor: C.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: '#666' },
  tabTextActive: { color: '#FFF' },
  list: { paddingHorizontal: 16, gap: 10 },
  card: {
    backgroundColor: '#FFF', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#E8E8E8',
  },
  cardSelected: { borderColor: C.primary, borderWidth: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  cardCode: { fontSize: 14, fontWeight: '700', color: C.primary },
  cardArticle: { fontSize: 12, color: '#888', marginTop: 2 },
  cardMeta: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: '#888' },
  cardDetail: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  detailLabel: { fontSize: 13, color: '#888' },
  detailValue: { fontSize: 13, fontWeight: '600', color: C.primary, maxWidth: '60%', textAlign: 'right' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 15, color: '#AAA', marginTop: 12 },
});
