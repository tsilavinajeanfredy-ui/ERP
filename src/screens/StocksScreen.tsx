import * as React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  C,
  KpiCard,
  ActionButton,
  AnimatedPage,
  FormModal,
  FormInput,
  FormSelect,
  PaginationControls,
  FormDatePicker,
  confirmShow,
} from '../components/Ui';
import { ScannerModal } from '../components/ScannerModal';
import { BonSignatureModal } from '../components/BonSignatureModal';
import {
  useDepots,
  useLots,
  useAllArticles,
  useMutation,
  useStockAlerts,
  useArticleThreshold,
  useUserProfile,
  usePermissions,
  useNotification,
  getArticleUnitValue,
  useStockMovements,
  useStockCard,
} from '../lib/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { useEmballagesConsommables } from '../lib/hooks/signatures';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const exportToXLSX = async (data: any[], filename: string) => {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Données');
  if (Platform.OS === 'web') {
    XLSX.writeFile(wb, filename);
  } else {
    try {
      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const uri = FileSystem.documentDirectory + filename;
      await FileSystem.writeAsStringAsync(uri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert('Erreur', "Le partage n'est pas disponible sur cet appareil.");
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Erreur', "Impossible d'exporter le fichier Excel.");
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
        Alert.alert('Erreur', "Le partage n'est pas disponible sur cet appareil.");
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Erreur', "Impossible d'exporter le fichier CSV.");
    }
  }
};
import { useTranslation } from '../lib/i18n';
import { useSearch } from '../lib/search';
import { generatePdf, getPdfTemplate } from '../lib/pdf';
import { supabase, getNextCode } from '../lib/supabase';
import { printThermalLabel } from '../lib/labelPrinter';

function CovBar({ days, label }: { days: number; label?: string }) {
  const isInfinite = days > 999;
  const pct = isInfinite ? 100 : Math.min((days / 90) * 100, 100);
  const color = isInfinite ? C.green : days < 15 ? C.err : days < 30 ? C.gold : C.green;
  const displayLabel = isInfinite ? '∞' : `${days}j`;
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: '#E9ECEF' }}>
          <View style={{ width: `${pct}%`, height: 4, borderRadius: 2, backgroundColor: color }} />
        </View>
        <Text
          style={{
            fontSize: 10,
            color: isInfinite ? C.green : '#6C757D',
            fontWeight: '700',
            minWidth: 34,
            textAlign: 'right',
          }}
        >
          {displayLabel}
        </Text>
      </View>
      {label ? (
        <Text style={{ fontSize: 9, color: '#94A3B8', textAlign: 'right' }}>{label}</Text>
      ) : null}
    </View>
  );
}

const stockSectionOptions = [
  { label: 'Toutes', value: 'ALL' },
  { label: 'Savon', value: 'SAVON' },
  { label: 'PH', value: 'PH' },
  { label: 'Corde', value: 'CORDE' },
  { label: 'Encaustique', value: 'ENCAUSTIQUE' },
];

const articleTypeOptions = [
  { label: 'Toutes', value: 'ALL' },
  { label: 'Matière première', value: 'MP' },
  { label: 'Produit fini', value: 'PF' },
];

const sortieReasonOptions = [
  { label: 'Vente', value: 'Vente' },
  { label: 'Échantillon', value: 'Échantillon' },
  { label: 'Bon de sortie', value: 'Bon de sortie' },
  { label: 'Bon de sortie recyclage', value: 'Bon de sortie recyclage' },
  { label: 'Autre', value: 'Autre' },
];

function matchesStockSection(article: any, section: string) {
  if (!article || section === 'ALL') return true;
  const code = (article.code || '').toUpperCase();
  const name = (article.name || '').toLowerCase();

  if (section === 'SAVON') {
    return (
      code.includes('SAV') ||
      name.includes('savon') ||
      name.includes('bondillon') ||
      name.includes('soude') ||
      name.includes('huile')
    );
  }
  if (section === 'PH') {
    return (
      code.includes('PH') ||
      name.includes('papier') ||
      name.includes('doucy') ||
      name.includes('hygiène') ||
      name.includes('pH'.toLowerCase())
    );
  }
  if (section === 'CORDE') {
    return (
      code.includes('COR') ||
      name.includes('corde') ||
      name.includes('nylon') ||
      name.includes('poly')
    );
  }
  if (section === 'ENCAUSTIQUE') {
    return (
      code.includes('ENC') ||
      name.includes('encaustique') ||
      name.includes('cire') ||
      name.includes('bougie')
    );
  }
  return true;
}

