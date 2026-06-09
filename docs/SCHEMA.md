# Schéma de la base de données — ERP GSI

> Base : **Supabase PostgreSQL 16** · 28 tables · 3+ schémas  
> Migrations : `supabase/001_schema.sql` → `supabase/016_complaints.sql`

---

## Types énumérés (ENUMs)

```sql
-- Type d'article
article_type     → 'MP' | 'SF' | 'PF' | 'EMB'

-- Statut CQ-LIB d'un lot
cqlib_status     → 'QUARANTAINE' | 'LIBERE' | 'BLOQUE' | 'DETERIORE' | 'DEROGATION'

-- Statut dossier FCQ
fcq_status       → 'EN_ATTENTE' | 'EN_COURS' | 'COMPLET' | 'VALIDE'

-- Gravité FNC
fnc_severity     → 'MINEURE' | 'MAJEURE' | 'CRITIQUE'

-- Statut FNC
fnc_status       → 'OUVERTE' | 'EN_COURS' | 'A_VALIDER' | 'CLOTUREE'

-- Étapes workflow achats import
da_import_step   → 'DA_VALIDEE' | 'PROFORMA' | 'LC_VIREMENT' | 'EXPEDITION' 
                   | 'CONNAISSEMENT' | 'DEDOUANEMENT' | 'ETA' | 'RECEPTION'

-- Étapes workflow achats local
da_local_step    → 'SAISIE' | 'VALIDATION' | 'COMMANDE' | 'RECEPTION'

-- Statut global d'une DA
da_status        → 'EN_COURS' | 'RETARD' | 'LIVRE' | 'CLOS' | 'ANNULE'

-- Statut instrument de laboratoire
instrument_status → 'ETALONNE' | 'A_ETALONNER' | 'ECHU' | 'EN_ATTENTE'

-- Statut campagne d'inventaire
inventory_status → 'EN_PREPARATION' | 'EN_COURS' | 'TERMINE' | 'VALIDE'

-- Rôle utilisateur
user_role        → 'DPI' | 'RQ' | 'TLAB' | 'RPROD' | 'MAGA' | 'RACH' 
                   | 'PLAN' | 'ADMIN' | 'COMPTA' | 'SUPER_ADMIN' | 'DSI' | 'SUPERVISEUR'

-- Statut nomenclature BOM
bom_status       → 'BROUILLON' | 'VALIDE' | 'ARCHIVE'

-- Type de mouvement de stock
movement_type    → 'ENTREE' | 'SORTIE' | 'TRANSFERT' | 'AJUSTEMENT'

-- Critères d'évaluation fournisseur
eval_criteria    → 'QUALITY' | 'DELIVERY' | 'PRICE' | 'COMPLIANCE' | 'SERVICE'

-- Période d'évaluation
eval_period      → 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'YEARLY'

-- Réclamation client
complaint_status → 'OUVERTE' | 'EN_ANALYSE' | 'TRAITEE' | 'CLOTUREE'
complaint_origin → 'CLIENT' | 'INTERNE' | 'TRANSPORTEUR' | 'AUTRE'
complaint_severity → 'MINEURE' | 'MAJEURE' | 'CRITIQUE'
```

---

## Tables et relations

### 1. `users` — Utilisateurs & RBAC

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | `uuid` | PK, `gen_random_uuid()` | Identifiant unique |
| auth_id | `uuid` | UNIQUE, nullable | Lien vers `auth.users` Supabase |
| email | `text` | NOT NULL, UNIQUE | Adresse email (login) |
| full_name | `text` | NOT NULL | Nom complet |
| role | `user_role` | NOT NULL, DEFAULT 'MAGA' | Rôle RBAC |
| site | `text` | DEFAULT 'Antananarivo' | Site de rattachement |
| scope | `text` | | Périmètre : ex. "SAV, PAP, BOU" |
| avatar_url | `text` | | URL avatar |
| active | `boolean` | NOT NULL, DEFAULT true | Compte actif |
| two_fa_enabled | `boolean` | NOT NULL, DEFAULT false | 2FA activée |
| created_at / updated_at | `timestamptz` | NOT NULL | Horodatage |

**Trigger :** `on_auth_user_created` — insère automatiquement dans `public.users` à la création dans `auth.users`.

**Fonction helper :** `public.get_role()` → retourne le rôle de l'utilisateur connecté via `auth.uid()`.

