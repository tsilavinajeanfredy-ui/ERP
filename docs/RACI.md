# Matrice RACI des Processus Clés — GSI ERP

Ce document définit officiellement la répartition des responsabilités par rôle sur les processus clés de l'application **GSI ERP**, conformément aux spécifications du CCTP et à l'implémentation du contrôle d'accès basé sur les rôles (RBAC).

---

## 🗺️ Légende des Responsabilités

* **R (Réalise)** : Le rôle qui exécute l'action principale du processus.
* **A (Approuve)** : Le rôle responsable de la validation ou de la prise de décision finale. Un seul **A** est désigné par processus pour assurer une imputabilité claire.
* **C (Consulté)** : Les rôles sollicités pour avis ou expertise technique avant/pendant l'action.
* **I (Informé)** : Les rôles notifiés ou ayant un accès en lecture seule pour suivre le flux opérationnel.

---

## 👥 Définition des Rôles & Périmètres

| Rôle | Intitulé | Périmètre Principal | Exigence 2FA |
| :--- | :--- | :--- | :---: |
| **DPI** | Direction Pôle Industriel | Pilotage global, sponsor projet, vue 360°, validation BOM niveau 3 | **Oui** |
| **RQ** | Responsable Qualité | CQ-LIB (signature), FNC, audits internes, étalonnage, scoring fournisseurs | **Oui** |
| **TLAB** | Technicien Laboratoire | Saisie FCQ, exécution étalonnage, signature TLAB | Non |
| **RPROD** | Responsable Production | Création OF, BP, consommations, FCQ-PROD, écarts formule | Non |
| **MAGA** | Magasinier | Réception, mouvements stocks, FIFO, inventaire | Non |
| **RACH** | Responsable Achats | DA, BC, workflow Import 8 étapes, Local 3 étapes, fournisseurs | Non |
| **PLAN** | Planificateur | PDP, recalcul MRP, couverture 12 mois, scénarios what-if | Non |
| **ADMIN** | Administrateur système | Référentiels, paramètres, RBAC, audit log, intégrations | **Oui** |

---

## 📊 Matrice RACI Officielle


| Processus | DPI | RQ | TLAB | RPROD | MAGA | RACH | PLAN |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Réception MP & mise en quarantaine** | **I** | **I** | **I** | — | **R** | **C** | **I** |
| **Saisie FCQ & décision CQ-LIB** | **I** | **A** | **R** | **I** | **I** | — | — |
| **Création OF & lancement BP** | **C** | **C** | — | **R / A** | **I** | — | **C** |
| **Calcul MRP & proposition de DA** | **I** | — | — | **C** | — | **C** | **R** |
| **Workflow Achat Import (8 étapes)** | **I** | — | — | — | **C** | **R** | **C** |
| **Ouverture FNC & méthode 8D** | **I** | **R / A** | **C** | **C** | **C** | **I** | — |
| **Inventaire trimestriel & PV** | **A** | **C** | — | **C** | **R** | — | **I** |
| **Versioning BOM (validation niveau 3)** | **A** | **C** | — | **C** | — | — | **R** |

---

## 🛠️ Implémentation technique du RBAC (Frontend & Hooks)

Dans l'application mobile et web, ces responsabilités sont traduites de manière sécurisée dans [hooks.ts](file:///d:/Dossier%20Tsilavina/Tsilavina%20Dossier/application/ERP/ERP-handoff/erp-native/src/lib/hooks.ts) via les permissions d'écran (`SCREEN_ACCESS`) et d'actions (`ACTION_ACCESS`).

> [!IMPORTANT]
> **Exception du Super-Administrateur (SUPER_ADMIN)** :  
> Seul le rôle **`SUPER_ADMIN`** bénéficie d'un bypass complet de toutes les règles opérationnelles et de permissions. Il dispose de pleins pouvoirs de sécurité sur l'intégralité de l'ERP pour la maintenance globale et le support supérieur.
> 
> Les rôles **`ADMIN`** et **`DSI`**, quant à eux, suivent strictement la grille d'administration opérationnelle standard et respectent l'ensemble des règles de restriction.


### Correspondance des permissions clés :

1. **Réception MP & mise en quarantaine** :
   - Rôle **MAGA** : Possède les permissions `'create_be'` et `'create_lot'` sur l'écran `Reception`.
   
2. **Saisie FCQ & décision CQ-LIB** :
   - Rôle **TLAB** : Possède la permission `'create_fcq'` (Saisie FCQ).
   - Rôle **RQ** : Possède les permissions `'validate_fcq'` et `'validate_cqlib'` (CQ-LIB).
   
3. **Création OF & lancement BP** :
   - Rôle **RPROD** : Possède les permissions `'create_of'` et `'manage_bom'`.
   
4. **Calcul MRP & proposition de DA** :
   - Rôle **PLAN** : Possède la permission `'run_mrp'`.
   
5. **Workflow Achat Import** :
   - Rôle **RACH** : Possède les permissions `'create_da_import'` et `'advance_da_import'`.
   
6. **Ouverture FNC & méthode 8D** :
   - Rôle **RQ** : Possède les permissions `'create_fnc'` et `'assign_fnc'`.
   
7. **Inventaire trimestriel & PV** :
   - Rôle **MAGA** : Possède les permissions `'create_inventory'` et `'stock_adjust'`.
   - Rôle **DPI** : Possède la permission `'validate_inventory'` (Validation du PV).
   
8. **Versioning BOM (validation niveau 3)** :
   - Rôle **PLAN** : Possède la permission `'edit_bom'` (Création et édition des nomenclatures).
   - Rôle **DPI** : Possède la permission `'validate_bom'` (Approbation et validation de niveau 3).

