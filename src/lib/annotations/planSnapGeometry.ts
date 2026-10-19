// Plan snap targets for the CAD tools (z_CAD_tool B2): walls, cabinets, door / drawer
// fronts, fixtures & appliances, benchtops and the plan annotations, all in room mm
// (the plan frame). Rebuilt when any of them change; cadSnap picks from it per move.

import type { Wall, CabinetInstance, BenchtopInstance, RoomFixture, RoomAnnotation } from '../types'
import type { ResolvedCabinet } from '../resolver/types'
import { centroid, wallMitreCorners, wallEnd, wallInwardNormal, cabWallPerp, cabinetToPlan } from '../geometry'
import { cabinetCorners } from '../canvasSnap'
import { fixtureCorners } from '../fixtureGeometry'
import { addOutline, type SnapGeometry } from './cadSnap'
import {
  type Pt, type TextGeom, type LineGeom, type BoxGeom, type DimGeom,
  type ArcGeom, type CircleGeom,
  boxCorners, dimLayout, layoutText, rotatePt, textCorners, sampleBulged, bulgeMid, bulgeArc, arcSample, circleSample, arcStart, arcEnd, arcMid, arcPoint,
} from './geometry'
import { resolveStyle } from './style'

export function planSnapGeometry({ walls, cabinets, resolved, fixtures, benchtops, annotations, paperToFrame }: {
  walls:        Wall[]
  cabinets:     CabinetInstance[]
  resolved?:    Map<string, ResolvedCabinet>
  fixtures:     RoomFixture[]
  benchtops:    BenchtopInstance[]
  annotations:  RoomAnnotation[]
  /** frame mm per paper mm (text block size). */
  paperToFrame: number
}): SnapGeometry {
  const g: SnapGeometry = { segs: [], points: [] }
  const cx = centroid(walls)
  const wallById = new Map(walls.map(w => [w.id, w]))

  for (const w of walls) {
    if (w.wall_type === 'island') addOutline(g, [{ x: w.pos_x, y: w.pos_y }, wallEnd(w)], 'walls', false)
    else addOutline(g, wallMitreCorners(w, walls, cx), 'walls', true)
  }

  for (const c of cabinets) {
    const wall = c.wall_id ? wallById.get(c.wall_id) : undefined
    if (!wall) continue
    const [bl, br, fl, fr] = cabinetCorners(c, wall, cx)
    addOutline(g, [bl, br, fr, fl], 'cabinets', true, undefined, true)
    // Door / drawer fronts at their true thickness and position (unturned zones).
    const zones = resolved?.get(c.id)?.face_zones ?? []
    if (!zones.length) continue
    const toPlan = cabinetToPlan(c, wall, cabWallPerp(c, wall, wallInwardNormal(wall, cx)))
    for (const z of zones) {
      if (z.AY || !(z.DX > 0) || !(z.DZ > 0)) continue
      addOutline(g, [toPlan(z.X, z.Z), toPlan(z.X + z.DX, z.Z), toPlan(z.X + z.DX, z.Z + z.DZ), toPlan(z.X, z.Z + z.DZ)], 'fronts', true)
    }
  }

  for (const f of fixtures) addOutline(g, fixtureCorners(f), 'fixtures', true, undefined, true)
  for (const b of benchtops) if (b.polygon?.length) addOutline(g, b.polygon, 'benchtops', true)

  for (const a of annotations) {
    const own = a.id
    switch (a.kind) {
      case 'line': {
        const lg = a.geom as LineGeom, pts = lg.pts ?? []
        if (!lg.bulges?.some(Boolean)) { addOutline(g, pts, 'annotations', !!lg.closed, own); break }
        // With fillet arcs: corners as ends, straight sides' middles, arc middles + centres,
        // and the sampled outline for nearest / intersection.
        const smp = sampleBulged(pts, lg.bulges, !!lg.closed)
        for (let i = 0; i < smp.length - (lg.closed ? 0 : 1); i++) g.segs.push({ a: smp[i], b: smp[(i + 1) % smp.length], src: 'annotations', owner: own })
        for (const p of pts) g.points.push({ p, kind: 'end', src: 'annotations', owner: own })
        for (let i = 0; i < (lg.closed ? pts.length : pts.length - 1); i++) {
          const p = pts[i], q = pts[(i + 1) % pts.length], bg = lg.bulges[i] ?? 0
          g.points.push({ p: bulgeMid(p, q, bg), kind: 'mid', src: 'annotations', owner: own })
          const arc = bulgeArc(p, q, bg)
          if (arc) g.points.push({ p: arc.c, kind: 'centre', src: 'annotations', owner: own })
        }
        break
      }
      case 'cloud': addOutline(g, (a.geom as LineGeom).pts ?? [], 'annotations', true, own, true); break
      case 'rect': {
        const bg = a.geom as BoxGeom
        addOutline(g, turnBox(bg, boxCorners(bg)), 'annotations', true, own, true)
        break
      }
      case 'ellipse': {
        const bg = a.geom as BoxGeom
        const c = { x: (bg.a.x + bg.b.x) / 2, y: (bg.a.y + bg.b.y) / 2 }
        const rx = Math.abs(bg.b.x - bg.a.x) / 2, ry = Math.abs(bg.b.y - bg.a.y) / 2
        const ring = Array.from({ length: 48 }, (_, i) => {
          const t = i / 48 * Math.PI * 2
          return { x: c.x + rx * Math.cos(t), y: c.y + ry * Math.sin(t) }
        })
        const turned = turnBox(bg, ring)
        for (let i = 0; i < 48; i++) g.segs.push({ a: turned[i], b: turned[(i + 1) % 48], src: 'annotations', owner: own })
        for (const q of [0, 12, 24, 36]) g.points.push({ p: turned[q], kind: 'end', src: 'annotations', owner: own })   // quadrants
        g.points.push({ p: c, kind: 'centre', src: 'annotations', owner: own })
        break
      }
      case 'dim': {
        const dg = a.geom as DimGeom
        if (!dg?.p1 || !dg?.p2) break
        const l = dimLayout(dg)
        addOutline(g, [l.d1, l.d2], 'annotations', false, own)
        g.points.push({ p: dg.p1, kind: 'end', src: 'annotations', owner: own }, { p: dg.p2, kind: 'end', src: 'annotations', owner: own })
        break
      }
      case 'arc': {
        const ag = a.geom as ArcGeom
        if (!ag?.c) break
        const pts = arcSample(ag, 32)
        for (let i = 0; i < pts.length - 1; i++) g.segs.push({ a: pts[i], b: pts[i + 1], src: 'annotations', owner: own })
        g.points.push({ p: arcStart(ag), kind: 'end', src: 'annotations', owner: own }, { p: arcEnd(ag), kind: 'end', src: 'annotations', owner: own },
          { p: arcMid(ag), kind: 'mid', src: 'annotations', owner: own }, { p: ag.c, kind: 'centre', src: 'annotations', owner: own })
        break
      }
      case 'circle': {
        const cg = a.geom as CircleGeom
        if (!cg?.c) break
        const ring = circleSample(cg, 48)
        for (let i = 0; i < ring.length; i++) g.segs.push({ a: ring[i], b: ring[(i + 1) % ring.length], src: 'annotations', owner: own })
        for (const q of [0, 90, 180, 270]) g.points.push({ p: arcPoint(cg, q), kind: 'end', src: 'annotations', owner: own })   // quadrants
        g.points.push({ p: cg.c, kind: 'centre', src: 'annotations', owner: own })
        break
      }
      case 'text': {
        const tg = a.geom as TextGeom
        if (!tg?.at) break
        const s = resolveStyle('text', a.style)
        const block = layoutText(a.text ?? '', s.size, { bold: s.bold, lineSpacing: s.lineSpacing, width: tg.width, height: tg.height })
        const pad = s.bg !== 'none' || s.border !== 'none' ? s.bgPad : 0
        addOutline(g, textCorners(tg, block, pad, paperToFrame), 'annotations', true, own)
        if (tg.leader?.length) addOutline(g, tg.leader, 'annotations', false, own)
        break
      }
    }
  }
  return g
}

/** Box / ellipse points turned by the box's rotation about its centre. */
function turnBox(bg: BoxGeom, pts: Pt[]): Pt[] {
  if (!bg.rot) return pts
  const c = { x: (bg.a.x + bg.b.x) / 2, y: (bg.a.y + bg.b.y) / 2 }
  return pts.map(p => { const r = rotatePt({ x: p.x - c.x, y: p.y - c.y }, bg.rot!); return { x: c.x + r.x, y: c.y + r.y } })
}
