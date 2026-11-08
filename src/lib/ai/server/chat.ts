// AI helper chat turn (z_ai_helper AI1): read-only Q&A about the room on
// Claude Haiku 5.5. One turn = the room summary + the question + up to a few
// read-tool calls. The job's thread and the cost of every turn go to ai_messages.
//
// Run inside withSupabaseRead() so every read is the signed-in user's.

import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/src/lib/supabase'
import { loadRoomSummary } from '../roomSummary'
import { READ_TOOLS, runReadTool, type ToolContext } from '../readTools'

export const CHAT_MODEL = 'claude-haiku-5-5'
// $ per million tokens (Haiku 5.5, prompts under 100K). Cache reads 0.1×, writes 1.25× input.
const PRICE = { input: 0.10, output: 0.50, cacheRead: 0.01, cacheWrite: 0.125 }
const MAX_CALLS = 6
const HISTORY_TURNS = 6

// Frozen so it caches. Shop rules move to the Settings page in AI5.
const SYSTEM = `You are the RHK CADcam helper, inside a cabinet-making CAD app used by RHK's workshop.
You answer questions about the job the user has open: rooms, walls, cabinets, fronts, colours, kicks, markup.

Right now you can only READ. If asked to change something, say that editing from the chat is coming soon and tell them where to do it by hand if you know.

How to answer:
- Short and plain, like a workshop foreman. Lead with the answer. Sizes in mm.
- Use only the room summary and your tools. If the data doesn't say, say you can't tell — never guess sizes or colours.
- Cabinet labels like BC-03 (base), WC-02 (wall/overhead), TC-01 (tall). Codes like B2 / D3-1S2Pot are library cabinet types. Sizes are W×H×D.
- TBC items are marked with CLOUDS in the markup; text near a cloud says what's to be confirmed.
- Totals: add them up yourself from the tool output and show the total clearly.
- "Kick length" means the visible kick: the kick_front_face total. Mention the rails behind only if asked.

Shop conventions (RHK):
- Fillers sit on the kick; only end panels go to the floor. Overheads have no finger pulls.
- Every room's drawings carry colour callouts, TBC clouds and site notes. Appliances aren't drawn as cabinets.`

export interface ChatTurnArgs { projectId: string; roomId: string; message: string; scope?: 'room' }
export interface ChatTurnResult { reply: string; costUsd: number; ms: number; model: string; toolCalls: string[] }

const anthropic = new Anthropic()   // ANTHROPIC_API_KEY from the server env

/** Last few exchanges of the job's thread, as plain text (no tool calls or thinking) so the prefix stays stable. */
async function history(projectId: string): Promise<Anthropic.MessageParam[]> {
  const { data } = await supabase.from('ai_messages').select('role, text')
    .eq('project_id', projectId).order('created_at', { ascending: false }).limit(HISTORY_TURNS * 2)
  const rows = (data ?? []).reverse()
  while (rows.length && rows[0].role !== 'user') rows.shift()
  const out: Anthropic.MessageParam[] = []
  for (const m of rows) {
    const last = out[out.length - 1]
    if (last && last.role === m.role) last.content = `${last.content}\n\n${m.text}`   // keep turns alternating
    else out.push({ role: m.role as 'user' | 'assistant', content: m.text })
  }
  if (out.length && out[out.length - 1].role === 'user') out.pop()   // an unanswered question
  return out
}

export async function runChatTurn(args: ChatTurnArgs): Promise<ChatTurnResult> {
  const t0 = Date.now()
  const ctx: ToolContext = { projectId: args.projectId, roomId: args.roomId }
  const [summary, past] = await Promise.all([loadRoomSummary(args.roomId), history(args.projectId)])
  // The question is saved first (its own created_at, before the answer's).
  const asked = await supabase.from('ai_messages').insert(
    { project_id: args.projectId, room_id: args.roomId, role: 'user', text: args.message, scope: args.scope ?? 'room' })
  if (asked.error) throw new Error(`ai_messages: ${asked.error.message}`)

  const messages: Anthropic.MessageParam[] = [
    ...past,
    { role: 'user', content: `<room_summary>\n${summary}\n</room_summary>\n\n${args.message}` },
  ]
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 }
  const toolCalls: string[] = []
  let reply = ''

  for (let i = 0; i < MAX_CALLS; i++) {
    const res = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 4000,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools: READ_TOOLS,
      output_config: { effort: 'low' },
      messages,
    })
    usage.calls++
    usage.input += res.usage.input_tokens
    usage.output += res.usage.output_tokens
    usage.cacheRead += res.usage.cache_read_input_tokens ?? 0
    usage.cacheWrite += res.usage.cache_creation_input_tokens ?? 0

    if (res.stop_reason === 'refusal') { reply = "Sorry — I can't help with that one."; break }
    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n').trim()
    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (res.stop_reason !== 'tool_use' || !uses.length) { reply = text || '(no answer)'; break }

    messages.push({ role: 'assistant', content: res.content })
    const results: Anthropic.ToolResultBlockParam[] = await Promise.all(uses.map(async u => {
      toolCalls.push(u.name)
      try { return { type: 'tool_result' as const, tool_use_id: u.id, content: await runReadTool(u.name, u.input, ctx) } }
      catch (e) { return { type: 'tool_result' as const, tool_use_id: u.id, content: `Error: ${(e as Error).message}`, is_error: true } }
    }))
    messages.push({ role: 'user', content: results })
    if (i === MAX_CALLS - 1) reply = text || 'That took too many steps — try asking it more simply.'
  }

  const costUsd = (usage.input * PRICE.input + usage.output * PRICE.output + usage.cacheRead * PRICE.cacheRead + usage.cacheWrite * PRICE.cacheWrite) / 1e6
  const ms = Date.now() - t0
  const { error } = await supabase.from('ai_messages').insert({
    project_id: args.projectId, room_id: args.roomId, role: 'assistant', text: reply, scope: args.scope ?? 'room',
    model: CHAT_MODEL, input_tokens: usage.input, output_tokens: usage.output,
    cache_read_tokens: usage.cacheRead, cache_write_tokens: usage.cacheWrite,
    api_calls: usage.calls, cost_usd: costUsd, ms,
  })
  if (error) console.error('ai_messages insert:', error.message)
  return { reply, costUsd, ms, model: CHAT_MODEL, toolCalls }
}
