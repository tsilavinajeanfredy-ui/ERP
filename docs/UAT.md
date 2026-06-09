# Tests de Recette Utilisateur (UAT) — ERP GSI

> Document de validation fonctionnelle destiné aux key-users et testeurs  
> Version : 1.0 · Couvre tous les modules de l'application

---

## Convention

- ✅ **Critère de succès** : résultat attendu pour valider le test
- Prérequis : contexte nécessaire avant d'exécuter le test
- Données de test : références utilisables (issues du seed `002_seed.sql`)

---

## 1. Authentification & RBAC

### 1.1 Connexion / Déconnexion

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| AUTH-01 | Connexion valide | Saisir email + mot de passe administrateur, cliquer Connexion | ✅ Redirection vers le tableau de bord |
| AUTH-02 | Connexion invalide | Saisir email incorrect | ✅ Message "Identifiants invalides" |
| AUTH-03 | Session expirée | Rester inactif 15 min | ✅ Bandeau d'avertissement 60s puis déconnexion automatique |
| AUTH-04 | Déconnexion manuelle | Cliquer Déconnexion dans le menu | ✅ Retour écran login, session détruite |

**Données de test :** `admin@gsi.mg` / `GsiAdmin2026!` (admin), `rq@gsi.mg` (RQ), `reception@gsi.mg` (MAGA)

### 1.2 Vérification 2FA

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| AUTH-05 | Activation 2FA | Connecter ADMIN, RQ ou DPI sans 2FA | ✅ Écran 2FA obligatoire, setup puis redirection tableau de bord |
| AUTH-06 | 2FA déjà active | Connecter utilisateur avec 2FA activée | ✅ Saisie du code, accès accordé après vérification |
| AUTH-07 | Accès sans 2FA | Connecter MAGA sans 2FA | ✅ Accès direct au dashboard (rôle non-critique) |

### 1.3 Contrôle d'accès par rôle

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| RBAC-01 | Menu restreint | Connecter TLAB, vérifier le menu latéral | ✅ Seuls Dashboard, Laboratoire, Réception apparaissent |
| RBAC-02 | Écran interdit | Connecter MAGA, tenter d'accéder à `/Admin` | ✅ Redirection ou menu grisé |
| RBAC-03 | Action interdite | Connecter TLAB, cliquer "Libérer le lot" | ✅ Bouton désactivé ou invisible |
| RBAC-04 | Admin voit tout | Connecter ADMIN | ✅ Tous les écrans ADMIN accessibles |
| RBAC-05 | Bypass Super-Administrateur | Connecter SUPER_ADMIN, tenter n'importe quel écran ou action | ✅ Accès et exécution illimités, bypass total de la matrice RACI |


---

## 2. Réception Matières Premières

### 2.1 Création Bon d'Entrée (BE)

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| REC-01 | Créer BE simple | Remplir fournisseur Golden Agri, date, BL number, COA reçu | ✅ BE créé avec code auto BE-YYYY-MMDD-XXX |
| REC-02 | BE sans COA | Décocher "Certificat d'analyse" | ✅ BE créé, lot marqué pour attention QC |
| REC-03 | BE fournisseur inactif | Choisir fournisseur désactivé | ✅ Non listé dans le sélecteur |

### 2.2 Création de Lot

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| REC-04 | Créer lot sur BE | Après BE, saisir article MP-PFAD, qty 25000 kg, dépôt D-103-MP | ✅ Lot créé avec code L-YYYY-MMDD-XXX, statut QUARANTAINE |
| REC-05 | Lot sans BE | Création directe de lot (hors BE) | ✅ Lot créé, bon_entree_id = NULL |
| REC-06 | Lot avec origine import | Sélectionner origine "Importé – Malaisie" | ✅ Lot correctement tracé |

### 2.3 Contrôles Réception

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| REC-07 | Checklist réception | Cocher COA présent, conditionnement conforme, prélèvement OK | ✅ Trois contrôles validés |
| REC-08 | Impression étiquette | Cliquer "Étiquette de Quarantaine" | ✅ Génération PDF/BT avec QR code du lot |

**Prérequis :** Connecté en MAGA. Données : fournisseur `SUP-GOLDEN`, article `MP-PFAD`.

---

## 3. Laboratoire & CQ-LIB

