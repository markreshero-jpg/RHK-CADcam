// Server-side cabinet batches for the AI helper (z_ai_helper AI0 + AI3). A batch
// is an ordered list of steps — update (filter + changes), place (a library code
// on a wall or next to a cabinet), delete (by label) — applied the way the canvas
// does them by hand: row insert / update / delete → full resolve + persist →
// re-detect face neighbours → re-cut under panels whose rangehoods moved.
//
// planBatch() runs the steps on an in-memory copy of the room first, so the
// preview the user approves is exactly what runBatch() then does. Each batch is
// saved to ai_batches (before / after per field, or a full copy of a deleted
// cabinet and what hangs off it) so one Undo reverts the lot.
//
// Run inside withSupabase() (./scope) so it acts as the signed-in user.

import { supabase } from '@/src/lib/supabase'
import type { CabinetDefinition, CabinetInstance, Room, Wall } from '@/src/lib/types'
import { invalidateResolverCaches, resolveCabinetFromDB } from '@/src/lib/resolver/resolveCabinetFromDB'
import { resolveClassDims, shopDimsFromSettings, type ShopDimDefaults } from '@/src/lib/resolver/resolveClassDims'
import { detectNeighbours } from '@/src/lib/neighbours'
import { panelLinkSignature } from '@/src/lib/rangehoodLink'
import { carcassesOverPanel, isUnderPanel, withoutScribe } from '@/src/lib/underPanel'
import { cabBottomZ, centroid, nextLabel, wallAnchorPoint, wallCabTop, wallDir } from '@/src/lib/geometry'
import { bulkheadAutoHeight } from '@/src/lib/bulkhead'
import { parseKit } from '@/src/lib/cabinetKit'
import { buildInstanceFromDefinition, dbInsertDefinitionParts } from '@/app/canvas/[roomId]/canvasDB'
import { matchCabinets, patchFor, validateChanges, ROLE_KEY, type CabinetChanges, type CabinetFilter, type MaterialRole } from '../cabinetFilter'
import { wallOffset } from '../roomSummary'
import { ensureJobCadLayers } from '@/src/lib/annotations/cadLayers'
import { cabinetPlans, linkedPose } from '@/src/lib/fixtureLinks'
import { defaultFixtureZ } from '@/src/lib/fixtureGeometry'
import type { SupabaseClient } from '@supabase/supabase-js'

type Fields = Partial<CabinetInstance>
type Row = Record<string, unknown>

// ── Steps ─────────────────────────────────────────────────────────────────────

export type BatchOp =
  | { op: 'update'; filter: CabinetFilter; changes: CabinetChanges }
  /** A library cabinet / end panel / filler: against a cabinet's side, or on a wall (face or
   *  back) at an offset or at its left / right end as you face that side. */
  | { op: 'place'; code: string; wall?: string; offset?: number; at_end?: 'left' | 'right'; next_to?: { label: string; side: 'left' | 'right' }; back?: boolean; dx?: number; dy?: number; dz?: number
      /** Blind corner (BCNR/L, BCNR/R): the false panel's width = return run depth + its door + 2 + 40. */
      blind_width?: number }
  | { op: 'delete'; labels: string[] }
  /** A new wall (AI4 drawing): start point (room mm), length, angle (degrees, 0 = +x, 90 = +y / down the plan).
   *  Name defaults as the canvas names them (Wall N / Island N). */
  /** Job / room set-up the drawing needs (Job / Room properties): kick height (rule TOEH),
   *  class heights (class_dimension_defaults), the room's soffit drop or overhead top line. */
  | { op: 'set_properties'; level: 'job' | 'room'; kick?: number; base_dy?: number; tall_dy?: number; wall_dy?: number; soffit_drop?: number; overhead_top?: number
      /** One wall's own soffit drop (walls.soffit_height, null = the room's) — only that wall's overheads / bulkheads follow. */
      wall?: string; wall_soffit_drop?: number | null }
  /** CAD markup on a wall's elevation (z_CAD_tool/MARKUP-STANDARD.md): notes on their
   *  layer, optionally with a TBC cloud or a dashed appliance-space box. */
  | { op: 'markup'; notes: MarkupNote[] }
  /** A catalogue fixture (sink, cooktop, oven, dishwasher, fridge…): on a cabinet (centred, linked
   *  so the benchtop cut-out follows), or in a gap on a wall (floor items, unlinked). */
  | { op: 'fixture'; item: string; on?: string; along?: number; from_back?: number; wall?: string; offset?: number; back?: boolean }
  | { op: 'wall'; name?: string; x: number; y: number; length: number; angle: number; type?: 'standard' | 'island'; thickness?: number; height?: number | null }
  /** A class board colour for the whole room or job (Materials tab: Doors / drawers, Interior…).
   *  material_id null = back to inherited. Kick face has no class. */
  | { op: 'set_material'; level: 'room' | 'job'; role: MaterialRole; classes?: ('base' | 'wall' | 'tall')[]; material_id: string | null }

export type MarkupLayer = 'general' | 'questions' | 'site' | 'electrical'
export interface MarkupNote {
  layer: MarkupLayer
  wall: string
  side?: 'face' | 'back'
  text: string
  /** Area it's about: x along the wall from its start, z height off the floor (mm). */
  box?: { x0: number; x1: number; z0: number; z1: number }
  /** cloud = TBC; dashed = an appliance / fixture space. Default: cloud on Questions, dashed otherwise. */
  box_style?: 'cloud' | 'dashed'
  /** Put the text inside the box (an empty space, e.g. the dishwasher gap); else the right margin with a leader. */
  text_inside?: boolean
}
const LAYER_NAME: Record<MarkupLayer, string> = { general: 'General', questions: 'Questions for Client', site: 'Site notes', electrical: 'Electrical' }

/** What a deleted cabinet takes with it that isn't rebuilt by a resolve. */
interface DeleteSnapshot {
  row: Row
  custom_parts: Row[]
  shape_overrides: Row[]
  joints: Row[]
  joint_ops: Row[]
  fixtures: { id: string; link_x: number; link_z: number; link_rot: number; link_zone: unknown }[]
}

export type BatchEntry =
  | { kind?: 'update'; cabinet_id: string; label: string | null; before: Fields; after: Fields; line?: string }
  | { kind: 'insert'; cabinet_id: string; label: string | null; line: string }
  | { kind: 'delete'; cabinet_id: string; label: string | null; line: string; snapshot: DeleteSnapshot }
  /** A room / job colour row: `match` = its key columns; before / after = material_id (null = no row). */
  | { kind: 'wall'; cabinet_id: ''; label: null; line: string; wall_id: string }
  | { kind: 'fixture'; cabinet_id: ''; label: null; line: string; fixture_id: string }
  /** CAD notes the AI drew (Undo removes them unless someone edited them since). */
  | { kind: 'markup'; cabinet_id: ''; label: null; line: string; annotation_ids: string[] }
  /** A projects / rooms row's columns before → after (whole column values). */
  | { kind: 'props'; cabinet_id: ''; label: null; line: string; table: 'projects' | 'rooms' | 'walls'; row_id: string; before: Row; after: Row }
  | { kind: 'material'; cabinet_id: ''; label: null; line: string; table: string; match: Row; before: string | null; after: string | null; resolve_ids: string[] }

export interface BatchResult {
  batchId: string | null
  /** One line per change, e.g. "WC-03: height 720 → 900", "Added BEP-01 …", "Deleted BC-04 …". */
  changed: string[]
  warnings: string[]
  /** Resolver errors after the change, per cabinet label. */
  errors: string[]
  /** Every cabinet whose row changed, was added or deleted — the canvas reloads these. */
  cabinetIds: string[]
}

// ── Room state ────────────────────────────────────────────────────────────────

interface RoomState {
  room: Room; project: Row | null; shop: ShopDimDefaults | null
  walls: Wall[]; cabinets: CabinetInstance[]; defNames: Map<string, string>
  /** Cabinets with CAD drawn on their own cabinet sheet — never deleted by the AI. */
  sheetCad: Map<string, number>
}

