import { describe, it, expect } from 'vitest'
import { layoutKit, kitMemberT, type KitMember, type KitPlaced } from '../cabinetKit'
import { evalCustomPartFields, type CustomPartDims } from '../formula/customParts'
import { WOT_LIBRARY } from '../wotKit'

// z_wot K4 — the WOT / WOT-COMBI kits laid out for a room: tall 2100 × 580,
// wall-cabinet top 2100, doors 18, carcass 16.5, exposed 18 or 16.5.
const room = { tall: { h: 2100, d: 580 }, base: { h: 900, d: 580 }, wallcab: { h: 700, d: 350, top: 2100 } }
const SIZES: Record<string, { dx: number; dy: number; dz: number }> = {
  TEPK: { dx: 18, dy: 2100, dz: 580 }, 'D2-LL': { dx: 600, dy: 900, dz: 580 },
  self: { dx: 636, dy: 2100, dz: 580 }, W2D: { dx: 600, dy: 700, dz: 350 },
}
const envFor = (exposed: number) => (m: KitMember) => ({
  size: SIZES[m.def], r: { TOEH: 140 },
  t: { exposed, door: 18, gable: 16.5, back: 16.5, shelf: 16.5, toe: 16.5, drw: 16.5 },
})

type Part = { name: string; x: number; y: number; z: number; dx: number; dy: number; dz: number; expressions: Record<string, string> }
// A custom part's evaluated dims inside a placed member.
function partIn(p: KitPlaced, part: Part, exposed: number): CustomPartDims {
  const lit = { x: part.x, y: part.y, z: part.z, dx: part.dx, dy: part.dy, dz: part.dz }
  const scope = { roots: { cab: { w: p.dx, h: p.dy, d: p.dz, kick: 0 }, t: envFor(exposed)({ key: '', def: 'self' }).t, r: {} } }
  return { ...lit, ...evalCustomPartFields(lit, part.expressions, scope) }
}
const byKey = (ps: KitPlaced[]) => Object.fromEntries(ps.map(p => [p.key, p]))

describe('WOT kit', () => {
  for (const exposed of [18, 16.5]) {
    it(`exposed ${exposed}: panels 600 apart, D2-LL 650, oven core on it, W2D to the top line`, () => {
      const { placed, width, errors } = layoutKit(WOT_LIBRARY.WOT.kit as never, envFor(exposed), room)
      expect(errors).toEqual([])
      const k = byKey(placed)
      expect(k.lp).toMatchObject({ x: 0, dx: exposed, dy: 2100 })
      expect(k.rp.x - (k.lp.x + k.lp.dx)).toBe(600)
      expect(width).toBe(600 + 2 * exposed)
      expect(k.dr).toMatchObject({ x: exposed, y: 0, dx: 600, dy: 650, dz: 580 })
      expect(k.core).toMatchObject({ x: exposed, y: 650, dx: 600, dy: 600 + exposed + 380 })
      // W2D: from the top of the microwave opening up to 2100, 400 deep, outset
      // so its doors (DZ + 2 + 18) finish on the panels' front (580 + 18 + 2).
      expect(k.up.dy).toBeCloseTo(2100 - (650 + 600 + exposed + 380), 6)
      expect(k.up).toMatchObject({ dz: 400, gap: 180 })
      expect(k.up.gap + k.up.dz + 2 + 18).toBe(580 + 18 + 2)
      expect(k.up.rules).toEqual({ SCRBT: exposed })
    })
  }

  it('oven cleats: 80 × 600, front face 20 behind the panel fronts, holes 50 from the ends', () => {
    const { placed } = layoutKit(WOT_LIBRARY.WOT.kit as never, envFor(18), room)
    const core = byKey(placed).core
    const [l, r] = WOT_LIBRARY.WOT.custom_parts.slice(0, 2).map(p => partIn(core, p as unknown as Part, 18))
    expect(l).toMatchObject({ x: 0, y: 0, dx: 80, dy: 600, dz: 16.5 })
    expect(l.z + l.dx).toBe(600 - 20)
    expect(r.x).toBe(600 - 16.5)
    const holes = WOT_LIBRARY.WOT.part_operations
    expect(holes.map(h => [h.source_part_key, h.pos_x, h.pos_y, h.diameter])).toEqual([
      ['custom_@0', 40, 50, 5], ['custom_@0', 40, 550, 5], ['custom_@1', 40, 50, 5], ['custom_@1', 40, 550, 5],
    ])
    expect(WOT_LIBRARY.WOT.part_comments).toEqual({ 'custom_@0': 'Edge in black', 'custom_@1': 'Edge in black' })
  })

  it('microwave shelf flush with the panels, back panel behind it, under panel meets it', () => {
    const { placed } = layoutKit(WOT_LIBRARY.WOT.kit as never, envFor(18), room)
    const k = byKey(placed)
    const [, , shelf, back] = WOT_LIBRARY.WOT.custom_parts.map(p => partIn(k.core, p as unknown as Part, 18))
    expect(shelf).toMatchObject({ y: 600, dx: 450, dy: 600, dz: 18 })
    expect(shelf.z + shelf.dx).toBe(600)                       // front on the panel fronts
    expect(back.z + back.dz).toBe(shelf.z)                     // back panel right behind it
    expect(back).toMatchObject({ y: 600, dy: k.core.dy - 600 })
    const under = partIn(k.up, WOT_LIBRARY.WOT.kit.members[3].parts![0] as unknown as Part, 18)
    expect(under).toMatchObject({ y: 0, dz: 18, dy: 600 })
    expect(k.up.gap + under.z).toBe(shelf.z)                   // reaches back to the back panel
    expect(under.z + under.dx).toBe(k.up.dz)                   // and forward to the carcass front
  })

  it('WOT-COMBI: shelf on the oven cleats set back 20, combi cleats 450 above, W2D straight on top', () => {
    const { placed } = layoutKit(WOT_LIBRARY['WOT-COMBI'].kit as never, envFor(18), room)
    const k = byKey(placed)
    expect(k.core.dy).toBe(600 + 16.5 + 450)
    expect(k.up.dy).toBeCloseTo(2100 - 650 - k.core.dy, 6)
    const [, , shelf, cl] = WOT_LIBRARY['WOT-COMBI'].custom_parts.map(p => partIn(k.core, p as unknown as Part, 18))
    expect(shelf).toMatchObject({ y: 600, dz: 16.5, z: 0 })
    expect(shelf.z + shelf.dx).toBe(600 - 20)
    expect(cl).toMatchObject({ y: 616.5, dy: 450, dx: 80 })
    expect(cl.z + cl.dx).toBe(580)
    expect(WOT_LIBRARY['WOT-COMBI'].part_operations.filter(o => o.source_part_key === 'custom_@3').map(o => o.pos_y)).toEqual([50, 400])
    const under = partIn(k.up, WOT_LIBRARY['WOT-COMBI'].kit.members[3].parts![0] as unknown as Part, 18)
    expect(under).toMatchObject({ z: 0, dx: 400 })
  })

  it('a turned frame mirrors the kit along the wall so the left panel stays on the left', () => {
    expect(kitMemberT(1000, 636, { x: 0, dx: 18 }, false)).toBe(1000)
    expect(kitMemberT(1000, 636, { x: 0, dx: 18 }, true)).toBe(1618)
    expect(kitMemberT(1000, 636, { x: 618, dx: 18 }, true)).toBe(1000)
  })
})