### 2. `sites` — Sites industriels

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| code | `text` UNIQUE | Code site (ex: TANA-103) |
| name | `text` NOT NULL | Nom du site |
| city | `text` | Ville |
| active | `boolean` | Site actif |

### 3. `depots` — Dépôts / Magasins

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| code | `text` UNIQUE | Code dépôt (ex: D-103-MP) |
| name | `text` NOT NULL | Nom |
| site_id | `uuid` FK → sites(id) | Site parent |
| depot_type | `article_type` nullable | Type : MP, PF, EMB ou NULL (mixte) |
| is_deteriore | `boolean` DEFAULT false | Dépôt détérioré logique |
| active | `boolean` | Actif |

**Particularité :** Un dépôt `is_deteriore = true` stocke les produits détériorés (séparation physique/logique).

### 4. `suppliers` — Fournisseurs

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| code | `text` UNIQUE | Code fournisseur |
| name | `text` NOT NULL | Raison sociale |
| country | `text` | Pays |
| currency | `text` DEFAULT 'MGA' | Devise (USD, EUR, MGA) |
| lead_time_days | `int` | Délai de livraison (jours) |
| contact_name / email / phone | `text` | Contact |
| rating | `numeric(3,2)` | Note 0.00 – 5.00 |
| active | `boolean` | Fournisseur actif |

### 5. `articles` — Articles (MP / SF / PF / EMB)

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| code | `text` UNIQUE | Code article |
| name | `text` NOT NULL | Nom (FR) |
| name_en | `text` | Nom (EN) |
| article_type | `article_type` NOT NULL | MP, SF, PF ou EMB |
| family | `text` | Famille (ex: SIPF003, SINE003) |
| brand | `text` | Marque (ex: IRIKO, MARONJANA) |
| universe | `text` | Univers (Hygiène, Entretien...) |
| unit | `text` NOT NULL DEFAULT 'kg' | Unité de mesure |
| spec_ref | `text` | Réf. spécification qualité (SP-xxx) |
| fcq_ref | `text` | Réf. FCQ associée |
| bp_ref | `text` | Réf. bon de production |
| default_supplier_id | `uuid` FK → suppliers(id) | Fournisseur par défaut |
| default_depot_id | `uuid` FK → depots(id) | Dépôt par défaut |
| safety_stock | `numeric(14,4)` | Stock de sécurité |
| reorder_point | `numeric(14,4)` | Point de commande |
| cqlib_exempt | `boolean` DEFAULT false | Exempté de CQ-LIB |
| exemption_reason | `text` | Motif d'exemption |
| sage_code | `text` | Code SAGE correspondant |
| standard_cost_mga | `numeric` | Coût standard (BI) |
| active | `boolean` | Article actif |

### 6. `instruments` — Instruments de laboratoire

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| code | `text` UNIQUE | Code instr. (ex: PHM-01) |
| name | `text` NOT NULL | Désignation |
| procedure_ref | `text` | Réf. procédure d'étalonnage |
| frequency | `text` | Fréquence d'étalonnage |
| standard_required | `text` | Standard nécessaire |
| standard_status | `text` | Statut du standard |
| status | `instrument_status` | Statut d'étalonnage |
| last/next_calibration_at | `timestamptz` | Dates d'étalonnage |
| owner_id | `uuid` FK → users(id) | Responsable |
| impact_if_nc | `text` | Impact si non conforme |

### 7. `exchange_rates` — Taux de change historisés

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| from_currency | `text` NOT NULL | Devise source (USD, EUR) |
| to_currency | `text` DEFAULT 'MGA' | Devise cible |
| rate | `numeric(14,4)` NOT NULL | Taux |
| effective_date | `date` NOT NULL | Date d'effet |
| source | `text` | Source (ex: BFM) |
| UNIQUE | `(from_currency, to_currency, effective_date)` | |

### 8. `bons_entree` — Bons d'entrée (réception)

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| code | `text` UNIQUE | N° BE (ex: BE-2026-0421-003) |
| supplier_id | `uuid` FK → suppliers(id) | Fournisseur |
| site_id | `uuid` FK → sites(id) | Site de réception |
| reception_date | `date` | Date de réception |
| received_by | `uuid` FK → users(id) | Réceptionné par |
| bl_number | `text` | N° Bon de livraison fournisseur |
| coa_received | `boolean` DEFAULT false | Certificat d'analyse fourni |

