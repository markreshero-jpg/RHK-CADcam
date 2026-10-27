import { describe, it, expect } from 'vitest'
import { takeoffKind, countKinds, buildHardware, lengthsText, type TakeoffCab, type HardwareProducts } from '../hardware'
import type { ResolvedCabinet } from '../../resolver/types'

const cab = (id: string, cls = 'base', extra: Partial<TakeoffCab> = {}): TakeoffCab => ({ id, room_id: 'r1', label: id, assembly_class: cls, ...extra })

describe('takeoffKind', () => {
  it('sorts library codes into cabinets, panels, fillers and bulkheads', () => {
    expect(takeoffKind('B2D', cab('a'))).toBe('base')
    expect(takeoffKind('BCNP', cab('a', 'base_corner'))).toBe('base')
    expect(takeoffKind('W2D', cab('a', 'wall'))).toBe('wall')
    expect(takeoffKind('WOT', cab('a', 'tall'))).toBe('tall')
    expect(takeoffKind('BEPF', cab('a'))).toBe('end_panel')
    expect(takeoffKind('IBPK', cab('a'))).toBe('end_panel')
    expect(takeoffKind('WUP', cab('a', 'wall'))).toBe('end_panel')
    expect(takeoffKind('BCRVFIXP', cab('a'))).toBe('end_panel')
    expect(takeoffKind('TFKW', cab('a', 'tall'))).toBe('filler')
    expect(takeoffKind('BFKANG', cab('a'))).toBe('filler')
    expect(takeoffKind('WF', cab('a', 'wall'))).toBe('filler')
    expect(takeoffKind('BH', cab('a', 'wall'))).toBe('bulkhead')
    expect(takeoffKind('BHCRVFIXP', cab('a', 'wall'))).toBe('bulkhead')
    expect(takeoffKind('BHSL', cab('a', 'wall'))).toBe('shadowline')
    expect(takeoffKind('FLSHLF', cab('a', 'wall'))).toBe('floating_shelf')
    expect(takeoffKind('B2D', cab('a', 'base', { is_kick_assembly: true }))).toBeNull()
  })
  it('falls back on the bulkhead / float shelf settings for custom items', () => {
    expect(takeoffKind('My bulkhead', cab('a', 'wall', { bulkhead: {} }))).toBe('bulkhead')
    expect(takeoffKind(null, cab('a', 'wall', { float_shelf: {} }))).toBe('floating_shelf')
  })
})

describe('countKinds', () => {
  it('counts per kind with the codes behind each', () => {
    const cabs = [cab('1'), cab('2'), cab('3', 'wall'), cab('4')]
    const code: Record<string, string> = { 1: 'B2D', 2: 'B2D', 3: 'W2D', 4: 'BEPF' }
    const k = countKinds(cabs, c => code[c.id])
    expect(k.map(x => [x.kind, x.count])).toEqual([['base', 2], ['wall', 1], ['end_panel', 1]])
    expect(k[0].codes).toEqual([{ code: 'B2D', count: 2 }])
  })
})

const P: HardwareProducts = {
  hinges: new Map([['h1', { name: 'Clip top 110', brand: 'Blum', code: '71B3550' }]]),
  plates: new Map([['p1', { name: 'Plate 0mm' }]]),
  slides: new Map([['s1', { name: 'Antaro' }], ['bin1', { name: 'Teramo 2x35L' }]]),
  handles: new Map(),
  accessories: new Map([['rail', { name: 'Oval rail' }], ['sup', { name: 'Rail end' }]]),
}

function resolved(over: Partial<ResolvedCabinet>): ResolvedCabinet {
  return { hinge_instances: [], drawer_stacks: [], internal_slides: [], face_zones: [], internal_parts: [], ...over } as unknown as ResolvedCabinet
}
const slide = (id: string, nl: number, inner?: number) => ({ slide_id: id, nominal_length: nl, ...(inner != null ? { inner_drawer_index: inner } : {}) })

