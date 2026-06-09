-- ============================================================================
-- ERP GSI — SCHEMA COMPLET (Supabase / PostgreSQL 16)
-- Migration 001 — Toutes les tables du socle + modules
-- ============================================================================

-- ─── ENUMS ──────────────────────────────────────────────────────────────────
-- ─── ENUMS ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'article_type') THEN
    CREATE TYPE article_type AS ENUM ('MP', 'SF', 'PF', 'EMB');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cqlib_status') THEN
    CREATE TYPE cqlib_status AS ENUM ('QUARANTAINE', 'LIBERE', 'BLOQUE', 'DETERIORE', 'DEROGATION');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fcq_status') THEN
    CREATE TYPE fcq_status AS ENUM ('EN_ATTENTE', 'EN_COURS', 'COMPLET', 'VALIDE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fnc_severity') THEN
    CREATE TYPE fnc_severity AS ENUM ('MINEURE', 'MAJEURE', 'CRITIQUE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fnc_status') THEN
    CREATE TYPE fnc_status AS ENUM ('OUVERTE', 'EN_COURS', 'CLOTUREE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'da_import_step') THEN
    CREATE TYPE da_import_step AS ENUM ('DA_VALIDEE', 'PROFORMA', 'LC_VIREMENT', 'EXPEDITION', 'CONNAISSEMENT', 'DEDOUANEMENT', 'ETA', 'RECEPTION');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'da_local_step') THEN
    CREATE TYPE da_local_step AS ENUM ('SAISIE', 'VALIDATION', 'COMMANDE', 'RECEPTION');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'da_status') THEN
    CREATE TYPE da_status AS ENUM ('EN_COURS', 'RETARD', 'LIVRE', 'CLOS', 'ANNULE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'instrument_status') THEN
    CREATE TYPE instrument_status AS ENUM ('ETALONNE', 'A_ETALONNER', 'ECHU', 'EN_ATTENTE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_status') THEN
    CREATE TYPE inventory_status AS ENUM ('EN_PREPARATION', 'EN_COURS', 'TERMINE', 'VALIDE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('DPI', 'RQ', 'TLAB', 'RPROD', 'MAGA', 'RACH', 'PLAN', 'ADMIN', 'COMPTA');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bom_status') THEN
    CREATE TYPE bom_status AS ENUM ('BROUILLON', 'VALIDE', 'ARCHIVE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'movement_type') THEN
    CREATE TYPE movement_type AS ENUM ('ENTREE', 'SORTIE', 'TRANSFERT', 'AJUSTEMENT');
  END IF;
END $$;

-- ─── 1. UTILISATEURS & RBAC ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id uuid UNIQUE,               -- lien vers auth.users Supabase
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  role user_role NOT NULL DEFAULT 'MAGA',
  site text DEFAULT 'Antananarivo',
  scope text,                         -- ex: "SAV, PAP, BOU" pour technicien labo
  avatar_url text,
  active boolean NOT NULL DEFAULT true,
  two_fa_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger pour synchroniser auth.users avec public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (auth_id, email, full_name, role)
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    COALESCE((new.raw_user_meta_data->>'role')::user_role, 'MAGA')
  )
  ON CONFLICT (email) DO UPDATE SET 
    auth_id = EXCLUDED.auth_id,
    full_name = COALESCE(EXCLUDED.full_name, public.users.full_name);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Fonction helper pour RLS
CREATE OR REPLACE FUNCTION public.get_role()
RETURNS user_role AS $$
  SELECT role FROM public.users WHERE auth_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- ─── 2. SITES & DÉPÔTS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  city text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS depots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  site_id uuid NOT NULL REFERENCES sites(id),
  depot_type article_type,            -- MP, PF, EMB, ou NULL pour mixte
  is_deteriore boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 3. FOURNISSEURS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  country text,
  currency text DEFAULT 'MGA',        -- USD, EUR, MGA
  lead_time_days int,
  contact_name text,
  contact_email text,
  contact_phone text,
  rating numeric(3,2),                -- 0.00 à 5.00
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 4. ARTICLES (MP / SF / PF / EMB) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  name_en text,
  article_type article_type NOT NULL,
  family text,                        -- ex: "Hygiène corps"
  brand text,
  universe text,                      -- ex: "Hygiène", "Entretien"
  unit text NOT NULL DEFAULT 'kg',
  spec_ref text,                      -- ex: "SP-SAV-V2"
  fcq_ref text,                       -- ex: "FCQ-SAV"
  bp_ref text,                        -- ex: "ANN-BP-SAV"
  default_supplier_id uuid REFERENCES suppliers(id),
  default_depot_id uuid REFERENCES depots(id),
  safety_stock numeric(14,4) DEFAULT 0,
  reorder_point numeric(14,4) DEFAULT 0,
  cqlib_exempt boolean NOT NULL DEFAULT false,  -- ex: retour bougie
  exemption_reason text,
  sage_code text,                     -- code SAGE correspondant
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 5. INSTRUMENTS LABO ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS instruments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,          -- ex: "PHM-01"
  name text NOT NULL,
  procedure_ref text,                 -- ex: "ETA-PHM"
  frequency text,                     -- ex: "Mensuel"
  standard_required text,
  standard_status text,
  status instrument_status NOT NULL DEFAULT 'A_ETALONNER',
  last_calibration_at timestamptz,
  next_calibration_at timestamptz,
  owner_id uuid REFERENCES users(id),
  impact_if_nc text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 6. TAUX DE CHANGE (historisés) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency text NOT NULL,
  to_currency text NOT NULL DEFAULT 'MGA',
  rate numeric(14,4) NOT NULL,
  effective_date date NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(from_currency, to_currency, effective_date)
);

