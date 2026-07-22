// ============================================================
// Shared part-snapshot normaliser.
// Turns raw project/room/cabinet/part rows into OptiPart[] +
// room/cabinet lists. Used by the server route loader and the
// client-side batch loader so both produce identical shapes.
// ============================================================

import type { OptiPart, OptiRoom, OptiCabinet, SourceTable } from './types'
import { PART_TYPE_LABELS } from '@/src/lib/partDisplayNames'

export const humanize = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

// ── Edgeband deduction bookkeeping ────────────────────────────────────────────
// Each part records the tape thickness on the four sides of its cut face,
// oriented to the CNC footprint frame (partFootprint.ts): w1/w2 = the pos_x=0 /
// pos_x=w edges, h1/h2 = the pos_y=0 / pos_y=h edges. The edge-flag → side
// mapping per part kind mirrors edgeStrips() / the footprint frames, so the
// deduction always matches what the views draw and where ops are measured from.

type EdgeFlags = { top: boolean; bottom: boolean; left: boolean; right: boolean }
type EbFields  = Pick<OptiPart, 'eb_w1' | 'eb_w2' | 'eb_h1' | 'eb_h2' | 'eb_missing'>
type EdgePair  = [keyof EdgeFlags, keyof EdgeFlags]

const NO_EB: EbFields = { eb_w1: 0, eb_w2: 0, eb_h1: 0, eb_h2: 0, eb_missing: false }

function ebFields(flags: EdgeFlags, t: number | undefined, wPair: EdgePair, hPair: EdgePair): EbFields {
  const banded = flags.top || flags.bottom || flags.left || flags.right
  const tt = t ?? 0
  return {
    eb_w1: flags[wPair[0]] ? tt : 0,
    eb_w2: flags[wPair[1]] ? tt : 0,
    eb_h1: flags[hPair[0]] ? tt : 0,
    eb_h2: flags[hPair[1]] ? tt : 0,
    eb_missing: banded && t == null,
  }
}

// Reduce a part's 3D placement bounding box to sheet-good nesting dims: the
// thinnest axis is the board thickness, the two larger dims are the cut face
// (w = larger, h = smaller). Only safe for parts without a grain direction,
// since it may swap w/h. Used for on-edge toe-kick spreaders whose thickness
// would otherwise be read off the wrong axis.
export function canonicalPanelDims(dx: number, dy: number, dz: number): { w: number; h: number; thickness: number } {
  const [w, h, thickness] = [dx, dy, dz].sort((a, b) => b - a)
  return { w, h, thickness }
}

export interface RawProject { id: string; name: string; job_number: string | null }
export interface RawRoom { id: string; name: string }
export interface RawCabinet { id: string; label: string | null; assembly_class: string; room_id: string; no_cnc?: boolean | null }
type Row = Record<string, unknown>

export interface NormalizedProject {
  rooms: OptiRoom[]
  cabinets: OptiCabinet[]
  parts: OptiPart[]
}

