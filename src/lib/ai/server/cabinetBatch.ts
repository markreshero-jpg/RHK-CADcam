// Server-side bulk cabinet edits for the AI helper (z_ai_helper AI0). Applies a
// filter + change set (or undoes a batch) the way the canvas does a hand edit:
// row update → full resolve + persist → re-detect face neighbours → re-cut
// under panels whose rangehoods moved. Each batch is saved to ai_batches with
// every field's before / after so one Undo reverts it.
//
// Run inside withSupabase() (./scope) so it acts as the signed-in user.

import { supabase } from '@/src/lib/supabase'
import type { CabinetInstance, Room, Wall } from '@/src/lib/types'
import { resolveCabinetFromDB } from '@/src/lib/resolver/resolveCabinetFromDB'
import { detectNeighbours } from '@/src/lib/neighbours'
import { panelLinkSignature } from '@/src/lib/rangehoodLink'
import { isUnderPanel } from '@/src/lib/underPanel'
import { matchCabinets, patchFor, validateChanges, type CabinetChanges, type CabinetFilter } from '../cabinetFilter'

type Fields = Partial<CabinetInstance>
export interface BatchEntry { cabinet_id: string; label: string | null; before: Fields; after: Fields }

export interface BatchResult {
  batchId: string | null
  /** One line per cabinet changed, e.g. "WC-03: dy 720 → 900". */
  changed: string[]
  warnings: string[]
  /** Resolver errors after the change, per cabinet label. */
  errors: string[]
  /** Every cabinet whose row changed (incl. neighbour re-detects) — the canvas reloads these. */
  cabinetIds: string[]
}

interface RoomState { room: Room; walls: Wall[]; cabinets: CabinetInstance[]; defNames: Map<string, string> }

async function loadRoomState(roomId: string): Promise<RoomState> {
  const [roomQ, wallsQ, cabsQ] = await Promise.all([
    supabase.from('rooms').select('*').eq('id', roomId).single(),
    supabase.from('walls').select('*').eq('room_id', roomId),
    supabase.from('cabinet_instances').select('*').eq('room_id', roomId),
  ])
  if (roomQ.error || !roomQ.data) throw new Error(`Room not found or no access: ${roomId}`)
  const cabinets = (cabsQ.data ?? []) as CabinetInstance[]
  const defIds = [...new Set(cabinets.map(c => c.cabinet_definition_id).filter((x): x is string => !!x))]
  const { data: defs } = defIds.length
    ? await supabase.from('cabinet_definitions').select('id, name').in('id', defIds)
    : { data: [] as { id: string; name: string }[] }
  return {
    room: roomQ.data as Room, walls: (wallsQ.data ?? []) as Wall[], cabinets,
    defNames: new Map((defs ?? []).map(d => [d.id, d.name])),
  }
}

const pick = (c: CabinetInstance, keys: string[]): Fields =>
  Object.fromEntries(keys.map(k => [k, (c as unknown as Record<string, unknown>)[k] ?? null])) as Fields

const fmt = (v: unknown) => typeof v === 'number' ? String(Math.round(v * 10) / 10) : JSON.stringify(v)

