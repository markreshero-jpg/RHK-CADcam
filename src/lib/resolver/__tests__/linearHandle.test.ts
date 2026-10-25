// Linear strip handle (z_handles D17): a 35 strip of the front's own board on
// its face — horizontal at the top of base doors / drawers, vertical against the
// non-hinged edge of tall doors — sharknose edge bare, screws ≤ 350 apart from
// the back of the front, length overridable per front.
import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type HandleProductInput, type HandleScheduleEntryInput, type HandleRole } from '../types'
import { handleShape } from '../../handleGeometry'

const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const linear: HandleProductInput = {
  id: 'lin', name: 'Linear 35', grip_kind: 'linear', handle_type: 'linear', length: null, bore_centres: null, projection: null,
  cost_per_unit: null, hole_dia_mm: 4.5, holes: [], needs_finger_gap: false, bevel_angle_deg: 38, bevel_land_mm: 0,
  strip_width_mm: 35, screw_spacing_mm: 350, screw_inset_mm: 50,
}
const row = (orientation: 'horizontal' | 'vertical'): HandleScheduleEntryInput => ({ handle: linear, offset_from_edge_mm: 0, inset_from_side_mm: null, orientation })
const schedule: Partial<Record<HandleRole, HandleScheduleEntryInput>> = {
  door_base: row('horizontal'), drawer: row('horizontal'), door_tall: row('vertical'),
}
const twoDoors = {
  rows: [{ row_index: 0, height_locked: false }],
  cols: [{ col_index: 0, width_locked: false }, { col_index: 1, width_locked: false }],
  zones: [
    { row_index: 0, col_index: 0, face_type: 'door' as const, hinge_side: 'left' as const },
    { row_index: 0, col_index: 1, face_type: 'door' as const, hinge_side: 'right' as const },
  ],
}
function cab(o: Partial<CabinetInput> = {}): CabinetInput {
  return {
    id: 'c1', assembly_class: 'base', DX: 900, DY: 900, DZ: 580,
    has_carcass: true, has_internal: false, has_face: true, has_toekick: true,
    left_neighbour: 'wall', right_neighbour: 'cabinet', exposed_interior: false,
    material: board, door_material: board, shelf_material: board, exposed_material: board,
    toekick_face_material: board, toekick_interior_material: board,
    slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
    face_grid: twoDoors, internal_tree: { type: 'open', fittings: [] },
    handle_schedule: schedule, handle_products: { lin: linear },
    ...o,
  }
}
const strips = (rp: ReturnType<typeof resolveCabinet>) => rp.case_parts.filter(p => p.part_key.startsWith('lh:'))

