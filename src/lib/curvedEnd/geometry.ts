// ============================================================
// Curved fixed-panel cabinet (?CRVFIXP) — geometry engine.
//
// A native port of the shop-proven "Vanity Curved End" rules
// (z_curved_end/kit/reference/curved_end_core.mjs, kit SPEC.md §2–§7).
// The geometry rules are NOT to be changed here: the kit fixtures
// (z_curved_end/kit/fixtures) are the test oracle, to 0.01 mm.
// Spec + decisions: z_curved_end/CURVED-END-SPEC.md.
//
// Frames
// - Plan: x across the unit (0 = fixing-panel / neighbour side, or the
//   left outside face on DOUBLE; W = the curved outside face), d = depth
//   from the front (0 = front face, D = wall). Everything is computed RH;
//   LH mirrors the former outlines only (the other parts are fitted the
//   other way round).
// - Loops: closed, [x, d, bulge] — bulge = tan(sweep/4) of the arc to the
//   next vertex, + = anticlockwise with d drawn upward (same convention as
//   OutlinePt.b in shapePath.ts).
// - Part-local (curvedEndParts): min corner at 0,0, x = the part's first
//   size, y = its second (the kit's DXF frame). Formers are a true top view
//   with the front at y 0; the face board is back face up with its front
//   (gable) end at x 0 (DOUBLE: the left wall end).
// Pure — no DB, no React.
// ============================================================

import type { OutlinePt } from '../shapePath'

export type CurvedEndHand = 'RH' | 'LH' | 'DOUBLE'

export interface CurvedEndParams {
  W: number            // overall width (outside of the face board)
  D: number            // overall depth, front face to wall
  H: number            // face board height
  R: number            // outside radius of the curve(s)
  FT: number           // face board thickness
  SK: number           // skin left across the curve (pocket depth = FT − SK)
  T: number            // carcass board thickness
  hand: CurvedEndHand
  OL: number; OR: number   // back overhangs (trimmed after glue-up)
  OG: number               // gable overhang (single ends)
  SBK: number; SBT: number; STP: number   // back / bottom / top scribes
  lighten: boolean     // rib cut-outs
  B: number            // rib cut-out border
  onion: boolean; OS: number   // onion skin on the rib cut-out
  blkS: boolean; blkF: boolean // side / front fixing blocks
}

export const CURVED_END_DEFAULTS: CurvedEndParams = {
  W: 170, D: 500, H: 500, R: 150, FT: 18, SK: 2, T: 16.5, hand: 'RH',
  OL: 0, OR: 0, OG: 0, SBK: 0, SBT: 0, STP: 0,
  lighten: false, B: 60, onion: false, OS: 0.3, blkS: false, blkF: false,
}

export const BLOCK_WIDE = 100, BLOCK_NARROW = 60
export const POCK_EXT = 3      // pocket runs this far past each end of a curve
export const OVER = 8          // kit pocket overrun past the top/bottom edges (CNC overrun: decision 13)
export const HOLE_D = 5, INSET = 50, BACK_INSET = 40, MAX_PITCH = 250
// Skin limits (decision 10): warn outside, don't block.
export const SKIN_MIN = 2, SKIN_MAX = 3

export type Loop = [number, number, number][]
const TB = Math.tan(Math.PI / 8)   // bulge of a 90° arc

export interface CurvedEndBlock {
  name: 'Block_Side' | 'Block_SideL' | 'Block_SideR' | 'Block_Front'
  face: 'side' | 'front'
  dir: 1 | -1
  x0: number; x1: number; d0: number; d1: number
  wb: number                      // block width (100 or 60)
}

export interface CurvedEndGeometry {
  p: CurvedEndParams
  double: boolean
  Dc: number; Hc: number; y0: number      // carcass depth / height / lift
  CX: number; CD: number; RI: number      // curve centre, former radius
  maxGap: number; gaps: number; pitch: number; clear: number
  levels: number[]                         // former undersides from the carcass bottom
  holeY: number[]                          // former centrelines
  arc: number
  wrapLen: number
  pockets: [number, number][]             // along the face board (part-local x)
  ovL: number; ovR: number; ovG: number
  fixDepth: number                         // fixing panel length (0 on DOUBLE)
  backX0: number; backW: number
  formerX0: number; formerW: number; formerD: number
  formerLoop: Loop                         // plan frame, anticlockwise
  wrapLoop: Loop                           // face board plan shape (3D)
  pocketLines: [number, number][]
  blocks: CurvedEndBlock[]
  blkSide: boolean; blkFront: boolean
  cut: Loop | null                         // rib cut-out, plan frame, anticlockwise
  cutDepth: number
  warnings: string[]                       // block the CNC
  notes: string[]                          // shown, don't block
}

