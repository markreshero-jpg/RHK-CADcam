// Hand ops carry their Part Editor face to the CNC (handOpFace.ts). RHK6586 WC-09
// under panel (Mark, 2026-11-15): LED pocket on the underside (face_back), rangehood
// hole right through. It used to route the pocket into the top; the panel turned
// over to get the LED underneath put the hole at the wrong end.
import { describe, it, expect } from 'vitest'
import { groupDrillOps, type DrillOpRaw, type PartRef } from '../drills'
import { buildSheetRoutes, groupRouteOps, type RouteOpRaw } from '../routes'
import { buildSheetDrills } from '../drills'
import { isTwoSidedSheet, flipHandDownParts } from '../sheetDrills'
import { handOpUpNormal, handOpOnDownFace } from '../handOpFace'
import type { NestedSheet, NestResult } from '../nest'

const KEY = 'custom_u1'
// 361 deep (u, from the back) x 1650 long (v), laid unrotated at (10, 10).
const sheet: NestedSheet = {
  index: 0, materialId: null, thickness: 16.5, efficiency: 0.5,
  stock: { w: 2400, h: 1200, trimTop: 5, trimBottom: 5, trimLeft: 5, trimRight: 5, isOffcut: false, label: null },
  placements: [{ uid: 'u1', baseUid: 'u1', label: 'Under Panel', x: 10, y: 10, w: 361, h: 1650, rotated: false }],
}
const part: PartRef = { source_table: 'custom_parts', cabinet_instance_id: 'c1', source_part_key: KEY, w: 361, h: 1650 }
const partByUid = new Map([['u1', part]])
const route = (o: Partial<RouteOpRaw>): RouteOpRaw => ({
  source_table: 'custom_parts', source_cabinet_id: 'c1', source_part_key: KEY, operation_type: 'route', operation_action: 'pocket',
  output_face: null, plane_kind: 'face_back', pos_x: 34.25, pos_y: 825, size_dx: 18.5, size_dy: 1662,
  offset_top_mm: null, offset_bottom_mm: null, offset_left_mm: null, offset_right_mm: null,
  length: null, width: null, angle_az: 0, depth: 9, size_dz: 9, fill_strategy: 'raster', raster_angle_deg: 90, raster_stepover_pct: 40,
  toolNumber: 110, toolDiameter: 8, maxDepthPerPass: null, ...o,
})
const led = route({ hand_down: true })
const ops = (routes: RouteOpRaw[], drills: DrillOpRaw[] = []) => ({ opsByKey: groupDrillOps(drills), routesByKey: groupRouteOps(routes), partByUid, warnings: [] })
const nest = (s: NestedSheet): NestResult => ({ sheets: [s], unplaced: [] })

describe('hand op faces', () => {
  it('Back face is the down face on flat / front custom parts, carcass horizontals and shelves only', () => {
    expect(handOpUpNormal('custom_parts', KEY, 'flat')).toBe(1)
    expect(handOpUpNormal('custom_parts', KEY, null)).toBe(1)
    expect(handOpUpNormal('custom_parts', KEY, 'side')).toBeNull()
    expect(handOpUpNormal('case_parts', 'case_bottom', null)).toBe(1)
    expect(handOpUpNormal('case_parts', 'case_full_top', null)).toBe(1)
    expect(handOpUpNormal('case_parts', 'case_left_side', null)).toBeNull()
    expect(handOpUpNormal('case_parts', 'case_back', null)).toBeNull()
    expect(handOpUpNormal('internal_parts', 'int_fixed_shelf_0', null)).toBe(1)
    expect(handOpUpNormal('face_zones', 'zone_0_0', null)).toBeNull()
    expect(handOpOnDownFace({ plane_kind: 'face_back' }, 1)).toBe(true)
    expect(handOpOnDownFace({ plane_kind: 'face_front' }, 1)).toBe(false)               // default = up, as it always cut
    expect(handOpOnDownFace({ plane_kind: 'face_back', output_face: 'top' }, 1)).toBe(false)   // generated: output_face rules
    expect(handOpOnDownFace({ plane_kind: 'face_back' }, null)).toBe(false)
  })

  it('underside-only work turns the part over: one program, pocket on top, everything mirrored', () => {
    const o = ops([led])
    expect(isTwoSidedSheet(sheet, o)).toBe(true)                 // left as laid it would need program Z
    const flipped = flipHandDownParts(nest(sheet), o)
    const pl = flipped.sheets[0].placements[0]
    expect(pl.mirrored).toBe(true)
    expect(isTwoSidedSheet(flipped.sheets[0], o)).toBe(false)    // one program
    const [r] = buildSheetRoutes(flipped.sheets[0], partByUid, o.routesByKey)
    expect(r.program).toBeUndefined()
    // 25 off the back (u 25..43.5) → mirrored across the 361 width: 317.5..336 from the u-min side.
    expect(r).toMatchObject({ kind: 'area', x: 10 + 361 - 43.5, w: 18.5 })
  })

  it('a through hole does not stop the flip; blind work on both faces is a 6th face pair', () => {
    const through: DrillOpRaw = { source_table: 'custom_parts', source_cabinet_id: 'c1', source_part_key: KEY, output_face: null, pos_x: 100, pos_y: 100, diameter: 8, depth: 16.5, repeat_count: 1, repeat_spacing: null, repeat_axis: null }
    expect(flipHandDownParts(nest(sheet), ops([led], [through])).sheets[0].placements[0].mirrored).toBe(true)
    const topGroove = route({ plane_kind: 'face_front', operation_type: 'groove', operation_action: null, length: 300, width: 6, size_dx: null, size_dy: null, pos_x: 200, pos_y: 100, angle_az: 90, depth: 3 })
    const both = ops([led, topGroove])
    expect(flipHandDownParts(nest(sheet), both).sheets[0].placements[0].mirrored).toBeUndefined()
    expect(isTwoSidedSheet(sheet, both)).toBe(true)
    const rs = buildSheetRoutes(sheet, partByUid, both.routesByKey, true, 16.5)
    expect(rs.find(r => r.kind === 'area')).toMatchObject({ program: 'Z', x: 10 + 25 })   // stored as it sits: no un-mirror
    expect(rs.find(r => r.kind === 'groove')).toMatchObject({ program: 'A' })
  })

  it('a true-shape part is not turned (runs as a 6th face pair)', () => {
    const shapedMap = new Map([['u1', { ...part, shaped: true }]])
    const o = { ...ops([led]), partByUid: shapedMap }
    expect(flipHandDownParts(nest(sheet), o).sheets[0].placements[0].mirrored).toBeUndefined()
    expect(isTwoSidedSheet(sheet, o)).toBe(true)
  })

  it('a hand drill on the underside turns the part too', () => {
    const blind: DrillOpRaw = { source_table: 'custom_parts', source_cabinet_id: 'c1', source_part_key: KEY, output_face: null, plane_kind: 'face_back', hand_down: true, pos_x: 50, pos_y: 60, diameter: 5, depth: 10, repeat_count: 1, repeat_spacing: null, repeat_axis: null }
    const o = ops([], [blind])
    const s = flipHandDownParts(nest(sheet), o).sheets[0]
    expect(s.placements[0].mirrored).toBe(true)
    const [d] = buildSheetDrills(s, partByUid, o.opsByKey, 16.5)
    expect(d).toMatchObject({ x: 10 + 361 - 50, y: 70 })
  })
})
