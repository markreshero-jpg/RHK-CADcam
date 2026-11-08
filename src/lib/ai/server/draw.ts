// AI helper drawing (z_ai_helper AI4): read a plan PDF / site sketch photo on
// Claude Opus 5.5 and return ONE room plan — set-up + walls + library cabinets
// with offsets + TBC notes. The plan becomes batch steps (set_properties / wall /
// place), dry-run by planBatch; problems go back to the model to fix (twice at
// most), then the user gets the whole thing as one proposal to Apply — one Undo
// removes it all.
//
// Before drawing, the model is told which job / room set-up is missing (kick
// height, tall height, overhead top line); it asks the user (ask_questions — Mark,
// 2026-11-08: ask, don't assume) along with anything else the plan leaves open
// (dishwasher type, island back panel). The question message keeps what it was
// reading (`draw`), and the answers carry the drawing on.
//
// Run inside withSupabaseRead() (reads only — Apply runs the batch later).

import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/src/lib/supabase'
import { loadRoomSummary } from '../roomSummary'
import { READ_TOOLS, runReadTool, type ToolContext } from '../readTools'
import { DRAW_RULES } from '../drawRules'
import { planBatch, type BatchOp } from './cabinetBatch'
import type { Proposal } from './chat'
import { jobNotesBlock, loadAiContext, systemBlocks } from '../shopRules'
import { ensureConversation, touchConversation } from './conversations'

export const DRAW_MODEL = 'claude-opus-5-5'
// $ per million tokens (Opus 5.5): cache reads $0.20, writes 1.25× input.
const PRICE = { input: 4, output: 20, cacheRead: 0.20, cacheWrite: 5 }
const MAX_CALLS = 10
const MAX_FIXES = 2
export const DRAW_BUCKET = 'ai-uploads'

const ASK_TOOL: Anthropic.Tool = {
  name: 'ask_questions',
  description: 'Ask the user everything you need before drawing, in ONE go (up to 4 questions, each with 2–4 short answer buttons; they can also type). Ends this turn; their answers come back and you carry on. Use it for set-up that is NOT SET, and anything the plan leaves open that the rules say to ask about.',
  input_schema: {
    type: 'object',
    properties: {
      intro: { type: 'string', description: 'One short line, e.g. "Before I draw this kitchen:"' },
      questions: {
        type: 'array', minItems: 1, maxItems: 4,
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            options: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4, description: 'What the plan suggests first, e.g. "140 (plan)"' },
          },
          required: ['question', 'options'], additionalProperties: false,
        },
      },
    },
    required: ['questions'], additionalProperties: false,
  },
}