async function loadRoomState(roomId: string): Promise<RoomState> {
  const [roomQ, wallsQ, cabsQ, shopQ] = await Promise.all([
    supabase.from('rooms').select('*').eq('id', roomId).single(),
    supabase.from('walls').select('*').eq('room_id', roomId),
    supabase.from('cabinet_instances').select('*').eq('room_id', roomId),
    supabase.from('shop_settings').select('default_base_dy, default_base_dz, default_wall_dy, default_wall_dz, default_tall_dy, default_tall_dz').limit(1).maybeSingle(),
  ])
  if (roomQ.error || !roomQ.data) throw new Error(`Room not found or no access: ${roomId}`)
  const room = roomQ.data as Room
  const cabinets = (cabsQ.data ?? []) as CabinetInstance[]
  const defIds = [...new Set(cabinets.map(c => c.cabinet_definition_id).filter((x): x is string => !!x))]
  const [defsQ, projQ, cadQ] = await Promise.all([
    defIds.length ? supabase.from('cabinet_definitions').select('id, name').in('id', defIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    supabase.from('projects').select('*').eq('id', room.project_id).maybeSingle(),
    cabinets.length ? supabase.from('room_annotations').select('cabinet_id').in('cabinet_id', cabinets.map(c => c.id)) : Promise.resolve({ data: [] as { cabinet_id: string }[] }),
  ])
  const sheetCad = new Map<string, number>()
  for (const a of (cadQ.data ?? []) as { cabinet_id: string }[]) sheetCad.set(a.cabinet_id, (sheetCad.get(a.cabinet_id) ?? 0) + 1)
  return {
    room, project: (projQ.data ?? null) as Row | null, shop: shopDimsFromSettings(shopQ.data),
    walls: (wallsQ.data ?? []) as Wall[], cabinets,
    defNames: new Map(((defsQ.data ?? []) as { id: string; name: string }[]).map(d => [d.id, d.name])),
    sheetCad,
  }
}

// ── Formatting ────────────────────────────────────────────────────────────────

const pick = (c: CabinetInstance, keys: string[]): Fields =>
  Object.fromEntries(keys.map(k => [k, (c as unknown as Row)[k] ?? null])) as Fields

const fmt = (v: unknown) => typeof v === 'number' ? String(Math.round(v * 10) / 10) : JSON.stringify(v)

/** JSON with sorted keys — jsonb columns come back in their own key order. */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canon((v as Row)[k])}`).join(',')}}`
  return JSON.stringify(v ?? null)
}

/** materials.id → name, for change lines (filled as plans / undos need them). */
const matNames = new Map<string, string>()
async function loadMaterialNames(ids: (string | null | undefined)[]) {
  const want = [...new Set(ids.filter((x): x is string => !!x && !matNames.has(x)))]
  if (!want.length) return
  const { data } = await supabase.from('materials').select('id, name').in('id', want)
  for (const m of (data ?? []) as { id: string; name: string }[]) matNames.set(m.id, m.name)
}
const matName = (id: unknown) => typeof id === 'string' ? matNames.get(id) ?? 'unknown board' : 'inherited'
const ROLE_WORD: Record<string, string> = { door_face: 'fronts', interior: 'carcass', exposed: 'exposed', shelf: 'shelves', divider: 'dividers', face: 'kick face' }
const CLASS_WORD: Record<string, string> = { base: 'bases', wall: 'overheads', tall: 'talls' }

/** Every materials id an override object holds. */
const overrideIds = (o: unknown) => Object.values((o ?? {}) as Row).filter((v): v is string => typeof v === 'string')

const FIELD_WORD: Record<string, string> = { dx: 'width', dy: 'height', dz: 'depth', pos_z: 'off floor', left_neighbour_type: 'left neighbour', right_neighbour_type: 'right neighbour' }

/** "BC-03: height 720 → 900, offset 1200 → 600, SCRR inherited → 20". */
function updateLine(c: CabinetInstance, u: Fields, walls: Wall[]): string | null {
  const parts: string[] = []
  const w = walls.find(x => x.id === c.wall_id)
  for (const k of Object.keys(u)) {
    const before = (c as unknown as Row)[k], after = (u as Row)[k]
    if (k === 'pos_y' || (k === 'pos_x' && w)) continue   // shown as the offset below
    if (k === 'material_overrides' || k === 'toekick_overrides') {
      const b = (before ?? {}) as Row, a = (after ?? {}) as Row
      for (const x of new Set([...Object.keys(b), ...Object.keys(a)])) {
        if (canon(b[x]) !== canon(a[x])) parts.push(`${ROLE_WORD[x] ?? x} ${matName(b[x])} → ${matName(a[x])}`)
      }
      continue
    }
    if (k === 'rule_overrides' || k === 'hardware_overrides') {
      const b = (before ?? {}) as Row, a = (after ?? {}) as Row
      for (const x of new Set([...Object.keys(b), ...Object.keys(a)])) {
        if (canon(b[x]) !== canon(a[x])) parts.push(`${x} ${b[x] === undefined ? 'inherited' : fmt(b[x])} → ${a[x] === undefined ? 'inherited' : fmt(a[x])}`)
      }
      continue
    }
    if (canon(before) !== canon(after)) parts.push(`${FIELD_WORD[k] ?? k} ${fmt(before)} → ${fmt(after)}`)
  }
  if (w && ('pos_x' in u || 'pos_y' in u)) {
    const a = wallOffset(c, w), b = wallOffset({ pos_x: (u.pos_x ?? c.pos_x), pos_y: (u.pos_y ?? c.pos_y) }, w)
    if (a !== b) parts.push(`offset ${a} → ${b}`)
  }
  return parts.length ? `${c.label}: ${parts.join(', ')}` : null
}

const describe = (entries: BatchEntry[]) => entries.map(e => e.line).filter((l): l is string => !!l)

/** Handle schedule by name (case-insensitive, partial ok) → id; error lists the names. */
export async function findHandleSchedule(name: string): Promise<{ id: string; name: string } | { error: string }> {
  const { data } = await supabase.from('handle_schedules').select('id, name').order('name')
  const all = (data ?? []) as { id: string; name: string }[]
  const n = name.trim().toLowerCase()
  const hit = all.find(s => s.name.toLowerCase() === n) ?? (all.filter(s => s.name.toLowerCase().includes(n)).length === 1 ? all.find(s => s.name.toLowerCase().includes(n)) : undefined)
  return hit ?? { error: `No single handle schedule matches "${name}". Schedules: ${all.map(s => s.name).join(', ')}` }
}

// ── Plan (in memory) ──────────────────────────────────────────────────────────

type PlannedStep =
  | { kind: 'update'; id: string; patch: Fields }
  | { kind: 'insert'; tempId: string; row: Omit<CabinetInstance, 'id' | 'created_at' | 'updated_at'>; defId: string; line: string }
  | { kind: 'delete'; id: string; line: string }
  | { kind: 'material'; table: string; match: Row; before: string | null; after: string | null; line: string; resolveIds: string[] }
  | { kind: 'wall'; tempId: string; row: Omit<Wall, 'id' | 'created_at'>; line: string }
  | { kind: 'markup'; rows: (Row & { _layer: MarkupLayer })[]; line: string }
  | { kind: 'fixture'; row: Row; line: string }
  | { kind: 'props'; table: 'projects' | 'rooms' | 'walls'; rowId: string; before: Row; after: Row; line: string }

export interface BatchPlan {
  state: RoomState
  steps: PlannedStep[]
  lines: string[]
  problems: string[]
  warnings: string[]
  /** Existing cabinets the plan changes or deletes (for the auto-apply limit). */
  touched: number
  onlyUpdates: boolean
}

// The catalogue body a placed fixture copies (as useFixtureInteraction's BODY_KEYS — shapes
// and cut-outs included, or plans fall back to a box and the benchtop gets no hole).
const FIXTURE_BODY_KEYS = [
  'category', 'kind', 'name', 'brand', 'model_no', 'width', 'depth', 'height', 'mount', 'colour',
  'model_url', 'model_format', 'model_scale', 'model_rot_x', 'model_rot_y',
  'model_off_x', 'model_off_y', 'model_off_z',
  'cutout_shape', 'cutout_w', 'cutout_d', 'cutout_radius', 'cutout_off_x', 'cutout_off_y', 'cut_benchtop', 'bench_drop',
  'plan_shape', 'elev_shape', 'resizable', 'stretch',
]

/** Catalogue items by name / brand / model / kind: exact name, else the single match of every word. */
async function loadFixtures(queries: string[]): Promise<Map<string, Row | string>> {
  const out = new Map<string, Row | string>()
  if (!queries.length) return out
  const { data } = await supabase.from('fixture_catalog').select('*').eq('active', true)
  const all = (data ?? []) as Row[]
  for (const q of [...new Set(queries.map(x => x.trim()).filter(Boolean))]) {
    const words = q.toLowerCase().split(/\s+/)
    const text = (r: Row) => `${r.name} ${r.brand ?? ''} ${r.model_no ?? ''} ${r.kind ?? ''}`.toLowerCase()
    const exact = all.filter(r => String(r.name).toLowerCase() === q.toLowerCase())
    const hits = exact.length ? exact : all.filter(r => words.every(w => text(r).includes(w)))
    out.set(q.toLowerCase(), hits.length === 1 ? hits[0] : hits.length
      ? `"${q}" matches ${hits.length} catalogue items — say which: ${hits.slice(0, 8).map(h => h.name).join('; ')}`
      : `No catalogue item matches "${q}" — use find_fixture, or leave it as a marked-up space.`)
  }
  return out
}

async function loadDefinitions(codes: string[]): Promise<Map<string, CabinetDefinition>> {
  const out = new Map<string, CabinetDefinition>()
  for (const code of [...new Set(codes.map(c => c.trim()).filter(Boolean))]) {
    const { data } = await supabase.from('cabinet_definitions').select('*').ilike('name', code).limit(1).maybeSingle()
    if (data) out.set(code.toLowerCase(), data as CabinetDefinition)
  }
  return out
}

