// ============================================================
// Door profile geometry — pure, shared by the resolver and every renderer.
//
// Two responsibilities:
//   1. evaluateProfileOps — turn raw door_profile_operations (fixed columns +
//      `expressions` formula overrides, joints pattern) into concrete numbers,
//      evaluated against the resolved door panel dimensions.
//   2. doorProfilePrimitives — turn a resolved profile into face-local geometry
//      (inset rectangles + groove lines) that 2D (SVG) and 3D (Three.js) views
//      lay out into their own coordinate spaces.
//
// Face-local coordinates: origin = bottom-left of the door front, +x → right,
// +y → up, all in millimetres. w = panel width, h = panel height.
//
// Formula variables (used in door_profile_operations.expressions):
//   W  = panel width (mm)      H  = panel height (mm)
//   T  = panel thickness (mm)  TD = tool diameter (mm)
// ============================================================

import type { RawProfileOp, ResolvedProfileOp, ResolvedDoorProfile } from './resolver/types'

export interface DoorPanelDims {
  w: number
  h: number
  thickness: number
  toolDiameter?: number
}

// Same tiny evaluator pattern as jointDrilling.evalExpr — kept local so this
// pure geometry module doesn't depend on the 3D/joints code.
function evalExpr(expr: string, vars: Record<string, number>): number | null {
  try {
    const fn = new Function(...Object.keys(vars), `'use strict'; return +(${expr})`)
    const result = fn(...Object.values(vars))
    return Number.isFinite(result) ? result : null
  } catch { return null }
}

// Evaluate a raw op's parametric fields. A field uses its fixed column value
// unless expressions[field] is present, in which case the formula wins (falling
// back to the fixed value if the formula fails to evaluate).
export function evaluateProfileOps(raw: RawProfileOp[], panel: DoorPanelDims): ResolvedProfileOp[] {
  const vars: Record<string, number> = {
    W: panel.w, H: panel.h, T: panel.thickness, TD: panel.toolDiameter ?? 0,
  }
  const ev = (op: RawProfileOp, field: keyof RawProfileOp, fixed: number | null): number | null => {
    const f = op.expressions?.[field as string]
    if (f == null) return fixed
    const r = evalExpr(f, vars)
    return r == null ? fixed : r
  }
  return [...raw]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(op => ({
      operation_type:      op.operation_type,
      depth_mm:            ev(op, 'depth_mm', op.depth_mm),
      width_mm:            ev(op, 'width_mm', op.width_mm),
      offset_from_edge_mm: ev(op, 'offset_from_edge_mm', op.offset_from_edge_mm),
      repeat_axis:         op.repeat_axis,
      spacing_mm:          ev(op, 'spacing_mm', op.spacing_mm),
      face:                op.face,
      router_tool_id:      op.router_tool_id ?? null,
      tool_set_id:         op.tool_set_id ?? null,
      offset_top_mm:       ev(op, 'offset_top_mm', op.offset_top_mm ?? null),
      offset_bottom_mm:    ev(op, 'offset_bottom_mm', op.offset_bottom_mm ?? null),
      offset_left_mm:      ev(op, 'offset_left_mm', op.offset_left_mm ?? null),
      offset_right_mm:     ev(op, 'offset_right_mm', op.offset_right_mm ?? null),
    }))
}

// ── Cuts — the ONE geometry every view and the CNC use ──────────────────────
// Face-local front view (origin bottom-left, x across, y up), before any
// machine mirroring. A line at `offset` from the edge is a groove centre.
//   groove — a straight slot of `width` (VJ lines, repeated grooves)
//   area   — a rectangle: `clear` = pocket / raster, everything inside is cut
//            (the edge sits at the offset); else a band `band` wide running
//            just inside the rectangle (route / outline / profile / square_off
//            / single groove), its centre on the offset line.
// Per-edge offsets override the common edge offset on that edge. Drills and
// ops without a depth cut nothing.

