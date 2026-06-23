// ============================================================================
// ERP GSI — Supabase data hooks (React hooks for each module)
// ============================================================================
import { useEffect, useState } from 'react';
import React from 'react';
import { Alert, Platform } from 'react-native';
import { supabase } from './supabase';

// ─── Canal Realtime multiplexé ───────────────────────────────────────────────
// Tous les listeners postgres_changes sont enregistrés sur UN SEUL canal global
// par catégorie (global + user-specific) pour rester dans la limite Pro (500 WebSockets).
// 150 users × 2 canaux = 300 — marge confortable.
//
// Architecture :
//   Canal 1 : "erp-global"    — tables partagées (lots, bons_entree, production, fcq…)
//   Canal 2 : "erp-user-{id}" — tables propres à l'utilisateur (notifications, rh si RRPH)
//
// Usage : les hooks individuels n'ouvrent PLUS leur propre canal — ils
// s'abonnent à l'EventEmitter interne `realtimeBus` qui est alimenté par
// les deux canaux globaux montés une seule fois dans useRealtimeSync().

type RealtimeBusCallback = (table: string, payload: any) => void;
const realtimeBus = new Map<string, Set<RealtimeBusCallback>>();

export function subscribeRealtimeBus(table: string, cb: RealtimeBusCallback): () => void {
  if (!realtimeBus.has(table)) realtimeBus.set(table, new Set());
  realtimeBus.get(table)!.add(cb);
  return () => realtimeBus.get(table)?.delete(cb);
}

function emitRealtimeBus(table: string, payload: any) {
  realtimeBus.get(table)?.forEach(cb => cb(table, payload));
}


/**
 * Confirmation cross-plateforme avec variante sémantique.
 *
 * Deux signatures supportées :
 *
 * — Positionnelle (rétrocompat) :
 *   confirmAction(title, message, onConfirm)                              // danger (défaut)
 *   confirmAction(title, message, onConfirm, undefined, 'success')
 *   confirmAction(title, message, onConfirm, onCancel, 'warning')
 *
 * — Options object (nouvelle API) :
 *   confirmAction(title, message, onConfirm, { variant: 'success', confirmLabel: 'Valider', cancelLabel: '' })
 *   confirmAction(title, message, onConfirm, { variant: 'warning', confirmLabel: 'Compris', cancelLabel: '' })
 *   confirmAction(title, message, onConfirm, { variant: 'danger' })
 *
 * Variantes : 'danger' (rouge) | 'success' (vert) | 'warning' (orange) | 'info' (bleu)
 */
export type ConfirmOptions = {
  variant?: 'danger' | 'success' | 'warning' | 'info';
  confirmLabel?: string;
  cancelLabel?: string;
  onCancel?: () => void;
};

export function confirmAction(
  title: string,
  message: string,
  onConfirm: () => void,
  onCancelOrOptions?: (() => void) | ConfirmOptions,
  variant: 'danger' | 'success' | 'warning' | 'info' = 'danger',
): void {
  // Résolution des paramètres selon la forme d'appel
  let resolvedVariant: 'danger' | 'success' | 'warning' | 'info' = variant;
  let resolvedOnCancel: (() => void) | undefined;
  let resolvedConfirmLabel: string | undefined;
  let resolvedCancelLabel: string | undefined;

  if (typeof onCancelOrOptions === 'function') {
    resolvedOnCancel = onCancelOrOptions;
    resolvedVariant = variant;
  } else if (onCancelOrOptions && typeof onCancelOrOptions === 'object') {
    resolvedVariant     = onCancelOrOptions.variant     ?? 'danger';
    resolvedOnCancel    = onCancelOrOptions.onCancel;
    resolvedConfirmLabel = onCancelOrOptions.confirmLabel;
    resolvedCancelLabel  = onCancelOrOptions.cancelLabel;
  }

  // Libellés par défaut selon la variante
  const defaultConfirmLabel =
    resolvedVariant === 'success' ? 'Valider'
    : resolvedVariant === 'danger'  ? 'Supprimer'
    : 'Confirmer';
  const defaultCancelLabel = 'Annuler';

  const confirmLabel = resolvedConfirmLabel ?? defaultConfirmLabel;
  const cancelLabel  = resolvedCancelLabel  ?? defaultCancelLabel;

  if (Platform.OS === 'web') {
    import('../components/Ui').then(({ confirmShow }) => {
      confirmShow(title, message, onConfirm, resolvedVariant, resolvedOnCancel, confirmLabel, cancelLabel);
    });
  } else {
    // Sur natif : Alert standard
    const isDestructive = resolvedVariant === 'danger';
    const buttons: any[] = [];
    if (cancelLabel !== '') {
      buttons.push({ text: cancelLabel, style: 'cancel', onPress: resolvedOnCancel });
    }
    buttons.push({
      text: confirmLabel,
      style: isDestructive ? 'destructive' : 'default',
      onPress: onConfirm,
    });
    Alert.alert(title, message, buttons);
  }
}
import type {
  Article,
  AppNotification,
  BomLine,
  DaImport,
  DaLocal,
  DaLocalDelivery,
  Depot,
  ExchangeRate,
  FcqDossier,
  Fnc,
  Instrument,
  InventoryCampaign,
  Lot,
  QcSpecification,
  Site,
  Supplier,
  User,
  UserRole,
  InventoryCount,
  InventorySheet,
  ProductDatasheet,
  ManagementReview,
  UserDashboardPreferences,
  SupplierEvaluation,
  SupplierEvaluationSummary,
  SupplierEvalWeight,
  Complaint,
  StockAlert,
  InventoryEcartView,
  FinalStockView,
  LotGenealogyView,
} from './database.types';
import { generatePdf, getPdfTemplate } from './pdf';

export function useExport() {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const triggerExport = (title?: string, content?: string) => {
    setExporting(true);
    setProgress(0);
    let current = 0;
    const interval = setInterval(async () => {
      current += 0.1;
      setProgress(current);
      if (current >= 1) {
        clearInterval(interval);

        if (title && content) {
          const html = getPdfTemplate(title, content);
          await generatePdf(html, title.replace(/\s+/g, '_'));
        }

        setTimeout(() => {
          setExporting(false);
          setProgress(0);
        }, 500);
      }
    }, 200);
  };

  return { exporting, progress, triggerExport };
}

import {
  useQuery as useTanstackQuery,
  useMutation as useTanstackMutation,
  useQueryClient,
  UseQueryResult,
} from '@tanstack/react-query';

// ─── Generic hook ───────────────────────────────────────────────────────────
function useQuery<T>(
  table: string,
  query?: (q: any) => any,
  deps: any[] = [],
  pagination?: { page: number; limit: number },
  options?: {
    staleTime?: number;
    gcTime?: number;
    refetchOnWindowFocus?: boolean | 'always';
    refetchOnMount?: boolean | 'always';
    refetchOnReconnect?: boolean | 'always';
    enabled?: boolean;
  },
): UseQueryResult<{ data: T[]; count: number | null }> {
  return useTanstackQuery({
    queryKey: [table, pagination?.page, pagination?.limit, ...deps],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');

      // Le builder de base sans select() — la callback y ajoute son propre .select(...)
      // Ainsi on évite le double .select() qui génère une erreur 400.
      let q: any = supabase.from(table);

      if (query) {
        q = query(q);
      } else {
        q = q.select('*', { count: 'exact' });
      }

      if (pagination) {
        const from = pagination.page * pagination.limit;
        const to = from + pagination.limit - 1;
        q = q.range(from, to);
      }

      let { data, error, count } = await q;

      if (error) throw error;
      return { data: data as T[], count };
    },
    staleTime: options?.staleTime ?? 30_000, // 30s par défaut — évite la tempête de requêtes
    gcTime: options?.gcTime ?? 1000 * 60 * 5,
    // refetchOnWindowFocus: false par défaut pour éviter N×50-150 requêtes simultanées
    // quand tous les users changent d'onglet. Les hooks transactionnels (staleTime:0) passent 'always'.
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    refetchOnMount: options?.refetchOnMount ?? true,
    refetchOnReconnect: options?.refetchOnReconnect ?? true,
    retry: (failureCount: number, error: any) => {
      const msg = (error?.message || '').toLowerCase();
      if (msg.includes('does not exist') || msg.includes('column') || msg.includes('relation'))
        return false;
      return failureCount < 2;
    },
  });
}

/**
 * Helper typé pour extraire les données paginées retournées par useQuery.
 * Évite les répétitions de `const raw = query.data as any`.
 */
function extractQueryResult<T>(queryData: unknown): { data: T[]; count: number } {
  const raw = queryData as { data?: T[]; count?: number | null } | undefined;
  return {
    data: (raw?.data as T[]) ?? [],
    count: (raw?.count as number) ?? 0,
  };
}

