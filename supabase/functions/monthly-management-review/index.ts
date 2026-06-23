import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * CRON (le 1er de chaque mois, ex. 01:00 UTC) :
 * Génère le PV de revue de direction pré-rempli pour le mois précédent.
 * Délègue à la fonction SQL generate_management_review() (cf. migration 065).
 * Un mois cible optionnel peut être passé dans le body : { "month": "2026-05-01" }.
 */

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let month: string | null = null
    try {
      const body = await req.json()
      month = body?.month ?? null
    } catch (_) {
      // pas de body → mois précédent (défaut SQL)
    }

    console.log(`[MGMT_REVIEW] Generating review${month ? ' for ' + month : ' (previous month)'}`)

    const { data, error } = await supabase.rpc(
      'generate_management_review',
      month ? { p_month: month } : {},
    )

    if (error) {
      console.error('[MGMT_REVIEW] RPC error:', error)
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    console.log(`[MGMT_REVIEW] Done. Review id: ${data}`)

    return new Response(JSON.stringify({ success: true, review_id: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    console.error('[MGMT_REVIEW] Unexpected error:', err)
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
