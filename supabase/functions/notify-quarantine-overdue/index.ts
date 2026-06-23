import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * CRON (tous les jours, ex. 08:00 UTC) :
 * Alerte la RQ pour chaque lot resté en QUARANTAINE / BLOQUE depuis > 7 jours.
 * Délègue à la fonction SQL notify_quarantine_overdue() (cf. migration 062),
 * qui déduplique les alertes (une par lot et par jour).
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
    console.log(`[QUARANTINE_OVERDUE] Starting check at ${new Date().toISOString()}`)

    const { data, error } = await supabase.rpc('notify_quarantine_overdue')

    if (error) {
      console.error('[QUARANTINE_OVERDUE] RPC error:', error)
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    const alertCount = typeof data === 'number' ? data : 0
    console.log(`[QUARANTINE_OVERDUE] Done. Alerts created: ${alertCount}`)

    return new Response(JSON.stringify({ success: true, alerts: alertCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    console.error('[QUARANTINE_OVERDUE] Unexpected error:', err)
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
