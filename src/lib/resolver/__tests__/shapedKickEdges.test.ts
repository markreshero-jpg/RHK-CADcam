import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type ResolvedToekickPart } from '../types'
import { buildPresetFootprint, withShapeChoices } from '../../cabinetShape/presets'
import type { Footprint, FootprintSegment } from '../../cabinetShape/footprint'
import { kickJoinOptions, kickJunctions, withKickEdge, withKickJoin } from '../../cabinetShape/kickJunctions'
import { signedArea, clipToConvex } from '../../cabinetShape/construct'
import { tkBoxLocal, tkPlanCorners } from '../../jointDrilling'

// z_kick_join KE1: per-edge kick types and per-corner kick joins.
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const kickFace: Material = { id: 'k16', name: 'Kick 16', DZ: 16, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const kick = (footprint: Footprint, DX = 900, DZ = 580, rules = {}) => resolveCabinet({
  id: 'c1', assembly_class: 'base', DX, DY: 870, DZ,
  has_carcass: true, has_internal: false, has_face: false, has_toekick: true,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: kickFace, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES, { TOESCL: 0, TOESCR: 0, TOESCF: 0, TOESCB: 0, ...rules }),
  face_grid: { rows: [], cols: [], zones: [] }, internal_tree: { type: 'open', fittings: [] },
  footprint,
} as CabinetInput).toekick_parts

const line = (a: [number, number], b: [number, number], id: string, role: 'front' | 'back' | 'side'): FootprintSegment =>
  ({ type: 'line', p0: { x: a[0], y: a[1] }, p1: { x: b[0], y: b[1] }, edge: { id, role } })
const rect: Footprint = { preset: null, params: {}, segments: [
  line([0, 0], [900, 0], 'back', 'back'), line([900, 0], [900, 580], 'right', 'side'),
  line([900, 580], [0, 580], 'front', 'front'), line([0, 580], [0, 0], 'left', 'side'),
] }
// A U of two wings: front faces meeting at an inside (reflex) corner.
const ell: Footprint = { preset: null, params: {}, segments: [
  line([0, 0], [900, 0], 'back', 'back'), line([900, 0], [900, 900], 'right', 'side'),
  line([900, 900], [400, 900], 'f1', 'front'), line([400, 900], [400, 500], 'f2', 'front'),
  line([400, 500], [0, 500], 'f3', 'front'), line([0, 500], [0, 0], 'left', 'side'),
] }

const of = (ps: ResolvedToekickPart[], k: string) => ps.filter(p => p.part_key === k)
const area = (pts: { x: number; y: number }[]) => Math.abs(signedArea(pts))
const plan = (p: ResolvedToekickPart) => tkPlanCorners(p).map(q => ({ x: q.x, y: q.z }))
const sig = (ps: ResolvedToekickPart[]) => ps.map(p => JSON.stringify(p)).sort()

function noCollisions(ps: ResolvedToekickPart[]) {
  const qs = ps.map(p => ({ p, pts: plan(p), y0: p.Y, y1: p.Y + tkBoxLocal(p).h }))
  for (let i = 0; i < qs.length; i++) for (let j = i + 1; j < qs.length; j++) {
    const a = qs[i], b = qs[j]
    if (Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) <= 0.01) continue
    expect(area(clipToConvex(a.pts, b.pts)), `${a.p.part_key}#${a.p.sort_order} x ${b.p.part_key}#${b.p.sort_order}`).toBeLessThan(0.5)
  }
}

describe('kick edge types', () => {
  it('nothing set: the kick is unchanged, and clearing a choice gets back to it', () => {
    const base = sig(kick(rect))
    const set = withKickEdge(rect, 'right', { type: 'face' })
    expect(sig(kick(set))).not.toEqual(base)
    const cleared = withKickEdge(set, 'right', { type: undefined })
    expect(cleared.kick_edges).toBeUndefined()
    expect(sig(kick(cleared))).toEqual(base)
  })

  it('a side set to Face is a mitred return: face + sub front round the corner', () => {
    const ps = kick(withKickEdge(rect, 'right', { type: 'face' }))
    expect(of(ps, 'kick_front_face').length).toBe(2)
    expect(of(ps, 'kick_sub_front').length).toBe(2)
    for (const f of of(ps, 'kick_front_face')) expect([f.bevel_lo, f.bevel_hi]).toContain(45)
    noCollisions(ps)
  })

  it('Face only has no sub front on that edge, and its neighbour sub front does not mitre into it', () => {
    const ps = kick(withKickEdge(rect, 'right', { type: 'face_only' }))
    expect(of(ps, 'kick_front_face').length).toBe(2)
    const sub = of(ps, 'kick_sub_front')
    expect(sub.length).toBe(1)
    expect(sub[0].bevel_lo ?? sub[0].bevel_hi).toBeUndefined()
    noCollisions(ps)
  })

  it('None builds nothing on the edge', () => {
    const before = of(kick(rect), 'spreader_vertical').length
    expect(of(kick(withKickEdge(rect, 'right', { type: 'none' })), 'spreader_vertical').length).toBe(before - 1)
    expect(of(kick(withKickEdge(rect, 'back', { type: 'none' })), 'kick_back').length).toBe(0)
  })

  it('a back set to Face makes an island kick with no missing-front error', () => {
    const ps = kick(withKickEdge(rect, 'back', { type: 'face' }))
    expect(of(ps, 'kick_front_face').length).toBe(2)
    expect(of(ps, 'kick_back').length).toBe(0)
  })

  it('a kick inset on the edge choice sets the frame in, the face runs on', () => {
    const fp = withKickEdge(withKickEdge(rect, 'right', { type: 'back' }), 'right', { inset: 30 })
    const back = of(kick(fp), 'kick_back').find(p => Math.abs(p.AY) > 1)!
    expect(Math.round(back.X)).toBe(870)
  })
})

