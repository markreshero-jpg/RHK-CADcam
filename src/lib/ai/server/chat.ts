// AI helper chat turn (z_ai_helper AI1–AI3) on Claude Sonnet 5.5 (Mark 2026-11-08 — Haiku
// misread overhead / bulkhead edits; Try harder = Opus 5.5). One turn =
// the room summary + the question + read-tool calls, and at most one change
// (one or more steps — update / place / delete — applied and undone together):
//   - Selection scope, updates only, ≤ AUTO_APPLY_MAX cabinets → applied straight away (Undo on the message)
//   - anything bigger, any add / delete, or Room scope → a proposal the user Applies from the panel
//   - ask_user ends the turn with a question + option buttons
// The job's thread and the cost of every turn go to ai_messages.
//
// Run inside withSupabaseRead() so every read is the signed-in user's; the edit
// itself runs in withSupabase() (queued, fresh resolver caches).

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/src/lib/supabase'
import { loadRoomSummary } from '../roomSummary'
import { READ_TOOLS, findMaterial, runReadTool, type ToolContext } from '../readTools'
import { filterHasCriteria, MATERIAL_ROLES, type CabinetChanges, type CabinetFilter, type MaterialRole } from '../cabinetFilter'
import { findHandleSchedule, planBatch, runBatch, runJobBatch, type BatchOp } from './cabinetBatch'
import { withSupabase } from './scope'
import { jobNotesBlock, loadAiContext, systemBlocks } from '../shopRules'

