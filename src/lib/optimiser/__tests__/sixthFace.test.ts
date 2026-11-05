import { describe, it, expect } from 'vitest'
import { buildSheetDrills, groupDrillOps, type DrillOpRaw, type PartRef } from '../drills'
import { buildSheetRoutes, groupRouteOps, type RouteOpRaw } from '../routes'
import { isTwoSidedSheet } from '../sheetDrills'
import { generateSheetPrograms, generateSheetGcode, DEFAULT_POST, gcodeFileName, type PostProfile } from '../gcode'
import type { NestedSheet } from '../nest'

// 6th face nesting (z_part_view two-sided spec §0). A 400 x 700 door at (10,10) on a
// 2400 x 1200 sheet: hinge cup on the back (the up face, program A) and a VJ groove
// on the front at 100 from the door's left, stored pre-mirrored (pos_x 300) the way
// collectDoorProfileRoutes writes it.
const sheet: NestedSheet = {
  index: 0, materialId: null, thickness: 18, efficiency: 0.5,
  stock: { w: 2400, h: 1200, trimTop: 10, trimBottom: 10, trimLeft: 10, trimRight: 10, isOffcut: false, label: null },
  placements: [{ uid: 'd1', baseUid: 'd1', label: 'Door', x: 10, y: 10, w: 400, h: 700, rotated: false }],
}
const part: PartRef = { source_table: 'face_zones', cabinet_instance_id: 'c1', source_part_key: 'zone_0_0', w: 400, h: 700 }
const partByUid = new Map([['d1', part]])
const hinge: DrillOpRaw = { source_table: 'face_zones', source_cabinet_id: 'c1', source_part_key: 'zone_0_0', output_face: 'front', pos_x: 22, pos_y: 100, diameter: 35, depth: 13, repeat_count: 1, repeat_spacing: null, repeat_axis: null }
const vj: RouteOpRaw = {
  source_table: 'face_zones', source_cabinet_id: 'c1', source_part_key: 'zone_0_0', operation_type: 'groove', operation_action: null,
  output_face: 'back', plane_kind: 'face_front', pos_x: 300, pos_y: 50, size_dx: null, size_dy: null,
  offset_top_mm: null, offset_bottom_mm: null, offset_left_mm: null, offset_right_mm: null,
  length: 600, width: 6, angle_az: 90, depth: 3, size_dz: null, fill_strategy: null, raster_angle_deg: null, raster_stepover_pct: null,
  toolNumber: 7, toolDiameter: 6, maxDepthPerPass: null,
}
const ops = { opsByKey: groupDrillOps([hinge]), routesByKey: groupRouteOps([vj]), partByUid, warnings: [] }
const post: PostProfile = { ...DEFAULT_POST, origin_corner: 'top_left', x_axis_direction: 'positive_right', y_axis_direction: 'positive_up' }

