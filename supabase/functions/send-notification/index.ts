import { serve } from 'https://deno.land/std@0.170.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

interface NotificationPayload {
  role: string;
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'error' | 'success';
  category?: 'QUALITY' | 'PRODUCTION' | 'PURCHASING' | 'STOCK' | 'SYSTEM';
  metadata?: Record<string, unknown>;
  send_email?: boolean;
}

serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const payload: NotificationPayload = await req.json();

    if (!payload.role || !payload.title) {
      return new Response(JSON.stringify({ error: 'role et title requis' }), { status: 400 });
    }

    // Insérer la notification en base
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        role: payload.role,
        title: payload.title,
        message: payload.message || payload.title,
        type: payload.type || 'info',
        category: payload.category || 'SYSTEM',
        metadata: payload.metadata || {},
      })
      .select();

    if (error) throw error;

    // Envoi d'email si demandé (via Resend)
    if (payload.send_email) {
      const resendApiKey = Deno.env.get('RESEND_API_KEY');
      if (resendApiKey) {
        // Récupérer les emails des utilisateurs ayant ce rôle
        const { data: users } = await supabase
          .from('users')
          .select('email, full_name')
          .eq('role', payload.role)
          .eq('active', true);

        if (users && users.length > 0) {
          const emailPromises = users.map(user =>
            fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: 'ERP GSI <notifications@sipromad.mg>',
                to: user.email,
                subject: `[GSI] ${payload.title}`,
                html: `
                  <h2>${payload.title}</h2>
                  <p>${payload.message}</p>
                  <hr />
                  <p style="color: #888; font-size: 12px;">ERP GSI - Notification automatique</p>
                `,
              }),
            })
          );

          await Promise.allSettled(emailPromises);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, notification: data }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
