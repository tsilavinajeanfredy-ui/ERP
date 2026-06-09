-- ==============================================================================
-- ERP GSI - MIGRATION 042 : FLUX QUALITÉ ET DÉCISION CQ-LIB DE QUARANTAINE
-- ==============================================================================

-- 1. Ajout des colonnes de décision détaillées dans public.fcq_dossiers
ALTER TABLE public.fcq_dossiers ADD COLUMN IF NOT EXISTS motif_decision text;
ALTER TABLE public.fcq_dossiers ADD COLUMN IF NOT EXISTS observation_rq text;
ALTER TABLE public.fcq_dossiers ADD COLUMN IF NOT EXISTS controleur_nom text;
ALTER TABLE public.fcq_dossiers ADD COLUMN IF NOT EXISTS quantite_controlee numeric(14,4);

-- 2. Création de la table d'historique de traçabilité pour les décisions qualité
CREATE TABLE IF NOT EXISTS public.quality_traceability_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES public.lots(id) ON DELETE CASCADE,
  fcq_id uuid REFERENCES public.fcq_dossiers(id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  username text NOT NULL,
  action_date date NOT NULL DEFAULT CURRENT_DATE,
  action_time time NOT NULL DEFAULT CURRENT_TIME,
  decision public.cqlib_status NOT NULL,
  motif text NOT NULL,
  comment text,
  previous_status public.cqlib_status NOT NULL,
  final_status public.cqlib_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexation pour des temps de consultation optimaux
CREATE INDEX IF NOT EXISTS idx_qtl_lot_id ON public.quality_traceability_logs(lot_id);
CREATE INDEX IF NOT EXISTS idx_qtl_fcq_id ON public.quality_traceability_logs(fcq_id);
CREATE INDEX IF NOT EXISTS idx_qtl_date ON public.quality_traceability_logs(action_date DESC);

-- RLS (Row Level Security) sur la table de traçabilité
ALTER TABLE public.quality_traceability_logs ENABLE ROW LEVEL SECURITY;

-- Lecture seule pour tous les utilisateurs authentifiés de l'ERP
DROP POLICY IF EXISTS "auth_read_trace" ON public.quality_traceability_logs;
CREATE POLICY "auth_read_trace" ON public.quality_traceability_logs 
  FOR SELECT TO authenticated USING (true);

-- Écriture autorisée pour le RQ, ADMIN ou tout utilisateur authentifié agissant dans le workflow qualité
DROP POLICY IF EXISTS "auth_insert_trace" ON public.quality_traceability_logs;
CREATE POLICY "auth_insert_trace" ON public.quality_traceability_logs 
  FOR INSERT TO authenticated WITH CHECK (true);

-- 3. Trigger pour notification automatique lors de la mise en quarantaine (Enregistrement initial)
CREATE OR REPLACE FUNCTION public.notify_new_quarantine_lot()
RETURNS TRIGGER AS $$
DECLARE
  v_article_name text;
BEGIN
  -- Récupérer le nom de l'article pour enrichir le message de notification
  SELECT name INTO v_article_name 
  FROM public.articles 
  WHERE id = NEW.article_id;

  -- Envoyer des notifications ciblées pour les rôles concernés (ADMIN, DPI, RQ, COMPTA, RACH)
  INSERT INTO public.notifications (role, title, message, type, metadata)
  VALUES 
    ('ADMIN', 'Nouveau lot en quarantaine', 'Le lot ' || NEW.code || ' (' || COALESCE(v_article_name, 'Article Inconnu') || ') a été enregistré et placé en quarantaine.', 'warning', jsonb_build_object('lot_id', NEW.id, 'action', 'quarantine', 'category', 'QUALITY')),
    ('DPI', 'Nouveau lot en quarantaine', 'Le lot ' || NEW.code || ' (' || COALESCE(v_article_name, 'Article Inconnu') || ') a été enregistré et placé en quarantaine.', 'warning', jsonb_build_object('lot_id', NEW.id, 'action', 'quarantine', 'category', 'QUALITY')),
    ('RQ', 'Nouveau lot en quarantaine', 'Le lot ' || NEW.code || ' (' || COALESCE(v_article_name, 'Article Inconnu') || ') a été enregistré et placé en quarantaine.', 'warning', jsonb_build_object('lot_id', NEW.id, 'action', 'quarantine', 'category', 'QUALITY')),
    ('COMPTA', 'Nouveau lot en quarantaine', 'Le lot ' || NEW.code || ' (' || COALESCE(v_article_name, 'Article Inconnu') || ') a été enregistré et placé en quarantaine.', 'warning', jsonb_build_object('lot_id', NEW.id, 'action', 'quarantine', 'category', 'QUALITY')),
    ('RACH', 'Nouveau lot en quarantaine', 'Le lot ' || NEW.code || ' (' || COALESCE(v_article_name, 'Article Inconnu') || ') a été enregistré et placé en quarantaine.', 'warning', jsonb_build_object('lot_id', NEW.id, 'action', 'quarantine', 'category', 'QUALITY'));
     
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Évite de bloquer l'insertion principale du lot en cas d'erreur de notification
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_notify_new_quarantine_lot ON public.lots;
CREATE TRIGGER tr_notify_new_quarantine_lot
AFTER INSERT ON public.lots
FOR EACH ROW
WHEN (NEW.cqlib_status = 'QUARANTAINE')
EXECUTE FUNCTION public.notify_new_quarantine_lot();

-- 4. Trigger pour notification automatique et temps réel lors d'un changement de statut du lot
CREATE OR REPLACE FUNCTION public.notify_lot_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_article_name text;
  v_status_label text;
  v_notif_type text;
BEGIN
  IF OLD.cqlib_status IS DISTINCT FROM NEW.cqlib_status THEN
    -- Récupérer le nom de l'article
    SELECT name INTO v_article_name FROM public.articles WHERE id = NEW.article_id;

    IF NEW.cqlib_status = 'LIBERE' THEN
      v_status_label := 'LIBÉRÉ';
      v_notif_type := 'success';
    ELSIF NEW.cqlib_status = 'BLOQUE' THEN
      v_status_label := 'BLOQUÉ';
      v_notif_type := 'error';
    ELSE
      v_status_label := NEW.cqlib_status::text;
      v_notif_type := 'info';
    END IF;

    -- Notifier tous les rôles opérationnels et administratifs du nouveau statut
    INSERT INTO public.notifications (role, title, message, type, metadata)
    VALUES 
      ('ADMIN', 'Changement de statut lot', 'Le lot ' || NEW.code || ' (' || COALESCE(v_article_name, 'Article Inconnu') || ') est passé au statut ' || v_status_label || '.', v_notif_type, jsonb_build_object('lot_id', NEW.id, 'status', NEW.cqlib_status, 'category', 'QUALITY')),
      ('DPI', 'Changement de statut lot', 'Le lot ' || NEW.code || ' (' || COALESCE(v_article_name, 'Article Inconnu') || ') est passé au statut ' || v_status_label || '.', v_notif_type, jsonb_build_object('lot_id', NEW.id, 'status', NEW.cqlib_status, 'category', 'QUALITY')),
      ('RQ', 'Changement de statut lot', 'Le lot ' || NEW.code || ' (' || COALESCE(v_article_name, 'Article Inconnu') || ') est passé au statut ' || v_status_label || '.', v_notif_type, jsonb_build_object('lot_id', NEW.id, 'status', NEW.cqlib_status, 'category', 'QUALITY')),
      ('COMPTA', 'Changement de statut lot', 'Le lot ' || NEW.code || ' (' || COALESCE(v_article_name, 'Article Inconnu') || ') est passé au statut ' || v_status_label || '.', v_notif_type, jsonb_build_object('lot_id', NEW.id, 'status', NEW.cqlib_status, 'category', 'QUALITY')),
      ('RACH', 'Changement de statut lot', 'Le lot ' || NEW.code || ' (' || COALESCE(v_article_name, 'Article Inconnu') || ') est passé au statut ' || v_status_label || '.', v_notif_type, jsonb_build_object('lot_id', NEW.id, 'status', NEW.cqlib_status, 'category', 'QUALITY')),
      ('RPROD', 'Changement de statut lot', 'Le lot ' || NEW.code || ' (' || COALESCE(v_article_name, 'Article Inconnu') || ') est passé au statut ' || v_status_label || '.', v_notif_type, jsonb_build_object('lot_id', NEW.id, 'status', NEW.cqlib_status, 'category', 'QUALITY')),
      ('MAGA', 'Changement de statut lot', 'Le lot ' || NEW.code || ' (' || COALESCE(v_article_name, 'Article Inconnu') || ') est passé au statut ' || v_status_label || '.', v_notif_type, jsonb_build_object('lot_id', NEW.id, 'status', NEW.cqlib_status, 'category', 'QUALITY'));
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Évite de bloquer l'opération de mise à jour en cas d'erreur de notification
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_notify_lot_status_change ON public.lots;
CREATE TRIGGER tr_notify_lot_status_change
AFTER UPDATE ON public.lots
FOR EACH ROW
EXECUTE FUNCTION public.notify_lot_status_change();
