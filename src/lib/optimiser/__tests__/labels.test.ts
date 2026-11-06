import { describe, it, expect } from 'vitest'
import { labelsPdf, a4Grid, sheetNumbers, buildAllLabels, buildLabelData, HAND_CUT_KEY, DEFAULT_LABEL_SETTINGS, type LabelData, type LabelLookups } from '../labels'
import type { NestedSheet, NestResult, NestPartInput } from '../nest'
import type { OptiPart } from '../types'

const label = (n: number): LabelData => ({
  projectName: 'RHK0000 Test', room: 'Kitchen', cabType: 'B1D', part: 'Left Gable', material: 'Whiteboard 16.5mm', colour: 'White',
  grainMatch: null, edging: '1L 2W', comment: '', cab: 'BC-01', sheetNo: 1, sheetKey: 1, partNo: n, len: 870, wid: 560, grainAcross: false,
  pic: { W: 560, H: 870, edges: [[{ x: 0, y: 0 }, { x: 0, y: 870 }, true]], holes: [{ x: 37, y: 100, d: 5 }] },
})

describe('part labels (optimiser Stage 7)', () => {
  it('label printer: one page per label at the label size', async () => {
    const doc = await labelsPdf([label(1), label(2), label(3)], { ...DEFAULT_LABEL_SETTINGS, w: 62, h: 29 })
    expect(doc.getNumberOfPages()).toBe(3)
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(62, 0)
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(29, 0)
  })

  it('A4: tiles as many as fit, then a new page', async () => {
    const g = a4Grid(102, 48)
    expect([g.cols, g.rows]).toEqual([2, 6])   // 204 × 291 usable
    const doc = await labelsPdf(Array.from({ length: 13 }, (_, i) => label(i + 1)), { ...DEFAULT_LABEL_SETTINGS, printer: 'a4' })
    expect(doc.getNumberOfPages()).toBe(2)
  })

  it('sheet numbers restart for each material', () => {
    const sh = (index: number, materialId: string, thickness = 16.5) => ({ index, materialId, thickness }) as NestedSheet
    // Whiteboard ×3, LX ×2, a Whiteboard sheet added last (Stage 5), and a deleted index (gap).
    const nums = sheetNumbers([sh(0, 'wb'), sh(1, 'wb'), sh(3, 'wb'), sh(4, 'lx', 18), sh(5, 'lx', 18), sh(6, 'wb')])
    expect([...nums.entries()]).toEqual([
      [0, { no: 1, of: 4 }], [1, { no: 2, of: 4 }], [3, { no: 3, of: 4 }],
      [4, { no: 1, of: 2 }], [5, { no: 2, of: 2 }], [6, { no: 4, of: 4 }],
    ])
  })

  it('parts too big for a sheet still get labels, as hand cut', async () => {
    const part = (uid: string, w: number, h: number) => ({
      uid, source_table: 'toekick_parts', source_part_id: uid, source_part_key: 'kick_front_face', cabinet_instance_id: 'c', cabinet_label: 'KICK 1',
      room_id: 'r', room_name: 'Robe', project_id: 'p', job_number: null, label: 'Kick Face', default_label: 'Kick Face', part_type_key: 'kick_front_face',
      w, h, thickness: 16.5, eb_w1: 0, eb_w2: 0, eb_h1: 0, eb_h2: 0, eb_missing: false, material_id: 'wb', grain_direction: null,
    }) as unknown as OptiPart
    const parts = [part('a', 80, 600), part('big', 80, 2600)]
    const inp = (p: OptiPart, i: number) => ({ uid: `${p.uid}#${i}`, baseUid: p.uid, label: p.label, w: p.w, h: p.h, thickness: 16.5, materialId: 'wb', grainLock: false, priority: 0 }) as NestPartInput
    const nest = {
      sheets: [{ index: 0, materialId: 'wb', thickness: 16.5, placements: [{ uid: 'a#0', baseUid: 'a', label: 'Kick Face', x: 5, y: 5, w: 80, h: 600, rotated: false }] }],
      unplaced: [inp(parts[1], 0), inp(parts[1], 1)],
    } as unknown as NestResult
    const look: LabelLookups = { projectName: 'RHK6542', cabType: new Map(), tapeName: new Map(), colourName: new Map(), matName: () => 'Whiteboard 16.5mm' }
    const out = buildAllLabels(nest, new Map(parts.map(p => [p.uid, p])), new Map(), false, look, 'cut')
    expect(out).toHaveLength(3)
    const hand = out.filter(l => l.handCut)
    expect(hand.map(l => [l.sheetKey, l.partNo, l.len])).toEqual([[HAND_CUT_KEY, 1, 2600], [HAND_CUT_KEY, 2, 2600]])
    expect((await labelsPdf(hand, DEFAULT_LABEL_SETTINGS)).getNumberOfPages()).toBe(2)
  })
  it('left gable: front tape drawn on the edge its (mirrored) drilling puts at the front', () => {
    // RHK6581 BC-04 (Mark 2026-11-06): both gables tape the front = edge_band_right = w2.
    // The left gable's ops are stored mirrored (front rail holes at x 8.25), so on
    // the label its tape must be the x = 0 edge; the right gable keeps x = w.
    const gable = (key: string) => ({
      uid: key, source_table: 'case_parts', source_part_id: key, source_part_key: key, cabinet_instance_id: 'c', cabinet_label: 'BC-04',
      room_id: 'r', room_name: 'Laundry J03', project_id: 'p', job_number: null, label: key, default_label: key, part_type_key: key,
      w: 560, h: 780, thickness: 16.5, eb_w1: 0, eb_w2: 1, eb_h1: 0, eb_h2: 0, eb_on: [false, true, false, false], eb_missing: false, material_id: 'wb', grain_direction: null,
    }) as unknown as OptiPart
    const look: LabelLookups = { projectName: 'RHK6581', cabType: new Map(), tapeName: new Map(), colourName: new Map(), matName: () => 'Whiteboard 16.5mm' }
    const pl = { uid: 'x', baseUid: 'x', label: 'x', x: 5, y: 5, w: 560, h: 780, rotated: false }
    const tapedX = (key: string) => buildLabelData(gable(key), pl, 1, 1, [], false, look, undefined, 'finished')
      .pic.edges.filter(e => e[2]).map(([a, b]) => [a.x, b.x])
    expect(tapedX('case_left_side')).toEqual([[0, 0]])
    expect(tapedX('case_right_side')).toEqual([[560, 560]])
  })
})
