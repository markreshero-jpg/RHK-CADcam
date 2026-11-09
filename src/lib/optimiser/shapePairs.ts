// ============================================================
// Shaped part pairs (Stage 3 "Pair shaped parts", off by default).
// Two shaped parts of similar size, one usually turned 180°, share one
// rectangle head to tail: two corner triangles nearly make one square.
// The nester packs each pair as a pseudo-part; expandShapePairs puts the two
// real parts back. In Stage 5 a pair behaves like a grain match block (it moves
// together), because the two parts' rectangles overlap on purpose.
// The clearance between the two real outlines is the material's normal nest
// gap, measured on the cut blanks. Pure & framework-free.
// ============================================================

import { grainOrient, type GroupStock, type NestPartInput, type NestResult, type NestedSheet, type Placement, type SheetStock } from './nest'
import type { GrainBlockInfo } from './grainBlocks'
import { materialGroupKey, type OptiPart } from './types'
import { loopArea, placedOutline } from './shapes'
import { sheetEfficiency } from './edit'

type P = { x: number; y: number }

export interface PairMember {
  uid: string
  bx: number; by: number   // pair-local corner of this part's rectangle, y up
  w: number; h: number     // cut size, unturned
  turned: boolean          // half turn inside the pair
  area: number             // the real outline's area
}

export interface ShapePair {
  uid: string              // the pseudo-part uid (pair:…)
  name: string             // P1
  W: number; H: number
  members: [PairMember, PairMember]
}

// A part only pairs when at least this much of its rectangle is empty, the two
// are within this size of each other, and sharing saves at least this much.
const MIN_WASTE = 0.1
const MAX_SIZE_DIFF = 60
const MIN_SAVING = 0.05
const COARSE_STEP = 5
const FINE_STEP = 0.5

function segDist(p: P, a: P, b: P): number {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy
  const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}