### 3.1 Création dossier FCQ

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| LAB-01 | Nouvelle analyse | Sélectionner lot en QUARANTAINE, choisir FCQ-MP, instrument BAL-01 | ✅ FCQ créé statut EN_ATTENTE |
| LAB-02 | Instrument OK | Cocher "Instrument vérifié" | ✅ Champ validé |
| LAB-03 | Lot exempté CQ | Créer FCQ sur article cqlib_exempt | ✅ Message "Lot exempté, passage direct en LIBERE" |

### 3.2 Saisie des Résultats

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| LAB-04 | Résultat conforme | Saisir paramètre "Humidité %", valeur 13.5% dans tolérance 12-15% | ✅ Conforme, ligne verte |
| LAB-05 | Résultat hors tolérance | Saisir paramètre "Viscosité", valeur hors tolérance | ✅ Non conforme, ligne rouge, champ "Statut si NC" requis |
| LAB-06 | Finaliser saisie | Cliquer "Finaliser la saisie" | ✅ FCQ passe EN_COURS → prêt pour décision RQ |

### 3.3 Décision CQ-LIB (RQ)

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| LAB-07 | Libérer le lot | RQ clique "Libérer le lot" | ✅ Lot passe LIBERE, FCQ→VALIDE, notification envoyée |
| LAB-08 | Bloquer le lot | RQ clique "Bloquer le lot" | ✅ Lot passe BLOQUE, FCQ→VALIDE, FNC créée automatiquement |
| LAB-09 | Signature électronique | RQ signe la décision | ✅ validator_signed_at horodaté |

**Prérequis :** Connecté TLAB puis RQ. Données : lot `L-2026-0420-005` (statut QUARANTAINE).

---

## 4. FNC & Méthodologie 8D

### 4.1 Création FNC

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| FNC-01 | Création manuelle | RQ clique "Nouvelle FNC", sélectionne lot, décrit le défaut | ✅ FNC créée avec code FNC-YYYY-XXXX |
| FNC-02 | Création automatique | Bloquer un lot via CQ-LIB | ✅ FNC créée automatiquement (trigger trig_auto_fnc) |
| FNC-03 | Sévérité critique | Définir gravité CRITIQUE | ✅ Alerte rouge dans le dashboard |

### 4.2 Résolution 8D

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| FNC-04 | D1 - Équipe | Remplir "Équipe de résolution" | ✅ Étape D1 validée |
| FNC-05 | D3 - Containment | Décrire action de containment immédiate | ✅ Étape D3 validée |
| FNC-06 | D4 - Cause racine | Saisir cause racine (analyse Ishikawa/5P) | ✅ Étape D4 validée |
| FNC-07 | D5 - Actions planifiées | Planifier actions correctives | ✅ Étape D5 validée |
| FNC-08 | D6 - Actions implémentées | Décrire actions réalisées | ✅ Étape D6 validée |
| FNC-09 | D7 - Prévention | Définir actions préventives | ✅ Étape D7 validée |
| FNC-10 | D8 - Clôture | Signer électroniquement, clôturer | ✅ FNC→CLOTUREE, closed_at horodaté |

**Prérequis :** Connecté RQ. Données : FNC-2026-031 (lot PFAD bloqué).

---

## 5. Production & BOM

### 5.1 Nomenclatures

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| BOM-01 | Créer BOM | Sélectionner produit PF-SAV-009 (IRIKO ANDRAMENA), ajouter composants MP | ✅ BOM créée statut BROUILLON |
| BOM-02 | Ajouter ligne BOM | Ajouter MP-HUI-001 avec qty 0.500 kg, pct 35% | ✅ Ligne ajoutée, sort_order auto |
| BOM-03 | Valider BOM | Cliquer "Valider la nomenclature" | ✅ BOM→VALIDE, utilisable en production |
| BOM-04 | Versioning | Créer nouvelle version d'une BOM existante | ✅ Version incrémentée, historique conservé |
| BOM-05 | Archiver BOM | Archiver BOM obsolète | ✅ BOM→ARCHIVE, plus sélectionnable |

### 5.2 Ordres de Fabrication

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| PROD-01 | Créer OF | Sélectionner produit, BOM validée, qty 1000 kg, date planifiée | ✅ OF créé statut PLANIFIE |
| PROD-02 | Démarrer OF | Cliquer "Démarrer" | ✅ started_at horodaté |
| PROD-03 | Saisir production | Saisir qty_produite = 980 kg | ✅ OF mis à jour |
| PROD-04 | OF Retard | Date dépassée sans completion | ✅ Badge ROUGE "Retard" dans le PDP |

