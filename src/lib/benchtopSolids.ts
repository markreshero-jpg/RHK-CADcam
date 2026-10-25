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

import { Shape, ExtrudeGeometry, Matrix4, Vector2, Vector3, type BufferGeometry } from 'three'
import type { BenchtopInstance, BenchtopEdgeProfile } from './types'
import { btSegments, outwardNormal, effectiveProfileId, waterfallJoin } from './benchtopGeometry'
import { loftSlab, undersideOutline, apronStrip } from './benchtopSlab3d'

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
    return [{ i, s, n: outwardNormal(segs, i), join: waterfallJoin(s) }]
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
  for (const w of waterfalls) {
    const len = Math.hypot(w.s.p1.x - w.s.p0.x, w.s.p1.y - w.s.p0.y)
    const under = topZ - T
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

  for (const a of aprons) {
    const k0 = start[a.i], k1 = a.i + 1 < start.length ? start[a.i + 1] : topPts.length
    const idx = [...Array.from({ length: k1 - k0 }, (_, k) => k0 + k), k1 % topPts.length]
    out.push({ key: `a${a.i}`, geo: apronStrip(idx.map(k => topPts[k]), idx.map(k => botPts[k]), topZ, topZ - T, topZ - a.drop) })
  }
  return out
}
