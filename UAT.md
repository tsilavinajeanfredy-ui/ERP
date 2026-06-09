# CAHIER DE RECETTE TECHNIQUE & SCÉNARIOS UAT — GSI ERP

Ce document sert de guide pratique pour exécuter les scénarios de test (User Acceptance Testing - UAT) et valider la conformité du système ERP GSI par rapport aux exigences RACI et de sécurité.

---

## 1. Identifiants & Règles Communes de Connexion

- **Mot de passe par défaut** : Pour faciliter les phases d'UAT, tout nouveau compte créé par l'Administrateur possède le mot de passe initial **`Sipro2026@mg`**.
- **Changement de mot de passe** : L'utilisateur peut ensuite modifier son mot de passe directement depuis l'écran "Mon Compte" après sa première connexion.
- **Double Facteur (2FA)** :
  - **Obligatoire** pour les rôles : **SUPER_ADMIN**, **ADMIN**, **DPI** et **RQ**.
  - Facultatif ou non applicable pour les autres rôles techniques.

---

## 2. Scénarios d'Acceptation par Rôle (UAT)

### UAT-01 : Super Administrateur (SUPER_ADMIN)
- **Objectif** : Valider le contournement absolu et l'accès à tous les modules.
- **Scénario** :
  1. Se connecter avec le compte `superadmin`.
  2. Parcourir le menu latéral complet (17 écrans accessibles).
  3. Effectuer n'importe quelle action (Création de lot, Validation de dossier d'Import, Approbation financière de DA local, Validation finale d'inventaire).
- **Résultat attendu** : Aucun écran n'est bloqué, aucun bouton n'est grisé. L'accès est total.

### UAT-02 : Magasinier (MAGA)
- **Objectif** : Valider les opérations de réception physique et d'inventaire terrain.
- **Scénario** :
  1. Se connecter en tant que Magasinier.
  2. Aller sur l'écran **Réception**. Cliquer sur "Nouveau Bon d'Entrée" et enregistrer une réception de Matière Première (MP).
  3. Aller sur l'écran **Inventaires & Écarts**. Cliquer sur "+ Nouvelle campagne" pour l'initialiser.
  4. Sélectionner une campagne active et cliquer sur "Saisir comptages" pour enregistrer les quantités comptées.
  5. Essayer d'accéder à l'écran **MRP** ou **Administration**.
- **Résultat attendu** :
  - Écrans MRP et Administration invisibles/bloqués.
  - Saisie de comptages et création de campagnes d'inventaire fonctionnelles.
  - Dans la modal de signature du PV d'inventaire, le Magasinier peut uniquement cliquer sur "Signer" pour le **Niveau 1** (Certification Magasinier). Les boutons des niveaux 2 et 3 sont verrouillés.