describe('kick corners', () => {
  const faces = withKickEdge(rect, 'right', { type: 'face' })
  const key = kickJunctions(faces, 900, 580).find(j => j.kind === 'faces')!.key

  it('lists a choice for each corner kind, and the options match', () => {
    const js = kickJunctions(faces, 900, 580)
    expect(js.map(j => j.kind).sort()).toEqual(['face_back', 'faces'])
    expect(kickJoinOptions(js.find(j => j.kind === 'faces')!).map(o => o.value)).toEqual(['', 'through:right', 'through:front'])
  })

  it('butt, front runs through: front is full length and square, the return stops behind it', () => {
    const ps = kick(withKickJoin(faces, key, 'through:front'))
    const fs = of(ps, 'kick_front_face')
    expect(fs.every(f => !f.bevel_lo && !f.bevel_hi)).toBe(true)
    expect(Math.max(...fs.map(f => f.DY))).toBeCloseTo(900, 3)
    expect(Math.min(...fs.map(f => f.DY))).toBeLessThan(580 - 15.9)
    noCollisions(ps)
  })

  it('butt the other way swaps which board is short', () => {
    const a = kick(withKickJoin(faces, key, 'through:front'))
    const b = kick(withKickJoin(faces, key, 'through:right'))
    const lens = (ps: ResolvedToekickPart[]) => of(ps, 'kick_front_face').map(f => Math.round(f.DY)).sort((x, y) => x - y)
    expect(lens(a)).not.toEqual(lens(b))
    noCollisions(b)
  })

  it('backs: mitre at the square corner, the bevel on the board\'s inner face', () => {
    const fp = withKickEdge(rect, 'right', { type: 'back' })
    const k = kickJunctions(fp, 900, 580).find(j => j.kind === 'backs')!.key
    const ps = kick(withKickJoin(fp, k, 'mitre'))
    const backs = of(ps, 'kick_back')
    expect(backs.length).toBe(2)
    for (const b of backs) expect(Math.abs(b.bevel_lo ?? b.bevel_hi ?? 0)).toBeCloseTo(45, 3)
    noCollisions(ps)
  })

  it('an inside face corner butted: the through board runs past the corner', () => {
    const k = kickJunctions(ell, 900, 900).find(j => j.angle > 180)!.key
    const base = of(kick(ell), 'kick_front_face').map(f => f.DY)
    const ps = kick(withKickJoin(ell, k, `through:${k.split('|')[0]}`))
    noCollisions(ps)
    const lens = of(ps, 'kick_front_face').map(f => f.DY)
    expect(Math.max(...lens)).toBeGreaterThanOrEqual(Math.max(...base) - 16.01)
  })

  it('a stale choice whose kinds no longer apply is ignored', () => {
    const fp = withKickJoin(rect, 'right|front', 'through:right')
    expect(sig(kick(fp))).toEqual(sig(kick(rect)))
  })

  it('changing an edge type clears its corners', () => {
    const fp = withKickEdge(withKickJoin(faces, key, 'through:front'), 'right', { type: 'side' })
    expect(fp.kick_joins).toBeUndefined()
  })

  it('a rebuilt preset keeps the kick choices', () => {
    const p = buildPresetFootprint('angled_end', { inset: 200 }, { w: 900, d: 580 })!
    const id = p.segments[0].edge.id
    const set = withKickEdge(p, id, { type: 'none' })
    expect(withShapeChoices(set, p)!.kick_edges).toEqual(set.kick_edges)
  })
})
