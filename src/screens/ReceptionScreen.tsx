import * as React from 'react';
import { ScrollView, StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, useWindowDimensions, Image, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, ActionButton, AnimatedPage, Badge, KpiCard, FormModal, FormInput, FormSelect, FormDatePicker } from '../components/Ui';
import { supabase, getNextCode } from '../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useLots, useArticles, useSuppliers, useDepots, useMutation, useUserProfile, usePermissions, useBonsEntree, confirmAction } from '../lib/hooks';
import { useTranslation } from '../lib/i18n';
import { useSearch } from '../lib/search';
import { playNotificationSound } from '../lib/notificationSound';
import { N } from '../lib/notifIcons';

// Workflow MP : réception → QUARANTAINE directe (contrôle FCQ) → LIBERE | BLOQUE
// (L'étape EN_ATTENTE est réservée à la clôture OF → PF via ReceptionPFScreen)
const TABS = ['TOUT', 'EN_ATTENTE', 'QUARANTAINE', 'LIBERE', 'BLOQUE', 'BONS'];
const TAB_LABELS: Record<string, string> = {
  TOUT: 'TOUT',
  EN_ATTENTE: 'EN ATTENTE',
  QUARANTAINE: 'QUARANTAINE',
  LIBERE: 'LIBÉRÉ',
  BLOQUE: 'BLOQUÉ',
  BONS: 'BONS',
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
      // 1. Récupérer le dossier FCQ du lot
      const { data: dossier } = await supabase
        .from('fcq_dossiers')
        .select('id, status, decision')
        .eq('lot_id', lotId)
        .maybeSingle();

      if (cancelled) return;

      if (!dossier) {
        setResult({ label: 'EN ATTENTE', color: '#F5A623', icon: 'clock' });
        return;
      }

      // 2. Si dossier EN_ATTENTE → toujours EN ATTENTE (pas CONFORME)
      if (dossier.status === 'EN_ATTENTE') {
        setResult({ label: 'EN ATTENTE', color: '#F5A623', icon: 'clock' });
        return;
      }

      // 3. Décision explicite du dossier
      if (dossier.decision === 'LIBERE') {
        setResult({ label: 'CONFORME', color: '#28A745', icon: 'check' });
        return;
      }
      if (dossier.decision === 'REJETE' || dossier.decision === 'BLOQUE') {
        setResult({ label: 'NON CONFORME', color: '#DC3545', icon: 'cross' });
        return;
      }

      // 4. Analyser les résultats individuels
      const { data: results } = await supabase
        .from('fcq_results')
        .select('is_conform')
        .eq('fcq_id', dossier.id);

      if (cancelled) return;

      if (!results || results.length === 0) {
        setResult({ label: 'EN ATTENTE', color: '#F5A623', icon: 'clock' });
        return;
      }

      const hasNull = results.some(r => r.is_conform === null);
      if (hasNull) {
        setResult({ label: 'EN ATTENTE', color: '#F5A623', icon: 'clock' });
        return;
      }

      const allConform = results.every(r => r.is_conform === true);
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
      marginTop: 16, padding: 16, borderRadius: 10,
      backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#E9ECEF',
    }}>
      <Text style={{ fontSize: 11, fontWeight: '800', color: '#ADB5BD', marginBottom: 8 }}>
        2. ANALYSE PHYSICO-CHIMIQUE & RÉSULTATS
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

