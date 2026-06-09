import * as React from 'react';
import { ScrollView, StyleSheet, Text, View, Platform, TouchableOpacity, useWindowDimensions, ActivityIndicator, Alert, Modal, TextInput, FlatList } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, KpiCard, ActionButton, Badge, FormModal, FormInput, FormSelect, FormDatePicker, SectionTitle, ExportOverlay, DataTable, AnimatedPage, PaginationControls } from '../components/Ui';
import { useBoms, useBomLines, usePFWithBom, useBomLinesForProduct, useProductionOrders, useUserProfile, useMutation, useArticles, usePermissions, useLots, useForecasts, useSaveForecasts, useNotification, useTRS, confirmAction } from '../lib/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation, translateProductName } from '../lib/i18n';
import { Article, BomHeader, BomLine, Lot } from '../lib/database.types';
import type { WorkBook } from 'xlsx';
import { generatePdf, getPdfTemplate } from '../lib/pdf';
import { supabase, getNextCode } from '../lib/supabase';
import * as XLSX from 'xlsx';

// ─── Local types ─────────────────────────────────────────────────────────────
type ProductionOrderStatus = 'PLANIFIE' | 'EN_COURS' | 'ARRETE' | 'TERMINE' | 'CLOTURE';

type ProductionOrder = {
  id: string;
  code: string;
  product_id: string | null;
  qty_planned: number;
  qty_produced: number | null;
  status: ProductionOrderStatus;
  planned_date: string | null;
  started_at: string | null;
  finished_at: string | null;
  line_code: string | null;
  site_id: string | null;
  scope: string | null;
  bom_header_id: string | null;
  created_at: string;
  article?: Pick<Article, 'id' | 'code' | 'name' | 'name_en'> | null;
  product?: Pick<Article, 'id' | 'code' | 'name' | 'unit'> | null;
};

type ProductionStop = {
  id?: string;
  of_id: string;
  motif: string;
  raison: string;
  categorie: string;
  duree_min: number;
  declared_at?: string;
  started_at?: string;
};

type OfFormData = Partial<Pick<ProductionOrder, 'code' | 'product_id' | 'qty_planned' | 'planned_date' | 'line_code' | 'bom_header_id'>> & { id?: string; status?: string; qty_planned?: string | number };
type StopFormData = Partial<Omit<ProductionStop, 'id' | 'of_id'>>;
type CloseFormData = { qty_produced?: string | number; qty_rejected?: string | number; completed_at?: string; finished_at?: string; lot_id?: string };
type BomFormData = Partial<Pick<BomHeader, 'code' | 'product_id' | 'version' | 'status' | 'batch_size_kg' | 'notes'>> & { id?: string };
type BomLineFormData = Partial<Pick<BomLine, 'component_id' | 'qty' | 'unit' | 'scrap_pct' | 'sort_order'>> & { id?: string; bom_header_id?: string; pct?: string | number; sort_order?: string | number; qty?: string | number };
type WhatIfFormData = { product_id?: string; qty?: string; date?: string; month_offset?: string; demand_change?: string; cartons?: string; units_per_carton?: string; };




