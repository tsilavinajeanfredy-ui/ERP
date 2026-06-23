import * as React from 'react';
import { ScrollView, StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, useWindowDimensions, Image, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { C, ActionButton, AnimatedPage, Badge, KpiCard, FormModal, FormInput, FormSelect, FormDatePicker } from '../components/Ui';
import { supabase, getNextCode, computeExpiryDate } from '../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useLots, useArticles, useSuppliers, useDepots, useMutation, useUserProfile, usePermissions, useBonsEntree, confirmAction, useDocuments, getSignedUrlForStorageFile } from '../lib/hooks';
import { useTranslation } from '../lib/i18n';
import { useSearch } from '../lib/search';
import { playNotificationSound } from '../lib/notificationSound';
import { printThermalLabel } from '../lib/labelPrinter';
import { N } from '../lib/notifIcons';
import { pickDocument, downloadOrShareFile } from '../lib/filePicker';

// ─── Types pièces jointes ─────────────────────────────────────────────────────
const ATTACHMENT_CATEGORIES = [
  { key: 'PHOTO_COLIS',  label: 'Photo colis',      icon: 'camera-outline',          accept: 'image/*' },
  { key: 'SCAN_BL',      label: 'Scan BL',           icon: 'file-document-scan-outline', accept: 'application/pdf,image/*' },
  { key: 'CERTIFICAT',   label: 'Certificat (CoA)',  icon: 'certificate-outline',     accept: 'application/pdf,image/*' },
  { key: 'AUTRE',        label: 'Autre document',    icon: 'paperclip',               accept: '*/*' },
] as const;
type AttachmentCategory = typeof ATTACHMENT_CATEGORIES[number]['key'];

// ─── Helpers statut lot ───────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  EN_ATTENTE: 'EN ATTENTE',
  QUARANTAINE: 'QUARANTAINE',
  LIBERE: 'LIBÉRÉ',
  BLOQUE: 'BLOQUÉ',
};
const formatLotStatus = (status?: string) =>
  STATUS_LABELS[status?.toUpperCase() || ''] || status || 'INCONNU';

const lotStatusColor = (status?: string, C_ref?: any): string => {
  const C_ = C_ref || C;
  switch ((status || '').toUpperCase()) {
    case 'LIBERE': return C_.ok;
    case 'BLOQUE': return C_.err;
    case 'QUARANTAINE': return C_.gold;
    default: return C_.info;
  }
};
// ─────────────────────────────────────────────────────────────────────────────

