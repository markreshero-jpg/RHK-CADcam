import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PlanViewReportSVG from '@/app/canvas/[roomId]/PlanViewReportSVG'
import { resolveLayerView } from '../displayLayers/resolve'
import type { RoomAnnotation, Wall } from '../types'
import type { TextGeom } from '../annotations/geometry'
import { tagBlockItems, isSpecBlock, layoutSpecSheet, annotationsBounds, drawnBounds } from '../annotations/blocks'

// z_shop_drawings: spec blocks move to their own sheet when the plan only fits without them.
const note = (id: string, x: number, y: number, text: string, block?: string): RoomAnnotation => ({
  id, room_id: 'r', view: 'plan', wall_id: null, cabinet_id: null, sheet_view: null,
  kind: 'text', geom: { at: { x, y }, width: 75 }, text, sort_order: 0, created_at: '', updated_at: '',
  style: { size: 2.5, border: 'box', ...(block ? { block } : {}) },
})

describe('spec blocks', () => {
  it('inserted blocks carry their name; only "spec" blocks count', () => {
    const [it0] = tagBlockItems([{ kind: 'text', geom: { at: { x: 0, y: 0 } }, text: 'x', style: { size: 2.5 } }], 'Appliance spec block')
    expect(it0.style).toEqual({ size: 2.5, block: 'Appliance spec block' })
    expect(isSpecBlock(it0)).toBe(true)
    expect(isSpecBlock({ style: { block: 'North arrow' } })).toBe(false)
    expect(isSpecBlock({ style: {} })).toBe(false)
  })

  it('lays blocks out left to right, tops aligned, wrapping past the width', () => {
    const k = 20
    const xs = [note('b', 7400, 725, 'B\nB'), note('a', 7400, -640, 'A'), note('c', 0, 0, 'C')]
    const laid = layoutSpecSheet(xs, k, 170)   // two boxed 75mm blocks + 10mm gap fit, a third wraps
    const at = (id: string) => (laid.find(a => a.id === id)!.geom as TextGeom).at
    // Laid out by the drawn box (padding + border), so borders never touch or clip.
    const box = (id: string) => drawnBounds([laid.find(a => a.id === id)!], k)!
    // Plan order: c (x 0), then a, b (same x, top first).
    expect(laid.map(a => a.id)).toEqual(['c', 'a', 'b'])
    expect(box('c').minX).toBeCloseTo(0); expect(box('c').minY).toBeCloseTo(0)
    expect(box('a').minY).toBeCloseTo(0)
    expect(box('a').minX).toBeCloseTo(box('c').maxX + 10 * k)
    expect(box('b').minX).toBeCloseTo(0)
    expect(box('b').minY).toBeGreaterThan(box('a').maxY)
    expect(at('a')).not.toEqual({ x: 7400, y: -640 })
    // The drawn box is bigger than the bare text by the padding on every side.
    const bare = annotationsBounds([laid.find(a => a.id === 'c')!], k)!
    expect(box('c').minX).toBeLessThan(bare.minX); expect(box('c').maxY).toBeGreaterThan(bare.maxY)
  })

  it('the plan leaves hidden spec blocks off but still reports its full size', () => {
    const wall = (id: string, x: number, y: number, angle: number): Wall => ({
      id, room_id: 'r', name: id, sort_order: 0, length: 3000, height: null, soffit_height: null,
      angle, pos_x: x, pos_y: y, thickness: 90, wall_type: 'standard', created_at: '',
    })
    const walls = [wall('W1', 0, 0, 0), wall('W2', 3000, 0, 90), wall('W3', 3000, 3000, 180), wall('W4', 0, 3000, 270)]
    const annotations = [note('s', 5000, 0, 'SPECIFICATIONS', 'Spec block'), note('n', 500, 500, 'SITE NOTE')]
    const render = (hideSpecBlocks: boolean) => renderToStaticMarkup(createElement(PlanViewReportSVG, {
      walls, cabinets: [], annotations, svgRef: { current: null }, scale: 20, hideSpecBlocks,
      layers: resolveLayerView(undefined, 'plan'), show: { titleBlock: true, annotColours: false },
    }))
    const attr = (s: string, a: string) => Number(s.match(new RegExp(`${a}="([^"]+)"`))![1])
    const shown = render(false), hidden = render(true)
    expect(shown).toContain('SPECIFICATIONS')
    expect(hidden).not.toContain('SPECIFICATIONS')
    expect(hidden).toContain('SITE NOTE')
    expect(attr(shown, 'data-vb-w')).toBeCloseTo(attr(shown, 'data-full-w'))
    expect(attr(hidden, 'data-full-w')).toBeCloseTo(attr(shown, 'data-full-w'))
    expect(attr(hidden, 'data-vb-w')).toBeLessThan(attr(hidden, 'data-full-w') - 1500)
  })
})
