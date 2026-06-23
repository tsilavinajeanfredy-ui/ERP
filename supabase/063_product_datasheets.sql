-- ==============================================================================
-- MIGRATION 063 : FICHE TECHNIQUE PRODUIT AUTONOME (Module 6)
-- ==============================================================================
-- Fiche technique indépendante de la BOM : spécifications qualité, conditionnement,
-- conditions de stockage, durée de vie, usage — par produit (gamme). Versionnée.
-- (Idempotente.)

CREATE TABLE IF NOT EXISTS public.product_datasheets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id          uuid NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  version             integer NOT NULL DEFAULT 1,
  status              text NOT NULL DEFAULT 'BROUILLON',  -- BROUILLON | VALIDEE | ARCHIVEE
  family              text,
  commercial_name     text,
  description         text,
  quality_specs       text,    -- spécifications qualité (pH, TFM, viscosité, etc.)
  physical_specs      text,    -- caractéristiques physiques (aspect, couleur, odeur)
  packaging           text,    -- conditionnement (format, emballage, palettisation)
  storage_conditions  text,    -- conditions de stockage
  shelf_life          text,    -- durée de vie / DLUO
  usage_instructions  text,    -- mode d'emploi / précautions
  regulatory          text,    -- mentions réglementaires
  validated_by        uuid REFERENCES public.users(id),
  validated_at        timestamptz,
  created_by          uuid REFERENCES public.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, version)
);

CREATE INDEX IF NOT EXISTS idx_product_datasheets_article ON public.product_datasheets(article_id);

-- Maintien de updated_at
CREATE OR REPLACE FUNCTION public.touch_product_datasheet()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_product_datasheet ON public.product_datasheets;
CREATE TRIGGER trg_touch_product_datasheet
  BEFORE UPDATE ON public.product_datasheets
  FOR EACH ROW EXECUTE FUNCTION public.touch_product_datasheet();

ALTER TABLE public.product_datasheets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "datasheets_read_all" ON public.product_datasheets;
CREATE POLICY "datasheets_read_all"
  ON public.product_datasheets
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "datasheets_write" ON public.product_datasheets;
CREATE POLICY "datasheets_write"
  ON public.product_datasheets
  FOR ALL TO authenticated
  USING (public.get_role() IN ('ADMIN', 'RQ', 'DPI', 'RPROD', 'TLAB', 'SUPER_ADMIN', 'DSI'))
  WITH CHECK (public.get_role() IN ('ADMIN', 'RQ', 'DPI', 'RPROD', 'TLAB', 'SUPER_ADMIN', 'DSI'));

COMMENT ON TABLE public.product_datasheets IS 'Fiche technique produit autonome (indépendante de la BOM) — Module 6';
