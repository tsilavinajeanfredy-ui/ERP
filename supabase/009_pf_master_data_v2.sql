-- ==============================================================================
-- ERP GSI - MIGRATION 009 : RÉFÉRENTIEL PRODUITS FINIS (PF) - VOLUME 2
-- Complément pour les Cordes et Encaustiques
-- ==============================================================================

-- 1. CORDES NYLON (SIPF002)
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
('PF-COR-009', 'Corde 12mm x 500 Yard', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-010', 'Corde nylon de 03mm * 100 Yard-Bleu', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-011', 'Corde nylon de 08mm * 100 Yard-Vert', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-SM2', 'Corde nylon 2mm SM 3T -Bleu', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true),
('PF-COR-SM4', 'Corde nylon 4mm SM 3T -Bleu', 'SIPF002', 'Rlx', 'PF', 'SIPROMAD', true)
ON CONFLICT (code) DO NOTHING;

-- 2. ENCAUSTIQUES TSELATRA (SIPF004)
INSERT INTO public.articles (code, name, family, unit, article_type, brand, active)
VALUES 
('PF-ENC-001', 'Encaustique Tselatra PREMIUM 200cc-Acajou', 'SIPF004', 'pot', 'PF', 'TSELATRA', true),
('PF-ENC-002', 'Encaustique Tselatra PREMIUM 200cc-Neutre', 'SIPF004', 'pot', 'PF', 'TSELATRA', true),
('PF-ENC-003', 'Encaustique Tselatra PREMIUM 400cc-Jaune', 'SIPF004', 'pot', 'PF', 'TSELATRA', true),
('PF-ENC-004', 'Encaustique Tselatra PREMIUM 3000cc-Acajou', 'SIPF004', 'pot', 'PF', 'TSELATRA', true),
('PF-ENC-005', 'Encaustique Tselatra PREMIUM 200cc-Special ciment', 'SIPF004', 'pot', 'PF', 'TSELATRA', true),
('PF-ENC-006', 'Encaustique Tselatra PREMIUM 3000cc-Neutre', 'SIPF004', 'pot', 'PF', 'TSELATRA', true)
ON CONFLICT (code) DO NOTHING;
