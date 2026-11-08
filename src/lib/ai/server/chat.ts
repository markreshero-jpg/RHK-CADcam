// AI helper chat turn (z_ai_helper AI1 + AI2) on Claude Haiku 5.5. One turn =
// the room summary + the question + read-tool calls, and at most one edit:
//   - Selection scope, ≤ AUTO_APPLY_MAX cabinets → applied straight away (Undo on the message)
//   - anything bigger, or Room scope → a proposal the user Applies from the panel
//   - ask_user ends the turn with a question + option buttons
// The job's thread and the cost of every turn go to ai_messages.
//
// Run inside withSupabaseRead() so every read is the signed-in user's; the edit
// itself runs in withSupabase() (queued, fresh resolver caches).

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/src/lib/supabase'
import { loadRoomSummary } from '../roomSummary'
import { READ_TOOLS, runReadTool, type ToolContext } from '../readTools'
import { filterHasCriteria, type CabinetChanges, type CabinetFilter } from '../cabinetFilter'
import { findHandleSchedule, previewCabinetUpdate, previewLines, updateCabinets } from './cabinetBatch'
import { withSupabase } from './scope'

export const CHAT_MODEL = 'claude-haiku-5-5'
// $ per million tokens (Haiku 5.5, prompts under 100K). Cache reads 0.1×, writes 1.25× input.
const PRICE = { input: 0.10, output: 0.50, cacheRead: 0.01, cacheWrite: 0.125 }
const MAX_CALLS = 6
const HISTORY_TURNS = 6
/** Locked decision 1: Selection edits on this many cabinets or fewer apply without asking. */
export const AUTO_APPLY_MAX = 3

const FILTER_SCHEMA = {
  type: 'object',
  description: 'Which cabinets. Leave out in Selection scope to mean "the selected cabinets".',
  properties: {
    labels: { type: 'array', items: { type: 'string' }, description: 'e.g. ["WC-01","WC-02"]' },
    codes: { type: 'array', items: { type: 'string' }, description: 'Library codes, e.g. ["B2D"]' },
    classes: { type: 'array', items: { type: 'string', enum: ['base', 'wall', 'tall', 'base_corner', 'wall_corner', 'tall_corner'] }, description: '"wall" = overheads (includes wall corners)' },
    walls: { type: 'array', items: { type: 'string' }, description: 'Wall names, e.g. ["Wall 2"]' },
    where: {
      type: 'array', items: {
        type: 'object',
        properties: {
          field: { type: 'string', enum: ['dx', 'dy', 'dz', 'pos_z', 'offset'] },
          op: { type: 'string', enum: ['=', '!=', '<', '<=', '>', '>='] },
          value: { type: 'number' },
        },
        required: ['field', 'op', 'value'], additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const

const EDIT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'update_cabinets',
    description: 'Change one or more cabinets in one go. Only these fields can change: width (dx), height (dy), depth (dz), height off the floor (pos_z), position along its wall (offset, mm from the wall start), notes, scribes, handle schedule. Door / board colours can NOT be changed yet. Call it once per message.',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Short summary for the history, e.g. "Overheads to 900 high"' },
        filter: FILTER_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        changes: {
          type: 'object',
          properties: {
            dx: { type: 'number' }, dy: { type: 'number' }, dz: { type: 'number' },
            pos_z: { type: 'number' }, offset: { type: 'number' },
            notes: { type: ['string', 'null'] },
            scribes: {
              type: 'object', description: 'mm per side; null = back to inherited',
              properties: Object.fromEntries(['left', 'right', 'top', 'bottom', 'back'].map(k => [k, { type: ['number', 'null'] }])),
              additionalProperties: false,
            },
            handle_schedule: { type: ['string', 'null'], description: 'Handle schedule name (list_handle_schedules); null = inherit room/job' },
          },
          additionalProperties: false,
        },
      },
      required: ['description', 'changes'], additionalProperties: false,
    },
  },
  {
    name: 'ask_user',
    description: 'Ask the user ONE short question with 2–4 answer buttons when a change is ambiguous (which cabinets, which side, what size) or risky. The user taps a button or types. Ends your turn.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4, description: 'Short answers, 1–6 words each' },
      },
      required: ['question', 'options'], additionalProperties: false,
    },
  },
  {
    name: 'list_handle_schedules',
    description: 'Names of the shop\'s handle schedules (for update_cabinets handle_schedule).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
]

