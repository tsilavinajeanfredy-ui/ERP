-- ============================================================================
-- ERP GSI — Migration 003 : Table Notifications internes
-- À exécuter dans Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================================

-- ─── Table notifications ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES users(id) ON DELETE CASCADE,
  role        user_role,                            -- destinataire par rôle
  title       text        NOT NULL,
  message     text        NOT NULL,
  read        boolean     NOT NULL DEFAULT false,
  type        text        NOT NULL DEFAULT 'info'   CHECK (type IN ('info', 'warning', 'error', 'success')),
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index pour des lectures rapides par utilisateur / rôle
CREATE INDEX IF NOT EXISTS idx_notif_user_id  ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_role     ON notifications(role);
CREATE INDEX IF NOT EXISTS idx_notif_date     ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_read     ON notifications(read);

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Un utilisateur peut lire ses propres notifications (user_id) 
-- OU les notifications adressées à son rôle
DROP POLICY IF EXISTS "auth_read_notif"  ON notifications;
CREATE POLICY "auth_read_notif" ON notifications
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
    OR role = public.get_role()
  );

-- Un utilisateur peut marquer ses propres notifications comme lues
DROP POLICY IF EXISTS "auth_update_notif" ON notifications;
CREATE POLICY "auth_update_notif" ON notifications
  FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
    OR role = public.get_role()
  )
  WITH CHECK (true);

-- Tous les utilisateurs authentifiés peuvent créer une notification
-- (les workflows applicatifs en ont besoin)
DROP POLICY IF EXISTS "auth_insert_notif" ON notifications;
CREATE POLICY "auth_insert_notif" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- L'ADMIN peut tout faire
DROP POLICY IF EXISTS "admin_all_notif" ON notifications;
CREATE POLICY "admin_all_notif" ON notifications
  FOR ALL TO authenticated
  USING (public.get_role() = 'ADMIN');
