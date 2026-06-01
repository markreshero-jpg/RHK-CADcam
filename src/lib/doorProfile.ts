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
    }))
}

// ── Rendering primitives ────────────────────────────────────────────────────

export interface ProfileRect { x: number; y: number; w: number; h: number; depth: number | null }
export interface ProfileLine { x1: number; y1: number; x2: number; y2: number; depth: number | null }
export interface DoorProfilePrims {
  insetRects:  ProfileRect[]   // frame outlines (Shaker, bead, panel-raise)
  grooveLines: ProfileLine[]   // parallel grooves (VJ board, custom repeats)
}

const EPS = 0.001

export function doorProfilePrimitives(
  profile: ResolvedDoorProfile,
  panel: DoorPanelDims,
): DoorProfilePrims {
  const W = panel.w
  const H = panel.h
  const insetRects: ProfileRect[] = []
  const grooveLines: ProfileLine[] = []

  for (const op of profile.ops) {
    const off = op.offset_from_edge_mm ?? 0
    const repeats = op.repeat_axis === 'x' || op.repeat_axis === 'y'
    const isLines = profile.profile_type === 'vj_lines' || repeats

    if (isLines && op.spacing_mm && op.spacing_mm > 0) {
      const axis = op.repeat_axis === 'y' ? 'y' : 'x'
      if (axis === 'x') {
        for (let x = off + op.spacing_mm; x < W - off - EPS; x += op.spacing_mm) {
          grooveLines.push({ x1: x, y1: off, x2: x, y2: H - off, depth: op.depth_mm })
        }
      } else {
        for (let y = off + op.spacing_mm; y < H - off - EPS; y += op.spacing_mm) {
          grooveLines.push({ x1: off, y1: y, x2: W - off, y2: y, depth: op.depth_mm })
        }
      }
    } else {
      // perimeter_route / bead / panel_raise / non-repeating custom → inset frame
      if (W - 2 * off > EPS && H - 2 * off > EPS) {
        insetRects.push({ x: off, y: off, w: W - 2 * off, h: H - 2 * off, depth: op.depth_mm })
      }
    }
  }

  return { insetRects, grooveLines }
}
