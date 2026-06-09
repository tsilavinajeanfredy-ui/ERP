# API & Hooks — ERP GSI

> Tous les hooks sont définis dans `src/lib/hooks.ts`  
> Basés sur **TanStack React Query 5** + Supabase JavaScript SDK

---

## Piliers techniques

### Client Supabase (`src/lib/supabase.ts`)

```typescript
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
```

Le client est `null` si les variables d'environnement ne sont pas définies (mode dégradé).

### Hooks génériques

#### `useQuery<T>(table, query?, deps?, pagination?)`

Hook générique de lecture avec pagination et filtres dynamiques.

| Paramètre | Type | Description |
|-----------|------|-------------|
| `table` | `string` | Nom de la table Supabase |
| `query` | `(q: PostgrestQuery) => PostgrestQuery` | Filtres optionnels |
| `deps` | `any[]` | Dépendances pour le queryKey |
| `pagination` | `{ page: number, limit: number }` | Pagination optionnelle |

**Retour :** `{ data: T[], count: number }` + métadonnées React Query.

#### `useMutation<T, R>(table, onSuccess?)`

Hook générique d'écriture (INSERT / UPDATE / DELETE / UPLOAD / DELETE_FILE).

| Paramètre `mutate` | Type | Description |
|--------------------|------|-------------|
| `id` | `string` | ID pour UPDATE/DELETE |
| `values` | `Partial<T>` | Données à insérer/mettre à jour |
| `type` | `'INSERT' \| 'UPDATE' \| 'DELETE' \| 'UPLOAD' \| 'DELETE_FILE'` | Type d'opération |
| `file` | `File` | Fichier pour UPLOAD |
| `path` | `string` | Chemin de destination (UPLOAD/DELETE_FILE) |

**Retour :** mutation React Query standard + `uploadProgress: number` + `errorMessage: string`.

**Gestion d'erreurs :** les codes PostgreSQL sont traduits en français (23505 → doublon, 23503 → conflit relation, etc.).

---

## Hooks par module

### 1. Authentification & Profil

#### `useUserSession()`
```typescript
const { session, loading } = useUserSession();
// session: Session Supabase | null
```
État de la session Supabase. Écoute les événements `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`.

#### `useUserProfile()`
```typescript
const { profile, loading, role, user, is2FAMissing } = useUserProfile();
// profile: User | undefined
// role: UserRole | undefined
// is2FAMissing: boolean — alerte si rôle critique sans 2FA
```
Charge le profil utilisateur depuis `public.users` via l'email de la session.

#### `usePermissions()`
```typescript
const { canAccessScreen, canPerformAction, allowedScreens, role } = usePermissions();
// canAccessScreen('Dashboard') => boolean
// canPerformAction('create_lot') => boolean
```
RBAC déclaratif basé sur les matrices `SCREEN_ACCESS` et `ACTION_ACCESS` dans `hooks.ts`.

**Écrans disponibles par rôle :**

| Rôle | Écrans accessibles |
|------|--------------------|
| ADMIN | Dashboard, Audit, Referential, Reception, Laboratory, Production, Stocks, Inventory, Mrp, PurchasingImport, PurchasingLocal, Admin, Complaints, ReceptionPF, PlanningLogistique |
| DPI | Dashboard, Audit, Production, Stocks, Inventory, PurchasingLocal, PlanningLogistique |
| RQ | Dashboard, Audit, Reception, Laboratory, Complaints |
| TLAB | Dashboard, Laboratory, Reception |
| RPROD | Dashboard, Production, Stocks, Mrp, ReceptionPF, PlanningLogistique |
| MAGA | Dashboard, Reception, Stocks, Inventory, PlanningLogistique |
| RACH | Dashboard, Referential, PurchasingImport, PurchasingLocal, PlanningLogistique |
| PLAN | Dashboard, Mrp, Production, Stocks, PlanningLogistique, ReceptionPF |
| COMPTA | Dashboard, Stocks, PurchasingImport, PurchasingLocal |

---

### 2. Utilisateurs

```typescript
function useUsers(page?: number, limit?: number)
// Table: 'users' — SELECT avec pagination, trié par rôle
// { data: User[], count: number }
```

---

### 3. Sites & Dépôts

```typescript
function useSites()
// Table: 'sites' — SELECT *, order('code'), staleTime: 1h

function useDepots()
// Table: 'depots' — SELECT *, order('code'), staleTime: 1h
```

Données quasi-statiques mises en cache 1 heure.

---

