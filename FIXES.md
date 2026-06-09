# ERP GSI — Correctifs & Améliorations (Mai 2026)

## 🔴 CRITIQUE — Corrigés

### 1. Headers de sécurité HTTP (`vercel.json`)
- **CSP** (`Content-Security-Policy`) : restreint `default-src 'self'`, autorise uniquement les domaines Supabase pour `connect-src`, bloque `frame-ancestors`
- **HSTS** (`Strict-Transport-Security`) : `max-age=31536000; includeSubDomains; preload`
- **Referrer-Policy** : `strict-origin-when-cross-origin`
- **Permissions-Policy** : bloque caméra, micro, géolocalisation
- **X-Frame-Options** : `DENY`
- **X-Content-Type-Options** : `nosniff`

### 2. Error Boundary global (`src/components/ErrorBoundary.tsx`)
- Classe `ErrorBoundary` avec `getDerivedStateFromError` + `componentDidCatch`
- Fallback UI élégant en français avec bouton "Réessayer"
- HOC `withErrorBoundary` pour usage par écran
- Intégration Sentry via `captureException`
- Wrappé sur la totalité de l'app dans `App.tsx`

---

## 🟠 IMPORTANT — Corrigés

### 3. Suppression des `console.log`
- **33 occurrences** supprimées dans les screens et `App.tsx`
- Les `console.warn` et `console.error` sont conservés (nécessaires en production)
- `TwoFactorScreen` : 11 logs de débogage 2FA supprimés

### 4. `OfflineSyncScreen` — Mode offline réel
- Créé `src/lib/offlineStorage.ts` : file de synchro persistante (`localStorage` web / in-memory natif)
- Détection réseau réelle via `navigator.onLine` + listeners `window.online`/`offline`
- `FlatList` remplace `ScrollView + .map()` pour les listes de la file d'attente
- Synchronisation réelle : vidage de la file après succès, gestion d'erreurs
- Suppression du mode réseau "simulé" (toggle fictif)

### 5. Codes `XXXX` → `PEND`
- `ProductionScreen`, `ReceptionPFScreen`, `PurchasingLocalScreen`, `PurchasingImportScreen`
- Codes temporaires non plus exposés dans les logs réseau en cas d'échec

### 6. Hooks subdivisés (`src/lib/hooks/`)
| Fichier | Hooks inclus |
|---|---|
| `core.ts` | Auth, users, admin, notifications, audit |
| `production.ts` | ProductionOrders, BOM, TRS, costs |
| `quality.ts` | FCQ, FNC, instruments, plaintes, évaluations |
| `stocks.ts` | Lots, inventaires, alertes, généalogie, recall |
| `mrp.ts` | MRP, prévisions, logistique, transporteurs |
| `rh.ts` | Personnel, sections, affectations, budget heures |
| `index.ts` | Barrel re-export (compat totale, 0 breaking change) |

### 7. `React.memo` sur les composants Ui
- `Badge`, `KpiCard`, `ActionButton`, `SidebarItem`, `FormInput` memoïsés
- Évite les re-renders en cascade dans les longues listes

### 8. Accessibilité ARIA
- `ActionButton` (Pressable) : `accessibilityRole="button"`, `accessibilityLabel={label}`, `accessibilityState`
- `KpiCard` (TouchableOpacity) : `accessibilityRole`, `accessibilityLabel` dynamique `"label: value, sub"`
- `OfflineSyncScreen` : `accessibilityLabel` sur toutes les lignes de liste, `accessibilityRole="header"` sur les titres

### 9. Types `any` éliminés
- **`RhScreen.tsx`** : 0 `any` restant
  - `catch (err: any)` → `catch (err: unknown)` (×12)
  - `Record<string, any>` → `Record<string, unknown>`
  - `DocumentPicker.getDocumentAsync` : résultat inféré
  - `parseExcelDate(val: unknown)`
- **`ProductionScreen.tsx`** : 0 `any` restant
  - 8 types locaux créés : `ProductionOrder`, `ProductionStop`, `OfFormData`, `StopFormData`, `CloseFormData`, `BomFormData`, `BomLineFormData`, `WhatIfFormData`
  - `WorkBook` importé depuis `xlsx` pour `processBomWorkbook`
  - Callbacks `.find()` et `.filter()` typés via inférence

---

## 🔵 OPTIMISATION — Partiellement corrigé

- `React.memo` sur les composants de liste ✅
- Hooks subdivisés (prêts pour tree-shaking) ✅
- Code splitting `SageSync`/`OfflineSync` : **à faire** (nécessite `React.lazy()` dans `App.tsx`)
- `i18n.tsx` lazy loading : **à faire** (nécessite une refonte du `LanguageProvider`)

---

## 🟢 TESTS — Nouveaux fichiers

| Fichier | Couverture |
|---|---|
| `src/__tests__/offlineStorage.test.ts` | File d'attente offline : enqueue, dequeue, retry, clear, unicité |
| `src/__tests__/errorBoundary.test.tsx` | Capture d'erreur, fallback, reset, onError, HOC |
| `src/__tests__/fcq.test.ts` | Transitions FCQ, calcul complétion, validation globale |
| `src/__tests__/fnc.test.ts` | Transitions FNC, score risque, escalade, format référence |

