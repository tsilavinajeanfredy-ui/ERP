# ERP GSI — Application de Gestion Industrielle

> **Version :** 0.1.0 · **Statut :** Développement actif  
> **Portée :** Savonnerie, Bougies, Détergents, Papier hygiénique, Cordes nylon, Encaustiques

---

## Présentation

ERP GSI est une application de gestion industrielle complète destinée au **Pôle Industriel Sipromad** (Antananarivo, Madagascar). Elle couvre l'ensemble des processus de l'usine : réception matières premières, contrôle qualité laboratoire (CQ-LIB), production, nomenclatures (BOM), stocks multi-dépôts, achats import et local, calcul MRP, inventaire, réclamations clients, évaluation fournisseurs, et synchronisation SAGE.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│              CLIENT (Expo / React Native)        │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Mobile   │  │   Web    │  │   Tablet     │  │
│  │  (iOS/And)│  │  (SPA)   │  │  (React Nat) │  │
│  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│       └──────────────┼──────────────┘           │
│                      │ HTTPS                    │
└──────────────────────┼──────────────────────────┘
                       │
┌──────────────────────┼──────────────────────────┐
│           SUPABASE (Backend as a Service)        │
│  ┌──────────────────┼────────────────────────┐  │
│  │       PostgreSQL 16  (Row Level Security)  │  │
│  │  • Tables métier (lots, FCQ, DA, BOM...)  │  │
│  │  • Triggers & RPC (MRP, audit, sync)      │  │
│  │  • RLS par rôle (RBAC)                    │  │
│  └───────────────────────────────────────────┘  │
│  ┌──────────────┐  ┌──────────────────────────┐ │
│  │  Auth (email) │  │  Storage (documents/photos)│
│  └──────────────┘  └──────────────────────────┘ │
│  ┌──────────────────────────────────────────┐   │
│  │  Edge Functions (sage-sync)              │   │
│  └──────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
                       │
┌──────────────────────────────────────────────────┐
│           DÉPLOIEMENT                            │
│  ┌─────────────┐  ┌─────────────────────────┐   │
│  │ Vercel      │  │ VPS Hetzner (nginx)      │   │
│  │ (expo web)  │  │ (Auto-hébergement)       │   │
│  │ CDN global  │  │ SSL Let's Encrypt        │   │
│  └─────────────┘  └─────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

---

### Stack technique

| Couche             | Technologie                                              |
|--------------------|----------------------------------------------------------|
| **Framework**      | React Native / Expo SDK 52                               |
| **Langage**        | TypeScript 5.8                                           |
| **Navigation**     | React Navigation 6 (Drawer)                              |
| **Requêtes**       | TanStack React Query 5                                   |
| **Backend**        | Supabase (PostgreSQL 16 + Auth + Storage + Edge Functions) |
| **PDF**            | Expo Print + custom HTML templates                        |
| **Internationalisation** | Système i18n FR/EN intégré                         |
| **UI/UX**          | Moti (animations), Lucide icons, Signature Canvas        |
| **CI/CD**          | GitHub Actions → VPS Hetzner (rsync)                    |

---

## Démarrage rapide (local)

```bash
# 1. Cloner le dépôt
git clone <url-du-repo>
cd erp-native

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp .env.example .env

# 4. Éditer .env avec vos identifiants Supabase
#    EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
#    EXPO_PUBLIC_SUPABASE_ANON_KEY=xxxx

# 5. Lancer les migrations SQL dans Supabase (SQL Editor)
#    Exécuter dans l'ordre : 001_schema.sql → 002_seed.sql → ... → 016_complaints.sql

# 6. Démarrer l'application
npm run dev        # Expo Web (http://localhost:8081)
npm run android    # Appareil Android / Émulateur
npm run ios        # Simulateur iOS (macOS uniquement)
```

---

## Scripts disponibles

| Commande            | Description                                        |
|---------------------|----------------------------------------------------|
| `npm run dev`       | Expo Web avec hot-reload                           |
| `npm start`         | Expo (choisir la plateforme)                       |
| `npm run web`       | Expo Web explicite                                 |
| `npm run android`   | Build Android                                      |
| `npm run ios`       | Build iOS                                          |
| `npm run build:web` | Export statique vers `dist/` (déploiement)         |
| `npm run lint`      | ESLint sur tout le projet                          |
| `npm run typecheck` | Vérification TypeScript (tsc --noEmit)             |
| `npm test`          | Tests Jest                                         |