describe('6th face nesting', () => {
  it('a door with back drilling + a front route makes the sheet two-sided', () => {
    expect(isTwoSidedSheet(sheet, ops)).toBe(true)
    expect(isTwoSidedSheet(sheet, { ...ops, opsByKey: new Map() })).toBe(false)   // front only: one program
  })

  it('back ops stay put in A; the front route is un-mirrored to where it really is', () => {
    const [d] = buildSheetDrills(sheet, partByUid, ops.opsByKey, 18, true)
    expect(d).toMatchObject({ x: 32, y: 110, program: 'A' })
    const [r] = buildSheetRoutes(sheet, partByUid, ops.routesByKey, true, 18)
    expect(r).toMatchObject({ kind: 'groove', x1: 110, y1: 60, program: 'Z' })
    // One-program sheet: exactly as before (stored mirror, no program tag).
    const [r1] = buildSheetRoutes(sheet, partByUid, ops.routesByKey)
    expect(r1).toMatchObject({ x1: 310 }); expect(r1.program).toBeUndefined()
  })

  it('A = drilling + 2 trims, no parts cut; Z = flipped over the long edge, trimmed edges at X0 / Y0', () => {
    const drills = buildSheetDrills(sheet, partByUid, ops.opsByKey, 18, true)
    const routes = buildSheetRoutes(sheet, partByUid, ops.routesByKey, true, 18)
    const progs = generateSheetPrograms({ sheet, thickness: 18, profile: post, drills, routes, toolNumber: 1, toolDiameter: 12 })
    expect(progs.map(p => p.program)).toEqual(['A', 'Z'])
    const [a, z] = progs
    expect(a.gcode).toContain('PROGRAM A OF 2')
    expect(a.gcode).toContain('Trim 5mm off the X0 end')
    expect(a.gcode).toContain('Trim 5mm off the outside long edge')
    expect(a.gcode).not.toContain('(Part Door)')
    expect(z.gcode).toContain('PROGRAM Z OF 2')
    expect(z.gcode).toContain('(Part Door)')
    // Z frame: x - 5 (X0 end trimmed), y mirrored about the 1200 sheet (fence at the top
    // edge, the bottom long edge trimmed + flipped up to it). Stock 2395 x 1195.
    expect(z.sheet.stock).toMatchObject({ w: 2395, h: 1195 })
    expect(z.sheet.placements[0]).toMatchObject({ x: 5, y: 490, w: 400, h: 700 })
    // The VJ groove at 100 in from the door's edge, 50 up from its bottom (now y 1190).
    // Machine Y = y - H (top_left origin): 1140 - 1195 = -55.
    expect(z.gcode).toMatch(/X105\.? Y-55\.?/)
    // Trims: the outside (bottom) long edge at y = 5 - 6 = -1, from 30 + 6 past the far
    // end (over-length boards) to X0; then the X0 end at x = -1, from 36 below the
    // sheet up to the fence.
    expect(a.gcode).toMatch(/X2436\.? Y-1201\.?/)
    expect(a.gcode).toMatch(/G0 X-1\.? Y-1236\.?/)
    // Long edge first from the far end, then the X0 end, finishing at X0 / Y0.
    expect(a.gcode.indexOf('off the outside long edge')).toBeLessThan(a.gcode.indexOf('off the X0 end'))
    const trimTail = a.gcode.slice(a.gcode.indexOf('off the X0 end'))
    expect(trimTail).toMatch(/X-1\.? Y0\.?/)
  })

  it('a one-face sheet is the same program as before', () => {
    const drills = buildSheetDrills(sheet, partByUid, ops.opsByKey, 18, false)
    const input = { sheet, thickness: 18, profile: post, drills, routes: [], toolNumber: 1, toolDiameter: 12 }
    const progs = generateSheetPrograms(input)
    expect(progs).toHaveLength(1)
    expect(progs[0].program).toBeNull()
    expect(progs[0].gcode).toBe(generateSheetGcode(input))
  })

  it('warns when a part sits in the trim strip', () => {
    const tight = { ...sheet, placements: [{ ...sheet.placements[0], x: 2 }] }
    const drills = buildSheetDrills(tight, partByUid, ops.opsByKey, 18, true)
    const routes = buildSheetRoutes(tight, partByUid, ops.routesByKey, true, 18)
    const [a] = generateSheetPrograms({ sheet: tight, thickness: 18, profile: post, drills, routes, toolNumber: 1, toolDiameter: 12 })
    expect(a.warnings[0]).toMatch(/inside the 5mm 6th face trim/)
  })

  it('names the pair _01A / _01Z', () => {
    expect(gcodeFileName({ batch: false, jobNumber: 'RHK6570', dateStr: '', materialCode: 'Whiteboard16', sheetNumber: 1, ext: 'anc', runNo: 3, program: 'A' })).toBe('RHK6570_R3_Whiteboard16_01A.anc')
    expect(gcodeFileName({ batch: false, jobNumber: 'RHK6570', dateStr: '', materialCode: 'Whiteboard16', sheetNumber: 1, ext: 'anc', runNo: 3 })).toBe('RHK6570_R3_Whiteboard16_01.anc')
  })
})
