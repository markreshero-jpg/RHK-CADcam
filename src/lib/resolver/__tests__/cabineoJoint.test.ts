// Lamello Cabineo 12 joint (z_joints/CABINEO-SPEC.md): inside/outside pocket
// faces on part A + a stopped Ø5 screw hole in part B, 5 below the pocket face.
import { describe, it, expect } from 'vitest'
import { seamDrillOps } from '../../jointDrilling'
import type { JointTypeOp } from '../types'

const Q   = 'Math.ceil((D - 100) / 280) + 1'
const SPC = '(D - 100) / Math.ceil((D - 100) / 280)'

function op(p: Partial<JointTypeOp>): JointTypeOp {
  return {
    id: 'x', joint_type_id: 'j', operation_order: 1, target_part: 'part_a', machine_operation: 'drill',
    face: 'normal', tool_diameter_mm: 5, depth_mm: 12, offset_x_mm: 0, offset_y_mm: 0, offset_z_mm: 50,
    qty: 2, spacing_mm: 150, qty2: 1, spacing2_mm: null, router_tool_id: null, drill_id: null,
    auto_tool: true, notes: null, expressions: { qty: Q, spacing_mm: SPC }, ...p,
  }
}

const cabineo = (face: 'inside' | 'outside'): JointTypeOp[] => [
  op({ face, tool_diameter_mm: 15, depth_mm: 11, offset_x_mm: 14.8, qty2: 3, spacing2_mm: 11.2 }),
  op({ target_part: 'part_b', stopped: true,
       expressions: { qty: Q, spacing_mm: SPC, offset_y_mm: face === 'inside' ? 'IN ? 5 : CW - 5' : 'IN ? CW - 5 : 5' } }),
]

// 600 × 720 × 560 box, 16 board. z grows toward the front.
const gableL = { x: 0,  y: 0,   z: 0, w: 16,  h: 720, d: 560 }
const bottom = { x: 16, y: 0,   z: 0, w: 568, h: 16,  d: 560 }
const top    = { x: 16, y: 704, z: 0, w: 568, h: 16,  d: 560 }
const back   = { x: 16, y: 16,  z: 0, w: 568, h: 688, d: 16 }

const r = (n: number) => Math.round(n * 10) / 10

describe('Cabineo joint', () => {
  it('bottom: pocket on the top (inside) face, 3 circles in from the gable, 3 sets along 560', () => {
    const d = seamDrillOps('bottom:left_side', bottom, gableL, cabineo('inside'))
    const pocket = d.filter(h => h.targetPartKey === 'bottom')
    expect(pocket).toHaveLength(9)
    expect(new Set(pocket.map(h => r(h.x)))).toEqual(new Set([19.6, 30.8, 42]))
    expect(pocket.every(h => h.y === 16 && h.axis === 'y-' && h.radius === 7.5 && h.depthLen === 11)).toBe(true)
    expect(new Set(pocket.map(h => r(h.z)))).toEqual(new Set([510, 280, 50]))

    const screw = d.filter(h => h.targetPartKey === 'left_side')
    expect(screw).toHaveLength(3)
    // 5 below the bottom's top face, stopped 12 deep into the gable
    expect(screw.every(h => h.x === 16 && h.y === 11 && h.axis === 'x-' && h.depthLen === 12)).toBe(true)
  })

  it('bottom outside: pocket on the underside, screw 5 above it', () => {
    const d = seamDrillOps('bottom:left_side', bottom, gableL, cabineo('outside'))
    expect(d.filter(h => h.targetPartKey === 'bottom').every(h => h.y === 0 && h.axis === 'y+')).toBe(true)
    expect(d.filter(h => h.targetPartKey === 'left_side').every(h => h.y === 5)).toBe(true)
  })

  it('top: inside is the underside', () => {
    const d = seamDrillOps('top:left_side', top, gableL, cabineo('inside'))
    expect(d.filter(h => h.targetPartKey === 'top').every(h => h.y === 704 && h.axis === 'y+')).toBe(true)
    expect(d.filter(h => h.targetPartKey === 'left_side').every(h => h.y === 709)).toBe(true)
  })

  it('back: inside is the front face, sets run down the height', () => {
    const d = seamDrillOps('back:left_side', back, gableL, cabineo('inside'))
    const pocket = d.filter(h => h.targetPartKey === 'back')
    expect(pocket.every(h => h.z === 16 && h.axis === 'z-')).toBe(true)
    expect(Math.max(...pocket.map(h => h.y))).toBe(704 - 50)
    expect(d.filter(h => h.targetPartKey === 'left_side').every(h => h.z === 11 && h.depthLen === 12)).toBe(true)
  })

  it('unflagged part_b face holes still bore through', () => {
    const d = seamDrillOps('bottom:left_side', bottom, gableL, [op({ target_part: 'part_b' })])
    expect(d.every(h => h.depthLen === 16)).toBe(true)
  })
})
