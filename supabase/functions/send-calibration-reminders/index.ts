import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseKey)

interface CCalibrationAlert {
  instrument_id: string
  instrument_name: string
  next_calibration_at: string
  days_remaining: number
  overdue: boolean
  recipient_emails: string[]
}

/**
 * CRON (tous les jours 08:00 UTC) :
 * Envoyer rappels pour instruments en retard ou à J-7 de calibration
 * 
 * Workflow :
 * 1. Chercher instruments avec next_calibration_at <= today + 7 jours
 * 2. Chercher rôles LABO + MAGA + ADMIN
 * 3. Créer notification pour chaque utilisateur
 * 4. Insérer record dans notifications_push
 * 5. Retourner stats d'envoi
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
    const today = new Date()
    const sevenDaysLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)

    console.log(`[CALIBRATION_REMINDERS] Starting check. Today: ${today.toISOString()}`)

    // ─── 1. Récupérer instruments en retard ou à J-7 ─────────────────────────────
    const { data: instrumentsNeedingReminder, error: fetchErr } = await supabase
      .from('instruments')
      .select('id, name, next_calibration_at')
      .or(
        `next_calibration_at.lt.${today.toISOString()},` +
        `and(next_calibration_at.gte.${today.toISOString()},next_calibration_at.lte.${sevenDaysLater.toISOString()})`
      )

    if (fetchErr) {
      console.error('[CALIBRATION_REMINDERS] Fetch error:', fetchErr)
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[CALIBRATION_REMINDERS] Found ${instrumentsNeedingReminder?.length || 0} instruments`)

    if (!instrumentsNeedingReminder || instrumentsNeedingReminder.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No instruments needing reminders',
        count: 0,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ─── 2. Récupérer destinataires (rôles labo/qualité/magasin/admin réels) ────
    const { data: recipients, error: recipientErr } = await supabase
      .from('users')
      .select('id, email, role')
      .eq('active', true)
      .in('role', ['TLAB', 'RQ', 'MAGA', 'ADMIN', 'SUPER_ADMIN', 'DSI'])

    if (recipientErr) {
      console.error('[CALIBRATION_REMINDERS] Recipient fetch error:', recipientErr)
      return new Response(JSON.stringify({ error: recipientErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ─── 3. Créer notifications pour chaque instrument + utilisateur ──────────────
    const notificationsToCreate = []
    let reminderCount = 0

    for (const instrument of instrumentsNeedingReminder) {
      const nextDate = new Date(instrument.next_calibration_at)
      const daysRemaining = Math.floor(
        (nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      )
      const overdue = daysRemaining < 0
      const urgency = overdue ? 'URGENT' : daysRemaining <= 3 ? 'HAUTE' : 'NORMALE'

      const title = overdue
        ? `⚠️ ÉTALONNAGE EN RETARD: ${instrument.name}`
        : `📅 ÉTALONNAGE À J-${daysRemaining}: ${instrument.name}`

      const message = overdue
        ? `L'instrument ${instrument.name} aurait dû être étalonné le ${nextDate.toLocaleDateString('fr-FR')}`
        : `L'instrument ${instrument.name} doit être étalonné dans ${daysRemaining} jour(s)`

      for (const recipient of recipients!) {
        notificationsToCreate.push({
          user_id: recipient.id,
          role: recipient.role,
          title,
          message,
          type: overdue ? 'error' : 'warning',
          read: false,
          category: 'QUALITY',
          metadata: {
            kind: 'CALIBRATION_REMINDER',
            urgency,
            related_table: 'instruments',
            related_id: instrument.id,
            days_remaining: daysRemaining,
            overdue,
            action_url: '/metrology',
            screen: 'CalibrationManagement',
          },
          created_at: new Date().toISOString(),
        })
        reminderCount++
      }
    }

    // ─── 4. Insérer en batch ───────────────────────────────────────────────────
    if (notificationsToCreate.length > 0) {
      const { error: insertErr } = await supabase
        .from('notifications')
        .insert(notificationsToCreate)

      if (insertErr) {
        console.error('[CALIBRATION_REMINDERS] Insert error:', insertErr)
        return new Response(JSON.stringify({ error: insertErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // ─── 5. Log + Response ────────────────────────────────────────────────────
    console.log(`[CALIBRATION_REMINDERS] Success. Sent ${reminderCount} notifications`)

    return new Response(JSON.stringify({
      success: true,
      message: 'Calibration reminders sent successfully',
      instruments_processed: instrumentsNeedingReminder.length,
      total_notifications_created: reminderCount,
      recipients_count: recipients?.length || 0,
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[CALIBRATION_REMINDERS] Unexpected error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
