import * as React from 'react';
import { ScrollView, StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, useWindowDimensions, Platform, Alert, Linking, Image, Modal } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, KpiCard, ActionButton, AnimatedPage, FormModal, FormInput, FormSelect, ExportOverlay } from '../components/Ui';
import { useNavigation } from '@react-navigation/native';
import { SupplierCreateModal } from '../components/SupplierCreateModal';
import {
  useDaImport, useUserProfile, useMutation, useArticles, useSuppliers, useExchangeRates, useDaImportStepsLog, getSignedUrlForStorageFile, usePermissions, useNotification, confirmAction
} from '../lib/hooks';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../lib/i18n';
import { supabase, getNextCode } from '../lib/supabase';
import { downloadOrShareFile, pickPdfOrImage } from '../lib/filePicker';
import { N } from '../lib/notifIcons';
import { generatePdf, getPdfTemplate } from '../lib/pdf';

// Define a type for documents stored in the JSONB field
interface AttachedDocument {
  name: string;
  path: string;
  size?: number; // in bytes
  uploaded_at: string;
}

const STEP_MAP: Record<string, number> = {
  'DA_VALIDEE': 0, 'PROFORMA': 1, 'LC_VIREMENT': 2, 'EXPEDITION': 3,
  'CONNAISSEMENT': 4, 'DEDOUANEMENT': 5, 'ETA': 6, 'RECEPTION': 7,
};

