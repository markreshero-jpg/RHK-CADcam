import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type FaceZoneInput, type Material, type Section, type SectionChild } from '../types'

// z_dividers/DIVIDERS-SPEC.md

const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }

const open = (): Section => ({ type: 'open', fittings: [] })
const twoBays = (first: Partial<SectionChild> = {}): Section => ({
  type: 'vsplit',
  children: [{ ...first, section: open() }, { section: open() }],
})

function cab(tree: Section, overrides: Partial<CabinetInput> = {}): CabinetInput {
  return {
    id: 'c1', assembly_class: 'base', DX: 900, DY: 900, DZ: 580,
    has_carcass: true, has_internal: true, has_face: false, has_toekick: true,
    left_neighbour: 'wall', right_neighbour: 'cabinet', exposed_interior: false,
    material: board, door_material: board, shelf_material: board, exposed_material: board,
    toekick_face_material: board, toekick_interior_material: board,
    slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
    face_grid: { rows: [], cols: [], zones: [] },
    internal_tree: tree,
    ...overrides,
  }
}

const dividers = (c: CabinetInput) =>
  resolveCabinet(c).internal_parts.filter(p => p.part_type === 'divider').sort((a, b) => a.X - b.X)

describe('dividers (z_dividers V1)', () => {
  it('single (and automatic, until V4) = one panel', () => {
    expect(dividers(cab(twoBays()))).toHaveLength(1)
    expect(dividers(cab(twoBays({ divider: 'single' })))).toHaveLength(1)
  })

  it('double = two panels back to back, each its own part', () => {
    const [a, b] = dividers(cab(twoBays({ divider: 'double' })))
    expect(b).toBeDefined()
    expect(b.X).toBeCloseTo(a.X + 18)
    expect(a.DZ).toBe(18)
    expect(b.DY).toBeCloseTo(a.DY)
    expect(b.sort_order).toBe(a.sort_order + 1)
  })

  it('a double takes 2 × board from the bays, centred where the single was', () => {
    const [single] = dividers(cab(twoBays()))
    const [a, b] = dividers(cab(twoBays({ divider: 'double' })))
    // Equal bays both give up 9: the pair is centred on the single's centre line.
    expect((a.X + b.X + 18) / 2).toBeCloseTo(single.X + 9)
  })
})

describe('drawer runners fix to their own column (z_dividers V2)', () => {
  const sideBySide = {
    rows: [{ row_index: 0, height_locked: false }],
    cols: [0, 1].map(i => ({ col_index: i, width_locked: false })),
    zones: [0, 1].map(i => ({ row_index: 0, col_index: i, face_type: 'drawer_face' as const })),
  }
  const drawers = (tree: Section) => resolveCabinet(cab(tree, { has_face: true, face_grid: sideBySide }))

  it('a single divider: each drawer runs between its side and the divider', () => {
    const rp = drawers(twoBays({ divider: 'single' }))
    const [div] = rp.internal_parts.filter(p => p.part_type === 'divider')
    const [l, r] = [...rp.drawer_stacks].sort((a, b) => a.face_zone_col - b.face_zone_col)
    // Left drawer: right runner on the divider's left face.
    const lr = l.slides.find(s => s.side === 'right')!
    expect(lr.X + lr.DZ).toBeCloseTo(div.X)
    expect(lr.member).toEqual({ table: 'internal_parts', internal_part_type: 'divider', internal_sort_order: div.sort_order })
    expect(l.slides.find(s => s.side === 'left')!.member).toBeUndefined()
    // Right drawer: left runner on the divider's right face.
    const rl = r.slides.find(s => s.side === 'left')!
    expect(rl.X).toBeCloseTo(div.X + div.DZ)
    expect(rl.member?.internal_sort_order).toBe(div.sort_order)
    // The boxes no longer overlap.
    expect(l.box_X + l.box_width).toBeLessThan(r.box_X)
  })

  it('a double divider: each drawer gets its own panel', () => {
    const rp = drawers(twoBays({ divider: 'double' }))
    const [a, b] = rp.internal_parts.filter(p => p.part_type === 'divider').sort((p, q) => p.X - q.X)
    const [l, r] = [...rp.drawer_stacks].sort((p, q) => p.face_zone_col - q.face_zone_col)
    expect(l.slides.find(s => s.side === 'right')!.member?.internal_sort_order).toBe(a.sort_order)
    expect(r.slides.find(s => s.side === 'left')!.member?.internal_sort_order).toBe(b.sort_order)
  })

  it('no divider: runners stay on the sides (the editor adds the divider, V4)', () => {
    const rp = drawers(open())
    expect(rp.drawer_stacks.every(s => s.slides.every(sl => !sl.member))).toBe(true)
  })
})