/**
 * Traduction centralisée des codes d'erreur PostgreSQL/PostgREST
 * @see https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const PG_ERR_MAP: Record<string, string> = {
  '23505': 'Cet identifiant existe déjà (doublon détecté).',
  '23503': "Conflit de relation : l'objet est encore lié à d'autres données.",
  '23502': "Un champ obligatoire n'a pas été renseigné.",
  '42P01': 'Erreur de configuration : Table introuvable sur le serveur.',
  PGRST116: "L'enregistrement demandé est introuvable.",
};

export function translatePgError(error: any): string {
  if (!error) return '';
  return PG_ERR_MAP[error.code] || error.message || 'Erreur de communication avec le serveur.';
}

export function getArticleUnitValue(type?: string): number {
  return type === 'MP' ? 5000 : type === 'PF' ? 12000 : type === 'SF' ? 8000 : 3000;
}

export function useMutation<T = any, R = any>(table: string, onSuccess?: (data: R) => void) {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState(0);

  const mutation = useTanstackMutation({
    mutationFn: async ({
      id,
      values,
      type = 'INSERT',
      file,
      path,
    }: {
      id?: string;
      values?: Partial<T>;
      type?: 'INSERT' | 'UPDATE' | 'DELETE' | 'UPLOAD' | 'DELETE_FILE';
      file?: any;
      path?: string;
    }) => {
      if (!supabase) throw new Error('Supabase not configured');

      if (type === 'UPLOAD') {
        if (!file || !path)
          throw new Error("Fichier et chemin de destination requis pour l'upload.");

        // Validation de taille (10 Mo = 10 * 1024 * 1024 octets)
        const MAX_SIZE = 10 * 1024 * 1024;
        if (file.size && file.size > MAX_SIZE) {
          throw new Error(
            'Le fichier est trop volumineux. La taille maximale autorisée est de 10 Mo.',
          );
        }

        setProgress(0);
        // Dans ce mode, "table" correspond au nom du bucket (ex: 'documents')
        const uploadResult = await supabase.storage.from(table).upload(path, file, {
          upsert: true,
        });
        if (uploadResult.error) throw uploadResult.error;
        return uploadResult.data;
      }

      if (type === 'DELETE_FILE') {
        if (!path) throw new Error('Chemin requis pour la suppression.');
        const removeResult = await supabase.storage.from(table).remove([path]);
        if (removeResult.error) throw removeResult.error;
        return removeResult.data;
      }

      // INSERT avec retry sur conflit de code unique (409 / 23505)
      // En cas de conflit, on cherche le premier numéro libre plutôt que d'incrémenter
      if (type === 'INSERT') {
        let lastError: any = null;
        let insertValues = values as any;

        for (let attempt = 0; attempt < 10; attempt++) {
          const insertResult = await supabase.from(table).insert(insertValues).select();
          if (!insertResult.error) return insertResult.data;
          lastError = insertResult.error;

          // Ne retry que pour les conflits de code unique (23505)
          if (insertResult.error.code !== '23505') break;

          // Conflit : cherche le prochain numéro libre dans la table
          if (insertValues?.code && typeof insertValues.code === 'string') {
            const codeParts = insertValues.code.split('-');
            const lastPart = codeParts[codeParts.length - 1];
            const padLen = lastPart.length;
            const prefix = codeParts.slice(0, -1).join('-') + '-';

            // Lit tous les codes existants avec ce préfixe pour trouver le premier trou
            const { data: existing } = await supabase
              .from(table)
              .select('code')
              .like('code', `${prefix}%`);

            const usedNums = new Set<number>();
            for (const row of existing || []) {
              const parts = (row as any).code?.split('-');
              const n = parseInt(parts?.[parts.length - 1], 10);
              if (!isNaN(n) && n > 0) usedNums.add(n);
            }

            let nextNum = 1;
            while (usedNums.has(nextNum)) nextNum++;
            codeParts[codeParts.length - 1] = String(nextNum).padStart(padLen, '0');
            insertValues = { ...insertValues, code: codeParts.join('-') };
          } else {
            break; // Pas de code à corriger, on abandonne
          }
        }
        throw lastError;
      }

      if (type === 'DELETE') {
        const delResult = await supabase.from(table).delete().eq('id', id!);
        if (delResult.error) throw delResult.error;
        return delResult.data;
      }

      // UPDATE : on sépare l'UPDATE du SELECT pour mieux isoler les erreurs de cache
      // Colonnes ajoutées par migrations successives (042/045/062) - absentes du cache PostgREST
      // si NOTIFY pgrst 'reload schema' n'a pas été exécuté après ALTER TABLE.
      const FCQ_OPTIONAL_COLS = [
        'results',
        'motif_decision',
        'observation_rq',
        'controleur_nom',
        'quantite_controlee',
        'out_of_spec_count',
        'validated_at',
        'validator_signed_at',
      ];
      const LOTS_OPTIONAL_COLS = [
        'cqlib_decided_by',
        'cqlib_decided_at',
        'depot_id',
        'origin',
        'batch_supplier',
        'expiry_date',
        'sage_synced',
        'sage_synced_at',
        'updated_at',
      ];

      // 1. Tenter l'UPDATE avec toutes les colonnes
      let updateResult = await supabase
        .from(table)
        .update(values as any)
        .eq('id', id!);

      // 2. Si erreur 400 sur les colonnes optionnelles, retenter sans elles
      if (updateResult.error) {
        const errMsg = (updateResult.error as any)?.message || '';
        const errCode = (updateResult.error as any)?.code;
        const isSchemaErr =
          updateResult.status === 400 ||
          errCode === 'PGRST204' ||
          errMsg.includes('does not exist');

        let optionalCols: string[] | null = null;
        if (isSchemaErr) {
          if (table === 'fcq_dossiers') optionalCols = FCQ_OPTIONAL_COLS;
          else if (table === 'lots') optionalCols = LOTS_OPTIONAL_COLS;
        }

        if (optionalCols) {
          const stripped = { ...(values as any) };
          optionalCols.forEach((c) => delete stripped[c]);
          const retryResult = await supabase.from(table).update(stripped).eq('id', id!);
          if (retryResult.error) throw retryResult.error;
          console.warn(
            '[' +
              table +
              "] Mise à jour partielle (colonnes absentes du cache PostgREST). Exécutez NOTIFY pgrst, 'reload schema' dans Supabase.",
          );
        } else {
          throw updateResult.error;
        }
      }

      // UPDATE réussi — on retourne un objet minimal avec l'id.
      // Le queryClient.invalidateQueries() dans onSuccess refetchera les données complètes.
      return [{ id }];
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [table] });
      if (onSuccess) onSuccess(data as R);
    },
    onError: (error: any) => {
      console.error(`Erreur mutation sur la table [${table}]:`, error);
      const message = translatePgError(error);
      if (Platform.OS !== 'web') {
        Alert.alert("Échec de l'opération", message);
      } else {
        // Toast web visible (coin bas-droite)
        const existing = document.getElementById('erp-hook-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.id = 'erp-hook-toast';
        toast.innerHTML = `
          <div style="
            position:fixed;bottom:24px;right:24px;z-index:99999;
            background:#DC2626;color:#fff;padding:14px 20px;
            border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.25);
            font-family:system-ui,sans-serif;font-size:14px;font-weight:600;
            display:flex;align-items:center;gap:10px;max-width:400px;
            animation:_erpSlideIn 0.3s ease-out;
          ">
            <span style="font-size:18px">❌</span>
            <span id="erp-hook-toast-msg"></span>
          </div>
          <style>@keyframes _erpSlideIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}</style>
        `;
        document.body.appendChild(toast);
        document.getElementById('erp-hook-toast-msg')!.textContent = message;
        setTimeout(() => {
          toast.style.opacity = '0';
          toast.style.transition = 'opacity 0.3s';
          setTimeout(() => toast.remove(), 300);
        }, 4000);
      }
    },
  });

  return {
    ...mutation,
    uploadProgress: progress,
    errorMessage: translatePgError(mutation.error),
  };
}

// ─── Auth & Role ────────────────────────────────────────────────────────────
export function useUserSession() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sClient = supabase;
    if (!sClient) {
      setLoading(false);
      return;
    }
    // Récupérer la session initiale — si le refresh token est invalide,
    // on déconnecte proprement plutôt que de laisser l'app dans un état corrompu.
    sClient.auth.getSession().then(({ data: authData, error }: { data: any; error: any }) => {
      const s = authData?.session ?? null;
      if (error) {
        console.warn('[Auth] Session invalide, déconnexion automatique :', error.message);
        sClient.auth.signOut({ scope: 'local' }).catch(() => null);
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('sb-zrwdljoebagrczvhsdto-auth-token');
        }
        setSession(null);
      } else {
        setSession(s);
      }
      setLoading(false);
    });

    const authChangeResult = sClient.auth.onAuthStateChange((event: any, s: any) => {
      if (event === 'TOKEN_REFRESHED') {
        setSession(s);
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
      } else if (event === 'SIGNED_IN') {
        setSession(s);
      } else {
        setSession(s);
      }
    });
    const subscription = authChangeResult.data.subscription;

    return () => subscription.unsubscribe();
  }, []);

  return { session, loading };
}

export function useUserProfile() {
  const { session } = useUserSession();
  const email = session?.user?.email;

  const { data: profile, isLoading } = useTanstackQuery({
    queryKey: ['users', email],
    queryFn: async () => {
      if (!email) return null;
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase.from('users').select('*').eq('email', email).single();
      if (error) {
        // Erreur 500 = problème RLS ou trigger côté Supabase (non récupérable côté client)
        // On log le détail et on retourne null pour ne pas bloquer l'application
        console.error(
          `[useUserProfile] Erreur Supabase sur users (${error.code ?? 'HTTP 500'}):`,
          error.message,
          '\n→ Vérifiez les policies RLS et triggers sur la table "users" dans Supabase.',
        );
        return null;
      }
      return data as User;
    },
    enabled: !!email,
    // Ne pas re-essayer en boucle si c'est une erreur serveur (500) : 1 seul retry
    retry: (failureCount, error: any) => {
      const status = error?.status ?? error?.code;
      if (status === 500 || status === '500') return false;
      return failureCount < 1;
    },
    // Délai de 10s avant de re-tenter pour laisser le serveur récupérer
    retryDelay: 10000,
  });

  const loading = email ? isLoading : false;

  // CCTP §4.2 : Enforcement de la 2FA pour les rôles à haute responsabilité
  const CRITICAL_ROLES: UserRole[] = ['RQ', 'DPI', 'ADMIN'];

  const is2FAMissing = profile
    ? CRITICAL_ROLES.includes(profile.role) && !profile.two_fa_enabled
    : false;

  return { profile, loading, role: profile?.role, user: session?.user, is2FAMissing };
}

// ─── Caching Helpers ────────────────────────────────────────────────────────
const CACHE_TIMES = {
  STATIC: 1000 * 60 * 60, // 1 heure (Dépôts, Sites, Fournisseurs)
  SEMI_STATIC: 1000 * 60 * 5, // 5 minutes (Articles, Instruments, Specs)
  TRANSACTIONAL: 0, // Pas de cache (Lots, FCQ, DA)
};

// ─── RBAC Permissions ───────────────────────────────────────────────────────
type ScreenName =
  | 'Dashboard'
  | 'Audit'
  | 'Referential'
  | 'Reception'
  | 'Laboratory'
  | 'Production'
  | 'Stocks'
  | 'Inventory'
  | 'Mrp'
  | 'PurchasingImport'
  | 'PurchasingLocal'
  | 'Admin'
  | 'AdminUsers'
  | 'Rh'
  | 'EdgeFunctionTest'
  | 'Shipping'
  | 'Fnc'
  | 'Complaints'
  | 'ReceptionPF'
  | 'PlanningLogistique'
  | 'Maintenance'
  | 'Metrology'
  | 'Instruments'
  | 'CalibrationManagement';
type ActionName =
  | 'create_lot'
  | 'validate_cqlib'
  | 'create_fcq'
  | 'validate_fcq'
  | 'create_fnc'
  | 'create_of'
  | 'manage_bom'
  | 'edit_bom'
  | 'validate_bom'
  | 'stock_transfer'
  | 'stock_adjust'
  | 'create_inventory'
  | 'validate_inventory'
  | 'create_da_import'
  | 'advance_da_import'
  | 'create_da_local'
  | 'validate_da_local'
  | 'receive_da_local'
  | 'run_mrp'
  | 'manage_users'
  | 'manage_referential'
  | 'import_csv'
  | 'export_data'
  | 'create_be'
  | 'assign_fnc'
  | 'edit_production_order'
  | 'validate_reception'; // Validation physique réception (MAGA → lot QUARANTAINE)

const SCREEN_ACCESS: Record<string, ScreenName[]> = {
  ADMIN: [
    'Dashboard',
    'Audit',
    'Referential',
    'Reception',
    'ReceptionPF',
    'Laboratory',
    'Instruments',
    'Production',
    'Stocks',
    'Inventory',
    'Mrp',
    'PurchasingImport',
    'PurchasingLocal',
    'PlanningLogistique',
    'Admin',
    'AdminUsers',
    'EdgeFunctionTest',
    'Complaints',
    'Rh',
    'Fnc',
    'Shipping',
    'Maintenance',
    'Metrology',
    'CalibrationManagement',
  ],
  DPI: [
    'Dashboard',
    'Audit',
    'Referential',
    'Production',
    'Stocks',
    'Inventory',
    'PurchasingLocal',
    'PlanningLogistique',
    'Rh',
    'Fnc',
  ],
  RQ: [
    'Dashboard',
    'Audit',
    'Referential',
    'Reception',
    'ReceptionPF',
    'Laboratory',
    'Instruments',
    'Complaints',
    'Fnc',
    'Metrology',
    'CalibrationManagement',
  ],
  TLAB: [
    'Dashboard',
    'Referential',
    'Laboratory',
    'Instruments',
    'Reception',
    'ReceptionPF',
    'Metrology',
    'CalibrationManagement',
  ],
  RPROD: [
    'Dashboard',
    'Referential',
    'Production',
    'Stocks',
    'Mrp',
    'ReceptionPF',
    'PlanningLogistique',
    'Fnc',
    'Shipping',
    'Maintenance',
  ],
  MAGA: [
    'Dashboard',
    'Referential',
    'Reception',
    'ReceptionPF',
    'Stocks',
    'Inventory',
    'PlanningLogistique',
    'Shipping',
  ],
  RACH: ['Dashboard', 'Referential', 'PurchasingImport', 'PurchasingLocal', 'PlanningLogistique'],
  PLAN: [
    'Dashboard',
    'Referential',
    'Mrp',
    'Production',
    'Stocks',
    'PlanningLogistique',
    'Reception',
    'ReceptionPF',
  ],
  COMPTA: ['Dashboard', 'Referential', 'Stocks', 'PurchasingImport', 'PurchasingLocal'],
  RH: ['Dashboard', 'Rh'],
};

const ACTION_ACCESS: Record<string, ActionName[]> = {
  ADMIN: [
    'create_lot',
    'create_be',
    'validate_cqlib',
    'create_fcq',
    'validate_fcq',
    'create_fnc',
    'assign_fnc',
    'create_of',
    'manage_bom',
    'edit_bom',
    'validate_bom',
    'stock_transfer',
    'stock_adjust',
    'create_inventory',
    'validate_inventory',
    'create_da_import',
    'advance_da_import',
    'create_da_local',
    'validate_da_local',
    'receive_da_local',
    'run_mrp',
    'manage_users',
    'manage_referential',
    'import_csv',
    'export_data',
    'edit_production_order',
    'validate_reception',
  ],
  DPI: [
    'validate_da_local',
    'create_of',
    'validate_inventory',
    'validate_bom',
    'export_data',
    'edit_production_order',
    'assign_fnc',
  ],
  RQ: ['validate_cqlib', 'validate_fcq', 'create_fnc', 'assign_fnc', 'export_data'],
  TLAB: ['create_fcq', 'export_data'],
  RPROD: [
    'create_of',
    'manage_bom',
    'edit_bom',
    'run_mrp',
    'import_csv',
    'export_data',
    'create_lot',
    'edit_production_order',
    'create_fnc',
  ],
  MAGA: [
    'create_lot',
    'create_be',
    'stock_transfer',
    'stock_adjust',
    'create_inventory',
    'receive_da_local',
    'export_data',
    'validate_reception',
  ],
  RACH: [
    'create_da_import',
    'advance_da_import',
    'create_da_local',
    'manage_referential',
    'import_csv',
    'export_data',
  ],
  PLAN: ['run_mrp', 'create_of', 'edit_bom', 'import_csv', 'export_data', 'edit_production_order'],
  RH: ['import_csv', 'export_data', 'manage_users'],
  COMPTA: ['export_data'],
};

export function usePermissions() {
  const { role } = useUserProfile();
  const r = role || 'COMPTA'; // Default to most restricted

  // Seul le rôle SUPER_ADMIN bénéficie d'un bypass complet.
  // Les rôles ADMIN et DSI suivent strictement la grille ADMIN standard.
  const isSuperAdmin = r === 'SUPER_ADMIN';
  const effectiveRole = r === 'DSI' || r === 'ADMIN' ? 'ADMIN' : r;

  return {
    canAccessScreen: (screen: ScreenName): boolean => {
      if (isSuperAdmin) return true;
      return SCREEN_ACCESS[effectiveRole]?.includes(screen) ?? false;
    },
    canPerformAction: (action: ActionName): boolean => {
      if (isSuperAdmin) return true;
      return ACTION_ACCESS[effectiveRole]?.includes(action) ?? false;
    },
    allowedScreens: isSuperAdmin
      ? [
          'Dashboard',
          'Audit',
          'Referential',
          'Reception',
          'ReceptionPF',
          'Laboratory',
          'Production',
          'Stocks',
          'Inventory',
          'Mrp',
          'PurchasingImport',
          'PurchasingLocal',
          'PlanningLogistique',
          'Admin',
          'AdminUsers',
          'Complaints',
          'Rh',
          'Fnc',
          'Shipping',
          'Maintenance',
          'Metrology',
          'CalibrationManagement',
        ]
      : SCREEN_ACCESS[effectiveRole] || [],
    role: r,
  };
}

// ─── Users ──────────────────────────────────────────────────────────────────
export function useUsers(page: number = 0, limit: number = 20) {
  const queryClient = useQueryClient();

  // ── Realtime users géré par useRealtimeSync() via realtimeBus ─────────────
  // Canal supprimé ici pour réduire les WebSockets (150 users × 7 → 150 × 2).

  const query = useTanstackQuery({
    queryKey: ['users', page, limit],
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');
      const from = page * limit;
      const to = from + limit - 1;
      const { data, error, count } = await supabase
        .from('users')
        .select('*', { count: 'exact' })
        .order('role')
        .range(from, to);
      if (error) throw error;
      return { data: data as User[], count };
    },
    staleTime: CACHE_TIMES.SEMI_STATIC, // optimisé pour éviter les re-renders excessifs
    gcTime: 0, // pas de cache résiduel entre pages
    refetchOnWindowFocus: true,
  });

  const raw = query.data as any;
  return {
    data: (raw?.data as User[]) || [],
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─── Depots ─────────────────────────────────────────────────────────────────
export function useDepots() {
  const query = useTanstackQuery<Depot[]>({
    queryKey: ['depots'],
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase.from('depots').select('*').order('code');
      if (error) throw error;
      return data as Depot[];
    },
    staleTime: CACHE_TIMES.TRANSACTIONAL,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  });
  return {
    data: (query.data as Depot[]) || [],
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─── Suppliers ──────────────────────────────────────────────────────────────
export function useSuppliers(page: number = 0, limit: number = 20, search?: string) {
  const query = useQuery<Supplier>(
    'suppliers',
    (q: any) => {
      let r = q.select('*', { count: 'exact' }).order('name');
      if (search) r = r.ilike('name', `%${search}%`);
      return r;
    },
    [search],
    { page, limit },
    {
      staleTime: CACHE_TIMES.TRANSACTIONAL,
      gcTime: CACHE_TIMES.TRANSACTIONAL,
      refetchOnWindowFocus: true,
      refetchOnMount: 'always',
      refetchOnReconnect: true,
    },
  );
  const raw = query.data as any;
  return {
    data: (raw?.data as Supplier[]) || [],
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─── Articles ───────────────────────────────────────────────────────────────

/** Charge TOUS les articles actifs sans pagination (max 2000) — pour les selects/dropdowns */
export function useAllArticles(type?: 'MP' | 'PF' | 'SF' | 'EMB') {
  return useArticles(0, 2000, type);
}

