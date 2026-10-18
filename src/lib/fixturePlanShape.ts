// ── True plan shape of a fixture model (z_fixtures P8) ────────────────────────
// What a fixture looks like from above, traced from its fitted 3D model:
//   1. every triangle (in item-box mm: +X width, +Y up, +Z front) is rasterised
//      onto a top-down grid keeping the highest surface per cell (a height map);
//   2. marching squares traces the outline (where the model is) plus a contour
//      wherever the surface drops between plateaus (sink bowls, drain holes,
//      raised burners);
//   3. lines are joined, simplified and stored normalised (u = x / width,
//      v = z / depth, 0 = back) so a stretched fixture stretches its shape.
// Pure — the loaders that turn a model file into triangles live in the editor.

import * as THREE from 'three'
import { rotatedBounds, fitOffset, modelEuler, type FitInput } from './fixtureFit'

/** Stored on fixture_catalog / room_fixtures.plan_shape. */
export interface PlanShape {
  v: 1
  /** Polylines in normalised item-box coords [u, v] (closed ones repeat their first point). */
  lines: [number, number][][]
}

/** Every triangle of `obj`, fitted into the item box exactly as FixtureModel draws it. Flat xyz triples. */
export function fittedTriangles(obj: THREE.Object3D, f: FitInput): number[] {
  const native = rotatedBounds(obj, f.model_rot_x, f.model_rot_y)
  const [ox, oy, oz] = fitOffset(native, f)
  const s = f.model_scale || 1
  const fit = new THREE.Matrix4().makeTranslation(ox, oy, oz)
    .multiply(new THREE.Matrix4().makeRotationFromEuler(modelEuler(f.model_rot_x, f.model_rot_y)))
    .multiply(new THREE.Matrix4().makeScale(s, s, s))
  const parent = obj.parent
  if (parent) parent.remove(obj)
  obj.updateMatrixWorld(true)
  const out: number[] = []
  const v = new THREE.Vector3()
  obj.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.geometry?.attributes?.position) return
    const mat = fit.clone().multiply(m.matrixWorld)
    const pos = m.geometry.attributes.position
    const idx = m.geometry.index
    const n = idx ? idx.count : pos.count
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(mat)
      out.push(v.x, v.y, v.z)
    }
  })
  if (parent) parent.add(obj)
  return out
}

/**
 * Plan shape from fitted triangles. `cell` = grid size in mm; `minDrop` = the
 * smallest height step (mm) that gets its own contour.
 */
export function planShapeFromTriangles(
  tris: ArrayLike<number>, width: number, depth: number, cell = 4, minDrop = 6,
): PlanShape {
  const nx = Math.max(2, Math.ceil(width / cell)), nz = Math.max(2, Math.ceil(depth / cell))
  const cw = width / nx, cd = depth / nz
  const H = new Float32Array(nx * nz).fill(-Infinity)

  // 1. Height map: rasterise each triangle at cell centres (barycentric), keep the max y.
  for (let t = 0; t + 8 < tris.length; t += 9) {
    const ax = tris[t], ay = tris[t + 1], az = tris[t + 2]
    const bx = tris[t + 3], by = tris[t + 4], bz = tris[t + 5]
    const cx = tris[t + 6], cy = tris[t + 7], cz = tris[t + 8]
    const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
    if (Math.abs(den) < 1e-6) continue   // vertical / degenerate in plan
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) / cw)), i1 = Math.min(nx - 1, Math.floor(Math.max(ax, bx, cx) / cw))
    const j0 = Math.max(0, Math.floor(Math.min(az, bz, cz) / cd)), j1 = Math.min(nz - 1, Math.floor(Math.max(az, bz, cz) / cd))
    for (let j = j0; j <= j1; j++) {
      const pz = (j + 0.5) * cd
      for (let i = i0; i <= i1; i++) {
        const px = (i + 0.5) * cw
        const l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / den
        const l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / den
        const l3 = 1 - l1 - l2
        if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue
        const y = l1 * ay + l2 * by + l3 * cy
        const k = j * nx + i
        if (y > H[k]) H[k] = y
      }
    }
  }

  // 2. Iso levels: the outline, plus midway between neighbouring plateaus.
  const hs: number[] = []
  for (const h of H) if (h > -Infinity) hs.push(h)
  if (!hs.length) return { v: 1, lines: [] }
  hs.sort((a, b) => a - b)
  const plateaus: { h: number; n: number }[] = []
  for (const h of hs) {
    const last = plateaus[plateaus.length - 1]
    if (last && h - last.h <= minDrop / 2) { last.h = h; last.n++ } else plateaus.push({ h, n: 1 })
  }
  const significant = plateaus.filter(p => p.n >= Math.max(4, hs.length * 0.005))
  const levels: number[] = []
  for (let i = 1; i < significant.length; i++) {
    if (significant[i].h - significant[i - 1].h >= minDrop) levels.push((significant[i].h + significant[i - 1].h) / 2)
  }

  const fields: ((k: number) => boolean)[] = [
    k => H[k] > -Infinity,
    ...levels.slice(-5).map(L => (k: number) => H[k] > L),
  ]
  const lines: [number, number][][] = []
  // A plateau's edge often runs along the outline (a sink rim's outer edge is both)
  // — keep only the stretches of each contour not already drawn.
  const seen = new Set<string>()
  const segKey = (p: [number, number], q: [number, number]) => {
    const a = `${p[0]},${p[1]}`, b = `${q[0]},${q[1]}`
    return a < b ? a + '|' + b : b + '|' + a
  }
  for (const inside of fields) {
    const traced = marchingSquares(inside, nx, nz)
    for (const pl of traced) {
      let run: [number, number][] = []
      const flush = () => {
        const pts = simplify(run.map(([gx, gz]) => [gx * cw, gz * cd] as [number, number]), cell * 0.6)
        if (pts.length >= 2 && pathLength(pts) >= cell * 4) {
          lines.push(pts.map(([x, z]) => [round4(x / width), round4(z / depth)]))
        }
        run = []
      }
      for (let i = 1; i < pl.length; i++) {
        if (seen.has(segKey(pl[i - 1], pl[i]))) { flush(); continue }
        if (!run.length) run.push(pl[i - 1])
        run.push(pl[i])
      }
      flush()
    }
    for (const pl of traced) for (let i = 1; i < pl.length; i++) seen.add(segKey(pl[i - 1], pl[i]))
  }
  return { v: 1, lines }
}