// Workflow MP : réception → EN_ATTENTE (import) → QUARANTAINE (FCQ) → LIBERE | BLOQUE
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

      const hasNull = results.some((r: any) => r.is_conform === null);
      if (hasNull) {
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

export function ReceptionScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const isMobile = width < 992;
  const { t } = useTranslation();
  const { profile } = useUserProfile();
  const { canPerformAction } = usePermissions();
  const { searchQuery } = useSearch();
  const { data: lots = [], isPending: loading } = useLots();
  const [activeTab, setActiveTab] = React.useState('EN_ATTENTE');
  // Reset vers EN_ATTENTE à chaque fois qu'on revient sur l'écran
  useFocusEffect(
    React.useCallback(() => {
      setActiveTab('EN_ATTENTE');
    }, [])
  );
  const { data: articles = [] } = useArticles(0, 2000, 'MP');
  const { data: suppliers = [] } = useSuppliers(0, 500);
  const { data: depots = [] } = useDepots();
  const { data: bonsEntree = [] } = useBonsEntree();
  const [selId, setSelId] = React.useState<string | null>(null);
  // ── Sélection multiple des lots MP ──
  const [selectedMpLotIds, setSelectedMpLotIds] = React.useState<string[]>([]);
  const toggleMpLotSelect = React.useCallback((id: string) => {
    setSelectedMpLotIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);
  const toggleMpLotSelectAll = React.useCallback((ids: string[]) => {
    setSelectedMpLotIds((prev) => prev.length === ids.length ? [] : ids);
  }, []);
  const [selectedBeIds, setSelectedBeIds] = React.useState<string[]>([]);
  const toggleBeSelect = React.useCallback((id: string) => {
    setSelectedBeIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);
  const toggleBeSelectAll = React.useCallback((ids: string[]) => {
    setSelectedBeIds((prev) => prev.length === ids.length ? [] : ids);
  }, []);
  const [modalVisible, setModalVisible] = React.useState(false);
  const [beModalVisible, setBeModalVisible] = React.useState(false);
  const [qrModalVisible, setQrModalVisible] = React.useState(false);
  const [formData, setFormData] = React.useState<any>({ qty_received: '0' });
  const [beFormData, setBeFormData] = React.useState<any>({});
  const [isSavingBE, setIsSavingBE] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<null | 'lot' | 'be'>(null);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [labelLot, setLabelLot] = React.useState<any | null>(null);
  const [labelModalVisible, setLabelModalVisible] = React.useState(false);
  const [isDeletingLot, setIsDeletingLot] = React.useState(false);

  const handlePrintAndShowLabel = async (lot: any) => {
    setLabelLot(lot);
    setLabelModalVisible(true);
    try {
      await printThermalLabel({
        code: lot.code,
        article: lot.article?.name || lot.article_name || '',
        qty: lot.qty_received ?? lot.qty ?? '',
        unit: lot.unit || 'kg',
        date: lot.reception_date ? new Date(lot.reception_date).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR'),
        supplier: suppliers.find((sup: any) => sup.id === lot.supplier_id)?.name || '',
        status: lot.cqlib_status,
        operator: profile?.full_name || '',
        title: 'GSI — RÉCEPTION MATIÈRE PREMIÈRE',
      });
    } catch (err) {
      console.error('Erreur impression étiquette:', err);
    }
  };

  // ─── Pièces jointes ───────────────────────────────────────────────────────
  const [attachmentLotId, setAttachmentLotId] = React.useState<string | null>(null);
  const [attachmentBEId, setAttachmentBEId] = React.useState<string | null>(null);
  const [attachModalVisible, setAttachModalVisible] = React.useState(false);
  const [uploadingCategory, setUploadingCategory] = React.useState<AttachmentCategory | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);

  // Charger les pièces jointes du lot sélectionné
  const attachRefType = attachmentLotId ? 'LOT' : attachmentBEId ? 'BON_ENTREE' : undefined;
  const attachRefId   = attachmentLotId ?? attachmentBEId ?? undefined;
  const { data: attachments = [], refetch: refetchAttachments } = useDocuments(attachRefType, attachRefId);

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
            // 2a. Supprimer les FNCs liées au dossier (fnc.fcq_id → fcq_dossiers.id)
            const { error: fncErr } = await supabase!
              .from('fnc')
              .delete()
              .eq('fcq_id', dossier.id);
            if (fncErr) throw fncErr;

            // 2b. Supprimer les résultats FCQ (fcq_results → fcq_dossiers)
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
      ,
    'danger'
  );
    } else {
      confirmAction(
        'Supprimer le bon d\'entrée',
        `Êtes-vous sûr de vouloir supprimer "${be.code}" ? Cette action est irréversible.`,
        doDelete
      ,
    'danger'
  );
    }
  };
  const handleDeleteSelectedBes = async () => {
    if (selectedBeIds.length === 0 || !supabase) return;
    const sel = (filteredBEs as any[]).filter((be: any) => selectedBeIds.includes(be.id));

    // Compter lots et FCQ pour informer l'utilisateur
    const allLinkedLots = (lots as any[]).filter((l: any) => selectedBeIds.includes(l.bon_entree_id));
    const lotIds = allLinkedLots.map((l: any) => l.id);
    let fcqCount = 0;
    if (lotIds.length > 0) {
      const { count } = await supabase
        .from('fcq_dossiers')
        .select('id', { count: 'exact', head: true })
        .in('lot_id', lotIds);
      fcqCount = count || 0;
    }

    const lotStr = allLinkedLots.length > 0 ? `
• ${allLinkedLots.length} lot${allLinkedLots.length > 1 ? 's' : ''} MP` : '';
    const fcqStr = fcqCount > 0 ? `
• ${fcqCount} dossier${fcqCount > 1 ? 's' : ''} FCQ et leurs résultats` : '';

    confirmAction(
      `Supprimer ${sel.length} bon${sel.length > 1 ? 's' : ''} d'entrée`,
      `⚠️ Suppression de ${sel.length} BE :
${sel.slice(0, 5).map((b: any) => b.code).join(', ')}${sel.length > 5 ? '...' : ''}${lotStr}${fcqStr}

Cette action est irréversible.`,
      async () => {
        setIsDeletingLot(true);
        try {
          for (const be of sel) {
            const linkedLots = (lots as any[]).filter((l: any) => l.bon_entree_id === be.id);
            for (const lot of linkedLots) {
              const { data: dossiers = [] } = await supabase!.from('fcq_dossiers').select('id').eq('lot_id', lot.id);
              for (const d of (dossiers as any[])) {
                await supabase!.from('fnc').delete().eq('fcq_id', d.id);
                await supabase!.from('fcq_results').delete().eq('fcq_id', d.id);
                await supabase!.from('fcq_dossiers').delete().eq('id', d.id);
              }
              await supabase!.from('lots').delete().eq('id', lot.id);
            }
            await supabase!.from('bons_entree').delete().eq('id', be.id);
          }
          queryClient.invalidateQueries({ queryKey: ['lots'] });
          queryClient.invalidateQueries({ queryKey: ['bons_entree'] });
          queryClient.invalidateQueries({ queryKey: ['fcq_dossiers'] });
          setSelectedBeIds([]);
          setSelId(null);
        } catch (err: any) {
          showErrorToast(err?.message || "Erreur lors de la suppression des bons d'entrée.");
        } finally {
          setIsDeletingLot(false);
        }
      }
    ,
    'danger'
  );
  };

  const isAdmin = profile?.role === 'ADMIN';

  // Note : la création du dossier FCQ est gérée automatiquement par le trigger
  // SQL tr_auto_create_fcq_dossier (migration 044) — pas besoin de le créer en front.

  const deleteLotCascade = async (lot: any) => {
    if (!supabase) return;
    setIsDeletingLot(true);
    try {
      const fcqResponse = await supabase.from('fcq_dossiers').select('id').eq('lot_id', lot.id);
      const fcqDossiers = (fcqResponse.data || []) as any[];
      if (fcqResponse.error) throw fcqResponse.error;

      for (const dossier of fcqDossiers) {
        // Supprimer les FNCs liées (fnc.fcq_id → fcq_dossiers.id)
        const { error: fncErr } = await supabase.from('fnc').delete().eq('fcq_id', dossier.id);
        if (fncErr) throw fncErr;

        const { error: resErr } = await supabase.from('fcq_results').delete().eq('fcq_id', dossier.id);
        if (resErr) throw resErr;

        const { error: dosErr } = await supabase.from('fcq_dossiers').delete().eq('id', dossier.id);
        if (dosErr) throw dosErr;
      }

      const { error: lotErr } = await supabase.from('lots').delete().eq('id', lot.id);
      if (lotErr) throw lotErr;

      queryClient.invalidateQueries({ queryKey: ['lots'] });
      queryClient.invalidateQueries({ queryKey: ['fcq_dossiers'] });
      setSelId(null);
    } catch (err: any) {
      showErrorToast(err?.message || 'Erreur lors de la suppression du lot.');
    } finally {
      setIsDeletingLot(false);
    }
  };

  const handleDeleteSelectedMpLots = () => {
    if (selectedMpLotIds.length === 0) return;
    const sel = (lots as any[]).filter((l) => selectedMpLotIds.includes(l.id));
    confirmAction(
      'Supprimer les lots sélectionnés',
      `Supprimer définitivement ${sel.length} lot${sel.length > 1 ? 's' : ''} MP ?\n\n${sel.slice(0, 5).map((l: any) => l.code).join(', ')}${sel.length > 5 ? '...' : ''}\n\nCette action est irréversible.`,
      async () => {
        setIsDeletingLot(true);
        try {
          for (const lot of sel) {
            // FCQ cascade
            const { data: dossiers = [] } = await supabase!.from('fcq_dossiers').select('id').eq('lot_id', lot.id);
            for (const d of (dossiers as any[])) {
              await supabase!.from('fnc').delete().eq('fcq_id', d.id);
              await supabase!.from('fcq_results').delete().eq('fcq_id', d.id);
              await supabase!.from('fcq_dossiers').delete().eq('id', d.id);
            }
            await supabase!.from('lots').delete().eq('id', lot.id);
          }
          queryClient.invalidateQueries({ queryKey: ['lots'] });
          queryClient.invalidateQueries({ queryKey: ['fcq_dossiers'] });
          setSelectedMpLotIds([]);
        } catch (err: any) {
          showErrorToast(err?.message || 'Erreur lors de la suppression.');
        } finally {
          setIsDeletingLot(false);
        }
      }
    ,
    'danger'
  );
  };

  const normalizeStatus = (value?: string) => String(value || '').trim().toUpperCase();

  const filteredLots = (activeTab === 'BONS' ? [] : lots).filter(l => {
    const isMP = l.article?.article_type === 'MP';
    const matchesTab = activeTab === 'TOUT' || normalizeStatus(l.cqlib_status) === normalizeStatus(activeTab);
    const matchesSearch =
      (l.code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.article?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    return isMP && matchesTab && matchesSearch;
  });

  // Les BEs ne s'affichent QUE dans l'onglet BONS pour éviter le double affichage
  // (en QUARANTAINE on voit déjà les lots, qui contiennent l'info fournisseur/article)
  const filteredBEs = activeTab === 'BONS'
    ? bonsEntree
    : [];

  const selectedLot = lots.find(l => l.id === selId);
  const selectedBe = bonsEntree.find((b: any) => b.id === selId);

  // ─── Upload pièce jointe ──────────────────────────────────────────────────
  const handleOpenAttachments = (lotId?: string, beId?: string) => {
    setAttachmentLotId(lotId ?? null);
    setAttachmentBEId(beId ?? null);
    setAttachModalVisible(true);
  };

  const handleUploadAttachment = async (category: AttachmentCategory) => {
    if (!supabase || (!attachmentLotId && !attachmentBEId)) return;
    const cat = ATTACHMENT_CATEGORIES.find(c => c.key === category)!;
    const picked = await pickDocument(cat.accept);
    if (!picked) return;

    setUploadingCategory(category);
    setIsUploading(true);
    try {
      // Déterminer le bucket et le chemin
      const refId = attachmentLotId ?? attachmentBEId!;
      const refType = attachmentLotId ? 'LOT' : 'BON_ENTREE';
      const ext = picked.name.split('.').pop() || 'bin';
      const fileName = `${category}_${Date.now()}.${ext}`;
      const storagePath = `reception/${refType.toLowerCase()}/${refId}/${fileName}`;

      // Upload vers Supabase Storage (bucket "documents")
      let uploadBody: Blob | File | ArrayBuffer;
      if (picked.file) {
        uploadBody = picked.file;
      } else {
        // Mobile : fetch URI → blob
        const res = await fetch(picked.uri);
        uploadBody = await res.blob();
      }

      const { error: storageErr } = await supabase.storage
        .from('documents')
        .upload(storagePath, uploadBody, {
          contentType: picked.mimeType || 'application/octet-stream',
          upsert: false,
        });
      if (storageErr) throw storageErr;

      // Enregistrer la référence dans la table documents
      const { error: dbErr } = await supabase.from('documents').insert({
        name: picked.name,
        file_path: storagePath,
        bucket: 'documents',
        mime_type: picked.mimeType || null,
        file_size: picked.size || null,
        reference_type: refType,
        reference_id: refId,
        category,
        uploaded_by: profile?.id || null,
      });
      if (dbErr) throw dbErr;

      refetchAttachments();
    } catch (err: any) {
      Alert.alert('Erreur upload', err?.message || 'Impossible d\'uploader le fichier.');
    } finally {
      setIsUploading(false);
      setUploadingCategory(null);
    }
  };

  const handleDeleteAttachment = async (doc: any) => {
    if (!supabase) return;
    confirmAction(
      'Supprimer le document',
      `Supprimer "${doc.name}" définitivement ?`,
      async () => {
        try {
          await supabase!.storage.from('documents').remove([doc.file_path]);
          await supabase!.from('documents').delete().eq('id', doc.id);
          refetchAttachments();
        } catch (err: any) {
          Alert.alert('Erreur', err?.message || 'Suppression impossible.');
        }
      }
    ,
    'danger'
  );
  };

  const handleDownloadAttachment = async (doc: any) => {
    try {
      const url = await getSignedUrlForStorageFile('documents', doc.file_path);
      if (!url) throw new Error('URL non disponible');
      await downloadOrShareFile(url, doc.name);
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Téléchargement impossible.');
    }
  };

  const handleAdd = async () => {
    const generatedCode = await getNextCode('L', 'lots', 'code');
    setFormData({ code: generatedCode, qty_received: '0', qty_current: '0', unit: 'kg', reception_date: new Date().toISOString().split('T')[0] });
    setEditTarget(null);
    setEditId(null);
    setModalVisible(true);
  };

  const handleAddBE = async () => {
    const generatedCode = await getNextCode('BE', 'bons_entree', 'code');
    setBeFormData({ code: generatedCode, reception_date: new Date().toISOString().split('T')[0], status: 'QUARANTAINE' });
    setEditTarget(null);
    setEditId(null);
    setBeModalVisible(true);
  };

  const handleSave = () => {
    if (!formData.code || !formData.article_id) {
      Alert.alert('Champs requis', 'Veuillez remplir le code et l\'article.');
      return;
    }

    const receptionDate = formData.reception_date || new Date().toISOString().split('T')[0];
    const selectedArticle = articles.find((a: any) => a.id === formData.article_id);
    const values = {
      ...formData,
      reception_date: receptionDate,
      expiry_date: formData.expiry_date ?? computeExpiryDate(receptionDate, selectedArticle?.shelf_life_days),
      qty_received: parseFloat(formData.qty_received) || 0,
      qty_current: parseFloat(formData.qty_received) || 0,
      cqlib_status: 'QUARANTAINE', // MP : en quarantaine directe, pas d'étape EN_ATTENTE
    };

    if (editTarget === 'lot' && editId) {
      lotMutation.mutate({ id: editId, values, type: 'UPDATE' });
      return;
    }

    lotMutation.mutate({ values, type: 'INSERT' });
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
      // Build an explicit insert payload to avoid sending fields not present in the DB schema
      const beInsertPayload: any = {
        code: beFormData.code,
        supplier_id: beFormData.supplier_id,
        article_id: beFormData.article_id || null,
        site_id: beFormData.site_id || null,
        reception_date: beFormData.reception_date || new Date().toISOString().split('T')[0],
        bl_number: beFormData.reference_doc || null,
        reference_doc: beFormData.reference_doc || null,
        coa_received: !!beFormData.coa_received,
        notes: beFormData.notes || null,
        unit: beFormData.unit || 'kg',
        carrier: beFormData.carrier || null,
        package_count: beFormData.package_count ? parseInt(String(beFormData.package_count), 10) : null,
        status: 'QUARANTAINE',
      };

      const { data: beData, error: beErr } = await supabase
        .from('bons_entree')
        .insert(beInsertPayload)
        .select('id,code')
        .single();
      if (beErr) {
        console.error('BE insert failed', { payload: beFormData, error: beErr });
        const msg = beErr?.message || JSON.stringify(beErr);
        Alert.alert('Erreur Bon d\'Entrée', msg);
        return;
      }

      // 2. Créer le lot en QUARANTAINE (contrôle FCQ à ouvrir immédiatement)
      const lotCode = await getNextCode('L', 'lots', 'code');
      const receptionDate = beFormData.reception_date || new Date().toISOString().split('T')[0];
      const receivedArticle = articles.find((a: any) => a.id === beFormData.article_id);
      const expiryDate = computeExpiryDate(receptionDate, receivedArticle?.shelf_life_days);
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
          reception_date: receptionDate,
          expiry_date: expiryDate,
          cqlib_status: 'QUARANTAINE', // MP : quarantaine directe (pas d'étape EN_ATTENTE)
        })
        .select('id,code')
        .single();

      if (lotErr) {
        await supabase.from('bons_entree').delete().eq('id', beData.id);
        Alert.alert('Erreur Lot', lotErr.message);
        return;
      }

      // 3. Le trigger SQL crée le dossier FCQ automatiquement (migration 044)

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
      // Pas d'Alert.alert ici : le toast de notification DB (TLAB/RQ) est déjà affiché
      // par NotificationToastProvider — un seul retour visuel suffit.
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

          // 3. Le trigger SQL crée le dossier FCQ automatiquement (migration 044)

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
          // Le toast de notification (TLAB/RQ) s'affiche via NotificationToastProvider
        } catch (err: any) {
          Alert.alert('Erreur', err.message || 'Impossible de valider la réception');
        }
      }
    ,
    'success'
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
        <View style={[s.tabsHeader, isMobile && { paddingHorizontal: 8 }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ flexDirection: 'row' }}>
            {TABS.map(tab => (
              <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={[s.tabBtn, activeTab === tab && s.tabBtnActive]}>
                <Text style={[s.tabBtnText, activeTab === tab && s.tabBtnTextActive]}>{TAB_LABELS[tab] || tab}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={{ justifyContent: 'center', flexDirection: 'row', gap: 10 }}>
            {canPerformAction('create_be') && <ActionButton label={t('new_be')} icon="file-plus-outline" onPress={handleAddBE} />}
            {canPerformAction('create_lot') && <ActionButton label={t('new_lot')} icon="plus" variant="primary" onPress={handleAdd} />}
          </View>
        </View>

        <View style={[s.mainLayout, isMobile && { flexDirection: 'column', gap: 0 }]}>
          {/* Liste */}
          <View style={[s.listSide, isMobile && { flex: 0, minHeight: 220, maxHeight: 420, borderRightWidth: 0, borderBottomWidth: 1, borderBottomColor: '#E9ECEF' }]}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
              <View style={{ marginBottom: 20 }}>
                <KpiCard
                  label={t('lots_to_process')}
                  value={(filteredLots.length + filteredBEs.length) > 0 ? String(filteredLots.length + filteredBEs.length) : ''}
                  sub={t('awaiting_qc')}
                  color={C.gold}
                />
              </View>

              {/* BEs : affichés uniquement dans l'onglet BONS */}
              {activeTab === 'BONS' && (() => {
                // Un BE est verrouillé si ses lots sont en QUARANTAINE, LIBERE ou BLOQUE
                const STATUTS_BLOQUES = ['QUARANTAINE', 'LIBERE', 'BLOQUE'];
                const isBeBloque = (be: any) => {
                  const beLots = (lots as any[]).filter((l: any) => l.bon_entree_id === be.id);
                  return beLots.some((l: any) => STATUTS_BLOQUES.includes((l.cqlib_status || '').toUpperCase()));
                };
                // BEs supprimables = sans lots actifs
                const deletableBes = (filteredBEs as any[]).filter((be: any) => !isBeBloque(be));
                const allDeletableSelected = deletableBes.length > 0 && deletableBes.every((be: any) => selectedBeIds.includes(be.id));
                const someDeletableSelected = deletableBes.some((be: any) => selectedBeIds.includes(be.id));

                return (
                  <>
                    {/* Header sélection tout */}
                    {filteredBEs.length > 0 && canPerformAction('create_be') && (
                      <TouchableOpacity
                        onPress={() => toggleBeSelectAll(deletableBes.map((be: any) => be.id))}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 8,
                          paddingHorizontal: 16, paddingVertical: 8,
                          backgroundColor: '#F8F9FA',
                          borderBottomWidth: 1, borderBottomColor: '#E9ECEF',
                        }}
                      >
                        <MaterialCommunityIcons
                          name={allDeletableSelected ? 'checkbox-marked' : someDeletableSelected ? 'minus-box' : 'checkbox-blank-outline'}
                          size={18}
                          color={selectedBeIds.length > 0 ? '#2563EB' : '#94A3B8'}
                        />
                        <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '600' }}>
                          {selectedBeIds.length > 0
                            ? `${selectedBeIds.length} BE sélectionné(s)`
                            : `Sélectionner tous (${deletableBes.length} supprimable${deletableBes.length > 1 ? 's' : ''})`}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {(filteredBEs as any[]).map((be: any) => {
                      const bloque = isBeBloque(be);
                      const isChecked = selectedBeIds.includes(be.id);
                      return (
                        <View key={be.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                          {canPerformAction('create_be') && (
                            <TouchableOpacity
                              onPress={() => {
                                if (bloque) {
                                  Alert.alert(
                                    'Suppression impossible',
                                    `"${be.code}" contient des lots en QUARANTAINE, LIBÉRÉ ou BLOQUÉ.\n\nTraitez ou supprimez d'abord les lots liés.`
                                  );
                                } else {
                                  toggleBeSelect(be.id);
                                }
                              }}
                              style={{ paddingHorizontal: 10, alignSelf: 'stretch', justifyContent: 'center' }}
                            >
                              <MaterialCommunityIcons
                                name={bloque ? 'lock-outline' : isChecked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                                size={18}
                                color={bloque ? '#D97706' : isChecked ? '#2563EB' : '#CBD5E1'}
                              />
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            style={[
                              s.lotCard, { flex: 1 },
                              isMobile && { flexDirection: 'column', alignItems: 'flex-start', padding: 12 },
                              selId === be.id && s.lotCardActive,
                              isChecked && { backgroundColor: selId === be.id ? undefined : '#EFF6FF' },
                              bloque && { opacity: 0.7 },
                            ]}
                            onPress={() => setSelId(be.id)}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={[s.lotRef, selId === be.id && s.whiteText]}>{be.code}</Text>
                              <Text style={[s.lotArticle, selId === be.id && s.whiteText]}>
                                {suppliers.find((sup: any) => sup.id === be.supplier_id)?.name || be.supplier_name || '—'}
                              </Text>
                              <Text style={[s.lotMeta, selId === be.id && s.whiteTextMuted]}>{be.reception_date}</Text>
                              {bloque && (
                                <Text style={{ fontSize: 10, color: '#D97706', marginTop: 2, fontWeight: '600' }}>
                                  🔒 Lots actifs — non supprimable
                                </Text>
                              )}
                            </View>
                            {(() => {
                              const beLots = (lots as any[]).filter((l: any) => l.bon_entree_id === be.id);
                              const dominated = beLots.length === 0 ? be.status :
                                beLots.some((l: any) => l.cqlib_status === 'BLOQUE') ? 'BLOQUE' :
                                beLots.some((l: any) => l.cqlib_status === 'QUARANTAINE') ? 'QUARANTAINE' :
                                beLots.every((l: any) => l.cqlib_status === 'LIBERE') ? 'LIBERE' :
                                beLots.some((l: any) => l.cqlib_status === 'EN_ATTENTE') ? 'EN_ATTENTE' : be.status;
                              return <Badge label={formatLotStatus(dominated)} color={lotStatusColor(dominated)} />;
                            })()}
                          </TouchableOpacity>
                        </View>
                      );
                    })}

                    {/* Barre d'actions sélection BEs */}
                    {selectedBeIds.length > 0 && (
                      <View style={{
                        flexDirection: 'row', alignItems: 'center',
                        backgroundColor: '#1E40AF',
                        margin: 8, borderRadius: 10,
                        paddingHorizontal: 14, paddingVertical: 10,
                        gap: 8,
                      }}>
                        <MaterialCommunityIcons name="file-document-multiple-outline" size={16} color="#93C5FD" />
                        <Text style={{ color: '#FFF', fontWeight: '700', flex: 1, fontSize: 12 }}>
                          {selectedBeIds.length} BE sélectionné{selectedBeIds.length > 1 ? 's' : ''}
                        </Text>
                        {canPerformAction('create_be') && (
                          <TouchableOpacity
                            onPress={handleDeleteSelectedBes}
                            disabled={isDeletingLot}
                            style={{ backgroundColor: '#DC2626', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 3, opacity: isDeletingLot ? 0.5 : 1 }}
                          >
                            <MaterialCommunityIcons name="trash-can-outline" size={13} color="#FFF" />
                            <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '600' }}>{isDeletingLot ? '...' : 'Supprimer'}</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          onPress={() => setSelectedBeIds([])}
                          style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}
                        >
                          <Text style={{ color: '#FFF', fontSize: 11 }}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                );
              })()}

              {activeTab !== 'BONS' && filteredLots.length === 0 && filteredBEs.length === 0 && (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: '#888', fontSize: 14 }}>Aucun élément en {TAB_LABELS[activeTab] || activeTab}</Text>
                </View>
              )}

              {activeTab !== 'BONS' && (
                <>
                  {/* Header sélection tout */}
                  {filteredLots.length > 0 && (
                    <TouchableOpacity
                      onPress={() => toggleMpLotSelectAll(filteredLots.map((l) => l.id))}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                        backgroundColor: '#F8F9FA',
                        borderBottomWidth: 1,
                        borderBottomColor: '#E9ECEF',
                      }}
                    >
                      <MaterialCommunityIcons
                        name={
                          filteredLots.every((l) => selectedMpLotIds.includes(l.id))
                            ? 'checkbox-marked'
                            : filteredLots.some((l) => selectedMpLotIds.includes(l.id))
                              ? 'minus-box'
                              : 'checkbox-blank-outline'
                        }
                        size={18}
                        color={selectedMpLotIds.length > 0 ? '#2563EB' : '#94A3B8'}
                      />
                      <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '600' }}>
                        {selectedMpLotIds.length > 0
                          ? `${selectedMpLotIds.length} lot(s) sélectionné(s)`
                          : `Sélectionner tous (${filteredLots.length})`}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {filteredLots.map(lot => (
                    <View key={lot.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <TouchableOpacity
                        onPress={() => toggleMpLotSelect(lot.id)}
                        style={{ paddingHorizontal: 10, alignSelf: 'stretch', justifyContent: 'center' }}
                      >
                        <MaterialCommunityIcons
                          name={selectedMpLotIds.includes(lot.id) ? 'checkbox-marked' : 'checkbox-blank-outline'}
                          size={18}
                          color={selectedMpLotIds.includes(lot.id) ? '#2563EB' : '#CBD5E1'}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.lotCard, { flex: 1 }, isMobile && { flexDirection: 'column', alignItems: 'flex-start', padding: 12 }, selId === lot.id && s.lotCardActive, selectedMpLotIds.includes(lot.id) && { backgroundColor: selId === lot.id ? undefined : '#EFF6FF' }]}
                        onPress={() => setSelId(lot.id)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[s.lotRef, selId === lot.id && s.whiteText]}>{lot.code}</Text>
                          <Text style={[s.lotArticle, selId === lot.id && s.whiteText]}>{lot.article?.name}</Text>
                          <Text style={[s.lotMeta, selId === lot.id && s.whiteTextMuted]}>BE : {lot.be?.code || '—'} · {new Date(lot.reception_date).toLocaleDateString()}</Text>
                        </View>
                        <Badge label={formatLotStatus(lot.cqlib_status)} color={lotStatusColor(lot.cqlib_status)} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {/* Barre d'actions sélection */}
                  {selectedMpLotIds.length > 0 && (
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: '#1E40AF',
                      margin: 8,
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      gap: 8,
                    }}>
                      <MaterialCommunityIcons name="package-variant" size={16} color="#93C5FD" />
                      <Text style={{ color: '#FFF', fontWeight: '700', flex: 1, fontSize: 12 }}>
                        {selectedMpLotIds.length} lot{selectedMpLotIds.length > 1 ? 's' : ''} sélectionné{selectedMpLotIds.length > 1 ? 's' : ''}
                      </Text>
                      {canPerformAction('create_lot') && (
                        <TouchableOpacity
                          onPress={handleDeleteSelectedMpLots}
                          disabled={isDeletingLot}
                          style={{ backgroundColor: '#DC2626', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 3, opacity: isDeletingLot ? 0.5 : 1 }}
                        >
                          <MaterialCommunityIcons name="trash-can-outline" size={13} color="#FFF" />
                          <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '600' }}>{isDeletingLot ? '...' : 'Supprimer'}</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        onPress={() => setSelectedMpLotIds([])}
                        style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}
                      >
                        <Text style={{ color: '#FFF', fontSize: 11 }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>

          {/* Détail */}
          <View style={[s.detailSide, isMobile && { width: '100%', paddingHorizontal: 12, paddingVertical: 16, flex: 1 }]}>
            {selectedBe ? (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 32 }}>
                {(() => {
                  const be = selectedBe as any;
                  const beLots = lots.filter(l => l.bon_entree_id === be.id);
                  return (
                    <>
                      <View style={[s.detailHeader]}>
                        <View>
                          <Text style={s.detailRef}>{be.code}</Text>
                          <Text style={s.detailTitle}>{suppliers.find(s => s.id === be.supplier_id)?.name || be.supplier_name || '—'}</Text>
                        </View>
                        {(() => {
                          const dominated = beLots.length === 0 ? be.status :
                            beLots.some((l: any) => l.cqlib_status === 'BLOQUE') ? 'BLOQUE' :
                            beLots.some((l: any) => l.cqlib_status === 'QUARANTAINE') ? 'QUARANTAINE' :
                            (beLots as any[]).every((l: any) => l.cqlib_status === 'LIBERE') ? 'LIBERE' :
                            beLots.some((l: any) => l.cqlib_status === 'EN_ATTENTE') ? 'EN_ATTENTE' : be.status;
                          return <Badge label={formatLotStatus(dominated)} color={lotStatusColor(dominated)} />;
                        })()}
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
                        <View style={s.infoBox}><Text style={s.infoLab}>Article</Text><Text style={s.infoVal}>{articles.find(a => a.id === be.article_id)?.name || be.article_name || '—'}</Text></View>
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
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Badge label={formatLotStatus(lot.cqlib_status)} color={lotStatusColor(lot.cqlib_status)} />
                                <TouchableOpacity
                                  onPress={() => { setLabelLot(lot); setLabelModalVisible(true); }}
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: C.gold + '15', borderWidth: 1, borderColor: C.gold + '40' }}
                                >
                                  <MaterialCommunityIcons name="printer-outline" size={14} color={C.gold} />
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: C.gold }}>Étiquette</Text>
                                </TouchableOpacity>
                              </View>
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
                <View style={[s.detailHeader]}>
                  <View>
                    <Text style={s.detailRef}>{selectedLot.code}</Text>
                    <Text style={s.detailTitle}>{selectedLot.article?.name}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' }}>
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
                      <ActionButton label={isDeletingLot ? 'Suppression...' : 'Supprimer'} icon="trash-can-outline" disabled={isDeletingLot || lotMutation.isPending} onPress={() => {
                        confirmAction(
                        'Supprimer le lot',
                        `Êtes-vous sûr de vouloir supprimer "${selectedLot.code}" ? Cette action est irréversible.`,
                        () => deleteLotCascade(selectedLot)
                      ,
    'danger'
  );
                      }} />
                    )}
                    <ActionButton label="Étiquette MP" icon="printer-outline" onPress={() => handlePrintAndShowLabel(selectedLot)} />
                    <ActionButton
                      label="Pièces jointes"
                      icon="paperclip"
                      onPress={() => handleOpenAttachments(selectedLot.id, undefined)}
                    />
                    <ActionButton
                      label="Dossier FCQ"
                      icon="file-document-outline"
                      variant="primary"
                      onPress={async () => {
                        if (!supabase) return;
                        const { data: existing } = await supabase.from('fcq_dossiers').select('id, code, status').eq('lot_id', selectedLot.id).maybeSingle();
                        if (existing) {
                          navigation.navigate('Laboratory', { fcqDossierId: existing.id });
                        } else {
                          Alert.alert('Dossier FCQ', 'Le dossier FCQ sera créé automatiquement dès que le lot sera en QUARANTAINE.');
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
                  <View style={s.infoBox}><Text style={s.infoLab}>Fournisseur</Text><Text style={s.infoVal}>{suppliers.find(s => s.id === selectedLot.supplier_id)?.name || '—'}</Text></View>
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

      {/* Modal Étiquette MP — impression par lot */}
      <FormModal visible={labelModalVisible} title="Étiquette Matière Première" onClose={() => setLabelModalVisible(false)} onSave={() => setLabelModalVisible(false)} hideSaveButton>
        {labelLot && (
          <View style={s.qrCard}>
            <View style={s.qrHeader}>
              <Text style={s.qrHeaderText}>GSI — RÉCEPTION MATIÈRE PREMIÈRE</Text>
            </View>
            <View style={s.qrMain}>
              <View style={s.qrTextSide}>
                <Text style={s.qrLabel}>ARTICLE</Text>
                <Text style={s.qrValue}>{labelLot.article?.name || '—'}</Text>
                <Text style={[s.qrLabel, { marginTop: 8 }]}>N° LOT</Text>
                <Text style={s.qrValueStrong}>{labelLot.code}</Text>
                <Text style={[s.qrLabel, { marginTop: 8 }]}>QUANTITÉ</Text>
                <Text style={[s.qrValue]}>{(labelLot.qty_received ?? 0).toLocaleString()} {labelLot.unit || 'kg'}</Text>
                <Text style={[s.qrLabel, { marginTop: 8 }]}>FOURNISSEUR</Text>
                <Text style={s.qrValue}>{suppliers.find((sup: any) => sup.id === labelLot.supplier_id)?.name || '—'}</Text>
                <View style={[s.quarBadge, {
                  backgroundColor: lotStatusColor(labelLot.cqlib_status),
                  marginTop: 6,
                }]}>
                  <Text style={s.quarBadgeText}>{formatLotStatus(labelLot.cqlib_status)}</Text>
                </View>
              </View>
              <View style={s.qrImageSide}>
                <Image source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${labelLot.code}` }} style={s.qrImg} />
                <Text style={s.qrSub}>Scanner pour FCQ</Text>
              </View>
            </View>
            <View style={s.qrFooter}>
              <Text style={s.qrFooterText}>Réception : {labelLot.reception_date ? new Date(labelLot.reception_date).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR')} · {profile?.full_name}</Text>
            </View>
          </View>
        )}
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
      {/* Modal Pièces Jointes */}
      <FormModal
        visible={attachModalVisible}
        title="Pièces jointes du lot"
        onClose={() => setAttachModalVisible(false)}
        onSave={() => setAttachModalVisible(false)}
        hideSaveButton
      >
        {/* Boutons d'upload par catégorie */}
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: '#ADB5BD', marginBottom: 10 }}>
            AJOUTER UN DOCUMENT
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {ATTACHMENT_CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat.key}
                disabled={isUploading}
                onPress={() => handleUploadAttachment(cat.key)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
                  borderWidth: 1.5, borderColor: uploadingCategory === cat.key ? C.info : '#D1D9E0',
                  backgroundColor: uploadingCategory === cat.key ? C.info + '10' : '#F8F9FA',
                  opacity: isUploading && uploadingCategory !== cat.key ? 0.5 : 1,
                }}
              >
                <MaterialCommunityIcons
                  name={cat.icon as any}
                  size={16}
                  color={uploadingCategory === cat.key ? C.info : '#6C757D'}
                />
                <Text style={{ fontSize: 12, fontWeight: '700', color: uploadingCategory === cat.key ? C.info : '#495057' }}>
                  {uploadingCategory === cat.key ? 'Envoi...' : cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Liste des pièces jointes existantes */}
        <View>
          <Text style={{ fontSize: 11, fontWeight: '800', color: '#ADB5BD', marginBottom: 10 }}>
            DOCUMENTS ENREGISTRÉS ({attachments.length})
          </Text>
          {attachments.length === 0 ? (
            <View style={{ padding: 20, alignItems: 'center', backgroundColor: '#F8F9FA', borderRadius: 8 }}>
              <MaterialCommunityIcons name="folder-open-outline" size={32} color="#D1D9E0" />
              <Text style={{ fontSize: 13, color: '#ADB5BD', marginTop: 8 }}>Aucun document joint</Text>
            </View>
          ) : (
            attachments.map((doc: any) => {
              const cat = ATTACHMENT_CATEGORIES.find(c => c.key === doc.category);
              const isImage = doc.mime_type?.startsWith('image/');
              const sizeMb = doc.file_size ? (doc.file_size / 1024 / 1024).toFixed(2) + ' MB' : '';
              return (
                <View key={doc.id} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  padding: 12, backgroundColor: '#FFF', borderRadius: 8,
                  borderWidth: 1, borderColor: '#E9ECEF', marginBottom: 8,
                }}>
                  <MaterialCommunityIcons
                    name={isImage ? 'image-outline' : 'file-pdf-box'}
                    size={28}
                    color={isImage ? C.info : C.err}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#1A1A1A' }} numberOfLines={1}>
                      {doc.name}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#6C757D' }}>
                      {cat?.label ?? doc.category} {sizeMb ? `· ${sizeMb}` : ''} · {new Date(doc.created_at).toLocaleDateString('fr-FR')}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDownloadAttachment(doc)} style={{ padding: 6 }}>
                    <MaterialCommunityIcons name="download-outline" size={20} color={C.info} />
                  </TouchableOpacity>
                  {canPerformAction('create_lot') && (
                    <TouchableOpacity onPress={() => handleDeleteAttachment(doc)} style={{ padding: 6 }}>
                      <MaterialCommunityIcons name="trash-can-outline" size={20} color={C.err} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </View>
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
  detailSide: { flex: 2, backgroundColor: '#FFF', paddingHorizontal: 24, paddingVertical: 20 },
  lotCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E9ECEF', flexDirection: 'row', alignItems: 'center' },
  lotCardActive: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  lotRef: { fontSize: 11, fontWeight: '700', color: '#ADB5BD' },
  lotArticle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginTop: 4 },
  lotMeta: { fontSize: 12, color: '#6C757D', marginTop: 4 },
  whiteText: { color: '#FFF' },
  whiteTextMuted: { color: '#ADB5BD' },
  detailHeader: { flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', marginBottom: 24, gap: 12 },
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
