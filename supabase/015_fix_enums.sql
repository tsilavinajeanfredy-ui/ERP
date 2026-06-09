-- ============================================================================
-- ERP GSI — Fixes des enums et colonnes manquantes
-- ============================================================================

-- ─── Ajout de A_VALIDER à fnc_status ────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fnc_status') THEN
    ALTER TYPE fnc_status ADD VALUE IF NOT EXISTS 'A_VALIDER';
  END IF;
END $$;

-- ─── Ajout de SUPERVISEUR au role user_role (nécessaire pour CCTP) ──────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'SUPERVISEUR';
  END IF;
END $$;

-- ─── Colonne sage_synced_at manquante sur lots, stock_movements ─────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lots' AND column_name = 'sage_synced_at') THEN
    ALTER TABLE lots ADD COLUMN sage_synced_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_movements' AND column_name = 'sage_synced_at') THEN
    ALTER TABLE stock_movements ADD COLUMN sage_synced_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'da_import' AND column_name = 'sage_synced') THEN
    ALTER TABLE da_import ADD COLUMN sage_synced boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'da_local' AND column_name = 'sage_synced') THEN
    ALTER TABLE da_local ADD COLUMN sage_synced boolean NOT NULL DEFAULT false;
  END IF;
END $$;