### UAT-03 : Technicien Laboratoire (TLAB)
- **Objectif** : Valider les saisies d'analyses chimiques et le blocage de la décision CQ-LIB.
- **Scénario** :
  1. Se connecter en tant que Technicien Laboratoire.
  2. Naviguer sur l'écran **Laboratoire**.
  3. Sélectionner un lot en quarantaine et cliquer sur "Nouvelle Analyse" (FCQ).
  4. Saisir les paramètres physico-chimiques (Taux d'acide gras, couleur, etc.) puis cliquer sur "Valider et Signer".
  5. Tenter de cliquer sur le bouton "Décision finale CQ-LIB" (Libérer/Rejeter le lot).
- **Résultat attendu** :
  - Le technicien peut saisir et modifier les analyses.
  - La décision de libération finale (`LIBERE` / `REJETE`) lui est inaccessible (bouton masqué ou grisé, indication "Lecture seule").

### UAT-04 : Responsable Qualité (RQ)
- **Objectif** : Valider la libération finale des lots (CQ-LIB) et le traitement des non-conformités (FNC).
- **Scénario** :
  1. Se connecter en tant que Responsable Qualité.
  2. Naviguer sur l'écran **Laboratoire**.
  3. Consulter les analyses effectuées par le Technicien.
  4. Cliquer sur "Prendre Décision", sélectionner le statut **`LIBERE`** et valider.
  5. Naviguer sur l'écran **FNC & Plaintes**.
  6. Cliquer sur "Nouvelle FNC" pour ouvrir une non-conformité.
  7. Écrire et valider les étapes de la méthode **8D** (de D1 à D8) et signer le rapport électronique.
  8. Cliquer sur le bouton "Approuver & Clôturer la FNC" (au niveau de l'étape 7 D8).
- **Résultat attendu** :
  - La décision CQ-LIB est enregistrée avec succès. Le lot passe instantanément au statut `LIBERE` en base de données.
  - La saisie et l'édition des étapes 8D sont fluides et la clôture définitive de la FNC est pleinement autorisée pour le RQ (conformément à la mise à jour de la matrice RACI).

### UAT-05 : Responsable Production (RPROD)
- **Objectif** : Valider le lancement des Ordres de Fabrication (OF) et le blocage de la modification des nomenclatures.
- **Scénario** :
  1. Se connecter en tant que Responsable Production.
  2. Naviguer sur l'écran **Production**.
  3. Cliquer sur "Nouveau OF" et valider sa planification.
  4. Essayer d'ajouter ou d'éditer les lignes d'une nomenclature (BOM).
- **Résultat attendu** :
  - Création d'OF acceptée.
  - Les boutons d'ajout/modification/suppression de lignes de nomenclature sont grisés ou masqués. L'édition lui est interdite.

### UAT-06 : Planificateur (PLAN)
- **Objectif** : Valider le calcul des besoins nets (MRP) et la révision des nomenclatures (BOM).
- **Scénario** :
  1. Se connecter en tant que Planificateur.
  2. Naviguer sur l'écran **MRP & Scénarios**.
  3. Lancer une simulation de calcul MRP "What-If" et observer les besoins bruts/nets calculés.
  4. Naviguer sur l'écran **Production (Nomenclatures)**.
  5. Sélectionner une nomenclature en cours de révision. Modifier une ligne de composant ou cliquer sur "Ajouter composant" pour créer une nouvelle version de formule.
  6. Tenter de cliquer sur le bouton "Approuver la version (Validation niveau 3)".
- **Résultat attendu** :
  - Le calcul MRP et la révision de formule (BOM) s'effectuent sans restriction.
  - Le bouton d'approbation et gel final (Validation niveau 3) de la formule lui est masqué (réservé exclusivement à la Direction/DPI).

### UAT-07 : Responsable Achats (RACH)
- **Objectif** : Valider le workflow d'Import en 8 étapes et la signature du niveau 2 d'inventaire.
- **Scénario** :
  1. Se connecter en tant que Responsable Achats.
  2. Naviguer sur l'écran **Achats Import**.
  3. Ouvrir un nouveau dossier d'importation (Cliquer sur "+ Nouvelle DA").
  4. Avancer dans les étapes (de l'étape 1 à l'étape 8) en téléversant les documents obligatoires (Facture Proforma, Déclaration douanière, etc.).
  5. Naviguer sur l'écran **Inventaires & Écarts**.
  6. Ouvrir la modal "Réconcilier les stocks" sur une campagne active.
  7. Essayer de signer au **Niveau 2** (Validation Valorisation).
- **Résultat attendu** :
  - Les 8 étapes du workflow import se déroulent normalement et bloquent si un document requis est manquant.
  - Le Responsable Achats est autorisé à signer la valorisation financière (Niveau 2) de l'inventaire. Les signatures des niveaux 1 (Magasinier) et 3 (Direction) lui sont inaccessibles.

### UAT-08 : Direction (DPI)
- **Objectif** : Valider la signature finale d'inventaire, l'approbation financière des DA locales, et la validation de formules niveau 3.
- **Scénario** :
  1. Se connecter en tant que Directeur (DPI).
  2. Naviguer sur l'écran **Achats Locaux**.
  3. Consulter une Demande d'Achat locale au statut `ATTENTE_VALIDATION`. Cliquer sur le bouton "Approuver (Validation Financière)".
  4. Naviguer sur l'écran **Production (Nomenclatures)**.
  5. Sélectionner la formule (BOM) révisée par le Planificateur. Cliquer sur le bouton "Valider" pour la geler et l'activer en production.
  6. Naviguer sur l'écran **Inventaires & Écarts**. Ouvrir la modal "Réconcilier les stocks".
  7. Cliquer sur "Signer" pour le **Niveau 3** (Approbaton finale & Clôture PV).
- **Résultat attendu** :
  - Approbation financière locale enregistrée.
  - Validation et gel de la formule BOM validée avec succès.
  - Le DPI peut uniquement signer le Niveau 3 de l'inventaire. Dès que les 3 signatures (MAGA + RACH + DPI) sont réunies, le statut de la campagne passe à `VALIDE` et le stock théorique en base est instantanément mis à jour.