// Frozen so it caches. Shop rules move to the Settings page in AI5.
const SYSTEM = `You are the RHK CADcam helper, inside a cabinet-making CAD app used by RHK's workshop.
You answer questions about the job the user has open and make small changes to its cabinets.

Scope: each message says the scope. "Selection" = only the cabinets the user has selected on the canvas; never touch others (the server refuses anyway — tell them to select more, or deselect everything for the whole room). "Room" = any cabinet in this room; changes there wait for the user to press Apply.

Changing cabinets (update_cabinets):
- You can change width, height, depth, height off the floor, position along the wall, notes, scribes and handle schedule. You can NOT change door or board colours, add or delete cabinets yet — say so.
- Clear request → just do it, no questions ("make these 900 high"). Ambiguous or risky → ask_user first with 2–4 short options (which cabinets? which side? what size?). Never ask more than one question at a time.
- One update_cabinets call per message. After it, say in one line what changed (or that it's waiting for Apply). Undo is on the message.
- Sizes are W×H×D: width = dx, height = dy, depth = dz.

How to answer:
- Short and plain, like a workshop foreman. Lead with the answer. Sizes in mm.
- Use only the room summary and your tools. If the data doesn't say, say you can't tell — never guess sizes or colours.
- Cabinet labels like BC-03 (base), WC-02 (wall/overhead), TC-01 (tall). Codes like B2 / D3-1S2Pot are library cabinet types.
- TBC items are marked with CLOUDS in the markup; text near a cloud says what's to be confirmed.
- Totals: add them up yourself from the tool output and show the total clearly.
- "Kick length" means the visible kick: the kick_front_face total. Mention the rails behind only if asked.

Shop conventions (RHK):
- Fillers sit on the kick; only end panels go to the floor. Overheads have no finger pulls.
- Every room's drawings carry colour callouts, TBC clouds and site notes. Appliances aren't drawn as cabinets.`

export interface ChatTurnArgs {
  client: SupabaseClient
  projectId: string
  roomId: string
  message: string
  /** Cabinets selected on the canvas — non-empty = Selection scope. */
  selectedIds?: string[]
}
export interface Proposal {
  roomId: string; filter: CabinetFilter; changes: CabinetChanges; onlyIds?: string[]
  description: string; lines: string[]
}
export interface ChatTurnResult {
  messageId: string | null
  reply: string
  question?: { text: string; options: string[] }
  proposal?: Proposal
  changed?: string[]
  batchId?: string | null
  cabinetIds?: string[]
  costUsd: number; ms: number; model: string; toolCalls: string[]
}

const anthropic = new Anthropic()   // ANTHROPIC_API_KEY from the server env

interface HistoryRow { role: string; text: string; question: { options?: string[] } | null; proposal: { lines?: string[] } | null; proposal_status: string | null; changed: string[] | null; undone_at: string | null }

/** How an earlier assistant message reads back to the model (plain text — no tool calls / thinking, so the prefix stays stable). */
function replayText(m: HistoryRow): string {
  let t = m.text
  if (m.question?.options?.length) t += `\n[Asked with options: ${m.question.options.join(' / ')}]`
  if (m.proposal?.lines?.length) t += `\n[Proposed (${m.proposal_status ?? 'pending'}): ${m.proposal.lines.join('; ')}]`
  if (m.changed?.length) t += `\n[Applied: ${m.changed.join('; ')}]`
  if (m.undone_at) t += '\n[Undone by the user]'
  return t
}

/** Last few exchanges in this room. The panel shows the whole job's thread, but only
 *  this room's goes back to the model — other rooms' labels would muddle it. */