---

## Structure du projet

```
erp-native/
├── App.tsx                          # Point d'entrée : navigation, auth, 2FA
├── app.json                         # Configuration Expo
├── package.json
├── tsconfig.json
├── vercel.json                      # Config déploiement Vercel
├── .env.example                     # Variables d'environnement
├── supabase/
│   ├── 001_schema.sql               # Schéma complet (tables, enums, RLS)
│   ├── 002_seed.sql                 # Données de démonstration
│   ├── 003_notifications.sql        # Table notifications internes
│   ├── 004_qc_specifications.sql    # Spécifications qualité
│   ├── 005_security_hardening.sql   # RLS avancé avec auth.uid()
│   ├── 006_industrial_automation.sql # Automatisations, triggers stock
│   ├── 007_multisite_bilingual.sql   # Multi-site, bilingue, standard cost
│   ├── 008_production_master_data.sql / 008_pf_master_data.sql
│   ├── 009_production_master_data_v2.sql / 009_pf_master_data_v2.sql
│   ├── 010_mp_master_data.sql        # Matières premières
│   ├── 011_security_automation.sql   # Quarantaine automatique, index
│   ├── 012_test_users.sql            # Utilisateurs de test
│   ├── 013_articles_achats.sql       # Articles SPAH & SICD
│   ├── 014_supplier_evaluation.sql   # Évaluation fournisseurs
│   ├── 015_fix_enums.sql             # Correctifs enums & colonnes SAGE
│   ├── 016_complaints.sql            # Module réclamations clients
│   ├── 999_admin_setup.sql           # Création admin + sync auth
│   ├── setup_backend.sql             # RPC MRP, audit, auto-FNC
│   └── notes.sql                     # Table de test initiale
├── src/
│   ├── lib/
│   │   ├── supabase.ts               # Client Supabase
│   │   ├── hooks.ts                  # Tous les hooks React Query
│   │   ├── database.types.ts         # Types TypeScript des tables
│   │   ├── env.ts                    # Variables d'environnement
│   │   ├── pdf.ts                    # Génération PDF (FCQ, BT, BS, PV...)
│   │   ├── sage.ts                   # Synchronisation SAGE
│   │   ├── mrp.ts                    # Moteur MRP
│   │   ├── i18n.tsx                  # Internationalisation FR/EN
│   │   ├── search.tsx                # Contexte recherche global
│   │   └── SidebarContext.tsx        # Contexte sidebar
│   ├── screens/                      # 21 écrans (voir ci-dessous)
│   ├── components/                   # Composants réutilisables
│   └── __tests__/                    # Tests unitaires
├── infra/
│   └── nginx.conf                    # Configuration VPS (SSL, proxy)
├── .github/workflows/
│   └── deploy.yml                    # CI/CD GitHub Actions
└── public/                           # Assets statiques
```

### Écrans de l'application

| Écran                    | Description                                        |
|--------------------------|----------------------------------------------------|
| `LoginScreen`            | Authentification utilisateur                       |
| `TwoFactorScreen`        | Vérification 2FA (rôles critiques)                 |
| `DashboardScreen`        | Tableau de bord 360° avec KPIs                     |
| `ReceptionScreen`        | Réception matières premières (BE + lots)           |
| `ReceptionPFScreen`      | Réception produits finis                           |
| `LaboratoryScreen`       | Laboratoire CQ : FCQ, décision libération          |
| `FncScreen`              | Fiches de non-conformité (méthodologie 8D)         |
| `ProductionScreen`       | Ordres de fabrication, BOM, PDP, What-If           |
| `StocksScreen`           | Stocks multi-dépôts, transferts, ajustements       |
| `InventoryScreen`        | Campagnes d'inventaire, comptage offline           |
| `PurchasingImportScreen` | Achats import (8 étapes de DA_VALIDEE à RECEPTION) |
| `PurchasingLocalScreen`  | Achats local (SAISIE → VALIDATION → COMMANDE → RECEPTION) |
| `MrpScreen`              | Moteur MRP, calcul des besoins nets                |
| `ReferentialScreen`      | Données de base (articles, fournisseurs, dépôts)   |
| `AdminScreen`            | Administration utilisateurs et rôles               |
| `AuditScreen`            | Journal d'audit (traçabilité complète)             |
| `ComplaintsScreen`       | Gestion des réclamations clients                   |
| `PlanningLogistiqueScreen` | Planning logistique                              |
| `ShippingScreen`         | Expéditions                                        |