/**
 * Run the steps on an in-memory copy of the room: check every one, build the
 * rows a place would insert, and the lines the user approves. Nothing is saved.
 * Selection scope (onlyIds): updates and deletes may only touch those cabinets.
 */
export async function planBatch(roomId: string, ops: BatchOp[], opts: { onlyIds?: string[]; state?: RoomState } = {}): Promise<BatchPlan> {
  const state = opts.state ?? await loadRoomState(roomId)
  const { room } = state
  // Walls as the steps go: planned walls (temp id "newwall:…") join so later steps can use them.
  const walls: Wall[] = state.walls.map(w => ({ ...w }))
  const defs = await loadDefinitions(ops.flatMap(o => o.op === 'place' ? [o.code] : []))
  const catalog = await loadFixtures(ops.flatMap(o => o.op === 'fixture' ? [o.item] : []))
  await loadMaterialNames([
    ...ops.flatMap(o => o.op === 'update' ? Object.values(o.changes.materials ?? {}) : o.op === 'set_material' ? [o.material_id] : []),
    ...state.cabinets.flatMap(c => [...overrideIds(c.material_overrides), ...overrideIds(c.toekick_overrides)]),
  ])
  let cabs: CabinetInstance[] = state.cabinets.map(c => ({ ...c }))
  const defNames = new Map(state.defNames)
  const steps: PlannedStep[] = [], lines: string[] = [], problems: string[] = [], warnings: string[] = []
  const touched = new Set<string>()
  const only = opts.onlyIds ? new Set(opts.onlyIds) : null
  const outside = (c: CabinetInstance) => !!only && !only.has(c.id) && !c.id.startsWith('new:')

  for (const [i, op] of ops.entries()) {
    const n = `Step ${i + 1}`
    if (op.op === 'update') {
      const errs = validateChanges(op.changes)
      if (errs.length) { problems.push(`${n}: ${errs.join('; ')}`); continue }
      const matched = matchCabinets(op.filter, cabs, { walls, defNames })
      if (!matched.length) { problems.push(`${n}: no cabinets match.`); continue }
      const out = matched.filter(outside)
      if (out.length) { problems.push(`${n}: ${out.map(c => c.label).join(', ')} isn't selected — select it too, or deselect everything to work on the whole room.`); continue }
      // Overheads hang from the room's top line: "off the floor" doesn't move them, and a
      // bulkhead on height-to-ceiling is re-fitted to the gap above that line.
      const hanging = matched.filter(c => c.assembly_class.startsWith('wall') && !c.bulkhead && !c.float_shelf && !(c.rule_overrides as Row | null)?.UNDER_PANEL)
      if (op.changes.pos_z !== undefined && hanging.length) {
        problems.push(`${n}: ${hanging.map(c => c.label).join(', ')} hang from the room's overhead top line, so "off the floor" won't move them. To move ALL overheads up or down, change the room's overhead top line (set_properties overhead_top / soffit_drop); for one cupboard, set its own underside (changes.wallz).`)
        continue
      }
      const autoBh = matched.filter(c => (c.bulkhead as { auto_h?: boolean } | null)?.auto_h)
      if (op.changes.dy !== undefined && autoBh.length) {
        problems.push(`${n}: ${autoBh.map(c => c.label).join(', ')} ${autoBh.length === 1 ? 'is a bulkhead' : 'are bulkheads'} on height-to-ceiling — ${autoBh.length === 1 ? 'it fills' : 'they fill'} from the overhead top line to the ceiling. To make ${autoBh.length === 1 ? 'it' : 'them'} smaller, raise the room's overhead top line (set_properties) and ${autoBh.length === 1 ? 'it re-fits' : 'they re-fit'}.`)
        continue
      }
      for (const c of matched) {
        const u = patchFor(c, op.changes, walls)
        if (!u) continue
        const line = updateLine(c, u, walls)
        steps.push({ kind: 'update', id: c.id, patch: u })
        if (line) lines.push(line)
        if (!c.id.startsWith('new:')) touched.add(c.id)
        cabs = cabs.map(x => x.id === c.id ? { ...x, ...u } : x)
      }
    } else if (op.op === 'delete') {
      for (const label of op.labels) {
        const c = cabs.find(x => (x.label ?? '').toLowerCase() === label.trim().toLowerCase())
        if (!c) { problems.push(`${n}: no cabinet "${label}".`); continue }
        if (c.id.startsWith('new:')) { problems.push(`${n}: ${c.label} is added in this same change — leave it out instead.`); continue }
        if (outside(c)) { problems.push(`${n}: ${c.label} isn't selected — select it to delete it.`); continue }
        if (c.is_kick_assembly || c.kick_run_id) { problems.push(`${n}: ${c.label} is in a joined kick run — separate the kick first, or delete it by hand.`); continue }
        const cad = state.sheetCad.get(c.id)
        if (cad) { problems.push(`${n}: ${c.label} has ${cad} CAD item${cad > 1 ? 's' : ''} drawn on its cabinet sheet — delete it by hand if you mean it (that CAD goes with it).`); continue }
        const kept = cabs.filter(x => x.id !== c.id)
        // An under panel's scribe goes with it (z_floating F7), as on the canvas.
        if (isUnderPanel(c)) {
          for (const k of carcassesOverPanel(c, kept)) {
            const u = { rule_overrides: withoutScribe(k.rule_overrides) as CabinetInstance['rule_overrides'] }
            steps.push({ kind: 'update', id: k.id, patch: u })
            const l = updateLine(k, u, walls); if (l) lines.push(l)
            cabs = cabs.map(x => x.id === k.id ? { ...x, ...u } : x)
          }
        }
        const code = (c.cabinet_definition_id && defNames.get(c.cabinet_definition_id)) || '?'
        const line = `Delete ${c.label} (${code}, ${Math.round(c.dx)}×${Math.round(c.dy)}×${Math.round(c.dz)})`
        steps.push({ kind: 'delete', id: c.id, line })
        lines.push(line)
        touched.add(c.id)
        cabs = cabs.filter(x => x.id !== c.id)
      }
    } else if (op.op === 'fixture') {
      const item = catalog.get(op.item.trim().toLowerCase())
      if (!item || typeof item === 'string') { problems.push(`${n}: ${item ?? `no catalogue item "${op.item}"`}`); continue }
      const w = Number(item.width), d = Number(item.depth)
      const mount = String(item.mount) as 'floor' | 'under_bench' | 'benchtop' | 'wall'
      let pose: { x: number; y: number; rotation: number; wall_id: string }
      let link: { cabinet_id: string | null; link_x: number; link_z: number; link_rot: number } = { cabinet_id: null, link_x: 0, link_z: 0, link_rot: 0 }
      let z = defaultFixtureZ(mount, item.mount_height as number | null)
      let where: string
      if (op.on) {
        const cab = cabs.find(x => (x.label ?? '').toLowerCase() === op.on!.trim().toLowerCase())
        if (!cab) { problems.push(`${n}: no cabinet "${op.on}" to put ${item.name} on.`); continue }
        const p = cabinetPlans([cab], walls, centroid(walls))[0]
        if (!p) { problems.push(`${n}: ${cab.label} isn't on a wall.`); continue }
        const l = { link_x: cab.dx / 2 + (op.along ?? 0), link_z: op.from_back ?? cab.dz / 2, link_rot: 0 }
        pose = linkedPose(l, p, w, d)
        // Benchtop / under-bench items link to base / tall cabinets, wall items to wall cabinets (as linkFor).
        const wallCab = cab.assembly_class.startsWith('wall')
        if ((mount === 'wall') === wallCab && mount !== 'floor') link = { cabinet_id: cab.id, ...l }
        const top = cabBottomZ(cab, room, p.wall) + cab.dy
        if (mount === 'benchtop') z = top + 20 - (Number(item.bench_drop) || 0)   // on a 20 top until the benchtop is drawn
        else if (mount === 'wall' && wallCab) z = Math.max(0, cabBottomZ(cab, room, p.wall) - Number(item.height))
        where = `on ${cab.label}${op.along ? ` (${op.along > 0 ? '+' : ''}${op.along} from centre)` : ''}`
      } else {
        const wall = walls.find(x => x.name.toLowerCase() === (op.wall ?? '').trim().toLowerCase())
        if (!wall || op.offset == null) { problems.push(`${n}: ${item.name} needs a cabinet to sit on (on) or a wall + offset for its gap.`); continue }
        // A stand-in "cabinet" the size of the item in the gap gives the same frame a cabinet there would.
        const back = !!op.back
        const at = wallAnchorPoint(wall, op.offset, back, centroid(walls))
        const gap = { id: 'gap', wall_id: wall.id, pos_x: at.x, pos_y: at.y, rotation: back ? wall.angle + 180 : wall.angle, dx: w, dz: d, assembly_class: 'base' } as unknown as CabinetInstance
        const p = cabinetPlans([gap], walls, centroid(walls))[0]
        pose = linkedPose({ link_x: w / 2, link_z: d / 2 + (op.from_back ?? 0), link_rot: 0 }, p, w, d)
        where = `${wall.name}${back ? ' back' : ''} @ ${Math.round(op.offset)}`
      }
      const body = Object.fromEntries(FIXTURE_BODY_KEYS.map(k => [k, item[k] ?? null]))
      const row: Row = { room_id: room.id, catalog_id: item.id, ...body, x: pose.x, y: pose.y, rotation: pose.rotation, wall_id: pose.wall_id, z: Math.round(z * 10) / 10, ...link, link_zone: null }
      const line = `Add ${item.name} ${where}${link.cabinet_id ? ' (linked — benchtop cut-out follows)' : ''}`
      steps.push({ kind: 'fixture', row, line })
      lines.push(line)
    } else if (op.op === 'markup') {
      const T = { size: 2.5, align: 'center', src: 'markup-std' }
      const margin = new Map<string, number>()   // per wall + side: notes stacked so far
      for (const note of op.notes ?? []) {
        const w = walls.find(x => x.name.toLowerCase() === (note.wall ?? '').trim().toLowerCase())
        if (!w) { problems.push(`${n}: note "${note.text?.slice(0, 30)}": no wall "${note.wall}".`); continue }
        if (!note.text?.trim() || !(note.layer in LAYER_NAME)) { problems.push(`${n}: a note needs text and a layer (${Object.keys(LAYER_NAME).join(', ')}).`); continue }
        const side = note.side ?? 'face'
        const base = { room_id: room.id, view: 'elevation', wall_id: w.id, wall_side: side, _layer: note.layer, sort_order: 0 }
        const rows: (Row & { _layer: MarkupLayer })[] = []
        const b = note.box
        // Boxes are for TBC clouds (questions) and appliance spaces (general); site / electrical notes just point.
        if (b && (note.layer === 'questions' || note.layer === 'general')) {
          const style = (note.box_style ?? (note.layer === 'questions' ? 'cloud' : 'dashed')) === 'cloud'
          rows.push(style
            ? { ...base, kind: 'cloud', text: null, geom: { pts: [{ x: b.x0, y: -b.z1 }, { x: b.x1, y: -b.z1 }, { x: b.x1, y: -b.z0 }, { x: b.x0, y: -b.z0 }] }, style: { src: 'markup-std', weight: 0.25, cloudBump: 4 } }
            : { ...base, kind: 'rect', text: null, geom: { a: { x: b.x0, y: -b.z0 }, b: { x: b.x1, y: -b.z1 } }, style: { src: 'markup-std', dash: 'dashed', weight: 0.25 } })
        }
        const text = note.text.trim().toUpperCase()
        if (b && note.text_inside) {
          // Inside an empty space: near its top, wrapped to the space (~22 mm of wall per paper mm).
          rows.push({ ...base, kind: 'text', text, geom: { at: { x: b.x0 + 30, y: -(b.z1 - 120) }, width: Math.max(15, Math.min(40, (b.x1 - b.x0 - 60) / 22)) }, style: T })
        } else {
          // Right margin past the wall's end, stacked top down, with a leader to the area.
          const key = `${w.id}|${side}`
          const k = margin.get(key) ?? 0
          margin.set(key, k + 1)
          const wallH = w.height ?? room.room_dy ?? 2400
          const at = { x: w.length + 180, y: -(wallH - 150 - k * 320) }
          const leader = b ? [{ x: (b.x0 + b.x1) / 2, y: -(b.z0 + b.z1) / 2 }, { x: w.length + 170, y: at.y + 40 }] : undefined
          rows.push({ ...base, kind: 'text', text, geom: { at, width: 30, ...(leader && { leader }) }, style: T })
        }
        const line = `${LAYER_NAME[note.layer]} note on ${w.name}${side === 'back' ? ' back' : ''}: ${text.replace(/\n/g, ' ')}${rows[0]?.kind === 'cloud' ? ' (cloud)' : rows[0]?.kind === 'rect' ? ' (dashed box)' : ''}`
        steps.push({ kind: 'markup', rows, line })
        lines.push(line)
      }
    } else if (op.op === 'set_properties' && op.wall) {
      const w = walls.find(x => x.name.toLowerCase() === op.wall!.trim().toLowerCase())
      if (!w || w.id.startsWith('newwall:')) { problems.push(`${n}: no wall "${op.wall}" (${walls.map(x => x.name).join(', ')}).`); continue }
      if (op.wall_soffit_drop === undefined || op.wall_soffit_drop === (w.soffit_height ?? null)) continue
      if (op.wall_soffit_drop !== null && !(op.wall_soffit_drop >= 0 && op.wall_soffit_drop <= 2000)) { problems.push(`${n}: soffit drop must be 0–2000.`); continue }
      const before = { soffit_height: w.soffit_height ?? null }, after = { soffit_height: op.wall_soffit_drop }
      const line = `${w.name} · soffit ${w.soffit_height ?? 'room’s'} → ${op.wall_soffit_drop ?? 'room’s'} (overhead top line ${Math.round(wallCabTop(w, room))} → ${Math.round(wallCabTop({ ...w, soffit_height: op.wall_soffit_drop }, room))})`
      steps.push({ kind: 'props', table: 'walls', rowId: w.id, before, after, line })
      lines.push(line)
      Object.assign(w, after)
      // That wall's bulkheads on height-to-ceiling re-fit (as the canvas does).
      for (const c of cabs.filter(x => x.wall_id === w.id && (x.bulkhead as { auto_h?: boolean } | null)?.auto_h)) {
        const h = bulkheadAutoHeight(w, room, c.bulkhead)
        if (!(h > 0) || Math.abs(h - c.dy) < 0.5) continue
        const u = { dy: Math.round(h * 10) / 10 }
        steps.push({ kind: 'update', id: c.id, patch: u })
        const l = updateLine(c, u, walls); if (l) lines.push(`${l} (bulkhead re-fits to the ceiling)`)
        cabs = cabs.map(x => x.id === c.id ? { ...x, ...u } : x)
      }
    } else if (op.op === 'set_properties') {
      const job = op.level === 'job'
      const target = (job ? state.project : room) as Row | null
      if (!target) { problems.push(`${n}: no ${op.level} to set.`); continue }
      if (!job && (op.kick == null && op.base_dy == null && op.tall_dy == null && op.wall_dy == null && op.soffit_drop == null && op.overhead_top == null)) continue
      const before: Row = {}, after: Row = {}, parts: string[] = []
      const ro = { ...((target.rule_overrides ?? {}) as Row) }
      if (op.kick != null && ro.TOEH !== op.kick) { parts.push(`kick ${ro.TOEH ?? 'not set'} → ${op.kick}`); ro.TOEH = op.kick; before.rule_overrides = target.rule_overrides ?? {}; after.rule_overrides = ro }
      const cd = JSON.parse(JSON.stringify(target.class_dimension_defaults ?? {})) as Record<string, Record<string, number>>
      let cdChanged = false
      for (const [cls, v, word] of [['base', op.base_dy, 'base height'], ['tall', op.tall_dy, 'tall height'], ['wall', op.wall_dy, 'overhead height']] as const) {
        if (v == null || cd[cls]?.dy === v) continue
        parts.push(`${word} ${cd[cls]?.dy ?? 'not set'} → ${v}`)
        cd[cls] = { ...(cd[cls] ?? {}), dy: v }
        cdChanged = true
      }
      if (cdChanged) { before.class_dimension_defaults = target.class_dimension_defaults ?? {}; after.class_dimension_defaults = cd }
      if (!job) {
        if (op.soffit_drop != null && room.soffit_height !== op.soffit_drop) { parts.push(`soffit drop ${room.soffit_height ?? 'not set'} → ${op.soffit_drop}`); before.soffit_height = room.soffit_height ?? null; after.soffit_height = op.soffit_drop }
        if (op.overhead_top != null && room.wall_cabinet_top !== op.overhead_top) { parts.push(`overhead top line ${room.wall_cabinet_top ?? 'not set'} → ${op.overhead_top}`); before.wall_cabinet_top = room.wall_cabinet_top ?? null; after.wall_cabinet_top = op.overhead_top }
      } else if (op.soffit_drop != null || op.overhead_top != null) {
        problems.push(`${n}: the soffit / overhead top line is set on the room, not the job.`); continue
      }
      if (!parts.length) continue
      const line = `${job ? 'Job' : `Room ${room.name}`} · ${parts.join(', ')}`
      steps.push({ kind: 'props', table: job ? 'projects' : 'rooms', rowId: target.id as string, before, after, line })
      lines.push(line)
      // Later steps (placements) take their class sizes from the new values.
      Object.assign(target, after)
      // Bulkheads on height-to-ceiling follow the room's top line / soffit (as the canvas does).
      if (!job && ('wall_cabinet_top' in after || 'soffit_height' in after)) {
        for (const c of cabs.filter(x => (x.bulkhead as { auto_h?: boolean } | null)?.auto_h)) {
          const h = bulkheadAutoHeight(walls.find(w => w.id === c.wall_id), room, c.bulkhead)
          if (!(h > 0) || Math.abs(h - c.dy) < 0.5) continue
          const u = { dy: Math.round(h * 10) / 10 }
          steps.push({ kind: 'update', id: c.id, patch: u })
          const l = updateLine(c, u, walls); if (l) lines.push(`${l} (bulkhead re-fits to the ceiling)`)
          cabs = cabs.map(x => x.id === c.id ? { ...x, ...u } : x)
        }
      }
    } else if (op.op === 'wall') {
      if (!(op.length > 0) || ![op.x, op.y, op.angle].every(Number.isFinite)) { problems.push(`${n}: a wall needs x, y, length and angle.`); continue }
      const island = op.type === 'island'
      const name = op.name?.trim() || (island ? `Island ${walls.filter(w => w.wall_type === 'island').length + 1}` : `Wall ${walls.length + 1}`)
      if (walls.some(w => w.name.toLowerCase() === name.toLowerCase())) { problems.push(`${n}: there's already a wall called ${name}.`); continue }
      const row: Omit<Wall, 'id' | 'created_at'> = {
        room_id: room.id, name, sort_order: walls.length,
        length: Math.round(op.length * 10) / 10, angle: Math.round(op.angle * 100) / 100,
        pos_x: Math.round(op.x * 10) / 10, pos_y: Math.round(op.y * 10) / 10,
        // As the canvas draws them: islands have no body; others take the room's wall defaults.
        thickness: island ? 0 : (op.thickness ?? room.wall_dz ?? 90),
        height: op.height ?? room.wall_dy ?? null,
        soffit_height: null, wall_type: island ? 'island' : 'standard',
      }
      const tempId = `newwall:${steps.length}`
      const line = `Add ${name} (${Math.round(row.length)} long, ${Math.round(row.angle)}°, from ${Math.round(row.pos_x)}, ${Math.round(row.pos_y)})`
      steps.push({ kind: 'wall', tempId, row, line })
      lines.push(line)
      walls.push({ ...row, id: tempId, created_at: '' } as Wall)
    } else if (op.op === 'set_material') {
      if (only) { problems.push(`${n}: a ${op.level} colour changes every cabinet of that kind — deselect everything first (or ask for just the selected cabinets' own colour).`); continue }
      const kick = op.role === 'kick'
      const classes = kick ? [null] : (op.classes?.length ? op.classes : ['base', 'wall', 'tall'] as const)
      // Cabinets it reaches: this room, or every room in the job.
      let reach: { id: string; room_id: string; label: string | null; assembly_class: string; has_toekick: boolean; is_kick_assembly?: boolean; material_overrides: unknown; toekick_overrides: unknown }[] = cabs
      let roomNames = new Map<string, string>([[room.id, room.name]])
      if (op.level === 'job') {
        const { data: rms } = await supabase.from('rooms').select('id, name').eq('project_id', room.project_id)
        roomNames = new Map(((rms ?? []) as { id: string; name: string }[]).map(r => [r.id, r.name]))
        const { data: all } = await supabase.from('cabinet_instances')
          .select('id, room_id, label, assembly_class, has_toekick, is_kick_assembly, material_overrides, toekick_overrides').in('room_id', [...roomNames.keys()])
        reach = (all ?? []) as typeof reach
        await loadMaterialNames(reach.flatMap(c => [...overrideIds(c.material_overrides), ...overrideIds(c.toekick_overrides)]))
      }
      const where = op.level === 'job' ? 'Job' : `Room ${room.name}`
      for (const cls of classes) {
        const table = kick ? (op.level === 'job' ? 'job_toekick_materials' : 'room_toekick_materials') : (op.level === 'job' ? 'job_materials' : 'room_materials')
        const match: Row = {
          ...(op.level === 'job' ? { project_id: room.project_id } : { room_id: room.id }),
          ...(kick ? { part_role: 'face' } : { assembly_class: cls, material_role: ROLE_KEY[op.role as Exclude<MaterialRole, 'kick'>] }),
        }
        let q = supabase.from(table).select('material_id')
        for (const [k, v] of Object.entries(match)) q = q.eq(k, v as string)
        const { data: cur } = await q.maybeSingle()
        const before = (cur as { material_id?: string } | null)?.material_id ?? null
        await loadMaterialNames([before])
        if (before === op.material_id) continue
        const hits = reach.filter(c => kick ? (c.has_toekick || c.is_kick_assembly) : c.assembly_class.replace('_corner', '') === cls)
        const line = `${where} · ${kick ? 'kick face' : `${CLASS_WORD[cls!]} ${op.role === 'fronts' ? 'fronts' : ROLE_WORD[ROLE_KEY[op.role as Exclude<MaterialRole, 'kick'>]]}`}: ${matName(before)} → ${matName(op.material_id)} (${hits.length} cabinet${hits.length === 1 ? '' : 's'})`
        steps.push({ kind: 'material', table, match, before, after: op.material_id, line, resolveIds: hits.map(c => c.id) })
        lines.push(line)
        // A cabinet's own colour wins over the room / job one — say which keep theirs.
        const key = kick ? 'face' : ROLE_KEY[op.role as Exclude<MaterialRole, 'kick'>]
        const own = hits.filter(c => ((kick ? c.toekick_overrides : c.material_overrides) as Row | null)?.[key])
        if (own.length) warnings.push(`${own.map(c => `${c.label}${op.level === 'job' && c.room_id !== room.id ? ` (${roomNames.get(c.room_id)})` : ''}`).join(', ')} keep${own.length === 1 ? 's' : ''} ${own.length === 1 ? 'its' : 'their'} own ${ROLE_WORD[key]} colour.`)
        if (op.level === 'job' && !kick) {
          const { data: roomRows } = await supabase.from('room_materials').select('room_id, material_id')
            .in('room_id', [...roomNames.keys()]).eq('assembly_class', cls!).eq('material_role', key)
          const keep = ((roomRows ?? []) as { room_id: string }[]).map(r => roomNames.get(r.room_id)).filter(Boolean)
          if (keep.length) warnings.push(`${keep.join(', ')} ${keep.length === 1 ? 'has its' : 'have their'} own ${CLASS_WORD[cls!]} ${ROLE_WORD[key]} — unchanged there.`)
        }
      }
    } else if (op.op === 'place') {
      const def = defs.get(op.code.trim().toLowerCase())
      if (!def) { problems.push(`${n}: no library cabinet "${op.code}" — use find_library for the code.`); continue }
      if (parseKit(def.kit)) { problems.push(`${n}: ${def.name} is a kit (several cabinets) — place it by hand.`); continue }
      if ((def.footprint as { preset?: string } | null)?.preset === 'angled_filler') { problems.push(`${n}: ${def.name} is an angled corner filler — place it by hand (it snaps into the corner).`); continue }

      const cascade = resolveClassDims(def.assembly_class, { room, project: state.project as never, shop: state.shop })
      // Width: asked for, else what the definition would place at.
      const probe = buildInstanceFromDefinition(def, { room_id: room.id, wall_id: '', label: '', pos_x: 0, pos_y: 0, rotation: 0, cascade_dy: cascade.dy, cascade_dz: cascade.dz, dx: op.dx })
      const dx = probe.dx

      let wall: Wall | undefined, back = !!op.back, pos: { x: number; y: number }
      let against: CabinetInstance | undefined
      if (op.next_to) {
        const nb = cabs.find(x => (x.label ?? '').toLowerCase() === op.next_to!.label.trim().toLowerCase())
        if (!nb) { problems.push(`${n}: no cabinet "${op.next_to.label}" to place against.`); continue }
        against = nb
        wall = walls.find(x => x.id === nb.wall_id)
        if (!wall) { problems.push(`${n}: ${nb.label} isn't on a wall.`); continue }
        // Facing the front, "left" is the low end along the wall — the high end for a back-face cabinet.
        back = Math.abs((((nb.rotation - wall.angle) % 360) + 360) % 360 - 180) < 90
        const d = wallDir(wall)
        const toLow = (op.next_to.side === 'left') !== back
        const shift = toLow ? -dx : nb.dx
        pos = { x: nb.pos_x + shift * d.x, y: nb.pos_y + shift * d.y }   // same distance off the wall as its neighbour
      } else {
        wall = walls.find(x => x.name.toLowerCase() === (op.wall ?? '').trim().toLowerCase())
        if (!wall) { problems.push(`${n}: say which wall (${walls.map(w => w.name).join(', ')}) or which cabinet to go next to.`); continue }
        // At an end of the wall, as you face that side: the face's left is the low end, the back's left the high end.
        const offset = op.at_end ? ((op.at_end === 'left') !== back ? 0 : Math.max(0, wall.length - dx)) : op.offset
        if (offset == null || offset < 0) { problems.push(`${n}: an offset along ${wall.name}, or at_end left / right, is needed.`); continue }
        pos = wallAnchorPoint(wall, offset, back, centroid(walls))
      }

      const label = nextLabel(cabs, def.assembly_class)
      const row = buildInstanceFromDefinition(def, {
        room_id: room.id, wall_id: wall.id, label, pos_x: pos.x, pos_y: pos.y,
        rotation: back ? wall.angle + 180 : wall.angle, dx: op.dx, cascade_dy: cascade.dy, cascade_dz: cascade.dz,
      })
      // As placeFromDraft: a bulkhead fills to this wall's ceiling; a floating shelf sits at the overhead bottom.
      if (row.bulkhead && (row.bulkhead as { auto_h?: boolean }).auto_h) {
        const h = bulkheadAutoHeight(wall, room, row.bulkhead)
        if (h > 0) row.dy = h
      }
      if (row.float_shelf) row.pos_z = Math.max(0, Math.round(wallCabTop(wall, room) - resolveClassDims('wall', { room, project: state.project as never, shop: state.shop }).dy))
      // Against a cabinet of the same kind (an end panel / filler on an overhead, a base…),
      // it takes that cabinet's height and height off the floor — a 600 overhead gets a 600 panel.
      const sameKind = (a: string, b: string) => a.replace('_corner', '') === b.replace('_corner', '')
      let matched = ''
      if (against && sameKind(against.assembly_class, def.assembly_class) && !row.bulkhead && !row.float_shelf && op.dy == null) {
        if (row.dy !== against.dy || (row.pos_z ?? 0) !== (against.pos_z ?? 0)) matched = `, height matched to ${against.label}`
        row.dy = against.dy
        row.pos_z = against.pos_z ?? 0
        if (against.rule_overrides?.WALLZ != null) row.rule_overrides = { ...(row.rule_overrides ?? {}), WALLZ: against.rule_overrides.WALLZ }
      }
      if (op.dy != null) row.dy = op.dy
      if (op.dz != null && op.dz > 0) row.dz = op.dz
      // Blind corner: the false panel column takes the blind width (locked).
      if (op.blind_width != null) {
        const fg = JSON.parse(JSON.stringify(row.face_grid ?? null)) as { cols?: { col_index: number; width?: number; width_locked?: boolean }[]; zones?: { col_index: number; face_type: string }[] } | null
        const blindCol = fg?.zones?.find(z => z.face_type === 'false_panel')?.col_index
        const col = blindCol != null ? fg?.cols?.find(c => c.col_index === blindCol) : undefined
        if (!col) { problems.push(`${n}: ${def.name} has no false panel to set a blind width on.`); continue }
        if (!(op.blind_width > 0 && op.blind_width < row.dx - 100)) { problems.push(`${n}: blind width ${op.blind_width} doesn't leave room for a door in a ${Math.round(row.dx)} cabinet.`); continue }
        col.width = Math.round(op.blind_width * 10) / 10
        col.width_locked = true
        row.face_grid = fg as typeof row.face_grid
      }

      const tempId = `new:${steps.length}`
      const offset = wallOffset({ pos_x: row.pos_x, pos_y: row.pos_y }, wall)
      const line = `Add ${label} (${def.name}, ${Math.round(row.dx)}×${Math.round(row.dy)}×${Math.round(row.dz)}${op.blind_width != null ? `, blind ${Math.round(op.blind_width)}` : ''}) on ${wall.name}${back ? ' back' : ''} @ ${offset}${op.next_to ? `, ${op.next_to.side} of ${op.next_to.label}` : op.at_end ? `, ${op.at_end} end` : ''}${matched}`
      steps.push({ kind: 'insert', tempId, row, defId: def.id, line })
      lines.push(line)
      // Overlap warning (same wall, same height band) — the canvas lets it, but it's usually a mistake.
      // Heights as the drawings place them (overheads hang from the wall-cabinet top).
      const lo = offset, hi = offset + row.dx
      const z0 = cabBottomZ(row as CabinetInstance, room, wall), z1 = z0 + row.dy
      const hit = cabs.filter(x => x.wall_id === wall!.id && !x.is_kick_assembly).filter(x => {
        const o = wallOffset(x, wall!), xz = cabBottomZ(x, room, wall)
        return o < hi - 1 && o + x.dx > lo + 1 && xz < z1 - 1 && xz + x.dy > z0 + 1 && (x.rotation === row.rotation)
      })
      if (hit.length) warnings.push(`${label} overlaps ${hit.map(x => x.label).join(', ')} — move them first, or check it.`)
      defNames.set(def.id, def.name)
      cabs.push({ ...(row as CabinetInstance), id: tempId, created_at: '', updated_at: '' })
    }
  }

  return { state: { ...state, walls }, steps, lines, problems, warnings, touched: touched.size, onlyUpdates: steps.every(s => s.kind === 'update') }
}