describe('automatic double for drawers side by side (z_dividers V4)', () => {
  const sideBySide = {
    rows: [{ row_index: 0, height_locked: false }],
    cols: [0, 1].map(i => ({ col_index: i, width_locked: false })),
    zones: [0, 1].map(i => ({ row_index: 0, col_index: i, face_type: 'drawer_face' as const })),
  }
  const withFronts = (tree: Section, zones: FaceZoneInput[] = sideBySide.zones) =>
    resolveCabinet(cab(tree, { has_face: true, face_grid: { ...sideBySide, zones } }))

  it('an automatic divider on the drawer seam resolves double and is reported', () => {
    const rp = withFronts(twoBays())
    expect(rp.internal_parts.filter(p => p.part_type === 'divider')).toHaveLength(2)
    expect(rp.auto_double_dividers).toEqual([':0'])
    const [l, r] = [...rp.drawer_stacks].sort((a, b) => a.face_zone_col - b.face_zone_col)
    expect(l.slides.find(s => s.side === 'right')!.member?.internal_sort_order).toBe(0)
    expect(r.slides.find(s => s.side === 'left')!.member?.internal_sort_order).toBe(1)
  })

  it('an explicit single sticks (V-D4)', () => {
    const rp = withFronts(twoBays({ divider: 'single' }))
    expect(rp.internal_parts.filter(p => p.part_type === 'divider')).toHaveLength(1)
    expect(rp.auto_double_dividers).toBeUndefined()
  })

  it('doors side by side keep a single', () => {
    const doors = sideBySide.zones.map(z => ({ ...z, face_type: 'door' as const }))
    expect(withFronts(twoBays(), doors).internal_parts.filter(p => p.part_type === 'divider')).toHaveLength(1)
  })

  it('an automatic divider well off the seam stays single', () => {
    const rp = withFronts(twoBays({ size: 200 }))
    expect(rp.internal_parts.filter(p => p.part_type === 'divider')).toHaveLength(1)
  })
})

describe('half-check crossings (z_dividers V5)', () => {
  // 3 × 3 egg-crate: rows of columns, the outer hsplit flagged.
  const row = (): Section => ({ type: 'vsplit', children: [{ section: open() }, { section: open() }, { section: open() }] })
  const grid = (flag: boolean): Section => ({
    type: 'hsplit', ...(flag ? { half_check: true } : {}),
    children: [{ section: row() }, { section: row() }, { section: row() }],
  })
  const c = (flag: boolean) => cab(grid(flag), { has_face: false, has_toekick: false, DY: 600, DX: 600 })
  const parts = (flag: boolean) => resolveCabinet(c(flag)).internal_parts
  const of = (ps: ReturnType<typeof parts>, t: string) => ps.filter(p => p.part_type === t)

  it('off: dividers are cut into pieces between the shelves', () => {
    expect(of(parts(false), 'divider')).toHaveLength(6)
    expect(of(parts(false), 'fixed_shelf')).toHaveLength(2)
  })

  it('on: two full-height dividers and two full-width shelves, sort orders renumbered', () => {
    const ps = parts(true)
    const divs = of(ps, 'divider'), shelves = of(ps, 'fixed_shelf')
    expect(divs).toHaveLength(2)
    expect(shelves).toHaveLength(2)
    expect(divs.map(d => d.sort_order).sort()).toEqual([0, 1])
    const off = of(parts(false), 'divider')
    const span = Math.max(...off.map(d => d.Y + d.DY)) - Math.min(...off.map(d => d.Y))
    for (const d of divs) { expect(d.DY).toBeCloseTo(span); expect(d.half_check).toBe(true) }
  })

  it('notches: shelf from the back, divider from the front, +0.2 wide, 5 past the meeting line', () => {
    const ps = parts(true)
    const [d] = of(ps, 'divider').sort((a, b) => a.X - b.X)
    const [s] = of(ps, 'fixed_shelf').sort((a, b) => a.Y - b.Y)
    // Shelf outline (x along the width, y back from the front): notch at the divider, from the back.
    const inner = s.outline!.filter(p => p.y < s.DX - 0.01 && p.y > 0.01)
    expect(inner).toHaveLength(4)   // both dividers cross it
    const xs = inner.sort((a, b) => a.x - b.x).slice(0, 2)   // the notch at the left divider
    expect(Math.abs(xs[0].x - xs[1].x)).toBeCloseTo(18.2)
    expect(Math.min(...xs.map(p => p.x))).toBeCloseTo(d.X - s.X - 0.1)
    const zm = (Math.max(s.Z, d.Z) + Math.min(s.Z + s.DX, d.Z + d.DX)) / 2
    expect(xs[0].y).toBeCloseTo(s.Z + s.DX - (zm + 5))
    // Divider outline (x = depth from the back, y down from the top): notch from the front.
    const ys = d.outline!.filter(p => p.x < d.DX - 0.01 && p.x > 0.01)
    expect(ys).toHaveLength(4)   // two shelves cross it
    expect(ys[0].x).toBeCloseTo(zm - 5 - d.Z)
    expect(Math.abs(ys[0].y - ys[1].y)).toBeCloseTo(18.2)
  })

  it('no joint seams on the half-checked parts', () => {
    const seams = resolveCabinet(c(true)).seam_joints
    expect(seams.filter(j => /^int_(divider|fixed_shelf)_/.test(j.part_a_key))).toHaveLength(0)
  })
})
