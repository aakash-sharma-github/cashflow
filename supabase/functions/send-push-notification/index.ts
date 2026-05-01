// supabase/functions/send-push-notification/index.ts
// Called by Supabase Database Webhooks for entries + invitations.
// Sends push notifications via Expo Push API → FCM → device.
//
// Deploy: supabase functions deploy send-push-notification

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function formatAmount(amount: number): string {
    if (!amount && amount !== 0) return '0'
    return new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR',
        minimumFractionDigits: 0, maximumFractionDigits: 2,
    }).format(amount)
}

async function sendExpoPush(messages: object[]) {
    const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Accept-Encoding': 'gzip, deflate' },
        body: JSON.stringify(messages),
    })
    const json = await res.json()
    console.log('[send-push] Expo API response:', JSON.stringify(json))
    return json
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

    try {
        const payload = await req.json()
        console.log('[send-push] Received webhook:', JSON.stringify(payload).slice(0, 300))

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        )

        const eventType = payload.type    // INSERT | UPDATE | DELETE
        const table = payload.table   // entries | invitations
        const row = payload.record ?? payload.old_record

        if (!row) {
            console.log('[send-push] No row data in payload')
            return new Response('no row', { status: 200 })
        }

        // ── ENTRIES ────────────────────────────────────────────────
        if (table === 'entries') {
            const bookId = row.book_id
            const actorUserId = row.user_id

            // Book name
            const { data: book, error: bookErr } = await supabase
                .from('books').select('name').eq('id', bookId).single()
            if (bookErr) console.error('[send-push] book lookup error:', bookErr)
            const bookName = book?.name ?? 'your book'

            // Actor name
            const { data: actor, error: actorErr } = await supabase
                .from('profiles').select('full_name, email').eq('id', actorUserId).single()
            if (actorErr) console.error('[send-push] actor lookup error:', actorErr)
            const actorName = actor?.full_name || actor?.email?.split('@')[0] || 'A member'

            // All OTHER members with tokens — use explicit select, no implicit join
            const { data: memberships, error: memErr } = await supabase
                .from('book_members')
                .select('user_id')
                .eq('book_id', bookId)
                .neq('user_id', actorUserId)

            if (memErr) console.error('[send-push] memberships error:', memErr)
            if (!memberships?.length) {
                console.log('[send-push] No other members in book', bookId)
                return new Response('no other members', { status: 200 })
            }

            const memberIds = memberships.map(m => m.user_id)
            console.log('[send-push] Other members:', memberIds)

            // Get tokens in a separate query (more reliable than join)
            const { data: profiles, error: profErr } = await supabase
                .from('profiles')
                .select('id, push_token')
                .in('id', memberIds)
                .not('push_token', 'is', null)

            if (profErr) console.error('[send-push] profiles error:', profErr)

            const tokens = (profiles ?? []).filter(p => !!p.push_token)
            console.log('[send-push] Tokens found:', tokens.length, 'of', memberIds.length, 'members')

            if (!tokens.length) {
                return new Response('no push tokens found', { status: 200 })
            }

            // Build notification content
            const amount = formatAmount(row.amount)
            const entryType = row.type
            const note = row.note

            let title = ''
            let body = ''

            if (eventType === 'INSERT') {
                const arrow = entryType === 'cash_in' ? '↑' : '↓'
                const label = entryType === 'cash_in' ? 'Cash In' : 'Cash Out'
                title = `${arrow} ${amount} ${label} — ${bookName}`
                body = note ? `"${note}" by ${actorName}` : `${actorName} added a ${label.toLowerCase()} entry`
            } else if (eventType === 'UPDATE') {
                title = `✏️ Entry Updated — ${bookName}`
                body = `${actorName} edited a ${amount} entry`
            } else if (eventType === 'DELETE') {
                title = `🗑 Entry Removed — ${bookName}`
                body = `${actorName} deleted an entry`
            }

            const messages = tokens.map(p => ({
                to: p.push_token,
                title,
                body,
                sound: 'default',
                badge: 1,
                priority: 'high',
                channelId: 'cashflow_entries',
                data: { type: eventType === 'INSERT' ? 'entry_added' : eventType === 'UPDATE' ? 'entry_updated' : 'entry_deleted', bookId },
            }))

            const result = await sendExpoPush(messages)
            return new Response(JSON.stringify({ sent: messages.length, result }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // ── INVITATIONS ────────────────────────────────────────────
        if (table === 'invitations' && eventType === 'INSERT') {
            const inviteeEmail = row.invitee_email
            const bookId = row.book_id
            const inviterId = row.inviter_id

            const { data: book } = await supabase.from('books').select('name').eq('id', bookId).single()
            const bookName = book?.name ?? 'a book'

            const { data: inviter } = await supabase.from('profiles').select('full_name, email').eq('id', inviterId).single()
            const inviterName = inviter?.full_name || inviter?.email?.split('@')[0] || 'Someone'

            // Look up invitee by email
            const { data: invitee, error: invErr } = await supabase
                .from('profiles').select('push_token').eq('email', inviteeEmail).single()

            if (invErr) console.error('[send-push] invitee lookup error:', invErr)

            const token = invitee?.push_token
            if (!token) {
                console.log('[send-push] Invitee has no push token:', inviteeEmail)
                return new Response('invitee has no push token', { status: 200 })
            }

            const result = await sendExpoPush([{
                to: token,
                title: '📖 Book Invitation',
                body: `${inviterName} invited you to join "${bookName}"`,
                sound: 'default',
                badge: 1,
                priority: 'high',
                channelId: 'cashflow_invitations',
                data: { type: 'invitation', bookId },
            }])

            return new Response(JSON.stringify({ sent: 1, result }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        console.log('[send-push] Unhandled event:', eventType, table)
        return new Response('unhandled event', { status: 200 })

    } catch (e) {
        console.error('[send-push] Unhandled error:', e)
        return new Response(JSON.stringify({ error: String(e) }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})