import { describe, it, expect } from 'vitest'
import type { CabinetInstance, Wall } from '../../types'
import { buildPresetFootprint } from '../presets'
import { evaluateFootprint, withEdgeOverrides, type Footprint } from '../footprint'
import { footprintLine, lineToFootprint, planMap, type ShapeLine } from '../footprintCad'
import { withJoin, footprintJunctions } from '../junctions'
import { bulgeMid, filletAt, chamferAt, offsetPolyline } from '../../annotations/geometry'
import { arcGeom } from '../../shapePath'

// z_cabinet_shape_edit E4b: the footprint as a closed CAD line in plan mm, and back.
const wall = { id: 'w', angle: 0, pos_x: 0, pos_y: 0, length: 4000, thickness: 90 } as unknown as Wall
const cabAt = (dx: number, dz: number, o: Partial<CabinetInstance> = {}) =>
  ({ id: 'c', wall_id: 'w', pos_x: 1000, pos_y: 0, dx, dz, dy: 870, rotation: 0, ...o }) as unknown as CabinetInstance
const PERP = { x: 0, y: 1 }

const segsOf = (fp: Footprint, w: number, d: number) =>
  evaluateFootprint(withEdgeOverrides(fp), { w, d }).map(s => ({ id: s.edge.id, role: s.edge.role, sub: s.edge.sub, x: Math.round(s.p0.x * 10) / 10, y: Math.round(s.p0.y * 10) / 10, arc: s.type === 'arc' }))

function setup(preset: string, params = {}, w = 900, d = 580, cab = cabAt(w, d)) {
  const fp = buildPresetFootprint(preset, params, { w, d })!
  const m = planMap(cab, wall, PERP)
  const line = footprintLine(fp, { w, d }, m)
  return { fp, m, line, dims: { w, d } }
}