### 9. `lots` — Lots (unité de traçabilité centrale)

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| code | `text` UNIQUE | N° de lot (ex: L-2026-0421-006) |
| bon_entree_id | `uuid` FK → bons_entree(id) | BE d'origine |
| article_id | `uuid` FK → articles(id) NOT NULL | Article |
| supplier_id | `uuid` FK → suppliers(id) | Fournisseur |
| depot_id | `uuid` FK → depots(id) | Dépôt de stockage |
| qty_received | `numeric(14,4)` NOT NULL | Qté reçue |
| qty_current | `numeric(14,4)` NOT NULL | Qté actuelle (stock) |
| unit | `text` DEFAULT 'kg' | Unité |
| cqlib_status | `cqlib_status` DEFAULT 'QUARANTAINE' | Statut CQ |
| cqlib_decided_by | `uuid` FK → users(id) | Décision prise par |
| origin | `text` | Origine (ex: "Importé – Malaisie") |
| batch_supplier | `text` | Lot fournisseur |
| reception_date | `date` | Date de réception |
| expiry_date | `date` | Date de péremption |
| sage_synced | `boolean` DEFAULT false | Synchronisé SAGE |
| sage_synced_at | `timestamptz` | Date sync SAGE |

**C'est la table centrale** : chaque lot porte son statut CQ-LIB (QUARANTAINE → LIBERE/BLOQUE), ses quantités, et son dépôt.

### 10. `fcq_dossiers` — Dossiers de contrôle qualité

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| code | `text` UNIQUE | N° FCQ (ex: FCQ-2026-0045) |
| lot_id | `uuid` FK → lots(id) NOT NULL | Lot contrôlé |
| fcq_type | `text` NOT NULL | Type (FCQ-MP, FCQ-SAV...) |
| status | `fcq_status` | EN_ATTENTE → EN_COURS → COMPLET → VALIDE |
| decision | `cqlib_status` nullable | Décision finale (LIBERE/BLOQUE) |
| analyst_id | `uuid` FK → users(id) | Technicien labo |
| validator_id | `uuid` FK → users(id) | RQ validateur |
| instrument_id | `uuid` FK → instruments(id) | Instrument utilisé |
| instrument_ok | `boolean` | Instrument OK |
| analyst_signed_at | `timestamptz` | Signature tech. |
| validator_signed_at | `timestamptz` | Signature RQ |

### 11. `fcq_results` — Résultats d'analyse FCQ

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| fcq_id | `uuid` FK → fcq_dossiers(id) CASCADE | Dossier parent |
| param_name | `text` NOT NULL | Paramètre analysé |
| unit | `text` | Unité |
| target_value | `text` | Valeur cible |
| tol_min / tol_max | `numeric(14,4)` | Tolérances |
| measured_value | `text` | Valeur mesurée (texte) |
| measured_numeric | `numeric(14,4)` | Valeur mesurée (numérique) |
| is_conform | `boolean` | Conforme ? |
| status_if_nc | `text` | "BLOQUÉ" ou "Alerte RQ" |
| instrument_id | `uuid` FK → instruments(id) | Instrument utilisé |

### 12. `fnc` — Fiches de non-conformité

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| code | `text` UNIQUE | N° FNC (ex: FNC-2026-031) |
| lot_id | `uuid` FK → lots(id) | Lot concerné |
| fcq_id | `uuid` FK → fcq_dossiers(id) | FCQ associée |
| severity | `fnc_severity` | Gravité |
| status | `fnc_status` | OUVERTE → EN_COURS → CLOTUREE |
| description | `text` NOT NULL | Description du problème |
| root_cause | `text` | Cause racine (D4) |
| corrective_action | `text` | Action corrective |
| opened_by / closed_by | `uuid` FK → users(id) | Ouvert/Clos par |
| d1_team à d8_closure_notes | `text` | Champs méthodologie 8D |

### 13. `stock_movements` — Mouvements de stock

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| lot_id | `uuid` FK → lots(id) NOT NULL | Lot |
| article_id | `uuid` FK → articles(id) NOT NULL | Article |
| depot_from_id / depot_to_id | `uuid` FK → depots(id) | Dépôts source/destination |
| movement_type | `movement_type` NOT NULL | ENTREE / SORTIE / TRANSFERT / AJUSTEMENT |
| qty | `numeric(14,4)` NOT NULL | Quantité |
| unit | `text` DEFAULT 'kg' | Unité |
| reference_doc | `text` | Document de référence |
| performed_by | `uuid` FK → users(id) | Opérateur |
| sage_synced | `boolean` DEFAULT false | Sync SAGE |
| sage_synced_at | `timestamptz` | Date sync |

