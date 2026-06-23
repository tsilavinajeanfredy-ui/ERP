// hooks/signatures.ts — Triple signature électronique BT/BS
import * as React from 'react';
import { useQuery as useTanstackQuery, useMutation as useTanstackMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';

export interface StockMovementSignature {
  id: string;
  movement_id: string;
  role: 'EMETTEUR' | 'RECEPTEUR' | 'RESPONSABLE_STOCK';
  signed_by: string;
  signed_at: string;
  signature_data: string;
  notes?: string;
  profile?: { full_name: string; user_role: string };
}

export interface MovementSignatureStatus {
  id: string;
  reference_doc: string;
  movement_type: string;
  signature_status: 'PENDING' | 'PARTIAL' | 'COMPLETE' | 'LOCKED';
  pdf_locked: boolean;
  signatures_count: number;
  signed_roles: string[];
}

// ── Lire les signatures d'un mouvement ──────────────────────────────────────
export function useMovementSignatures(movementId?: string) {
  return useTanstackQuery<StockMovementSignature[]>({
    queryKey: ['stock_movement_signatures', movementId],
    enabled: !!movementId,
    queryFn: async () => {
      if (!supabase || !movementId) return [];
      const { data, error } = await supabase
        .from('stock_movement_signatures')
        .select('*, profile:profiles(full_name, user_role)')
        .eq('movement_id', movementId)
        .order('signed_at', { ascending: true });
      if (error) throw error;
      return (data as StockMovementSignature[]) ?? [];
    },
  });
}

// ── Lire le statut de signature d'un mouvement ──────────────────────────────
export function useMovementSignatureStatus(movementId?: string) {
  return useTanstackQuery<MovementSignatureStatus | null>({
    queryKey: ['movement_signature_status', movementId],
    enabled: !!movementId,
    queryFn: async () => {
      if (!supabase || !movementId) return null;
      const { data, error } = await supabase
        .from('stock_movements_signature_status')
        .select('*')
        .eq('id', movementId)
        .single();
      if (error) return null;
      return data as MovementSignatureStatus;
    },
  });
}

// ── Soumettre une signature ──────────────────────────────────────────────────
export function useSignMovement() {
  const queryClient = useQueryClient();
  return useTanstackMutation({
    mutationFn: async ({
      movementId,
      role,
      signatureData,
      notes,
    }: {
      movementId: string;
      role: 'EMETTEUR' | 'RECEPTEUR' | 'RESPONSABLE_STOCK';
      signatureData: string;
      notes?: string;
    }) => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');

      const { data, error } = await supabase
        .from('stock_movement_signatures')
        .insert({
          movement_id: movementId,
          role,
          signed_by: user.id,
          signature_data: signatureData,
          notes: notes || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['stock_movement_signatures', vars.movementId] });
      queryClient.invalidateQueries({ queryKey: ['movement_signature_status', vars.movementId] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
    },
  });
}

// ── Alerte lots bloqués/quarantaine ─────────────────────────────────────────
export function useQuarantineAlerts() {
  return useTanstackQuery({
    queryKey: ['lots_quarantine_alerts'],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('lots_quarantine_alerts')
        .select('*')
        .order('days_in_status', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 5 * 60 * 1000, // rafraîchir toutes les 5min
  });
}

// ── Rapprochement automatique inventaire ────────────────────────────────────
export function useReconcileInventoryAuto() {
  const queryClient = useQueryClient();
  return useTanstackMutation({
    mutationFn: async ({ campaignId, userId }: { campaignId: string; userId: string }) => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase.rpc('reconcile_inventory_campaign', {
        p_campaign_id: campaignId,
        p_user_id: userId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['inventory_ecarts_view'] });
      queryClient.invalidateQueries({ queryKey: ['inventory_campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['inventory_reconciliation_summary'] });
    },
  });
}

export function useInventoryReconciliationSummary() {
  return useTanstackQuery({
    queryKey: ['inventory_reconciliation_summary'],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('inventory_reconciliation_summary')
        .select('*');
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ── Emballages consommables ──────────────────────────────────────────────────
export function useEmballagesConsommables() {
  return useTanstackQuery({
    queryKey: ['stock_emballages_consommables'],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('stock_emballages_consommables')
        .select('*');
      if (error) throw error;
      return data ?? [];
    },
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  });
}
