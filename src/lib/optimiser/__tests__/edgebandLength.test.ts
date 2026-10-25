import { describe, it, expect, vi } from 'vitest'
vi.mock('@/src/lib/supabase', () => ({ supabase: {} }))
import { bandedLengthMM, buildEdgebandReport, type EdgebandProduct } from '../edgebandLength'
import { normalizeProject } from '../normalize'
import { normalizeBenchtopParts } from '../benchtopParts'
import { sampleShapeOutline } from '@/src/lib/shapePath'

// Phase plan O7: edgeband metres per part, rolled up by tape product.

describe('bandedLengthMM', () => {
  it('rectangle: banded sides at finished length', () => {
    // w1 / w2 run along h, h1 / h2 along w.
    expect(bandedLengthMM(400, 700, [true, true, true, true])).toBe(2200)
    expect(bandedLengthMM(580, 720, [false, true, false, false])).toBe(720)
    expect(bandedLengthMM(580, 720, [false, false, false, false])).toBe(0)
  })

  it('L outline: tagged edges by tag, untagged by the side they lie on, inner edges none', () => {
    // 900 × 900 L, 560 legs; inner corner at (560, 560) — op frame, y up.
    const L = [{ x: 0, y: 0 }, { x: 900, y: 0 }, { x: 900, y: 560 }, { x: 560, y: 560 }, { x: 560, y: 900 }, { x: 0, y: 900 }]
    // Untagged, front sides (x = w, y = h) banded: only the 340 + 340 inner
    // runs lie inside, so the band covers the two 560 leg ends.
    expect(bandedLengthMM(900, 900, [false, true, false, true], L)).toBe(1120)
    // Tags win: the two inner edges banded, everything else not.
    expect(bandedLengthMM(900, 900, [true, true, true, true], L, [false, false, true, true, false, false])).toBe(680)
  })

  it('arc: sampled outline length ≈ the true arc', () => {
    // 600 wide, radius-300 half-round end: 600 straight + π·300 arc + 2 × 200 sides.
    const segs = [
      { type: 'line', p0: { x: 0, y: 0 }, p1: { x: 600, y: 0 } },
      { type: 'line', p0: { x: 600, y: 0 }, p1: { x: 600, y: 200 } },
      { type: 'arc', p0: { x: 600, y: 200 }, p1: { x: 0, y: 200 }, rx: 300, ry: 300, largeArc: 0, sweep: 1 },
      { type: 'line', p0: { x: 0, y: 200 }, p1: { x: 0, y: 0 } },
    ]
    const edgeSeg: number[] = []
    const poly = sampleShapeOutline(segs as never, 5, edgeSeg)
    const mm = bandedLengthMM(600, 500, [false, false, false, false], poly, edgeSeg.map(k => k === 2))
    expect(Math.abs(mm - Math.PI * 300)).toBeLessThan(Math.PI * 300 * 0.002)
  })
})

