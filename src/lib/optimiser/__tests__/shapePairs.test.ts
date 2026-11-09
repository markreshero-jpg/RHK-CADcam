import { describe, it, expect } from 'vitest'
import { bestPairFit, buildShapePairs, expandShapePairs, outlinesClear, pairMemberPlacement, pairsWin } from '../shapePairs'
import { toSheet, buildSheetDrills, type DrillOpRaw, type PartRef } from '../drills'
import { buildSheetRoutes, groupRouteOps, type RouteOpRaw } from '../routes'
import { placedOutline, placedHoles } from '../shapes'
import { sheetEfficiency } from '../edit'
import { grainMatchTags } from '../grainBlocks'
import { nest, type GroupStock, type NestPartInput, type NestResult, type NestedSheet, type Placement } from '../nest'
import type { OptiPart } from '../types'

const GAP = 13
const tri = [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 0, y: 600 }]
const stock: GroupStock = { standard: { w: 2400, h: 1200, trimTop: 5, trimBottom: 5, trimLeft: 5, trimRight: 5, isOffcut: false, label: null }, offcuts: [] }
const part = (uid: string): OptiPart => ({ uid, w: 600, h: 600, eb_w1: 0, eb_w2: 0, eb_h1: 0, eb_h2: 0, shape: { op_polygon: tri, polygon: tri, segments: [], source: 'resolver', bbox: { w: 600, h: 600 }, tape_mm: null, revision: 0 } }) as unknown as OptiPart
const inst = (uid: string): NestPartInput => ({ uid: `${uid}#0`, baseUid: uid, label: uid, w: 600, h: 600, thickness: 16.5, materialId: 'm', grainLock: false, priority: 0 })
const build = (ids: string[]) => buildShapePairs({
  parts: ids.map(inst), partByUid: new Map(ids.map(i => [i, part(i)])), deductEb: false,
  gapFor: () => GAP, stockFor: () => stock, allowRotation: true,
})
const pl = (over: Partial<Placement>): Placement => ({ uid: 'u', baseUid: 'u', label: 'u', x: 100, y: 200, w: 600, h: 400, rotated: false, ...over })

describe('the half turn', () => {
  it('toSheet: a turned part lands opposite corner to corner', () => {
    expect(toSheet(10, 20, pl({ turned: true }))).toEqual({ x: 690, y: 580 })
  })
  it('toSheet: quarter then half turn is 270', () => {
    expect(toSheet(10, 20, pl({ w: 400, h: 600, rotated: true, turned: true }))).toEqual({ x: 120, y: 790 })
  })
  it('the outline and cut-outs move exactly like the holes', () => {
    const p = { ...part('a'), cut_holes: [[{ x: 50, y: 60 }]] } as OptiPart & { cut_holes: { x: number; y: number }[][] }
    for (const over of [{ w: 600, h: 600, turned: true }, { w: 600, h: 600, rotated: true, turned: true }]) {
      const placed = pl(over)
      const o = placedOutline(p, placed, false)!
      tri.forEach((q, i) => {
        const s = toSheet(q.x, q.y, placed)
        expect({ x: o[i].x + placed.x, y: o[i].y + placed.y }).toEqual(s)
      })
      const s = toSheet(50, 60, placed), h = placedHoles(p, placed, false)[0][0]
      expect({ x: h.x + placed.x, y: h.y + placed.y }).toEqual(s)
    }
  })
  const ref: PartRef = { source_table: 'case_parts', cabinet_instance_id: 'c', source_part_key: 'k', w: 600, h: 400 }
  const sheet = (p: Placement): NestedSheet => ({ index: 0, materialId: null, thickness: 16.5, efficiency: 0, stock: stock.standard, placements: [p] })
  it('holes follow the half turn', () => {
    const op = { source_table: 'case_parts', source_cabinet_id: 'c', source_part_key: 'k', pos_x: 37, pos_y: 50, diameter: 5, depth: 12, repeat_count: 2, repeat_spacing: 32, repeat_axis: 'x' } as DrillOpRaw
    const d = buildSheetDrills(sheet(pl({ baseUid: 'p', turned: true })), new Map([['p', ref]]), new Map([['case_parts|c|k', [op]]]), 17)
    expect(d.map(h => [h.x, h.y])).toEqual([[663, 550], [631, 550]])
  })
  it('grooves and pockets follow the half turn', () => {
    const base = { source_table: 'case_parts', source_cabinet_id: 'c', source_part_key: 'k', offset_top_mm: null, offset_bottom_mm: null, offset_left_mm: null, offset_right_mm: null, depth: 5, size_dz: 5, fill_strategy: null, raster_angle_deg: null, raster_stepover_pct: null, toolNumber: 1, toolDiameter: 8, maxDepthPerPass: null }
    const groove = { ...base, operation_type: 'groove', operation_action: null, pos_x: 10, pos_y: 20, size_dx: null, size_dy: null, length: 100, width: 8, angle_az: 0 } as RouteOpRaw
    const pocket = { ...base, operation_type: 'route', operation_action: 'pocket', pos_x: 100, pos_y: 50, size_dx: 40, size_dy: 20, length: null, width: null } as RouteOpRaw
    const [g, a] = buildSheetRoutes(sheet(pl({ baseUid: 'p', turned: true })), new Map([['p', ref]]), groupRouteOps([groove, pocket]))
    expect(g).toMatchObject({ kind: 'groove', x1: 690, y1: 580, x2: 590, y2: 580 })
    expect(a).toMatchObject({ kind: 'area', x: 580, y: 540, w: 40, h: 20 })
  })
})

