// Ask AI conversations (z_ai_helper, Mark 2026-11-08): several chats per job. A
// message belongs to one; only its own history goes back to the model. Run inside
// withSupabaseRead() / withSupabase() so it acts as the signed-in user.

import { supabase } from '@/src/lib/supabase'

/** The conversation to write to: the one given (if it's this job's), else a new one. */
export async function ensureConversation(projectId: string, conversationId?: string | null): Promise<string> {
  if (conversationId) {
    const { data } = await supabase.from('ai_conversations').select('id').eq('id', conversationId).eq('project_id', projectId).maybeSingle()
    if (data) return conversationId
  }
  const { data, error } = await supabase.from('ai_conversations').insert({ project_id: projectId }).select('id').single()
  if (error || !data) throw new Error(`ai_conversations: ${error?.message}`)
  return data.id as string
}

/** After a message: bump the chat to the top, and name a new chat from its first question. */
export async function touchConversation(id: string, firstText: string) {
  const { data } = await supabase.from('ai_conversations').select('title').eq('id', id).maybeSingle()
  const patch: Record<string, unknown> = { last_message_at: new Date().toISOString() }
  if ((data as { title?: string } | null)?.title === 'New chat') {
    const line = firstText.replace(/^📎\s*/, 'Plan: ').split('\n')[0].trim()
    patch.title = line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line || 'New chat'
  }
  await supabase.from('ai_conversations').update(patch).eq('id', id)
}
