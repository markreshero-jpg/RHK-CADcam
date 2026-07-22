// ============================================================
// Route / groove part_operations → sheet-space routing features.
//
// The drill sibling of drills.ts. Maps each non-drill op (route area
// or groove slot) back to its part's placement by the stable
// source_table|cabinet|part_key, derives its part-local geometry
// (the same vocabulary as the editor's opFaceGlyph — rect for area
// ops, slot for grooves), then transforms into sheet coords reusing
// drills.ts toSheet + ebShift so routes land on exactly the same
// blank as the holes. Pure/testable.
//
// Face/flip is intentionally NOT applied here: every route emits on
// the back / material-up pass for now (Phase B §3c). plane_kind is
// carried for the future front pass but not yet acted on.
// ============================================================

import type { NestedSheet } from './nest'
import type { SheetRoute } from './gcode'
import { drillKey, toSheet, ebShift, type PartRef } from './drills'

export interface RouteOpRaw {
  source_table: string
  source_cabinet_id: string | null
  source_part_key: string | null
  operation_type: string          // 'route' | 'groove'
  operation_action: string | null // route: 'pocket' clears the area; else outline
  output_face?: string | null     // entry face — picks the eb-deduct edge (like drills)
  plane_kind?: string | null       // carried for the future front pass; unused here
  // Geometry inputs (part-local, origin bottom-left; x → DX/u, y → DY/v).
  pos_x: number | null; pos_y: number | null
  size_dx: number | null; size_dy: number | null
  offset_top_mm: number | null; offset_bottom_mm: number | null
  offset_left_mm: number | null; offset_right_mm: number | null
  length: number | null; width: number | null
  depth: number | null; size_dz: number | null
  // Clearing strategy (area/pocket ops): raster | spiral_in | spiral_out, with a
  // lane angle and stepover (% of tool diameter). Null → raster default.
  fill_strategy: string | null; raster_angle_deg: number | null; raster_stepover_pct: number | null
  // Resolved router bit (filled by the loader from cnc_tools). A route with no
  // resolvable tool is dropped by the loader with a warning — never defaulted.
  toolNumber: number; toolDiameter: number; maxDepthPerPass: number | null
}

// Geometry + strategy of a route op WITHOUT its resolved tool — what a tool-set
// member expands to before the loader attaches the member's bit.
export type RouteGeom = Omit<RouteOpRaw, 'toolNumber' | 'toolDiameter' | 'maxDepthPerPass'>

// One step of a cnc_tool_set recipe (cnc_tool_set_operations row).
export interface ToolSetMember {
  operation_type: string   // legacy tool-set vocab: pocket|raster|outline|profile|square_off|groove|drill
  tool_id: string | null
  depth_mm: number | null; width_mm: number | null
  offset_top_mm: number | null; offset_bottom_mm: number | null
  offset_left_mm: number | null; offset_right_mm: number | null
  fill_strategy: string | null; raster_angle_deg: number | null; raster_stepover_pct: number | null
}

const CLEAR_MEMBER_TYPES = new Set(['pocket', 'raster'])

// Expand one tool-set member over a parent route op's placement. The parent supplies
// WHERE (position + area); the member supplies HOW (its verb, depth, strategy) and may
// inset the area via its own offsets (e.g. a finish pass leaving stock). Returns null
// for members that aren't routing features (drills are handled by the drill path).
export function expandToolSetMember(parent: RouteGeom, m: ToolSetMember): RouteGeom | null {
  if (m.operation_type === 'drill') return null
  const isGroove = m.operation_type === 'groove'
  const clear = CLEAR_MEMBER_TYPES.has(m.operation_type)
  const fill = m.fill_strategy ?? (m.operation_type === 'raster' ? 'raster' : parent.fill_strategy)

  // Inset the parent area by the member's offsets (each edge). Works whether the
  // parent is size-centred or offset-defined.
  const mL = m.offset_left_mm ?? 0, mR = m.offset_right_mm ?? 0, mT = m.offset_top_mm ?? 0, mB = m.offset_bottom_mm ?? 0
  let pos_x = parent.pos_x, pos_y = parent.pos_y
  let size_dx = parent.size_dx, size_dy = parent.size_dy
  let offset_left_mm = parent.offset_left_mm, offset_right_mm = parent.offset_right_mm
  let offset_top_mm = parent.offset_top_mm, offset_bottom_mm = parent.offset_bottom_mm
  if (size_dx != null && size_dy != null) {
    size_dx = size_dx - mL - mR; size_dy = size_dy - mT - mB
    pos_x = (pos_x ?? 0) + (mL - mR) / 2; pos_y = (pos_y ?? 0) + (mB - mT) / 2
  } else if (offset_left_mm != null || offset_right_mm != null || offset_top_mm != null || offset_bottom_mm != null) {
    offset_left_mm = (offset_left_mm ?? 0) + mL; offset_right_mm = (offset_right_mm ?? 0) + mR
    offset_top_mm = (offset_top_mm ?? 0) + mT; offset_bottom_mm = (offset_bottom_mm ?? 0) + mB
  }

  return {
    ...parent,
    operation_type: isGroove ? 'groove' : 'route',
    operation_action: isGroove ? null : (clear ? 'pocket' : 'outline'),
    pos_x, pos_y, size_dx, size_dy,
    offset_left_mm, offset_right_mm, offset_top_mm, offset_bottom_mm,
    width: isGroove ? (m.width_mm ?? parent.width) : parent.width,
    depth: m.depth_mm ?? parent.depth ?? parent.size_dz,
    size_dz: null,
    fill_strategy: fill,
    raster_angle_deg: m.raster_angle_deg ?? parent.raster_angle_deg,
    raster_stepover_pct: m.raster_stepover_pct ?? parent.raster_stepover_pct,
  }
}

