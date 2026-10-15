// Kick dimensions (display layer item `dim_kicks`, plan + elevation).
// Measures the resolved toe-kick of every cabinet that owns one — standalone kicks
// on ordinary base / tall cabinets and joined-run kick assemblies (members of a run
// resolve no kick, so nothing is counted twice). Pure geometry, no rendering.
//
// Cabinet-local frame: origin bottom-left-back, +X along the cabinet, +Y up,
// +Z toward the front. The kick face's front plane is its depth from the cabinet
// back (= the wall face the cabinet sits on).

import type { CabinetInstance, Wall } from './types'
import type { ResolvedCabinet } from './resolver/types'
import { tkBoxAABB } from './jointDrilling'
import { cabinetToPlan, cabWallPerp, cabWallSide, wallDir, wallInwardNormal, type RoomRef } from './geometry'

/** A cabinet's kick in its own local frame. */
export interface KickLocal {
  x0: number; x1: number   // along the cabinet
  depth: number            // cabinet back → kick face front
  top: number              // cabinet bottom → top of the kick board
}

export function kickLocal(rp: ResolvedCabinet | undefined): KickLocal | null {
  const parts = rp?.toekick_parts ?? []
  if (!parts.length) return null
  // The visible board sets depth + height; the full kick sets the length.
  const faces = parts.filter(p => p.part_key === 'kick_front_face')
  const boxes = parts.map(tkBoxAABB)
  const faceBoxes = (faces.length ? faces : parts).map(tkBoxAABB)
  return {
    x0:    Math.min(...boxes.map(b => b.x)),
    x1:    Math.max(...boxes.map(b => b.x + b.w)),
    depth: Math.max(...faceBoxes.map(b => b.z + b.d)),
    top:   Math.max(...faceBoxes.map(b => b.y + b.h)),
  }
}

/** A kick along a wall, in wall t (mm from the wall start). */
export interface KickSpan {
  t0: number; t1: number
  depth: number
  side: 'face' | 'back'
}

export function kickPlanSpans(
  cabs: CabinetInstance[],
  wall: Wall,
  resolved: Map<string, ResolvedCabinet> | undefined,
  rc: RoomRef,
): KickSpan[] {
  const wd = wallDir(wall)
  const inward = wallInwardNormal(wall, rc)
  const out: KickSpan[] = []
  for (const cab of cabs) {
    if (cab.wall_id !== wall.id) continue
    const k = kickLocal(resolved?.get(cab.id))
    if (!k) continue
    const toPlan = cabinetToPlan(cab, wall, cabWallPerp(cab, wall, inward))
    const t = (lx: number) => {
      const p = toPlan(lx, 0)
      return (p.x - wall.pos_x) * wd.x + (p.y - wall.pos_y) * wd.y
    }
    const a = t(k.x0), b = t(k.x1)
    out.push({ t0: Math.min(a, b), t1: Math.max(a, b), depth: k.depth, side: cabWallSide(cab, wall) })
  }
  return out.sort((a, b) => a.t0 - b.t0)
}

export type KickSeg = { from: number; to: number; label: number }

/** Kick boards + the gaps between them and to the wall ends. Overlapping kicks merge. */
export function kickChain(spans: KickSpan[], wallLength: number): KickSeg[] {
  const merged: { t0: number; t1: number }[] = []
  for (const s of [...spans].sort((a, b) => a.t0 - b.t0)) {
    const last = merged[merged.length - 1]
    if (last && s.t0 < last.t1 - 0.5) last.t1 = Math.max(last.t1, s.t1)
    else merged.push({ t0: s.t0, t1: s.t1 })
  }
  const segs: KickSeg[] = []
  let cursor = 0
  for (const m of merged) {
    if (m.t0 > cursor + 0.5) segs.push({ from: cursor, to: m.t0, label: Math.round(m.t0 - cursor) })
    segs.push({ from: m.t0, to: m.t1, label: Math.round(m.t1 - m.t0) })
    cursor = m.t1
  }
  if (merged.length && cursor < wallLength - 0.5) segs.push({ from: cursor, to: wallLength, label: Math.round(wallLength - cursor) })
  return segs
}

/** Elevation kick-height marks: one per kick, skipping a kick that butts the
 *  previous one at the same height (a run of equal kicks gets one dim). */
export function kickHeightMarks(kicks: { x0: number; x1: number; top: number }[]): { x: number; top: number }[] {
  const marks: { x: number; top: number }[] = []
  let prev: { x1: number; top: number } | null = null
  for (const k of [...kicks].sort((a, b) => a.x0 - b.x0)) {
    const continues = prev && Math.abs(k.x0 - prev.x1) < 1 && Math.abs(k.top - prev.top) < 0.5
    if (!continues) marks.push({ x: k.x0, top: k.top })
    prev = { x1: k.x1, top: k.top }
  }
  return marks
}