// ── Apply ─────────────────────────────────────────────────────────────────────

async function snapshotForDelete(c: CabinetInstance): Promise<DeleteSnapshot> {
  const [cp, so, ji, fx] = await Promise.all([
    supabase.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', c.id),
    supabase.from('part_shape_overrides').select('*').eq('cabinet_id', c.id),
    supabase.from('joint_instances').select('*').eq('cabinet_id', c.id),
    supabase.from('room_fixtures').select('id, link_x, link_z, link_rot, link_zone').eq('cabinet_id', c.id),
  ])
  const joints = (ji.data ?? []) as Row[]
  const { data: ops } = joints.length
    ? await supabase.from('joint_instance_operations').select('*').in('joint_instance_id', joints.map(j => j.id as string))
    : { data: [] }
  return {
    row: c as unknown as Row, custom_parts: (cp.data ?? []) as Row[], shape_overrides: (so.data ?? []) as Row[],
    joints, joint_ops: (ops ?? []) as Row[], fixtures: (fx.data ?? []) as DeleteSnapshot['fixtures'],
  }
}

/** Put a deleted cabinet back with the same id, and what hung off it. */
async function restoreDeleted(s: DeleteSnapshot): Promise<string | null> {
  const ins = async (table: string, rows: Row[]) => {
    if (!rows.length) return null
    const { error } = await supabase.from(table).insert(rows)
    return error ? `${table}: ${error.message}` : null
  }
  const first = await ins('cabinet_instances', [s.row])
  if (first) return first
  const errs = [
    await ins('cabinet_custom_parts', s.custom_parts),
    await ins('part_shape_overrides', s.shape_overrides),
    await ins('joint_instances', s.joints),
    await ins('joint_instance_operations', s.joint_ops),
  ].filter(Boolean)
  for (const f of s.fixtures) {
    await supabase.from('room_fixtures').update({ cabinet_id: s.row.id, link_x: f.link_x, link_z: f.link_z, link_rot: f.link_rot, link_zone: f.link_zone })
      .eq('id', f.id).is('cabinet_id', null)
  }
  return errs.length ? errs.join('; ') : null
}

