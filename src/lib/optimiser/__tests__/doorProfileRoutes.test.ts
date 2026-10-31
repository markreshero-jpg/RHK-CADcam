import { describe, it, expect, vi } from 'vitest'
vi.mock('@/src/lib/supabase', () => ({ supabase: {} }))
import { collectDoorProfileRoutes } from '../seamDrillSync'
import type { ResolvedCabinet, ResolvedFaceZone, ResolvedProfileOp, ResolvedDoorProfile } from '../../resolver/types'

// Door profile face routes (two-sided spec §0 step 1). A 400 × 700 front, worked
// in the front view; front-face ops are stored mirrored across the width.
const op = (o: Partial<ResolvedProfileOp>): ResolvedProfileOp => ({
  operation_type: 'route', depth_mm: 5, width_mm: 6, offset_from_edge_mm: 0, repeat_axis: 'none', spacing_mm: null, face: 'front',
  router_tool_id: 'bit', tool_set_id: null, ...o,
})
const cab = (profile: ResolvedDoorProfile): ResolvedCabinet => ({
  case_parts: [], internal_parts: [], drawer_stacks: [], hinge_instances: [], internal_slides: [],
  face_zones: [{ row_index: 0, col_index: 0, face_type: 'door', X: 0, Y: 0, Z: 0, DX: 400, DY: 700, DZ: 18, AX: 0, AY: 0, AZ: 0, door_profile: profile } as unknown as ResolvedFaceZone],
} as unknown as ResolvedCabinet)
const rows = (p: ResolvedDoorProfile) => collectDoorProfileRoutes(cab(p), 'c1').rows

describe('door profile routes', () => {
  it('shaker pocket clears inside the offset, tool set carried', () => {
    const [r] = rows({ profile_type: 'perimeter_route', ops: [op({ operation_type: 'pocket', offset_from_edge_mm: 70, depth_mm: 8, router_tool_id: null, tool_set_id: 'set' })] })
    expect(r).toMatchObject({ operation_type: 'route', operation_action: 'pocket', pos_x: 200, pos_y: 350, size_dx: 260, size_dy: 560,
      depth: 8, tool_set_id: 'set', plane_kind: 'face_front', output_face: 'back', source_part_key: 'zone_0_0' })
  })
  it('bead outline rectangle is inset offset − width/2', () => {
    const [r] = rows({ profile_type: 'bead', ops: [op({ offset_from_edge_mm: 50, width_mm: 4 })] })
    expect(r).toMatchObject({ operation_action: null, size_dx: 304, size_dy: 604 })
  })
  it('VJ lines: vertical grooves every spacing, mirrored across the width', () => {
    const rs = rows({ profile_type: 'vj_lines', ops: [op({ repeat_axis: 'x', spacing_mm: 100 })] })
    expect(rs.map(r => r.pos_x)).toEqual([300, 200, 100])   // lines at 100/200/300 from the left, seen from the back
    for (const r of rs) expect(r).toMatchObject({ operation_type: 'groove', angle_az: 90, pos_y: 0, length: 700, width: 6 })
  })
  it('horizontal lines along y', () => {
    const rs = rows({ profile_type: 'vj_lines', ops: [op({ repeat_axis: 'y', spacing_mm: 300 })] })
    expect(rs.map(r => r.pos_y)).toEqual([300, 600])
    expect(rs[0]).toMatchObject({ pos_x: 0, length: 400 })
    expect(rs[0].angle_az).toBeUndefined()
  })
  it('back-face op is not mirrored', () => {
    const rs = rows({ profile_type: 'vj_lines', ops: [op({ repeat_axis: 'x', spacing_mm: 100, face: 'back' })] })
    expect(rs.map(r => r.pos_x)).toEqual([100, 200, 300])
    expect(rs[0]).toMatchObject({ plane_kind: 'face_back', output_face: 'front' })
  })
})