describe('snapshot eb_tape + report', () => {
  const snap = () => normalizeProject({ id: 'p', name: 'p', job_number: null }, [{ id: 'room', name: 'Kitchen' }],
    [{ id: 'c1', label: 'BC-01', assembly_class: 'base', room_id: 'room' }],
    // Left gable: depth 580 × height 720, front (resolver 'right') banded.
    [{ id: 'g', cabinet_instance_id: 'c1', part_key: 'left_side', dx: 580, dy: 720, dz: 18, material_id: 'm18', edge_band_right: true, edge_band_id: 'eb1' }],
    // Shelf DX 540 deep × DY 862 wide, front banded (a shelf's front = its 'top' edge).
    [{ id: 's', cabinet_instance_id: 'c1', part_type: 'adj_shelf', sort_order: 0, dx: 540, dy: 862, dz: 18, material_id: 'm18', edge_band_top: true, edge_band_id: 'eb1' }],
    [],
    // Door 400 × 700, all four edges, a tape with no thickness on record.
    [{ id: 'd', cabinet_instance_id: 'c1', row_index: 0, col_index: 0, face_type: 'door', dx: 400, dy: 700, dz: 18, material_id: 'm16',
      edge_band_top: true, edge_band_bottom: true, edge_band_left: true, edge_band_right: true, edge_band_id: 'eb2' }],
    [], new Map(),
    // Custom end panel 600 × 900 in the board material, one long edge: takes eb1 by material.
    [{ id: 'x', cabinet_instance_id: 'c1', name: 'End panel', dx: 600, dy: 900, dz: 18, material_id: 'm18', edge_right: true }],
    new Map([['eb1', 1]])).parts

  it('metres per part match the hand calc (thickness unknown still counts)', () => {
    const by = Object.fromEntries(snap().map(p => [p.source_part_key, p.eb_tape]))
    expect(by['case_left_side']).toEqual([{ id: 'eb1', mm: 720 }])
    expect(by['int_adj_shelf_0']).toEqual([{ id: 'eb1', mm: 862 }])
    expect(by['zone_0_0']).toEqual([{ id: 'eb2', mm: 2200 }])
    expect(by['custom_x']).toEqual([{ id: 'eb1', mm: 900 }])
  })

  it('rolls up by tape: metres, waste, cost', () => {
    const products = new Map<string, EdgebandProduct>([
      ['eb1', { id: 'eb1', name: 'White', brand: 'Rehau', thickness: 1, width: 22, cost_per_metre: 0.8 }],
      ['eb2', { id: 'eb2', name: 'Oak', thickness: null, width: 22, cost_per_metre: null }],
    ])
    const r = buildEdgebandReport(snap(), products, 0.1)
    const eb1 = r.totals.find(l => l.id === 'eb1')!
    expect(eb1.parts).toBe(3)
    expect(eb1.m).toBeCloseTo(2.482, 6)          // 720 + 862 + 900
    expect(eb1.mWaste).toBeCloseTo(2.7302, 6)
    expect(eb1.cost).toBeCloseTo(2.18416, 6)
    expect(eb1.name).toBe('Rehau White 22×1')
    const eb2 = r.totals.find(l => l.id === 'eb2')!
    expect(eb2.m).toBeCloseTo(2.2, 6)
    expect(eb2.cost).toBeNull()
    expect(r.unpriced).toBe(1)
    expect(r.totalM).toBeCloseTo(4.682, 6)
    expect(r.rooms[0].cabinets.map(c => [c.cabinet, c.tape, c.parts])).toEqual([['BC-01', 'Oak', 1], ['BC-01', 'Rehau White 22×1', 3]])
  })

  it('a banded part with no tape anywhere lands on "Tape not set"', () => {
    const parts = normalizeProject({ id: 'p', name: 'p', job_number: null }, [{ id: 'room', name: 'R' }],
      [{ id: 'c1', label: 'C', assembly_class: 'base', room_id: 'room' }], [], [], [], [], [], new Map(),
      [{ id: 'x', cabinet_instance_id: 'c1', name: 'Filler', dx: 50, dy: 720, dz: 18, material_id: 'mX', edge_left: true }]).parts
    const r = buildEdgebandReport(parts, new Map(), 0)
    expect(r.totals).toMatchObject([{ id: null, name: 'Tape not set', m: 0.72 }])
  })

  it('benchtop pieces carry their resolved tape metres per unit', () => {
    const { parts } = normalizeBenchtopParts({ id: 'p', name: 'p', job_number: null }, [{ id: 'room', name: 'R' }],
      [{ id: 'bt', label: 'Top 1', room_id: 'room' }],
      [{ id: 'w', benchtop_id: 'bt', part_role: 'worktop', label: 'Worktop', length_mm: 2400, width_mm: 600, thickness_mm: 33, quantity: 2,
        material_id: 'mb', edgebands: { sides: { y0: 'eb1' }, mm: { eb1: 2400 } } }])
    expect(parts.map(p => p.eb_tape)).toEqual([[{ id: 'eb1', mm: 2400 }], [{ id: 'eb1', mm: 2400 }]])
  })
})
