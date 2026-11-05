// Part cut order (Mark 2026-11-06): smallest part first, biggest last, in BOTH
// onion-skin loops — every part is roughed (held by the skin), then the
// separation loop starts again from the smallest.

import { describe, it, expect } from 'vitest'
import { generateSheetGcode, DEFAULT_POST, type PostProfile } from '../gcode'
import type { NestedSheet } from '../nest'

const sheet: NestedSheet = {
  index: 0, materialId: 'mat-1', thickness: 16.5,
  stock: { w: 2415, h: 1211, trimTop: 5, trimBottom: 5, trimLeft: 5, trimRight: 5, isOffcut: false, label: null },
  placements: [
    { uid: 'big', baseUid: 'big', label: 'Big', x: 5, y: 5, w: 2000, h: 600, rotated: false },
    { uid: 'small', baseUid: 'small', label: 'Small', x: 2030, y: 5, w: 100, h: 80, rotated: false },
    { uid: 'mid', baseUid: 'mid', label: 'Mid', x: 5, y: 630, w: 700, h: 500, rotated: false },
    { uid: 'tiny', baseUid: 'tiny', label: 'Tiny', x: 2030, y: 120, w: 60, h: 60, rotated: false },
  ],
  efficiency: 0.5,
}
const gen = (p: Partial<PostProfile>) => generateSheetGcode({
  sheet, thickness: 16.5, profile: { ...DEFAULT_POST, sheet_load_pause: false, ...p }, drills: [], toolNumber: 101, toolDiameter: 10,
})
const partOrder = (g: string) => g.split('\r\n').map(l => /^\(Part (\w+)\)$/.exec(l)?.[1]).filter(Boolean)

describe('part cut order', () => {
  it('onion skin: rough smallest → biggest, then separate smallest → biggest', () => {
    const g = gen({ onion_skin_z: 1.3 })
    expect(partOrder(g)).toEqual(['Tiny', 'Small', 'Mid', 'Big', 'Tiny', 'Small', 'Mid', 'Big'])
    const rough = g.indexOf('(Roughing pass'), sep = g.indexOf('(Separation pass')
    expect(rough).toBeGreaterThan(0)
    expect(sep).toBeGreaterThan(rough)
  })
  it('no onion skin: one loop, smallest → biggest', () => {
    expect(partOrder(gen({ onion_skin_z: 0 }))).toEqual(['Tiny', 'Small', 'Mid', 'Big'])
  })
})
