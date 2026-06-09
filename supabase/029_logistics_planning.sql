-- ==============================================================================
-- ERP GSI - MIGRATION 029 : PLANNING LOGISTIQUE (TOURNÉES, TRANSPORTEURS)
-- ==============================================================================

-- 1. Transporteurs
CREATE TABLE IF NOT EXISTS carriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  contact_name text,
  contact_phone text,
  contact_email text,
  vehicle_type text, -- 'CAMION' | 'FOURGONNETTE' | 'PORTEUR'
  capacity_kg numeric(10,2),
  cost_per_km numeric(10,2),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Tournées
CREATE TABLE IF NOT EXISTS delivery_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  carrier_id uuid REFERENCES carriers(id),
  driver_name text,
  vehicle_plate text,
  planned_date date NOT NULL,
  departure_time time,
  estimated_km numeric(8,2),
  status text NOT NULL DEFAULT 'PLANIFIE' CHECK (status IN ('PLANIFIE', 'EN_COURS', 'TERMINE', 'ANNULE')),
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Étapes / arrêts d'une tournée
CREATE TABLE IF NOT EXISTS delivery_route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES delivery_routes(id) ON DELETE CASCADE,
  stop_order int NOT NULL,
  stop_type text NOT NULL CHECK (stop_type IN ('DEPOT', 'CLIENT', 'FOURNISSEUR')),
  reference_id uuid, -- depot_id, customer_id, etc.
  reference_type text,
  address text,
  contact_name text,
  contact_phone text,
  planned_arrival timestamptz,
  actual_arrival timestamptz,
  status text NOT NULL DEFAULT 'EN_ATTENTE' CHECK (status IN ('EN_ATTENTE', 'CHARGE', 'LIVRE', 'ANNULE')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Vue calendrier logistique
CREATE OR REPLACE VIEW logistics_calendar_view AS
SELECT
  dr.id AS route_id,
  dr.code AS route_code,
  dr.label AS route_label,
  dr.planned_date,
  dr.status AS route_status,
  c.name AS carrier_name,
  c.vehicle_type,
  dr.driver_name,
  dr.vehicle_plate,
  dr.estimated_km,
  COUNT(drs.id) AS stop_count,
  COUNT(drs.id) FILTER (WHERE drs.status = 'LIVRE') AS completed_stops
FROM delivery_routes dr
LEFT JOIN carriers c ON c.id = dr.carrier_id
LEFT JOIN delivery_route_stops drs ON drs.route_id = dr.id
GROUP BY dr.id, dr.code, dr.label, dr.planned_date, dr.status, c.name, c.vehicle_type, dr.driver_name, dr.vehicle_plate, dr.estimated_km
ORDER BY dr.planned_date DESC;

ALTER VIEW logistics_calendar_view SET (security_invoker = true);

-- 5. Index
CREATE INDEX IF NOT EXISTS idx_routes_date ON delivery_routes(planned_date);
CREATE INDEX IF NOT EXISTS idx_routes_status ON delivery_routes(status);
CREATE INDEX IF NOT EXISTS idx_route_stops_route ON delivery_route_stops(route_id);
