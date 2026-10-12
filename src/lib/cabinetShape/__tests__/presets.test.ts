import { describe, it, expect } from 'vitest'
import { buildPresetFootprint, SHAPE_PRESETS } from '../presets'
import { evaluateFootprint, footprintOutline, isDegenerate } from '../footprint'

const pts = (fp: NonNullable<ReturnType<typeof buildPresetFootprint>>, w: number, d: number) =>
  evaluateFootprint(fp, { w, d }).map(s => [Math.round(s.p0.x), Math.round(s.p0.y)])

describe('shape presets', () => {
  it('clipped corner keeps the clip size on resize (formula vertices)', () => {
    const fp = buildPresetFootprint('clipped_corner', { clip_w: 300, clip_d: 200 }, { w: 900, d: 580 })!
    expect(pts(fp, 900, 580)).toEqual([[0, 0], [900, 0], [900, 380], [600, 580], [0, 580]])
    expect(pts(fp, 1000, 580)).toEqual([[0, 0], [1000, 0], [1000, 380], [700, 580], [0, 580]])
    expect(fp.segments.map(s => s.edge.role)).toEqual(['back', 'side', 'front', 'front', 'side'])
  })

  it('left-hand mirrors in x', () => {
    const fp = buildPresetFootprint('clipped_corner', { clip_w: 300, clip_d: 200, side: 'left' }, { w: 900, d: 580 })!
    expect(pts(fp, 900, 580)).toEqual([[900, 0], [0, 0], [0, 380], [300, 580], [900, 580]])
  })

  it('edge ids are stable across param changes and keep role overrides', () => {
    const a = buildPresetFootprint('clipped_corner', {}, { w: 900, d: 580 })!
    const b = buildPresetFootprint('clipped_corner', { clip_w: 150 }, { w: 900, d: 580 }, { facet: 'open' })!
    expect(b.segments.map(s => s.edge.id)).toEqual(a.segments.map(s => s.edge.id))
    expect(b.segments.find(s => s.edge.id === 'facet')!.edge.role).toBe('open')
  })

  it('radius end equal to the depth leaves a degenerate side that is skipped when drawn', () => {
    const fp = buildPresetFootprint('radius_end', { radius: 580 }, { w: 900, d: 580 })!
    const segs = evaluateFootprint(fp, { w: 900, d: 580 })
    expect(segs.find(s => s.edge.id === 'end')!.edge.id).toBe('end')
    expect(isDegenerate(segs[1])).toBe(true)
    const outline = footprintOutline(fp, { w: 900, d: 580 })
    // Quarter round from (900,0) to (320,580), centre (320,0): every sample
    // strictly between the two ends sits on the radius and bulges outward.
    const onArc = outline.filter(p => p.x > 320.5 && p.x < 899.5 && p.y > 0.5 && p.y < 579.5)
    expect(onArc.length).toBeGreaterThan(5)
    for (const p of onArc) expect(Math.hypot(p.x - 320, p.y)).toBeCloseTo(580, 0)
    // No square corner left at the front-right.
    expect(outline.some(p => Math.abs(p.x - 900) < 1 && Math.abs(p.y - 580) < 1)).toBe(false)
  })

  it('every preset builds a closed outline at default size', () => {
    for (const p of SHAPE_PRESETS) {
      for (const side of ['left', 'right']) {
        const fp = buildPresetFootprint(p.key, { side }, { w: 900, d: 900 })!
        const segs = evaluateFootprint(fp, { w: 900, d: 900 })
        expect(segs.length).toBeGreaterThanOrEqual(4)
        for (let i = 0; i < segs.length; i++) expect(segs[i].p1).toEqual(segs[(i + 1) % segs.length].p0)
        expect(footprintOutline(fp, { w: 900, d: 900 }).length).toBeGreaterThanOrEqual(3)
      }
    }
  })
})
