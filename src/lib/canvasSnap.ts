// Centralised snap engine shared by every plan-view tool (wall draw, benchtop
// draw, measure, vertex drag). Pure functions only — no React, no DB.
//
// To add a new snap target: add a SnapKind, give it metadata + a default, and
// gather its candidate points inside computeSnap(). Everything else (toolbar,
// persistence, indicator glyph) is driven off SNAP_KINDS automatically.

import type { Pt } from './geometry'
import { dist, wallEnd, wallDir, snapAngle, centroid, wallInwardNormal, cabWallPerp, wallMitreCorners, cabinetToPlan, cabinetCornerPts } from './geometry'
import type { Wall, CabinetInstance, BenchtopInstance } from './types'
import type { ResolvedCabinet } from './resolver/types'
import { casePlanCorners, rotEulerXYZ } from './jointDrilling'
import { customExtents } from './customPartBox'

export type SnapKind = 'cabinet-corner' | 'cabinet-edge' | 'wall-end' | 'benchtop-vertex'

// Order here drives the toolbar list order.
export const SNAP_KINDS: SnapKind[] = ['cabinet-corner', 'cabinet-edge', 'wall-end', 'benchtop-vertex']

export const SNAP_KIND_META: Record<SnapKind, { label: string; color: string }> = {
  'cabinet-corner':  { label: 'Cabinet corners',  color: '#34d399' },
  'cabinet-edge':    { label: 'Cabinet edges',    color: '#a3e635' },
  'wall-end':        { label: 'Wall ends',        color: '#60a5fa' },
  'benchtop-vertex': { label: 'Benchtop corners', color: '#5eead4' },
}

export interface SnapSettings {
  enabled: boolean
  kinds: Record<SnapKind, boolean>
}

export const DEFAULT_SNAP_SETTINGS: SnapSettings = {
  enabled: true,
  kinds: { 'cabinet-corner': true, 'cabinet-edge': true, 'wall-end': true, 'benchtop-vertex': true },
}

// Tolerates partial/legacy stored values (e.g. a kind added after the user last
// saved prefs) by layering over the defaults.
export function normaliseSnapSettings(s: Partial<SnapSettings> | undefined | null): SnapSettings {
  return {
    enabled: s?.enabled ?? DEFAULT_SNAP_SETTINGS.enabled,
    kinds: { ...DEFAULT_SNAP_SETTINGS.kinds, ...(s?.kinds ?? {}) },
  }
}

export interface SnapContext {
  walls: Wall[]
  cabinets: CabinetInstance[]
  benchtops: BenchtopInstance[]
  /** Resolved parts by cabinet id: snap to what each cabinet really draws (end
   *  panels, fronts, shaped parts), not just its carcase box. */
  resolved?: Map<string, ResolvedCabinet>
}

export interface SnapResult {
  pt: Pt
  kind: SnapKind | null  // null = no target snapped (point is raw / angle-constrained only)
}

export interface SnapModifiers { ortho?: boolean; ortho45?: boolean }

// Every cabinet class has a rectangular plan footprint, including overheads
// (wall / wall_corner), which overlap the bases below them.
const CORNER_CLASSES = new Set<string>(['base', 'wall', 'tall', 'base_corner', 'wall_corner', 'tall_corner'])

// The 4 footprint corners (back-left, back-right, front-left, front-right) in
// world space. pos_x/pos_y is the back-left corner; dx runs along the wall, dz
// is the depth along the inward perpendicular.
export function cabinetCorners(cab: CabinetInstance, wall: Wall, cx: Pt): Pt[] {
  const wd = wallDir(wall)
  const perp = cabWallPerp(cab, wall, wallInwardNormal(wall, cx))
  const bl = { x: cab.pos_x, y: cab.pos_y }
  const br = { x: bl.x + cab.dx * wd.x, y: bl.y + cab.dx * wd.y }
  const fl = { x: bl.x + cab.dz * perp.x, y: bl.y + cab.dz * perp.y }
  const fr = { x: fl.x + cab.dx * wd.x, y: fl.y + cab.dx * wd.y }
  return [bl, br, fl, fr]
}