// ─── BomNode extracted as top-level component (Rules of Hooks) ──────────────
function BomNode({
  item,
  depth = 0,
  boms,
  canEdit = false,
  onQtyChange,
}: {
  item: BomLine;
  depth?: number;
  boms: BomHeader[];
  canEdit?: boolean;
  onQtyChange?: (lineId: string, newQty: number) => Promise<void>;
}) {
  const [expanded, setExpand] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [qtyDraft, setQtyDraft] = React.useState(String(item.qty));
  const [saving, setSaving] = React.useState(false);
  const subBom = boms.find((b: BomHeader) => b.product_id === item.component_id && b.status === 'VALIDE');
  const { data: subLines = [] } = useBomLines(expanded && subBom ? subBom.id : undefined);

  const handleQtySave = async () => {
    const parsed = parseFloat(qtyDraft.replace(',', '.'));
    if (isNaN(parsed) || parsed <= 0) {
      setQtyDraft(String(item.qty));
      setEditing(false);
      return;
    }
    if (parsed === item.qty) { setEditing(false); return; }
    setSaving(true);
    try {
      await onQtyChange?.(item.id, parsed);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const handleQtyCancel = () => {
    setQtyDraft(String(item.qty));
    setEditing(false);
  };

  return (
    <View style={{ marginLeft: depth * 16 }}>
      <View style={s.treeRow}>
        <TouchableOpacity
          style={s.treeToggle}
          onPress={() => setExpand(!expanded)}
          disabled={!subBom}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Réduire' : 'Développer'}
        >
          {subBom ? (
            <MaterialCommunityIcons
              name={expanded ? "chevron-down" : "chevron-right"}
              size={20}
              color={C.info}
            />
          ) : (
            <View style={{ width: 20 }} />
          )}
        </TouchableOpacity>

        <View style={s.nodeInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={s.nodeCode}>{item.component?.code}</Text>
            <Badge
              label={item.component?.article_type || ''}
              color={item.component?.article_type === 'MP' ? C.textMuted : C.info}
            />
          </View>
          <Text style={s.nodeName}>{item.component?.name}</Text>
        </View>

        {/* ── Quantité — affichage ou édition inline ── */}
        {editing ? (
          <View style={s.qtyEditRow}>
            <TextInput
              style={s.qtyInput}
              value={qtyDraft ?? ''}
              onChangeText={setQtyDraft}
              keyboardType="decimal-pad"
              autoFocus
              selectTextOnFocus
              onSubmitEditing={handleQtySave}
              accessibilityLabel="Nouvelle quantité"
            />
            <Text style={s.qtyUnit}>{item.unit}</Text>
            {saving ? (
              <ActivityIndicator size="small" color={C.ok} style={{ marginLeft: 4 }} />
            ) : (
              <>
                <TouchableOpacity
                  onPress={handleQtySave}
                  style={s.qtyActionBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Confirmer la quantité"
                >
                  <MaterialCommunityIcons name="check" size={18} color={C.ok} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleQtyCancel}
                  style={s.qtyActionBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Annuler"
                >
                  <MaterialCommunityIcons name="close" size={18} color={C.err} />
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => { if (canEdit) { setQtyDraft(String(item.qty)); setEditing(true); } }}
            disabled={!canEdit}
            style={[s.qtyDisplay, canEdit && s.qtyDisplayEditable]}
            accessibilityRole={canEdit ? "button" : "text"}
            accessibilityLabel={`${item.qty.toLocaleString()} ${item.unit}${canEdit ? ', appuyer pour modifier' : ''}`}
          >
            <Text style={s.nodeQty}>{item.qty.toLocaleString('fr-FR')} </Text>
            <Text style={[s.nodeQty, { color: C.textMuted, fontWeight: '400' }]}>{item.unit}</Text>
            {canEdit && (
              <MaterialCommunityIcons name="pencil-outline" size={13} color={C.textMuted} style={{ marginLeft: 4 }} />
            )}
          </TouchableOpacity>
        )}
      </View>

      {expanded && subLines.map(line => (
        <BomNode
          key={line.id}
          item={line}
          depth={depth + 1}
          boms={boms}
          canEdit={canEdit}
          onQtyChange={onQtyChange}
        />
      ))}
    </View>
  );
}

export function ProductionScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 992;
  const queryClient = useQueryClient();
  const notify = useNotification();
  const { t, lang } = useTranslation();
  const TABS = [t('pdp'), t('bom_tab')];

  const { profile } = useUserProfile();
  const scope = profile?.scope || 'ALL';
  const [activeTab, setActiveTab] = React.useState(TABS[0]);
  const [page, setPage] = React.useState(0);
  const limit = 20;

  const { data: boms = [], isPending: loadingBoms } = useBoms();
  const { data: orders = [], count: ordersCount, isPending: loadingOrders } = useProductionOrders(page, limit);
  // usePFWithBom : PF ayant au moins un BOM — synchronisé en temps réel (staleTime=0)
  const { data: pfWithBom = [] } = usePFWithBom();
  const { data: allArticles = [] } = useArticles(0, 2000); // Needed to map lines in BOM import
  const { data: lots = [] } = useLots(0, 500, 'LIBERE'); // Real stock
  const { canPerformAction } = usePermissions();

  const userLineCode = profile?.role === 'CHEF_LIGNE' ? (profile.line_code ?? undefined) : undefined;
  const isGlobalRole = ['ADMIN', 'DIR', 'RPROD'].includes(profile?.role || '');
  const { data: trsData } = useTRS(isGlobalRole ? undefined : userLineCode);
  const trsValue = trsData ? Math.round(trsData.trs * 100) : null;
  const trsLabel = trsData?.line_name || 'Global';

  // products = alias maintenu pour les parties du code qui l'utilisent encore (OF, export…)
  const products = pfWithBom;

  const getProductName = React.useCallback((article: Article) => {
    if (lang === 'EN') {
      return article.name_en ? article.name_en : translateProductName(article.name, lang);
    }
    return article.name;
  }, [lang]);

  const filterByScope = React.useCallback((articleName: string) => {
    if (scope === 'ALL') return true;
    const name = articleName.toLowerCase();
    if (scope === 'SAVON') return name.includes('savon') || name.includes('bondillon');
    if (scope === 'PH' || scope === 'SPAH') return name.includes('papier') || name.includes('doucy') || name.includes('serviette') || name.includes('spah') || name.includes('ouate');
    if (scope === 'BOUGIE_ENCAUSTIQUE' || scope === 'BOU_ENC') return name.includes('bougie') || name.includes('encaustique');
    if (scope === 'CORDE') return name.includes('corde') || name.includes('sisal') || name.includes('nylon');
    return true;
  }, [scope]);

  const filteredBoms = React.useMemo(() => boms.filter(b => {
    const product = allArticles.find(a => a.id === b.product_id);
    return product ? filterByScope(product.name) : true;
  }), [boms, allArticles, filterByScope]);

  const filteredOrders = React.useMemo(() => orders.filter(o => {
    const product = allArticles.find(a => a.id === o.product_id);
    return product ? filterByScope(product.name) : true;
  }), [orders, allArticles, filterByScope]);

  // filteredProducts : PF avec BOM filtrés par scope — source unique pour TOUS les dropdowns PF
  const filteredProducts = React.useMemo(
    () => pfWithBom.filter(p => filterByScope(p.name)),
    [pfWithBom, filterByScope]
  );

  const [selectedBom, setSelectedBom] = React.useState<BomHeader | null>(null);
  const { data: bomLines = [], isPending: bomLinesLoading } = useBomLines(selectedBom?.id);
  const [ofModalVisible, setOfModalVisible] = React.useState(false);
  const [ofFormData, setOfFormData] = React.useState<OfFormData>({});
  const [ofCategory, setOfCategory] = React.useState('');
  const [whatIfModalVisible, setWhatIfModalVisible] = React.useState(false);
  const [whatIfFormData, setWhatIfFormData] = React.useState<WhatIfFormData>({});
  const [whatIfResults, setWhatIfResults] = React.useState<Array<{ id?: any; code?: any; name?: any; type?: any; unit?: any; qty_bom?: any; article?: string; stock?: number; needs?: number; safety?: any; net?: number; action?: string; qty_required?: number; available?: number; shortage?: number }>>([]);
  const [whatIfCategory, setWhatIfCategory] = React.useState('');

  // Lignes BOM du PF sélectionné dans What-If — temps réel, avec quantités
  const { data: whatIfBomLines, bomHeader: whatIfBomHeader, isPending: whatIfBomLoading } =
    useBomLinesForProduct(whatIfFormData.product_id);
  const [bomModalVisible, setBomModalVisible] = React.useState(false);
  const [bomFormData, setBomFormData] = React.useState<BomFormData>({});
  const [bomLineModalVisible, setBomLineModalVisible] = React.useState(false);
  const [bomLineFormData, setBomLineFormData] = React.useState<BomLineFormData>({});

  const [importing, setImporting] = React.useState(false);
  const [importProgress, setImportProgress] = React.useState(0);

  // ─── Forecasts: stored in Supabase production_forecasts table ────────────────
  const { forecasts, isPending: forecastsLoading } = useForecasts();
  const { save: saveForecasts, remove: removeForecast, deleteYear } = useSaveForecasts();

  const [editingForecast, setEditingForecast] = React.useState<{ productId: string; month: string } | null>(null);
  const [importModalVisible, setImportModalVisible] = React.useState(false);
  const [importMode, setImportMode] = React.useState<'update' | 'replace'>('update');
  const [pdpPage, setPdpPage] = React.useState(0);
  const pdpLimit = 10;

  const mutation = useMutation('production_orders', () => { setOfModalVisible(false); });
  const bomMutation = useMutation('bom_headers');
  const bomLineMutation = useMutation('bom_lines');

  // ─── BOM Import Excel ──────────────────────────────────────────────────────
  const [bomImportModalVisible, setBomImportModalVisible] = React.useState(false);
  const [bomImportMode, setBomImportMode] = React.useState<'replace' | 'update'>('replace');
  const [bomImporting, setBomImporting] = React.useState(false);
  const [bomImportProgress, setBomImportProgress] = React.useState(0);
  const [bomImportLog, setBomImportLog] = React.useState<string[]>([]);

  // ─── Normalisation robuste des noms pour la comparaison ─────────────────────
  const normalizeStr = (s: string): string =>
    s.toLowerCase().trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const processBomWorkbook = async (workbook: WorkBook, sourceName: string) => {
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('Aucune feuille trouvée dans le fichier.');

    const rows: unknown[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    const nonEmpty = rows.filter(r => r.some((c) => c !== undefined && c !== null && String(c).trim() !== ''));
    if (nonEmpty.length < 2) throw new Error('Le fichier doit contenir un en-tête et des données.');

    const headerRow = nonEmpty[0];
    const pfNames: string[] = headerRow.slice(1).map((h) => String(h ?? '').trim()).filter(Boolean);
    if (pfNames.length === 0) throw new Error('Aucun produit fini trouvé dans la première ligne du fichier.');

    const logs: string[] = [`Import BOM depuis ${sourceName}`];
    let createdBoms = 0;
    let updatedBoms = 0;
    let skippedBoms = 0;

    setBomImportProgress(10);
    setBomImportLog([`Import de ${sourceName} en cours...`]);

    for (let pfIdx = 0; pfIdx < pfNames.length; pfIdx++) {
      const pfName = pfNames[pfIdx];
      const colIdx = pfIdx + 1;
      const pfNameNorm = normalizeStr(pfName);

      // Trouver l'article PF correspondant avec normalisation robuste
      const pfArticle = allArticles.find((a) => {
        const nameNorm = normalizeStr(a.name ?? '');
        const nameEnNorm = normalizeStr(a.name_en ?? '');
        return nameNorm === pfNameNorm ||
          nameEnNorm === pfNameNorm ||
          nameNorm.includes(pfNameNorm) ||
          pfNameNorm.includes(nameNorm);
      });

      if (!pfArticle) {
        logs.push(`Erreur: Produit non trouvé : "${pfName}" — ignoré`);
        skippedBoms++;
        continue;
      }

      const lines: { mpName: string; qty: number }[] = [];
      for (let rowIdx = 1; rowIdx < nonEmpty.length; rowIdx++) {
        const mpName = String(nonEmpty[rowIdx][0] ?? '').trim();
        if (!mpName) continue;
        const rawQty = nonEmpty[rowIdx][colIdx];
        const qty = typeof rawQty === 'number'
          ? rawQty
          : parseFloat(String(rawQty ?? '0').replace(/\s/g, '').replace(',', '.'));
        if (!isNaN(qty) && qty > 0) {
          lines.push({ mpName, qty });
        }
      }

      if (lines.length === 0) {
        logs.push(`Info: "${pfName}" — aucune MP avec quantité > 0, ignoré`);
        skippedBoms++;
        continue;
      }

      const existingBom = boms.find((b: BomHeader) => b.product_id === pfArticle.id);
      let bomId: string;

      if (existingBom && bomImportMode === 'update') {
        bomId = existingBom.id;
        await supabase!.from('bom_headers').update({ status: 'VALIDE' }).eq('id', bomId);
        updatedBoms++;
        logs.push(`Update: Mise à jour BOM : "${pfName}" (${lines.length} MP)`);
      } else if (existingBom && bomImportMode === 'replace') {
        bomId = existingBom.id;
        await supabase!.from('bom_lines').delete().eq('bom_header_id', bomId);
        await supabase!.from('bom_headers').update({ status: 'VALIDE' }).eq('id', bomId);
        updatedBoms++;
        logs.push(`Remplacement: BOM : "${pfName}" (${lines.length} MP)`);
      } else {
        const year = new Date().getFullYear();
        let code = `BOM-${year}-001`;
        try { code = await getNextCode('BOM', 'bom_headers', 'code'); } catch {}
        const { data: newBom, error: bomErr } = await supabase!
          .from('bom_headers')
          .insert({ code, product_id: pfArticle.id, version: 1, status: 'VALIDE', batch_size_kg: 1000 })
          .select()
          .single();
        if (bomErr || !newBom) {
          logs.push(`Erreur: Création BOM "${pfName}" : ${bomErr?.message}`);
          skippedBoms++;
          continue;
        }
        bomId = (newBom as { id: string }).id;
        createdBoms++;
        logs.push(`Nouveau BOM : "${pfName}" (${lines.length} MP)`);
      }

      let linesInserted = 0;
      let linesSkipped = 0;
      for (const line of lines) {
        const mpNameNorm = normalizeStr(line.mpName);
        // Priorité : chercher d'abord parmi les articles MP/EMB puis parmi tous
        const mpArticle =
          allArticles.find((a) => {
            if (a.article_type !== 'MP' && a.article_type !== 'EMB') return false;
            const n = normalizeStr(a.name ?? '');
            return n === mpNameNorm || n.includes(mpNameNorm) || mpNameNorm.includes(n);
          }) ||
          allArticles.find((a) => {
            const n = normalizeStr(a.name ?? '');
            return n === mpNameNorm || n.includes(mpNameNorm) || mpNameNorm.includes(n);
          });
        if (!mpArticle) {
          logs.push(`  Warning: MP non trouvée : "${line.mpName}" — ligne ignorée`);
          linesSkipped++;
          continue;
        }
        const { error: lineErr } = await supabase!.from('bom_lines').insert(
          { bom_header_id: bomId, component_id: mpArticle.id, qty: line.qty, unit: 'kg' }
        );
        if (lineErr) {
          logs.push(`  Erreur insertion "${line.mpName}" : ${lineErr.message}`);
        } else {
          linesInserted++;
        }
      }
      logs.push(`  OK: ${linesInserted} MP insérée(s)${linesSkipped > 0 ? `, ${linesSkipped} non trouvée(s)` : ''} pour "${pfName}"`);

      setBomImportProgress(10 + Math.round((pfIdx / pfNames.length) * 85));
    }

    setBomImportProgress(100);
    queryClient.invalidateQueries({ queryKey: ['bom_headers'] });
    queryClient.invalidateQueries({ queryKey: ['bom_lines'] });
    setBomImportLog([
      `Succès: Import terminé — ${createdBoms} créé(s), ${updatedBoms} mis à jour, ${skippedBoms} ignoré(s)`,
      ...logs,
    ]);
  };

  const handleImportBomFromPublic = async () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Non supporté', 'L\'import BOM depuis le dossier public est disponible seulement sur la version web.');
      return;
    }
    setBomImporting(true);
    setBomImportProgress(0);
    setBomImportLog([]);

    try {
      const response = await fetch('/BOM.xlsx');
      if (!response.ok) throw new Error('Impossible de charger /BOM.xlsx');
      const data = new Uint8Array(await response.arrayBuffer());
      const workbook = XLSX.read(data, { type: 'array' });
      await processBomWorkbook(workbook, 'BOM.xlsx');
    } catch (err: unknown) {
      setBomImportLog([`Erreur fatale : ${err instanceof Error ? err.message : String(err)}`]);
    } finally {
      setBomImporting(false);
    }
  };

  // ─── OF Actions: Démarrer / Arrêt / Clôturer ─────────────────────────────
  const [startingOrderId, setStartingOrderId] = React.useState<string | null>(null);
  const [stopModalVisible, setStopModalVisible] = React.useState(false);
  const [stopFormData, setStopFormData] = React.useState<StopFormData>({});
  const [stopTargetOrder, setStopTargetOrder] = React.useState<ProductionOrder | null>(null);
  const [closeModalVisible, setCloseModalVisible] = React.useState(false);
  const [closeFormData, setCloseFormData] = React.useState<CloseFormData>({});
  const [closeTargetOrder, setCloseTargetOrder] = React.useState<ProductionOrder | null>(null);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [expandedOrderId, setExpandedOrderId] = React.useState<string | null>(null);
  const [stopsMap, setStopsMap] = React.useState<Record<string, any[]>>({});
  const [stopsLoading, setStopsLoading] = React.useState<string | null>(null);



  const getScopePrefix = React.useCallback(() => {
    if (scope === 'SAVON') return 'SAV';
    if (scope === 'BOUGIE_ENCAUSTIQUE' || scope === 'BOU_ENC') return 'BOU';
    if (scope === 'CORDE') return 'COR';
    if (scope === 'PH' || scope === 'SPAH') return 'PH';
    return 'GEN';
  }, [scope]);

  const handleAdd = async () => {
    const year = new Date().getFullYear();
    const scopePrefix = getScopePrefix();
    let generatedCode = `OF-${scopePrefix}-${year}-PEND`;
    try {
      generatedCode = await getNextCode(`OF-${scopePrefix}`, 'production_orders', 'code');
    } catch {}
    
    setOfFormData({
      code: generatedCode,
      status: 'PLANIFIE',
      planned_date: new Date().toISOString().split('T')[0]
    });
    setOfModalVisible(true);
  };

  const handleEditOrder = (order: any) => {
    setOfFormData({
      id: order.id,
      code: order.code,
      product_id: order.product_id,
      bom_header_id: order.bom_header_id,
      qty_planned: String(order.qty_planned) as any,
      planned_date: order.planned_date,
      status: order.status,
    });
    setOfModalVisible(true);
  };

  const handleDeleteOrder = (order: any) => {
    confirmAction(
      'Supprimer l\'OF',
      `Supprimer définitivement l'OF ${order.code} ?`,
      () => mutation.mutate({ id: order.id, type: 'DELETE' })
    );
  };

  const handleAddBom = async () => {
    const year = new Date().getFullYear();
    let generatedCode = `BOM-${year}-XXX`;
    try {
      generatedCode = await getNextCode('BOM', 'bom_headers', 'code');
    } catch {}
    setBomFormData({ code: generatedCode, version: 1, status: 'BROUILLON' });
    setBomModalVisible(true);
  };

  const handleEditBom = (bom: BomHeader) => {
    setBomFormData({ ...bom });
    setBomModalVisible(true);
  };

  const handleSaveBom = () => {
    if (!bomFormData.code || !bomFormData.product_id) return;
    const isUpdate = !!bomFormData.id;
    bomMutation.mutate({
      id: bomFormData.id,
      values: {
        code: bomFormData.code,
        version: parseInt(String(bomFormData.version)) || 1,
        product_id: bomFormData.product_id,
        batch_size_kg: parseFloat(String(bomFormData.batch_size_kg || 0)),
        status: bomFormData.status || 'BROUILLON',
        notes: bomFormData.notes,
      },
      type: isUpdate ? 'UPDATE' : 'INSERT',
    });
    setBomModalVisible(false);
  };

  const handleValidateBom = () => {
    if (!selectedBom) return;
    bomMutation.mutate({
      id: selectedBom.id,
      values: { status: 'VALIDE', validated_at: new Date().toISOString() },
      type: 'UPDATE',
    });
  };

  const handleAddBomLine = () => {
    setBomLineFormData({ bom_header_id: selectedBom?.id, unit: 'kg', sort_order: bomLines.length + 1 });
    setBomLineModalVisible(true);
  };

  const handleEditBomLine = (line: any) => {
    setBomLineFormData({
      id: line.id,
      bom_header_id: line.bom_header_id,
      component_id: line.component_id,
      qty: String(line.qty) as any,
      unit: line.unit || 'kg',
      pct: line.pct != null ? String(line.pct) : '',
      sort_order: String(line.sort_order ?? 0) as any,
    });
    setBomLineModalVisible(true);
  };

  const handleSaveBomLine = () => {
    if (!bomLineFormData.bom_header_id || !bomLineFormData.component_id || !bomLineFormData.qty) return;
    const isUpdate = !!bomLineFormData.id;
    bomLineMutation.mutate({
      id: bomLineFormData.id,
      values: {
        bom_header_id: bomLineFormData.bom_header_id,
        component_id: bomLineFormData.component_id,
        qty: parseFloat(String(bomLineFormData.qty)),
        unit: bomLineFormData.unit || 'kg',
        pct: parseFloat(String(bomLineFormData.pct || 0)) || null,
        sort_order: parseInt(String(bomLineFormData.sort_order)) || 0,
      },
      type: isUpdate ? 'UPDATE' : 'INSERT',
    });
    setBomLineModalVisible(false);
  };

  const handleDeleteBomLine = (lineId: string) => {
    confirmAction(
      'Confirmer',
      'Supprimer ce composant de la nomenclature ?',
      () => bomLineMutation.mutate({ id: lineId, type: 'DELETE' })
    );
  };

  const handleUpdateBomLineQty = React.useCallback(async (lineId: string, newQty: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      bomLineMutation.mutate(
        { id: lineId, type: 'UPDATE', values: { qty: newQty } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['bom_lines'] });
            resolve();
          },
          onError: (err: unknown) => {
            Alert.alert('Erreur', err instanceof Error ? err.message : 'Impossible de mettre à jour la quantité.');
            reject(err);
          },
        }
      );
    });
  }, [bomLineMutation, queryClient]);

  const handleDeleteBom = (bom: BomHeader) => {
    confirmAction(
      'Supprimer la nomenclature',
      `Supprimer "${bom.code}" (${bom.product?.name || 'produit inconnu'}) et toutes ses lignes ?\n\nCette action est irréversible.`,
      () => {
        confirmAction(
          'Attention',
          'Êtes-vous absolument sûr ? Cette action est irréversible.',
          async () => {
            if (!supabase) return;
            try {
              // 1. Supprimer les lignes BOM
              const { error: errLines } = await supabase.from('bom_lines').delete().eq('bom_header_id', bom.id);
              if (errLines) throw new Error("Impossible de supprimer les lignes de la nomenclature: " + errLines.message);
              
              // 2. Supprimer le header
              const { error: errHeader } = await supabase.from('bom_headers').delete().eq('id', bom.id);
              if (errHeader) throw new Error("Impossible de supprimer la nomenclature principale: " + errHeader.message);
              
              queryClient.invalidateQueries({ queryKey: ['bom_headers'] });
              queryClient.invalidateQueries({ queryKey: ['bom_lines'] });
              if (selectedBom?.id === bom.id) setSelectedBom(null);
            } catch (err: unknown) {
              Alert.alert('Erreur de suppression', (err as any)?.message || 'Impossible de supprimer la nomenclature. Elle est peut-être utilisée ailleurs (ex: dans un Ordre de Fabrication).');
            }
          }
        );
      }
    );
  };

  const handleSave = () => {
    if (!ofFormData.code || !ofFormData.product_id || !ofFormData.bom_header_id) return;
    if (ofFormData.id) {
      // Mode édition
      const { id, code, ...editableFields } = ofFormData as any;
      mutation.mutate({
        id,
        values: { ...editableFields, qty_planned: parseFloat(String(ofFormData.qty_planned)) },
        type: 'UPDATE'
      });
    } else {
      // Mode création
      mutation.mutate({
        values: { ...ofFormData, qty_planned: parseFloat(String(ofFormData.qty_planned)) },
        type: 'INSERT'
      });
    }
  };

  const handleRunWhatIf = async () => {
    if (!whatIfFormData.product_id || !whatIfFormData.month_offset || !whatIfFormData.demand_change) {
      Alert.alert('Erreur', 'Veuillez spécifier un produit, un mois et une variation de demande.');
      return;
    }

    if (whatIfBomLoading) {
      Alert.alert('Chargement', 'Les données du BOM sont en cours de chargement, veuillez réessayer.');
      return;
    }

    if (!whatIfBomHeader) {
      Alert.alert('Erreur', 'Aucun BOM trouvé pour ce produit fini. Créez d\'abord un BOM.');
      return;
    }

    if (whatIfBomLines.length === 0) {
      Alert.alert('Erreur', 'Le BOM de ce produit ne contient aucune matière première.');
      return;
    }

    const changeFactor = 1 + (parseFloat(whatIfFormData.demand_change) / 100);
    // Calcul de la quantité à produire (soit via cartons * unités, soit via quantité directe)
    let qtyProduced = 1000;
    if (whatIfFormData.cartons && whatIfFormData.units_per_carton) {
      qtyProduced = parseFloat(whatIfFormData.cartons) * parseFloat(whatIfFormData.units_per_carton);
    } else if (whatIfFormData.qty) {
      qtyProduced = parseFloat(whatIfFormData.qty);
    }
    const batchSize = whatIfBomHeader.batch_size_kg || 1000;

    // Calcul basé sur les vraies quantités BOM + stock réel des lots
    const results = whatIfBomLines.map((line: any) => {
      const comp = line.component;
      if (!comp) return null;

      // Quantité MP nécessaire pour produire qtyProduced unités de PF
      // ratio = (qtyProduced / batchSize) × qtéBOM × facteurDemande
      const qtyPerBatch = line.qty || 0;
      const simulatedDemand = Math.round((qtyProduced / batchSize) * qtyPerBatch * changeFactor * 100) / 100;

      // Stock réel depuis les lots libérés
      const compLots = lots.filter((l: any) => l.article_id === comp.id);
      const realStock = compLots.reduce((acc: number, l: any) => acc + (l.qty_current || 0), 0);
      const netNeed = Math.max(0, simulatedDemand - realStock);

      let action = 'RAS';
      if (netNeed > 0) {
        action = netNeed > (comp.safety_stock || 0) ? 'COMMANDE_URGENTE' : 'RECOMMANDER';
      }

      return {
        id: comp.id,
        code: comp.code,
        name: comp.name,
        type: comp.article_type,
        unit: line.unit || comp.unit || 'KG',
        qty_bom: qtyPerBatch,
        stock: realStock,
        needs: simulatedDemand,
        safety: comp.safety_stock || 0,
        net: netNeed,
        action,
      };
    }).filter(Boolean);

    setWhatIfResults(results.filter((r): r is NonNullable<typeof r> => r !== null));
    setWhatIfModalVisible(false);

    const productName = filteredProducts.find(p => p.id === whatIfFormData.product_id)?.name || '';
    const descQty = whatIfFormData.cartons && whatIfFormData.units_per_carton 
      ? `${whatIfFormData.cartons} cartons (${qtyProduced} unités)` 
      : `${qtyProduced} unités`;
    
    Alert.alert(
      'Simulation terminée',
      `What-If pour "${productName}" — Pour ${descQty}\n${whatIfBomLines.length} MP du BOM, variation ${whatIfFormData.demand_change}%`
    );
  };

  // ─── Démarrer un OF planifié ──────────────────────────────────────────────
  const handleStartOrder = async (order: ProductionOrder) => {
    confirmAction(
      'Démarrer l\'OF',
      `Confirmer le démarrage de ${order.code} ?`,
      async () => {
        if (!supabase) {
          Alert.alert('Erreur', 'Supabase non configuré');
          return;
        }
        setStartingOrderId(order.id);
        try {
          const { error } = await supabase
            .from('production_orders')
            .update({ status: 'EN_COURS', started_at: new Date().toISOString() })
            .eq('id', order.id);
          if (error) throw error;
          mutation.mutate({ id: order.id, values: { status: 'EN_COURS', started_at: new Date().toISOString() }, type: 'UPDATE' });
        } catch (err: any) {
          Alert.alert('Erreur', (err instanceof Error ? err.message : undefined) || 'Impossible de démarrer l\'OF.');
        } finally {
          setStartingOrderId(null);
        }
      }
    );
  };

  // ─── Ouvrir le formulaire d'arrêt ─────────────────────────────────────────
  const handleOpenStopModal = (order: ProductionOrder) => {
    setStopTargetOrder(order);
    setStopFormData({ raison: '', categorie: 'PANNE', duree_min: '' as any });
    setStopModalVisible(true);
  };

  const handleSaveStop = async () => {
    if (!supabase) {
      Alert.alert('Erreur', 'Supabase non configuré');
      return;
    }
    if (!stopFormData.raison || !stopFormData.duree_min) {
      Alert.alert('Champs requis', 'Veuillez renseigner la raison et la durée de l\'arrêt.');
      return;
    }
    if (!stopTargetOrder) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.from('production_stops').insert({
        production_order_id: stopTargetOrder.id,
        raison: stopFormData.raison,
        categorie: stopFormData.categorie,
        duree_min: parseInt(String(stopFormData.duree_min)) || 0,
        declared_at: new Date().toISOString(),
      });
      if (error) throw error;
      // Invalide le cache pour forcer un rechargement du panneau
      setStopsMap(prev => { const next = { ...prev }; delete next[stopTargetOrder.id]; return next; });
      setStopModalVisible(false);
      Alert.alert('Arrêt enregistré', `Arrêt de ${stopFormData.duree_min} min déclaré pour ${stopTargetOrder.code}.`);
    } catch (err: unknown) {
      Alert.alert('Erreur', (err instanceof Error ? err.message : undefined) || 'Impossible d\'enregistrer l\'arrêt.');
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Ouvrir le formulaire de clôture ──────────────────────────────────────
  const handleOpenCloseModal = (order: ProductionOrder) => {
    setCloseTargetOrder(order);
    setCloseFormData({
      qty_produced: '',
      qty_rejected: '0',
      completed_at: new Date().toISOString().slice(0, 16),
    });
    setCloseModalVisible(true);
  };

  const handleCloseOrder = async () => {
    if (!supabase) {
      Alert.alert('Erreur', 'Supabase non configuré');
      return;
    }
    if (!closeTargetOrder) return;
    if (!closeFormData.qty_produced) {
      Alert.alert('Champs requis', 'Veuillez saisir la quantité produite.');
      return;
    }
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('production_orders')
        .update({
          status: 'CLOTURE',
          qty_produced: parseFloat(String(closeFormData.qty_produced)),
          qty_rejected: parseFloat(String(closeFormData.qty_rejected || 0)),
          completed_at: new Date(closeFormData.completed_at || new Date()).toISOString(),
        })
        .eq('id', closeTargetOrder.id);
      if (error) throw error;
      mutation.mutate({
        id: closeTargetOrder.id,
        values: {
          status: 'CLOTURE',
          qty_produced: parseFloat(String(closeFormData.qty_produced)),
          qty_rejected: parseFloat(String(closeFormData.qty_rejected || 0)),
          completed_at: new Date(closeFormData.completed_at || new Date()).toISOString(),
        },
        type: 'UPDATE'
      });

      const year = new Date().getFullYear();
      let rpfCode = `RPF-${year}-AUTO-${Math.floor(Math.random() * 10000)}`;
      try {
        rpfCode = await getNextCode(`RPF-GEN`, 'lots', 'code');
      } catch (e) {
        console.warn('getNextCode failed, using fallback', e);
      }

      const lotPayloadBase = {
        code: rpfCode,
        article_id: closeTargetOrder.product_id,
        qty_received: parseFloat(String(closeFormData.qty_produced)),
        qty_current: parseFloat(String(closeFormData.qty_produced)),
        unit: closeTargetOrder.product?.unit || 'kg',
        reception_date: new Date().toISOString().split('T')[0],
        origin: closeTargetOrder.code,
      };

      // Essaie EN_ATTENTE (nouveau workflow), fallback sur QUARANTAINE si migration non encore appliquée
      let { error: lotError } = await supabase.from('lots').insert({
        ...lotPayloadBase,
        cqlib_status: 'EN_ATTENTE',
      });

      if (lotError && lotError.code === '22P02') {
        // Enum EN_ATTENTE pas encore dans la DB → fallback QUARANTAINE
        console.warn('[OF Clôture] EN_ATTENTE non supporté par la DB, fallback QUARANTAINE. Appliquer la migration 054.');
        const fallback = await supabase.from('lots').insert({
          ...lotPayloadBase,
          cqlib_status: 'QUARANTAINE',
        });
        lotError = fallback.error;
      }

      if (lotError) throw lotError;

      notify.mutate({
        to_role: 'MAGA',
        subject: 'Nouveau lot PF en attente de réception',
        message: `L'OF ${closeTargetOrder.code} a été clôturé. Le lot ${rpfCode} est disponible en Réception PF — validez-le pour lancer le contrôle qualité.`,
        type: 'internal',
        category: 'STOCK',
        metadata: { category: 'STOCK', screen: 'ReceptionPF' }
      });

      setCloseModalVisible(false);
    } catch (err: unknown) {
      Alert.alert('Erreur', (err instanceof Error ? err.message : undefined) || 'Impossible de clôturer l\'OF.');
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Historique arrêts : charger / toggle ────────────────────────────────
  const handleToggleStops = async (orderId: string) => {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null);
      return;
    }
    setExpandedOrderId(orderId);
    if (stopsMap[orderId]) return; // already loaded
    if (!supabase) return;
    setStopsLoading(orderId);
    try {
      const { data, error } = await supabase
        .from('production_stops')
        .select('*')
        .eq('production_order_id', orderId)
        .order('declared_at', { ascending: false });
      if (error) throw error;
      setStopsMap(prev => ({ ...prev, [orderId]: data || [] }));
    } catch (err: unknown) {
      Alert.alert('Erreur', (err instanceof Error ? err.message : undefined) || 'Impossible de charger les arrêts.');
    } finally {
      setStopsLoading(null);
    }
  };

  const handleDeleteStop = async (stopId: string, orderId: string) => {
    Alert.alert('Supprimer cet arrêt ?', 'Cette action est irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: async () => {
          if (!supabase) return;
          const { error } = await supabase.from('production_stops').delete().eq('id', stopId);
          if (!error) {
            setStopsMap(prev => ({ ...prev, [orderId]: (prev[orderId] || []).filter(s => s.id !== stopId) }));
          }
        }
      }
    ]);
  };

  const STOP_CATEGORY_LABELS: Record<string, string> = {
    PANNE: 'Panne machine', MAINTENANCE: 'Maintenance', RUPTURE_MP: 'Rupture MP',
    ABSENCE: 'Absence opérateur', ENERGIE: 'Coupure énergie',
    CHANGEMENT: 'Changement prod.', AUTRE: 'Autre',
  };


  const handleImportPDP = (mode: 'update' | 'replace') => {
    setImportModalVisible(false);
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv, .xlsx, .xls';
      input.onchange = (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const isCsv = file.name.toLowerCase().endsWith('.csv');
        setImporting(true);
        setImportProgress(0);
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            let rows: unknown[][];
            if (isCsv) {
              const text = ev.target?.result as string;
              rows = text.split('\n').filter((l: string) => l.trim()).map((l: string) => l.split(','));
            } else {
              const data = new Uint8Array(ev.target?.result as ArrayBuffer);
              const workbook = XLSX.read(data, { type: 'array' });
              const sheetNames = workbook.SheetNames;
              if (!sheetNames || sheetNames.length === 0) throw new Error('Le fichier Excel ne contient aucune feuille.');
              rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetNames[0]], { header: 1 });
            }

            // ─── Normalise a French month header to YYYY-MM ───────────────────────
            // Handles: "janv.-25", "janv.-2025", "janvier-25", "Jan", "January", etc.
            const parseFrMonthHeader = (raw: string): string | null => {
              const frMonths: Record<string, string> = {
                jan: '01', janv: '01', january: '01',
                fév: '02', fevr: '02', fev: '02', fevrier: '02', february: '02',
                mar: '03', mars: '03', march: '03',
                avr: '04', avril: '04', april: '04',
                mai: '05', may: '05',
                juin: '06', jun: '06', june: '06',
                juil: '07', jul: '07', july: '07',
                août: '08', aout: '08', aug: '08', august: '08',
                sep: '09', sept: '09', september: '09',
                oct: '10', octobre: '10', october: '10',
                nov: '11', novembre: '11', november: '11',
                déc: '12', dec: '12', decembre: '12', december: '12',
              };
              // Remove dots, dashes, spaces then split into word parts
              const cleaned = raw.toLowerCase().replace(/[.\-\s]/g, ' ').trim();
              const parts = cleaned.split(/\s+/).filter(Boolean);
              let monthNum: string | undefined;
              let yearNum: string | undefined;
              for (const part of parts) {
                if (!monthNum) {
                  // Try prefix matching: "janv" matches "janv.-"
                  const match = Object.keys(frMonths).find(k => part.startsWith(k) || k.startsWith(part));
                  if (match) { monthNum = frMonths[match]; continue; }
                }
                // Year part: 2-digit or 4-digit number
                if (/^\d{2,4}$/.test(part)) {
                  yearNum = part.length === 2 ? `20${part}` : part;
                }
              }
              if (!monthNum) return null;
              // If no year found in header, fall back to the currently-selected forecast year
              if (!yearNum) yearNum = String(forecastYear);
              return `${yearNum}-${monthNum}`;
            };

            // ─── Detect PDP format (Code / RUBRIQUE / Unité / months…) ───────────
            const nonEmpty = rows.filter(r => r.some((c) => c !== undefined && c !== null && String(c).trim() !== ''));
            if (nonEmpty.length < 2) {
              Alert.alert('Fichier vide', 'Le fichier doit contenir un en-tête et au moins une ligne de données.');
              setImporting(false);
              return;
            }

            const rawHeaders = nonEmpty[0].map((h) => String(h ?? '').trim());

            // Find the first column that looks like a month header
            // Columns before it that contain "code" / "rubrique" / "unité" are metadata
            let firstMonthColIdx = -1;
            const monthKeyMap: Array<string | null> = rawHeaders.map(h => {
              const parsed = parseFrMonthHeader(h);
              return parsed;
            });

            firstMonthColIdx = monthKeyMap.findIndex(k => k !== null);
            if (firstMonthColIdx === -1) {
              throw new Error(
                'Aucune colonne de mois reconnue. Assurez-vous que la première ligne contient des en-têtes de mois (ex: janv.-25, févr.-25…).'
              );
            }

            // Code column is always 0; name/unit columns are between code and months
            const codeColIdx = 0;

            const newForecasts: Record<string, Record<string, number>> = {};
            let matchedCount = 0;
            let unmatchedCodes: string[] = [];

            for (let i = 1; i < nonEmpty.length; i++) {
              const cols = nonEmpty[i];
              const productCode = String(cols[codeColIdx] ?? '').trim();
              if (!productCode) continue;

              // Try matching by code first, then by name (RUBRIQUE column if present)
              let product = allArticles.find(a => a.code === productCode);
              if (!product && firstMonthColIdx > 1) {
                const rubrique = String(cols[1] ?? '').trim();
                if (rubrique) product = allArticles.find(a => a.name.trim() === rubrique || a.name.trim().toLowerCase() === rubrique.toLowerCase());
              }
              if (!product) {
                unmatchedCodes.push(productCode);
                continue;
              }

              matchedCount++;
              const key = product.id;
              if (!newForecasts[key]) newForecasts[key] = {};

              for (let c = firstMonthColIdx; c < rawHeaders.length; c++) {
                const monthKey = monthKeyMap[c];
                if (!monthKey) continue;
                const raw = cols[c];
                const val = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(/\s/g, '').replace(',', '.'));
                if (!isNaN(val) && val > 0) newForecasts[key][monthKey] = Math.round(val * 100) / 100;
              }
            }

            // Flatten newForecasts into rows for DB upsert
            const dbRows: Array<{ product_id: string; year: number; month: number; qty: number }> = [];
            for (const [pid, months] of Object.entries(newForecasts)) {
              for (const [key, qty] of Object.entries(months)) {
                const [yStr, mStr] = key.split('-');
                dbRows.push({ product_id: pid, year: parseInt(yStr), month: parseInt(mStr), qty });
              }
            }

            // Switch to the year detected from the file
            const detectedYear = dbRows.map(r => r.year).find(y => !isNaN(y));
            if (detectedYear) setForecastYear(detectedYear);

            const doSave = async () => {
              if (mode === 'replace' && detectedYear) {
                await deleteYear(detectedYear);
              }
              await saveForecasts(dbRows);
            };

            doSave()
              .then(() => {
                setImporting(false);
                setImportProgress(1);
                const modeLabel = mode === 'replace' ? 'Année remplacée' : 'Mise à jour';
                const warningMsg = unmatchedCodes.length > 0
                  ? `\n\nAttention: ${unmatchedCodes.length} code(s) non trouvé(s) dans le référentiel : ${unmatchedCodes.slice(0, 5).join(', ')}${unmatchedCodes.length > 5 ? '…' : ''}`
                  : '';
                Alert.alert(`Import réussi — ${modeLabel}`, `${matchedCount} produit(s) mis à jour depuis "${file.name}".${warningMsg}`);
              })
              .catch(err => {
                setImporting(false);
                Alert.alert('Erreur sauvegarde', (err instanceof Error ? err.message : undefined) || 'Impossible de sauvegarder dans la base de données.');
              });
          } catch (err: unknown) {
            console.error('PDP import error:', err);
            setImporting(false);
            Alert.alert('Erreur import', (err instanceof Error ? err.message : undefined) || 'Impossible de lire le fichier.');
          }
        };
        reader.onerror = () => { setImporting(false); Alert.alert('Erreur', 'Impossible de lire le fichier.'); };
        if (isCsv) reader.readAsText(file); else reader.readAsArrayBuffer(file);
      };
      input.click();
    } else {
      Alert.alert("Information", "L'import de prévisions Excel/CSV est disponible sur la version Web de l'ERP.");
    }
  };

  const monthLabels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
  const [forecastYear, setForecastYear] = React.useState(new Date().getFullYear());
  const yearMonths = React.useMemo(() =>
    Array.from({ length: 12 }, (_, i) => `${forecastYear}-${String(i + 1).padStart(2, '0')}`),
    [forecastYear]
  );
  const availableYears = React.useMemo(() => {
    const years = new Set<number>([new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1, new Date().getFullYear() + 2]);
    Object.values(forecasts).forEach(pf => Object.keys(pf).forEach(k => { const y = parseInt(k.split('-')[0]); if (!isNaN(y)) years.add(y); }));
    return Array.from(years).sort();
  }, [forecasts]);

  // Sorting rules:
  // 1. Products with NO forecast data across ALL years → hidden
  // 2. Products with data for the SELECTED year → shown first, sorted by total desc
  // 3. Products with data in OTHER years but not the selected year → shown last
  const productsWithData = React.useMemo(() => {
    const yearPrefix = `${forecastYear}-`;

    const hasAnyData = (id: string) => {
      const pf = forecasts[id];
      return pf && Object.values(pf).some(v => v > 0);
    };
    const totalForYear = (id: string) => {
      const pf = forecasts[id] || {};
      return Object.entries(pf)
        .filter(([k]) => k.startsWith(yearPrefix))
        .reduce((s, [, v]) => s + v, 0);
    };
    const hasDataForYear = (id: string) => totalForYear(id) > 0;

    return filteredProducts
      .filter(p => hasAnyData(p.id))
      .sort((a, b) => {
        const aHas = hasDataForYear(a.id);
        const bHas = hasDataForYear(b.id);
        if (aHas && !bHas) return -1;   // a first
        if (!aHas && bHas) return 1;    // b first
        if (aHas && bHas) return totalForYear(b.id) - totalForYear(a.id); // both have: sort by total desc
        return 0; // both only have data in other years: keep stable
      });
  }, [filteredProducts, forecasts, forecastYear]);

  const paginatedProducts = React.useMemo(() =>
    productsWithData.slice(pdpPage * pdpLimit, (pdpPage + 1) * pdpLimit),
    [productsWithData, pdpPage]
  );

  const handleExportOfPdf = (order: ProductionOrder) => {
    const htmlContent = getPdfTemplate(
      `Ordre de Fabrication : ${order.code}`,
      `
      <div class="summary-card">
        <strong>Produit à fabriquer :</strong> ${order.product?.name || 'Inconnu'}<br />
        <strong>Quantité planifiée :</strong> ${order.qty_planned?.toLocaleString()} ${order.product?.unit || ''}<br />
        <strong>Date planifiée :</strong> ${order.planned_date ? new Date(order.planned_date).toLocaleDateString() : 'Non définie'}<br />
        <strong>Statut :</strong> <span class="badge badge-${order.status === 'PLANIFIE' ? 'info' : order.status === 'EN_COURS' ? 'gold' : 'ok'}">${order.status}</span>
      </div>
      <h3>Consignes de Production</h3>
      <p>Veuillez respecter les nomenclatures (BOM) associées et enregistrer toutes les consommations de matières premières dans le système.</p>
      <p>Le contrôle qualité est obligatoire avant la libération du lot.</p>
      
      <table style="margin-top: 40px; width: 100%;">
        <tr>
          <td style="border: none; text-align: center; width: 50%;"><strong>Visa Chef de Production</strong><br /><br /><br />_____________________</td>
          <td style="border: none; text-align: center; width: 50%;"><strong>Visa Contrôle Qualité</strong><br /><br /><br />_____________________</td>
        </tr>
      </table>
      `
    );

    generatePdf(htmlContent, `OF_${order.code}.pdf`);
  };

  const handleExportBomPdf = async (bom: BomHeader) => {
    if (!supabase) return;
    try {
      const { data: lines, error } = await supabase
        .from('bom_lines')
        .select('*, component:articles(*)')
        .eq('bom_header_id', bom.id)
        .order('sort_order', { ascending: true });
        
      if (error) throw error;
      
      const productName = bom.product ? getProductName(bom.product) : 'Produit inconnu';
      
      let linesHtml = '';
      if (lines && lines.length > 0) {
        linesHtml = `
          <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <thead>
              <tr style="background-color: #F8F9FA;">
                <th style="padding: 10px; border: 1px solid #DEE2E6; text-align: left;">Composant</th>
                <th style="padding: 10px; border: 1px solid #DEE2E6; text-align: left;">Code</th>
                <th style="padding: 10px; border: 1px solid #DEE2E6; text-align: right;">Quantité</th>
                <th style="padding: 10px; border: 1px solid #DEE2E6; text-align: right;">Unité</th>
                <th style="padding: 10px; border: 1px solid #DEE2E6; text-align: right;">%</th>
              </tr>
            </thead>
            <tbody>
              ${lines.map(l => `
                <tr>
                  <td style="padding: 10px; border: 1px solid #DEE2E6;">${l.component ? getProductName(l.component) : '—'}</td>
                  <td style="padding: 10px; border: 1px solid #DEE2E6;">${l.component?.code || '—'}</td>
                  <td style="padding: 10px; border: 1px solid #DEE2E6; text-align: right;">${l.qty || 0}</td>
                  <td style="padding: 10px; border: 1px solid #DEE2E6; text-align: right;">${l.unit || '—'}</td>
                  <td style="padding: 10px; border: 1px solid #DEE2E6; text-align: right;">${l.pct ? l.pct + '%' : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      } else {
        linesHtml = '<p>Aucun composant défini pour cette nomenclature.</p>';
      }

      const htmlContent = getPdfTemplate(
        `Fiche Technique : ${bom.code}`,
        `
        <div class="summary-card">
          <strong>Produit :</strong> ${productName}<br />
          <strong>Version :</strong> ${bom.version || 1}<br />
          <strong>Taille de lot standard :</strong> ${bom.batch_size_kg || '—'} kg<br />
          <strong>Statut :</strong> <span class="badge badge-${bom.status === 'VALIDE' ? 'ok' : 'info'}">${bom.status}</span>
        </div>
        
        <h3>Composition (Nomenclature)</h3>
        ${linesHtml}
        
        ${bom.notes ? `
          <div style="margin-top: 30px; padding: 15px; background-color: #F8F9FA; border-left: 4px solid #005BBB;">
            <strong>Observations / Instructions :</strong><br/>
            <p style="margin-top: 8px; white-space: pre-wrap;">${bom.notes}</p>
          </div>
        ` : ''}
        
        <table style="margin-top: 50px; width: 100%;">
          <tr>
            <td style="border: none; text-align: center; width: 50%;"><strong>Visa R&D / Formulation</strong><br /><br /><br /><br />_____________________</td>
            <td style="border: none; text-align: center; width: 50%;"><strong>Visa Direction Technique</strong><br /><br /><br /><br />_____________________</td>
          </tr>
        </table>
        `
      );

      generatePdf(htmlContent, `Fiche_Technique_${bom.code}.pdf`);
    } catch (err) {
      console.error(err);
      Alert.alert('Erreur', 'Impossible de générer la fiche technique.');
    }
  };



  const renderPDP = () => (
    <View style={s.tabContent}>
      <View style={[s.grid, isMobile && { flexDirection: 'column' }]}>
        <KpiCard label={t('of_in_progress')} value={String(filteredOrders.filter(o => o.status !== 'TERMINE').length)} sub={`Semaine ${Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))}`} color={C.info} />
        {(() => {
          const retards = filteredOrders.filter(o => o.status !== 'TERMINE' && o.planned_date && new Date(o.planned_date) < new Date()).length;
          return <KpiCard label={t('retards')} value={String(retards)} sub={retards === 0 ? "Séquençage OK" : "OF en retard"} color={retards === 0 ? C.ok : '#E63946'} />;
        })()}
        <KpiCard label={t('trs_moyen')} value={trsValue != null ? `${trsValue}%` : '—'} sub={trsLabel} color={trsValue == null ? C.info : trsValue >= 85 ? C.ok : trsValue >= 70 ? C.gold : C.err} />
      </View>

      <View style={{ height: 24 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={s.sectionLabel}>Prévisions (PDP)</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {availableYears.map(y => (
              <TouchableOpacity
                key={y}
                onPress={() => setForecastYear(y)}
                style={[s.yearChip, forecastYear === y && s.yearChipActive]}
              >
                <Text style={[s.yearChipText, forecastYear === y && s.yearChipTextActive]}>{y}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {canPerformAction('run_mrp') && (
            <ActionButton label={t('simulate_what_if')} icon="chart-timeline-variant" onPress={() => setWhatIfModalVisible(true)} />
          )}
          {canPerformAction('import_csv') && <ActionButton label={t('import_pdp')} icon="file-import-outline" onPress={() => setImportModalVisible(true)} />}
          {canPerformAction('create_of') && (
            <ActionButton label={t('new_of')} icon="plus" variant="primary" onPress={handleAdd} />
          )}
        </View>

      </View>

      {/* Tableau des prévisions */}
      <View style={s.table}>
        <View style={[s.orderRow, { backgroundColor: '#F8F9FA', borderBottomWidth: 2 }]}>
          <View style={{ width: 200 }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#ADB5BD', letterSpacing: 1 }}>Produit</Text>
          </View>
          {yearMonths.map(m => (
            <View key={m} style={{ flex: 1, alignItems: 'center', minWidth: 70 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: '#ADB5BD', letterSpacing: 1 }}>
                {monthLabels[parseInt(m.split('-')[1]) - 1]}
              </Text>
            </View>
          ))}
          <View style={{ width: 80, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#ADB5BD', letterSpacing: 1 }}>Total</Text>
          </View>
        </View>
        {paginatedProducts.length === 0 ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <MaterialCommunityIcons name="table-off" size={32} color="#CCC" />
            <Text style={{ color: '#ADB5BD', fontSize: 14, marginTop: 12, fontWeight: '600' }}>
              Aucune prévision pour {forecastYear}
            </Text>
            <Text style={{ color: '#CCC', fontSize: 12, marginTop: 4 }}>
              Importez un fichier PDP ou saisissez des valeurs manuellement
            </Text>
          </View>
        ) : paginatedProducts.map(p => {
          const rowForecasts = forecasts[p.id] || {};
          const total = yearMonths.reduce((s, m) => s + (rowForecasts[m] || 0), 0);
          return (
            <View key={p.id} style={s.orderRow}>
              <View style={{ width: 200, paddingRight: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#1A1A1A' }} numberOfLines={1} ellipsizeMode="tail">{getProductName(p)}</Text>
                <Text style={{ fontSize: 10, color: '#ADB5BD' }}>{p.code}</Text>
              </View>
              {yearMonths.map(m => {
                const val = rowForecasts[m];
                return (
                  <TouchableOpacity
                    key={m}
                    style={{ flex: 1, alignItems: 'center', paddingVertical: 4, minWidth: 70 }}
                    onPress={() => setEditingForecast({ productId: p.id, month: m })}
                  >
                    {editingForecast?.productId === p.id && editingForecast?.month === m ? (
                      <input
                        type="number"
                        defaultValue={val || ''}
                        style={{ width: '90%', minWidth: 50, textAlign: 'center', border: '1px solid #1A56DB', borderRadius: 4, padding: 2, fontSize: 12 }}
                        autoFocus
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value);
                          const [yStr, mStr] = m.split('-');
                          const yr = parseInt(yStr), mo = parseInt(mStr);
                          if (!isNaN(v) && v > 0) {
                            saveForecasts([{ product_id: p.id, year: yr, month: mo, qty: Math.round(v * 100) / 100 }])
                              .catch(err => Alert.alert('Erreur', (err instanceof Error ? err.message : undefined) || 'Impossible de sauvegarder.'));
                          } else {
                            removeForecast(p.id, yr, mo)
                              .catch(err => Alert.alert('Erreur', (err instanceof Error ? err.message : undefined) || 'Impossible de supprimer.'));
                          }
                          setEditingForecast(null);
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      />
                    ) : (
                      <Text style={{ fontSize: 13, fontWeight: '700', color: val ? '#1A1A1A' : '#CCC' }}>
                        {val ? val.toLocaleString() : '—'}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
              <View style={{ width: 80, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#1A1A1A' }}>{total.toLocaleString()}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <PaginationControls
        currentPage={pdpPage}
        totalItems={productsWithData.length}
        limit={pdpLimit}
        onPageChange={(p) => setPdpPage(p)}
      />

      <View style={{ height: 24 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={s.sectionLabel}>{t('pdp_section')}</Text>
      </View>
      <View style={s.table}>
        <FlatList
          data={filteredOrders}
          keyExtractor={order => order.id}
          scrollEnabled={false}
          renderItem={({ item: order }) => {
            const isExpanded = expandedOrderId === order.id;
            const stops = stopsMap[order.id] || [];
            const loadingStops = stopsLoading === order.id;
            const hasStops = order.status === 'EN_COURS' || order.status === 'CLOTURE';
            const totalStopMin = stops.reduce((acc: number, s: ProductionStop) => acc + (s.duree_min || 0), 0);
            return (
              <View>
                {/* ── Ligne principale ── */}
                <View style={s.orderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.orderRef}>{order.code}</Text>
                    <Text style={s.orderTitle}>{order.product ? getProductName(order.product) : t('loading')}</Text>
                    <Text style={s.orderDate}>{order.planned_date ? new Date(order.planned_date).toLocaleDateString() : 'Non planifié'}</Text>
                    {order.started_at && (
                      <Text style={{ fontSize: 11, color: C.gold, marginTop: 2 }}>
                        Démarré le {new Date(order.started_at).toLocaleString()}
                      </Text>
                    )}
                    {order.completed_at && (
                      <Text style={{ fontSize: 11, color: C.ok, marginTop: 2 }}>
                        Clôturé le {new Date(order.completed_at).toLocaleString()}
                      </Text>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 8 }}>
                    <Text style={s.orderQty}>{order.qty_planned.toLocaleString()} {order.product?.unit}</Text>
                    {order.qty_produced != null && (
                      <Text style={{ fontSize: 12, color: C.ok, fontWeight: '700' }}>
                        Produit : {order.qty_produced.toLocaleString()} · Rejet : {(order.qty_rejected || 0).toLocaleString()}
                      </Text>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity onPress={() => handleExportOfPdf(order)}>
                        <MaterialCommunityIcons name="file-pdf-box" size={24} color={C.err} />
                      </TouchableOpacity>
                      {hasStops && (
                        <TouchableOpacity
                          onPress={() => handleToggleStops(order.id)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: isExpanded ? '#FFF3CD' : '#F8F9FA', borderWidth: 1, borderColor: isExpanded ? C.gold : '#E9ECEF' }}
                        >
                          <MaterialCommunityIcons name={isExpanded ? 'chevron-up' : 'history'} size={15} color={C.gold} />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: C.gold }}>
                            {loadingStops ? '…' : `${stops.length} arrêt${stops.length !== 1 ? 's' : ''}`}
                          </Text>
                        </TouchableOpacity>
                      )}
                      <Badge label={order.status} color={order.status === 'PLANIFIE' ? C.info : order.status === 'EN_COURS' ? C.gold : order.status === 'CLOTURE' ? '#6C757D' : C.ok} />
                    </View>
                    {/* ── Actions contextuelles selon le statut ── */}
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {order.status === 'PLANIFIE' && canPerformAction('edit_production_order') && (
                        <TouchableOpacity
                          onPress={() => handleStartOrder(order)}
                          disabled={startingOrderId === order.id}
                          style={[s.actionBtn, { backgroundColor: '#1A56DB' }]}
                        >
                          {startingOrderId === order.id
                            ? <ActivityIndicator size="small" color="#FFF" />
                            : <><MaterialCommunityIcons name="play" size={13} color="#FFF" /><Text style={s.actionBtnText}> Démarrer</Text></>
                          }
                        </TouchableOpacity>
                      )}
                      {order.status === 'EN_COURS' && (
                        <>
                          <TouchableOpacity
                            onPress={() => handleOpenStopModal(order)}
                            style={[s.actionBtn, { backgroundColor: C.gold }]}
                          >
                            <MaterialCommunityIcons name="pause" size={13} color="#FFF" />
                            <Text style={s.actionBtnText}> Déclarer arrêt</Text>
                          </TouchableOpacity>
                          {canPerformAction('edit_production_order') && (
                            <TouchableOpacity
                              onPress={() => handleOpenCloseModal(order)}
                              style={[s.actionBtn, { backgroundColor: C.ok }]}
                            >
                              <MaterialCommunityIcons name="check-bold" size={13} color="#FFF" />
                              <Text style={s.actionBtnText}> Clôturer</Text>
                            </TouchableOpacity>
                          )}
                        </>
                      )}
                    </View>
                    {/* ── Boutons Modifier / Supprimer (ADMIN, SUPER_ADMIN, PLAN uniquement) ── */}
                    {(['ADMIN', 'SUPER_ADMIN', 'PLAN'] as string[]).includes(profile?.role ?? '') && (
                      <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
                        <TouchableOpacity
                          onPress={() => handleEditOrder(order)}
                          style={[s.actionBtn, { backgroundColor: '#6C757D' }]}
                        >
                          <MaterialCommunityIcons name="pencil-outline" size={13} color="#FFF" />
                          <Text style={s.actionBtnText}> Modifier</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteOrder(order)}
                          style={[s.actionBtn, { backgroundColor: '#DC3545' }]}
                        >
                          <MaterialCommunityIcons name="trash-can-outline" size={13} color="#FFF" />
                          <Text style={s.actionBtnText}> Supprimer</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>

                {/* ── Panneau historique des arrêts ── */}
                {isExpanded && (
                  <View style={{ backgroundColor: '#FFFBF0', borderTopWidth: 1, borderTopColor: '#FFE69C', paddingHorizontal: 20, paddingVertical: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: C.gold, letterSpacing: 0.5 }}>
                        HISTORIQUE DES ARRÊTS
                      </Text>
                      {stops.length > 0 && (
                        <Text style={{ fontSize: 11, color: '#6C757D', fontWeight: '600' }}>
                          Total : {totalStopMin} min ({Math.floor(totalStopMin / 60)}h{String(totalStopMin % 60).padStart(2, '0')})
                        </Text>
                      )}
                    </View>
                    {loadingStops ? (
                      <ActivityIndicator size="small" color={C.gold} style={{ marginVertical: 12 }} />
                    ) : stops.length === 0 ? (
                      <Text style={{ fontSize: 13, color: '#ADB5BD', fontStyle: 'italic', paddingVertical: 8 }}>
                        Aucun arrêt déclaré pour cet OF.
                      </Text>
                    ) : (
                      stops.map((stop: ProductionStop) => (
                        <View key={stop.id} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#FFE69C', gap: 12 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#1A1A1A' }}>
                              {STOP_CATEGORY_LABELS[stop.categorie] || stop.categorie}
                            </Text>
                            <Text style={{ fontSize: 12, color: '#6C757D', marginTop: 2 }}>{stop.raison}</Text>
                            <Text style={{ fontSize: 11, color: '#ADB5BD', marginTop: 2 }}>
                              {stop.declared_at ? new Date(stop.declared_at).toLocaleString() : ""} · {stop.duree_min} min
                            </Text>
                          </View>
                          {canPerformAction('edit_production_order') && (
                            <TouchableOpacity onPress={() => handleDeleteStop(stop.id!, order.id)} style={{ padding: 6 }}>
                              <MaterialCommunityIcons name="trash-can-outline" size={16} color={C.err} />
                            </TouchableOpacity>
                          )}
                        </View>
                      ))
                    )}
                  </View>
                )}
              </View>
            );
          }}
        />
      </View>

      <PaginationControls
        currentPage={page}
        totalItems={ordersCount}
        limit={limit}
        onPageChange={(p) => setPage(p)}
        loading={loadingOrders}
      />

      {whatIfResults.length > 0 && (
        <View style={s.resultsSection}>
          <SectionTitle>{t('what_if_results_title')}</SectionTitle>
          <View style={s.tableContainer}>
            <DataTable
              data={whatIfResults}
              columns={[
                { key: 'code', label: t('code'), flex: 0.7 },
                { key: 'name', label: t('articles'), flex: 1.5 },
                { key: 'qty_bom', label: 'Qté BOM', flex: 0.7, render: (item: any) => (
                  <Text style={s.tdData}>{item.qty_bom != null ? `${item.qty_bom} ${item.unit || ''}` : '—'}</Text>
                )},
                { key: 'stock', label: t('stock_actuel'), flex: 0.8, render: (item: any) => <Text style={s.tdData}>{item.stock.toLocaleString()}</Text> },
                { key: 'needs', label: t('besoins_bruts_sim'), flex: 0.8, render: (item: any) => <Text style={s.tdData}>{item.needs.toLocaleString()}</Text> },
                { key: 'net', label: t('besoins_nets_sim'), flex: 0.8, render: (item: any) => <Text style={[s.tdData, item.net > 0 && { color: C.err, fontWeight: '800' }]}>{item.net.toLocaleString()}</Text> },
                {
                  key: 'action', label: t('action_recommandee'), flex: 1.2, render: (item: any) => (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Badge
                        label={item.action}
                        color={item.action === 'RAS' ? C.ok : item.action.includes('URGENT') || item.action.includes('RUPTURE') ? C.err : C.gold}
                      />
                    </View>
                  )
                },
              ]}
              onRowPress={(_item) => {}}
            />
          </View>
          <View style={{ marginTop: 16, alignItems: 'flex-end' }}>
            <ActionButton label={t('effacer_simulation')} onPress={() => setWhatIfResults([])} variant="secondary" />
          </View>
        </View>
      )}
    </View>
  );

  // ─── IMPORT EXCEL BOM — Matrice MP (Matière Première × Produit Fini) ────────
  // Format attendu : Ligne 1 = en-têtes produits finis, Col A = matière première
  // Chaque cellule = quantité (kg/unité) de MP par unité de PF
  const handleImportBOM = () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Non supporté', 'L\'import Excel BOM n\'est disponible que sur la version web.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx, .xls';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = async (e: Event) => {
      document.body.removeChild(input);
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setBomImporting(true);
      setBomImportProgress(0);
      setBomImportLog([]);

      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          await processBomWorkbook(workbook, file.name);
        } catch (err: unknown) {
          setBomImportLog([`[ERREUR] ${err instanceof Error ? err.message : String(err)}`]);
        } finally {
          setBomImporting(false);
        }
      };
      reader.readAsArrayBuffer(file);
    };
    input.addEventListener('cancel', () => {
      if (document.body.contains(input)) document.body.removeChild(input);
    });
    input.click();
  };

  const renderBOM = () => {

    if (selectedBom) {
      return (
        <View style={s.tabContent}>
          <View style={s.detailHeader}>
            <TouchableOpacity onPress={() => setSelectedBom(null)} style={s.backBtn}>
              <MaterialCommunityIcons name="arrow-left" size={24} color="#1A1A1A" />
              <Text style={s.backText}>{t('retour_nomenclatures')}</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {canPerformAction('edit_bom') && (
                <ActionButton label={t('editer_version')} icon="pencil-outline" onPress={() => selectedBom && handleEditBom(selectedBom)} />
              )}
              {selectedBom && selectedBom.status !== 'VALIDE' && canPerformAction('validate_bom') && (
                <ActionButton label="Valider" icon="check-circle-outline" variant="primary" onPress={handleValidateBom} loading={bomMutation.isPending} />
              )}
            </View>
          </View>

          <View style={s.bomHero}>
            <View>
              <Text style={s.bomHeroCode}>{selectedBom.code} · v{selectedBom.version}</Text>
              <Text style={s.bomHeroTitle}>{selectedBom.product?.name}</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <SectionTitle>{t('structure_bom')}</SectionTitle>
            {canPerformAction('edit_bom') && (
              <ActionButton label="Ajouter composant" icon="plus" onPress={handleAddBomLine} />
            )}
          </View>
          <View style={s.treeContainer}>
            {bomLinesLoading ? (
              <ActivityIndicator color={C.info} style={{ padding: 40 }} />
            ) : bomLines.length > 0 ? (
              bomLines.map(line => (
                <View key={line.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <BomNode
                      item={line}
                      boms={boms}
                      canEdit={canPerformAction('edit_bom') && selectedBom?.status !== 'VALIDE'}
                      onQtyChange={handleUpdateBomLineQty}
                    />
                  </View>
                  {(['ADMIN', 'SUPER_ADMIN', 'PLAN', 'RESP_QUALITE', 'TECH_LABO'] as string[]).includes(profile?.role ?? '') && (
                    <TouchableOpacity
                      onPress={() => handleEditBomLine(line)}
                      style={{ padding: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Modifier ${line.component?.name ?? 'composant'}`}
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={18} color="#D97706" />
                    </TouchableOpacity>
                  )}
                  {canPerformAction('edit_bom') && selectedBom?.status !== 'VALIDE' && (
                    <TouchableOpacity
                      onPress={() => handleDeleteBomLine(line.id)}
                      style={{ padding: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Supprimer ${line.component?.name ?? 'composant'}`}
                    >
                      <MaterialCommunityIcons name="delete-outline" size={18} color={C.err} />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            ) : (
              <Text style={s.emptyTree}>{t('empty_bom')}</Text>
            )}
          </View>
        </View>
      );
    }

    return (
      <View style={s.tabContent}>
        <View style={[s.grid, isMobile && { flexDirection: 'column' }]}>
          <KpiCard label={t('formules_actives')} value={String(boms.length)} sub="Toutes marques" />
          <KpiCard label={t('en_revision')} value="1" sub="V2 — Savon 100g" color={C.gold} />
        </View>

        <View style={{ height: 24 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={s.sectionLabel}>{t('nomenclatures_produits')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <ActionButton label="Importer BOM public" icon="file-upload" onPress={handleImportBomFromPublic} variant="secondary" loading={bomImporting} />
            {canPerformAction('edit_bom') && boms.some((b) => b.status === 'BROUILLON') && (
              <ActionButton
                label="Valider tous les BROUILLON"
                icon="check-all"
                variant="secondary"
                onPress={async () => {
                  const brouillons = boms.filter((b) => b.status === 'BROUILLON');
                  if (brouillons.length === 0) return;
                  Alert.alert(
                    'Confirmation',
                    `Valider ${brouillons.length} BOM(s) en statut BROUILLON ?`,
                    [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Valider tout', onPress: async () => {
                        for (const b of brouillons) {
                          await supabase!.from('bom_headers').update({ status: 'VALIDE' }).eq('id', b.id);
                        }
                        queryClient.invalidateQueries({ queryKey: ['bom_headers'] });
                      }},
                    ]
                  );
                }}
              />
            )}
            {canPerformAction('edit_bom') && (
              <ActionButton label="Import Excel" icon="file-excel-outline" variant="secondary" onPress={() => setBomImportModalVisible(true)} />
            )}
            {canPerformAction('edit_bom') && (
              <ActionButton label="Nouvelle nomenclature" icon="plus" variant="primary" onPress={handleAddBom} />
            )}
          </View>
        </View>
        {/* BOM — Tableau PC / Tablette */}
        {!isMobile && (
          <View style={s.bomTableWrap}>
            {/* En-tête */}
            <View style={s.bomTableHead}>
              <Text style={[s.bomTh, { flex: 2 }]}>Code / Version</Text>
              <Text style={[s.bomTh, { flex: 3 }]}>Produit</Text>
              <Text style={[s.bomTh, { flex: 1.2 }]}>Type · Batch</Text>
              <Text style={[s.bomTh, { flex: 1 }]}>Statut</Text>
              <Text style={[s.bomTh, { flex: 1, textAlign: 'right' as const }]}>Actions</Text>
            </View>
            {filteredBoms.length === 0 ? (
              <View style={s.bomEmpty}>
                <MaterialCommunityIcons name="file-document-outline" size={36} color="#CBD5E1" />
                <Text style={s.bomEmptyText}>Aucune nomenclature trouvée.</Text>
              </View>
            ) : (
              <FlatList
                data={filteredBoms}
                keyExtractor={bom => bom.id}
                scrollEnabled={false}
                renderItem={({ item: bom, index: idx }) => (
                  <TouchableOpacity
                    style={[s.bomTableRow, idx % 2 === 1 && s.bomTableRowAlt]}
                    onPress={() => setSelectedBom(bom)}
                  >
                    <View style={{ flex: 2 }}>
                      <Text style={s.bomCode}>{bom.code}</Text>
                      <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>v{bom.version}</Text>
                    </View>
                    <Text style={[s.bomProduct, { flex: 3 }]} numberOfLines={2}>
                      {bom.product ? getProductName(bom.product) : t('loading')}
                    </Text>
                    <Text style={[s.bomInfo, { flex: 1.2 }]}>
                      {bom.product?.article_type || 'PF'} · {bom.batch_size_kg?.toLocaleString() || '—'} kg
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Badge label={bom.status} color={bom.status === 'VALIDE' ? C.ok : C.err} />
                    </View>
                    <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity
                        onPress={(e) => {
                          if (Platform.OS === 'web') { (e as any).stopPropagation?.(); }
                          handleExportBomPdf(bom);
                        }}
                        style={{ padding: 4 }}
                      >
                        <MaterialCommunityIcons name="printer" size={17} color="#005BBB" />
                      </TouchableOpacity>
                      {(['ADMIN', 'SUPER_ADMIN', 'PLAN', 'RESP_QUALITE', 'TECH_LABO'] as string[]).includes(profile?.role ?? '') && (
                        <TouchableOpacity
                          onPress={(e) => {
                            if (Platform.OS === 'web') { (e as any).stopPropagation?.(); }
                            handleEditBom(bom);
                          }}
                          style={{ padding: 4 }}
                        >
                          <MaterialCommunityIcons name="pencil-outline" size={17} color="#D97706" />
                        </TouchableOpacity>
                      )}
                      <MaterialCommunityIcons name="chevron-right" size={16} color="#ADB5BD" />
                      {(profile?.role === 'ADMIN' || profile?.role === 'SUPER_ADMIN') && (
                        <TouchableOpacity
                          onPress={(e) => {
                            if (Platform.OS === 'web') { (e as any).stopPropagation?.(); }
                            handleDeleteBom(bom);
                          }}
                          style={{ padding: 4 }}
                        >
                          <MaterialCommunityIcons name="trash-can-outline" size={17} color="#DC2626" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        )}

        {/* BOM — Cartes Mobile */}
        {isMobile && (
          <View style={s.bomGrid}>
            <FlatList
              data={filteredBoms}
              keyExtractor={bom => bom.id}
              scrollEnabled={false}
              numColumns={1}
              renderItem={({ item: bom }) => (
                <TouchableOpacity style={s.bomCard} onPress={() => setSelectedBom(bom)}>
                  <View style={s.bomCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.bomCode}>{bom.code} v{bom.version}</Text>
                      <Text style={s.bomProduct}>{bom.product ? getProductName(bom.product) : t('loading')}</Text>
                    </View>
                    <Badge label={bom.status} color={bom.status === 'VALIDE' ? C.ok : C.err} />
                  </View>
                  <View style={s.bomCardFooter}>
                    <Text style={s.bomInfo}>{bom.product?.article_type || 'PF'} · Batch: {bom.batch_size_kg?.toLocaleString() || '—'} kg</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity
                        onPress={(e) => {
                          if (Platform.OS === 'web') { (e as any).stopPropagation?.(); }
                          handleExportBomPdf(bom);
                        }}
                        style={{ padding: 4 }}
                      >
                        <MaterialCommunityIcons name="printer" size={18} color="#005BBB" />
                      </TouchableOpacity>
                      {(['ADMIN', 'SUPER_ADMIN', 'PLAN', 'RESP_QUALITE', 'TECH_LABO'] as string[]).includes(profile?.role ?? '') && (
                        <TouchableOpacity
                          onPress={(e) => {
                            if (Platform.OS === 'web') { (e as any).stopPropagation?.(); }
                            handleEditBom(bom);
                          }}
                          style={{ padding: 4 }}
                        >
                          <MaterialCommunityIcons name="pencil-outline" size={18} color="#D97706" />
                        </TouchableOpacity>
                      )}
                      <MaterialCommunityIcons name="chevron-right" size={16} color="#ADB5BD" />
                      {(profile?.role === 'ADMIN' || profile?.role === 'SUPER_ADMIN') && (
                        <TouchableOpacity
                          onPress={(e) => {
                            if (Platform.OS === 'web') { (e as any).stopPropagation?.(); }
                            handleDeleteBom(bom);
                          }}
                          style={{ padding: 4, marginLeft: 4 }}
                        >
                          <MaterialCommunityIcons name="trash-can-outline" size={18} color="#DC2626" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        )}
      </View>
    );
  };

  return (
    <AnimatedPage>
      {importing && <ExportOverlay visible={true} progress={importProgress} title="Traitement du fichier de prévisions..." />}
      {bomImporting && <ExportOverlay visible={true} progress={bomImportProgress / 100} title="Import BOM en cours..." />}
      {(loadingBoms || loadingOrders) && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.7)', zIndex: 10 }}>
          <ActivityIndicator size="large" color={C.info} />
        </View>
      )}

      <View style={s.container}>
        <View style={s.tabsHeader}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[s.tabBtn, activeTab === tab && s.tabBtnActive]}
            >
              <Text style={[s.tabBtnText, activeTab === tab && s.tabBtnTextActive]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content}>
          {activeTab === TABS[0] ? renderPDP() : renderBOM()}
        </ScrollView>
      </View>

      <FormModal
        visible={ofModalVisible}
        title={ofFormData.id ? "Modifier l'Ordre de Fabrication" : "Nouvel Ordre de Fabrication"}
        onClose={() => setOfModalVisible(false)}
        onSave={handleSave}
        loading={mutation.isPending}
      >
        <FormInput label="Code OF" value={ofFormData.code ?? ''} editable={false} style={{ backgroundColor: '#F1F3F5', color: '#6C757D' }} />
        {/* Filtres catégorie + recherche — Produit à fabriquer */}
        <View style={{ marginBottom: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 }}>
            Produit à fabriquer
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {(['', 'Savon', 'PH', 'Corde', 'Encaustique', 'Bougie'] as const).map((cat) => (
              <TouchableOpacity
                key={cat}
                onPress={() => setOfCategory(cat)}
                style={{
                  paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20,
                  backgroundColor: ofCategory === cat ? C.primary : '#F1F5F9',
                  borderWidth: 1,
                  borderColor: ofCategory === cat ? C.primary : '#E2E8F0',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: ofCategory === cat ? '#FFF' : '#475569' }}>
                  {cat === '' ? 'Tous' : cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <FormSelect
            label=""
            value={ofFormData.product_id ?? ''}
            options={(() => {
              let list = filteredProducts;
              if (ofCategory) {
                list = list.filter(p => getProductName(p).toLowerCase().includes(ofCategory.toLowerCase()));
              }
              return list.map(p => ({ label: getProductName(p), value: p.id }));
            })()}
            onSelect={v => {
              // Auto-sélectionner le BOM VALIDE du produit choisi
              const matchingBom = filteredBoms.find(
                (b: BomHeader) => b.product_id === v && b.status === 'VALIDE'
              ) ?? filteredBoms.find((b: BomHeader) => b.product_id === v);
              setOfFormData({
                ...ofFormData,
                product_id: v,
                bom_header_id: matchingBom?.id ?? ofFormData.bom_header_id,
              });
            }}
            searchable
          />
        </View>
        <FormSelect
          label="Nomenclature (BOM)"
          value={ofFormData.bom_header_id ?? ''}
          options={filteredBoms.map(b => ({ label: `${b.code} (v${b.version})`, value: b.id }))}
          onSelect={v => setOfFormData({ ...ofFormData, bom_header_id: v })}
        />
        <FormInput label="Quantité planifiée" value={String(ofFormData.qty_planned ?? '')} onChangeText={val => setOfFormData({ ...ofFormData, qty_planned: val as any })} keyboardType="numeric" />
        <FormDatePicker label="Date planifiée" value={ofFormData.planned_date ?? ''} onChangeDate={t => setOfFormData({ ...ofFormData, planned_date: t })} />
      </FormModal>

      {/* Modal BOM Header */}
      <FormModal
        visible={bomModalVisible}
        title={bomFormData.id ? "Modifier nomenclature" : "Nouvelle nomenclature"}
        onClose={() => setBomModalVisible(false)}
        onSave={handleSaveBom}
        loading={bomMutation.isPending}
      >
        <FormInput label="Code" value={bomFormData.code || ''} editable={!bomFormData.id} onChangeText={v => setBomFormData({ ...bomFormData, code: v })} />
        <FormSelect
          label="Produit"
          value={bomFormData.product_id ?? ''}
          options={filteredProducts.map(p => ({ label: getProductName(p), value: p.id }))}
          onSelect={v => setBomFormData({ ...bomFormData, product_id: v })}
        />
        <FormInput label="Version" value={String(bomFormData.version || 1)} onChangeText={v => setBomFormData({ ...bomFormData, version: v as any })} keyboardType="numeric" />
        <FormInput label="Taille lot standard (kg)" value={String(bomFormData.batch_size_kg || '')} onChangeText={v => setBomFormData({ ...bomFormData, batch_size_kg: v as any })} keyboardType="numeric" />
        <FormInput label="Notes" value={bomFormData.notes || ''} onChangeText={v => setBomFormData({ ...bomFormData, notes: v })} multiline />
      </FormModal>

      {/* Modal BOM Line */}
      <FormModal
        visible={bomLineModalVisible}
        title={bomLineFormData.id ? "Modifier composant" : "Ajouter composant"}
        onClose={() => setBomLineModalVisible(false)}
        onSave={handleSaveBomLine}
        loading={bomLineMutation.isPending}
      >
        <FormSelect
          label="Composant"
          value={bomLineFormData.component_id ?? ''}
          options={allArticles.filter(a => a.article_type === 'MP' || a.article_type === 'EMB').map(a => ({ label: `[${a.code}] ${a.name}`, value: a.id }))}
          onSelect={v => setBomLineFormData({ ...bomLineFormData, component_id: v })}
          searchable
        />
        <FormInput label="Quantité" value={String(bomLineFormData.qty || '')} onChangeText={v => setBomLineFormData({ ...bomLineFormData, qty: v as any })} keyboardType="numeric" />
        <FormSelect
          label="Unité"
          value={bomLineFormData.unit || 'kg'}
          options={[
            { label: 'kg', value: 'kg' }, { label: 'L', value: 'L' }, { label: 'g', value: 'g' },
            { label: 'unité', value: 'unité' }, { label: 'm', value: 'm' },
          ]}
          onSelect={v => setBomLineFormData({ ...bomLineFormData, unit: v })}
        />
        <FormInput label="Pourcentage (%)" value={String(bomLineFormData.pct || '')} onChangeText={v => setBomLineFormData({ ...bomLineFormData, pct: v })} keyboardType="numeric" />
        <FormInput label="Ordre" value={String(bomLineFormData.sort_order || 0)} onChangeText={v => setBomLineFormData({ ...bomLineFormData, sort_order: v as any })} keyboardType="numeric" />
      </FormModal>

      {/* Modal choix mode Import PDP */}
      {importModalVisible && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <View style={{ backgroundColor: '#FFF', borderRadius: 16, padding: 28, width: 420, maxWidth: '90%', ...Platform.select({ web: { boxShadow: '0px 2px 20px rgba(0,0,0,0.2)' }, default: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20 } }) }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#1A1A1A' }}>Importer les prévisions</Text>
              <TouchableOpacity onPress={() => setImportModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={22} color="#6C757D" />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: '#6C757D', marginBottom: 20, lineHeight: 20 }}>
              Choisissez comment importer les données du fichier PDP :
            </Text>

            {/* Option 1 — Mettre à jour */}
            <TouchableOpacity
              onPress={() => setImportMode('update')}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, borderRadius: 10, borderWidth: 2, borderColor: importMode === 'update' ? '#1A56DB' : '#E9ECEF', backgroundColor: importMode === 'update' ? '#EEF2FF' : '#FAFAFA', marginBottom: 12 }}
            >
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: importMode === 'update' ? '#1A56DB' : '#ADB5BD', backgroundColor: importMode === 'update' ? '#1A56DB' : 'transparent', justifyContent: 'center', alignItems: 'center', marginTop: 1 }}>
                {importMode === 'update' && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF' }} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 }}>Mettre à jour</Text>
                <Text style={{ fontSize: 12, color: '#6C757D', lineHeight: 18 }}>
                  Les produits du fichier sont mis à jour. Les produits absents du fichier conservent leurs anciennes valeurs.
                </Text>
              </View>
            </TouchableOpacity>

            {/* Option 2 — Remplacer l'année */}
            <TouchableOpacity
              onPress={() => setImportMode('replace')}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, borderRadius: 10, borderWidth: 2, borderColor: importMode === 'replace' ? '#E63946' : '#E9ECEF', backgroundColor: importMode === 'replace' ? '#FFF5F5' : '#FAFAFA', marginBottom: 24 }}
            >
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: importMode === 'replace' ? '#E63946' : '#ADB5BD', backgroundColor: importMode === 'replace' ? '#E63946' : 'transparent', justifyContent: 'center', alignItems: 'center', marginTop: 1 }}>
                {importMode === 'replace' && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF' }} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 }}>Remplacer l'année</Text>
                <Text style={{ fontSize: 12, color: '#6C757D', lineHeight: 18 }}>
                  Toutes les prévisions de l'année détectée dans le fichier sont d'abord supprimées, puis remplacées par les nouvelles données.
                </Text>
                {importMode === 'replace' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: '#FEE2E2', padding: 8, borderRadius: 6 }}>
                    <MaterialCommunityIcons name="alert" size={14} color="#E63946" />
                    <Text style={{ fontSize: 11, color: '#E63946', fontWeight: '600', flex: 1 }}>Action irréversible — toutes les données existantes de cette année seront perdues.</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setImportModalVisible(false)}
                style={{ flex: 1, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#E9ECEF', alignItems: 'center' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#6C757D' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleImportPDP(importMode)}
                style={{ flex: 2, padding: 14, borderRadius: 8, backgroundColor: importMode === 'replace' ? '#E63946' : '#1A56DB', alignItems: 'center' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>
                  {importMode === 'replace' ? 'Remplacer et importer' : 'Choisir le fichier'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Modal pour Scénario What-If */}
      <FormModal
        visible={whatIfModalVisible}
        title="Simuler Scénario What-If (PDP)"
        onClose={() => setWhatIfModalVisible(false)}
        onSave={handleRunWhatIf}
        loading={false}
      >
        <View style={{ padding: 12, backgroundColor: '#E8F0FE', borderRadius: 8, borderWidth: 1, borderColor: '#1A56DB', marginBottom: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <MaterialCommunityIcons name="information-outline" size={18} color={C.info} style={{ marginTop: 1 }} />
          <Text style={{ fontSize: 13, color: C.info, fontWeight: '600', flex: 1 }}>
            {t('what_if_instruction')}
          </Text>
        </View>
        {/* Recherche + filtres catégorie pour le produit */}
        <View style={{ marginBottom: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 }}>
            {t('produit_concerne')}
          </Text>
          {/* Filtres catégorie */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {(['', 'Savon', 'Bougie', 'Encaustique', 'PH', 'Corde'] as const).map((cat) => (
              <TouchableOpacity
                key={cat}
                onPress={() => setWhatIfCategory(cat)}
                style={{
                  paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20,
                  backgroundColor: whatIfCategory === cat ? C.primary : '#F1F5F9',
                  borderWidth: 1,
                  borderColor: whatIfCategory === cat ? C.primary : '#E2E8F0',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: whatIfCategory === cat ? '#FFF' : '#475569' }}>
                  {cat === '' ? 'Tous' : cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <FormInput
          label="Quantité par Carton (unités)"
          value={whatIfFormData.units_per_carton || ''}
          onChangeText={val => {
            const cartons = whatIfFormData.cartons ? parseFloat(whatIfFormData.cartons) : 0;
            const units = val ? parseFloat(val) : 0;
            const newQty = (cartons > 0 && units > 0) ? (cartons * units).toString() : whatIfFormData.qty;
            setWhatIfFormData({ ...whatIfFormData, units_per_carton: val, qty: newQty });
          }}
          keyboardType="numeric"
        />
        <FormInput
          label="Nombre de Cartons"
          value={whatIfFormData.cartons || ''}
          onChangeText={val => {
            const units = whatIfFormData.units_per_carton ? parseFloat(whatIfFormData.units_per_carton) : 0;
            const cartons = val ? parseFloat(val) : 0;
            const newQty = (cartons > 0 && units > 0) ? (cartons * units).toString() : whatIfFormData.qty;
            setWhatIfFormData({ ...whatIfFormData, cartons: val, qty: newQty });
          }}
          keyboardType="numeric"
        />
        <FormInput
          label="Quantité Totale à simuler (unités de PF)"
          value={whatIfFormData.qty || ''}
          onChangeText={val => setWhatIfFormData({ ...whatIfFormData, qty: val, cartons: '', units_per_carton: '' })}
          keyboardType="numeric"
        />
        <FormSelect
          label=""
          value={whatIfFormData.product_id ?? ''}
          options={(() => {
            let list = filteredProducts;
            if (whatIfCategory) {
              list = list.filter(p => getProductName(p).toLowerCase().includes(whatIfCategory.toLowerCase()));
            }
            return list.map(p => ({ label: getProductName(p), value: p.id }));
          })()}
          onSelect={v => setWhatIfFormData({ ...whatIfFormData, product_id: v })}
          searchable
        />
        <FormSelect
          label={t('mois_prevision')}
          value={whatIfFormData.month_offset ?? ''}
          options={[
            { label: t('mois_actuel'), value: '0' },
            { label: t('mois_plus_1'), value: '1' },
            { label: t('mois_plus_2'), value: '2' },
            { label: t('mois_plus_3'), value: '3' },
          ]}
          onSelect={v => setWhatIfFormData({ ...whatIfFormData, month_offset: v })}
        />
        <FormInput
          label="Quantité prévue (Cartons / Unités)"
          value={whatIfFormData.qty || ''}
          onChangeText={val => setWhatIfFormData({ ...whatIfFormData, qty: val })}
          keyboardType="numeric"
          placeholder="Ex: 1000"
        />
        <FormInput
          label={t('changement_demande')}
          value={whatIfFormData.demand_change ?? ''}
          onChangeText={val => setWhatIfFormData({ ...whatIfFormData, demand_change: val })}
          keyboardType="numeric"
          placeholder="ex: 10 (pour +10%) ou -5 (pour -5%)"
        />
      </FormModal>
      {/* ── Modal : Déclarer un arrêt ── */}
      <FormModal
        visible={stopModalVisible}
        title={`Déclarer un arrêt — ${stopTargetOrder?.code}`}
        onClose={() => setStopModalVisible(false)}
        onSave={handleSaveStop}
        loading={actionLoading}
      >
        <FormSelect
          label="Catégorie d'arrêt"
          value={stopFormData.categorie ?? ''}
          options={[
            { label: 'Panne machine', value: 'PANNE' },
            { label: 'Nettoyage / Maintenance', value: 'MAINTENANCE' },
            { label: 'Rupture matière', value: 'RUPTURE_MP' },
            { label: 'Absence opérateur', value: 'ABSENCE' },
            { label: 'Coupure énergie', value: 'ENERGIE' },
            { label: 'Changement de production', value: 'CHANGEMENT' },
            { label: 'Autre', value: 'AUTRE' },
          ]}
          onSelect={v => setStopFormData({ ...stopFormData, categorie: v })}
        />
        <FormInput
          label="Raison détaillée"
          value={stopFormData.raison ?? ''}
          onChangeText={v => setStopFormData({ ...stopFormData, raison: v })}
          placeholder="Décrivez la cause de l'arrêt..."
        />
        <FormInput
          label="Durée de l'arrêt (minutes)"
          value={String(stopFormData.duree_min ?? '')}
          onChangeText={v => setStopFormData({ ...stopFormData, duree_min: v as any })}
          keyboardType="numeric"
          placeholder="ex: 45"
        />
      </FormModal>

      {/* ── Modal : Clôturer un OF ── */}
      <FormModal
        visible={closeModalVisible}
        title={`Clôturer l'OF — ${closeTargetOrder?.code}`}
        onClose={() => setCloseModalVisible(false)}
        onSave={handleCloseOrder}
        loading={actionLoading}
      >
        <View style={{ padding: 12, backgroundColor: '#E8F0FE', borderRadius: 8, borderWidth: 1, borderColor: '#1A56DB', marginBottom: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <MaterialCommunityIcons name="information-outline" size={18} color={C.info} style={{ marginTop: 1 }} />
          <Text style={{ fontSize: 13, color: C.info, fontWeight: '600', flex: 1 }}>
            Quantité planifiée : {closeTargetOrder?.qty_planned?.toLocaleString()} {closeTargetOrder?.product?.unit}
          </Text>
        </View>
        <FormInput
          label="Quantité produite"
          value={String(closeFormData.qty_produced ?? '')}
          onChangeText={v => setCloseFormData({ ...closeFormData, qty_produced: v as any })}
          keyboardType="numeric"
          placeholder={`ex: ${closeTargetOrder?.qty_planned}`}
        />
        <FormInput
          label="Quantité rejetée (défauts)"
          value={String(closeFormData.qty_rejected ?? '')}
          onChangeText={v => setCloseFormData({ ...closeFormData, qty_rejected: v })}
          keyboardType="numeric"
          placeholder="0"
        />
        <FormInput
          label="Date/heure de fin"
          value={closeFormData.completed_at ?? ''}
          onChangeText={v => setCloseFormData({ ...closeFormData, completed_at: v })}
          placeholder="YYYY-MM-DDTHH:MM"
        />
      </FormModal>

      {/* ── Modal Import BOM Excel ─────────────────────────────────────────── */}
      <Modal
        visible={bomImportModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => { if (!bomImporting) setBomImportModalVisible(false); }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#FFF', borderRadius: 16, width: '100%', maxWidth: 520, padding: 24, gap: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#F0FDF4', justifyContent: 'center', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="file-excel-outline" size={22} color="#1E513B" />
                </View>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>Import Nomenclature (BOM)</Text>
                  <Text style={{ fontSize: 12, color: '#9CA3AF' }}>Matrice Excel MP × Produits finis</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => !bomImporting && setBomImportModalVisible(false)} style={{ padding: 6, borderRadius: 8, backgroundColor: '#F3F4F6', opacity: bomImporting ? 0.4 : 1 }}>
                <MaterialCommunityIcons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Format info */}
            <View style={{ backgroundColor: '#F0F9FF', borderRadius: 10, padding: 14, gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#0284C7' }}>Format attendu :</Text>
              <View style={{ gap: 3 }}>
              <Text style={{ fontSize: 11, color: '#374151' }}>{'\u2022 Ligne 1 : noms des produits finis (colonnes B, C, D…)'}</Text>
              <Text style={{ fontSize: 11, color: '#374151' }}>{'\u2022 Colonne A : noms des matières premières'}</Text>
              <Text style={{ fontSize: 11, color: '#374151' }}>{'\u2022 Cellules : quantité (kg) de MP par unité de PF'}</Text>
              <Text style={{ fontSize: 11, color: '#374151' }}>{'\u2022 Feuille active = première feuille du classeur'}</Text>
            </View>
            </View>

            {/* Mode sélection */}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151' }}>Mode d'import :</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[
                  { value: 'replace', label: '🔄 Remplacer', desc: 'Supprime les lignes existantes puis recrée' },
                  { value: 'update', label: '➕ Compléter', desc: 'Ajoute sans supprimer les lignes existantes' },
                ].map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => setBomImportMode(opt.value as any)}
                    style={{
                      flex: 1, padding: 10, borderRadius: 10, borderWidth: 2,
                      borderColor: bomImportMode === opt.value ? '#1E513B' : '#E5E7EB',
                      backgroundColor: bomImportMode === opt.value ? '#F0FDF4' : '#FAFAFA',
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: bomImportMode === opt.value ? '#1E513B' : '#374151' }}>{opt.label}</Text>
                    <Text style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>{opt.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Log résultats */}
            {bomImportLog.length > 0 && (
              <ScrollView style={{ maxHeight: 180, backgroundColor: '#F9FAFB', borderRadius: 8, padding: 10 }}>
                {bomImportLog.map((line, i) => (
                  <Text key={i} style={{ fontSize: 11, color: '#374151', marginBottom: 2 }}>{line}</Text>
                ))}
              </ScrollView>
            )}

            {/* Actions */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center' }}
                onPress={() => { setBomImportModalVisible(false); setBomImportLog([]); }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151' }}>Fermer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 2, flexDirection: 'row', padding: 12, borderRadius: 10, backgroundColor: '#1E513B', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                onPress={handleImportBOM}
                disabled={bomImporting}
              >
                <MaterialCommunityIcons name="upload-outline" size={16} color="#FFF" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>Choisir le fichier Excel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </AnimatedPage>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  tabsHeader: { flexDirection: 'row', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E9ECEF', paddingHorizontal: 24 },
  tabBtn: { paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: C.info },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: '#ADB5BD' },
  tabBtnTextActive: { color: C.info },
  content: { padding: 24 },
  tabContent: { flex: 1 },
  grid: { flexDirection: 'row', gap: 16 },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: '#ADB5BD', letterSpacing: 1, marginBottom: 12 },
  table: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E9ECEF', overflow: 'hidden' },
  orderRow: { flexDirection: 'row', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F8F9FA', alignItems: 'center' },
  orderRef: { fontSize: 11, fontWeight: '700', color: '#ADB5BD', fontFamily: Platform.OS === 'web' ? 'Menlo' : 'monospace' },
  orderTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginTop: 4 },
  orderDate: { fontSize: 12, color: '#6C757D', marginTop: 2 },
  orderQty: { fontSize: 15, fontWeight: '800', color: '#1A1A1A' },
  bomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  bomCard: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E9ECEF', padding: 20, width: Platform.OS === 'web' ? '31%' : '100%' },
  bomTableWrap: { backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: '#E9ECEF', overflow: 'hidden', marginBottom: 8, ...Platform.select({ web: { boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }, default: { elevation: 1 } }) },
  bomTableHead: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 16, backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#E9ECEF' },
  bomTh: { fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: 0.4 },
  bomTableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  bomTableRowAlt: { backgroundColor: '#FAFBFC' },
  bomEmpty: { padding: 36, alignItems: 'center', gap: 10 },
  bomEmptyText: { fontSize: 13, color: '#94A3B8' },
  bomCardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  bomCode: { fontSize: 11, fontWeight: '700', color: '#ADB5BD' },
  bomProduct: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginTop: 4 },
  bomCardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F8F9FA', paddingTop: 12 },
  bomInfo: { fontSize: 12, color: '#6C757D' },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backText: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  bomHero: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  bomHeroCode: { fontSize: 12, fontWeight: '700', color: '#ADB5BD', letterSpacing: 1 },
  bomHeroTitle: { fontSize: 24, fontWeight: '800', color: '#FFF', marginTop: 4 },
  heroStat: { alignItems: 'flex-end' },
  heroStatLab: { fontSize: 10, fontWeight: '800', color: '#ADB5BD', letterSpacing: 1 },
  heroStatVal: { fontSize: 20, fontWeight: '800', color: '#FFF', marginTop: 4 },
  treeContainer: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E9ECEF', padding: 16 },
  treeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F8F9FA' },
  qtyDisplay: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, minWidth: 80, justifyContent: 'flex-end' },
  qtyDisplayEditable: { backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#E9ECEF', borderStyle: 'dashed' },
  qtyEditRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 140, justifyContent: 'flex-end' },
  qtyInput: { borderWidth: 1.5, borderColor: '#007BFF', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 14, fontWeight: '700', color: '#1A1A1A', minWidth: 70, textAlign: 'right', backgroundColor: '#FFF' },
  qtyUnit: { fontSize: 12, color: '#6C757D', fontWeight: '600' },
  qtyActionBtn: { padding: 5, borderRadius: 4, backgroundColor: '#F8F9FA' },
  treeToggle: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  nodeInfo: { flex: 1, gap: 2 },
  nodeCode: { fontSize: 11, fontWeight: '700', color: '#ADB5BD', fontFamily: Platform.OS === 'web' ? 'Menlo' : 'monospace' },
  nodeName: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  nodeQty: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', textAlign: 'right', width: 100 },
  emptyTree: { padding: 40, textAlign: 'center', color: '#ADB5BD', fontSize: 14 },
  resultsSection: { marginTop: 32 },
  tableContainer: { height: 300, backgroundColor: '#FFF', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E9ECEF', marginTop: 12 },
  tdData: { fontSize: 13, color: '#1A1A1A', fontWeight: '600', fontFamily: Platform.OS === 'web' ? 'JetBrains Mono' : 'monospace' },
  yearChip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, backgroundColor: '#F1F3F5' },
  yearChipActive: { backgroundColor: C.info },
  yearChipText: { fontSize: 12, fontWeight: '600', color: '#6C757D' },
  yearChipTextActive: { color: '#FFF' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, minWidth: 90, justifyContent: 'center' },
  actionBtnText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
});
