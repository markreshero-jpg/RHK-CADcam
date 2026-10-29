import { describe, it, expect } from 'vitest'
import { labelsPdf, a4Grid, DEFAULT_LABEL_SETTINGS, type LabelData } from '../labels'

const label = (n: number): LabelData => ({
  projectName: 'RHK0000 Test', room: 'Kitchen', cabType: 'B1D', part: 'Left Gable', material: 'Whiteboard 16.5mm', colour: 'White',
  grainMatch: null, edging: '1L 2W', comment: '', cab: 'BC-01', sheetNo: 1, partNo: n, len: 870, wid: 560, grainAcross: false,
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
})
