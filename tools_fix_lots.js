const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function diagnose() {
  console.log('=== Diagnostic type cqlib_status ===\n');

  // Test 1: Essayer d'insérer directement un lot avec EN_ATTENTE pour voir si c'est possible
  // On utilise un article existant quelconque pour tester
  const { data: articles } = await supabase.from('articles').select('id').eq('article_type', 'PF').limit(1);
  const articleId = articles?.[0]?.id;

  if (articleId) {
    const { error: testError } = await supabase.from('lots').insert({
      code: `TEST-EN-ATTENTE-${Date.now()}`,
      article_id: articleId,
      qty_received: 0.001,
      qty_current: 0.001,
      unit: 'kg',
      cqlib_status: 'EN_ATTENTE',
      reception_date: new Date().toISOString().split('T')[0],
    });

    if (testError) {
      console.log('❌ EN_ATTENTE REJETÉ:', testError.code, testError.message);
      if (testError.code === '22P02') {
        console.log('\n→ La colonne est un ENUM et EN_ATTENTE n\'y est pas encore.');
        console.log('\nSQL à exécuter dans Supabase SQL Editor:');
        console.log('───────────────────────────────────────────────────────');
        console.log("-- Trouver le vrai nom de l'enum:");
        console.log("SELECT typname, nspname FROM pg_type JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace WHERE typtype = 'e' AND typname ILIKE '%cqlib%' OR typname ILIKE '%status%';");
        console.log('───────────────────────────────────────────────────────');
      } else if (testError.code === '23502') {
        console.log('\n→ La colonne est TEXT (NOT NULL sans valeur par défaut). Pas besoin de migration enum!');
      } else {
        console.log('\n→ Autre erreur - vérifiez les RLS policies ou la structure de la table.');
      }
    } else {
      console.log('✅ EN_ATTENTE ACCEPTÉ! La migration est déjà appliquée OU la colonne est TEXT.');
      // Nettoyer le lot de test
      await supabase.from('lots').delete().like('code', 'TEST-EN-ATTENTE-%');
      console.log('Lot de test supprimé.');
    }
  }

  // Test 2: Essayer QUARANTAINE pour vérifier que la table est accessible
  console.log('\n=== Test accès table lots ===');
  const { data: lotsCount, error: lotsErr } = await supabase
    .from('lots')
    .select('id, cqlib_status', { count: 'exact', head: true });

  if (lotsErr) {
    console.log('❌ Erreur accès lots:', lotsErr.message);
  } else {
    console.log('✅ Table lots accessible');
  }

  // Test 3: Essayer de lire les valeurs distinctes de cqlib_status
  const { data: statuses } = await supabase
    .from('lots')
    .select('cqlib_status')
    .limit(50);

  if (statuses) {
    const unique = [...new Set(statuses.map(l => l.cqlib_status))];
    console.log('\nValeurs cqlib_status présentes dans la DB:', unique);
  }
}

diagnose().catch(e => { console.error(e); process.exit(1); });
