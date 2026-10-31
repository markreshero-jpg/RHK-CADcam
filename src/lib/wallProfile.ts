// ── Raked / vaulted wall tops ─────────────────────────────────────────────────
// A wall's top can follow a profile instead of one flat height: points along the
// wall (t from the wall start, mm) with the height at each (h, mm from the
// floor), straight lines between them. `walls.top_profile`; null = flat at
// wall.height. wall.height is kept at the profile's highest point so everything
// that frames the elevation on wall.height still fits it.

import type { Wall } from './types'

export interface WallTopPoint { t: number; h: number }

/** The profile clipped to the wall and run out to both ends (flat past the first / last point), or null. */
export function wallTopPoints(wall: Pick<Wall, 'length' | 'top_profile'>): WallTopPoint[] | null {
  const raw = (wall.top_profile ?? []).filter(p => Number.isFinite(p.t) && Number.isFinite(p.h))
  if (raw.length < 2) return null
  const pts = [...raw].sort((a, b) => a.t - b.t)
  const L = wall.length
  return [{ t: 0, h: topAt(pts, 0) }, ...pts.filter(p => p.t > 0 && p.t < L), { t: L, h: topAt(pts, L) }]
}

function topAt(pts: WallTopPoint[], t: number): number {
  if (t <= pts[0].t) return pts[0].h
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    if (t <= b.t) return b.t === a.t ? b.h : a.h + (b.h - a.h) * (t - a.t) / (b.t - a.t)
  }
  return pts[pts.length - 1].h
}

/** Height of the wall top at t along the wall. */
export function wallTopAt(wall: Pick<Wall, 'length' | 'top_profile' | 'height'>, t: number, fallback: number): number {
  const pts = wallTopPoints(wall)
  return pts ? topAt(pts, t) : (wall.height ?? fallback)
}

/** "0:2614, 5225:3900" ↔ points. Bad pairs are dropped. */
export function parseWallProfile(s: string): WallTopPoint[] | null {
  const pts = s.split(/[,;]/).map(p => p.trim()).filter(Boolean).map(p => {
    const [t, h] = p.split(/[:=@x]/).map(v => Number(v.trim()))
    return { t, h }
  }).filter(p => Number.isFinite(p.t) && Number.isFinite(p.h) && p.h > 0)
  return pts.length >= 2 ? pts.sort((a, b) => a.t - b.t) : null
}

export function formatWallProfile(pts: WallTopPoint[] | null | undefined): string {
  return (pts ?? []).map(p => `${+p.t.toFixed(1)}:${+p.h.toFixed(1)}`).join(', ')
}
