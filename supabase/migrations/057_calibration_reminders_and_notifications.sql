-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 057 : Calibration Reminders & Notifications (Module 2)
-- ─────────────────────────────────────────────────────────────────────────────
-- NOTE : cette migration s'appuie sur le schéma RÉEL du projet :
--   - table `users` (colonne `auth_id` liée à auth.uid(), colonne `role`)
--   - table `notifications` déjà créée (003/026) : colonnes
--     user_id, role, title, message, read, type(CHECK info/warning/error/success),
--     metadata(jsonb), category, read_at, created_at.
-- Les rappels d'étalonnage sont stockés dans `notifications` avec
--   type='warning', category='QUALITY', metadata->>'kind'='CALIBRATION_REMINDER'.
-- (Idempotente : ré-exécutable sans erreur.)

-- 1. Table CALIBRATION_SCHEDULES (suivi des calendriers d'étalonnage)
CREATE TABLE IF NOT EXISTS calibration_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instrument_id UUID NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
    scheduled_date TIMESTAMPTZ NOT NULL,
    reminder_sent_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    completed_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(instrument_id, scheduled_date)
);

CREATE INDEX IF NOT EXISTS idx_calibration_schedules_instrument ON calibration_schedules(instrument_id);
CREATE INDEX IF NOT EXISTS idx_calibration_schedules_scheduled_date ON calibration_schedules(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_calibration_schedules_completed ON calibration_schedules(completed_at);

-- 2. Table CALIBRATION_FREQUENCIES (référentiel des fréquences par type d'instrument)
CREATE TABLE IF NOT EXISTS calibration_frequencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instrument_type VARCHAR(100) NOT NULL UNIQUE,
    frequency_days INTEGER NOT NULL,
    reminder_days_before INTEGER DEFAULT 7,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO calibration_frequencies (instrument_type, frequency_days, reminder_days_before, description)
VALUES
    ('BALANCE', 365, 7, 'Balance de mesure - Annuel'),
    ('THERMOMETRE', 365, 7, 'Thermomètre - Annuel'),
    ('pH_METER', 180, 7, 'PH-mètre - Semestriel'),
    ('CONDUCTIVITY_METER', 180, 7, 'Conductimètre - Semestriel'),
    ('VISCOSIMETER', 365, 7, 'Viscosimètre - Annuel'),
    ('REFRACTOMETER', 730, 7, 'Réfractomètre - Bi-annuel'),
    ('COLORIMETER', 365, 7, 'Colorimètre - Annuel'),
    ('OTHER', 365, 7, 'Autre instrument - Annuel (par défaut)')
ON CONFLICT (instrument_type) DO NOTHING;

-- 3. Colonnes complémentaires sur instruments (modèle, n° série, localisation, mise en service)
ALTER TABLE instruments
    ADD COLUMN IF NOT EXISTS model VARCHAR(255),
    ADD COLUMN IF NOT EXISTS serial_number VARCHAR(255),
    ADD COLUMN IF NOT EXISTS location VARCHAR(255),
    ADD COLUMN IF NOT EXISTS commissioned_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS instrument_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS frequency_days INTEGER DEFAULT 365;

CREATE INDEX IF NOT EXISTS idx_instruments_commissioned_at ON instruments(commissioned_at);
CREATE INDEX IF NOT EXISTS idx_instruments_next_calibration ON instruments(next_calibration_at);

-- 4. Calcul de la prochaine date d'étalonnage
CREATE OR REPLACE FUNCTION calculate_next_calibration_date(last_calibration_date TIMESTAMPTZ, p_frequency_days INTEGER)
RETURNS TIMESTAMPTZ AS $$
BEGIN
    RETURN last_calibration_date + (COALESCE(p_frequency_days, 365) || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 5. Trigger : mettre à jour next_calibration_at / last_calibration_at après chaque étalonnage
--    calibration_log : colonne réelle = calibration_date (date)
CREATE OR REPLACE FUNCTION update_instrument_calibration_date()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE instruments
    SET next_calibration_at = NEW.calibration_date::timestamptz
            + (COALESCE(frequency_days, 365) || ' days')::INTERVAL,
        last_calibration_at = NEW.calibration_date::timestamptz
    WHERE id = NEW.instrument_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_instrument_calibration_date ON calibration_log;
CREATE TRIGGER trg_update_instrument_calibration_date
    AFTER INSERT ON calibration_log
    FOR EACH ROW
    EXECUTE FUNCTION update_instrument_calibration_date();

-- 6. RLS pour calibration_schedules (rôles labo/qualité/admin réels)
ALTER TABLE calibration_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calib_schedules_select" ON calibration_schedules;
CREATE POLICY "calib_schedules_select"
    ON calibration_schedules
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE auth_id = auth.uid()
              AND role IN ('TLAB', 'RQ', 'ADMIN', 'SUPER_ADMIN', 'DSI')
        )
    );

DROP POLICY IF EXISTS "calib_schedules_write" ON calibration_schedules;
CREATE POLICY "calib_schedules_write"
    ON calibration_schedules
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE auth_id = auth.uid()
              AND role IN ('TLAB', 'RQ', 'ADMIN', 'SUPER_ADMIN', 'DSI')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE auth_id = auth.uid()
              AND role IN ('TLAB', 'RQ', 'ADMIN', 'SUPER_ADMIN', 'DSI')
        )
    );