export function normalizeProject(
  project: RawProject,
  roomsRaw: RawRoom[],
  cabsRaw: RawCabinet[],
  cp: Row[], ip: Row[], tp: Row[], fz: Row[],
  dbp: Row[] = [],
  commentsByCab: Map<string, Record<string, string>> = new Map(),
  ccp: Row[] = [],
  ebThickness: Map<string, number> = new Map(),   // edge_band_id → tape thickness (mm)
  namesByCab: Map<string, Record<string, string>> = new Map(),  // cabinet → part_names
  systemNames: Record<string, string> = {},       // parts_library: key → name (active rows)
): NormalizedProject {
  const rooms: OptiRoom[] = roomsRaw.map(r => ({ id: r.id, name: r.name }))
  const roomById = new Map(rooms.map(r => [r.id, r]))
  const cabinets: OptiCabinet[] = cabsRaw.map(c => ({ id: c.id, label: c.label ?? humanize(c.assembly_class), room_id: c.room_id }))
  const cabById = new Map(cabinets.map(c => [c.id, c]))
  // Assembly-level no_cnc cascades to ALL of a cabinet's parts (standard + custom).
  const cabNoCnc = new Set(cabsRaw.filter(c => c.no_cnc).map(c => c.id))

  const parts: OptiPart[] = []
  const meta = (cabId: string) => {
    const cab = cabById.get(cabId)
    const room = cab ? roomById.get(cab.room_id) : undefined
    return { cabinet_label: cab?.label ?? '—', room_id: cab?.room_id ?? '', room_name: room?.name ?? '—' }
  }
  // Display name resolves in three layers, most specific first:
  //   1. namesByCab[cab][partKey]   — this part, renamed by hand (positional key)
  //   2. systemNames[typeKey]       — parts_library.name for the raw resolver key,
  //                                   read live (rename once → every job relabels)
  //   3. naming.base                — humanized part_key / part_type, shipped in code
  // typeKey is the RAW resolver key (bottom, db_bottom, kick_back, door…) — these are
  // collision-free across part kinds and match parts_library.key, which the library
  // was originally seeded with. The positional suffix ("(R2C1)", " 3") is appended
  // AFTER the name resolves, so "Drawer Box Bottom" still reads "Drawer Box Bottom (R2C1)".
  const push = (
    table: SourceTable, row: Row, partKey: string,
    naming: { typeKey: string; base: string; suffix?: string },
    grain: string | null, nestPriority: number,
    dims?: { w: number; h: number; thickness: number },
    eb: EbFields = NO_EB,
  ) => {
    const cabId = row.cabinet_instance_id as string
    const m = meta(cabId)
    // Empty typeKey opts out of the type layers (custom parts carry their own name).
    // Order: live parts_library name → code default → naming.base (humanized key).
    const base = (naming.typeKey
      ? systemNames[naming.typeKey] ?? PART_TYPE_LABELS[naming.typeKey]
      : undefined) ?? naming.base
    const defaultLabel = base + (naming.suffix ?? '')
    // custom_parts carry no_cnc (true = skip CNC); everything else carries output_to_cnc.
    // Either is overridden to false when the whole assembly is flagged no_cnc.
    const partCut = table === 'custom_parts' ? !(row.no_cnc as boolean) : ((row.output_to_cnc as boolean) ?? true)
    parts.push({
      uid: `${table}:${row.id as string}`,
      source_table: table, source_part_id: row.id as string,
      source_part_key: partKey,
      cabinet_instance_id: row.cabinet_instance_id as string,
      cabinet_label: m.cabinet_label, room_id: m.room_id, room_name: m.room_name,
      project_id: project.id, job_number: project.job_number,
      label: namesByCab.get(cabId)?.[partKey] ?? defaultLabel,
      default_label: defaultLabel,
      part_type_key: naming.typeKey,
      w: dims?.w ?? Number(row.dx), h: dims?.h ?? Number(row.dy), thickness: dims?.thickness ?? Number(row.dz),
      ...eb,
      material_id: (row.material_id as string) ?? null,
      grain_direction: grain, nest_priority: nestPriority,
      output_to_cnc: partCut && !cabNoCnc.has(cabId),
      comment: commentsByCab.get(cabId)?.[partKey] ?? null,
    })
  }

  // Tape thickness for a part row (via its persisted edge_band_id), plus a
  // material → thickness fallback for custom parts, which carry edge flags but
  // no edgeband id of their own.
  const tFor = (r: Row): number | undefined => {
    const id = r.edge_band_id as string | null | undefined
    return id ? ebThickness.get(id) : undefined
  }
  const matEb = new Map<string, number>()
  for (const r of [...cp, ...ip, ...tp, ...fz, ...dbp]) {
    const t = tFor(r); const mat = r.material_id as string | null
    if (t != null && mat && !matEb.has(mat)) matEb.set(mat, t)
  }
  const flagsOf = (r: Row): EdgeFlags => ({
    top: !!r.edge_band_top, bottom: !!r.edge_band_bottom,
    left: !!r.edge_band_left, right: !!r.edge_band_right,
  })

  // partKey mirrors the svg*Meta synthetic ids so it matches part_operations.source_part_key.
  for (const r of cp) {
    const key = String(r.part_key)
    const isSide = key === 'left_side' || key === 'right_side'
    // Sides: footprint u = depth (banded back/front = left/right flags), v = height.
    // Back + horizontals: u runs bottom→top (back panels) / back→front where the
    // horizontal 'bottom' flag is the back edge; v runs left→right.
    const eb = ebFields(flagsOf(r), tFor(r),
      isSide ? ['left', 'right'] : ['bottom', 'top'],
      isSide ? ['bottom', 'top'] : ['left', 'right'])
    push('case_parts', r, `case_${key}`, { typeKey: key, base: humanize(key) },
      (r.grain_direction as string) ?? null, Number(r.nest_priority ?? 0), undefined, eb)
  }
  for (const r of ip) {
    const type = String(r.part_type)
    // DB columns: edge_band_back → resolver 'left', edge_band_front → 'right'.
    const flags: EdgeFlags = {
      top: !!r.edge_band_top, bottom: !!r.edge_band_bottom,
      left: !!r.edge_band_back, right: !!r.edge_band_front,
    }
    const isSideKind = type.endsWith('_side') || type === 'divider'
    const eb = ebFields(flags, tFor(r),
      isSideKind ? ['left', 'right'] : ['bottom', 'top'],
      isSideKind ? ['bottom', 'top'] : ['left', 'right'])
    push('internal_parts', r, `int_${type}_${r.sort_order}`,
      { typeKey: type, base: humanize(type), suffix: ` ${Number(r.sort_order) + 1}` },
      null, 0, undefined, eb)
  }
  // Toe-kick parts store their placement bounding box in cabinet space, so the
  // board thickness isn't always on the DZ axis: spreaders are modelled on-edge
  // (thickness on DY, DZ spanning the kick depth ~489mm). Canonicalise to the real
  // sheet-good orientation — thinnest axis = board thickness, the two larger dims =
  // the cut face — so spreaders nest in the same material+thickness group as the
  // sub-front/back and cut the correct rectangle (toe-kick parts carry no grain, so
  // swapping w/h is safe). See resolveToekick.ts for the on-edge geometry.
  // Edgeband deductions ride along through the same sort: top/bottom band the
  // height axis (dx), left/right the width axis (dy); the thickness axis is never
  // banded.
  for (const r of tp) {
    const t = tFor(r)
    const flags = flagsOf(r)
    const banded = flags.top || flags.bottom || flags.left || flags.right
    const tt = t ?? 0
    const trip = [
      { v: Number(r.dx), d1: flags.bottom ? tt : 0, d2: flags.top ? tt : 0 },
      { v: Number(r.dy), d1: flags.left ? tt : 0, d2: flags.right ? tt : 0 },
      { v: Number(r.dz), d1: 0, d2: 0 },
    ].sort((a, b) => b.v - a.v)
    push('toekick_parts', r, `tk_${r.part_key}_${r.sort_order}`,
      { typeKey: String(r.part_key), base: humanize(String(r.part_key)) }, null, 0,
      { w: trip[0].v, h: trip[1].v, thickness: trip[2].v },
      { eb_w1: trip[0].d1, eb_w2: trip[0].d2, eb_h1: trip[1].d1, eb_h2: trip[1].d2, eb_missing: banded && t == null })
  }
  for (const r of fz) {
    // Face zones: dx = width (w, banded left/right), dy = height (h, banded bottom/top).
    const eb = ebFields(flagsOf(r), tFor(r), ['left', 'right'], ['bottom', 'top'])
    push('face_zones', r, `zone_${r.row_index}_${r.col_index}`,
      { typeKey: String(r.face_type), base: humanize(String(r.face_type)),
        suffix: ` (R${Number(r.row_index) + 1}C${Number(r.col_index) + 1})` },
      (r.grain_direction as string) ?? null, 0, undefined, eb)
  }
  // Drawer box panels — key mirrors svgDbMeta / Cabinet3DView (db_<row>_<col>_<part_type>),
  // the same identity the PartEditor writes to part_operations.source_part_key and that
  // part_comments are keyed by. Must match exactly or hand ops / comments are dropped here.
  for (const r of dbp) {
    const type = String(r.part_type)
    // Box sides/bottom run pos_x front→back (boxFrame dir −1): pos_x=0 is the
    // FRONT edge — 'right' flag for sides, 'top' flag for the bottom panel.
    const pairs: [EdgePair, EdgePair] =
      type === 'db_left_side' || type === 'db_right_side' ? [['right', 'left'], ['bottom', 'top']]
      : type === 'db_bottom' ? [['top', 'bottom'], ['left', 'right']]
      : [['bottom', 'top'], ['left', 'right']]
    const eb = ebFields(flagsOf(r), tFor(r), pairs[0], pairs[1])
    push('drawer_box_parts', r, `db_${r.face_zone_row}_${r.face_zone_col}_${type}`,
      { typeKey: type, base: humanize(type.replace(/^db_/, '')),
        suffix: ` (R${Number(r.face_zone_row) + 1}C${Number(r.face_zone_col) + 1})` },
      (r.grain_direction as string) ?? null, 0, undefined, eb)
  }
  // Custom parts (fillers / applied panels / end panels). Key mirrors PartsView (custom_<id>).
  // No edgeband id of their own — fall back to the tape used with the same material.
  for (const r of ccp) {
    const flags: EdgeFlags = { top: !!r.edge_top, bottom: !!r.edge_bottom, left: !!r.edge_left, right: !!r.edge_right }
    const t = r.material_id ? matEb.get(r.material_id as string) : undefined
    const eb = ebFields(flags, t, ['left', 'right'], ['bottom', 'top'])
    // Empty typeKey: custom parts already carry a user-typed name column, so there's
    // no type-level default to apply. A per-part rename still overrides it.
    push('custom_parts', r, `custom_${r.id}`, { typeKey: '', base: String(r.name ?? 'Custom') }, null, 0, undefined, eb)
  }

  return { rooms, cabinets, parts }
}

