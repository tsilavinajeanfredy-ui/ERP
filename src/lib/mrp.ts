/**
 * ERP GSI — Moteur MRP Réel avec Explosion de Nomenclature (BOM Explosion)
 *
 * Processus en 3 phases :
 *  Phase 1 — Besoins PF  : calcule les besoins bruts en Produits Finis
 *                           (ordres de production ouverts + proxy reorder_point)
 *  Phase 2 — BOM Explosion: pour chaque PF, éclate la nomenclature active
 *                           → besoins MP = qty_composant × (besoin_PF / batch_size)
 *  Phase 3 — Besoins nets : pour chaque MP, agrège besoins bruts issus de tous
 *                           les PF, soustrait stock libéré + entrées en cours
 *                           → besoins_nets = MAX(0, besoins_bruts − stock − entrées)
 *
 * Les articles sans BOM (ni MP ni PF avec nomenclature) sont calculés en mode
 * dégradé : proxy reorder_point / safety_stock uniquement.
 */

import { supabase } from './supabase';

export interface MRPResult {
  id: string;
  code: string;
  name: string;
  type: string;
  stock: number;
  consumption: number;   // besoin PF source (pour les MP) ou propre conso (pour PF)
  needs: number;         // besoins bruts (avant déduction stock/entrées)
  incomingOrders: number;
  safety: number;
  net: number;           // besoins nets = MAX(0, needs − stock − incoming)
  action: 'RAS' | 'RECOMMANDER' | 'COMMANDE_URGENTE' | 'RUPTURE_RISQUE';
  priority: number;
  manufacturingLeadTime: number;
  supplierLeadTime: number;
  totalLeadTime: number;
  recommendedOrderDate: string | null;
  // Traçabilité BOM : quels PF génèrent ce besoin MP
  sourceProducts?: { productCode: string; productName: string; qty: number }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcAction(
  net: number,
  stock: number,
  safety: number,
  needs: number,
): { action: MRPResult['action']; priority: number } {
  if (net <= 0) return { action: 'RAS', priority: 0 };
  if (safety > 0 && stock < safety)   return { action: 'RUPTURE_RISQUE',   priority: 3 };
  if (net >= needs * 0.5)             return { action: 'COMMANDE_URGENTE', priority: 2 };
  return { action: 'RECOMMANDER', priority: 1 };
}

function calcDeadline(totalLeadTime: number): string | null {
  if (totalLeadTime <= 0) return null;
  const d = new Date();
  d.setDate(d.getDate() + totalLeadTime);
  return d.toISOString().split('T')[0];
}

// ─── Calcul MRP principal ────────────────────────────────────────────────────

export async function calculateMRP(whatIfScenario?: {
  product_id?: string;
  demand_change?: string;
}): Promise<MRPResult[]> {
  if (!supabase) throw new Error('Supabase not configured');

  try {
    // ── Chargement des données ──────────────────────────────────────────────

    // Articles actifs
    const { data: articles, error: articlesError } = await supabase
      .from('articles')
      .select('*, default_supplier:suppliers(lead_time_days, name)')
      .eq('active', true);
    if (articlesError) throw articlesError;
    if (!articles || articles.length === 0) return [];

    // Index par id pour recherche O(1)
    const articleById = new Map<string, any>(articles.map((a: any) => [a.id, a]));

    // BOM Headers actifs + leurs lignes + composant
    // Note: bom_status enum = BROUILLON | VALIDE | ARCHIVE
    const { data: bomHeaders, error: bomErr } = await supabase
      .from('bom_headers')
      .select('id, product_id, batch_size_kg, status, bom_lines:bom_lines(id, component_id, qty, unit)')
      .eq('status', 'VALIDE');
    if (bomErr) console.warn('BOM headers error:', bomErr.message);

    // BOM index : product_id → bom (on garde le premier VALIDE)
    const bomByProductId = new Map<string, any>();
    if (bomHeaders) {
      for (const bom of bomHeaders) {
        if (!bomByProductId.has(bom.product_id)) {
          bomByProductId.set(bom.product_id, bom);
        }
      }
    }

    // Ordres de production ouverts — status est un TEXT, valeurs: PLANIFIE | EN_COURS | ARRETE | TERMINE | CLOTURE
    // On prend PLANIFIE + EN_COURS (= besoins réels en attente ou en fabrication)
    // Note: la colonne s'appelle bom_header_id dans le schéma (pas bom_id)
    const { data: productionOrders } = await supabase
      .from('production_orders')
      .select('product_id, qty_planned, bom_header_id, status')
      .in('status', ['PLANIFIE', 'EN_COURS']);

    // Stock réel (lots libérés)
    const { data: stockData } = await supabase
      .from('lots')
      .select('article_id, qty_current')
      .eq('cqlib_status', 'LIBERE');

    // Entrées prévues (DA en cours) — da_status enum = EN_COURS|RETARD|LIVRE|CLOS|ANNULE
    // RECEPTIONNE n'existe pas dans l'enum → on filtre uniquement les statuts présents
    const { data: daImportData } = await supabase
      .from('da_import')
      .select('article_id, qty_kg, unit')
      .eq('status', 'EN_COURS');

    const { data: daLocalData } = await supabase
      .from('da_local')
      .select('article_id, qty, unit')
      .eq('status', 'EN_COURS');

    // ── Facteur what-if ─────────────────────────────────────────────────────
    const demandFactor = whatIfScenario?.demand_change
      ? 1 + parseFloat(whatIfScenario.demand_change) / 100
      : 1.0;

    // ── Helpers stock / entrées ─────────────────────────────────────────────
    const getStock = (articleId: string): number =>
      stockData?.filter(l => l.article_id === articleId)
        .reduce((s, l) => s + (l.qty_current || 0), 0) ?? 0;

    const getIncoming = (articleId: string): number =>
      (daImportData?.filter(d => d.article_id === articleId)
        .reduce((s, d) => s + (d.qty_kg || 0), 0) ?? 0) +
      (daLocalData?.filter(d => d.article_id === articleId)
        .reduce((s, d) => s + (d.qty || 0), 0) ?? 0);

    // ── Phase 1 : Besoins bruts en Produits Finis ───────────────────────────
    //
    // Source A : ordres de production ouverts → qty_planned est le besoin réel
    // Source B : proxy safety_stock / reorder_point si aucun ordre (mode dégradé)
    //
    // Map : product_id → besoin_brut_PF (en unité produit, ex: kg de PF)

    const pfDemand = new Map<string, number>(); // article_id → besoin brut PF

    // Source A — ordres de production
    if (productionOrders) {
      for (const order of productionOrders) {
        const existing = pfDemand.get(order.product_id) ?? 0;
        pfDemand.set(order.product_id, existing + (order.qty_planned || 0));
      }
    }

    // Source B — pour les PF sans ordre, utiliser proxy si reorder_point > 0
    for (const art of articles) {
      if ((art.article_type || '').toUpperCase() !== 'PF') continue;
      if (pfDemand.has(art.id)) continue; // déjà couvert par un ordre réel
      const proxy = (art.reorder_point || art.safety_stock || 0) * demandFactor;
      if (proxy > 0) pfDemand.set(art.id, proxy);
    }

    // Appliquer le facteur what-if sur les ordres réels uniquement
    // (le proxy Source B intègre déjà demandFactor à la ligne 164)
    if (whatIfScenario?.demand_change) {
      for (const order of (productionOrders ?? [])) {
        const pid = order.product_id;
        if (!pid) continue;
        const existing = pfDemand.get(pid) ?? 0;
        // On remplace seulement si la valeur vient d'un ordre réel (pas d'un proxy)
        // Pour simplifier : on réapplique le facteur sur la valeur de l'ordre uniquement
        pfDemand.set(pid, (order.qty_planned || 0) * demandFactor);
      }
    }

    // ── Phase 2 : Explosion BOM → besoins bruts MP ─────────────────────────
    //
    // Pour chaque PF avec besoin, on cherche sa BOM active.
    // Pour chaque ligne BOM (composant MP) :
    //   besoin_MP += qty_ligne × (besoin_PF / batch_size_kg)
    //
    // Map : component_id → { totalQty, sources[] }

    const mpDemand = new Map<string, {
      totalQty: number;
      sources: { productCode: string; productName: string; qty: number }[];
    }>();

    const pfWithBom = new Set<string>();  // PF couverts par une BOM
    const pfWithoutBom = new Set<string>(); // PF sans BOM

    for (const [productId, pfQty] of pfDemand) {
      const bom = bomByProductId.get(productId);
      if (!bom || !bom.bom_lines || bom.bom_lines.length === 0) {
        pfWithoutBom.add(productId);
        continue;
      }
      pfWithBom.add(productId);

      const batchSize = bom.batch_size_kg || 1;
      const multiplier = pfQty / batchSize; // nombre de batches nécessaires

      const pfArticle = articleById.get(productId);
      const pfCode = pfArticle?.code ?? productId;
      const pfName = pfArticle?.name ?? '—';

      for (const line of bom.bom_lines) {
        const compId = line.component_id;
        if (!compId) continue;

        const qtyNeeded = (line.qty || 0) * multiplier;
        const existing = mpDemand.get(compId) ?? { totalQty: 0, sources: [] };
        existing.totalQty += qtyNeeded;
        existing.sources.push({ productCode: pfCode, productName: pfName, qty: Math.round(qtyNeeded * 1000) / 1000 });
        mpDemand.set(compId, existing);
      }
    }

    // ── Phase 3 : Calcul des besoins nets ───────────────────────────────────

    const results: MRPResult[] = [];

    // 3a — Articles MP issus de l'explosion BOM
    for (const [componentId, demand] of mpDemand) {
      const article = articleById.get(componentId);
      if (!article) continue;

      const stock    = getStock(componentId);
      const incoming = getIncoming(componentId);
      const safety   = article.safety_stock || 0;
      const needs    = Math.round(demand.totalQty);
      const net      = Math.max(0, needs - stock - incoming);

      const manufacturingLeadTime = article.manufacturing_lead_time_days || 0;
      const supplierLeadTime      = article.default_supplier?.lead_time_days || 7;
      const totalLeadTime         = Math.max(manufacturingLeadTime, supplierLeadTime);

      const { action, priority } = calcAction(net, stock, safety, needs);

      results.push({
        id: componentId,
        code: article.code,
        name: article.name,
        type: (article.article_type || 'MP').toUpperCase(),
        stock:          Math.round(stock),
        consumption:    needs, // besoin brut = "consommation" affichée
        needs,
        incomingOrders: Math.round(incoming),
        safety,
        net,
        action: net > 0 ? action : 'RAS',
        priority:       net > 0 ? priority : 0,
        manufacturingLeadTime,
        supplierLeadTime,
        totalLeadTime,
        recommendedOrderDate: net > 0 ? calcDeadline(totalLeadTime) : null,
        sourceProducts: demand.sources,
      });
    }

    // 3b — PF sans BOM + MP autonomes (non issus d'une BOM) : mode dégradé
    //       On calcule quand même pour ne pas les ignorer

    const handledIds = new Set<string>([...mpDemand.keys(), ...pfWithBom]);

    for (const article of articles) {
      if (handledIds.has(article.id)) continue;

      const articleType: string = (article.article_type || '').toUpperCase();

      // PF avec BOM déjà traités ci-dessus → skip
      // PF sans BOM : on les inclut pour signaler l'absence de nomenclature
      // MP non référencé dans une BOM active : proxy classique

      const stock      = getStock(article.id);
      const incoming   = getIncoming(article.id);
      const safety     = article.safety_stock || 0;

      let needs = 0;
      let consumption = 0;

      if (articleType === 'PF') {
        // PF sans BOM : besoin = pfDemand si existant, sinon proxy
        const pfQty = pfDemand.get(article.id) ?? 0;
        consumption = pfQty > 0 ? pfQty : (article.reorder_point || article.safety_stock || 0) * demandFactor;
        needs = Math.round(consumption);
      } else {
        // MP/EMB/autre sans BOM parent : proxy reorder_point
        const proxy = (article.reorder_point || article.safety_stock || 0) * demandFactor;
        if (proxy <= 0) continue; // pas de proxy → on ignore
        consumption = proxy;
        needs = Math.round(2 * proxy); // formule CCTP : 2×conso
      }

      const net = Math.max(0, needs - stock - incoming);
      if (net === 0 && stock >= safety) continue; // RAS → pas dans les résultats

      const manufacturingLeadTime = article.manufacturing_lead_time_days || 0;
      const supplierLeadTime      = article.default_supplier?.lead_time_days || 7;
      const totalLeadTime         = Math.max(manufacturingLeadTime, supplierLeadTime);

      const { action, priority } = calcAction(net, stock, safety, needs);

      results.push({
        id: article.id,
        code: article.code,
        name: article.name,
        type: articleType || 'MP',
        stock:          Math.round(stock),
        consumption:    Math.round(consumption),
        needs,
        incomingOrders: Math.round(incoming),
        safety,
        net,
        action: net > 0 ? action : 'RAS',
        priority:       net > 0 ? priority : 0,
        manufacturingLeadTime,
        supplierLeadTime,
        totalLeadTime,
        recommendedOrderDate: net > 0 ? calcDeadline(totalLeadTime) : null,
      });
    }

    // ── Tri final : urgence décroissante ────────────────────────────────────
    // Comportement recherché par les tests :
    // - Inclure les composants issus d'une BOM même si leur besoin arrondi est 0
    //   (ex: colorant 0.252 → needs = 0) => garder ces lignes pour traçabilité.
    // - Exclure les composants dont le besoin brut > 0 mais dont le net == 0
    //   (stock largement suffisant) afin de ne pas polluer la liste.
    return results
      .filter(r => r.net > 0 || r.needs === 0)
      .sort((a, b) => b.priority - a.priority || b.net - a.net);

  } catch (error) {
    console.error('Erreur calcul MRP:', error);
    throw error;
  }
}

// ─── Hook React ──────────────────────────────────────────────────────────────

import { useState } from 'react';

export function useRealMRP() {
  const [calculating, setCalculating] = useState(false);
  const [progress,    setProgress]    = useState(0);
  const [status,      setStatus]      = useState<'IDLE' | 'RUNNING' | 'COMPLETED'>('IDLE');
  const [results,     setResults]     = useState<MRPResult[]>([]);
  const [error,       setError]       = useState<string | null>(null);

  const runMRP = async (whatIfScenario?: { product_id?: string; demand_change?: string }): Promise<MRPResult[]> => {
    setStatus('RUNNING');
    setCalculating(true);
    setProgress(0);
    setError(null);

    try {
      // Progression simulée pendant le fetch
      const tick = async (p: number) => { setProgress(p); await new Promise(r => setTimeout(r, 200)); };
      await tick(0.15); // Chargement articles
      await tick(0.30); // Chargement BOM
      await tick(0.50); // Chargement stocks
      await tick(0.70); // Explosion BOM
      await tick(0.90); // Calcul besoins nets

      const mrpResults = await calculateMRP(whatIfScenario);
      setResults(mrpResults);
      setProgress(1);
      setStatus('COMPLETED');
      return mrpResults; // ← retourner pour éviter le stale closure
    } catch (err: any) {
      setError(err.message || 'Erreur lors du calcul MRP');
      setStatus('IDLE');
      console.error('Erreur MRP:', err);
      return [];
    } finally {
      setCalculating(false);
    }
  };

  return { calculating, progress, status, runMRP, results, error };
}
