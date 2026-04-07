// supabase/functions/send-invite/index.ts
// Deploy: supabase functions deploy send-invite
// Uses Resend free tier (3000 emails/month)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Authenticate the calling user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing auth header')

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) throw new Error('Unauthorized')

    const { invitationId, bookName, inviterName, inviteeEmail } = await req.json()

    // Verify invitation belongs to this user
    const { data: invitation, error: invErr } = await supabase
      .from('invitations')
      .select('id, book_id, status')
      .eq('id', invitationId)
      .eq('inviter_id', user.id)
      .eq('status', 'pending')
      .single()

    if (invErr || !invitation) throw new Error('Invitation not found')

    // Send email via Resend
    const resendKey = Deno.env.get('RESEND_API_KEY')
    const appUrl = Deno.env.get('APP_URL') || 'cashflow://auth/callback'

    const emailBody = {
      from: 'CashFlow <noreply@yourdomain.com>',
      to: [inviteeEmail],
      subject: `${inviterName} invited you to "${bookName}" on CashFlow`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, sans-serif; background: #f9fafb; margin: 0; padding: 40px 20px; }
            .container { max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; padding: 40px; }
            .logo { font-size: 24px; font-weight: 800; color: #6366f1; margin-bottom: 32px; }
            h1 { font-size: 22px; color: #111827; margin: 0 0 12px; }
            p { color: #6b7280; line-height: 1.6; margin: 0 0 24px; }
            .btn { display: inline-block; background: #6366f1; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; }
            .footer { margin-top: 32px; font-size: 12px; color: #9ca3af; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">💰 CashFlow</div>
            <h1>You're invited!</h1>
            <p><strong>${inviterName}</strong> has invited you to collaborate on the book <strong>"${bookName}"</strong> in CashFlow.</p>
            <p>Open the CashFlow app and go to Notifications to accept or decline this invitation.</p>
            <a href="${appUrl}?invitationId=${invitationId}" class="btn">Open CashFlow</a>
            <div class="footer">
              <p>If you don't have CashFlow, download it and sign in with this email address to see the invitation.</p>
              <p>If you didn't expect this invitation, you can safely ignore this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify(emailBody),
    })

    if (!emailRes.ok) {
      const err = await emailRes.text()
      throw new Error(`Email send failed: ${err}`)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
