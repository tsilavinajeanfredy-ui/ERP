-- ==============================================================================
-- ERP GSI - MIGRATION 008 : RÉFÉRENTIEL PRODUITS FINIS (PF) - VOLUME 1
-- Réinitialisation et insertion des Savons, Détergents et Papiers
-- ==============================================================================

-- 1. Nettoyage radical (PF uniquement ou tout selon besoin, ici tout pour un reset propre)
TRUNCATE public.articles RESTART IDENTITY CASCADE;

-- 2. SAVONS IRIKO (SIPF003)
INSERT INTO public.articles (code, name, family, unit, article_type, brand, active)
VALUES 
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
('PF-SAV-040', 'Savon IRIKO Z27 MR crt-36', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-041', 'Savon IRIKO I27 MR crt-36', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-045', 'Savon IRIKO-B Andramena C36', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-049', 'Savon IRIKO-XG Tantely C24', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true)
ON CONFLICT (code) DO NOTHING;

-- 3. DÉTERGENTS IRIKO (SINE003)
INSERT INTO public.articles (code, name, family, unit, article_type, brand, active)
VALUES 
('PF-DET-001', 'Détergent poudre IRIKO 25g S150-Floral', 'SINE003', 'Sachet', 'PF', 'IRIKO', true),
('PF-DET-002', 'Détergent poudre IRIKO 25g S150-Jasmin', 'SINE003', 'Sachet', 'PF', 'IRIKO', true),
('PF-DET-003', 'Détergent poudre IRIKO 25g S150-Lavande', 'SINE003', 'Sachet', 'PF', 'IRIKO', true),
('PF-DET-004', 'Détergent poudre IRIKO 25g S150-Original', 'SINE003', 'Sachet', 'PF', 'IRIKO', true),
('PF-DET-005', 'Détergent poudre IRIKO 25g S150-Citron vert', 'SINE003', 'Sachet', 'PF', 'IRIKO', true)
ON CONFLICT (code) DO NOTHING;

-- 4. BOUGIES MARONJANA (SIPF001)
INSERT INTO public.articles (code, name, family, unit, article_type, brand, active)
VALUES 
('PF-BOU-001', 'Bougie Maronjana Lehibe C40 P6', 'SIPF001', 'paqt 6', 'PF', 'MARONJANA', true),
('PF-BOU-002', 'Bougie MARONJANA C40 P6', 'SIPF001', 'paqt 6', 'PF', 'MARONJANA', true),
('PF-BOU-003', 'Bougie CB Maronjana lehibe C40 P6', 'SIPF001', 'paqt 6', 'PF', 'MARONJANA', true),
('PF-BOU-004', 'Bougie Maronjana PM C40 P6', 'SIPF001', 'paqt 6', 'PF', 'MARONJANA', true),
('PF-BOU-005', 'Bougie Maronjana XG', 'SIPF001', 'PCE', 'PF', 'MARONJANA', true)
ON CONFLICT (code) DO NOTHING;

-- 5. PAPIERS HYGIÉNIQUES LYS & DOUCY (SIPF009)
INSERT INTO public.articles (code, name, family, unit, article_type, brand, active)
VALUES 
('PF-PH-001', 'Papier hygiénique LYS CLASSIC', 'SIPF009', 'rlx', 'PF', 'LYS', true),
('PF-PH-002', 'PH 2eme choix LYS CLASSIC', 'SIPF009', 'rlx', 'PF', 'LYS', true),
('PF-PH-003', 'PH DOUCY CONFORT P06 S48 CB', 'SIPF009', 'rlx', 'PF', 'DOUCY', true),
('PF-PH-004', 'Papier hygiénique DOUCY P06 S48TRP', 'SIPF009', 'rlx', 'PF', 'DOUCY', true),
('PF-PH-010', 'PH 2eme choix DOUCY CONFORT P06 S48 CB', 'SIPF009', 'rlx', 'PF', 'DOUCY', true),
('PF-PH-013', 'PH 2eme choix DOUCY Classique', 'SIPF009', 'rlx', 'PF', 'DOUCY', true)
ON CONFLICT (code) DO NOTHING;
