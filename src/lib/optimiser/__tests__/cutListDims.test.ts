import { describe, it, expect, vi } from 'vitest'
vi.mock('@/src/lib/supabase', () => ({ supabase: {} }))
import { cutListDims, cabinetLookups, shapeMark, type CutListTable } from '../cutListDims'
import { normalizeProject } from '../normalize'
import type { ShapeRow } from '../shapes'
import type { SizeOv } from '../sizeOverrides'
import { resolveCabinet } from '../../resolver/resolver'
import { mergeRules } from '../../resolver/mergeRules'
import { DEFAULT_RULES, type CabinetInput, type Material, type ResolvedCabinet } from '../../resolver/types'
import { buildPresetFootprint } from '../../cabinetShape/presets'

// Phase plan O6: the paper cut list reads a part's size exactly as optimiser
// Stage 2 does — same overrides, same shapes.

const board: Material = { id: 'm18', name: 'Board 18', DZ: 18, sheet_dx: 2400, sheet_dy: 1200, has_grain: false }
const cab = (o: Partial<CabinetInput> = {}): CabinetInput => ({
  id: 'c1', assembly_class: 'base', DX: 900, DY: 870, DZ: 900,
  has_carcass: true, has_internal: true, has_face: true, has_toekick: true,
  left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
  material: board, door_material: board, shelf_material: board, exposed_material: board,
  toekick_face_material: board, toekick_interior_material: board,
  slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
  face_grid: { rows: [{ row_index: 0, height_locked: false }], cols: [{ col_index: 0, width_locked: false }],
    zones: [{ row_index: 0, col_index: 0, face_type: 'door', hinge_side: 'left' }] },
  internal_tree: { type: 'open', fittings: [{ type: 'adj_shelf', count: 1 } as never] },
  ...o,
})

// Snapshot rows the optimiser would read for this cabinet.
function stage2(rp: ResolvedCabinet, ov: Record<string, SizeOv>, shapes: ShapeRow[]) {
  const row = (p: { DX: number; DY: number; DZ: number; material_id: string; outline?: unknown }, i: number, extra: object) =>
    ({ id: `r${i}`, cabinet_instance_id: 'c1', dx: p.DX, dy: p.DY, dz: p.DZ, material_id: p.material_id, outline: p.outline ?? null, ...extra })
  return normalizeProject({ id: 'p', name: 'p', job_number: null }, [{ id: 'room', name: 'R' }],
    [{ id: 'c1', label: 'C', assembly_class: 'base', room_id: 'room' }],
    rp.case_parts.map((p, i) => row(p, i, { part_key: p.part_key })),
    rp.internal_parts.map((p, i) => row(p, i, { part_type: p.part_type, sort_order: p.sort_order })),
    [],
    rp.face_zones.map((z, i) => row(z, i, { row_index: z.row_index, col_index: z.col_index, facet: z.facet ?? null, face_type: z.face_type })),
    [], new Map(), [], new Map(), new Map(), {},
    new Map([['c1', ov]]), new Map([['c1', Object.fromEntries(shapes.map(s => [s.part_key, s]))]])).parts
}

const square = (w: number, h: number): ShapeRow['segments'] => {
  const p = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]
  return p.map((a, i) => ({ type: 'line', p0: a, p1: p[(i + 1) % 4] }))
}

describe('cut-list sizes = optimiser Stage 2 (O6)', () => {
  for (const shaped of [false, true]) {
    it(shaped ? 'BCNP (resolver outlines)' : 'box cabinet with a resized gable, door and a drawn shelf shape', () => {
      const rp = resolveCabinet(cab(shaped ? {
        assembly_class: 'base_corner',
        footprint: buildPresetFootprint('l_corner', { leg_back: 560, leg_side: 560, side: 'right' }, { w: 900, d: 900 }),
      } : {}))
      const shelf = rp.internal_parts.find(p => p.part_type === 'adj_shelf')!
      // Gable sh (box height = DY) 700; door sw (= DX) 400; shelf drawn at its
      // own size (fresh); the bottom drawn at the wrong size (stale).
      const ov: Record<string, SizeOv> = { case_left_side: { sh: 700 }, zone_0_0: { sw: 400 } }
      const shapes: ShapeRow[] = shaped ? [] : [
        { cabinet_id: 'c1', part_key: `int_adj_shelf_${shelf.sort_order}`, revision: 2, meta: null, segments: square(shelf.DY, shelf.DX) },
        { cabinet_id: 'c1', part_key: 'case_bottom', revision: 1, meta: null, segments: square(100, 100) },
      ]
      const { sizeOv, shapes: byCab } = cabinetLookups('c1', ov, shapes)
      const opt = stage2(rp, ov, shapes)
      const check = (table: CutListTable, p: Parameters<typeof cutListDims>[1], ref?: Parameters<typeof cutListDims>[5]) => {
        const d = cutListDims(table, p, 'c1', sizeOv, byCab, ref)
        const o = opt.find(x => x.source_part_key === d.partId)!
        expect(o, d.partId).toBeTruthy()
        expect([d.DX, d.DY, d.DZ], d.partId).toEqual([o.w, o.h, o.thickness])
        expect(d.overridden, d.partId).toBe(!!o.size_overridden)
        expect(d.shape?.source ?? null, d.partId).toBe(o.shape?.source ?? null)
        expect(d.shape?.stale ?? false, d.partId).toBe(!!o.shape_stale)
        return d
      }
      rp.case_parts.forEach(p => check('case_parts', p))
      rp.internal_parts.forEach(p => check('internal_parts', p))
      rp.face_zones.forEach(z => check('face_zones', z, z))

      const gp = rp.case_parts.find(p => p.part_key === 'left_side')
      if (!shaped) { const gable = cutListDims('case_parts', gp!, 'c1', sizeOv, byCab); expect(gable.DY).toBe(700); expect(gable.base!.DY).not.toBe(700) }
      expect(cutListDims('face_zones', rp.face_zones[0], 'c1', sizeOv, byCab, rp.face_zones[0]).DX).toBe(400)
      if (shaped) {
        expect(shapeMark(cutListDims('case_parts', rp.case_parts.find(p => p.part_key === 'bottom')!, 'c1', sizeOv, byCab))).toBe('⬠ auto')
      } else {
        expect(shapeMark(cutListDims('internal_parts', shelf, 'c1', sizeOv, byCab))).toBe('⬠')
        expect(shapeMark(cutListDims('case_parts', rp.case_parts.find(p => p.part_key === 'bottom')!, 'c1', sizeOv, byCab))).toBe('⬠ STALE')
      }
    })
  }
})
