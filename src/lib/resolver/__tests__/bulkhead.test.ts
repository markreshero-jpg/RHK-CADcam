import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type ResolvedCasePart } from '../types'
import { casePlanCorners, caseBox } from '../../jointDrilling'
import { DEFAULT_BULKHEAD, DEFAULT_SHADOWLINE, normaliseBulkhead, type BulkheadSettings } from '../../bulkhead'
import { cabVExtent } from '../../geometry'
import type { Room } from '../../types'
import { isShapedPanelKey } from '../../cabinetShape/partKeys'

// z_bulkhead B2: fascia + returns + L cleat from the bulkhead settings.
const board = (t: number, id = `m${t}`): Material => ({ id, name: `Board ${t}`, DZ: t, sheet_dx: 2400, sheet_dy: 1200, has_grain: false })
const W = 1200, H = 300, D = 330, T = 18, TC = 16

function cab(b: Partial<BulkheadSettings>, o: Partial<CabinetInput> = {}): CabinetInput {
  return {
    id: 'bh1', assembly_class: 'wall', DX: W, DY: H, DZ: D,
    has_carcass: false, has_internal: false, has_face: false, has_toekick: false,
    left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
    material: board(TC, 'carcass'), door_material: board(18, 'door'), shelf_material: board(TC),
    exposed_material: board(T, 'exposed'),
    toekick_face_material: board(TC), toekick_interior_material: board(TC),
    slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
    internal_tree: { type: 'open', fittings: [] },
    face_grid: { rows: [], cols: [], zones: [] },
    bulkhead: normaliseBulkhead({ ...DEFAULT_BULKHEAD, front: 'carcase', ...b }),
    ...o,
  }
}
const parts = (c: CabinetInput) => resolveCabinet(c).case_parts
const get = (ps: ResolvedCasePart[], k: string) => ps.find(p => p.part_key === k)
// Plan bounds (x along the width, z from the wall) after AY + bevels.
function plan(p: ResolvedCasePart) {
  const c = casePlanCorners(p)
  const xs = c.map(q => q.x), zs = c.map(q => q.z)
  const r = (n: number) => Math.round(n * 1000) / 1000
  return { x0: r(Math.min(...xs)), x1: r(Math.max(...xs)), z0: r(Math.min(...zs)), z1: r(Math.max(...zs)) }
}
const on = (joint: 'mitre' | 'butt' = 'mitre', depth = 600) => ({ on: true, depth, joint })