const PLAN_TOOL: Anthropic.Tool = {
  name: 'room_plan',
  description: 'Hand back the finished room plan. Call it once when you have read the whole plan and have every answer you need. The server checks it; if it reports problems, fix them and call room_plan again with the WHOLE corrected plan.',
  input_schema: {
    type: 'object',
    properties: {
      setup: {
        type: 'object', description: 'Set-up values to save (the ones that were NOT SET, from the user\'s answers or the plan). Leave out what is already set.',
        properties: {
          kick: { type: 'number', description: 'Kick height (mm)' },
          base_dy: { type: 'number', description: 'Base cabinet height incl. kick (mm)' },
          tall_dy: { type: 'number', description: 'Tall height incl. kick (mm)' },
          wall_dy: { type: 'number', description: 'Overhead height (mm)' },
          soffit_drop: { type: 'number', description: 'Soffit: mm DOWN from the ceiling to the overhead tops' },
          overhead_top: { type: 'number', description: 'Overhead top line: mm UP from the floor (when there is no soffit)' },
        },
        additionalProperties: false,
      },
      walls: {
        type: 'array', description: 'New walls only, in drawing order (clockwise chain, then islands). Leave empty if the room already has the walls you need.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'e.g. "Wall 1", "Island 1"' },
            x: { type: 'number' }, y: { type: 'number' },
            length: { type: 'number' }, angle: { type: 'number' },
            type: { type: 'string', enum: ['standard', 'island'] },
            height: { type: 'number' },
          },
          required: ['name', 'x', 'y', 'length', 'angle', 'type'], additionalProperties: false,
        },
      },
      items: {
        type: 'array', description: 'Every cabinet, end panel and filler, wall by wall in order along the wall.',
        items: {
          type: 'object',
          properties: {
            wall: { type: 'string', description: 'Wall name (new or existing)' },
            back: { type: 'boolean', description: 'On the wall\'s back side (an island\'s far side)' },
            code: { type: 'string', description: 'Library code' },
            offset: { type: 'number', description: 'mm from the wall start to the low end' },
            dx: { type: 'number' }, dy: { type: 'number' }, dz: { type: 'number' },
            blind_width: { type: 'number', description: 'BCNR/L / BCNR/R only: false panel width = return run depth + its door + 2 + 40' },
            note: { type: 'string', description: 'Plan reference, e.g. "#3" — for the user' },
          },
          required: ['wall', 'code', 'offset', 'dx'], additionalProperties: false,
        },
      },
      fixtures: {
        type: 'array', description: 'Appliances / sinks from the catalogue (find_fixture): sink on the sink cabinet, cooktop on its base, oven in the UBO, rangehood under the WRH (on = the cabinet label, centred), dishwasher / fridge / washer in their gap (wall + offset of the gap low end).',
        items: {
          type: 'object',
          properties: {
            item: { type: 'string' }, on: { type: 'string' }, along: { type: 'number' }, from_back: { type: 'number' },
            wall: { type: 'string' }, offset: { type: 'number' }, back: { type: 'boolean' },
          },
          required: ['item'], additionalProperties: false,
        },
      },
      markup: {
        type: 'array', description: 'CAD markup on the elevations (markup standard): every appliance / fixture space not drawn (dashed box + label), every TBC (cloud + question, layer questions), site / install notes, colour callouts the spec block doesn\'t cover.',
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
      tbc: { type: 'array', items: { type: 'string' }, description: 'Things to confirm with the client / site, one short line each' },
      summary: { type: 'string', description: 'One short paragraph for the user: what you drew and what you left as gaps' },
    },
    required: ['walls', 'items', 'tbc', 'summary'], additionalProperties: false,
  },
}

const SYSTEM = `You are RHK CADcam's plan reader. RHK is a cabinet-making workshop. You read a customer's kitchen / joinery plan (PDF) or a site sketch (photo) and turn it into a room plan the app draws: the job / room set-up, walls, and the library cabinets on them with exact offsets. You never draw on screen — you only return the plan with the room_plan tool, once.

Work carefully: read every elevation and the plan view, add up each dimension chain, check it against the wall length, then decide. Use find_library to check codes you're not sure of.

ASK FIRST (Mark's rule): before calling room_plan, if any set-up the drawing needs is NOT SET (kick height; tall height when there are talls; overhead top line when there are overheads), or the plan leaves a dishwasher's type open, or an island has no back panel shown, call ask_questions ONCE with all of those together (up to 4) — offer what the plan suggests as the first option. Then draw to the answers and put the newly set values in room_plan.setup. If everything is set and clear, don't ask — draw. Anything else you can't read goes in tbc; never guess a size.

${DRAW_RULES}`

export interface DrawCtx { path: string; fileName: string; notes: string; qa: { q: string; a: string }[] }
export interface DrawArgs { projectId: string; roomId: string; ctx: DrawCtx; conversationId?: string | null }
export interface DrawResult {
  messageId: string | null; conversationId: string; reply: string; proposal?: Proposal
  question?: { text: string; options: string[]; items?: { text: string; options: string[] }[] }
  costUsd: number; ms: number; model: string; toolCalls: string[]
}

const anthropic = new Anthropic()   // ANTHROPIC_API_KEY from the server env

