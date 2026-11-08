// AI helper drawing (z_ai_helper AI4): read a plan PDF / site sketch photo on
// Claude Opus 5.5 and return ONE room plan — walls + library cabinets with offsets
// + TBC notes. The plan becomes batch steps (wall / place), dry-run by planBatch;
// problems go back to the model to fix (twice at most), then the user gets the
// whole thing as one proposal to Apply — one Undo removes it all.
//
// Run inside withSupabaseRead() (reads only — Apply runs the batch later).

import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/src/lib/supabase'
import { loadRoomSummary } from '../roomSummary'
import { READ_TOOLS, runReadTool, type ToolContext } from '../readTools'
import { DRAW_RULES } from '../drawRules'
import { planBatch, type BatchOp } from './cabinetBatch'
import type { Proposal } from './chat'

export const DRAW_MODEL = 'claude-opus-5-5'
// $ per million tokens (Opus 5.5): cache reads $0.20, writes 1.25× input.
const PRICE = { input: 4, output: 20, cacheRead: 0.20, cacheWrite: 5 }
const MAX_CALLS = 10
const MAX_FIXES = 2
export const DRAW_BUCKET = 'ai-uploads'

const PLAN_TOOL: Anthropic.Tool = {
  name: 'room_plan',
  description: 'Hand back the finished room plan. Call it once when you have read the whole plan. The server checks it; if it reports problems, fix them and call room_plan again with the WHOLE corrected plan.',
  input_schema: {
    type: 'object',
    properties: {
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
            note: { type: 'string', description: 'Plan reference, e.g. "#3" — for the user' },
          },
          required: ['wall', 'code', 'offset', 'dx'], additionalProperties: false,
        },
      },
      tbc: { type: 'array', items: { type: 'string' }, description: 'Things to confirm with the client / site, one short line each' },
      summary: { type: 'string', description: 'One short paragraph for the user: what you drew and what you left as gaps' },
    },
    required: ['walls', 'items', 'tbc', 'summary'], additionalProperties: false,
  },
}

const SYSTEM = `You are RHK CADcam's plan reader. RHK is a cabinet-making workshop. You read a customer's kitchen / joinery plan (PDF) or a site sketch (photo) and turn it into a room plan the app draws: walls, and the library cabinets on them with exact offsets. You never draw on screen — you only return the plan with the room_plan tool, once.

Work carefully: read every elevation and the plan view, add up each dimension chain, check it against the wall length, then decide. Use find_library to check codes you're not sure of. Put anything you can't read or that the plan doesn't settle in tbc — never guess a size.

${DRAW_RULES}`

export interface DrawArgs { projectId: string; roomId: string; path: string; fileName: string; message: string }
export interface DrawResult {
  messageId: string | null; reply: string; proposal?: Proposal
  costUsd: number; ms: number; model: string; toolCalls: string[]
}

const anthropic = new Anthropic()   // ANTHROPIC_API_KEY from the server env

interface PlanIn {
  walls?: { name: string; x: number; y: number; length: number; angle: number; type: 'standard' | 'island'; height?: number }[]
  items?: { wall: string; back?: boolean; code: string; offset: number; dx: number; dy?: number; dz?: number; note?: string }[]
  tbc?: string[]; summary?: string
}

const toOps = (p: PlanIn): BatchOp[] => [
  ...(p.walls ?? []).map(w => ({ op: 'wall' as const, name: w.name, x: w.x, y: w.y, length: w.length, angle: w.angle, type: w.type, height: w.height ?? null })),
  ...(p.items ?? []).map(i => ({ op: 'place' as const, code: i.code, wall: i.wall, back: !!i.back, offset: i.offset, dx: i.dx, dy: i.dy, dz: i.dz })),
]

export async function runDrawTurn(args: DrawArgs): Promise<DrawResult> {
  const t0 = Date.now()
  const ctx: ToolContext = { projectId: args.projectId, roomId: args.roomId }

  const { data: file, error: dlErr } = await supabase.storage.from(DRAW_BUCKET).download(args.path)
  if (dlErr || !file) throw new Error(`Couldn't read the upload: ${dlErr?.message ?? 'not found'}`)
  const data = Buffer.from(await file.arrayBuffer()).toString('base64')
  const mime = file.type || (args.fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png')
  const source: Anthropic.ContentBlockParam = mime === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data }, cache_control: { type: 'ephemeral' } }
    : { type: 'image', source: { type: 'base64', media_type: mime as 'image/png' | 'image/jpeg' | 'image/webp', data }, cache_control: { type: 'ephemeral' } }

  const summary = await loadRoomSummary(args.roomId)
  const asked = await supabase.from('ai_messages').insert({
    project_id: args.projectId, room_id: args.roomId, role: 'user', scope: 'room',
    text: `📎 ${args.fileName}${args.message ? `\n${args.message}` : ''}`,
  })
  if (asked.error) throw new Error(`ai_messages: ${asked.error.message}`)

  const messages: Anthropic.MessageParam[] = [{
    role: 'user', content: [
      source,
      { type: 'text', text: `The room as it is now (draw into it — use its existing walls by name; add only walls that are missing; never touch what's there):\n<room_summary>\n${summary}\n</room_summary>\n\n${args.message || 'Draw this room from the plan.'}` },
    ],
  }]

  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 }
  const toolCalls: string[] = []
  let fixes = 0, reply = '', proposal: Proposal | undefined

  for (let i = 0; i < MAX_CALLS; i++) {
    const res = await anthropic.messages.stream({
      model: DRAW_MODEL, max_tokens: 32000,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools: [...READ_TOOLS.filter(t => t.name === 'find_library'), PLAN_TOOL],
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
    messages.push({ role: 'assistant', content: res.content })

    const results: Anthropic.ToolResultBlockParam[] = []
    let done = false
    for (const u of uses) {
      toolCalls.push(u.name)
      if (u.name !== 'room_plan') {
        try { results.push({ type: 'tool_result', tool_use_id: u.id, content: await runReadTool(u.name, u.input, ctx) }) }
        catch (e) { results.push({ type: 'tool_result', tool_use_id: u.id, content: `Error: ${(e as Error).message}`, is_error: true }) }
        continue
      }
      const p = u.input as PlanIn
      const ops = toOps(p)
      if (!ops.length) { results.push({ type: 'tool_result', tool_use_id: u.id, content: 'The plan is empty.', is_error: true }); continue }
      const plan = await planBatch(args.roomId, ops)
      if (plan.problems.length && fixes < MAX_FIXES) {
        fixes++
        results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: `Fix these and call room_plan again with the whole plan:\n${plan.problems.join('\n')}` })
        continue
      }
      const tbc = p.tbc ?? []
      proposal = {
        roomId: args.roomId, ops, description: `Draw from ${args.fileName}`,
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
    project_id: args.projectId, room_id: args.roomId, role: 'assistant', text: reply, scope: 'room',
    model: DRAW_MODEL, input_tokens: usage.input, output_tokens: usage.output,
    cache_read_tokens: usage.cacheRead, cache_write_tokens: usage.cacheWrite,
    api_calls: usage.calls, cost_usd: costUsd, ms,
    proposal: proposal ?? null, proposal_status: proposal ? 'pending' : null,
  }).select('id').single()
  if (error) console.error('ai_messages insert:', error.message)
  return { messageId: saved?.id ?? null, reply, proposal, costUsd, ms, model: DRAW_MODEL, toolCalls }
}