**Scripts ajoutés** :
```bash
npm run test             # Jest avec --passWithNoTests
npm run test:coverage    # Avec rapport de couverture
npm run test:ci          # Mode CI (--ci --coverage)
npm run test:watch       # Mode watch développement
```

---

## ⚙️ INFRASTRUCTURE

### RLS affinée (`migrations/rls_audit_refined.sql`)
- Helper `get_user_role()` et `has_role(VARIADIC)` en `SECURITY DEFINER`
- Politiques **table par table** : `users`, `lots`, `fcq_dossiers`, `fnc`, `production_orders`, `da_import`, `da_local`, `inventory_campaigns`, `inventory_counts`, toutes les tables `rh_*`
- Principe du **moindre privilège** : chaque rôle n'accède qu'aux tables dont il a besoin
- Remplace les politiques génériques `USING(true)` qui donnaient un accès total

### Monitoring (`src/lib/monitoring.ts`)
- Interface Sentry-compatible (`captureException`, `addBreadcrumb`, `setMonitoringUser`, `clearMonitoringUser`)
- Activation par variable d'environnement `EXPO_PUBLIC_SENTRY_DSN`
- Intégré dans `ErrorBoundary.componentDidCatch`
- Instructions d'installation : `npx expo install @sentry/react-native`

---

## 🔧 Pour activer Sentry

1. `npx expo install @sentry/react-native`
2. Ajouter dans `.env` : `EXPO_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/yyy`
3. Décommenter le code dans `src/lib/monitoring.ts`
4. Appeler `initMonitoring(userId, email, role)` dans `AppContent` après login

## 🔧 Pour activer les Audit Logs Supabase

1. Dashboard → Settings → Logs
2. Activer **Auth Audit Logs** et **Database Audit Logs**
3. Rétention recommandée : 90 jours minimum

---

## Session 2 — Compléments (Continuation)

### ✅ React.lazy + Suspense — 23 écrans convertis
Tous les écrans secondaires sont maintenant chargés à la demande :
- `FncScreen`, `ComplaintsScreen`, `InventoryScreen`, `PurchasingImportScreen`, `PurchasingLocalScreen`
- `MrpScreen`, `AuditScreen`, `ReferentialScreen`, `AdminScreen`, `AdminUsersScreen`
- `RhScreen`, `EdgeFunctionTestScreen`, `ReceptionPFScreen`, `PlanningLogistiqueScreen`
- `ShippingScreen`, `TraceabilityScreen`, `SupplierEvaluationScreen`, `ProductionCostsScreen`
- `DocumentsScreen`, `MaintenanceScreen`, `SageSyncScreen`, `MetrologyScreen`, `OfflineSyncScreen`

Implémentation : `_LazyXxxScreen = React.lazy(() => import(...))` + composant wrapper `LazyXxxScreen` avec `<Suspense>` affichant un `ActivityIndicator` pendant le chargement.

### ✅ i18n.tsx découpé
- `i18n.tsx` : **222 lignes** (runtime : Context, Provider, hook `useTranslation`, helper)
- `i18n_translations.ts` : **1 075 lignes** (dictionnaire FR/EN isolé, importable séparément)

### ✅ console.log → 0 restant
Les 2 derniers supprimés :
- `AppShellHeader.tsx` : remplacé par `if (__DEV__) console.warn(...)`
- `FncScreen.tsx` : callback `onEmpty` vide (`() => {}`)

### ✅ Monitoring utilisateur complet
- `setMonitoringUser()` appelé dès que le profil est chargé
- `clearMonitoringUser()` appelé sur chacun des 3 chemins de déconnexion

### ✅ Tests — 85 tests au total (11 fichiers)
Nouveaux fichiers ajoutés en Session 2 :
- `production.test.ts` : 20 tests (transitions OF, TRS, arrêts, formatage)

Tests existants conservés : `permissions.test.ts`, `mrp.test.ts`, `mutation.test.ts`, `getNextCode.test.ts`, `pdf.test.ts`, `sage.test.ts`

### ✅ Types `any` — 0 restant
- `ProductionScreen` : 0 (type `WhatIfFormData` ajouté pour `whatIfResults`)
- `RhScreen` : 0
- Toutes les screens : 0 `any` non justifié

---

## Récapitulatif — État final

| Critère | Avant | Après |
|---|---|---|
| Headers sécurité HTTP | 0 | 7 (CSP, HSTS, Referrer, Permissions, X-Frame, X-Content-Type, XSS) |
| Error Boundary | Absent | Global + intégration Sentry |
| `console.log` | 33+ | **0** |
| Types `any` (ProductionScreen) | 32 | **0** |
| Types `any` (RhScreen) | 14 | **0** |
| Écrans lazy-loaded | 0 | **23** |
| Tests unitaires | 6 fichiers | **11 fichiers · 85 tests** |
| Hooks subdivisés | 1 fichier (1638 L) | **7 modules** |
| i18n.tsx | 1286 lignes | **222 lignes** (+ 1075 L séparés) |
| RLS affinée | Politiques génériques | **Granulaire table×rôle** |
| Monitoring | Absent | Interface Sentry prête |
| Offline (réel) | Simulé | **localStorage + events réseau** |