describe('buildHardware', () => {
  it('rolls hinges, runner pairs, bins, handles and rails up per room and job', () => {
    const cabs = [cab('B1'), cab('B2'), { ...cab('W1', 'wall'), room_id: 'r2' }]
    const res = new Map<string, ResolvedCabinet>([
      ['B1', resolved({
        hinge_instances: [{ hinge_hardware_id: 'h1', hinge_plate_id: 'p1' }, { hinge_hardware_id: 'h1', hinge_plate_id: 'p1' }] as never,
        drawer_stacks: [{ drawer_type: 'standard', slides: [slide('s1', 500), slide('s1', 500)] }, { drawer_type: 'bin', slides: [slide('bin1', 500), slide('bin1', 500)] }] as never,
        internal_slides: [slide('s1', 450, 0), slide('s1', 450, 0), slide('s1', 450, 1), slide('s1', 450, 1)] as never,
        face_zones: [
          { handle: { handle_id: 'k', name: 'Knob', grip_kind: 'hardware' } },
          { handle: { handle_id: 'sn', name: 'Sharknose 45', grip_kind: 'sharknose' } },
          { handle: null },
        ] as never,
      })],
      ['B2', resolved({
        hinge_instances: [{ hinge_hardware_id: 'h1', hinge_plate_id: 'p1' }] as never,
        internal_parts: [
          { part_type: 'accessory', DY: 864, accessory: { product_id: 'rail', name: 'x' } },
          { part_type: 'rail_support', DY: 20, accessory: { product_id: 'sup', name: 'x' } },
          { part_type: 'rail_support', DY: 20, accessory: { product_id: 'sup', name: 'x' } },
        ] as never,
      })],
      ['W1', resolved({ hinge_instances: [{ hinge_hardware_id: 'h1', hinge_plate_id: null }] as never })],
    ])
    const hw = buildHardware(['r1', 'r2'], cabs, res, P)
    const r1 = Object.fromEntries(hw.rooms[0].lines.map(l => [l.name, l]))
    expect(r1['Clip top 110'].qty).toBe(3)
    expect(r1['Clip top 110'].code).toBe('71B3550')
    expect(r1['Clip top 110'].cabinets).toEqual([{ label: 'B1', qty: 2 }, { label: 'B2', qty: 1 }])
    expect(r1['Plate 0mm'].qty).toBe(3)
    expect(r1['Antaro 500mm']).toMatchObject({ group: 'Runners', qty: 1, unit: 'pr' })
    expect(r1['Antaro 450mm']).toMatchObject({ group: 'Inner drawer runners', qty: 2, unit: 'pr' })
    expect(r1['Teramo 2x35L']).toMatchObject({ group: 'Bins', qty: 1 })
    expect(r1['Knob']).toMatchObject({ group: 'Handles', qty: 1 })
    expect(r1['Sharknose 45']).toBeUndefined()
    expect(hw.rooms[0].fingerPulls).toEqual([{ name: 'Sharknose 45', grip: 'sharknose', fronts: 1 }])
    expect(r1['Oval rail']).toMatchObject({ qty: 1, lengths: [864] })
    expect(r1['Rail end'].qty).toBe(2)
    // Job totals add the second room.
    expect(hw.totals.find(l => l.name === 'Clip top 110')!.qty).toBe(4)
    expect(hw.totals.find(l => l.name === 'Plate 0mm')!.qty).toBe(3)
    // Group order: hinges first, rails last.
    expect(hw.rooms[0].lines[0].group).toBe('Hinges')
    expect(hw.rooms[0].lines.at(-1)!.group).toBe('Rail supports')
  })
})

describe('lengthsText', () => {
  it('groups equal lengths and adds metres', () => {
    expect(lengthsText([1200, 1200, 900])).toBe('2 × 1200, 900 (3.30 m)')
  })
})