export const f1 = (n: number) => (Math.round(n * 10) / 10).toString()

/** Holes `inset` in from each end, evenly, at most `maxP` apart; one centred if too short. */
export function spread(len: number, inset: number, maxP: number): number[] {
  const span = len - 2 * inset
  if (span <= 0) return [len / 2]
  const n = Math.max(1, Math.ceil(span / maxP - 1e-9))
  return Array.from({ length: n + 1 }, (_, i) => inset + span * i / n)
}

type CornerArc =
  | { cutFront: true }
  | { cutFront?: false; ts: number; te: number; b: number; onLeft: boolean; ps: [number, number]; pe: [number, number] }

// Where the rib cut-out's rounded corner meets its rectangle (inset by the border).
function cornerArc(x0: number, x1: number, d0: number, d1: number, CX: number, CD: number, r: number): CornerArc | null {
  const cl = (v: number) => Math.max(-1, Math.min(1, v))
  if (r <= 0 || x1 <= CX) return null
  const a = (x0 - CX) / r
  if (a >= 1) return { cutFront: true }
  const tFront = Math.asin(cl((d0 - CD) / r)), tLeft = a <= -1 ? -Infinity : -Math.acos(a)
  const ts = Math.max(tFront, tLeft), te = -Math.acos(cl((x1 - CX) / r))
  if (te <= ts) return null
  return {
    ts, te, b: Math.tan((te - ts) / 4), onLeft: tLeft > tFront,
    ps: [CX + r * Math.cos(ts), CD + r * Math.sin(ts)], pe: [x1, CD + r * Math.sin(te)],
  }
}

// Rib cut-out: the rib outline brought in by the border B (the rib, ignoring its small shoulders, is convex).
function ribCutout(p: CurvedEndParams, c: CurvedEndGeometry): Loop | null {
  const { W, FT, T, B } = p, r = c.RI - B
  if (c.double) {
    const x0 = FT + B + (c.blkSide ? T : 0), x1 = W - FT - B - (c.blkSide ? T : 0)
    const d0 = FT + B + (c.blkFront ? T : 0), d1 = c.Dc - T - B, xm = W / 2
    if (x1 - x0 < 30 || d1 - d0 < 30) return null
    const k = cornerArc(xm, x1, d0, d1, c.CX, c.CD, r)
    if (!k) return [[x0, d0, 0], [x1, d0, 0], [x1, d1, 0], [x0, d1, 0]]
    if (k.cutFront) return null
    const m = ([x, d]: [number, number]): [number, number] => [W - x, d]
    const mpe = m(k.pe), mps = m(k.ps)
    const L: Loop = [[x0, d1, 0], [mpe[0], mpe[1], k.b]]
    if (Math.abs(mps[0] - k.ps[0]) > 0.01) L.push([mps[0], mps[1], 0])
    L.push([k.ps[0], k.ps[1], k.b], [k.pe[0], k.pe[1], 0], [x1, d1, 0])
    return L
  }
  const x0 = T + B, x1 = W - FT - B - (c.blkSide ? T : 0), d1 = c.Dc - T - B
  let d0 = FT + B + (c.blkFront ? T : 0)
  if (x1 - x0 < 30 || d1 - d0 < 30) return null
  const rect = (): Loop => [[x0, d0, 0], [x1, d0, 0], [x1, d1, 0], [x0, d1, 0]]
  const k = cornerArc(x0, x1, d0, d1, c.CX, c.CD, r)
  if (!k) return rect()
  if (k.cutFront) { d0 = Math.max(d0, c.CD); return d1 - d0 < 30 ? null : rect() }
  const L: Loop = []
  if (!k.onLeft) L.push([x0, d0, 0])
  L.push([k.ps[0], k.ps[1], k.b], [k.pe[0], k.pe[1], 0], [x1, d1, 0], [x0, d1, 0])
  return L
}