/** The job's CAD layers by name (copying the shop list the first time, as the canvas does),
 *  adding "Questions for Client" (teal, like the jobs that have it) when it's missing. */
async function jobLayerIds(client: SupabaseClient, projectId: string): Promise<Map<string, string>> {
  const layers = await ensureJobCadLayers(client, projectId)
  const byName = new Map(layers.map(l => [l.name, l.id]))
  if (!byName.has('Questions for Client')) {
    const { data } = await client.from('job_cad_layers').insert({
      project_id: projectId, shop_layer_id: null, name: 'Questions for Client', color: '#0891b2',
      visible: true, print: true, is_default: false, sort_order: layers.reduce((m, l) => Math.max(m, l.sort_order + 1), 0),
    }).select('id').single()
    if (data) byName.set('Questions for Client', data.id as string)
  }
  return byName
}

/** Resolve + persist a few at a time (each is mostly DB round trips). */
async function resolveAll(ids: string[], labelOf: (id: string) => string, errors: string[]) {
  const queue = [...ids]
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        const r = await resolveCabinetFromDB(id, { quiet: true, awaitPersist: true })
        for (const e of r.errors ?? []) errors.push(`${labelOf(id)}: ${typeof e === 'string' ? e : JSON.stringify(e)}`)
      } catch (e) { errors.push(`${labelOf(id)}: resolve failed — ${(e as Error).message}`) }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
}

