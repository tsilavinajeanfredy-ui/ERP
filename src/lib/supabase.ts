// ─────────────────────────────────────────────────────────────────────────────
// CLIENT SUPABASE — src/lib/supabase.ts
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { env } from './env';

// ✅ Export du client principal utilisé partout dans l'app
export const supabase = (() => {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    console.error(
      '❌ Variables EXPO_PUBLIC_SUPABASE_URL ou EXPO_PUBLIC_SUPABASE_ANON_KEY manquantes'
    );
    return null as any;
  }
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
})();

// ─────────────────────────────────────────────────────────────────────────────
// UTILITAIRE: Génération de code auto-incrémental
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Génère le prochain code disponible pour une table donnée.
 * Ex: getNextCode('da_import', 'DA-IMP') → 'DA-IMP-042'
 *     getNextCode('da_import', 'DA-IMP', 'code') → même chose avec colonne explicite
 *
 * ⚠️ Certains écrans appellent getNextCode(prefix, table, column)
 *    d'autres appellent getNextCode(table, prefix, column)
 *    On détecte l'ordre selon si le 1er arg ressemble à un préfixe ou à un nom de table
 */
export async function getNextCode(
  tableOrPrefix: string,
  prefixOrTable: string,
  column = 'code'
): Promise<string> {
  // Détection de l'ordre des arguments
  const isFirstArgPrefix = /[A-Z]/.test(tableOrPrefix[0]) || tableOrPrefix.includes('-');
  const table = isFirstArgPrefix ? prefixOrTable : tableOrPrefix;
  const prefix = isFirstArgPrefix ? tableOrPrefix : prefixOrTable;

  // Récupère jusqu'à 500 codes existants pour trouver le VRAI maximum numérique
  // (le tri alphabétique peut être trompeur, ex: "PF-SAV-9" > "PF-SAV-057")
  const { data } = await supabase
    .from(table)
    .select(column)
    .ilike(column, `${prefix}%`)
    .limit(500);

  if (!data || data.length === 0) return `${prefix}-001`;

  // Extrait le suffixe numérique après le dernier tiret et trouve le max
  let maxNum = 0;
  for (const row of data) {
    const code: string = row[column] ?? '';
    // Prend uniquement le dernier segment numérique après le préfixe
    const suffix = code.slice(prefix.length).replace(/^-/, '');
    const num = parseInt(suffix, 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  }

  return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITAIRE: Calcul automatique de la date d'expiration d'un lot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcule la date d'expiration d'un lot à partir de sa date de réception et
 * de la durée de conservation (en jours) définie sur l'article.
 *
 * Retourne null si shelfLifeDays est absent/invalide (l'article n'a pas de
 * durée de conservation définie → expiry_date reste NULL, affiché "N/A").
 * Le calcul est fait en UTC pour éviter tout décalage de fuseau horaire.
 *
 * Ex: computeExpiryDate('2026-06-17', 180) → '2026-12-14'
 */
export function computeExpiryDate(
  receptionDate: string | Date | null | undefined,
  shelfLifeDays: number | null | undefined
): string | null {
  if (shelfLifeDays === null || shelfLifeDays === undefined) return null;
  const days = Number(shelfLifeDays);
  if (!Number.isFinite(days) || days <= 0) return null;

  const base = receptionDate ? new Date(receptionDate) : new Date();
  if (Number.isNaN(base.getTime())) return null;

  const expiry = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate())
  );
  expiry.setUTCDate(expiry.getUTCDate() + days);
  return expiry.toISOString().split('T')[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITAIRES: Validation
// ─────────────────────────────────────────────────────────────────────────────

export function isValidId(id: unknown): id is string {
  return typeof id === 'string' && id.trim().length > 0;
}

export function isValidParam(param: unknown): boolean {
  if (param === null || param === undefined) return false;
  if (typeof param === 'string') return param.trim().length > 0;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITAIRES: Requêtes audit_log
// ─────────────────────────────────────────────────────────────────────────────

export function buildAuditLogQuery(filters: {
  tableName?: string;
  recordId?: string;
  userId?: string;
  action?: string;
}) {
  let query = supabase
    .from('audit_log')
    .select('*, user:users(full_name, email)');

  if (filters.tableName && filters.tableName.trim() !== '') {
    query = query.eq('table_name', filters.tableName);
  }
  if (filters.recordId && filters.recordId.trim() !== '') {
    query = query.eq('record_id', filters.recordId);
  }
  if (filters.userId && filters.userId.trim() !== '') {
    query = query.eq('user_id', filters.userId);
  }
  if (filters.action && filters.action.trim() !== '') {
    query = query.eq('action', filters.action);
  }

  return query.order('created_at', { ascending: false });
}

export function useAuditLog(filters?: {
  tableName?: string;
  recordId?: string;
}) {
  return useQuery({
    queryKey: ['audit_log', filters],
    queryFn: async () => {
      if (!filters?.tableName) return [];
      const query = buildAuditLogQuery({
        tableName: filters.tableName,
        recordId: filters.recordId,
      });
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!filters?.tableName,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PATTERN: Safe Query Builder
// ─────────────────────────────────────────────────────────────────────────────

export class SafeQueryBuilder {
  private filters: Record<string, any> = {};

  addFilter(
    column: string,
    operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte',
    value: any
  ) {
    if (isValidParam(value)) {
      this.filters[column] = { operator, value };
    }
    return this;
  }

  addEqFilter(column: string, value: any) {
    return this.addFilter(column, 'eq', value);
  }

  toQuery(baseQuery: any) {
    let query = baseQuery;
    for (const [column, { operator, value }] of Object.entries(this.filters)) {
      switch (operator) {
        case 'eq':   query = query.eq(column, value);  break;
        case 'neq':  query = query.neq(column, value); break;
        case 'gt':   query = query.gt(column, value);  break;
        case 'lt':   query = query.lt(column, value);  break;
        case 'gte':  query = query.gte(column, value); break;
        case 'lte':  query = query.lte(column, value); break;
      }
    }
    return query;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS: Stock emballages / consommables
// ─────────────────────────────────────────────────────────────────────────────

export function useStockEmballagesConsommables() {
  return useQuery({
    queryKey: ['stock_emballages_consommables'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_emballages_consommables')
        .select('*')
        .eq('active', true)
        .order('nom');
      if (error) {
        console.error('❌ Erreur stock_emballages_consommables:', error);
        throw error;
      }
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS: Rapprochement inventaire
// ─────────────────────────────────────────────────────────────────────────────

export function useReconcileInventoryAuto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      campaignId,
      userId,
    }: {
      campaignId: string;
      userId: string;
    }) => {
      if (!supabase) throw new Error('Supabase not configured');
      if (!isValidId(campaignId)) throw new Error('Campaign ID invalide');
      if (!isValidId(userId)) throw new Error('User ID invalide');

      const { data, error } = await supabase.rpc('reconcile_inventory_campaign', {
        p_campaign_id: campaignId,
        p_user_id: userId,
      });

      if (error) {
        console.error('❌ Erreur reconcile_inventory_campaign:', error);
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory_ecarts_view'] });
      queryClient.invalidateQueries({ queryKey: ['inventory_campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['inventory_reconciliation_summary'] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports groupés (rétrocompatibilité)
// ─────────────────────────────────────────────────────────────────────────────

export const supabaseHelpers = {
  isValidId,
  isValidParam,
  buildAuditLogQuery,
  SafeQueryBuilder,
  useAuditLog,
  useStockEmballagesConsommables,
  useReconcileInventoryAuto,
};
