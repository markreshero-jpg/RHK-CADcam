// Hinge cups (Ø35, no drill on the head) are pocket-routed. Every circle must
// be two half arcs with an end point: a 360° arc ends where it starts, the modal
// compressor strips its X/Y, and many controls skip an arc with no axis words.
import { describe, it, expect } from 'vitest'
import { generateSheetGcode, DEFAULT_POST } from '../gcode'
import type { NestedSheet } from '../nest'

const sheet: NestedSheet = {
  index: 0, materialId: 'm', thickness: 18,
  stock: { w: 2415, h: 1211, trimTop: 10, trimBottom: 10, trimLeft: 10, trimRight: 10, isOffcut: false, label: null },
  placements: [{ uid: 'd#0', baseUid: 'd', label: 'Door', x: 20, y: 20, w: 2300, h: 472.5, rotated: true }],
  efficiency: 0.4,
}
const g = generateSheetGcode({
  sheet, thickness: 18, profile: DEFAULT_POST, toolNumber: 101, toolDiameter: 10, maxDepthPerPass: 20,
  drills: [{ x: 124, y: 42, diameter: 35, depth: 13.5, passes: 1, pocket: { toolNumber: 102, toolDiameter: 10 } }],
})
const ls = g.split(/\r?\n/)
const a = ls.findIndex(l => l.includes('Pocket-route'))
const b = ls.findIndex((l, i) => i > a && /^G0 Z/.test(l))
const pocket = ls.slice(a + 1, b)

describe('hole pockets', () => {
  it('every arc block carries an end point', () => {
    // Arc blocks = those with I/J (G3 may be modal on the line).
    const arcs = pocket.filter(l => /\bI-?[\d.]/.test(l))
    expect(arcs.length).toBeGreaterThanOrEqual(6)
    for (const l of arcs) expect(l).toMatch(/\bX-?[\d.]/)
  })
  it('reaches the hole wall and full depth', () => {
    const xs = pocket.map(l => /\bX(-?[\d.]+)/.exec(l)).filter(Boolean).map(m => Number(m![1]))
    const cx = Math.min(...xs) + (Math.max(...xs) - Math.min(...xs)) / 2
    expect(Math.max(...xs) - cx + 5).toBeCloseTo(17.5, 1)   // bit radius 5 to the Ø35 wall
    expect(pocket.some(l => /Z-?[\d.]+/.test(l) && /\bI/.test(l))).toBe(true)   // helix
  })
})
