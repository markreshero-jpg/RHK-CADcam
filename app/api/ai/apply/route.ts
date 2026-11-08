// AI helper (z_ai_helper AI2): POST { messageId, cancel? } — Apply (or Cancel) the
// change a chat message proposed. Re-expands the proposal against the room as it
// is now, so it applies to what's there, not a stale preview.

import { createServerClient } from '@/src/lib/supabase-server'
import { withSupabase } from '@/src/lib/ai/server/scope'
import { runBatch, runJobBatch } from '@/src/lib/ai/server/cabinetBatch'
import type { Proposal } from '@/src/lib/ai/server/chat'

export const maxDuration = 60

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { messageId?: string; cancel?: boolean } | null
  if (!body?.messageId) return Response.json({ error: 'messageId is required' }, { status: 400 })

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Not signed in' }, { status: 401 })

  const { data: msg } = await supabase.from('ai_messages').select('id, proposal, proposal_status').eq('id', body.messageId).maybeSingle()
  if (!msg?.proposal) return Response.json({ error: 'No change to apply on that message' }, { status: 404 })
  if (msg.proposal_status !== 'pending') return Response.json({ error: `Already ${msg.proposal_status}` }, { status: 409 })

  if (body.cancel) {
    await supabase.from('ai_messages').update({ proposal_status: 'cancelled' }).eq('id', msg.id)
    return Response.json({ cancelled: true })
  }

  const p = msg.proposal as Proposal
  try {
    // AI2 proposals carried one update (filter + changes); AI3 ones carry steps.
    const ops = p.ops ?? (p.filter && p.changes ? [{ op: 'update' as const, filter: p.filter, changes: p.changes }] : [])
    const res = await withSupabase(supabase, () => p.groups?.length
      ? runJobBatch(p.groups, { description: p.description, homeRoomId: p.roomId })
      : runBatch(p.roomId, ops, { description: p.description, onlyIds: p.onlyIds }))
    if (res.batchId) {
      await supabase.from('ai_messages').update({ proposal_status: 'applied', batch_id: res.batchId, changed: res.changed }).eq('id', msg.id)
    }
    return Response.json(res)
  } catch (e) {
    console.error('ai apply:', e)
    return Response.json({ error: 'Applying the change hit a problem — nothing may have changed; check the drawing.' }, { status: 500 })
  }
}