interface Setup { kick?: number; base_dy?: number; tall_dy?: number; wall_dy?: number; soffit_drop?: number; overhead_top?: number }
interface PlanIn {
  setup?: Setup
  walls?: { name: string; x: number; y: number; length: number; angle: number; type: 'standard' | 'island'; height?: number }[]
  items?: { wall: string; back?: boolean; code: string; offset: number; dx: number; dy?: number; dz?: number; blind_width?: number; note?: string }[]
  markup?: import('./cabinetBatch').MarkupNote[]
  fixtures?: { item: string; on?: string; along?: number; from_back?: number; wall?: string; offset?: number; back?: boolean }[]
  tbc?: string[]; summary?: string
}

type Row = Record<string, unknown>
const dyOf = (cd: unknown, cls: string) => ((cd ?? {}) as Record<string, { dy?: number } | undefined>)[cls]?.dy

/**
 * What set-up the room has, as the model reads it — and where new values go:
 * the job, while this is its first room with cabinets (later rooms inherit it);
 * after that the room, so other rooms never change under the user.
 */
async function loadSetup(projectId: string, roomId: string) {
  const [{ data: room }, { data: job }, { data: rooms }] = await Promise.all([
    supabase.from('rooms').select('id, name, rule_overrides, class_dimension_defaults, soffit_height, wall_cabinet_top, room_dy').eq('id', roomId).single(),
    supabase.from('projects').select('id, rule_overrides, class_dimension_defaults').eq('id', projectId).single(),
    supabase.from('rooms').select('id').eq('project_id', projectId).neq('id', roomId),
  ])
  const otherIds = ((rooms ?? []) as { id: string }[]).map(r => r.id)
  const { count } = otherIds.length
    ? await supabase.from('cabinet_instances').select('id', { count: 'exact', head: true }).in('room_id', otherIds)
    : { count: 0 }
  const r = (room ?? {}) as Row, j = (job ?? {}) as Row
  const firstRoom = !count
  const val = (rv: unknown, jv: unknown) => rv != null ? `${rv} (room)` : jv != null ? `${jv} (job)` : 'NOT SET'
  const rTOEH = (r.rule_overrides as Row | null)?.TOEH, jTOEH = (j.rule_overrides as Row | null)?.TOEH
  const top = r.soffit_height != null ? `soffit ${r.soffit_height} down from the ceiling (room)` : r.wall_cabinet_top != null ? `${r.wall_cabinet_top} from the floor (room)` : 'NOT SET'
  const text = [
    'Job / room set-up (Job / Room properties):',
    `- Kick height: ${val(rTOEH, jTOEH)}`,
    `- Base height (incl. kick): ${val(dyOf(r.class_dimension_defaults, 'base'), dyOf(j.class_dimension_defaults, 'base'))}`,
    `- Tall height (incl. kick): ${val(dyOf(r.class_dimension_defaults, 'tall'), dyOf(j.class_dimension_defaults, 'tall'))}`,
    `- Overhead height: ${val(dyOf(r.class_dimension_defaults, 'wall'), dyOf(j.class_dimension_defaults, 'wall'))}`,
    `- Overhead top line: ${top}${r.room_dy ? ` · ceiling ${r.room_dy}` : ''}`,
    `New set-up values will be saved to the ${firstRoom ? 'JOB (this is its first room)' : 'ROOM (other rooms already have cabinets)'}.`,
  ].join('\n')
  return { text, firstRoom }
}

function toOps(p: PlanIn, firstRoom: boolean): BatchOp[] {
  const s = p.setup ?? {}
  const ops: BatchOp[] = []
  // Heights and kick go to the job on its first room, else the room; the top line is always the room's.
  const classy = { kick: s.kick, base_dy: s.base_dy, tall_dy: s.tall_dy, wall_dy: s.wall_dy }
  if (Object.values(classy).some(v => v != null)) ops.push({ op: 'set_properties', level: firstRoom ? 'job' : 'room', ...classy })
  if (s.soffit_drop != null || s.overhead_top != null) ops.push({ op: 'set_properties', level: 'room', soffit_drop: s.soffit_drop, overhead_top: s.overhead_top })
  ops.push(
    ...(p.walls ?? []).map(w => ({ op: 'wall' as const, name: w.name, x: w.x, y: w.y, length: w.length, angle: w.angle, type: w.type, height: w.height ?? null })),
    ...(p.items ?? []).map(i => ({ op: 'place' as const, code: i.code, wall: i.wall, back: !!i.back, offset: i.offset, dx: i.dx, dy: i.dy, dz: i.dz, blind_width: i.blind_width })),
  )
  for (const f of p.fixtures ?? []) ops.push({ op: 'fixture', ...f })
  if (p.markup?.length) ops.push({ op: 'markup', notes: p.markup })
  return ops
}

