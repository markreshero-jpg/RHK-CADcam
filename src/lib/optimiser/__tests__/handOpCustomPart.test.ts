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

  // RHK6586 WC-10 LED: grooves along the wall (90) and on the 45 (315) drew front to back.
  it('groove follows angle_az like the CNC (0 = along pos_x, 90 = along pos_y)', () => {
    const groove = (angle_az: number): HandOpRow => ({ ...route, id: 'g' + angle_az, operation_type: 'groove', size_dx: null, size_dy: null,
      pos_x: 34.25, pos_y: 100, length: 200, width: 18.5, angle_az })
    const ends = (a: number) => {
      const [m] = handOpMarkers(rp, [groove(a)], [under])
      if (m?.kind !== 'groove') throw new Error('no groove')
      return m.ends.map(e => [+e.z.toFixed(2), +e.x.toFixed(2)])       // z = depth from the back, x = across
    }
    expect(ends(0)).toEqual([[34.25, 100], [234.25, 100]])
    expect(ends(90)).toEqual([[34.25, 100], [34.25, 300]])
    expect(ends(315)).toEqual([[34.25, 100], [175.67, -41.42]])
  })

  // Views and CNC share routes.opPartGeom: an area set by its edges (no size) draws too.
  it('area op set by edge offsets uses the part size, like the CNC', () => {
    const edges: HandOpRow = { ...route, id: 'e1', size_dx: null, size_dy: null, pos_x: null, pos_y: null,
      offset_left_mm: 25, offset_right_mm: 268.5, offset_bottom_mm: 10, offset_top_mm: 10 }
    const [m] = handOpMarkers(rp, [edges], [under])
    expect(m?.kind).toBe('area')
    if (m?.kind !== 'area') return
    const zs = m.corners.map(c => c.z), xs = m.corners.map(c => c.x)
    expect([Math.min(...zs), Math.max(...zs)]).toEqual([25, 43.5])     // 25 off the back, 18.5 wide
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([10, 690])
  })

  it('falls back to rp.custom_parts, and skips a missing part', () => {
    expect(handOpMarkers({ ...rp, custom_parts: [under] } as unknown as ResolvedCabinet, [route])).toHaveLength(1)
    expect(handOpMarkers(rp, [route], [])).toHaveLength(0)
  })
})