describe('bulkhead parts', () => {
  it('fascia only: full width at the carcase front, exposed board, + L cleat in carcass board', () => {
    const ps = parts(cab({}))
    expect(ps.map(p => p.part_key).sort()).toEqual(['bh:cleat_h', 'bh:cleat_v', 'bh:fascia'])
    const f = get(ps, 'bh:fascia')!
    expect(isShapedPanelKey(f.part_key)).toBe(true)
    expect({ DY: f.DY, DX: f.DX, DZ: f.DZ, mat: f.material_id }).toEqual({ DY: W, DX: H, DZ: T, mat: 'exposed' })
    expect(plan(f)).toEqual({ x0: 0, x1: W, z0: D - T, z1: D })
    // Both ends + the bottom edge show.
    expect(f.edge_band).toMatchObject({ top: false, bottom: true, left: true, right: true })

    const cv = get(ps, 'bh:cleat_v')!, ch = get(ps, 'bh:cleat_h')!
    expect(cv.material_id).toBe('carcass')
    expect(plan(cv)).toEqual({ x0: 0, x1: W, z0: D - T - TC, z1: D - T })
    expect(caseBox(cv)).toMatchObject({ y: TC, h: 100 - TC })
    expect(caseBox(ch)).toMatchObject({ x: 0, w: W, y: 0, h: TC, z: D - T - 100, d: 100 })
  })

  it('mitred side returns: blanks run to the outer corners with 45° ends', () => {
    const ps = parts(cab({ left: on(), right: on() }))
    const f = get(ps, 'bh:fascia')!
    expect([f.bevel_lo, f.bevel_hi]).toEqual([45, 45])
    expect(f.edge_band).toMatchObject({ left: false, right: false })
    const l = get(ps, 'bh:ret_l')!, r = get(ps, 'bh:ret_r')!
    // Capped at the wall: 600 > 330 deep.
    expect(l.DY).toBe(D)
    expect(plan(l)).toEqual({ x0: 0, x1: T, z0: 0, z1: D })
    expect(plan(r)).toEqual({ x0: W - T, x1: W, z0: 0, z1: D })
    expect(l.bevel_lo).toBe(45)
    expect(r.bevel_hi).toBe(45)
    // Reaching the wall: back end hidden; bottom edge shows.
    expect(l.edge_band).toMatchObject({ bottom: true, right: false })
    // The cleat fits between the returns.
    expect(plan(get(ps, 'bh:cleat_h')!)).toMatchObject({ x0: T, x1: W - T })
  })

  it('butt returns stop behind the fascia, which keeps square banded ends', () => {
    const ps = parts(cab({ left: on('butt', 200) }))
    const f = get(ps, 'bh:fascia')!
    expect(f.bevel_hi).toBeUndefined()
    expect(f.edge_band).toMatchObject({ left: true, right: true })
    const l = get(ps, 'bh:ret_l')!
    expect(l.DY).toBe(200 - T)
    expect(plan(l)).toEqual({ x0: 0, x1: T, z0: D - 200, z1: D - T })
    expect(l.edge_band).toMatchObject({ right: true })   // short of the wall: back end shows
  })

  it('bottom return sits between the side returns; the cleat lifts by its thickness', () => {
    const ps = parts(cab({ left: on(), right: on(), bottom: on('mitre', 300) }))
    const b = get(ps, 'bh:ret_b')!
    expect(caseBox(b)).toMatchObject({ x: T, w: W - 2 * T, y: 0, h: T, z: D - 300, d: 300 })
    expect(b.edge_band).toMatchObject({ top: false, bottom: true, left: false, right: false })
    expect(get(ps, 'bh:fascia')!.edge_band.bottom).toBe(false)
    expect(caseBox(get(ps, 'bh:cleat_h')!).y).toBe(T)
    expect(caseBox(get(ps, 'bh:cleat_v')!).y).toBe(T + TC)
  })

  it('no cleat when the bulkhead is lower than a leg, or switched off', () => {
    expect(get(parts(cab({}, { DY: 90 })), 'bh:cleat_h')).toBeUndefined()
    expect(get(parts(cab({ bottom: on() }, { DY: 110 })), 'bh:cleat_h')).toBeUndefined()
    expect(get(parts(cab({ cleat: false })), 'bh:cleat_v')).toBeUndefined()
  })

  it('flush with doors: the fascia comes forward to the door front', () => {
    const f = get(parts(cab({ front: 'doors' })), 'bh:fascia')!
    expect(plan(f).z1).toBeGreaterThan(D + 17)
  })

  it('shadowline: one flat strip on top, flush with the carcase front, front edge taped', () => {
    const ps = parts(cab({ ...DEFAULT_SHADOWLINE }, { DY: T }))
    expect(ps.map(p => p.part_key)).toEqual(['bh:sl_front'])
    const s = ps[0]
    expect(caseBox(s)).toMatchObject({ x: 0, w: W, y: 0, h: T, z: D - 60, d: 60 })
    expect(s.material_id).toBe('exposed')
    expect(s.edge_band).toMatchObject({ top: true, bottom: false, left: true, right: true })
  })

  it('shadowline returns butt behind the strip and run back to the wall', () => {
    const ps = parts(cab({ ...DEFAULT_SHADOWLINE, left: on('butt'), right: on('butt', 200) }, { DY: T }))
    const s = get(ps, 'bh:sl_front')!, l = get(ps, 'bh:sl_ret_l')!, r = get(ps, 'bh:sl_ret_r')!
    expect(s.edge_band).toMatchObject({ left: false, right: false })
    expect(caseBox(l)).toMatchObject({ x: 0, w: 60, z: 0, d: D - 60 })
    expect(l.edge_band).toMatchObject({ left: true, bottom: false })          // reaches the wall
    expect(caseBox(r)).toMatchObject({ x: W - 60, w: 60, z: D - 200, d: 140 })
    expect(r.edge_band).toMatchObject({ right: true, bottom: true })          // stops short
  })

  it('shadowline sits on the overhead tops; a bulkhead hangs from the ceiling', () => {
    const room = { room_dy: 2400, wall_cabinet_top: 2100 } as unknown as Room
    expect(cabVExtent('wall', T, null, room, DEFAULT_SHADOWLINE)).toEqual([2100, 2100 + T])
    expect(cabVExtent('wall', 300, null, room, DEFAULT_BULKHEAD)).toEqual([2100, 2400])
  })

  it('not a bulkhead → no bh parts', () => {
    expect(parts(cab({}, { bulkhead: null })).length).toBe(0)
  })
})