/**
 * After rows changed: re-detect face neighbours (same rule as the canvas — only
 * cabinets whose detected pair moved take the new one), resolve everything
 * touched, and re-cut under panels whose rangehoods moved.
 */
async function settle(roomId: string, before: CabinetInstance[], touched: Set<string>, record: (c: CabinetInstance, u: Fields) => void, warnings: string[], errors: string[], elsewhere: string[] = []) {
  const after = await loadRoomState(roomId)
  const was = detectNeighbours(before, after.walls, after.room)
  const now = detectNeighbours(after.cabinets, after.walls, after.room)
  for (const [id, nb] of now) {
    const prev = was.get(id)
    if (prev && prev.left === nb.left && prev.right === nb.right) continue
    const c = after.cabinets.find(x => x.id === id)!
    if (c.left_neighbour_type === nb.left && c.right_neighbour_type === nb.right) continue
    const u = { left_neighbour_type: nb.left, right_neighbour_type: nb.right }
    const { error } = await supabase.from('cabinet_instances').update(u).eq('id', id)
    if (error) { warnings.push(`${c.label}: neighbour update failed — ${error.message}`); continue }
    record(c, u)
    touched.add(id)
  }
  const label = new Map(after.cabinets.map(c => [c.id, c.label ?? '?']))
  const live = [...touched].filter(id => label.has(id))
  await resolveAll(live, id => label.get(id)!, errors)
  const panels = after.cabinets.filter(isUnderPanel).filter(p => !touched.has(p.id) && panelLinkSignature(p, before) !== panelLinkSignature(p, after.cabinets))
  await resolveAll(panels.map(p => p.id), id => label.get(id)!, errors)
  // A job colour reaches other rooms: their cabinets re-resolve too (nothing moved there).
  const others = elsewhere.filter(id => !label.has(id))
  if (others.length) {
    const { data } = await supabase.from('cabinet_instances').select('id, label').in('id', others)
    const ol = new Map(((data ?? []) as { id: string; label: string | null }[]).map(c => [c.id, c.label ?? '?']))
    await resolveAll(others.filter(id => ol.has(id)), id => ol.get(id)!, errors)
  }
}

