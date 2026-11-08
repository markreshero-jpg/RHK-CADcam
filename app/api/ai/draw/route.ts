// AI helper drawing (z_ai_helper AI4): POST
//   { roomId, path, fileName, message? }        — read a plan uploaded from the browser
//                                                 to the private ai-uploads bucket (<project_id>/…)
//   { roomId, continueFrom, answer }            — the user's answers to its questions:
//                                                 carry that drawing on
// → a room plan to Apply (or more questions). Runs as the signed-in user (RLS on
// the room, the upload and the question message).

import { createServerClient } from '@/src/lib/supabase-server'
import { withSupabaseRead } from '@/src/lib/ai/server/scope'
import { runDrawTurn, type DrawCtx } from '@/src/lib/ai/server/draw'

// Reading a full plan takes a minute or two on the top model.
export const maxDuration = 300

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    roomId?: string; path?: string; fileName?: string; message?: string; continueFrom?: string; answer?: string
  } | null
  const roomId = body?.roomId
  if (!roomId || (!body?.path && !body?.continueFrom)) return Response.json({ error: 'roomId and a path (or continueFrom) are required' }, { status: 400 })
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'The AI helper is not set up on this server (no API key).' }, { status: 503 })

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Not signed in' }, { status: 401 })

  const { data: room } = await supabase.from('rooms').select('id, project_id').eq('id', roomId).maybeSingle()
  if (!room) return Response.json({ error: 'Room not found' }, { status: 404 })

  let ctx: DrawCtx
  if (body.continueFrom) {
    const { data: msg } = await supabase.from('ai_messages').select('draw, question').eq('id', body.continueFrom).maybeSingle()
    const prev = msg?.draw as DrawCtx | null
    if (!prev) return Response.json({ error: 'That drawing question has gone — attach the plan again.' }, { status: 404 })
    const q = msg?.question as { text?: string; items?: { text: string }[] } | null
    const asked = q?.items?.length ? q.items.map((x, i) => `${i + 1}. ${x.text}`).join(' ') : q?.text ?? ''
    ctx = { ...prev, qa: [...(prev.qa ?? []), { q: asked, a: body.answer?.trim() || '(no answer)' }] }
  } else {
    ctx = { path: body.path!, fileName: body.fileName ?? 'plan', notes: body.message?.trim() ?? '', qa: [] }
  }
  if (!ctx.path.startsWith(`${room.project_id}/`)) return Response.json({ error: 'That upload belongs to another job' }, { status: 400 })

  try {
    const result = await withSupabaseRead(supabase, () => runDrawTurn({ projectId: room.project_id, roomId, ctx }))
    return Response.json(result)
  } catch (e) {
    console.error('ai draw:', e)
    return Response.json({ error: `Reading the plan hit a problem: ${(e as Error).message}` }, { status: 500 })
  }
}
