// Centralised snap engine shared by every plan-view tool (wall draw, benchtop
// draw, measure, vertex drag). Pure functions only — no React, no DB.
//
// To add a new snap target: add a SnapKind, give it metadata + a default, and
// gather its candidate points inside computeSnap(). Everything else (toolbar,
// persistence, indicator glyph) is driven off SNAP_KINDS automatically.

import type { Pt } from './geometry'
import { dist, wallEnd, wallDir, snapAngle, centroid, wallInwardNormal, cabWallPerp, wallMitreCorners } from './geometry'
import type { Wall, CabinetInstance, BenchtopInstance } from './types'

export type SnapKind = 'cabinet-corner' | 'wall-end' | 'benchtop-vertex'

// Order here drives the toolbar list order.
export const SNAP_KINDS: SnapKind[] = ['cabinet-corner', 'wall-end', 'benchtop-vertex']

export const SNAP_KIND_META: Record<SnapKind, { label: string; color: string }> = {
  'cabinet-corner':  { label: 'Cabinet corners',  color: '#34d399' },
  'wall-end':        { label: 'Wall ends',        color: '#60a5fa' },
  'benchtop-vertex': { label: 'Benchtop corners', color: '#5eead4' },
}

export interface SnapSettings {
  enabled: boolean
  kinds: Record<SnapKind, boolean>
}

export const DEFAULT_SNAP_SETTINGS: SnapSettings = {
  enabled: true,
  kinds: { 'cabinet-corner': true, 'wall-end': true, 'benchtop-vertex': true },
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
  const perp = cabWallPerp(cab, wall, wallInwardNormal(wall, cx.x, cx.y))
  const bl = { x: cab.pos_x, y: cab.pos_y }
  const br = { x: bl.x + cab.dx * wd.x, y: bl.y + cab.dx * wd.y }
  const fl = { x: bl.x + cab.dz * perp.x, y: bl.y + cab.dz * perp.y }
  const fr = { x: fl.x + cab.dx * wd.x, y: fl.y + cab.dx * wd.y }
  return [bl, br, fl, fr]
}

// Find the nearest enabled snap point within `radius` (world mm) of `wp`.
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
          for (const c of wallMitreCorners(w, ctx.walls, cx.x, cx.y)) consider(c, 'wall-end')
        }
      }
    }
    if (settings.kinds['benchtop-vertex']) {
      for (const b of ctx.benchtops) for (const v of b.polygon) consider(v, 'benchtop-vertex')
    }
    if (settings.kinds['cabinet-corner']) {
      for (const cab of ctx.cabinets) {
        if (!CORNER_CLASSES.has(cab.assembly_class)) continue
        const w = ctx.walls.find(x => x.id === cab.wall_id)
        if (!w) continue
        for (const c of cabinetCorners(cab, w, cx)) consider(c, 'cabinet-corner')
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
