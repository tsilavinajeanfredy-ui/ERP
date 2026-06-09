import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Bloquer si un secret est configuré et qu'il ne correspond pas
  const secret = process.env.CRON_SECRET
  if (secret && req.headers['x-cron-secret'] !== secret) {
    return res.status(401).send('Unauthorized')
  }

  try {
    const supabase = createClient(
      process.env.EXPO_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Simple requête légère pour réveiller Supabase
    await supabase.from('articles').select('id').limit(1)

    res.status(200).json({ ok: true, ts: new Date().toISOString() })
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message ?? String(error) })
  }
}
