import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ElevationPrintSVG from '@/app/canvas/[roomId]/ElevationPrintSVG'
import { resolveLayerView } from '../displayLayers/resolve'
import { elevationViews } from '../shopDrawings/elevationViews'
import type { Wall, CabinetInstance, Room } from '../types'

// Islands + back sides print too (Mark, 2026-10-26: "shop drawings don't include island bench walls").
const wall = (id: string, sort_order: number, wall_type: Wall['wall_type'], extra: Partial<Wall> = {}): Wall => ({
  id, room_id: 'r', name: id, sort_order, length: 3000, height: null, soffit_height: null,
  angle: 0, pos_x: 0, pos_y: 0, thickness: wall_type === 'island' ? 0 : 90, wall_type, created_at: '', ...extra,
})
const cab = (id: string, w: Wall, rotation: number, pos_x = 0, dx = 600) =>
  ({ id, wall_id: w.id, pos_x, pos_y: 0, dx, dz: 580, dy: 870, rotation, footprint: null,
     assembly_class: 'base', label: id }) as unknown as CabinetInstance

const W1 = wall('W1', 1, 'standard'), W2 = wall('W2', 0, 'standard'), ISL = wall('ISL', 2, 'island')

describe('elevationViews', () => {
  it('standard faces in wall order, back only with cabinets, then islands both sides', () => {
    const views = elevationViews([ISL, W1, W2], [cab('a', W1, 0), cab('b', W1, 180), cab('c', ISL, 0), cab('d', ISL, 180)])
    expect(views.map(v => v.key)).toEqual(['W2', 'W1', 'W1:back', 'ISL', 'ISL:back'])
    expect(views[2].name).toBe('W1 — back')
  })
  it('an island with cabinets only on its back still prints (back only); an empty one keeps its face', () => {
    expect(elevationViews([ISL], [cab('d', ISL, 180)]).map(v => v.key)).toEqual(['ISL:back'])
    expect(elevationViews([ISL], []).map(v => v.key)).toEqual(['ISL'])
  })
})

describe('ElevationPrintSVG back side', () => {
  it('mirrors cabinets: a back cabinet at t=0 draws at the right-hand end', () => {
    const svg = renderToStaticMarkup(createElement(ElevationPrintSVG, {
      wall: ISL, side: 'back', walls: [ISL], cabinets: [cab('d', ISL, 180, 0, 600)], room: { id: 'r', name: 'K', height: 2400 } as unknown as Room,
      resolvedParts: new Map(), svgRef: () => {}, scale: 20,
      layers: resolveLayerView(undefined, 'elevation'), show: { returnWalls: true, titleBlock: true },
    }))
    expect(svg).toContain('ISL — back')
    expect(svg).toMatch(/<rect x="2400" y="[\d.]+" width="600"/)
  })
})
