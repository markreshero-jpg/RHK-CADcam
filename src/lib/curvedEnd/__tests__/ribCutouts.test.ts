// Curved end C4: rib cut-outs. The kit's inner loop rides each rib from the
// resolver (ResolvedCasePart.cutouts) → persist payload (case_parts.cutouts) →
// the optimiser snapshot (cut_holes + cut_hole_skins, in the part's op frame)
// → the G-code, which cuts it before the rib's perimeter and stops at T − OS.
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/src/lib/supabase', () => ({ supabase: {} }))
import fs from 'node:fs'
import path from 'node:path'
import { resolveCabinet } from '../../resolver/resolver'
import { mergeRules } from '../../resolver/mergeRules'
import { buildPersistPayload } from '../../resolver/persistResolved'
import { DEFAULT_RULES, type CabinetInput, type Material, type ResolvedCabinet } from '../../resolver/types'
import { normalizeProject } from '../../optimiser/normalize'
import { generateSheetGcode, DEFAULT_POST } from '../../optimiser/gcode'
import { loopArea } from '../../optimiser/shapes'
import { sampleOutline } from '../../shapePath'
import type { NestedSheet } from '../../optimiser/nest'
import { calcCurvedEnd, CURVED_END_DEFAULTS, type CurvedEndParams } from '../geometry'
import { curvedEndFootprint, DEFAULT_CURVED_END, type CurvedEndSettings } from '../settings'

const FIX = path.join(process.cwd(), 'z_curved_end', 'kit', 'fixtures')
const cases: { id: string; p: Partial<CurvedEndParams> }[] = JSON.parse(fs.readFileSync(path.join(FIX, 'cases.json'), 'utf8'))
const kase = (id: string) => cases.find(k => k.id === id)!.p

function cabFor(kit: Partial<CurvedEndParams>): CabinetInput {
  const p = { ...CURVED_END_DEFAULTS, ...kit }
  const mat = (id: string, DZ: number): Material => ({ id, name: id, DZ, sheet_dx: 2400, sheet_dy: 1200, has_grain: false })
  const curved_end: CurvedEndSettings = { ...DEFAULT_CURVED_END, hand: p.hand, R: p.R, SK: p.SK, OG: p.OG, OL: p.OL, OR: p.OR,
    SBK: p.SBK, SBT: p.SBT, STP: p.STP, lighten: p.lighten, B: p.B, onion: p.onion, OS: p.OS, blkS: p.blkS, blkF: p.blkF }
  return {
    id: 'c1', assembly_class: 'base', DX: p.W, DY: p.H, DZ: p.D,
    has_carcass: false, has_internal: false, has_face: false, has_toekick: false,
    left_neighbour: 'wall', right_neighbour: 'wall', exposed_interior: false,
    material: mat('carcass', p.T), door_material: mat('face', p.FT), shelf_material: mat('carcass', p.T),
    exposed_material: mat('face', p.FT), toekick_face_material: mat('carcass', p.T), toekick_interior_material: mat('carcass', p.T),
    slide_side_deduction: 13, rules: mergeRules(DEFAULT_RULES),
    face_grid: { rows: [], cols: [], zones: [] }, internal_tree: { type: 'open', fittings: [] },
    footprint: curvedEndFootprint(curved_end, { w: p.W, d: p.D }), curved_end,
  }
}

// The persisted rows, read back through the optimiser's normaliser.
const snapshot = (rp: ResolvedCabinet) => {
  const rows = buildPersistPayload(rp).case_parts as Record<string, unknown>[]
  return normalizeProject({ id: 'p', name: 'p', job_number: null }, [{ id: 'room', name: 'R' }],
    [{ id: 'c1', label: 'B1', assembly_class: 'base', room_id: 'room' }],
    rows.map((r, i) => ({ ...r, id: `r${i}`, cabinet_instance_id: 'c1' })), [], [], [], [], new Map(), [], new Map()).parts
}

// Distance from a point to a closed polygon's boundary.
const toBoundary = (q: { x: number; y: number }, poly: { x: number; y: number }[]) => Math.min(...poly.map((a, i) => {
  const b = poly[(i + 1) % poly.length], dx = b.x - a.x, dy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(a.x + t * dx - q.x, a.y + t * dy - q.y)
}))
const inside = (q: { x: number; y: number }, poly: { x: number; y: number }[]) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a.y > q.y) !== (b.y > q.y) && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

