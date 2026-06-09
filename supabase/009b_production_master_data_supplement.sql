-- ==============================================================================
-- ERP GSI - MIGRATION 009 : RÉFÉRENTIEL PRODUITS FINIS (PF) - VOLUME 2 (SUITE)
-- Complément pour atteindre le volume réel de 168+ items.
-- ==============================================================================

-- 1. CORDES NYLON - Tailles intermédiaires et variantes
INSERT INTO public.articles (code, name, family, unit, article_type, brand, active)
VALUES 
('PF-COR-03W', 'Corde nylon de 03mm * 100 Yard-Blanc', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-03B', 'Corde nylon de 03mm * 100 Yard-Bleu', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-04O', 'Corde nylon de 04mm * 100 Yard-Orange', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-06W', 'Corde nylon de 06mm * 100 Yard-Blanc', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-08G', 'Corde nylon de 08mm * 100 Yard-Vert', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-12G', 'Corde nylon de 12mm * 100 Yard-Vert', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-14B', 'Corde nylon de 14mm * 100 Yard-Bleu', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-16G', 'Corde nylon de 16mm * 100 Yard-Vert', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-18B', 'Corde nylon de 18mm * 100 Yard-Bleu', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-22G', 'Corde nylon de 22mm * 100 Yard-Vert', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-25B', 'Corde nylon de 25mm * 100 Yard-Bleu', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-35G', 'Corde nylon de 35mm * 100 Yard-Vert', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-45B', 'Corde nylon de 45mm * 100 Yard-Bleu', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-60G', 'Corde nylon de 60mm * 100 Yard-Vert', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-SM2', 'Corde nylon 2mm SM 3T -Bleu', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-SM4', 'Corde nylon 4mm SM 3T -Bleu', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true)
ON CONFLICT (code) DO NOTHING;

-- 2. SAVONS IRIKO - Variantes supplémentaires
INSERT INTO public.articles (code, name, family, unit, article_type, brand, active)
VALUES 
('PF-SAV-040', 'Savon IRIKO Z27 MR crt-36', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-041', 'Savon IRIKO I27 MR crt-36', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-042', 'Savon IRIKO I30 MR crt-36', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-043', 'Savon IRIKO MR Clair Z27 crt-36', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-044', 'Savon IRIKO MR Clair I27 crt-36', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-045', 'Savon IRIKO-B Andramena C36', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-046', 'Savon IRIKO-B Menakely  C36', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-047', 'Savon IRIKO-B Nanto C36', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-048', 'Savon IRIKO-B Fotsy C36', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true),
('PF-SAV-049', 'Savon IRIKO-XG Tantely C24', 'SIPF003', 'mrcx', 'PF', 'IRIKO', true)
ON CONFLICT (code) DO NOTHING;

-- 3. PAPIERS HYGIÉNIQUES - Compléments
INSERT INTO public.articles (code, name, family, unit, article_type, brand, active)
VALUES 
('PF-PH-010', 'PH 2eme choix DOUCY CONFORT P06 S48 CB', 'SIPF009', 'rlx', 'PF', 'DOUCY', true),
('PF-PH-011', 'Papier hygiénique Doucy P06 S48 TRPI CB', 'SIPF009', 'rlx', 'PF', 'DOUCY', true),
('PF-PH-012', 'Papier hygiénique DOUCY ECO P12 S48 CB', 'SIPF009', 'rlx', 'PF', 'DOUCY', true),
('PF-PH-013', 'PH 2eme choix DOUCY Classique', 'SIPF009', 'rlx', 'PF', 'DOUCY', true)
ON CONFLICT (code) DO NOTHING;