-- ─── 7. BONS D'ENTRÉE & LOTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bons_entree (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,          -- ex: "BE-2026-0421-003"
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  site_id uuid REFERENCES sites(id),
  reception_date date NOT NULL DEFAULT CURRENT_DATE,
  received_by uuid REFERENCES users(id),
  bl_number text,                     -- numéro bon de livraison fournisseur
  coa_received boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,          -- ex: "L-2026-0421-006"
  bon_entree_id uuid REFERENCES bons_entree(id),
  article_id uuid NOT NULL REFERENCES articles(id),
  supplier_id uuid REFERENCES suppliers(id),
  depot_id uuid REFERENCES depots(id),
  qty_received numeric(14,4) NOT NULL,
  qty_current numeric(14,4) NOT NULL,
  unit text NOT NULL DEFAULT 'kg',
  cqlib_status cqlib_status NOT NULL DEFAULT 'QUARANTAINE',
  cqlib_decided_by uuid REFERENCES users(id),
  cqlib_decided_at timestamptz,
  origin text,                        -- ex: "Importé – Malaisie"
  batch_supplier text,                -- lot fournisseur
  reception_date date NOT NULL DEFAULT CURRENT_DATE,
  expiry_date date,
  sage_synced boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 8. DOSSIERS FCQ (Fiche Contrôle Qualité) ──────────────────────────────
