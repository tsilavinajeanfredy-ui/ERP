const { createClient } = require('@supabase/supabase-js')

module.exports = async function handler(req: any, res: any) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers['x-cron-secret'] !== secret) {
    return res.status(401).send('Unauthorized')
  }

  try {
    const supabase = createClient(
      process.env.EXPO_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    await supabase.from('articles').select('id').limit(1)

    res.status(200).json({ ok: true, ts: new Date().toISOString() })
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message ?? String(error) })
  }
}