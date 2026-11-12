import { describe, it, expect } from 'vitest'
import { pairLinearHandles } from '../pairLinearHandles'
import type { OptiPart } from '../types'

// A horizontal sharknose strip: w = 35 (one long edge taped, w1), h = length (ends taped).
function lh(id: string, cab: string, n: number, len: number, extra: Partial<OptiPart> = {}): OptiPart {
  return {
    uid: id, source_table: 'case_parts', source_part_id: id, source_part_key: `case_lh:${n}`,
    cabinet_instance_id: cab, cabinet_label: cab, room_id: 'r', room_name: 'R', project_id: 'p', job_number: null,
    label: `Linear Handle ${n + 1} (sharknose edge, saw)`, default_label: '', part_type_key: `lh:${n}`,
    w: 35, h: len, thickness: 18, eb_w1: 1, eb_w2: 0, eb_h1: 1, eb_h2: 1, eb_missing: false,
    eb_tape: [{ id: 'oak', mm: len + 70 }],
    material_id: 'oak', grain_direction: 'horizontal', nest_priority: 0, output_to_cnc: true, comment: null, ...extra,
  } as OptiPart
}
const all = (ps: OptiPart[]) => new Set(ps.map(p => p.uid))

describe('pairLinearHandles (z_handles D27)', () => {
  it('pairs same-size strips into an 80 blank taped all round', () => {
    const ps = [lh('a', 'BC-04', 0, 862), lh('b', 'BC-04', 1, 862)]
    const out = pairLinearHandles(ps, all(ps))
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ w: 82, h: 862, eb_w1: 1, eb_w2: 1, eb_h1: 1, eb_h2: 1, cabinet_label: 'BC-04', label: 'Linear Handle 1 + 2 (pair)' })
    expect(out[0].eb_on).toEqual([true, true, true, true])
    expect(out[0].eb_tape).toEqual([{ id: 'oak', mm: 2 * 862 + 2 * 82 }])
    expect(out[0].comment).toMatch(/^PAIR: cut 80 wide, edge both long edges \+ both ends, then rip into 2 x 35 strips/)
  })
  it('leaves an odd one and different lengths single', () => {
    const ps = [lh('a', 'BC-05', 0, 863), lh('b', 'BC-05', 1, 863), lh('c', 'BC-05', 2, 863), lh('d', 'BC-10', 0, 448)]
    const out = pairLinearHandles(ps, all(ps))
    expect(out.map(p => p.uid)).toEqual(['a', 'c', 'd'])
    expect(out[1].w).toBe(35)
  })
  it('pairs across cabinets and names both', () => {
    const ps = [lh('a', 'BC-04', 2, 862), lh('b', 'BC-06', 0, 862)]
    const out = pairLinearHandles(ps, all(ps))
    expect(out[0].cabinet_label).toBe('BC-04 + BC-06')
    expect(out[0].label).toBe('Linear Handle 3 + Linear Handle 1 (pair)')
  })
  it('a turned (vertical) strip widens along h', () => {
    const v = (id: string) => lh(id, 'TC-02', 0, 0, { w: 2370, h: 35, eb_w1: 1, eb_w2: 1, eb_h1: 0, eb_h2: 1 })
    const ps = [v('a'), v('b')]
    const out = pairLinearHandles(ps, all(ps))
    expect(out[0]).toMatchObject({ w: 2370, h: 82, eb_h1: 1, eb_h2: 1 })
  })
  it('skips strips not flagged sharknose (timber pulls)', () => {
    const ps = [lh('a', 'BC-04', 0, 862), lh('b', 'BC-04', 1, 862)]
    expect(pairLinearHandles(ps, new Set())).toBe(ps)
  })
})
