import { describe, it, expect } from 'vitest'
import { createElement, createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PlanViewReportSVG from '@/app/canvas/[roomId]/PlanViewReportSVG'
import { resolveLayerView } from '../displayLayers/resolve'
import type { Wall, BenchtopInstance, BenchtopEdgeProfile } from '../types'
import type { LayerSet } from '../displayLayers/registry'

const wall: Wall = { id: 'W1', room_id: 'r', name: 'W1', sort_order: 0, length: 3000, height: null, soffit_height: null,
  angle: 0, pos_x: 0, pos_y: 0, thickness: 90, wall_type: 'standard', created_at: '' } as Wall
const line = (x0: number, y0: number, x1: number, y1: number, edge?: object) =>
  ({ type: 'line' as const, p0: { x: x0, y: y0 }, p1: { x: x1, y: y1 }, edge })
const bt = { id: 'b', label: 'BT1', room_id: 'r', joins: [], cutout_polygons: [],
  segments: [line(0, 0, 3000, 0, { wall: true }), line(3000, 0, 3000, 600, { profile_id: 'wf' }),
             line(3000, 600, 0, 600, { profile_id: 'ma' }), line(0, 600, 0, 0)] } as unknown as BenchtopInstance
const profiles = {
  wf: { id: 'wf', name: 'Waterfall', code: 'WF', generates: 'waterfall' },
  ma: { id: 'ma', name: 'Mitred Apron 50', code: 'MA50', generates: 'apron' },
} as unknown as Record<string, BenchtopEdgeProfile>
const set = { id: 's', name: 'Benchtops', sort_order: 0, settings: { plan: { items: { benchtop_sizes: { visible: true, style: 'solid' } } } } } as unknown as LayerSet

describe('plan print edge codes', () => {
  it('prints profile codes on exposed edges', () => {
    const html = renderToStaticMarkup(createElement(PlanViewReportSVG, {
      walls: [wall], cabinets: [], benchtops: [bt], svgRef: createRef<SVGSVGElement>(), scale: 20,
      layers: resolveLayerView(set, 'plan'), show: { titleBlock: false, annotColours: false },
      btProfiles: profiles, btDefaultProfile: () => null,
    }))
    expect(html).toContain('>WF<')
    expect(html).toContain('>MA50<')
    expect(html).toContain('>3000<')
  })
})
