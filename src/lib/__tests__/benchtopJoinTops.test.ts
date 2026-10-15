import { describe, it, expect } from 'vitest'
import { segmentsFromLegacy, signedArea, outlinePoints } from '@/src/lib/benchtopGeometry'
import {
  planJoin, choicesFor, defaultChoice, splitAtJoint, jointTops, jointKey, lineRect, offsetFromLine, type JoinPlan,
} from '@/src/lib/benchtopJoinTops'
import { tapeable } from '@/src/lib/benchtopEdgeband'
import { splitIntoPieces } from '@/src/lib/benchtop-resolver/pieces'
import type { BenchtopSegment } from '@/src/lib/types'

type P = { x: number; y: number }
const rect = (x0: number, y0: number, x1: number, y1: number, wallEdge?: number) =>
  segmentsFromLegacy([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], [],
    wallEdge == null ? [] : [{ edge_index: wallEdge, type: 'wall' }])
const plan = (a: BenchtopSegment[], b: BenchtopSegment[]) => {
  const p = planJoin(a, b)
  if ('error' in p) throw new Error(p.error)
  return p as JoinPlan
}
const r0 = (p: P) => `${Math.round(p.x)},${Math.round(p.y)}`
const corners = (segs: BenchtopSegment[]) => segs.map(s => r0(s.p0)).sort()
const line = (l: { p0: P; p1: P }) => [r0(l.p0), r0(l.p1)].sort().join(' ')
const joints = (segs: BenchtopSegment[]) => segs.filter(s => s.edge?.joint).map(s => `${line(s)} ${s.edge!.joint}`).sort()
const area = (segs: BenchtopSegment[]) => Math.round(Math.abs(signedArea(outlinePoints(segs))))

