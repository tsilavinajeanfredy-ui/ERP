-- ==============================================================================
-- ERP GSI - MIGRATION 007 : MULTI-SITE & BILINGUISME
-- CCTP Phase 4 : Sécurité Hermétique & Données Internationales
-- ==============================================================================

-- 1. Ajout du support bilingue pour le référentiel Articles
ALTER TABLE public.articles
ADD COLUMN IF NOT EXISTS name_en TEXT,
ADD COLUMN IF NOT EXISTS description_en TEXT;

-- 2. Ajout du support bilingue pour les Dépôts
ALTER TABLE public.depots
ADD COLUMN IF NOT EXISTS name_en TEXT;

-- 3. Mise à jour de la sécurité RLS pour le Multi-Site
-- Seul l'ADMIN et le SUPER_ADMIN voient tout. 
-- Les autres ne voient que les lots de leur propre site.

-- Suppression des anciennes politiques si existantes pour recréer proprement
DROP POLICY IF EXISTS "lots_isolation_v1" ON lots;

CREATE POLICY "lots_isolation_v2" ON lots
FOR SELECT
TO authenticated
USING (
  public.get_auth_role() IN ('ADMIN', 'SUPER_ADMIN', 'DSI')
  OR 
  (SELECT site FROM public.users WHERE email = auth.jwt()->>'email') = 
  (SELECT (SELECT name FROM public.sites WHERE id = public.depots.site_id) FROM public.depots WHERE id = lots.depot_id)
);

-- 4. Ajout d'une colonne Standard Cost pour la BI
ALTER TABLE public.articles
ADD COLUMN IF NOT EXISTS standard_cost_mga NUMERIC DEFAULT 0;

-- 5. Insertion de quelques traductions pour la démo
UPDATE public.articles SET name_en = 'Caustic Soda' WHERE code = 'MP-SOU-01';
UPDATE public.articles SET name_en = 'Palm Oil' WHERE code = 'MP-HUI-05';
UPDATE public.articles SET name_en = 'Industrial Salt' WHERE code = 'MP-SEL-02';
UPDATE public.articles SET name_en = 'Soap Carton 200g' WHERE code = 'EMB-CAR-01';

COMMENT ON COLUMN public.articles.name_en IS 'Nom de l''article en anglais pour les rapports export';
COMMENT ON POLICY "lots_isolation_v2" ON public.lots IS 'Isolation hermétique des stocks par site géographique.';