/** Everyday model, and the one "Try harder" re-runs a message on. */
export const CHAT_MODEL = 'claude-sonnet-5-5'
export const STRONG_MODEL = 'claude-opus-5-5'
// $ per million tokens. Cache reads ~0.1×, writes 1.25× input.
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.20, cacheWrite: 2.5 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.20, cacheWrite: 5 },
}
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
    name: 'change_cabinets',
    description: 'Make one change to the room as ordered steps, applied and undone together. Steps: "update" (filter + changes: width dx, height dy, depth dz, off-floor pos_z for base / tall only, offset along the wall, notes, scribes, handle_schedule, wallz = one overhead own underside, materials = the cabinets own colours), "set_material" (a colour for a kind of cabinet across the room or the whole job), "set_properties" (room / job set-up: overhead top line or soffit, kick, class heights), "place" (a library code from find_library, next_to a cabinet on its left/right, or on a wall at an offset), "delete" (labels). E.g. delete BC-04 then update BC-05 / BC-06 offsets to close the gap. Call it once per message.',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Short summary for the history, e.g. "Delete BC-04, close the gap"' },
        steps: {
          type: 'array', minItems: 1, maxItems: 12,
          items: {
            type: 'object',
            properties: {
              op: { type: 'string', enum: ['update', 'place', 'delete', 'set_material', 'set_properties', 'markup', 'fixture'] },
              rooms: {
                type: 'array', items: { type: 'string' },
                description: 'Which rooms of the job this step is for (names from get_job_summary), or ["all"] for every room. Leave out = this room. A change touching other rooms always waits for Apply.',
              },
              item: { type: 'string', description: 'fixture: catalogue item name (find_fixture)' },
              on: { type: 'string', description: 'fixture: cabinet label it sits on / in (sink, cooktop, oven, rangehood) — centred' },
              along: { type: 'number', description: 'fixture on a cabinet: mm from its centre along the width (+ = right as you face it)' },
              from_back: { type: 'number', description: 'fixture: centre mm from the cabinet back (default half its depth)' },
              notes: {
                type: 'array', description: 'markup: CAD notes on an elevation (TBC clouds, appliance spaces, site notes)',
                items: {
                  type: 'object',
                  properties: {
                    layer: { type: 'string', enum: ['general', 'questions', 'site', 'electrical'], description: 'general = appliance spaces / colour callouts; questions = TBC (Questions for Client); site = site / install notes; electrical = lighting / power' },
                    wall: { type: 'string' },
                    side: { type: 'string', enum: ['face', 'back'] },
                    text: { type: 'string', description: 'Short, capitals, e.g. "DISHWASHER SPACE 605W x 880H" or "BULKHEAD COLOUR TBC"' },
                    box: {
                      type: 'object', description: 'The area it is about: x along the wall from its start, z height off the floor (mm)',
                      properties: { x0: { type: 'number' }, x1: { type: 'number' }, z0: { type: 'number' }, z1: { type: 'number' } },
                      required: ['x0', 'x1', 'z0', 'z1'], additionalProperties: false,
                    },
                    box_style: { type: 'string', enum: ['cloud', 'dashed'], description: 'cloud = TBC, dashed = an appliance / fixture space' },
                    text_inside: { type: 'boolean', description: 'Text inside the box (only for an empty space like the dishwasher gap); else the right margin with a leader' },
                  },
                  required: ['layer', 'wall', 'text'], additionalProperties: false,
        },
              },
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
                  wallz: { type: ['number', 'null'], description: 'One overhead\'s OWN underside, mm from the floor, instead of hanging from the room top line; null = hang from the top line again' },
                  materials: {
                    type: 'object', description: 'These cabinets\' OWN board colours by role — board names from find_material; null = back to the room / job colour',
                    properties: Object.fromEntries(MATERIAL_ROLES.map(k => [k, { type: ['string', 'null'] }])),
                    additionalProperties: false,
                  },
                },
                additionalProperties: false,
              },
              level: { type: 'string', enum: ['room', 'job'], description: 'set_material / set_properties: this room, or the whole job' },
              kick: { type: 'number', description: 'set_properties: kick height' },
              base_dy: { type: 'number', description: 'set_properties: base class height (incl. kick)' },
              tall_dy: { type: 'number', description: 'set_properties: tall class height' },
              wall_dy: { type: 'number', description: 'set_properties: overhead class height' },
              overhead_top: { type: 'number', description: 'set_properties (room): overhead top line, mm UP from the floor' },
              soffit_drop: { type: 'number', description: 'set_properties (room): soffit, mm DOWN from the ceiling to the overhead tops (wins over overhead_top when set)' },
              wall_soffit_drop: { type: ['number', 'null'], description: 'set_properties with wall: THAT wall\'s own soffit drop (only its overheads / bulkheads follow); null = back to the room\'s' },
              role: { type: 'string', enum: [...MATERIAL_ROLES], description: 'set_material: fronts (doors / drawers), carcass, exposed (end panels, fillers, open interiors), shelf, divider, kick (kick face)' },
              classes: { type: 'array', items: { type: 'string', enum: ['base', 'wall', 'tall'] }, description: 'set_material: which kinds (wall = overheads); leave out for all three' },
              material: { type: ['string', 'null'], description: 'set_material: board name from find_material; null = back to inherited' },
              code: { type: 'string', description: 'place: library code, e.g. "BEP"' },
              wall: { type: 'string', description: 'place: wall name (with offset)' },
              offset: { type: 'number', description: 'place: mm from the wall start to the cabinet low end' },
              at_end: { type: 'string', enum: ['left', 'right'], description: 'place: at this end of the wall, as you face the side it goes on (instead of offset)' },
              back: { type: 'boolean', description: 'place: on the wall back face (an island far side / back). Default: the face' },
              next_to: {
                type: 'object', description: 'place: against this cabinet side (left / right as you face its front)',
                properties: { label: { type: 'string' }, side: { type: 'string', enum: ['left', 'right'] } },
                required: ['label', 'side'], additionalProperties: false,
              },
              dx: { type: 'number', description: 'place: width (else the library default)' },
              blind_width: { type: 'number', description: 'place BCNR/L or BCNR/R (blind corner): false panel width = return run carcass depth + its door thickness + 2 + 40 (e.g. 560 + 18 + 2 + 40 = 620)' },
              dy: { type: 'number', description: 'place: height (else matched to the next_to cabinet, or the library default)' },
              labels: { type: 'array', items: { type: 'string' }, description: 'delete: cabinet labels' },
            },
            required: ['op'], additionalProperties: false,
          },
        },
      },
      required: ['description', 'steps'], additionalProperties: false,
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
    description: 'Names of the shop\'s handle schedules (for change_cabinets handle_schedule).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
]