/** Every derived dimension, loop and warning for one curved end (kit `calc`). */
export function calcCurvedEnd(input: Partial<CurvedEndParams>): CurvedEndGeometry {
  const p: CurvedEndParams = { ...CURVED_END_DEFAULTS, ...input }
  if (!p.onion) p.OS = 0
  const { W, D, H, R, FT, SK, T } = p, E = POCK_EXT
  const Dc = D - p.SBK, Hc = H - p.SBT - p.STP
  const double = p.hand === 'DOUBLE'
  const CX = W - R, CD = R, RI = R - SK
  const maxGap = SK <= 2 ? 170 : 250
  let g = 1
  while ((Hc - (g + 1) * T) / g >= maxGap && g < 60) g++
  const pitch = (Hc - T) / g
  const levels = Array.from({ length: g + 1 }, (_, i) => i * pitch)
  const arc = Math.PI / 2 * R

  const c: CurvedEndGeometry = {
    p, double, Dc, Hc, y0: p.SBT, CX, CD, RI, maxGap, gaps: g, pitch, clear: (Hc - (g + 1) * T) / g,
    levels, holeY: levels.map(y => y + T / 2), arc,
    wrapLen: 0, pockets: [], ovL: 0, ovR: 0, ovG: 0, fixDepth: 0, backX0: 0, backW: 0,
    formerX0: 0, formerW: 0, formerD: Dc - T - SK, formerLoop: [], wrapLoop: [], pocketLines: [],
    blocks: [], blkSide: false, blkFront: false, cut: null, cutDepth: T - p.OS, warnings: [], notes: [],
  }

  if (double) {
    const side = D - R, flat = W - 2 * R, OL = p.OL, OR = p.OR
    c.ovL = OL; c.ovR = OR
    c.wrapLen = OL + 2 * side + 2 * arc + flat + OR
    c.pockets = [[OL + side - E, OL + side + arc + E], [OL + side + arc + flat - E, OL + side + 2 * arc + flat + E]]
    if (c.pockets[0][1] >= c.pockets[1][0]) c.pockets = [[c.pockets[0][0], c.pockets[1][1]]]
    c.backX0 = FT; c.backW = W - 2 * FT; c.formerX0 = SK; c.formerW = W - 2 * SK
    // a full half-round front (width = 2 × radius) has no flat, so no front shoulders
    c.formerLoop = flat > 0.01
      ? [[FT, Dc - T, 0], [FT, R, 0], [SK, R, TB], [R, SK, 0], [R, FT, 0], [W - R, FT, 0], [W - R, SK, TB], [W - SK, R, 0], [W - FT, R, 0], [W - FT, Dc - T, 0]]
      : [[FT, Dc - T, 0], [FT, R, 0], [SK, R, TB], [R, SK, TB], [W - SK, R, 0], [W - FT, R, 0], [W - FT, Dc - T, 0]]
    const mid: Loop = flat >= 2 * E
      ? [[W - R, SK, 0], [W - R - E, SK, 0], [W - R - E, FT, 0], [R + E, FT, 0], [R + E, SK, 0], [R, SK, -TB]]
      : flat > 0.01 ? [[W - R, SK, 0], [R, SK, -TB]] : [[R, SK, -TB]]
    c.wrapLoop = [[0, D + OL, 0], [0, R, TB], [R, 0, 0], [W - R, 0, TB], [W, R, 0], [W, D + OR, 0], [W - FT, D + OR, 0],
      [W - FT, R + E, 0], [W - SK, R + E, 0], [W - SK, R, -TB], ...mid, [SK, R, 0], [SK, R + E, 0], [FT, R + E, 0], [FT, D + OL, 0]]
    c.pocketLines = flat >= 2 * E ? [[R + E, FT], [W - R - E, FT], [FT, R + E], [W - FT, R + E]] : [[FT, R + E], [W - FT, R + E]]
  } else {
    // single end: x 0 is the front end; only the wall end gets an overhang (right for RH, left for LH),
    // plus the gable overhang on the front (neighbour-side) end
    const OV = p.hand === 'LH' ? p.OL : p.OR, OG = p.OG
    c.ovL = p.hand === 'LH' ? OV : 0; c.ovR = p.hand === 'LH' ? 0 : OV; c.ovG = OG
    c.wrapLen = OG + CX + arc + (D - R) + OV
    c.pockets = [[OG + CX - E, OG + CX + arc + E]]
    c.fixDepth = Dc - FT; c.backX0 = T; c.backW = W - FT - T; c.formerX0 = T; c.formerW = W - SK - T
    c.formerLoop = [[T, FT, 0], [CX, FT, 0], [CX, SK, TB], [W - SK, R, 0], [W - FT, R, 0], [W - FT, Dc - T, 0], [T, Dc - T, 0]]
    c.wrapLoop = [[-OG, 0, 0], [CX, 0, TB], [W, R, 0], [W, D + OV, 0], [W - FT, D + OV, 0], [W - FT, R + E, 0], [W - SK, R + E, 0],
      [W - SK, R, -TB], [CX, SK, 0], [CX - E, SK, 0], [CX - E, FT, 0], [-OG, FT, 0]]
    c.pocketLines = [[CX - E, FT], [W - FT, R + E]]
  }

  // Fixing blocks: carcass strips, full carcass height, flat against the back of the face board's
  // full-thickness straights, notched through the formers. 100 wide if the straight allows, else 60.
  const pickW = (avail: number) => [BLOCK_WIDE, BLOCK_NARROW].find(v => v <= avail + 1e-9)
  const L = c.formerLoop
  if (p.blkS) {
    const avail = (Dc - T) - (R + E), wb = pickW(avail)
    if (!wb) c.notes.push(`No room for a side fixing block: the flat side behind the curve is only ${f1(Math.max(0, avail))} long (needs ${BLOCK_NARROW}).`)
    else {
      c.blkSide = true
      const d0 = Dc - T - wb, d1 = Dc - T
      c.blocks.push({ name: double ? 'Block_SideR' : 'Block_Side', face: 'side', dir: 1, x0: W - FT - T, x1: W - FT, d0, d1, wb })
      const i = L.findIndex(v => v[0] === W - FT && v[1] === Dc - T)
      L.splice(i, 1, [W - FT, d0, 0], [W - FT - T, d0, 0], [W - FT - T, d1, 0])
      if (double) {
        c.blocks.push({ name: 'Block_SideL', face: 'side', dir: -1, x0: FT, x1: FT + T, d0, d1, wb })
        const j = L.findIndex(v => v[0] === FT && v[1] === Dc - T)
        L.splice(j, 1, [FT + T, d1, 0], [FT + T, d0, 0], [FT, d0, 0])
      }
    }
  }
  if (p.blkF) {
    const avail = double ? (W - R - E) - (R + E) : (CX - E) - T, wb = pickW(avail)
    if (!wb) c.notes.push(`No room for a front fixing block: the flat front is only ${f1(Math.max(0, avail))} wide (needs ${BLOCK_NARROW}).`)
    else {
      c.blkFront = true
      if (double) {
        const a = W / 2 - wb / 2, b = W / 2 + wb / 2, i = L.findIndex(v => v[0] === R && v[1] === FT)
        c.blocks.push({ name: 'Block_Front', face: 'front', dir: 1, x0: a, x1: b, d0: FT, d1: FT + T, wb })
        L.splice(i + 1, 0, [a, FT, 0], [a, FT + T, 0], [b, FT + T, 0], [b, FT, 0])
      } else {
        c.blocks.push({ name: 'Block_Front', face: 'front', dir: 1, x0: T, x1: T + wb, d0: FT, d1: FT + T, wb })
        const i = L.findIndex(v => v[0] === T && v[1] === FT)
        L.splice(i, 1, [T, FT + T, 0], [T + wb, FT + T, 0], [T + wb, FT, 0])
      }
    }
  }

  c.cut = p.lighten ? ribCutout(p, c) : null

  if (double) {
    if (W < 2 * R) c.warnings.push(`Radius too big for the width: two R${f1(R)} corners need at least ${f1(2 * R)} wide.`)
  } else if (CX - E < T) {
    c.warnings.push(`Radius too big for the width: the pocket would start over the fixing panel. Needs at least ${f1(T + E)} mm of flat front, has ${f1(CX)}.`)
  }
  if (R + E > Dc - T - 20) c.warnings.push('Radius too big for the depth (after the back scribe).')
  if (Hc < 3 * T + 40) c.warnings.push('The top and bottom scribes leave too little carcass height.')
  if (SK >= FT) c.warnings.push('Skin must be thinner than the face board.')
  // Decision 10 (RHK addition to the kit): skin outside 2–3 mm is a warning, not a block.
  else if (SK < SKIN_MIN) c.notes.push(`Skin ${f1(SK)} mm is under ${SKIN_MIN} mm — too thin, the face board may crack or break through.`)
  else if (SK > SKIN_MAX) c.notes.push(`Skin ${f1(SK)} mm is over ${SKIN_MAX} mm — too thick to bend easily.`)
  return c
}

