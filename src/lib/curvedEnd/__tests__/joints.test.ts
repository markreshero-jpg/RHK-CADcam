// Curved end C3: the seeded library joints on the generator-declared seams
// reproduce the kit's fixing holes. Every fixture case goes through the real
// resolver (resolveCabinet → resolveJoints → declaredSeamDrillOps) and the CNC
// row builder (seamDrillSync.collectDrillRows); each part's Ø5 holes, read in
// its footprint frame, must equal the kit's (kitHoles, itself proven against
// the golden DXFs) to 0.01 mm.
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/src/lib/supabase', () => ({ supabase: {} }))
import fs from 'node:fs'
import path from 'node:path'
import { collectDrillRows, collectCurvedPocketRoutes, CURVED_POCKET_OVERRUN } from '../../optimiser/seamDrillSync'
import { resolveCabinet } from '../../resolver/resolver'
import { mergeRules } from '../../resolver/mergeRules'
import { DEFAULT_RULES, type CabinetInput, type JointTypeOp, type Material } from '../../resolver/types'
import { curvedEndPartKey } from '../../resolver/resolveCurvedEnd'
import { calcCurvedEnd, curvedEndParts, CURVED_END_DEFAULTS, type CurvedEndParams } from '../geometry'
import { kitHoles } from '../kitHoles'
import { curvedEndFootprint, DEFAULT_CURVED_END, type CurvedEndSettings } from '../settings'
import { CURVED_END_JOINTS } from '../joints'

const FIX = path.join(process.cwd(), 'z_curved_end', 'kit', 'fixtures')
const cases: { id: string; p: Partial<CurvedEndParams> }[] = JSON.parse(fs.readFileSync(path.join(FIX, 'cases.json'), 'utf8'))

// The seed as the loader would hand it to the resolver.
const jointTypeOps: Record<string, JointTypeOp[]> = {}, jointDefaults: Record<string, string> = {}, jointTypeNames: Record<string, string> = {}
CURVED_END_JOINTS.forEach((j, n) => {
  const id = `jt${n}`
  jointTypeNames[id] = j.name
  jointTypeOps[id] = j.ops.map((o, i) => ({ ...o, id: `${id}op${i}`, joint_type_id: id, operation_order: i }))
  for (const s of j.seams) jointDefaults[s] = id
})

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
    joint_defaults: jointDefaults, joint_type_ops: jointTypeOps, joint_type_names: jointTypeNames,
  }
}

const key = ([x, y]: [number, number]) => `${(Math.round(x * 100) / 100).toFixed(2)},${(Math.round(y * 100) / 100).toFixed(2)}`

describe('curved end joints reproduce the kit holes', () => {
  for (const k of cases) {
    if (k.id.startsWith('10_')) continue   // the warning case cuts nothing
    it(k.id, () => {
      const cab = cabFor(k.p)
      const rp = resolveCabinet(cab)
      expect(rp.errors).toEqual([])
      const { rows, skipped } = collectDrillRows(rp, 'c1')
      expect(skipped).toBe(0)
      const c = calcCurvedEnd({ ...k.p })
      const want = kitHoles(c)
      const byPart = new Map<string, [number, number][]>()
      for (const r of rows) {
        expect(r.diameter).toBe(5)
        const part = rp.case_parts.find(p => `case_${p.part_key}` === r.source_part_key)!
        expect(r.depth).toBeCloseTo(part.DZ, 6)                         // through
        // face-kind upright footprint: pos_x = height, pos_y = along its length.
        // The LH fixing panel is the RH part fitted the other way round (kit §1):
        // its holes read mirrored from the face it machines on.
        const along = c.p.hand === 'LH' && part.part_key === 'crv:fix' ? part.DY - r.pos_y : r.pos_y
        const arr = byPart.get(part.part_key) ?? []; arr.push([along, r.pos_x]); byPart.set(part.part_key, arr)
      }
      const names = curvedEndParts(c).filter(p => want[p.name]).map(p => p.name)
      expect(names.length).toBeGreaterThan(0)
      for (const n of names) {
        const pk = curvedEndPartKey(n)
        expect((byPart.get(pk) ?? []).map(key).sort(), `${k.id} ${n}`).toEqual(want[n]!.map(key).sort())
      }
      // nothing drilled anywhere the kit doesn't drill
      expect([...byPart.keys()].sort()).toEqual(names.map(curvedEndPartKey).sort())
    })
  }
})