export function useArticles(
  page: number = 0,
  limit: number = 20,
  type?: string,
  search?: string,
  prefix?: string,
) {
  const query = useQuery<Article>(
    'articles',
    (q: any) => {
      let r = q.select('*', { count: 'exact' }).eq('active', true).order('code');
      if (type) r = r.eq('article_type', type);
      if (prefix) r = r.ilike('code', `${prefix}-%`);
      if (search)
        r = r.or(`name.ilike.%${search}%,code.ilike.%${search}%,name_en.ilike.%${search}%`);
      return r;
    },
    [type, search, prefix],
    { page, limit },
    {
      staleTime: CACHE_TIMES.TRANSACTIONAL,
      gcTime: CACHE_TIMES.TRANSACTIONAL,
      refetchOnWindowFocus: true,
      refetchOnMount: 'always',
      refetchOnReconnect: true,
    },
  );
  const raw = query.data as any;
  return {
    data: (raw?.data as Article[]) || [],
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─── Instruments ────────────────────────────────────────────────────────────
export function useInstruments() {
  const query = useQuery<Instrument>('instruments', (q: any) =>
    q.select('*', { count: 'exact' }).eq('active', true).order('code'),
  );
  const raw = query.data as any;
  return {
    data: (raw?.data as Instrument[]) || [],
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─── Lots ───────────────────────────────────────────────────────────────────
export function useLots(page: number = 0, limit: number = 20, status?: string) {
  const LOT_COLS =
    'id,code,bon_entree_id,article_id,supplier_id,depot_id,qty_received,qty_current,unit,cqlib_status,cqlib_decided_by,cqlib_decided_at,origin,batch_supplier,reception_date,expiry_date,sage_synced,created_at,updated_at,article:articles(*),be:bons_entree(code),depot:depots(id,code,name,depot_type)';
  const query = useQuery<Lot>(
    'lots',
    (q: any) => {
      let r = q.select(LOT_COLS).order('reception_date', { ascending: false });
      if (status) r = r.eq('cqlib_status', status);
      return r;
    },
    [status],
    { page, limit },
    {
      staleTime: CACHE_TIMES.TRANSACTIONAL,
      gcTime: CACHE_TIMES.TRANSACTIONAL,
      refetchOnWindowFocus: true,
      refetchOnMount: 'always',
      refetchOnReconnect: true,
    },
  );
  const raw = query.data as any;
  return {
    data: (raw?.data as Lot[]) || [],
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useRecentLots(limit: number = 5) {
  const query = useQuery<Lot>(
    'lots',
    (q: any) =>
      q.select('*, article:articles(*)').order('reception_date', { ascending: false }).limit(limit),
    [limit],
  );
  const raw = query.data as any;
  return {
    data: (raw?.data as Lot[]) || [],
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─── FCQ Dossiers ───────────────────────────────────────────────────────────
export function useFcqDossiers(page: number = 0, limit: number = 20) {
  // Colonnes complètes (colonnes optionnelles ajoutées via migration 042/055)
  const FCQ_COLS_FULL =
    'id,code,lot_id,fcq_type,status,decision,analyst_id,validator_id,instrument_id,instrument_ok,analyst_signed_at,validator_signed_at,notes,validated_at,created_at,updated_at,motif_decision,observation_rq,controleur_nom,quantite_controlee,out_of_spec_count,results,lot:lots(id,code,article_id,qty_received,qty_current,unit,cqlib_status,cqlib_decided_by,cqlib_decided_at,reception_date,bon_entree_id,article:articles(*)),instrument:instruments(*)';
  // Fallback 1 — sans colonnes optionnelles fcq_dossiers mais avec join lots+instruments
  const FCQ_COLS_BASE =
    'id,code,lot_id,fcq_type,status,decision,analyst_id,validator_id,instrument_id,instrument_ok,analyst_signed_at,validator_signed_at,notes,validated_at,created_at,updated_at,lot:lots(id,code,article_id,qty_received,qty_current,unit,reception_date,bon_entree_id,article:articles(*)),instrument:instruments(*)';
  // Fallback 2 — sans join instruments
  const FCQ_COLS_MINIMAL =
    'id,code,lot_id,fcq_type,status,decision,analyst_id,validator_id,instrument_id,instrument_ok,analyst_signed_at,validator_signed_at,notes,validated_at,created_at,updated_at,lot:lots(id,code,article_id,qty_received,qty_current,unit,reception_date,bon_entree_id,article:articles(*))';
  // Fallback 3 — colonnes de base uniquement, sans aucun join (dernier recours)
  const FCQ_COLS_BARE =
    'id,code,lot_id,fcq_type,status,decision,analyst_id,validator_id,instrument_id,notes,validated_at,created_at,updated_at';

  // Normalise les résultats : garantit que results est toujours un objet {}
  // (peut arriver si la colonne a été créée avec DEFAULT '[]'::jsonb)
  const normalizeDossier = (d: any): FcqDossier => ({
    ...d,
    results: d.results && !Array.isArray(d.results) ? d.results : {},
  });

  const query = useTanstackQuery({
    queryKey: ['fcq_dossiers', page, limit],
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');

      const from = page * limit;
      const to = from + limit - 1;

      const attempts = [
        { cols: FCQ_COLS_FULL, label: 'full' },
        { cols: FCQ_COLS_BASE, label: 'fallback-1 (sans colonnes optionnelles)' },
        { cols: FCQ_COLS_MINIMAL, label: 'fallback-2 (sans join instruments)' },
        { cols: FCQ_COLS_BARE, label: 'fallback-3 (bare, sans join)' },
      ];

      for (const attempt of attempts) {
        const res = await supabase
          .from('fcq_dossiers')
          .select(attempt.cols, { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(from, to);

        if (!res.error) {
          if (attempt.label !== 'full') {
            console.warn(
              '[FCQ] ' +
                attempt.label +
                '. ' +
                'Exécutez la migration 055_fix_fcq_schema_complete.sql dans Supabase SQL Editor.',
            );
          }
          return {
            data: (res.data as any[]).map(normalizeDossier) as FcqDossier[],
            count: res.count,
          };
        }

        const isSchemaError =
          res.status === 400 ||
          (res.error as any)?.code === 'PGRST204' ||
          (res.error?.message || '').toLowerCase().includes('does not exist') ||
          (res.error?.message || '').toLowerCase().includes('column');

        if (!isSchemaError) {
          // Erreur réseau ou autre : on remonte immédiatement
          throw res.error;
        }
        // Erreur de schéma : on essaie le fallback suivant
        console.warn(
          '[FCQ] ' + attempt.label + ' échoué (400/PGRST204), essai du fallback suivant.',
        );
      }

      // Tous les fallbacks échoués : retourner liste vide plutôt que planter l'écran
      console.error(
        '[FCQ] Tous les fallbacks ont échoué. Vérifiez votre connexion Supabase et jouez la migration 055.',
      );
      return { data: [] as FcqDossier[], count: 0 };
    },
    staleTime: 0,
    gcTime: 1000 * 60 * 5,
    retry: (failureCount: number, error: any) => {
      const msg = (error?.message || '').toLowerCase();
      const code = (error as any)?.code;
      // Ne pas retenter les erreurs de schéma
      if (
        code === 'PGRST204' ||
        msg.includes('does not exist') ||
        msg.includes('column') ||
        msg.includes('relation')
      )
        return false;
      return failureCount < 2;
    },
  });

  const raw = query.data as any;
  return {
    data: (raw?.data as FcqDossier[]) || [],
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─── QC Specifications ──────────────────────────────────────────────────────
export function useQcSpecifications(specRef?: string) {
  const query = useQuery<QcSpecification>(
    'qc_specifications',
    (q: any) => {
      let r = q.select('*', { count: 'exact' }).eq('active', true).order('parameter_name');
      if (specRef) r = r.eq('spec_ref', specRef);
      return r;
    },
    [specRef],
  );
  const raw = query.data as any;
  return {
    data: (raw?.data as QcSpecification[]) || [],
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─── FNC ────────────────────────────────────────────────────────────────────
export function useFnc(page: number = 0, limit: number = 20) {
  const query = useQuery<Fnc>(
    'fnc',
    (q: any) => q.select('*, supplier:suppliers(name)').order('opened_at', { ascending: false }),
    [],
    { page, limit },
  );
  const raw = query.data as any;
  const data =
    ((raw?.data as any[])?.map((r: any) => ({
      ...r,
      supplier_name: r.supplier?.name || null,
      supplier: undefined,
    })) as Fnc[]) || [];
  return {
    data,
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─── DA Import ──────────────────────────────────────────────────────────────
export function useDaImport() {
  const query = useQuery<DaImport>('da_import', (q: any) =>
    q
      .select('*, article:articles(*), supplier:suppliers(*)')
      .order('created_at', { ascending: false }),
  );
  const raw = query.data as any;
  return {
    data: (raw?.data as DaImport[]) || [],
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useDaImportStepsLog(daImportId?: string) {
  const query = useQuery<any>(
    'da_import_steps_log',
    (q: any) =>
      daImportId
        ? q
            .select('*, validated_by_user:users(full_name)')
            .eq('da_import_id', daImportId)
            .order('validated_at', { ascending: true })
        : q.limit(0),
    [daImportId],
  );
  const raw = query.data as any;
  return { data: (raw?.data as any[]) || [], isPending: query.isPending, refetch: query.refetch };
}

// ─── DA Local ───────────────────────────────────────────────────────────────
export function useDaLocal(page: number = 0, limit: number = 20) {
  const query = useQuery<DaLocal>(
    'da_local',
    (q: any) =>
      q
        .select('*, article:articles(*), supplier:suppliers(*), deliveries:da_local_deliveries(*)')
        .order('created_at', { ascending: false }),
    [],
    { page, limit },
  );
  const raw = query.data as any;
  return {
    data: (raw?.data as DaLocal[]) || [],
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─── PV revue de direction (M7) ─────────────────────────────────────────────
export function useManagementReviews() {
  const queryClient = useQueryClient();
  const query = useTanstackQuery<ManagementReview[]>({
    queryKey: ['management_reviews'],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('management_reviews')
        .select('*')
        .order('period_month', { ascending: false });
      if (error) throw error;
      return (data as ManagementReview[]) ?? [];
    },
  });

  const generate = useTanstackMutation({
    mutationFn: async (month?: string) => {
      if (!supabase) throw new Error('Supabase non configuré');
      const { data, error } = await supabase.rpc(
        'generate_management_review',
        month ? { p_month: month } : {},
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['management_reviews'] }),
  });

  return { data: query.data ?? [], isPending: query.isPending, generate };
}

// ─── Préférences tableau de bord (M7) ───────────────────────────────────────
export function useDashboardPreferences(userId?: string) {
  const queryClient = useQueryClient();
  const query = useTanstackQuery<UserDashboardPreferences | null>({
    queryKey: ['user_dashboard_preferences', userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!supabase || !userId) return null;
      const { data, error } = await supabase
        .from('user_dashboard_preferences')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return (data as UserDashboardPreferences) ?? null;
    },
  });

  const save = useTanstackMutation({
    mutationFn: async (prefs: {
      hidden_sections?: string[];
      favorites?: string[];
      layout?: Record<string, unknown> | null;
    }) => {
      if (!supabase || !userId) throw new Error('Utilisateur non identifié');
      const { error } = await supabase
        .from('user_dashboard_preferences')
        .upsert(
          { user_id: userId, ...prefs, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        );
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['user_dashboard_preferences', userId] }),
  });

  return {
    preferences: query.data ?? null,
    hiddenSections: query.data?.hidden_sections ?? [],
    isPending: query.isPending,
    save,
  };
}

// ─── Fiches techniques produit (M6) ─────────────────────────────────────────
export function useProductDatasheets(articleId?: string) {
  const query = useQuery<ProductDatasheet>(
    'product_datasheets',
    (q: any) => {
      let r = q.select('*', { count: 'exact' }).order('version', { ascending: false });
      if (articleId) r = r.eq('article_id', articleId);
      return r;
    },
    [articleId],
  );
  const raw = query.data as any;
  return {
    data: (raw?.data as ProductDatasheet[]) || [],
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─── Production & BOM ───────────────────────────────────────────────────────
export function useBoms() {
  const query = useQuery<any>('bom_headers', (q: any) =>
    q.select('*, product:articles(*)').order('created_at', { ascending: false }),
  );
  const raw = query.data as any;
  return {
    data: (raw?.data as any[]) || [],
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useProductionOrders(page: number = 0, limit: number = 20) {
  const query = useQuery<any>(
    'production_orders',
    (q: any) =>
      q
        .select('*, product:articles(*), bom:bom_headers(*)')
        .order('planned_date', { ascending: false }),
    [],
    { page, limit },
    { staleTime: 0 }, // temps réel via useRealtimeSync (production_orders channel)
  );
  const raw = query.data as any;
  return {
    data: (raw?.data as any[]) || [],
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useBomLines(bomHeaderId?: string) {
  const query = useQuery<BomLine>(
    'bom_lines',
    (q: any) =>
      bomHeaderId
        ? q.select('*, component:articles(*)').eq('bom_header_id', bomHeaderId).order('created_at')
        : q.select('*, component:articles(*)').limit(0),
    [bomHeaderId],
  );
  const raw = query.data as any;
  return {
    data: (raw?.data as BomLine[]) || [],
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─── PF avec BOM : retourne uniquement les PF référencés dans bom_headers ───
// staleTime=0 garantit la synchronisation temps réel après toute mutation
export function usePFWithBom() {
  const query = useQuery<any>(
    'bom_headers',
    (q: any) =>
      q
        .select(
          'product_id, status, product:articles!product_id(id, code, name, name_en, article_type, unit, active, shelf_life_days)',
        )
        .order('created_at', { ascending: false }),
    [],
    undefined,
    { staleTime: CACHE_TIMES.SEMI_STATIC, gcTime: CACHE_TIMES.SEMI_STATIC },
  );
  const raw = query.data as any;
  // Déduplique par product_id (un PF peut avoir plusieurs versions de BOM)
  const seen = new Set<string>();
  const products: Article[] = [];
  for (const row of (raw?.data as any[]) || []) {
    const article = row.product;
    if (article && article.id && article.active && !seen.has(article.id)) {
      seen.add(article.id);
      products.push(article as Article);
    }
  }
  return {
    data: products,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─── Lignes BOM pour un produit fini donné (via product_id) ─────────────────
// Cherche le BOM VALIDE (ou BROUILLON en fallback) du PF puis charge ses lignes
// avec les quantités réelles. staleTime=0 → synchronisé en temps réel.
export function useBomLinesForProduct(productId?: string) {
  const { data: boms = [], isPending: bomsLoading } = useBoms();

  const bomHeader = React.useMemo(() => {
    if (!productId) return null;
    return (
      boms.find((b: any) => b.product_id === productId && b.status === 'VALIDE') ||
      boms.find((b: any) => b.product_id === productId) ||
      null
    );
  }, [boms, productId]);

  const query = useQuery<BomLine>(
    'bom_lines',
    (q: any) =>
      bomHeader
        ? q
            .select(
              '*, component:articles(id, code, name, name_en, article_type, unit, safety_stock)',
            )
            .eq('bom_header_id', bomHeader.id)
            .order('sort_order', { ascending: true })
        : q.select('*').limit(0),
    [bomHeader?.id],
    undefined,
    { staleTime: CACHE_TIMES.SEMI_STATIC, gcTime: CACHE_TIMES.SEMI_STATIC },
  );
  const raw = query.data as any;
  return {
    data: (raw?.data as BomLine[]) || [],
    bomHeader,
    isPending: bomsLoading || query.isPending,
    refetch: query.refetch,
  };
}

// ─── DA Local Deliveries & Inventory ───────────────────────────────────────

export function useDaLocalDeliveries(daLocalId: string) {
  const query = useQuery<DaLocalDelivery>(
    'da_local_deliveries',
    (q: any) =>
      q.select('*', { count: 'exact' }).eq('da_local_id', daLocalId).order('delivery_date'),
    [daLocalId],
  );
  const raw = query.data as any;
  return {
    data: (raw?.data as DaLocalDelivery[]) || [],
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useInventoryCampaigns() {
  const query = useQuery<InventoryCampaign>('inventory_campaigns', (q: any) =>
    q.select('*', { count: 'exact' }).order('created_at', { ascending: false }),
  );
  const raw = query.data as any;
  return {
    data: (raw?.data as InventoryCampaign[]) || [],
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useInventorySheets(campaignId?: string) {
  const query = useQuery<InventorySheet>(
    'inventory_sheets',
    (q: any) => {
      let r = q
        .select('*, article:articles(code, name, article_type, unit)', { count: 'exact' })
        .order('sheet_number', { ascending: true });
      if (campaignId) r = r.eq('campaign_id', campaignId);
      return r;
    },
    [campaignId],
  );
  const raw = query.data as any;
  return {
    data: (raw?.data as InventorySheet[]) || [],
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─── Sites ──────────────────────────────────────────────────────────────────
export function useSites() {
  const query = useTanstackQuery<Site[]>({
    queryKey: ['sites'],
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase.from('sites').select('*').order('code');
      if (error) throw error;
      return data as Site[];
    },
    staleTime: CACHE_TIMES.SEMI_STATIC, // réduit de STATIC (1h) à SEMI_STATIC (5min) pour cohérence UX
  });
  return {
    data: (query.data as Site[]) || [],
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─── Audit Logs ─────────────────────────────────────────────────────────────
export function useAuditLogs(page: number = 0, limit: number = 20) {
  return useTanstackQuery({
    queryKey: ['audit_log', page, limit],
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase non configuré');
      const from = page * limit;
      const to = from + limit - 1;
      const { data, error, count } = await supabase
        .from('audit_log')
        .select('*, user:users(full_name, email)')
        .order('created_at', { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { data, count };
    },
    staleTime: 1000 * 30,
  });
}

// ─── Pointages ──────────────────────────────────────────────────────────────
export function useRhPointages(periode?: string, evenement?: string, sectionId?: string) {
  // Realtime géré par useRealtimeSync() via realtimeBus → canal 'erp-global-sync'

  return useTanstackQuery<RhPointage[]>({
    queryKey: ['rh_pointages', periode, evenement, sectionId],
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');
      let q = supabase.from('rh_pointages').select('*, section:rh_sections!section_id(*)');
      
      if (periode) q = q.eq('periode', periode);
      if (evenement) q = q.eq('evenement', evenement);
      if (sectionId) q = q.eq('section_id', sectionId);
      
      q = q.order('date_pointage', { ascending: false });
      
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreatePointage() {
  const queryClient = useQueryClient();
  return useTanstackMutation({
    mutationFn: async (pointage: Partial<RhPointage>) => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase.from('rh_pointages').insert([pointage]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh_pointages'] });
    },
  });
}

export function useUpdatePointage() {
  const queryClient = useQueryClient();
  return useTanstackMutation({
    mutationFn: async ({ id, ...updates }: Partial<RhPointage> & { id: string }) => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase.from('rh_pointages').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh_pointages'] });
    },
  });
}

export function useDeletePointage() {
  const queryClient = useQueryClient();
  return useTanstackMutation({
    mutationFn: async (id: string) => {
      if (!supabase) throw new Error('Supabase not configured');
      const { error } = await supabase.from('rh_pointages').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rh_pointages'] });
    },
  });
}

/**
 * Hook pour récupérer l'historique spécifique d'un enregistrement
 */
export function useRecordAuditLogs(tableName: string, recordId: string) {
  const query = useQuery<any>(
    'audit_log',
    (q: any) =>
      q
        .select('*, user:users(full_name, email)')
        .eq('table_name', tableName)
        .eq('record_id', recordId)
        .order('created_at', { ascending: false }),
    [tableName, recordId],
    undefined,
    { enabled: !!tableName && !!recordId },
  );
  const raw = query.data as any;
  return {
    data: (raw?.data as any[]) || [],
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─── Dashboard KPIs (aggregated) ────────────────────────────────────────────
export interface DashboardKpi {
  lotsQuarantaine: number;
  lotsBloque: number;
  fcqEnAttente: number;
  fncOuvertes: number;
  daImportActives: number;
  instrumentsEchus: number;
}

export function useDashboardKpis() {
  const query = useTanstackQuery<DashboardKpi>({
    queryKey: ['dashboard_kpis'],
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');
      const [lotsQ, lotsB, fcqA, fncO, daI, instE] = await Promise.all([
        supabase
          .from('lots')
          .select('id', { count: 'exact', head: true })
          .eq('cqlib_status', 'QUARANTAINE'),
        supabase
          .from('lots')
          .select('id', { count: 'exact', head: true })
          .eq('cqlib_status', 'BLOQUE'),
        supabase
          .from('fcq_dossiers')
          .select('id', { count: 'exact', head: true })
          .in('status', ['EN_ATTENTE', 'EN_COURS']),
        supabase.from('fnc').select('id', { count: 'exact', head: true }).eq('status', 'OUVERTE'),
        supabase
          .from('da_import')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'EN_COURS'),
        supabase
          .from('instruments')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'ECHU'),
      ]);
      return {
        lotsQuarantaine: lotsQ.count ?? 0,
        lotsBloque: lotsB.count ?? 0,
        fcqEnAttente: fcqA.count ?? 0,
        fncOuvertes: fncO.count ?? 0,
        daImportActives: daI.count ?? 0,
        instrumentsEchus: instE.count ?? 0,
      };
    },
    staleTime: 30000,
  });

  return { kpi: query.data || null, loading: query.isPending };
}

// useMRP a été déplacé dans src/lib/mrp.ts (useRealMRP) pour utiliser le moteur industriel.

/**
 * Hook pour récupérer les notifications internes de l'utilisateur.
 * Défensif : ne lance la requête que si le profil est entièrement chargé
 * (évite les URLs invalides avec `role.eq.undefined`).
 */
export function useInternalNotifications() {
  const { profile } = useUserProfile();
  const queryClient = useQueryClient();

  // Ne requêter que si on a un profil valide avec id ET role définis
  const isReady = !!profile?.id && !!profile?.role;

  // ── Realtime notifications via realtimeBus (canal erp-global-sync) ────────
  // Plus de canal dédié par user — subscribeRealtimeBus filtre côté client.
  React.useEffect(() => {
    if (!isReady || !profile?.id || !profile?.role) return;
    const userId = profile.id;
    const userRole = profile.role;
    const unsub = subscribeRealtimeBus('notifications', (_, payload: any) => {
      if (
        payload?.new?.role === userRole ||
        payload?.new?.user_id === userId
      ) {
        queryClient.invalidateQueries({
          queryKey: ['notifications', userId, userRole],
        });
      }
    });
    return unsub;
  }, [isReady, profile?.id, profile?.role, queryClient]);

  return useTanstackQuery<AppNotification[]>({
    queryKey: ['notifications', profile?.id, profile?.role],
    enabled: isReady,
    // Si la table n'existe pas encore, retourner un tableau vide sans crasher
    retry: false,
    queryFn: async () => {
      if (!supabase || !profile?.id || !profile?.role) return [];
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .or(`role.eq.${profile.role},user_id.eq.${profile.id}`)
          .order('created_at', { ascending: false })
          .limit(20);

        // Erreur 404 = table manquante → retourner silencieusement un tableau vide
        if (error) {
          console.warn('[Notifications] Erreur lors du chargement :', error.message);
          return [];
        }
        return (data as AppNotification[]) ?? [];
      } catch {
        return [];
      }
    },
  });
}

// ─── Global realtime sync (invalide les queries clés sur changement DB) ───────
// ─── useRealtimeSync — Canal GLOBAL (1 seul WebSocket pour toutes les tables partagées) ──
// Remplace les 6-7 canaux individuels. Chaque hook s'abonne via subscribeRealtimeBus().
// 150 users × 1 canal global = 150 WebSockets (au lieu de 150×7 = 1 050).
export function useRealtimeSync() {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!supabase) return;

    // ── Tables partagées — toutes invalidations centralisées ici ──────────
    const GLOBAL_TABLES = [
      'bons_entree',
      'lots',
      'fcq_dossiers',
      'stock_movements',
      'notifications',
      'production_orders',
      'production_stops',
      'of_mp_consumptions',
      'users',
      'rh_pointages',
      'rh_personnels',
      'rh_affectations_demandes',
      'rh_conges',
    ] as const;

    let channel = supabase.channel('erp-global-sync');

    for (const table of GLOBAL_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload: any) => {
          emitRealtimeBus(table, payload);
        },
      );
    }

    channel.subscribe();

    // ── Invalidations directes depuis le canal global ─────────────────────
    // (pour les hooks qui n'ont pas encore migré vers subscribeRealtimeBus)
    const unsubs = [
      subscribeRealtimeBus('bons_entree', () => {
        queryClient.invalidateQueries({ queryKey: ['bons_entree'] });
        queryClient.invalidateQueries({ queryKey: ['stock_card'] });
      }),
      subscribeRealtimeBus('lots', () => {
        queryClient.invalidateQueries({ queryKey: ['lots'] });
        queryClient.invalidateQueries({ queryKey: ['bons_entree'] });
        queryClient.invalidateQueries({ queryKey: ['stock_card'] });
      }),
      subscribeRealtimeBus('fcq_dossiers', () =>
        queryClient.invalidateQueries({ queryKey: ['fcq_dossiers'] }),
      ),
      subscribeRealtimeBus('stock_movements', () => {
        queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
        queryClient.invalidateQueries({ queryKey: ['stock_movements_full'] });
        queryClient.invalidateQueries({ queryKey: ['stock_card'] });
      }),
      subscribeRealtimeBus('production_orders', () => {
        queryClient.invalidateQueries({ queryKey: ['production_orders'] });
        queryClient.invalidateQueries({ queryKey: ['sub_production_orders'] });
        queryClient.invalidateQueries({ queryKey: ['trs'] });
      }),
      subscribeRealtimeBus('production_stops', () => {
        queryClient.invalidateQueries({ queryKey: ['production_stops'] });
        queryClient.invalidateQueries({ queryKey: ['trs'] });
      }),
      subscribeRealtimeBus('of_mp_consumptions', () =>
        queryClient.invalidateQueries({ queryKey: ['of_mp_consumptions'] }),
      ),
      subscribeRealtimeBus('users', () =>
        queryClient.invalidateQueries({ queryKey: ['users'] }),
      ),
      subscribeRealtimeBus('rh_pointages', () =>
        queryClient.invalidateQueries({ queryKey: ['rh_pointages'] }),
      ),
      subscribeRealtimeBus('rh_personnels', () =>
        queryClient.invalidateQueries({ queryKey: ['rh_personnel_view'] }),
      ),
      subscribeRealtimeBus('rh_affectations_demandes', () =>
        queryClient.invalidateQueries({ queryKey: ['rh_affectations_demandes'] }),
      ),
      subscribeRealtimeBus('rh_conges', () => {
        queryClient.invalidateQueries({ queryKey: ['rh_conges'] });
        queryClient.invalidateQueries({ queryKey: ['rh_conges_soldes'] });
      }),
    ];

    return () => {
      supabase?.removeChannel(channel);
      unsubs.forEach(u => u());
    };
  }, [queryClient]);
}

/**
 * Hook pour déclencher des notifications internes (App-Only)
 * Conformément au CCTP pour l'automatisation des workflows qualité.
 */
export function useNotification() {
  const queryClient = useQueryClient();
  return useTanstackMutation({
    mutationFn: async (payload: {
      to_role?: UserRole;
      user_id?: string;
      subject: string;
      message: string;
      type: 'email' | 'push' | 'internal' | 'success' | 'error' | 'warning' | 'info';
      category?: 'QUALITY' | 'PRODUCTION' | 'PURCHASING' | 'STOCK' | 'SYSTEM';
      metadata?: any;
      send_email?: boolean;
    }) => {
      if (!supabase) throw new Error('Supabase not configured');

      if (!payload.to_role && !payload.user_id) {
        throw new Error('Notification target missing');
      }

      if (payload.send_email) {
        // Utiliser l'Edge Function pour email + notification
        const { error: fnError } = await supabase.functions.invoke('send-notification', {
          body: {
            role: payload.to_role,
            title: payload.subject,
            message: payload.message,
            type: payload.type === 'internal' ? 'info' : payload.type,
            category: payload.category || 'SYSTEM',
            metadata: payload.metadata,
            send_email: true,
          },
        });
        if (fnError) throw fnError;
      } else {
        // Insertion directe (interne uniquement)
        // category est fusionné dans metadata car roleNotifFilter lit n.metadata?.category
        const enrichedMetadata = {
          ...payload.metadata,
          category: payload.category || payload.metadata?.category || 'SYSTEM',
        };
        const notifType = payload.type === 'internal' ? 'info' : payload.type || 'info';
        // Nettoyer les emojis résiduels du titre (garde-fou)
        const cleanTitle = (payload.subject || '')
          .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}]/gu, '')
          .trim();
        try {
          const { error } = await supabase.from('notifications').insert({
            role: payload.to_role,
            title: cleanTitle,
            message: payload.message,
            type: notifType,
            metadata: enrichedMetadata,
          });
          if (error) throw error;
        } catch (notifErr: any) {
          // Ne pas faire crasher le workflow si la notification échoue
          console.warn(
            `[Notification] Échec envoi vers ${payload.to_role}:`,
            notifErr?.message || notifErr,
          );
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/** Marquer toutes les notifications comme lues */
export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useTanstackMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase.rpc('notify_mark_all_read');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/** Effacer TOUTES les notifications lues (sans limite de date) */
export function useClearReadNotifications() {
  const queryClient = useQueryClient();
  return useTanstackMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase.rpc('notify_clear_read');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// ─── Supabase Storage Utilities ─────────────────────────────────────────────
export async function getSignedUrlForStorageFile(
  bucketName: string,
  filePath: string,
): Promise<string | null> {
  if (!supabase) throw new Error('Supabase not configured');
  // URL valide pour 1 heure (3600 secondes)
  const { data, error } = await supabase.storage.from(bucketName).createSignedUrl(filePath, 3600);
  if (error) {
    throw new Error(`Erreur lors de la création de l'URL signée: ${error.message}`);
  }
  return data?.signedUrl || null;
}

// ─── Exchange Rates ─────────────────────────────────────────────────────────
export function useExchangeRates() {
  const query = useQuery<ExchangeRate>('exchange_rates', (q) =>
    q.select('*', { count: 'exact' }).order('from_currency'),
  );
  const raw = query.data as any;
  return {
    data: (raw?.data as ExchangeRate[]) || [],
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
// ─── Supplier Evaluations (Phase 6) ─────────────────────────────────────────
export function useSupplierEvaluations(supplierId?: string) {
  const query = useQuery<SupplierEvaluation>(
    'supplier_evaluations',
    (q: any) => {
      let r = q.select('*', { count: 'exact' }).order('evaluated_at', { ascending: false });
      if (supplierId) r = r.eq('supplier_id', supplierId);
      return r;
    },
    [supplierId],
  );
  const raw = query.data as any;
  return {
    data: (raw?.data as SupplierEvaluation[]) || [],
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useSupplierEvalWeights() {
  const query = useQuery<SupplierEvalWeight>(
    'supplier_eval_criteria_weights',
    (q: any) => q.select('*', { count: 'exact' }).order('sort_order', { ascending: true }),
    [],
  );
  const raw = query.data as any;
  return {
    data: (raw?.data as SupplierEvalWeight[]) || [],
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useSupplierEvalSummaries(supplierId?: string) {
  const query = useQuery<SupplierEvaluationSummary>(
    'supplier_evaluation_summary',
    (q: any) => {
      let r = q.select('*', { count: 'exact' }).order('evaluated_at', { ascending: false });
      if (supplierId) r = r.eq('supplier_id', supplierId);
      return r;
    },
    [supplierId],
  );
  const raw = query.data as any;
  return {
    data: (raw?.data as SupplierEvaluationSummary[]) || [],
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─── Complaints (Phase 6) ───────────────────────────────────────────────────
export function useComplaints(page: number = 0, limit: number = 20) {
  const query = useQuery<Complaint>(
    'complaints',
    (q: any) =>
      q.select('*, lot:lots(*), article:articles(*)').order('opened_at', { ascending: false }),
    [],
    { page, limit },
  );
  const raw = query.data as any;
  return {
    data: (raw?.data as Complaint[]) || [],
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─── Calibration Log (Phase 6) ──────────────────────────────────────────────
export function useCalibrationLog(instrumentId?: string) {
  const query = useQuery<any>(
    'calibration_log',
    (q: any) => {
      let r = q
        .select('*, instrument:instruments(*), calibrated_by:users(full_name)')
        .order('calibration_date', { ascending: false });
      if (instrumentId) r = r.eq('instrument_id', instrumentId);
      return r;
    },
    [instrumentId],
  );
  const raw = query.data as any;
  return {
    data: (raw?.data as any[]) || [],
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─── Offline Mode & Sync (Phase 4) ──────────────────────────────────────────
const OFFLINE_KEY = 'GSI_OFFLINE_INV';

export function useOfflineInventory() {
  const [offlineCounts, setOfflineCounts] = useState<InventoryCount[]>([]);
  const [syncing, setSyncing] = useState(false);

  // Charger les données locales au démarrage
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem(OFFLINE_KEY);
        if (saved) setOfflineCounts(JSON.parse(saved));
      } catch (e) {
        console.warn("Erreur JSON.parse pour l'inventaire hors ligne:", e);
      }
    }
  }, []);

  const addOfflineCount = (count: Partial<InventoryCount>) => {
    const newCount = {
      ...count,
      id: `off-${Date.now()}`,
      created_at: new Date().toISOString(),
    } as InventoryCount;

    const updated = [...offlineCounts, newCount];
    setOfflineCounts(updated);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(OFFLINE_KEY, JSON.stringify(updated));
    }
  };

  const clearOffline = () => {
    setOfflineCounts([]);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(OFFLINE_KEY);
    }
  };

  const removeOfflineCount = (idToRemove: string) => {
    const updated = offlineCounts.filter((c) => c.id !== idToRemove);
    setOfflineCounts(updated);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(OFFLINE_KEY, JSON.stringify(updated));
    }
  };

  const syncWithServer = async () => {
    if (offlineCounts.length === 0) return;
    setSyncing(true);
    try {
      if (!supabase) throw new Error('Supabase not configured');
      const { error } = await supabase
        .from('inventory_counts')
        .insert(offlineCounts.map(({ id: _id, ...rest }) => rest));
      if (error) throw error;
      clearOffline();
      Alert.alert(
        'Synchronisation réussie',
        `${offlineCounts.length} comptages envoyés au serveur.`,
      );
    } catch (err: any) {
      Alert.alert('Échec de synchronisation', err.message);
    } finally {
      setSyncing(false);
    }
  };

  return {
    offlineCounts,
    addOfflineCount,
    syncWithServer,
    syncing,
    hasOfflineData: offlineCounts.length > 0,
  };
}

// ─── MRP Scenarios (What-If) ──────────────────────────────────────────────────
export function useMRPScenarios() {
  const query = useQuery<any>('mrp_scenarios', (q: any) =>
    q.select('*').order('created_at', { ascending: false }),
  );
  const raw = query.data as any;
  if (query.error) console.warn('[useMRPScenarios] error:', query.error);
  return {
    data: (raw?.data as any[]) || [],
    isPending: query.isPending,
    refetch: query.refetch,
    error: query.error,
  };
}

export function useSaveMRPScenario() {
  const queryClient = useQueryClient();
  return useTanstackMutation({
    mutationFn: async (values: {
      name: string;
      description?: string;
      horizon_days: number;
      article_filter: string;
      site_id?: string;
      demand_change?: number;
      results: any[];
    }) => {
      if (!supabase) throw new Error('Supabase not configured');

      // Récupérer l'utilisateur courant — on ignore l'erreur si le token est périmé
      // (AuthApiError: Invalid Refresh Token) pour ne pas bloquer la sauvegarde
      let userId: string | null = null;
      try {
        const {
          data: { user },
          error: authErr,
        } = await supabase.auth.getUser();
        if (!authErr && user?.id) userId = user.id;
      } catch (_) {
        // token invalide → on continue sans created_by
      }

      // On ne passe created_by que si on a pu résoudre l'utilisateur
      // pour éviter une violation de FK sur public.users
      const payload: any = {
        name: values.name,
        description: values.description ?? null,
        horizon_days: values.horizon_days,
        article_filter: values.article_filter,
        site_id: values.site_id ?? null,
        demand_change: values.demand_change ?? null,
        results: values.results ?? [],
      };
      if (userId) payload.created_by = userId;

      const { data, error } = await supabase.from('mrp_scenarios').insert(payload).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mrp_scenarios'] });
    },
  });
}

// ─── Sidebar Counts (badges temps réel) ────────────────────────────────────────
//
// Stratégie "seen snapshot" :
// On mémorise le dernier compteur vu par l'utilisateur pour chaque écran.
// Quand l'utilisateur est sur l'écran correspondant, le badge affiche 0.
// Dès qu'un nouveau poll ramène un chiffre > snapshot, le badge s'allume à nouveau.
//
// seenCounts = { reception: N, laboratory: N, purchasingImport: N }
// rawCounts  = dernière valeur remontée par Supabase
// badge      = rawCounts[k] > seenCounts[k] ? String(rawCounts[k] - 0) : ''
//              (on affiche '' si l'utilisateur a déjà "vu" ce nombre ou moins)

type SidebarKey = 'reception' | 'receptionPF' | 'laboratory' | 'purchasingImport' | 'shipping' | 'stocks';

const ROUTE_TO_KEY: Record<string, SidebarKey> = {
  Reception: 'reception',
  ReceptionPF: 'receptionPF',
  Laboratory: 'laboratory',
  PurchasingImport: 'purchasingImport',
  Shipping: 'shipping',
  Stocks: 'stocks',
};

// Cache module-level : les valeurs survivent aux re-renders et navigations
const _sidebarCountsCache: Record<SidebarKey, number> = {
  reception: 0, receptionPF: 0, laboratory: 0,
  purchasingImport: 0, shipping: 0, stocks: 0,
};
// Persist "seen" state across re-mounts so badges don't reappear after visiting
const _sidebarSeenCache: Record<SidebarKey, number> = {
  reception: 0, receptionPF: 0, laboratory: 0,
  purchasingImport: 0, shipping: 0, stocks: 0,
};

export function useSidebarCounts(currentRoute?: string) {
  const [rawCounts, setRawCounts] = React.useState<Record<SidebarKey, number>>({ ..._sidebarCountsCache });
  // seenRef contient le dernier compteur que l'utilisateur a "vu" pour chaque route.
  const seenRef = React.useRef<Record<SidebarKey, number>>({ ..._sidebarSeenCache });

  // Quand l'utilisateur arrive sur un écran, on met à jour le snapshot "vu".
  React.useEffect(() => {
    if (!currentRoute) return;
    const key = ROUTE_TO_KEY[currentRoute];
    if (key) {
      seenRef.current = { ...seenRef.current, [key]: rawCounts[key] };
      Object.assign(_sidebarSeenCache, seenRef.current);
    }
  }, [currentRoute, rawCounts]);

  React.useEffect(() => {
    const sb = supabase;
    if (!sb) return;
    const fetchCounts = async () => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayIso = today.toISOString();

        const [qLotsMP, qLotsPF, qFcq, qDa, qShipping, qStocks] = await Promise.all([
          // Réception MP : lots MP en attente
          sb
            .from('lots')
            .select('id, article:articles!inner(article_type)', { count: 'exact', head: true })
            .eq('cqlib_status', 'EN_ATTENTE')
            .eq('article.article_type', 'MP'),
          // Réception PF : lots PF en attente (issus d'OF clôturé)
          sb
            .from('lots')
            .select('id, article:articles!inner(article_type)', { count: 'exact', head: true })
            .eq('cqlib_status', 'EN_ATTENTE')
            .eq('article.article_type', 'PF'),
          // Laboratoire : dossiers FCQ en attente
          sb
            .from('fcq_dossiers')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'EN_ATTENTE'),
          // Achats Import : DA non livrées
          sb.from('da_import').select('id', { count: 'exact', head: true }).neq('status', 'LIVRE'),
          // Expédition : lots LIBERE disponibles
          sb
            .from('lots')
            .select('id', { count: 'exact', head: true })
            .eq('cqlib_status', 'LIBERE'),
          // Stocks : mouvements créés aujourd'hui
          sb
            .from('stock_movements')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', todayIso),
        ]);
        const next = {
          reception: qLotsMP.count ?? 0,
          receptionPF: qLotsPF.count ?? 0,
          laboratory: qFcq.count ?? 0,
          purchasingImport: qDa.count ?? 0,
          shipping: qShipping.count ?? 0,
          stocks: qStocks.count ?? 0,
        };
        Object.assign(_sidebarCountsCache, next);
        setRawCounts({ ...next });
      } catch {
        /* ignore */
      }
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, []);

  // Badge = nombre d'éléments apparus DEPUIS la dernière visite de l'écran.
  // Si l'utilisateur est présentement sur l'écran, on met le snapshot à jour
  // en temps réel (via l'effet ci-dessus) → badge = 0.
  const counts = React.useMemo(() => {
    const badge = (key: SidebarKey) => {
      const diff = rawCounts[key] - seenRef.current[key];
      return diff > 0 ? String(diff) : '';
    };
    const total = (key: SidebarKey) => rawCounts[key] > 0 ? String(rawCounts[key]) : '';
    return {
      reception: badge('reception'),
      receptionPF: badge('receptionPF'),
      laboratory: badge('laboratory'),
      purchasingImport: badge('purchasingImport'),
      shipping: badge('shipping'),
      stocks: total('stocks'),
    };
  }, [rawCounts]);

  /** Appeler manuellement quand on entre sur un écran (via onFocus ou useIsFocused). */
  const markSeen = React.useCallback(
    (key: SidebarKey) => {
      seenRef.current = { ...seenRef.current, [key]: rawCounts[key] };
      Object.assign(_sidebarSeenCache, seenRef.current);
    },
    [rawCounts],
  );

  return { counts, markSeen };
}

// ─── Bons d'Entrée ────────────────────────────────────────────────────────────
export function useBonsEntree() {
  const query = useQuery<any>(
    'bons_entree',
    (q: any) => q.select('*').order('created_at', { ascending: false }),
    [],
    undefined,
    {
      staleTime: CACHE_TIMES.TRANSACTIONAL,
      gcTime: CACHE_TIMES.TRANSACTIONAL,
      refetchOnWindowFocus: true,
      refetchOnMount: 'always',
      refetchOnReconnect: true,
    },
  );
  const raw = query.data as any;
  return { data: (raw?.data as any[]) || [], isPending: query.isPending, refetch: query.refetch };
}

// ─── Production Forecasts (PDP) ──────────────────────────────────────────────
export function useForecasts() {
  const query = useQuery<any>(
    'production_forecasts',
    (q: any) => q.select('*').order('year').order('month'),
    [],
  );
  const raw = ((query.data as any)?.data as any[]) || [];

  // Build the same Record<productId, Record<"YYYY-MM", number>> shape the screen uses
  const forecasts = React.useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const row of raw) {
      if (!map[row.product_id]) map[row.product_id] = {};
      const key = `${row.year}-${String(row.month).padStart(2, '0')}`;
      map[row.product_id][key] = row.qty;
    }
    return map;
  }, [raw]);

  return { forecasts, raw, isPending: query.isPending };
}

export function useSaveForecasts() {
  const queryClient = useQueryClient();

  const save = React.useCallback(
    async (updates: Array<{ product_id: string; year: number; month: number; qty: number }>) => {
      if (!supabase) throw new Error('Supabase not configured');
      // upsert on (product_id, year, month) — requires a unique constraint in DB
      const rows = updates.map((u) => ({
        product_id: u.product_id,
        year: u.year,
        month: u.month,
        qty: u.qty,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from('production_forecasts')
        .upsert(rows, { onConflict: 'product_id,year,month' });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['production_forecasts'] });
    },
    [queryClient],
  );

  const remove = React.useCallback(
    async (product_id: string, year: number, month: number) => {
      if (!supabase) throw new Error('Supabase not configured');
      const { error } = await supabase
        .from('production_forecasts')
        .delete()
        .eq('product_id', product_id)
        .eq('year', year)
        .eq('month', month);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['production_forecasts'] });
    },
    [queryClient],
  );

  const deleteYear = React.useCallback(
    async (year: number) => {
      if (!supabase) throw new Error('Supabase not configured');
      const { error } = await supabase.from('production_forecasts').delete().eq('year', year);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['production_forecasts'] });
    },
    [queryClient],
  );

  return { save, remove, deleteYear };
}

// ─── Stocks - Alertes & Seuils (Module 1) ─────────────────────────────────
export function useStockAlerts() {
  return useTanstackQuery<StockAlert[]>({
    queryKey: ['stock_alerts_view'],
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase
        .from('stock_alerts_view')
        .select('*')
        .order('coverage_pct', { ascending: true });
      if (error) throw error;
      return (data as StockAlert[]) ?? [];
    },
    staleTime: 30_000,
  });
}

export function useArticleThreshold() {
  const queryClient = useQueryClient();
  return useTanstackMutation({
    mutationFn: async ({
      articleId,
      safety_stock,
      reorder_point,
    }: {
      articleId: string;
      safety_stock: number;
      reorder_point: number;
    }) => {
      if (!supabase) throw new Error('Supabase not configured');
      const { error } = await supabase
        .from('articles')
        .update({ safety_stock, reorder_point })
        .eq('id', articleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock_alerts_view'] });
      queryClient.invalidateQueries({ queryKey: ['articles'] });
    },
  });
}

// ─── Inventaire - Réconciliation automatisée (Module 2) ──────────────────
export function useInventoryEcartsView(campaignId?: string) {
  return useTanstackQuery<InventoryEcartView[]>({
    queryKey: ['inventory_ecarts_view', campaignId],
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');
      let q = supabase.from('inventory_ecarts_view').select('*');
      if (campaignId) q = q.eq('campaign_id', campaignId);
      q = q.order('ecart_pct', { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return (data as InventoryEcartView[]) ?? [];
    },
  });
}

export function useFinalStockView() {
  return useTanstackQuery<FinalStockView[]>({
    queryKey: ['final_stock_view'],
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase
        .from('final_stock_view')
        .select('*')
        .order('article_code', { ascending: true })
        .order('depot_code', { ascending: true });
      if (error) throw error;
      return (data as FinalStockView[]) ?? [];
    },
  });
}

export function useReconcileInventory() {
  const queryClient = useQueryClient();
  return useTanstackMutation({
    mutationFn: async ({ campaignId }: { campaignId: string }) => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase.rpc('reconcile_inventory', {
        campaign_id: campaignId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory_ecarts_view'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      queryClient.invalidateQueries({ queryKey: ['lots'] });
    },
  });
}

// ─── Traçabilité complète (Module 4) ──────────────────────────────────
export function useLotGenealogy(lotId?: string) {
  return useTanstackQuery<LotGenealogyView | null>({
    queryKey: ['lot_genealogy_view', lotId],
    enabled: !!lotId,
    queryFn: async () => {
      if (!supabase || !lotId) return null;
      const { data, error } = await supabase
        .from('lot_genealogy_view')
        .select('*')
        .eq('lot_id', lotId)
        .single();
      if (error) throw error;
      return data as LotGenealogyView;
    },
  });
}

export function useLotDownstream(parentLotId?: string) {
  return useTanstackQuery<LotGenealogyView[]>({
    queryKey: ['lot_downstream_view', parentLotId],
    enabled: !!parentLotId,
    queryFn: async () => {
      if (!supabase || !parentLotId) return [];
      const { data, error } = await supabase
        .from('lot_downstream_view')
        .select('*')
        .eq('parent_lot_id', parentLotId);
      if (error) throw error;
      return (data as LotGenealogyView[]) ?? [];
    },
  });
}

export function useRecallLot() {
  const queryClient = useQueryClient();
  return useTanstackMutation({
    mutationFn: async ({
      lotId,
      childLotIds,
      reason,
      severity,
    }: {
      lotId: string;
      childLotIds: string[];
      reason: string;
      severity: string;
    }) => {
      if (!supabase) throw new Error('Supabase not configured');

      // 1. Bloquer le lot principal
      const { error: error1 } = await supabase
        .from('lots')
        .update({ cqlib_status: 'BLOQUE' })
        .eq('id', lotId);
      if (error1) throw error1;

      // 2. Bloquer tous les lots descendants si présents
      if (childLotIds.length > 0) {
        const { error: error2 } = await supabase
          .from('lots')
          .update({ cqlib_status: 'BLOQUE' })
          .in('id', childLotIds);
        if (error2) throw error2;
      }

      // 3. Récupérer des infos sur le lot pour pré-remplir la FNC
      const { data: lotData } = await supabase
        .from('lots')
        .select('*, article:articles(name, code)')
        .eq('id', lotId)
        .single();

      // 4. Créer la Fiche de Non-Conformité (FNC) pre-remplie
      const year = new Date().getFullYear();
      const randomId = Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, '0');
      const fncCode = `FNC-${year}-RP-${randomId}`;

      const { error: fncError } = await supabase.from('fnc').insert({
        code: fncCode,
        lot_id: lotId,
        description: `PROCÉDURE DE RAPPEL DE LOT URGENT : ${reason}. Lots impactés : ${lotData?.code} ${childLotIds.length > 0 ? `et ses descendants (${childLotIds.length} sous-lots)` : ''}. Action : Blocage immédiat en stock et silo des lots concernés. Alerte sanitaire initiée.`,
        severity: severity === 'CRITIQUE' ? 'CRITIQUE' : 'MAJEURE',
        status: 'OUVERTE',
        opened_by: (await supabase.auth.getUser()).data.user?.id ?? null,
        opened_at: new Date().toISOString(),
      });

      if (fncError) console.warn('Erreur lors de la création de la FNC de rappel:', fncError);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lots'] });
      queryClient.invalidateQueries({ queryKey: ['lot_genealogy_view'] });
      queryClient.invalidateQueries({ queryKey: ['lot_downstream_view'] });
      queryClient.invalidateQueries({ queryKey: ['fnc'] });
    },
  });
}

// ─── Supplier Evaluations (Module 7) ─────────────────────────────────
export function useSupplierClassificationView() {
  return useTanstackQuery<any[]>({
    queryKey: ['supplier_classification_view'],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('supplier_classification_view')
        .select('*')
        .order('overall_score', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ─── Production Costs (Module 8) ─────────────────────────────────────
export function useProductionCostView() {
  return useTanstackQuery<any[]>({
    queryKey: ['production_cost_view'],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('production_cost_view')
        .select('*')
        .order('completed_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ─── Logistics (Module 9) ────────────────────────────────────────────
export function useLogisticsCalendar() {
  return useTanstackQuery<any[]>({
    queryKey: ['logistics_calendar_view'],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('logistics_calendar_view')
        .select('*')
        .order('planned_date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCarriers() {
  return useTanstackQuery<any[]>({
    queryKey: ['carriers'],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('carriers')
        .select('*')
        .eq('active', true)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDeliveryRoutes(page: number = 0, limit: number = 20) {
  const query = useQuery<any>(
    'delivery_routes',
    (q: any) => q.select('*, carrier:carriers(*)').order('planned_date', { ascending: false }),
    [],
    { page, limit },
  );
  const raw = query.data as any;
  return {
    data: (raw?.data as any[]) || [],
    count: (raw?.count as number) || 0,
    isPending: query.isPending,
    refetch: query.refetch,
  };
}

// ─── Documents (Module 12) ───────────────────────────────────────────
export function useDocuments(referenceType?: string, referenceId?: string) {
  return useTanstackQuery<any[]>({
    queryKey: ['documents', referenceType, referenceId],
    queryFn: async () => {
      if (!supabase) return [];
      let q = supabase
        .from('documents')
        .select('*, uploader:users(full_name)')
        .order('created_at', { ascending: false });
      if (referenceType) q = q.eq('reference_type', referenceType);
      if (referenceId) q = q.eq('reference_id', referenceId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ─── Maintenance (Module 13) ─────────────────────────────────────────
export function useMaintenanceTasks() {
  return useTanstackQuery<any[]>({
    queryKey: ['maintenance_calendar_view'],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('maintenance_calendar_view')
        .select('*')
        .order('next_due_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ─── TRS (Taux de Rendement Synthétique) ────────────────────────────
export function useTRS(lineCode?: string) {
  return useTanstackQuery<any>({
    queryKey: ['trs', lineCode ?? 'global'],
    queryFn: async () => {
      if (!supabase) return null;
      if (lineCode) {
        // TRS d'une ligne spécifique
        const { data, error } = await supabase
          .from('trs_by_line')
          .select('*')
          .eq('line_code', lineCode)
          .single();
        if (error) return null;
        return data;
      } else {
        // TRS global
        const { data, error } = await supabase.from('trs_global').select('*').single();
        if (error) return null;
        return data;
      }
    },
    staleTime: 60_000, // rafraîchir toutes les 60s
  });
}

// ─── RH Module — hooks centralisés ───────────────────────────────────────────

export type RhPersonnelView = {
  id: string;
  matricule: string;
  nom: string;
  prenoms: string;
  nom_complet: string;
  date_embauche: string;
  type_contrat: string;
  actif: boolean;
  section_id: string;
  section_code: string;
  section_nom: string;
  societe_id: string;
  societe_code: string;
  societe_nom: string;
  heures_derniere_semaine: number;
  heures_supp_derniere_semaine: number;
  affectation_active_id: string | null;
};
export type RhSection = {
  id: string;
  societe_id: string;
  code: string;
  nom: string;
  active: boolean;
};
export type RhSociete = { id: string; code: string; nom: string; active: boolean };
export type RhAffectationLine = {
  id: string;
  personnel_id: string;
  date_debut: string;
  date_fin: string | null;
  heures_par_jour: number;
  retour_confirme: boolean;
  confirme_par: string | null;
  notes: string | null;
  // Colonnes ajoutées par migration 069
  plan_status?: 'EN_ATTENTE' | 'ACCEPTEE_PLAN' | 'REFUSEE_PLAN' | 'VALIDEE_RH' | 'REJETEE_RH' | null;
  rh_status?: 'VALIDEE_RH' | 'REJETEE_RH' | null;
  plan_comment?: string | null;
  plan_validator_id?: string | null;
  plan_validated_at?: string | null;
  rh_comment?: string | null;
  rh_validator_id?: string | null;
  rh_validated_at?: string | null;
  created_at: string;
  updated_at: string;
};
export type RhAffectationRequest = {
  id: string;
  section_demandeur: string;
  section_fournisseur: string;
  nb_personnes: number;
  date_debut: string;
  date_fin: string | null;
  heures_par_jour: number;
  motif: string | null;
  statut: 'EN_ATTENTE' | 'EN_ATTENTE_PLAN' | 'EN_ATTENTE_RH' | 'APPROUVE' | 'REJETE' | 'TERMINE';
  demande_par: string | null;
  approuve_par: string | null;
  approuve_at: string | null;
  commentaire_rejet: string | null;
  created_at: string;
  updated_at: string;
  rh_affectations: RhAffectationLine[];
};
export type RhBudgetHeures = {
  id: string;
  section_id: string;
  periode: string;
  heures_budget: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
export type RhPointage = {
  id: string;
  section_id: string;
  periode: string;
  evenement: string;
  heures_normales: number;
  heures_supp: number;
  date_pointage: string;
  created_at: string;
  updated_at: string;
  section?: RhSection;
};

export function useRhPersonnel() {
  // Realtime géré par useRealtimeSync() via realtimeBus → canal 'erp-global-sync'
  const {
    data = [],
    isLoading,
    refetch,
  } = useTanstackQuery<RhPersonnelView[]>({
    queryKey: ['rh_personnel_view'],
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase
        .from('rh_personnel_view')
        .select('*')
        .order('nom_complet');
      if (error) throw error;
      return (data as RhPersonnelView[]) ?? [];
    },
    staleTime: 5000,
  });
  return { data, isLoading, refetch };
}

export function useRhSections() {
  const {
    data = [],
    isLoading,
    refetch,
  } = useTanstackQuery<RhSection[]>({
    queryKey: ['rh_sections'],
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase.from('rh_sections').select('*').order('nom');
      if (error) throw error;
      return (data as RhSection[]) ?? [];
    },
    staleTime: 10000,
  });
  return { data, isLoading, refetch };
}

export function useRhAffectations() {
  // Realtime géré par useRealtimeSync() via realtimeBus → canal 'erp-global-sync'
  const {
    data = [],
    isLoading,
    refetch,
  } = useTanstackQuery<RhAffectationRequest[]>({
    queryKey: ['rh_affectations_demandes'],
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase
        .from('rh_affectations_demandes')
        .select('*, rh_affectations(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as RhAffectationRequest[]) ?? [];
    },
    staleTime: 5000,
  });
  return { data, isLoading, refetch };
}

export function useRhBudgetHeures(sectionId?: string) {
  return useTanstackQuery<RhBudgetHeures[]>({
    queryKey: ['rh_budget_heures', sectionId],
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');
      let q = supabase.from('rh_budget_heures').select('*').order('periode', { ascending: false });
      if (sectionId) q = q.eq('section_id', sectionId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as RhBudgetHeures[]) ?? [];
    },
    staleTime: 15000,
  });
}

export function useRhImportBatches() {
  return useTanstackQuery<{ import_batch_id: string; semaine_label: string; count: number }[]>({
    queryKey: ['rh_import_batches'],
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase
        .from('rh_heures_hebdo')
        .select('import_batch_id, semaine_label')
        .not('import_batch_id', 'is', null)
        .order('import_batch_id', { ascending: false })
        .limit(500);
      if (error) throw error;
      const map = new Map<string, { semaine_label: string; count: number }>();
      for (const row of (data ?? []) as any[]) {
        const k = row.import_batch_id;
        if (!map.has(k)) map.set(k, { semaine_label: row.semaine_label, count: 0 });
        map.get(k)!.count += 1;
      }
      return Array.from(map.entries()).map(([import_batch_id, v]) => ({ import_batch_id, ...v }));
    },
    staleTime: 30000,
  });
}

// ─── RH — Congés ──────────────────────────────────────────────────────────────

export type RhConge = {
  id: string;
  personnel_id: string;
  type_conge: 'CONGE_PAYE' | 'MALADIE' | 'SANS_SOLDE' | 'MATERNITE' | 'EXCEPTIONNEL' | 'AUTRE';
  date_debut: string;
  date_fin: string;
  nb_jours: number;
  motif: string | null;
  // Workflow 2 niveaux (migration 067) — anciens champs conservés pour rétrocompat
  statut: 'EN_ATTENTE' | 'VALIDE_RH' | 'VALIDE' | 'REFUSE_RH' | 'REFUSE_DPI' | 'REFUSE' | 'ANNULE';
  demande_par: string | null;
  // Niveau 1 — RH
  valide_rh_par?: string | null;
  valide_rh_par_nom?: string | null;
  valide_rh_at?: string | null;
  commentaire_rh?: string | null;
  // Niveau 2 — DPI
  valide_dpi_par?: string | null;
  valide_dpi_par_nom?: string | null;
  valide_dpi_at?: string | null;
  commentaire_dpi?: string | null;
  // Anciens champs (rétrocompat)
  valide_par?: string | null;
  valide_at?: string | null;
  commentaire?: string | null;
  preavis_jours?: number | null;
  created_at: string;
  updated_at: string;
  personnel?: { matricule: string; nom: string; prenoms: string } | null;
};

export type RhCongeSolde = {
  personnel_id: string;
  matricule: string;
  nom_complet: string;
  droit_annuel: number;
  anciennete_mois?: number;
  droit_ouvert?: boolean;
  jours_acquis?: number; // 2,5j/mois selon loi 2024-014 (migration 067)
  jours_pris: number;
  jours_en_attente: number;
  solde: number;
  // Enrichi côté hook (join rh_personnel_view)
  societe_code?: string;
  section_nom?: string;
};

export function useRhConges() {
  // Realtime géré par useRealtimeSync() via realtimeBus → canal 'erp-global-sync'
  const {
    data = [],
    isLoading,
    refetch,
  } = useTanstackQuery<RhConge[]>({
    queryKey: ['rh_conges'],
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase
        .from('rh_conges')
        .select('*, personnel:rh_personnels(matricule, nom, prenoms)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as RhConge[]) ?? [];
    },
    staleTime: 5000,
  });
  return { data, isLoading, refetch };
}

export function useRhCongesSoldes() {
  const {
    data = [],
    isLoading,
    refetch,
  } = useTanstackQuery<RhCongeSolde[]>({
    queryKey: ['rh_conges_soldes'],
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');
      // La vue rh_conges_soldes inclut déjà societe_code et section_nom (migration 068)
      const { data, error } = await supabase
        .from('rh_conges_soldes')
        .select('*')
        .order('nom_complet');
      if (error) throw error;
      return (data as RhCongeSolde[]) ?? [];
    },
    staleTime: 10000,
  });
  return { data, isLoading, refetch };
}

/**
 * Hook pour récupérer les récents transferts de stock
 */
export function useStockTransfers() {
  return useTanstackQuery({
    queryKey: ['stock_transfers'],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('stock_movements')
        .select(
          `
          id,
          movement_type,
          qty,
          created_at,
          reference_doc,
          article_id,
          depot_from_id,
          depot_to_id,
          lot_id,
          article:articles(name, code, unit),
          lot:lots(code),
          depot_from:depots!depot_from_id(id, name, code),
          depot_to:depots!depot_to_id(id, name, code)
        `,
        )
        .eq('movement_type', 'TRANSFERT')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.warn('Erreur useStockTransfers:', error);
        return [];
      }
      return data ?? [];
    },
    staleTime: 30000,
  });
}

// ─── Stock Movements (historique complet) ────────────────────────────────────
export function useStockMovements(articleId?: string, limit: number = 50) {
  return useTanstackQuery({
    queryKey: ['stock_movements_full', articleId, limit],
    queryFn: async () => {
      if (!supabase) return [];
      let q = supabase
        .from('stock_movements')
        .select(
          `
          id, movement_type, qty, unit, reference_doc, notes, created_at,
          article:articles(id, code, name, unit, article_type),
          lot:lots(id, code, qty_received, qty_current),
          depot_from:depots!depot_from_id(name),
          depot_to:depots!depot_to_id(name),
          performer:users!performed_by(full_name)
        `,
        )
        .order('created_at', { ascending: false })
        .limit(limit);
      if (articleId) q = q.eq('article_id', articleId);
      const { data, error } = await q;
      if (error) {
        console.warn('useStockMovements:', error);
        return [];
      }
      return data ?? [];
    },
    staleTime: 15000,
  });
}

// ─── Stock Card : stock initial + entrées - sorties = stock final ─────────────
export function useStockCard() {
  return useTanstackQuery({
    queryKey: ['stock_card'],
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('v_stock_card')
        .select('*')
        .order('article_type')
        .order('code');
      if (error) {
        console.warn('useStockCard:', error);
        return [];
      }
      return data ?? [];
    },
    staleTime: 30000,
  });
}

// ─── M3 : Sous-OF d'un OF parent (sous-préparations SF) ──────────────────────
export function useSubProductionOrders(parentOfId?: string) {
  return useTanstackQuery<any[]>({
    queryKey: ['sub_production_orders', parentOfId],
    enabled: !!parentOfId,
    queryFn: async () => {
      if (!supabase || !parentOfId) return [];
      const { data, error } = await supabase
        .from('production_orders')
        .select('*, product:articles(id, code, name, unit, article_type), bom:bom_headers(*)')
        .eq('parent_of_id', parentOfId)
        .order('created_at', { ascending: true });
      if (error) {
        console.warn('useSubProductionOrders:', error);
        return [];
      }
      return data ?? [];
    },
    staleTime: 0, // temps réel via useRealtimeSync
  });
}

// ─── M3 : Consommations MP enregistrées pour un OF ───────────────────────────
export function useOfMpConsumptions(ofId?: string) {
  return useTanstackQuery<any[]>({
    queryKey: ['of_mp_consumptions', ofId],
    enabled: !!ofId,
    queryFn: async () => {
      if (!supabase || !ofId) return [];
      const { data, error } = await supabase
        .from('of_mp_consumptions')
        .select('*, article:articles(id, code, name, unit), lot:lots(id, code, qty_current)')
        .eq('of_id', ofId)
        .order('consumed_at', { ascending: true });
      if (error) {
        console.warn('useOfMpConsumptions:', error);
        return [];
      }
      return data ?? [];
    },
    staleTime: 15000,
  });
}

// ─── M3 : Traçabilité complète d'un lot PF (BP → DA → LO MP → Lot PF) ────────
export function useLotFullTraceability(lotId?: string) {
  return useTanstackQuery<any | null>({
    queryKey: ['lot_full_traceability', lotId],
    enabled: !!lotId,
    queryFn: async () => {
      if (!supabase || !lotId) return null;

      // 1. Lot principal
      const { data: lot, error: lotErr } = await supabase
        .from('lots')
        .select(
          '*, article:articles(id, code, name, unit, article_type), da_import:da_import(id, code, supplier:suppliers(id, name))',
        )
        .eq('id', lotId)
        .single();
      if (lotErr) throw lotErr;

      // 2. OF ayant produit ce lot (origin = code OF)
      let of: any = null;
      if (lot?.origin) {
        const { data: ofData } = await supabase
          .from('production_orders')
          .select('*, product:articles(id, code, name), bom:bom_headers(id, code)')
          .eq('code', lot.origin)
          .maybeSingle();
        of = ofData;
      }

      // 3. Consommations MP de cet OF
      let mpConsumptions: any[] = [];
      if (of?.id) {
        const { data: cons } = await supabase
          .from('of_mp_consumptions')
          .select(
            '*, article:articles(id, code, name, unit), lot:lots(id, code, reception_date, supplier:suppliers(name), da_import:da_import(id, code))',
          )
          .eq('of_id', of.id)
          .order('consumed_at');
        mpConsumptions = cons ?? [];
      }

      // 4. Sous-OF SF liés à cet OF
      let subOfs: any[] = [];
      if (of?.id) {
        const { data: subs } = await supabase
          .from('production_orders')
          .select('*, product:articles(id, code, name, unit, article_type)')
          .eq('parent_of_id', of.id)
          .order('created_at');
        subOfs = subs ?? [];
      }

      return { lot, of, mpConsumptions, subOfs };
    },
    staleTime: 15000,
  });
}

// ─── M3 : Articles SF (semi-finis) avec BOM ──────────────────────────────────
export function useSFWithBom() {
  const query = useQuery<any>(
    'bom_headers',
    (q: any) =>
      q
        .select(
          'product_id, status, product:articles!product_id(id, code, name, name_en, article_type, unit, active, gamme)',
        )
        .order('created_at', { ascending: false }),
    [],
    undefined,
    { staleTime: CACHE_TIMES.SEMI_STATIC, gcTime: CACHE_TIMES.SEMI_STATIC },
  );
  const raw = query.data as any;
  const seen = new Set<string>();
  const products: Article[] = [];
  for (const row of (raw?.data as any[]) || []) {
    const article = row.product;
    if (
      article &&
      article.id &&
      article.active &&
      article.article_type === 'SF' &&
      !seen.has(article.id)
    ) {
      seen.add(article.id);
      products.push(article as Article);
    }
  }
  return { data: products, isPending: query.isPending };
}

// ─── M3 : BOM filtrés par gamme ──────────────────────────────────────────────
export function useBomsByGamme(gamme?: string) {
  const query = useQuery<any>(
    'bom_headers',
    (q: any) => {
      const base = q
        .select('*, product:articles(id, code, name, name_en, article_type, unit, gamme)')
        .order('created_at', { ascending: false });
      return base;
    },
    [gamme],
  );
  const raw = query.data as any;
  const allBoms = (raw?.data as any[]) || [];
  const filtered = gamme ? allBoms.filter((b: any) => b.product?.gamme === gamme) : allBoms;
  return { data: filtered, isPending: query.isPending };
}