describe('footprint ↔ CAD line (E4b)', () => {
  for (const [preset, params] of [['clipped_corner', {}], ['radius_end', { radius: 250 }], ['l_corner', {}], ['angled_end', { inset: 200 }]] as const) {
    it(`${preset}: round trip keeps the shape, the edges and the box`, () => {
      const { fp, m, line, dims } = setup(preset, params, 900, preset === 'l_corner' ? 900 : 580)
      const r = lineToFootprint(fp, dims, line, line.geom, m)
      expect(r.error).toBeUndefined()
      expect(r.dx).toBeCloseTo(dims.w, 1); expect(r.dz).toBeCloseTo(dims.d, 1)
      expect(r.shift!.x).toBeCloseTo(0, 3); expect(r.shift!.y).toBeCloseTo(0, 3)
      expect(segsOf(r.fp!, r.dx!, r.dz!)).toEqual(segsOf(fp, dims.w, dims.d))
      expect(r.fp!.preset).toBeNull()
      expect(r.fp!.from_preset).toBe(preset)
    })
  }

  it('an arc bows the same way on the plan as in the footprint (bulge signs)', () => {
    const { fp, m, line, dims } = setup('radius_end', { radius: 250 })
    const arc = evaluateFootprint(fp, dims).find(s => s.type === 'arc')!
    const g = arcGeom(arc.p0, arc.p1, arc.rx!, arc.ry!, arc.largeArc ?? 0, arc.sweep ?? 0)!
    const t = g.a0 + g.da / 2
    const midLocal = { x: g.cx + g.rx * Math.cos(t), y: g.cy + g.ry * Math.sin(t) }
    const i = line.edgeIds.indexOf('curve')
    const n = line.geom.pts.length
    const mid = bulgeMid(line.geom.pts[i], line.geom.pts[(i + 1) % n], line.geom.bulges[i])
    const want = m.to(midLocal.x, midLocal.y)
    expect(mid.x).toBeCloseTo(want.x, 3); expect(mid.y).toBeCloseTo(want.y, 3)
  })

  it('a corner drag keeps every edge and re-anchors the vertex to its nearest side', () => {
    const { fp, m, line, dims } = setup('clipped_corner')
    const i = line.edgeIds.indexOf('front')   // the front edge starts at the clip corner
    const pts = line.geom.pts.map((p, j) => j === i ? { x: p.x - 100, y: p.y } : p)
    const r = lineToFootprint(fp, dims, line, { ...line.geom, pts }, m)
    expect(r.error).toBeUndefined()
    expect(r.fp!.segments.map(s => s.edge.id)).toEqual(line.edgeIds)
    const front = r.fp!.segments.find(s => s.edge.id === 'front')!
    expect(front.p0_expr).toEqual({ x: 'cab.w - 400', y: 'cab.d' })
    expect(r.dx).toBeCloseTo(900, 3)
  })

  it('a vertex added on an edge splits it: the longer half keeps the id, the other is a new front', () => {
    const { fp, m, line, dims } = setup('clipped_corner')
    const i = line.edgeIds.indexOf('back'), n = line.geom.pts.length
    const a = line.geom.pts[i], b = line.geom.pts[(i + 1) % n]
    const v = { x: a.x + (b.x - a.x) * 0.7, y: a.y + (b.y - a.y) * 0.7 }
    const pts = [...line.geom.pts.slice(0, i + 1), v, ...line.geom.pts.slice(i + 1)]
    const r = lineToFootprint(fp, dims, line, { pts, bulges: pts.map(() => 0), closed: true }, m)
    const segs = r.fp!.segments
    expect(segs[i].edge.id).toBe('back')
    expect(segs[i + 1].edge).toMatchObject({ role: 'front' })
    expect(line.edgeIds).not.toContain(segs[i + 1].edge.id)
    expect(segs.filter(s => s.edge.id === 'back')).toHaveLength(1)
  })

  it('fillet / chamfer a corner: both sides keep their ids, the new piece is a front', () => {
    const { fp, m, line, dims } = setup('clipped_corner')
    const corner = line.edgeIds.indexOf('side')   // the left-front corner starts the side edge
    for (const poly of [filletAt(line.geom, corner, 60)!, chamferAt(line.geom, corner, 60, 60)!]) {
      const r = lineToFootprint(fp, dims, line, poly as ShapeLine['geom'], m)
      expect(r.error).toBeUndefined()
      const ids = r.fp!.segments.map(s => s.edge.id)
      for (const id of line.edgeIds) expect(ids).toContain(id)
      const fresh = r.fp!.segments.filter(s => !line.edgeIds.includes(s.edge.id))
      expect(fresh).toHaveLength(1)
      expect(fresh[0].edge.role).toBe('front')
    }
  })

  it('pulling an edge out grows the box; pulling the left side out moves the cabinet', () => {
    const cab = cabAt(900, 580)
    const { fp, m, line, dims } = setup('clipped_corner', {}, 900, 580, cab)
    // Right side (local x = 900 → 1000).
    const right = line.geom.pts.map(p => (Math.abs(m.from(p).x - 900) < 0.1 ? m.to(1000, m.from(p).y) : p))
    const r1 = lineToFootprint(fp, dims, line, { ...line.geom, pts: right }, m)
    expect(r1.dx).toBeCloseTo(1000, 3); expect(r1.shift!.x).toBeCloseTo(0, 3)
    // Left side (local x = 0 → −100): the box grows left, the origin moves −100 along the wall.
    const left = line.geom.pts.map(p => (Math.abs(m.from(p).x) < 0.1 ? m.to(-100, m.from(p).y) : p))
    const r2 = lineToFootprint(fp, dims, line, { ...line.geom, pts: left }, m)
    expect(r2.dx).toBeCloseTo(1000, 3); expect(r2.shift!.x).toBeCloseTo(-100, 3)
    expect(m.posFor(r2.shift!.x, r2.shift!.y, r2.dx!)).toEqual({ x: 900, y: 0 })
    // The new frame puts every vertex back where it was drawn.
    const m2 = planMap({ ...cab, pos_x: 900, dx: r2.dx! } as CabinetInstance, wall, PERP)
    const back = footprintLine(r2.fp!, { w: r2.dx!, d: r2.dz! }, m2).geom.pts
    for (const [p, q] of back.map((p, j) => [p, left[j]])) { expect(p.x).toBeCloseTo(q.x, 1); expect(p.y).toBeCloseTo(q.y, 1) }
  })

  it('a turned frame (back-side cabinet) maps back to the same plan points', () => {
    const perp = { x: 0, y: -1 }   // (wallDir, perp) left-handed → turned
    const cab = cabAt(900, 580)
    const m = planMap(cab, wall, perp)
    const fp = buildPresetFootprint('angled_end', { inset: 200 }, { w: 900, d: 580 })!
    const line = footprintLine(fp, { w: 900, d: 580 }, m)
    const left = line.geom.pts.map(p => (Math.abs(m.from(p).x) < 0.1 ? m.to(-50, m.from(p).y) : p))
    const r = lineToFootprint(fp, { w: 900, d: 580 }, line, { ...line.geom, pts: left }, m)
    const pos = m.posFor(r.shift!.x, r.shift!.y, r.dx!)
    const m2 = planMap({ ...cab, pos_x: pos.x, pos_y: pos.y, dx: r.dx! } as CabinetInstance, wall, perp)
    const back = footprintLine(r.fp!, { w: r.dx!, d: r.dz! }, m2).geom.pts
    for (const [p, q] of back.map((p, j) => [p, left[j]])) { expect(p.x).toBeCloseTo(q.x, 1); expect(p.y).toBeCloseTo(q.y, 1) }
  })

  it('an offset copy (replacing the outline) keeps every edge by the nearest parallel one', () => {
    const { fp, m, line, dims } = setup('clipped_corner')
    const pts = offsetPolyline(line.geom.pts, 20, true, line.geom.bulges)
    const r = lineToFootprint(fp, dims, line, { pts, bulges: line.geom.bulges, closed: true }, m, true)
    expect(r.error).toBeUndefined()
    expect(new Set(r.fp!.segments.map(s => s.edge.id))).toEqual(new Set(line.edgeIds))
    expect(Math.abs(r.dx! - 900)).toBeCloseTo(40, 0)
  })

  it('refuses an open, self-crossing, tiny-edged or panel-less outline', () => {
    const { fp, m, line, dims } = setup('clipped_corner')
    expect(lineToFootprint(fp, dims, line, { ...line.geom, closed: false } as never, m).error).toMatch(/closed/)
    const p = line.geom.pts
    const crossed = [p[0], p[2], p[1], ...p.slice(3)]
    expect(lineToFootprint(fp, dims, line, { pts: crossed, bulges: crossed.map(() => 0), closed: true }, m).error).toMatch(/crosses|10 mm/)
    const tiny = [...p.slice(0, 2), { x: p[1].x + 3, y: p[1].y + 3 }, ...p.slice(2)]
    expect(lineToFootprint(fp, dims, line, { pts: tiny, bulges: tiny.map(() => 0), closed: true }, m).error).toMatch(/10 mm/)
    const allFront = { ...fp, segments: fp.segments.map(s => ({ ...s, edge: { ...s.edge, role: 'front' as const } })) }
    const l2 = footprintLine(allFront, dims, m)
    expect(lineToFootprint(allFront, dims, l2, l2.geom, m).error).toMatch(/side or back/)
  })

  it('corner choices on an edge that went are dropped', () => {
    const { fp, m, dims } = setup('clipped_corner')
    const key = footprintJunctions(fp, 900, 580).find(j => j.kind === 'panel_end')!.key
    const joined = withJoin(fp, 900, 580, key, 'flush')
    const line = footprintLine(joined, dims, m)
    // Remove the facet: its two ends meet (front corner straight to the end side).
    const i = line.edgeIds.indexOf('facet')
    const pts = line.geom.pts.filter((_, j) => j !== i)
    const r = lineToFootprint(joined, dims, line, { pts, bulges: pts.map(() => 0), closed: true }, m)
    expect(r.error).toBeUndefined()
    expect(r.dropped).toContain(key)
    expect(r.fp!.joins).toBeUndefined()
  })
})

describe('new edge names (E4b)', () => {
  it('new edges are e1, e2, … shown as "Edge 1"', async () => {
    const { edgeLabel } = await import('../footprint')
    expect(edgeLabel('e1')).toBe('Edge 1')
    expect(edgeLabel('e12')).toBe('Edge 12')
    expect(edgeLabel('end')).toBe('End')
    const { fp, m, line, dims } = setup('clipped_corner')
    const corner = line.edgeIds.indexOf('side')
    const r = lineToFootprint(fp, dims, line, chamferAt(line.geom, corner, 60, 60) as ShapeLine['geom'], m)
    expect(r.fp!.segments.map(s => s.edge.id)).toContain('e1')
  })
})