/** Write a room / job colour row: a material sets it, null removes it (back to inherited). */
async function writeMaterialRow(table: string, match: Row, materialId: string | null): Promise<string | null> {
  // Room / job colours feed every cabinet's cascade: resolves after this must re-read them.
  invalidateResolverCaches()
  if (materialId) {
    const { error } = await supabase.from(table).upsert({ ...match, material_id: materialId }, { onConflict: Object.keys(match).join(',') })
    return error?.message ?? null
  }
  let q = supabase.from(table).delete()
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v as string)
  const { error } = await q
  return error?.message ?? null
}

async function saveBatch(room: Room, description: string, source: string, entries: BatchEntry[], warnings: string[]) {
  const { data, error } = await supabase.from('ai_batches').insert({
    project_id: room.project_id, room_id: room.id, description, source, entries, warnings,
  }).select('id').single()
  if (error) throw new Error(`ai_batches insert: ${error.message}`)
  return data.id as string
}

/** Plan, then do it: insert / update / delete, settle, save the batch for Undo. */
export async function runBatch(roomId: string, ops: BatchOp[], args: { description: string; source?: 'ai' | 'script'; onlyIds?: string[] }): Promise<BatchResult> {
  const plan = await planBatch(roomId, ops, { onlyIds: args.onlyIds })
  if (plan.problems.length) return { batchId: null, changed: [], warnings: plan.problems, errors: [], cabinetIds: [] }
  if (!plan.steps.length) return { batchId: null, changed: [], warnings: ['Nothing to change — already that way.'], errors: [], cabinetIds: [] }

  const warnings = [...plan.warnings], errors: string[] = []
  const rows = new Map(plan.state.cabinets.map(c => [c.id, { ...c }]))
  const idFor = new Map<string, string>()   // planned temp id (cabinet or wall) → real id
  const entries: BatchEntry[] = []
  const updates = new Map<string, Extract<BatchEntry, { before: Fields }>>()
  const touched = new Set<string>()
  const elsewhere: string[] = []

  const record = (c: CabinetInstance, u: Fields) => {
    let e = updates.get(c.id)
    if (!e) { e = { kind: 'update', cabinet_id: c.id, label: c.label, before: {}, after: {} }; updates.set(c.id, e); entries.push(e) }
    for (const k of Object.keys(u)) {
      if (!(k in e.before)) (e.before as Row)[k] = (c as unknown as Row)[k] ?? null
      ;(e.after as Row)[k] = (u as Row)[k]
    }
  }

  let layerIds: Map<string, string> | null = null
  for (const s of plan.steps) {
    if (s.kind === 'fixture') {
      const cabId = s.row.cabinet_id ? idFor.get(s.row.cabinet_id as string) ?? s.row.cabinet_id : null
      const wallId = idFor.get(s.row.wall_id as string) ?? s.row.wall_id
      if (String(cabId ?? '').startsWith('new:') || String(wallId).startsWith('newwall:')) { errors.push(`${s.line}: what it sits on wasn't added — skipped.`); continue }
      const { data, error } = await supabase.from('room_fixtures').insert({ ...s.row, cabinet_id: cabId, wall_id: wallId }).select('id').single()
      if (error || !data) { errors.push(`${s.line}: save failed — ${error?.message}`); continue }
      entries.push({ kind: 'fixture', cabinet_id: '', label: null, line: s.line, fixture_id: data.id as string })
      continue
    }
    if (s.kind === 'markup') {
      if (!layerIds) layerIds = await jobLayerIds(supabase as unknown as SupabaseClient, plan.state.room.project_id)
      const rows = s.rows.map(({ _layer, ...r }) => ({ ...r, wall_id: idFor.get(r.wall_id as string) ?? r.wall_id, cad_layer_id: layerIds!.get(LAYER_NAME[_layer]) ?? null }))
      if (rows.some(r => String(r.wall_id).startsWith('newwall:'))) { errors.push(`${s.line}: its wall wasn't added — skipped.`); continue }
      const { data, error } = await supabase.from('room_annotations').insert(rows).select('id')
      if (error) { errors.push(`${s.line}: save failed — ${error.message}`); continue }
      entries.push({ kind: 'markup', cabinet_id: '', label: null, line: s.line, annotation_ids: ((data ?? []) as { id: string }[]).map(a => a.id) })
      continue
    }
    if (s.kind === 'props') {
      invalidateResolverCaches()   // the cascade every cabinet reads
      const { error } = await supabase.from(s.table).update(s.after).eq('id', s.rowId)
      if (error) { errors.push(`${s.line}: save failed — ${error.message}`); continue }
      entries.push({ kind: 'props', cabinet_id: '', label: null, line: s.line, table: s.table, row_id: s.rowId, before: s.before, after: s.after })
      for (const c of rows.values()) touched.add(c.id)
      continue
    }
    if (s.kind === 'wall') {
      const { data, error } = await supabase.from('walls').insert(s.row).select('id').single()
      if (error || !data) { errors.push(`${s.row.name}: add failed — ${error?.message}`); continue }
      idFor.set(s.tempId, data.id as string)
      entries.push({ kind: 'wall', cabinet_id: '', label: null, line: s.line, wall_id: data.id as string })
      continue
    }
    if (s.kind === 'material') {
      const err = await writeMaterialRow(s.table, s.match, s.after)
      if (err) { errors.push(`${s.line}: save failed — ${err}`); continue }
      entries.push({ kind: 'material', cabinet_id: '', label: null, line: s.line, table: s.table, match: s.match, before: s.before, after: s.after, resolve_ids: s.resolveIds })
      for (const id of s.resolveIds) { if (rows.has(id)) touched.add(id); else elsewhere.push(id) }
      continue
    }
    if (s.kind === 'update') {
      const id = idFor.get(s.id) ?? s.id
      const c = rows.get(id)
      if (!c) continue
      const { error } = await supabase.from('cabinet_instances').update(s.patch).eq('id', id)
      if (error) { errors.push(`${c.label}: save failed — ${error.message}`); continue }
      if (!s.id.startsWith('new:')) record(c, s.patch)
      rows.set(id, { ...c, ...s.patch })
      touched.add(id)
      const moved = ['dx', 'dy', 'dz', 'pos_x', 'pos_y', 'pos_z'].some(k => k in s.patch)
      if (moved && c.kick_run_id) warnings.push(`${c.label} is in a joined kick run — the joined kick isn't re-fitted (as on the canvas); check it.`)
    } else if (s.kind === 'insert') {
      const wallId = s.row.wall_id ? idFor.get(s.row.wall_id) ?? s.row.wall_id : s.row.wall_id
      if (wallId?.startsWith('newwall:')) { errors.push(`${s.row.label}: its wall wasn't added — skipped.`); continue }
      const { data, error } = await supabase.from('cabinet_instances').insert({ ...s.row, wall_id: wallId }).select('*').single()
      if (error || !data) { errors.push(`${s.row.label}: add failed — ${error?.message}`); continue }
      const c = data as CabinetInstance
      idFor.set(s.tempId, c.id)
      rows.set(c.id, c)
      await dbInsertDefinitionParts(s.defId, c.id)   // end panels / fillers that come with it
      entries.push({ kind: 'insert', cabinet_id: c.id, label: c.label, line: s.line })
      touched.add(c.id)
    } else {
      const c = rows.get(s.id)!
      const snapshot = await snapshotForDelete(c)
      const { error } = await supabase.from('cabinet_instances').delete().eq('id', s.id)
      if (error) { errors.push(`${c.label}: delete failed — ${error.message}`); continue }
      rows.delete(s.id)
      touched.delete(s.id)
      entries.push({ kind: 'delete', cabinet_id: s.id, label: c.label, line: s.line, snapshot })
    }
  }
  for (const e of updates.values()) {
    const c = plan.state.cabinets.find(x => x.id === e.cabinet_id)
    e.line = c ? updateLine(c, e.after, plan.state.walls) ?? undefined : undefined
  }

  await settle(roomId, plan.state.cabinets, touched, record, warnings, errors, elsewhere)
  for (const e of updates.values()) {   // neighbour re-detects joined in during settle
    if (e.line) continue
    const c = plan.state.cabinets.find(x => x.id === e.cabinet_id)
    e.line = c ? updateLine(c, e.after, plan.state.walls) ?? undefined : undefined
  }

  const batchId = entries.length ? await saveBatch(plan.state.room, args.description, args.source ?? 'ai', entries, warnings) : null
  return { batchId, changed: describe(entries), warnings, errors, cabinetIds: [...new Set([...entries.map(e => e.cabinet_id).filter(Boolean), ...touched])] }
}

