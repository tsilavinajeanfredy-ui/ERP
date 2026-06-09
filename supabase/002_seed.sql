-- ============================================================================
-- ERP GSI — SEED DATA (données réelles GSI)
-- Migration 002 — Insertion des référentiels + données opérationnelles
-- ============================================================================

-- ─── SITES ──────────────────────────────────────────────────────────────────
INSERT INTO sites (code, name, city) VALUES
  ('TANA-103', 'Usine 103 Antananarivo', 'Antananarivo'),
  ('AMBO', 'Dépôt Ambohimanarina', 'Ambohimanarina'),
  ('ALA', 'Dépôt Alarobia', 'Alarobia')
ON CONFLICT (code) DO NOTHING;

-- ─── DÉPÔTS ─────────────────────────────────────────────────────────────────
INSERT INTO depots (code, name, site_id, depot_type, is_deteriore) VALUES
  ('D-103-MP', '103 Matières Premières', (SELECT id FROM sites WHERE code='TANA-103'), 'MP', false),
  ('D-103-EMB', '103 Emballage', (SELECT id FROM sites WHERE code='TANA-103'), 'EMB', false),
  ('D-103-PF', '103 Produits Finis', (SELECT id FROM sites WHERE code='TANA-103'), 'PF', false),
  ('D-AMBO', 'Ambohimanarina', (SELECT id FROM sites WHERE code='AMBO'), NULL, false),
  ('D-ALA', 'Alarobia', (SELECT id FROM sites WHERE code='ALA'), NULL, false),
  ('D-DET', 'Détérioré (logique)', (SELECT id FROM sites WHERE code='TANA-103'), NULL, true)
ON CONFLICT (code) DO NOTHING;

-- ─── UTILISATEURS ───────────────────────────────────────────────────────────
INSERT INTO users (email, full_name, role, site, scope, two_fa_enabled) VALUES
  ('admin@gsi.mg', 'Super Administrateur GSI', 'ADMIN', 'Antananarivo', 'ALL', true),
  ('directeur@gsi.mg', 'Patrick (Directeur Usine)', 'DPI', 'Antananarivo', NULL, true),
  ('rq@gsi.mg', 'Resp. Qualité', 'RQ', 'Antananarivo', NULL, true),
  ('tech1@gsi.mg', 'Technicien Labo 1', 'TLAB', 'Antananarivo', 'SAV, PAP, BOU, EAU, MP', false),
  ('tech2@gsi.mg', 'Technicien Labo 2', 'TLAB', 'Antananarivo', 'VAI, ENC, COR', false),
  ('prod@gsi.mg', 'Chef Production', 'RPROD', 'Antananarivo', NULL, false),
  ('reception@gsi.mg', 'Chef Réception', 'MAGA', 'Antananarivo', NULL, false),
  ('stock@gsi.mg', 'Gestionnaire Stock', 'MAGA', 'Antananarivo', NULL, false),
  ('achats@gsi.mg', 'Service Achats', 'RACH', 'Antananarivo', NULL, false),
  ('compta@gsi.mg', 'Comptabilité', 'COMPTA', 'Antananarivo', NULL, false)
ON CONFLICT (email) DO NOTHING;

-- ─── FOURNISSEURS ───────────────────────────────────────────────────────────
INSERT INTO suppliers (code, name, country, currency, lead_time_days) VALUES
  ('SUP-GOLDEN', 'Golden Agri International', 'Singapour', 'USD', 120),
  ('SUP-AFRI', 'Afritrade Chemicals LTD', 'Maurice', 'USD', 142),
  ('SUP-SODA', 'Soda Trading India PVT', 'Inde', 'EUR', 215),
  ('SUP-CHIMAD', 'Chimie Madagascar', 'Madagascar', 'MGA', 7),
  ('SUP-SODI', 'SODIMAD SAS', 'Madagascar', 'MGA', 5),
  ('SUP-TANA', 'Imprimerie TANA Pack', 'Madagascar', 'MGA', 10),
  ('SUP-PRINT', 'PrintMada', 'Madagascar', 'MGA', 8),
  ('SUP-PK', 'Pakistan Soap Industries', 'Pakistan', 'USD', 180),
  ('SUP-ID', 'PT Indo Bondillons', 'Indonésie', 'USD', 160)
ON CONFLICT (code) DO NOTHING;

