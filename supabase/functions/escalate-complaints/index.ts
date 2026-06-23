import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * CRON (tous les jours, ex. 07:00 UTC) :
 * Escalade les réclamations client non traitées dans les délais.
 *
 * Paliers (cf. migration 059) :
 *   J+1 → RQ (niveau 1), J+3 → DPI (niveau 2), J+6 → ADMIN/Direction (niveau 3).
 *
 * Délègue toute la logique à la fonction SQL escalate_overdue_complaints(),
 * qui incrémente escalation_level, horodate escalated_at et insère les
 * notifications correspondantes de façon transactionnelle.
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
    console.log(`[COMPLAINT_ESCALATION] Starting check at ${new Date().toISOString()}`)

    const { data, error } = await supabase.rpc('escalate_overdue_complaints')

    if (error) {
      console.error('[COMPLAINT_ESCALATION] RPC error:', error)
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    const escalatedCount = typeof data === 'number' ? data : 0
    console.log(`[COMPLAINT_ESCALATION] Done. Escalated: ${escalatedCount}`)

    return new Response(JSON.stringify({ success: true, escalated: escalatedCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    console.error('[COMPLAINT_ESCALATION] Unexpected error:', err)
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