export interface DoorCutBase { opIndex: number; depth: number; face: 'front' | 'back'; router_tool_id: string | null; tool_set_id: string | null }
export type DoorCut =
  | (DoorCutBase & { kind: 'groove'; x1: number; y1: number; x2: number; y2: number; width: number | null; lineIndex: number })
  | (DoorCutBase & { kind: 'area'; x: number; y: number; w: number; h: number; clear: boolean; band: number })

const EPS = 0.001
const CLEAR_OPS = new Set(['pocket', 'raster'])
const DEFAULT_BAND = 8   // outline width when the op gives none (preview only — the CNC uses the real bit)

export function doorProfileCuts(profile: ResolvedDoorProfile, panel: DoorPanelDims): DoorCut[] {
  const W = panel.w, H = panel.h
  const cuts: DoorCut[] = []
  profile.ops.forEach((op, opIndex) => {
    if (op.operation_type === 'drill' || !(op.depth_mm && op.depth_mm > 0)) return
    const base: DoorCutBase = { opIndex, depth: op.depth_mm, face: op.face === 'back' ? 'back' : 'front', router_tool_id: op.router_tool_id ?? null, tool_set_id: op.tool_set_id ?? null }
    const off = op.offset_from_edge_mm ?? 0
    const sp = op.spacing_mm ?? 0
    const lines = profile.profile_type === 'vj_lines' || op.repeat_axis === 'x' || op.repeat_axis === 'y'
    if (lines && sp > 0) {
      let n = 0
      if (op.repeat_axis === 'y') {
        for (let y = off + sp; y < H - off - EPS; y += sp) cuts.push({ ...base, kind: 'groove', x1: off, y1: y, x2: W - off, y2: y, width: op.width_mm, lineIndex: n++ })
      } else {
        for (let x = off + sp; x < W - off - EPS; x += sp) cuts.push({ ...base, kind: 'groove', x1: x, y1: off, x2: x, y2: H - off, width: op.width_mm, lineIndex: n++ })
      }
      return
    }
    const clear = CLEAR_OPS.has(op.operation_type)
    const band = clear ? 0 : (op.width_mm ?? panel.toolDiameter ?? DEFAULT_BAND) || DEFAULT_BAND
    const half = band / 2
    const l = (op.offset_left_mm ?? off) - half, r = (op.offset_right_mm ?? off) - half
    const b = (op.offset_bottom_mm ?? off) - half, t = (op.offset_top_mm ?? off) - half
    const w = W - l - r, h = H - b - t
    if (w > EPS && h > EPS) cuts.push({ ...base, kind: 'area', x: l, y: b, w, h, clear, band })
  })
  return cuts
}

// ── Line primitives (thin-line views: elevation, cabinet edit, 3D overlay) ──
// Drawn from doorProfileCuts: an outline band → its centre line, a pocket →
// its edge, a groove → its centre line.

export interface ProfileRect { x: number; y: number; w: number; h: number; depth: number | null }
export interface ProfileLine { x1: number; y1: number; x2: number; y2: number; depth: number | null }
export interface DoorProfilePrims {
  insetRects:  ProfileRect[]   // frame outlines (Shaker, bead, panel-raise)
  grooveLines: ProfileLine[]   // parallel grooves (VJ board, custom repeats)
}

export function doorProfilePrimitives(
  profile: ResolvedDoorProfile,
  panel: DoorPanelDims,
): DoorProfilePrims {
  const insetRects: ProfileRect[] = []
  const grooveLines: ProfileLine[] = []
  for (const c of doorProfileCuts(profile, panel)) {
    if (c.kind === 'groove') grooveLines.push({ x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, depth: c.depth })
    else {
      const k = c.band / 2
      insetRects.push({ x: c.x + k, y: c.y + k, w: c.w - 2 * k, h: c.h - 2 * k, depth: c.depth })
    }
  }
  return { insetRects, grooveLines }
}