-- ─── ARTICLES MP ────────────────────────────────────────────────────────────
INSERT INTO articles (code, name, article_type, family, universe, unit, spec_ref, fcq_ref, default_supplier_id, active) VALUES
  ('MP-PFAD', 'PFAD — Palm Fatty Acid Distillate', 'MP', 'Corps gras', 'Approvisionnement', 'kg', 'SP-MP-V2', 'FCQ-MP', (SELECT id FROM suppliers WHERE code='SUP-GOLDEN'), true),
  ('MP-NAOH', 'NaOH — Soude caustique 98%', 'MP', 'Chimie base', 'Approvisionnement', 'kg', 'SP-MP-V2', 'FCQ-MP', (SELECT id FROM suppliers WHERE code='SUP-AFRI'), true),
  ('MP-KOH', 'KOH — Potasse caustique 90%', 'MP', 'Chimie base', 'Approvisionnement', 'kg', 'SP-MP-V2', 'FCQ-MP', (SELECT id FROM suppliers WHERE code='SUP-SODA'), true),
  ('MP-GLYC', 'Glycérine végétale', 'MP', 'Corps gras', 'Approvisionnement', 'kg', 'SP-MP-V2', 'FCQ-MP', NULL, true),
  ('MP-PARF-CIT', 'Parfum Citron Klin', 'MP', 'Arômes', 'Approvisionnement', 'kg', 'SP-MP-V2', 'FCQ-MP', (SELECT id FROM suppliers WHERE code='SUP-SODI'), true),
  ('MP-PARF-FLO', 'Parfum Floral 500', 'MP', 'Arômes', 'Approvisionnement', 'kg', 'SP-MP-V2', 'FCQ-MP', (SELECT id FROM suppliers WHERE code='SUP-SODI'), true),
  ('MP-TALC', 'Talc industriel', 'MP', 'Charges', 'Approvisionnement', 'kg', 'SP-MP-V2', 'FCQ-MP', NULL, true),
  ('MP-BOND-PK', 'Bondillons rouge Pakistan', 'MP', 'Bondillons importés', 'Approvisionnement', 'kg', 'SP-MP-V2', 'FCQ-MP', (SELECT id FROM suppliers WHERE code='SUP-PK'), true),
  ('MP-BOND-IDR', 'Bondillons rouge Indonésie', 'MP', 'Bondillons importés', 'Approvisionnement', 'kg', 'SP-MP-V2', 'FCQ-MP', (SELECT id FROM suppliers WHERE code='SUP-ID'), true),
  ('MP-BOND-IDW', 'Bondillons blanc Indonésie', 'MP', 'Bondillons importés', 'Approvisionnement', 'kg', 'SP-MP-V2', 'FCQ-MP', (SELECT id FROM suppliers WHERE code='SUP-ID'), true),
  ('MP-CIRE-PAR', 'Cire paraffine', 'MP', 'Cires', 'Approvisionnement', 'kg', 'SP-MP-V2', 'FCQ-MP', NULL, true),
  ('MP-MECHE', 'Mèche coton bougie', 'MP', 'Accessoires', 'Approvisionnement', 'm', 'SP-MP-V2', 'FCQ-MP', NULL, true),
  ('MP-POLY', 'Granulés polyester', 'MP', 'Polymères', 'Approvisionnement', 'kg', 'SP-MP-V2', 'FCQ-MP', NULL, true),
  ('MP-NYLON', 'Granulés nylon', 'MP', 'Polymères', 'Approvisionnement', 'kg', 'SP-MP-V2', 'FCQ-MP', NULL, true),
  ('MP-PATE-PAP', 'Pâte à papier vierge', 'MP', 'Papier', 'Approvisionnement', 'kg', 'SP-MP-V2', 'FCQ-MP', NULL, true)
ON CONFLICT (code) DO NOTHING;

-- ─── ARTICLES SF (Semi-Finis — Bondillons Mariani) ──────────────────────────
INSERT INTO articles (code, name, article_type, family, universe, unit, spec_ref, fcq_ref, active) VALUES
  ('SF-BOND-NC', 'Bondillons Mariani sans charge', 'SF', 'Bondillons internes', 'Production', 'kg', 'SP-SAV-V2', 'FCQ-SAV', true),
  ('SF-BOND-CC', 'Bondillons Mariani avec charge (talc)', 'SF', 'Bondillons internes', 'Production', 'kg', 'SP-SAV-V2', 'FCQ-SAV', true)
ON CONFLICT (code) DO NOTHING;

