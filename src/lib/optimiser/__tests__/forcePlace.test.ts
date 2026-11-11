// Stage 5 drag-from-pool + force place (Mark, 2026-11-11): a part dragged off
// the pool strip lands exactly at the drop spot the canvas hands the store —
// the store never re-snaps, so a forced spot (over another part / in the gap)
// sticks.
import { describe, it, expect, beforeEach } from 'vitest'
import { useOptiStore } from '../store'
import type { NestPartInput, NestResult, SheetStock } from '../nest'

const stock: SheetStock = { w: 2400, h: 1200, trimTop: 10, trimBottom: 10, trimLeft: 10, trimRight: 10, isOffcut: false, label: null }
const part = (uid: string, w = 500, h = 300): NestPartInput =>
  ({ uid, baseUid: uid, label: uid, w, h, thickness: 16, materialId: 'm1', grainLock: false, priority: 0 })

function seed(unplaced: NestPartInput[]) {
  const a = part('A')
  const nest: NestResult = {
    sheets: [{ index: 0, materialId: 'm1', thickness: 16, stock, efficiency: 0,
      placements: [{ uid: 'A', baseUid: 'A', label: 'A', x: 10, y: 10, w: 500, h: 300, rotated: false }] }],
    unplaced,
  }
  const idx: Record<string, NestPartInput> = { A: a }
  for (const u of unplaced) idx[u.uid] = u
  useOptiStore.setState({ nestResult: nest, partIndex: idx, clipboard: [], clipboardMode: 'copy', editPast: [], editFuture: [], editError: null })
}

describe('Stage 5 force place', () => {
  beforeEach(() => seed([part('B')]))

  it('places an unplaced part exactly at the drop spot, even over another part', () => {
    useOptiStore.getState().placeFromUnplaced('B', 0, 100, 50)   // overlaps A
    const st = useOptiStore.getState()
    const b = st.nestResult!.sheets[0].placements.find(p => p.uid === 'B')!
    expect([b.x, b.y]).toEqual([100, 50])
    expect(st.nestResult!.unplaced).toHaveLength(0)
  })

  it('pastes a copy at the drop spot', () => {
    useOptiStore.getState().copyToClipboard('A')
    useOptiStore.getState().pasteClipboard(0, { x: 1200, y: 600 })
    const pl = useOptiStore.getState().nestResult!.sheets[0].placements
    expect(pl).toHaveLength(2)
    const copy = pl.find(p => p.uid !== 'A')!
    expect([copy.x, copy.y]).toEqual([1200, 600])
  })

  it('pastes a cut part at the drop spot and consumes the clipboard', () => {
    useOptiStore.getState().cutToClipboard('A')
    useOptiStore.getState().pasteClipboard(0, { x: 5, y: 5 })      // inside the trim — forced
    const st = useOptiStore.getState()
    const a = st.nestResult!.sheets[0].placements.find(p => p.uid === 'A')!
    expect([a.x, a.y]).toEqual([5, 5])
    expect(st.clipboard).toHaveLength(0)
    expect(st.nestResult!.unplaced.some(u => u.uid === 'A')).toBe(false)
  })

  it('refuses a drop on a sheet of another material', () => {
    seed([{ ...part('C'), materialId: 'm2' }])
    useOptiStore.getState().copyToClipboard('C')
    useOptiStore.getState().pasteClipboard(0, { x: 1200, y: 600 })
    expect(useOptiStore.getState().editError).toMatch(/material/)
    expect(useOptiStore.getState().nestResult!.sheets[0].placements).toHaveLength(1)
  })
})