/** JSON with sorted keys — jsonb columns come back in their own key order. */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`
  return JSON.stringify(v ?? null)
}

/** "BC-03: SCRR 0 → 20" rather than the whole rule_overrides object. */
function fieldChanges(k: string, before: unknown, after: unknown): string[] {
  if ((k === 'rule_overrides' || k === 'hardware_overrides') && (before ?? {}) instanceof Object && (after ?? {}) instanceof Object) {
    const b = (before ?? {}) as Record<string, unknown>, a = (after ?? {}) as Record<string, unknown>
    return [...new Set([...Object.keys(b), ...Object.keys(a)])].filter(x => canon(b[x]) !== canon(a[x]))
      .map(x => `${x} ${b[x] === undefined ? 'inherited' : fmt(b[x])} → ${a[x] === undefined ? 'inherited' : fmt(a[x])}`)
  }
  return canon(before) === canon(after) ? [] : [`${k} ${fmt(before)} → ${fmt(after)}`]
}

/** Handle schedule by name (case-insensitive, partial ok) → id; null when none matches. */
export async function findHandleSchedule(name: string): Promise<{ id: string; name: string } | { error: string }> {
  const { data } = await supabase.from('handle_schedules').select('id, name').order('name')
  const all = (data ?? []) as { id: string; name: string }[]
  const n = name.trim().toLowerCase()
  const hit = all.find(s => s.name.toLowerCase() === n) ?? (all.filter(s => s.name.toLowerCase().includes(n)).length === 1 ? all.find(s => s.name.toLowerCase().includes(n)) : undefined)
  return hit ?? { error: `No single handle schedule matches "${name}". Schedules: ${all.map(s => s.name).join(', ')}` }
}

/**
 * Apply row patches and everything the canvas does after them. Returns one entry
 * per cabinet whose row changed (including neighbour re-detects), plus warnings
 * and resolver errors.
 */
async function applyPatches(state: RoomState, patches: Map<string, Fields>) {
  const { room, walls, cabinets } = state
  const entries = new Map<string, BatchEntry>()
  const warnings: string[] = []
  const errors: string[] = []
  const toResolve = new Set<string>()

  const record = (c: CabinetInstance, u: Fields) => {
    const e = entries.get(c.id) ?? { cabinet_id: c.id, label: c.label, before: {}, after: {} }
    for (const k of Object.keys(u)) {
      if (!(k in e.before)) (e.before as Record<string, unknown>)[k] = (c as unknown as Record<string, unknown>)[k] ?? null
      ;(e.after as Record<string, unknown>)[k] = (u as Record<string, unknown>)[k]
    }
    entries.set(c.id, e)
  }

  const after = cabinets.map(c => patches.has(c.id) ? { ...c, ...patches.get(c.id) } : c)
  for (const [id, u] of patches) {
    const c = cabinets.find(x => x.id === id)!
    const { error } = await supabase.from('cabinet_instances').update(u).eq('id', id)
    if (error) { errors.push(`${c.label}: save failed — ${error.message}`); continue }
    record(c, u)
    toResolve.add(id)
    const moved = ['dx', 'dy', 'dz', 'pos_x', 'pos_y', 'pos_z'].some(k => k in u)
    if (moved && c.kick_run_id) warnings.push(`${c.label} is in a joined kick run — the joined kick isn't re-fitted (as on the canvas); check it.`)
  }

  // Face neighbours (z_doorFace_module §Neighbours): cabinets whose detected
  // left / right changed with this edit take the new pair — same rule as the canvas.
  const was = detectNeighbours(cabinets, walls, room)
  const now = detectNeighbours(after, walls, room)
  for (const [id, n] of now) {
    const prev = was.get(id)
    if (prev && prev.left === n.left && prev.right === n.right) continue
    const c = after.find(x => x.id === id)!
    if (c.left_neighbour_type === n.left && c.right_neighbour_type === n.right) continue
    const u = { left_neighbour_type: n.left, right_neighbour_type: n.right }
    const { error } = await supabase.from('cabinet_instances').update(u).eq('id', id)
    if (error) { warnings.push(`${c.label}: neighbour update failed — ${error.message}`); continue }
    record(cabinets.find(x => x.id === id)!, u)
    toResolve.add(id)
  }

  for (const id of toResolve) {
    const c = cabinets.find(x => x.id === id)!
    const r = await resolveCabinetFromDB(id, { quiet: true, awaitPersist: true })
    for (const e of r.errors ?? []) errors.push(`${c.label}: ${typeof e === 'string' ? e : JSON.stringify(e)}`)
  }

  // Under panels re-cut their rangehood holes when a rangehood on their wall moved (z_rangehood R6).
  for (const p of after.filter(isUnderPanel)) {
    if (toResolve.has(p.id)) continue
    if (panelLinkSignature(p, cabinets) !== panelLinkSignature(p, after)) {
      await resolveCabinetFromDB(p.id, { quiet: true, awaitPersist: true })
    }
  }

  return { entries: [...entries.values()], warnings, errors }
}

async function saveBatch(room: Room, description: string, source: string, entries: BatchEntry[], warnings: string[]) {
  const { data, error } = await supabase.from('ai_batches').insert({
    project_id: room.project_id, room_id: room.id, description, source, entries, warnings,
  }).select('id').single()
  if (error) throw new Error(`ai_batches insert: ${error.message}`)
  return data.id as string
}

function describe(entries: BatchEntry[]): string[] {
  return entries
    .map(e => ({ e, parts: Object.keys(e.after).flatMap(k => fieldChanges(k, (e.before as Record<string, unknown>)[k], (e.after as Record<string, unknown>)[k])) }))
    .filter(x => x.parts.length)
    .map(({ e, parts }) => `${e.label}: ${parts.join(', ')}`)
}