function inside(p: P, poly: P[]): boolean {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

function crosses(a: P, b: P, c: P, d: P): boolean {
  const o = (p: P, q: P, r: P) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
}

/** Are two outlines separate and at least `gap` apart everywhere? */
export function outlinesClear(A: P[], B: P[], gap: number): boolean {
  if (A.some(p => inside(p, B)) || B.some(p => inside(p, A))) return false
  for (let i = 0; i < A.length; i++) {
    const a = A[i], a2 = A[(i + 1) % A.length]
    for (let j = 0; j < B.length; j++) {
      const b = B[j], b2 = B[(j + 1) % B.length]
      if (crosses(a, a2, b, b2) || segDist(a, b, b2) < gap || segDist(b, a, a2) < gap) return false
    }
  }
  return true
}

export interface PairFit { W: number; H: number; ax: number; ay: number; bx: number; by: number; turned: boolean }

/** Tightest rectangle holding outline A and outline B (as it is, or turned 180°)
 *  with `gap` between them. Null when sharing doesn't save MIN_SAVING. */
export function bestPairFit(A: P[], aw: number, ah: number, B: P[], bw: number, bh: number, gap: number): PairFit | null {
  const size = (dx: number, dy: number) => ({
    W: Math.max(aw, dx + bw) - Math.min(0, dx),
    H: Math.max(ah, dy + bh) - Math.min(0, dy),
  })
  const area = (s: { W: number; H: number }) => (s.W + gap) * (s.H + gap)
  let bestArea = ((aw + gap) * (ah + gap) + (bw + gap) * (bh + gap)) * (1 - MIN_SAVING)
  let best: { dx: number; dy: number; turned: boolean } | null = null
  const consider = (Q: P[], turned: boolean, dx: number, dy: number) => {
    const a = area(size(dx, dy))
    if (a >= bestArea) return
    if (!outlinesClear(A, Q.map(p => ({ x: p.x + dx, y: p.y + dy })), gap)) return
    bestArea = a; best = { dx, dy, turned }
  }
  const shapes: [P[], boolean][] = [[B.map(p => ({ x: bw - p.x, y: bh - p.y })), true], [B, false]]
  for (const [Q, turned] of shapes) {
    for (let dx = -(bw + gap); dx <= aw + gap; dx += COARSE_STEP) {
      for (let dy = -(bh + gap); dy <= ah + gap; dy += COARSE_STEP) consider(Q, turned, dx, dy)
    }
  }
  if (!best) return null
  const coarse: { dx: number; dy: number; turned: boolean } = best
  const Q = coarse.turned ? shapes[0][0] : shapes[1][0]
  for (let dx = coarse.dx - COARSE_STEP; dx <= coarse.dx + COARSE_STEP; dx += FINE_STEP) {
    for (let dy = coarse.dy - COARSE_STEP; dy <= coarse.dy + COARSE_STEP; dy += FINE_STEP) consider(Q, coarse.turned, dx, dy)
  }
  const { dx, dy, turned } = best as { dx: number; dy: number; turned: boolean }
  const s = size(dx, dy)
  return { ...s, ax: Math.max(0, -dx), ay: Math.max(0, -dy), bx: Math.max(0, dx), by: Math.max(0, dy), turned }
}

function fitsAnyStock(part: Pick<NestPartInput, 'w' | 'h' | 'grainLock' | 'grainAcross'>, stock: GroupStock | undefined, allowRot: boolean): boolean {
  if (!stock) return true
  const fits = (s: SheetStock) => {
    const uW = s.w - s.trimLeft - s.trimRight, uH = s.h - s.trimTop - s.trimBottom
    const ok = (w: number, h: number) => w <= uW + 1e-6 && h <= uH + 1e-6
    const g = grainOrient(part, s)
    return g ? ok(g.w, g.h) : ok(part.w, part.h) || (allowRot && ok(part.h, part.w))
  }
  return [...(stock.standard.qty === 0 ? [] : [stock.standard]), ...stock.offcuts].some(fits)
}

export interface BuildPairsInput {
  parts: NestPartInput[]
  partByUid: Map<string, OptiPart>
  deductEb: boolean
  gapFor: (materialId: string | null) => number
  stockFor: (materialId: string | null, thickness: number) => GroupStock | undefined
  allowRotation: boolean
}

export function buildShapePairs(inp: BuildPairsInput): { parts: NestPartInput[]; pairs: ShapePair[] } {
  type Cand = { inst: NestPartInput; poly: P[]; area: number }
  const groups = new Map<string, Cand[]>()
  for (const inst of inp.parts) {
    const part = inp.partByUid.get(inst.baseUid)
    const poly = part ? placedOutline(part, { w: inst.w, h: inst.h, rotated: false }, inp.deductEb) : null
    if (!poly) continue
    const area = Math.abs(loopArea(poly))
    if (1 - area / (inst.w * inst.h) < MIN_WASTE) continue
    const k = materialGroupKey(inst.materialId, inst.thickness)
    groups.set(k, [...(groups.get(k) ?? []), { inst, poly, area }])
  }

  const pairs: ShapePair[] = []
  const pseudo: NestPartInput[] = []
  const paired = new Set<string>()
  for (const cands of groups.values()) {
    const gap = inp.gapFor(cands[0].inst.materialId)
    const options: { i: number; j: number; fit: PairFit; save: number }[] = []
    for (let i = 0; i < cands.length; i++) {
      for (let j = i + 1; j < cands.length; j++) {
        const a = cands[i], b = cands[j]
        if (Math.abs(a.inst.w - b.inst.w) > MAX_SIZE_DIFF || Math.abs(a.inst.h - b.inst.h) > MAX_SIZE_DIFF) continue
        if (a.inst.grainLock !== b.inst.grainLock || !!a.inst.grainAcross !== !!b.inst.grainAcross) continue
        const fit = bestPairFit(a.poly, a.inst.w, a.inst.h, b.poly, b.inst.w, b.inst.h, gap)
        if (!fit || !fitsAnyStock({ ...a.inst, w: fit.W, h: fit.H }, inp.stockFor(a.inst.materialId, a.inst.thickness), inp.allowRotation)) continue
        const alone = (x: NestPartInput) => (x.w + gap) * (x.h + gap)
        options.push({ i, j, fit, save: alone(a.inst) + alone(b.inst) - (fit.W + gap) * (fit.H + gap) })
      }
    }
    options.sort((x, y) => y.save - x.save)
    const used = new Set<number>()
    for (const { i, j, fit } of options) {
      if (used.has(i) || used.has(j)) continue
      used.add(i); used.add(j)
      const a = cands[i], b = cands[j]
      const uid = `pair:${a.inst.uid}:${b.inst.uid}`
      pairs.push({
        uid, name: `P${pairs.length + 1}`, W: fit.W, H: fit.H,
        members: [
          { uid: a.inst.uid, bx: fit.ax, by: fit.ay, w: a.inst.w, h: a.inst.h, turned: false, area: a.area },
          { uid: b.inst.uid, bx: fit.bx, by: fit.by, w: b.inst.w, h: b.inst.h, turned: fit.turned, area: b.area },
        ],
      })
      pseudo.push({ ...a.inst, uid, baseUid: uid, label: `${a.inst.label} + ${b.inst.label}`, w: fit.W, h: fit.H, priority: Math.max(a.inst.priority, b.inst.priority) })
      paired.add(a.inst.uid); paired.add(b.inst.uid)
    }
  }
  return { parts: [...inp.parts.filter(p => !paired.has(p.uid)), ...pseudo], pairs }
}

/** A pair member's placement, from where its pair landed (a quarter-turned pair
 *  turns both parts with it, like memberPlacement for a grain match block). */
export function pairMemberPlacement(bp: Pick<Placement, 'x' | 'y' | 'rotated'>, pair: Pick<ShapePair, 'H'>, m: PairMember, def: Pick<NestPartInput, 'baseUid' | 'label'>): Placement {
  const base = { uid: m.uid, baseUid: def.baseUid, label: def.label, trueArea: m.area, ...(m.turned ? { turned: true } : {}) }
  return bp.rotated
    ? { ...base, x: bp.x + pair.H - m.by - m.h, y: bp.y + m.bx, w: m.h, h: m.w, rotated: true }
    : { ...base, x: bp.x + m.bx, y: bp.y + m.by, w: m.w, h: m.h, rotated: false }
}

/** Replace each placed pair with its two parts; an unplaced pair's parts go to unplaced. */
export function expandShapePairs(res: NestResult, pairs: ShapePair[], index: Record<string, NestPartInput>): NestResult {
  const byUid = new Map(pairs.map(p => [p.uid, p]))
  const info: GrainBlockInfo[] = []
  const sheets: NestedSheet[] = res.sheets.map(s => {
    const placements: Placement[] = []
    for (const pl of s.placements) {
      const pair = byUid.get(pl.uid)
      if (!pair) { placements.push(pl); continue }
      for (const m of pair.members) placements.push(pairMemberPlacement(pl, pair, m, index[m.uid]))
      info.push({ uid: pair.uid, groupId: pair.uid, name: pair.name, direction: 'vertical', piece: 1, pieces: 1, memberUids: pair.members.map(m => m.uid), W: pair.W, H: pair.H, pair: true })
    }
    const next = { ...s, placements }
    return { ...next, efficiency: sheetEfficiency(next) }
  })
  const unplaced = res.unplaced.flatMap(u => byUid.get(u.uid)?.members.map(m => index[m.uid]) ?? [u])
  return { ...res, sheets, unplaced, blocks: [...(res.blocks ?? []), ...info] }
}

const emptiest = (r: NestResult) => Math.min(...r.sheets.map(s => s.efficiency), 1)

/** Does the paired layout beat the plain one? Fewer unplaced, then fewer sheets,
 *  then a clearly emptier last sheet. Otherwise there's no reason to turn parts. */
export function pairsWin(paired: NestResult, plain: NestResult): boolean {
  if (paired.unplaced.length !== plain.unplaced.length) return paired.unplaced.length < plain.unplaced.length
  if (paired.sheets.length !== plain.sheets.length) return paired.sheets.length < plain.sheets.length
  return emptiest(paired) < emptiest(plain) - 0.01
}

export interface NestWithPairsInput extends BuildPairsInput {
  index: Record<string, NestPartInput>
  /** Nest these parts and expand any grain match blocks. */
  run: (parts: NestPartInput[]) => NestResult
}

/** Nest plain and paired, keep the better, and say what happened. */
export function nestWithPairs(inp: NestWithPairsInput): NestResult {
  const plain = inp.run(inp.parts)
  const { parts, pairs } = buildShapePairs(inp)
  const note = (r: NestResult, m: string): NestResult => ({ ...r, warnings: [...(r.warnings ?? []), m] })
  if (!pairs.length) return note(plain, 'Pair shaped parts: no two parts here share a rectangle well enough to pair.')
  const paired = expandShapePairs(inp.run(parts), pairs, inp.index)
  if (!pairsWin(paired, plain)) return note(plain, `Pair shaped parts: ${pairs.length} pair(s) tried but they saved nothing, so this is the normal nest.`)
  const placed = paired.blocks?.filter(b => b.pair).length ?? 0
  const saved = plain.sheets.length - paired.sheets.length
  return note(paired, `Pair shaped parts: ${placed} pair(s) nested head to tail${saved > 0 ? `, ${saved} sheet(s) fewer` : ', same sheets but a bigger offcut'}. Grain stays in line on a turned part but runs the opposite way.`)
}