describe('pairing', () => {
  it('two triangles share a rectangle with the gap between them', () => {
    const f = bestPairFit(tri, 600, 600, tri, 600, 600, GAP)!
    expect(f.turned).toBe(true)
    expect(f.W * f.H).toBeLessThan(600 * 640)
    const B = tri.map(p => ({ x: 600 - p.x + f.bx - f.ax, y: 600 - p.y + f.by - f.ay }))
    expect(outlinesClear(tri, B, GAP)).toBe(true)
    expect(outlinesClear(tri, B, GAP + 2)).toBe(false)
  })
  it('a square does not pair', () => {
    const s = [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 600 }, { x: 0, y: 600 }]
    expect(bestPairFit(s, 600, 600, s, 600, 600, GAP)).toBeNull()
  })
  it('real parts are clear of each other once expanded, turned pair or not', () => {
    const { parts, pairs } = build(['a', 'b'])
    expect(pairs).toHaveLength(1)
    expect(parts).toHaveLength(1)
    const index = { 'a#0': inst('a'), 'b#0': inst('b') }
    for (const rotated of [false, true]) {
      const [W, H] = rotated ? [pairs[0].H, pairs[0].W] : [pairs[0].W, pairs[0].H]
      const raw: NestResult = { unplaced: [], sheets: [{ index: 0, materialId: 'm', thickness: 16.5, efficiency: 0, stock: stock.standard, placements: [{ uid: pairs[0].uid, baseUid: pairs[0].uid, label: 'x', x: 50, y: 60, w: W, h: H, rotated }] }] }
      const res = expandShapePairs(raw, pairs, index)
      const [a, b] = res.sheets[0].placements
      const world = (p: Placement) => placedOutline(part(p.baseUid), p, false)!.map(q => ({ x: q.x + p.x, y: q.y + p.y }))
      expect(outlinesClear(world(a), world(b), GAP - 0.01)).toBe(true)
      for (const p of [a, b]) {
        expect(p.x).toBeGreaterThanOrEqual(50 - 1e-6); expect(p.x + p.w).toBeLessThanOrEqual(50 + W + 1e-6)
        expect(p.y).toBeGreaterThanOrEqual(60 - 1e-6); expect(p.y + p.h).toBeLessThanOrEqual(60 + H + 1e-6)
      }
      expect(res.sheets[0].efficiency).toBeCloseTo(360000 / (2390 * 1190), 5)
      expect(res.blocks?.[0]).toMatchObject({ pair: true, name: 'P1' })
      expect(grainMatchTags(res).size).toBe(0)
    }
  })
  it('an odd part stays single, and a pair too big for the stock stays apart', () => {
    expect(build(['a', 'b', 'c']).pairs).toHaveLength(1)
    const small: GroupStock = { standard: { ...stock.standard, w: 620, h: 620 }, offcuts: [] }
    const r = buildShapePairs({ parts: ['a', 'b'].map(inst), partByUid: new Map(['a', 'b'].map(i => [i, part(i)])), deductEb: false, gapFor: () => GAP, stockFor: () => small, allowRotation: true })
    expect(r.pairs).toHaveLength(0)
  })
  it('an unplaced pair puts both parts back on the unplaced list', () => {
    const { parts, pairs } = build(['a', 'b'])
    const res = expandShapePairs({ sheets: [], unplaced: parts }, pairs, { 'a#0': inst('a'), 'b#0': inst('b') })
    expect(res.unplaced.map(u => u.uid).sort()).toEqual(['a#0', 'b#0'])
  })
  it('keeps the plain nest unless pairing is better', () => {
    const sheet = (efficiency: number) => ({ efficiency } as NestedSheet)
    const r = (es: number[], un = 0) => ({ sheets: es.map(sheet), unplaced: Array(un).fill(inst('x')) }) as NestResult
    expect(pairsWin(r([0.9]), r([0.9, 0.2]))).toBe(true)
    expect(pairsWin(r([0.9, 0.2]), r([0.9]))).toBe(false)
    expect(pairsWin(r([0.9, 0.2]), r([0.9, 0.2]))).toBe(false)
    expect(pairsWin(r([0.9, 0.2]), r([0.9, 0.35]))).toBe(true)
    expect(pairsWin(r([0.9, 0.9, 0.2], 0), r([0.9], 1))).toBe(true)
  })
  it('a nest of pairs uses less room than the parts alone', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const settings = { quality: 'fast', allowRotation: true, marginByMaterial: {}, defaultMargin: GAP } as const
    const group = { m__16_5: stock }, key = Object.keys(group)[0]
    const stockByGroup = { [`m__16.5`]: stock, [key]: stock }
    const { parts } = build(ids)
    expect(nest(parts, stockByGroup, settings).sheets.length).toBeLessThan(nest(ids.map(inst), stockByGroup, settings).sheets.length)
  })
})

describe('efficiency', () => {
  it('counts the real area of a paired part', () => {
    const s = { stock: stock.standard, placements: [pl({ w: 600, h: 600, trueArea: 180000 })] } as NestedSheet
    expect(sheetEfficiency(s)).toBeCloseTo(180000 / (2390 * 1190), 6)
  })
  it('pairMemberPlacement only marks the turned member', () => {
    const def = { baseUid: 'a', label: 'a' }
    const m = { uid: 'a', bx: 0, by: 0, w: 10, h: 20, turned: false, area: 100 }
    expect(pairMemberPlacement({ x: 0, y: 0, rotated: false }, { H: 20 }, m, def).turned).toBeUndefined()
    expect(pairMemberPlacement({ x: 0, y: 0, rotated: false }, { H: 20 }, { ...m, turned: true }, def).turned).toBe(true)
  })
})