/** Expand a filter + changes without saving — what the panel shows for approval. */
export async function previewCabinetUpdate(roomId: string, filter: CabinetFilter, changes: CabinetChanges, opts: { onlyIds?: string[] } = {}) {
  const problems = validateChanges(changes)
  if (problems.length) return { matched: [] as string[], patches: new Map<string, Fields>(), problems }
  const state = await loadRoomState(roomId)
  let matched = matchCabinets(filter, state.cabinets, { walls: state.walls, defNames: state.defNames })
  // Selection scope: the server, not the prompt, keeps the edit inside it.
  if (opts.onlyIds) {
    const outside = matched.filter(c => !opts.onlyIds!.includes(c.id))
    if (outside.length) problems.push(`Outside the selection: ${outside.map(c => c.label).join(', ')} — widen the scope to change them.`)
    matched = matched.filter(c => opts.onlyIds!.includes(c.id))
  }
  const patches = new Map<string, Fields>()
  for (const c of matched) {
    const u = patchFor(c, changes, state.walls)
    if (u) patches.set(c.id, u)
  }
  return { state, matched: matched.map(c => c.label ?? c.id), patches, problems }
}

/** The "BC-03: dy 720 → 900" lines a preview would apply (row changes only; neighbour re-detects show after). */
export function previewLines(pv: Awaited<ReturnType<typeof previewCabinetUpdate>>): string[] {
  if (!pv.state) return []
  const entries: BatchEntry[] = [...pv.patches].map(([id, u]) => {
    const c = pv.state!.cabinets.find(x => x.id === id)!
    return { cabinet_id: id, label: c.label, before: pick(c, Object.keys(u)), after: u }
  })
  return describe(entries)
}

/** Find the cabinets, change them, resolve, and save the batch for Undo. */
export async function updateCabinets(args: {
  roomId: string; filter: CabinetFilter; changes: CabinetChanges
  description: string; source?: 'ai' | 'script'; onlyIds?: string[]
}): Promise<BatchResult> {
  const pv = await previewCabinetUpdate(args.roomId, args.filter, args.changes, { onlyIds: args.onlyIds })
  if (pv.problems.length || !pv.state) return { batchId: null, changed: [], warnings: pv.problems, errors: [], cabinetIds: [] }
  if (!pv.patches.size) {
    return { batchId: null, changed: [], warnings: [pv.matched.length ? 'Nothing to change — already that way.' : 'No cabinets match.'], errors: [], cabinetIds: [] }
  }
  const { entries, warnings, errors } = await applyPatches(pv.state, pv.patches)
  const batchId = entries.length ? await saveBatch(pv.state.room, args.description, args.source ?? 'ai', entries, warnings) : null
  return { batchId, changed: describe(entries), warnings, errors, cabinetIds: entries.map(e => e.cabinet_id) }
}

/**
 * Undo a batch: put each changed field back. A cabinet edited again since the
 * batch (a field no longer holds the batch's "after" value) is left alone and
 * reported — Undo never overwrites later work.
 */
export async function undoBatch(batchId: string): Promise<BatchResult> {
  const { data: batch, error } = await supabase.from('ai_batches').select('*').eq('id', batchId).single()
  if (error || !batch) throw new Error(`Batch not found or no access: ${batchId}`)
  if (batch.undone_at) return { batchId: null, changed: [], warnings: ['Already undone.'], errors: [], cabinetIds: [] }
  if (!batch.room_id) throw new Error('Batch has no room')

  const state = await loadRoomState(batch.room_id)
  const patches = new Map<string, Fields>()
  const warnings: string[] = []
  for (const e of batch.entries as BatchEntry[]) {
    const c = state.cabinets.find(x => x.id === e.cabinet_id)
    if (!c) { warnings.push(`${e.label}: no longer in the room — skipped.`); continue }
    const keys = Object.keys(e.after)
    const cur = pick(c, keys) as Record<string, unknown>
    const changedSince = keys.filter(k => canon(cur[k]) !== canon((e.after as Record<string, unknown>)[k]))
    if (changedSince.length) { warnings.push(`${e.label}: changed again since (${changedSince.join(', ')}) — left as is.`); continue }
    patches.set(c.id, e.before)
  }
  const applied = await applyPatches(state, patches)
  await supabase.from('ai_batches').update({ undone_at: new Date().toISOString(), undone_by: (await supabase.auth.getUser()).data.user?.id ?? null }).eq('id', batchId)
  const undoId = applied.entries.length
    ? await saveBatch(state.room, `Undo: ${batch.description}`, 'undo', applied.entries, [...warnings, ...applied.warnings])
    : null
  return { batchId: undoId, changed: describe(applied.entries), warnings: [...warnings, ...applied.warnings], errors: applied.errors, cabinetIds: applied.entries.map(e => e.cabinet_id) }
}
