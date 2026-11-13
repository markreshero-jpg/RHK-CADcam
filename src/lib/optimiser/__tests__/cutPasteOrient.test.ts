// Stage 5 cut → paste keeps the way round the part sat (Mark, 2026-11-14,
// RHK6581): a long part nested rotated came back unrotated on paste and
// "didn't fit" on a sheet it fitted fine the original way.
import { describe, it, expect, beforeEach } from 'vitest'
import { useOptiStore } from '../store'
import type { NestPartInput, NestResult, SheetStock } from '../nest'

const stock = (w: number, h: number): SheetStock => ({ w, h, trimTop: 10, trimBottom: 10, trimLeft: 10, trimRight: 10, isOffcut: false, label: null })
// Cut size 600 wide × 2200 long — on a 2400 × 1200 sheet it only goes in rotated.
const long: NestPartInput = { uid: 'L', baseUid: 'L', label: 'L', w: 600, h: 2200, thickness: 16, materialId: 'm1', grainLock: false, priority: 0 }

function seed() {
  const nest: NestResult = {
    sheets: [
      { index: 0, materialId: 'm1', thickness: 16, stock: stock(2400, 1200), efficiency: 0,
        placements: [{ uid: 'L', baseUid: 'L', label: 'L', x: 10, y: 10, w: 2200, h: 600, rotated: true }] },
      { index: 1, materialId: 'm1', thickness: 16, stock: stock(2400, 1200), efficiency: 0, placements: [] },
    ],
    unplaced: [],
  }
  useOptiStore.setState({ nestResult: nest, partIndex: { L: long }, clipboard: [], clipboardMode: 'copy', editPast: [], editFuture: [], editError: null })
}

describe('Stage 5 cut/paste orientation', () => {
  beforeEach(seed)

  it('pastes a cut part the same way round it was cut', () => {
    useOptiStore.getState().cutToClipboard('L')
    useOptiStore.getState().pasteClipboard(1)
    const st = useOptiStore.getState()
    expect(st.editError).toBeNull()
    const p = st.nestResult!.sheets[1].placements.find(q => q.uid === 'L')!
    expect([p.w, p.h, p.rotated]).toEqual([2200, 600, true])
  })

  it('clicking the cut part in the pool places it rotated too', () => {
    useOptiStore.getState().cutToClipboard('L')
    const pooled = useOptiStore.getState().nestResult!.unplaced.find(u => u.uid === 'L')!
    expect(pooled.pooledAs?.rotated).toBe(true)
    useOptiStore.getState().placeFromUnplaced('L', 1, 10, 10)
    const p = useOptiStore.getState().nestResult!.sheets[1].placements.find(q => q.uid === 'L')!
    expect(p.rotated).toBe(true)
  })

  it('a never-rotated part still turns if that is the only way it fits', () => {
    useOptiStore.getState().removeToUnplaced('L')
    const st0 = useOptiStore.getState()
    // Forget how it sat: fall back to cut size, which won't fit → tries rotated.
    st0.nestResult!.unplaced[0].pooledAs = undefined
    useOptiStore.setState({ clipboard: [st0.nestResult!.unplaced[0]], clipboardMode: 'cut' })
    useOptiStore.getState().pasteClipboard(1)
    const p = useOptiStore.getState().nestResult!.sheets[1].placements.find(q => q.uid === 'L')!
    expect(p.rotated).toBe(true)
  })

  it('a copy keeps the orientation too', () => {
    useOptiStore.getState().copyToClipboard('L')
    useOptiStore.getState().pasteClipboard(1)
    const p = useOptiStore.getState().nestResult!.sheets[1].placements[0]
    expect(p.rotated).toBe(true)
  })
})
