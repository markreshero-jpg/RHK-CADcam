import { describe, it, expect } from 'vitest'
import { resolveCabinet } from '../resolver'
import { mergeRules, resolveReveal } from '../mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type ResolvedFaceZone } from '../types'
import { buildPresetFootprint } from '../../cabinetShape/presets'
import type { PresetParams } from '../../cabinetShape/footprint'
import { shapedInterior } from '../resolveShapedCase'
import { edgeFrame } from '../../cabinetShape/construct'
import { rotEulerXYZ } from '../../jointDrilling'

// z_cabinet_shape 4a follow-up (Mark, 2026-10-14): a door next to an angled
// side panel sat with its front corner past the cabinet side. Its outermost
// corner must be the reveal inside the panel's outer face.
const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const door = { rows: [{ row_index: 0, height_locked: false }], cols: [{ col_index: 0, width_locked: false }],
  zones: [{ row_index: 0, col_index: 0, face_type: 'door' as const, hinge_side: 'left' as const }] }
const cab = (o: Partial<CabinetInput>): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX: 900, DY: 870, DZ: 580,
  has_carcass: true, has_internal: false, has_face: true, has_toekick: false,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
  face_grid: door, internal_tree: { type: 'open', fittings: [] },
  ...o,
})
const corners = (z: ResolvedFaceZone) => ([[0, 0], [z.DX, 0], [z.DX, z.DZ], [0, z.DZ]] as const).map(([x, d]) => {
  const [rx, , rz] = rotEulerXYZ(0, z.AY, 0, x, 0, d)
  return { x: z.X + rx, y: z.Z + rz }
})

const cases: [string, PresetParams][] = [
  ['clipped_corner', { clip_w: 300, clip_d: 200 }],
  ['clipped_corner', { clip_w: 200, clip_d: 200, side: 'left' }],
  ['trapezoid', { inset_l: 100, inset_r: 100 }],
  ['angled_end', { inset: 200 }],
]

describe('doors clear the side panels they sit next to', () => {
  for (const [preset, params] of cases) {
    it(`${preset} ${JSON.stringify(params)}`, () => {
      const c = cab({ footprint: buildPresetFootprint(preset, params, { w: 900, d: 580 }) })
      const rp = resolveCabinet(c)
      const segs = shapedInterior(c)!.segs
      const panels = segs.filter(s => s.type === 'line' && (s.edge.role === 'side' || s.edge.role === 'back'))
      let touched = 0
      for (const z of rp.face_zones) {
        const pts = corners(z)
        for (const s of panels) {
          const g = edgeFrame(s)
          // Depth inside the panel's outer plane, for corners alongside the panel.
          const ds = pts.filter(p => {
            const along = (p.x - s.p0.x) * g.u.x + (p.y - s.p0.y) * g.u.y
            return along > -50 && along < g.len + 50
          }).map(p => (p.x - s.p0.x) * g.n.x + (p.y - s.p0.y) * g.n.y)
          if (!ds.length || Math.min(...ds) > 10) continue
          touched++
          expect(Math.min(...ds), `${s.edge.id}`).toBeCloseTo(resolveReveal('right', 'wall', c.rules), 3)   // wall reveal both ends
        }
      }
      expect(touched).toBeGreaterThan(0)
    })
  }
})

describe('a square-fronted side comes forward to the facet door', () => {
  for (const side of ['right', 'left'] as const) {
    it(`clipped corner (${side}): the side's front end is FACBUF off the door's end, no overlap`, () => {
      const c = cab({ footprint: buildPresetFootprint('clipped_corner', { side }, { w: 900, d: 580 }) })
      const rp = resolveCabinet(c)
      const panel = rp.case_parts.find(p => p.part_key === `${side}_side`)!
      expect(panel.DX).toBeGreaterThan(290)                      // was 280: stopped at the clip vertex
      const door = rp.face_zones.find(z => z.facet)!
      const dc = corners(door)
      // Door end face (the edge nearest the side): back corner → front corner.
      const [b, fr] = side === 'right' ? [dc[1], dc[2]] : [dc[0], dc[3]]
      const m = { x: fr.x - b.x, y: fr.y - b.y }, ml = Math.hypot(m.x, m.y)
      const sideX = side === 'right' ? [882, 900] : [0, 18]
      const front = panel.Z + panel.DX
      // Distance of each side-end corner from the door's end line (positive = clear of the door).
      const dist = sideX.map(x => ((x - b.x) * m.y - (front - b.y) * m.x) / ml * (side === 'right' ? 1 : -1))
      expect(Math.min(...dist)).toBeCloseTo(c.rules.FACBUF, 3)
    })
  }
})
