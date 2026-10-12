import { describe, it, expect } from 'vitest'
import { waterfallLegs, waterfallOccupancy } from '../waterfallObstacles'
import { segmentsFromLegacy } from '../benchtopGeometry'
import { centroid } from '../geometry'
import type { Wall, Room, BenchtopInstance, BenchtopEdgeProfile } from '../types'

const wall = (id: string, x: number, y: number, angle: number, length: number): Wall => ({
  id, room_id: 'r', name: id, sort_order: 0, length, height: null, soffit_height: null,
  angle, pos_x: x, pos_y: y, thickness: 90, wall_type: 'standard', created_at: '',
})
const ROOM = [wall('W1', 0, 0, 0, 3000), wall('W2', 3000, 0, 90, 3000), wall('W3', 3000, 3000, 180, 3000), wall('W4', 0, 3000, 270, 3000)]
const CX = centroid(ROOM)
const room = { room_dy: 2400, wall_cabinet_top: 2100, soffit_height: null } as unknown as Room
const WF = { id: 'wf', generates: 'waterfall' } as BenchtopEdgeProfile

// Top 500..2000 on W1, 600 deep; right end (edge 1) is a waterfall, 20 thick.
const segs = segmentsFromLegacy([{ x: 500, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 600 }, { x: 500, y: 600 }])
segs[1] = { ...segs[1], edge: { ...(segs[1].edge ?? {}), profile_id: 'wf' } }
const bt = { id: 'b', segments: segs } as unknown as BenchtopInstance
const info = () => ({ topZ: 920, thick: { total: 20 }, defaultProfileId: null })

describe('waterfallOccupancy', () => {
  const legs = waterfallLegs([bt], info, { wf: WF })
  it('finds the leg inset by the thickness', () => {
    expect(legs).toHaveLength(1)
  })
  it('blocks a base cabinet on that face over the leg thickness', () => {
    const occ = waterfallOccupancy(legs, ROOM[0], 'face', CX, room, { assembly_class: 'base', dy: 870, dz: 580 })
    expect(occ).toHaveLength(1)
    expect(occ[0].t).toBeCloseTo(1980)
    expect(occ[0].dx).toBeCloseTo(20)
  })
  it('does not block a wall cabinet hung above the top', () => {
    expect(waterfallOccupancy(legs, ROOM[0], 'face', CX, room, { assembly_class: 'wall', dy: 720, dz: 350 })).toEqual([])
  })
  it('does not block the far wall', () => {
    expect(waterfallOccupancy(legs, ROOM[2], 'face', CX, room, { assembly_class: 'base', dy: 870, dz: 580 })).toEqual([])
  })
})
