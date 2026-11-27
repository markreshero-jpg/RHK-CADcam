import { describe, expect, it } from 'vitest'
import { cabT } from '../geometry'
import { isAngledFiller, kickCornerShape, kickRunLegs } from '../kickRunCorner'
import type { CabinetInstance, Wall } from '../types'

// RHK6542 DHID › Living Room kick test (Mark 2026-11-28): Wall 1 3000, Wall 2 1800 at 45°
// from its end; BC-02 / BC-03 B2D 600 × 662 on Wall 1, BC-01 BFKANG in the corner, BC-04
// B2D on Wall 2 butting the filler.
const W = (o: Partial<Wall>) => ({ thickness: 90, height: null, wall_type: 'standard', ...o }) as unknown as Wall
const walls = [
  W({ id: 'w1', name: 'Wall 1', pos_x: 0, pos_y: 0, angle: 0, length: 3000 }),
  W({ id: 'w2', name: 'Wall 2', pos_x: 3000, pos_y: 0, angle: 45, length: 1800 }),
]
const seg = (x: number, y: number, id: string, role: string) => ({ type: 'line', p0: { x, y }, edge: { id, role } })
const filler = {
  preset: 'angled_filler', params: {},
  segments: [
    seg(0, 0, 'back', 'back'), seg(323.4936, 0, 'back2', 'back'), seg(552.2382, 228.7446, 'side_b', 'side'),
    seg(84.1335, 696.8492, 'fill_b', 'front'), seg(49.2843, 662, 'fill_a', 'front'), seg(0, 662, 'side_a', 'side'),
  ],
}
const C = (o: Partial<CabinetInstance>) => ({ assembly_class: 'base', has_toekick: true, dz: 662, rotation: 0, footprint: null, ...o }) as unknown as CabinetInstance
const cabs = [
  C({ id: 'BC-02', label: 'BC-02', wall_id: 'w1', pos_x: 1477, pos_y: 0, dx: 600 }),
  C({ id: 'BC-03', label: 'BC-03', wall_id: 'w1', pos_x: 2077, pos_y: 0, dx: 600 }),
  C({ id: 'BC-01', label: 'BC-01', wall_id: 'w1', pos_x: 2676.5064, pos_y: 0, dx: 552.2, dz: 696.8, footprint: filler as never }),
  C({ id: 'BC-04', label: 'BC-04', wall_id: 'w2', pos_x: 3228.3955, pos_y: 228.3955, dx: 600, rotation: 45 }),
]
// A plain touching-run finder standing in for detectKickRun.
const straightRun = (c: CabinetInstance, w: Wall) => {
  const on = cabs.filter(x => x.wall_id === w.id).sort((a, b) => cabT(a, w) - cabT(b, w))
  return on
}
const legsFrom = (start: CabinetInstance) => kickRunLegs(straightRun(start, walls[0]), walls[0], cabs, walls, straightRun, () => true)

describe('kick round an angled corner filler', () => {
  it('carries the run through the filler onto the next wall', () => {
    const legs = legsFrom(cabs[0])
    expect(legs.map(l => l.members.map(c => c.label))).toEqual([['BC-02', 'BC-03', 'BC-01'], ['BC-04']])
    expect(isAngledFiller(cabs[2])).toBe(true)
  })

  it('stops at the corner without a filler', () => {
    const noFill = cabs.filter(c => c.id !== 'BC-01')
    const legs = kickRunLegs(noFill.filter(c => c.wall_id === 'w1'), walls[0], noFill, walls, straightRun, () => true)
    expect(legs).toHaveLength(1)
    expect(kickCornerShape(legs, walls)).toBeNull()
  })

  it('outlines the backs along both walls and the fronts meeting where they cross', () => {
    const s = kickCornerShape(legsFrom(cabs[0]), walls)!
    const pts = s.footprint.segments.map(g => [g.edge.id, Math.round(g.p0.x * 10) / 10, Math.round(g.p0.y * 10) / 10])
    expect(pts).toEqual([
      ['back', 0, 0],              // BC-02's back-left
      ['back2', 1523, 0],          // where the walls meet
      ['right', 2175.7, 652.7],    // BC-04's back-right on Wall 2
      ['front2', 1707.6, 1120.8],  // BC-04's front-right
      ['front', 1248.8, 662],      // the two front lines cross (filler faces in line with them)
      ['left', 0, 662],
    ])
    expect(s.footprint.kick_joins).toEqual({ 'back|back2': 'mitre' })
    expect(s.footprint.kick_spreaders).toBe('along_fronts')
    expect([s.pos_x, s.pos_y, s.rotation, s.wall_id]).toEqual([1477, 0, 0, 'w1'])
    expect([Math.round(s.dx), Math.round(s.dz)]).toEqual([2176, 1121])
  })
})