### 4. Fournisseurs

```typescript
function useSuppliers(page?: number, limit?: number, search?: string)
// Table: 'suppliers'
// Filtre: active = true, search sur name (ilike)
// { data: Supplier[], count: number }
```

---

### 5. Articles

```typescript
function useArticles(page?: number, limit?: number, type?: string, search?: string)
// Table: 'articles'
// Filtres: active = true, type (article_type), search (code/name/name_en)
// { data: Article[], count: number }
```

---

### 6. Instruments de laboratoire

```typescript
function useInstruments()
// Table: 'instruments' — SELECT *, eq('active', true), order('code')
// { data: Instrument[], count: number }
```

---

### 7. Lots (unité centrale)

```typescript
function useLots(page?: number, limit?: number, status?: string)
// Table: 'lots' — avec relations article:articles(*), be:bons_entree(code)
// Filtre: status (cqlib_status)
// Tri: reception_date DESC

function useRecentLots(limit?: number)
// Lots récents (limit=5 par défaut) avec relation article
```

**Relations chargées :** `article` (objet complet), `be` (code du bon d'entrée).

---

### 8. FCQ Dossiers (Contrôle Qualité)

```typescript
function useFcqDossiers(page?: number, limit?: number)
// Table: 'fcq_dossiers'
// Relations: lot:lots(*, article:articles(*)), instrument:instruments(*)
// Tri: created_at DESC
```

---

### 9. Spécifications Qualité

```typescript
function useQcSpecifications(specRef?: string)
// Table: 'qc_specifications'
// Filtre: active = true, optionnel spec_ref
// Tri: parameter_name
```

---

### 10. FNC (Non-Conformités)

```typescript
function useFnc(page?: number, limit?: number)
// Table: 'fnc' — Tri: opened_at DESC
// { data: Fnc[], count: number }
```

---

### 11. DA Import (Achats Import)

```typescript
function useDaImport()
// Table: 'da_import'
// Relations: article:articles(*), supplier:suppliers(*)
// Tri: created_at DESC
```

---

### 12. DA Local (Achats Local)

```typescript
function useDaLocal(page?: number, limit?: number)
// Table: 'da_local'
// Relations: article:articles(*), supplier:suppliers(*), deliveries:da_local_deliveries(*)
// Tri: created_at DESC

function useDaLocalDeliveries(daLocalId: string)
// Table: 'da_local_deliveries' — filtrée par da_local_id
```

---

### 13. Production & BOM

```typescript
function useBoms()
// Table: 'bom_headers' avec relation product:articles(*)
// Tri: created_at DESC

function useBomLines(bomHeaderId?: string)
// Table: 'bom_lines' avec relation component:articles(*)
// Filtrée par bom_header_id

function useProductionOrders(page?: number, limit?: number)
// Table: 'production_orders'
// Relations: product:articles(*), bom:bom_headers(*)
// Tri: planned_date DESC
```

---

### 14. Inventaire

```typescript
function useInventoryCampaigns()
// Table: 'inventory_campaigns' — Tri: created_at DESC
```

---

### 15. Journal d'Audit

```typescript
function useAuditLogs(page?: number, limit?: number)
// Table: 'audit_log' avec relation user:users(full_name, email)
// Tri: created_at DESC, staleTime: 30s

function useRecordAuditLogs(tableName: string, recordId: string)
// Historique d'un enregistrement spécifique
```

---

### 16. Tableau de bord (KPIs)

```typescript
function useDashboardKpis()
// Agrégations parallèles (Promise.all) sur :
// - lots en QUARANTAINE
// - lots BLOQUE
// - FCQ en attente/cours
// - FNC ouvertes
// - DA Import en cours
// - Instruments échus
// Retour: DashboardKpi | null
```

---

### 17. Notifications

```typescript
function useInternalNotifications()
// Table: 'notifications' — filtré par role OU user_id
// Limité aux 20 plus récentes

function useNotification()
// Mutation pour créer une notification (insert dans notifications)
// Paramètres: to_role, subject, message, type, category?, metadata?
```

---

### 18. Taux de change

```typescript
function useExchangeRates()
// Table: 'exchange_rates' — order('currency')
```

---

### 19. Évaluations fournisseurs

```typescript
function useSupplierEvaluations(supplierId?: string)
// Table: 'supplier_evaluations'
// Filtré par supplier_id si fourni

function useSupplierEvalSummaries(supplierId?: string)
// Table: 'supplier_evaluation_summary'
// Filtré par supplier_id si fourni
```

---

### 20. Réclamations clients

```typescript
function useComplaints(page?: number, limit?: number)
// Table: 'complaints' avec relations lot:lots(*), article:articles(*)
// Tri: opened_at DESC
```

---

### 21. Étalonnage

```typescript
function useCalibrationLog(instrumentId?: string)
// Table: 'calibration_log' avec relations instrument:instruments(*), calibrated_by:users(full_name)
// Filtré par instrument_id si fourni
```

---

### 22. Export PDF

```typescript
function useExport()
// { exporting: boolean, progress: number, triggerExport(title?, content?) }
// Utilise getPdfTemplate + generatePdf de src/lib/pdf.ts
```

---

## Mutation patterns

### INSERT
```typescript
const { mutate } = useMutation('lots');
mutate({ values: { article_id, qty_received, unit: 'kg' }, type: 'INSERT' });
```

### UPDATE
```typescript
mutate({ id: 'uuid-du-lot', values: { cqlib_status: 'LIBERE' }, type: 'UPDATE' });
```

### DELETE
```typescript
mutate({ id: 'uuid', type: 'DELETE' });
```

### UPLOAD (fichier)
```typescript
mutate({ file: documentFile, path: 'da-import/2026/doc.pdf', type: 'UPLOAD' });
// Validation : taille max 10 Mo
```

### DELETE_FILE
```typescript
mutate({ path: 'da-import/2026/doc.pdf', type: 'DELETE_FILE' });
```

---

## Fonctions utilitaires

### `translatePgError(error)`
Traduit les codes d'erreur PostgreSQL en français lisible.

| Code | Traduction |
|------|------------|
| 23505 | "Cet identifiant existe déjà (doublon détecté)." |
| 23503 | "Conflit de relation : l'objet est encore lié à d'autres données." |
| 23502 | "Un champ obligatoire n'a pas été renseigné." |
| 42P01 | "Erreur de configuration : Table introuvable sur le serveur." |
| PGRST116 | "L'enregistrement demandé est introuvable." |

### `getSignedUrlForStorageFile(bucketName, filePath)`
Crée une URL signée (1h) pour un fichier dans un bucket Supabase Storage.

---

## Offline Mode

```typescript
function useOfflineInventory()
// Comptages inventaire stockés localement (localStorage)
// syncWithServer() → insert en masse dans inventory_counts
// addOfflineCount(count) → stockage local
```

---

## MRP Engine (`src/lib/mrp.ts`)

```typescript
// Fonction de calcul
async function calculateMRP(whatIfScenario?: {
  product_id?: string;
  demand_change?: string;
}): Promise<MRPResult[]>

// Hook React
function useRealMRP(): {
  calculating: boolean;
  progress: number;
  status: 'IDLE' | 'RUNNING' | 'COMPLETED';
  runMRP: (scenario?) => Promise<void>;
  results: MRPResult[];
  error: string | null;
}
```

**Formule MRP :** `besoins_nets = MAX(0, 2 × consommation − stock − entrées)`

**Actions :** RAS, RECOMMANDER, COMMANDE_URGENTE, RUPTURE_RISQUE

---

## Synchronisation SAGE (`src/lib/sage.ts`)

```typescript
async function triggerFullSageSync(): Promise<SageSyncResult[]>
// Tables synchronisées: lots, stock_movements, da_import, da_local

async function markAsSageSynced(table, recordId): Promise<void>
async function getPendingSyncRecords(table): Promise<any[]>
async function countPendingSyncRecords(): Promise<number>
```

---

## Génération PDF (`src/lib/pdf.ts`)

**Templates disponibles :**

```typescript
getPdfTemplate(title, bodyHtml, options?) // Template générique
getFcqTemplate(data)   // Fiche Contrôle Qualité
getBtTemplate(data)    // Bon de Transport
getBsTemplate(data)    // Bon de Sortie
getPvTemplate(data)    // Procès-Verbal
getBeTemplate(data)    // Bon d'Expédition

async function generatePdf(html, fileName, options?)
// Web: impression navigateur / téléchargement
// Mobile: Print.printToFileAsync + Sharing.shareAsync
```

---

## Constantes de cache (`hooks.ts`)

```typescript
CACHE_TIMES = {
  STATIC: 60 * 60 * 1000,       // 1h : sites, depots
  SEMI_STATIC: 5 * 60 * 1000,   // 5min : articles, instruments, specs
  TRANSACTIONAL: 0,              // pas de cache : lots, FCQ, DA
};
```
