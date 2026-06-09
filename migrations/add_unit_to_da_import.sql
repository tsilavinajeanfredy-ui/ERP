-- ============================================================
-- Migration : Ajout de la colonne "unit" dans da_import
-- Erreur corrigée : "Could not find the 'unit' column of 'da_import'"
-- ============================================================
-- À exécuter dans Supabase → SQL Editor avant le déploiement.

-- 1. Ajouter la colonne avec une valeur par défaut
ALTER TABLE da_import
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'kg';

-- 2. Mettre à jour les lignes existantes avec 'kg' (déjà fait par DEFAULT)
-- UPDATE da_import SET unit = 'kg' WHERE unit IS NULL;

-- 3. Vérification
-- SELECT id, code, unit FROM da_import LIMIT 10;
