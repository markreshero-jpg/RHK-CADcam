import { describe, it, expect } from 'vitest'
import { rigidFollow, groupFollow, alignPatches, lockMates } from '../fixtureGroups'
import { fixtureCenter } from '../fixtureGeometry'
import type { RoomFixture } from '../types'

const fx = (id: string, p: Partial<RoomFixture>): RoomFixture => ({
  id, x: 0, y: 0, rotation: 0, width: 100, depth: 100, height: 100, z: 0, wall_id: null, lock_group: null, ...p,
} as RoomFixture)

describe('rigidFollow', () => {
  it('shifts a mate by the same amount', () => {
    const basin = fx('b', { x: 1000, y: 200, width: 400, depth: 400, z: 800, wall_id: 'w1' })
    const tap = fx('t', { x: 1167.5, y: 0, width: 65, depth: 251.5, z: 1117.5, wall_id: 'w1' })
    const p = rigidFollow(basin, { ...basin, x: 1300 }, tap)!
    expect(p).toEqual({ x: 1467.5, y: 0, rotation: 0, z: 1117.5, wall_id: 'w1' })
  })
  it('turns a mate about the mover centre', () => {
    const a = fx('a', { x: 0, y: 0 })                     // centre (50, 50)
    const m = fx('m', { x: 200, y: 0 })                   // centre (250, 50)
    const p = rigidFollow(a, { ...a, x: 100, rotation: 90 }, m)!   // turned in place
    const c = fixtureCenter({ ...m, ...p })
    expect(c.x).toBeCloseTo(50); expect(c.y).toBeCloseTo(250)
    expect(p.rotation).toBe(90)
  })
  it('follows the mover to a new wall, and rises with it', () => {
    const a = fx('a', { wall_id: 'w1', z: 800 })
    const m = fx('m', { x: 300, wall_id: 'w1', z: 1100 })
    const p = rigidFollow(a, { ...a, x: 10, wall_id: 'w2', z: 820 }, m)!
    expect(p.wall_id).toBe('w2'); expect(p.z).toBe(1120)
  })
  it('null when nothing moved', () => {
    const a = fx('a', {})
    expect(rigidFollow(a, { ...a }, fx('m', { x: 300 }))).toBeNull()
  })
})

describe('groupFollow', () => {
  it('carries locked mates only, not ones that moved themselves', () => {
    const list = [fx('a', { lock_group: 'g' }), fx('b', { x: 200, lock_group: 'g' }), fx('c', { x: 400, lock_group: 'g' }), fx('d', { x: 600 })]
    const out = groupFollow(list, new Map([['a', { x: 50 }], ['c', { x: 450 }]]))
    expect([...out.keys()]).toEqual(['b'])
    expect(out.get('b')!.x).toBe(250)
  })
  it('skip rejects mates', () => {
    const list = [fx('a', { lock_group: 'g' }), fx('b', { x: 200, lock_group: 'g' })]
    expect(groupFollow(list, new Map([['a', { x: 50 }]]), () => true).size).toBe(0)
  })
  it('lockMates', () => {
    const list = [fx('a', { lock_group: 'g' }), fx('b', { lock_group: 'g' }), fx('c', {})]
    expect(lockMates(list, 'a')).toEqual(['a', 'b'])
    expect(lockMates(list, 'c')).toEqual(['c'])
  })
})

describe('alignPatches', () => {
  const anchor = fx('a', { x: 1000, y: 200, width: 400, depth: 400, z: 800 })
  const tap = fx('t', { x: 500, y: 0, width: 65, depth: 250, z: 1100 })
  it('centres along the anchor width', () => {
    const p = alignPatches(anchor, [anchor, tap], 'centre_along').get('t')!
    expect(p.x).toBe(1167.5); expect(p.y).toBe(0)
  })
  it('left / right edges', () => {
    expect(alignPatches(anchor, [tap], 'left').get('t')!.x).toBe(1000)
    expect(alignPatches(anchor, [tap], 'right').get('t')!.x).toBe(1335)
  })
  it('centre front-to-back', () => {
    const p = alignPatches(anchor, [tap], 'centre_depth').get('t')!
    expect(p.y).toBe(275); expect(p.x).toBe(500)
  })
  it('height', () => {
    expect(alignPatches(anchor, [tap], 'height').get('t')).toEqual({ z: 800 })
  })
  it('works in a turned anchor frame', () => {
    const a = fx('a', { x: 0, y: 0, rotation: 90, width: 400, depth: 100 })   // width runs +y
    const m = fx('m', { x: -100, y: 1000, rotation: 90 })
    const p = alignPatches(a, [m], 'centre_along').get('m')!
    expect(fixtureCenter({ ...m, ...p }).y).toBeCloseTo(fixtureCenter(a).y)
    expect(p.x).toBe(-100)
  })
})
