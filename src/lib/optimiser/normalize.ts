// ============================================================
// Shared part-snapshot normaliser.
// Turns raw project/room/cabinet/part rows into OptiPart[] +
// room/cabinet lists. Used by the server route loader and the
// client-side batch loader so both produce identical shapes.
// ============================================================

import type { OptiPart, OptiRoom, OptiCabinet, SourceTable } from './types'
import { PART_TYPE_LABELS } from '@/src/lib/partDisplayNames'
import { applySizeOverride, type SizeOvByCab } from './sizeOverrides'
import { attachShape, cutoutsToOp, shapeFrameFor, type ShapesByCab } from './shapes'
import { bandedLengthMM, tapeRuns, type EbSides } from './edgebandLength'
import type { OutlinePt } from '@/src/lib/shapePath'
import { zonePartId, dbPartId, zoneRef } from '@/src/lib/cabinetShape/partKeys'
import { removedIdsFrom, isAllViews } from '@/src/lib/resolver/filterHidden'
import type { PartHideViews } from '@/src/lib/resolver/types'
import { zoneBlank, zoneBevelNote, caseBevelNote, tkBevelNote } from '@/src/lib/jointDrilling'
import { curvedEndPartLabel } from '@/src/lib/resolver/resolveCurvedEnd'
import { floatShelfPartLabel, floatShelfPartNote } from '@/src/lib/floatShelf'
import { backPanelPartLabel } from '@/src/lib/backPanel'
import { cutBaseKeys, splitBaseKey, splitPieceNote, splitPieceSuffix } from '@/src/lib/cabinetSplit'

export const humanize = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

// ── Edgeband deduction bookkeeping ────────────────────────────────────────────
// Each part records the tape thickness on the four sides of its cut face,
// oriented to the CNC footprint frame (partFootprint.ts): w1/w2 = the pos_x=0 /
// pos_x=w edges, h1/h2 = the pos_y=0 / pos_y=h edges. The edge-flag → side
// mapping per part kind mirrors edgeStrips() / the footprint frames, so the
// deduction always matches what the views draw and where ops are measured from.

type EdgeFlags = { top: boolean; bottom: boolean; left: boolean; right: boolean }
// `on` = which footprint sides are banded, kept even when the tape thickness is
// unknown (eb_* read 0 then) — the edgeband length report (O7).
type EbFields  = Pick<OptiPart, 'eb_w1' | 'eb_w2' | 'eb_h1' | 'eb_h2' | 'eb_missing'> & { on?: EbSides }
type EdgePair  = [keyof EdgeFlags, keyof EdgeFlags]

const NO_EB: EbFields = { eb_w1: 0, eb_w2: 0, eb_h1: 0, eb_h2: 0, eb_missing: false }

// Finger-pull rails (z_handles D21): the CNC cuts anything narrower than this as
// a strip this wide; the shop trims it to size, then tapes its long edges.
export const RAIL_NEST_W = 60

/** A narrow finger-pull rail's nest strip + its shop note. Face-kind frame: the
 *  long edges are top / bottom (ends of DX = the rail's finished width). */
export function fingerRailStrip(width: number, length: number, thickness: number, flags: EdgeFlags, t: number | undefined, turned: boolean) {
  const edges = (flags.top ? 1 : 0) + (flags.bottom ? 1 : 0)
  const tt = t ?? 0
  const trim = Math.round((width - edges * tt) * 10) / 10
  const tape = edges === 0 ? 'no tape' : `tape ${edges} long edge${edges > 1 ? 's' : ''}`
  return {
    dims: turned ? { w: length, h: RAIL_NEST_W, thickness } : { w: RAIL_NEST_W, h: length, thickness },
    note: `Cut ${RAIL_NEST_W} wide, trim to ${trim}, then ${tape} = ${width}`,
  }
}

