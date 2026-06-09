-- ============================================================================
-- 054_add_en_attente_to_cqlib_status.sql
-- Ajoute la valeur EN_ATTENTE à l'enum cqlib_status
-- Utilisée par le workflow Reception PF : lots issus de la clôture d'un OF
-- sont créés EN_ATTENTE (en attente de validation magasinier), avant d'être
-- placés en QUARANTAINE pour contrôle laboratoire.
-- ============================================================================

-- PostgreSQL ne permet pas de supprimer un type énuméré et de le recréer si
-- des colonnes y font référence. On utilise ALTER TYPE ... ADD VALUE à la place.
-- La valeur est ajoutée AVANT 'QUARANTAINE' pour respecter l'ordre logique du workflow.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.cqlib_status'::regtype
      AND enumlabel = 'EN_ATTENTE'
  ) THEN
    ALTER TYPE public.cqlib_status ADD VALUE 'EN_ATTENTE' BEFORE 'QUARANTAINE';
  END IF;
END
$$;

-- Met à jour le commentaire du type pour la documentation
COMMENT ON TYPE public.cqlib_status IS
  'Statut CQ d''un lot : EN_ATTENTE (en attente validation magasinier) → QUARANTAINE (contrôle labo) → LIBERE | BLOQUE | DETERIORE | DEROGATION';