CREATE TABLE IF NOT EXISTS fcq_dossiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,          -- ex: "FCQ-2026-0045"
  lot_id uuid NOT NULL REFERENCES lots(id),
  fcq_type text NOT NULL,             -- ex: "FCQ-MP", "FCQ-SAV"
  status fcq_status NOT NULL DEFAULT 'EN_ATTENTE',
  decision cqlib_status,
  analyst_id uuid REFERENCES users(id),
  validator_id uuid REFERENCES users(id),  -- RQ qui valide
  instrument_id uuid REFERENCES instruments(id),
  instrument_ok boolean,
  analyst_signed_at timestamptz,
  validator_signed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fcq_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fcq_id uuid NOT NULL REFERENCES fcq_dossiers(id) ON DELETE CASCADE,
  param_name text NOT NULL,
  unit text,
  target_value text,
  tol_min numeric(14,4),
  tol_max numeric(14,4),
  measured_value text,
  measured_numeric numeric(14,4),
  is_conform boolean,
  status_if_nc text,                  -- "BLOQUÉ" ou "Alerte RQ"
  instrument_id uuid REFERENCES instruments(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 9. FICHES DE NON-CONFORMITÉ (FNC) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS fnc (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,          -- ex: "FNC-2026-031"
  lot_id uuid REFERENCES lots(id),
  fcq_id uuid REFERENCES fcq_dossiers(id),
  severity fnc_severity NOT NULL DEFAULT 'MINEURE',
  status fnc_status NOT NULL DEFAULT 'OUVERTE',
  description text NOT NULL,
  root_cause text,
  corrective_action text,
  opened_by uuid REFERENCES users(id),
  closed_by uuid REFERENCES users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 10. MOUVEMENTS DE STOCK ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES lots(id),
  article_id uuid NOT NULL REFERENCES articles(id),
  depot_from_id uuid REFERENCES depots(id),
  depot_to_id uuid REFERENCES depots(id),
  movement_type movement_type NOT NULL,
  qty numeric(14,4) NOT NULL,
  unit text NOT NULL DEFAULT 'kg',
  reference_doc text,                 -- ex: "BP-2026-042", "DA-IMP-2026-0019"
  performed_by uuid REFERENCES users(id),
  sage_synced boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 11. ACHATS IMPORT ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS da_import (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,          -- ex: "DA-IMP-2026-0019"
  article_id uuid NOT NULL REFERENCES articles(id),
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  qty_container text,                 -- ex: "1 CT 20'"
  qty_kg numeric(14,4) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  amount_currency numeric(14,4) NOT NULL,
  amount_mga numeric(14,4),
  exchange_rate_id uuid REFERENCES exchange_rates(id),
  current_step da_import_step NOT NULL DEFAULT 'DA_VALIDEE',
  status da_status NOT NULL DEFAULT 'EN_COURS',
  eta_date date,
  lead_time_days int,
  requested_by uuid REFERENCES users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS da_import_steps_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  da_import_id uuid NOT NULL REFERENCES da_import(id) ON DELETE CASCADE,
  step da_import_step NOT NULL,
  validated_by uuid REFERENCES users(id),
  validated_at timestamptz NOT NULL DEFAULT now(),
  document_url text,
  notes text
);

-- ─── 12. ACHATS LOCAL ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS da_local (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,          -- ex: "DA-LOC-2026-0048"
  article_id uuid NOT NULL REFERENCES articles(id),
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  qty numeric(14,4) NOT NULL,
  unit text NOT NULL DEFAULT 'kg',
  amount_mga numeric(14,4) NOT NULL,
  current_step da_local_step NOT NULL DEFAULT 'SAISIE',
  status da_status NOT NULL DEFAULT 'EN_COURS',
  requested_by uuid REFERENCES users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS da_local_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  da_local_id uuid NOT NULL REFERENCES da_local(id) ON DELETE CASCADE,
  delivery_date date NOT NULL,
  qty_delivered numeric(14,4) NOT NULL,
  unit text NOT NULL DEFAULT 'kg',
  ecart_pct numeric(6,2),
  comment text,                       -- obligatoire si écart > 5%
  received_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 13. BOM (NOMENCLATURES) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bom_headers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  version int NOT NULL DEFAULT 1,
  product_id uuid NOT NULL REFERENCES articles(id),  -- PF ou SF
  status bom_status NOT NULL DEFAULT 'BROUILLON',
  batch_size_kg numeric(14,4),
  line_name text,                     -- ex: "Savonnerie"
  validated_by uuid REFERENCES users(id),
  validated_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(code, version)
);

CREATE TABLE IF NOT EXISTS bom_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_header_id uuid NOT NULL REFERENCES bom_headers(id) ON DELETE CASCADE,
  component_id uuid NOT NULL REFERENCES articles(id),  -- MP ou SF
  qty numeric(14,4) NOT NULL,
  unit text NOT NULL DEFAULT 'kg',
  pct numeric(6,2),                   -- pourcentage dans la formule
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 14. PRODUCTION ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,          -- ex: "BP-2026-0412"
  bom_header_id uuid NOT NULL REFERENCES bom_headers(id),
  product_id uuid NOT NULL REFERENCES articles(id),
  qty_planned numeric(14,4) NOT NULL,
  qty_produced numeric(14,4),
  status text NOT NULL DEFAULT 'PLANIFIE',
  planned_date date,
  started_at timestamptz,
  completed_at timestamptz,
  produced_by uuid REFERENCES users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 15. INVENTAIRE ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,          -- ex: "INV-2026-Q2"
  label text NOT NULL,
  period text,
  zones int NOT NULL DEFAULT 1,
  status inventory_status NOT NULL DEFAULT 'EN_PREPARATION',
  started_at timestamptz,
  completed_at timestamptz,
  validated_by uuid REFERENCES users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES inventory_campaigns(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES articles(id),
  depot_id uuid NOT NULL REFERENCES depots(id),
  stock_theorique numeric(14,4) NOT NULL,
  stock_physique numeric(14,4),
  ecart numeric(14,4),
  ecart_pct numeric(6,2),
  is_major boolean NOT NULL DEFAULT false,  -- > 2%
  counted_by uuid REFERENCES users(id),
  counted_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 16. SPECIFICATIONS QUALITÉ ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qc_specifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,          -- ex: "SP-SAV-V2"
  article_code text NOT NULL,         -- ex: "SAV"
  header text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qc_spec_params (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_id uuid NOT NULL REFERENCES qc_specifications(id) ON DELETE CASCADE,
  param_name text NOT NULL,
  unit text,
  method text,
  target_value text,
  tol_min text,
  tol_max text,
  frequency text,
  instrument text,
  decision text,
  remarks text,
  status_if_nc text,
  stock_action text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 17. ÉTALONNAGE LOG ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calibration_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id uuid NOT NULL REFERENCES instruments(id),
  calibrated_by uuid REFERENCES users(id),
  calibration_date date NOT NULL,
  next_due_date date NOT NULL,
  standard_used text,
  standard_type text,                 -- "CERTIFIÉ" ou "INTERNE"
  standard_lot text,
  result text,                        -- "CONFORME" / "NON CONFORME"
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 18. AUDIT TRAIL ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL,               -- INSERT, UPDATE, DELETE
  user_id uuid REFERENCES users(id),
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── FCQ & Lot Status Sync ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_lot_cqlib_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'VALIDE' AND NEW.decision IS NOT NULL THEN
    UPDATE public.lots
    SET cqlib_status = NEW.decision
    WHERE id = NEW.lot_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_sync_lot_cqlib_status ON public.fcq_dossiers;
CREATE TRIGGER tr_sync_lot_cqlib_status
AFTER UPDATE ON public.fcq_dossiers
FOR EACH ROW
EXECUTE FUNCTION public.sync_lot_cqlib_status();

-- ─── INDEXES ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lots_cqlib ON lots(cqlib_status);
CREATE INDEX IF NOT EXISTS idx_lots_article ON lots(article_id);
CREATE INDEX IF NOT EXISTS idx_lots_depot ON lots(depot_id);
CREATE INDEX IF NOT EXISTS idx_lots_date ON lots(reception_date DESC);
CREATE INDEX IF NOT EXISTS idx_fcq_lot ON fcq_dossiers(lot_id);
CREATE INDEX IF NOT EXISTS idx_fcq_status ON fcq_dossiers(status);
CREATE INDEX IF NOT EXISTS idx_fnc_lot ON fnc(lot_id);
CREATE INDEX IF NOT EXISTS idx_stock_mov_lot ON stock_movements(lot_id);
CREATE INDEX IF NOT EXISTS idx_stock_mov_article ON stock_movements(article_id);
CREATE INDEX IF NOT EXISTS idx_stock_mov_date ON stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_da_import_status ON da_import(status);
CREATE INDEX IF NOT EXISTS idx_da_local_status ON da_local(status);
CREATE INDEX IF NOT EXISTS idx_bom_product ON bom_headers(product_id);
CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_instruments_status ON instruments(status);
CREATE INDEX IF NOT EXISTS idx_instruments_next_cal ON instruments(next_calibration_at);

-- ─── RLS (Row Level Security) ───────────────────────────────────────────────
-- Activer RLS sur toutes les tables (policies à définir selon rôles)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE depots ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE bons_entree ENABLE ROW LEVEL SECURITY;
ALTER TABLE lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE fcq_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fcq_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnc ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE da_import ENABLE ROW LEVEL SECURITY;
ALTER TABLE da_import_steps_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE da_local ENABLE ROW LEVEL SECURITY;
ALTER TABLE da_local_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE qc_specifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE qc_spec_params ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Policies globales AUTHENTICATED (Lecture seule pour tous les utilisateurs GSI)
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "anon_read_all" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "anon_write_all" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "anon_update_all" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "auth_read_all" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "admin_all" ON %I', t);
        
        EXECUTE format('CREATE POLICY "auth_read_all" ON %I FOR SELECT TO authenticated USING (true)', t);
        EXECUTE format('CREATE POLICY "admin_all" ON %I FOR ALL TO authenticated USING (public.get_role() = ''ADMIN'')', t);
    END LOOP;
END $$;

-- Policies spécifiques par Rôle (Write/Update)
-- MAGA (Magasinier) : Entrées et Stock
DROP POLICY IF EXISTS "maga_write" ON lots;
CREATE POLICY "maga_write" ON lots FOR INSERT TO authenticated WITH CHECK (public.get_role() = 'MAGA');
DROP POLICY IF EXISTS "maga_write" ON bons_entree;
CREATE POLICY "maga_write" ON bons_entree FOR INSERT TO authenticated WITH CHECK (public.get_role() = 'MAGA');
DROP POLICY IF EXISTS "maga_write" ON stock_movements;
CREATE POLICY "maga_write" ON stock_movements FOR INSERT TO authenticated WITH CHECK (public.get_role() = 'MAGA');

-- TLAB (Technicien Labo) : Saisie FCQ
DROP POLICY IF EXISTS "tlab_write" ON fcq_results;
CREATE POLICY "tlab_write" ON fcq_results FOR INSERT TO authenticated WITH CHECK (public.get_role() = 'TLAB');
DROP POLICY IF EXISTS "tlab_update" ON fcq_dossiers;
CREATE POLICY "tlab_update" ON fcq_dossiers FOR UPDATE TO authenticated USING (public.get_role() = 'TLAB') WITH CHECK (true);

-- RQ (Responsable Qualité) : Décision CQ-LIB et FNC
DROP POLICY IF EXISTS "rq_write" ON fnc;
CREATE POLICY "rq_write" ON fnc FOR INSERT TO authenticated WITH CHECK (public.get_role() = 'RQ');
DROP POLICY IF EXISTS "rq_update" ON fnc;
CREATE POLICY "rq_update" ON fnc FOR UPDATE TO authenticated USING (public.get_role() = 'RQ') WITH CHECK (true);
DROP POLICY IF EXISTS "rq_decision" ON fcq_dossiers;
CREATE POLICY "rq_decision" ON fcq_dossiers FOR UPDATE TO authenticated USING (public.get_role() = 'RQ') WITH CHECK (true);

-- RACH (Responsable Achats) : DA Import et Local
DROP POLICY IF EXISTS "rach_all" ON da_import;
CREATE POLICY "rach_all" ON da_import FOR ALL TO authenticated USING (public.get_role() = 'RACH');
DROP POLICY IF EXISTS "rach_all" ON da_local;
CREATE POLICY "rach_all" ON da_local FOR ALL TO authenticated USING (public.get_role() = 'RACH');

-- DPI (Directeur Production) : Validation Production
DROP POLICY IF EXISTS "dpi_update" ON production_orders;
CREATE POLICY "dpi_update" ON production_orders FOR UPDATE TO authenticated USING (public.get_role() = 'DPI') WITH CHECK (true);

-- ─── STORAGE CONFIGURATION ──────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('photos', 'photos', true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true);
