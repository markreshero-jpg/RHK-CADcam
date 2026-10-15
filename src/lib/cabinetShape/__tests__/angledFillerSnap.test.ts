import { describe, it, expect } from 'vitest'
import { angledFillerSnap } from '../angledFillerSnap'
import { buildPresetFootprint } from '../presets'
import { evaluateFootprint } from '../footprint'
import { centroid, wallInwardNormal, cabinetToPlan, cabWallSpan, cabT, wallDir, type Pt } from '../../geometry'
import type { CabinetInstance, Wall } from '../../types'

// z_angled_filler A3: the filler drops into an inside corner with its two backs
// on the two walls, angle + hand from the walls, in either drawing direction.
const wall = (id: string, a: Pt, b: Pt): Wall => ({
  id, room_id: 'r', name: id, sort_order: 0, length: Math.hypot(b.x - a.x, b.y - a.y), height: null, soffit_height: null,
  angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI, pos_x: a.x, pos_y: a.y, thickness: 90, wall_type: 'standard', created_at: '',
})
const R = Math.PI / 180
const fp0 = buildPresetFootprint('angled_filler', {}, { w: 0, d: 0 })!
// Distance from p to the infinite line through wall w.
const offLine = (p: Pt, w: Wall) => { const d = wallDir(w); return Math.abs((p.x - w.pos_x) * d.y - (p.y - w.pos_y) * d.x) }

function check(A: Wall, B: Wall, dropT: number, theta: number, corner: Pt) {
  const walls = [A, B]
  const ref = centroid(walls)
  const snap = angledFillerSnap({ footprint: fp0 }, A, walls, ref, dropT)
  expect(snap).not.toBeNull()
  expect(Number(snap!.footprint.params.angle)).toBeCloseTo(theta, 1)
  const cab = { ...snap!, rotation: A.angle, footprint: snap!.footprint } as unknown as CabinetInstance
  const perp = wallInwardNormal(A, ref)
  const toPlan = cabinetToPlan(cab, A, perp)
  const segs = evaluateFootprint(snap!.footprint, { w: snap!.dx, d: snap!.dz })
  const at = (id: string) => { const s = segs.find(q => q.edge.id === id)!; return [toPlan(s.p0.x, s.p0.y), toPlan(s.p1.x, s.p1.y)] }
  const [b0, b1] = at('back'), [c0, c1] = at('back2')
  // back on wall A, back2 on wall B, meeting at the corner.
  expect(offLine(b0, A)).toBeLessThan(0.01); expect(offLine(b1, A)).toBeLessThan(0.01)
  expect(offLine(c0, B)).toBeLessThan(0.01); expect(offLine(c1, B)).toBeLessThan(0.01)
  expect(Math.hypot(b1.x - corner.x, b1.y - corner.y)).toBeLessThan(0.01)
  // The apex is on the room side of both walls.
  const P = at('fill_a')[0]
  for (const w of walls) {
    const n = wallInwardNormal(w, ref)
    expect((P.x - w.pos_x) * n.x + (P.y - w.pos_y) * n.y).toBeGreaterThan(500)
  }
  // The wall span covers only wall A's part, ending at the corner.
  const sp = cabWallSpan(cab, A, perp)
  const tC = (corner.x - A.pos_x) * wallDir(A).x + (corner.y - A.pos_y) * wallDir(A).y
  const t = cabT(cab, A)
  expect([t + sp.lo, t + sp.hi].some(v => Math.abs(v - tC) < 0.01)).toBe(true)
  expect(t + sp.lo).toBeGreaterThan(-0.01)
  expect(t + sp.hi).toBeLessThan(A.length + 0.01)
}

describe('angledFillerSnap', () => {
  const o = { x: 0, y: 0 }, a = { x: 2000, y: 0 }
  for (const theta of [45, 30, 90]) {
    const b = { x: 2000 + 1000 * Math.cos(theta * R), y: 1000 * Math.sin(theta * R) }
    it(`${theta}°, corner at the wall's end`, () => check(wall('A', o, a), wall('B', a, b), 1900, theta, a))
    it(`${theta}°, both walls drawn backwards`, () => check(wall('A', a, o), wall('B', b, a), 100, theta, a))
    // Corner at the start of A: B comes in from the other side.
    const b2 = { x: -1000 * Math.cos(theta * R), y: 1000 * Math.sin(theta * R) }
    it(`${theta}°, corner at the wall's start`, () => check(wall('A', o, a), wall('B', b2, o), 100, theta, o))
  }

  it('no snap at a lone wall end or an outside corner', () => {
    const A = wall('A', { x: 0, y: 0 }, { x: 2000, y: 0 })
    expect(angledFillerSnap({ footprint: fp0 }, A, [A], centroid([A]), 1900)).toBeNull()
  })
})
