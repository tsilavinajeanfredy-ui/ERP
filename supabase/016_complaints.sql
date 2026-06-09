-- ============================================================================
-- ERP GSI — Module Réclamations Clients (Phase 6)
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'complaint_status') THEN
    CREATE TYPE complaint_status AS ENUM ('OUVERTE', 'EN_ANALYSE', 'TRAITEE', 'CLOTUREE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'complaint_origin') THEN
    CREATE TYPE complaint_origin AS ENUM ('CLIENT', 'INTERNE', 'TRANSPORTEUR', 'AUTRE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'complaint_severity') THEN
    CREATE TYPE complaint_severity AS ENUM ('MINEURE', 'MAJEURE', 'CRITIQUE');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  client_name text NOT NULL,
  client_ref text,
  origin complaint_origin NOT NULL DEFAULT 'CLIENT',
  severity complaint_severity NOT NULL DEFAULT 'MAJEURE',
  status complaint_status NOT NULL DEFAULT 'OUVERTE',
  lot_id uuid REFERENCES lots(id),
  article_id uuid REFERENCES articles(id),
  description text NOT NULL,
  qty_concerned numeric(14,4),
  return_qty numeric(14,4),
  return_value numeric(14,4),
  root_cause text,
  corrective_action text,
  preventive_action text,
  compensation text,
  fnc_id uuid REFERENCES fnc(id),
  opened_by uuid REFERENCES users(id),
  closed_by uuid REFERENCES users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_client ON complaints(client_name);

ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read_all" ON complaints;
CREATE POLICY "auth_read_all" ON complaints FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin_all" ON complaints;
CREATE POLICY "admin_all" ON complaints FOR ALL TO authenticated USING (public.get_role() IN ('ADMIN', 'RQ', 'DPI'));

-- RQ and ADMIN can create and update complaints
DROP POLICY IF EXISTS "rq_write" ON complaints;
CREATE POLICY "rq_write" ON complaints FOR INSERT TO authenticated WITH CHECK (public.get_role() IN ('RQ', 'ADMIN'));
DROP POLICY IF EXISTS "rq_update" ON complaints;
CREATE POLICY "rq_update" ON complaints FOR UPDATE TO authenticated USING (public.get_role() IN ('RQ', 'ADMIN')) WITH CHECK (true);
