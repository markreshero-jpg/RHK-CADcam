import { describe, it, expect } from 'vitest'
import { runnerShape } from '../../runnerGeometry'
import type { ResolvedDrawerSlide } from '../types'

// z_runner_models — port of build_runner.py

const rail = (side: 'left' | 'right', NL: number, H: number, drawn_as: 'dragon_pro' | null = 'dragon_pro'): ResolvedDrawerSlide => ({
  side, X: side === 'left' ? 16.5 : 450 - 16.5 - 37.5, Y: 200, Z: 580 - 10 - NL, DX: NL, DY: H, DZ: 37.5,
  slide_id: 'dp', nominal_length: NL, box_height: H, runner_thickness: 37.5, colour: null,
  model_url: null, model_format: null, model_scale: 1, model_anchor_x: 0, model_anchor_y: 0, model_anchor_z: 0,
  drawn_as, drills: [],
})

describe('Dragon Pro runner (parametric)', () => {
  it('the six source pieces rebuild the shop GLB cross-section (1463.5 mm² at H 127)', () => {
    const parts = runnerShape(rail('left', 500, 127))
    // Front-face area of the non-assumed pieces: skin, wall, ledge, block, web, foot.
    const src = parts.filter(p => !(p.x - 16.5 < 9 && p.kind === 'runner') && p.kind !== 'bracket' && !(p.kind === 'runner' && p.h === 1.5))
    const area = src.reduce((s, p) => s + p.w * p.h, 0)
    expect(area).toBeCloseTo(1463.5)
  })

  it('wall grows with height; everything runs the nominal length', () => {
    for (const H of [95, 127, 178]) {
      const parts = runnerShape(rail('left', 400, H))
      const r = rail('left', 400, H)
      expect(Math.max(...parts.map(p => p.y + p.h))).toBeCloseTo(r.Y + H)
      expect(Math.max(...parts.map(p => p.z + p.d))).toBeCloseTo(r.Z + 400)
      expect(Math.min(...parts.map(p => p.z))).toBeCloseTo(r.Z)
    }
  })

  it('left runs in from the left gable, right mirrors in from the right gable', () => {
    const l = runnerShape(rail('left', 500, 127)), r = runnerShape(rail('right', 500, 127))
    expect(Math.min(...l.map(p => p.x))).toBeCloseTo(16.5)                 // mount flange on the gable
    expect(Math.max(...r.map(p => p.x + p.w))).toBeCloseTo(450 - 16.5)
    expect(Math.max(...l.map(p => p.x + p.w))).toBeCloseTo(16.5 + 54.5)    // foot reaches 54.5 in
    expect(Math.min(...r.map(p => p.x))).toBeCloseTo(450 - 16.5 - 54.5)
  })

  it('drawer side moves, cabinet member stays; nothing without a family', () => {
    const parts = runnerShape(rail('left', 300, 95))
    expect(parts.filter(p => p.kind === 'runner').every(p => !p.moving)).toBe(true)
    expect(parts.filter(p => p.kind === 'side').every(p => p.moving)).toBe(true)
    expect(runnerShape(rail('left', 300, 95, null))).toEqual([])
  })
})