### 14. `da_import` — Demandes d'achat Import

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| code | `text` UNIQUE | N° DA Import |
| article_id | `uuid` FK → articles(id) | Article |
| supplier_id | `uuid` FK → suppliers(id) | Fournisseur |
| qty_container | `text` | 1 CT 20' |
| qty_kg | `numeric(14,4)` | Quantité en kg |
| currency | `text` DEFAULT 'USD' | Devise |
| amount_currency / amount_mga | `numeric(14,4)` | Montants |
| exchange_rate_id | `uuid` FK → exchange_rates(id) | Taux appliqué |
| current_step | `da_import_step` | Étape courante |
| status | `da_status` | Statut global |
| eta_date | `date` | ETA |
| lead_time_days | `int` | Délai constaté |
| sage_synced | `boolean` DEFAULT false | Sync SAGE |

### 15. `da_import_steps_log` — Historique des étapes Import

Log horodaté de chaque validation d'étape : documents, validateur, notes.

### 16. `da_local` — Demandes d'achat Local

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| code | `text` UNIQUE | N° DA Local |
| article_id / supplier_id | `uuid` FK | Article et fournisseur |
| qty / unit / amount_mga | Quantité et montant |
| current_step | `da_local_step` | SAISIE → VALIDATION → COMMANDE → RECEPTION |
| status | `da_status` | Statut global |
| sage_synced | `boolean` DEFAULT false | Sync SAGE |

### 17. `da_local_deliveries` — Livraisons DA Local

Historique des livraisons partielles avec écart, commentaire obligatoire si écart > 5%.

### 18. `bom_headers` — Nomenclatures (en-têtes)

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| code | `text` NOT NULL | Code nomenclature |
| version | `int` DEFAULT 1 | Version |
| product_id | `uuid` FK → articles(id) | PF ou SF fabriqué |
| status | `bom_status` | BROUILLON → VALIDE → ARCHIVE |
| batch_size_kg | `numeric(14,4)` | Taille de lot standard |
| line_name | `text` | Ligne de production |
| UNIQUE | `(code, version)` | |

### 19. `bom_lines` — Nomenclatures (lignes)

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| bom_header_id | `uuid` FK → bom_headers(id) CASCADE | En-tête parent |
| component_id | `uuid` FK → articles(id) | Composant (MP ou SF) |
| qty | `numeric(14,4)` NOT NULL | Quantité |
| unit | `text` DEFAULT 'kg' | Unité |
| pct | `numeric(6,2)` | Pourcentage dans la formule |
| sort_order | `int` DEFAULT 0 | Ordre |

### 20. `production_orders` — Ordres de fabrication

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| code | `text` UNIQUE | N° OF (ex: BP-2026-0412) |
| bom_header_id | `uuid` FK → bom_headers(id) | BOM utilisée |
| product_id | `uuid` FK → articles(id) | Produit fabriqué |
| qty_planned / qty_produced | `numeric(14,4)` | Quantités |
| status | `text` DEFAULT 'PLANIFIE' | Statut |
| planned_date / started_at / completed_at | Date/heure |
| produced_by | `uuid` FK → users(id) | Opérateur |

### 21. `inventory_campaigns` — Campagnes d'inventaire

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| code | `text` UNIQUE | Code campagne |
| label | `text` NOT NULL | Libellé |
| period | `text` | Période |
| zones | `int` DEFAULT 1 | Nombre de zones |
| status | `inventory_status` | EN_PREPARATION → ... → VALIDE |
| validated_by | `uuid` FK → users(id) | Validateur |

### 22. `inventory_counts` — Lignes de comptage

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| campaign_id | `uuid` FK → inventory_campaigns(id) CASCADE | Campagne |
| article_id / depot_id | `uuid` FK | Article et dépôt |
| stock_theorique / stock_physique / ecart | `numeric(14,4)` | Comptages |
| ecart_pct | `numeric(6,2)` | Écart en % |
| is_major | `boolean` | Écart > 2% |
| counted_by | `uuid` FK → users(id) | Compteur |
| lot_id | `uuid` FK → lots(id) | Lot (traçabilité) |