export function groupRouteOps(ops: RouteOpRaw[]): Map<string, RouteOpRaw[]> {
  const m = new Map<string, RouteOpRaw[]>()
  for (const o of ops) {
    const k = drillKey(o.source_table, o.source_cabinet_id, o.source_part_key)
    const arr = m.get(k) ?? []; arr.push(o); m.set(k, arr)
  }
  return m
}

const routeDepth = (op: RouteOpRaw) => op.depth ?? op.size_dz ?? 0

// Part-local rectangle (origin bottom-left) for an area op, mirroring opFaceGlyph:
// size_dx/size_dy centred on pos_x/pos_y, else an offset-from-edges box using the
// part's finished footprint (u = part.w, v = part.h). Returns null when neither is
// defined (a positionless / in-progress op).
function areaRect(op: RouteOpRaw, part: PartRef): { x: number; y: number; w: number; h: number } | null {
  const px = op.pos_x ?? 0, py = op.pos_y ?? 0
  if (op.size_dx != null && op.size_dy != null) {
    return { x: px - op.size_dx / 2, y: py - op.size_dy / 2, w: op.size_dx, h: op.size_dy }
  }
  if (op.offset_left_mm != null || op.offset_right_mm != null || op.offset_top_mm != null || op.offset_bottom_mm != null) {
    const l = op.offset_left_mm ?? 0, rt = op.offset_right_mm ?? 0, t = op.offset_top_mm ?? 0, b = op.offset_bottom_mm ?? 0
    return { x: l, y: b, w: Math.max(0, part.w - l - rt), h: Math.max(0, part.h - t - b) }
  }
  return null
}

export function buildSheetRoutes(
  sheet: NestedSheet,
  partByUid: Map<string, PartRef>,
  routesByKey: Map<string, RouteOpRaw[]>,
): SheetRoute[] {
  const out: SheetRoute[] = []
  for (const pl of sheet.placements) {
    const part = partByUid.get(pl.baseUid)
    if (!part) continue
    const ops = routesByKey.get(drillKey(part.source_table, part.cabinet_instance_id, part.source_part_key))
    if (!ops?.length) continue
    for (const op of ops) {
      const depth = routeDepth(op)
      if (!(depth > 0)) continue                    // no depth → nothing to cut (loader warns)
      const { sx, sy } = ebShift(part, op.output_face)
      const map = (ox: number, oy: number) => toSheet(ox - sx, oy - sy, pl)

      if (op.operation_type === 'groove') {
        const len = op.length ?? 0, w = Math.max(op.width ?? op.toolDiameter, 0.5)
        if (!(len > 0)) continue
        const px = op.pos_x ?? 0, py = op.pos_y ?? 0
        const a = map(px, py), b = map(px + len, py)
        out.push({
          kind: 'groove', label: pl.label, x1: a.x, y1: a.y, x2: b.x, y2: b.y,
          width: w, depth, toolNumber: op.toolNumber, toolDiameter: op.toolDiameter, maxDepthPerPass: op.maxDepthPerPass,
        })
        continue
      }

      // Area op (route). Rect corners → sheet; a 90° placement keeps it axis-aligned,
      // so the sheet-space bbox of the mapped corners is the placed rectangle.
      const r = areaRect(op, part)
      if (!r || !(r.w > 0) || !(r.h > 0)) continue
      const c0 = map(r.x, r.y), c1 = map(r.x + r.w, r.y + r.h)
      const x = Math.min(c0.x, c1.x), y = Math.min(c0.y, c1.y)
      out.push({
        kind: 'area', label: pl.label,
        x, y, w: Math.abs(c1.x - c0.x), h: Math.abs(c1.y - c0.y),
        depth, clear: op.operation_action === 'pocket',
        fillStrategy: op.fill_strategy ?? null,
        rasterAngleDeg: op.raster_angle_deg ?? 0,
        stepoverPct: op.raster_stepover_pct ?? 0,
        toolNumber: op.toolNumber, toolDiameter: op.toolDiameter, maxDepthPerPass: op.maxDepthPerPass,
      })
    }
  }
  return out
}
