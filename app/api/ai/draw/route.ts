// AI helper drawing (z_ai_helper AI4): POST { roomId, path, fileName, message? } —
// the plan was uploaded from the browser to the private ai-uploads bucket under
// <project_id>/…; this reads it on Opus and returns a room plan to Apply. Runs as
// the signed-in user (RLS on the room and the upload).

import { createServerClient } from '@/src/lib/supabase-server'
import { withSupabaseRead } from '@/src/lib/ai/server/scope'
import { runDrawTurn } from '@/src/lib/ai/server/draw'

// Reading a full plan takes a minute or two on the top model.
export const maxDuration = 300

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { roomId?: string; path?: string; fileName?: string; message?: string } | null
  const roomId = body?.roomId, path = body?.path
  if (!roomId || !path) return Response.json({ error: 'roomId and path are required' }, { status: 400 })
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'The AI helper is not set up on this server (no API key).' }, { status: 503 })

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Not signed in' }, { status: 401 })

  const { data: room } = await supabase.from('rooms').select('id, project_id').eq('id', roomId).maybeSingle()
  if (!room) return Response.json({ error: 'Room not found' }, { status: 404 })
  if (!path.startsWith(`${room.project_id}/`)) return Response.json({ error: 'That upload belongs to another job' }, { status: 400 })

  try {
    const result = await withSupabaseRead(supabase, () => runDrawTurn({
      projectId: room.project_id, roomId, path, fileName: body?.fileName ?? 'plan', message: body?.message?.trim() ?? '',
    }))
    return Response.json(result)
  } catch (e) {
    console.error('ai draw:', e)
    return Response.json({ error: `Reading the plan hit a problem: ${(e as Error).message}` }, { status: 500 })
  }
}