**Données de test :** Article PF-SAV-009, BOM version 1.

### 5.3 Simulation What-If

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| PROD-05 | Scénario +20% | Lancer simulation avec augmentation demande 20% | ✅ Besoins nets recalculés pour chaque composant |
| PROD-06 | Effacer simulation | Cliquer "Effacer" | ✅ Retour vue normale |

---

## 6. Stocks & Inventaire

### 6.1 Consultation Stocks

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| STK-01 | Vue dépôt | Sélectionner dépôt D-103-MP | ✅ Liste des articles avec qté, seuil, valeur |
| STK-02 | Vue consolidée | Cliquer "Vue consolidée" | ✅ Tous dépôts, avec colonne localisation |
| STK-03 | Filtre articles | Filtrer par type MP | ✅ Uniquement matières premières |

### 6.2 Transfert Inter-Dépôt

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| STK-04 | Transfert simple | Sélectionner lot, choisir dépôt destination, quantité | ✅ Mouvement TRANSFERT créé, stock mis à jour |
| STK-05 | Transfert détérioré | Transférer vers D-DET | ✅ Lot marqué comme détérioré |

### 6.3 Ajustement

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| STK-06 | Ajustement positif | Saisir +50 kg, motif "Erreur de pesée" | ✅ Mouvement AJUSTEMENT créé, stock augmenté |
| STK-07 | Ajustement négatif | Saisir -20 kg, motif "Perte constatée" | ✅ Mouvement AJUSTEMENT créé, stock diminué |

### 6.4 Inventaire

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| INV-01 | Créer campagne | Créer "INV-2026-Q3", 5 zones | ✅ Campagne statut EN_PREPARATION |
| INV-02 | Compter article | Sélectionner article, saisir stock physique | ✅ Écart calculé automatiquement |
| INV-03 | Écart majeur | Saisir écart > 2% | ✅ is_major = true, alerte |
| INV-04 | Mode offline | Déconnecter, compter hors-ligne, reconnecter, sync | ✅ Données synchronisées sur le serveur |
| INV-05 | Valider campagne | Clôturer et valider | ✅ Mouvements d'ajustement créés automatiquement (trigger) |

**Prérequis :** Connecté MAGA. Données : campagne INV-2026-Q2.

---

## 7. Achats Import (Workflow 8 étapes)

### 7.1 Création DA Import

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| IMP-01 | Nouvelle DA | Article MP-PFAD, fournisseur Golden Agri, 1×CT20', 12000 kg, USD 10800 | ✅ DA créée step=DA_VALIDEE, statut EN_COURS |
| IMP-02 | Taux de change | USD/MGA saisi ou automatique | ✅ Montant MGA calculé |

### 7.2 Avancement des Étapes

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| IMP-03 | Proforma | Uploader proforma PDF, valider étape | ✅ Step→PROFORMA, log horodaté |
| IMP-04 | LC/Virement | Saisir référence LC, uploader doc | ✅ Step→LC_VIREMENT |
| IMP-05 | Expédition | Saisir date expédition, transporteur | ✅ Step→EXPEDITION |
| IMP-06 | Connaissement | Uploader BL, saisir référence | ✅ Step→CONNAISSEMENT |
| IMP-07 | Dédouanement | Saisir date dédouanement, montant droits | ✅ Step→DEDOUANEMENT |
| IMP-08 | ETA | Mettre à jour date ETA | ✅ Step→ETA |
| IMP-09 | Réception | Lier au BE/lot réceptionné | ✅ Step→RECEPTION, DA→LIVRE |

### 7.3 Alertes & Retards

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| IMP-10 | DA en retard | ETA dépassée sans réception | ✅ Statut→RETARD, alerte dashboard |
| IMP-11 | Pièces jointes | Uploader document sur une étape | ✅ Document visible dans le dossier |

**Prérequis :** Connecté RACH. Données : DA-IMP-2026-0019.

---

## 8. Achats Local

