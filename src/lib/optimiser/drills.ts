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
  diameter: number | null; depth: number | null
  repeat_count: number | null; repeat_spacing: number | null; repeat_axis: string | null
}

export interface PartRef {
  source_table: string
  cabinet_instance_id: string
  source_part_key: string
  w: number; h: number          // natural footprint (pre-rotation)
}

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
function expand(op: DrillOpRaw): { ox: number; oy: number; d: number; depth: number | null }[] {
  const n = Math.max(1, op.repeat_count ?? 1)
  const s = op.repeat_spacing ?? 0
  const ax = op.repeat_axis === 'y' ? 'y' : 'x'
  const bx = op.pos_x ?? 0, by = op.pos_y ?? 0
  const d = op.diameter ?? 6
  const out: { ox: number; oy: number; d: number; depth: number | null }[] = []
  for (let i = 0; i < n; i++) out.push({ ox: bx + (ax === 'x' ? i * s : 0), oy: by + (ax === 'y' ? i * s : 0), d, depth: op.depth })
  return out
}

// Part-local (origin bottom-left of natural w×h) → sheet coords.
// rotated = part turned 90° CCW; the placed footprint is natH × natW, so
// pl.w == natH and a local (ox,oy) maps to (pl.w - oy, ox).
function toSheet(ox: number, oy: number, pl: { x: number; y: number; w: number; rotated: boolean }) {
  return pl.rotated ? { x: pl.x + (pl.w - oy), y: pl.y + ox } : { x: pl.x + ox, y: pl.y + oy }
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
    for (const op of ops) for (const hole of expand(op)) {
      const p = toSheet(hole.ox, hole.oy, pl)
      drills.push({ x: p.x, y: p.y, diameter: hole.d, depth: hole.depth ?? defaultDepth })
    }
  }
  return drills
}