// Column selections shared by server + client loaders.
export const PART_SELECTS = {
  case_parts: 'id,cabinet_instance_id,part_key,dx,dy,dz,material_id,grain_direction,nest_priority,output_to_cnc,edge_band_top,edge_band_bottom,edge_band_left,edge_band_right,edge_band_id',
  internal_parts: 'id,cabinet_instance_id,part_type,sort_order,dx,dy,dz,material_id,output_to_cnc,edge_band_top,edge_band_bottom,edge_band_back,edge_band_front,edge_band_id',
  toekick_parts: 'id,cabinet_instance_id,part_key,sort_order,dx,dy,dz,material_id,output_to_cnc,edge_band_top,edge_band_bottom,edge_band_left,edge_band_right,edge_band_id',
  face_zones: 'id,cabinet_instance_id,row_index,col_index,face_type,dx,dy,dz,material_id,grain_direction,output_to_cnc,edge_band_top,edge_band_bottom,edge_band_left,edge_band_right,edge_band_id',
  drawer_box_parts: 'id,cabinet_instance_id,face_zone_row,face_zone_col,part_type,dx,dy,dz,material_id,grain_direction,output_to_cnc,edge_band_top,edge_band_bottom,edge_band_left,edge_band_right,edge_band_id',
  custom_parts: 'id,cabinet_instance_id,name,dx,dy,dz,material_id,no_cnc,edge_top,edge_bottom,edge_left,edge_right',
} as const

// Fetch the edge_banding thicknesses referenced by a set of part rows — shared
// by the server and client loaders so both hand normalizeProject the same map.
export function collectEbIds(...rowSets: Row[][]): string[] {
  const ids = new Set<string>()
  for (const rows of rowSets) for (const r of rows) if (r.edge_band_id) ids.add(r.edge_band_id as string)
  return [...ids]
}
