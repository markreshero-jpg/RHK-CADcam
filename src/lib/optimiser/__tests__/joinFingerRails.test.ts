import { describe, it, expect } from 'vitest'
import { joinFingerRails, type RailWallRect } from '../joinFingerRails'
import type { OptiPart } from '../types'

// A rail part (w = height, h = length) + where it sits on the wall.
function rail(id: string, cab: string, x: number, len: number, y = 460, height = 40, extra: Partial<OptiPart> = {}): [OptiPart, RailWallRect] {
  const p = {
    uid: id, source_table: 'case_parts', source_part_id: id, source_part_key: 'case_fprail:0',
    cabinet_instance_id: cab, cabinet_label: cab, room_id: 'r', room_name: 'R', project_id: 'p', job_number: null,
    label: 'Finger Rail 1', default_label: 'Finger Rail 1', part_type_key: 'fprail',
    w: height, h: len, thickness: 18, eb_w1: 0, eb_w2: 0, eb_h1: 0, eb_h2: 0, eb_missing: false,
    material_id: 'oak', grain_direction: 'horizontal', nest_priority: 0, output_to_cnc: true, comment: null, ...extra,
  } as OptiPart
  return [p, { rect: { x, y, w: len, h: height }, cabinetId: cab, wallId: 'w1', side: 'face', frontLine: 475 }]
}
const run = (rs: [OptiPart, RailWallRect][], max?: number) =>
  joinFingerRails(rs.map(r => r[0]), new Map(rs.map(r => [r[0].source_part_id, r[1]])), max)

describe('joinFingerRails (z_handles D17)', () => {
  it('joins rails that meet end to end into one run', () => {
    const out = run([rail('a', 'BC-02', 100, 577), rail('b', 'BC-03', 677, 588), rail('c', 'BC-04', 1265, 588)])
    expect(out).toHaveLength(1)
    expect(out[0].h).toBe(1753)
    expect(out[0].cabinet_label).toBe('BC-02/BC-03/BC-04')
    expect(out[0].comment).toBe('Joined rail: BC-02 + BC-03 + BC-04')
  })
  it('keeps rails at different heights, depths or boards apart', () => {
    expect(run([rail('a', 'A', 0, 600), rail('b', 'B', 600, 600, 210, 45)])).toHaveLength(2)
    expect(run([rail('a', 'A', 0, 600), rail('b', 'B', 600, 600, 460, 40, { material_id: 'white' })])).toHaveLength(2)
    const [b, rb] = rail('b', 'B', 600, 600)
    expect(run([rail('a', 'A', 0, 600), [b, { ...rb, frontLine: 560 }]])).toHaveLength(2)
  })
  it('does not bridge a gap between cabinets', () => {
    expect(run([rail('a', 'A', 0, 600), rail('b', 'B', 650, 600)])).toHaveLength(2)
  })
  it('splits a run over 2400 at a cabinet junction, fewest pieces', () => {
    const out = run([0, 1, 2, 3, 4].map(i => rail(`r${i}`, `C${i}`, i * 600, 600)))
    expect(out.map(p => p.h)).toEqual([2400, 600])
  })
  it('never cuts one cabinet\'s rail, and leaves shaped / hand-sized rails alone', () => {
    expect(run([rail('a', 'A', 0, 2600), rail('b', 'B', 2600, 600)]).map(p => p.h)).toEqual([2600, 600])
    expect(run([rail('a', 'A', 0, 600, 460, 40, { size_overridden: true }), rail('b', 'B', 600, 600)])).toHaveLength(2)
  })
  it('leaves other parts in place', () => {
    const [x] = rail('x', 'A', 0, 600)
    const other = { ...x, uid: 'g', source_part_key: 'left_side' }
    const out = joinFingerRails([other, ...[rail('a', 'A', 0, 600), rail('b', 'B', 600, 600)].map(r => r[0])],
      new Map([rail('a', 'A', 0, 600), rail('b', 'B', 600, 600)].map(r => [r[0].source_part_id, r[1]])))
    expect(out.map(p => p.uid)).toEqual(['g', 'a'])
  })
})
