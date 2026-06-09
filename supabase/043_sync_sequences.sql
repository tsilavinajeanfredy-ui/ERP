-- ==============================================================================
-- ERP GSI - MIGRATION 043 : SYNCHRONISATION DES SÉQUENCES DE CODES UNIQUE
-- ==============================================================================

-- Cette procédure synchronise la table code_sequences avec les valeurs réelles 
-- maximales trouvées dans les différentes tables de la base de données.
-- Cela évite les erreurs 409 (Conflict/Unique constraint violation) dues à un décalage.

DO $$
DECLARE
  v_rec record;
  v_max_suffix int;
BEGIN
  -- 1. Synchronisation pour la table 'lots' (préfixes 'L' et 'RPF-*')
  FOR v_rec IN 
    SELECT 
      split_part(code, '-', 1) as prefix_part1,
      split_part(code, '-', 2) as prefix_part2,
      split_part(code, '-', 3) as prefix_part3,
      code
    FROM public.lots
    WHERE code LIKE '%-%'
  LOOP
    -- Cas préfixe simple comme 'L-2026-001'
    IF v_rec.prefix_part1 = 'L' AND v_rec.prefix_part2 ~ '^[0-9]+$' THEN
      v_max_suffix := substring(v_rec.code from '-([0-9]+)$')::int;
      INSERT INTO public.code_sequences (prefix, year, last_number)
      VALUES ('L', v_rec.prefix_part2::int, v_max_suffix)
      ON CONFLICT (prefix, year) 
      DO UPDATE SET last_number = GREATEST(code_sequences.last_number, EXCLUDED.last_number);
    END IF;

    -- Cas préfixe composé comme 'RPF-SAV-2026-0001'
    IF v_rec.prefix_part1 = 'RPF' THEN
      DECLARE
        v_prefix text := 'RPF-' || v_rec.prefix_part2;
        v_year text := split_part(v_rec.code, '-', 3);
      BEGIN
        IF v_year ~ '^[0-9]+$' THEN
          v_max_suffix := substring(v_rec.code from '-([0-9]+)$')::int;
          INSERT INTO public.code_sequences (prefix, year, last_number)
          VALUES (v_prefix, v_year::int, v_max_suffix)
          ON CONFLICT (prefix, year) 
          DO UPDATE SET last_number = GREATEST(code_sequences.last_number, EXCLUDED.last_number);
        END IF;
      END;
    END IF;
  END LOOP;

  -- 2. Synchronisation pour la table 'bons_entree' (préfixe 'BE')
  FOR v_rec IN 
    SELECT code FROM public.bons_entree WHERE code LIKE 'BE-%'
  LOOP
    DECLARE
      v_year text := split_part(v_rec.code, '-', 2);
    BEGIN
      IF v_year ~ '^[0-9]+$' THEN
        v_max_suffix := substring(v_rec.code from '-([0-9]+)$')::int;
        INSERT INTO public.code_sequences (prefix, year, last_number)
        VALUES ('BE', v_year::int, v_max_suffix)
        ON CONFLICT (prefix, year) 
        DO UPDATE SET last_number = GREATEST(code_sequences.last_number, EXCLUDED.last_number);
      END IF;
    END;
  END LOOP;

  -- 3. Synchronisation pour la table 'da_local' (préfixe 'DA-LOC')
  FOR v_rec IN 
    SELECT code FROM public.da_local WHERE code LIKE 'DA-LOC-%'
  LOOP
    DECLARE
      v_year text := split_part(v_rec.code, '-', 3);
    BEGIN
      IF v_year ~ '^[0-9]+$' THEN
        v_max_suffix := substring(v_rec.code from '-([0-9]+)$')::int;
        INSERT INTO public.code_sequences (prefix, year, last_number)
        VALUES ('DA-LOC', v_year::int, v_max_suffix)
        ON CONFLICT (prefix, year) 
        DO UPDATE SET last_number = GREATEST(code_sequences.last_number, EXCLUDED.last_number);
      END IF;
    END;
  END LOOP;

  -- 4. Synchronisation pour la table 'da_import' (préfixe 'DA-IMP')
  FOR v_rec IN 
    SELECT code FROM public.da_import WHERE code LIKE 'DA-IMP-%'
  LOOP
    DECLARE
      v_year text := split_part(v_rec.code, '-', 3);
    BEGIN
      IF v_year ~ '^[0-9]+$' THEN
        v_max_suffix := substring(v_rec.code from '-([0-9]+)$')::int;
        INSERT INTO public.code_sequences (prefix, year, last_number)
        VALUES ('DA-IMP', v_year::int, v_max_suffix)
        ON CONFLICT (prefix, year) 
        DO UPDATE SET last_number = GREATEST(code_sequences.last_number, EXCLUDED.last_number);
      END IF;
    END;
  END LOOP;

  -- 5. Synchronisation pour la table 'production_orders' (préfixes 'OF-*')
  FOR v_rec IN 
    SELECT code FROM public.production_orders WHERE code LIKE 'OF-%'
  LOOP
    DECLARE
      v_pref_part2 text := split_part(v_rec.code, '-', 2);
      v_year text := split_part(v_rec.code, '-', 3);
    BEGIN
      IF v_year ~ '^[0-9]+$' THEN
        v_max_suffix := substring(v_rec.code from '-([0-9]+)$')::int;
        INSERT INTO public.code_sequences (prefix, year, last_number)
        VALUES ('OF-' || v_pref_part2, v_year::int, v_max_suffix)
        ON CONFLICT (prefix, year) 
        DO UPDATE SET last_number = GREATEST(code_sequences.last_number, EXCLUDED.last_number);
      END IF;
    END;
  END LOOP;

  -- 6. Synchronisation pour la table 'bom_headers' (préfixe 'BOM')
  FOR v_rec IN 
    SELECT code FROM public.bom_headers WHERE code LIKE 'BOM-%'
  LOOP
    DECLARE
      v_year text := split_part(v_rec.code, '-', 2);
    BEGIN
      IF v_year ~ '^[0-9]+$' THEN
        v_max_suffix := substring(v_rec.code from '-([0-9]+)$')::int;
        INSERT INTO public.code_sequences (prefix, year, last_number)
        VALUES ('BOM', v_year::int, v_max_suffix)
        ON CONFLICT (prefix, year) 
        DO UPDATE SET last_number = GREATEST(code_sequences.last_number, EXCLUDED.last_number);
      END IF;
    END;
  END LOOP;

END $$;