export async function runDrawTurn(args: DrawArgs): Promise<DrawResult> {
  const t0 = Date.now()
  const { ctx: draw } = args
  const toolCtx: ToolContext = { projectId: args.projectId, roomId: args.roomId }

  const { data: file, error: dlErr } = await supabase.storage.from(DRAW_BUCKET).download(draw.path)
  if (dlErr || !file) throw new Error(`Couldn't read the upload: ${dlErr?.message ?? 'not found'}`)
  const data = Buffer.from(await file.arrayBuffer()).toString('base64')
  const mime = file.type || (draw.fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png')
  const source: Anthropic.ContentBlockParam = mime === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data }, cache_control: { type: 'ephemeral' } }
    : { type: 'image', source: { type: 'base64', media_type: mime as 'image/png' | 'image/jpeg' | 'image/webp', data }, cache_control: { type: 'ephemeral' } }

  const [summary, setup, aiCtx] = await Promise.all([loadRoomSummary(args.roomId), loadSetup(args.projectId, args.roomId), loadAiContext(args.projectId)])
  const answers = draw.qa.length
    ? `\n\nYou asked before drawing; the user answered:\n${draw.qa.map(x => `Q: ${x.q}\nA: ${x.a}`).join('\n')}\nDraw now to these answers (ask again only if something is still missing).`
    : ''
  // The user's turn: the file + note on the first go, the answer on a carry-on.
  const said = draw.qa.length ? draw.qa[draw.qa.length - 1].a : `📎 ${draw.fileName}${draw.notes ? `\n${draw.notes}` : ''}`
  const conversationId = await ensureConversation(args.projectId, args.conversationId)
  const asked = await supabase.from('ai_messages').insert({ project_id: args.projectId, room_id: args.roomId, conversation_id: conversationId, role: 'user', scope: 'room', text: said })
  if (asked.error) throw new Error(`ai_messages: ${asked.error.message}`)
  await touchConversation(conversationId, said)

  const messages: Anthropic.MessageParam[] = [{
    role: 'user', content: [
      source,
      { type: 'text', text: `${setup.text}\n\nThe room as it is now (draw into it — use its existing walls by name; add only walls that are missing; never touch what's there):\n<room_summary>\n${summary}\n</room_summary>${jobNotesBlock(aiCtx.jobNotes)}\n${draw.notes || 'Draw this room from the plan.'}${answers}` },
    ],
  }]

  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 }
  const toolCalls: string[] = []
  let fixes = 0, reply = ''
  let proposal: Proposal | undefined
  let question: DrawResult['question']

  for (let i = 0; i < MAX_CALLS; i++) {
    const res = await anthropic.messages.stream({
      model: DRAW_MODEL, max_tokens: 32000,
      system: systemBlocks(SYSTEM, aiCtx.rules),
      tools: [...READ_TOOLS.filter(t => t.name === 'find_library' || t.name === 'find_fixture'), ASK_TOOL, PLAN_TOOL],
      output_config: { effort: 'high' },
      messages,
    }).finalMessage()
    usage.calls++
    usage.input += res.usage.input_tokens
    usage.output += res.usage.output_tokens
    usage.cacheRead += res.usage.cache_read_input_tokens ?? 0
    usage.cacheWrite += res.usage.cache_creation_input_tokens ?? 0

    if (res.stop_reason === 'refusal') { reply = "Sorry — I couldn't read that one."; break }
    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n').trim()
    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (!uses.length) { reply = text || "I couldn't make a plan from that — try a clearer page, or tell me which room it is."; break }

    const ask = uses.find(u => u.name === 'ask_questions')
    if (ask) {
      const q = ask.input as { intro?: string; questions?: { question: string; options: string[] }[] }
      const items = (q.questions ?? []).slice(0, 4).map(x => ({ text: x.question, options: x.options.slice(0, 4) }))
      question = { text: q.intro?.trim() || 'Before I draw this:', options: [], items }
      // The questions show as button groups under this; the text is just the lead-in.
      reply = q.intro?.trim() || text || 'Before I draw this, a few things the job / plan don\'t settle:'
      toolCalls.push('ask_questions')
      break
    }
    messages.push({ role: 'assistant', content: res.content })

    const results: Anthropic.ToolResultBlockParam[] = []
    let done = false
    for (const u of uses) {
      toolCalls.push(u.name)
      if (u.name !== 'room_plan') {
        try { results.push({ type: 'tool_result', tool_use_id: u.id, content: await runReadTool(u.name, u.input, toolCtx) }) }
        catch (e) { results.push({ type: 'tool_result', tool_use_id: u.id, content: `Error: ${(e as Error).message}`, is_error: true }) }
        continue
      }
      const p = u.input as PlanIn
      const ops = toOps(p, setup.firstRoom)
      if (!ops.length) { results.push({ type: 'tool_result', tool_use_id: u.id, content: 'The plan is empty.', is_error: true }); continue }
      const plan = await planBatch(args.roomId, ops)
      if (plan.problems.length && fixes < MAX_FIXES) {
        fixes++
        results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: `Fix these and call room_plan again with the whole plan:\n${plan.problems.join('\n')}` })
        continue
      }
      const tbc = p.tbc ?? []
      proposal = {
        roomId: args.roomId, ops, description: `Draw from ${draw.fileName}`,
        lines: [...plan.lines, ...plan.warnings.map(w => `⚠ ${w}`), ...plan.problems.map(x => `✗ ${x} (left out)`)],
      }
      // Steps the server still can't do are dropped, not guessed at.
      if (plan.problems.length) proposal.ops = ops.filter((_, k) => !plan.problems.some(x => x.startsWith(`Step ${k + 1}:`)))
      reply = [
        p.summary?.trim() || text || 'Here is the room from the plan.',
        tbc.length ? `\n**To confirm (TBC):**\n${tbc.map(t => `- ${t}`).join('\n')}` : '',
        '\nCheck the list below, then press Apply. One Undo takes it all back out.',
      ].filter(Boolean).join('\n')
      done = true
      break
    }
    if (done) break
    messages.push({ role: 'user', content: results })
    if (i === MAX_CALLS - 1) reply = text || 'That took too many steps — try again with one room per plan page.'
  }

  const costUsd = (usage.input * PRICE.input + usage.output * PRICE.output + usage.cacheRead * PRICE.cacheRead + usage.cacheWrite * PRICE.cacheWrite) / 1e6
  const ms = Date.now() - t0
  const { data: saved, error } = await supabase.from('ai_messages').insert({
    project_id: args.projectId, room_id: args.roomId, conversation_id: conversationId, role: 'assistant', text: reply, scope: 'room',
    model: DRAW_MODEL, input_tokens: usage.input, output_tokens: usage.output,
    cache_read_tokens: usage.cacheRead, cache_write_tokens: usage.cacheWrite,
    api_calls: usage.calls, cost_usd: costUsd, ms,
    question: question ?? null,
    // A question keeps what it was reading, so the answers carry the drawing on.
    draw: question ? draw : null,
    proposal: proposal ?? null, proposal_status: proposal ? 'pending' : null,
  }).select('id').single()
  if (error) console.error('ai_messages insert:', error.message)
  return { messageId: saved?.id ?? null, conversationId, reply, proposal, question, costUsd, ms, model: DRAW_MODEL, toolCalls }
}
