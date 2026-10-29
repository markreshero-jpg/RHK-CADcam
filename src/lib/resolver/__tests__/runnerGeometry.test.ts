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
  it('the six source pieces rebuild the shop GLB cross-section (1511.5 mm² at H 127, _v2)', () => {
    const parts = runnerShape(rail('left', 500, 127))
    // Front-face area of the non-assumed pieces: skin, wall, ledge, block, web, foot.
    const src = parts.filter(p => !(p.x - 16.5 < 9 && p.kind === 'runner') && p.kind !== 'bracket' && !(p.kind === 'runner' && p.h === 1.5))
    const area = src.reduce((s, p) => s + p.w * p.h, 0)
    expect(area).toBeCloseTo(1511.5)
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

describe('Dragon Pro 2D silhouette (no GLB)', () => {
  it('a parametric rail gets triangles that land on its 3D boxes, both sides', async () => {
    const { runnerModelTriangles } = await import('../../runnerGeometry')
    const { triKey, slideSilhouettePath } = await import('../../slideSilhouette')
    for (const side of ['left', 'right'] as const) {
      const r = rail(side, 350, 127)
      expect(triKey(r)).toBe('param:dragon_pro:350:127')
      const tris = runnerModelTriangles('dragon_pro', 350, 127)
      expect(tris.length).toBe(runnerShape(r).length * 12 * 9)
      // Plan (x, z) extents of the projected silhouette = the boxes' extents.
      const xs: number[] = [], zs: number[] = []
      slideSilhouettePath(tris, r, (x, _y, z) => { xs.push(x); zs.push(z); return { x, y: z } })
      const boxes = runnerShape(r)
      expect(Math.min(...xs)).toBeCloseTo(Math.min(...boxes.map(b => b.x)))
      expect(Math.max(...xs)).toBeCloseTo(Math.max(...boxes.map(b => b.x + b.w)))
      expect(Math.min(...zs)).toBeCloseTo(Math.min(...boxes.map(b => b.z)))
      expect(Math.max(...zs)).toBeCloseTo(Math.max(...boxes.map(b => b.z + b.d)))
    }
  })

  it('a rail with a GLB keeps the GLB key', async () => {
    const { triKey } = await import('../../slideSilhouette')
    expect(triKey({ ...rail('left', 500, 127), model_url: 'u.glb', model_format: 'glb' })).toBe('glb:u.glb')
  })
})
