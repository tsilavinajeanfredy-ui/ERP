-- ==============================================================================
-- MIGRATION 064 : PRÉFÉRENCES DE TABLEAU DE BORD PAR UTILISATEUR (Module 7)
-- ==============================================================================
-- Permet à chaque utilisateur de masquer/afficher des sections de son tableau
-- de bord et de marquer des favoris. (Idempotente.)

CREATE TABLE IF NOT EXISTS public.user_dashboard_preferences (
  user_id         uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  hidden_sections text[] NOT NULL DEFAULT '{}',
  favorites       text[] NOT NULL DEFAULT '{}',
  layout          jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_dashboard_preferences ENABLE ROW LEVEL SECURITY;

-- Chaque utilisateur ne voit et ne modifie que ses propres préférences.
DROP POLICY IF EXISTS "dashboard_prefs_own" ON public.user_dashboard_preferences;
CREATE POLICY "dashboard_prefs_own"
  ON public.user_dashboard_preferences
  FOR ALL TO authenticated
  USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()))
  WITH CHECK (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

COMMENT ON TABLE public.user_dashboard_preferences IS 'Préférences de personnalisation du tableau de bord par utilisateur — Module 7';