---

## Déploiement

### Déploiement Vercel (Expo Web)

```bash
# Build
npm run build:web

# Configuration Vercel (via l'interface ou CLI) :
# - Root Directory : erp-native
# - Build Command  : npm run build:web
# - Output Directory : dist
# - Variables d'environnement :
#   EXPO_PUBLIC_SUPABASE_URL
#   EXPO_PUBLIC_SUPABASE_ANON_KEY
```

Le fichier `vercel.json` est préconfiguré pour router toutes les requêtes vers `index.html` (SPA mode).

### Déploiement VPS (Hetzner)

```bash
# Build statique
npm run build:web

# Copier vers le VPS (via SCP/rsync)
rsync -avz dist/ user@vps:/var/www/erp-gsi/web-dist/
```

Le fichier `infra/nginx.conf` fournit la configuration SSL Let's Encrypt avec en-têtes de sécurité.

### CI/CD (GitHub Actions)

Le workflow `.github/workflows/deploy.yml` déclenche automatiquement :
1. Build sur `git push main`
2. Déploiement vers le VPS via `appleboy/scp-action`
3. Notification Slack sur le canal `#erp-ops`

**Secrets GitHub requis :** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VPS_HOST`, `VPS_USERNAME`, `VPS_SSH_KEY`, `SLACK_WEBHOOK_URL`

---

## Variables d'environnement

| Variable                      | Description                        |
|-------------------------------|------------------------------------|
| `EXPO_PUBLIC_SUPABASE_URL`    | URL du projet Supabase             |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Clé anon publique Supabase       |

Les variables préfixées `EXPO_PUBLIC_*` sont accessibles côté client et compilées statiquement par Expo.

---

## Rôles et permissions (RBAC)

| Rôle         | Description                                      |
|--------------|--------------------------------------------------|
| `ADMIN`      | Accès total à tous les écrans et actions          |
| `SUPER_ADMIN`| Accès total + administration système              |
| `DPI`        | Directeur Pôle Industriel : production, validation|
| `RQ`         | Responsable Qualité : FCQ, FNC, décision CQ-LIB  |
| `TLAB`       | Technicien Laboratoire : saisie FCQ              |
| `RPROD`      | Responsable Production : OF, BOM, MRP            |
| `MAGA`       | Magasinier : réception, stock, inventaire        |
| `RACH`       | Responsable Achats : DA import et local          |
| `PLAN`       | Planificateur : MRP, production                  |
| `COMPTA`     | Comptabilité : consultation stocks, DA           |

---

## Synchronisation SAGE

Le module `src/lib/sage.ts` gère la synchronisation des données vers le logiciel comptable SAGE :

- **Tables synchronisées :** `lots`, `stock_movements`, `da_import`, `da_local`
- **Marquage :** `sage_synced` + `sage_synced_at` sur chaque enregistrement
- **Mode :** Simulation d'envoi via Edge Function `sage-sync` (à connecter à l'API REST/ODATA de SAGE en production)
- **Vue admin :** Tableau de bord indiquant le nombre d'enregistrements en attente de sync

---

## Génération PDF

Le module `src/lib/pdf.ts` génère des documents professionnels :

- **Fiche Contrôle Qualité (FCQ)** — Résultats d'analyse, décision
- **Bon de Transport (BT)** — Transporteur, véhicule, chauffeur
- **Bon de Sortie (BS)** — Demandeur, destination, quantités
- **Procès-Verbal (PV)** — Réunions, participants, actions
- **Bon d'Expédition (BE)** — Client, dépôt, transporteur
- **Template générique** — Filigrane, QR code, signature

---

## Internationalisation

L'application supporte le français (`FR`) et l'anglais (`EN`) via `src/lib/i18n.tsx` :

- Traductions complètes de tous les libellés UI
- Traduction contextuelle des noms de produits
- Commutation via le profil utilisateur

---

## Contribution

1. Créer une branche feature : `git checkout -b feature/ma-fonctionnalite`
2. Commiter avec des messages conventionnels
3. Ouvrir une Pull Request vers `main`
4. La CI valide le build et le déploiement

Pour le développement local, les migrations SQL sont à exécuter dans **l'ordre numérique** (001 → 016).

---

## Licence

Usage interne — Pôle Industriel Sipromad / GSI Madagascar
