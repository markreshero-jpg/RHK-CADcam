// Hardware on a turned front zone (z_cabinet_shape Phase 3b) is resolved in the
// zone's square frame; these map it into cabinet coords (see HardwareTurn).
// Dependency-free so drill flatteners and renderers can use it.

import type { HardwareTurn } from './types'

const D = Math.PI / 180
type Axis = 'x-' | 'x+' | 'y-' | 'y+' | 'z-' | 'z+'
type Vec = { x: number; y: number; z: number }

/** Zone-frame point → cabinet coords. */
export function turnPoint(t: HardwareTurn | undefined, x: number, y: number, z: number): [number, number, number] {
  if (!t) return [x, y, z]
  const c = Math.cos(t.AY * D), s = Math.sin(t.AY * D)
  const dx = x - t.X, dz = z - t.Z
  return [t.X + c * dx + s * dz, y, t.Z - s * dx + c * dz]
}

/** Zone-frame direction → cabinet direction. */
export function turnDir(t: HardwareTurn | undefined, x: number, y: number, z: number): [number, number, number] {
  if (!t) return [x, y, z]
  const c = Math.cos(t.AY * D), s = Math.sin(t.AY * D)
  return [c * x + s * z, y, -s * x + c * z]
}

const AXIS_VEC: Record<Axis, Vec> = {
  'x-': { x: -1, y: 0, z: 0 }, 'x+': { x: 1, y: 0, z: 0 },
  'y-': { x: 0, y: -1, z: 0 }, 'y+': { x: 0, y: 1, z: 0 },
  'z-': { x: 0, y: 0, z: -1 }, 'z+': { x: 0, y: 0, z: 1 },
}

export function nearestAxis(v: Vec): Axis {
  const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z)
  if (ax >= ay && ax >= az) return v.x < 0 ? 'x-' : 'x+'
  if (ay >= az) return v.y < 0 ? 'y-' : 'y+'
  return v.z < 0 ? 'z-' : 'z+'
}

/** A drill in a zone frame → cabinet coords; off-axis bores keep an exact `dir`. */
export function turnDrill<T extends Vec & { axis: Axis; dir?: Vec }>(t: HardwareTurn | undefined, d: T): T {
  if (!t) return d
  const [x, y, z] = turnPoint(t, d.x, d.y, d.z)
  const v = d.dir ?? AXIS_VEC[d.axis]
  const [dx, dy, dz] = turnDir(t, v.x, v.y, v.z)
  const dir = { x: dx, y: dy, z: dz }
  return { ...d, x, y, z, axis: nearestAxis(dir), dir }
}
