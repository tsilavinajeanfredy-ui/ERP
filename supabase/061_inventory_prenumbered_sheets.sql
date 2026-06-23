-- ==============================================================================
-- MIGRATION 061 : INVENTAIRE — FICHES DE COMPTAGE PRÉ-NUMÉROTÉES (Module 4)
-- ==============================================================================
-- Numérotation séquentielle PERSISTÉE par campagne (auditable, stable entre
-- réimpressions). Une fiche par article actif, générée une seule fois.
-- (Idempotente.)

CREATE TABLE IF NOT EXISTS public.inventory_sheets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid NOT NULL REFERENCES public.inventory_campaigns(id) ON DELETE CASCADE,
  sheet_number  integer NOT NULL,
  article_id    uuid REFERENCES public.articles(id),
  depot_id      uuid REFERENCES public.depots(id),
  zone_label    text,
  qty_theoretical numeric(14,4),
  status        text NOT NULL DEFAULT 'GENERATED',  -- GENERATED | PRINTED | COUNTED
  assigned_to   uuid REFERENCES public.users(id),
  printed_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, sheet_number)
);

CREATE INDEX IF NOT EXISTS idx_inventory_sheets_campaign ON public.inventory_sheets(campaign_id);

ALTER TABLE public.inventory_sheets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inv_sheets_read_all" ON public.inventory_sheets;
CREATE POLICY "inv_sheets_read_all"
  ON public.inventory_sheets
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "inv_sheets_write" ON public.inventory_sheets;
CREATE POLICY "inv_sheets_write"
  ON public.inventory_sheets
  FOR ALL TO authenticated
  USING (public.get_role() IN ('MAGA', 'ADMIN', 'DPI', 'SUPER_ADMIN', 'DSI'))
  WITH CHECK (public.get_role() IN ('MAGA', 'ADMIN', 'DPI', 'SUPER_ADMIN', 'DSI'));

-- Génère les fiches pré-numérotées d'une campagne (une par article actif).
-- Idempotente : ne fait rien si des fiches existent déjà pour la campagne.
-- Retourne le nombre de fiches créées.
CREATE OR REPLACE FUNCTION public.generate_inventory_sheets(p_campaign_id uuid)
RETURNS integer AS $$
DECLARE
  rec RECORD;
  n integer := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.inventory_sheets WHERE campaign_id = p_campaign_id) THEN
    RETURN 0;
  END IF;

  FOR rec IN
    SELECT a.id AS article_id,
           COALESCE(SUM(l.qty_current), 0) AS qty_theoretical
    FROM public.articles a
    LEFT JOIN public.lots l ON l.article_id = a.id
    WHERE COALESCE(a.active, true) = true
    GROUP BY a.id, a.code
    ORDER BY a.code
  LOOP
    n := n + 1;
    INSERT INTO public.inventory_sheets (campaign_id, sheet_number, article_id, qty_theoretical)
    VALUES (p_campaign_id, n, rec.article_id, rec.qty_theoretical);
  END LOOP;

  RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.inventory_sheets IS 'Fiches de comptage pré-numérotées (numérotation persistée par campagne) — Module 4';