// Frozen so it caches. Shop rules move to the Settings page in AI5.
const SYSTEM = `You are the RHK CADcam helper, inside a cabinet-making CAD app used by RHK's workshop.
You answer questions about the job the user has open and change its cabinets: resize, move, add (cabinets, end panels, fillers) and delete.

Scope: each message says the scope. "Selection" = only the cabinets the user has selected on the canvas; never touch others (the server refuses anyway — tell them to select more, or deselect everything for the whole room). "Room" = any cabinet in this room; changes there wait for the user to press Apply.

Changing cabinets (change_cabinets — one call per message, as ordered steps):
- update: width, height, depth, height off the floor, position along the wall (offset), notes, scribes, handle schedule.
- place: a library code (find_library first if you don't know it — e.g. search "end panel" or "filler"), next_to a cabinet's left / right side, or on a wall at_end left / right (or an offset). Left / right is always as you face the side it goes on.
- Faces and backs: a wall — an island especially — has a face and a back. The summary marks back-face cabinets "back". To put something on the back, use next_to a back cabinet, or wall + back: true. If the user says "back" or "far side" of an island, it's the back; if it's unclear which side they mean, ask.
- delete: by label. Adding and deleting always wait for the user to press Apply.
- Several steps in one call when they belong together, e.g. delete BC-04 then move BC-05 and BC-06 (offset) to close the gap — work the new offsets out from the summary.
- Colours (find_material first for the exact board name):
  · "all the overhead doors in Walnut" / "kicks black in this room" → set_material, level room (classes: wall; role fronts / kick). "…on the whole job" → level job.
  · "BC-03's doors in Walnut" (named or selected cabinets) → update with materials { fronts: … } — that cabinet's own colour, which wins over the room / job one.
  · Roles: fronts = doors, drawer fronts and false fronts; carcass = cabinet interior; exposed = end panels, fillers, open interiors; shelf; divider; kick = kick face.
  · Never guess a board: if find_material gives several close matches, ask_user with them as options.
- fixture: a catalogue appliance / sink (find_fixture) — on a cabinet (sink on BSK, cooktop on its base, oven in UBO, rangehood under WRH; centred, linked so the benchtop cut-out follows), or in a gap on a wall + offset (dishwasher, fridge, washer).
- markup: CAD notes on an elevation — a TBC cloud + question (layer questions), an appliance space (dashed box + label, layer general), site / install notes (layer site), lighting / power (electrical). x along the wall from its start, z height off the floor. They wait for Apply.
- Other rooms of the job: get_job_summary lists them, get_room_summary reads one. A step with rooms: ["Laundry"] or ["all"] changes those rooms too (filters like class "base" apply in each room). It always waits for Apply, and one Undo reverts every room.
- You can NOT touch walls or benchtops yet — say so.
- Clear request → just do it, no questions. Ambiguous or risky → ask_user first with 2–4 short options (which cabinets? which side? what size? which end panel?). One question at a time.
- After it, say in one line what changed (or that it's waiting for Apply). Undo is on the message.
- Sizes are W×H×D: width = dx, height = dy, depth = dz.

How overheads and bulkheads hang (get this right):
- Overheads (wall cabinets) HANG from the room's overhead top line (the summary's first lines; a soffit drop from the ceiling wins over a top line from the floor). An overhead's underside = top line − its height. "Off the floor" (pos_z) does NOT move overheads.
- Move ALL overheads up / down: set_properties (room) overhead_top (or soffit_drop if the room uses a soffit). Only the overheads on ONE wall: set_properties with wall + wall_soffit_drop (that wall's own soffit, mm down from the ceiling) — other walls stay put. Prefer the one-wall way when the cupboards asked about are all on one wall. Keep their undersides where they are but make them taller toward the ceiling: raise the top line AND add the same amount to their height (dy) — two steps, one change.
- Move ONE overhead: changes.wallz = its own underside from the floor (null puts it back on the top line).
- Bulkheads ("BH", "fills to ceiling" in the summary) fill from the overhead top line up to the ceiling by themselves. To make them smaller, raise the top line — never set their height. Example: ceiling 2320, top line 2120, bulkhead 200 → "bulkhead 30, cupboards taller toward the ceiling" = top line 2120 → 2290 + those cupboards' height +170.
- Before a change, say back in one line what you understood if the request could mean two things; if unsure, ask_user.

Reporting (strict):
- Say what changed ONLY from the change_cabinets result. "Applied" = done (Undo is on the message). "Shown to the user for Apply" = NOT done yet — say it's waiting for Apply. Never say something changed when it didn't, never ask to press Apply for something already applied.
- The room summary is the room as it is now — read sizes from it, not from earlier messages.

How to answer:
- Short and plain, like a workshop foreman. Lead with the answer. Sizes in mm.
- Use only the room summary and your tools. If the data doesn't say, say you can't tell — never guess sizes or colours.
- Cabinet labels like BC-03 (base), WC-02 (wall/overhead), TC-01 (tall). Codes like B2 / D3-1S2Pot are library cabinet types.
- TBC items are marked with CLOUDS in the markup; text near a cloud says what's to be confirmed.
- Totals: add them up yourself from the tool output and show the total clearly.
- "Kick length" means the visible kick: the kick_front_face total. Mention the rails behind only if asked.
- The shop's own rules follow (Settings › AI helper), and a job's notes come with the question (<job_notes>) — follow both; job notes win for that job.`

