import { describe, it, expect } from 'vitest'
import { buildPaintParts, paintColourGroups, sumPaintGroups, type PaintColour } from '../takeoff/paint'
import type { ResolvedCabinet } from '../resolver/types'

const zone = (o: Record<string, unknown>) => ({ face_type: 'door', DX: 450, DY: 720, DZ: 18, material_id: 'satin', ...o })
const cab = (id: string, zones: Record<string, unknown>[], extra: Partial<ResolvedCabinet> = {}) => ({
  cabinet_id: id, case_parts: [], toekick_parts: [], internal_parts: [], face_zones: zones, drawer_stacks: [],
  ...extra,
}) as unknown as ResolvedCabinet

const painted = (id: string | null | undefined) => id === 'satin'
const colours = new Map<string, PaintColour>([
  ['alab', { id: 'alab', name: 'Resene Alabaster', code: null, brand: 'Resene', finish: 'Satin', range: '2 Pac' }],
  ['wow',  { id: 'wow',  name: 'Dulux White on White', code: null, brand: 'Dulux', finish: 'Satin', range: '2 Pac' }],
])

describe('paint shop rollup', () => {
  it('fronts take their own colour, other painted parts the cabinet front colour, unpainted skipped', () => {
    const resolved = new Map([['c1', cab('c1', [
      zone({ door_colour_id: 'wow' }),
      zone({ door_colour_id: 'wow' }),
      zone({ face_type: 'drawer_face', door_colour_id: 'alab', DY: 300 }),
      zone({ material_id: 'melamine' }),
    ], { case_parts: [{ part_key: 'left_side', DX: 580, DY: 870, DZ: 18, material_id: 'satin' }] as never })]])
    const parts = buildPaintParts([{ id: 'c1', room_id: 'r1', label: 'B1', assembly_class: 'base' }], resolved, painted, new Map(), null)
    expect(parts).toHaveLength(4)
    const groups = paintColourGroups(parts, colours)
    const wow = groups.find(g => g.colourId === 'wow')!
    expect(wow.qty).toBe(3)                       // 2 doors + end panel (first painted front = wow)
    expect(wow.lines.find(l => l.part === 'Door')!.qty).toBe(2)
    expect(groups.find(g => g.colourId === 'alab')!.qty).toBe(1)
  })

  it('fronts with no saved colour fall back to the room, then job class colour', () => {
    const resolved = new Map([['c1', cab('c1', [zone({})])], ['c2', cab('c2', [zone({})])]])
    const rooms = new Map([['r1', { wall_door_colour_id: 'alab' }]])
    const parts = buildPaintParts([
      { id: 'c1', room_id: 'r1', label: 'W1', assembly_class: 'wall' },
      { id: 'c2', room_id: 'r1', label: 'B1', assembly_class: 'base' },
    ], resolved, painted, rooms, { base_door_colour_id: 'wow' })
    expect(parts.map(p => p.colourId)).toEqual(['alab', 'wow'])
  })

  it('no colour anywhere = one "not chosen" group, listed last', () => {
    const resolved = new Map([['c1', cab('c1', [zone({}), zone({ door_colour_id: 'alab' })])]])
    const groups = paintColourGroups(buildPaintParts([{ id: 'c1', room_id: 'r1', label: 'B1', assembly_class: 'base' }], resolved, painted, new Map(), null), colours)
    expect(groups.map(g => g.colourId)).toEqual(['alab', null])
  })

  it('paint area = one face + every edge at 0.1 m', () => {
    const door = { roomId: 'r1', cabinetLabel: 'B1', part: 'Door', height: 720, width: 600, thickness: 18, colourId: null, front: true }
    const [g] = paintColourGroups([door, { ...door, cabinetLabel: 'B2' }], new Map())
    expect(g.faceM2).toBeCloseTo(2 * 0.432)
    expect(g.edgeM2).toBeCloseTo(2 * 2.64 * 0.1)
    expect(g.m2).toBeCloseTo(2 * (0.432 + 0.264))
    const [job] = sumPaintGroups([[g], [g]])
    expect(job.qty).toBe(4)
    expect(job.m2).toBeCloseTo(4 * 0.696)
  })
})
