// supabase/functions/send-push-notification/index.ts
// Called by Supabase Database Webhooks when entries are inserted/updated/deleted
// and when invitations are created.
//
// Deploy: supabase functions deploy send-push-notification
//
// This function:
//  1. Receives the webhook payload (table row data)
//  2. Looks up all book members except the actor
//  3. Gets their push tokens from the profiles table
//  4. Sends Expo push notifications to all of them

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WebhookPayload {
    type: 'INSERT' | 'UPDATE' | 'DELETE'
    table: string
    schema: string
    record: Record<string, any> | null       // new row (INSERT/UPDATE)
    old_record: Record<string, any> | null       // old row (UPDATE/DELETE)
}

function formatAmount(amount: number): string {
    if (!amount && amount !== 0) return ''
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(amount)
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders })
    }

    try {
        const payload: WebhookPayload = await req.json()
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        )

        const row = payload.record ?? payload.old_record
        const eventType = payload.type   // INSERT, UPDATE, DELETE
        const table = payload.table  // entries, invitations

        if (!row) return new Response('no row data', { status: 200 })

        // ── Handle entry events ─────────────────────────────────
        if (table === 'entries') {
            const bookId = row.book_id
            const actorUserId = row.user_id
            const amount = formatAmount(row.amount)
            const entryType = row.type   // 'cash_in' | 'cash_out'
            const note = row.note

            // Get book name
            const { data: book } = await supabase
                .from('books')
                .select('name')
                .eq('id', bookId)
                .single()
            const bookName = book?.name ?? 'your book'

            // Get actor name
            const { data: actor } = await supabase
                .from('profiles')
                .select('full_name, email')
                .eq('id', actorUserId)
                .single()
            const actorName = actor?.full_name || actor?.email?.split('@')[0] || 'A member'

            // Get all OTHER book members who have push tokens
            const { data: members } = await supabase
                .from('book_members')
                .select('user_id, profiles(push_token)')
                .eq('book_id', bookId)
                .neq('user_id', actorUserId)

            if (!members?.length) return new Response('no other members', { status: 200 })

            // Build notification content per event type
            let title = ''
            let body = ''

            if (eventType === 'INSERT') {
                // const arrow = entryType === 'cash_in' ? '↑' : '↓'
                const label = entryType === 'cash_in' ? 'Cash In' : 'Cash Out'
                title = `${amount} ${label} — ${bookName}`
                body = note
                    ? `"${note}" — added by ${actorName}`
                    : `${actorName} added a new ${label.toLowerCase()} entry`
            } else if (eventType === 'UPDATE') {
                title = `✏️ Entry Updated — ${bookName}`
                body = `${actorName} edited a ${amount} entry`
            } else if (eventType === 'DELETE') {
                title = `🗑 Entry Removed — ${bookName}`
                body = `${actorName} deleted an entry`
            }

            // Send to all members with tokens
            const messages = members
                .map(m => ({ token: (m.profiles as any)?.push_token, title, body }))
                .filter(m => !!m.token)
                .map(m => ({
                    to: m.token,
                    title: m.title,
                    body: m.body,
                    sound: 'default',
                    badge: 1,
                    priority: 'high',
                    data: { type: eventType === 'INSERT' ? 'entry_added' : eventType === 'UPDATE' ? 'entry_updated' : 'entry_deleted', bookId },
                }))

            if (!messages.length) return new Response('no push tokens', { status: 200 })

            await fetch(EXPO_PUSH_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(messages),
            })

            return new Response(JSON.stringify({ sent: messages.length }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // ── Handle invitation events ────────────────────────────
        if (table === 'invitations' && eventType === 'INSERT') {
            const inviteeEmail = row.invitee_email
            const bookId = row.book_id
            const inviterId = row.inviter_id

            // Get book name
            const { data: book } = await supabase
                .from('books')
                .select('name')
                .eq('id', bookId)
                .single()
            const bookName = book?.name ?? 'a book'

            // Get inviter name
            const { data: inviter } = await supabase
                .from('profiles')
                .select('full_name, email')
                .eq('id', inviterId)
                .single()
            const inviterName = inviter?.full_name || inviter?.email?.split('@')[0] || 'Someone'

            // Get invitee's push token (they may not have the app — that's fine)
            const { data: invitee } = await supabase
                .from('profiles')
                .select('push_token')
                .eq('email', inviteeEmail)
                .single()

            const token = invitee?.push_token
            if (!token) return new Response('invitee has no push token', { status: 200 })

            await fetch(EXPO_PUSH_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: token,
                    title: '📖 Book Invitation',
                    body: `${inviterName} invited you to join "${bookName}". Tap to accept or decline.`,
                    sound: 'default',
                    badge: 1,
                    priority: 'high',
                    data: { type: 'invitation', bookId },
                }),
            })

            return new Response(JSON.stringify({ sent: 1 }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        return new Response('unhandled event', { status: 200 })
    } catch (e) {
        console.error('[send-push-notification]', e)
        return new Response(JSON.stringify({ error: String(e) }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})