### 23. `qc_specifications` — Spécifications qualité

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| spec_ref | `text` NOT NULL | Réf. gamme (ex: SP-SAVON-01) |
| parameter_name | `text` NOT NULL | Paramètre |
| unit | `text` | Unité |
| min_value / max_value | `numeric(10,4)` | Tolérances |
| active | `boolean` | Actif |
| UNIQUE | `(spec_ref, parameter_name)` | |

### 24. `qc_spec_params` — Paramètres détaillés des specs

Version enrichie : méthode, fréquence, instrument, décision, stock_action.

### 25. `calibration_log` — Journal d'étalonnage

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| instrument_id | `uuid` FK → instruments(id) | Instrument |
| calibrated_by | `uuid` FK → users(id) | Opérateur |
| calibration_date / next_due_date | `date` | Dates |
| standard_used / standard_type / standard_lot | `text` | Standard |
| result | `text` | CONFORME / NON CONFORME |

### 26. `notifications` — Notifications internes

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| user_id | `uuid` FK → users(id) nullable | Destinataire direct |
| role | `user_role` nullable | Destinataire par rôle |
| title / message | `text` NOT NULL | Titre et message |
| read | `boolean` DEFAULT false | Lecture |
| type | `text` CHECK (info, warning, error, success) | Type |
| metadata | `jsonb` | Données supplémentaires |

### 27. `audit_log` — Journal d'audit (traçabilité)

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| table_name | `text` NOT NULL | Table modifiée |
| record_id | `uuid` NOT NULL | Enregistrement modifié |
| action | `text` NOT NULL | INSERT / UPDATE / DELETE |
| user_id | `uuid` FK → users(id) | Auteur |
| old_data / new_data | `jsonb` | Avant/après |

### 28. `supplier_evaluations` — Évaluations fournisseurs

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| supplier_id | `uuid` FK → suppliers(id) CASCADE | Fournisseur |
| period | `eval_period` | Période |
| year | `int` | Année |
| criteria | `eval_criteria` | Critère |
| score | `numeric(3,2)` CHECK (0-5) | Note |
| evaluated_by | `uuid` FK → users(id) | Évaluateur |
| UNIQUE | `(supplier_id, period, year, criteria)` | |

### 29. `supplier_evaluation_summary` — Synthèse évaluations

Score global, classification (A/B/C/D), nombre d'évaluations.

### 30. `complaints` — Réclamations clients

| Champ | Type | Description |
|-------|------|-------------|
| id | `uuid` | PK |
| code | `text` UNIQUE | N° réclamation |
| client_name | `text` NOT NULL | Client |
| origin / severity / status | Enums | Origine, gravité, statut |
| lot_id / article_id | `uuid` FK | Lot/article concerné |
| description / root_cause / corrective_action / preventive_action / compensation | `text` | Détails |
| return_qty / return_value | `numeric(14,4)` | Retours |
| fnc_id | `uuid` FK → fnc(id) | Lien vers FNC |
| opened_by / closed_by | `uuid` FK → users(id) |

---

## Relations clés (ERD simplifié)

```
sites ──< depots
users ──< lots (received_by, cqlib_decided_by)
suppliers ──< articles (default_supplier)
articles ──< lots
articles ──< bom_headers (product_id)
articles ──< bom_lines (component_id)
bons_entree ──< lots
lots ──< fcq_dossiers
lots ──< stock_movements
lots ──< fnc
lots ──< inventory_counts
fcq_dossiers ──< fcq_results
fcq_dossiers ──< fnc
instruments ──< calibration_log
da_import ──< da_import_steps_log
da_local ──< da_local_deliveries
inventory_campaigns ──< inventory_counts
bom_headers ──< bom_lines
```

---

## Row Level Security (RLS)

Toutes les tables ont RLS activée. Politiques globales :

- **`auth_read_all`** / **`auth_read_all_v2`** : tout utilisateur authentifié peut lire
- **`admin_all`** / **`admin_all_v2`** : ADMIN et SUPER_ADMIN ont tous les droits

Politiques spécifiques par rôle :

