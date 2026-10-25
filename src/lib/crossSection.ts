// Cross section (z_section_view): slice room solids with a vertical plane across
// an elevation wall and return the cut shapes in the section frame.
//
// World coords are the room 3D view's: [plan x, height, plan y] (mm).
// The cut plane is { p : along(p) = at }, along = (p − o)·d in plan.
// Section frame: u = depth (p − o)·n in plan, v = height.
//
// A solid is a list of planar faces, each face a list of loops (outer + holes).
// Each face meets the plane in segments (crossings sorted along the face ∩ plane
// line, paired up); the segments of one solid are chained into closed loops,
// drawn with an even-odd fill so holes come out. Sign rule is half-open
// (s ≥ 0 vs s < 0): a vertex on the plane counts once, and a part whose face
// lies on the plane is cut on exactly one side of it.

import type { BufferGeometry } from 'three'
import type { Pt } from './geometry'
import type { Prism, V3 } from './partSolids'

export type P2 = { x: number; y: number }
export interface CutPlane { o: Pt; d: Pt; n: Pt; at: number }
/** One planar face: loops[0] = outer, the rest holes (all coplanar). */
export type Face = V3[][]

const sd = (pl: CutPlane, v: V3) => (v[0] - pl.o.x) * pl.d.x + (v[2] - pl.o.y) * pl.d.y - pl.at
const to2 = (pl: CutPlane, v: V3): P2 => ({ x: (v[0] - pl.o.x) * pl.n.x + (v[2] - pl.o.y) * pl.n.y, y: v[1] })

/** Newell normal of a loop. */
function normal(loop: V3[]): V3 {
  let x = 0, y = 0, z = 0
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length]
    x += (a[1] - b[1]) * (a[2] + b[2])
    y += (a[2] - b[2]) * (a[0] + b[0])
    z += (a[0] - b[0]) * (a[1] + b[1])
  }
  return [x, y, z]
}

// Lexicographic order so a shared edge interpolates to the identical point from
// both of its faces (chaining matches endpoints exactly).
const before = (a: V3, b: V3) => a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2]

/** A face's segments on the plane, in the section frame. */
export function sliceFace(face: Face, pl: CutPlane): [P2, P2][] {
  const pts: P2[] = []
  for (const loop of face) {
    for (let i = 0; i < loop.length; i++) {
      let a = loop[i], b = loop[(i + 1) % loop.length]
      if ((sd(pl, a) >= 0) === (sd(pl, b) >= 0)) continue
      if (before(b, a)) [a, b] = [b, a]
      const sa = sd(pl, a), sb = sd(pl, b), t = sa / (sa - sb)
      pts.push(to2(pl, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]))
    }
  }
  if (pts.length < 2) return []
  if (pts.length > 2) {
    // Sort along the face ∩ plane line: L = faceNormal × planeNormal, in (u, v).
    const fn = normal(face[0]), pn: V3 = [pl.d.x, 0, pl.d.y]
    const L: V3 = [fn[1] * pn[2] - fn[2] * pn[1], fn[2] * pn[0] - fn[0] * pn[2], fn[0] * pn[1] - fn[1] * pn[0]]
    const lu = L[0] * pl.n.x + L[2] * pl.n.y, lv = L[1]
    pts.sort((p, q) => (p.x * lu + p.y * lv) - (q.x * lu + q.y * lv))
  }
  const out: [P2, P2][] = []
  for (let i = 0; i + 1 < pts.length; i += 2) out.push([pts[i], pts[i + 1]])
  return out
}

const key = (p: P2) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`

/** Chain segments into loops (open chains are returned too, unclosed). */
export function chainLoops(segs: [P2, P2][]): P2[][] {
  const at = new Map<string, number[]>()
  segs.forEach(([a, b], i) => {
    if (key(a) === key(b)) return
    for (const k of [key(a), key(b)]) { const l = at.get(k); if (l) l.push(i); else at.set(k, [i]) }
  })
  const used = new Set<number>()
  const loops: P2[][] = []
  for (let i = 0; i < segs.length; i++) {
    if (used.has(i) || key(segs[i][0]) === key(segs[i][1])) continue
    used.add(i)
    const loop = [segs[i][0], segs[i][1]]
    const startK = key(segs[i][0])
    let endK = key(segs[i][1])
    while (endK !== startK) {
      const next = (at.get(endK) ?? []).find(j => !used.has(j))
      if (next == null) break
      used.add(next)
      const [a, b] = segs[next]
      const p = key(a) === endK ? b : a
      loop.push(p); endK = key(p)
    }
    if (endK === startK) loop.pop()
    if (loop.length >= 3) loops.push(loop)
  }
  return loops
}

/** A solid's cut loops (empty when the plane misses it). */
export function sliceFaces(faces: Face[], pl: CutPlane): P2[][] {
  return chainLoops(faces.flatMap(f => sliceFace(f, pl)))
}

/** A prism's faces: both caps (with holes) + one quad per edge. */
export function prismFaces(pr: Prism): Face[] {
  const e = pr.ext
  const shift = (l: V3[]) => l.map(v => [v[0] + e[0], v[1] + e[1], v[2] + e[2]] as V3)
  const loops = [pr.outer, ...pr.holes]
  const faces: Face[] = [loops, loops.map(shift)]
  for (const l of loops) for (let i = 0; i < l.length; i++) {
    const a = l[i], b = l[(i + 1) % l.length]
    faces.push([[a, b, [b[0] + e[0], b[1] + e[1], b[2] + e[2]], [a[0] + e[0], a[1] + e[1], a[2] + e[2]]]])
  }
  return faces
}

/** A mesh's triangles as faces (world coords already). */
export function geometryFaces(g: BufferGeometry): Face[] {
  const pos = g.getAttribute('position')
  if (!pos) return []
  const v = (i: number): V3 => [pos.getX(i), pos.getY(i), pos.getZ(i)]
  const idx = g.getIndex()
  const n = idx ? idx.count : pos.count
  const faces: Face[] = []
  for (let i = 0; i + 2 < n; i += 3) {
    const [a, b, c] = idx ? [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)] : [i, i + 1, i + 2]
    faces.push([[v(a), v(b), v(c)]])
  }
  return faces
}

/** Along-plane extent of a face set — quick reject before slicing. */
export function alongRange(faces: Face[], o: Pt, d: Pt): [number, number] {
  let lo = Infinity, hi = -Infinity
  for (const f of faces) for (const l of f) for (const v of l) {
    const s = (v[0] - o.x) * d.x + (v[2] - o.y) * d.y
    if (s < lo) lo = s
    if (s > hi) hi = s
  }
  return [lo, hi]
}

/** Cabinet coords → room world, as Room3DScene CabinetMesh places the cabinet
 *  (group at origin, turned by rotY about the vertical). */
export function cabToWorld(origin: { x: number; y: number; z: number }, rotY: number) {
  const c = Math.cos(rotY), s = Math.sin(rotY)
  return (v: V3): V3 => [origin.x + v[0] * c + v[2] * s, origin.y + v[1], origin.z - v[0] * s + v[2] * c]
}

/** SVG path for loops (even-odd fill); x mirrored when `flip`. */
export function loopsPath(loops: P2[][], flip: boolean): string {
  return loops.map(l => 'M' + l.map(p => `${(flip ? -p.x : p.x).toFixed(1)},${(-p.y).toFixed(1)}`).join('L') + 'Z').join('')
}