### 8.1 Workflow complet

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| LOC-01 | Saisie DA | Article MP-PARF-FLO, fournisseur SODIMAD, 50 kg, 220 000 Ar | ✅ DA créée step=SAISIE |
| LOC-02 | Validation DPI | DPI clique "Approuver" | ✅ Step→VALIDATION |
| LOC-03 | Émission BC | RACH clique "Émettre BC" | ✅ Step→COMMANDE |
| LOC-04 | Réception partielle | MAGA saisit 1ère livraison 30 kg | ✅ Livraison enregistrée |
| LOC-05 | Réception totale | 2ème livraison 20 kg | ✅ Step→RECEPTION, DA→LIVRE |
| LOC-06 | Écart > 5% | Livraison 45 kg au lieu de 50 (écart 10%) | ✅ Commentaire obligatoire requis |
| LOC-07 | Annulation | ADMIN annule la DA | ✅ DA→ANNULE |

**Données de test :** DA-LOC-2026-0048.

---

## 9. MRP (Calcul des Besoins)

### 9.1 Exécution

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| MRP-01 | Lancer calcul | Cliquer "Lancer le calcul complet" | ✅ Progression affichée, résultats après quelques secondes |
| MRP-02 | Résultats | Consulter tableau des besoins nets | ✅ Chaque MP avec stock, besoins, action recommandée |
| MRP-03 | Filtrer résultats | Filtrer par type MP | ✅ Uniquement les matières premières |

### 9.2 Interprétation

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| MRP-04 | Action "RAS" | Stock suffisant | ✅ Aucune action requise, couleur verte |
| MRP-05 | Action "Recommander" | Stock bas, besoin net > 0 | ✅ Suggéré en orange |
| MRP-06 | Action "Urgente" | Risque rupture imminent | ✅ Alerte rouge, priorité haute |
| MRP-07 | Rupture | Stock < stock sécurité | ✅ Alerte critique |

### 9.3 Scénario What-If

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| MRP-08 | Augmentation 30% | Saisir +30% sur produit PF-SAV-001 | ✅ Nouveaux besoins nets, actions mises à jour |
| MRP-09 | Réinitialiser | Effacer simulation | ✅ Retour résultats réels |

---

## 10. Évaluation Fournisseurs

### 10.1 Saisie Évaluation

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| EVAL-01 | Noter critère | Fournisseur Golden Agri, critère QUALITY, note 4.5/5 | ✅ Évaluation enregistrée |
| EVAL-02 | Cotation complète | Noter DELIVERY (3.5), PRICE (4.0), COMPLIANCE (5.0), SERVICE (4.0) | ✅ Synthèse mise à jour |
| EVAL-03 | Classification | Note globale 4.2 | ✅ Classification A (excellent) |

### 10.2 Historique

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| EVAL-04 | Consulter historique | Ouvrir fiche fournisseur | ✅ Graphique évolution notes Q1/Q2/Q3/Q4 |

**Prérequis :** Connecté RACH.

---

## 11. Réclamations Clients

### 11.1 Enregistrement

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| CMP-01 | Nouvelle réclamation | Client "Distrib SA", origine CLIENT, sévérité MAJEURE | ✅ Réclamation créée code RCL-YYYY-XXXX |
| CMP-02 | Lier article | Sélectionner article PF-SAV-009 | ✅ Article lié |

### 11.2 Traitement

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| CMP-03 | Analyse | Passage statut EN_ANALYSE | ✅ Statut mis à jour |
| CMP-04 | Cause racine | Saisir résultat investigation | ✅ root_cause renseigné |
| CMP-05 | Action corrective | Saisir correction + prévention | ✅ corrective_action, preventive_action renseignés |
| CMP-06 | Compensation | Saisir montant compensation | ✅ return_value enregistré |
| CMP-07 | Lier FNC | Créer FNC associée à la réclamation | ✅ fnc_id renseigné |
| CMP-08 | Clôture | Clôturer la réclamation | ✅ closed_at horodaté, statut CLOTUREE |

**Prérequis :** Connecté RQ ou ADMIN.

---

## 12. Synchronisation SAGE

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| SAGE-01 | Voir en attente | Dashboard → widget Sync SAGE | ✅ Nombre d'enregistrements en attente |
| SAGE-02 | Déclencher sync | Cliquer "Synchroniser" | ✅ Lots, mouvements, DA marqués sage_synced |
| SAGE-03 | Vérification | Vérifier en base : sage_synced = true | ✅ Colonne horodatée |

---