export function ReceptionScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 992;
  const { t } = useTranslation();
  const { profile } = useUserProfile();
  const { canPerformAction } = usePermissions();
  const { searchQuery } = useSearch();
  const [activeTab, setActiveTab] = React.useState(TABS[2]); // QUARANTAINE par défaut (les lots MP arrivent directement ici)
  const { data: lots = [], isPending: loading } = useLots();
  const { data: articles = [] } = useArticles(0, 500, 'MP');
  const { data: suppliers = [] } = useSuppliers();
  const { data: depots = [] } = useDepots();
  const { data: bonsEntree = [] } = useBonsEntree();
  const [selId, setSelId] = React.useState<string | null>(null);
  const [modalVisible, setModalVisible] = React.useState(false);
  const [beModalVisible, setBeModalVisible] = React.useState(false);
  const [qrModalVisible, setQrModalVisible] = React.useState(false);
  const [formData, setFormData] = React.useState<any>({ qty_received: '0' });
  const [beFormData, setBeFormData] = React.useState<any>({});
  const [isSavingBE, setIsSavingBE] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<null | 'lot' | 'be'>(null);
  const [editId, setEditId] = React.useState<string | null>(null);

  const queryClient = useQueryClient();
  const lotMutation = useMutation('lots', () => {
    setModalVisible(false);
    setEditTarget(null);
    setEditId(null);
  });
  const beMutation = useMutation('bons_entree', () => {
    setBeModalVisible(false);
    setEditTarget(null);
    setEditId(null);
  });

  /**
   * Suppression en cascade d'un bon d'entrée :
   * 1. Vérifie s'il y a des lots liés
   * 2. Si oui, demande confirmation explicite "supprimer aussi les X lots"
   * 3. Supprime les lots en premier (évite FK 23503), puis le BE
   */
  /** Affiche un toast d'erreur rouge (réutilise le même style que useMutation). */
  const showErrorToast = (msg: string) => {
    if (typeof document === 'undefined') return;
    const existing = document.getElementById('erp-hook-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'erp-hook-toast';
    toast.innerHTML = `<div style="position:fixed;bottom:24px;right:24px;z-index:99999;background:#DC2626;color:#fff;padding:14px 20px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.25);font-family:system-ui,sans-serif;font-size:14px;font-weight:600;display:flex;align-items:center;gap:10px;max-width:420px;"><span style="font-size:18px">❌</span><span>${msg}</span></div>`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity='0'; toast.style.transition='opacity 0.3s'; setTimeout(()=>toast.remove(),300); }, 5000);
  };

  /**
   * Suppression en cascade complète d'un bon d'entrée :
   *   fcq_results → fcq_dossiers → lots → bons_entree
   */
  const handleDeleteBe = async (be: any) => {
    if (!supabase) return;
    const linkedLots = lots.filter((l: any) => l.bon_entree_id === be.id);

    const doDelete = async () => {
      try {
        for (const lot of linkedLots) {
          // 1. Récupérer les dossiers FCQ liés au lot
          const { data: fcqDossiers, error: fcqFetchErr } = await supabase!
            .from('fcq_dossiers')
            .select('id')
            .eq('lot_id', lot.id);
          if (fcqFetchErr) throw fcqFetchErr;

          for (const dossier of (fcqDossiers || [])) {
            // 2. Supprimer les résultats FCQ (fcq_results → fcq_dossiers)
            const { error: resErr } = await supabase!
              .from('fcq_results')
              .delete()
              .eq('fcq_id', dossier.id);
            if (resErr) throw resErr;

            // 3. Supprimer le dossier FCQ (fcq_dossiers → lots)
            const { error: dosErr } = await supabase!
              .from('fcq_dossiers')
              .delete()
              .eq('id', dossier.id);
            if (dosErr) throw dosErr;
          }

          // 4. Supprimer le lot (lots → bons_entree)
          const { error: lotErr } = await supabase!.from('lots').delete().eq('id', lot.id);
          if (lotErr) throw lotErr;
        }

        // 5. Supprimer le bon d'entrée
        beMutation.mutate({ id: be.id, type: 'DELETE' });
        setSelId(null);
      } catch (err: any) {
        showErrorToast(err?.message || 'Erreur lors de la suppression en cascade.');
      }
    };

    // Compter les dossiers FCQ pour informer l'utilisateur
    let fcqCount = 0;
    if (linkedLots.length > 0 && supabase) {
      const lotIds = linkedLots.map((l: any) => l.id);
      const { count } = await supabase
        .from('fcq_dossiers')
        .select('id', { count: 'exact', head: true })
        .in('lot_id', lotIds);
      fcqCount = count || 0;
    }

    const lotStr = linkedLots.length > 0
      ? `\n• ${linkedLots.length} lot${linkedLots.length > 1 ? 's' : ''}`
      : '';
    const fcqStr = fcqCount > 0
      ? `\n• ${fcqCount} dossier${fcqCount > 1 ? 's' : ''} FCQ et leurs résultats`
      : '';

    if (linkedLots.length > 0 || fcqCount > 0) {
      confirmAction(
        'Supprimer le bon d\'entrée',
        `⚠️ Cette suppression entraînera la suppression définitive de :${lotStr}${fcqStr}\n\nConfirmer la suppression de "${be.code}" ?`,
        doDelete
      );
    } else {
      confirmAction(
        'Supprimer le bon d\'entrée',
        `Êtes-vous sûr de vouloir supprimer "${be.code}" ? Cette action est irréversible.`,
        doDelete
      );
    }
  };
  const isAdmin = profile?.role === 'ADMIN';

  // ─── Crée automatiquement un dossier FCQ pour un lot en quarantaine ─────────
  const createFcqDossierForLot = async (lotId: string) => {
    if (!supabase) return;
    try {
      const { data: existing } = await supabase.from('fcq_dossiers').select('id').eq('lot_id', lotId).maybeSingle();
      if (existing) return;
      const fcqCode = await getNextCode('FCQ', 'fcq_dossiers', 'code', 4);
      await supabase.from('fcq_dossiers').insert({
        code: fcqCode,
        lot_id: lotId,
        fcq_type: 'MP',
        status: 'EN_ATTENTE',
      });
      queryClient.invalidateQueries({ queryKey: ['fcq_dossiers'] });
    } catch (e: any) {
      console.warn('Création dossier FCQ auto échouée :', e.message);
    }
  };

  const filteredLots = (activeTab === 'BONS' ? [] : lots).filter(l => {
    const isMP = l.article?.article_type === 'MP';
    const matchesTab = activeTab === 'TOUT' || l.cqlib_status === activeTab;
    const matchesSearch =
      (l.code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.article?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    return isMP && matchesTab && matchesSearch;
  });

  const filteredBEs = activeTab === 'BONS'
    ? bonsEntree
    : activeTab === 'EN_ATTENTE'
    ? bonsEntree.filter((be: any) => be.status === 'EN_ATTENTE')
    : activeTab === 'QUARANTAINE'
    ? bonsEntree.filter((be: any) => be.status === 'QUARANTAINE')
    : [];

  const selectedLot = lots.find(l => l.id === selId);
  const selectedBe = bonsEntree.find((b: any) => b.id === selId);

  const handleAdd = async () => {
    const generatedCode = await getNextCode('L', 'lots', 'code');
    setFormData({ code: generatedCode, qty_received: '0', qty_current: '0', unit: 'kg', reception_date: new Date().toISOString().split('T')[0] });
    setEditTarget(null);
    setEditId(null);
    setModalVisible(true);
  };

  const handleAddBE = async () => {
    const generatedCode = await getNextCode('BE', 'bons_entree', 'code');
    setBeFormData({ code: generatedCode, reception_date: new Date().toISOString().split('T')[0], status: 'EN_ATTENTE' });
    setEditTarget(null);
    setEditId(null);
    setBeModalVisible(true);
  };

  const handleSave = () => {
    if (!formData.code || !formData.article_id) {
      Alert.alert('Champs requis', 'Veuillez remplir le code et l\'article.');
      return;
    }

    const values = {
      ...formData,
      qty_received: parseFloat(formData.qty_received) || 0,
      qty_current: parseFloat(formData.qty_received) || 0,
      cqlib_status: 'QUARANTAINE', // MP : en quarantaine directe, pas d'étape EN_ATTENTE
    };

    if (editTarget === 'lot' && editId) {
      lotMutation.mutate({ id: editId, values, type: 'UPDATE' });
      return;
    }

    lotMutation.mutate({ values, type: 'INSERT' }, {
      onSuccess: async (data: any) => {
        const lotId = Array.isArray(data) ? data[0]?.id : data?.id;
        if (lotId) await createFcqDossierForLot(lotId);
      },
    });
  };

  // ─── Création BE + Lot directement en QUARANTAINE (MP — pas d'étape EN_ATTENTE) ──
  const handleSaveBE = async () => {
    if (!supabase) { Alert.alert('Erreur', 'Supabase non configuré'); return; }
    if (!beFormData.supplier_id) { Alert.alert('Champ requis', 'Veuillez sélectionner un fournisseur.'); return; }
    if (!beFormData.article_id) { Alert.alert('Champ requis', 'Veuillez sélectionner un article.'); return; }
    if (!beFormData.qty_received || parseFloat(beFormData.qty_received) <= 0) {
      Alert.alert('Champ requis', 'Veuillez saisir une quantité reçue valide.');
      return;
    }

    setIsSavingBE(true);
    try {
      if (editTarget === 'be' && editId) {
        beMutation.mutate({ id: editId, values: { ...beFormData }, type: 'UPDATE' });
        return;
      }

      // 1. Créer le bon d'entrée directement en QUARANTAINE (réception MP immédiate)
      const { data: beData, error: beErr } = await supabase
        .from('bons_entree')
        .insert({ ...beFormData, status: 'QUARANTAINE' })
        .select()
        .single();
      if (beErr) { Alert.alert('Erreur Bon d\'Entrée', beErr.message); return; }

      // 2. Créer le lot en QUARANTAINE (contrôle FCQ à ouvrir immédiatement)
      const lotCode = await getNextCode('L', 'lots', 'code');
      const { data: lotData, error: lotErr } = await supabase
        .from('lots')
        .insert({
          code: lotCode,
          bon_entree_id: beData.id,
          article_id: beFormData.article_id,
          supplier_id: beFormData.supplier_id || null,
          depot_id: beFormData.depot_id || null,
          qty_received: parseFloat(beFormData.qty_received || '0'),
          qty_current: parseFloat(beFormData.qty_received || '0'),
          unit: beFormData.unit || 'kg',
          reception_date: beFormData.reception_date || new Date().toISOString().split('T')[0],
          cqlib_status: 'QUARANTAINE', // MP : quarantaine directe (pas d'étape EN_ATTENTE)
        })
        .select()
        .single();

      if (lotErr) {
        await supabase.from('bons_entree').delete().eq('id', beData.id);
        Alert.alert('Erreur Lot', lotErr.message);
        return;
      }

      // 3. Créer le dossier FCQ immédiatement (le lot est déjà en quarantaine)
      await createFcqDossierForLot(lotData.id);

      // 4. Notifier le laboratoire et le RQ
      try {
        await supabase.from('notifications').insert([
          {
            role: 'TLAB',
            title: N.lab + ' Nouveau lot à analyser',
            message: `Lot ${lotCode} reçu et placé en QUARANTAINE. Dossier FCQ ouvert — contrôle en attente.`,
            type: 'warning',
            metadata: { screen: 'LaboratoryScreen', lot_id: lotData.id, action: 'open_fcq', category: 'QUALITY' },
          },
          {
            role: 'RQ',
            title: N.lab + ' Lot MP en quarantaine',
            message: `Lot ${lotCode} créé (BE: ${beData.code}). Placé directement en QUARANTAINE — FCQ ouvert au laboratoire.`,
            type: 'info',
            metadata: { screen: 'LaboratoryScreen', lot_id: lotData.id, category: 'QUALITY' },
          },
        ]);
        playNotificationSound('warning');
      } catch (err) {
        console.warn('Notification non envoyée :', err);
      }

      queryClient.invalidateQueries({ queryKey: ['bons_entree'] });
      queryClient.invalidateQueries({ queryKey: ['lots'] });
      queryClient.invalidateQueries({ queryKey: ['fcq_dossiers'] });
      setBeModalVisible(false);
      setActiveTab('QUARANTAINE'); // Aller sur l'onglet QUARANTAINE pour voir le lot créé
      Alert.alert(
        '✅ Réception enregistrée',
        `Lot ${lotCode} créé et placé en QUARANTAINE.\n🔬 Dossier FCQ ouvert au laboratoire pour contrôle.`
      );
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Une erreur est survenue');
    } finally {
      setIsSavingBE(false);
    }
  };


  // ─── Validation de la réception physique par le MAGA ──────────────────────
  // Passe le lot de EN_ATTENTE → QUARANTAINE et crée le dossier FCQ
  const handleValidateReception = async (lot: any) => {
    if (!supabase) return;
    const sb = supabase;
    confirmAction(
      'Valider la réception',
      `Confirmer la réception physique du lot ${lot.code} ?\n\nLe lot sera placé en QUARANTAINE et un dossier FCQ sera ouvert au laboratoire.`,
      async () => {
        try {
          // 1. Passage EN_ATTENTE → QUARANTAINE
          const { error: lotErr } = await sb
            .from('lots')
            .update({
              cqlib_status: 'QUARANTAINE',
              updated_at: new Date().toISOString(),
            })
            .eq('id', lot.id);
          if (lotErr) throw lotErr;

          // 2. Mettre à jour le bon d'entrée
          if (lot.bon_entree_id) {
            await sb
              .from('bons_entree')
              .update({ status: 'QUARANTAINE' })
              .eq('id', lot.bon_entree_id);
          }

          // 3. Créer le dossier FCQ (le trigger SQL le fait aussi — double sécurité)
          await createFcqDossierForLot(lot.id);

          // 4. Notifier le laboratoire
          const lotCode = lot.code;
          await sb.from('notifications').insert([
            {
              role: 'TLAB',
              title: N.lab + ' Nouveau lot à analyser',
              message: `Lot ${lotCode} validé par le magasin. Dossier FCQ ouvert — contrôle en attente.`,
              type: 'warning',
              metadata: { screen: 'LaboratoryScreen', lot_id: lot.id, category: 'QUALITY' },
            },
            {
              role: 'RQ',
              title: N.lab + ' Lot en quarantaine',
              message: `Lot ${lotCode} (${lot.article?.name || ''}) placé en quarantaine après réception. FCQ à ouvrir.`,
              type: 'info',
              metadata: { screen: 'LaboratoryScreen', lot_id: lot.id, category: 'QUALITY' },
            },
          ]);
          playNotificationSound('warning');

          queryClient.invalidateQueries({ queryKey: ['lots'] });
          queryClient.invalidateQueries({ queryKey: ['bons_entree'] });
          queryClient.invalidateQueries({ queryKey: ['fcq_dossiers'] });
          setActiveTab('QUARANTAINE');
          Alert.alert('✅ Réception validée', `Lot ${lotCode} placé en QUARANTAINE.\nDossier FCQ ouvert au laboratoire.`);
        } catch (err: any) {
          Alert.alert('Erreur', err.message || 'Impossible de valider la réception');
        }
      }
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={C.green} />
      </View>
    );
  }

  return (
    <AnimatedPage>
      <View style={s.container}>
        <View style={s.tabsHeader}>
          <View style={{ flexDirection: 'row', flex: 1 }}>
            {TABS.map(tab => (
              <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={[s.tabBtn, activeTab === tab && s.tabBtnActive]}>
                <Text style={[s.tabBtnText, activeTab === tab && s.tabBtnTextActive]}>{TAB_LABELS[tab] || tab}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ justifyContent: 'center', flexDirection: 'row', gap: 10 }}>
            {canPerformAction('create_be') && <ActionButton label={t('new_be')} icon="file-plus-outline" onPress={handleAddBE} />}
            {canPerformAction('create_lot') && <ActionButton label={t('new_lot')} icon="plus" variant="primary" onPress={handleAdd} />}
          </View>
        </View>

        <View style={[s.mainLayout, isMobile && { flexDirection: 'column' }]}>
          {/* Liste */}
          <View style={[s.listSide, isMobile && { flex: 0, height: 400 }]}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
              <View style={{ marginBottom: 20 }}>
                <KpiCard label={t('lots_to_process')} value={String(filteredLots.length + filteredBEs.length)} sub={t('awaiting_qc')} color={C.gold} />
              </View>

              {(activeTab === 'BONS' || activeTab === 'EN_ATTENTE' || activeTab === 'QUARANTAINE') && filteredBEs.map((be: any) => (
                <TouchableOpacity key={be.id} style={[s.lotCard, selId === be.id && s.lotCardActive]} onPress={() => setSelId(be.id)}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.lotRef, selId === be.id && s.whiteText]}>{be.code}</Text>
                    <Text style={[s.lotArticle, selId === be.id && s.whiteText]}>{be.supplier_name || '—'}</Text>
                    <Text style={[s.lotMeta, selId === be.id && s.whiteTextMuted]}>{be.reception_date}</Text>
                  </View>
                  <Badge label={be.status === 'EN_ATTENTE' ? 'EN ATTENTE' : 'QUARANTAINE'} color={be.status === 'EN_ATTENTE' ? C.info : C.gold} />
                </TouchableOpacity>
              ))}

              {activeTab !== 'BONS' && filteredLots.length === 0 && filteredBEs.length === 0 && (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: '#888', fontSize: 14 }}>Aucun élément en {TAB_LABELS[activeTab] || activeTab}</Text>
                </View>
              )}

              {activeTab !== 'BONS' && filteredLots.map(lot => (
                <TouchableOpacity key={lot.id} style={[s.lotCard, selId === lot.id && s.lotCardActive]} onPress={() => setSelId(lot.id)}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.lotRef, selId === lot.id && s.whiteText]}>{lot.code}</Text>
                    <Text style={[s.lotArticle, selId === lot.id && s.whiteText]}>{lot.article?.name}</Text>
                    <Text style={[s.lotMeta, selId === lot.id && s.whiteTextMuted]}>BE : {lot.be?.code || '—'} · {new Date(lot.reception_date).toLocaleDateString()}</Text>
                  </View>
                  <Badge label={lot.cqlib_status === 'EN_ATTENTE' ? 'EN ATTENTE' : lot.cqlib_status || 'INCONNU'} color={lot.cqlib_status === 'LIBERE' ? C.ok : lot.cqlib_status === 'EN_ATTENTE' ? C.info : lot.cqlib_status === 'QUARANTAINE' ? C.gold : C.err} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Détail */}
          <View style={s.detailSide}>
            {selectedBe ? (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 32 }}>
                {(() => {
                  const be = selectedBe as any;
                  const beLots = lots.filter(l => l.bon_entree_id === be.id);
                  return (
                    <>
                      <View style={s.detailHeader}>
                        <View>
                          <Text style={s.detailRef}>{be.code}</Text>
                          <Text style={s.detailTitle}>{be.supplier_name || '—'}</Text>
                        </View>
                        <Badge label="QUARANTAINE" color={C.gold} />
                      </View>
                      {canPerformAction('create_be') && (
                        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                          <ActionButton label="Modifier" icon="pencil-outline" variant="secondary" onPress={() => {
                            setEditTarget('be');
                            setEditId(be.id);
                            setBeFormData({ ...be, reception_date: be.reception_date || new Date().toISOString().split('T')[0] });
                            setBeModalVisible(true);
                          }} />
                          <ActionButton label="Supprimer" icon="trash-can-outline" onPress={() => handleDeleteBe(be)} />
                        </View>
                      )}
                      <View style={[s.infoGrid, isMobile && { flexDirection: 'column', gap: 12 }]}>
                        <View style={s.infoBox}><Text style={s.infoLab}>Date</Text><Text style={s.infoVal}>{be.reception_date || '—'}</Text></View>
                        <View style={s.infoBox}><Text style={s.infoLab}>Article</Text><Text style={s.infoVal}>{be.article_name || '—'}</Text></View>
                        <View style={s.infoBox}><Text style={s.infoLab}>BL / Facture</Text><Text style={s.infoVal}>{be.reference_doc || be.bl_number || '—'}</Text></View>
                      </View>
                      {beLots.length > 0 && (
                        <View style={{ marginTop: 8 }}>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: '#1A1A1A', marginBottom: 12 }}>Lots liés ({beLots.length})</Text>
                          {beLots.map(lot => (
                            <View key={lot.id} style={{ backgroundColor: '#F8F9FA', padding: 12, borderRadius: 8, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <View>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: '#1A1A1A' }}>{lot.code}</Text>
                                <Text style={{ fontSize: 11, color: '#6C757D' }}>{lot.qty_received} {lot.unit || 'kg'}</Text>
                              </View>
                              <Badge label={lot.cqlib_status === 'EN_ATTENTE' ? 'EN ATTENTE' : lot.cqlib_status || 'INCONNU'} color={lot.cqlib_status === 'LIBERE' ? C.ok : lot.cqlib_status === 'EN_ATTENTE' ? C.info : lot.cqlib_status === 'QUARANTAINE' ? C.gold : C.err} />
                            </View>
                          ))}
                        </View>
                      )}
                    </>
                  );
                })()}
              </ScrollView>
            ) : selectedLot ? (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 32 }}>
                <View style={s.detailHeader}>
                  <View>
                    <Text style={s.detailRef}>{selectedLot.code}</Text>
                    <Text style={s.detailTitle}>{selectedLot.article?.name}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                    {/* Bouton principal : validation réception physique (MAGA seulement, lot EN_ATTENTE) */}
                    {selectedLot.cqlib_status === 'EN_ATTENTE' && canPerformAction('validate_reception') && (
                      <ActionButton
                        label="✅ Valider la réception"
                        icon="check-circle-outline"
                        variant="primary"
                        onPress={() => handleValidateReception(selectedLot)}
                      />
                    )}
                    {canPerformAction('create_lot') && (
                      <ActionButton label="Modifier" icon="pencil-outline" variant="secondary" onPress={() => {
                        setEditTarget('lot');
                        setEditId(selectedLot.id);
                        setFormData({
                          ...selectedLot,
                          qty_received: String(selectedLot.qty_received ?? 0),
                          unit: selectedLot.unit || 'kg',
                        });
                        setModalVisible(true);
                      }} />
                    )}
                    {canPerformAction('create_lot') && (
                      <ActionButton label="Supprimer" icon="trash-can-outline" onPress={() => {
                        confirmAction(
                        'Supprimer le lot',
                        `Êtes-vous sûr de vouloir supprimer "${selectedLot.code}" ? Cette action est irréversible.`,
                        () => lotMutation.mutate({ id: selectedLot.id, type: 'DELETE' })
                      );
                      }} />
                    )}
                    <ActionButton label={t('qr_label')} icon="qrcode" onPress={() => setQrModalVisible(true)} />
                    <ActionButton
                      label="Dossier FCQ"
                      icon="file-document-outline"
                      variant="primary"
                      onPress={async () => {
                        if (!supabase) return;
                        const { data: existing } = await supabase.from('fcq_dossiers').select('id, code, status').eq('lot_id', selectedLot.id).maybeSingle();
                        if (existing) {
                          Alert.alert('Dossier FCQ existant', `Le dossier ${existing.code} est déjà créé.\nStatut : ${existing.status}`);
                        } else {
                          await createFcqDossierForLot(selectedLot.id);
                          Alert.alert('✅ Dossier créé', 'Le dossier FCQ est visible dans le module Laboratoire.');
                        }
                      }}
                    />
                  </View>
                </View>

                {/* Bannière statut EN_ATTENTE */}
                {selectedLot.cqlib_status === 'EN_ATTENTE' && (
                  <View style={{ backgroundColor: '#EBF5FB', padding: 14, borderRadius: 8, borderWidth: 1, borderColor: C.info, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <MaterialCommunityIcons name="clock-outline" size={20} color={C.info} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: C.info }}>En attente de validation magasinier</Text>
                      <Text style={{ fontSize: 12, color: '#5D8AA8', marginTop: 2 }}>Le dossier FCQ s'ouvrira automatiquement après validation physique au magasin.</Text>
                    </View>
                  </View>
                )}

                <View style={[s.infoGrid, isMobile && { flexDirection: 'column', gap: 12 }]}>
                  <View style={s.infoBox}><Text style={s.infoLab}>{t('qty_received')}</Text><Text style={s.infoVal}>{(selectedLot.qty_received ?? 0).toLocaleString()} kg</Text></View>
                  <View style={s.infoBox}><Text style={s.infoLab}>{t('sage_ref')}</Text><Text style={s.infoVal}>{selectedLot.article?.sage_code || '—'}</Text></View>
                  <View style={s.infoBox}><Text style={s.infoLab}>{t('target_depot')}</Text><Text style={s.infoVal}>{depots.find(d => d.id === selectedLot.depot_id)?.name || 'Magasin MP'}</Text></View>
                </View>

                <View style={s.detailSection}>
                  <Text style={s.sectionTitle}>{t('reception_controls')}</Text>
                  <View style={s.checkRow}><MaterialCommunityIcons name="check-circle" size={20} color={C.ok} /><Text style={s.checkText}>{t('coa_present')}</Text></View>
                  <View style={s.checkRow}><MaterialCommunityIcons name="check-circle" size={20} color={C.ok} /><Text style={s.checkText}>{t('packaging_conform')}</Text></View>
                  <View style={s.checkRow}><MaterialCommunityIcons name="clock-outline" size={20} color={C.gold} /><Text style={s.checkText}>{t('sampling_in_progress')}</Text></View>
                </View>

                {/* Résultat Global Contrôle Physico-Chimique */}
                <FcqGlobalResult lotId={selectedLot.id} />
              </ScrollView>
            ) : (
              <View style={s.emptyState}>
                <MaterialCommunityIcons name="package-variant-closed" size={64} color="#E9ECEF" />
                <Text style={s.emptyText}>Sélectionnez un élément pour voir les détails</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Modal Lot direct */}
      <FormModal visible={modalVisible} title={t('new_lot')} onClose={() => setModalVisible(false)} onSave={handleSave} loading={lotMutation.isPending} isError={lotMutation.isError} errorMessage={lotMutation.errorMessage}>
        <FormInput label={t('lot_code')} value={formData.code || ''} editable={false} style={{ backgroundColor: '#F1F3F5', color: '#6C757D' }} />
        <FormSelect label={t('articles')} value={formData.article_id ?? ''} options={articles.map(a => ({ label: `[${a.code}] ${a.name}`, value: a.id }))} onSelect={v => setFormData({ ...formData, article_id: v })} />
        <FormSelect label={t('suppliers')} value={formData.supplier_id ?? ''} options={suppliers.map(s => ({ label: s.name, value: s.id }))} onSelect={v => setFormData({ ...formData, supplier_id: v })} />
        <FormInput label={t('qty_received')} value={String(formData.qty_received || '0')} onChangeText={val => setFormData({ ...formData, qty_received: val })} keyboardType="numeric" />
        <FormSelect label={t('target_depot')} value={formData.depot_id ?? ''} options={depots.map(d => ({ label: d.name, value: d.id }))} onSelect={v => setFormData({ ...formData, depot_id: v })} />
        <FormInput label={t('supplier_lot')} value={formData.batch_supplier ?? ''} onChangeText={val => setFormData({ ...formData, batch_supplier: val })} placeholder="ex: BN-45-XYZ" />
      </FormModal>

      {/* Modal Bon d'Entrée */}
      <FormModal visible={beModalVisible} title="Nouveau Bon d'Entrée" onClose={() => setBeModalVisible(false)} onSave={handleSaveBE} loading={isSavingBE}>
        <FormInput label="N° Bon d'Entrée" value={beFormData.code || ''} editable={false} style={{ backgroundColor: '#F1F3F5', color: '#6C757D' }} />
        <FormSelect label="Fournisseur *" value={beFormData.supplier_id ?? ''} options={suppliers.map(s => ({ label: s.name, value: s.id }))} onSelect={v => setBeFormData({ ...beFormData, supplier_id: v })} searchable />
        <FormSelect
          label="Article (MP) *"
          value={beFormData.article_id || ''}
          options={articles.filter(a => {
            const t = (a.article_type || a.family || '').toUpperCase();
            return t === 'MP' || a.code?.startsWith('MP-');
          }).map(a => ({ label: `[${a.code}] ${a.name}`, value: a.id }))}
          onSelect={v => {
            const art = articles.find((a: any) => a.id === v);
            setBeFormData({ ...beFormData, article_id: v, unit: art?.unit || beFormData.unit || 'kg' });
          }}
          searchable
        />
        <FormInput
          label="Quantité reçue *"
          value={String(beFormData.qty_received || '')}
          onChangeText={val => setBeFormData({ ...beFormData, qty_received: val })}
          keyboardType="numeric"
          placeholder="ex: 500"
        />
        <FormSelect
          label="Unité *"
          value={beFormData.unit || 'kg'}
          options={[
            { label: 'kg — Kilogramme', value: 'kg' },
            { label: 'g — Gramme', value: 'g' },
            { label: 'T — Tonne', value: 'T' },
            { label: 'L — Litre', value: 'L' },
            { label: 'mL — Millilitre', value: 'mL' },
            { label: 'PCE — Pièce', value: 'PCE' },
            { label: 'Sac', value: 'Sac' },
            { label: 'Bidon', value: 'Bidon' },
            { label: 'Fût', value: 'Fût' },
          ]}
          onSelect={v => setBeFormData({ ...beFormData, unit: v })}
        />
        <FormSelect label="Dépôt cible" value={beFormData.depot_id ?? ''} options={depots.map(d => ({ label: d.name, value: d.id }))} onSelect={v => setBeFormData({ ...beFormData, depot_id: v })} />
        <FormDatePicker label="Date de Réception" value={beFormData.reception_date || ''} onChangeDate={d => setBeFormData({ ...beFormData, reception_date: d })} />
        <FormInput label="N° Facture / BL" value={beFormData.reference_doc || ''} onChangeText={val => setBeFormData({ ...beFormData, reference_doc: val })} placeholder="ex: INV-9988" />
        <FormInput label="Transporteur" value={beFormData.carrier || ''} onChangeText={val => setBeFormData({ ...beFormData, carrier: val })} />
        <FormInput label="Nombre de Colis" value={String(beFormData.package_count || '')} onChangeText={val => setBeFormData({ ...beFormData, package_count: val })} keyboardType="numeric" />
      </FormModal>

      {/* Modal QR */}
      <FormModal visible={qrModalVisible} title="Étiquette de Quarantaine" onClose={() => setQrModalVisible(false)} onSave={() => setQrModalVisible(false)} hideSaveButton>
        {selectedLot && (
          <View style={s.qrCard}>
            <View style={s.qrHeader}>
              <Text style={s.qrHeaderText}>GSI - IDENTIFICATION LOT</Text>
            </View>
            <View style={s.qrMain}>
              <View style={s.qrTextSide}>
                <Text style={s.qrLabel}>ARTICLE</Text>
                <Text style={s.qrValue}>{selectedLot.article?.name}</Text>
                <Text style={[s.qrLabel, { marginTop: 8 }]}>N° LOT</Text>
                <Text style={s.qrValueStrong}>{selectedLot.code}</Text>
                <View style={s.quarBadge}><Text style={s.quarBadgeText}>QUARANTAINE</Text></View>
              </View>
              <View style={s.qrImageSide}>
                <Image source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${selectedLot.code}` }} style={s.qrImg} />
                <Text style={s.qrSub}>Scanner pour FCQ</Text>
              </View>
            </View>
            <View style={s.qrFooter}>
              <Text style={s.qrFooterText}>Date: {new Date().toLocaleDateString()} · {profile?.full_name}</Text>
            </View>
          </View>
        )}
      </FormModal>
    </AnimatedPage>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  tabsHeader: { flexDirection: 'row', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E9ECEF', paddingHorizontal: 24 },
  tabBtn: { paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: C.info },
  tabBtnText: { fontSize: 12, fontWeight: '800', color: '#ADB5BD' },
  tabBtnTextActive: { color: C.info },
  mainLayout: { flex: 1, flexDirection: 'row' },
  listSide: { flex: 1, borderRightWidth: 1, borderRightColor: '#E9ECEF' },
  detailSide: { flex: 2, backgroundColor: '#FFF' },
  lotCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E9ECEF', flexDirection: 'row', alignItems: 'center' },
  lotCardActive: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  lotRef: { fontSize: 11, fontWeight: '700', color: '#ADB5BD' },
  lotArticle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginTop: 4 },
  lotMeta: { fontSize: 12, color: '#6C757D', marginTop: 4 },
  whiteText: { color: '#FFF' },
  whiteTextMuted: { color: '#ADB5BD' },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 },
  detailRef: { fontSize: 13, fontWeight: '700', color: C.info, letterSpacing: 1 },
  detailTitle: { fontSize: 24, fontWeight: '800', color: '#1A1A1A', marginTop: 8 },
  infoGrid: { flexDirection: 'row', gap: 24, marginBottom: 40, flexWrap: 'wrap' },
  infoBox: { flex: 1, minWidth: 100, backgroundColor: '#F8F9FA', padding: 20, borderRadius: 12 },
  infoLab: { fontSize: 10, fontWeight: '800', color: '#ADB5BD', marginBottom: 8 },
  infoVal: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  detailSection: { marginTop: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#1A1A1A', marginBottom: 16 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  checkText: { fontSize: 14, color: '#495057', fontWeight: '500' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { marginTop: 16, fontSize: 15, color: '#ADB5BD', fontWeight: '600' },
  qrCard: { backgroundColor: '#FFF', padding: 16, borderWidth: 2, borderColor: '#1A1A1A', borderRadius: 4 },
  qrHeader: { borderBottomWidth: 1, borderBottomColor: '#EEE', paddingBottom: 10, marginBottom: 15 },
  qrHeaderText: { fontSize: 12, fontWeight: '800', color: '#1A1A1A', letterSpacing: 1 },
  qrMain: { flexDirection: 'row', gap: 15 },
  qrTextSide: { flex: 1 },
  qrImageSide: { alignItems: 'center' },
  qrLabel: { fontSize: 9, fontWeight: '700', color: '#6C757D' },
  qrValue: { fontSize: 13, fontWeight: '600', color: '#1A1A1A' },
  qrValueStrong: { fontSize: 18, fontWeight: '900', color: '#1A1A1A' },
  qrImg: { width: 110, height: 110 },
  qrSub: { fontSize: 8, color: '#ADB5BD', marginTop: 5, fontWeight: '700' },
  quarBadge: { backgroundColor: C.gold, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2, alignSelf: 'flex-start', marginTop: 4 },
  quarBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  qrFooter: { marginTop: 15, borderTopWidth: 1, borderTopColor: '#EEE', paddingTop: 8 },
  qrFooterText: { fontSize: 8, color: '#ADB5BD', textAlign: 'center' },
});
