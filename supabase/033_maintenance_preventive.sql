-- ==============================================================================
-- ERP GSI - MIGRATION 033 : MAINTENANCE PRÉVENTIVE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS maintenance_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  equipment_name text NOT NULL,
  equipment_type text, -- 'MACHINE', 'VEHICULE', 'INSTRUMENT', 'BATIMENT'
  frequency_days int NOT NULL,
  last_performed_at timestamptz,
  next_due_at timestamptz,
  assigned_to uuid REFERENCES users(id),
  description text,
  status text NOT NULL DEFAULT 'PLANIFIE' CHECK (status IN ('PLANIFIE', 'EN_COURS', 'TERMINE', 'ANNULE')),
  priority text DEFAULT 'NORMAL' CHECK (priority IN ('BASSE', 'NORMAL', 'HAUTE', 'CRITIQUE')),
  estimated_duration_min int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maint_next_due ON maintenance_tasks(next_due_at);
CREATE INDEX IF NOT EXISTS idx_maint_status ON maintenance_tasks(status);

CREATE OR REPLACE VIEW maintenance_calendar_view AS
SELECT
  mt.id, mt.code, mt.equipment_name, mt.equipment_type, mt.frequency_days,
  mt.last_performed_at, mt.next_due_at,
  mt.assigned_to, u.full_name AS assigned_name,
  mt.status, mt.priority, mt.estimated_duration_min,
  CASE
    WHEN mt.next_due_at IS NULL THEN 'PLANIFIE'
    WHEN mt.next_due_at < now() THEN 'EN_RETARD'
    WHEN mt.next_due_at < now() + interval '7 days' THEN 'A_FAIRE'
    ELSE 'DANS_TEMPS'
  END AS urgency
FROM maintenance_tasks mt
LEFT JOIN users u ON u.id = mt.assigned_to;
