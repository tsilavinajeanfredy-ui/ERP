// Expo Web (Metro) inline les variables EXPO_PUBLIC_* statiquement au build.
// Il faut les référencer LITTÉRALEMENT — pas via une fonction dynamique.
//
// ⚠️  SÉCURITÉ : Ne JAMAIS mettre EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ici.
//     Tout préfixe EXPO_PUBLIC_ est inliné dans le bundle JS livré au navigateur.
//     La service role key bypasse le RLS et donne un accès admin total à la BDD.
//     Si des opérations admin sont nécessaires, utiliser une Edge Function Supabase.

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const env = {
  supabaseUrl:
    typeof supabaseUrl === 'string' && supabaseUrl.trim().length > 0
      ? supabaseUrl.trim()
      : undefined,
  supabaseAnonKey:
    typeof supabaseAnonKey === 'string' && supabaseAnonKey.trim().length > 0
      ? supabaseAnonKey.trim()
      : undefined,
};