/** Reverse a loop's direction: each bulge moves to the new start of its segment and flips sign. */
export function revLoop(L: Loop): Loop {
  const n = L.length, o: Loop = []
  for (let i = 0; i < n; i++) {
    const j = (n - i) % n, prev = (j - 1 + n) % n
    o.push([L[j][0], L[j][1], -L[prev][2]])
  }
  return o
}
/** Mirror across x (0..w), keeping the direction. */
export function mirLoop(L: Loop, w: number): Loop {
  return revLoop(L.map(([x, y, b]) => [w - x, y, -b] as [number, number, number]))
}

export const loopToOutline = (L: Loop): OutlinePt[] =>
  L.map(([x, y, b]) => (b ? { x, y, b } : { x, y }))

// ── Parts ────────────────────────────────────────────────────────────────────

export type CurvedEndPartName =
  | 'FaceBoard' | 'FixingPanel' | 'Back' | 'Top' | 'Bottom' | `Rib${number}`
  | CurvedEndBlock['name']

export interface CurvedEndPart {
  name: CurvedEndPartName
  material: 'face' | 'carcass'      // face = end panel / exterior (decision 11); carcass = the cabinet's board
  thickness: number
  sizeX: number; sizeY: number       // part-local bounding size
  /** Shaped parts only (the formers): anticlockwise, part-local, true arcs. */
  outline?: OutlinePt[]
  /** Back-face pockets (face board), part-local rects incl. the kit's 8 mm edge overrun. */
  pockets?: { x0: number; x1: number; y0: number; y1: number; depth: number }[]
  /** Rib cut-out: inner closed loop, part-local, anticlockwise; route depth (T − onion skin). */
  cutout?: { loop: OutlinePt[]; depth: number }
  /** Former level (index into geometry.levels) — formers only. */
  level?: number
}

