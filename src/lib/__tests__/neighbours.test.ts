import { describe, it, expect } from 'vitest'
import { detectNeighbours } from '../neighbours'
import { resolveReveal } from '../resolver/mergeRules'
import { DEFAULT_RULES } from '../resolver/types'
import type { Wall, CabinetInstance, Room } from '../types'

// Auto-detected face neighbours (z_doorFace_module §Neighbours). 3 m square room;
// left = the wall-start end for these face-side cabinets.
const wall = (id: string, x: number, y: number, angle: number, length: number): Wall => ({
  id, room_id: 'r', name: id, sort_order: 0, length, height: null, soffit_height: null,
  angle, pos_x: x, pos_y: y, thickness: 90, wall_type: 'standard', created_at: '',
}) as Wall
const ROOM = [wall('W1', 0, 0, 0, 3000), wall('W2', 3000, 0, 90, 3000), wall('W3', 3000, 3000, 180, 3000), wall('W4', 0, 3000, 270, 3000)]
const [W1, W2] = ROOM
const room = { id: 'r', wall_cabinet_top: 2100, room_dy: 2400, soffit_height: null } as unknown as Room
const cab = (id: string, w: Wall, t: number, dx: number, extra: Partial<CabinetInstance> = {}) => {
  const a = w.angle * Math.PI / 180
  return { id, wall_id: w.id, pos_x: w.pos_x + t * Math.cos(a), pos_y: w.pos_y + t * Math.sin(a), pos_z: 0, dx, dz: 580, dy: 870,
    rotation: w.angle, footprint: null, assembly_class: 'base', has_face: true, has_carcass: true, rule_overrides: {}, ...extra } as unknown as CabinetInstance
}
const PANEL = { has_face: false, has_carcass: false }

describe('detectNeighbours', () => {
  const cabs = [
    cab('A', W1, 0, 600),
    cab('B', W1, 600, 600),
    cab('EP', W1, 1200, 18, PANEL),
    cab('C', W1, 1500, 600),                                  // stands alone
    cab('U', W1, 600, 600, { assembly_class: 'wall', dy: 720, dz: 300 }),   // over B: a base below doesn't count
    cab('G', W1, 2420, 580),                                  // corner cabinet into W2
    cab('F', W2, 580, 600),                                   // runs off G's front
    cab('KICK', W1, 0, 1200, { is_kick_assembly: true, has_face: false }),
  ]
  const n = detectNeighbours(cabs, ROOM, room)

  it('cabinet beside cabinet, wall at a wall, end panel at an end panel', () => {
    expect(n.get('A')).toEqual({ left: 'wall', right: 'cabinet' })
    expect(n.get('B')).toEqual({ left: 'cabinet', right: 'end_panel' })
  })
  it('nothing touching = freestanding; only vertically overlapping items count', () => {
    expect(n.get('C')).toEqual({ left: 'freestanding', right: 'freestanding' })
    expect(n.get('U')).toEqual({ left: 'freestanding', right: 'freestanding' })
  })
  it('corners: hard against the return wall, and butted into the corner cabinet', () => {
    expect(n.get('G')).toEqual({ left: 'freestanding', right: 'wall' })
    expect(n.get('F')).toEqual({ left: 'cabinet', right: 'freestanding' })
  })
  it('panels and kick assemblies get no entry of their own', () => {
    expect(n.has('EP')).toBe(false)
    expect(n.has('KICK')).toBe(false)
  })
})

describe('resolveReveal locks + side overrides', () => {
  it('cabinet → REVL, else REVENDL; a lock beats the detected neighbour; REVSL beats both', () => {
    expect(resolveReveal('left', 'cabinet', DEFAULT_RULES)).toBe(DEFAULT_RULES.REVL)
    expect(resolveReveal('left', 'wall', DEFAULT_RULES)).toBe(DEFAULT_RULES.REVENDL)
    expect(resolveReveal('left', 'wall', { ...DEFAULT_RULES, NBRL: 'cabinet' })).toBe(DEFAULT_RULES.REVL)
    expect(resolveReveal('right', 'cabinet', { ...DEFAULT_RULES, NBRL: 'wall' })).toBe(DEFAULT_RULES.REVR)
    expect(resolveReveal('right', 'cabinet', { ...DEFAULT_RULES, REVSR: 3.5, NBRR: 'wall' })).toBe(3.5)
  })
})
