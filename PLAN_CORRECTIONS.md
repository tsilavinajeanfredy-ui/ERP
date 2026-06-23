# Plan — Correction des erreurs & ajout des manquements (erp-native)

## 1. Erreurs (FAIT)
- 4 erreurs TypeScript dans `src/lib/hooks/calibration.ts` (`supabase` possibly null) → corrigées (ajout des gardes `if (!supabase)`).
- `tsc --noEmit` : 0 erreur.
- `jest` : 105 tests OK.
- `expo export --platform web` (commande CI) : build OK.
- Note: `npm run lint` échoue car il manque `eslint.config.js` (ESLint v9 = flat config). Non bloquant pour le CI (le CI ne lance que `build:web`). Je peux ajouter une config flat si souhaité.

## 2. Backlog des manquements (par priorité)

### P1 — Critiques (Modules 4 & 5)
- **M4** Triple signature électronique BT/BS (brancher `SignaturePad` sur BT/BS, workflow émetteur+récepteur+resp. stock).
- **M4** Alerte lots en quarantaine depuis > 7 jours.
- **M4** Rapprochement automatique inventaire (écart théorique vs compté).
- **M4** Fiches d'inventaire pré-numérotées (sheet_number séquentiel).
- **M4** Catégorie emballages consommables (PACKAGING_CONSUMABLE).
- **M5** Décisions FNC typées (BLOQUE, DETERIORE, RETOUR, TRI, REWORK) + workflows associés.
- **M5** Vérification d'efficacité avant clôture FNC.
- **M5** Réclamations: circuit J+1 + escalade (due_by, escalated_at, escalation_level).
- **M5** Liaison réclamation → lot → FCQ.
- **M5** Évaluation fournisseur: 6 critères pondérés configurables.

### P2 — Importants (Modules 7, 9, 2)
- **M7** Export mensuel automatique PV revue de direction (Edge Function + cron).
- **M7** Dashboard personnalisable (préférences utilisateur).
- **M9** Jalons "Arrivée Tamatave" + "Arrivée usine" distincts d'ETA.
- **M9/M10** Notification magasinier J-X avant livraison.
- **M9** Dashboard par famille MP + par période; historique d'aide à la décision.
- **M2** Rappels d'étalonnage automatiques (J-7/J-14) + Edge Function.

### P3 — Mineurs (Modules 6, 9, 10)
- **M6** Champs instruments: modèle, n° série, localisation, date mise en service.
- **M6** Fiche technique produit autonome (indépendante BOM).
- **M9** Conteneur 20FT par défaut.
- **M10** Dashboard par section; KPI taux de respect des délais fournisseur.

## 3. Méthode
Pour chaque manquement: migration SQL (`supabase/0XX_*.sql`) + types (`database.types.ts`) + hooks (`src/lib/hooks/*`) + UI (`src/screens/*`), en respectant les conventions existantes. Typecheck/tests/build après chaque lot.

## 4. Livraison (à confirmer)
Le clone du dépôt `github.com/fredytsilavina-cell/erp-native` renvoie **403** (pas d'accès GitHub). Pour livrer une PR il faut connecter le dépôt à Devin. Sinon je livre un patch/zip téléchargeable.
