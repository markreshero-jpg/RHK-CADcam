// ============================================================
// Source drilling holes for the G-code post from part_operations.
// Maps each placement back to its part's drill ops (by the stable
// source_table|cabinet|part_key), expands repeat patterns, and
// transforms part-local hole coords into sheet space — accounting
// for the placement offset and 90° rotation. Pure/testable.
// ============================================================

import type { NestedSheet } from './nest'
import type { SheetDrill } from './gcode'

export interface DrillOpRaw {
  source_table: string
  source_cabinet_id: string | null
  source_part_key: string | null
  pos_x: number | null; pos_y: number | null
  // Entry face (± the part's footprint normal) — used to tell pre-mirrored
  // down-face bores apart when shifting ops onto an edgeband-deducted blank.
  output_face?: string | null
  diameter: number | null; depth: number | null
  repeat_count: number | null; repeat_spacing: number | null; repeat_axis: string | null
  // Tool assignment — resolved to a concrete bit (and an effective diameter/depth)
  // by resolveDrillTools before nesting. Optional so legacy callers still type-check.
  drill_id?: string | null; auto_tool?: boolean | null
  // Plunges per hole from the resolved bit (2 = "drill twice" for hard board).
  passes?: number | null
  // Set by the resolver when a hole can't be drilled and is pocket-routed instead.
  pocket?: { toolNumber: number; toolDiameter: number } | null
}

export interface PartRef {
  source_table: string
  cabinet_instance_id: string
  source_part_key: string
  w: number; h: number          // natural FINISHED footprint (pre-rotation)
  // Edgeband deduction (set only when the machine profile nests at cut size).
  // Ops are stored relative to the FINISHED part corner; on the deducted blank
  // the origin edge moved inward by that edge's tape, so holes shift by:
  //   pos_x − eb_w1 (or − eb_w2 for pre-mirrored down-face bores, whose origin
  //   is the finished far edge), pos_y − eb_h1.
  deduct?: boolean
  eb_w1?: number; eb_w2?: number; eb_h1?: number
}

// Faces on the + side of a footprint axis (see partFootprint FACE_FOR_AXIS).
const POS_FACES = new Set(['right', 'top', 'front'])

export function drillKey(table: string, cabinetId: string | null, partKey: string | null): string {
  return `${table}|${cabinetId ?? ''}|${partKey ?? ''}`
}

export function groupDrillOps(ops: DrillOpRaw[]): Map<string, DrillOpRaw[]> {
  const m = new Map<string, DrillOpRaw[]>()
  for (const o of ops) {
    const k = drillKey(o.source_table, o.source_cabinet_id, o.source_part_key)
    const arr = m.get(k) ?? []; arr.push(o); m.set(k, arr)
  }
  return m
}

// Expand a drill op's repeat pattern into individual part-local holes.
// repeat_axis defaults to x when a multi-hole pattern has no axis set.
function expand(op: DrillOpRaw): { ox: number; oy: number; d: number; depth: number | null; passes: number; pocket?: { toolNumber: number; toolDiameter: number } | null }[] {
  const n = Math.max(1, op.repeat_count ?? 1)
  const s = op.repeat_spacing ?? 0
  const ax = op.repeat_axis === 'y' ? 'y' : 'x'
  const bx = op.pos_x ?? 0, by = op.pos_y ?? 0
  const d = op.diameter ?? 6
  const passes = Math.max(1, Math.round(op.passes ?? 1))
  const out: { ox: number; oy: number; d: number; depth: number | null; passes: number; pocket?: { toolNumber: number; toolDiameter: number } | null }[] = []
  for (let i = 0; i < n; i++) out.push({ ox: bx + (ax === 'x' ? i * s : 0), oy: by + (ax === 'y' ? i * s : 0), d, depth: op.depth, passes, pocket: op.pocket ?? null })
  return out
}

// Part-local (origin bottom-left of natural w×h) → sheet coords.
// rotated = part turned 90° CCW; the placed footprint is natH × natW, so
// pl.w == natH and a local (ox,oy) maps to (pl.w - oy, ox).
export function toSheet(ox: number, oy: number, pl: { x: number; y: number; w: number; rotated: boolean }) {
  return pl.rotated ? { x: pl.x + (pl.w - oy), y: pl.y + ox } : { x: pl.x + ox, y: pl.y + oy }
}

// Edgeband-deducted blank: how far part-local ops shift onto the deducted blank.
// pos_y always references the v-min edge; pos_x references u-min, EXCEPT pre-mirrored
// down-face bores (projectToFrame flipped them to measure from u-max). A bore is
// mirrored when its entry face's sign differs from the frame's upSign ('+' for
// face_zones = doors nest cup-side up, '-' for everything else). Shared by drills
// and routes so both land identically on the blank.
export function ebShift(part: PartRef, outputFace: string | null | undefined): { sx: number; sy: number } {
  if (!part.deduct) return { sx: 0, sy: 0 }
  const upPos = part.source_table === 'face_zones'
  const mirrored = outputFace != null && POS_FACES.has(outputFace) !== upPos
  return { sx: (mirrored ? part.eb_w2 : part.eb_w1) ?? 0, sy: part.eb_h1 ?? 0 }
}

export function buildSheetDrills(
  sheet: NestedSheet,
  partByUid: Map<string, PartRef>,
  opsByKey: Map<string, DrillOpRaw[]>,
  defaultDepth: number,
): SheetDrill[] {
  const drills: SheetDrill[] = []
  for (const pl of sheet.placements) {
    const part = partByUid.get(pl.baseUid)
    if (!part) continue
    const ops = opsByKey.get(drillKey(part.source_table, part.cabinet_instance_id, part.source_part_key))
    if (!ops?.length) continue
    for (const op of ops) {
      // Edgeband-deducted blank: shift holes by the tape on the edge that became
      // the blank origin (shared with routes via ebShift).
      const { sx, sy } = ebShift(part, op.output_face)
      for (const hole of expand(op)) {
        const p = toSheet(hole.ox - sx, hole.oy - sy, pl)
        drills.push({ x: p.x, y: p.y, diameter: hole.d, depth: hole.depth ?? defaultDepth, passes: hole.passes, pocket: hole.pocket ?? undefined })
      }
    }
  }
  return drills
}
