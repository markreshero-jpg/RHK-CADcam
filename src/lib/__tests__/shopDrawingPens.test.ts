import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PlanViewReportSVG from '@/app/canvas/[roomId]/PlanViewReportSVG'
import ElevationPrintSVG from '@/app/canvas/[roomId]/ElevationPrintSVG'
import { resolveLayerView } from '../displayLayers/resolve'
import { MIN_PEN, PRINT_INK } from '../shopDrawings/pens'
import type { Wall, CabinetInstance, Room } from '../types'

// z_shop_drawings S2: every printed line is black and at least the minimum pen,
// at the default 1:20 and at a coarse 1:50, and all text stays Helvetica.
const wall = (id: string, x: number, y: number, angle: number, length: number): Wall => ({
  id, room_id: 'r', name: id, sort_order: 0, length, height: null, soffit_height: null,
  angle, pos_x: x, pos_y: y, thickness: 90, wall_type: 'standard', created_at: '',
})
const ROOM = [wall('W1', 0, 0, 0, 3000), wall('W2', 3000, 0, 90, 3000), wall('W3', 3000, 3000, 180, 3000), wall('W4', 0, 3000, 270, 3000)]
let n = 0
const cab = (w: Wall, x: number, y: number, dx: number, extra: Partial<CabinetInstance> = {}) =>
  ({ id: `c${n++}`, wall_id: w.id, pos_x: x, pos_y: y, dx, dz: 580, dy: 870, rotation: w.angle, footprint: null,
     assembly_class: 'base', label: `${n}`, ...extra }) as unknown as CabinetInstance
const CABS = [
  cab(ROOM[0], 0, 0, 600), cab(ROOM[0], 600, 0, 900),
  cab(ROOM[0], 0, 0, 600, { assembly_class: 'wall', dz: 330, dy: 720 }),
  cab(ROOM[1], 3000, 580, 1200, { assembly_class: 'tall', dy: 2200 }),
]
const room = { id: 'r', name: 'Kitchen', height: 2400 } as unknown as Room

/** stroke / stroke-width pairs on every element that draws a line. */
function strokes(svg: string) {
  const out: { stroke: string; width: number }[] = []
  for (const m of svg.matchAll(/<(\w+)\s([^>]*)>/g)) {
    const attrs = m[2]
    const stroke = /\bstroke="([^"]*)"/.exec(attrs)?.[1]
    if (!stroke || stroke === 'none') continue
    const w = /\bstroke-width="([^"]*)"/.exec(attrs)?.[1]
    if (w == null) continue
    out.push({ stroke, width: Number(w) })
  }
  return out
}

for (const scale of [20, 50]) {
  describe(`print pens at 1:${scale}`, () => {
    it('plan: black lines, none thinner than the minimum pen', () => {
      const svg = renderToStaticMarkup(createElement(PlanViewReportSVG, {
        walls: ROOM, cabinets: CABS, resolvedParts: new Map(), svgRef: { current: null }, scale,
        layers: resolveLayerView(undefined, 'plan'),
        show: { wallNames: true, hatch: true, titleBlock: true, annotColours: false },
      }))
      const s = strokes(svg)
      expect(s.length).toBeGreaterThan(10)
      for (const l of s) {
        expect(l.stroke.toLowerCase()).toBe(PRINT_INK)
        expect(l.width).toBeGreaterThanOrEqual(MIN_PEN * scale - 1e-9)
      }
      // svg2pdf only knows normal / bold — any other weight prints in Times.
      expect(svg).not.toMatch(/font-weight="(?!bold"|normal")/)
    })

    it('elevation: black lines, none thinner than the minimum pen', () => {
      const svg = renderToStaticMarkup(createElement(ElevationPrintSVG, {
        wall: ROOM[0], walls: ROOM, cabinets: CABS, room, resolvedParts: new Map(), svgRef: () => {}, scale,
        layers: resolveLayerView(undefined, 'elevation'),
        show: { returnWalls: true, titleBlock: true },
      }))
      const s = strokes(svg)
      expect(s.length).toBeGreaterThan(10)
      for (const l of s) {
        expect(l.stroke.toLowerCase()).toBe(PRINT_INK)
        expect(l.width).toBeGreaterThanOrEqual(MIN_PEN * scale - 1e-9)
      }
      // svg2pdf only knows normal / bold — any other weight prints in Times.
      expect(svg).not.toMatch(/font-weight="(?!bold"|normal")/)
    })
  })
}
