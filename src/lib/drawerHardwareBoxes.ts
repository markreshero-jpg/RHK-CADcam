// Cabinet-space boxes for drawer hardware — shared by the cabinet 3D view, the
// room 3D view and the plan view so every view places boxes + runners identically.
// Cabinet origin = bottom-left-back corner (+X right, +Y up, +Z front).
// { x,y,z = min corner, w/h/d = X/Y/Z extents }.

import type { ResolvedDrawerBoxPart, ResolvedDrawerSlide, ResolvedDrawerStack, ResolvedCabinet, HardwareTurn } from '@/src/lib/resolver/types'
import { turnPoint, turnDrill } from '@/src/lib/resolver/hardwareTurn'

export type HwBox = { x: number; y: number; z: number; w: number; h: number; d: number }

export function dbBox(p: ResolvedDrawerBoxPart): HwBox {
  // Resolver Z is the front face; subtract depth extent to get the minimum-Z (back) corner.
  switch (p.part_type) {
    case 'db_left_side':
    case 'db_right_side':
      return { x: p.X, y: p.Y, z: p.Z - p.DX, w: p.DZ, h: p.DY, d: p.DX }
    case 'db_bottom':
      return { x: p.X, y: p.Y, z: p.Z - p.DX, w: p.DY, h: p.DZ, d: p.DX }
    case 'db_front':
    case 'db_back':
    default:
      return { x: p.X, y: p.Y, z: p.Z - p.DZ, w: p.DY, h: p.DX, d: p.DZ }
  }
}

export function slideBox(s: ResolvedDrawerSlide): HwBox {
  // DX=depth (Z direction), DY=channel height (Y direction), DZ=runner thickness (X direction)
  return { x: s.X, y: s.Y, z: s.Z, w: s.DZ, h: s.DY, d: s.DX }
}

// ── Front (elevation) views of turned facet hardware ─────────────────────────
// z_cabinet_shape Phase 3b: hardware on a turned facet is resolved in the zone's
// square frame. 2D front views draw in cabinet X / Y, so they get a view copy:
// each box / runner widened to the X extent of its turned footprint, drills
// turned into cabinet coords. View-only — never persist or cut-list it.

function turnedXSpan(b: HwBox, t: HardwareTurn): [number, number] {
  const xs = [[b.x, b.z], [b.x + b.w, b.z], [b.x + b.w, b.z + b.d], [b.x, b.z + b.d]]
    .map(([x, z]) => turnPoint(t, x, 0, z)[0])
  return [Math.min(...xs), Math.max(...xs)]
}

function frontViewStack(s: ResolvedDrawerStack): ResolvedDrawerStack {
  const t = s.turn
  if (!t) return s
  return {
    ...s,
    box_parts: s.box_parts.map(p => {
      const [x0, x1] = turnedXSpan(dbBox(p), t)
      // Elevation width is DY for front/back/bottom, DZ for the sides.
      return p.part_type === 'db_left_side' || p.part_type === 'db_right_side'
        ? { ...p, X: x0, DZ: x1 - x0 }
        : { ...p, X: x0, DY: x1 - x0 }
    }),
    slides: s.slides.map(sl => {
      const [x0, x1] = turnedXSpan(slideBox(sl), t)
      return { ...sl, X: x0, DZ: x1 - x0, drills: sl.drills.map(d => turnDrill(t, d)) }
    }),
    turn: undefined,
  }
}

/** A resolved cabinet with turned facet hardware flattened for 2D front views. */
export function frontViewHardware(rp: ResolvedCabinet): ResolvedCabinet {
  if (!(rp.drawer_stacks ?? []).some(s => s.turn) && !(rp.hinge_instances ?? []).some(h => h.turn)) return rp
  return {
    ...rp,
    drawer_stacks: rp.drawer_stacks.map(frontViewStack),
    hinge_instances: rp.hinge_instances.map(h => h.turn ? {
      ...h,
      cup_drills: h.cup_drills.map(d => turnDrill(h.turn, d)),
      plate_drills: h.plate_drills.map(d => turnDrill(h.turn, d)),
      turn: undefined,
    } : h),
  }
}

export function frontViewHardwareMap(m: Map<string, ResolvedCabinet> | undefined): Map<string, ResolvedCabinet> | undefined {
  if (!m) return m
  let changed = false
  const out = new Map<string, ResolvedCabinet>()
  for (const [k, v] of m) { const f = frontViewHardware(v); if (f !== v) changed = true; out.set(k, f) }
  return changed ? out : m
}
