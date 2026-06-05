// Snap engine for the elevation view. Parallel to canvasSnap.ts (plan view) but
// operates in elevation coords: { x: position along wall (mm), y: distance from
// top of the wall area (mm) }. Snap targets are the rectangle corners of each
// cabinet on the active wall and the four corners of the wall face itself.

import type { Pt } from './geometry'
import { dist, snapAngle, cabT } from './geometry'
import type { Wall, Room, CabinetInstance } from './types'

export type ElevSnapKind = 'cabinet-corner' | 'part-corner' | 'wall-corner'

// Order here drives the toolbar list order.
export const ELEV_SNAP_KINDS: ElevSnapKind[] = ['cabinet-corner', 'part-corner', 'wall-corner']

export const ELEV_SNAP_KIND_META: Record<ElevSnapKind, { label: string; color: string }> = {
  'cabinet-corner': { label: 'Cabinet corners', color: '#34d399' },
  'part-corner':    { label: 'Part corners',    color: '#fbbf24' },
  'wall-corner':    { label: 'Wall corners',    color: '#60a5fa' },
}

export interface ElevSnapSettings {
  enabled: boolean
  kinds: Record<ElevSnapKind, boolean>
}

export const DEFAULT_ELEV_SNAP_SETTINGS: ElevSnapSettings = {
  enabled: true,
  kinds: { 'cabinet-corner': true, 'part-corner': true, 'wall-corner': true },
}

// Tolerates partial/legacy stored values.
export function normaliseElevSnapSettings(s: Partial<ElevSnapSettings> | undefined | null): ElevSnapSettings {
  return {
    enabled: s?.enabled ?? DEFAULT_ELEV_SNAP_SETTINGS.enabled,
    kinds: { ...DEFAULT_ELEV_SNAP_SETTINGS.kinds, ...(s?.kinds ?? {}) },
  }
}

export interface ElevSnapResult {
  pt: Pt
  kind: ElevSnapKind | null
}

export interface ElevSnapModifiers { ortho?: boolean; ortho45?: boolean }

// wall.soffit_height stored as depth-from-top; convert to height-from-floor when present.
function wallCabTopFor(wall: Wall, room: Room): number {
  if (wall.soffit_height != null) {
    const wallH = wall.height ?? room.room_dy ?? 2400
    return wallH - wall.soffit_height
  }
  return room.soffit_height ?? room.wall_cabinet_top ?? 2100
}

function cabBottomZ(cab: CabinetInstance, room: Room, wall: Wall): number {
  if (cab.assembly_class === 'wall' || cab.assembly_class === 'wall_corner') {
    return wallCabTopFor(wall, room) - cab.dy
  }
  return 0
}

// 4 cabinet corners in elevation coords (top-left, top-right, bottom-left, bottom-right).
export function cabinetElevCorners(cab: CabinetInstance, wall: Wall, room: Room, roomH: number): Pt[] {
  const t = cabT(cab, wall)
  const bottomZ = cabBottomZ(cab, room, wall)
  const ry = roomH - bottomZ - cab.dy   // top of cab in elev-y (from top of wall area)
  const ryB = ry + cab.dy                // bottom of cab
  return [
    { x: t,          y: ry  },
    { x: t + cab.dx, y: ry  },
    { x: t,          y: ryB },
    { x: t + cab.dx, y: ryB },
  ]
}

export interface ElevSnapContext {
  wallCabs: CabinetInstance[]   // already filtered to the active wall + side
  wall:     Wall
  room:     Room
  roomH:    number
  // Resolved part / runner / face corners in elevation coords, precomputed by the
  // view (it owns the rect helpers + per-cabinet transform). Optional so non-measure
  // callers needn't build them.
  partPoints?: Pt[]
}

// Find the nearest enabled snap point within `radius` (world mm) of `wp`.
// If `prevPt` is given and an ortho modifier is held, the result is constrained
// to a fixed angle from prevPt — overrides a point snap (matching CAD behaviour).
export function computeElevSnap(
  wp: Pt,
  ctx: ElevSnapContext,
  settings: ElevSnapSettings,
  radius: number,
  prevPt?: Pt | null,
  mods?: ElevSnapModifiers,
): ElevSnapResult {
  let best = wp
  let bestDist = radius
  let bestKind: ElevSnapKind | null = null

  if (settings.enabled) {
    const consider = (p: Pt, kind: ElevSnapKind) => {
      const d = dist(p, wp)
      if (d < bestDist) { bestDist = d; best = p; bestKind = kind }
    }

    if (settings.kinds['wall-corner']) {
      // 4 corners of the wall face rectangle.
      consider({ x: 0,                  y: 0           }, 'wall-corner')
      consider({ x: ctx.wall.length,    y: 0           }, 'wall-corner')
      consider({ x: 0,                  y: ctx.roomH   }, 'wall-corner')
      consider({ x: ctx.wall.length,    y: ctx.roomH   }, 'wall-corner')
    }
    if (settings.kinds['cabinet-corner']) {
      for (const cab of ctx.wallCabs) {
        for (const c of cabinetElevCorners(cab, ctx.wall, ctx.room, ctx.roomH)) {
          consider(c, 'cabinet-corner')
        }
      }
    }
    if (settings.kinds['part-corner'] && ctx.partPoints) {
      for (const p of ctx.partPoints) consider(p, 'part-corner')
    }
  }

  if (prevPt && (mods?.ortho || mods?.ortho45)) {
    const constrained = snapAngle(prevPt, best, mods.ortho ? 90 : 45)
    if (constrained.x !== best.x || constrained.y !== best.y) bestKind = null
    best = constrained
  }

  return { pt: best, kind: bestKind }
}
