import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const API_URL = "https://api.exchangerate-api.com/v4/latest/USD";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const response = await fetch(API_URL);
    const data = await response.json();

    if (!data || !data.rates) {
      throw new Error("Impossible de récupérer les taux depuis l'API.");
    }

    const usdToMga = data.rates['MGA'];
    if (!usdToMga) throw new Error("Taux MGA non trouvé dans l'API.");

    const eurToMga = usdToMga / (data.rates['EUR'] || 1);
    const today = new Date().toISOString().split('T')[0];

    const updates = [
      { from_currency: 'USD', to_currency: 'MGA', rate: usdToMga, effective_date: today, source: 'API' },
      { from_currency: 'EUR', to_currency: 'MGA', rate: eurToMga, effective_date: today, source: 'API' },
    ];

    for (const update of updates) {
      const { error } = await supabaseAdmin
        .from('exchange_rates')
        .upsert(update, { onConflict: 'from_currency,to_currency,effective_date' });

      if (error) throw error;
    }

    return new Response(JSON.stringify({ message: "Taux de change mis à jour avec succès", updates }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
})
