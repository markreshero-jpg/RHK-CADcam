// AI helper (z_ai_helper AI2): POST { messageId } — Undo the change a chat message
// made. Cabinets edited again since are left alone and reported (undoBatch).

import { createServerClient } from '@/src/lib/supabase-server'
import { withSupabase } from '@/src/lib/ai/server/scope'
import { undoBatch } from '@/src/lib/ai/server/cabinetBatch'

export const maxDuration = 60

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { messageId?: string } | null
  if (!body?.messageId) return Response.json({ error: 'messageId is required' }, { status: 400 })

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Not signed in' }, { status: 401 })

  const { data: msg } = await supabase.from('ai_messages').select('id, batch_id, undone_at').eq('id', body.messageId).maybeSingle()
  if (!msg?.batch_id) return Response.json({ error: 'Nothing to undo on that message' }, { status: 404 })
  if (msg.undone_at) return Response.json({ error: 'Already undone' }, { status: 409 })

  try {
    const res = await withSupabase(supabase, () => undoBatch(msg.batch_id as string))
    await supabase.from('ai_messages').update({ undone_at: new Date().toISOString() }).eq('id', msg.id)
    return Response.json(res)
  } catch (e) {
    console.error('ai undo:', e)
    return Response.json({ error: 'Undo hit a problem — check the drawing.' }, { status: 500 })
  }
}
