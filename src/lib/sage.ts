import { supabase } from './supabase';

export interface SageSyncResult {
  success: boolean;
  table: string;
  recordsSynced: number;
  errors: string[];
}

const SAGE_SYNC_TABLES = ['lots', 'stock_movements', 'da_import', 'da_local'] as const;

export type SageSyncTable = typeof SAGE_SYNC_TABLES[number];

/**
 * Marque un enregistrement comme synchronisé avec SAGE
 */
export async function markAsSageSynced(table: SageSyncTable, recordId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from(table)
    .update({ sage_synced: true, sage_synced_at: new Date().toISOString() } as any)
    .eq('id', recordId);
  if (error) console.error(`[SAGE] Erreur marquage sync [${table}/${recordId}]:`, error);
}

/**
 * Récupère les enregistrements en attente de synchronisation SAGE
 */
export async function getPendingSyncRecords(table: SageSyncTable): Promise<any[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('sage_synced', false);
  if (error) {
    console.error(`[SAGE] Erreur récupération en attente [${table}]:`, error);
    return [];
  }
  return data || [];
}

/**
 * Simule l'envoi des données vers SAGE.
 * En production, ceci appellerait l'API REST/ODATA de SAGE.
 */
async function sendToSageEndpoint(table: string, records: any[]): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];
  if (!supabase) {
    return { success: false, errors: ['Supabase non initialisé'] };
  }
  for (const record of records) {
    try {
      // Simulation d'envoi à SAGE via une edge function ou endpoint dédié
      const { error } = await supabase.functions.invoke('sage-sync', {
        body: { table, record, action: 'UPSERT' },
      });
      if (error) errors.push(`[${table}/${record.id}] ${error.message}`);
    } catch (err: any) {
      errors.push(`[${table}/${record.id}] ${err.message}`);
    }
  }
  return { success: errors.length === 0, errors };
}

/**
 * Déclenche la synchronisation complète avec SAGE pour toutes les tables
 */
export async function triggerFullSageSync(): Promise<SageSyncResult[]> {
  const results: SageSyncResult[] = [];

  for (const table of SAGE_SYNC_TABLES) {
    const pending = await getPendingSyncRecords(table);
    if (pending.length === 0) {
      results.push({ success: true, table, recordsSynced: 0, errors: [] });
      continue;
    }

    const { success, errors } = await sendToSageEndpoint(table, pending);

    if (success) {
      for (const record of pending) {
        await markAsSageSynced(table, record.id);
      }
    }

    results.push({ success, table, recordsSynced: pending.length, errors });
  }

  return results;
}

/**
 * Compte le nombre total d'enregistrements en attente de sync SAGE
 */
export async function countPendingSyncRecords(): Promise<number> {
  let total = 0;
  for (const table of SAGE_SYNC_TABLES) {
    const pending = await getPendingSyncRecords(table);
    total += pending.length;
  }
  return total;
}
