-- 072_rh_pointages.sql
-- Migration pour la gestion détaillée des pointages (historique des heures)

-- Création de la table rh_pointages
CREATE TABLE public.rh_pointages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    section_id UUID NOT NULL REFERENCES public.rh_sections(id) ON DELETE CASCADE,
    periode TEXT NOT NULL, -- Ex: '2026-W25'
    evenement TEXT NOT NULL CHECK (evenement IN ('Production', 'Non Production')),
    heures_normales NUMERIC(10, 2) NOT NULL DEFAULT 0,
    heures_supp NUMERIC(10, 2) NOT NULL DEFAULT 0,
    date_pointage DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id)
);

-- Index pour accélérer les recherches
CREATE INDEX idx_rh_pointages_section ON public.rh_pointages(section_id);
CREATE INDEX idx_rh_pointages_periode ON public.rh_pointages(periode);

-- Fonction de mise à jour du updated_at
CREATE OR REPLACE FUNCTION update_rh_pointages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_rh_pointages_modtime
BEFORE UPDATE ON public.rh_pointages
FOR EACH ROW EXECUTE FUNCTION update_rh_pointages_updated_at();

-- Row Level Security
ALTER TABLE public.rh_pointages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture pour tous les utilisateurs authentifiés" 
ON public.rh_pointages FOR SELECT TO authenticated USING (true);

CREATE POLICY "Modification pour les rôles admin, rh et rprod" 
ON public.rh_pointages FOR ALL TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE auth_id = auth.uid() 
        AND role IN ('ADMIN', 'RH', 'RPROD')
    )
);

-- Ajouter des colonnes de log sur rh_planned_budgets si besoin (dejà géré dans 070)
