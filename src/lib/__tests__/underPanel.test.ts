import { describe, it, expect } from 'vitest'
import { underPanelRun, carcassesOverPanel, withoutScribe } from '../underPanel'
import type { CabinetInstance, Room, Wall } from '../types'

// z_floating F7/F8: a BUP / WUP under a run of base cabinets / overheads.
const wall = { id: 'w1', pos_x: 0, pos_y: 0, angle: 0, length: 3000, thickness: 90 } as Wall
const room = { id: 'r1' } as Room
const cab = (id: string, x: number, dx: number, over: Partial<CabinetInstance> = {}) => ({
  id, wall_id: 'w1', pos_x: x, pos_y: 0, pos_z: 300, rotation: 0, dx, dy: 500, dz: 475,
  assembly_class: 'base', has_carcass: true, has_toekick: false, is_kick_assembly: false,
  rule_overrides: { FLOAT: true }, bulkhead: null, ...over,
}) as unknown as CabinetInstance
const run = (sel: CabinetInstance[]) => underPanelRun(sel, room, [wall], () => 0)

describe('under panel run', () => {
  const ep1 = cab('ep1', 105, 18, { has_carcass: false })
  const a = cab('a', 123, 585), b = cab('b', 708, 584), c = cab('c', 1292, 585)
  const ep2 = cab('ep2', 1877, 18, { has_carcass: false })

  it('spans the carcasses between the end panels, at their depth and bottom', () => {
    const r = run([ep2, c, ep1, a, b])
    if (typeof r === 'string') throw new Error(r)
    expect(r.anchor.id).toBe('a')
    expect(r.carcasses.map(x => x.id).sort()).toEqual(['a', 'b', 'c'])
    expect(r).toMatchObject({ dx: 1754, dz: 475, z: 300 })
  })

  it('sits on top of a kick', () => {
    const r = underPanelRun([cab('k', 0, 600, { pos_z: 0, has_toekick: true, rule_overrides: {} })], room, [wall], () => 150)
    expect(typeof r !== 'string' && r.z).toBe(150)
  })

  it('back-side cabinets: the run starts at the cabinet left in its own frame', () => {
    // Rotated 180: local +X runs toward −x, so the left-most is the one at the larger x.
    const p = cab('p', 1200, 600, { rotation: 180 }), q = cab('q', 600, 600, { rotation: 180 })
    const r = run([q, p])
    expect(typeof r !== 'string' && r.anchor.id).toBe('p')
    expect(typeof r !== 'string' && r.dx).toBe(1200)
  })

  it('overheads get a WUP at their bottom; mixing with base cabinets is refused', () => {
    const roomWc = { id: 'r1', wall_cabinet_top: 2100 } as unknown as Room
    const wc = (id: string, x: number) => cab(id, x, 600, { assembly_class: 'wall', dy: 700, pos_z: 0, rule_overrides: {} })
    const r = underPanelRun([wc('w1', 0), wc('w2', 600)], roomWc, [wall], () => 0)
    if (typeof r === 'string') throw new Error(r)
    expect(r).toMatchObject({ kind: 'wall', dx: 1200, z: 1400 })
    expect(typeof underPanelRun([wc('w1', 0), a], roomWc, [wall], () => 0)).toBe('string')
  })

  it('refuses no carcass, or cabinets on two walls', () => {
    expect(typeof run([ep1])).toBe('string')
    expect(typeof run([a, cab('z', 0, 600, { wall_id: 'w2' })])).toBe('string')
  })

  it('deleting the panel finds the carcasses it scribed', () => {
    const panel = cab('bbp', 123, 1754, { has_carcass: false, dy: 18, rule_overrides: { UNDER_PANEL: true } })
    const scribed = (x: CabinetInstance) => ({ ...x, rule_overrides: { FLOAT: true, SCRBT: 18 } }) as CabinetInstance
    const other = cab('far', 2500, 600, { rule_overrides: { SCRBT: 18 } })
    expect(carcassesOverPanel(panel, [ep1, scribed(a), b, scribed(c), other, panel]).map(x => x.id)).toEqual(['a', 'c'])
    expect(withoutScribe({ FLOAT: true, SCRBT: 18 })).toEqual({ FLOAT: true })
  })
})