describe('skip-near: block face screws give way to its end screws (kit: within 20)', () => {
  it('a face hole on a rib centreline is dropped, and the rest still match the kit', () => {
    // 500 high with one rib: the block's middle face hole (250) lands on the rib's centreline.
    const p: Partial<CurvedEndParams> = { hand: 'RH', W: 230, D: 500, H: 500, blkS: true, blkF: true, ribs: 1 }
    const cab = cabFor(p)
    cab.curved_end = { ...cab.curved_end!, ribs: 1 }
    const rp = resolveCabinet(cab)
    const { rows } = collectDrillRows(rp, 'c1')
    const c = calcCurvedEnd(p), want = kitHoles(c)
    const front = rows.filter(r => r.source_part_key === 'case_crv:blk_front').map(r => [r.pos_y, r.pos_x] as [number, number])
    expect(front.map(key).sort()).toEqual(want.Block_Front!.map(key).sort())
    expect(front.some(([, y]) => Math.abs(y - 250) < 0.01)).toBe(true)                // the end hole on the rib stays
    expect(front.filter(([x]) => Math.abs(x - 30) < 0.01).length).toBe(3 + 2)          // 60 block: 3 end + 2 face (250 dropped)
  })
})

describe('bend pockets (C3, decision 13)', () => {
  const expected = JSON.parse(fs.readFileSync(path.join(FIX, 'expected.json'), 'utf8'))
  it('one back-face pocket per curve at the kit positions, overrunning top and bottom by cutter radius + 1', () => {
    expect(CURVED_POCKET_OVERRUN).toBe(6)
    for (const id of ['01_rh_default', '03_rh_overhangs_scribes', '07_lh_blocks_16board', '08_double_full', '09_double_halfround']) {
      const k = cases.find(x => x.id === id)!
      const rp = resolveCabinet(cabFor(k.p))
      const { rows, skipped } = collectCurvedPocketRoutes(rp, 'c1', 'tool10')
      expect(skipped).toBe(0)
      const want = expected[id].derived.pockets as [number, number][]
      const H = expected[id].input.H, FT = expected[id].input.FT, SK = expected[id].input.SK
      expect(rows.map(r => [r.pos_x - r.size_dx! / 2, r.pos_x + r.size_dx! / 2].map(v => Math.round(v * 100) / 100)), id).toEqual(want)
      for (const r of rows) {
        expect(r).toMatchObject({ source_part_key: 'case_crv:face', operation_type: 'route', operation_action: 'pocket',
          output_face: 'back', router_tool_id: 'tool10', depth: FT - SK })
        expect([r.pos_y, r.size_dy]).toEqual([H / 2, H + 12])
      }
    }
  })
  it('grain along the wrap puts the pocket on DY', () => {
    const cab = cabFor({ hand: 'RH' })
    cab.curved_end = { ...cab.curved_end!, grain: 'horizontal' }
    const [r] = collectCurvedPocketRoutes(resolveCabinet(cab), 'c1', 't').rows
    expect([r.pos_x, r.size_dx, Math.round((r.pos_y - r.size_dy! / 2) * 100) / 100]).toEqual([250, 512, 17])
  })
  it('no 10 mm bit: skipped, counted', () => {
    expect(collectCurvedPocketRoutes(resolveCabinet(cabFor({ hand: 'DOUBLE', W: 1000 })), 'c1', null)).toEqual({ rows: [], skipped: 2 })
  })
})

describe('the C3 migration seeds exactly the joints in code', () => {
  it('names, formulas, skip distances and default seams match CURVED_END_JOINTS', () => {
    const sql = fs.readFileSync(path.join(process.cwd(), 'z_curved_end', 'migration_c3_curved_end_joints.sql'), 'utf8')
    for (const j of CURVED_END_JOINTS) {
      const at = sql.indexOf(`('${j.name}',`)
      expect(at, j.name).toBeGreaterThan(0)
      const block = sql.slice(at, sql.indexOf('::numeric)', at))
      const json = /'(\{.*\})'::jsonb/.exec(block)![1]
      expect(JSON.parse(json), j.name).toEqual(j.ops[0].expressions)
      expect(block.trim().endsWith(String(j.ops[0].skip_near_mm ?? 'null')), j.name).toBe(true)
      for (const s of j.seams) expect(sql).toContain(`('${s}',${' '.repeat(Math.max(1, 19 - s.length - 2))}'${j.name}')`)
    }
  })
})