export function PurchasingImportScreen({ navigation }: any) {
  const { width, height } = useWindowDimensions();
  const isMobile = width < 992;
  const { t } = useTranslation();
  const nav = useNavigation<any>();

  const handleExportPdf = async (da: any) => {
    setIsGeneratingPdf(true);
    setPdfProgress(0.2);
    try {
      const template = getPdfTemplate(
        `DOSSIER D'IMPORTATION - ${da.code}`,
        `
        <div class="summary-card">
          <strong>Article :</strong> ${da.article?.name || 'N/A'}<br />
          <strong>Fournisseur :</strong> ${da.supplier?.name || 'N/A'}<br />
          <strong>Auteur :</strong> ${profile?.full_name || 'ERP System'}
        </div>

        <h3>Données du Dossier</h3>
        <table>
          <thead>
            <tr>
              <th>Paramètre</th>
              <th class="text-right">Valeur</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Quantité (kg)</td><td class="text-right">${da.qty_kg}</td></tr>
            <tr><td>Montant Devise</td><td class="text-right">${da.amount_currency} ${da.currency}</td></tr>
            <tr><td>Délai (jours)</td><td class="text-right">${da.lead_time_days}</td></tr>
            <tr><td>ETA</td><td class="text-right">${da.eta_date || 'Non défini'}</td></tr>
            <tr><td>Statut Actuel</td><td class="text-right">${da.status}</td></tr>
          </tbody>
        </table>
        `
      );
      setPdfProgress(0.6);
      await generatePdf(template, `DA_IMPORT_${da.code}`);
      setPdfProgress(1.0);
    } catch (e) {
      console.error(e);
      Alert.alert('Erreur', 'Impossible de générer le PDF.');
    } finally {
      setTimeout(() => setIsGeneratingPdf(false), 500);
    }
  };

  const IMPORT_STEPS = [
    t('step_da_valid'), t('step_proforma'), t('step_lc'), t('step_shipping'),
    t('step_bl'), t('step_customs'), t('step_eta'), t('step_reception')
  ];

  const { profile } = useUserProfile();
  const { canPerformAction } = usePermissions();
  const role = profile?.role;
  const { data: dossiers = [], isPending: loading } = useDaImport();
  const { data: articles = [] } = useArticles(0, 500, 'MP');
  const { data: suppliers = [] } = useSuppliers();
  const { data: exchangeRates = [] } = useExchangeRates(); // Récupération des taux de change
  const queryClient = useQueryClient(); // Get query client for invalidation
  const [selId, setSelId] = React.useState<string | null>(null);

  const [modalVisible, setModalVisible] = React.useState(false);
  const [supplierModalVisible, setSupplierModalVisible] = React.useState(false);
  const [viewerVisible, setViewerVisible] = React.useState(false);
  const [viewerDoc, setViewerDoc] = React.useState<AttachedDocument | null>(null);
  const [viewerUri, setViewerUri] = React.useState<string | null>(null);
  
  const [isGeneratingPdf, setIsGeneratingPdf] = React.useState(false);
  const [pdfProgress, setPdfProgress] = React.useState(0);

  const [formData, setFormData] = React.useState<any>({ currency: 'USD', documents: [] }); // Default currency and empty documents array
  const [editMode, setEditMode] = React.useState<'create' | 'update'>('create');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const isAdmin = role === 'ADMIN';

  const daImportMutation = useMutation('da_import', () => {
    setModalVisible(false);
    setEditingId(null);
    setEditMode('create');
  });

  // ─── Notifications DA Import ────────────────────────────────────────────────
  const notify = useNotification();

  /**
   * Matrice des rôles à notifier pour chaque étape du workflow DA Import.
   * Création → DA_VALIDEE → PROFORMA → LC_VIREMENT → EXPEDITION
   *          → CONNAISSEMENT → DEDOUANEMENT → ETA → RECEPTION (LIVRÉ)
   */
  const DA_STEP_NOTIF: Record<string, { roles: string[]; label: string; icon: string }> = {
    CREATE:         { roles: ['RACH', 'ADMIN', 'DPI'],              label: 'Nouvelle DA Import créée',       icon: N.new      },
    DA_VALIDEE:     { roles: ['RACH', 'ADMIN', 'DPI'],              label: 'DA validée',                     icon: N.ok       },
    PROFORMA:       { roles: ['RACH', 'COMPTA', 'ADMIN'],           label: 'Proforma reçu',                  icon: N.doc      },
    LC_VIREMENT:    { roles: ['COMPTA', 'RACH', 'ADMIN'],           label: 'LC / Virement émis',             icon: N.finance  },
    EXPEDITION:     { roles: ['RACH', 'MAGA', 'PLAN', 'ADMIN'],     label: 'Expédition confirmée',           icon: N.shipping },
    CONNAISSEMENT:  { roles: ['RACH', 'MAGA', 'ADMIN'],             label: 'Connaissement disponible',       icon: N.bl       },
    DEDOUANEMENT:   { roles: ['RACH', 'MAGA', 'ADMIN'],             label: 'En cours de dédouanement',       icon: N.customs  },
    ETA:            { roles: ['MAGA', 'PLAN', 'RPROD', 'ADMIN'],    label: 'ETA confirmée — arrivée prévue', icon: N.eta      },
    RECEPTION:      { roles: ['MAGA', 'RPROD', 'PLAN', 'RACH', 'ADMIN'], label: 'Produit reçu — livré en stock', icon: N.reception },
  };

  /** Envoie une notification interne à chaque rôle concerné par cette étape. */
  const sendDaNotifications = React.useCallback(
    async (step: string, da: { code: string; id: string; article?: any; supplier?: any }) => {
      const conf = DA_STEP_NOTIF[step];
      if (!conf) return;
      const articleName = da.article?.name || da.article?.code || '';
      const supplierName = da.supplier?.name || '';
      const subject = `${conf.icon} DA Import ${da.code} — ${conf.label}`;
      const message = [
        `Dossier : ${da.code}`,
        articleName  && `Article : ${articleName}`,
        supplierName && `Fournisseur : ${supplierName}`,
        `Étape : ${conf.label}`,
      ].filter(Boolean).join('\n');

      for (const roleTarget of conf.roles) {
        await notify.mutateAsync({
          to_role: roleTarget as any,
          subject,
          message,
          type: 'internal',
          // category ici est utilisé par useNotification pour l'insert DB
          category: 'PURCHASING',
          // metadata.category est lu par roleNotifFilter dans AppShellHeader
          metadata: {
            category: 'PURCHASING',
            da_import_id: da.id,
            step,
            screen: 'PurchasingImport',   // nom exact du Drawer.Screen pour navigation
          },
        }).catch(() => {}); // Ne pas bloquer si une notif échoue
      }
    },
    [notify]
  );
  const uploadMutation = useMutation('documents');
  const stepsLogMutation = useMutation('da_import_steps_log');
  const [isUploading, setIsUploading] = React.useState(false);

  // ⚠️ Hook must be called unconditionally (Rules of Hooks) — before any early return
  const dossier = dossiers.find((d) => d.id === selId);
  const { data: stepsLog = [] } = useDaImportStepsLog(dossier?.id);
  const canManage = canPerformAction('advance_da_import') || role === 'RACH' || role === 'ADMIN';
  const canDeleteDoc = isAdmin || (profile?.id && dossier?.requested_by === profile.id);

  const handleNextStep = async () => {
    if (!dossier) return;
    const steps = ['DA_VALIDEE', 'PROFORMA', 'LC_VIREMENT', 'EXPEDITION', 'CONNAISSEMENT', 'DEDOUANEMENT', 'ETA', 'RECEPTION'];
    const currentIndex = steps.indexOf(dossier.current_step);
    if (currentIndex < steps.length - 1) {
      const nextStep = steps[currentIndex + 1];
      const updates: any = { current_step: nextStep };
      if (nextStep === 'RECEPTION') updates.status = 'LIVRE';

      await daImportMutation.mutateAsync({ id: dossier.id, values: updates, type: 'UPDATE' });

      stepsLogMutation.mutate({
        values: {
          da_import_id: dossier.id,
          step: nextStep,
          validated_by: profile?.id,
          validated_at: new Date().toISOString(),
        },
        type: 'INSERT'
      });

      // 🔔 Notifier tous les rôles concernés par cette étape
      await sendDaNotifications(nextStep, {
        code: dossier.code,
        id: dossier.id,
        article: dossier.article,
        supplier: dossier.supplier,
      });
    }
  };

  const setRatesLoading = (_v: boolean) => {}; // Placeholder – loading state not rendered

  // Fallback: stocker les taux dans localStorage quand l'auth est cassée
  const saveRatesToLocal = (usd: number, eur: number) => {
    if (typeof localStorage === 'undefined') return;
    try { localStorage.setItem('pdp_exchange_rates', JSON.stringify({ USD: usd, EUR: eur, updated_at: new Date().toISOString() })); } catch {}
  };
  const getLocalRates = (): Record<string, number> => {
    if (typeof localStorage === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem('pdp_exchange_rates') || '{}'); } catch { return {}; }
  };

  const fetchLatestRates = React.useCallback(async () => {
    setRatesLoading(true);
    let usdRate = 0, eurRate = 0;
    try {
      await supabase?.functions.invoke('update-exchange-rates');
      queryClient.invalidateQueries({ queryKey: ['exchange_rates'] });
      return;
    } catch {}
    // Fallback: direct API + localStorage
    try {
      const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const data = await res.json();
      if (!data?.rates) throw new Error('No rates');
      const mgaRate = data.rates['MGA'];
      if (!mgaRate) throw new Error('No MGA');
      usdRate = mgaRate;
      eurRate = mgaRate / (data.rates['EUR'] || 1);
      saveRatesToLocal(usdRate, eurRate);
      const today = new Date().toISOString().split('T')[0];
      const updates = [
        { from_currency: 'USD', to_currency: 'MGA', rate: usdRate, effective_date: today, source: 'API' },
        { from_currency: 'EUR', to_currency: 'MGA', rate: eurRate, effective_date: today, source: 'API' },
      ];
      try { for (const u of updates) await supabase?.from('exchange_rates').upsert(u, { onConflict: 'from_currency,to_currency,effective_date' }); } catch {}
      queryClient.invalidateQueries({ queryKey: ['exchange_rates'] });
    } catch {
      // Use localStorage fallback
    } finally {
      setRatesLoading(false);
    }
  }, []); // Removed queryClient from dependencies to prevent infinite loop

  // Recompute taux si present dans localStorage quand Supabase pas dispo
  const localRates = React.useMemo(() => getLocalRates(), []); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => { 
    fetchLatestRates(); 
  }, []); // Empty dependency array - run only once on mount

  const handleAdd = async () => {
    const year = new Date().getFullYear();
    let newCode = `DA-IMP-${year}-PEND`;
    try {
      newCode = await getNextCode('DA-IMP', 'da_import', 'code');
    } catch {}
    
    setEditMode('create');
    setEditingId(null);
    setFormData({
      code: newCode,
      status: 'EN_COURS',
      current_step: 'DA_VALIDEE',
      request_date: new Date().toISOString().split('T')[0],
      documents: [] // Initialize documents array
    });
    fetchLatestRates();
    setModalVisible(true);
  };

  // Stable refs to avoid infinite loop
  const exchangeRatesRef = React.useRef(exchangeRates);
  exchangeRatesRef.current = exchangeRates;
  const localRatesRef = React.useRef(localRates);

  React.useEffect(() => {
    const amount = parseFloat(formData.amount_currency);
    const currency = formData.currency;
    if (amount && currency) {
      const rateRow = exchangeRatesRef.current.find((r: any) => r.from_currency === currency);
      const rate = rateRow?.rate || localRatesRef.current[currency] || 0;
      setFormData((prev: any) => ({ ...prev, amount_mga: rate ? amount * rate : null }));
    } else {
      setFormData((prev: any) => ({ ...prev, amount_mga: null }));
    }
  }, [formData.amount_currency, formData.currency]); // exchangeRates via ref - no infinite loop

  React.useEffect(() => {
    const qtyCt = parseFloat(formData.qty_container || '0');
    if (qtyCt > 0) {
      const multiplier = formData.container_type === '40_FT' ? 26000 : 18000;
      const calcKg = qtyCt * multiplier;
      if (!formData.qty_kg || parseFloat(formData.qty_kg) === formData._last_calc_kg) {
        setFormData((prev: any) => ({ ...prev, qty_kg: String(calcKg), _last_calc_kg: calcKg }));
      }
    }
  }, [formData.qty_container, formData.container_type]);

  const handleSave = async () => {
    if (!formData.code || !formData.article_id) return;
    const allowedFields = {
      code: formData.code,
      article_id: formData.article_id,
      supplier_id: formData.supplier_id,
      qty_kg: parseFloat(formData.qty_kg || '0'),
      unit: formData.unit || 'kg',          // ⚠️ Appliquer la migration SQL avant déploiement
      qty_container: String(formData.qty_container || ''),
      currency: formData.currency || 'USD',
      amount_currency: parseFloat(formData.amount_currency || '0'),
      amount_mga: formData.amount_mga || null,
      current_step: formData.current_step || 'DA_VALIDEE',
      status: formData.status || 'EN_COURS',
      eta_date: formData.eta_date || null,
      notes: formData.notes || null,
      requested_by: profile?.id || null,
    };

    if (editMode === 'update' && editingId) {
      await daImportMutation.mutateAsync({ id: editingId, values: allowedFields, type: 'UPDATE' });
      // Pas de notification sur modification (seulement sur création et avancement d'étape)
    } else {
      const result = await daImportMutation.mutateAsync({ values: allowedFields, type: 'INSERT' }) as any[] | null;
      const newId = (result as any)?.[0]?.id ?? null;

      // 🔔 Notifier les rôles concernés par la création (DA_VALIDEE)
      const articleObj = articles.find((a: any) => a.id === formData.article_id);
      const supplierObj = suppliers.find((s: any) => s.id === formData.supplier_id);
      await sendDaNotifications('CREATE', {
        code: formData.code,
        id: newId || '',
        article: articleObj,
        supplier: supplierObj,
      });
    }
  };

  const [downloadingDoc, setDownloadingDoc] = React.useState<string | null>(null); // Stores the path of the doc being downloaded

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={C.green} />
      </View>
    );
  }

  const handleDownloadDocument = async (docName: string, docPath: string) => {

    if (!dossier) return;

    setDownloadingDoc(docPath);
    try {
      // 1. Obtenir une URL signée pour le fichier privé
      const signedUrl = await getSignedUrlForStorageFile('documents', docPath); // 'documents' est le nom de votre bucket
      if (!signedUrl) {
        Alert.alert(t('error'), t('no_signed_url'));
        return;
      }

      // 2. Si c'est une image et qu'on est sur mobile ou web, on l'affiche dans la galerie intégrée
      const isImage = /\.(jpg|jpeg|png|gif)$/i.test(docName);

      if (Platform.OS === 'web') {
        if (isImage) {
          setViewerUri(signedUrl);
          setViewerDoc({ name: docName, path: docPath, uploaded_at: '' });
          setViewerVisible(true);
        } else {
          Linking.openURL(signedUrl); // Pour les PDF sur le web
        }
      } else {
        await downloadOrShareFile(signedUrl, docName); // Sur mobile, téléchargement + partage natif
      }

    } catch (error: any) {
      Alert.alert(t('error'), error.message || t('download_failed'));
    } finally {
      setDownloadingDoc(null);
    }
  };

  const handlePickAndUploadDocument = async (dossierId: string, daCode: string) => {
    if (!dossierId || !daCode || !supabase) return;

    try {
      const picked = await pickPdfOrImage();
      if (!picked) return;

      const fileSize = picked.size;

      // Validation taille (10 Mo)
      const MAX_SIZE = 10 * 1024 * 1024;
      if (fileSize && fileSize > MAX_SIZE) {
        Alert.alert(t('error'), 'Le fichier est trop volumineux. Maximum 10 Mo.');
        return;
      }

      setIsUploading(true);

      let fileToUpload: any;
      if (Platform.OS === 'web') {
        fileToUpload = picked.file;
      } else {
        const response = await fetch(picked.uri);
        fileToUpload = await response.blob();
      }

      // Sanitise le nom de fichier (supprime accents et caractères spéciaux)
      const fileName = picked.name
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const filePath = `imports/${daCode}/${Date.now()}_${fileName}`;

      // --- Upload direct dans le bucket 'documents' ---
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, fileToUpload, { upsert: true, contentType: picked.mimeType ?? undefined });

      if (uploadError) throw uploadError;

      // Mise à jour du champ JSONB documents du dossier DA
      const newDocument: AttachedDocument = {
        name: picked.name,
        path: filePath,
        size: fileSize,
        uploaded_at: new Date().toISOString(),
      };
      const updatedDocuments = [...((dossier!.documents as AttachedDocument[]) || []), newDocument];
      await daImportMutation.mutateAsync({ id: dossierId, values: { documents: updatedDocuments }, type: 'UPDATE' });

      queryClient.invalidateQueries({ queryKey: ['da_import'] });
      Alert.alert(t('success'), t('document_attached_success'));
    } catch (error: any) {
      console.error('[Upload]', error);
      // Affichage détaillé de l'erreur pour diagnostic
      const msg = error?.message || error?.error_description || t('upload_failed');
      Alert.alert(t('error'), msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = async (_doc: AttachedDocument) => {
    if (!dossier) return;
    try {
      await uploadMutation.mutateAsync({ type: 'DELETE_FILE', path: _doc.path });
      const updatedDocuments = (dossier.documents || []).filter((doc: AttachedDocument) => doc.path !== _doc.path);
      await daImportMutation.mutateAsync({ id: dossier.id, values: { documents: updatedDocuments }, type: 'UPDATE' });
      Alert.alert('Succès', 'Le document a été supprimé.');
      queryClient.invalidateQueries({ queryKey: ['da_import'] });
    } catch (error: any) {
      Alert.alert('Erreur', error?.message || 'Impossible de supprimer le document.');
    }
  };

  return (
    <AnimatedPage>
      {isGeneratingPdf && <ExportOverlay visible={true} progress={pdfProgress} title="Génération du Dossier DA..." />}
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        {/* Header */}
        <View style={[s.headerRow, isMobile && { flexDirection: 'column', alignItems: 'flex-start', gap: 16 }]}>
          <View>
            <Text style={s.title}>{t('purchasing_import_title')}</Text>
            <Text style={s.subTitle}>{t('purchasing_import_sub')}</Text>
          </View>
          <View style={s.actions}>
            <ActionButton label={t('logistic_planning')} onPress={() => navigation.navigate('PlanningLogistique')} />
            {canPerformAction('create_da_import') && (

              <ActionButton label={t('new_da_import')} onPress={handleAdd} variant="primary" />
            )}
          </View>

        </View>

        <View style={[s.grid, isMobile && { flexDirection: 'column' }]}>
          <KpiCard label={t('active_da_import')} value={String(dossiers.filter(d => d.status === 'EN_COURS').length)} sub={t('loading')} color={C.info} />
          <KpiCard label={t('eta_alerts')} value={String(dossiers.filter(d => d.status === 'RETARD').length)} sub={t('immediate_action')} color={C.err} />
          <KpiCard label={t('avg_lead_time')} value="92j" sub="Port-to-Factory" />
        </View>

        <View style={{ height: 24 }} />
        <Text style={s.sectionLabel}>{t('import_files')}</Text>

        <View style={[s.mainGrid, isMobile && { flexDirection: 'column' }]}>
          {/* List */}
          <View style={[s.listCol, isMobile && { width: '100%' }]}>
            {dossiers.map((d) => (
              <TouchableOpacity
                key={d.id}
                onPress={() => setSelId(selId === d.id ? null : d.id)}
                style={[s.dossierCard, selId === d.id && s.dossierCardActive]}
              >
                <View style={s.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.dRef, selId === d.id && { color: '#FFF' }]}>{d.code}</Text>
                    <Text style={[s.dArticle, selId === d.id && { color: '#FFF' }]}>{d.article?.name}</Text>
                    <Text style={[s.dSup, selId === d.id && { color: '#ADB5BD' }]}>{d.supplier?.name} — {d.supplier?.country}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <View style={[s.statusBadge, { backgroundColor: d.status === 'RETARD' ? C.err + '20' : '#F8F9FA' }]}>
                      <Text style={[s.statusText, { color: d.status === 'RETARD' ? C.err : '#1A1A1A' }]}>{d.status}</Text>
                    </View>
                    <Text style={[s.dAmount, selId === d.id && { color: '#FFF' }]}>{d.amount_currency} {d.currency}</Text>
                  </View>
                </View>

                {/* Mini Stepper */}
                <View style={s.miniStepper}>
                  {IMPORT_STEPS.map((_, i) => (
                    <View
                      key={i}
                      style={[
                        s.stepDot,
                        i <= STEP_MAP[d.current_step] ? { backgroundColor: C.info } : { backgroundColor: '#E9ECEF' }
                      ]}
                    />
                  ))}
                </View>

                {/* Bouton imprimer DA accessible depuis la liste */}
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation?.(); handleExportPdf(d); }}
                  style={[s.printListBtn, selId === d.id && { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.3)' }]}
                >
                  <MaterialCommunityIcons name="printer-outline" size={13} color={selId === d.id ? '#FFF' : C.info} />
                  <Text style={[s.printListBtnLabel, selId === d.id && { color: '#FFF' }]}>Imprimer DA</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>

          {/* Detail */}
          {dossier && (
            <View style={[s.detailCol, isMobile && { width: '100%' }]}>
              <View style={s.detailCard}>
                <View style={s.detailHeader}>
                  <Text style={s.detailTitle}>{t('detailed_tracking')} — {dossier.code}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    {isAdmin && (
                      <ActionButton
                        label="Modifier"
                        icon="pencil-outline"
                        variant="secondary"
                        onPress={() => {
                          const dossierData = dossier as any;
                          setEditMode('update');
                          setEditingId(dossier.id);
                          setFormData({
                            code: dossierData.code,
                            article_id: dossierData.article_id,
                            supplier_id: dossierData.supplier_id,
                            container_type: dossierData.container_type,
                            qty_container: String(dossierData.qty_container || ''),
                            qty_kg: String(dossierData.qty_kg || ''),
                            currency: dossierData.currency,
                            amount_currency: String(dossierData.amount_currency || ''),
                            amount_mga: dossierData.amount_mga,
                            current_step: dossierData.current_step,
                            status: dossierData.status,
                            eta_date: dossierData.eta_date,
                            notes: dossierData.notes || '',
                            request_date: dossierData.request_date,
                          });
                          setModalVisible(true);
                        }}
                      />
                    )}
                    {isAdmin && (
                      <ActionButton
                        label="Supprimer"
                        icon="trash-can-outline"
                        onPress={() => {
                          confirmAction(
                            'Confirmer',
                            `Supprimer le dossier ${dossier.code} ?`,
                            () => daImportMutation.mutate({ id: dossier.id, type: 'DELETE' })
                          );
                        }}
                      />
                    )}
                    <ActionButton label="Imprimer DA" icon="printer-outline" variant="secondary" onPress={() => handleExportPdf(dossier)} />
                    <TouchableOpacity onPress={() => setSelId(null)}><MaterialCommunityIcons name="close" size={20} color="#666" /></TouchableOpacity>
                  </View>
                </View>

                <View style={s.workflow}>
                  {IMPORT_STEPS.map((step, i) => {
                    const logEntry = stepsLog.find((l: any) => l.step === Object.keys(STEP_MAP)[i]);
                    const isActive = i === STEP_MAP[dossier.current_step] && !logEntry;
                    const isDone = !!logEntry;
                    return (
                      <View key={i} style={s.wfItem}>
                        <View style={[s.wfCircle, isDone ? { borderColor: C.ok, backgroundColor: C.ok } : isActive ? { borderColor: C.info } : {}]}>
                          {isDone ? <MaterialCommunityIcons name="check" size={12} color="#FFF" /> : <Text style={[s.wfNum, isActive && { color: C.info }]}>{i + 1}</Text>}
                        </View>
                        <Text style={[s.wfLabel, isDone && { color: C.ok, fontWeight: '700' }, isActive && { fontWeight: '700', color: '#1A1A1A' }]}>{step}</Text>
                        {i < IMPORT_STEPS.length - 1 && <View style={[s.wfLine, isDone && { backgroundColor: C.ok }]} />}
                      </View>
                    );
                  })}
                </View>

                {/* Step History */}
                <View style={s.stepHistory}>
                  {IMPORT_STEPS.map((step, i) => {
                    const logEntry = stepsLog.find((l: any) => l.step === Object.keys(STEP_MAP)[i]);
                    const isDone = !!logEntry;
                    const isActive = i === STEP_MAP[dossier.current_step] && !logEntry;
                    const isPending = i > STEP_MAP[dossier.current_step] && !logEntry;
                    return (
                      <View key={i} style={s.stepRow}>
                        <View style={[s.stepStatus, isDone ? { backgroundColor: C.ok } : isActive ? { backgroundColor: C.info } : { backgroundColor: '#E9ECEF' }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={[s.stepName, isActive && { fontWeight: '800' }]}>{step}</Text>
                          {logEntry && (
                            <Text style={s.stepMeta}>
                              ✓ {new Date(logEntry.validated_at).toLocaleString('fr-FR')}
                              {logEntry.validated_by_user?.full_name ? ` · ${logEntry.validated_by_user.full_name}` : ''}
                            </Text>
                          )}
                          {isActive && <Text style={s.stepMeta}>En cours</Text>}
                          {isPending && <Text style={s.stepMeta}>À venir</Text>}
                        </View>
                        {isDone && <MaterialCommunityIcons name="check-circle" size={20} color={C.ok} />}
                        {isActive && <MaterialCommunityIcons name="clock-outline" size={20} color={C.info} />}
                      </View>
                    );
                  })}
                </View>

                <View style={s.detailInfo}>
                  <View style={s.infoGrid}>
                    <View style={s.infoBox}><Text style={s.infoLabel}>{t('qty_received')}</Text><Text style={s.infoValue}>{dossier.qty_container} CT · {dossier.qty_kg} Kg</Text></View>
                    <View style={s.infoBox}><Text style={s.infoLabel}>{t('eta_planned')}</Text><Text style={s.infoValue}>{dossier.eta_date ? new Date(dossier.eta_date).toLocaleDateString() : '—'}</Text></View>
                    <View style={s.infoBox}><Text style={s.infoLabel}>{t('incoterm')}</Text><Text style={s.infoValue}>FOB / CFR</Text></View>
                    <View style={s.infoBox}><Text style={s.infoLabel}>{t('leadtime')}</Text><Text style={s.infoValue}>{dossier.lead_time_days} jours</Text></View>
                  </View>

                  <View style={{ height: 32 }} />

                  {dossier.status !== 'LIVRE' ? (
                    <View style={s.detailActions}>
                      {canManage ? (
                        daImportMutation.isPending ? <ActivityIndicator color={C.info} /> : <ActionButton label={t('next_step_validate')} onPress={handleNextStep} variant="primary" />
                      ) : (
                        <Text style={s.restricted}>Accès restreint au service Achats</Text>
                      )}
                      <ActionButton label={t('view_docs')} onPress={() => { }} />
                    </View>
                  ) : (
                    <View style={s.closedBadge}>
                      <MaterialCommunityIcons name="check-decagram" size={20} color={C.ok} />
                      <Text style={s.closedText}>{t('closed_import_msg')}</Text>
                      <ActionButton label="PDF" icon="file-pdf-box" variant="secondary" onPress={() => handleExportPdf(dossier)} />
                    </View>
                  )}
                  <View style={s.detailSection}>
                    <Text style={s.sectionTitle}>{t('attached_docs')}</Text>
                    {(!dossier.documents || dossier.documents.length === 0) ? (
                      <Text style={s.emptyDocsText}>{t('no_docs')}</Text>
                    ) : (
                      dossier.documents.map((doc: AttachedDocument, index: number) => (
                        <View key={index} style={s.fileRow}>
                          <MaterialCommunityIcons
                            name={doc.name.endsWith('.pdf') ? "file-pdf-box" : "image"}
                            size={24}
                            color={doc.name.endsWith('.pdf') ? C.err : C.info}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={s.fileName} numberOfLines={1}>{doc.name}</Text>
                            <Text style={s.fileMeta}>{(doc.size ? (doc.size / (1024 * 1024)).toFixed(2) + ' MB' : '—')} · Scan ClamAV: OK</Text>
                          </View>
                          <ActionButton
                            label={downloadingDoc === doc.path ? t('downloading') : t('details')}
                            icon="eye-outline"
                            onPress={() => handleDownloadDocument(doc.name, doc.path)}
                            disabled={!!downloadingDoc}
                          />
                          {canDeleteDoc && (
                            <TouchableOpacity
                              style={s.deleteDocBtn}
                              onPress={() => handleDeleteDocument(doc)}
                              disabled={uploadMutation.isPending || daImportMutation.isPending}
                            >
                              <MaterialCommunityIcons name="trash-can-outline" size={20} color={C.err} />
                            </TouchableOpacity>
                          )}
                        </View>
                      ))
                    )}

                    {/* Bouton upload avec indicateur de chargement */}
                    {isUploading ? (
                      <View style={[s.uploadBtn, { justifyContent: 'center', gap: 10 }]}>
                        <ActivityIndicator size="small" color={C.info} />
                        <Text style={[s.uploadText, { color: C.info }]}>Envoi en cours...</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={s.uploadBtn}
                        onPress={() => handlePickAndUploadDocument(dossier.id, dossier.code)}
                        disabled={isUploading || daImportMutation.isPending}
                      >
                        <MaterialCommunityIcons name="cloud-upload-outline" size={20} color={C.info} />
                        <Text style={s.uploadText}>{t('upload_new_doc')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <FormModal
        visible={modalVisible}
        title={t('new_da_import')}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
        loading={daImportMutation.isPending} // Use daImportMutation for form saving
        isError={daImportMutation.isError}
        errorMessage={daImportMutation.errorMessage}
      >
        <FormInput label={t('analysis_code')} value={formData.code ?? ''} editable={false} style={{ backgroundColor: '#F1F3F5', color: '#6C757D' }} />
        <FormSelect
          label="Article — Matières Premières (MP)"
          value={formData.article_id ?? ''}
          options={articles.filter(a => {
            const t = (a.article_type || a.family || '').toUpperCase();
            return t === 'MP' || a.code?.startsWith('MP-');
          }).map(a => ({ label: `[${a.code || a.family || 'MP'}] ${a.name}`, value: a.id }))}
          onSelect={v => {
            const art = articles.find((a: any) => a.id === v);
            setFormData({ ...formData, article_id: v, unit: art?.unit || formData.unit || 'kg' });
          }}
          searchable
        />
        <FormSelect
          label={t('suppliers')}
          value={formData.supplier_id ?? ''}
          options={suppliers.map(s => ({ label: s.name, value: s.id }))}
          onSelect={v => setFormData({ ...formData, supplier_id: v })}
          emptyMessage={
            <TouchableOpacity
              onPress={() => setSupplierModalVisible(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 4 }}
            >
              <MaterialCommunityIcons name="plus-circle-outline" size={16} color="#2563EB" />
              <Text style={{ fontSize: 13, color: '#2563EB', fontWeight: '600' }}>Ajouter un fournisseur</Text>
            </TouchableOpacity>
          }
        />
        <FormSelect
          label="Type de Conteneur"
          value={formData.container_type || '20_FT'}
          options={[{ label: "20 Pieds (20' FT)", value: '20_FT' }, { label: "40 Pieds (40' FT)", value: '40_FT' }]}
          onSelect={v => setFormData({ ...formData, container_type: v })}
        />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <FormInput label="Nb Conteneurs" value={String(formData.qty_container || '')} onChangeText={val => setFormData({ ...formData, qty_container: val })} keyboardType="numeric" />
          </View>
          <View style={{ flex: 1 }}>
            <FormInput label={t('qty_received')} value={String(formData.qty_kg || '')} onChangeText={val => setFormData({ ...formData, qty_kg: val })} keyboardType="numeric" />
          </View>
          <View style={{ flex: 1 }}>
            <FormSelect
              label="Unité"
              value={formData.unit || 'kg'}
              options={[
                { label: 'kg', value: 'kg' },
                { label: 'T', value: 'T' },
                { label: 'g', value: 'g' },
                { label: 'L', value: 'L' },
                { label: 'PCE', value: 'PCE' },
                { label: 'Sac', value: 'Sac' },
                { label: 'Bidon', value: 'Bidon' },
              ]}
              onSelect={v => setFormData({ ...formData, unit: v })}
            />
          </View>
        </View>
        <FormInput label={t('amount_currency')} value={String(formData.amount_currency || '')} onChangeText={val => setFormData({ ...formData, amount_currency: val })} keyboardType="numeric" />
        <FormSelect
          label={t('currency_label')}
          value={formData.currency ?? ''}
          options={Array.from(new Map(exchangeRates.map(r => [r.from_currency, r])).values()).map(r => ({ label: r.from_currency, value: r.from_currency }))}
          onSelect={v => setFormData({ ...formData, currency: v })}
        />
        <FormInput
          label={t('calculated_amount_mga')}
          value={formData.amount_mga ? formData.amount_mga.toLocaleString('fr-FR') : t('no_exchange_rate')}
          onChangeText={() => {}}
          editable={false} // Ce champ est calculé, donc non éditable
          style={{ backgroundColor: '#F8F9FA' }} // Style pour indiquer qu'il est non éditable
        />
        <FormInput label={t('incoterm')} value={formData.incoterm || ''} onChangeText={val => setFormData({ ...formData, incoterm: val })} placeholder="ex: FOB, CFR" />
        <FormInput label={t('notes_obs')} value={formData.notes || ''} onChangeText={val => setFormData({ ...formData, notes: val })} />
      </FormModal>

      {/* Document Viewer / Galerie d'images intégrée */}
      <Modal visible={viewerVisible} transparent animationType="slide">
        <View style={s.viewerOverlay}>
          <View style={s.viewerHeader}>
            <Text style={s.viewerTitle} numberOfLines={1}>{viewerDoc?.name}</Text>
            <TouchableOpacity onPress={() => setViewerVisible(false)} style={s.viewerClose}>
              <MaterialCommunityIcons name="close" size={28} color="#FFF" />
            </TouchableOpacity>
          </View>
          <View style={s.viewerBody}>
            {viewerUri && (
              <ScrollView
                maximumZoomScale={5}
                minimumZoomScale={1}
                pinchGestureEnabled={true}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                centerContent={true}
                style={{ flex: 1, width: '100%' }}
              >
                <Image
                  source={{ uri: viewerUri }}
                  style={{ width: width, height: height * 0.7 }}
                  resizeMode="contain"
                />
              </ScrollView>
            )}
          </View>
          <View style={s.viewerFooter}>
            <ActionButton
              label="Ouvrir dans le navigateur"
              icon="open-in-new"
              onPress={() => viewerUri && Linking.openURL(viewerUri)}
            />
          </View>
        </View>
      </Modal>

      <SupplierCreateModal
        visible={supplierModalVisible}
        onClose={() => setSupplierModalVisible(false)}
        onCreated={(id, name) => {
          setSupplierModalVisible(false);
          if (id) setFormData((prev: any) => ({ ...prev, supplier_id: id }));
        }}
      />
    </AnimatedPage >
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 24 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },
  subTitle: { fontSize: 13, color: '#6C757D', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 12 },
  grid: { flexDirection: 'row', gap: 16 },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: '#ADB5BD', letterSpacing: 1, marginBottom: 12 },
  mainGrid: { flexDirection: 'row', gap: 24 },
  listCol: { flex: 1 },
  detailCol: { flex: 1.2 },
  dossierCard: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E9ECEF', padding: 20, marginBottom: 12 },
  dossierCardActive: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  dRef: { fontSize: 11, fontWeight: '700', color: '#ADB5BD', fontFamily: Platform.OS === 'web' ? 'Menlo' : 'monospace' },
  dArticle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginTop: 4 },
  dSup: { fontSize: 12, color: '#6C757D', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 10, fontWeight: '800' },
  dAmount: { fontSize: 15, fontWeight: '800', color: '#1A1A1A' },
  miniStepper: { flexDirection: 'row', gap: 4 },
  stepDot: { flex: 1, height: 3, borderRadius: 2 },
  printListBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 10, alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 6, borderWidth: 1, borderColor: C.info + '40',
    backgroundColor: C.info + '10',
  },
  printListBtnLabel: { fontSize: 11, fontWeight: '600', color: C.info },
  detailCard: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E9ECEF', overflow: 'hidden' },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F8F9FA' },
  detailTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  workflow: { flexDirection: 'row', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F8F9FA' },
  wfItem: { flex: 1, alignItems: 'center', position: 'relative' },
  wfCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#E9ECEF', alignItems: 'center', justifyContent: 'center', zIndex: 2, backgroundColor: '#FFF' },
  wfNum: { fontSize: 10, fontWeight: '800', color: '#ADB5BD' },
  wfLabel: { fontSize: 9, color: '#ADB5BD', marginTop: 8, textAlign: 'center' },
  wfLine: { position: 'absolute', height: 2, backgroundColor: '#E9ECEF', width: '100%', top: 11, left: '50%', zIndex: 1 },
  detailInfo: { padding: 20 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  infoBox: { width: '45%' },
  infoLabel: { fontSize: 11, color: '#ADB5BD', fontWeight: '700', textTransform: 'uppercase' },
  infoValue: { fontSize: 13, fontWeight: '600', color: '#1A1A1A', marginTop: 4 },
  detailActions: { flexDirection: 'row', gap: 12 },
  restricted: { fontSize: 12, color: '#6C757D', fontStyle: 'italic' },
  closedBadge: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, backgroundColor: '#F8F9FA', borderRadius: 8 },
  closedText: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: '#F8F9FA', borderRadius: 8, marginTop: 12 },
  fileName: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
  fileMeta: { fontSize: 11, color: '#ADB5BD', marginTop: 2 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderWidth: 1, borderColor: C.info, borderStyle: 'dashed', borderRadius: 8, marginTop: 16 },
  uploadText: { color: C.info, fontSize: 13, fontWeight: '600' },
  viewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  viewerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 20 },
  viewerTitle: { color: '#FFF', fontSize: 16, fontWeight: '700', flex: 1 },
  viewerClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  viewerBody: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  viewerImage: { width: '100%', height: '80%' },
  viewerFooter: { padding: 30, alignItems: 'center' },
  deleteDocBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#FFE3E3' },
  stepHistory: { padding: 20, borderTopWidth: 1, borderTopColor: '#F8F9FA' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F8F9FA' },
  stepStatus: { width: 10, height: 10, borderRadius: 5 },
  stepName: { fontSize: 13, color: '#1A1A1A', fontWeight: '600' },
  stepMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  detailSection: { padding: 20, borderTopWidth: 1, borderTopColor: '#F8F9FA' },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#ADB5BD', letterSpacing: 1, marginBottom: 12 },
  emptyDocsText: { fontSize: 13, color: '#ADB5BD', fontStyle: 'italic', paddingVertical: 10 },
});
