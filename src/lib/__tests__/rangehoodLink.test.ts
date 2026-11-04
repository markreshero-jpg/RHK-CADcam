import { describe, it, expect } from 'vitest'
import type { CabinetInstance, Wall } from '../types'
import { normaliseRangehood } from '../rangehood'
import { mapHoleRect, linkedHoleCutout, panelRangehoodHoles, panelLinkSignature } from '../rangehoodLink'
import { customPartCuts } from '../partCutouts'

// z_rangehood R6: the WUP takes the hole of the WRH sitting on it.
const wall = { id: 'w', room_id: 'r', pos_x: 0, pos_y: 0, angle: 0, length: 3000, thickness: 90, wall_type: 'standard' } as Wall
const rh = normaliseRangehood({ hole: { w: 500, d: 260, setback: 40 } })!
const cab = (id: string, o: Partial<CabinetInstance>) => ({
  id, room_id: 'r', wall_id: 'w', assembly_class: 'wall', has_carcass: true, is_kick_assembly: false, bulkhead: null,
  pos_x: 0, pos_y: 0, pos_z: 1500, rotation: 0, dx: 600, dy: 720, dz: 330, rule_overrides: {}, rangehood: null, ...o,
}) as unknown as CabinetInstance
const own = { x0: 50, x1: 550, z0: 30, z1: 290 }
const part = { x: 0, z: 0, dx: 330, dy: 1200 }

describe('WUP takes the rangehood hole (R6)', () => {
  it('maps it into the panel along the wall', () => {
    const wrh = cab('h', { pos_x: 1000, rangehood: rh, rule_overrides: { SCRBT: 18 } })
    const wup = cab('p', { pos_x: 800, dx: 1200, dy: 18, rule_overrides: { UNDER_PANEL: true } })
    const r = mapHoleRect({ x0: 50, x1: 550, z0: 30, z1: 290 }, wrh, wup, wall, [wall])
    expect(r).toEqual({ x0: 250, x1: 750, z0: 30, z1: 290 })
    const c = linkedHoleCutout('h', r, rh, part)
    expect(c).toMatchObject({ kind: 'hole', source: 'linked', w: 500, d: 260, x: { from: 'left', off: 250 }, y: { from: 'front', off: 40 } })
    // Cut on the Under Panel: one loop, 500 across from 250.
    const cut = customPartCuts({ id: 'u', orientation: 'flat', dz: 18, ...part }, [c])
    const xs = cut.cutouts![0].pts.map(p => p.x)
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([250, 750])
  })

  it('maps a turned (back-side) pair the other way along the wall', () => {
    const wrh = cab('h', { pos_x: 1000, rotation: 180, rangehood: rh, rule_overrides: { SCRBT: 18 } })
    const wup = cab('p', { pos_x: 800, rotation: 180, dx: 1200, dy: 18, rule_overrides: { UNDER_PANEL: true } })
    expect(mapHoleRect({ x0: 50, x1: 550, z0: 30, z1: 290 }, wrh, wup, wall, [wall]))
      .toEqual({ x0: 450, x1: 950, z0: 30, z1: 290 })
  })

  it('only takes rangehoods sitting on the panel', () => {
    const wup = cab('p', { pos_x: 800, dx: 1200, dy: 18, rule_overrides: { UNDER_PANEL: true } })
    const on = cab('a', { pos_x: 1000, rangehood: rh, rule_overrides: { SCRBT: 18 } })
    const noScribe = cab('b', { pos_x: 1000, rangehood: rh })
    const past = cab('c', { pos_x: 2100, rangehood: rh, rule_overrides: { SCRBT: 18 } })
    const plain = cab('d', { pos_x: 1400, rule_overrides: { SCRBT: 18 } })
    const got = panelRangehoodHoles(wup, [on, noScribe, past, plain], wall, [wall], () => own)
    expect(got.map(g => g.cab.id)).toEqual(['a'])
  })

  it('signature changes when a rangehood on the wall moves', () => {
    const wup = cab('p', { dx: 1200, rule_overrides: { UNDER_PANEL: true } })
    const a = cab('a', { pos_x: 1000, rangehood: rh })
    const s0 = panelLinkSignature(wup, [wup, a, cab('d', { pos_x: 0 })])
    expect(panelLinkSignature(wup, [wup, a, cab('d', { pos_x: 50 })])).toBe(s0)        // a plain cabinet: no change
    expect(panelLinkSignature(wup, [wup, { ...a, pos_x: 1010 }])).not.toBe(s0)
  })
})