export interface ChatTurnArgs {
  client: SupabaseClient
  projectId: string
  roomId: string
  message: string
  /** Cabinets selected on the canvas — non-empty = Selection scope. */
  selectedIds?: string[]
  /** "Try harder": run this message on the stronger model. */
  strong?: boolean
}
export interface Proposal {
  roomId: string; ops: BatchOp[]; onlyIds?: string[]
  /** A change across several rooms: each room's steps (Apply runs runJobBatch). */
  groups?: { roomId: string; roomName: string; ops: BatchOp[] }[]
  description: string; lines: string[]
  /** AI2 proposals (one update) — kept so an old pending one still applies. */
  filter?: CabinetFilter; changes?: CabinetChanges
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

type ChangesIn = Omit<CabinetChanges, 'materials'> & { handle_schedule?: string | null; materials?: Partial<Record<MaterialRole, string | null>> }
interface StepIn { op?: string; rooms?: string[]; item?: string; on?: string; along?: number; from_back?: number; notes?: import('./cabinetBatch').MarkupNote[]; blind_width?: number; wall_soffit_drop?: number | null; kick?: number; base_dy?: number; tall_dy?: number; wall_dy?: number; overhead_top?: number; soffit_drop?: number; level?: 'room' | 'job'; role?: string; classes?: ('base' | 'wall' | 'tall')[]; material?: string | null; filter?: CabinetFilter; changes?: ChangesIn; code?: string; wall?: string; offset?: number; at_end?: 'left' | 'right'; back?: boolean; dy?: number; next_to?: { label: string; side: 'left' | 'right' }; dx?: number; labels?: string[] }
interface EditInput { description?: string; steps?: StepIn[] }

export async function runChatTurn(args: ChatTurnArgs): Promise<ChatTurnResult> {
  const t0 = Date.now()
  const model = args.strong ? STRONG_MODEL : CHAT_MODEL
  const PRICE = PRICES[model]
  const ctx: ToolContext = { projectId: args.projectId, roomId: args.roomId }
  const selection = args.selectedIds?.length ? args.selectedIds : null

  const [summary, past, selLabels, aiCtx] = await Promise.all([
    loadRoomSummary(args.roomId),
    history(args.projectId, args.roomId),
    selection
      ? supabase.from('cabinet_instances').select('id, label').in('id', selection).then(r => (r.data ?? []).map(c => c.label as string))
      : Promise.resolve([] as string[]),
    loadAiContext(args.projectId),
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
    { role: 'user', content: `<room_summary>\n${summary}\n</room_summary>${jobNotesBlock(aiCtx.jobNotes)}\n${scopeLine}\n\n${args.message}` },
  ]
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 }
  const toolCalls: string[] = []
  const out: Omit<ChatTurnResult, 'messageId' | 'costUsd' | 'ms' | 'model' | 'toolCalls'> = { reply: '' }
  let edited = false

  /** Run one change_cabinets call → tool result text, and maybe end the turn with a proposal. */
  async function runEdit(input: EditInput): Promise<{ text: string; isError?: boolean; endTurn?: boolean }> {
    if (edited) return { text: 'Only one change per message — finish this one, then the user can ask again.', isError: true }
    const ops: BatchOp[] = []
    const opRooms: (string[] | undefined)[] = []   // per op: target room names (undefined = this room)
    for (const [i, st] of (input.steps ?? []).entries()) {
      const before = ops.length
      if (st.op === 'update') {
        const { handle_schedule, materials, ...rest } = st.changes ?? {}
        const changes: CabinetChanges = { ...rest }
        if (materials) {
          changes.materials = {}
          for (const [role, name] of Object.entries(materials) as [MaterialRole, string | null][]) {
            if (name === null) { changes.materials[role] = null; continue }
            const m = await findMaterial(name)
            if ('error' in m) return { text: `Step ${i + 1}: ${m.error}`, isError: true }
            changes.materials[role] = m.id
          }
        }
        if (handle_schedule !== undefined) {
          if (handle_schedule === null) changes.handle_schedule_id = null
          else {
            const hs = await findHandleSchedule(handle_schedule)
            if ('error' in hs) return { text: `Step ${i + 1}: ${hs.error}`, isError: true }
            changes.handle_schedule_id = hs.id
          }
        }
        const filter: CabinetFilter = st.filter && filterHasCriteria(st.filter) ? st.filter : selection ? { labels: selLabels } : {}
        if (!filterHasCriteria(filter)) return { text: `Step ${i + 1}: say which cabinets (labels, class, wall or code), or ask the user to select them.`, isError: true }
        ops.push({ op: 'update', filter, changes })
      } else if (st.op === 'place') {
        if (!st.code) return { text: `Step ${i + 1}: place needs a library code.`, isError: true }
        ops.push({ op: 'place', code: st.code, wall: st.wall, offset: st.offset, at_end: st.at_end, back: st.back, next_to: st.next_to, dx: st.dx, dy: st.dy, blind_width: st.blind_width })
      } else if (st.op === 'set_material') {
        if (!st.level || !st.role || !(MATERIAL_ROLES as readonly string[]).includes(st.role) || st.material === undefined)
          return { text: `Step ${i + 1}: set_material needs level, role and material.`, isError: true }
        let id: string | null = null
        if (st.material !== null) {
          const m = await findMaterial(st.material)
          if ('error' in m) return { text: `Step ${i + 1}: ${m.error}`, isError: true }
          id = m.id
        }
        ops.push({ op: 'set_material', level: st.level, role: st.role as MaterialRole, classes: st.classes, material_id: id })
      } else if (st.op === 'fixture') {
        if (!st.item) return { text: `Step ${i + 1}: fixture needs an item.`, isError: true }
        ops.push({ op: 'fixture', item: st.item, on: st.on, along: st.along, from_back: st.from_back, wall: st.wall, offset: st.offset, back: st.back })
      } else if (st.op === 'markup') {
        if (!st.notes?.length) return { text: `Step ${i + 1}: markup needs notes.`, isError: true }
        ops.push({ op: 'markup', notes: st.notes })
      } else if (st.op === 'set_properties') {
        const level = st.level ?? 'room'
        ops.push(st.wall && st.wall_soffit_drop !== undefined
          ? { op: 'set_properties', level: 'room', wall: st.wall, wall_soffit_drop: st.wall_soffit_drop }
          : { op: 'set_properties', level, kick: st.kick, base_dy: st.base_dy, tall_dy: st.tall_dy, wall_dy: st.wall_dy, soffit_drop: st.soffit_drop, overhead_top: st.overhead_top })
      } else if (st.op === 'delete') {
        const labels = st.labels?.length ? st.labels : selection ? selLabels : []
        if (!labels.length) return { text: `Step ${i + 1}: delete needs labels.`, isError: true }
        ops.push({ op: 'delete', labels })
      } else return { text: `Step ${i + 1}: op must be update, place, delete, set_material or set_properties.`, isError: true }
      for (let k = before; k < ops.length; k++) opRooms[k] = st.rooms?.length ? st.rooms : undefined
    }
    if (!ops.length) return { text: 'No steps.', isError: true }

    // A change for other rooms too → one group per room, always waiting for Apply.
    if (opRooms.some(r => r?.length)) {
      if (selection) return { text: 'A change across rooms works with nothing selected — ask the user to deselect.', isError: true }
      const { data: jr } = await supabase.from('rooms').select('id, name').eq('project_id', args.projectId).order('sort_order')
      const jobRooms = (jr ?? []) as { id: string; name: string }[]
      const groups: { roomId: string; roomName: string; ops: BatchOp[] }[] = []
      for (const [k, op] of ops.entries()) {
        const names = opRooms[k]
        const targets = !names ? jobRooms.filter(r => r.id === args.roomId)
          : names.some(x => x.toLowerCase() === 'all') ? jobRooms
          : jobRooms.filter(r => names.some(x => x.trim().toLowerCase() === r.name.toLowerCase()))
        if (names && !names.some(x => x.toLowerCase() === 'all') && targets.length < names.length) return { text: `Unknown room in ${names.join(', ')}. Rooms: ${jobRooms.map(r => r.name).join(', ')}`, isError: true }
        for (const t of targets) {
          let g = groups.find(x => x.roomId === t.id)
          if (!g) { g = { roomId: t.id, roomName: t.name, ops: [] }; groups.push(g) }
          g.ops.push(op)
        }
      }
      const lines: string[] = [], problems: string[] = []
      for (const g of groups) {
        const pl = await planBatch(g.roomId, g.ops)
        // A room where a filter matches nothing just has nothing to do there.
        const real = pl.problems.filter(p => !/no cabinets match/.test(p))
        problems.push(...real.map(p => `${g.roomName}: ${p}`))
        lines.push(...pl.lines.map(l => `${g.roomName} · ${l}`), ...pl.warnings.map(w => `⚠ ${g.roomName} · ${w}`))
      }
      if (problems.length) return { text: problems.join('\n'), isError: true }
      if (!lines.length) return { text: 'Nothing to change in those rooms.' }
      edited = true
      out.proposal = { roomId: args.roomId, ops, groups, description: input.description?.trim() || 'Job change', lines }
      return { text: 'Shown to the user for Apply.', endTurn: true }
    }

    const plan = await planBatch(args.roomId, ops, { onlyIds: selection ?? undefined })
    if (plan.problems.length) return { text: plan.problems.join('\n'), isError: true }
    if (!plan.steps.length) return { text: 'Nothing to change — already like that.' }
    const description = input.description?.trim() || 'AI change'
    edited = true

    if (selection && plan.onlyUpdates && plan.touched <= AUTO_APPLY_MAX) {
      const res = await withSupabase(args.client, () => runBatch(args.roomId, ops, { description, onlyIds: selection }))
      out.changed = res.changed; out.batchId = res.batchId; out.cabinetIds = res.cabinetIds
      return { text: ['Applied:', ...res.changed, ...res.warnings.map(w => `Warning: ${w}`), ...res.errors.map(e => `Resolver error: ${e}`)].join('\n') }
    }
    out.proposal = { roomId: args.roomId, ops, onlyIds: selection ?? undefined, description, lines: [...plan.lines, ...plan.warnings.map(w => `⚠ ${w}`)] }
    return { text: 'Shown to the user for Apply.', endTurn: true }
  }

  for (let i = 0; i < MAX_CALLS; i++) {
    const res = await anthropic.messages.create({
      model,
      max_tokens: 4000,
      system: systemBlocks(SYSTEM, aiCtx.rules),
      tools: [...READ_TOOLS, ...EDIT_TOOLS],
      output_config: { effort: args.strong ? 'high' : 'medium' },
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
        if (u.name === 'change_cabinets') {
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
    model, input_tokens: usage.input, output_tokens: usage.output,
    cache_read_tokens: usage.cacheRead, cache_write_tokens: usage.cacheWrite,
    api_calls: usage.calls, cost_usd: costUsd, ms,
    question: out.question ?? null,
    proposal: out.proposal ?? null, proposal_status: out.proposal ? 'pending' : null,
    batch_id: out.batchId ?? null, changed: out.changed?.length ? out.changed : null,
  }).select('id').single()
  if (error) console.error('ai_messages insert:', error.message)
  return { ...out, messageId: saved?.id ?? null, costUsd, ms, model, toolCalls }
}
