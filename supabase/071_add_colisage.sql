-- 071_add_colisage.sql
-- Ajout de la colonne colisage pour automatiser le What-If

ALTER TABLE articles ADD COLUMN IF NOT EXISTS colisage INTEGER DEFAULT 1;

-- Cordes (1 par défaut selon la liste)
UPDATE articles SET colisage = 1 WHERE code LIKE 'PF-COR-%';

-- Bougies
UPDATE articles SET colisage = 40 WHERE code IN ('PF-BOU-003', 'PF-BOU-002', 'PF-BOU-001', 'PF-BOU-004');
UPDATE articles SET colisage = 1 WHERE code = 'PF-BOU-005';

-- Détergents S150
UPDATE articles SET colisage = 150 WHERE code LIKE 'PF-DET-%-090619';

-- Papier Hygiénique (DOUCY / LYS) S48, S6, S60
UPDATE articles SET colisage = 48 WHERE code IN (
  'PF-PH-004', 'PF-PH-020', 'PF-PH-023', 'PF-PH-017', 'PF-PH-012', 'PF-PH-022',
  'PF-PH-015', 'PF-PH-011', 'PF-PH-014', 'PF-PH-013', 'PF-PH-010', 'PF-PH-002',
  'PF-PH-006', 'PF-PH-016', 'PF-PH-003'
);
UPDATE articles SET colisage = 60 WHERE code IN ('PF-PH-024');
UPDATE articles SET colisage = 6 WHERE code IN ('PF-PH-021');

-- Encaustiques
UPDATE articles SET colisage = 36 WHERE code IN ('PF-ENC-001', 'PF-ENC-007', 'PF-ENC-002', 'PF-ENC-005');
UPDATE articles SET colisage = 24 WHERE code IN ('PF-ENC-009', 'PF-ENC-003', 'PF-ENC-008');
UPDATE articles SET colisage = 4 WHERE code IN ('PF-ENC-004', 'PF-ENC-011', 'PF-ENC-006', 'PF-ENC-010');

-- Savons
UPDATE articles SET colisage = 12 WHERE code IN ('PF-SAV-005', 'PF-SAV-007', 'PF-SAV-008', 'PF-SAV-006');
UPDATE articles SET colisage = 24 WHERE code IN (
  'PF-SAV-054', 'PF-SAV-055', 'PF-SAV-002', 'PF-SAV-003', 'PF-SAV-013', 'PF-SAV-012', 
  'PF-SAV-014', 'PF-SAV-017', 'PF-SAV-015', 'PF-SAV-016', 'PF-SAV-018', 'PF-SAV-051',
  'PF-SAV-050', 'PF-SAV-019', 'PF-SAV-020', 'PF-SAV-052', 'PF-SAV-056', 'PF-SAV-021',
  'PF-SAV-022', 'PF-SAV-053', 'PF-SAV-049'
);
UPDATE articles SET colisage = 36 WHERE code IN (
  'PF-SAV-001', 'PF-SAV-041', 'PF-SAV-042', 'PF-SAV-044', 'PF-SAV-043', 'PF-SAV-040',
  'PF-SAV-045', 'PF-SAV-048', 'PF-SAV-046', 'PF-SAV-047'
);
UPDATE articles SET colisage = 9 WHERE code = 'PF-SAV-004';
UPDATE articles SET colisage = 100 WHERE code = 'PF-SAV-057';