describe('linear strip handle', () => {
  it('base doors: a full-width 35 strip on the face, flush with the top, sharknose underneath', () => {
    const rp = resolveCabinet(cab())
    const [l, r] = rp.face_zones
    expect(l.handle).toMatchObject({ grip_kind: 'linear', orientation: 'horizontal', bevel: null })
    expect(l.handle!.strip).toMatchObject({ x0: 0, y0: l.DY - 35, w: l.DX, h: 35, bevel_edge: 'bottom', angle_deg: 38, land: 0, overridden: false })
    const ps = strips(rp)
    expect(ps).toHaveLength(2)
    const p = ps[0]
    // face-kind: DX = height (35), DY = length, standing on the door's face
    expect(p).toMatchObject({ X: l.X, Y: l.Y + l.DY - 35, Z: l.Z + l.DZ, DX: 35, DY: l.DX, DZ: l.DZ, material_id: l.material_id, grain_direction: 'horizontal' })
    expect(p.edge_band).toMatchObject({ top: true, bottom: false, left: true, right: true })
    expect(p.lh).toEqual({ bevel_edge: 'bottom', angle_deg: 38, land: 0 })
    expect(r.handle!.strip!.x0).toBe(0)
  })

  it('screws along the centre line, ≤ 350 apart, 50 in from the ends', () => {
    const [l] = resolveCabinet(cab()).face_zones
    const xs = l.handle!.holes.map(h => h.x)
    expect(xs[0]).toBeCloseTo(50); expect(xs[xs.length - 1]).toBeCloseTo(l.DX - 50)
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeLessThanOrEqual(350)
    for (const h of l.handle!.holes) expect(h.y).toBeCloseTo(l.DY - 17.5)
  })

  it('holes switch off like any handle (HANDLE_DRILL / per front)', () => {
    const off = cab({ face_grid: { ...twoDoors, zones: twoDoors.zones.map(z => ({ ...z, handle_drill: false })) } })
    const [l] = resolveCabinet(off).face_zones
    expect(l.handle!.holes).toEqual([])
    expect(l.handle!.strip).toBeTruthy()   // the strip is still made
  })

  it('tall doors: vertical, full height against the non-hinged edge, sharknose on the hinge side', () => {
    const rp = resolveCabinet(cab({ assembly_class: 'tall', DY: 2300 }))
    const [l, r] = rp.face_zones
    expect(l.handle!.strip).toMatchObject({ x0: l.DX - 35, y0: 0, w: 35, h: l.DY, bevel_edge: 'left' })
    expect(r.handle!.strip).toMatchObject({ x0: 0, w: 35, h: r.DY, bevel_edge: 'right' })
    const p = strips(rp)[0]
    expect(p).toMatchObject({ DX: l.DY, DY: 35, grain_direction: 'vertical' })
    expect(p.edge_band).toMatchObject({ top: true, bottom: true, left: false, right: true })
  })

  it('length override: shorter strip keeps to the non-hinged side, flagged overridden', () => {
    const g = { ...twoDoors, zones: twoDoors.zones.map((z, i) => (i === 0 ? { ...z, handle_length: 200 } : z)) }
    const [l] = resolveCabinet(cab({ face_grid: g })).face_zones
    expect(l.handle!.strip).toMatchObject({ w: 200, x0: l.DX - 200, overridden: true, full: l.DX })
  })

  it('drawers: centred when shortened; the bar drawing skips the strip (its case part draws it)', () => {
    const grid = {
      rows: [{ row_index: 0, height_locked: false }], cols: [{ col_index: 0, width_locked: false }],
      zones: [{ row_index: 0, col_index: 0, face_type: 'drawer_face' as const, handle_length: 300 }],
    }
    const [z] = resolveCabinet(cab({ face_grid: grid })).face_zones
    expect(z.handle!.strip!.x0).toBeCloseTo((z.DX - 300) / 2)
    expect(handleShape(z)!.kind).toBe('strip')
  })
})

describe('linear strip sharknose shape (3D / drawings)', () => {
  it('horizontal strip: back of the bottom edge cut away at the saw tilt (side profile)', async () => {
    const { partShapes } = await import('../../partSolids')
    const rp = resolveCabinet(cab())
    const p = rp.case_parts.find(q => q.part_key === 'lh:0')!
    const s = partShapes(rp).get('case_lh:0')!
    const run = 18 * Math.tan((38 * Math.PI) / 180)
    expect(s.extrude).toBe('across')
    expect(s.pts[0].x).toBe(0); expect(s.pts[0].y).toBeCloseTo(run)   // back face meets the bevel `run` up
    expect(s.pts[1]).toEqual({ x: 18, y: 0 })                           // knife edge at the front, bottom
    expect(Math.max(...s.pts.map(q => q.y))).toBeCloseTo(p.DX)          // full 35 high
  })

  it('vertical strip: top-view outline, bevel on the hinge-side back corner', async () => {
    const { partShapes } = await import('../../partSolids')
    const rp = resolveCabinet(cab({ assembly_class: 'tall', DY: 2300 }))
    const s = partShapes(rp).get('case_lh:0')!   // left door → strip on its right edge, bevel left
    const run = 18 * Math.tan((38 * Math.PI) / 180)
    expect(s.extrude).toBe('up')
    expect(s.pts).toContainEqual({ x: 0, y: 0 })
    expect(s.pts.find(q => q.y === 18 && q.x < 35)!.x).toBeCloseTo(run)
  })
})
