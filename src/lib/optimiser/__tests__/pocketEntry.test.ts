// ============================================================
// Pocket entry (RHK6542-R4, 2026-11-05 — broke a cutter): the ramp was
// made at the pocket centre and then ONE straight G1 ran at full depth and
// full feed to the raster start corner, a full-width diagonal slot through
// solid board. The entry now happens AT the path start, back and forth
// along the first leg, and ends there at depth, so no move ever cuts
// solid board sideways at depth except the clearing path itself.
// ============================================================

import { describe, it, expect } from 'vitest'
import { generateSheetGcode, DEFAULT_POST, type SheetRoute } from '../gcode'
import type { NestedSheet } from '../nest'

const sheet: NestedSheet = {
  index: 0, materialId: 'm', thickness: 18,
  stock: { w: 2415, h: 1211, trimTop: 0, trimBottom: 0, trimLeft: 0, trimRight: 0, isOffcut: false, label: null },
  placements: [],
  efficiency: 0.4,
}
// The shop profile: ramp entry 27°, 11 long, clearance 10.
const profile = { ...DEFAULT_POST, onion_skin_z: 0, through_cut_z: -0.2, pocket_entry_strategy: 'ramp', ramp_in_angle: 27, ramp_in_distance: 11, clearance_z: 10 }

// A curved face board bend pocket: 130 x 512, 16 deep (2 skin), 10mm bit.
const bend = (over: Partial<Extract<SheetRoute, { kind: 'area' }>> = {}): SheetRoute => ({
  kind: 'area', label: 'Bend', x: 940, y: 0, w: 140, h: 520, depth: 16, clear: true,
  fillStrategy: null, rasterAngleDeg: 0, stepoverPct: 40, toolNumber: 101, toolDiameter: 10, maxDepthPerPass: 20, ...over,
})

type Mv = { g: number; x: number; y: number; z: number }
// Walk the routing section's moves (modal lines carry on the last G / axes).
function moves(routes: SheetRoute[], prof = profile): Mv[] {
  const ls = generateSheetGcode({ sheet, thickness: 18, profile: prof, drills: [], routes, toolNumber: 102, toolDiameter: 10 }).split(/\r?\n/)
  const start = ls.findIndex(l => l.includes('internal features'))
  const end = ls.findIndex((l, i) => i > start && /Roughing|Part |G80/.test(l))
  const out: Mv[] = []
  let g = 0, x = NaN, y = NaN, z = NaN
  for (const l of ls.slice(start + 1, end)) {
    if (!/^(G[0123]\b|X|Y|Z)/.test(l)) continue
    const gm = /^G([0-3])\b/.exec(l); if (gm) g = Number(gm[1])
    const a = (k: string) => { const m = new RegExp(`${k}(-?[\\d.]+)`).exec(l); return m ? parseFloat(m[1]) : null }
    x = a('X') ?? x; y = a('Y') ?? y; z = a('Z') ?? z
    out.push({ g, x, y, z })
  }
  return out
}

describe('pocket entry at the clearing path start', () => {
  const mv = moves([bend()])
  const cuts = mv.filter(m => m.g === 1)
  const floor = Math.min(...cuts.map(m => m.z))

  it('no feed move goes diagonally across the board (raster + ramp are all square to the pocket)', () => {
    for (let i = 1; i < mv.length; i++) {
      if (mv[i].g !== 1) continue
      const dx = Math.abs(mv[i].x - mv[i - 1].x), dy = Math.abs(mv[i].y - mv[i - 1].y)
      expect(dx < 1e-6 || dy < 1e-6, `diagonal G1 at move ${i}: ${JSON.stringify(mv[i - 1])} -> ${JSON.stringify(mv[i])}`).toBe(true)
    }
  })

  it('ramps back and forth on one line within the ramp distance, ending where it started at depth', () => {
    const first = cuts.findIndex(m => m.z <= floor + 1e-6)
    const ramp = cuts.slice(0, first + 1)
    expect(ramp.length).toBeGreaterThanOrEqual(2)
    expect(ramp.length % 2).toBe(0)
    const xs = new Set(ramp.map(m => m.x)); expect(xs.size).toBe(1)          // along the first (Y) leg
    const ys = ramp.map(m => m.y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(11 + 1e-6)
    // out, back, out, back … — the last pass lands back on the start point
    expect(ramp[ramp.length - 1].y).toBeCloseTo(ramp[1].y, 6)
    expect(Math.abs(ramp[0].y - ramp[1].y)).toBeGreaterThan(1)
    // Z only goes down through the ramp
    for (let i = 1; i < ramp.length; i++) expect(ramp[i].z).toBeLessThan(ramp[i - 1].z)
  })

  it('the first move at depth after the ramp runs along the first raster leg', () => {
    const first = cuts.findIndex(m => m.z <= floor + 1e-6)
    const next = cuts[first + 1]
    expect(next.x).toBeCloseTo(cuts[first].x, 6)                              // same line, no jump
    expect(Math.abs(next.y - cuts[first].y)).toBeGreaterThan(400)
  })

  it('helical with no room at a raster corner falls back to the ramp (still no diagonal)', () => {
    const h = moves([bend()], { ...profile, pocket_entry_strategy: 'helical' })
    expect(h.some(m => m.g === 2 || m.g === 3)).toBe(false)
    for (let i = 1; i < h.length; i++) {
      if (h[i].g !== 1) continue
      expect(Math.abs(h[i].x - h[i - 1].x) < 1e-6 || Math.abs(h[i].y - h[i - 1].y) < 1e-6).toBe(true)
    }
  })

  it('a second depth pass feeds down through the cleared first pass, then ramps from its floor', () => {
    const two = moves([bend({ maxDepthPerPass: 8 })])
    const g1 = two.filter(m => m.g === 1)
    const zs = [...new Set(g1.map(m => m.z))]
    expect(zs.some(z => Math.abs(z - (zs.includes(-8) ? -8 : zs[0])) < 1e-6)).toBe(true)
    for (let i = 1; i < two.length; i++) {
      if (two[i].g !== 1) continue
      expect(Math.abs(two[i].x - two[i - 1].x) < 1e-6 || Math.abs(two[i].y - two[i - 1].y) < 1e-6).toBe(true)
    }
  })
})
