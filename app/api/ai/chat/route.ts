// AI helper chat (z_ai_helper AI1/AI2): POST { roomId, message, selectedIds? } →
// ChatTurnResult. Runs as the signed-in user — the room must be one they can
// open (RLS), so a tester only ever reaches their assigned jobs. The API key
// never leaves the server.

import { createServerClient } from '@/src/lib/supabase-server'
import { withSupabaseRead } from '@/src/lib/ai/server/scope'
import { runChatTurn } from '@/src/lib/ai/server/chat'

export const maxDuration = 60

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { roomId?: string; message?: string; selectedIds?: unknown; strong?: boolean } | null
  const roomId = body?.roomId, message = body?.message?.trim()
  const selectedIds = Array.isArray(body?.selectedIds) ? body.selectedIds.filter((x): x is string => typeof x === 'string').slice(0, 200) : []
  if (!roomId || !message) return Response.json({ error: 'roomId and message are required' }, { status: 400 })
  if (message.length > 4000) return Response.json({ error: 'Message too long' }, { status: 400 })
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'The AI helper is not set up on this server (no API key).' }, { status: 503 })

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Not signed in' }, { status: 401 })

  const { data: room } = await supabase.from('rooms').select('id, project_id').eq('id', roomId).maybeSingle()
  if (!room) return Response.json({ error: 'Room not found' }, { status: 404 })

  try {
    const result = await withSupabaseRead(supabase, () =>
      runChatTurn({ client: supabase, projectId: room.project_id, roomId, message, selectedIds, strong: body?.strong === true }))
    return Response.json(result)
  } catch (e) {
    console.error('ai chat:', e)
    return Response.json({ error: 'The AI helper hit a problem — try again in a moment.' }, { status: 500 })
  }
}
