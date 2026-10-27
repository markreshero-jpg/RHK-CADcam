import { describe, it, expect } from 'vitest'
import { computeSnap, cabinetSnapOutlines, DEFAULT_SNAP_SETTINGS, normaliseSnapSettings } from '../canvasSnap'
import type { Wall, CabinetInstance } from '../types'
import type { ResolvedCabinet } from '../resolver/types'

// One straight wall along +X with the room on the +Y side; an end panel
// cabinet (carcase 18 × 580) whose applied panel runs 600 deep.
const wall = { id: 'w1', pos_x: 0, pos_y: 0, angle: 0, length: 4000, thickness: 100, wall_type: 'standard' } as unknown as Wall
const walls = [wall, { ...wall, id: 'w2', pos_x: 0, pos_y: 3000 } as unknown as Wall]
const cab = { id: 'ep', wall_id: 'w1', assembly_class: 'base', pos_x: 1000, pos_y: 0, dx: 18, dy: 870, dz: 580 } as unknown as CabinetInstance
const rp = {
  case_parts: [], face_zones: [],
  custom_parts: [{ show_in_room: true, orientation: 'side', x: 0, y: 0, z: 0, dx: 600, dy: 870, dz: 18 }],
} as unknown as ResolvedCabinet
const resolved = new Map([['ep', rp]])
const ctx = { walls, cabinets: [cab], benchtops: [], resolved }
const settings = { ...DEFAULT_SNAP_SETTINGS, kinds: { ...DEFAULT_SNAP_SETTINGS.kinds, 'wall-end': false } }
const front = (o: { x: number; y: number }[]) => Math.max(...o.map(p => Math.abs(p.y)))

describe('cabinet snap', () => {
  it('outlines include the resolved parts, not just the carcase box', () => {
    const cx = { x: 2000, y: 1500 }
    const os = cabinetSnapOutlines(cab, wall, cx, rp)
    expect(os).toHaveLength(2)
    expect(front(os[0])).toBeCloseTo(580)    // carcase
    expect(front(os[1])).toBeCloseTo(600)    // applied end panel
    expect(cabinetSnapOutlines(cab, wall, cx)).toHaveLength(1)
  })

  it('snaps to the end panel front corner', () => {
    const corner = cabinetSnapOutlines(cab, wall, { x: 2000, y: 1500 }, rp)[1].reduce((a, b) => (Math.abs(b.y) + b.x > Math.abs(a.y) + a.x ? b : a))
    const r = computeSnap({ x: corner.x + 4, y: corner.y + 3 }, ctx, settings, 20)
    expect(r.kind).toBe('cabinet-corner')
    expect(r.pt.x).toBeCloseTo(corner.x)
    expect(r.pt.y).toBeCloseTo(corner.y)
  })

  it('away from corners, snaps onto the nearest outline edge', () => {
    const y = front(cabinetSnapOutlines(cab, wall, { x: 2000, y: 1500 }, rp)[1])
    // Halfway along the end panel's outer face, a little off it.
    const r = computeSnap({ x: 1000 - 6, y: y / 2 }, ctx, settings, 20)
    expect(r.kind).toBe('cabinet-edge')
    expect(r.pt.x).toBeCloseTo(1000)
    expect(r.pt.y).toBeCloseTo(y / 2)
  })

  it('a corner in range wins over an edge', () => {
    const r = computeSnap({ x: 1000 + 5, y: 3 }, ctx, settings, 20)
    expect(r.kind).toBe('cabinet-corner')
  })

  it('kick boards are snap outlines; kick assemblies drop their footprint box', () => {
    const cx = { x: 2000, y: 1500 }
    const base = { ...cab, id: 'b', dx: 600 } as unknown as CabinetInstance
    // Kick face 600 long × 16 thick, set back 50 from the carcase front.
    const kp = { case_parts: [], face_zones: [], toekick_parts: [{ part_key: 'kick_front_face', X: 0, Y: 0, Z: 514, DX: 150, DY: 600, DZ: 16 }] } as unknown as ResolvedCabinet
    const os = cabinetSnapOutlines(base, wall, cx, kp)
    expect(os).toHaveLength(2)
    expect(front(os[1])).toBeCloseTo(530)
    const asm = { ...base, is_kick_assembly: true } as unknown as CabinetInstance
    expect(cabinetSnapOutlines(asm, wall, cx, kp)).toHaveLength(1)
    const r = computeSnap({ x: 1003, y: 532 }, { walls, cabinets: [asm], benchtops: [], resolved: new Map([['b', kp]]) }, settings, 20)
    expect(r.kind).toBe('cabinet-corner')
    expect(r.pt.y).toBeCloseTo(530)
  })

  it('edges can be switched off; old saved settings get the new kind on', () => {
    const off = { ...settings, kinds: { ...settings.kinds, 'cabinet-edge': false } }
    expect(computeSnap({ x: 1000 - 6, y: 300 }, ctx, off, 20).kind).toBeNull()
    expect(normaliseSnapSettings({ enabled: true, kinds: { 'cabinet-corner': true } } as never).kinds['cabinet-edge']).toBe(true)
  })
})