function ebFields(flags: EdgeFlags, t: number | undefined, wPair: EdgePair, hPair: EdgePair): EbFields {
  const banded = flags.top || flags.bottom || flags.left || flags.right
  const tt = t ?? 0
  return {
    eb_w1: flags[wPair[0]] ? tt : 0,
    eb_w2: flags[wPair[1]] ? tt : 0,
    eb_h1: flags[hPair[0]] ? tt : 0,
    eb_h2: flags[hPair[1]] ? tt : 0,
    eb_missing: banded && t == null,
    on: [flags[wPair[0]], flags[wPair[1]], flags[hPair[0]], flags[hPair[1]]],
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
export interface RawCabinet { id: string; label: string | null; assembly_class: string; room_id: string; no_cnc?: boolean | null; part_no_cnc?: string[] | null; part_hide_views?: PartHideViews | null
  // resolved_drawer_hw->warnings (saved resolver warnings, z_material_colours MC5)
  warnings?: { code?: string; message?: string; material_id?: string }[] | null
  // Grain match group (z_grain_match), embedded via grain_match_group_id.
  grain_match?: { id: string; name: string; direction: string } | null }
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
  sizeOvByCab: SizeOvByCab = new Map(),           // cabinet → part_pos_overrides (sw/sh/sd → effective dims, O1)
  shapesByCab: ShapesByCab = new Map(),           // cabinet → latest shape revision per part (O2)
): NormalizedProject {
  const rooms: OptiRoom[] = roomsRaw.map(r => ({ id: r.id, name: r.name }))
  const roomById = new Map(rooms.map(r => [r.id, r]))
  const cabinets: OptiCabinet[] = cabsRaw.map(c => {
    const colour_warnings = (Array.isArray(c.warnings) ? c.warnings : [])
      .filter(w => w.code === 'COLOUR_NOT_CHOSEN' && w.material_id)
      .map(w => ({ material_id: w.material_id!, message: w.message ?? '' }))
    // Angled panel-to-panel joints left for hand fixing (HAND_FIX_JOINT).
    const hand_fix = (Array.isArray(c.warnings) ? c.warnings : [])
      .filter(w => w.code === 'HAND_FIX_JOINT' && w.message).map(w => w.message!)
    const gm = c.grain_match
    return { id: c.id, label: c.label ?? humanize(c.assembly_class), room_id: c.room_id,
      ...(colour_warnings.length ? { colour_warnings } : {}), ...(hand_fix.length ? { hand_fix } : {}),
      ...(gm ? { grain_match: { id: gm.id, name: gm.name, direction: gm.direction === 'horizontal' ? 'horizontal' as const : 'vertical' as const } } : {}) }
  })
  const cabById = new Map(cabinets.map(c => [c.id, c]))
  // Assembly-level no_cnc cascades to ALL of a cabinet's parts (standard + custom).
  const cabNoCnc = new Set(cabsRaw.filter(c => c.no_cnc).map(c => c.id))
  // Per-part No CNC ticks (cabinet_instances.part_no_cnc), keyed by the same part ids as partKey.
  const partNoCnc = new Map(cabsRaw.map(c => [c.id, new Set(Array.isArray(c.part_no_cnc) ? c.part_no_cnc : [])]))
  // Removed parts (hidden in every view) aren't made: left out entirely (PART-HIDE-SPEC R-D2).
  const removedByCab = new Map(cabsRaw.map(c => [c.id, removedIdsFrom(c.part_hide_views)]))

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
    baseDims?: { w: number; h: number; thickness: number },   // set when sw/sh/sd overrides changed the row (O1)
  ) => {
    const cabId = row.cabinet_instance_id as string
    if (removedByCab.get(cabId)?.has(partKey)) return
    if (table === 'custom_parts' && isAllViews(row.hide_views as string[] | null)) return
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
    // Drawn outline for this part (O2) — stale-checked against the effective
    // in-plane dims this row is about to nest with — else the resolver's
    // outline on the row (shaped cabinets / finger-pull notches, O2b).
    // Op frame = DX × DY; a part nested turned (w = DY) is transposed. Parts
    // whose nest face isn't the DX × DY face (on-edge kick spreaders) get no
    // op outline.
    const DX = Number(row.dx), DY = Number(row.dy)
    const effW = dims?.w ?? DX, effH = dims?.h ?? DY
    const near = (a: number, b: number) => Math.abs(a - b) < 0.01
    const transpose = near(effW, DY) && near(effH, DX) && !near(DX, DY)
    const inPlane = transpose || (near(effW, DX) && near(effH, DY))
    const frame = shapeFrameFor(table, table === 'custom_parts' ? String(row.orientation ?? 'flat') : naming.typeKey, partKey)
    const { shape, stale, tapeMissing } = attachShape(shapesByCab.get(cabId)?.[partKey], effW, effH,
      inPlane ? { frame, DX, DY, transpose, mirrorBlank: table === 'case_parts' && partKey === 'case_left_side' } : undefined,
      Array.isArray(row.outline) ? row.outline as OutlinePt[] : null, bandOf(table, row))
    // Inner cut-outs (curved end ribs, C4) ride on the resolver outline: dropped
    // with it when a drawn shape replaces it or a size override no longer fits.
    // Edgeband metres (O7): the outline it's cut to (a stale shape isn't cut), else w × h.
    const { on: ebOn, ...ebOut } = eb
    const cutShape = shape && !stale && shape.op_polygon.length >= 3 ? shape : null
    const bandMm = bandedLengthMM(effW, effH, ebOn ?? [false, false, false, false], cutShape?.op_polygon, cutShape?.op_band)
    const holes = shape?.source === 'resolver' && inPlane
      ? cutoutsToOp(row.cutouts as { pts: OutlinePt[]; skin?: number }[] | null, { frame, DX, DY, transpose }) : null
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
      ...ebOut,
      ...(ebOn ? { eb_on: ebOn } : {}),
      ...(tapeMissing ? { eb_missing: true } : {}),
      ...(bandMm > 0 ? { eb_tape: tapeRuns(tapeIdOf(table, row), bandMm) } : {}),
      material_id: (row.material_id as string) ?? null,
      grain_direction: grain, nest_priority: nestPriority,
      output_to_cnc: partCut && !cabNoCnc.has(cabId) && !partNoCnc.get(cabId)?.has(partKey),
      // Floating shelf parts default to "build up then edge" / hand-cut notes (z_floating_shelf).
      comment: commentsByCab.get(cabId)?.[partKey] ?? (table === 'case_parts' ? floatShelfPartNote(naming.typeKey) : null),
      ...(baseDims ? {
        size_overridden: true,
        base_w: baseDims.w, base_h: baseDims.h, base_thickness: baseDims.thickness,
      } : {}),
      ...(shape ? { shape, shape_stale: stale } : {}),
      ...(holes ?? {}),
    })
  }
  // Fold sw/sh/sd size overrides into the row's dx/dy/dz BEFORE any downstream
  // math (EB fields, toe-kick canonicalisation) so everything sees the
  // effective size. Returns the original row's footprint when changed, for the
  // "base → effective" display.
  const sized = (table: SourceTable, r: Row, partKey: string): { r: Row; base?: { w: number; h: number; thickness: number } } => {
    const { row, overridden } = applySizeOverride(table, r, partKey, sizeOvByCab)
    if (!overridden) return { r }
    const base = table === 'toekick_parts'
      ? canonicalPanelDims(Number(r.dx), Number(r.dy), Number(r.dz))
      : { w: Number(r.dx), h: Number(r.dy), thickness: Number(r.dz) }
    return { r: row, base }
  }

  // Tape thickness for a part row (via its persisted edge_band_id), plus a
  // material → thickness fallback for custom parts, which carry edge flags but
  // no edgeband id of their own.
  const tFor = (r: Row): number | undefined => {
    const id = r.edge_band_id as string | null | undefined
    return id ? ebThickness.get(id) : undefined
  }
  const matEb = new Map<string, number>()
  const matEbId = new Map<string, string>()
  for (const r of [...cp, ...ip, ...tp, ...fz, ...dbp]) {
    const t = tFor(r); const mat = r.material_id as string | null
    if (t != null && mat && !matEb.has(mat)) matEb.set(mat, t)
    if (r.edge_band_id && mat && !matEbId.has(mat)) matEbId.set(mat, r.edge_band_id as string)
  }
  // The tape product a part's banded edges take — same fallback as bandOf.
  const tapeIdOf = (table: SourceTable, r: Row): string | null => {
    const mat = r.material_id as string | null
    const own = table === 'custom_parts' ? null : (r.edge_band_id as string | null | undefined)
    return own ?? (mat ? matEbId.get(mat) ?? null : null)
  }
  const flagsOf = (r: Row): EdgeFlags => ({
    top: !!r.edge_band_top, bottom: !!r.edge_band_bottom,
    left: !!r.edge_band_left, right: !!r.edge_band_right,
  })
  // Tape + resolver-frame edge flags for a shaped part's per-edge tape (O5).
  // Same flag mapping and thickness fallback as each table's loop below.
  function bandOf(table: SourceTable, r: Row): { t: number | undefined; flags: EdgeFlags } {
    if (table === 'internal_parts') return { t: tFor(r), flags: { top: !!r.edge_band_top, bottom: !!r.edge_band_bottom, left: !!r.edge_band_back, right: !!r.edge_band_front } }
    if (table === 'custom_parts') return { t: r.material_id ? matEb.get(r.material_id as string) : undefined, flags: { top: !!r.edge_top, bottom: !!r.edge_bottom, left: !!r.edge_left, right: !!r.edge_right } }
    return { t: tFor(r) ?? (r.material_id ? matEb.get(r.material_id as string) : undefined), flags: flagsOf(r) }
  }

  // Height-split cabinets (z_cabinet_split): per cabinet, which sides / backs were
  // cut and into how many pieces, so each piece reads "(split bottom / mid / top)"
  // and carries a "SPLIT - BOTTOM / MID / TOP" comment (Mark, 2026-10-31).
  const keysByCab = new Map<string, string[]>()
  for (const r of cp) keysByCab.set(String(r.cabinet_instance_id), [...(keysByCab.get(String(r.cabinet_instance_id)) ?? []), String(r.part_key)])
  const cutByCab = new Map([...keysByCab].map(([cab, keys]) => [cab, cutBaseKeys(keys)]))

  // partKey mirrors the svg*Meta synthetic ids so it matches part_operations.source_part_key.
  for (const r0 of cp) {
    const key = String(r0.part_key)
    const { r, base } = sized('case_parts', r0, `case_${key}`)
    const pieceOf = splitBaseKey(key)   // a cut piece is its part for naming + tape
    const isSide = pieceOf === 'left_side' || pieceOf === 'right_side'
    // Sides: footprint u = depth (banded back/front = left/right flags), v = height.
    // Back + horizontals: u runs bottom→top (back panels) / back→front where the
    // horizontal 'bottom' flag is the back edge; v runs left→right.
    // A turned island back panel (below) nests w = its width: tape pairs as a side's.
    const sidePairs = isSide || ((key.startsWith('ibp:') || key.startsWith('lh:')) && r.grain_direction === 'vertical')
    const eb = ebFields(flagsOf(r), tFor(r),
      sidePairs ? ['left', 'right'] : ['bottom', 'top'],
      sidePairs ? ['bottom', 'top'] : ['left', 'right'])
    // Finger-pull rails: the nest's h runs with the grain, so a horizontal-grain
    // rail nests as-is (h = length) and a vertical-grain rail is turned. Rails
    // carry no machining, so turning them can't misplace an op.
    // Island back panels (z_island_back_panel) are vertical-grain applied panels
    // with no machining: turned the same way, their tape turning with them.
    const turned = (key.startsWith('fprail:') || key.startsWith('ibp:') || key.startsWith('lh:')) && r.grain_direction === 'vertical'
      ? { w: Number(r.dy), h: Number(r.dx), thickness: Number(r.dz) } : undefined
    // Finger-pull rails narrower than the machine cuts well nest as a RAIL_NEST_W
    // strip; the shop trims it and tapes the long edges after (Mark, 2026-10-29), so
    // nothing is deducted for tape here and the comment gives the trim size.
    const railStrip = key.startsWith('fprail:') && Number(r.dx) < RAIL_NEST_W
      ? fingerRailStrip(Number(r.dx), Number(r.dy), Number(r.dz), flagsOf(r), tFor(r), !!turned) : null
    // Angled panel ends (z_cabinet_shape 4a): nested as the blank, bevel named.
    const bevel = caseBevelNote({ bevel_lo: Number(r.bevel_lo ?? 0), bevel_hi: Number(r.bevel_hi ?? 0) })
    const cutHere = cutByCab.get(String(r.cabinet_instance_id)) ?? new Map<string, number>()
    const piece = splitPieceSuffix(key, cutHere).trim().replace(/[()]/g, '') || null
    const splitNote = splitPieceNote(key, cutHere)
    push('case_parts', r, `case_${key}`, { typeKey: pieceOf, base: key.startsWith('fprail:') ? `Finger Rail ${Number(key.slice(7)) + 1}` : key.startsWith('lh:') ? `Linear Handle ${Number(key.slice(3)) + 1}` : curvedEndPartLabel(key) ?? floatShelfPartLabel(key) ?? backPanelPartLabel(key) ?? humanize(pieceOf),
      ...(bevel || piece || key.startsWith('lh:') ? { suffix: [bevel, piece, key.startsWith('lh:') ? 'sharknose edge, saw' : null].filter(Boolean).map(t => ` (${t})`).join('') } : {}) },
      (r.grain_direction as string) ?? null, Number(r.nest_priority ?? 0), railStrip?.dims ?? turned,
      railStrip ? { ...eb, eb_w1: 0, eb_w2: 0, eb_h1: 0, eb_h2: 0 } : eb, base)
    const last = parts[parts.length - 1]
    if (railStrip && last?.source_part_id === r.id) last.comment = last.comment ? `${railStrip.note} · ${last.comment}` : railStrip.note
    if (splitNote && last?.source_part_id === r.id) last.comment = last.comment ? `${splitNote} · ${last.comment}` : splitNote
  }
  for (const r0 of ip) {
    const type = String(r0.part_type)
    if (type === 'accessory' || type === 'rail_support') continue   // hardware (hanging rail + supports), not board parts
    const { r, base } = sized('internal_parts', r0, `int_${type}_${r0.sort_order}`)
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
      null, 0, undefined, eb, base)
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
  for (const r0 of tp) {
    const { r, base } = sized('toekick_parts', r0, `tk_${r0.part_key}_${r0.sort_order}`)
    const t = tFor(r)
    const flags = flagsOf(r)
    const banded = flags.top || flags.bottom || flags.left || flags.right
    const tt = t ?? 0
    const trip = [
      { v: Number(r.dx), d1: flags.bottom ? tt : 0, d2: flags.top ? tt : 0, b1: flags.bottom, b2: flags.top },
      { v: Number(r.dy), d1: flags.left ? tt : 0, d2: flags.right ? tt : 0, b1: flags.left, b2: flags.right },
      { v: Number(r.dz), d1: 0, d2: 0, b1: false, b2: false },
    ].sort((a, b) => b.v - a.v)
    // Kick face / returns (rule TOEGRAIN): a grain-locked part nests with h along
    // the grain. Vertical (default) = h is the kick height, which the longest-first
    // order above already gives a board longer than it is high; horizontal turns
    // it so h runs along the board's length (dy).
    if (r.grain_direction) {
      const hi = trip.findIndex(q => q.v === Number(r.dx))
      const want = r.grain_direction === 'horizontal' ? trip.findIndex((q, k) => k !== hi && k < 2) : hi
      if (want === 0) [trip[0], trip[1]] = [trip[1], trip[0]]
    }
    // Mitred kick boards of a shaped cabinet (z_cabinet_shape 4b): blank + note.
    const mitre = tkBevelNote({ bevel_lo: Number(r.bevel_lo ?? 0), bevel_hi: Number(r.bevel_hi ?? 0) })
    push('toekick_parts', r, `tk_${r.part_key}_${r.sort_order}`,
      { typeKey: String(r.part_key), base: humanize(String(r.part_key)), ...(mitre ? { suffix: ` (${mitre})` } : {}) }, null, 0,
      { w: trip[0].v, h: trip[1].v, thickness: trip[2].v },
      { eb_w1: trip[0].d1, eb_w2: trip[0].d2, eb_h1: trip[1].d1, eb_h2: trip[1].d2, eb_missing: banded && t == null,
        on: [trip[0].b1, trip[0].b2, trip[1].b1, trip[1].b2] },
      base)
  }
  for (const r0 of fz) {
    const { r: rs, base } = sized('face_zones', r0, zonePartId(r0 as unknown as { row_index: number; col_index: number; facet?: string }))
    // Mitred facet fronts (z_cabinet_shape 3c) nest at their front-face width;
    // the bevel is sawn after and named on the part.
    const bev = { DX: Number(rs.dx), DZ: Number(rs.dz), bevel_l: Number(rs.bevel_l ?? 0), bevel_r: Number(rs.bevel_r ?? 0) }
    const mitre = zoneBevelNote(bev)
    const r = mitre ? { ...rs, dx: zoneBlank(bev).width } : rs
    // Face zones: dx = width (w, banded left/right), dy = height (h, banded bottom/top).
    const eb = ebFields(flagsOf(r), tFor(r), ['left', 'right'], ['bottom', 'top'])
    const zref = { row_index: Number(r.row_index), col_index: Number(r.col_index), facet: (r.facet as string | null) || undefined }
    push('face_zones', r, zonePartId(zref),
      { typeKey: String(r.face_type), base: humanize(String(r.face_type)),
        suffix: ` (${zoneRef(zref)}${mitre ? `, ${mitre}` : ''})` },
      (r.grain_direction as string) ?? null, 0, undefined, eb, base)
    // A front in a horizontal grain match group (z_grain_match G3) runs its grain
    // across its width: the nest turns it (a true quarter turn, so its drilling
    // turns with it) rather than swapping w/h here.
    const last = parts[parts.length - 1]
    if (last?.source_part_id === r.id && cabById.get(String(r.cabinet_instance_id))?.grain_match?.direction === 'horizontal') last.grain_across = true
  }
  // Drawer box panels — key mirrors svgDbMeta / Cabinet3DView (db_<row>_<col>_<part_type>),
  // the same identity the PartEditor writes to part_operations.source_part_key and that
  // part_comments are keyed by. Must match exactly or hand ops / comments are dropped here.
  for (const r0 of dbp) {
    const type = String(r0.part_type)
    const id = dbPartId({ face_zone_row: Number(r0.face_zone_row), face_zone_col: Number(r0.face_zone_col), facet: r0.facet as string | null }, type)
    const { r, base } = sized('drawer_box_parts', r0, id)
    // Box sides/bottom run pos_x front→back (boxFrame dir −1): pos_x=0 is the
    // FRONT edge — 'right' flag for sides, 'top' flag for the bottom panel.
    const pairs: [EdgePair, EdgePair] =
      type === 'db_left_side' || type === 'db_right_side' ? [['right', 'left'], ['bottom', 'top']]
      : type === 'db_bottom' ? [['top', 'bottom'], ['left', 'right']]
      : [['bottom', 'top'], ['left', 'right']]
    const eb = ebFields(flagsOf(r), tFor(r), pairs[0], pairs[1])
    push('drawer_box_parts', r, id,
      { typeKey: type, base: humanize(type.replace(/^db_/, '')),
        suffix: ` (${zoneRef({ row_index: Number(r.face_zone_row), col_index: Number(r.face_zone_col), facet: (r.facet as string | null) || undefined })})` },
      (r.grain_direction as string) ?? null, 0, undefined, eb, base)
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
  case_parts: 'id,cabinet_instance_id,part_key,dx,dy,dz,bevel_lo,bevel_hi,outline,cutouts,material_id,grain_direction,nest_priority,output_to_cnc,edge_band_top,edge_band_bottom,edge_band_left,edge_band_right,edge_band_id',
  internal_parts: 'id,cabinet_instance_id,part_type,sort_order,dx,dy,dz,outline,material_id,output_to_cnc,edge_band_top,edge_band_bottom,edge_band_back,edge_band_front,edge_band_id',
  toekick_parts: 'id,cabinet_instance_id,part_key,sort_order,dx,dy,dz,bevel_lo,bevel_hi,grain_direction,material_id,output_to_cnc,edge_band_top,edge_band_bottom,edge_band_left,edge_band_right,edge_band_id',
  face_zones: 'id,cabinet_instance_id,facet,row_index,col_index,face_type,dx,dy,dz,bevel_l,bevel_r,material_id,grain_direction,output_to_cnc,edge_band_top,edge_band_bottom,edge_band_left,edge_band_right,edge_band_id',
  drawer_box_parts: 'id,cabinet_instance_id,facet,face_zone_row,face_zone_col,part_type,dx,dy,dz,material_id,grain_direction,output_to_cnc,edge_band_top,edge_band_bottom,edge_band_left,edge_band_right,edge_band_id',
  custom_parts: 'id,cabinet_instance_id,name,orientation,dx,dy,dz,material_id,no_cnc,hide_views,edge_top,edge_bottom,edge_left,edge_right',
} as const

// Fetch the edge_banding thicknesses referenced by a set of part rows — shared
// by the server and client loaders so both hand normalizeProject the same map.
export function collectEbIds(...rowSets: Row[][]): string[] {
  const ids = new Set<string>()
  for (const rows of rowSets) for (const r of rows) if (r.edge_band_id) ids.add(r.edge_band_id as string)
  return [...ids]
}
