// Benchtop solids in room world coords — the slab, waterfall legs and mitred
// aprons the 3D view draws (Room3DScene BenchtopMesh) and the cross section
// slices (z_section_view). Plan (x, y) maps to world (x, height, y).
//
// Waterfall edges (profile generates = 'waterfall') get a leg panel from the
// floor to the underside, set in by the thickness under that edge; mitred apron
// edges (generates = 'apron') a strip down to apron_drop_mm below the top surface.
// Mitre: the slab's underside is set back by T on that edge, so its end IS the
// 45° bevel (one solid — loftSlab), and the leg is a full-height prism with the
// matching 45° top: one diagonal joint. Butt: the top runs over a leg that stops
// at the underside.
//
// Built-up waterfall (waterfallBuildUp — an end meeting a mitred apron deeper
// than the top): that end gets a face piece the apron's drop wide (vertical 45°
// to the leg, front-plane 45° to the apron — the apron's corner wedge comes
// from apronCornerTris) and a WATERFALL_RETURN_MM return behind it.

import { Shape, ExtrudeGeometry, Matrix4, Vector2, Vector3, type BufferGeometry } from 'three'
import type { BenchtopInstance, BenchtopEdgeProfile } from './types'
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'
import { btSegments, outwardNormal, effectiveProfileId, waterfallJoin, waterfallBuildUp, WATERFALL_RETURN_MM } from './benchtopGeometry'
import { loftSlab, undersideOutline, apronStrip, apronCornerTris } from './benchtopSlab3d'

export interface BtSolidInfo { topZ: number; thick: { total: number }; defaultProfileId: string | null }

