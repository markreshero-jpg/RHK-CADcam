// ============================================================
// Häfele Slider SC sliding robe doors (z_slider_sc S2)
// A face-only item (no carcass) whose door zones become the board panels of
// sliding doors: sized by Häfele's panel formulas, spread across the opening
// with a 60 overlap, each pushed back onto its track (39 pitch). No hinges, no
// handles — the vertical profile is the grip. The aluminium is not a part: it is
// drawn and listed from `ResolvedCabinet.slider` (sliderProfiles / sliderCuts).
// Runs after resolveHandles.
// ============================================================

import { edgeSidesToBanding, type CabinetInput, type ResolvedFaceZone, type ResolverError, type ResolvedSlider } from './types'
import { SLIDER, sliderDoors, sliderWarnings, doorCount, type SliderOptions } from './sliderSC'

export function sliderOptions(r: CabinetInput['rules']): SliderOptions | null {
  const layout = r.SLIDER
  if (layout !== '2' && layout !== '3' && layout !== '3T') return null
  return {
    layout,
    stile: r.SLIDER_STILE ?? 'handle',
    finish: r.SLIDER_FINISH ?? 'silver',
    railLip: layout === '3T' || r.SLIDER_RAIL !== 'plain',
  }
}

export function resolveSlider(cab: CabinetInput, zones: ResolvedFaceZone[], warnings: ResolverError[]): ResolvedSlider | null {
  const o = sliderOptions(cab.rules)
  if (!o || !cab.has_face) return null
  const n = doorCount(o.layout)
  // The widest row of exactly n doors (a slider has one row).
  const rows = new Map<number, ResolvedFaceZone[]>()
  for (const z of zones) if (!z.facet && !z.AY) rows.set(z.row_index, [...(rows.get(z.row_index) ?? []), z])
  const row = [...rows.values()].find(r => r.length === n && r.every(z => z.face_type === 'door'))
  if (cab.footprint || !row) {
    warnings.push({ code: 'SLIDER_NEEDS_DOORS', message: `Slider SC ${o.layout === '2' ? '2' : '3'} door needs one row of ${n} doors — the doors are left as they are`, part: 'face' })
    return null
  }
  const icw = cab.DX, ih = cab.DY, front = cab.DZ
  const doors = sliderDoors(icw, ih, o.layout, o.stile)
  const sorted = [...row].sort((a, b) => a.X - b.X)
  const lift = o.stile === 'slimline' ? SLIDER.slimlineSpacer : 0
  sorted.forEach((z, i) => {
    const d = doors[i]
    z.X = d.panelX
    z.DX = d.panelW
    z.Y = SLIDER.doorBottom + lift
    z.DY = d.panelH
    z.Z = front - d.dCentre - z.DZ / 2          // back face; the board centred on its track
    z.slider_track = d.track
    z.handle = null
    // The panel edges are inside the aluminium: no tape (Mark, 2026-11-04).
    z.edge_band = edgeSidesToBanding([], z.edge_band?.id)
    delete z.hinge_side
  })
  const board = Math.max(...sorted.map(z => z.DZ))
  warnings.push(...sliderWarnings(icw, ih, board, o).map(w => ({ ...w, part: 'face' })))
  return {
    layout: o.layout, stile: o.stile, finish: o.finish, rail: o.railLip ? 'lip' : 'plain',
    icw, ih, front,
    doors: sorted.map(z => ({ row_index: z.row_index, col_index: z.col_index, track: z.slider_track! })),
  }
}
