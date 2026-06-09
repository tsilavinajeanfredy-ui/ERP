-- Migration 004: Fix qc_specifications table for laboratory module
-- Correction pour les rôles GSI ERP (RQ, ADMIN, SUPER_ADMIN)
-- Alignement avec les types applicatifs (parameter_name, spec_ref, active)

-- Drop existing table if it has issues
DROP TABLE IF EXISTS public.qc_specifications CASCADE;

-- Create qc_specifications table with proper structure
CREATE TABLE public.qc_specifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_ref VARCHAR(100) NOT NULL, -- Référence de gamme (ex: SP-SAVON-01)
  parameter_name VARCHAR(255) NOT NULL,
  unit VARCHAR(50),
  min_value DECIMAL(10,4),
  max_value DECIMAL(10,4),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT qc_spec_unique UNIQUE(spec_ref, parameter_name)
);

-- Create indexes for performance
CREATE INDEX idx_qc_specifications_ref ON public.qc_specifications(spec_ref);
CREATE INDEX idx_qc_specifications_active ON public.qc_specifications(active) WHERE active = true;

-- Enable RLS
ALTER TABLE public.qc_specifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Enable read for authenticated users"
  ON public.qc_specifications FOR SELECT
  TO authenticated
  USING (true);

-- Utilisation des rôles réels de l'ERP GSI existants dans l'énum : RQ, ADMIN
CREATE POLICY "Enable write for quality and admin users"
  ON public.qc_specifications FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.email = auth.email() -- Utilisation de l'email car c'est la clé de liaison dans l'app
      AND users.role IN ('RQ', 'ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.email = auth.email()
      AND users.role IN ('RQ', 'ADMIN')
    )
  );

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_qc_specifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER qc_specifications_updated_at
  BEFORE UPDATE ON public.qc_specifications
  FOR EACH ROW
  EXECUTE FUNCTION update_qc_specifications_updated_at();

-- Seed some default QC specifications pour les produits de démonstration
-- Basé sur les spec_ref attendues par les articles de base
INSERT INTO public.qc_specifications (spec_ref, parameter_name, unit, min_value, max_value)
VALUES 
  ('SP-SAVON-01', 'Taux d''humidité', '%', 12.0, 15.0),
  ('SP-SAVON-01', 'TFM (Total Fatty Matter)', '%', 70.0, 75.0),
  ('SP-SAVON-01', 'Alcalinité libre', '%', 0.01, 0.05),
  ('SP-HUILE-01', 'Indice d''acide', 'mg KOH/g', 0.1, 0.5),
  ('SP-HUILE-01', 'Indice de peroxyde', 'meq/kg', 1.0, 5.0)
ON CONFLICT (spec_ref, parameter_name) DO NOTHING;

COMMENT ON TABLE public.qc_specifications IS 'Spécifications de contrôle qualité par référence de gamme (spec_ref)';
