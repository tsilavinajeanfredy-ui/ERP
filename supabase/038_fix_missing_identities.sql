-- ==============================================================================
-- ERP GSI - MIGRATION 038 : CORRECTIF DES IDENTITÉS MANQUANTES (auth.identities)
-- Résout l'erreur 500 / 400 "Database error querying schema" sur les connexions
-- ==============================================================================

-- Dans Supabase GoTrue, l'insertion manuelle dans auth.users ne crée pas d'identité.
-- Lors de la connexion, GoTrue plante car l'utilisateur n'a pas d'identité rattachée.
-- Ce script associe une identité e-mail valide à chaque compte inséré de manière version-agnostique.

DO $$
DECLARE
    has_provider_id boolean;
BEGIN
    -- Vérifier si la colonne provider_id existe dans auth.identities
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' 
        AND table_name = 'identities' 
        AND column_name = 'provider_id'
    ) INTO has_provider_id;

    IF has_provider_id THEN
        -- Nouvelle version de Supabase avec provider_id
        INSERT INTO auth.identities (
          id,
          user_id,
          identity_data,
          provider,
          provider_id,
          last_sign_in_at,
          created_at,
          updated_at
        )
        SELECT 
          id, 
          id, 
          jsonb_build_object('sub', id, 'email', email),
          'email',
          id::text,
          now(),
          now(),
          now()
        FROM auth.users
        WHERE email LIKE '%@gsi.mg' AND email <> 'admin@gsi.mg'
        AND NOT EXISTS (
          SELECT 1 FROM auth.identities WHERE auth.identities.user_id = auth.users.id
        );
    ELSE
        -- Ancienne version de Supabase sans provider_id
        INSERT INTO auth.identities (
          id,
          user_id,
          identity_data,
          provider,
          last_sign_in_at,
          created_at,
          updated_at
        )
        SELECT 
          id, 
          id, 
          jsonb_build_object('sub', id, 'email', email),
          'email',
          now(),
          now(),
          now()
        FROM auth.users
        WHERE email LIKE '%@gsi.mg' AND email <> 'admin@gsi.mg'
        AND NOT EXISTS (
          SELECT 1 FROM auth.identities WHERE auth.identities.user_id = auth.users.id
        );
    END IF;
END $$;