async function history(projectId: string, roomId: string): Promise<Anthropic.MessageParam[]> {
  const { data } = await supabase.from('ai_messages').select('role, text, question, proposal, proposal_status, changed, undone_at')
    .eq('project_id', projectId).eq('room_id', roomId).order('created_at', { ascending: false }).limit(HISTORY_TURNS * 2)
  const rows = ((data ?? []) as HistoryRow[]).reverse()
  while (rows.length && rows[0].role !== 'user') rows.shift()
  const out: Anthropic.MessageParam[] = []
  for (const m of rows) {
    const text = m.role === 'assistant' ? replayText(m) : m.text
    const last = out[out.length - 1]
    if (last && last.role === m.role) last.content = `${last.content}\n\n${text}`   // keep turns alternating
    else out.push({ role: m.role as 'user' | 'assistant', content: text })
  }
  if (out.length && out[out.length - 1].role === 'user') out.pop()   // an unanswered question
  return out
}

interface EditInput { description?: string; filter?: CabinetFilter; changes?: CabinetChanges & { handle_schedule?: string | null } }

export async function runChatTurn(args: ChatTurnArgs): Promise<ChatTurnResult> {
  const t0 = Date.now()
  const ctx: ToolContext = { projectId: args.projectId, roomId: args.roomId }
  const selection = args.selectedIds?.length ? args.selectedIds : null

  const [summary, past, selLabels] = await Promise.all([
    loadRoomSummary(args.roomId),
    history(args.projectId, args.roomId),
    selection
      ? supabase.from('cabinet_instances').select('id, label').in('id', selection).then(r => (r.data ?? []).map(c => c.label as string))
      : Promise.resolve([] as string[]),
  ])
  const scopeLine = selection
    ? `Scope: Selection — ${selLabels.join(', ')}`
    : 'Scope: Room — nothing selected (changes need the user to press Apply)'

  // The question is saved first (its own created_at, before the answer's).
  const asked = await supabase.from('ai_messages').insert(
    { project_id: args.projectId, room_id: args.roomId, role: 'user', text: args.message, scope: selection ? 'selection' : 'room' })
  if (asked.error) throw new Error(`ai_messages: ${asked.error.message}`)

  const messages: Anthropic.MessageParam[] = [
    ...past,
    { role: 'user', content: `<room_summary>\n${summary}\n</room_summary>\n${scopeLine}\n\n${args.message}` },
  ]
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 }
  const toolCalls: string[] = []
  const out: Omit<ChatTurnResult, 'messageId' | 'costUsd' | 'ms' | 'model' | 'toolCalls'> = { reply: '' }
  let edited = false

  /** Run one update_cabinets call → tool result text, and maybe end the turn with a proposal. */
  async function runEdit(input: EditInput): Promise<{ text: string; isError?: boolean; endTurn?: boolean }> {
    if (edited) return { text: 'Only one change per message — finish this one, then the user can ask again.', isError: true }
    const { handle_schedule, ...rest } = input.changes ?? {}
    const changes: CabinetChanges = { ...rest }
    if (handle_schedule !== undefined) {
      if (handle_schedule === null) changes.handle_schedule_id = null
      else {
        const hs = await findHandleSchedule(handle_schedule)
        if ('error' in hs) return { text: hs.error, isError: true }
        changes.handle_schedule_id = hs.id
      }
    }
    const filter: CabinetFilter = input.filter && filterHasCriteria(input.filter) ? input.filter : selection ? { labels: selLabels } : {}
    if (!filterHasCriteria(filter)) return { text: 'Nothing selected — say which cabinets (labels, class, wall or code), or ask the user to select them.', isError: true }
    const pv = await previewCabinetUpdate(args.roomId, filter, changes, { onlyIds: selection ?? undefined })
    if (pv.problems.length) return { text: pv.problems.join('\n'), isError: true }
    if (!pv.patches.size) return { text: pv.matched.length ? `Nothing to change — ${pv.matched.join(', ')} already like that.` : 'No cabinets match that.' }
    const description = input.description?.trim() || 'AI change'
    edited = true

    if (selection && pv.patches.size <= AUTO_APPLY_MAX) {
      const res = await withSupabase(args.client, () => updateCabinets({ roomId: args.roomId, filter, changes, description, onlyIds: selection }))
      out.changed = res.changed; out.batchId = res.batchId; out.cabinetIds = res.cabinetIds
      return { text: [`Applied:`, ...res.changed, ...res.warnings.map(w => `Warning: ${w}`), ...res.errors.map(e => `Resolver error: ${e}`)].join('\n') }
    }
    out.proposal = { roomId: args.roomId, filter, changes, onlyIds: selection ?? undefined, description, lines: previewLines(pv) }
    return { text: 'Shown to the user for Apply.', endTurn: true }
  }

  for (let i = 0; i < MAX_CALLS; i++) {
    const res = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 4000,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools: [...READ_TOOLS, ...EDIT_TOOLS],
      output_config: { effort: 'low' },
      messages,
    })
    usage.calls++
    usage.input += res.usage.input_tokens
    usage.output += res.usage.output_tokens
    usage.cacheRead += res.usage.cache_read_input_tokens ?? 0
    usage.cacheWrite += res.usage.cache_creation_input_tokens ?? 0

    if (res.stop_reason === 'refusal') { out.reply = "Sorry — I can't help with that one."; break }
    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n').trim()
    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (res.stop_reason !== 'tool_use' || !uses.length) { out.reply = text || (out.changed?.length ? 'Done.' : '(no answer)'); break }

    const ask = uses.find(u => u.name === 'ask_user')
    if (ask) {
      const q = ask.input as { question?: string; options?: string[] }
      out.question = { text: q.question ?? '', options: (q.options ?? []).slice(0, 4) }
      out.reply = [text, q.question].filter(Boolean).join('\n\n')
      toolCalls.push('ask_user')
      break
    }

    messages.push({ role: 'assistant', content: res.content })
    let endTurn = false
    const results: Anthropic.ToolResultBlockParam[] = []
    for (const u of uses) {
      toolCalls.push(u.name)
      try {
        if (u.name === 'update_cabinets') {
          const r = await runEdit(u.input as EditInput)
          endTurn ||= !!r.endTurn
          results.push({ type: 'tool_result', tool_use_id: u.id, content: r.text, ...(r.isError && { is_error: true }) })
        } else if (u.name === 'list_handle_schedules') {
          const { data } = await supabase.from('handle_schedules').select('name').order('name')
          results.push({ type: 'tool_result', tool_use_id: u.id, content: (data ?? []).map(s => s.name).join('\n') || 'None.' })
        } else {
          results.push({ type: 'tool_result', tool_use_id: u.id, content: await runReadTool(u.name, u.input, ctx) })
        }
      } catch (e) {
        results.push({ type: 'tool_result', tool_use_id: u.id, content: `Error: ${(e as Error).message}`, is_error: true })
      }
    }
    if (endTurn) { out.reply = text || `Here's what will change — press Apply to do it.`; break }
    messages.push({ role: 'user', content: results })
    if (i === MAX_CALLS - 1) out.reply = text || 'That took too many steps — try asking it more simply.'
  }

  const costUsd = (usage.input * PRICE.input + usage.output * PRICE.output + usage.cacheRead * PRICE.cacheRead + usage.cacheWrite * PRICE.cacheWrite) / 1e6
  const ms = Date.now() - t0
  const { data: saved, error } = await supabase.from('ai_messages').insert({
    project_id: args.projectId, room_id: args.roomId, role: 'assistant', text: out.reply, scope: selection ? 'selection' : 'room',
    model: CHAT_MODEL, input_tokens: usage.input, output_tokens: usage.output,
    cache_read_tokens: usage.cacheRead, cache_write_tokens: usage.cacheWrite,
    api_calls: usage.calls, cost_usd: costUsd, ms,
    question: out.question ?? null,
    proposal: out.proposal ?? null, proposal_status: out.proposal ? 'pending' : null,
    batch_id: out.batchId ?? null, changed: out.changed?.length ? out.changed : null,
  }).select('id').single()
  if (error) console.error('ai_messages insert:', error.message)
  return { ...out, messageId: saved?.id ?? null, costUsd, ms, model: CHAT_MODEL, toolCalls }
}