-- ─── ARTICLES PF (Produits Finis) ───────────────────────────────────────────
INSERT INTO articles (code, name, article_type, family, brand, universe, unit, spec_ref, fcq_ref, bp_ref, active) VALUES
  -- Détergents
  ('PF-DET-FLOR', 'Détergent poudre BIKKO 25g S150 - Floral', 'PF', 'Entretien maison', 'BIKKO', 'Entretien', 'Sachet', 'SP-DET-V1', 'FCQ-DET', 'ANN-BP-DET', true),
  ('PF-DET-JASM', 'Détergent poudre BIKKO 25g S150 - Jasmin', 'PF', 'Entretien maison', 'BIKKO', 'Entretien', 'Sachet', 'SP-DET-V1', 'FCQ-DET', 'ANN-BP-DET', true),
  ('PF-DET-LAVA', 'Détergent poudre BIKKO 25g S150 - Lavande', 'PF', 'Entretien maison', 'BIKKO', 'Entretien', 'Sachet', 'SP-DET-V1', 'FCQ-DET', 'ANN-BP-DET', true),
  
  -- Bougies
  ('PF-BOU-MNA48', 'Bougie DB Mariani MNA c/48 PB', 'PF', 'Décoration', 'Mariani', 'Décoration', 'Carton', 'SP-BOU-V2', 'FCQ-BOU', 'ANN-BP-BOU', true),
  ('PF-BOU-MENA50', 'Bougie DB Menakely blanche C/50 PB', 'PF', 'Décoration', 'Menakely', 'Décoration', 'Carton', 'SP-BOU-V2', 'FCQ-BOU', 'ANN-BP-BOU', true),
  ('PF-BOU-PM60', 'Bougie Menakely en PM C/60 PB', 'PF', 'Décoration', 'Menakely', 'Décoration', 'Carton', 'SP-BOU-V2', 'FCQ-BOU', 'ANN-BP-BOU', true),
  ('PF-BOU-MENAKG', 'Bougie Menakely en KG', 'PF', 'Décoration', 'Menakely', 'Décoration', 'kg', 'SP-BOU-V2', 'FCQ-BOU', 'ANN-BP-BOU', true),

  -- Cordes Nylon
  ('PF-COR-42B', 'Corde nylon de 42mm * 200Yard-Blanc', 'PF', 'Industrie / BTP', 'Sipromad', 'Industrie', 'Bobine', 'SP-COR-V2', 'FCQ-COR', 'ANN-BP-COR', true),
  ('PF-COR-42V', 'Corde nylon de 42mm * 200Yard-Vert', 'PF', 'Industrie / BTP', 'Sipromad', 'Industrie', 'Bobine', 'SP-COR-V2', 'FCQ-COR', 'ANN-BP-COR', true),
  ('PF-COR-42O', 'Corde nylon de 42mm * 200Yard-Orange', 'PF', 'Industrie / BTP', 'Sipromad', 'Industrie', 'Bobine', 'SP-COR-V2', 'FCQ-COR', 'ANN-BP-COR', true),

  -- Savons
  ('PF-SAV-MENA24', 'SAVON IMB 02-MENAKELY C/24', 'PF', 'Hygiène corps', 'Menakely', 'Hygiène', 'Carton', 'SP-SAV-V2', 'FCQ-SAV', 'ANN-BP-SAV', true),
  ('PF-SAV-TANT24', 'SAVON IMB 02-TANTELY C/24', 'PF', 'Hygiène corps', 'Tantely', 'Hygiène', 'Carton', 'SP-SAV-V2', 'FCQ-SAV', 'ANN-BP-SAV', true),
  ('PF-SAV-FOTS24', 'SAVON IMB 02-FOTSY C/24', 'PF', 'Hygiène corps', 'Fotsy', 'Hygiène', 'Carton', 'SP-SAV-V2', 'FCQ-SAV', 'ANN-BP-SAV', true),
  ('PF-SAV-ANDR24', 'Savon IB 02-E Andramena c/24', 'PF', 'Hygiène corps', 'Andramena', 'Hygiène', 'Carton', 'SP-SAV-V2', 'FCQ-SAV', 'ANN-BP-SAV', true),

  -- Encaustiques
  ('PF-ENC-ACA200', 'Encaustique Terraine PREMUIM 200cc - C15 - Acajou', 'PF', 'Entretien maison', 'Terraine', 'Entretien', 'Carton', 'SP-ENC-V2', 'FCQ-ENC', 'ANN-BP-ENC', true),
  ('PF-ENC-NEU200', 'Encaustique Terraine PREMUIM 200cc - C15 - Neutre', 'PF', 'Entretien maison', 'Terraine', 'Entretien', 'Carton', 'SP-ENC-V2', 'FCQ-ENC', 'ANN-BP-ENC', true),

  -- Papier Hygiénique
  ('PF-PAP-LYSCL', 'Papier hygiénique LYS CLASSIC', 'PF', 'Hygiène sanitaire', 'Lys', 'Hygiène', 'Balle', 'SP-PAP-V2', 'FCQ-PAP', 'ANN-BP-PAP', true),
  ('PF-PAP-DOUCY', 'PR DOUCY CONFORT PIN S/48 CB', 'PF', 'Hygiène sanitaire', 'Doucy', 'Hygiène', 'Balle', 'SP-PAP-V2', 'FCQ-PAP', 'ANN-BP-PAP', true)
