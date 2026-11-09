import { describe, it, expect } from 'vitest'
import { buildSheetDrills, groupDrillOps, type DrillOpRaw, type PartRef } from '../drills'
import type { NestedSheet } from '../nest'

// RHK6570 Bed 3 BC-03: a 586 wide front on a cabinet with a 75 left scribe, so the
// runner holes are 106 from the left and 31 from the right as seen from the front.
// The front is machined back face up, so on the sheet those swap ends.
const sheet: NestedSheet = {
  index: 0, materialId: null, thickness: 18, efficiency: 0.5,
  stock: { w: 2400, h: 1200, trimTop: 10, trimBottom: 10, trimLeft: 10, trimRight: 10, isOffcut: false, label: null },
  placements: [{ uid: 'f1', baseUid: 'f1', label: 'Front', x: 10, y: 20, w: 586, h: 230, rotated: false }],
}
const part: PartRef = { source_table: 'face_zones', cabinet_instance_id: 'c1', source_part_key: 'zone_0_0', w: 586, h: 230 }
const op = (operation_key: string, pos_x: number, extra: Partial<DrillOpRaw> = {}): DrillOpRaw => ({
  source_table: 'face_zones', source_cabinet_id: 'c1', source_part_key: 'zone_0_0', operation_key,
  output_face: 'front', pos_x, pos_y: 69, diameter: 10, depth: 12, repeat_count: 1, repeat_spacing: null, repeat_axis: null, ...extra,
})
const drill = (o: DrillOpRaw, p: PartRef = part, s: NestedSheet = sheet, twoSided = false) =>
  buildSheetDrills(s, new Map([['f1', p]]), groupDrillOps([o]), 18, twoSided)[0]

describe('drawer front drilling is mirrored for back-face-up machining', () => {
  it('runner holes swap ends across the front', () => {
    expect(drill(op('slide_0_0', 106))).toMatchObject({ x: 10 + 480, y: 20 + 69 })
    expect(drill(op('slide_0_0', 555))).toMatchObject({ x: 10 + 31, y: 20 + 69 })
  })

  it('marker pricks swap ends too', () => {
    expect(drill(op('df_marker_0_0', 60))).toMatchObject({ x: 10 + 526 })
  })

  it('takes off the tape on the edge the mirrored hole measures from', () => {
    const taped: PartRef = { ...part, deduct: true, eb_w1: 2, eb_w2: 1, eb_h1: 1 }
    expect(drill(op('slide_0_0', 106), taped)).toMatchObject({ x: 10 + 479, y: 20 + 68 })
  })

  it('stays mirrored in program A of a two-sided sheet', () => {
    expect(drill(op('slide_0_0', 106), part, sheet, true)).toMatchObject({ x: 10 + 480, program: 'A' })
  })

  it('follows a part turned on the sheet', () => {
    const turned: NestedSheet = { ...sheet, placements: [{ ...sheet.placements[0], w: 230, h: 586, rotated: true }] }
    expect(drill(op('slide_0_0', 106), part, turned)).toMatchObject({ x: 10 + 230 - 69, y: 20 + 480 })
  })

  it('leaves doors and hand-added holes alone', () => {
    expect(drill(op('hinge_0_0_0', 22))).toMatchObject({ x: 10 + 22 })
    expect(drill(op('handle_0_0', 106))).toMatchObject({ x: 10 + 106 })
    expect(drill(op('', 106, { operation_key: null }))).toMatchObject({ x: 10 + 106 })
  })

  it('leaves a gable runner hole alone', () => {
    const gable: PartRef = { ...part, source_table: 'case_parts', source_part_key: 'case_left_side' }
    const o = op('slide_0_0', 106, { source_table: 'case_parts', source_part_key: 'case_left_side', output_face: 'left' })
    expect(drill(o, gable)).toMatchObject({ x: 10 + 106 })
  })
})
