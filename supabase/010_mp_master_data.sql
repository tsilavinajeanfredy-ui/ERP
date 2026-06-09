-- ==============================================================================
-- ERP GSI - MIGRATION 010 : RÉFÉRENTIEL MATIÈRES PREMIÈRES (MP)
-- Insertion des matières critiques pour les nomenclatures (BOM)
-- ==============================================================================

-- 1. CHIMIE & MATIÈRES DE BASE
INSERT INTO public.articles (code, name, family, unit, article_type, brand, active)
VALUES 
('MP-SOU-001', 'Soude Caustique Perle', 'MP_CHIM', 'Kg', 'MP', 'GENERIC', true),
('MP-HUI-001', 'Huile de Palme Raffinée', 'MP_HUILE', 'Kg', 'MP', 'GENERIC', true),
('MP-HUI-002', 'Huile de Coco', 'MP_HUILE', 'Kg', 'MP', 'GENERIC', true),
('MP-SIL-001', 'Silicate de Soude', 'MP_CHIM', 'Kg', 'MP', 'GENERIC', true),
('MP-SEL-001', 'Sel Industriel', 'MP_CHIM', 'Kg', 'MP', 'GENERIC', true),
('MP-TAL-001', 'Talc Industriel', 'MP_CHIM', 'Kg', 'MP', 'GENERIC', true)
ON CONFLICT (code) DO NOTHING;

-- 2. PARFUMS & COLORANTS
INSERT INTO public.articles (code, name, family, unit, article_type, brand, active)
VALUES 
('MP-PAR-001', 'Parfum Citron Industriel', 'MP_PARF', 'Kg', 'MP', 'GENERIC', true),
('MP-PAR-002', 'Parfum Floral', 'MP_PARF', 'Kg', 'MP', 'GENERIC', true),
('MP-PAR-003', 'Parfum Jasmin', 'MP_PARF', 'Kg', 'MP', 'GENERIC', true),
('MP-COL-001', 'Colorant Rouge', 'MP_COL', 'Kg', 'MP', 'GENERIC', true),
('MP-COL-002', 'Colorant Jaune', 'MP_COL', 'Kg', 'MP', 'GENERIC', true)
ON CONFLICT (code) DO NOTHING;

-- 3. EMBALLAGES & DIVERS
INSERT INTO public.articles (code, name, family, unit, article_type, brand, active)
VALUES 
('MP-BOB-001', 'Bobine Papier Ouate 17g', 'MP_EMB', 'Kg', 'MP', 'GENERIC', true),
('MP-CRT-001', 'Carton Vide Standard c24', 'MP_EMB', 'PCE', 'MP', 'GENERIC', true),
('MP-SAC-001', 'Sac Détergent 25g Vide', 'MP_EMB', 'PCE', 'MP', 'GENERIC', true),
('MP-GRN-001', 'Granulé Nylon PE', 'MP_PLAST', 'Kg', 'MP', 'GENERIC', true)
ON CONFLICT (code) DO NOTHING;

-- NOTE: Cette liste permet de créer les premières Nomenclatures (BOM) fonctionnelles.
