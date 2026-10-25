import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../../resolver/resolver'
import { mergeRules } from '../../resolver/mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material } from '../../resolver/types'
import { buildPresetFootprint } from '../presets'
import { evaluateFootprint, withEdgeOverrides } from '../footprint'
import { footprintJunctions, withJoin } from '../junctions'
import { rectangleFootprint, withEdgeChoice } from '../edit'

// z_cabinet_shape_edit E3: what Edit shape writes.
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const exposed: Material = { id: 'x18', name: 'Exposed 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const twoDoors = {
  rows: [{ row_index: 0, height_locked: false }],
  cols: [{ col_index: 0, width_locked: false }, { col_index: 1, width_locked: false }],
  zones: [
    { row_index: 0, col_index: 0, face_type: 'door' as const, hinge_side: 'left' as const },
    { row_index: 0, col_index: 1, face_type: 'door' as const, hinge_side: 'right' as const },
  ],
}
const cab = (o: Partial<CabinetInput> = {}): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX: 600, DY: 870, DZ: 580,
  has_carcass: true, has_internal: true, has_face: true, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'cabinet', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: exposed,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
  face_grid: twoDoors, internal_tree: { type: 'open', fittings: [{ type: 'adj_shelf', y_locked: false }] },
  ...o,
})

describe('Edit shape (z_cabinet_shape_edit E3)', () => {
  it('a plain cabinet starts from a rectangle footprint that builds exactly the box', () => {
    const fp = rectangleFootprint({ w: 600, d: 580 })
    expect(fp.segments.map(s => [s.edge.id, s.edge.role])).toEqual([['back', 'back'], ['right', 'side'], ['front', 'front'], ['left', 'side']])
    const plain = resolveCabinet(cab()), shaped = resolveCabinet(cab({ footprint: fp }))
    // Same parts (the shaped build lists them edge by edge, so compare by key).
    const byKey = (ps: typeof plain.case_parts) => [...ps].sort((x, y) => x.part_key.localeCompare(y.part_key))
    expect(byKey(shaped.case_parts)).toEqual(byKey(plain.case_parts))
    expect(shaped.internal_parts).toEqual(plain.internal_parts)
    expect(shaped.face_zones.map(z => [z.X, z.Z, z.DX, z.DY])).toEqual(plain.face_zones.map(z => [z.X, z.Z, z.DX, z.DY]))
  })

  it('an edge choice on a preset rebuilds it and keeps the corner choices', () => {
    const dims = { w: 900, d: 580 }
    const fp = buildPresetFootprint('clipped_corner', {}, dims)!
    const key = footprintJunctions(fp, 900, 580).find(j => j.kind === 'panels')!.key
    const joined = withJoin(fp, 900, 580, key, 'mitre')
    const next = withEdgeChoice(joined, dims, 'end', { sub: 'finished' })
    expect(next.joins).toEqual(joined.joins)
    expect(evaluateFootprint(next, dims).find(s => s.edge.id === 'end')!.edge).toMatchObject({ role: 'side', sub: 'finished' })
    // A new type drops the old sub-type / scribe.
    const scr = withEdgeChoice(next, dims, 'end', { sub: 'scribe', scribe: 20 })
    const open = withEdgeChoice(scr, dims, 'end', { role: 'open' })
    expect(evaluateFootprint(open, dims).find(s => s.edge.id === 'end')!.edge).toEqual(expect.objectContaining({ role: 'open' }))
    expect(evaluateFootprint(open, dims).find(s => s.edge.id === 'end')!.edge.sub).toBeUndefined()
    expect(evaluateFootprint(open, dims).find(s => s.edge.id === 'end')!.edge.scribe).toBeUndefined()
  })

  it('an edge choice on a hand-edited shape lands on the edge itself', () => {
    const dims = { w: 600, d: 580 }
    const hand = { ...rectangleFootprint(dims), preset: null }
    const next = withEdgeChoice(hand, dims, 'left', { sub: 'applied' })
    expect(next.segments.find(s => s.edge.id === 'left')!.edge).toMatchObject({ role: 'side', sub: 'applied' })
    expect(evaluateFootprint(withEdgeOverrides(next), dims).find(s => s.edge.id === 'left')!.edge.sub).toBe('applied')
    expect(resolveCabinet(cab({ footprint: next })).case_parts.some(p => p.part_key === 'ap:left')).toBe(true)
  })
})
