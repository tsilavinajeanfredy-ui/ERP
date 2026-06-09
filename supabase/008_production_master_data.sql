-- ==============================================================================
-- ERP GSI - MIGRATION 008 : RÉINITIALISATION COMPLÈTE DU RÉFÉRENTIEL ARTICLES
-- Suppression de toutes les données et remplacement par la liste exhaustive.
-- ==============================================================================

-- 1. Nettoyage radical
TRUNCATE public.articles RESTART IDENTITY CASCADE;

-- 2. Insertion des Détergents & Savons IRIKO
INSERT INTO public.articles (code, name, family, unit, article_type, brand, active)
VALUES 
('PF-DET-001', 'Détergent poudre IRIKO 25g S150-Floral', 'SINE003', 'Sachet', 'PF', 'IRIKO', true),
('PF-DET-002', 'Détergent poudre IRIKO 25g S150-Jasmin', 'SINE003', 'Sachet', 'PF', 'IRIKO', true),
('PF-DET-003', 'Détergent poudre IRIKO 25g S150-Lavande', 'SINE003', 'Sachet', 'PF', 'IRIKO', true),
('PF-DET-004', 'Détergent poudre IRIKO 25g S150-Original', 'SINE003', 'Sachet', 'PF', 'IRIKO', true),
('PF-DET-005', 'Détergent poudre IRIKO 25g S150-Citron vert', 'SINE003', 'Sachet', 'PF', 'IRIKO', true),
('PF-SAV-001', 'Savon IRIKO 70g citron Barre Fotsy c-36', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-002', 'Savon IRIKO 150g citron Barre Fotsy c-24', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-003', 'Savon IRIKO 220g citron Barre Fotsy c-24', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-004', 'Savon IRIKO 472g citron Barre Fotsy c-9', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-005', 'Savon barre IRIKO Andramena 1kg c-12', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-006', 'Savon barre IRIKO Menakely Trans 1kg - c12', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-007', 'Savon Barre IRIKO Fotsy 800g c-12', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-008', 'Savon Barre IRIKO Fotsy nature 1kg c-12', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-009', 'SAVON IRIKO ANDRAMENA C24', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-010', 'SAVON IRIKO MENAKELY C24', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-011', 'SAVON IRIKO TANTELY C24', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-012', 'SAVON IRIKO NANTO C24', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-013', 'SAVON IRIKO FOTSY C24', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-014', 'Savon IRIKO-K Andramena C24', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-015', 'Savon IRIKO-K Menakely C24', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-016', 'Savon IRIKO-K Nanto C24', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-017', 'Savon IRIKO-K Fotsy C24', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-018', 'SAVON IRIKO-K Tantely C24', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-019', 'Savon IRIKO-PM Andramena C24', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-020', 'Savon IRIKO-PM Menakely C24', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-021', 'Savon IRIKO-XG Andramena C24', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-022', 'Savon IRIKO-XG Menakely C24', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true)
ON CONFLICT (code) DO NOTHING;

-- 3. Insertion des Bougies MARONJANA
INSERT INTO public.articles (code, name, family, unit, article_type, brand, active)
VALUES 
('PF-BOU-001', 'Bougie Maronjana Lehibe C40 P6', 'SIPF001', 'paqt 6', 'PF', 'MARONJANA', true),
('PF-BOU-002', 'Bougie MARONJANA C40 P6', 'SIPF001', 'paqt 6', 'PF', 'MARONJANA', true),
('PF-BOU-003', 'Bougie CB Maronjana lehibe C40 P6', 'SIPF001', 'paqt 6', 'PF', 'MARONJANA', true),
('PF-BOU-004', 'Bougie Maronjana PM C40 P6', 'SIPF001', 'paqt 6', 'PF', 'MARONJANA', true),
('PF-BOU-005', 'Bougie Maronjana XG', 'SIPF001', 'PCE', 'PF', 'MARONJANA', true)
ON CONFLICT (code) DO NOTHING;

-- 4. Insertion des Cordes Nylon
INSERT INTO public.articles (code, name, family, unit, article_type, brand, active)
VALUES 
('PF-COR-001', 'Corde nylon de 02mm * 100Yard-Blanc', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-002', 'Corde nylon de 02mm * 100Yard-Bleu', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-003', 'Corde nylon de 02mm * 100Yard-Vert', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-004', 'Corde nylon de 04mm * 100 Yard-Bleu', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-005', 'Corde nylon de 06mm * 100 Yard-Jaune', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-006', 'Corde nylon de 10mm * 100 Yard-Blanc', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-007', 'Corde nylon de 20mm * 100 Yard-Vert', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-008', 'Corde nylon de 40mm * 100 Yard-Bleu', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-009', 'Corde 12mm x 500 Yard', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true)
ON CONFLICT (code) DO NOTHING;

-- 5. Insertion des Papiers Hygiéniques LYS & DOUCY
INSERT INTO public.articles (code, name, family, unit, article_type, brand, active)
VALUES 
('PF-PH-001', 'Papier hygiénique LYS CLASSIC', 'SIPF009', 'rlx', 'PF', 'LYS', true),
('PF-PH-002', 'PH 2eme choix LYS CLASSIC', 'SIPF009', 'rlx', 'PF', 'LYS', true),
('PF-PH-003', 'PH DOUCY CONFORT P06 S48 CB', 'SIPF009', 'rlx', 'PF', 'DOUCY', true),
('PF-PH-004', 'Papier hygiénique DOUCY P06 S48TRP', 'SIPF009', 'rlx', 'PF', 'DOUCY', true),
('PF-PH-005', 'DOUCY CLASSIC PRO', 'SIPF009', 'rlx', 'PF', 'DOUCY', true),
('PF-PH-006', 'PH 2eme choix LYS ROSE', 'SIPF009', 'rlx', 'PF', 'LYS', true)
ON CONFLICT (code) DO NOTHING;

-- 6. Insertion des Encaustiques TSELATRA
INSERT INTO public.articles (code, name, family, unit, article_type, brand, active)
VALUES 
('PF-ENC-001', 'Encaustique Tselatra PREMIUM 200cc-Acajou', 'SIPF004', 'pot', 'PF', 'TSELATRA', true),
('PF-ENC-002', 'Encaustique Tselatra PREMIUM 200cc-Neutre', 'SIPF004', 'pot', 'PF', 'TSELATRA', true),
('PF-ENC-003', 'Encaustique Tselatra PREMIUM 400cc-Jaune', 'SIPF004', 'pot', 'PF', 'TSELATRA', true),
('PF-ENC-004', 'Encaustique Tselatra PREMIUM 3000cc-Acajou', 'SIPF004', 'pot', 'PF', 'TSELATRA', true)
ON CONFLICT (code) DO NOTHING;

-- 7. Insertion des Matières Premières (MP)
INSERT INTO public.articles (code, name, family, unit, article_type, brand, active)
VALUES 
('MP-SOU-001', 'Soude Caustique Perle', 'MP', 'Kg', 'MP', 'GENERIC', true),
('MP-HUI-001', 'Huile de Palme Raffinée', 'MP', 'Kg', 'MP', 'GENERIC', true),
('MP-PAR-001', 'Parfum Citron Industriel', 'MP', 'Kg', 'MP', 'GENERIC', true),
('MP-BOB-001', 'Bobine Papier Ouate 17g', 'MP', 'Kg', 'MP', 'GENERIC', true)
ON CONFLICT (code) DO NOTHING;