/** Every solid of one benchtop (caller disposes the geometries). */
export function benchtopGeometries(bt: BenchtopInstance, info: BtSolidInfo, profiles: Record<string, BenchtopEdgeProfile>): { key: string; geo: BufferGeometry }[] {
  const { topZ, thick, defaultProfileId } = info
  const T = thick.total
  const segs = btSegments(bt)

  const waterfalls = segs.flatMap((s, i) => {
    if (s.type !== 'line' || s.edge?.wall || topZ - T <= 0) return []
    const pid = effectiveProfileId(s, defaultProfileId)
    if (!pid || profiles[pid]?.generates !== 'waterfall') return []
    return [{ i, s, n: outwardNormal(segs, i), join: waterfallJoin(s), bu: waterfallBuildUp(segs, i, profiles, defaultProfileId, T) }]
  })

  const aprons = segs.flatMap((s, i) => {
    if (s.edge?.wall) return []
    const pid = effectiveProfileId(s, defaultProfileId)
    const prof = pid ? profiles[pid] : undefined
    const drop = Number(prof?.apron_drop_mm) || 0
    return prof?.generates === 'apron' && drop > T && topZ - drop > 0 ? [{ i, drop }] : []
  })

  // Underside outline: mitred waterfall + apron edges set back by T (neighbours' ends follow).
  const set = new Set([...waterfalls.filter(w => w.join === 'mitre').map(w => w.i), ...aprons.map(a => a.i)])
  const outline = undersideOutline(segs, i => (set.has(i) ? T : 0), 24)
  const { top: topPts, bottom: botPts, start } = outline
  if (topPts.length < 3 || botPts.length !== topPts.length) return []
  const out: { key: string; geo: BufferGeometry }[] = [
    { key: 'slab', geo: loftSlab(topPts, botPts, (bt.cutout_polygons ?? []).filter(c => c.length >= 3), topZ, topZ - T) },
  ]

  // Leg prisms: a profile in (u = inward from the outer face, v = up), extruded
  // along the edge, placed by a basis matrix (u → −n, v → up, z → edge).
  const under = topZ - T
  const hull = (pts: number[][]) => {
    const g = new ConvexGeometry(pts.map(([x, v, y]) => new Vector3(x, v, y)))
    g.computeVertexNormals()
    return g
  }
  for (const w of waterfalls) {
    const len = Math.hypot(w.s.p1.x - w.s.p0.x, w.s.p1.y - w.s.p0.y)
    if (w.bu.start || w.bu.end) {
      // Built-up leg: convex pieces in (a = along from p0, u = inward, v = up).
      const d = { x: (w.s.p1.x - w.s.p0.x) / len, y: (w.s.p1.y - w.s.p0.y) / len }
      const at = (a: number, u: number, v: number) => [w.s.p0.x + d.x * a - w.n.x * u, v, w.s.p0.y + d.y * a - w.n.y * u]
      const topAt = (u: number) => (w.join === 'mitre' ? topZ - u : under)
      const foot: [number, number][] = [
        ...(w.bu.start ? [[0, 0], [T, T]] : [[0, 0], [0, T]]) as [number, number][],
        ...(w.bu.end ? [[len - T, T], [len, 0]] : [[len, T], [len, 0]]) as [number, number][],
      ]
      out.push({ key: `l${w.i}`, geo: hull(foot.flatMap(([a, u]) => [at(a, u, 0), at(a, u, topAt(u))])) })
      for (const [D, a0, sg, k] of [[w.bu.start, 0, 1, 's'], [w.bu.end, len, -1, 'e']] as [number, number, number, string][]) {
        if (!D) continue
        const A = (a: number) => a0 + sg * a
        // Face: a ∈ [0, T], u ∈ [a, D], up to the front-plane 45° (v = topZ − u).
        const face: [number, number][] = [[0, 0], [0, D], [T, D], [T, T]]
        out.push({ key: `l${w.i}f${k}`, geo: hull(face.flatMap(([a, u]) => [at(A(a), u, 0), at(A(a), u, topZ - u)])) })
        // Return: behind the face's inner edge, to the underside.
        const R = Math.min(WATERFALL_RETURN_MM, Math.max(0, len - 2 * T))
        if (R > 0) {
          const ret: [number, number][] = [[T, D - T], [T, D], [T + R, D], [T + R, D - T]]
          out.push({ key: `l${w.i}r${k}`, geo: hull(ret.flatMap(([a, u]) => [at(A(a), u, 0), at(A(a), u, under)])) })
        }
      }
      continue
    }
    const prof: [number, number][] = w.join === 'mitre'
      ? [[0, 0], [T, 0], [T, under], [0, topZ]]
      : [[0, 0], [T, 0], [T, under], [0, under]]
    const g = new ExtrudeGeometry(new Shape(prof.map(([u, v]) => new Vector2(u, v))), { depth: len, bevelEnabled: false })
    // u × up must point along +z; pick the end so the basis is right-handed.
    const zv = { x: w.n.y, y: -w.n.x }
    const d = { x: (w.s.p1.x - w.s.p0.x) / len, y: (w.s.p1.y - w.s.p0.y) / len }
    const o = zv.x * d.x + zv.y * d.y > 0 ? w.s.p0 : w.s.p1
    const m = new Matrix4().makeBasis(new Vector3(-w.n.x, 0, -w.n.y), new Vector3(0, 1, 0), new Vector3(zv.x, 0, zv.y))
    m.setPosition(o.x, 0, o.y)
    g.applyMatrix4(m)
    g.computeVertexNormals()
    out.push({ key: `l${w.i}`, geo: g })
  }

  const n = segs.length
  const builtAt = (j: number, side: 'start' | 'end') => waterfalls.find(w => w.i === (j + n) % n)?.bu[side] ?? 0
  for (const a of aprons) {
    const k0 = start[a.i], k1 = a.i + 1 < start.length ? start[a.i + 1] : topPts.length
    const idx = [...Array.from({ length: k1 - k0 }, (_, k) => k0 + k), k1 % topPts.length]
    const outer = idx.map(k => topPts[k]), inner = idx.map(k => botPts[k])
    // Built-up waterfall at either end (only straight aprons qualify): the strip
    // starts D along, an apronCornerTris wedge fills the corner over the face piece.
    const extra: number[] = []
    const trim = (D: number, e: 0 | 1) => {
      if (!D) return true
      const m = outer.length - 1, c = e ? outer[m] : outer[0], o = e ? outer[0] : outer[m]
      const L = Math.hypot(o.x - c.x, o.y - c.y) || 1
      const along = { x: (o.x - c.x) / L, y: (o.y - c.y) / L }
      const nn = outwardNormal(segs, a.i), inward = { x: -nn.x, y: -nn.y }
      extra.push(...apronCornerTris(c, along, inward, D, T, topZ))
      const p = { x: c.x + along.x * D, y: c.y + along.y * D }
      outer[e ? m : 0] = p
      inner[e ? m : 0] = { x: p.x + inward.x * T, y: p.y + inward.y * T }
      return false
    }
    const capStart = trim(builtAt(a.i - 1, 'end'), 0), capEnd = trim(builtAt(a.i + 1, 'start'), 1)
    out.push({ key: `a${a.i}`, geo: apronStrip(outer, inner, topZ, under, topZ - a.drop, { capStart, capEnd, extra }) })
  }
  return out
}
