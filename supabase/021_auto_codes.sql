-- ============================================================================
-- Auto code generation for da_import, da_local, production_orders, bom_headers
-- Usage: SELECT get_next_code('IMP', 2026);  -> 'IMP-2026-0001'
-- ============================================================================

CREATE TABLE IF NOT EXISTS code_sequences (
  prefix text NOT NULL,
  year int NOT NULL,
  last_number int NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, year)
);

CREATE OR REPLACE FUNCTION get_next_code(p_prefix text, p_year int)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next int;
  v_code text;
BEGIN
  INSERT INTO code_sequences (prefix, year, last_number)
  VALUES (p_prefix, p_year, 1)
  ON CONFLICT (prefix, year)
  DO UPDATE SET last_number = code_sequences.last_number + 1
  RETURNING last_number INTO v_next;

  v_code := p_prefix || '-' || p_year::text || '-' || LPAD(v_next::text, 4, '0');
  RETURN v_code;
END;
$$;

-- ─── RLS policies for code_sequences ────────────────────────────────────────
ALTER TABLE code_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_all" ON code_sequences;
CREATE POLICY "auth_read_all" ON code_sequences FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_all" ON code_sequences;
CREATE POLICY "admin_all" ON code_sequences FOR ALL TO authenticated USING (public.get_role() = 'ADMIN');
