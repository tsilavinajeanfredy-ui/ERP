-- ==============================================================================
-- MIGRATION 065 : EXPORT AUTOMATIQUE MENSUEL — PV REVUE DE DIRECTION (Module 7)
-- ==============================================================================
-- Génère mensuellement un PV de revue de direction pré-rempli avec les KPIs du
-- mois (production, qualité, stock, achats, non-conformités). Destiné à un cron
-- (1er du mois) qui appelle generate_management_review(). (Idempotente.)

CREATE TABLE IF NOT EXISTS public.management_reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month  date NOT NULL,                       -- 1er jour du mois couvert
  status        text NOT NULL DEFAULT 'AUTO',        -- AUTO | VALIDEE | ARCHIVEE
  kpis          jsonb NOT NULL DEFAULT '{}',
  notes         text,
  generated_at  timestamptz NOT NULL DEFAULT now(),
  validated_by  uuid REFERENCES public.users(id),
  validated_at  timestamptz,
  UNIQUE (period_month)
);

CREATE INDEX IF NOT EXISTS idx_management_reviews_month ON public.management_reviews(period_month DESC);

ALTER TABLE public.management_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reviews_read_all" ON public.management_reviews;
CREATE POLICY "reviews_read_all"
  ON public.management_reviews
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "reviews_write" ON public.management_reviews;
CREATE POLICY "reviews_write"
  ON public.management_reviews
  FOR ALL TO authenticated
  USING (public.get_role() IN ('ADMIN', 'DPI', 'RQ', 'SUPER_ADMIN', 'DSI'))
  WITH CHECK (public.get_role() IN ('ADMIN', 'DPI', 'RQ', 'SUPER_ADMIN', 'DSI'));

-- Agrège les KPIs du mois et insère/écrase le PV correspondant.
-- p_month : n'importe quelle date du mois ciblé (défaut : mois précédent).
CREATE OR REPLACE FUNCTION public.generate_management_review(p_month date DEFAULT (date_trunc('month', now()) - INTERVAL '1 month')::date)
RETURNS uuid AS $$
DECLARE
  m_start date := date_trunc('month', p_month)::date;
  m_end   date := (date_trunc('month', p_month) + INTERVAL '1 month')::date;
  v_kpis  jsonb;
  v_id    uuid;
BEGIN
  SELECT jsonb_build_object(
    'production', jsonb_build_object(
      'orders_completed', (SELECT COUNT(*) FROM public.production_orders WHERE status = 'TERMINE' AND completed_at >= m_start AND completed_at < m_end),
      'qty_produced',     (SELECT COALESCE(SUM(qty_produced), 0) FROM public.production_orders WHERE status = 'TERMINE' AND completed_at >= m_start AND completed_at < m_end)
    ),
    'quality', jsonb_build_object(
      'fcq_total',  (SELECT COUNT(*) FROM public.fcq_dossiers WHERE created_at >= m_start AND created_at < m_end),
      'fcq_libere', (SELECT COUNT(*) FROM public.fcq_dossiers WHERE created_at >= m_start AND created_at < m_end AND decision = 'LIBERE'),
      'fnc_opened', (SELECT COUNT(*) FROM public.fnc WHERE created_at >= m_start AND created_at < m_end),
      'fnc_closed', (SELECT COUNT(*) FROM public.fnc WHERE decision_at >= m_start AND decision_at < m_end AND status = 'CLOTUREE')
    ),
    'complaints', jsonb_build_object(
      'opened', (SELECT COUNT(*) FROM public.complaints WHERE opened_at >= m_start AND opened_at < m_end),
      'closed', (SELECT COUNT(*) FROM public.complaints WHERE closed_at >= m_start AND closed_at < m_end)
    ),
    'stock', jsonb_build_object(
      'lots_quarantine', (SELECT COUNT(*) FROM public.lots WHERE cqlib_status = 'QUARANTAINE'),
      'lots_blocked',    (SELECT COUNT(*) FROM public.lots WHERE cqlib_status = 'BLOQUE')
    ),
    'purchasing', jsonb_build_object(
      'da_import', (SELECT COUNT(*) FROM public.da_import WHERE created_at >= m_start AND created_at < m_end),
      'da_local',  (SELECT COUNT(*) FROM public.da_local WHERE created_at >= m_start AND created_at < m_end)
    )
  ) INTO v_kpis;

  INSERT INTO public.management_reviews (period_month, status, kpis, generated_at)
  VALUES (m_start, 'AUTO', v_kpis, now())
  ON CONFLICT (period_month) DO UPDATE
    SET kpis = EXCLUDED.kpis, generated_at = now(),
        status = CASE WHEN public.management_reviews.status = 'VALIDEE' THEN public.management_reviews.status ELSE 'AUTO' END
  RETURNING id INTO v_id;

  -- Notifie la direction qu'un PV est disponible
  INSERT INTO public.notifications (role, title, message, type, category, metadata)
  VALUES (
    'DPI',
    '[REVUE DIRECTION] PV ' || to_char(m_start, 'MM/YYYY') || ' disponible',
    'Le PV de revue de direction pour ' || to_char(m_start, 'TMMonth YYYY') || ' a été pré-rempli automatiquement.',
    'info',
    'REPORTING',
    jsonb_build_object('kind', 'MANAGEMENT_REVIEW', 'review_id', v_id, 'screen', 'Admin')
  );

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.management_reviews IS 'PV de revue de direction mensuels auto-générés — Module 7';
