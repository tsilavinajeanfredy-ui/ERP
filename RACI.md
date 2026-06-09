# MATRICE RACI & HABILITATIONS RBAC — GSI ERP

Ce document décrit en détail la matrice RACI (Réalise, Approuve, Consulté, Informé) régissant les processus clés de l'ERP GSI, ainsi que l'implémentation technique du contrôle d'accès basé sur les rôles (RBAC) appliquée dans l'application native.

---

## 1. Définition des Rôles

Le système distingue 8 rôles fonctionnels standards ainsi qu'un rôle de contournement global :

| Code Rôle | Rôle Fonctionnel | Périmètre Principal | 2FA |
|---|---|---|---|
| **DPI** | Direction Pôle Industriel | Pilotage global, sponsor projet, vue 360°, validation BOM niveau 3 | **Oui** |
| **RQ** | Responsable Qualité | CQ-LIB (libération lots), FNC, audits internes, étalonnage, scoring fournisseurs | **Oui** |
| **TLAB** | Technicien Laboratoire | Saisie FCQ (fiches de contrôle qualité), exécution étalonnage, signature TLAB | Non |
| **RPROD** | Responsable Production | Création d'Ordres de Fabrication (OF), Bons de Production (BP), consommations, FCQ-PROD, écarts formules | Non |
| **MAGA** | Magasinier | Réception MP/PF, mouvements de stocks, FIFO, inventaires | Non |
| **RACH** | Responsable Achats | DA (Demandes d'Achats), BC (Bons de Commande), workflow Import (8 étapes) & Local (3 étapes) | Non |
| **PLAN** | Planificateur | PDP (Plan Directeur de Production), recalcul MRP, couverture 12 mois, scénarios what-if | Non |
| **ADMIN** | Administrateur Système | Référentiels, paramètres, RBAC, audit log, intégrations, création d'utilisateurs | **Oui** |
| **SUPER_ADMIN** | Super Administrateur | Droits absolus sur tous les modules (toutes les actions et tous les écrans sans restriction) | **Oui** |

---

## 2. Matrice RACI sur les Processus Clés

*Légende : **R** = Réalise · **A** = Approuve · **C** = Consulté · **I** = Informé*

| Processus | DPI | RQ | TLAB | RPROD | MAGA | RACH | PLAN |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Réception MP & mise en quarantaine** | I | I | I | — | **R** | C | I |
| **Saisie FCQ & décision CQ-LIB** | I | **A** | **R** | I | I | — | — |
| **Création OF & lancement BP** | I | C | — | **R / A** | I | — | C |
| **Calcul MRP & proposition de DA** | I | — | — | C | — | C | **R** |
| **Workflow Achat Import (8 étapes)** | I | — | — | — | C | **R** | C |
| **Ouverture FNC & méthode 8D** | I | **R / A** | C | C | C | I | — |
| **Inventaire trimestriel & PV** | **A** | C | — | C | **R** | — | I |
| **Versioning BOM (validation niveau 3)** | **A** | C | — | C | — | — | **R** |

---

## 3. Implémentation du Contrôle d'Accès Technique (RBAC)

L'application native implémente ces contraintes via deux grilles d'habilitation dans [hooks.ts](file:///d:/Dossier%20Tsilavina/Tsilavina%20Dossier/application/ERP/ERP-handoff/erp-native/src/lib/hooks.ts) : `SCREEN_ACCESS` (accès aux écrans de la barre latérale) et `ACTION_ACCESS` (droits d'exécuter des actions métier spécifiques).

### 3.1 Accès aux Écrans (`SCREEN_ACCESS`)
- **SUPER_ADMIN** : Accès à l'intégralité des 17 écrans.
- **ADMIN** : Accès complet à l'administration, aux référentiels, à la qualité, à la production, aux stocks, aux achats et à la logistique.
- **DPI** : Dashboard, Audit, Production, Stocks, Inventaires, Achats Locaux, Planning & Logistique.
- **RQ** : Dashboard, Audit, Réception, Réception PF, Laboratoire, FNC & Plaintes.
- **TLAB** : Dashboard, Laboratoire, Réception, Réception PF.
- **RPROD** : Dashboard, Production, Stocks, MRP, Réception PF, Planning & Logistique.
- **MAGA** : Dashboard, Réception, Réception PF, Stocks, Inventaires, Planning & Logistique.
- **RACH** : Dashboard, Référentiels (Fournisseurs/Articles), Achats Import, Achats Locaux, Planning & Logistique.
- **PLAN** : Dashboard, MRP, Production, Stocks, Planning & Logistique, Réception PF.
- **COMPTA** : Dashboard, Stocks, Achats Import, Achats Locaux.

### 3.2 Actions Autorisées (`ACTION_ACCESS`)

Les boutons interactifs et champs d'édition sont dynamiquement verrouillés ou masqués grâce à la fonction `canPerformAction` :

1. **`create_lot` / `create_be`** : Limité aux rôles **MAGA** et **ADMIN** pour enregistrer les arrivages physiques et attribuer les lots en quarantaine.
2. **`create_fcq`** : Limité aux rôles **TLAB** et **ADMIN** pour saisir les relevés de laboratoire de niveau 1.
3. **`validate_cqlib`** : Limité aux rôles **RQ** et **ADMIN** pour signer la libération définitive des lots (`LIBERE` / `REJETE`).
4. **`create_fnc`** : Limité aux rôles **RQ** et **ADMIN** pour initier une Fiche de Non-Conformité, rédiger les étapes de la méthode 8D et approuver la FNC.
5. **`create_of`** : Limité aux rôles **RPROD**, **PLAN** et **ADMIN** pour créer et lancer les ordres de fabrication.
6. **`edit_bom`** : Limité aux rôles **RPROD**, **PLAN** et **ADMIN** pour réviser et modifier les formules.
7. **`validate_bom`** : Limité aux rôles **DPI** et **ADMIN** pour approuver et geler une nomenclature (BOM niveau 3).
8. **`run_mrp`** : Limité aux rôles **PLAN**, **RPROD** et **ADMIN** pour lancer le calcul des besoins nets et créer des scénarios d'approvisionnement.
9. **`create_da_import`** : Limité aux rôles **RACH** et **ADMIN** pour ouvrir un dossier d'importation.
10. **`advance_da_import`** : Limité aux rôles **RACH** et **ADMIN** pour enregistrer et téléverser les justificatifs des 8 étapes du workflow import.
11. **`create_da_local`** : Limité aux rôles **RACH** et **ADMIN** pour initier un achat local de 3 étapes.
12. **`validate_da_local`** : Limité aux rôles **DPI** et **ADMIN** pour approuver financièrement la demande d'achat locale.
13. **`receive_da_local`** : Limité aux rôles **MAGA** et **ADMIN** pour accuser réception des marchandises locales.
14. **`create_inventory`** : Limité aux rôles **MAGA** et **ADMIN** pour créer une campagne d'inventaire physique ou saisir les comptages de terrain (y compris en mode déconnecté).
15. **`validate_inventory`** : Limité aux rôles **DPI** et **ADMIN** pour valider et signer le procès-verbal d'inventaire de niveau 3 (clôture comptable).
16. **`manage_users`** : Exclusivement réservé aux rôles **ADMIN** et **SUPER_ADMIN** pour inscrire de nouveaux collaborateurs et modifier les privilèges de compte.

---

## 4. Règle de Contournement Absolu (Super-Administrateur)

Le rôle **SUPER_ADMIN** dispose d'un traitement d'exception codé en dur à la source dans [hooks.ts](file:///d:/Dossier%20Tsilavina/Tsilavina%20Dossier/application/ERP/ERP-handoff/erp-native/src/lib/hooks.ts) :
- Les méthodes `canAccessScreen` et `canPerformAction` retournent systématiquement `true` pour le super-utilisateur.
- Ce rôle permet de débloquer n'importe quelle étape d'approbation ou de forcer une régularisation de stocks si nécessaire.
