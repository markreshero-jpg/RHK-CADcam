// Check after Apply (z_ai_helper Q5). Once a proposal is applied, one short model call
// compares what the user asked with the cabinets as they now are — the resolved detail of
// what changed, plus the resolver's errors / warnings — and posts a "✓ Checked" or "⚠"
// message to the chat, with fix buttons when something is off (a button sends its words
// as the next message, so the normal chat turn makes the fix).
//
// Run inside withSupabaseRead() so the reads are the signed-in user's. Never throws —
// a failed check must not look like a failed Apply.

import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/src/lib/supabase'
import { runReadTool } from '../readTools'
import { loadRoomSummary } from '../roomSummary'
import { CHAT_MODEL, PRICES } from './chat'

const anthropic = new Anthropic()
/** Changed cabinets read in full; more than this get only their summary line. */
const DETAIL_MAX = 4

const SYSTEM = `You check a change the RHK CADcam helper (a cabinet-making CAD app) just applied for the user.
You get: what the user asked, the change lines that were applied, any resolver errors / warnings from re-resolving, and the changed cabinets as they are NOW (resolved: sizes, fronts, hinges, interior bays and shelf heights, parts and boards).
Decide whether the cabinets now match what the user asked and are buildable.
- ok = true when they match and nothing new is wrong. Then text = "Checked: " + one line confirming the key result in numbers (e.g. "TC-01 fixed shelf now 816.5 up, 2 adjustable shelves above").
- ok = false when something doesn't match the request, or a resolver error / warning is a real problem caused by the change (e.g. a drawer no longer fits its bay, parts overlap, a hinge sits on shelf holes). Then text = 1–3 short lines: what's wrong, in plain workshop words with the numbers.
- A problem that was clearly there before and not caused by this change: mention it in one short line at most, it doesn't make ok false.
- fixes: when ok is false, 1–3 short button labels for fixes the helper can do with cabinet changes (sizes, offsets, colours, hinges per door, interior bays / shelves, re-resolve), written as an instruction naming the cabinet, e.g. "TC-01: make bay 1 750 high again". Always add "Leave it as is" last. When ok is true, no fixes.
How cabinets sit: a cabinet's "Height" line (underside / top from the floor) is where it really is. An overhead's doors run its full height from its underside; a bottom scribe (SCRBT) lifts only its carcass bottom that far, so an under panel of that thickness at the overhead underside sits inside the scribe — panel bottom flush with the door bottoms is RIGHT, not a clash.
Plain, short, like a workshop foreman. Sizes in mm. Never invent numbers that aren't in the data.`

const SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    text: { type: 'string' },
    fixes: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'text', 'fixes'],
  additionalProperties: false,
} as const

export interface CheckArgs {
  messageId: string
  /** From the apply: change lines, resolver warnings / errors, cabinets touched. */
  changed: string[]; warnings: string[]; errors: string[]; cabinetIds: string[]
}
export interface CheckResult { messageId: string | null; ok: boolean; text: string; fixes: string[]; costUsd: number }

export async function checkAfterApply(a: CheckArgs): Promise<CheckResult | null> {
  const t0 = Date.now()
  try {
    const { data: msg } = await supabase.from('ai_messages')
      .select('id, project_id, room_id, conversation_id, created_at, scope, proposal').eq('id', a.messageId).maybeSingle()
    if (!msg?.room_id || !msg.conversation_id) return null
    const { data: asked } = await supabase.from('ai_messages').select('text')
      .eq('conversation_id', msg.conversation_id).eq('role', 'user').lt('created_at', msg.created_at)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    // The changed cabinets in this room, as they are now.
    const { data: cabs } = a.cabinetIds.length
      ? await supabase.from('cabinet_instances').select('id, label, room_id').in('id', a.cabinetIds)
      : { data: [] as { id: string; label: string | null; room_id: string }[] }
    const here = ((cabs ?? []) as { id: string; label: string | null; room_id: string }[]).filter(c => c.room_id === msg.room_id && c.label)
    const ctx = { projectId: msg.project_id as string, roomId: msg.room_id as string }
    const detail = await Promise.all(here.slice(0, DETAIL_MAX).map(c => runReadTool('get_cabinet_detail', { label: c.label }, ctx)))
    const summary = await loadRoomSummary(msg.room_id)
    const elsewhere = ((cabs ?? []) as { room_id: string }[]).filter(c => c.room_id !== msg.room_id).length

    const content = [
      `<request>\n${asked?.text ?? '(not found)'}\n</request>`,
      `<applied>\n${a.changed.join('\n') || '(no change lines)'}\n</applied>`,
      `<resolver>\n${[...a.errors.map(e => `Error: ${e}`), ...a.warnings.map(w => `Warning: ${w}`)].join('\n') || 'No errors or warnings.'}\n</resolver>`,
      ...detail.map((d, i) => `<cabinet_now label="${here[i].label}">\n${d}\n</cabinet_now>`),
      ...(here.length > DETAIL_MAX ? [`(${here.length - DETAIL_MAX} more changed cabinets — see the room summary)`] : []),
      ...(elsewhere ? [`(${elsewhere} changed cabinets in other rooms of the job are not shown)`] : []),
      `<room_summary>\n${summary}\n</room_summary>`,
    ].join('\n\n')

    const res = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
      messages: [{ role: 'user', content }],
    })
    const p = PRICES[CHAT_MODEL]
    const u = res.usage
    const costUsd = (u.input_tokens * p.input + u.output_tokens * p.output + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) / 1e6
    if (res.stop_reason !== 'end_turn') return null
    const raw = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? ''
    const out = JSON.parse(raw) as { ok: boolean; text: string; fixes: string[] }
    const fixes = out.ok ? [] : (out.fixes ?? []).slice(0, 4)
    const text = `${out.ok ? '✓' : '⚠'} ${out.text.trim()}`

    const { data: saved, error } = await supabase.from('ai_messages').insert({
      project_id: msg.project_id, room_id: msg.room_id, conversation_id: msg.conversation_id, role: 'assistant', text, scope: msg.scope,
      model: CHAT_MODEL, input_tokens: u.input_tokens, output_tokens: u.output_tokens,
      cache_read_tokens: u.cache_read_input_tokens ?? 0, cache_write_tokens: u.cache_creation_input_tokens ?? 0,
      api_calls: 1, cost_usd: costUsd, ms: Date.now() - t0,
      question: fixes.length >= 2 ? { text: '', options: fixes } : null,
    }).select('id').single()
    if (error) console.error('ai check insert:', error.message)
    await supabase.from('ai_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', msg.conversation_id)
    return { messageId: saved?.id ?? null, ok: out.ok, text, fixes, costUsd }
  } catch (e) {
    console.error('ai check:', (e as Error).message)
    return null
  }
}