const r2 = (v: number) => Math.round(v * 100) / 100

/** One entry per physical part (kit: one DXF per part), in the kit's part-local frame. */
export function curvedEndParts(c: CurvedEndGeometry): CurvedEndPart[] {
  const { H, FT, SK, T, hand } = c.p
  const out: CurvedEndPart[] = []
  out.push({
    name: 'FaceBoard', material: 'face', thickness: FT, sizeX: r2(c.wrapLen), sizeY: H,
    pockets: c.pockets.map(([a, b]) => ({ x0: r2(a), x1: r2(b), y0: -OVER, y1: H + OVER, depth: FT - SK })),
  })
  if (!c.double) out.push({ name: 'FixingPanel', material: 'carcass', thickness: T, sizeX: r2(c.fixDepth), sizeY: r2(c.Hc) })
  out.push({ name: 'Back', material: 'carcass', thickness: T, sizeX: r2(c.backW), sizeY: r2(c.Hc) })

  const fw = r2(c.formerW), fd = r2(c.formerD)
  const tx = ([x, d, b]: [number, number, number]): [number, number, number] => [x - c.formerX0, d - SK, b]
  let loop = c.formerLoop.map(tx)
  if (hand === 'LH') loop = mirLoop(loop, fw)
  let cut: Loop | null = c.cut ? c.cut.map(tx) : null
  if (cut && hand === 'LH') cut = mirLoop(cut, fw)
  const former = (name: CurvedEndPartName, level: number, withCut: boolean): CurvedEndPart => ({
    name, material: 'carcass', thickness: T, sizeX: fw, sizeY: fd, level,
    outline: loopToOutline(loop),
    ...(withCut && cut ? { cutout: { loop: loopToOutline(cut), depth: c.cutDepth } } : {}),
  })
  out.push(former('Bottom', 0, false))
  for (let i = 1; i < c.gaps; i++) out.push(former(`Rib${i}`, i, true))
  out.push(former('Top', c.gaps, false))
  for (const k of c.blocks) out.push({ name: k.name, material: 'carcass', thickness: T, sizeX: k.wb, sizeY: r2(c.Hc) })
  return out
}

export const partFileName = (n: CurvedEndPartName) => (n === 'FaceBoard' ? 'ext_' : 'int_') + n