export function StocksScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { searchQuery, setSearchQuery } = useSearch();
  const [scannerVisible, setScannerVisible] = React.useState(false);

  const [activeTab, setActiveTab] = React.useState<
    'lots' | 'abc' | 'valuation' | 'mouvements' | 'emballages'
  >('lots');
  const isMobile = width < 992;
  const [page, setPage] = React.useState(0);
  const limit = 20;

  const { data: depots = [], isPending: depotsLoading } = useDepots();
  const [selDepotId, setSelDepotId] = React.useState<string | null>(null);
  const {
    data: lots = [],
    count: lotsCount,
    isPending: lotsLoading,
  } = useLots(page, limit, 'LIBERE');
  const { data: articles = [], isPending: articlesLoading } = useAllArticles();

  const { profile } = useUserProfile();
  const scope = profile?.scope || 'ALL';
  const { canPerformAction } = usePermissions();

  const filterByScope = React.useCallback(
    (articleCode: string, articleName: string) => {
      if (scope === 'ALL') return true;
      const code = (articleCode || '').toUpperCase();
      const name = (articleName || '').toLowerCase();

      if (scope === 'SAVON') {
        return (
          code.startsWith('PF-SAV-') ||
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
          name.includes('huile')
        );
      }

      if (scope === 'CORDE') {
        return (
          code.startsWith('PF-COR-') ||
          code.startsWith('MP-POLY') ||
          code.startsWith('MP-NYLON') ||
          code.startsWith('MP-GRN-') ||
          name.includes('corde') ||
          name.includes('poly') ||
          name.includes('nylon')
        );
      }

      if (scope === 'BOUGIE_ENCAUSTIQUE' || scope === 'BOU_ENC') {
        return (
          code.startsWith('PF-BOU-') ||
          code.startsWith('PF-ENC-') ||
          code.startsWith('MP-CIRE-') ||
          code.startsWith('MP-MECHE') ||
          name.includes('bougie') ||
          name.includes('encaustique') ||
          name.includes('cire') ||
          name.includes('paraffine')
        );
      }

      if (scope === 'PH' || scope === 'SPAH') {
        return (
          code.startsWith('PF-PAP-') ||
          code.startsWith('MP-PATE-') ||
          code.startsWith('MP-BOB-') ||
          code.startsWith('SPAH-') ||
          name.includes('papier') ||
          name.includes('doucy') ||
          name.includes('serviette') ||
          name.includes('ouate') ||
          name.includes('bobine')
        );
      }

      return true;
    },
    [scope],
  );

  // Listes "filtrées par périmètre" : à utiliser PARTOUT dans cet écran (KPI, ABC,
  // Valorisation, Seuils, etc.) afin qu'un responsable assigné à une catégorie
  // (ex: Bougie/Encaustique) ne voie jamais les articles d'une autre catégorie
  // (ex: SPAH, Corde). Les comptes avec scope = 'ALL' voient tout, sans changement.
  const scopedArticles = React.useMemo(
    () => articles.filter((a) => filterByScope(a.code, a.name)),
    [articles, filterByScope],
  );
  const scopedLots = React.useMemo(
    () => lots.filter((l) => (l.article ? filterByScope(l.article.code, l.article.name) : true)),
    [lots, filterByScope],
  );

  // On stocke le filtre local pour la recherche
  React.useEffect(() => {
    setPage(0);
  }, [searchQuery, selDepotId]);

  const [modalVisible, setModalVisible] = React.useState(false);
  const [adjModalVisible, setAdjModalVisible] = React.useState(false);
  const [sortieModalVisible, setSortieModalVisible] = React.useState(false);
  const [formData, setFormData] = React.useState<any>({});
  const [adjFormData, setAdjFormData] = React.useState<any>({});
  const [sortieFormData, setSortieFormData] = React.useState<any>({});
  const [sortieTypeFilter, setSortieTypeFilter] = React.useState<'ALL' | 'MP' | 'EMB' | 'PF'>('ALL');
  // Triple signature BT/BS
  const [sigModalVisible, setSigModalVisible] = React.useState(false);
  const [sigMovementId, setSigMovementId] = React.useState<string | null>(null);
  const [sigMovementRef, setSigMovementRef] = React.useState('');
  const [sigMovementType, setSigMovementType] = React.useState<'TRANSFERT' | 'SORTIE' | 'ENTREE'>(
    'SORTIE',
  );

  const mutation = useMutation('stock_movements', () => setModalVisible(false));
  const { data: stockAlerts = [] } = useStockAlerts();
  const scopedStockAlerts = React.useMemo(
    () => stockAlerts.filter((a) => filterByScope(a.article_code, a.article_name)),
    [stockAlerts, filterByScope],
  );
  const thresholdMutation = useArticleThreshold();
  const [threshModalVisible, setThreshModalVisible] = React.useState(false);
  const [threshFormData, setThreshFormData] = React.useState<any>({});
  // Filtres du modal seuil
  const [threshTypeFilter, setThreshTypeFilter] = React.useState<'ALL' | 'PF' | 'MP'>('ALL');
  const [threshCategFilter, setThreshCategFilter] = React.useState<string>('ALL');
  const [threshSearch, setThreshSearch] = React.useState<string>('');
  // ── Sélection multiple des lots ──
  const [selectedLotIds, setSelectedLotIds] = React.useState<string[]>([]);
  const toggleLotSelect = React.useCallback((id: string) => {
    setSelectedLotIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);
  const toggleLotSelectAll = React.useCallback((ids: string[]) => {
    setSelectedLotIds((prev) => prev.length === ids.length ? [] : ids);
  }, []);

  // Catégories MP : la catégorie "pH / Chimie" correspond en réalité aux articles
  // de la ligne SPAH (préfixe réel des codes articles : "SPAH-"), d'où le renommage.
  const MP_CATEGORIES: { key: string; label: string; prefixes: string[] }[] = [
    { key: 'SAVON', label: 'Savon', prefixes: ['MP-SAV-'] },
    { key: 'SPAH', label: 'SPAH', prefixes: ['SPAH-'] },
    { key: 'CORDE', label: 'Corde', prefixes: ['MP-COR-'] },
    { key: 'BOUGIE', label: 'Bougie', prefixes: ['MP-BOU-'] },
    { key: 'ENCAUS', label: 'Encaustique', prefixes: ['MP-ENC-'] },
  ];

  // Catégories PF (équivalent côté Produit Fini, mêmes libellés que MP).
  // "SPAH" couvre les deux préfixes historiques utilisés pour le papier hygiénique.
  const PF_CATEGORIES: { key: string; label: string; prefixes: string[] }[] = [
    { key: 'SAVON', label: 'Savon', prefixes: ['PF-SAV-'] },
    { key: 'SPAH', label: 'SPAH', prefixes: ['PF-PAP-', 'PF-PH-'] },
    { key: 'CORDE', label: 'Corde', prefixes: ['PF-COR-'] },
    { key: 'BOUGIE', label: 'Bougie', prefixes: ['PF-BOU-'] },
    { key: 'ENCAUS', label: 'Encaustique', prefixes: ['PF-ENC-'] },
  ];

  const threshArticles = React.useMemo(() => {
    return scopedArticles.filter((a) => {
      if (threshTypeFilter === 'PF' && a.article_type !== 'PF') return false;
      if (threshTypeFilter === 'MP' && a.article_type !== 'MP') return false;
      if (threshTypeFilter === 'MP' && threshCategFilter !== 'ALL') {
        const cat = MP_CATEGORIES.find((c) => c.key === threshCategFilter);
        if (cat && !cat.prefixes.some((p) => a.code.startsWith(p))) return false;
      }
      if (threshTypeFilter === 'PF' && threshCategFilter !== 'ALL') {
        const cat = PF_CATEGORIES.find((c) => c.key === threshCategFilter);
        if (cat && !cat.prefixes.some((p) => a.code.startsWith(p))) return false;
      }
      if (threshSearch.trim()) {
        const q = threshSearch.toLowerCase();
        if (!a.name.toLowerCase().includes(q) && !a.code.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedArticles, threshTypeFilter, threshCategFilter, threshSearch]);
  const sendNotification = useNotification();

  // Mouvements & stock card (tab mouvements)
  const { data: stockMovements = [], isPending: movementsLoading } = useStockMovements(
    undefined,
    100,
  );
  const queryClient = useQueryClient();

  // ── Calcul jours de stock restants basé sur sorties Vente (30 derniers jours) ──
  const calcDaysOfStock = React.useCallback(
    (articleId: string, qtyActuelle: number): number => {
      const since = new Date();
      since.setDate(since.getDate() - 30);

      // Filtrer les sorties Vente des 30 derniers jours pour cet article
      const venteSorties = stockMovements.filter((m: any) => {
        const isVente =
          m.movement_type === 'SORTIE' &&
          (String(m.notes || '').toLowerCase().includes('vente') ||
            String(m.notes || '').toLowerCase().includes('sortie: vente'));
        const isArticle = m.article_id === articleId;
        const isRecent = new Date(m.created_at) >= since;
        return isVente && isArticle && isRecent;
      });

      const totalSortiVente = venteSorties.reduce(
        (sum: number, m: any) => sum + (parseFloat(m.qty) || 0),
        0,
      );

      if (totalSortiVente === 0) return 9999; // Pas de vente → stock infini
      const consommationJour = totalSortiVente / 30;
      return Math.floor(qtyActuelle / consommationJour);
    },
    [stockMovements],
  );
  const { data: emballages = [] } = useEmballagesConsommables();
  const [embModalVisible, setEmbModalVisible] = React.useState(false);
  const [embFormData, setEmbFormData] = React.useState<any>({});
  const [embEditId, setEmbEditId] = React.useState<string | null>(null);
  const { data: stockCard = [] } = useStockCard();
  const [movSectionFilter, setMovSectionFilter] = React.useState('ALL');
  const [movArticleTypeFilter, setMovArticleTypeFilter] = React.useState('ALL');
  const [stockSectionFilter, setStockSectionFilter] = React.useState('ALL');
  const [stockArticleTypeFilter, setStockArticleTypeFilter] = React.useState('ALL');

  const [startDate, setStartDate] = React.useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = React.useState(() => new Date().toISOString().split('T')[0]);

  const filteredStockCard = React.useMemo(() => {
    return (stockCard as any[]).filter((row: any) => {
      const article = { code: row.code, name: row.name };
      if (stockSectionFilter !== 'ALL' && !matchesStockSection(article, stockSectionFilter)) {
        return false;
      }
      if (stockArticleTypeFilter !== 'ALL' && row.article_type !== stockArticleTypeFilter) {
        return false;
      }
      return true;
    });
  }, [stockCard, stockSectionFilter, stockArticleTypeFilter]);

  const filteredStockMovements = React.useMemo(() => {
    return (stockMovements as any[])
      .filter((mv: any) => {
        if (movSectionFilter !== 'ALL' && !matchesStockSection(mv.article, movSectionFilter)) {
          return false;
        }
        if (movArticleTypeFilter !== 'ALL' && mv.article?.article_type !== movArticleTypeFilter) {
          return false;
        }
        if (startDate && new Date(mv.created_at) < new Date(startDate)) {
          return false;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (new Date(mv.created_at) > end) {
            return false;
          }
        }
        return true;
      })
      .sort(
        (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
  }, [stockMovements, movSectionFilter, movArticleTypeFilter, startDate, endDate]);

  const handleExportStockCard = (format: 'csv' | 'xlsx') => {
    const data = filteredStockCard.map((r) => ({
      Code: r.code,
      Article: r.name,
      Type: r.article_type,
      Initial: Number(r.qty_initial).toFixed(2),
      Entrées: Number(r.qty_entrees).toFixed(2),
      Sorties: Number(r.qty_sorties).toFixed(2),
      'Stock Final': Number(r.qty_final_calcule).toFixed(2),
      Unit: r.unit,
    }));
    const filename = `Fiche_Stock_${new Date().toISOString().split('T')[0]}`;
    if (format === 'csv') exportToCSV(data, `${filename}.csv`);
    else exportToXLSX(data, `${filename}.xlsx`);
  };

  const handleExportMovements = (format: 'csv' | 'xlsx') => {
    const data = filteredStockMovements.map((m) => ({
      Date: new Date(m.created_at).toLocaleDateString('fr-FR'),
      Code: m.article?.code,
      Article: m.article?.name,
      Lot: m.lot?.code || '',
      Type: String(m.movement_type).replace(/_/g, ' '),
      Quantité: Number(m.qty).toFixed(2),
      Unité: m.unit,
      Référence: m.reference_doc || '',
      Notes: m.notes || '',
    }));
    const filename = `Mouvements_Stock_${new Date().toISOString().split('T')[0]}`;
    if (format === 'csv') exportToCSV(data, `${filename}.csv`);
    else exportToXLSX(data, `${filename}.xlsx`);
  };

  const criticalAlerts = scopedStockAlerts.filter((a) => a.stock_status === 'CRITICAL');
  const warningAlerts = scopedStockAlerts.filter((a) => a.stock_status === 'WARNING');
  const totalAlerts = criticalAlerts.length + warningAlerts.length;

  const handleTransfer = async () => {
    const generatedCode = await getNextCode('BT', 'stock_movements', 'reference_doc');

    setFormData({
      movement_type: 'TRANSFERT',
      qty: '0',
      reference_doc: generatedCode,
    });
    setModalVisible(true);
  };

  const handleAdjustment = async () => {
    const generatedCode = await getNextCode('AJ', 'stock_movements', 'reference_doc');

    setAdjFormData({
      movement_type: 'AJUSTEMENT_POS', // par défaut
      qty: '0',
      reference_doc: generatedCode,
      sortie_reason: 'Vente',
      sortie_reason_custom: '',
    });
    setAdjModalVisible(true);
  };

  const handleQuickSortie = async () => {
    const generatedCode = await getNextCode('BS', 'stock_movements', 'reference_doc');
    setSortieFormData({
      lot_id: '',
      movement_type: 'SORTIE',
      qty: '',
      reference_doc: generatedCode,
      sortie_reason: 'Bon de sortie',
      sortie_reason_custom: '',
      notes: '',
      _lot: null,
    });
    setSortieModalVisible(true);
  };

  const openAdjustmentForLot = async (lotId: string) => {
    const generatedCode = await getNextCode('BS', 'stock_movements', 'reference_doc');
    const lot = lots.find((l) => l.id === lotId);
    setSortieFormData({
      lot_id: lotId,
      movement_type: 'SORTIE',
      qty: '',
      reference_doc: generatedCode,
      sortie_reason: 'Bon de sortie',
      sortie_reason_custom: '',
      notes: '',
      _lot: lot,
    });
    setSortieModalVisible(true);
  };

  // ── Emballages & Consommables : édition / suppression ──────────────────────
  const handleEditEmb = (emb: any) => {
    setEmbEditId(emb.id);
    setEmbFormData({
      nom: emb.nom ?? '',
      sous_categorie: emb.sous_categorie ?? '',
      quantite_actuelle: String(emb.quantite_actuelle ?? ''),
      quantite_min: String(emb.quantite_min ?? ''),
      unite: emb.unite ?? 'UNITE',
      cout_unitaire: String(emb.cout_unitaire ?? ''),
      localisation: emb.localisation ?? '',
    });
    setEmbModalVisible(true);
  };

  const handleSaveEmb = async () => {
    if (!embEditId) return;
    const { error } = await supabase
      .from('stock_emballages_consommables')
      .update({
        nom: embFormData.nom,
        sous_categorie: embFormData.sous_categorie || null,
        quantite_actuelle: parseFloat(embFormData.quantite_actuelle) || 0,
        quantite_min: parseFloat(embFormData.quantite_min) || 0,
        unite: embFormData.unite,
        cout_unitaire: parseFloat(embFormData.cout_unitaire) || null,
        localisation: embFormData.localisation || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', embEditId);
    if (error) { Alert.alert('Erreur', error.message); return; }
    setEmbModalVisible(false);
    setEmbEditId(null);
    queryClient.invalidateQueries({ queryKey: ['stock_emballages_consommables'] });
  };

  const handleDeleteEmb = (emb: any) => {
    confirmShow(
      'Supprimer',
      `Supprimer "${emb.nom}" (${emb.code}) ?`,
      async () => {
        // 1. Mise à jour optimiste immédiate du cache local
        queryClient.setQueryData(
          ['stock_emballages_consommables'],
          (old: any[]) => (old ?? []).filter((e: any) => e.id !== emb.id),
        );
        // 2. Suppression en base
        const { error } = await supabase
          .from('stock_emballages_consommables')
          .delete()
          .eq('id', emb.id);
        if (error) {
          // Rollback si erreur
          Alert.alert('Erreur', error.message);
          queryClient.invalidateQueries({ queryKey: ['stock_emballages_consommables'] });
          return;
        }
        // 3. Refetch après délai pour laisser Supabase confirmer
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['stock_emballages_consommables'] });
        }, 1500);
      },
    );
  };

  const handleSave = () => {
    if (!formData.lot_id || !formData.depot_to_id || !formData.qty) return;

    const lot = lots.find((l) => l.id === formData.lot_id);
    if (!lot) return;

    mutation.mutate(
      {
        values: {
          ...formData,
          article_id: lot.article_id,
          depot_from_id: lot.depot_id,
          qty: parseFloat(formData.qty),
        },
        type: 'INSERT',
      },
      {
        onSuccess: () => {
          setModalVisible(false);
          const depotTo = depots.find((d) => d.id === formData.depot_to_id);
          const depotFrom = depots.find((d) => d.id === lot.depot_id);
          sendNotification.mutate({
            subject: 'Nouveau Transfert de Stock',
            message: `${formData.qty} ${lot.unit || ''} de l'article ${lot.article?.name} transféré(s) du dépôt ${depotFrom?.name || depotFrom?.code} vers ${depotTo?.name || depotTo?.code}.`,
            to_role: 'MAGA',
            type: 'internal',
          });
        },
      },
    );
  };

  const handleSaveAdjustment = () => {
    if (!adjFormData.lot_id || !adjFormData.qty) return;

    const lot = lots.find((l) => l.id === adjFormData.lot_id);
    if (!lot) return;

    const sortieReason =
      adjFormData.sortie_reason === 'Autre'
        ? adjFormData.sortie_reason_custom || 'Autre'
        : adjFormData.sortie_reason;

    const notes = sortieReason
      ? `Sortie: ${sortieReason}${adjFormData.notes ? ` — ${adjFormData.notes}` : ''}`
      : adjFormData.notes;

    const payload: any = {
      article_id: lot.article_id,
      depot_from_id: lot.depot_id,
      lot_id: adjFormData.lot_id,
      movement_type: adjFormData.movement_type,
      reference_doc: adjFormData.reference_doc,
      qty: parseFloat(adjFormData.qty),
      notes,
    };

    mutation.mutate(
      {
        values: payload,
        type: 'INSERT',
      },
      {
        onSuccess: () => setAdjModalVisible(false),
      },
    );
  };

  // ── Bon de Sortie ────────────────────────────────────────────────────────────

  const generateBonSortie = (
    lot: any,
    qty: number,
    motif: string,
    reference: string,
    obsNotes: string,
  ) => {
    const depot = depots.find((d) => d.id === lot.depot_id);
    const dateStr = new Date().toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const htmlContent = getPdfTemplate(
      'BON DE SORTIE DE STOCK',
      `
      <div style="margin-bottom: 20px; font-size: 10pt; border: 1pt solid #E9ECEF; border-radius: 6px; padding: 12px; background: #F8F9FA;">
        <strong>Référence :</strong> <span style="font-family: monospace; color: #2563EB;">${reference}</span>&emsp;
        <strong>Date :</strong> ${dateStr}
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:15%;">Code Article</th>
            <th style="width:30%;">Désignation</th>
            <th style="width:13%;">N° Lot</th>
            <th style="width:17%;">Dépôt</th>
            <th style="width:14%;" class="text-right">Qté sortie</th>
            <th style="width:11%;" class="text-center">Unité</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="bold">${lot.article?.code || ''}</td>
            <td><div class="bold">${lot.article?.name || ''}</div></td>
            <td><span class="badge badge-info">${lot.code}</span></td>
            <td>${depot?.name || depot?.code || ''}</td>
            <td class="text-right bold" style="font-size:13pt; color:#DC3545;">${qty.toLocaleString()}</td>
            <td class="text-center">${lot.unit || ''}</td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top:16px; padding:14px; background:#FFF7ED; border-left:4px solid #F97316; border-radius:4px; font-size:11pt;">
        <strong>Motif de sortie :</strong> ${motif}<br/>
        ${obsNotes ? `<strong>Observations :</strong> ${obsNotes}` : ''}
      </div>
      <div style="margin-top:40px; display:flex; justify-content:space-between;">
        <div style="width:200px; border-top:1pt solid #000; padding-top:10px; text-align:center; font-size:9pt;">Visa Magasinier</div>
        <div style="width:200px; border-top:1pt solid #000; padding-top:10px; text-align:center; font-size:9pt;">Visa Responsable</div>
      </div>
      `,
      { watermark: 'BON DE SORTIE' },
    );
    generatePdf(htmlContent, `${reference}_Bon_Sortie.pdf`);
  };

  const handlePrintLabel = async (lotId: string) => {
    const lot = lots.find((l) => l.id === lotId);
    if (!lot) return;
    await printThermalLabel({
      code: lot.code,
      article: lot.article?.name || '',
      qty: lot.qty_current || 0,
      unit: lot.unit || 'kg',
      date: new Date(lot.reception_date || Date.now()).toLocaleDateString('fr-FR'),
      supplier: lot.supplier?.name || '',
      status: lot.cqlib_status,
    });
  };

  const handleSaveSortie = () => {
    const qtyVal = parseFloat(sortieFormData.qty);
    if (!sortieFormData.lot_id || isNaN(qtyVal) || qtyVal <= 0) return;
    const lot = lots.find((l) => l.id === sortieFormData.lot_id);
    if (!lot) return;
    const motif =
      sortieFormData.sortie_reason === 'Autre'
        ? sortieFormData.sortie_reason_custom || 'Autre'
        : sortieFormData.sortie_reason;
    const notes = `Sortie: ${motif}${sortieFormData.notes ? ` — ${sortieFormData.notes}` : ''}`;
    mutation.mutate(
      {
        values: {
          article_id: lot.article_id,
          depot_from_id: lot.depot_id,
          lot_id: sortieFormData.lot_id,
          movement_type: 'SORTIE',
          reference_doc: sortieFormData.reference_doc,
          qty: qtyVal,
          notes,
        },
        type: 'INSERT',
      },
      {
        onSuccess: (result: any) => {
          setSortieModalVisible(false);
          generateBonSortie(
            lot,
            qtyVal,
            motif,
            sortieFormData.reference_doc,
            sortieFormData.notes || '',
          );
          sendNotification.mutate({
            subject: `Sortie stock — ${sortieFormData.reference_doc}`,
            message: `Sortie de ${qtyVal} ${lot.unit} (${lot.article?.name}) effectuée. Motif : ${motif}. Réf : ${sortieFormData.reference_doc}.`,
            to_role: 'MAGA',
            type: 'internal',
          });
          // Ouvrir workflow triple signature
          if (result?.id) {
            setSigMovementId(result.id);
            setSigMovementRef(sortieFormData.reference_doc);
            setSigMovementType('SORTIE');
            setSigModalVisible(true);
          }
        },
      },
    );
  };

  const filteredLots = (selDepotId ? scopedLots.filter((l) => l.depot_id === selDepotId) : scopedLots).filter(
    (l) =>
      (l.code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.article?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.article?.code || '').toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleExportPdf = () => {
    let depotName = selDepotId
      ? depots.find((d) => d.id === selDepotId)?.name || 'Dépôt Inconnu'
      : 'Vue consolidée';

    // Calcul des totaux pour le résumé
    const totalQty = filteredLots.reduce((acc, l) => acc + (l.qty_current || 0), 0);
    const mpCount = filteredLots.filter((l) => l.article?.article_type === 'MP').length;
    const pfCount = filteredLots.filter((l) => l.article?.article_type === 'PF').length;

    let tableRows = filteredLots
      .map(
        (l) => `
      <tr>
        <td class="bold">${l.article?.code || ''}</td>
        <td>
          <div class="bold">${l.article?.name || ''}</div>
          <div style="font-size: 8pt; color: #666;">Type: ${l.article?.article_type || ''}</div>
        </td>
        <td><span class="badge badge-info">${l.code || 'N/A'}</span></td>
        <td>${depots.find((d) => d.id === l.depot_id)?.name || ''}</td>
        <td class="text-right bold" style="font-size: 11pt;">${l.qty_current?.toLocaleString() || '0'}</td>
        <td class="text-center">${l.unit || ''}</td>
      </tr>
    `,
      )
      .join('');

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
      { orientation: 'landscape', watermark: 'GSI STOCK' },
    );

    generatePdf(htmlContent, `Etat_Stocks_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // Calculs avancés pour l'Analyse ABC, Valorisation et Obsolescence
  const abcData = React.useMemo(() => {
    // 1. Regrouper les lots par article
    const articleStocks: Record<string, number> = {};
    scopedLots.forEach((l) => {
      if (l.article_id) {
        articleStocks[l.article_id] = (articleStocks[l.article_id] || 0) + (l.qty_current || 0);
      }
    });

    // 2. Associer coût unitaire simulé et calculer la valeur totale
    const mapped = scopedArticles.map((art) => {
      const stock = articleStocks[art.id] || 0;
      const unitCost =
        art.article_type === 'MP'
          ? 5000
          : art.article_type === 'PF'
            ? 12000
            : art.article_type === 'SF'
              ? 8000
              : 3000;
      const totalVal = stock * unitCost;
      return {
        ...art,
        stock,
        unitCost,
        totalVal,
      };
    });

    // 3. Trier par valeur décroissante pour la classification ABC
    const sorted = [...mapped].sort((a, b) => b.totalVal - a.totalVal);
    const totalStockVal = sorted.reduce((sum, item) => sum + item.totalVal, 0);

    let cumulativeVal = 0;
    return sorted.map((item) => {
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
        eoq,
      };
    });
  }, [scopedArticles, scopedLots]);

  // Statistiques ABC
  const abcStats = React.useMemo(() => {
    const stats = {
      A: { count: 0, val: 0 },
      B: { count: 0, val: 0 },
      C: { count: 0, val: 0 },
    };
    abcData.forEach((item) => {
      stats[item.abcClass].count++;
      stats[item.abcClass].val += item.totalVal;
    });
    const totalVal = abcData.reduce((sum, item) => sum + item.totalVal, 0);
    return {
      stats,
      totalVal,
    };
  }, [abcData]);

  // Analyse de vieillissement (Aging Report) & Taux de rotation
  const agingAndRotationData = React.useMemo(() => {
    const nowTime = new Date().getTime();
    const categories = {
      fresh: 0, // < 30j
      medium: 0, // 30 - 90j
      critical: 0, // > 90j
      expired: 0, // Date d'expiration dépassée
    };

    let totalValPmp = 0;
    let totalValFifo = 0;

    scopedLots.forEach((l) => {
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
      daysCoverage: 107, // Jours de couverture moyen
    };
  }, [scopedLots]);

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
        <View
          style={[
            s.headerRow,
            isMobile && { flexDirection: 'column', alignItems: 'flex-start', gap: 16 },
          ]}
        >
          <View>
            <Text style={s.title}>{t('stocks_title')}</Text>
            <Text style={s.subTitle}>{t('stocks_sub')}</Text>
          </View>
          <View style={[s.actions, isMobile && { width: '100%', justifyContent: 'flex-start' }]}>
            <ActionButton
              label="Scanner"
              icon="barcode-scan"
              onPress={() => setScannerVisible(true)}
              variant="primary"
            />
            <ActionButton label="Seuils" icon="tune" onPress={() => setThreshModalVisible(true)} />
            <ActionButton label="Export PDF" icon="file-pdf-box" onPress={handleExportPdf} />
            {canPerformAction('stock_adjust') && (
              <>
                <ActionButton
                  label="Saisie sortie"
                  icon="arrow-up-bold"
                  onPress={handleQuickSortie}
                />
                <ActionButton label="Ajustement inventaire" onPress={handleAdjustment} />
              </>
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
            <MaterialCommunityIcons
              name="package-variant"
              size={18}
              color={activeTab === 'lots' ? '#FFF' : '#6C757D'}
            />
            <Text style={[s.tabButtonText, activeTab === 'lots' && s.tabButtonTextActive]}>
              {t('stocks_tabs_lots')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.tabButton, activeTab === 'abc' && s.tabButtonActive]}
            onPress={() => setActiveTab('abc')}
          >
            <MaterialCommunityIcons
              name="chart-donut-variant"
              size={18}
              color={activeTab === 'abc' ? '#FFF' : '#6C757D'}
            />
            <Text style={[s.tabButtonText, activeTab === 'abc' && s.tabButtonTextActive]}>
              {t('stocks_tabs_abc')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.tabButton, activeTab === 'valuation' && s.tabButtonActive]}
            onPress={() => setActiveTab('valuation')}
          >
            <MaterialCommunityIcons
              name="currency-usd"
              size={18}
              color={activeTab === 'valuation' ? '#FFF' : '#6C757D'}
            />
            <Text style={[s.tabButtonText, activeTab === 'valuation' && s.tabButtonTextActive]}>
              {t('stocks_tabs_valuation')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.tabButton, activeTab === 'mouvements' && s.tabButtonActive]}
            onPress={() => setActiveTab('mouvements')}
          >
            <MaterialCommunityIcons
              name="swap-horizontal"
              size={18}
              color={activeTab === 'mouvements' ? '#FFF' : '#6C757D'}
            />
            <Text style={[s.tabButtonText, activeTab === 'mouvements' && s.tabButtonTextActive]}>
              Mouvements
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.tabButton, activeTab === 'emballages' && s.tabButtonActive]}
            onPress={() => setActiveTab('emballages')}
          >
            <MaterialCommunityIcons
              name="package-variant-closed"
              size={18}
              color={activeTab === 'emballages' ? '#FFF' : '#6C757D'}
            />
            <Text style={[s.tabButtonText, activeTab === 'emballages' && s.tabButtonTextActive]}>
              Emballages
            </Text>
          </TouchableOpacity>
        </View>

        {/* Alert Banner */}
        {totalAlerts > 0 && activeTab === 'lots' && (
          <View style={[s.alertBanner, criticalAlerts.length > 0 && s.alertBannerCritical]}>
            <MaterialCommunityIcons
              name={criticalAlerts.length > 0 ? 'alert-octagon' : 'alert'}
              size={20}
              color="#FFF"
            />
            <Text style={s.alertBannerText}>
              {criticalAlerts.length > 0
                ? criticalAlerts.length +
                  ' article(s) en rupture critique - Reapprovisionnement urgent requis'
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
                <KpiCard
                  label="Articles actifs"
                  value={String(scopedArticles.length)}
                  sub="MP + EMB + PF"
                />
                <KpiCard
                  label="Alertes seuils"
                  value={String(totalAlerts)}
                  sub={criticalAlerts.length + ' critique · ' + warningAlerts.length + ' warning'}
                  color={criticalAlerts.length > 0 ? C.err : C.gold}
                />
              </View>

              <Text style={s.sectionLabel}>SÉLECTION DU DÉPÔT</Text>
              {depots.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  onPress={() => setSelDepotId(selDepotId === d.id ? null : d.id)}
                  style={[s.depotCard, selDepotId === d.id && s.depotCardActive]}
                >
                  <View>
                    <Text style={[s.depotName, selDepotId === d.id && s.whiteText]}>{d.name}</Text>
                    <Text style={[s.depotCode, selDepotId === d.id && s.mutedWhite]}>
                      {d.code} · Site Antananarivo
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.depotLots, selDepotId === d.id && s.whiteText]}>
                      {scopedLots.filter((l) => l.depot_id === d.id).length} lots
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* Right Col: Depot Detail + Table */}
            <View style={[s.rightCol, isMobile && { width: '100%' }]}>
              {selDepotId ? (
                (() => {
                  const depot = depots.find((d) => d.id === selDepotId);
                  if (!depot) return null;
                  const totalQty = filteredLots.reduce((a, l) => a + (l.qty_current || 0), 0);
                  const articleCount = new Set(filteredLots.map((l) => l.article_id)).size;
                  return (
                    <View style={s.tableCard}>
                      <View style={s.tableHeader}>
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                          }}
                        >
                          <View>
                            <Text style={s.tableTitle}>{depot.name}</Text>
                            <Text style={s.tableSub}>
                              {depot.code} · {depot.depot_type || 'Mixte'}
                              {depot.is_deteriore ? ' · DÉTÉRIORÉ' : ''}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 16 }}>
                            <View style={{ alignItems: 'center' }}>
                              <Text style={{ fontSize: 20, fontWeight: '800', color: '#1A1A1A' }}>
                                {filteredLots.length}
                              </Text>
                              <Text style={{ fontSize: 10, color: '#6C757D', fontWeight: '700' }}>
                                {t('lots_count')}
                              </Text>
                            </View>
                            <View style={{ alignItems: 'center' }}>
                              <Text style={{ fontSize: 20, fontWeight: '800', color: '#1A1A1A' }}>
                                {articleCount}
                              </Text>
                              <Text style={{ fontSize: 10, color: '#6C757D', fontWeight: '700' }}>
                                {t('articles_count')}
                              </Text>
                            </View>
                            <View style={{ alignItems: 'center' }}>
                              <Text style={{ fontSize: 20, fontWeight: '800', color: '#1A1A1A' }}>
                                {totalQty.toLocaleString()}
                              </Text>
                              <Text style={{ fontSize: 10, color: '#6C757D', fontWeight: '700' }}>
                                Qté totale
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>
                      {/* Table header */}
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={{ minWidth: 820 }}>
                          <View
                            style={[
                              s.tr,
                              {
                                backgroundColor: '#F8F9FA',
                                borderBottomWidth: 2,
                                borderBottomColor: '#E9ECEF',
                              },
                            ]}
                          >
                            {/* Checkbox sélectionner tout */}
                            <TouchableOpacity
                              onPress={() => toggleLotSelectAll(filteredLots.map((l) => l.id))}
                              style={{ width: 36, alignItems: 'center', justifyContent: 'center' }}
                            >
                              <MaterialCommunityIcons
                                name={
                                  filteredLots.length > 0 &&
                                  filteredLots.every((l) => selectedLotIds.includes(l.id))
                                    ? 'checkbox-marked'
                                    : filteredLots.some((l) => selectedLotIds.includes(l.id))
                                      ? 'minus-box'
                                      : 'checkbox-blank-outline'
                                }
                                size={16}
                                color={selectedLotIds.length > 0 ? '#2563EB' : '#ADB5BD'}
                              />
                            </TouchableOpacity>
                            <View style={{ flex: 2 }}>
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: '800',
                                  color: '#ADB5BD',
                                  letterSpacing: 1,
                                }}
                              >
                                ARTICLE
                              </Text>
                            </View>
                            <View style={{ flex: 1.5 }}>
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: '800',
                                  color: '#ADB5BD',
                                  letterSpacing: 1,
                                }}
                              >
                                N° LOT
                              </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: '800',
                                  color: '#ADB5BD',
                                  letterSpacing: 1,
                                }}
                              >
                                DÉPÔT
                              </Text>
                            </View>
                            <View style={{ width: 130, alignItems: 'flex-end' }}>
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: '800',
                                  color: '#ADB5BD',
                                  letterSpacing: 1,
                                }}
                              >
                                QUANTITÉ
                              </Text>
                            </View>
                            <View style={{ width: 110, alignItems: 'flex-end' }}>
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: '800',
                                  color: '#ADB5BD',
                                  letterSpacing: 1,
                                }}
                              >
                                COUVERTURE
                              </Text>
                            </View>
                            <View style={{ width: isMobile ? 200 : 220, alignItems: 'flex-end' }}>
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: '800',
                                  color: '#ADB5BD',
                                  letterSpacing: 1,
                                }}
                              >
                                ACTIONS
                              </Text>
                            </View>
                          </View>
                          {filteredLots.map((line, idx) => (
                            <View
                              key={line.id}
                              style={[
                                s.tr,
                                idx === filteredLots.length - 1 && { borderBottomWidth: 0 },
                                selectedLotIds.includes(line.id) && { backgroundColor: '#EFF6FF' },
                              ]}
                            >
                              {/* Checkbox sélection */}
                              <TouchableOpacity
                                onPress={() => toggleLotSelect(line.id)}
                                style={{ width: 36, alignItems: 'center', justifyContent: 'center' }}
                              >
                                <MaterialCommunityIcons
                                  name={selectedLotIds.includes(line.id) ? 'checkbox-marked' : 'checkbox-blank-outline'}
                                  size={16}
                                  color={selectedLotIds.includes(line.id) ? '#2563EB' : '#CBD5E1'}
                                />
                              </TouchableOpacity>
                              <View style={{ flex: 2 }}>
                                <View
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                                >
                                  <Text style={s.tdCode}>{line.article?.code}</Text>
                                  {(() => {
                                    const art = articles.find((a) => a.id === line.article_id);
                                    if (
                                      art &&
                                      art.reorder_point > 0 &&
                                      line.qty_current <= art.reorder_point
                                    )
                                      return (
                                        <View style={s.miniBadgeCritical}>
                                          <Text style={s.miniBadgeCriticalText}>CRITIQUE</Text>
                                        </View>
                                      );
                                    if (
                                      art &&
                                      art.safety_stock > 0 &&
                                      line.qty_current <= art.safety_stock
                                    )
                                      return (
                                        <View style={s.miniBadge}>
                                          <Text style={s.miniBadgeText}>SEUIL</Text>
                                        </View>
                                      );
                                    return null;
                                  })()}
                                </View>
                                <Text style={s.tdArticle}>{line.article?.name}</Text>
                              </View>
                              <View style={{ flex: 1.5, justifyContent: 'center' }}>
                                <Text style={s.tdLot}>{line.code}</Text>
                              </View>
                              <View style={{ flex: 1, justifyContent: 'center' }}>
                                <Text style={{ fontSize: 11, color: '#6C757D' }}>
                                  {depots.find((d) => d.id === line.depot_id)?.code || '—'}
                                </Text>
                              </View>
                              <View
                                style={{
                                  width: 130,
                                  alignItems: 'flex-end',
                                  justifyContent: 'center',
                                }}
                              >
                                <Text style={s.tdQty}>
                                  {line.qty_current?.toLocaleString() || '0'} {line.unit}
                                </Text>
                              </View>
                              <View style={{ width: 110, justifyContent: 'center' }}>
                                <CovBar
                                  days={calcDaysOfStock(
                                    line.article_id,
                                    line.qty_current || 0,
                                  )}
                                  label="base sorties vente 30j"
                                />
                              </View>
                              <View
                                style={{
                                  width: isMobile ? 200 : 220,
                                  alignItems: 'flex-end',
                                  justifyContent: 'center',
                                }}
                              >
                                <View
                                  style={{
                                    flexDirection: 'row',
                                    gap: 8,
                                    flexWrap: 'wrap',
                                    justifyContent: 'flex-end',
                                  }}
                                >
                                  <ActionButton
                                    label="Sortie"
                                    icon="arrow-up-bold"
                                    onPress={() => openAdjustmentForLot(line.id)}
                                  />
                                  <ActionButton
                                    label={isMobile ? '' : 'Imprimer'}
                                    icon="printer"
                                    onPress={() => handlePrintLabel(line.id)}
                                    variant="secondary"
                                    compact
                                    iconOnly={isMobile}
                                  />
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
                      {/* ── Barre d'actions multi-sélection lots ── */}
                      {selectedLotIds.length > 0 && (
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: '#1E40AF',
                            borderRadius: 10,
                            paddingHorizontal: 16,
                            paddingVertical: 10,
                            marginTop: 10,
                            gap: 10,
                          }}
                        >
                          <MaterialCommunityIcons name="package-variant-closed" size={18} color="#93C5FD" />
                          <Text style={{ color: '#FFF', fontWeight: '700', flex: 1, fontSize: 13 }}>
                            {selectedLotIds.length} lot{selectedLotIds.length > 1 ? 's' : ''} sélectionné{selectedLotIds.length > 1 ? 's' : ''}
                          </Text>
                          <TouchableOpacity
                            onPress={() => {
                              const sel = lots.filter((l) => selectedLotIds.includes(l.id));
                              const total = sel.reduce((s, l) => s + (l.qty_current || 0), 0);
                              Alert.alert(
                                'Sélection lots',
                                `${sel.length} lot(s) · Qté totale : ${total.toLocaleString()}\n\n${sel.slice(0, 5).map((l) => `${l.code} — ${l.qty_current} ${l.unit}`).join('\n')}${sel.length > 5 ? '\n...' : ''}`,
                              );
                            }}
                            style={{ backgroundColor: '#3B82F6', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}
                          >
                            <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '600' }}>Détail</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => setSelectedLotIds([])}
                            style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}
                          >
                            <Text style={{ color: '#FFF', fontSize: 12 }}>✕ Effacer</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })()
              ) : (
                <View style={s.tableCard}>
                  <View style={s.tableHeader}>
                    <Text style={s.tableTitle}>Articles en stock</Text>
                    <Text style={s.tableSub}>
                      Vue consolidée — sélectionnez un dépôt pour voir le détail
                    </Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ minWidth: 820 }}>
                      {filteredLots.map((line, idx) => (
                        <View
                          key={line.id}
                          style={[
                            s.tr,
                            idx === filteredLots.length - 1 && { borderBottomWidth: 0 },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={s.tdCode}>{line.article?.code}</Text>
                              {line.qty_current < 500 && (
                                <View style={s.miniBadge}>
                                  <Text style={s.miniBadgeText}>SEUIL</Text>
                                </View>
                              )}
                            </View>
                            <Text style={s.tdArticle}>{line.article?.name}</Text>
                            <Text style={s.tdLot}>
                              {line.code} · {depots.find((d) => d.id === line.depot_id)?.name}
                            </Text>
                          </View>
                          <View style={{ width: isMobile ? 190 : 220, alignItems: 'flex-end' }}>
                            <Text style={s.tdQty}>
                              {line.qty_current?.toLocaleString() || '0'} {line.unit}
                            </Text>
                            <View
                              style={{
                                width: '100%',
                                marginTop: 8,
                                gap: 10,
                                alignItems: 'flex-end',
                              }}
                            >
                              <View style={{ width: isMobile ? '100%' : '60%' }}>
                                <CovBar
                                  days={calcDaysOfStock(
                                    line.article_id,
                                    line.qty_current || 0,
                                  )}
                                  label="base sorties vente 30j"
                                />
                              </View>
                              <View
                                style={{
                                  width: '100%',
                                  flexDirection: 'row',
                                  gap: 8,
                                  alignItems: 'center',
                                  justifyContent: 'flex-end',
                                  flexWrap: 'wrap',
                                }}
                              >
                                <ActionButton
                                  label="Sortie"
                                  icon="arrow-up-bold"
                                  onPress={() => openAdjustmentForLot(line.id)}
                                />
                                <ActionButton
                                  label={isMobile ? '' : 'Imprimer'}
                                  icon="printer"
                                  onPress={() => handlePrintLabel(line.id)}
                                  variant="secondary"
                                  compact
                                  iconOnly={isMobile}
                                />
                              </View>
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
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={[s.abcTitle, { color: '#28A745' }]}>Classe A (Critique)</Text>
                  <View style={[s.abcBadge, { backgroundColor: '#E2F6E9' }]}>
                    <Text style={{ color: '#28A745', fontWeight: '800' }}>80% Val.</Text>
                  </View>
                </View>
                <Text style={s.abcVal}>{(abcStats.stats.A.val / 1000000).toFixed(2)} M MGA</Text>
                <Text style={s.abcSub}>
                  {abcStats.stats.A.count} articles ·{' '}
                  {abcStats.totalVal > 0
                    ? ((abcStats.stats.A.val / abcStats.totalVal) * 100).toFixed(1)
                    : 0}
                  % du stock
                </Text>
              </View>

              <View style={[s.abcCard, { borderColor: '#FFC107', flex: 1 }]}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={[s.abcTitle, { color: '#FFC107' }]}>Classe B (Intermédiaire)</Text>
                  <View style={[s.abcBadge, { backgroundColor: '#FFF9E6' }]}>
                    <Text style={{ color: '#FFC107', fontWeight: '800' }}>15% Val.</Text>
                  </View>
                </View>
                <Text style={s.abcVal}>{(abcStats.stats.B.val / 1000000).toFixed(2)} M MGA</Text>
                <Text style={s.abcSub}>
                  {abcStats.stats.B.count} articles ·{' '}
                  {abcStats.totalVal > 0
                    ? ((abcStats.stats.B.val / abcStats.totalVal) * 100).toFixed(1)
                    : 0}
                  % du stock
                </Text>
              </View>

              <View style={[s.abcCard, { borderColor: '#6C757D', flex: 1 }]}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={[s.abcTitle, { color: '#6C757D' }]}>Classe C (Faible)</Text>
                  <View style={[s.abcBadge, { backgroundColor: '#F1F3F5' }]}>
                    <Text style={{ color: '#6C757D', fontWeight: '800' }}>5% Val.</Text>
                  </View>
                </View>
                <Text style={s.abcVal}>{(abcStats.stats.C.val / 1000000).toFixed(2)} M MGA</Text>
                <Text style={s.abcSub}>
                  {abcStats.stats.C.count} articles ·{' '}
                  {abcStats.totalVal > 0
                    ? ((abcStats.stats.C.val / abcStats.totalVal) * 100).toFixed(1)
                    : 0}
                  % du stock
                </Text>
              </View>
            </View>

            {/* ABC Classification Table */}
            <View style={s.tableCard}>
              <View style={s.tableHeader}>
                <Text style={s.tableTitle}>Classification ABC & Quantité Économique (EOQ)</Text>
                <Text style={s.tableSub}>
                  Classification basée sur la valeur cumulée en stock · EOQ (Formule de Wilson)
                </Text>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ minWidth: 820 }}>
                  <View
                    style={[
                      s.tr,
                      {
                        backgroundColor: '#F8F9FA',
                        borderBottomWidth: 2,
                        borderBottomColor: '#E9ECEF',
                      },
                    ]}
                  >
                    <View style={{ width: 80 }}>
                      <Text style={s.thText}>CLASSE</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.thText}>ARTICLE</Text>
                    </View>
                    <View style={{ width: 120, alignItems: 'flex-end' }}>
                      <Text style={s.thText}>STOCK ACTUEL</Text>
                    </View>
                    <View style={{ width: 150, alignItems: 'flex-end' }}>
                      <Text style={s.thText}>VALEUR EST.</Text>
                    </View>
                    <View style={{ width: 120, alignItems: 'flex-end' }}>
                      <Text style={s.thText}>REORDER POINT</Text>
                    </View>
                    <View style={{ width: 120, alignItems: 'flex-end' }}>
                      <Text style={s.thText}>EOQ (WILSON)</Text>
                    </View>
                  </View>

                  {abcData.map((item, idx) => (
                    <View
                      key={item.id}
                      style={[s.tr, idx === abcData.length - 1 && { borderBottomWidth: 0 }]}
                    >
                      <View style={{ width: 80 }}>
                        <View
                          style={[
                            s.classBadge,
                            item.abcClass === 'A'
                              ? s.badgeA
                              : item.abcClass === 'B'
                                ? s.badgeB
                                : s.badgeC,
                          ]}
                        >
                          <Text style={s.classBadgeText}>CLASSE {item.abcClass}</Text>
                        </View>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={s.tdCode}>{item.code}</Text>
                        <Text style={s.tdArticle}>{item.name}</Text>
                      </View>

                      <View
                        style={{ width: 120, alignItems: 'flex-end', justifyContent: 'center' }}
                      >
                        <Text style={s.tdQty}>
                          {item.stock.toLocaleString()} {item.unit}
                        </Text>
                      </View>

                      <View
                        style={{ width: 150, alignItems: 'flex-end', justifyContent: 'center' }}
                      >
                        <Text style={[s.tdQty, { color: '#495057' }]}>
                          {item.totalVal.toLocaleString()} MGA
                        </Text>
                      </View>

                      <View
                        style={{ width: 120, alignItems: 'flex-end', justifyContent: 'center' }}
                      >
                        <Text style={s.tdQty}>{item.reorder_point.toLocaleString()}</Text>
                      </View>

                      <View
                        style={{ width: 120, alignItems: 'flex-end', justifyContent: 'center' }}
                      >
                        <Text style={[s.tdQty, { color: '#007BFF' }]}>
                          {item.eoq.toLocaleString()} {item.unit}
                        </Text>
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
              <KpiCard
                label="Valorisation PMP"
                value={`${(agingAndRotationData.totalValPmp / 1000000).toFixed(2)} M`}
                sub="Millions MGA (Standard)"
                color="#007BFF"
              />
              <KpiCard
                label="Valorisation FIFO"
                value={`${(agingAndRotationData.totalValFifo / 1000000).toFixed(2)} M`}
                sub="Simulation FIFO (Fluctuant)"
                color="#28A745"
              />
              <KpiCard
                label="Taux de Rotation"
                value={`${agingAndRotationData.turnoverRate}x`}
                sub="Rotations par an"
                color="#FFC107"
              />
              <KpiCard
                label="Jours de Couverture"
                value={`${agingAndRotationData.daysCoverage}j`}
                sub="Stock moyen disponible"
                color="#17A2B8"
              />
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
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          marginBottom: 4,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#6C757D' }}>
                          Sain (&lt; 30 jours)
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#28A745' }}>
                          {(
                            (agingAndRotationData.categories.fresh /
                              agingAndRotationData.totalValPmp) *
                              100 || 0
                          ).toFixed(1)}
                          %
                        </Text>
                      </View>
                      <View style={s.progressContainer}>
                        <View
                          style={[
                            s.progressBar,
                            {
                              width: `${(agingAndRotationData.categories.fresh / agingAndRotationData.totalValPmp) * 100}%`,
                              backgroundColor: '#28A745',
                            },
                          ]}
                        />
                      </View>
                    </View>

                    <View>
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          marginBottom: 4,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#6C757D' }}>
                          Intermédiaire (30 - 90 jours)
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFC107' }}>
                          {(
                            (agingAndRotationData.categories.medium /
                              agingAndRotationData.totalValPmp) *
                              100 || 0
                          ).toFixed(1)}
                          %
                        </Text>
                      </View>
                      <View style={s.progressContainer}>
                        <View
                          style={[
                            s.progressBar,
                            {
                              width: `${(agingAndRotationData.categories.medium / agingAndRotationData.totalValPmp) * 100}%`,
                              backgroundColor: '#FFC107',
                            },
                          ]}
                        />
                      </View>
                    </View>

                    <View>
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          marginBottom: 4,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#6C757D' }}>
                          Risque (&gt; 90 jours)
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#DC3545' }}>
                          {(
                            (agingAndRotationData.categories.critical /
                              agingAndRotationData.totalValPmp) *
                              100 || 0
                          ).toFixed(1)}
                          %
                        </Text>
                      </View>
                      <View style={s.progressContainer}>
                        <View
                          style={[
                            s.progressBar,
                            {
                              width: `${(agingAndRotationData.categories.critical / agingAndRotationData.totalValPmp) * 100}%`,
                              backgroundColor: '#DC3545',
                            },
                          ]}
                        />
                      </View>
                    </View>

                    <View>
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          marginBottom: 4,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#6C757D' }}>
                          Périmé / Obsolète
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#6C757D' }}>
                          {(
                            (agingAndRotationData.categories.expired /
                              agingAndRotationData.totalValPmp) *
                              100 || 0
                          ).toFixed(1)}
                          %
                        </Text>
                      </View>
                      <View style={s.progressContainer}>
                        <View
                          style={[
                            s.progressBar,
                            {
                              width: `${(agingAndRotationData.categories.expired / agingAndRotationData.totalValPmp) * 100}%`,
                              backgroundColor: '#6C757D',
                            },
                          ]}
                        />
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
                  <View
                    style={[
                      s.tr,
                      {
                        backgroundColor: '#F8F9FA',
                        borderBottomWidth: 2,
                        borderBottomColor: '#E9ECEF',
                      },
                    ]}
                  >
                    <View style={{ flex: 2 }}>
                      <Text style={s.thText}>LOT / ARTICLE</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.thText}>RÉCEPTION</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.thText}>EXPIRATION</Text>
                    </View>
                    <View style={{ width: 100, alignItems: 'flex-end' }}>
                      <Text style={s.thText}>QUANTITÉ</Text>
                    </View>
                  </View>

                  {scopedLots.slice(0, 10).map((l, idx) => {
                    const recepDate = new Date(l.reception_date);
                    const ageDays = Math.floor(
                      (new Date().getTime() - recepDate.getTime()) / (1000 * 60 * 60 * 24),
                    );
                    // ─── Identification produit par nom ───────────────────────
                    const articleName = (l.article?.name ?? '').toUpperCase();
                    const articleType = l.article?.article_type ?? 'MP';
                    const isSavon = articleName.includes('SAVON') || articleName.includes('SABON');
                    const isPT    = articleName.includes('PAPIER') || articleName.includes(' PT ') || articleName.includes('-PT-') || articleName.endsWith(' PT') || articleName.includes('TOILET');

                    // ─── Statut savon : cure forêt (pas de péremption) ────────
                    // < 6 mois  → EN CURE    (saponification incomplète, pH encore haut)
                    // 6–18 mois → OPTIMAL    (cure achevée, texture et mousse au top)
                    // > 18 mois → VIEILLISSANT (poids réduit par évaporation, qualité maintenue)
                    type SavonStatut = 'EN_CURE' | 'OPTIMAL' | 'VIEILLISSANT';
                    const savonStatut: SavonStatut | null = isSavon
                      ? ageDays < 180
                        ? 'EN_CURE'
                        : ageDays < 540
                          ? 'OPTIMAL'
                          : 'VIEILLISSANT'
                      : null;
                    const SAVON_STATUT_CONFIG: Record<SavonStatut, { label: string; color: string; bg: string; detail: string }> = {
                      EN_CURE:     { label: 'EN CURE',     color: '#856404', bg: '#FFF3CD', detail: 'Cure forêt en cours — ne pas expédier' },
                      OPTIMAL:     { label: 'OPTIMAL',     color: '#155724', bg: '#D4EDDA', detail: 'Qualité maximale — priorité expédition' },
                      VIEILLISSANT:{ label: 'VIEILLISSANT',color: '#495057', bg: '#E2E3E5', detail: 'Poids réduit par évaporation — bon usage' },
                    };

                    // ─── Fallback par type pour les autres produits ───────────
                    const DEFAULT_SHELF_LIFE_BY_TYPE: Record<string, { days: number; label: string }> = {
                      PF:  { days: 365 * 2,    label: '~2 ans (PF défaut)' },
                      MP:  { days: 365 * 3,    label: '~3 ans (MP défaut)' },
                      SF:  { days: 365 * 1,    label: '~1 an (SF défaut)' },
                      EMB: { days: 365 * 5,    label: '~5 ans (EMB défaut)' },
                    };
                    const fallback = DEFAULT_SHELF_LIFE_BY_TYPE[articleType] ?? DEFAULT_SHELF_LIFE_BY_TYPE['MP'];

                    // ─── Calcul date expiration ───────────────────────────────
                    // Savon  → pas d'expiration (null = pas de date affichée)
                    // PT     → 90 jours depuis réception
                    // Autres → expiry_date explicite > shelf_life_days > fallback type
                    const expirySource: 'explicit' | 'shelf_life' | 'pt_default' | 'estimated' | 'savon' = isSavon
                      ? 'savon'
                      : l.expiry_date
                        ? 'explicit'
                        : isPT
                          ? 'pt_default'
                          : l.article?.shelf_life_days
                            ? 'shelf_life'
                            : 'estimated';

                    const computedExpiry: Date | null = isSavon
                      ? null
                      : l.expiry_date
                        ? new Date(l.expiry_date)
                        : isPT
                          ? new Date(recepDate.getTime() + 90 * 86400000)
                          : l.article?.shelf_life_days
                            ? new Date(recepDate.getTime() + l.article.shelf_life_days * 86400000)
                            : new Date(recepDate.getTime() + fallback.days * 86400000);

                    const isExpired = computedExpiry
                      ? computedExpiry.getTime() < new Date().getTime()
                      : false;

                    return (
                      <View
                        key={l.id}
                        style={[
                          s.tr,
                          idx === scopedLots.slice(0, 10).length - 1 && { borderBottomWidth: 0 },
                        ]}
                      >
                        <View style={{ flex: 2 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={s.tdCode}>{l.code}</Text>
                            {isExpired ? (
                              <View style={[s.miniBadgeCritical, { backgroundColor: '#721C24' }]}>
                                <Text style={[s.miniBadgeCriticalText, { color: '#FFF' }]}>
                                  PÉRIMÉ
                                </Text>
                              </View>
                            ) : isSavon && savonStatut ? (
                              <View style={[s.miniBadgeCritical, { backgroundColor: SAVON_STATUT_CONFIG[savonStatut].bg }]}>
                                <Text style={[s.miniBadgeCriticalText, { color: SAVON_STATUT_CONFIG[savonStatut].color }]}>
                                  {SAVON_STATUT_CONFIG[savonStatut].label}
                                </Text>
                              </View>
                            ) : ageDays > 90 ? (
                              <View style={s.miniBadgeCritical}>
                                <Text style={s.miniBadgeCriticalText}>&gt;90j</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={s.tdArticle}>{l.article?.name}</Text>
                        </View>

                        <View style={{ flex: 1, justifyContent: 'center' }}>
                          <Text style={{ fontSize: 12, color: '#495057' }}>
                            {recepDate.toLocaleDateString()}
                          </Text>
                          <Text style={{ fontSize: 10, color: '#6C757D' }}>{ageDays}j d'âge</Text>
                        </View>

                        <View style={{ flex: 1, justifyContent: 'center' }}>
                          {/* ── Colonne EXPIRATION ── */}
                          {isSavon && savonStatut ? (
                            <>
                              <Text style={{ fontSize: 11, color: SAVON_STATUT_CONFIG[savonStatut].color, fontWeight: '600' }}>
                                Sans péremption
                              </Text>
                              <Text style={{ fontSize: 9, color: '#6C757D' }}>
                                {SAVON_STATUT_CONFIG[savonStatut].detail}
                              </Text>
                            </>
                          ) : (
                            <>
                              <Text style={{ fontSize: 12, color: isExpired ? '#DC3545' : '#495057' }}>
                                {computedExpiry ? computedExpiry.toLocaleDateString('fr-FR') : '—'}
                              </Text>
                              {expirySource === 'pt_default' && (
                                <Text style={{ fontSize: 9, color: '#DC7A00' }}>3 mois (PT défaut)</Text>
                              )}
                              {expirySource === 'shelf_life' && (
                                <Text style={{ fontSize: 9, color: '#ADB5BD' }}>estimée (DLC art.)</Text>
                              )}
                              {expirySource === 'estimated' && (
                                <Text style={{ fontSize: 9, color: '#F0AD4E' }}>
                                  {DEFAULT_SHELF_LIFE_BY_TYPE[articleType]?.label ?? '~3 ans (défaut)'}
                                </Text>
                              )}
                            </>
                          )}
                        </View>

                        <View
                          style={{ width: 100, alignItems: 'flex-end', justifyContent: 'center' }}
                        >
                          <Text style={s.tdQty}>
                            {l.qty_current?.toLocaleString()} {l.unit}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ── Tab Mouvements ─────────────────────────────────────── */}
        {activeTab === 'mouvements' && (
          <View>
            {/* Stock Card : résumé par article */}
            <View style={s.tableCard}>
              <View style={[s.tableHeader, s.movementHeader]}>
                <View>
                  <Text style={s.tableTitle}>Fiche de Stock — Réconciliation par article</Text>
                  <Text style={s.tableSub}>Initial + Entrées − Sorties = Stock Final</Text>
                </View>
                <View style={s.movementFilters}>
                  <View style={s.movementFilterItem}>
                    <FormSelect
                      label="Section"
                      value={stockSectionFilter}
                      options={stockSectionOptions}
                      onSelect={(v) => setStockSectionFilter(v)}
                    />
                  </View>
                  <View style={s.movementFilterItem}>
                    <FormSelect
                      label="Type article"
                      value={stockArticleTypeFilter}
                      options={articleTypeOptions}
                      onSelect={(v) => setStockArticleTypeFilter(v)}
                    />
                  </View>
                  <View style={s.movementFilterItem}>
                    <FormSelect
                      label="Exporter"
                      value=""
                      options={[
                        { label: 'Format CSV', value: 'csv' },
                        { label: 'Format Excel', value: 'xlsx' },
                      ]}
                      onSelect={(v) => {
                        if (v === 'csv' || v === 'xlsx') handleExportStockCard(v);
                      }}
                      placeholder="Choisir le format..."
                    />
                  </View>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ minWidth: 820 }}>
                  <View
                    style={[
                      s.tr,
                      {
                        backgroundColor: '#F8F9FA',
                        borderBottomWidth: 2,
                        borderBottomColor: '#E9ECEF',
                      },
                    ]}
                  >
                    <Text
                      style={[s.thText, { flex: 1, minWidth: 70, textAlign: 'left', fontSize: 10 }]}
                    >
                      Code
                    </Text>
                    <Text
                      style={[
                        s.thText,
                        { flex: 2, minWidth: 140, textAlign: 'left', fontSize: 10 },
                      ]}
                    >
                      Article
                    </Text>
                    <Text
                      style={[s.thText, { flex: 1, minWidth: 70, textAlign: 'left', fontSize: 10 }]}
                    >
                      Type
                    </Text>
                    <Text
                      style={[
                        s.thText,
                        { flex: 1.2, minWidth: 80, textAlign: 'right', fontSize: 10 },
                      ]}
                    >
                      Initial
                    </Text>
                    <Text
                      style={[
                        s.thText,
                        { flex: 1.2, minWidth: 80, textAlign: 'right', fontSize: 10 },
                      ]}
                    >
                      Entrées
                    </Text>
                    <Text
                      style={[
                        s.thText,
                        { flex: 1.2, minWidth: 80, textAlign: 'right', fontSize: 10 },
                      ]}
                    >
                      Sorties
                    </Text>
                    <Text
                      style={[
                        s.thText,
                        { flex: 1.5, minWidth: 100, textAlign: 'right', fontSize: 10 },
                      ]}
                    >
                      Stock Final
                    </Text>
                  </View>
                  {filteredStockCard.map((row: any) => {
                    const ecart = row.qty_current_lots - row.qty_final_calcule;
                    const stockFinalCalcule = Number(row.qty_final_calcule);
                    return (
                      <View key={row.article_id} style={[s.tr]}>
                        <Text
                          style={[
                            s.tdCode,
                            { flex: 1, minWidth: 70, textAlign: 'left', fontSize: 11 },
                          ]}
                        >
                          {row.code}
                        </Text>
                        <Text
                          style={[
                            s.tdArticle,
                            {
                              flex: 2,
                              minWidth: 140,
                              textAlign: 'left',
                              marginTop: 0,
                              fontSize: 11,
                            },
                          ]}
                        >
                          {row.name}
                        </Text>
                        <Text
                          style={[
                            s.tdCode,
                            { flex: 1, minWidth: 70, textAlign: 'left', fontSize: 11 },
                          ]}
                        >
                          {row.article_type}
                        </Text>
                        <Text
                          style={[
                            s.tdQty,
                            { flex: 1.2, minWidth: 80, textAlign: 'right', fontSize: 11 },
                          ]}
                        >
                          {Number(row.qty_initial).toFixed(2)} {row.unit}
                        </Text>
                        <Text
                          style={[
                            s.tdQty,
                            {
                              flex: 1.2,
                              minWidth: 80,
                              textAlign: 'right',
                              color: '#059669',
                              fontSize: 11,
                            },
                          ]}
                        >
                          +{Number(row.qty_entrees).toFixed(2)} {row.unit}
                        </Text>
                        <Text
                          style={[
                            s.tdQty,
                            {
                              flex: 1.2,
                              minWidth: 80,
                              textAlign: 'right',
                              color: '#DC2626',
                              fontSize: 11,
                            },
                          ]}
                        >
                          -{Number(row.qty_sorties).toFixed(2)} {row.unit}
                        </Text>
                        <Text
                          style={[
                            s.tdQty,
                            {
                              flex: 1.5,
                              minWidth: 100,
                              textAlign: 'right',
                              fontWeight: '800',
                              color: stockFinalCalcule >= 0 ? '#1D4ED8' : '#DC2626',
                              fontSize: 11,
                            },
                          ]}
                        >
                          {stockFinalCalcule.toFixed(2)} {row.unit}
                        </Text>
                      </View>
                    );
                  })}
                  {(stockCard as any[]).length === 0 && (
                    <View style={s.empty}>
                      <MaterialCommunityIcons name="table-off" size={36} color="#CBD5E1" />
                      <Text style={s.emptyText}>
                        Aucune donnée de stock card. Vérifiez la vue v_stock_card.
                      </Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            </View>

            {/* Historique des mouvements */}
            <View style={[s.tableCard, { marginTop: 16 }]}>
              <View style={[s.tableHeader, s.movementHeader]}>
                <View>
                  <Text style={s.tableTitle}>Historique des mouvements</Text>
                  <Text style={s.tableSub}>100 derniers mouvements enregistrés</Text>
                </View>
                <View style={s.movementFilters}>
                  <View style={s.movementFilterItem}>
                    <FormDatePicker label="Du" value={startDate} onChangeDate={setStartDate} />
                  </View>
                  <View style={s.movementFilterItem}>
                    <FormDatePicker label="Au" value={endDate} onChangeDate={setEndDate} />
                  </View>
                  <View style={s.movementFilterItem}>
                    <FormSelect
                      label="Section"
                      value={movSectionFilter}
                      options={stockSectionOptions}
                      onSelect={(v) => setMovSectionFilter(v)}
                    />
                  </View>
                  <View style={s.movementFilterItem}>
                    <FormSelect
                      label="Type article"
                      value={movArticleTypeFilter}
                      options={articleTypeOptions}
                      onSelect={(v) => setMovArticleTypeFilter(v)}
                    />
                  </View>
                  <View style={s.movementFilterItem}>
                    <FormSelect
                      label="Exporter"
                      value=""
                      options={[
                        { label: 'Format CSV', value: 'csv' },
                        { label: 'Format Excel', value: 'xlsx' },
                      ]}
                      onSelect={(v) => {
                        if (v === 'csv' || v === 'xlsx') handleExportMovements(v);
                      }}
                      placeholder="Choisir le format..."
                    />
                  </View>
                  {movementsLoading && <ActivityIndicator size="small" color="#2563EB" />}
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ minWidth: 820 }}>
                  <View
                    style={[
                      s.tr,
                      {
                        backgroundColor: '#F8F9FA',
                        borderBottomWidth: 2,
                        borderBottomColor: '#E9ECEF',
                      },
                    ]}
                  >
                    <Text
                      style={[s.thText, { flex: 1, minWidth: 70, textAlign: 'left', fontSize: 10 }]}
                    >
                      Date
                    </Text>
                    <Text
                      style={[
                        s.thText,
                        { flex: 2, minWidth: 140, textAlign: 'left', fontSize: 10 },
                      ]}
                    >
                      Article
                    </Text>
                    <Text
                      style={[s.thText, { flex: 1, minWidth: 70, textAlign: 'left', fontSize: 10 }]}
                    >
                      Lot
                    </Text>
                    <Text
                      style={[
                        s.thText,
                        { flex: 1.2, minWidth: 100, textAlign: 'left', fontSize: 10 },
                      ]}
                    >
                      Type
                    </Text>
                    <Text
                      style={[
                        s.thText,
                        {
                          flex: 1,
                          minWidth: 80,
                          textAlign: 'right',
                          paddingRight: 16,
                          fontSize: 10,
                        },
                      ]}
                    >
                      Qté
                    </Text>
                    <Text
                      style={[
                        s.thText,
                        {
                          flex: 1.5,
                          minWidth: 100,
                          textAlign: 'left',
                          paddingLeft: 8,
                          fontSize: 10,
                        },
                      ]}
                    >
                      Référence
                    </Text>
                    <Text
                      style={[
                        s.thText,
                        { flex: 2, minWidth: 120, textAlign: 'left', fontSize: 10 },
                      ]}
                    >
                      Notes
                    </Text>
                  </View>
                  {filteredStockMovements.map((mv: any) => {
                    const isEntree = ['ENTREE', 'AJUSTEMENT_POS', 'LIBERATION'].includes(
                      mv.movement_type,
                    );
                    const isSortie = [
                      'SORTIE',
                      'CONSOMMATION',
                      'AJUSTEMENT_NEG',
                      'SORTIE_PROD',
                    ].includes(mv.movement_type);
                    return (
                      <View
                        key={mv.id}
                        style={[
                          s.movementRow,
                          isEntree && { backgroundColor: '#F0FDF4' },
                          isSortie && { backgroundColor: '#FEF2F2' },
                        ]}
                      >
                        <Text
                          style={[
                            s.tdCode,
                            { flex: 1, minWidth: 70, textAlign: 'left', fontSize: 10 },
                          ]}
                        >
                          {new Date(mv.created_at).toLocaleDateString('fr-FR')}
                        </Text>
                        <Text
                          style={[
                            s.tdArticle,
                            {
                              flex: 2,
                              minWidth: 140,
                              textAlign: 'left',
                              marginTop: 0,
                              fontSize: 11,
                            },
                          ]}
                        >
                          {mv.article?.code} — {mv.article?.name}
                        </Text>
                        <Text
                          style={[
                            s.tdCode,
                            { flex: 1, minWidth: 70, textAlign: 'left', fontSize: 11 },
                          ]}
                        >
                          {mv.lot?.code ?? '—'}
                        </Text>
                        <View
                          style={[
                            s.typeCell,
                            { flex: 1.2, minWidth: 100, justifyContent: 'flex-start' },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={
                              isEntree
                                ? 'arrow-down-circle'
                                : isSortie
                                  ? 'arrow-up-circle'
                                  : 'swap-horizontal'
                            }
                            size={14}
                            color={isEntree ? '#059669' : isSortie ? '#DC2626' : '#6B7280'}
                          />
                          <Text
                            style={{
                              fontSize: 10,
                              color: isEntree ? '#059669' : isSortie ? '#DC2626' : '#6B7280',
                              fontWeight: '700',
                            }}
                          >
                            {String(mv.movement_type).replace(/_/g, ' ')}
                          </Text>
                        </View>
                        <Text
                          style={[
                            s.tdQty,
                            {
                              flex: 1,
                              minWidth: 80,
                              textAlign: 'right',
                              paddingRight: 16,
                              color: isEntree ? '#059669' : isSortie ? '#DC2626' : '#374151',
                              fontWeight: '700',
                              fontSize: 11,
                            },
                          ]}
                        >
                          {isEntree ? '+' : isSortie ? '-' : ''}
                          {Number(mv.qty).toFixed(2)} {mv.unit}
                        </Text>
                        <Text
                          style={[
                            s.tdCode,
                            {
                              flex: 1.5,
                              minWidth: 100,
                              textAlign: 'left',
                              paddingLeft: 8,
                              fontSize: 10,
                              color: '#6B7280',
                            },
                          ]}
                        >
                          {mv.reference_doc ?? '—'}
                        </Text>
                        <Text
                          style={[
                            s.tdArticle,
                            {
                              flex: 2,
                              minWidth: 120,
                              textAlign: 'left',
                              fontSize: 10,
                              color: '#6B7280',
                              marginTop: 0,
                            },
                          ]}
                        >
                          {mv.notes ?? '—'}
                        </Text>
                      </View>
                    );
                  })}
                  {filteredStockMovements.length === 0 && !movementsLoading && (
                    <View style={s.empty}>
                      <MaterialCommunityIcons name="swap-horizontal" size={36} color="#CBD5E1" />
                      <Text style={s.emptyText}>Aucun mouvement enregistré.</Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            </View>
          </View>
        )}
        {activeTab === 'emballages' && (
          <View style={{ padding: 24 }}>
            <View style={s.tableCard}>
              <View style={s.tableHeader}>
                <Text style={s.tableTitle}>Emballages & Consommables</Text>
                <Text style={s.tableSub}>Stocks EMB_CONS — étiquettes, films, cartons, flacons</Text>
              </View>
            {/* Header row */}
            <View style={[s.tr, { backgroundColor: '#F8F9FA' }]}>
              <Text style={[s.thText, { flex: 1.5 }]}>CODE</Text>
              <Text style={[s.thText, { flex: 3 }]}>DÉSIGNATION</Text>
              <Text style={[s.thText, { flex: 1.5 }]}>SOUS-TYPE</Text>
              <Text style={[s.thText, { flex: 1.5, textAlign: 'right' }]}>STOCK / UNITÉ</Text>
              <Text style={[s.thText, { flex: 1.2, textAlign: 'center' }]}>STATUT</Text>
              <Text style={[s.thText, { flex: 1.2, textAlign: 'center' }]}>ACTIONS</Text>
            </View>
            {emballages.length === 0 ? (
              <View style={s.empty}>
                <MaterialCommunityIcons name="package-variant-closed" size={36} color="#CBD5E1" />
                <Text style={s.emptyText}>
                  Aucun emballage/consommable.{'\n'}Ajoutez des articles via le bouton +.
                </Text>
              </View>
            ) : (
              emballages.map((emb: any) => {
                const qty = parseFloat(emb.quantite_actuelle) || 0;
                const qtyMin = parseFloat(emb.quantite_min) || 0;
                const isCritical = qty === 0;
                const isWarning = qty > 0 && qtyMin > 0 && qty <= qtyMin;
                const statusColor = isCritical ? '#DC3545' : isWarning ? '#FFC107' : '#28A745';
                const statusLabel = isCritical ? 'CRITIQUE' : isWarning ? 'SEUIL' : 'OK';
                return (
                  <View
                    key={emb.id}
                    style={[s.tr, { borderLeftWidth: 3, borderLeftColor: statusColor }]}
                  >
                    <Text style={[s.tdCode, { flex: 1.5 }]}>{emb.code}</Text>
                    <View style={{ flex: 3 }}>
                      <Text style={s.tdArticle}>{emb.nom}</Text>
                      {emb.description ? (
                        <Text style={{ fontSize: 11, color: '#94A3B8' }}>{emb.description}</Text>
                      ) : null}
                    </View>
                    <Text style={[s.tdCode, { flex: 1.5, color: '#6C757D' }]}>
                      {emb.sous_categorie || '—'}
                    </Text>
                    <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
                      <Text style={[s.tdQty, { textAlign: 'right' }]}>
                        {qty.toLocaleString()}{' '}
                        <Text style={{ fontSize: 10, fontWeight: '400', color: '#94A3B8' }}>
                          {emb.unite}
                        </Text>
                      </Text>
                    </View>
                    <View style={{ flex: 1.2, alignItems: 'center' }}>
                      <View style={[s.classBadge, { backgroundColor: statusColor + '20' }]}>
                        <Text style={[s.classBadgeText, { color: statusColor }]}>
                          {statusLabel}
                        </Text>
                      </View>
                    </View>
                    {/* Boutons actions */}
                    <View style={{ flex: 1.2, flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => handleEditEmb(emb)}
                        style={{ padding: 6, borderRadius: 6, backgroundColor: '#EFF6FF' }}
                      >
                        <MaterialCommunityIcons name="pencil" size={16} color="#3B82F6" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDeleteEmb(emb)}
                        style={{ padding: 6, borderRadius: 6, backgroundColor: '#FEF2F2' }}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={16} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </View>
        )}
      </ScrollView>

      {/* ── Modal édition Emballage/Consommable ── */}
      <FormModal
        visible={embModalVisible}
        title={embEditId ? 'Modifier Emballage/Consommable' : 'Nouvel Emballage/Consommable'}
        onClose={() => { setEmbModalVisible(false); setEmbEditId(null); }}
        onSave={handleSaveEmb}
      >
        <FormInput
          label="Désignation"
          value={embFormData.nom ?? ''}
          onChangeText={(v) => setEmbFormData({ ...embFormData, nom: v })}
        />
        <FormInput
          label="Sous-catégorie"
          value={embFormData.sous_categorie ?? ''}
          onChangeText={(v) => setEmbFormData({ ...embFormData, sous_categorie: v })}
        />
        <FormInput
          label="Quantité actuelle"
          value={embFormData.quantite_actuelle ?? ''}
          onChangeText={(v) => setEmbFormData({ ...embFormData, quantite_actuelle: v })}
          keyboardType="numeric"
        />
        <FormInput
          label="Quantité minimum"
          value={embFormData.quantite_min ?? ''}
          onChangeText={(v) => setEmbFormData({ ...embFormData, quantite_min: v })}
          keyboardType="numeric"
        />
        <FormSelect
          label="Unité"
          value={embFormData.unite ?? 'UNITE'}
          options={[
            { label: 'Unité', value: 'UNITE' },
            { label: 'Kg', value: 'KG' },
            { label: 'Litre', value: 'LITRE' },
            { label: 'Mètre', value: 'METRE' },
          ]}
          onSelect={(v) => setEmbFormData({ ...embFormData, unite: v })}
        />
        <FormInput
          label="Coût unitaire (MGA)"
          value={embFormData.cout_unitaire ?? ''}
          onChangeText={(v) => setEmbFormData({ ...embFormData, cout_unitaire: v })}
          keyboardType="numeric"
        />
        <FormInput
          label="Localisation"
          value={embFormData.localisation ?? ''}
          onChangeText={(v) => setEmbFormData({ ...embFormData, localisation: v })}
        />
      </FormModal>

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
          options={scopedLots
            .map((l) => ({
              label: `${l.code} - ${l.article?.name} (${l.qty_current} ${l.unit})`,
              value: l.id,
            }))}
          onSelect={(v) => setFormData({ ...formData, lot_id: v })}
        />
        <FormSelect
          label="Dépôt de destination"
          value={formData.depot_to_id ?? ''}
          options={depots.map((d) => ({ label: d.name, value: d.id }))}
          onSelect={(v) => setFormData({ ...formData, depot_to_id: v })}
        />
        <FormInput
          label="Quantité"
          value={formData.qty ?? ''}
          onChangeText={(val) => setFormData({ ...formData, qty: val })}
          keyboardType="numeric"
        />
        <FormInput
          label="Référence document"
          value={formData.reference_doc ?? ''}
          editable={false}
          style={{ backgroundColor: '#F1F3F5', color: '#6C757D' }}
        />
        <FormInput
          label="Notes"
          value={formData.notes ?? ''}
          onChangeText={(val) => setFormData({ ...formData, notes: val })}
        />
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
          options={scopedLots
            .map((l) => ({
              label: `${l.code} - ${l.article?.name} (${l.qty_current} ${l.unit})`,
              value: l.id,
            }))}
          onSelect={(v) => setAdjFormData({ ...adjFormData, lot_id: v })}
        />
        <FormSelect
          label="Type d'ajustement"
          value={adjFormData.movement_type ?? ''}
          options={[
            { label: 'Ajustement Positif (+)', value: 'AJUSTEMENT_POS' },
            { label: 'Ajustement Négatif (-)', value: 'AJUSTEMENT_NEG' },
          ]}
          onSelect={(v) => setAdjFormData({ ...adjFormData, movement_type: v })}
        />
        {adjFormData.movement_type === 'AJUSTEMENT_NEG' && (
          <>
            <FormSelect
              label="Sortie"
              value={adjFormData.sortie_reason ?? ''}
              options={sortieReasonOptions}
              onSelect={(v) => setAdjFormData({ ...adjFormData, sortie_reason: v })}
            />
            {adjFormData.sortie_reason === 'Autre' && (
              <FormInput
                label="Préciser le motif"
                value={adjFormData.sortie_reason_custom ?? ''}
                onChangeText={(val) =>
                  setAdjFormData({ ...adjFormData, sortie_reason_custom: val })
                }
                placeholder="Saisir un autre motif de sortie"
              />
            )}
          </>
        )}
        <FormInput
          label="Quantité (Valeur absolue)"
          value={adjFormData.qty ?? ''}
          onChangeText={(val) => setAdjFormData({ ...adjFormData, qty: val })}
          keyboardType="numeric"
        />
        <FormInput
          label="Référence document"
          value={adjFormData.reference_doc ?? ''}
          editable={false}
          style={{ backgroundColor: '#F1F3F5', color: '#6C757D' }}
        />
        <FormInput
          label="Motif d'ajustement"
          value={adjFormData.notes ?? ''}
          onChangeText={(val) => setAdjFormData({ ...adjFormData, notes: val })}
          placeholder="ex: Erreur de saisie, casse..."
        />
      </FormModal>

      {/* ── Modal: Bon de Sortie dédié ─────────────────────────────────── */}
      <FormModal
        visible={sortieModalVisible}
        title="📋 Bon de Sortie"
        onClose={() => setSortieModalVisible(false)}
        onSave={handleSaveSortie}
        loading={mutation.isPending}
      >
        {/* Info lot si pré-sélectionné */}
        {sortieFormData._lot ? (
          <View
            style={{
              padding: 12,
              backgroundColor: '#F0FDF4',
              borderRadius: 8,
              marginBottom: 14,
              borderWidth: 1,
              borderColor: '#86EFAC',
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#6B7280', letterSpacing: 1 }}>
              ARTICLE / LOT
            </Text>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#1A1A1A', marginTop: 4 }}>
              {sortieFormData._lot?.article?.name}
            </Text>
            <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
              {sortieFormData._lot?.article?.code} · {sortieFormData._lot?.code}
            </Text>
            <Text style={{ fontSize: 12, color: '#1A1A1A', marginTop: 6 }}>
              Stock actuel :{' '}
              <Text style={{ fontWeight: '800', color: '#059669' }}>
                {sortieFormData._lot?.qty_current?.toLocaleString()} {sortieFormData._lot?.unit}
              </Text>
            </Text>
          </View>
        ) : (
          <>
            {/* Filtre type article */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {(['ALL', 'MP', 'EMB', 'PF'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setSortieTypeFilter(t)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                    borderRadius: 20,
                    backgroundColor: sortieTypeFilter === t ? '#1E3A5F' : '#F1F5F9',
                    borderWidth: 1,
                    borderColor: sortieTypeFilter === t ? '#1E3A5F' : '#E2E8F0',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: sortieTypeFilter === t ? '#FFF' : '#64748B' }}>
                    {t === 'ALL' ? 'Tout' : t === 'MP' ? 'Matière Première' : t === 'EMB' ? 'Emballage' : 'Produit Fini'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <FormSelect
              label="Lot à sortir *"
              value={sortieFormData.lot_id ?? ''}
              options={scopedLots
                .filter((l) => sortieTypeFilter === 'ALL' || l.article?.article_type === sortieTypeFilter)
                .map((l) => ({
                  label: `${l.code} - ${l.article?.name} (${l.qty_current} ${l.unit})`,
                  value: l.id,
                }))}
              onSelect={(v) => {
                const lot = lots.find((l) => l.id === v);
                setSortieFormData({ ...sortieFormData, lot_id: v, _lot: lot });
              }}
            />
          </>
        )}

        <FormInput
          label="Quantité à sortir *"
          value={sortieFormData.qty ?? ''}
          onChangeText={(val) => setSortieFormData({ ...sortieFormData, qty: val })}
          keyboardType="numeric"
          placeholder={`max. ${sortieFormData._lot?.qty_current ?? ''} ${sortieFormData._lot?.unit ?? ''}`}
        />

        <FormSelect
          label="Motif de sortie *"
          value={sortieFormData.sortie_reason ?? ''}
          options={sortieReasonOptions}
          onSelect={(v) => setSortieFormData({ ...sortieFormData, sortie_reason: v })}
        />

        {sortieFormData.sortie_reason === 'Autre' && (
          <FormInput
            label="Préciser le motif"
            value={sortieFormData.sortie_reason_custom ?? ''}
            onChangeText={(val) =>
              setSortieFormData({ ...sortieFormData, sortie_reason_custom: val })
            }
            placeholder="Saisir le motif de sortie"
          />
        )}

        <FormInput
          label="Observations (optionnel)"
          value={sortieFormData.notes ?? ''}
          onChangeText={(val) => setSortieFormData({ ...sortieFormData, notes: val })}
          placeholder="ex: N° commande, nom client, déstination…"
        />

        <FormInput
          label="Référence bon de sortie"
          value={sortieFormData.reference_doc ?? ''}
          editable={false}
          style={{ backgroundColor: '#F1F3F5', color: '#6C757D' }}
        />
      </FormModal>

      <FormModal
        visible={threshModalVisible}
        title="Configurer les seuils de stock"
        onClose={() => {
          setThreshModalVisible(false);
          setThreshTypeFilter('ALL');
          setThreshCategFilter('ALL');
          setThreshSearch('');
        }}
        onSave={() => {
          if (!threshFormData.article_id) return;
          thresholdMutation.mutate(
            {
              articleId: threshFormData.article_id,
              safety_stock: parseFloat(threshFormData.safety_stock) || 0,
              reorder_point: parseFloat(threshFormData.reorder_point) || 0,
            },
            {
              onSuccess: () => {
                setThreshModalVisible(false);
                setThreshTypeFilter('ALL');
                setThreshCategFilter('ALL');
                setThreshSearch('');
              },
            },
          );
        }}
        loading={thresholdMutation.isPending}
      >
        {/* ── Filtre Type PF / MP ── */}
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#495057', marginBottom: 6 }}>
            Type d'article
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['ALL', 'PF', 'MP'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => {
                  setThreshTypeFilter(t);
                  setThreshCategFilter('ALL');
                  setThreshFormData({});
                }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 20,
                  backgroundColor: threshTypeFilter === t ? '#1A73E8' : '#F1F3F5',
                  borderWidth: 1,
                  borderColor: threshTypeFilter === t ? '#1A73E8' : '#DEE2E6',
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: threshTypeFilter === t ? '#FFF' : '#495057',
                  }}
                >
                  {t === 'ALL' ? 'Tous' : t === 'PF' ? 'Produit Fini' : 'Matière Première'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Sous-catégories PF ── */}
        {threshTypeFilter === 'PF' && (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#495057', marginBottom: 6 }}>
              Catégorie
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {[{ key: 'ALL', label: 'Toutes', prefixes: [] as string[] }, ...PF_CATEGORIES].map((cat) => (
                <TouchableOpacity
                  key={cat.key}
                  onPress={() => {
                    setThreshCategFilter(cat.key);
                    setThreshFormData({});
                  }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                    borderRadius: 16,
                    backgroundColor: threshCategFilter === cat.key ? '#0D6E47' : '#F1F3F5',
                    borderWidth: 1,
                    borderColor: threshCategFilter === cat.key ? '#0D6E47' : '#DEE2E6',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: threshCategFilter === cat.key ? '#FFF' : '#495057',
                    }}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Champ de recherche ── */}
        <View style={{ marginBottom: 12 }}>
          <TextInput
            placeholder="🔍  Rechercher par code ou nom..."
            value={threshSearch}
            onChangeText={(v) => {
              setThreshSearch(v);
              setThreshFormData({});
            }}
            style={{
              borderWidth: 1,
              borderColor: '#DEE2E6',
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 8,
              fontSize: 13,
              backgroundColor: '#F8F9FA',
              color: '#212529',
            }}
            placeholderTextColor="#ADB5BD"
          />
        </View>

        {/* ── Sélecteur d'article filtré ── */}
        <FormSelect
          label={`Article (${threshArticles.length} résultat${threshArticles.length > 1 ? 's' : ''})`}
          value={threshFormData.article_id ?? ''}
          options={threshArticles.map((a) => ({
            label: `${a.code} - ${a.name}`,
            value: a.id,
          }))}
          onSelect={(v) => {
            const article = articles.find((a) => a.id === v);
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
          onChangeText={(val) => setThreshFormData({ ...threshFormData, safety_stock: val })}
          keyboardType="numeric"
          placeholder="Quantité minimale avant alerte"
        />
        <FormInput
          label="Point de réappro (reorder_point)"
          value={threshFormData.reorder_point ?? ''}
          onChangeText={(val) => setThreshFormData({ ...threshFormData, reorder_point: val })}
          keyboardType="numeric"
          placeholder="Quantité déclenchant un réappro urgent"
        />
      </FormModal>
      <ScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScan={(data) => {
          setSearchQuery(data);
          setActiveTab('lots');
        }}
      />
      {/* ── Triple Signature BT/BS ── */}
      {sigMovementId && (
        <BonSignatureModal
          visible={sigModalVisible}
          onClose={() => setSigModalVisible(false)}
          movementId={sigMovementId}
          movementRef={sigMovementRef}
          movementType={sigMovementType}
          onComplete={() => setSigModalVisible(false)}
        />
      )}
    </AnimatedPage>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 24 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },
  subTitle: { fontSize: 13, color: '#6C757D', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 12 },
  mainGrid: { flexDirection: 'row', gap: 24 },
  leftCol: { width: 320, flexShrink: 0 },
  rightCol: { flex: 1, minWidth: 0 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ADB5BD',
    letterSpacing: 1,
    marginBottom: 12,
  },
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
  tableCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    overflow: 'hidden',
  },
  tableHeader: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#F8F9FA' },
  movementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    flexWrap: 'wrap',
  },
  movementFilters: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  movementFilterItem: { minWidth: 180, flex: 1, maxWidth: 240 },
  tableTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  tableSub: { fontSize: 12, color: '#6C757D', marginTop: 2 },
  tr: {
    flexDirection: 'row',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F9FA',
    alignItems: 'flex-start',
  },
  movementRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F9FA',
    alignItems: 'flex-start',
  },
  tdCell: { flexShrink: 0 },
  tdWrap: { flex: 1, flexWrap: 'wrap', marginTop: 2 },
  typeCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    marginTop: 2,
  },
  tdCode: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ADB5BD',
    fontFamily: Platform.OS === 'web' ? 'Menlo' : 'monospace',
  },
  tdArticle: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', marginTop: 2 },
  tdLot: { fontSize: 11, color: '#6C757D', marginTop: 2 },
  tdQty: { fontSize: 14, fontWeight: '800', color: '#1A1A1A' },
  miniBadge: {
    backgroundColor: '#FFF3CD',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  miniBadgeText: { fontSize: 9, fontWeight: '800', color: '#856404' },
  miniBadgeCritical: {
    backgroundColor: '#FDEAEA',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  miniBadgeCriticalText: { fontSize: 9, fontWeight: '800', color: '#DC3545' },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFC107',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  alertBannerCritical: { backgroundColor: '#DC3545' },
  alertBannerText: { color: '#FFF', fontWeight: '700', fontSize: 13, flex: 1 },
  // Tab styles
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
    paddingBottom: 12,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
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
  thText: { fontSize: 10, fontWeight: '800', color: '#ADB5BD', letterSpacing: 1, flexWrap: 'wrap' },
  progressContainer: {
    height: 8,
    backgroundColor: '#F1F3F5',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 6,
  },
  progressBar: { height: '100%', borderRadius: 4 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: '#6C757D', marginTop: 8 },
});
