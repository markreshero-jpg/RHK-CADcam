import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PlanViewReportSVG from '@/app/canvas/[roomId]/PlanViewReportSVG'
import ElevationPrintSVG from '@/app/canvas/[roomId]/ElevationPrintSVG'
import { resolveLayerView } from '../displayLayers/resolve'
import { MIN_PEN, PRINT_INK } from '../shopDrawings/pens'
import type { Wall, CabinetInstance, Room, BenchtopInstance, RoomFixture } from '../types'

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
// A top over the W1 run with a sink cutout and one butt join.
const rect = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
const BT = {
  id: 'bt1', room_id: 'r',
  segments: rect(0, 0, 1500, 600).map(([x, y], i, a) => ({ type: 'line', p0: { x, y }, p1: { x: a[(i + 1) % 4][0], y: a[(i + 1) % 4][1] } })),
  joins: [{ p0: { x: 600, y: 0 }, p1: { x: 600, y: 600 }, type: 'butt' }],
  cutout_polygons: [rect(800, 150, 1300, 450).map(([x, y]) => ({ x, y }))],
} as unknown as BenchtopInstance
// A sink in the top, and a wall oven against W1 (facing into the room) at 900 up.
const fx = (id: string, category: string, name: string, x: number, y: number, width: number, depth: number, height: number, z: number) =>
  ({ id, room_id: 'r', category, kind: '', name, label: null, x, y, rotation: 0, width, depth, height, z, wall_id: null,
     plan_shape: null, elev_shape: null }) as unknown as RoomFixture
const FX = [fx('f1', 'sink', 'Sink', 800, 150, 500, 300, 200, 700), fx('f2', 'appliance', 'Oven', 2000, 0, 600, 560, 600, 900)]

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
        walls: ROOM, cabinets: CABS, benchtops: [BT], fixtures: FX, resolvedParts: new Map(), svgRef: { current: null }, scale,
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
        wall: ROOM[0], walls: ROOM, cabinets: CABS, fixtures: FX, room, resolvedParts: new Map(), svgRef: () => {}, scale,
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

describe('plan benchtops', () => {
  it('draws the outline with its cutout as a hole, plus the join line', () => {
    const svg = renderToStaticMarkup(createElement(PlanViewReportSVG, {
      walls: ROOM, cabinets: CABS, benchtops: [BT], resolvedParts: new Map(), svgRef: { current: null }, scale: 20,
      layers: resolveLayerView(undefined, 'plan'),
      show: { wallNames: true, hatch: true, titleBlock: true, annotColours: false },
    }))
    const top = /<path d="([^"]*)" fill-rule="evenodd" fill="none"/.exec(svg)
    expect(top).not.toBeNull()
    expect(top![1].match(/M/g)).toHaveLength(2)           // outline + sink cutout
    expect(svg).toContain('x1="600" y1="0" x2="600" y2="600"')   // butt join
  })
})

describe('fixtures on the printed sheets', () => {
  const plan = () => renderToStaticMarkup(createElement(PlanViewReportSVG, {
    walls: ROOM, cabinets: CABS, fixtures: FX, resolvedParts: new Map(), svgRef: { current: null }, scale: 20,
    layers: resolveLayerView(undefined, 'plan'), show: { wallNames: true, hatch: true, titleBlock: true, annotColours: false },
  }))
  const elev = () => renderToStaticMarkup(createElement(ElevationPrintSVG, {
    wall: ROOM[0], walls: ROOM, cabinets: CABS, fixtures: FX, room, resolvedParts: new Map(), svgRef: () => {}, scale: 20,
    layers: resolveLayerView(undefined, 'elevation'), show: { returnWalls: true, titleBlock: true },
  }))
  it('plan draws the sink and oven footprints', () => {
    const svg = plan()
    expect(svg).toContain('translate(800,150) rotate(0)')
    expect(svg).toContain('translate(2000,0) rotate(0)')
  })
  it('elevation draws the oven facing the wall at its height, with its inner panel', () => {
    const svg = elev()
    // y = roomH (2400) - z (900) - height (600) = 900
    expect(svg).toMatch(/<rect x="2000" y="900" width="600" height="600"/)
    expect(svg).toMatch(/<rect x="2048" y="948" width="504" height="504"/)
  })
})