// A cabinet's plan outlines in world space: its carcase footprint, then (when
// resolved) every case part, room-visible added part (end panels, fillers) and
// front, as closed polygons. Corners are point snaps; edges are edge snaps.
export function cabinetSnapOutlines(cab: CabinetInstance, wall: Wall, cx: Pt, rp?: ResolvedCabinet): Pt[][] {
  const perp = cabWallPerp(cab, wall, wallInwardNormal(wall, cx))
  const toPlan = cabinetToPlan(cab, wall, perp)
  const out: Pt[][] = [cabinetCornerPts(cab, wall, perp)]
  if (!rp) return out
  const rect = (x: number, z: number, w: number, d: number) =>
    [toPlan(x, z), toPlan(x + w, z), toPlan(x + w, z + d), toPlan(x, z + d)]
  for (const p of rp.case_parts) out.push(casePlanCorners(p).map(q => toPlan(q.x, q.z)))
  for (const p of rp.custom_parts ?? []) {
    if (!p.show_in_room) continue
    const { ex, ez } = customExtents(p.orientation, Number(p.dx), Number(p.dy), Number(p.dz))
    if (ex > 0 && ez > 0) out.push(rect(Number(p.x), Number(p.z), ex, ez))
  }
  for (const z of rp.face_zones) {
    if (!(z.DX > 0 && z.DZ > 0)) continue
    if (!z.AY) { out.push(rect(z.X, z.Z, z.DX, z.DZ)); continue }
    // Facet fronts (shaped cabinets) turn about their min corner.
    out.push(([[0, 0], [z.DX, 0], [z.DX, z.DZ], [0, z.DZ]] as const).map(([x, d]) => {
      const [rx, , rz] = rotEulerXYZ(0, z.AY, 0, x, 0, d)
      return toPlan(z.X + rx, z.Z + rz)
    }))
  }
  return out
}

// Nearest point to p on segment a–b.
function closestOnSeg(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0
  return { x: a.x + t * dx, y: a.y + t * dy }
}

// Find the nearest enabled snap point within `radius` (world mm) of `wp`.
// Point snaps (corners, wall ends) win; an edge snap (nearest point on a
// cabinet outline) only applies when no point is in range.
// If `prevPt` is given and an ortho modifier is held, the result is constrained
// to a fixed angle from prevPt — this overrides a point snap (matching CAD
// behaviour), and the kind is cleared since we're no longer on the target.
export function computeSnap(
  wp: Pt,
  ctx: SnapContext,
  settings: SnapSettings,
  radius: number,
  prevPt?: Pt | null,
  mods?: SnapModifiers,
): SnapResult {
  let best = wp
  let bestDist = radius
  let bestKind: SnapKind | null = null

  if (settings.enabled) {
    const consider = (p: Pt, kind: SnapKind) => {
      const d = dist(p, wp)
      if (d < bestDist) { bestDist = d; best = p; bestKind = kind }
    }
    const cx = centroid(ctx.walls)

    if (settings.kinds['wall-end']) {
      for (const w of ctx.walls) {
        if (w.wall_type === 'island') {
          // No thickness/footprint — just the two centreline endpoints.
          consider({ x: w.pos_x, y: w.pos_y }, 'wall-end')
          consider(wallEnd(w), 'wall-end')
        } else {
          // All 4 drawn footprint corners (inside + mitred outside).
          for (const c of wallMitreCorners(w, ctx.walls, cx)) consider(c, 'wall-end')
        }
      }
    }
    if (settings.kinds['benchtop-vertex']) {
      for (const b of ctx.benchtops) for (const v of b.polygon) consider(v, 'benchtop-vertex')
    }
    if (settings.kinds['cabinet-corner'] || settings.kinds['cabinet-edge']) {
      const outlines: Pt[][] = []
      for (const cab of ctx.cabinets) {
        if (!CORNER_CLASSES.has(cab.assembly_class)) continue
        const w = ctx.walls.find(x => x.id === cab.wall_id)
        if (!w) continue
        outlines.push(...cabinetSnapOutlines(cab, w, cx, ctx.resolved?.get(cab.id)))
      }
      if (settings.kinds['cabinet-corner']) for (const o of outlines) for (const c of o) consider(c, 'cabinet-corner')
      if (settings.kinds['cabinet-edge'] && !bestKind) {
        for (const o of outlines) for (let i = 0; i < o.length; i++) consider(closestOnSeg(wp, o[i], o[(i + 1) % o.length]), 'cabinet-edge')
      }
    }
  }

  if (prevPt && (mods?.ortho || mods?.ortho45)) {
    const constrained = snapAngle(prevPt, best, mods.ortho ? 90 : 45)
    if (constrained.x !== best.x || constrained.y !== best.y) bestKind = null
    best = constrained
  }

  return { pt: best, kind: bestKind }
}