| Rôle | Table | Action | Politique |
|------|-------|--------|-----------|
| MAGA | `lots` | INSERT | Création de lots |
| MAGA | `bons_entree` | INSERT | Création BE |
| MAGA | `stock_movements` | INSERT | Mouvements |
| TLAB | `fcq_results` | INSERT | Saisie résultats |
| TLAB | `fcq_dossiers` | UPDATE | Modification dossiers |
| RQ | `fnc` | INSERT, UPDATE | Gestion FNC |
| RQ | `fcq_dossiers` | UPDATE | Décision CQ-LIB |
| RQ, ADMIN | `qc_specifications` | ALL | Spécifications |
| RACH | `da_import` | ALL | Achats import |
| RACH | `da_local` | ALL | Achats local |
| RACH | `supplier_evaluations` | INSERT, UPDATE | Évaluations |
| DPI | `production_orders` | UPDATE | Validation OF |
| ADMIN, RQ, DPI | `complaints` | ALL | Réclamations |

**Politique d'isolation multi-site** (`lots_isolation_v2`) : les utilisateurs non-ADMIN/SUPER_ADMIN/DSI ne voient que les lots de leur site.

Politiques `notifications` : lecture si `user_id = auth.user` OU `role = user.role`.

---

## Triggers et automatismes

| Trigger | Table | Déclencheur | Action |
|---------|-------|-------------|--------|
| `on_auth_user_created` | `auth.users` | AFTER INSERT | Crée l'utilisateur dans `public.users` |
| `tr_sync_lot_cqlib_status` | `fcq_dossiers` | AFTER UPDATE | Met à jour `lots.cqlib_status` depuis la décision FCQ |
| `trig_notify_blocked` | `lots` | AFTER UPDATE | Notification si lot → BLOQUE |
| `trig_notify_low_stock` | `lots` | AFTER UPDATE | Alerte si stock < sécurité |
| `trig_inventory_completion` | `inventory_campaigns` | AFTER UPDATE | Crée les mouvements d'ajustement à la clôture |
| `trg_enforce_lot_quarantine` | `fcq_dossiers` | AFTER UPDATE status | Bloque le lot si NON_CONFORME |
| `trig_fnc_code` | `fnc` | BEFORE INSERT | Génération auto du code FNC-YYYY-XXXX |
| `trig_inv_code` | `inventory_campaigns` | BEFORE INSERT | Génération auto du code INV-YYYY-XXXX |
| `trig_article_code` | `articles` | BEFORE INSERT | Génération auto du code ART-YYYY-XXXX |
| `trig_audit_fnc` | `fnc` | AFTER INSERT/UPDATE/DELETE | Journalisation dans `audit_log` |
| `trig_audit_lots` | `lots` | AFTER INSERT/UPDATE/DELETE | Journalisation dans `audit_log` |
| `trig_auto_fnc` | `lots` | AFTER UPDATE | Crée FNC auto si lot → BLOQUE |

---

## Fonctions RPC

### `public.get_role()`
Retourne le rôle de l'utilisateur connecté.
```sql
SELECT public.get_role();
```

### `public.get_auth_role()`
Variante sécurisée utilisant `auth.uid()`.
```sql
SELECT public.get_auth_role();
```

### `public.process_stock_adjustment(p_lot_id, p_qty, p_reason, p_type)`
Ajustement transactionnel de stock : insère mouvement + met à jour `lots.qty_current`.

### `public.calculate_mrp(p_product_id, p_simulated_demand)`
Calcule les besoins nets pour un produit selon la BOM validée :
```
besoins_nets = MAX(0, (qty_par_unité × demande) - stock_réel)
```
Retourne : composants, stock, besoins bruts/nets, action recommandée.

### `public.handle_new_user()`
Trigger function pour synchroniser `auth.users` → `public.users`.

---

## Index notables

```sql
idx_lots_cqlib         ON lots(cqlib_status)
idx_lots_article       ON lots(article_id)
idx_fcq_lot            ON fcq_dossiers(lot_id)
idx_stock_mov_article  ON stock_movements(article_id)
idx_da_import_status   ON da_import(status)
idx_bom_product        ON bom_headers(product_id)
idx_audit_table        ON audit_log(table_name, record_id)
idx_articles_code_trgm ON articles USING gin(code gin_trgm_ops)
idx_instruments_status ON instruments(status)
idx_complaints_status  ON complaints(status)
```

---

## Configuration Storage Supabase

Deux buckets sont prévus (création manuelle dans le dashboard Supabase) :

| Bucket | Usage |
|--------|-------|
| `photos` | Photos, logos, avatars |
| `documents` | Documents DA, certificats, proformas |
