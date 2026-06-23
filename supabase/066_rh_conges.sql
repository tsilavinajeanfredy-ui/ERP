-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 066 : Module RH — Congés
-- ─────────────────────────────────────────────────────────────────────────────
-- Workflow : l'employé/le responsable saisit une demande de congé →
--   validation par DPI ou Directeur (ADMIN/SUPER_ADMIN) → RH en lecture seule.
-- S'appuie sur le schéma RÉEL : tables `rh_personnels`, `rh_personnel_view`,
-- `users` (auth_id = auth.uid(), role), `notifications`.
-- (Idempotente : ré-exécutable sans erreur.)

-- 1. Droit annuel de congés par employé (jours/an), défaut 30
ALTER TABLE IF EXISTS public.rh_personnels
    ADD COLUMN IF NOT EXISTS droit_conges_annuel numeric NOT NULL DEFAULT 30;

-- 2. Table des demandes de congé
CREATE TABLE IF NOT EXISTS public.rh_conges (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    personnel_id  uuid NOT NULL REFERENCES public.rh_personnels(id) ON DELETE CASCADE,
    type_conge    text NOT NULL DEFAULT 'CONGE_PAYE'
        CHECK (type_conge IN ('CONGE_PAYE','MALADIE','SANS_SOLDE','MATERNITE','EXCEPTIONNEL','AUTRE')),
    date_debut    date NOT NULL,
    date_fin      date NOT NULL,
    nb_jours      numeric NOT NULL DEFAULT 0,
    motif         text,
    statut        text NOT NULL DEFAULT 'EN_ATTENTE'
        CHECK (statut IN ('EN_ATTENTE','VALIDE','REFUSE','ANNULE')),
    demande_par   uuid REFERENCES public.users(id),
    valide_par    uuid REFERENCES public.users(id),
    valide_at     timestamptz,
    commentaire   text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT rh_conges_dates_ck CHECK (date_fin >= date_debut)
);

CREATE INDEX IF NOT EXISTS idx_rh_conges_personnel ON public.rh_conges(personnel_id);
CREATE INDEX IF NOT EXISTS idx_rh_conges_statut    ON public.rh_conges(statut);
CREATE INDEX IF NOT EXISTS idx_rh_conges_dates     ON public.rh_conges(date_debut, date_fin);

-- 3. Calcul automatique du nombre de jours (calendaires, inclusif) si non fourni
--    + maintien de updated_at.
CREATE OR REPLACE FUNCTION public.rh_conges_before_write()
RETURNS trigger AS $$
BEGIN
    IF NEW.nb_jours IS NULL OR NEW.nb_jours <= 0 THEN
        NEW.nb_jours := (NEW.date_fin - NEW.date_debut) + 1;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rh_conges_before_write ON public.rh_conges;
CREATE TRIGGER trg_rh_conges_before_write
    BEFORE INSERT OR UPDATE ON public.rh_conges
    FOR EACH ROW EXECUTE FUNCTION public.rh_conges_before_write();

-- 4. Vue des soldes de congés (année en cours)
DROP VIEW IF EXISTS public.rh_conges_soldes;
CREATE VIEW public.rh_conges_soldes AS
SELECT
    p.id                                       AS personnel_id,
    p.matricule                                AS matricule,
    btrim(COALESCE(p.nom, '') || ' ' || COALESCE(p.prenoms, '')) AS nom_complet,
    COALESCE(p.droit_conges_annuel, 30)        AS droit_annuel,
    COALESCE(SUM(c.nb_jours) FILTER (
        WHERE c.statut = 'VALIDE'
          AND EXTRACT(YEAR FROM c.date_debut) = EXTRACT(YEAR FROM now())), 0) AS jours_pris,
    COALESCE(SUM(c.nb_jours) FILTER (
        WHERE c.statut = 'EN_ATTENTE'
          AND EXTRACT(YEAR FROM c.date_debut) = EXTRACT(YEAR FROM now())), 0) AS jours_en_attente,
    COALESCE(p.droit_conges_annuel, 30) - COALESCE(SUM(c.nb_jours) FILTER (
        WHERE c.statut = 'VALIDE'
          AND EXTRACT(YEAR FROM c.date_debut) = EXTRACT(YEAR FROM now())), 0) AS solde
FROM public.rh_personnels p
LEFT JOIN public.rh_conges c ON c.personnel_id = p.id
GROUP BY p.id, p.matricule, p.nom, p.prenoms, p.droit_conges_annuel;

ALTER VIEW public.rh_conges_soldes SET (security_invoker = true);

-- 5. RLS
ALTER TABLE public.rh_conges ENABLE ROW LEVEL SECURITY;

-- Lecture : tous les rôles qui accèdent au module RH (RH inclus, en lecture)
DROP POLICY IF EXISTS "rh_conges_select" ON public.rh_conges;
CREATE POLICY "rh_conges_select"
    ON public.rh_conges
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE auth_id = auth.uid()
              AND role IN ('RH', 'DPI', 'ADMIN', 'SUPER_ADMIN', 'DSI')
        )
    );

-- Création : DPI / Directeur (ADMIN/SUPER_ADMIN/DSI). RH est en lecture seule.
DROP POLICY IF EXISTS "rh_conges_insert" ON public.rh_conges;
CREATE POLICY "rh_conges_insert"
    ON public.rh_conges
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE auth_id = auth.uid()
              AND role IN ('DPI', 'ADMIN', 'SUPER_ADMIN', 'DSI')
        )
    );

-- Validation / modification : DPI / Directeur uniquement
DROP POLICY IF EXISTS "rh_conges_update" ON public.rh_conges;
CREATE POLICY "rh_conges_update"
    ON public.rh_conges
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE auth_id = auth.uid()
              AND role IN ('DPI', 'ADMIN', 'SUPER_ADMIN', 'DSI')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE auth_id = auth.uid()
              AND role IN ('DPI', 'ADMIN', 'SUPER_ADMIN', 'DSI')
        )
    );

-- Suppression : Directeur uniquement
DROP POLICY IF EXISTS "rh_conges_delete" ON public.rh_conges;
CREATE POLICY "rh_conges_delete"
    ON public.rh_conges
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE auth_id = auth.uid()
              AND role IN ('ADMIN', 'SUPER_ADMIN', 'DSI')
        )
    );
