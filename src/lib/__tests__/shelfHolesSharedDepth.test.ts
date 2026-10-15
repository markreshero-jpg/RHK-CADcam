import { describe, it, expect } from 'vitest'
import { seamJointDrillOps } from '../jointDrilling'
import type { Box } from '@/src/components/three/PartViewer'
import type { JointTypeOp, ResolvedSeamJoint } from '../resolver/types'

// L corner (Mark, 2026-10-15): the shelf's bbox runs the 900 box depth, but the
// end panel it pins into is only 560 deep. Rows lay out along what they share.
const pin: JointTypeOp = {
  id: 'o1', joint_type_id: 'j1', operation_order: 0, target_part: 'part_b', machine_operation: 'drill',
  face: 'normal', tool_diameter_mm: 5, depth_mm: 12, offset_x_mm: 0, offset_y_mm: 0, offset_z_mm: 37,
  qty: 2, spacing_mm: null, qty2: 1, spacing2_mm: null, router_tool_id: null, drill_id: null,
  auto_tool: false, notes: null, expressions: { spacing_mm: 'SD - 74' },
}
const seam = (): ResolvedSeamJoint => ({
  seam_key: 'int_adj_shelf_0:right', joint_type_id: 'j1', joint_type_name: 'Shelf pins', source: 'method',
  part_a_key: 'int_adj_shelf_0', part_b_key: 'right_side', ops: [pin], internal_edge: 'right',
})
const side: Box = { x: 882, y: 0, z: 0, w: 18, h: 870, d: 560 }

describe('shelf pin rows follow the panel they drill into', () => {
  it('shelf deeper than the panel: rows 37 in from the panel front and back', () => {
    const shelf: Box = { x: 18, y: 400, z: 0, w: 864, h: 18, d: 880 }
    const zs = seamJointDrillOps(seam(), shelf, side).map(d => d.z).sort((a, b) => a - b)
    expect(zs).toEqual([37, 523])
  })

  it('plain box (shelf inside the side) is unchanged', () => {
    const box: Box = { ...side, d: 580 }
    const shelf: Box = { x: 18, y: 400, z: 0, w: 564, h: 18, d: 570 }
    const zs = seamJointDrillOps(seam(), shelf, box).map(d => d.z).sort((a, b) => a - b)
    expect(zs).toEqual([37, 533])
  })
})