ON CONFLICT (code) DO NOTHING;

-- ─── INSTRUMENTS LABO ───────────────────────────────────────────────────────
INSERT INTO instruments (code, name, procedure_ref, frequency, standard_required, standard_status, status, impact_if_nc, owner_id) VALUES
  ('BAL-01', 'Balance analytique BA-W303', 'ETA-BAL', 'Mensuel', 'Masses 10g+100g (F1)', 'À acquérir', 'A_ETALONNER', 'Pesées (tous produits)', (SELECT id FROM users WHERE email='tech1@gsi.mg')),
  ('PHM-01', 'pH-mètre PH-B200E (A)', 'ETA-PHM', 'Avant chaque série', 'Tampons pH 4/7/10', 'À acquérir', 'ETALONNE', 'pH (SAV, VAI, PAP, MP, EAU)', (SELECT id FROM users WHERE email='tech1@gsi.mg')),
  ('PHM-02', 'pH-mètre PH-B200E (B)', 'ETA-PHM', 'Avant chaque série', 'Tampons pH 4/7/10', 'À acquérir', 'ECHU', 'pH (SAV, VAI, PAP, MP, EAU)', (SELECT id FROM users WHERE email='tech1@gsi.mg')),
  ('VIS-01', 'Viscosimètre NDJ-8S', 'ETA-VIS', 'Trimestriel', 'Huile certifiée', 'À acquérir', 'ETALONNE', 'Viscosité (SAV, VAI, ENC)', (SELECT id FROM users WHERE email='tech2@gsi.mg')),
  ('TSP-01', 'Testeur souplesse papier', 'ETA-TSP', 'Mensuel', 'Papier certifié', 'En attente', 'EN_ATTENTE', 'Souplesse (PAP)', (SELECT id FROM users WHERE email='tech1@gsi.mg')),
  ('MTU-01', 'Machine test SL-8162', 'ETA-MTU', 'Trimestriel', 'Masse 100N certifiée', 'À acquérir', 'ETALONNE', 'Traction/rupture (PAP, COR)', (SELECT id FROM users WHERE email='tech2@gsi.mg')),
  ('BMA-01', 'Bain-marie WB-1R1H-3', 'ETA-BMA', 'Trimestriel', 'Thermomètre ±0,1°C', 'À acquérir', 'ETALONNE', 'Fusion (ENC, BOU)', (SELECT id FROM users WHERE email='tech1@gsi.mg')),
  ('ETV-01', 'Étuve DOF-V140A', 'ETA-ETV', 'Trimestriel', '2× thermomètre 250°C', 'À acquérir', 'ETALONNE', 'Séchage (SAV, PAP)', (SELECT id FROM users WHERE email='tech1@gsi.mg'))
ON CONFLICT (code) DO NOTHING;

-- ─── TAUX DE CHANGE ─────────────────────────────────────────────────────────
INSERT INTO exchange_rates (from_currency, to_currency, rate, effective_date, source) VALUES
  ('USD', 'MGA', 4690.0000, '2026-04-01', 'BFM'),
  ('USD', 'MGA', 4695.0000, '2026-05-01', 'BFM'),
  ('EUR', 'MGA', 5400.0000, '2026-04-01', 'BFM'),
  ('EUR', 'MGA', 5410.0000, '2026-05-01', 'BFM')
ON CONFLICT (from_currency, to_currency, effective_date) DO NOTHING;

