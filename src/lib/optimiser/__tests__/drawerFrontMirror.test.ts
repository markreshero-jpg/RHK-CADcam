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

  it('leaves hand-added holes alone', () => {
    expect(drill(op('', 106, { operation_key: null }))).toMatchObject({ x: 10 + 106 })
  })

  // RHK6563 Study WC-01 (Mark 2026-11-26): a 448 x 1375 overhead door, hinged left,
  // Momo Dallas 128 at 50 from the hinge-free edge, holes 50 + 178 up from the bottom.
  // Unmirrored it came off the machine with the handle at the top.
  describe('doors are mirrored the same way', () => {
    const door: PartRef = { ...part, w: 448, h: 1375 }
    const doorSheet: NestedSheet = { ...sheet, placements: [{ ...sheet.placements[0], w: 448, h: 1375 }] }
    const d = (o: DrillOpRaw, p: PartRef = door) => drill(o, p, doorSheet)
    it('hinge cups go to the other edge on the sheet, height unchanged', () => {
      expect(d(op('hinge_0_0_0', 22, { pos_y: 100 }))).toMatchObject({ x: 10 + 426, y: 20 + 100 })
      expect(d(op('hinge_0_0_2', 22, { pos_y: 1275 }))).toMatchObject({ x: 10 + 426, y: 20 + 1275 })
    })
    it('handle holes swap ends too, still at the bottom', () => {
      expect(d(op('handle_0_0', 398, { pos_y: 50 }))).toMatchObject({ x: 10 + 50, y: 20 + 50 })
      expect(d(op('handle_0_0', 398, { pos_y: 178 }))).toMatchObject({ x: 10 + 50, y: 20 + 178 })
    })
    it('the cut door is the drawing turned over, not mirrored: hinge and handle keep their sides', () => {
      // Seen from the back (as machined) the hinge edge is on the right; turned over
      // side to side it is on the left again, handle opposite and at the bottom.
      const hinge = d(op('hinge_0_0_0', 22, { pos_y: 100 }))!, handle = d(op('handle_0_0', 398, { pos_y: 50 }))!
      expect(hinge.x).toBeGreaterThan(handle.x)
      expect(handle.y).toBeLessThan(20 + 1375 / 2)
    })
    it('bi-fold fittings too', () => {
      expect(d(op('bifold_0_0', 60))).toMatchObject({ x: 10 + 388 })
    })
  })

  it('leaves a gable runner hole alone', () => {
    const gable: PartRef = { ...part, source_table: 'case_parts', source_part_key: 'case_left_side' }
    const o = op('slide_0_0', 106, { source_table: 'case_parts', source_part_key: 'case_left_side', output_face: 'left' })
    expect(drill(o, gable)).toMatchObject({ x: 10 + 106 })
  })
})
