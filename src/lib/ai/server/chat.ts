// AI helper chat turn (z_ai_helper AI1–AI3) on Claude Opus 5.5, effort high (Mark 2026-11-27 —
// Sonnet at medium effort was faking requests it had no tool for; Try harder = Opus at xhigh). One turn =
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
import { ensureConversation, touchConversation } from './conversations'
import type { InteriorAction } from '../interior'

/** Everyday model, and the one "Try harder" re-runs a message on. */
export const CHAT_MODEL = 'claude-opus-5-5'
export const STRONG_MODEL = 'claude-opus-5-5'
const CHAT_EFFORT = 'high' as const
const STRONG_EFFORT = 'xhigh' as const
// $ per million tokens. Cache reads ~0.1×, writes 1.25× input.
export const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.10, cacheWrite: 2.5 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.20, cacheWrite: 5 },
}
const MAX_CALLS = 12
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
    description: 'Make one change to the room as ordered steps, applied and undone together. Steps: "update" (filter + changes: width dx, height dy, depth dz, off-floor pos_z for base / tall only, offset along the wall, notes, scribes, handle_schedule, wallz = one overhead own underside, materials = the cabinets own colours), "set_material" (a colour for a kind of cabinet across the room or the whole job), "set_properties" (room / job set-up: overhead top line or soffit, kick, class heights), "place" (a library code from find_library, next_to a cabinet on its left/right, or on a wall at an offset), "delete" (labels), "resolve" (labels: re-resolve as they are), "hinges" (labels + per_door, optional door row,col), "interior" (label + interior moves on its numbered bays from get_cabinet_detail). E.g. delete BC-04 then update BC-05 / BC-06 offsets to close the gap. Call it once per message.',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Short summary for the history, e.g. "Delete BC-04, close the gap"' },
        steps: {
          type: 'array', minItems: 1, maxItems: 12,
          items: {
            type: 'object',
            properties: {
              op: { type: 'string', enum: ['update', 'place', 'delete', 'set_material', 'set_properties', 'markup', 'fixture', 'resolve', 'hinges', 'interior'] },
              per_door: { type: ['integer', 'null'], description: 'hinges: hinges on each door (spaced with the shop insets); null = back to the shop rules' },
              door: {
                type: 'object', description: 'hinges: just this door (row,col from get_cabinet_detail); leave out for every door',
                properties: { row: { type: 'integer' }, col: { type: 'integer' } }, required: ['row', 'col'], additionalProperties: false,
              },
              label: { type: 'string', description: 'interior: the cabinet' },
              moves: {
                type: 'array', description: 'interior: moves in order. bay = number from get_cabinet_detail ("2", "2.1"; "0" = the whole interior). After add_shelf / add_divider / remove_* the bays are re-numbered for the next move.',
                items: {
                  type: 'object',
                  properties: {
                    do: { type: 'string', enum: ['size', 'adj_shelves', 'add_shelf', 'shelf_type', 'remove_shelf', 'add_divider', 'remove_bay'], description: 'size = a bay\'s height (shelf split) / width (divider split), null = fills the rest; adj_shelves = how many adjustable shelves in an open bay; add_shelf = a shelf across an open bay (below = height of the new bay under it); shelf_type = what sits above a bay (fixed / adjustable / none); remove_shelf = the shelf above a bay; add_divider = a divider up through an open bay (left = width left of it); remove_bay' },
                    bay: { type: 'string' },
                    size: { type: ['number', 'null'] },
                    count: { type: 'integer' },
                    kind: { type: 'string', enum: ['fixed', 'adjustable', 'none'] },
                    below: { type: 'number' },
                    left: { type: 'number' },
                  },
                  required: ['do', 'bay'], additionalProperties: false,
                },
              },
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
              role: { type: 'string', enum: [...MATERIAL_ROLES], description: 'set_material: fronts (doors / drawers), carcass, exposed (end panels, fillers, open interiors), shelf, divider, back (the back panel; else it takes the carcass board), kick (kick face)' },
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
              labels: { type: 'array', items: { type: 'string' }, description: 'delete / resolve / hinges: cabinet labels' },
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
  {
    name: 'report_gap',
    description: 'Log something the user asked for that no tool of yours can do, so the shop can build it next (Settings › AI helper › Can\'t do yet). Call it once per missing feature, before you tell the user you can\'t. Not for things you could do but chose not to, or for questions you can answer.',
    input_schema: {
      type: 'object',
      properties: {
        request: { type: 'string', description: 'What the user wanted, short, in their words, with the cabinet, e.g. "move the inner drawer in TC-01 up 50"' },
        missing: { type: 'string', description: 'The missing feature as a short name, the same wording every time so reports group: e.g. "drawers inside a bay", "kick pieces", "front layout", "walls", "benchtops", "splashbacks", "accessories / rails", "edge tape per part", "part sizes"' },
      },
      required: ['request', 'missing'], additionalProperties: false,
    },
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
  · Roles: fronts = doors, drawer fronts and false fronts; carcass = cabinet interior; exposed = end panels, fillers, open interiors; shelf; divider; back = the back panel only (else it follows carcass) — "backs in 18mm" = materials { back: <an 18mm board> }; kick = kick face.
  · Never guess a board: if find_material gives several close matches, ask_user with them as options.
- fixture: a catalogue appliance / sink (find_fixture) — on a cabinet (sink on BSK, cooktop on its base, oven in UBO, rangehood under WRH; centred, linked so the benchtop cut-out follows), or in a gap on a wall + offset (dishwasher, fridge, washer).
- markup: CAD notes on an elevation — a TBC cloud + question (layer questions), an appliance space (dashed box + label, layer general), site / install notes (layer site), lighting / power (electrical). x along the wall from its start, z height off the floor. They wait for Apply.
- Other rooms of the job: get_job_summary lists them, get_room_summary reads one. A step with rooms: ["Laundry"] or ["all"] changes those rooms too (filters like class "base" apply in each room). It always waits for Apply, and one Undo reverts every room.
- resolve: re-resolve cabinets as they are (parts, drilling, hardware rebuilt) when the user asks or something looks stale. Changes already re-resolve what they touch — don't add it to those.
- hinges: hinges per door — per_door 2 on a 2-door cabinet = 4 in all. null = back to the shop rules (by door height). Read get_cabinet_detail first for the doors and current hinges. If the count is light for the door height (shop rules: up to 900 → 2, 1800 → 3, 2400 → 4), do it but say so.
- interior: shelves, bays and dividers of ONE cabinet. Read get_cabinet_detail first — it numbers the bays (bottom → top in a shelf split, left → right in a divider split) and gives the resolved shelf heights. Moves: size (a bay's height; null = fills the rest), adj_shelves (count in an open bay), add_shelf (kind fixed / adjustable, below = height of the bay under it), shelf_type, remove_shelf, add_divider (left = width), remove_bay. To move a fixed shelf, change the size of the bay under it (and the one above if that has a size too). Bay sizes are clear heights between boards — allow for the shelf thickness. After add / remove moves the bays re-number.
- You can NOT touch walls, benchtops, splashbacks, single kick pieces, drawers / rails inside the interior, or front layouts yet — say so.
- Whenever a request (or part of one) needs something no tool of yours can do, call report_gap for it first (once per missing feature), then tell the user. That list is what gets built next.
- Clear request → just do it, no questions. Ambiguous or risky → ask_user FIRST, before any change_cabinets, with 2–4 short options (asking drops a proposal made earlier in the same message) (which cabinets? which side? what size? which end panel?). One question at a time.
- After it, say in one to three short lines what changed (or what will change once they press Apply) and why, using the cabinet labels and the sizes. Undo is on the message.

Doing what was asked (strict):
- Do the real change or say plainly that you can't. NEVER put the request into a cabinet's notes (or any note) in place of doing it — e.g. "move the shelf 120 down", "only 4 hinges", "re-resolve" must not become edited note text. Notes change only when the user asks for a note.
- If part of a request is beyond your tools (single kick pieces, drawers / rails inside the interior, front layouts, walls, benchtops, splashbacks), do the parts you can and then say clearly which part you did NOT do, so the user does it on the canvas. Don't hide it, don't call it done.
- Never claim a change that isn't in the change_cabinets result.
- "Resolver error" / "Warning" lines in a result are real problems the change caused or found (e.g. a hinge plate over shelf holes): tell the user each one in plain words, and offer a fix if you have one.
- Sizes are W×H×D: width = dx, height = dy, depth = dz.
- Every size / offset in a change is the NEW value in mm, never the amount to add: "50 deeper" on a 350 deep cabinet = dz 400. Work it out from the summary.
- A proposal comes back with its change lines — read them; if one isn't what the user asked, call change_cabinets again to replace it before you answer.

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
  /** The chat this message belongs to; none (or not this job's) = a new chat. */
  conversationId?: string | null
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
  conversationId: string
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

/** Last few exchanges of this conversation. A message asked in another room is tagged
 *  with that room, so its labels don't get mixed up with this room's. */
async function history(conversationId: string, roomId: string): Promise<Anthropic.MessageParam[]> {
  const { data } = await supabase.from('ai_messages').select('role, text, room_id, question, proposal, proposal_status, changed, undone_at')
    .eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(HISTORY_TURNS * 2)
  const rows = ((data ?? []) as (HistoryRow & { room_id: string | null })[]).reverse()
  const otherRooms = [...new Set(rows.map(r => r.room_id).filter((x): x is string => !!x && x !== roomId))]
  const { data: rn } = otherRooms.length ? await supabase.from('rooms').select('id, name').in('id', otherRooms) : { data: [] }
  const roomName = new Map(((rn ?? []) as { id: string; name: string }[]).map(r => [r.id, r.name]))
  while (rows.length && rows[0].role !== 'user') rows.shift()
  const out: Anthropic.MessageParam[] = []
  for (const m of rows) {
    const tag = m.room_id && m.room_id !== roomId ? `[In room ${roomName.get(m.room_id) ?? 'another room'}] ` : ''
    const text = tag + (m.role === 'assistant' ? replayText(m) : m.text)
    const last = out[out.length - 1]
    if (last && last.role === m.role) last.content = `${last.content}\n\n${text}`   // keep turns alternating
    else out.push({ role: m.role as 'user' | 'assistant', content: text })
  }
  if (out.length && out[out.length - 1].role === 'user') out.pop()   // an unanswered question
  return out
}

type ChangesIn = Omit<CabinetChanges, 'materials'> & { handle_schedule?: string | null; materials?: Partial<Record<MaterialRole, string | null>> }
interface StepIn { op?: string; rooms?: string[]; item?: string; on?: string; along?: number; from_back?: number; notes?: import('./cabinetBatch').MarkupNote[]; blind_width?: number; wall_soffit_drop?: number | null; kick?: number; base_dy?: number; tall_dy?: number; wall_dy?: number; overhead_top?: number; soffit_drop?: number; level?: 'room' | 'job'; role?: string; classes?: ('base' | 'wall' | 'tall')[]; material?: string | null; filter?: CabinetFilter; changes?: ChangesIn; code?: string; wall?: string; offset?: number; at_end?: 'left' | 'right'; back?: boolean; dy?: number; next_to?: { label: string; side: 'left' | 'right' }; dx?: number; labels?: string[]; per_door?: number | null; door?: { row: number; col: number }; label?: string; moves?: InteriorAction[] }
interface EditInput { description?: string; steps?: StepIn[] }

export async function runChatTurn(args: ChatTurnArgs): Promise<ChatTurnResult> {
  const t0 = Date.now()
  const model = args.strong ? STRONG_MODEL : CHAT_MODEL
  const PRICE = PRICES[model]
  const ctx: ToolContext = { projectId: args.projectId, roomId: args.roomId }
  const selection = args.selectedIds?.length ? args.selectedIds : null

  const conversationId = await ensureConversation(args.projectId, args.conversationId)
  const [summary, past, selLabels, aiCtx] = await Promise.all([
    loadRoomSummary(args.roomId),
    history(conversationId, args.roomId),
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
    { project_id: args.projectId, room_id: args.roomId, conversation_id: conversationId, role: 'user', text: args.message, scope: selection ? 'selection' : 'room' })
  if (asked.error) throw new Error(`ai_messages: ${asked.error.message}`)
  await touchConversation(conversationId, args.message)

  const messages: Anthropic.MessageParam[] = [
    ...past,
    { role: 'user', content: `<room_summary>\n${summary}\n</room_summary>${jobNotesBlock(aiCtx.jobNotes)}\n${scopeLine}\n\n${args.message}` },
  ]
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 }
  const toolCalls: string[] = []
  const out: Omit<ChatTurnResult, 'messageId' | 'conversationId' | 'costUsd' | 'ms' | 'model' | 'toolCalls'> = { reply: '' }
  let edited = false

  /** A proposal's tool result: the model reads the lines back and may replace it before answering. */
  const proposalText = (lines: string[]) => [
    'Shown to the user for Apply — NOT done yet. Once applied it will:', ...lines, '',
    'Check these lines against what the user asked. If any is wrong, call change_cabinets again — it replaces this proposal. If they are right, answer the user.',
  ].join('\n')

  /** Run one change_cabinets call → tool result text. A proposal can be replaced by a later call this turn; an applied change can't. */
  async function runEdit(input: EditInput): Promise<{ text: string; isError?: boolean }> {
    if (edited) return { text: 'Already applied — one change per message. Tell the user what was done; they can ask again.', isError: true }
    const ops: BatchOp[] = []
    const opRooms: (string[] | undefined)[] = []   // per op: target room names (undefined = this room)
    for (const [i, st] of (input.steps ?? []).entries()) {
      const before = ops.length
      if (st.op === 'update') {
        const { handle_schedule, materials, ...rest } = st.changes ?? {}
        // Notes are not a stand-in for a change the tools can't make (Mark 2026-11-27: "4 hinges"
        // became a note). Only when the user's own words ask for a note.
        if (rest.notes !== undefined && !/\bnot(e|es|ed)\b/i.test(args.message))
          return { text: `Step ${i + 1}: notes refused — the user didn't ask for a note. Don't write the request into notes instead of doing it. If no tool can do it, drop this step and tell the user plainly what you could not do.`, isError: true }
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
      } else if (st.op === 'resolve') {
        const labels = st.labels?.length ? st.labels : selection ? selLabels : []
        if (!labels.length) return { text: `Step ${i + 1}: resolve needs labels.`, isError: true }
        ops.push({ op: 'resolve', labels })
      } else if (st.op === 'hinges') {
        const labels = st.labels?.length ? st.labels : selection ? selLabels : []
        if (!labels.length || st.per_door === undefined) return { text: `Step ${i + 1}: hinges needs labels and per_door (a number, or null for the shop rules).`, isError: true }
        ops.push({ op: 'hinges', labels, per_door: st.per_door, door: st.door })
      } else if (st.op === 'interior') {
        const label = st.label ?? (selLabels.length === 1 ? selLabels[0] : undefined)
        if (!label || !st.moves?.length) return { text: `Step ${i + 1}: interior needs one cabinet label and its moves.`, isError: true }
        ops.push({ op: 'interior', label, actions: st.moves })
      } else return { text: `Step ${i + 1}: op must be update, place, delete, set_material, set_properties, markup, fixture, resolve, hinges or interior.`, isError: true }
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
      out.proposal = { roomId: args.roomId, ops, groups, description: input.description?.trim() || 'Job change', lines }
      return { text: proposalText(lines) }
    }

    const plan = await planBatch(args.roomId, ops, { onlyIds: selection ?? undefined })
    if (plan.problems.length) return { text: plan.problems.join('\n'), isError: true }
    if (!plan.steps.length) return { text: 'Nothing to change — already like that.' }
    const description = input.description?.trim() || 'AI change'

    if (selection && plan.onlyUpdates && plan.touched <= AUTO_APPLY_MAX) {
      edited = true
      out.proposal = undefined   // applied straight away: replaces an earlier proposal in this turn
      const res = await withSupabase(args.client, () => runBatch(args.roomId, ops, { description, onlyIds: selection }))
      out.changed = res.changed; out.batchId = res.batchId; out.cabinetIds = res.cabinetIds
      // Check after the change (Q5): the selected cabinets as they now are, resolved, for the model to
      // compare with the request before it answers.
      const after = await Promise.all(selLabels.slice(0, AUTO_APPLY_MAX).map(l => runReadTool('get_cabinet_detail', { label: l }, ctx)))
      return { text: [
        'Applied:', ...res.changed, ...res.warnings.map(w => `Warning: ${w}`), ...res.errors.map(e => `Resolver error: ${e}`),
        '', 'The cabinets now (resolved) — check them against what the user asked before you answer; say plainly if anything is off:',
        ...after,
      ].join('\n') }
    }
    out.proposal = { roomId: args.roomId, ops, onlyIds: selection ?? undefined, description, lines: [...plan.lines, ...plan.warnings.map(w => `⚠ ${w}`)] }
    return { text: proposalText(out.proposal.lines) }
  }

  /** One model call; `noTools` = the closing explanation (tools stay listed so the cache holds). */
  async function call(noTools = false) {
    const res = await anthropic.messages.create({
      model,
      max_tokens: 16000,
      system: systemBlocks(SYSTEM, aiCtx.rules),
      tools: [...READ_TOOLS, ...EDIT_TOOLS],
      ...(noTools && { tool_choice: { type: 'none' as const } }),
      output_config: { effort: args.strong ? STRONG_EFFORT : CHAT_EFFORT },
      messages,
    })
    usage.calls++
    usage.input += res.usage.input_tokens
    usage.output += res.usage.output_tokens
    usage.cacheRead += res.usage.cache_read_input_tokens ?? 0
    usage.cacheWrite += res.usage.cache_creation_input_tokens ?? 0
    return res
  }
  const textOf = (res: Anthropic.Message) => res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n').trim()

  /** Set when the loop runs out of calls: the model then writes the answer, no tools. */
  let wrapUp: string | null = null
  for (let i = 0; i < MAX_CALLS; i++) {
    const res = await call()

    if (res.stop_reason === 'refusal') { out.reply = "Sorry — I can't help with that one."; break }
    const text = textOf(res)
    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (res.stop_reason !== 'tool_use' || !uses.length) { out.reply = text || (out.changed?.length ? 'Done.' : out.proposal ? "Here's what will change — press Apply to do it." : '(no answer)'); break }

    const ask = uses.find(u => u.name === 'ask_user')
    if (ask) {
      const q = ask.input as { question?: string; options?: string[] }
      out.question = { text: q.question ?? '', options: (q.options ?? []).slice(0, 4) }
      // A question settles the change first: a half-made proposal from this turn is dropped
      // (it would be answered in the next message anyway). An applied change stays.
      out.proposal = undefined
      out.reply = [text, q.question].filter(Boolean).join('\n\n')
      toolCalls.push('ask_user')
      break
    }

    messages.push({ role: 'assistant', content: res.content })
    const results: Anthropic.ToolResultBlockParam[] = []
    for (const u of uses) {
      toolCalls.push(u.name)
      try {
        if (u.name === 'change_cabinets') {
          const r = await runEdit(u.input as EditInput)
          results.push({ type: 'tool_result', tool_use_id: u.id, content: r.text, ...(r.isError && { is_error: true }) })
        } else if (u.name === 'report_gap') {
          const g = u.input as { request?: string; missing?: string }
          const { error } = await supabase.from('ai_gaps').insert({
            project_id: args.projectId, room_id: args.roomId, conversation_id: conversationId,
            request: String(g.request ?? args.message).slice(0, 500), missing: String(g.missing ?? 'other').trim().toLowerCase().slice(0, 80),
          })
          if (error) console.error('ai_gaps insert:', error.message)
          results.push({ type: 'tool_result', tool_use_id: u.id, content: 'Logged. Now tell the user plainly what you could not do.' })
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
    messages.push({ role: 'user', content: results })
    if (i === MAX_CALLS - 1) { wrapUp = text; break }
  }
  if (wrapUp !== null) {
    // Out of tool calls: one last call, no tools, so the user still gets a real answer
    // (what will change, what it could not do) instead of "too many steps".
    try {
      const res = await call(true)
      out.reply = (res.stop_reason !== 'refusal' && textOf(res)) || wrapUp
    } catch (e) {
      console.error('ai wrap-up:', (e as Error).message)
      out.reply = wrapUp
    }
    if (!out.reply) out.reply = out.proposal ? `Here's what will change — press Apply to do it.` : 'That took too many steps — try asking it more simply.'
  }

  const costUsd = (usage.input * PRICE.input + usage.output * PRICE.output + usage.cacheRead * PRICE.cacheRead + usage.cacheWrite * PRICE.cacheWrite) / 1e6
  const ms = Date.now() - t0
  const { data: saved, error } = await supabase.from('ai_messages').insert({
    project_id: args.projectId, room_id: args.roomId, conversation_id: conversationId, role: 'assistant', text: out.reply, scope: selection ? 'selection' : 'room',
    model: args.strong ? `${model} ${STRONG_EFFORT}` : model, input_tokens: usage.input, output_tokens: usage.output,
    cache_read_tokens: usage.cacheRead, cache_write_tokens: usage.cacheWrite,
    api_calls: usage.calls, cost_usd: costUsd, ms,
    question: out.question ?? null,
    proposal: out.proposal ?? null, proposal_status: out.proposal ? 'pending' : null,
    batch_id: out.batchId ?? null, changed: out.changed?.length ? out.changed : null,
  }).select('id').single()
  if (error) console.error('ai_messages insert:', error.message)
  await supabase.from('ai_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId)
  return { ...out, messageId: saved?.id ?? null, conversationId, costUsd, ms, model, toolCalls }
}