-- ─── BONS D'ENTREE + LOTS ──────────────────────────────────────────────────
INSERT INTO bons_entree (code, supplier_id, site_id, reception_date, bl_number, coa_received) VALUES
  ('BE-2026-0418-001', (SELECT id FROM suppliers WHERE code='SUP-GOLDEN'), (SELECT id FROM sites WHERE code='TANA-103'), '2026-04-18', 'BL-GA-2026-0418', true),
  ('BE-2026-0419-001', (SELECT id FROM suppliers WHERE code='SUP-CHIMAD'), (SELECT id FROM sites WHERE code='TANA-103'), '2026-04-19', 'BL-CM-0419', true),
  ('BE-2026-0420-002', (SELECT id FROM suppliers WHERE code='SUP-CHIMAD'), (SELECT id FROM sites WHERE code='TANA-103'), '2026-04-20', 'BL-CM-0420', true),
  ('BE-2026-0421-003', (SELECT id FROM suppliers WHERE code='SUP-SODA'), (SELECT id FROM sites WHERE code='TANA-103'), '2026-04-21', 'BL-STI-0421', false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO lots (code, bon_entree_id, article_id, supplier_id, depot_id, qty_received, qty_current, unit, cqlib_status, origin, reception_date) VALUES
  ('L-2026-0418-001', (SELECT id FROM bons_entree WHERE code='BE-2026-0418-001'), (SELECT id FROM articles WHERE code='MP-PFAD'), (SELECT id FROM suppliers WHERE code='SUP-GOLDEN'), (SELECT id FROM depots WHERE code='D-103-MP'), 25000.0000, 8000.0000, 'kg', 'BLOQUE', 'Importé – Malaisie', '2026-04-18'),
  ('L-2026-0419-004', (SELECT id FROM bons_entree WHERE code='BE-2026-0419-001'), (SELECT id FROM articles WHERE code='MP-NAOH'), (SELECT id FROM suppliers WHERE code='SUP-CHIMAD'), (SELECT id FROM depots WHERE code='D-103-MP'), 1200.0000, 1200.0000, 'kg', 'LIBERE', 'Local', '2026-04-19'),
  ('L-2026-0420-005', (SELECT id FROM bons_entree WHERE code='BE-2026-0420-002'), (SELECT id FROM articles WHERE code='MP-NAOH'), (SELECT id FROM suppliers WHERE code='SUP-CHIMAD'), (SELECT id FROM depots WHERE code='D-103-MP'), 1000.0000, 1000.0000, 'kg', 'QUARANTAINE', 'Local', '2026-04-20'),
  ('L-2026-0421-006', (SELECT id FROM bons_entree WHERE code='BE-2026-0421-003'), (SELECT id FROM articles WHERE code='MP-KOH'), (SELECT id FROM suppliers WHERE code='SUP-SODA'), (SELECT id FROM depots WHERE code='D-103-MP'), 800.0000, 800.0000, 'kg', 'QUARANTAINE', 'Importé – Inde', '2026-04-21')
ON CONFLICT (code) DO NOTHING;

-- ─── DOSSIERS FCQ ───────────────────────────────────────────────────────────
INSERT INTO fcq_dossiers (code, lot_id, fcq_type, status, decision, analyst_id, instrument_id, instrument_ok) VALUES
  ('FCQ-2026-0039', (SELECT id FROM lots WHERE code='L-2026-0418-001'), 'FCQ-MP', 'VALIDE', 'BLOQUE', (SELECT id FROM users WHERE email='tech1@gsi.mg'), (SELECT id FROM instruments WHERE code='VIS-01'), true),
  ('FCQ-2026-0043', (SELECT id FROM lots WHERE code='L-2026-0419-004'), 'FCQ-MP', 'VALIDE', 'LIBERE', (SELECT id FROM users WHERE email='tech1@gsi.mg'), (SELECT id FROM instruments WHERE code='BAL-01'), true),
  ('FCQ-2026-0044', (SELECT id FROM lots WHERE code='L-2026-0420-005'), 'FCQ-MP', 'EN_COURS', NULL, (SELECT id FROM users WHERE email='tech2@gsi.mg'), (SELECT id FROM instruments WHERE code='BAL-01'), true),
  ('FCQ-2026-0045', (SELECT id FROM lots WHERE code='L-2026-0421-006'), 'FCQ-MP', 'EN_ATTENTE', NULL, NULL, (SELECT id FROM instruments WHERE code='PHM-01'), true)
ON CONFLICT (code) DO NOTHING;

-- ─── FNC ────────────────────────────────────────────────────────────────────
INSERT INTO fnc (code, lot_id, fcq_id, severity, status, description, opened_by) VALUES
  ('FNC-2026-031', (SELECT id FROM lots WHERE code='L-2026-0418-001'), (SELECT id FROM fcq_dossiers WHERE code='FCQ-2026-0039'), 'CRITIQUE', 'OUVERTE', 'PFAD hors spécification — viscosité et aspect non conformes. Lot bloqué.', (SELECT id FROM users WHERE email='rq@gsi.mg'))
ON CONFLICT (code) DO NOTHING;

-- ─── DA IMPORT ──────────────────────────────────────────────────────────────
INSERT INTO da_import (code, article_id, supplier_id, qty_container, qty_kg, currency, amount_currency, amount_mga, current_step, status, eta_date, lead_time_days) VALUES
  ('DA-IMP-2026-0019', (SELECT id FROM articles WHERE code='MP-PFAD'), (SELECT id FROM suppliers WHERE code='SUP-GOLDEN'), '1 CT 20''', 12000.0000, 'USD', 10800.0000, 50652000.0000, 'LC_VIREMENT', 'EN_COURS', '2026-07-15', 87),
  ('DA-IMP-2026-0014', (SELECT id FROM articles WHERE code='MP-NAOH'), (SELECT id FROM suppliers WHERE code='SUP-AFRI'), '2 CT 20''', 49000.0000, 'USD', 45080.0000, 211575600.0000, 'ETA', 'RETARD', '2026-05-12', 142),
  ('DA-IMP-2026-0008', (SELECT id FROM articles WHERE code='MP-KOH'), (SELECT id FROM suppliers WHERE code='SUP-SODA'), '1 CT 40''', 26500.0000, 'EUR', 28250.0000, 152550000.0000, 'RECEPTION', 'LIVRE', NULL, 215)
ON CONFLICT (code) DO NOTHING;

-- ─── DA LOCAL ───────────────────────────────────────────────────────────────
INSERT INTO da_local (code, article_id, supplier_id, qty, unit, amount_mga, current_step, status) VALUES
  ('DA-LOC-2026-0048', (SELECT id FROM articles WHERE code='MP-PARF-FLO'), (SELECT id FROM suppliers WHERE code='SUP-SODI'), 50.0000, 'kg', 220000.0000, 'SAISIE', 'EN_COURS'),
  ('DA-LOC-2026-0045', (SELECT id FROM articles WHERE code='MP-NAOH'), (SELECT id FROM suppliers WHERE code='SUP-CHIMAD'), 500.0000, 'kg', 680000.0000, 'VALIDATION', 'EN_COURS'),
  ('DA-LOC-2026-0039', (SELECT id FROM articles WHERE code='MP-PFAD'), (SELECT id FROM suppliers WHERE code='SUP-TANA'), 5000.0000, 'unités', 1250000.0000, 'RECEPTION', 'EN_COURS'),
  ('DA-LOC-2026-0031', (SELECT id FROM articles WHERE code='MP-PFAD'), (SELECT id FROM suppliers WHERE code='SUP-PRINT'), 20000.0000, 'unités', 340000.0000, 'RECEPTION', 'CLOS')
ON CONFLICT (code) DO NOTHING;

-- ─── INVENTAIRE ─────────────────────────────────────────────────────────────
INSERT INTO inventory_campaigns (code, label, period, zones, status) VALUES
  ('INV-2026-Q2', 'Inventaire Q2 2026 — Tous dépôts', 'Avril 2026', 5, 'EN_COURS'),
  ('INV-2026-Q1', 'Inventaire Q1 2026 — Tous dépôts', 'Janvier 2026', 5, 'VALIDE')
ON CONFLICT (code) DO NOTHING;

-- ─── TRADUCTIONS ARTICLES (MOCK EN) ─────────────────────────────────────────
UPDATE articles SET name_en = 'PFAD — Palm Fatty Acid Distillate' WHERE code = 'MP-PFAD';
UPDATE articles SET name_en = 'NaOH — Caustic Soda 98%' WHERE code = 'MP-NAOH';
UPDATE articles SET name_en = 'Vegetable Glycerin' WHERE code = 'MP-GLYC';
UPDATE articles SET name_en = 'Andramena Soap' WHERE code = 'PF-SAV-ANDR';
UPDATE articles SET name_en = 'Lemon Dishwashing Liquid 500mL' WHERE code = 'PF-VAI-CIT';
UPDATE articles SET name_en = 'Decorative Candles (9 sizes)' WHERE code = 'PF-BOU-DEC';
UPDATE articles SET name_en = 'Eco Toilet Paper' WHERE code = 'PF-PAP-DECO';
