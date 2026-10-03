// Authenticated invitation email dispatcher. All message data comes from the
// pending invitation and related database rows, never from client JSON.
import { serve } from 'std/http/server.ts'
import { createClient } from '@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!)
}

function invitationUrl(baseUrl: string, invitationId: string): string {
  const separator = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${separator}invitationId=${encodeURIComponent(invitationId)}`
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  const bearer = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!bearer) return jsonResponse({ error: 'Unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('INVITE_FROM_EMAIL')
  if (!supabaseUrl || !serviceRoleKey || !resendKey || !from) {
    console.error('[cashflow-invite] Required server configuration is missing')
    return jsonResponse({ error: 'Invitation email is temporarily unavailable' }, 503)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user }, error: authError } = await admin.auth.getUser(bearer)
  if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400)
  }
  const invitationId = (payload as { invitationId?: unknown } | null)?.invitationId
  if (typeof invitationId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(invitationId)) {
    return jsonResponse({ error: 'Invalid invitation' }, 400)
  }

  const { data: dispatch, error: claimError } = await admin
    .rpc('claim_invitation_email_dispatch', {
      p_invitation_id: invitationId,
      p_inviter_id: user.id,
    })
    .maybeSingle()

  if (claimError || !dispatch) {
    console.warn('[cashflow-invite] Invitation dispatch was not authorized or unavailable')
    return jsonResponse({ error: 'Invitation not found or unavailable' }, 404)
  }
  if (dispatch.dispatch_status === 'already_dispatched') {
    return jsonResponse({ success: true, alreadySent: true })
  }
  if (dispatch.dispatch_status === 'rate_limited') {
    return jsonResponse({ error: 'Invitation email limit reached. Try again later.' }, 429)
  }
  if (dispatch.dispatch_status !== 'claimed') {
    return jsonResponse({ error: 'Invitation email is unavailable' }, 409)
  }

  const recipient = String(dispatch.invitee_email ?? '').trim().toLowerCase()
  if (recipient.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    console.error('[cashflow-invite] Invitation contains an invalid recipient address')
    return jsonResponse({ error: 'Invitation email is unavailable' }, 422)
  }

  const cleanText = (value: unknown, max: number) =>
    String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max)
  const inviterName = escapeHtml(cleanText(dispatch.inviter_name || 'A CashFlow member', 120))
  const bookName = escapeHtml(cleanText(dispatch.book_name, 120))
  const appUrl = Deno.env.get('APP_URL') || 'cashflow://auth/callback'
  const link = escapeHtml(invitationUrl(appUrl, invitationId))
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject: 'You have a CashFlow book invitation',
      html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px">
        <main style="max-width:480px;margin:auto;background:white;border-radius:16px;padding:32px">
          <h1>You're invited to CashFlow</h1>
          <p><strong>${inviterName}</strong> invited you to collaborate on <strong>${bookName}</strong>.</p>
          <p>Sign in to CashFlow with the email address that received this invitation to accept or decline it.</p>
          <p><a href="${link}">Open CashFlow</a></p>
        </main></body></html>`,
    }),
  })

  if (!emailRes.ok) {
    // The dispatch is intentionally claimed once to prevent replay/spam. A
    // failed provider delivery requires a new invitation to retry safely.
    console.error('[cashflow-invite] Email provider rejected the dispatch', emailRes.status)
    return jsonResponse({ error: 'Invitation was created, but its email could not be sent' }, 502)
  }

  return jsonResponse({ success: true })
})
