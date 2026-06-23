import * as React from 'react';
import { View, StyleSheet, Text, useWindowDimensions, Alert, Platform, ActivityIndicator } from 'react-native';
import { AnimatedPage, DataTable, ActionButton, Badge, C, ExportOverlay, PaginationControls, FormModal, FormInput, FormSelect, SectionTitle } from '../components/Ui';
import { useTranslation } from '../lib/i18n';
import { useSearch } from '../lib/search';
import { useArticles, useSuppliers, useDepots, useSupplierEvalSummaries, useMutation, useUserProfile, confirmAction, useBoms, useNotification } from '../lib/hooks';
import { CsvImportModal } from '../components/CsvImportModal';
import { useQueryClient } from '@tanstack/react-query';
import { generatePdf, getPdfTemplate } from '../lib/pdf';
import { ProductDatasheet } from '../lib/database.types';
import { ScrollView } from 'react-native';
import * as XLSX from 'xlsx';
import { supabase, getNextCode } from '../lib/supabase';
import { playNotificationSound } from '../lib/notificationSound';
import { N } from '../lib/notifIcons';

const EVAL_CRITERIA = [
  { label: 'Qualité', value: 'QUALITY' },
  { label: 'Livraison', value: 'DELIVERY' },
  { label: 'Prix', value: 'PRICE' },
  { label: 'Conformité', value: 'COMPLIANCE' },
  { label: 'Service', value: 'SERVICE' },
];

const CLASSIFICATION_MAP: Record<string, { label: string; color: string }> = {
  A: { label: 'Excellent', color: C.ok },
  B: { label: 'Bon', color: C.info },
  C: { label: 'Moyen', color: C.gold },
  D: { label: 'Faible', color: C.err },
};

