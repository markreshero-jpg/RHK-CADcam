import { describe, it, expect } from 'vitest'
import { segmentsFromLegacy, waterfallBuildUp } from '@/src/lib/benchtopGeometry'
import { benchtopGeometries } from '@/src/lib/benchtopSolids'
import type { BenchtopInstance, BenchtopEdgeProfile } from '@/src/lib/types'

const prof = (id: string, generates: BenchtopEdgeProfile['generates'], apron_drop_mm: number | null = null) =>
  ({ id, code: id, name: id, category: 'stone', description: null, generates, apron_drop_mm, radius_mm: null, preview_svg: null, sort_order: 0, active: true, created_at: '', updated_at: '' }) as BenchtopEdgeProfile
const profiles = { APR: prof('APR', 'apron', 60), WF: prof('WF', 'waterfall') }

// Island 2400 x 900: APR 60 front / back / right, waterfall on the left (RHK6592 BT2).
const segs = segmentsFromLegacy([{ x: 0, y: 0 }, { x: 2400, y: 0 }, { x: 2400, y: 900 }, { x: 0, y: 900 }], [], [])
segs[0].edge = { profile_id: 'APR' }; segs[1].edge = { profile_id: 'APR' }; segs[2].edge = { profile_id: 'APR' }
segs[3].edge = { profile_id: 'WF', waterfall_join: 'mitre' }
const bt = { id: 'bt', segments: segs, cutout_polygons: [] } as unknown as BenchtopInstance

describe('built-up waterfall', () => {
  it('both ends of an island leg between aprons are built up to the drop', () => {
    expect(waterfallBuildUp(segs, 3, profiles, null, 20)).toEqual({ start: 60, end: 60, depth: 60 })
    expect(waterfallBuildUp(segs, 3, profiles, null, 60)).toEqual({ start: 0, end: 0, depth: 60 })   // apron no deeper than the top
  })

  it('3D: leg + a face piece and return at each end, aprons closed by corner wedges', () => {
    const geos = benchtopGeometries(bt, { topZ: 900, thick: { total: 20 }, defaultProfileId: null }, profiles)
    const keys = geos.map(g => g.key)
    expect(keys).toEqual(expect.arrayContaining(['slab', 'l3', 'l3fs', 'l3rs', 'l3fe', 'l3re', 'a0', 'a1', 'a2']))
    // Face piece: 20 deep, 60 wide, floor to the top surface.
    const face = geos.find(g => g.key === 'l3fs')!.geo
    face.computeBoundingBox()
    const b = face.boundingBox!
    expect([b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map(v => Math.round(v)).sort((p, q) => p - q)).toEqual([20, 60, 900])
  })
})
