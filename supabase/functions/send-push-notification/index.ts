// Retired endpoint. Push delivery now runs through the database trigger and
// process_push_message path; see migration 006_pgmq_push_notifications.sql.
// Keep gateway JWT verification enabled and reject all requests defensively.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  return new Response(JSON.stringify({ error: 'This endpoint is retired' }), {
    status: 410,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