// ─── Fetch toutes les données sans pagination puis export XLSX ───────────────
async function fetchAllAndExport(tab: 'mp' | 'pf' | 'suppliers' | 'depots', onProgress?: (value: number) => void): Promise<void> {
  if (!supabase) { Alert.alert('Erreur', 'Client Supabase non initialisé.'); return; }
  onProgress?.(0.05);

  let rows: any[] = [];
  let sheetName = '';
  let fileName = '';

  if (tab === 'mp' || tab === 'pf') {
    const type = tab === 'mp' ? 'MP' : 'PF';
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .eq('article_type', type)
      .order('code');
    if (error) throw error;
    rows = (data || []).map((item: any) => ({
      Code: item.code || '',
      'Désignation (FR)': item.name || '',
      'Description (EN)': item.name_en || '',
      Type: item.article_type || '',
      Unité: item.unit || '',
      Statut: item.active ? 'ACTIF' : 'INACTIF',
    }));
    sheetName = tab === 'mp' ? 'Matières Premières' : 'Produits Finis';
    fileName  = tab === 'mp' ? 'matieres_premieres.xlsx' : 'produits_finis.xlsx';

  } else if (tab === 'suppliers') {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('name');
    if (error) throw error;
    rows = (data || []).map((item: any) => ({
      Code: item.code || '',
      Nom: item.name || '',
      Pays: item.country || '',
      Devise: item.currency || '',
      Email: item.email || '',
      Téléphone: item.phone || '',
      Statut: item.active ? 'ACTIF' : 'INACTIF',
    }));
    sheetName = 'Fournisseurs';
    fileName  = 'fournisseurs.xlsx';

  } else {
    const { data, error } = await supabase
      .from('depots')
      .select('*')
      .order('code');
    if (error) throw error;
    rows = (data || []).map((item: any) => ({
      Code: item.code || '',
      'Nom du dépôt': item.name || '',
      'Type stocké': item.depot_type || '',
    }));
    sheetName = 'Dépôts';
    fileName  = 'depots.xlsx';
  }

  if (rows.length === 0) {
    Alert.alert('Aucune donnée', "Il n'y a rien à exporter pour cet onglet.");
    return;
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  // Largeurs colonnes auto
  ws['!cols'] = Object.keys(rows[0]).map((key) => ({
    wch: Math.max(key.length, ...rows.map((r) => String(r[key] || '').length)) + 2,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  onProgress?.(0.7);

  if (Platform.OS === 'web') {
    XLSX.writeFile(wb, fileName);
  } else {
    Alert.alert('Export XLSX', `Fichier généré : ${fileName}`);
  }
  onProgress?.(1);
}

export function ReferentialScreen({ route }: any) {
  const { lang } = useTranslation();
  const { searchQuery } = useSearch();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [activeTab, setActiveTab] = React.useState<'mp' | 'pf' | 'suppliers' | 'depots'>(
    route?.params?.initialTab || 'mp'
  );
  const { profile } = useUserProfile();
  const notify = useNotification();
  const [exportProgress, setExportProgress] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const [mpPrefixFilter, setMpPrefixFilter] = React.useState<'SICD' | 'SPAH' | ''>('');
  const [pfCategoryFilter, setPfCategoryFilter] = React.useState('');
  const limit = 20;

  const articleTypeFilter = activeTab === 'mp' ? 'MP' : activeTab === 'pf' ? 'PF' : undefined;
  // Passe le filtre de catégorie au serveur directement :
  // MP → filtre par préfixe SICD/SPAH, PF → filtre par catégorie SAV/COR/BOU/ENC/PH/DET
  const articlePrefixFilter = activeTab === 'mp' ? mpPrefixFilter
    : activeTab === 'pf' && pfCategoryFilter ? `PF-${pfCategoryFilter}` : undefined;
  const { data: articles = [], count: articlesCount, isPending: loadingArticles } = useArticles(page, limit, articleTypeFilter, searchQuery, articlePrefixFilter);
  const { data: suppliers = [], count: suppliersCount, isPending: loadingSuppliers } = useSuppliers(page, limit, searchQuery);
  const { data: depots = [], isPending: loadingDepots } = useDepots();
  const { data: evalSummaries = [] } = useSupplierEvalSummaries();

  // ─── Fiche technique produit autonome (M6) ─────────────────────────────
  const [datasheetModalVisible, setDatasheetModalVisible] = React.useState(false);
  const [datasheetArticle, setDatasheetArticle] = React.useState<any>(null);
  const [datasheetForm, setDatasheetForm] = React.useState<Partial<ProductDatasheet>>({});
  const [datasheetLoading, setDatasheetLoading] = React.useState(false);

  const openDatasheet = async (article: any) => {
    setDatasheetArticle(article);
    setDatasheetForm({ article_id: article.id, family: article.family, commercial_name: article.name, status: 'BROUILLON', version: 1 });
    setDatasheetModalVisible(true);
    if (!supabase) return;
    const { data } = await supabase
      .from('product_datasheets')
      .select('*')
      .eq('article_id', article.id)
      .order('version', { ascending: false })
      .limit(1);
    if (data && data.length > 0) setDatasheetForm(data[0] as ProductDatasheet);
  };

  const saveDatasheet = async () => {
    if (!supabase || !datasheetArticle) { setDatasheetModalVisible(false); return; }
    setDatasheetLoading(true);
    try {
      const payload: any = {
        family: datasheetForm.family ?? null,
        commercial_name: datasheetForm.commercial_name ?? null,
        description: datasheetForm.description ?? null,
        quality_specs: datasheetForm.quality_specs ?? null,
        physical_specs: datasheetForm.physical_specs ?? null,
        packaging: datasheetForm.packaging ?? null,
        storage_conditions: datasheetForm.storage_conditions ?? null,
        shelf_life: datasheetForm.shelf_life ?? null,
        usage_instructions: datasheetForm.usage_instructions ?? null,
        regulatory: datasheetForm.regulatory ?? null,
        status: datasheetForm.status ?? 'BROUILLON',
      };
      if (datasheetForm.id) {
        await supabase.from('product_datasheets').update(payload).eq('id', datasheetForm.id);
      } else {
        await supabase.from('product_datasheets').insert({ ...payload, article_id: datasheetArticle.id, version: 1, created_by: profile?.id ?? null });
      }
      queryClient.invalidateQueries({ queryKey: ['product_datasheets'] });
      setDatasheetModalVisible(false);
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Enregistrement de la fiche technique impossible.');
    } finally {
      setDatasheetLoading(false);
    }
  };

  const generateDatasheetPdf = () => {
    const a = datasheetArticle;
    if (!a) return;
    const f = datasheetForm;
    const row = (label: string, val?: string | null) => val ? `<tr><td style="width:30%; font-weight:700;">${label}</td><td>${(val || '').replace(/\n/g, '<br/>')}</td></tr>` : '';
    const html = getPdfTemplate(
      `FICHE TECHNIQUE PRODUIT — ${a.code}`,
      `<div class="summary-card">
        <strong>PRODUIT :</strong> ${f.commercial_name || a.name}<br/>
        <strong>CODE :</strong> ${a.code} &nbsp;·&nbsp; <strong>GAMME :</strong> ${f.family || a.family || '—'}<br/>
        <strong>VERSION :</strong> ${f.version || 1} &nbsp;·&nbsp; <strong>STATUT :</strong> ${f.status || 'BROUILLON'}
      </div>
      <table>
        ${row('Description', f.description)}
        ${row('Spécifications qualité', f.quality_specs)}
        ${row('Caractéristiques physiques', f.physical_specs)}
        ${row('Conditionnement', f.packaging)}
        ${row('Conditions de stockage', f.storage_conditions)}
        ${row('Durée de vie / DLUO', f.shelf_life)}
        ${row('Mode d\'emploi', f.usage_instructions)}
        ${row('Mentions réglementaires', f.regulatory)}
      </table>`,
    );
    generatePdf(html, `Fiche_Technique_${a.code}.pdf`);
  };

  // ─── Filtre PF : n'afficher que les PF présents dans un BOM ─────────────
  const { data: boms = [] } = useBoms();
  const bomProductIds = React.useMemo(
    () => new Set(boms.map((b: any) => b.product_id)),
    [boms]
  );
  const displayedArticles = React.useMemo(() => {
    // Le filtre serveur (préfixe) gère déjà la catégorie PF — on retourne directement
    return articles;
  }, [articles]);

  const [showImport, setShowImport] = React.useState(false);
  const [evalModalVisible, setEvalModalVisible] = React.useState(false);
  const [evalFormData, setEvalFormData] = React.useState<any>({});
  const [isExporting, setIsExporting] = React.useState(false);

  // ─── Modal Ajouter ────────────────────────────────────────────────────────
  const [addModalVisible, setAddModalVisible] = React.useState(false);
  const [addForm, setAddForm] = React.useState<any>({});
  const [isSavingAdd, setIsSavingAdd] = React.useState(false);

  // ─── Modal Modifier (fournisseur) ─────────────────────────────────────────
  const [editSupplierVisible, setEditSupplierVisible] = React.useState(false);
  const [editSupplierForm, setEditSupplierForm] = React.useState<any>({});
  const [isSavingEdit, setIsSavingEdit] = React.useState(false);

  // ─── Modal Modifier (article MP/PF) ───────────────────────────────────────
  const [editArticleVisible, setEditArticleVisible] = React.useState(false);
  const [editArticleForm, setEditArticleForm] = React.useState<any>({});
  const [isSavingEditArticle, setIsSavingEditArticle] = React.useState(false);

  const handleOpenEditArticle = (item: any) => {
    setEditArticleForm({ ...item });
    setEditArticleVisible(true);
  };

  const handleSaveEditArticle = async () => {
    if (!supabase) return;
    if (!editArticleForm.code?.trim() || !editArticleForm.name?.trim() || !editArticleForm.unit?.trim()) {
      Alert.alert('Champs manquants', 'Code, Désignation et Unité sont obligatoires.'); return;
    }
    setIsSavingEditArticle(true);
    try {
      await new Promise<void>((resolve, reject) => {
        articleMutation.mutate(
          { id: editArticleForm.id, values: editArticleForm, type: 'UPDATE' },
          { onSuccess: () => resolve(), onError: (e) => reject(e) }
        );
      });
      setEditArticleVisible(false);
      setEditArticleForm({});
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Impossible de modifier.');
    } finally {
      setIsSavingEditArticle(false);
    }
  };

  const handleOpenEditSupplier = (item: any) => {
    setEditSupplierForm({ ...item });
    setEditSupplierVisible(true);
  };

  const handleSaveEditSupplier = async () => {
    if (!supabase) return;
    if (!editSupplierForm.code?.trim() || !editSupplierForm.name?.trim()) {
      Alert.alert('Champs manquants', 'Code et Nom sont obligatoires.'); return;
    }
    setIsSavingEdit(true);
    try {
      await new Promise<void>((resolve, reject) => {
        supplierMutation.mutate(
          { id: editSupplierForm.id, values: editSupplierForm, type: 'UPDATE' },
          { onSuccess: () => resolve(), onError: (e) => reject(e) }
        );
      });
      setEditSupplierVisible(false);
      setEditSupplierForm({});
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Impossible de modifier.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteSupplier = (item: any) => {
    confirmAction(
      'Supprimer le fournisseur',
      `Voulez-vous vraiment supprimer "${item.name}" ?`,
      () => supplierMutation.mutate({ id: item.id, type: 'DELETE' })
    ,
    'danger'
  );
  };

  // Sélecteur de préfixe/catégorie avant ouverture du formulaire
  const [prefixPickerVisible, setPrefixPickerVisible] = React.useState(false);
  const [selectedPrefix, setSelectedPrefix] = React.useState<string>('');

  // ─── Préfixes MP ─────────────────────────────────────────────────────────
  const MP_PREFIXES = [
    { label: 'SICD – Matières générales', value: 'SICD' },
    { label: 'SPAH – Matières SPAH',      value: 'SPAH' },
  ];

  // ─── Catégories PF (PF-XXX-NNN) ─────────────────────────────────────────
  const PF_CATEGORIES = [
    { label: 'BOU – Bougie',    value: 'BOU' },
    { label: 'COR – Corde',     value: 'COR' },
    { label: 'EMB – Emballage', value: 'EMB' },
    { label: 'SAV – Savon',     value: 'SAV' },
    { label: 'AUT – Autre',     value: 'AUT' },
  ];

  const articleMutation  = useMutation('articles',  () => { queryClient.invalidateQueries({ queryKey: ['articles'] }); });
  const supplierMutation = useMutation('suppliers', () => { queryClient.invalidateQueries({ queryKey: ['suppliers'] }); });
  const depotMutation    = useMutation('depots',    () => { queryClient.invalidateQueries({ queryKey: ['depots'] }); });

  // Ouvre le sélecteur de préfixe (MP/PF) ou directement le formulaire (autres)
  const handleOpenAdd = () => {
    if (activeTab === 'mp' || activeTab === 'pf') {
      setSelectedPrefix('');
      setPrefixPickerVisible(true);
    } else {
      handleOpenAddWithPrefix('');
    }
  };

  // Appelé une fois le préfixe/catégorie choisi (ou '' pour les autres onglets)
  const handleOpenAddWithPrefix = async (prefix: string) => {
    setPrefixPickerVisible(false);
    setAddForm({ active: true });
    setAddModalVisible(true);
    try {
      if (activeTab === 'mp') {
        // Préfixe choisi : SICD, SPAH… -> code = SICD-001
        const code = await getNextCode(prefix, 'articles', 'code');
        setAddForm((f: any) => ({ ...f, code, article_type: 'MP', unit: 'KG' }));
      } else if (activeTab === 'pf') {
        // Catégorie choisie : BOU, COR… -> code = PF-BOU-001
        const fullPrefix = 'PF-' + prefix;
        const code = await getNextCode(fullPrefix, 'articles', 'code');
        setAddForm((f: any) => ({ ...f, code, article_type: 'PF', unit: 'KG' }));
      } else if (activeTab === 'suppliers') {
        const code = await getNextCode('FRN', 'suppliers', 'code');
        setAddForm((f: any) => ({ ...f, code, currency: 'MGA', active: true }));
      } else {
        const code = await getNextCode('DEP', 'depots', 'code');
        setAddForm((f: any) => ({ ...f, code, active: true }));
      }
    } catch { /* code restera vide, l'utilisateur peut le saisir */ }
  };

  const handleSaveAdd = async () => {
    if (!supabase) return;
    setIsSavingAdd(true);
    try {
      if (activeTab === 'mp' || activeTab === 'pf') {
        if (!addForm.code?.trim() || !addForm.name?.trim() || !addForm.unit?.trim()) {
          Alert.alert('Champs manquants', 'Code, Désignation et Unité sont obligatoires.'); return;
        }
        await new Promise<void>((resolve, reject) => {
          articleMutation.mutate(
            { values: { ...addForm, article_type: activeTab === 'mp' ? 'MP' : 'PF', active: addForm.active !== false }, type: 'INSERT' },
            {
              onSuccess: () => {
                // 🔔 Notification création article
                const typeLabel = activeTab === 'mp' ? 'Matière Première (MP)' : 'Produit Fini (PF)';
                const notifSubject = `${N.new} Nouvel article cree — ${addForm.code}`;
                const notifMsg = [
                  `Code : ${addForm.code}`,
                  `Désignation : ${addForm.name}`,
                  `Type : ${typeLabel}`,
                  addForm.unit && `Unité : ${addForm.unit}`,
                  profile?.full_name && `Créé par : ${profile.full_name}`,
                ].filter(Boolean).join('\n');
                (['ADMIN', 'RACH', 'MAGA'] as const).forEach(role => {
                  notify.mutate({
                    to_role: role,
                    subject: notifSubject,
                    message: notifMsg,
                    type: 'info',
                    category: 'SYSTEM',
                    metadata: { category: 'CREATION', code: addForm.code, article_type: activeTab === 'mp' ? 'MP' : 'PF', screen: 'Referential' },
                  });
                });
                playNotificationSound('creation');
                resolve();
              },
              onError: (e) => reject(e),
            }
          );
        });
      } else if (activeTab === 'suppliers') {
        if (!addForm.code?.trim() || !addForm.name?.trim()) {
          Alert.alert('Champs manquants', 'Code et Nom sont obligatoires.'); return;
        }
        await new Promise<void>((resolve, reject) => {
          supplierMutation.mutate(
            { values: { ...addForm, active: addForm.active !== false }, type: 'INSERT' },
            { onSuccess: () => resolve(), onError: (e) => reject(e) }
          );
        });
      } else {
        if (!addForm.code?.trim() || !addForm.name?.trim()) {
          Alert.alert('Champs manquants', 'Code et Nom sont obligatoires.'); return;
        }
        await new Promise<void>((resolve, reject) => {
          depotMutation.mutate(
            { values: { ...addForm, active: addForm.active !== false }, type: 'INSERT' },
            { onSuccess: () => resolve(), onError: (e) => reject(e) }
          );
        });
      }
      setAddModalVisible(false);
      setAddForm({});
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Impossible d\'enregistrer.');
    } finally {
      setIsSavingAdd(false);
    }
  };

  const evalMutation = useMutation('supplier_evaluations', () => setEvalModalVisible(false));

  const queryClient = useQueryClient();

  React.useEffect(() => { setPage(0); }, [searchQuery, activeTab, mpPrefixFilter]);

  const handleOpenEval = (supplierId: string) => {
    setEvalFormData({ supplier_id: supplierId, period: 'YEARLY', year: new Date().getFullYear(), evaluated_by: profile?.id });
    setEvalModalVisible(true);
  };

  const handleSaveEval = () => {
    if (!evalFormData.criteria || evalFormData.score === undefined) {
      Alert.alert('Champs manquants', 'Veuillez renseigner le critère et la note.');
      return;
    }
    evalMutation.mutate({
      values: {
        supplier_id: evalFormData.supplier_id,
        period: evalFormData.period,
        year: evalFormData.year,
        criteria: evalFormData.criteria,
        score: parseFloat(evalFormData.score),
        comment: evalFormData.comment,
        evaluated_by: profile?.id,
        evaluated_at: new Date().toISOString(),
      },
      type: 'INSERT',
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['supplier_evaluation_summary'] });
      }
    });
  };

  const getSupplierEval = (supplierId: string) => {
    return evalSummaries.find(s => s.supplier_id === supplierId);
  };

  return (
    <AnimatedPage>
      <ScrollView style={[s.container, { backgroundColor: '#F8F9FA' }]}>
        <View style={[s.tabs, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
          <ActionButton label="Matière Première" variant={activeTab === 'mp' ? 'primary' : 'secondary'} onPress={() => setActiveTab('mp')} />
          <ActionButton label="Produit Finit" variant={activeTab === 'pf' ? 'primary' : 'secondary'} onPress={() => setActiveTab('pf')} />
          <ActionButton label="Fournisseurs" variant={activeTab === 'suppliers' ? 'primary' : 'secondary'} onPress={() => setActiveTab('suppliers')} />
          <ActionButton label="Dépôts" variant={activeTab === 'depots' ? 'primary' : 'secondary'} onPress={() => setActiveTab('depots')} />
          {!isMobile && <View style={{ flex: 1 }} />}
          <ActionButton
            label={isExporting ? 'Export…' : 'Export XLSX'}
            icon={isExporting ? 'loading' : 'microsoft-excel'}
            progress={isExporting ? exportProgress : undefined}
            onPress={async () => {
              if (isExporting) return;
              setExportProgress(0);
              setIsExporting(true);
              try {
                await fetchAllAndExport(activeTab, setExportProgress);
              } catch (e: any) {
                Alert.alert('Erreur export', e?.message || 'Impossible d\'exporter.');
              } finally {
                setExportProgress(1);
                setIsExporting(false);
              }
            }}
            variant="secondary"
          />
          <ActionButton label="Import CSV" icon="file-excel" onPress={() => setShowImport(true)} variant="secondary" />
          <ActionButton label="Ajouter" icon="plus" onPress={handleOpenAdd} variant="primary" />
        </View>
        <ExportOverlay visible={isExporting} progress={exportProgress} title="Export en cours..." />

        <View style={s.content}>
          {activeTab === 'mp' && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16, paddingHorizontal: 4 }}>
              {[
                { label: 'Tous', value: '' },
                { label: 'SICD', value: 'SICD' },
                { label: 'SPAH', value: 'SPAH' },
              ].map((opt) => (
                <ActionButton
                  key={opt.value}
                  label={opt.label}
                  onPress={() => {
                    setMpPrefixFilter(opt.value as 'SICD' | 'SPAH' | '');
                    console.log('Filter changed to:', opt.value);
                  }}
                  variant={mpPrefixFilter === opt.value ? 'primary' : 'secondary'}
                />
              ))}
            </View>
          )}
          {activeTab === 'pf' && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16, paddingHorizontal: 4 }}>
              {[
                { label: 'Tous',            value: '' },
                { label: 'Savon',           value: 'SAV' },
                { label: 'Corde',           value: 'COR' },
                { label: 'Bougie',          value: 'BOU' },
                { label: 'Encaustique',     value: 'ENC' },
                { label: 'Papier Hyg.',     value: 'PH' },
                { label: 'Détergent',       value: 'DET' },
              ].map((opt) => (
                <ActionButton
                  key={opt.value}
                  label={opt.label}
                  onPress={() => {
                    setPfCategoryFilter(opt.value);
                    setPage(0);
                  }}
                  variant={pfCategoryFilter === opt.value ? 'primary' : 'secondary'}
                />
              ))}
            </View>
          )}
          {(activeTab === 'mp' || activeTab === 'pf') && (
            <DataTable
              data={displayedArticles}
              columns={[
                { key: 'code', label: 'Code', flex: 0.8 },
                { key: 'name', label: lang === 'FR' ? 'Désignation (FR)' : 'Description (EN)', flex: 2, render: (item: any) => (
                  <Text style={{ fontWeight: '500' }}>{lang === 'EN' && item.name_en ? item.name_en : item.name}</Text>
                )},
                { key: 'article_type', label: 'Type', flex: 0.6, render: (item: any) => (
                  <Badge label={item.article_type} color={item.article_type === 'PF' ? C.green : C.info} />
                )},
                { key: 'unit', label: 'Unité', flex: 0.5 },
                { key: 'colisage', label: 'Colisage', flex: 0.5, render: (item: any) => (
                  <Text>{item.colisage || '-'}</Text>
                )},
                { key: 'active', label: 'Statut', flex: 0.7, render: (item: any) => (
                  <Text style={{ color: item.active ? C.ok : C.err, fontWeight: '700', fontSize: 12 }}>{item.active ? 'ACTIF' : 'INACTIF'}</Text>
                )},
                { key: 'actions', label: '', flex: activeTab === 'pf' ? 1.1 : 0.8, render: (item: any) => (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                  {item.article_type === 'PF' && (
                    <ActionButton
                      label=""
                      icon="file-document-outline"
                      onPress={() => openDatasheet(item)}
                      variant="secondary"
                      compact
                    />
                  )}
                  <ActionButton
                    label=""
                    icon="pencil"
                    onPress={() => handleOpenEditArticle(item)}
                    variant="secondary"
                    compact
                  />
                  <ActionButton
                    label=""
                    icon="trash-can-outline"
                    onPress={() => {
                      const bomLinked = boms.find((b: any) => b.product_id === item.id);
                      const message = item.article_type === 'PF' && bomLinked
                        ? `Supprimer le produit fini "${item.name}" supprimera aussi son BOM et ses lignes. Continuer ?`
                        : `Voulez-vous vraiment supprimer l'article "${item.name}" ?`;
                      confirmAction(
                        'Supprimer',
                        message,
                        async () => {
                          if (!supabase) return;
                          // Pour un PF : supprimer les lignes BOM puis le header BOM avant l'article
                          if (item.article_type === 'PF') {
                            const linkedBoms = boms.filter((b: any) => b.product_id === item.id);
                            for (const bom of linkedBoms) {
                              await supabase.from('bom_lines').delete().eq('bom_header_id', bom.id);
                              await supabase.from('bom_headers').delete().eq('id', bom.id);
                            }
                            // Invalider bom_headers et bom_lines pour synchroniser tous les dropdowns PF
                            queryClient.invalidateQueries({ queryKey: ['bom_headers'] });
                            queryClient.invalidateQueries({ queryKey: ['bom_lines'] });
                          }
                          articleMutation.mutate({ id: item.id, type: 'DELETE' });
                        }
                      ,
    'danger'
  );
                    }}
                    variant="secondary"
                    compact
                  />
                  </View>
                )},
              ]}
              onRowPress={(_item) => {}}
            />
          )}

          {activeTab === 'suppliers' && (
            <DataTable
              data={suppliers.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))}
              columns={[
                { key: 'code', label: 'Code', flex: 0.8 },
                { key: 'name', label: 'Nom', flex: 1.5 },
                { key: 'country', label: 'Pays', flex: 0.8 },
                { key: 'currency', label: 'Devise', flex: 0.6 },
                { key: 'rating', label: 'Note', flex: 0.5, render: (item: any) => {
                  const evalSum = getSupplierEval(item.id);
                  const cls = evalSum?.classification;
                  return cls ? <Badge label={CLASSIFICATION_MAP[cls]?.label || cls} color={CLASSIFICATION_MAP[cls]?.color || C.textMuted} /> : <Text style={{ color: '#ADB5BD', fontSize: 12 }}>—</Text>;
                }},
                { key: 'actions', label: '', flex: 1.2, render: (item: any) => (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <ActionButton label="Modifier" icon="pencil" onPress={() => handleOpenEditSupplier(item)} variant="secondary" compact />
                    <ActionButton label="Supprimer" icon="trash-can-outline" onPress={() => handleDeleteSupplier(item)} variant="secondary" compact />
                  </View>
                )},
              ]}
              onRowPress={(item) => handleOpenEval(item.id)}
            />
          )}

          {activeTab === 'depots' && (
            <DataTable
              data={depots.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()))}
              columns={[
                { key: 'code', label: 'Code', flex: 0.8 },
                { key: 'name', label: 'Nom du dépôt', flex: 2 },
                { key: 'depot_type', label: 'Type stocké', flex: 1 },
              ]}
            />
          )}

          <PaginationControls
            currentPage={page}
            totalItems={(activeTab === 'mp' || activeTab === 'pf') ? articlesCount : activeTab === 'suppliers' ? suppliersCount : depots.length}
            limit={limit}
            onPageChange={(p) => setPage(p)}
            loading={(activeTab === 'mp' || activeTab === 'pf') ? loadingArticles : activeTab === 'suppliers' ? loadingSuppliers : loadingDepots}
          />
        </View>
      </ScrollView>

      <FormModal
        visible={evalModalVisible}
        title="Évaluation Fournisseur"
        onClose={() => setEvalModalVisible(false)}
        onSave={handleSaveEval}
        loading={evalMutation.isPending}
      >
        <SectionTitle>CRITÈRE D'ÉVALUATION</SectionTitle>
        <FormSelect
          label="Critère"
          value={evalFormData.criteria ?? ''}
          options={EVAL_CRITERIA}
          onSelect={v => setEvalFormData({ ...evalFormData, criteria: v })}
        />
        <FormInput
          label="Note (0–5)"
          value={evalFormData.score ?? ''}
          onChangeText={val => setEvalFormData({ ...evalFormData, score: val })}
          keyboardType="decimal-pad"
        />
        <FormSelect
          label="Période"
          value={evalFormData.period ?? ''}
          options={[
            { label: 'Annuel', value: 'YEARLY' },
            { label: 'Q1', value: 'Q1' }, { label: 'Q2', value: 'Q2' },
            { label: 'Q3', value: 'Q3' }, { label: 'Q4', value: 'Q4' },
          ]}
          onSelect={v => setEvalFormData({ ...evalFormData, period: v })}
        />
        <FormInput label="Commentaire" value={evalFormData.comment ?? ''} onChangeText={val => setEvalFormData({ ...evalFormData, comment: val })} multiline />
      </FormModal>

      <CsvImportModal
        visible={showImport}
        type={activeTab}
        onClose={() => setShowImport(false)}
        onSuccess={() => { queryClient.invalidateQueries({ queryKey: [activeTab] }); }}
      />

      {/* ── Modal Modifier Fournisseur ────────────────────────────────────── */}
      <FormModal
        visible={editSupplierVisible}
        title="Modifier Fournisseur"
        onClose={() => { setEditSupplierVisible(false); setEditSupplierForm({}); }}
        onSave={handleSaveEditSupplier}
        loading={isSavingEdit}
      >
        <SectionTitle>IDENTIFICATION</SectionTitle>
        <FormInput
          label="Code *"
          value={editSupplierForm.code || ''}
          onChangeText={(t: string) => setEditSupplierForm({ ...editSupplierForm, code: t.toUpperCase() })}
          placeholder="FRN-001"
        />
        <FormInput
          label="Nom *"
          value={editSupplierForm.name || ''}
          onChangeText={(t: string) => setEditSupplierForm({ ...editSupplierForm, name: t })}
          placeholder="Nom du fournisseur"
        />
        <FormSelect
          label="Pays"
          value={editSupplierForm.country || ''}
          options={[
            { label: 'Madagascar', value: 'MG' },
            { label: 'France', value: 'FR' },
            { label: 'Chine', value: 'CN' },
            { label: 'Inde', value: 'IN' },
            { label: 'Afrique du Sud', value: 'ZA' },
            { label: 'Maurice', value: 'MU' },
            { label: 'Autre', value: 'OTHER' },
          ]}
          onSelect={(v: string) => setEditSupplierForm({ ...editSupplierForm, country: v })}
        />
        <FormSelect
          label="Devise"
          value={editSupplierForm.currency || 'MGA'}
          options={[
            { label: 'Ariary (MGA)', value: 'MGA' },
            { label: 'Euro (EUR)', value: 'EUR' },
            { label: 'Dollar USD', value: 'USD' },
            { label: 'Rand ZAR', value: 'ZAR' },
            { label: 'CNY (Yuan)', value: 'CNY' },
          ]}
          onSelect={(v: string) => setEditSupplierForm({ ...editSupplierForm, currency: v })}
        />
        <SectionTitle>CONTACT</SectionTitle>
        <FormInput
          label="Nom du contact"
          value={editSupplierForm.contact_name || ''}
          onChangeText={(t: string) => setEditSupplierForm({ ...editSupplierForm, contact_name: t })}
        />
        <FormInput
          label="Email"
          value={editSupplierForm.contact_email || ''}
          onChangeText={(t: string) => setEditSupplierForm({ ...editSupplierForm, contact_email: t })}
          keyboardType="email-address"
        />
        <FormInput
          label="Téléphone"
          value={editSupplierForm.contact_phone || ''}
          onChangeText={(t: string) => setEditSupplierForm({ ...editSupplierForm, contact_phone: t })}
          keyboardType="phone-pad"
        />
        <FormInput
          label="Délai de livraison (jours)"
          value={String(editSupplierForm.lead_time_days ?? '')}
          onChangeText={(t: string) => setEditSupplierForm({ ...editSupplierForm, lead_time_days: parseInt(t) || null })}
          keyboardType="number-pad"
          placeholder="Ex: 30"
        />
        <SectionTitle>STATUT</SectionTitle>
        <FormSelect
          label="Statut"
          value={editSupplierForm.active ? 'true' : 'false'}
          options={[
            { label: 'Actif', value: 'true' },
            { label: 'Inactif', value: 'false' },
          ]}
          onSelect={(v: string) => setEditSupplierForm({ ...editSupplierForm, active: v === 'true' })}
        />
      </FormModal>

      {/* ── Modal Modifier Article (MP/PF) ──────────────────────────────────── */}
      <FormModal
        visible={editArticleVisible}
        title={`Modifier ${editArticleForm.article_type === 'PF' ? 'Produit Fini' : 'Matière Première'}`}
        onClose={() => { setEditArticleVisible(false); setEditArticleForm({}); }}
        onSave={handleSaveEditArticle}
        loading={isSavingEditArticle}
      >
        <SectionTitle>IDENTIFICATION</SectionTitle>
        <FormInput
          label="Code *"
          value={editArticleForm.code || ''}
          onChangeText={(t: string) => setEditArticleForm({ ...editArticleForm, code: t.toUpperCase() })}
          placeholder="MP-2025-001"
        />
        <FormInput
          label="Désignation (FR) *"
          value={editArticleForm.name || ''}
          onChangeText={(t: string) => setEditArticleForm({ ...editArticleForm, name: t })}
          placeholder="Nom de l'article"
        />
        <FormInput
          label="Description (EN)"
          value={editArticleForm.name_en || ''}
          onChangeText={(t: string) => setEditArticleForm({ ...editArticleForm, name_en: t })}
          placeholder="Article name in English"
        />
        <FormSelect
          label="Unité *"
          value={editArticleForm.unit || 'KG'}
          options={[
            { label: 'Kilogramme (KG)', value: 'KG' },
            { label: 'Litre (L)', value: 'L' },
            { label: 'Unité (U)', value: 'U' },
            { label: 'Tonne (T)', value: 'T' },
            { label: 'Mètre (M)', value: 'M' },
            { label: 'Boîte (BTE)', value: 'BTE' },
            { label: 'Carton (CTN)', value: 'CTN' },
            { label: 'Gramme (G)', value: 'G' },
          ]}
          onSelect={(v: string) => setEditArticleForm({ ...editArticleForm, unit: v })}
        />
        <FormInput
          label="Famille"
          value={editArticleForm.family || ''}
          onChangeText={(t: string) => setEditArticleForm({ ...editArticleForm, family: t })}
          placeholder="Ex: CHIMIQUE, EMBALLAGE…"
        />
        <FormInput
          label="Marque / Référence"
          value={editArticleForm.brand || ''}
          onChangeText={(t: string) => setEditArticleForm({ ...editArticleForm, brand: t })}
        />
        <SectionTitle>PARAMÈTRES STOCK</SectionTitle>
        <FormInput
          label="Stock de sécurité"
          value={String(editArticleForm.safety_stock ?? '')}
          onChangeText={(t: string) => setEditArticleForm({ ...editArticleForm, safety_stock: parseFloat(t) || 0 })}
          keyboardType="decimal-pad"
          placeholder="0"
        />
        <FormInput
          label="Point de réapprovisionnement"
          value={String(editArticleForm.reorder_point ?? '')}
          onChangeText={(t: string) => setEditArticleForm({ ...editArticleForm, reorder_point: parseFloat(t) || 0 })}
          keyboardType="decimal-pad"
          placeholder="0"
        />
        <FormInput
          label="Durée de conservation (jours)"
          value={String(editArticleForm.shelf_life_days ?? '')}
          onChangeText={(t: string) => setEditArticleForm({ ...editArticleForm, shelf_life_days: t.trim() ? parseInt(t, 10) || null : null })}
          keyboardType="number-pad"
          placeholder="Ex: 365 — vide = pas de calcul auto"
        />
        <FormInput
          label="Colisage (unités/carton)"
          value={String(editArticleForm.colisage ?? '')}
          onChangeText={(t: string) => setEditArticleForm({ ...editArticleForm, colisage: t.trim() ? parseInt(t, 10) || 1 : 1 })}
          keyboardType="number-pad"
          placeholder="1"
        />
        <SectionTitle>STATUT</SectionTitle>
        <FormSelect
          label="Statut"
          value={editArticleForm.active ? 'true' : 'false'}
          options={[
            { label: 'Actif', value: 'true' },
            { label: 'Inactif', value: 'false' },
          ]}
          onSelect={(v: string) => setEditArticleForm({ ...editArticleForm, active: v === 'true' })}
        />
      </FormModal>

      {/* ── Modal Modifier Fournisseur ────────────────────────────────────── */}
      <FormModal
        visible={prefixPickerVisible}
        title={activeTab === 'mp' ? 'Choisir la famille MP' : 'Choisir la catégorie PF'}
        onClose={() => setPrefixPickerVisible(false)}
        onSave={() => {
          if (selectedPrefix) handleOpenAddWithPrefix(selectedPrefix);
        }}
        saveLabel="Continuer"
        loading={false}
      >
        <SectionTitle>
          {activeTab === 'mp' ? 'FAMILLE DE MATIÈRE PREMIÈRE' : 'CATÉGORIE DE PRODUIT FINI'}
        </SectionTitle>
        <FormSelect
          label={activeTab === 'mp' ? 'Préfixe de code' : 'Catégorie'}
          value={selectedPrefix ?? ''}
          options={activeTab === 'mp' ? MP_PREFIXES : PF_CATEGORIES}
          onSelect={(v: string) => setSelectedPrefix(v)}
        />
        {selectedPrefix !== '' && (
          <Text style={{ color: '#6C757D', fontSize: 13, marginTop: 8 }}>
            {activeTab === 'mp'
              ? `Le code sera du type : ${selectedPrefix}-001`
              : `Le code sera du type : PF-${selectedPrefix}-001`}
          </Text>
        )}
      </FormModal>

      {/* ── Modal Ajouter ─────────────────────────────────────────────────── */}
      <FormModal
        visible={addModalVisible}
        title={
          activeTab === 'mp' ? 'Nouvelle Matière Première' :
          activeTab === 'pf' ? 'Nouveau Produit Fini' :
          activeTab === 'suppliers' ? 'Nouveau Fournisseur' :
          'Nouveau Dépôt'
        }
        onClose={() => { setAddModalVisible(false); setAddForm({}); }}
        onSave={handleSaveAdd}
        loading={isSavingAdd}
      >
        {/* ── Article (MP ou PF) ── */}
        {(activeTab === 'mp' || activeTab === 'pf') && (
          <>
            <SectionTitle>IDENTIFICATION</SectionTitle>
            <FormInput
              label="Code *"
              value={addForm.code || ''}
              onChangeText={(t: string) => setAddForm({ ...addForm, code: t.toUpperCase() })}
              placeholder="MP-2025-001"
            />
            <FormInput
              label="Désignation (FR) *"
              value={addForm.name || ''}
              onChangeText={(t: string) => setAddForm({ ...addForm, name: t })}
              placeholder="Nom de l'article"
            />
            <FormInput
              label="Description (EN)"
              value={addForm.name_en || ''}
              onChangeText={(t: string) => setAddForm({ ...addForm, name_en: t })}
              placeholder="Article name in English"
            />
            <FormSelect
              label="Unité *"
              value={addForm.unit || 'KG'}
              options={[
                { label: 'Kilogramme (KG)', value: 'KG' },
                { label: 'Litre (L)', value: 'L' },
                { label: 'Unité (U)', value: 'U' },
                { label: 'Tonne (T)', value: 'T' },
                { label: 'Mètre (M)', value: 'M' },
                { label: 'Boîte (BTE)', value: 'BTE' },
                { label: 'Carton (CTN)', value: 'CTN' },
                { label: 'Gramme (G)', value: 'G' },
              ]}
              onSelect={(v: string) => setAddForm({ ...addForm, unit: v })}
            />
            <FormInput
              label="Famille"
              value={addForm.family || ''}
              onChangeText={(t: string) => setAddForm({ ...addForm, family: t })}
              placeholder="Ex: CHIMIQUE, EMBALLAGE…"
            />
            <FormInput
              label="Marque / Référence"
              value={addForm.brand || ''}
              onChangeText={(t: string) => setAddForm({ ...addForm, brand: t })}
            />
            <SectionTitle>PARAMÈTRES STOCK</SectionTitle>
            <FormInput
              label="Stock de sécurité"
              value={String(addForm.safety_stock ?? '')}
              onChangeText={(t: string) => setAddForm({ ...addForm, safety_stock: parseFloat(t) || 0 })}
              keyboardType="decimal-pad"
              placeholder="0"
            />
            <FormInput
              label="Point de réapprovisionnement"
              value={String(addForm.reorder_point ?? '')}
              onChangeText={(t: string) => setAddForm({ ...addForm, reorder_point: parseFloat(t) || 0 })}
              keyboardType="decimal-pad"
              placeholder="0"
            />
            <FormInput
              label="Durée de conservation (jours)"
              value={String(addForm.shelf_life_days ?? '')}
              onChangeText={(t: string) => setAddForm({ ...addForm, shelf_life_days: t.trim() ? parseInt(t, 10) || null : null })}
              keyboardType="number-pad"
              placeholder="Ex: 365 — vide = pas de calcul auto"
            />
            <FormInput
              label="Colisage (unités/carton)"
              value={String(addForm.colisage ?? '')}
              onChangeText={(t: string) => setAddForm({ ...addForm, colisage: t.trim() ? parseInt(t, 10) || 1 : 1 })}
              keyboardType="number-pad"
              placeholder="1"
            />
          </>
        )}

        {/* ── Fournisseur ── */}
        {activeTab === 'suppliers' && (
          <>
            <SectionTitle>IDENTIFICATION</SectionTitle>
            <FormInput
              label="Code *"
              value={addForm.code || ''}
              onChangeText={(t: string) => setAddForm({ ...addForm, code: t.toUpperCase() })}
              placeholder="FRN-2025-001"
            />
            <FormInput
              label="Nom *"
              value={addForm.name || ''}
              onChangeText={(t: string) => setAddForm({ ...addForm, name: t })}
              placeholder="Nom du fournisseur"
            />
            <FormSelect
              label="Pays"
              value={addForm.country || ''}
              options={[
                { label: 'Madagascar', value: 'MG' },
                { label: 'France', value: 'FR' },
                { label: 'Chine', value: 'CN' },
                { label: 'Inde', value: 'IN' },
                { label: 'Afrique du Sud', value: 'ZA' },
                { label: 'Maurice', value: 'MU' },
                { label: 'Autre', value: 'OTHER' },
              ]}
              onSelect={(v: string) => setAddForm({ ...addForm, country: v })}
            />
            <FormSelect
              label="Devise"
              value={addForm.currency || 'MGA'}
              options={[
                { label: 'Ariary (MGA)', value: 'MGA' },
                { label: 'Euro (EUR)', value: 'EUR' },
                { label: 'Dollar USD', value: 'USD' },
                { label: 'Rand ZAR', value: 'ZAR' },
                { label: 'CNY (Yuan)', value: 'CNY' },
              ]}
              onSelect={(v: string) => setAddForm({ ...addForm, currency: v })}
            />
            <SectionTitle>CONTACT</SectionTitle>
            <FormInput
              label="Nom du contact"
              value={addForm.contact_name || ''}
              onChangeText={(t: string) => setAddForm({ ...addForm, contact_name: t })}
            />
            <FormInput
              label="Email"
              value={addForm.contact_email || ''}
              onChangeText={(t: string) => setAddForm({ ...addForm, contact_email: t })}
              keyboardType="email-address"
            />
            <FormInput
              label="Téléphone"
              value={addForm.contact_phone || ''}
              onChangeText={(t: string) => setAddForm({ ...addForm, contact_phone: t })}
              keyboardType="phone-pad"
            />
            <FormInput
              label="Délai de livraison (jours)"
              value={String(addForm.lead_time_days ?? '')}
              onChangeText={(t: string) => setAddForm({ ...addForm, lead_time_days: parseInt(t) || null })}
              keyboardType="number-pad"
              placeholder="Ex: 30"
            />
          </>
        )}

        {/* ── Dépôt ── */}
        {activeTab === 'depots' && (
          <>
            <SectionTitle>IDENTIFICATION</SectionTitle>
            <FormInput
              label="Code *"
              value={addForm.code || ''}
              onChangeText={(t: string) => setAddForm({ ...addForm, code: t.toUpperCase() })}
              placeholder="DEP-2025-001"
            />
            <FormInput
              label="Nom du dépôt *"
              value={addForm.name || ''}
              onChangeText={(t: string) => setAddForm({ ...addForm, name: t })}
              placeholder="Nom du dépôt"
            />
            <FormSelect
              label="Type de stock"
              value={addForm.depot_type || 'MP'}
              options={[
                { label: 'Matière Première (MP)', value: 'MP' },
                { label: 'Produit Fini (PF)', value: 'PF' },
                { label: 'Semi-Fini (SF)', value: 'SF' },
                { label: 'Emballage (EMB)', value: 'EMB' },
              ]}
              onSelect={(v: string) => setAddForm({ ...addForm, depot_type: v })}
            />
          </>
        )}
      </FormModal>

      <FormModal
        visible={datasheetModalVisible}
        title={`Fiche technique — ${datasheetArticle?.code || ''}`}
        onClose={() => setDatasheetModalVisible(false)}
        onSave={saveDatasheet}
        loading={datasheetLoading}
      >
        <Text style={{ fontSize: 12, color: '#6C757D', marginBottom: 8 }}>
          Fiche technique produit autonome (indépendante de la BOM) — spécifications qualité, conditionnement et stockage par gamme.
        </Text>
        <FormInput label="Nom commercial" value={datasheetForm.commercial_name ?? ''} onChangeText={(v) => setDatasheetForm({ ...datasheetForm, commercial_name: v })} />
        <FormInput label="Gamme / Famille" value={datasheetForm.family ?? ''} onChangeText={(v) => setDatasheetForm({ ...datasheetForm, family: v })} />
        <FormInput label="Description" value={datasheetForm.description ?? ''} onChangeText={(v) => setDatasheetForm({ ...datasheetForm, description: v })} multiline />
        <FormInput label="Spécifications qualité (pH, TFM, viscosité…)" value={datasheetForm.quality_specs ?? ''} onChangeText={(v) => setDatasheetForm({ ...datasheetForm, quality_specs: v })} multiline />
        <FormInput label="Caractéristiques physiques (aspect, couleur, odeur)" value={datasheetForm.physical_specs ?? ''} onChangeText={(v) => setDatasheetForm({ ...datasheetForm, physical_specs: v })} multiline />
        <FormInput label="Conditionnement (format, emballage, palettisation)" value={datasheetForm.packaging ?? ''} onChangeText={(v) => setDatasheetForm({ ...datasheetForm, packaging: v })} multiline />
        <FormInput label="Conditions de stockage" value={datasheetForm.storage_conditions ?? ''} onChangeText={(v) => setDatasheetForm({ ...datasheetForm, storage_conditions: v })} multiline />
        <FormInput label="Durée de vie / DLUO" value={datasheetForm.shelf_life ?? ''} onChangeText={(v) => setDatasheetForm({ ...datasheetForm, shelf_life: v })} />
        <FormInput label="Mode d'emploi / précautions" value={datasheetForm.usage_instructions ?? ''} onChangeText={(v) => setDatasheetForm({ ...datasheetForm, usage_instructions: v })} multiline />
        <FormInput label="Mentions réglementaires" value={datasheetForm.regulatory ?? ''} onChangeText={(v) => setDatasheetForm({ ...datasheetForm, regulatory: v })} multiline />
        <FormSelect
          label="Statut"
          value={datasheetForm.status ?? 'BROUILLON'}
          options={[{ label: 'Brouillon', value: 'BROUILLON' }, { label: 'Validée', value: 'VALIDEE' }, { label: 'Archivée', value: 'ARCHIVEE' }]}
          onSelect={(v: string) => setDatasheetForm({ ...datasheetForm, status: v })}
        />
        <View style={{ marginTop: 12 }}>
          <ActionButton label="Générer PDF" icon="file-pdf-box" onPress={generateDatasheetPdf} variant="secondary" />
        </View>
      </FormModal>
    </AnimatedPage>
  );
}

const s = StyleSheet.create({
  container: { paddingBottom: 20 },
  tabs: { flexDirection: 'row', gap: 10, marginBottom: 20, alignItems: 'center', paddingHorizontal: 20, paddingTop: 20 },
  content: { paddingHorizontal: 20 },
});
