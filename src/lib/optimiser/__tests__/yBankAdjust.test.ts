// ============================================================
// Y bank adjustment — the head offsets are measured on the X bank (M88); Y-bank
// (M89) firings add the Y bank's own extra. On the EVO49 the shelf-hole rows
// (Y bank) landed 192mm low while X-bank holes were right (test gables,
// 2026-10-30); -192 made it worse, so the Y bank carries +192 (net 0).
// ============================================================

import { describe, it, expect } from 'vitest'
import { generateSheetGcode, DEFAULT_POST, type PostProfile, type SheetDrill } from '../gcode'
import type { NestedSheet } from '../nest'
import type { DrillBlockConfig } from '../gangDrill'

const sheet: NestedSheet = {
  index: 0, materialId: 'mat-1', thickness: 16.5,
  stock: { w: 2415, h: 1211, trimTop: 0, trimBottom: 0, trimLeft: 0, trimRight: 0, isOffcut: false, label: null },
  placements: [{ uid: 'p1', baseUid: 'parts:p1', label: 'Left Gable', x: 0, y: 0, w: 484, h: 508, rotated: false }],
  efficiency: 0.1,
}
const block: DrillBlockConfig = {
  bankXCount: 12, bankYCount: 7, spacingMm: 32,
  xBankMcode: 'M88', yBankMcode: 'M89', sharedCorner: true,
  headOffsetXMm: 0, headOffsetYMm: -192, workOffsetCode: 'G54',
  xDiameters: [10, 3, 8, 35, 5, 5, 5, 5, 5, 5, null, null], yDiameters: [10, 8, 5, 5, 5, 5, 5],
}
const profile: PostProfile = { ...DEFAULT_POST, material_surface_z: 'spoilboard', keep_decimal_point: true, sheet_load_pause: false, dust_extraction_enabled: false }

// A shelf-hole row up the gable (steps in Y → Y bank) and a runner pair along it (steps in X → X bank).
const drills: SheetDrill[] = [
  ...[318, 350, 382, 414, 446].map(y => ({ x: 64, y, diameter: 5, depth: 12 })),
  { x: 231, y: 193.5, diameter: 5, depth: 12 }, { x: 263, y: 193.5, diameter: 5, depth: 12 },
]
const masterAfter = (g: string, mcode: string) => {
  const lines = g.split('\r\n')
  const i = lines.findIndex(l => l.startsWith(`${mcode} B`) && !l.endsWith(' B0'))
  return lines.slice(i).find(l => l.includes('G54'))!
}
const gen = (b: DrillBlockConfig) => generateSheetGcode({ sheet, thickness: 16.5, profile, drills, toolNumber: 101, toolDiameter: 10, drillBlock: b })

describe('Y bank adjustment', () => {
  it('is added to Y-bank firings only', () => {
    const base = gen(block)
    const adj = gen({ ...block, yBankAdjustYMm: -192, yBankAdjustXMm: 5 })
    const y = (l: string) => Number(/Y(-?[\d.]+)/.exec(l)![1])
    const x = (l: string) => Number(/X(-?[\d.]+)/.exec(l)![1])
    expect(y(masterAfter(adj, 'M89'))).toBeCloseTo(y(masterAfter(base, 'M89')) - 192, 3)
    expect(x(masterAfter(adj, 'M89'))).toBeCloseTo(x(masterAfter(base, 'M89')) + 5, 3)
    expect(masterAfter(adj, 'M88')).toBe(masterAfter(base, 'M88'))
  })
  it('defaults to nothing extra', () => {
    expect(gen({ ...block, yBankAdjustXMm: 0, yBankAdjustYMm: 0 })).toBe(gen(block))
  })
})
