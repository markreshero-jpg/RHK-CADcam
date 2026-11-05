import { describe, it, expect, vi } from 'vitest'
vi.mock('@/src/lib/supabase', () => ({ supabase: {} }))
import { cutoutOps } from '@/app/canvas/[roomId]/partEditor/usePartOps'
import { flatDims } from '@/app/canvas/[roomId]/partEditor/partEditorCore'
import type { PartMeta } from '@/src/components/three/PartViewer'

// RHK6592 WC-08 under panel: 1543 long × 380 deep × 18, rangehood hole x 499–999 / y 16.5–363.5 (back from the front), 0.3 skin.
const panel: PartMeta = {
  id: 'custom_x', label: 'Under Panel', w: 1543, h: 18, d: 380, thickness: 18, panelKind: 'horizontal',
  edge: { top: true, bottom: false, left: false, right: false },
  cutouts: [{ pts: [{ x: 499, y: 16.5 }, { x: 999, y: 16.5 }, { x: 999, y: 363.5 }, { x: 499, y: 363.5 }], skin: 0.3 }],
}

describe('Part Editor cut-out rows', () => {
  it('lists the resolver hole as a read-only pocket in the op frame, depth = thickness − skin', () => {
    const { u, v, n } = flatDims(panel)
    const [op] = cutoutOps(panel, u, v, n)
    expect(op).toMatchObject({ operation_type: 'route', operation_action: 'pocket', depth: 17.7, size_dx: 347, size_dy: 500, pos_x: 190, pos_y: 749 })
    expect(op.parameters).toMatchObject({ generated: 'cutout', virtual: true })
  })
  it('none without cut-outs', () => {
    expect(cutoutOps({ ...panel, cutouts: undefined }, 380, 1543, 18)).toEqual([])
  })
})