-- 7. Vue : instruments en retard d'étalonnage
CREATE OR REPLACE VIEW overdue_instruments AS
SELECT
    i.id,
    i.name,
    i.model,
    i.serial_number,
    i.location,
    i.next_calibration_at,
    i.last_calibration_at,
    EXTRACT(DAY FROM (NOW() - i.next_calibration_at)) AS days_overdue,
    CASE
        WHEN i.next_calibration_at < NOW() THEN 'OVERDUE'
        WHEN i.next_calibration_at < NOW() + INTERVAL '7 days' THEN 'DUE_SOON'
        ELSE 'OK'
    END AS status
FROM instruments i
WHERE i.next_calibration_at IS NOT NULL
  AND i.next_calibration_at < NOW()
ORDER BY i.next_calibration_at ASC;

-- 8. Vue : prochaines calibrations attendues
CREATE OR REPLACE VIEW upcoming_calibrations AS
SELECT
    i.id,
    i.name,
    i.model,
    i.serial_number,
    i.location,
    i.next_calibration_at,
    EXTRACT(DAY FROM (i.next_calibration_at - NOW())) AS days_until_due,
    COALESCE(cf.reminder_days_before, 7) AS reminder_days_before,
    CASE
        WHEN i.next_calibration_at < NOW() THEN 'OVERDUE'
        WHEN i.next_calibration_at < NOW() + (COALESCE(cf.reminder_days_before, 7) || ' days')::INTERVAL THEN 'REMINDER_SENT'
        ELSE 'SCHEDULED'
    END AS reminder_status
FROM instruments i
LEFT JOIN calibration_frequencies cf ON i.instrument_type = cf.instrument_type
WHERE i.next_calibration_at IS NOT NULL
ORDER BY i.next_calibration_at ASC;

-- 9. Permissions
GRANT SELECT ON calibration_schedules TO authenticated;
GRANT SELECT ON calibration_frequencies TO authenticated;
GRANT SELECT ON overdue_instruments TO authenticated;
GRANT SELECT ON upcoming_calibrations TO authenticated;

COMMENT ON TABLE calibration_schedules IS 'Calendrier d''étalonnage des instruments avec suivi de réalisation';
COMMENT ON TABLE calibration_frequencies IS 'Référentiel des fréquences d''étalonnage par type d''instrument';
COMMENT ON FUNCTION update_instrument_calibration_date() IS 'Trigger: met à jour next_calibration_at après chaque étalonnage (calibration_log.calibration_date)';
