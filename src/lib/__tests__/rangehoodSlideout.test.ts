import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver/resolver'
import { mergeRules } from '../resolver/mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material } from '../resolver/types'
import { normaliseRangehood } from '../rangehood'
import { linkedHoleCutout } from '../rangehoodLink'
import { customPartCuts } from '../partCutouts'

// z_rangehood R12: slide-out hood (WRHSO) — no bottom, body footprint between the gables, under panel notched from the front.
const board: Material = { id: 'm', name: 'B16', DZ: 16.5, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const so = (rangehood: unknown, over: Partial<CabinetInput> = {}) => ({
  id: 'c', assembly_class: 'wall', DX: 600, DY: 720, DZ: 330, has_carcass: true, has_internal: true, has_face: false, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board, toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES), top_type: 'full_top', bottom_type: 'none', face_grid: { rows: [], cols: [], zones: [] },
  internal_tree: { type: 'open', fittings: [{ type: 'fixed_shelf', y_locked: false }] },
  joint_defaults: {}, joint_type_ops: {}, joint_type_names: {},
  rangehood: normaliseRangehood(rangehood), ...over,
}) as unknown as CabinetInput

describe('slide-out rangehood (R12)', () => {
  it('normalises mount (default undermount)', () => {
    expect(normaliseRangehood({})!.mount).toBe('undermount')
    expect(normaliseRangehood({ mount: 'slideout' })!.mount).toBe('slideout')
    expect(normaliseRangehood({ mount: 'x' })!.mount).toBe('undermount')
  })

  it('reports the body between the gables, d deep from their front; no bottom, no warning', () => {
    const rp = resolveCabinet(so({ mount: 'slideout', hole: { d: 300, setback: 0 }, shelf_h: 300 }))
    expect(rp.case_parts.find(p => p.part_key === 'bottom')).toBeUndefined()
    const L = rp.case_parts.find(p => p.part_key === 'left_side')!, R = rp.case_parts.find(p => p.part_key === 'right_side')!
    expect(rp.rangehood_hole).toEqual({ x0: L.X + L.DZ, x1: R.X, z0: L.Z + L.DX - 300, z1: L.Z + L.DX })
    expect(rp.warnings.filter(w => w.code === 'RANGEHOOD')).toEqual([])
    // Flue box still built on the shelf (same as WRH).
    expect(rp.case_parts.filter(p => p.part_key.startsWith('rh:flue'))).toHaveLength(3)
  })

  it('warns with a bottom or no body depth', () => {
    const a = resolveCabinet(so({ mount: 'slideout', hole: { d: 300 } }, { bottom_type: 'full' } as Partial<CabinetInput>))
    expect(a.warnings.some(w => /Bottom Type to none/.test(w.message))).toBe(true)
    expect(a.case_parts.find(p => p.part_key === 'bottom')!.cutouts).toBeUndefined()
    const b = resolveCabinet(so({ mount: 'slideout' }))
    expect(b.warnings.some(w => /body depth/.test(w.message))).toBe(true)
    expect(b.rangehood_hole ?? null).toBeNull()
  })

  it('notches the under panel from its front edge', () => {
    const rh = normaliseRangehood({ mount: 'slideout', hole: { d: 300 } })!
    const part = { x: 0, z: 0, dx: 310, dy: 1200 }   // panel 310 deep (set back 20)
    const c = linkedHoleCutout('h', { x0: 316.5, x1: 883.5, z0: 30, z1: 330 }, rh, part)
    expect(c).toMatchObject({ kind: 'notch', edge: 'front', w: 567, d: 280, x: { from: 'left', off: 316.5 } })
    const cut = customPartCuts({ id: 'u', orientation: 'flat', dz: 16.5, ...part }, [c])
    expect(cut.warnings).toEqual([])
    expect(cut.cutouts).toBeNull()
    const xs = cut.outline!.map(p => p.x), ys = cut.outline!.map(p => p.y)
    expect(cut.outline!.length).toBe(8)
    expect(xs).toContain(316.5); expect(xs).toContain(883.5); expect(ys).toContain(280)
  })
})

// Duct straight out the wall (RHK6571 WC-03, Mark 2026-11-18): a round hole in the back, no flue notch / box.
describe('duct out the back', () => {
  it('defaults to up (flue box)', () => {
    expect(normaliseRangehood({})!.duct).toEqual({ out: 'up', dia: 200, h: 400 })
  })
  it('cuts a 200 hole in the back at the centre height, no flue notch or box', () => {
    const rp = resolveCabinet(so({ mount: 'slideout', hole: { d: 300 }, shelf_h: 500, duct: { out: 'back', dia: 200, h: 385 } }))
    expect(rp.case_parts.filter(p => p.part_key.startsWith('rh:flue'))).toHaveLength(0)
    expect(rp.case_parts.find(p => p.part_key === 'full_top')!.outline).toBeUndefined()
    const back = rp.case_parts.find(p => p.part_key === 'back')!
    const pts = back.cutouts![0].pts
    // Face frame: x across from the back's left edge, y down from its top. Centre 385 above the underside.
    const top = back.Y + back.DZ + back.DX
    const L = rp.case_parts.find(p => p.part_key === 'left_side')!, R = rp.case_parts.find(p => p.part_key === 'right_side')!
    const cx = (L.X + L.DZ + R.X) / 2 - back.X
    expect(pts[0].x).toBeCloseTo(cx - 100, 1); expect(pts[1].x).toBeCloseTo(cx + 100, 1)
    expect(pts[0].y).toBeCloseTo(top - 385, 1)
    expect(rp.warnings.filter(w => w.code === 'RANGEHOOD')).toEqual([])
  })
  it('warns when the hole runs into the shelf', () => {
    const rp = resolveCabinet(so({ mount: 'slideout', hole: { d: 300 }, shelf_h: 300, duct: { out: 'back', dia: 200, h: 385 } }))
    expect(rp.warnings.some(w => /runs into the fixed shelf/.test(w.message))).toBe(true)
  })
})