// Marching squares over cell-centred samples; returns polylines in grid units
// (x = 0 … nx at cell edges). Samples outside the grid count as outside, so
// shapes touching the box edge still close.
function marchingSquares(inside: (k: number) => boolean, nx: number, nz: number): [number, number][][] {
  const at = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < nz && inside(j * nx + i)
  const segs: [number, number, number, number][] = []
  for (let j = -1; j < nz; j++) {
    for (let i = -1; i < nx; i++) {
      // corners: a (i,j) b (i+1,j) c (i+1,j+1) d (i,j+1), at cell centres
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1)
      const code = (a ? 8 : 0) | (b ? 4 : 0) | (c ? 2 : 0) | (d ? 1 : 0)
      if (code === 0 || code === 15) continue
      const X = i + 0.5, Z = j + 0.5   // grid coords of corner a
      const top: [number, number] = [X + 0.5, Z], right: [number, number] = [X + 1, Z + 0.5]
      const bottom: [number, number] = [X + 0.5, Z + 1], left: [number, number] = [X, Z + 0.5]
      const s = (p: [number, number], q: [number, number]) => segs.push([p[0], p[1], q[0], q[1]])
      switch (code) {
        case 1: case 14: s(left, bottom); break
        case 2: case 13: s(bottom, right); break
        case 3: case 12: s(left, right); break
        case 4: case 11: s(top, right); break
        case 5: s(left, top); s(bottom, right); break
        case 6: case 9: s(top, bottom); break
        case 7: case 8: s(left, top); break
        case 10: s(left, bottom); s(top, right); break
      }
    }
  }
  // Join segments that share endpoints into polylines.
  const key = (x: number, z: number) => `${Math.round(x * 2)},${Math.round(z * 2)}`
  const ends = new Map<string, number[]>()
  segs.forEach((sg, n) => {
    for (const k of [key(sg[0], sg[1]), key(sg[2], sg[3])]) ends.set(k, [...(ends.get(k) ?? []), n])
  })
  const used = new Uint8Array(segs.length)
  const out: [number, number][][] = []
  for (let n = 0; n < segs.length; n++) {
    if (used[n]) continue
    used[n] = 1
    const line: [number, number][] = [[segs[n][0], segs[n][1]], [segs[n][2], segs[n][3]]]
    for (const dir of [1, -1]) {
      for (;;) {
        const p = dir === 1 ? line[line.length - 1] : line[0]
        const next = (ends.get(key(p[0], p[1])) ?? []).find(m => !used[m])
        if (next == null) break
        used[next] = 1
        const sg = segs[next]
        const q: [number, number] = key(sg[0], sg[1]) === key(p[0], p[1]) ? [sg[2], sg[3]] : [sg[0], sg[1]]
        if (dir === 1) line.push(q); else line.unshift(q)
      }
    }
    out.push(line)
  }
  return out
}

// Douglas–Peucker.
function simplify(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length < 3) return pts
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, az] = pts[a], [bx, bz] = pts[b]
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz)
    let best = -1, bestD = tol
    for (let i = a + 1; i < b; i++) {
      const d = L < 1e-9 ? Math.hypot(pts[i][0] - ax, pts[i][1] - az) : Math.abs(dx * (pts[i][1] - az) - dz * (pts[i][0] - ax)) / L
      if (d > bestD) { bestD = d; best = i }
    }
    if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]) }
  }
  return pts.filter((_, i) => keep[i])
}

function pathLength(pts: [number, number][]) {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return s
}
const round4 = (v: number) => Math.round(v * 10000) / 10000

/**
 * Front-view (elevation) shape from the same fitted triangles: looking at the
 * fixture's front, keep what's nearest (largest z) per cell, outline it and
 * contour wherever the face steps back (oven door / glass, dishwasher panel).
 * Stored like PlanShape with u = x / width, v = (height − y) / height (0 = top).
 */
export function elevShapeFromTriangles(
  tris: ArrayLike<number>, width: number, height: number, cell = 4, minDrop = 4,
): PlanShape {
  const m = new Float32Array(tris.length)
  for (let i = 0; i + 2 < tris.length; i += 3) {
    m[i] = tris[i]                     // across = x
    m[i + 1] = tris[i + 2]             // "height" = toward the viewer (z)
    m[i + 2] = height - tris[i + 1]    // down the page = from the top
  }
  return planShapeFromTriangles(m, width, height, cell, minDrop)
}

/** SVG path data for a plan shape in a fixture's local frame (x along width, y toward the front). */
export function planShapePath(shape: PlanShape, width: number, depth: number): string {
  return shape.lines.map(l => l.map(([u, v], i) => `${i ? 'L' : 'M'}${(u * width).toFixed(1)} ${(v * depth).toFixed(1)}`).join('')).join('')
}
