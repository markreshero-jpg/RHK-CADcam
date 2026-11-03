// Hand-added ops on custom parts project into cabinet space (RHK6542 WC-08:
// LED route in the underside of a flat under panel showed in no cabinet view).
import { describe, it, expect } from 'vitest'
import { handOpMarkers, type HandOpRow } from '../partOpProject'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'

const rp = { case_parts: [], face_zones: [], internal_parts: [] } as unknown as ResolvedCabinet
// WC-08 under panel: flat, 312 deep (dx) x 700 wide (dy) x 16.5, at the cabinet's bottom-left-back.
const under = { id: 'u1', orientation: 'flat', x: 0, y: 0, z: 0, dx: 312, dy: 700, dz: 16.5 }
const route: HandOpRow = {
  id: 'r1', source_part_key: 'custom_u1', operation_type: 'route', pos_x: 59.25, pos_y: 350,
  diameter: null, width: null, length: null, size_dx: 18.5, size_dy: 712, size_dz: null, depth: 9,
  pos_z: null, plane_kind: 'face_back', repeat_count: null, repeat_spacing: null, repeat_axis: null, parameters: null,
}

describe('hand ops on custom parts', () => {
  it('flat custom part: pos_x = depth from its back, pos_y across; face_back = underside', () => {
    const [m] = handOpMarkers(rp, [route], [under])
    expect(m?.kind).toBe('area')
    if (m?.kind !== 'area') return
    expect(m.normal).toBe('y')
    const zs = m.corners.map(c => c.z), xs = m.corners.map(c => c.x)
    expect([Math.min(...zs), Math.max(...zs)]).toEqual([50, 68.5])     // 50 off the back
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([-6, 706])      // 6 past both ends
    expect(m.corners.every(c => c.y === 0)).toBe(true)                 // on the underside
    expect(m.dir).toBe(1)                                              // cuts up into the panel
  })

  it('falls back to rp.custom_parts, and skips a missing part', () => {
    expect(handOpMarkers({ ...rp, custom_parts: [under] } as unknown as ResolvedCabinet, [route])).toHaveLength(1)
    expect(handOpMarkers(rp, [route], [])).toHaveLength(0)
  })
})
