// Hinge pockets and part perimeters on the same router bit run as one section:
// no G28/M95 close, second tool call or spindle restart between them.
import { describe, it, expect } from 'vitest'
import { generateSheetGcode, DEFAULT_POST } from '../gcode'
import type { NestedSheet } from '../nest'

const sheet: NestedSheet = {
  index: 0, materialId: 'm', thickness: 18,
  stock: { w: 2415, h: 1211, trimTop: 10, trimBottom: 10, trimLeft: 10, trimRight: 10, isOffcut: false, label: null },
  placements: [{ uid: 'd#0', baseUid: 'd', label: 'Door', x: 20, y: 20, w: 2300, h: 472.5, rotated: true }],
  efficiency: 0.4,
}
const cup = { x: 124, y: 42, diameter: 35, depth: 13.5, passes: 1 }
const gen = (perimTool: number) => generateSheetGcode({
  sheet, thickness: 18, profile: DEFAULT_POST, toolNumber: perimTool, toolDiameter: 10, maxDepthPerPass: 20,
  drills: [{ ...cup, pocket: { toolNumber: 102, toolDiameter: 10 } }],
}).split(/\r?\n/)
const count = (ls: string[], re: RegExp) => ls.filter(l => re.test(l)).length

describe('same-tool routing sections', () => {
  it('pockets then perimeters on T102: one tool call, no stop between', () => {
    const ls = gen(102)
    expect(count(ls, /^T102\b/)).toBe(1)
    expect(count(ls, /M95/)).toBe(0)
    const pocket = ls.findIndex(l => l.includes('Pocket-route'))
    const part = ls.findIndex(l => l.includes('Part Door'))
    expect(pocket).toBeGreaterThan(-1)
    expect(part).toBeGreaterThan(pocket)
    expect(ls.slice(pocket, part).some(l => l.startsWith(DEFAULT_POST.spindle_off_code))).toBe(false)
  })
  it('a different perimeter bit still gets its own tool change', () => {
    const ls = gen(101)
    expect(count(ls, /^T102\b/)).toBe(1)
    expect(count(ls, /^T101\b/)).toBe(1)
    expect(count(ls, /M95/)).toBe(1)
  })
})