describe('joints between benchtops (Phase 7c) — tops stay separate', () => {
  // Back run 3000 × 600 along the top wall, return 600 × 2000 down the left wall: an L.
  const A = rect(0, 0, 3000, 600, 0)
  const B = rect(0, 0, 600, 2000, 3)

  it('an L overlap: choices + Mitre by default', () => {
    const p = plan(A, B)
    expect(p.kind).toBe('overlap')
    expect(choicesFor(p)).toEqual(['butt_a', 'butt_b', 'mitre'])
    expect(defaultChoice(p)).toBe('mitre')
  })

  it('Butt, A runs through: A keeps its outline, B is cut back to A’s front edge', () => {
    const [a, b] = splitAtJoint(plan(A, B), 'butt_a')!
    // A keeps its shape; its front gains a corner where the joint stops.
    expect(corners(a)).toEqual([...corners(A), '600,600'].sort())
    expect(joints(a)).toEqual(['0,600 600,600 butt'])
    expect(corners(b)).toEqual(['0,2000', '0,600', '600,2000', '600,600'])
    expect(joints(b)).toEqual(['0,600 600,600 butt'])
    // B's wall edge stays a wall edge (now 1400 long).
    expect(b.filter(s => s.edge?.wall).map(line)).toEqual(['0,2000 0,600'])
  })

  it('Butt, B runs through: A is cut back to B’s side', () => {
    const [a, b] = splitAtJoint(plan(A, B), 'butt_b')!
    expect(corners(b)).toEqual([...corners(B), '600,600'].sort())
    expect(corners(a)).toEqual(['3000,0', '3000,600', '600,0', '600,600'])
    expect(joints(a)).toEqual(['600,0 600,600 butt'])
  })

  it('Mitre: both cut corner to corner; areas add up to the L', () => {
    const [a, b] = splitAtJoint(plan(A, B), 'mitre')!
    expect(joints(a)).toEqual(['0,0 600,600 mitre'])
    expect(joints(b)).toEqual(['0,0 600,600 mitre'])
    expect(area(a) + area(b)).toBe(3000 * 600 + 600 * 1400)
    expect(corners(a)).toContain('3000,0')   // a is still the back run
  })

  it('a joint edge takes no tape and is a join edge for the resolver', () => {
    const [a] = splitAtJoint(plan(A, B), 'mitre')!
    const j = a.find(s => s.edge?.joint)!
    expect(tapeable(j, undefined)).toBe(false)
    expect(splitIntoPieces(a, [])[0].segs.find(s => s.edge?.joint)?.join).toBe('mitre')
  })

  it('end to end: both stay whole, the shared edge is the joint (Butt by default)', () => {
    const C = rect(3000, 0, 4500, 600, 0)
    const p = plan(A, C)
    expect(p.kind).toBe('touch')
    expect(defaultChoice(p)).toBe('butt')
    const [a, c] = splitAtJoint(p, 'butt')!
    expect(corners(a)).toEqual(corners(A))
    expect(corners(c)).toEqual(corners(C))
    expect(joints(a)).toEqual(['3000,0 3000,600 butt'])
    expect(joints(c)).toEqual(['3000,0 3000,600 butt'])
  })

  it('a 45° wall: Mitre from the wall corner to where the fronts cross', () => {
    const s = Math.SQRT1_2
    const D = segmentsFromLegacy([
      { x: 3000, y: 0 }, { x: 3000 + 2000 * s, y: 2000 * s }, { x: 3000 + 2000 * s - 600 * s, y: 2000 * s + 600 * s }, { x: 3000 - 600 * s, y: 600 * s },
    ])
    const p = plan(rect(0, 0, 3000, 600), D)
    expect(line(p.mitre!)).toBe('2751,600 3000,0')
    expect(defaultChoice(p)).toBe('mitre')
    const [a, d] = splitAtJoint(p, 'mitre')!
    expect(joints(a)).toEqual(['2751,600 3000,0 mitre'])
    expect(joints(d)).toEqual(['2751,600 3000,0 mitre'])
    // Butt either way works at 45° too (a two-line cut).
    const [, d2] = splitAtJoint(p, 'butt_a')!
    expect(joints(d2)).toHaveLength(2)
  })

  it('apart / curved edges into the other top are refused; T overlap has no mitre', () => {
    expect(planJoin(A, rect(4000, 0, 5000, 600))).toEqual({ error: 'apart' })
    const curved = rect(2500, 0, 3500, 600).map((s, i) => (i === 3 ? { ...s, type: 'curve' as const, cp1: { x: 2000, y: 450 }, cp2: { x: 2000, y: 150 } } : s))
    expect(planJoin(A, curved)).toEqual({ error: 'curve' })
    const t = plan(A, rect(1000, 300, 1600, 2000))
    expect(choicesFor(t)).not.toContain('mitre')
    expect(defaultChoice(t)).toBe('butt_a')
  })

  it('three tops (U): each meeting pair gets a joint; the ends never meet', () => {
    const R = rect(2400, 0, 3000, 2000)
    const r = jointTops([B, A, R], { [jointKey(0, 1)]: 'butt_a' })
    expect(r.ok).toBe(true)
    expect(r.steps.map(s => [s.i, s.j, s.choice])).toEqual([[0, 1, 'butt_a'], [1, 2, 'mitre']])
    expect(r.tops).toHaveLength(3)
    // Pair (B, A) with B running through: A is cut back to x = 600.
    expect(joints(r.tops[1])).toEqual(['2400,600 3000,0 mitre', '600,0 600,600 butt'])
  })

  it('no pair meets → not ok', () => {
    expect(jointTops([A, rect(4000, 0, 5000, 600)], {}).ok).toBe(false)
  })
})

describe('line tool (Phase 7c)', () => {
  it('pulls a rectangle off a 45° back line to the side the mouse is on', () => {
    const p0 = { x: 0, y: 0 }, p1 = { x: 1000, y: 1000 }
    const off = offsetFromLine(p0, p1, { x: 0, y: 848.5 })
    expect(Math.round(Math.abs(off))).toBe(600)
    const r = lineRect(p0, p1, off)
    expect(r[3].x).toBeCloseTo(-424.3, 0)
    expect(r[3].y).toBeCloseTo(424.3, 0)
  })
})