/** AI0 shape: one update step. */
export function updateCabinets(args: { roomId: string; filter: CabinetFilter; changes: CabinetChanges; description: string; source?: 'ai' | 'script'; onlyIds?: string[] }) {
  return runBatch(args.roomId, [{ op: 'update', filter: args.filter, changes: args.changes }], args)
}

// ── Undo ──────────────────────────────────────────────────────────────────────

/**
 * Undo a batch, last step first. Updates go back unless the cabinet was edited
 * again since (then it's left alone and reported); added cabinets are removed
 * unless CAD was drawn on them since; deleted ones come back whole, same id.
 */
export async function undoBatch(batchId: string): Promise<BatchResult> {
  const { data: batch, error } = await supabase.from('ai_batches').select('*').eq('id', batchId).single()
  if (error || !batch) throw new Error(`Batch not found or no access: ${batchId}`)
  if (batch.undone_at) return { batchId: null, changed: [], warnings: ['Already undone.'], errors: [], cabinetIds: [] }
  if (!batch.room_id) throw new Error('Batch has no room')

  const state = await loadRoomState(batch.room_id)
  const warnings: string[] = [], errors: string[] = [], lines: string[] = []
  const touched = new Set<string>(), changedIds = new Set<string>()
  const elsewhere: string[] = []
  await loadMaterialNames((batch.entries as BatchEntry[]).flatMap(e =>
    e.kind === 'material' ? [e.before, e.after] : e.kind === 'update' || !e.kind
      ? [...overrideIds((e as { before: Fields }).before.material_overrides), ...overrideIds((e as { before: Fields }).before.toekick_overrides),
         ...overrideIds((e as { after: Fields }).after.material_overrides), ...overrideIds((e as { after: Fields }).after.toekick_overrides)]
      : []))
  const entries = [...(batch.entries as BatchEntry[])].reverse()
  const undoEntries: BatchEntry[] = []
  const record = (c: CabinetInstance, u: Fields) => {
    undoEntries.push({ kind: 'update', cabinet_id: c.id, label: c.label, before: pick(c, Object.keys(u)), after: u })
    changedIds.add(c.id)
  }

  for (const e of entries) {
    if (e.kind === 'fixture') {
      const { error: fe } = await supabase.from('room_fixtures').delete().eq('id', e.fixture_id)
      if (fe) { errors.push(`${e.line}: remove failed — ${fe.message}`); continue }
      lines.push(`Removed ${e.line.replace(/^Add /, '').split(' on ')[0].split(' (')[0]}`)
      continue
    }
    if (e.kind === 'markup') {
      // Only the AI's own notes, and only if nobody has edited them since (never delete user CAD).
      const { data: notes } = await supabase.from('room_annotations').select('id, created_at, updated_at').in('id', e.annotation_ids)
      const untouched = ((notes ?? []) as { id: string; created_at: string; updated_at: string }[])
        .filter(a => Math.abs(new Date(a.updated_at).getTime() - new Date(a.created_at).getTime()) < 2000).map(a => a.id)
      if (untouched.length < (notes ?? []).length) warnings.push(`${e.line.split(':')[0]}: edited since — left in place.`)
      if (untouched.length) {
        const { error: ae } = await supabase.from('room_annotations').delete().in('id', untouched)
        if (ae) { errors.push(`${e.line}: remove failed — ${ae.message}`); continue }
        lines.push(`Removed ${e.line.split(':')[0]}`)
      }
      continue
    }
    if (e.kind === 'props') {
      const { data: cur } = await supabase.from(e.table).select(Object.keys(e.after).join(', ')).eq('id', e.row_id).maybeSingle()
      const since = Object.keys(e.after).filter(k => canon((cur as Row | null)?.[k]) !== canon(e.after[k]))
      if (since.length) { warnings.push(`${e.line.split(' · ')[0]} set-up: changed again since — left as is.`); continue }
      invalidateResolverCaches()
      const { error: pe } = await supabase.from(e.table).update(e.before).eq('id', e.row_id)
      if (pe) { errors.push(`${e.line}: undo failed — ${pe.message}`); continue }
      lines.push(`${e.line.split(' · ')[0]} set-up put back`)
      for (const c of state.cabinets) { touched.add(c.id); changedIds.add(c.id) }
      continue
    }
    if (e.kind === 'wall') {
      const { count } = await supabase.from('cabinet_instances').select('id', { count: 'exact', head: true }).eq('wall_id', e.wall_id)
      if (count) { warnings.push(`${e.line.replace(/^Add /, '').split(' (')[0]}: cabinets were put on it since — left in place.`); continue }
      const { error: we } = await supabase.from('walls').delete().eq('id', e.wall_id)
      if (we) { errors.push(`${e.line}: remove failed — ${we.message}`); continue }
      lines.push(`Removed ${e.line.replace(/^Add /, '').split(' (')[0]}`)
      continue
    }
    if (e.kind === 'material') {
      let q = supabase.from(e.table).select('material_id')
      for (const [k, v] of Object.entries(e.match)) q = q.eq(k, v as string)
      const { data: cur } = await q.maybeSingle()
      const now = (cur as { material_id?: string } | null)?.material_id ?? null
      if (now !== e.after) { warnings.push(`${e.line.split(':')[0]}: changed again since — left as is.`); continue }
      const err = await writeMaterialRow(e.table, e.match, e.before)
      if (err) { errors.push(`${e.line.split(':')[0]}: undo failed — ${err}`); continue }
      lines.push(`${e.line.split(':')[0]}: back to ${matName(e.before)}`)
      for (const id of e.resolve_ids) {
        if (state.cabinets.some(c => c.id === id)) { touched.add(id); changedIds.add(id) } else elsewhere.push(id)
      }
      continue
    }
    const cur = state.cabinets.find(x => x.id === e.cabinet_id)
    if (e.kind === 'insert') {
      if (!cur) continue
      if (state.sheetCad.get(cur.id)) { warnings.push(`${e.label}: CAD was drawn on it since — left in place.`); continue }
      const { error: de } = await supabase.from('cabinet_instances').delete().eq('id', cur.id)
      if (de) { errors.push(`${e.label}: remove failed — ${de.message}`); continue }
      lines.push(`Removed ${e.label}`); changedIds.add(cur.id)
    } else if (e.kind === 'delete') {
      if (cur) continue   // already back
      const err = await restoreDeleted(e.snapshot)
      if (err && err.startsWith('cabinet_instances')) { errors.push(`${e.label}: restore failed — ${err}`); continue }
      if (err) warnings.push(`${e.label}: back, but some extras didn't restore (${err}).`)
      lines.push(`Restored ${e.label}`); touched.add(e.cabinet_id); changedIds.add(e.cabinet_id)
    } else {
      if (!cur) { warnings.push(`${e.label}: no longer in the room — skipped.`); continue }
      const keys = Object.keys(e.after)
      const now = pick(cur, keys) as Row
      const since = keys.filter(k => canon(now[k]) !== canon((e.after as Row)[k]))
      if (since.length) { warnings.push(`${e.label}: changed again since (${since.join(', ')}) — left as is.`); continue }
      const { error: ue } = await supabase.from('cabinet_instances').update(e.before).eq('id', cur.id)
      if (ue) { errors.push(`${e.label}: undo failed — ${ue.message}`); continue }
      const l = updateLine(cur, e.before, state.walls); if (l) lines.push(l)
      touched.add(cur.id); changedIds.add(cur.id)
    }
  }

  await settle(batch.room_id, state.cabinets, touched, record, warnings, errors, elsewhere)
  await supabase.from('ai_batches').update({ undone_at: new Date().toISOString(), undone_by: (await supabase.auth.getUser()).data.user?.id ?? null }).eq('id', batchId)
  const undoId = lines.length ? await saveBatch(state.room, `Undo: ${batch.description}`, 'undo', undoEntries, warnings) : null
  return { batchId: undoId, changed: lines, warnings, errors, cabinetIds: [...changedIds] }
}
