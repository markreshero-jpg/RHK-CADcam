// ============================================================
// Handle display geometry (z_handles H2) — shared by elevation (canvas +
// print + cabinet editor), plan and 3D so every view draws the same handle.
// All values are cabinet-space mm. Front zones only: facet / turned zones of
// shaped cabinets are skipped (as their hinges are).
// ============================================================

import type { ResolvedFaceZone, ResolvedHandle } from './resolver/types'

export const HANDLE_BAR_THICK = 12     // bar width seen face-on
export const KNOB_DEFAULT_DIA = 30
const DEFAULT_PROJECTION      = 30

export interface HandleShape {
  handle: ResolvedHandle
  kind:   'bar' | 'knob'
  cx: number; cy: number                 // centre on the face (cabinet X / Y)
  w:  number; h:  number                 // face-on extent (X / Y)
  frontZ:     number                     // front face of the door (cabinet Z)
  backZ:      number                     // back face (holes drill from here)
  projection: number                     // how far it stands off the face
  holes: { x: number; y: number; r: number }[]   // cabinet X / Y
}

export function handleShape(z: ResolvedFaceZone): HandleShape | null {
  const h = z.handle
  if (!h || h.x == null || h.y == null || z.facet || z.AY) return null
  const bc = h.bore_centres ?? 0
  const kind: HandleShape['kind'] = bc > 0 || (h.length ?? 0) > KNOB_DEFAULT_DIA * 1.5 ? 'bar' : 'knob'
  const len = h.length ?? (bc > 0 ? bc + 20 : KNOB_DEFAULT_DIA)
  const horiz = h.orientation === 'horizontal'
  const w = kind === 'knob' ? len : horiz ? len : HANDLE_BAR_THICK
  const ht = kind === 'knob' ? len : horiz ? HANDLE_BAR_THICK : len
  return {
    handle: h, kind,
    cx: z.X + h.x, cy: z.Y + h.y, w, h: ht,
    frontZ: z.Z + z.DZ,
    backZ: z.Z,
    projection: h.projection ?? DEFAULT_PROJECTION,
    // Handles saved by H1 carry no holes / hole_dia until the cabinet re-resolves.
    holes: (h.holes ?? []).map(p => ({ x: z.X + p.x, y: z.Y + p.y, r: (h.hole_dia ?? 5) / 2 })),
  }
}

/** Sharknose side profile for PartShape `extrude: 'across'`: x = depth from the
 *  back face (0..DZ), y = up from the bottom (0..DY). The back of the grip edge
 *  is cut away, leaving `land` at the front. */
export function sharknoseProfile(z: ResolvedFaceZone): { x: number; y: number }[] | null {
  const bv = z.handle?.bevel
  if (!bv || z.facet || z.AY || z.bevel_l || z.bevel_r) return null
  const d = z.DZ, h = z.DY, run = Math.min(bv.run, h)
  return z.handle!.grip_edge === 'top'
    ? [{ x: 0, y: 0 }, { x: d, y: 0 }, { x: d, y: h }, { x: d - bv.land, y: h }, { x: 0, y: h - run }]
    : [{ x: 0, y: run }, { x: d - bv.land, y: 0 }, { x: d, y: 0 }, { x: d, y: h }, { x: 0, y: h }]
}

/** Elevation band over the sharknose bevel (cabinet X / Y): from the grip edge
 *  (`edgeY`) to the hidden line where the bevel meets the back face (`y`). */
export function sharknoseLine(z: ResolvedFaceZone): { x1: number; x2: number; y: number; edgeY: number; angle: number } | null {
  const bv = z.handle?.bevel
  if (!bv || z.facet || z.AY) return null
  const run = Math.min(bv.run, z.DY)
  const top = z.handle!.grip_edge === 'top'
  return { x1: z.X, x2: z.X + z.DX, y: top ? z.Y + z.DY - run : z.Y + run, edgeY: top ? z.Y + z.DY : z.Y, angle: bv.angle_deg }
}

export function handleShapes(zones: ResolvedFaceZone[]): HandleShape[] {
  const out: HandleShape[] = []
  for (const z of zones) { const s = handleShape(z); if (s) out.push(s) }
  return out
}