## 13. Génération PDF

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| PDF-01 | FCQ PDF | Depuis un dossier FCQ, cliquer "Export PDF" | ✅ FCQ Format A4 avec logo, résultats, signature |
| PDF-02 | BT PDF | Depuis un transport, cliquer "Bon de Transport" | ✅ Document avec transporteur, véhicule, chauffeur, cachets |
| PDF-03 | BS PDF | Depuis un mouvement, cliquer "Bon de Sortie" | ✅ Document avec demandeur, dépôt, articles |
| PDF-04 | PV PDF | Générer procès-verbal | ✅ Document avec participants, sections, actions |
| PDF-05 | Web vs Mobile | Vérifier sur les deux plateformes | ✅ Web : impression navigateur ; Mobile : partage PDF |

---

## 14. Journal d'Audit

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| AUD-01 | Consultation | Ouvrir écran Audit | ✅ Liste chronologique de toutes les modifications |
| AUD-02 | Filtrer par table | Filtrer par "fnc" | ✅ Uniquement FNC |
| AUD-03 | Détail modification | Cliquer sur un log UPDATE | ✅ Valeurs avant/après affichées |
| AUD-04 | Traçabilité lot | Chercher historique d'un lot spécifique | ✅ Tous les changements sur ce lot |

---

## 15. Internationalisation

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| I18N-01 | Passer en EN | Profil → Changer langue → Anglais | ✅ Tous les libellés UI en anglais |
| I18N-02 | Retour FR | Rebasculer en français | ✅ Retour à l'affichage français |

---

## 16. Administration Utilisateurs

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| ADM-01 | Créer utilisateur | ADMIN clique "Nouvel Utilisateur", saisir email, nom, rôle | ✅ Utilisateur créé avec compte actif |
| ADM-02 | Modifier rôle | Changer MAGA → RPROD | ✅ Rôle mis à jour, permissions adaptées |
| ADM-03 | Désactiver compte | Désactiver un utilisateur | ✅ active = false, connexion bloquée |
| ADM-04 | Mot de passe par défaut | Créer un compte dans l'espace administration | ✅ Le compte est créé avec le mot de passe par défaut `Sipro2026@mg` |
| ADM-05 | Restriction création compte | Tenter de créer un utilisateur depuis un compte non-administrateur (ex: TLAB, RQ) | ✅ Action impossible, réservée exclusivement aux administrateurs |
| ADM-06 | Changement mot de passe | Se connecter en tant que nouvel utilisateur, aller sur le profil et changer le mot de passe | ✅ Le mot de passe par défaut est remplacé et la nouvelle connexion valide le nouveau mot de passe |


---

## 17. Réception Produits Finis

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| RPF-01 | Réception PF | Saisir OF terminé, produit PF, quantité produite | ✅ Lot PF créé, stock dépôt PF mis à jour |
| RPF-02 | Lien OF | Vérifier que le lot référence l'OF d'origine | ✅ lot lié à production_orders |

---

## 18. Planning Logistique

| ID | Cas | Action | Résultat attendu |
|----|-----|--------|------------------|
| PLAN-01 | Vue planning | Ouvrir Planning Logistique | ✅ Calendrier avec DA, livraisons, ETA |
| PLAN-02 | Alerte ETA | DA avec ETA dans les 7 jours | ✅ Badge orange/rouge |

---

## Résumé des Criticités

| Module | Tests critiques | Risque si échec |
|--------|-----------------|-----------------|
| Authentification | 7 | Accès non autorisé ou bloqué |
| Réception | 8 | Rupture de traçabilité matière |
| Laboratoire | 9 | Libération de lot non-conforme |
| FNC 8D | 10 | Non-conformité non résolue |
| Production | 6 | Arrêt production |
| Stocks | 7 | Écart inventaire non détecté |
| Achats Import | 11 | Retard import, surcoût dédouanement |
| Achats Local | 7 | Rupture approvisionnement |
| MRP | 9 | Rupture ou surstock |
| Évaluation | 4 | Mauvais fournisseur |
| Réclamations | 8 | Insatisfaction client |
| SAGE | 3 | Décalage comptable |
| PDF | 5 | Documents inexploitables |
| Audit | 4 | Non traçabilité (conformité ISO) |
| **Total** | **98** | |

---

## Environnements de test

| Environnement | URL | Base de données | Usage |
|--------------|-----|-----------------|-------|
| **Local** | `http://localhost:8081` | Supabase locale ou staging | Développement |
| **Staging** | `https://staging.erp.gsi.mg` | Supabase staging seed | Tests de recette |
| **Production** | `https://erp.gsi.mg` | Supabase production | Exploitation réelle |

**Comptes de test staging :** Créés via `supabase/012_test_users.sql` (dpi@gsi.local, rq@gsi.local, etc.)
