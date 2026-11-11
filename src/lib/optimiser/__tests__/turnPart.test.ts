// Stage 5 right-click Rotate 180° / Mirror part / Flip part (Mark, 2026-11-11).
// A part is turned in its own footprint: holes, routes and its outline turn with
// it, and turning it over (Mirror / Flip) moves its blind work to the other face.
import { describe, it, expect, beforeEach } from 'vitest'
import { buildSheetDrills, groupDrillOps, toSheet, type DrillOpRaw, type PartRef } from '../drills'
import { groupRouteOps } from '../routes'
import { isTwoSidedSheet, projectSheetDrills } from '../sheetDrills'
import { placedOutline } from '../shapes'
import { useOptiStore } from '../store'
import type { NestedSheet, NestPartInput, Placement } from '../nest'

const stock = { w: 2400, h: 1200, trimTop: 10, trimBottom: 10, trimLeft: 10, trimRight: 10, isOffcut: false, label: null }
const part: PartRef = { source_table: 'case_parts', cabinet_instance_id: 'c1', source_part_key: 'case_shelf', w: 400, h: 700 }
const partByUid = new Map([['s1', part]])
// A blind 5mm hole near the part's bottom-left corner (as laid out, on the up face).
const hole: DrillOpRaw = { source_table: 'case_parts', source_cabinet_id: 'c1', source_part_key: 'case_shelf', output_face: 'back', pos_x: 37, pos_y: 50, diameter: 5, depth: 12, repeat_count: 1, repeat_spacing: null, repeat_axis: null }
const through: DrillOpRaw = { ...hole, pos_x: 100, pos_y: 300, diameter: 8, depth: 18 }
const ops = { opsByKey: groupDrillOps([hole]), routesByKey: groupRouteOps([]), partByUid, warnings: [] }
const pl = (o: Partial<Placement> = {}): Placement => ({ uid: 's1', baseUid: 's1', label: 'Shelf', x: 10, y: 10, w: 400, h: 700, rotated: false, ...o })
const sheetOf = (p: Placement): NestedSheet => ({ index: 0, materialId: 'm1', thickness: 18, efficiency: 0, stock, placements: [p] })

describe('turning a part in its footprint', () => {
  it('Rotate 180° moves a hole to the opposite corner, still on top', () => {
    const [d] = buildSheetDrills(sheetOf(pl({ turned: true })), partByUid, ops.opsByKey, 18)
    expect(d).toMatchObject({ x: 10 + 400 - 37, y: 10 + 700 - 50 })
    expect(isTwoSidedSheet(sheetOf(pl({ turned: true })), ops)).toBe(false)
  })

  it('Mirror reflects it left ↔ right and puts the blind hole underneath (program Z)', () => {
    const s = sheetOf(pl({ mirrored: true }))
    expect(isTwoSidedSheet(s, ops)).toBe(true)
    const [d] = projectSheetDrills([s], ops).get(0)!
    expect(d).toMatchObject({ x: 10 + 400 - 37, y: 60, program: 'Z' })
  })

  it('Flip reflects it top ↔ bottom (mirror + half turn), also underneath', () => {
    const [d] = projectSheetDrills([sheetOf(pl({ mirrored: true, turned: true }))], ops).get(0)!
    expect(d).toMatchObject({ x: 10 + 37, y: 10 + 700 - 50, program: 'Z' })
  })

  it('a through hole stays in A when turned over; only-through parts stay one program', () => {
    const o = { ...ops, opsByKey: groupDrillOps([through]) }
    const s = sheetOf(pl({ mirrored: true }))
    expect(isTwoSidedSheet(s, o)).toBe(false)
    const [d] = buildSheetDrills(s, partByUid, o.opsByKey, 18, false, true)
    expect(d.program).toBe('A')
  })

  it('a 90° part turned over reflects across its own length, holes and outline together', () => {
    const p = pl({ rotated: true, w: 700, h: 400, mirrored: true })
    const at = toSheet(37, 50, p)
    // Mirror first in the blank (x → 400 − 37), then the quarter turn.
    expect(at).toEqual({ x: 10 + 700 - 50, y: 10 + 400 - 37 })
    // An L-shaped outline: its corner point goes the same way as a hole there.
    const blank = { w: 400, h: 700, thickness: 18, eb_w1: 0, eb_w2: 0, eb_h1: 0, eb_h2: 0,
      shape: { op_polygon: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 37, y: 300 }, { x: 37, y: 700 }, { x: 0, y: 700 }] } }
    const outline = placedOutline(blank as never, p, false)!
    const q = toSheet(37, 300, p)
    expect(outline.some(v => Math.abs(v.x + p.x - q.x) < 1e-6 && Math.abs(v.y + p.y - q.y) < 1e-6)).toBe(true)
  })
})

describe('store turnPart', () => {
  const def: NestPartInput = { uid: 's1', baseUid: 's1', label: 'Shelf', w: 400, h: 700, thickness: 18, materialId: 'm1', grainLock: true, priority: 0 }
  beforeEach(() => useOptiStore.setState({
    nestResult: { sheets: [sheetOf(pl())], unplaced: [] }, partIndex: { s1: def }, editPast: [], editFuture: [], editError: null,
  }))
  const placed = () => useOptiStore.getState().nestResult!.sheets[0].placements[0]

  it('keeps the footprint and toggles the turn flags (grained parts too)', () => {
    const { turnPart } = useOptiStore.getState()
    turnPart('s1', 'rotate180'); expect(placed()).toMatchObject({ x: 10, y: 10, w: 400, h: 700, turned: true }); expect(placed().mirrored).toBeUndefined()
    turnPart('s1', 'mirror'); expect(placed()).toMatchObject({ turned: true, mirrored: true })
    turnPart('s1', 'flip'); expect(placed().turned).toBeUndefined(); expect(placed().mirrored).toBeUndefined()
    expect(useOptiStore.getState().editPast).toHaveLength(3)
    useOptiStore.getState().undo(); expect(placed()).toMatchObject({ turned: true, mirrored: true })
  })
})