describe('rib cut-outs reach the optimiser (C4)', () => {
  for (const id of ['04_rh_tall_cutout_onion', '05_rh_blocks', '07_lh_blocks_16board', '08_double_full']) {
    it(id, () => {
      const p = kase(id), c = calcCurvedEnd(p)
      const rp = resolveCabinet(cabFor(p))
      expect(rp.errors).toEqual([])
      const skin = p.onion ? p.OS! : 0
      // Ribs only — never the top or bottom.
      const cut = rp.case_parts.filter(q => q.cutouts?.length)
      expect(cut.map(q => q.part_key).sort()).toEqual(rp.case_parts.filter(q => q.part_key.startsWith('crv:rib_')).map(q => q.part_key).sort())
      expect(cut.length).toBe(c.gaps - 1)
      for (const q of cut) expect(q.cutouts![0].skin).toBeCloseTo(skin, 6)

      const parts = snapshot(rp)
      for (const q of cut) {
        const np = parts.find(x => x.source_part_key === `case_${q.part_key}`)!
        expect(np.cut_holes).toHaveLength(1)
        expect(np.cut_hole_skins).toEqual([skin])
        const hole = np.cut_holes![0], outline = np.shape!.op_polygon
        // Same area as the kit loop, wholly inside the rib with at least B of border
        // (arcs sampled at 5°: a chord sits a hair inside its arc).
        expect(Math.abs(loopArea(hole))).toBeCloseTo(Math.abs(loopArea(sampleOutline(q.cutouts![0].pts, 0.5))), -2)
        for (const h of hole) {
          expect(inside(h, outline), `${q.part_key} ${h.x},${h.y}`).toBe(true)
          expect(toBoundary(h, outline)).toBeGreaterThan(c.p.B - 0.5)
        }
      }
      // Top and bottom: no holes.
      for (const k of ['crv:top', 'crv:bottom']) expect(parts.find(x => x.source_part_key === `case_${k}`)!.cut_holes).toBeUndefined()
    })
  }
  it('no cut-outs when lighten is off', () => {
    const rp = resolveCabinet(cabFor(kase('01_rh_default')))
    expect(rp.case_parts.some(q => q.cutouts)).toBe(false)
    expect(buildPersistPayload(rp).case_parts.some(r => 'cutouts' in r)).toBe(false)
  })
})

describe('rib cut-out G-code: stops at T − onion skin', () => {
  const sheet: NestedSheet = {
    index: 0, materialId: 'm', thickness: 16.5,
    stock: { w: 2400, h: 1200, trimTop: 0, trimBottom: 0, trimLeft: 0, trimRight: 0, isOffcut: false, label: null },
    placements: [{ uid: 'p1#0', baseUid: 'case_parts:r1', label: 'Rib1', x: 100, y: 100, w: 400, h: 400, rotated: false }],
    efficiency: 0.1,
  }
  const hole = [{ x: 200, y: 200 }, { x: 400, y: 200 }, { x: 400, y: 400 }, { x: 200, y: 400 }]
  const deepest = (sheetSkin: number, holeSkin: number) => {
    const g = generateSheetGcode({ sheet, thickness: 16.5, profile: { ...DEFAULT_POST, onion_skin_z: sheetSkin }, drills: [],
      toolNumber: 1, toolDiameter: 10, maxDepthPerPass: 30, holes: { 'p1#0': [hole] }, holeSkins: { 'p1#0': [holeSkin] } })
    const ls = g.split('\r\n')
    let zMin = 0, cutouts = 0
    ls.forEach((l, i) => {
      if (!l.includes('Cutout 1')) return
      cutouts++
      for (let j = i + 1; j < ls.length && !ls[j].includes('Part Rib1'); j++) {
        const m = /Z(-[\d.]+)/.exec(ls[j]); if (m) zMin = Math.min(zMin, Number(m[1]))
      }
    })
    return { zMin, cutouts }
  }
  it('no sheet onion skin: one pass to −(16.5 − 0.3)', () => {
    expect(deepest(0, 0.3)).toEqual({ zMin: -16.2, cutouts: 1 })
  })
  it('sheet onion skin thicker than the hole skin: roughs to the sheet skin, then finishes to the hole skin', () => {
    expect(deepest(0.5, 0.3)).toEqual({ zMin: -16.2, cutouts: 2 })
  })
  it('sheet onion skin thinner than the hole skin: the separation pass leaves the hole alone', () => {
    expect(deepest(0.2, 0.3)).toEqual({ zMin: -16.2, cutouts: 1 })
  })
  it('skin 0 cuts through as before', () => {
    expect(deepest(0, 0).zMin).toBeLessThan(-16.5)
  })
})
