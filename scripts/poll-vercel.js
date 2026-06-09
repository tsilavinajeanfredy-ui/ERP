const { execSync } = require('child_process');
const fs = require('fs');
require('dotenv').config();
const fetch = require('node-fetch');

const url = process.argv[2] || process.env.POLL_VERCEL_URL || 'https://erp-i642z0igp-tsilavinas-projects-018b600b.vercel.app';
const notifyEmail = process.argv[3] || process.env.POLL_NOTIFY_EMAIL || null;

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sendEdgeNotification(urlToReport, email) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE config');
  const functionsDomain = SUPABASE_URL.replace('.supabase.co', '.functions.supabase.co');
  const endpoint = `${functionsDomain}/send-notification`;
  const body = {
    role: 'ADMIN',
    subject: 'Déploiement production — bundle disponible',
    message: `La production (${urlToReport}) sert désormais le bundle Expo (AppEntry) et est disponible.`,
    type: 'internal',
    category: 'SYSTEM',
    metadata: { url: urlToReport },
    send_email: true,
    email_to: email || undefined,
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Edge function error ${res.status}: ${txt}`);
  }
  return true;
}

async function sendSmtp(email, subject, text) {
  const nodemailer = require('nodemailer');
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;
  if (!host || !port || !user || !pass) throw new Error('Missing SMTP config');

  const transporter = nodemailer.createTransport({ host, port: parseInt(port, 10), auth: { user, pass }, secure: Number(port) === 465 });
  await transporter.sendMail({ from, to: email, subject, text });
  return true;
}

(async function poll(){
  let attempt = 0;
  while (true) {
    attempt++;
    console.log('Attempt', attempt);
    try {
      const out = execSync(`npx vercel curl ${url}`, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
      if (/\/_expo\/static\/js\/web\/AppEntry-/.test(out)) {
        fs.writeFileSync('prod_latest_index.html', out, 'utf8');
        console.log('FOUND - saved prod_latest_index.html');
        // Try sending Edge notification first
        if (notifyEmail) {
          try {
            await sendEdgeNotification(url, notifyEmail);
            console.log('Edge notification sent to', notifyEmail);
          } catch (e) {
            console.warn('Edge notification failed:', e.message);
            // Fallback to SMTP if configured
            try {
              await sendSmtp(notifyEmail, 'Déploiement production prêt', `La production (${url}) sert désormais le bundle Expo.`);
              console.log('SMTP fallback email sent to', notifyEmail);
            } catch (smtpErr) {
              console.error('SMTP fallback failed:', smtpErr.message);
            }
          }
        }
        process.exit(0);
      } else {
        console.log('Not found, sleeping 15s');
      }
    } catch (err) {
      console.log('Error fetching:', err.message);
    }
    await new Promise(r => setTimeout(r, 15000));
  }
})();
