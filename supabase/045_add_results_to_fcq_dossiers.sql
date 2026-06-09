-- Migration 045: Add results column to fcq_dossiers table
-- This allows saving the laboratory analysis results directly within the dossier.

ALTER TABLE public.fcq_dossiers ADD COLUMN IF NOT EXISTS results jsonb;
