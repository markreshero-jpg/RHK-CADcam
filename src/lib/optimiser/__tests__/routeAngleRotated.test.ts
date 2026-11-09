import { describe, it, expect } from 'vitest'
import { buildSheetRoutes, groupRouteOps, type RouteOpRaw } from '../routes'
import type { PartRef } from '../drills'
import type { NestedSheet } from '../nest'
import { rasterPath } from '../routePatterns'

// RHK6542 WC-04 bottom: an LED pocket 18.5 x 1929.5 along the panel, angle 90 (lanes
// along the part). Turned on the sheet, the lanes must still run along the part.
const op: RouteOpRaw = {
  source_table: 'case_parts', source_cabinet_id: 'c1', source_part_key: 'case_bottom', operation_type: 'route', operation_action: 'pocket',
  output_face: null, plane_kind: null, pos_x: 59.25, pos_y: 958.75, size_dx: 18.5, size_dy: 1929.5,
  offset_top_mm: null, offset_bottom_mm: null, offset_left_mm: null, offset_right_mm: null,
  length: null, width: null, angle_az: 0, depth: 9, size_dz: 9, fill_strategy: 'raster', raster_angle_deg: 90, raster_stepover_pct: 70,
  toolNumber: 110, toolDiameter: 8, maxDepthPerPass: null,
}
const part: PartRef = { source_table: 'case_parts', cabinet_instance_id: 'c1', source_part_key: 'case_bottom', w: 349, h: 1917.5 }
const sheetWith = (rotated: boolean): NestedSheet => ({
  index: 0, materialId: null, thickness: 33, efficiency: 0.5,
  stock: { w: 2400, h: 2400, trimTop: 5, trimBottom: 5, trimLeft: 5, trimRight: 5, isOffcut: false, label: null },
  placements: [{ uid: 'p', baseUid: 'p', label: 'Bottom', x: 5, y: 5, w: rotated ? 1917.5 : 349, h: rotated ? 349 : 1917.5, rotated }],
})
const lanes = (rotated: boolean, o: RouteOpRaw = op) => {
  const [r] = buildSheetRoutes(sheetWith(rotated), new Map([['p', part]]), groupRouteOps([o]))
  if (r.kind !== 'area') throw new Error('expected an area route')
  const inset = 4
  return { r, pts: rasterPath(r.x + inset, r.y + inset, r.x + r.w - inset, r.y + r.h - inset, 5.6, r.rasterAngleDeg) }
}

describe('a set raster angle turns with the part', () => {
  it('turned part: 3 long lanes along the sheet X', () => {
    const { pts } = lanes(true)
    expect(pts).toHaveLength(6)
    expect(Math.abs(pts[1].x - pts[0].x)).toBeGreaterThan(1900)
  })
  it('unturned part: the same 3 lanes along the sheet Y', () => {
    const { pts } = lanes(false)
    expect(pts).toHaveLength(6)
    expect(Math.abs(pts[1].y - pts[0].y)).toBeGreaterThan(1900)
  })
  it('0 stays auto, turned or not', () => {
    expect(lanes(true, { ...op, raster_angle_deg: 0 }).r).toMatchObject({ rasterAngleDeg: 0 })
    expect(lanes(true, { ...op, raster_angle_deg: null }).r).toMatchObject({ rasterAngleDeg: 0 })
  })
})
