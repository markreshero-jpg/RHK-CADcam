// Parametric drawer runners (z_runner_models) — a port of the shop's
// build_runner.py, driven by the resolved rail instead of a CLI. Pure geometry
// in cabinet-space mm, so one family draws every length × height without a
// GLB per size.
//
// Runner-local frame (the script's): x = in from the gable toward the drawer,
// y = up from the drawer-box bottom line, z = 0 at the back of the runner →
// NL at the front. Built for the LEFT rail; the right rail mirrors x.

import type { ResolvedDrawerSlide, RunnerFamily } from './resolver/types'

export type RunnerPartKind = 'side' | 'runner' | 'bracket'

export interface RunnerBox {
  kind:   RunnerPartKind
  moving: boolean                   // drawer side (slides out) vs cabinet member (stays)
  x: number; y: number; z: number   // min corner (cabinet coords)
  w: number; h: number; d: number
}

interface LocalBox { kind: RunnerPartKind; moving: boolean; x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }

// DTC Dragon Pro — build_runner.py ProductSpec. The skin / wall / ledge /
// block / web / foot pieces are exactly the shop's existing GLB cross-section
// (the _v2 GLBs: inside wall 4 longer, 25 up, ledge + runner moved down 4 with
// it, 2026-10-29 Mark); the mount flange + web and the front bracket are the
// script's "assumed" parts.
function dragonPro(L: number, H: number): LocalBox[] {
  const g = 10                       // runner_end_gap
  const out: LocalBox[] = [
    { kind: 'side',   moving: true,  x0: 9,    x1: 10,   y0: 0,    y1: 24,   z0: 0, z1: L },     // skin
    { kind: 'side',   moving: true,  x0: 9,    x1: 22,   y0: 24,   y1: H,    z0: 0, z1: L },     // wall
    { kind: 'side',   moving: true,  x0: 22,   x1: 41,   y0: 24,   y1: 25,   z0: 0, z1: L },     // ledge
    { kind: 'runner', moving: false, x0: 26.5, x1: 37.5, y0: 16.5, y1: 24,   z0: g, z1: L - g }, // block
    { kind: 'runner', moving: false, x0: 34.5, x1: 37.5, y0: 7.5,  y1: 16.5, z0: g, z1: L - g }, // web
    { kind: 'runner', moving: false, x0: 34.5, x1: 54.5, y0: 6.5,  y1: 7.5,  z0: g, z1: L - g }, // foot
    { kind: 'runner', moving: false, x0: 0,    x1: 2,    y0: 6.5,  y1: 24,   z0: g, z1: L - g }, // mount flange (assumed)
    { kind: 'runner', moving: false, x0: 2,    x1: 26.5, y0: 16.5, y1: 18,   z0: g, z1: L - g }, // mount web (assumed)
  ]
  const bh = Math.min(60, H - 40)
  if (bh > 0) out.push({ kind: 'bracket', moving: true, x0: 10, x1: 22, y0: 25, y1: 25 + bh, z0: L - 20, z1: L })  // front bracket (assumed)
  return out
}

const FAMILIES: Record<RunnerFamily, (L: number, H: number) => LocalBox[]> = {
  dragon_pro: dragonPro,
}

/**
 * The family's boxes as a triangle soup in the slide-model frame the 2D
 * silhouettes use (slideSilhouette.ts: origin = front-top-outer corner, +x
 * toward the drawer, +y up, +z into the cabinet), so a rail drawn parametrically
 * gets its true outline in plan / elevation / side views like a GLB rail.
 */
export function runnerModelTriangles(family: RunnerFamily, L: number, H: number): Float32Array {
  const fam = FAMILIES[family]
  if (!fam || !(L > 40) || !(H > 40)) return new Float32Array()
  const out: number[] = []
  for (const b of fam(L, H)) {
    const x = [b.x0, b.x1], y = [b.y0 - H, b.y1 - H], z = [b.z0 - L, b.z1 - L]
    const c = (i: number, j: number, k: number) => [x[i], y[j], z[k]]
    // 6 faces × 2 triangles (winding doesn't matter — the silhouette normalises it).
    const quads = [
      [c(0, 0, 0), c(1, 0, 0), c(1, 1, 0), c(0, 1, 0)], [c(0, 0, 1), c(1, 0, 1), c(1, 1, 1), c(0, 1, 1)],
      [c(0, 0, 0), c(1, 0, 0), c(1, 0, 1), c(0, 0, 1)], [c(0, 1, 0), c(1, 1, 0), c(1, 1, 1), c(0, 1, 1)],
      [c(0, 0, 0), c(0, 1, 0), c(0, 1, 1), c(0, 0, 1)], [c(1, 0, 0), c(1, 1, 0), c(1, 1, 1), c(1, 0, 1)],
    ]
    for (const [p, q, r, s] of quads) out.push(...p, ...q, ...r, ...p, ...r, ...s)
  }
  return new Float32Array(out)
}

// The rail's parts in cabinet space. Rail geometry (resolveDrawerStack): left
// rail's X = the member face; right rail's member face = X + DZ; Y = drawer-box
// bottom line; Z = back of the runner, front = Z + DX (DX = nominal length).
export function runnerShape(rail: ResolvedDrawerSlide): RunnerBox[] {
  const fam = rail.drawn_as ? FAMILIES[rail.drawn_as] : undefined
  const L = rail.nominal_length, H = rail.box_height
  if (!fam || !(L > 40) || !(H > 40)) return []
  const left = rail.side === 'left'
  const face = left ? rail.X : rail.X + rail.DZ
  return fam(L, H).map(b => ({
    kind: b.kind, moving: b.moving,
    x: left ? face + b.x0 : face - b.x1,
    y: rail.Y + b.y0,
    z: rail.Z + b.z0,
    w: b.x1 - b.x0, h: b.y1 - b.y0, d: b.z1 - b.z0,
  }))
}
