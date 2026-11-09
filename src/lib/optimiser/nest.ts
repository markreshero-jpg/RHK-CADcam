// ============================================================
// Panel nesting engine.
// Groups parts by material+thickness, then packs each group onto
// sheets with a MaxRects placer: every sheet keeps a list of ALL its free
// rectangles (including the pockets under/between placed parts), so a
// small part can drop into any hole on an earlier sheet instead of
// opening a new one. (The old skyline packer only knew the top contour —
// space under an overhang was lost for good; Flaxton kitchen 2026-11-06.)
//
// Internally the sheet packs bottom-up; the final layout is mirrored to
// fill from the TOP-left (see toPlacement), so leftover space falls to the
// bottom of a part sheet.
//
// Each attempt = a part order × a placement rule. Quality tiers try more
// attempts (several sort orders, then seeded random perturbations) and keep
// the best: fewest unplaced, fewest sheets, then the layout with its area
// most concentrated (the emptiest last sheet = the most useful offcut).
// Every attempt finishes with a squeeze pass that tries to empty the
// least-full sheet into the holes of the others.
//
// Pure & framework-free — callable from the optimiser client and
// re-usable/testable on its own. Cabinet parts are rectangles; shaped
// parts nest by their bounding box. (spec §5.6)
// ============================================================

import { materialGroupKey } from './types'

export interface NestPartInput {
  uid: string            // unique per physical instance (qty already expanded)
  baseUid: string        // the source part uid (before qty expansion)
  label: string
  w: number; h: number   // cut size (mm)
  thickness: number
  materialId: string | null
  grainLock: boolean     // true → orientation fixed to the sheet's grain (h = along the grain)
  grainAcross?: boolean  // grain runs along w instead (horizontal grain match fronts, z_grain_match G3)
  priority: number       // higher places earlier within its group
}

export interface SheetStock {
  w: number; h: number
  trimTop: number; trimBottom: number; trimLeft: number; trimRight: number
  isOffcut: boolean
  label: string | null
  // How many we have (Stage 3). Standard sheet: unset = no limit, 0 = offcuts only.
  // Offcut: unset = 1. Parts that don't fit what's available come back unplaced.
  qty?: number | null
  // Sheet axis the board's grain runs along. Absent = 'w': the grain runs with
  // the board's length (sheet_dx), which is laid along W / machine X.
  grainAlong?: 'w' | 'h'
}

export interface Placement {
  uid: string; baseUid: string; label: string
  x: number; y: number          // bottom-left in sheet coords (mm)
  w: number; h: number          // as placed (rotated swaps w/h)
  rotated: boolean
}

export interface NestedSheet {
  index: number
  materialId: string | null
  thickness: number
  stock: SheetStock
  placements: Placement[]
  efficiency: number            // placed area / usable area
}

export interface NestResult {
  sheets: NestedSheet[]
  unplaced: NestPartInput[]      // parts too big for any available sheet
  // Grain match blocks placed in this layout (z_grain_match G4) + their run warnings.
  blocks?: import('./grainBlocks').GrainBlockInfo[]
  warnings?: string[]
}

export interface NestSettings {
  // Gap between nested parts, per material = routing tool Ø + nest pad + tool-entry
  // offset (see buildMargins in types.ts). defaultMargin is used when a material has
  // no entry (e.g. no assigned tool).
  marginByMaterial: Record<string, number>
  defaultMargin: number
  quality: 'fast' | 'balanced' | 'best'
  allowRotation: boolean
}

// Stock available per material group: standard sheets (unlimited unless qty is
// set) plus a finite pool of offcuts (consumed first).
export interface GroupStock {
  standard: SheetStock
  offcuts: SheetStock[]
}


const EPS = 1e-6

// The one orientation a grain-locked part may take on this sheet: parts carry
// h = along the grain, so on a sheet whose grain runs along W they're turned a
// quarter (w ↔ h, rotated). grainAcross parts carry the grain along w, so they
// take the other orientation. Free parts → null (either orientation is fine).
export function grainOrient(part: { w: number; h: number; grainLock: boolean; grainAcross?: boolean }, stock: SheetStock): { w: number; h: number; rotated: boolean } | null {
  if (!part.grainLock) return null
  return ((stock.grainAlong ?? 'w') === 'h') !== !!part.grainAcross
    ? { w: part.w, h: part.h, rotated: false }
    : { w: part.h, h: part.w, rotated: true }
}

// Every orientation a part may take on this sheet ([w, h] as placed, rotated).
function orientsFor(part: NestPartInput, stock: SheetStock, allowRot: boolean): [number, number, boolean][] {
  const g = grainOrient(part, stock)
  if (g) return [[g.w, g.h, g.rotated]]
  const o: [number, number, boolean][] = [[part.w, part.h, false]]
  if (allowRot && Math.abs(part.w - part.h) > EPS) o.push([part.h, part.w, true])
  return o
}

function usable(stock: SheetStock) {
  return {
    w: stock.w - stock.trimLeft - stock.trimRight,
    h: stock.h - stock.trimTop - stock.trimBottom,
    ox: stock.trimLeft,
    oy: stock.trimBottom,
  }
}

// ── MaxRects sheet ──────────────────────────────────────────────
// Internal coords are bottom-up from the usable origin. Each part reserves
// w+gap × h+gap, and the bin runs gap past the usable edge — the gap is only
// needed BETWEEN parts, so a part may sit right on the trim (as manual
// placement allows). 2400 kicks on a 2415 sheet, 5 trim (RHK6542).

interface Rect { x: number; y: number; w: number; h: number }
interface Placed { part: NestPartInput; x: number; y: number; w: number; h: number; rotated: boolean }   // w/h = real part size as placed
interface OpenSheet { stock: SheetStock; free: Rect[]; placed: Placed[]; uW: number; uH: number; gap: number; area: number }

// Placement rule: bl = lowest position then leftmost (tidy, fills from the
// top-left in output); blt = lowest top edge then leftmost; bssf = best short-side fit; baf = best area fit
// (both hunt the tightest hole).
type Rule = 'bl' | 'blt' | 'bssf' | 'baf'

function makeOpen(stock: SheetStock, gap: number): OpenSheet {
  const u = usable(stock)
  return { stock, free: [{ x: 0, y: 0, w: u.w + gap, h: u.h + gap }], placed: [], uW: u.w, uH: u.h, gap, area: 0 }
}

// Score a w×h slot at the corner of free rect f (lower is better).
function slotScore(f: Rect, w: number, h: number, rule: Rule): [number, number] {
  if (rule === 'bl') return [f.y, f.x]          // ties keep the first orientation (as-is)
  if (rule === 'blt') return [f.y + h, f.x]
  const dw = f.w - w, dh = f.h - h
  if (rule === 'bssf') return [Math.min(dw, dh), Math.max(dw, dh)]
  return [f.w * f.h - w * h, Math.min(dw, dh)]
}

interface Slot { x: number; y: number; w: number; h: number; rotated: boolean; s: [number, number] }

function better(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[0] - EPS || (Math.abs(a[0] - b[0]) <= EPS && a[1] < b[1] - EPS)
}

function bestSlot(open: OpenSheet, part: NestPartInput, allowRot: boolean, rule: Rule): Slot | null {
  const g = open.gap
  let best: Slot | null = null
  for (const [w, h, rotated] of orientsFor(part, open.stock, allowRot)) {
    const iw = w + g, ih = h + g
    for (const f of open.free) {
      if (iw > f.w + EPS || ih > f.h + EPS) continue
      const s = slotScore(f, iw, ih, rule)
      if (!best || better(s, best.s)) best = { x: f.x, y: f.y, w, h, rotated, s }
    }
  }
  return best
}

const contains = (a: Rect, b: Rect) =>
  b.x >= a.x - EPS && b.y >= a.y - EPS && b.x + b.w <= a.x + a.w + EPS && b.y + b.h <= a.y + a.h + EPS

// Mark rect r (inflated by the gap) as used: split every free rect it overlaps
// into its maximal leftovers, then drop free rects contained in another.
function occupy(open: OpenSheet, r: Rect) {
  const out: Rect[] = []
  for (const f of open.free) {
    if (r.x >= f.x + f.w - EPS || r.x + r.w <= f.x + EPS || r.y >= f.y + f.h - EPS || r.y + r.h <= f.y + EPS) { out.push(f); continue }
    if (r.x > f.x + EPS) out.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h })
    if (r.x + r.w < f.x + f.w - EPS) out.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - (r.x + r.w), h: f.h })
    if (r.y > f.y + EPS) out.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y })
    if (r.y + r.h < f.y + f.h - EPS) out.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - (r.y + r.h) })
  }
  const pruned: Rect[] = []
  for (let i = 0; i < out.length; i++) {
    let dead = false
    for (let j = 0; j < out.length && !dead; j++) {
      if (i === j || !contains(out[j], out[i])) continue
      dead = !contains(out[i], out[j]) || j < i     // identical rects: keep the first
    }
    if (!dead) pruned.push(out[i])
  }
  open.free = pruned
}

function commit(open: OpenSheet, part: NestPartInput, slot: { x: number; y: number; w: number; h: number; rotated: boolean }) {
  open.placed.push({ part, x: slot.x, y: slot.y, w: slot.w, h: slot.h, rotated: slot.rotated })
  occupy(open, { x: slot.x, y: slot.y, w: slot.w + open.gap, h: slot.h + open.gap })
  open.area += slot.w * slot.h
}

function tryPlace(open: OpenSheet, part: NestPartInput, allowRot: boolean, rule: Rule): boolean {
  const slot = bestSlot(open, part, allowRot, rule)
  if (!slot) return false
  commit(open, part, slot)
  return true
}

// A sheet rebuilt from placements at their existing positions.
function rebuild(open: OpenSheet, keep: Placed[]): OpenSheet {
  const o = makeOpen(open.stock, open.gap)
  for (const p of keep) commit(o, p.part, p)
  return o
}

// Does an empty sheet of this stock have room for the part (either orientation)?
function fitsEmpty(stk: SheetStock, part: NestPartInput, allowRot: boolean): boolean {
  const u = usable(stk)
  return orientsFor(part, stk, allowRot).some(([w, h]) => w <= u.w + EPS && h <= u.h + EPS)   // gap is between parts, not to the trim
}

const fill = (o: OpenSheet) => o.area / (o.uW * o.uH)

// Pack one ordered list of same-group parts. Offcuts are opened first.
function packGroup(parts: NestPartInput[], stock: GroupStock, gap: number, allowRot: boolean, rule: Rule): { open: OpenSheet[]; unplaced: NestPartInput[] } {
  const offcutQueue = stock.offcuts.flatMap(o => Array.from({ length: Math.max(1, Math.floor(o.qty ?? 1)) }, () => ({ ...o })))
  let fullLeft = stock.standard.qty == null ? Infinity : Math.max(0, Math.floor(stock.standard.qty))
  const open: OpenSheet[] = []
  const unplaced: NestPartInput[] = []
  for (const part of parts) {
    let placed = false
    for (const o of open) if (tryPlace(o, part, allowRot, rule)) { placed = true; break }
    if (placed) continue
    // No open sheet fits — open a fresh one that does. Prefer offcuts (free
    // material), but only consume an offcut that can actually hold the part so
    // small offcuts stay available for smaller parts.
    const idx = offcutQueue.findIndex(o => fitsEmpty(o, part, allowRot))
    const stk = idx >= 0 ? offcutQueue.splice(idx, 1)[0]
      : fullLeft > 0 && fitsEmpty(stock.standard, part, allowRot) ? stock.standard : null
    if (!stk) { unplaced.push(part); continue }
    if (stk === stock.standard) fullLeft--
    const o = makeOpen(stk, gap)
    open.push(o)
    tryPlace(o, part, allowRot, rule)
  }
  return { open: squeeze(open.filter(o => o.placed.length > 0), allowRot), unplaced }
}

// Squeeze: take the least-full sheet's parts (biggest first) and drop each into
// the tightest hole on any other sheet. If the sheet empties it's gone (one
// sheet fewer) and the next least-full sheet gets a go. If only some move,
// what's left is re-packed tidily from the top-left when it fits (else it keeps
// its positions) — the leftover sheet ends up emptier.
function squeeze(sheets: OpenSheet[], allowRot: boolean): OpenSheet[] {
  let open = sheets
  for (let guard = 0; guard < 50 && open.length > 1; guard++) {
    let si = 0
    for (let i = 1; i < open.length; i++) if (fill(open[i]) < fill(open[si]) - EPS) si = i
    const src = open[si]
    const trial = open.filter((_, i) => i !== si).map(o => rebuild(o, o.placed))   // scratch copies
    const todo = [...src.placed].sort((a, b) => b.w * b.h - a.w * a.h)
    const left: Placed[] = []
    for (const p of todo) {
      let best: { o: OpenSheet; slot: Slot } | null = null
      for (const o of trial) {
        const slot = bestSlot(o, p.part, allowRot, 'bssf')
        if (slot && (!best || better(slot.s, best.slot.s))) best = { o, slot }
      }
      if (best) commit(best.o, p.part, best.slot)
      else left.push(p)
    }
    if (left.length === 0) { open = trial; continue }          // emptied — try the next least-full
    // No hole takes the rest: re-pack it together with one other sheet's parts
    // onto that sheet from scratch (emptiest partner first, every order × rule).
    const merged = mergeInto(trial, left, allowRot)
    if (merged) { open = merged; continue }
    if (left.length < todo.length) {
      const fresh = makeOpen(src.stock, src.gap)
      const ok = left.every(p => tryPlace(fresh, p.part, allowRot, 'bl'))   // left is biggest-first
      open = [...trial.slice(0, si), ok ? fresh : rebuild(src, left), ...trial.slice(si)]
    }
    break
  }
  return open
}

// Fit `extra` onto one of `sheets` by re-packing that sheet's own parts plus
// `extra` onto a fresh sheet of its stock. Returns the new sheet list, or null.
function mergeInto(sheets: OpenSheet[], extra: Placed[], allowRot: boolean): OpenSheet[] | null {
  const extraArea = extra.reduce((a, p) => a + p.w * p.h, 0)
  const order = sheets.map((o, i) => i).sort((a, b) => fill(sheets[a]) - fill(sheets[b]))
  for (const j of order) {
    const o = sheets[j]
    if (o.area + extraArea > o.uW * o.uH * 0.98) continue      // no chance
    if (!extra.every(p => fitsEmpty(o.stock, p.part, allowRot))) continue
    const pool = [...o.placed, ...extra].map(p => p.part)
    for (const k of KEYS) {
      const s = sorted(pool, k)
      for (const rule of RULES) {
        const fresh = makeOpen(o.stock, o.gap)
        if (s.every(p => tryPlace(fresh, p, allowRot, rule))) return sheets.map((x, i) => i === j ? fresh : x)
      }
    }
  }
  return null
}

// ── Attempts ────────────────────────────────────────────────────

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Key = (p: NestPartInput) => number
const KEYS: Key[] = [
  p => p.w * p.h,                     // area
  p => Math.max(p.w, p.h),            // longest side
  p => p.w + p.h,                     // perimeter
  p => Math.min(p.w, p.h),            // shortest side
]

// Priority always first (higher places earlier), then the key descending.
function sorted(parts: NestPartInput[], key: Key): NestPartInput[] {
  return [...parts].sort((a, b) => (b.priority - a.priority) || (key(b) - key(a)))
}

// Seeded perturbation of an order: nearby swaps, never across priorities.
function perturb(parts: NestPartInput[], seed: number): NestPartInput[] {
  const r = rng(seed)
  const arr = [...parts]
  for (let i = 0; i < arr.length - 1; i++) {
    if (r() >= 0.3) continue
    const j = Math.min(arr.length - 1, i + 1 + Math.floor(r() * 3))
    if (arr[j].priority !== arr[i].priority) continue
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t
  }
  return arr
}

const RULES: Rule[] = ['bl', 'blt', 'bssf', 'baf']
const RANDOM_TRIES = { fast: 0, balanced: 24, best: 200 } as const

// Fast = one attempt; Balanced = every sort order × every rule (16) + 24 random;
// Best = those + seeded random perturbations.
function attempts(parts: NestPartInput[], quality: NestSettings['quality']): { parts: NestPartInput[]; rule: Rule }[] {
  if (quality === 'fast') return [{ parts: sorted(parts, KEYS[0]), rule: 'bl' }]
  const out: { parts: NestPartInput[]; rule: Rule }[] = []
  for (const k of KEYS) { const s = sorted(parts, k); for (const rule of RULES) out.push({ parts: s, rule }) }
  for (let i = 0; i < RANDOM_TRIES[quality]; i++) {
    out.push({ parts: perturb(sorted(parts, KEYS[i % KEYS.length]), i + 1), rule: RULES[i % RULES.length] })
  }
  return out
}

// Lower is better: fewest unplaced, fewest sheets, then area most
// concentrated (Σ fill² — rewards full sheets and an emptier last one).
type Score = [number, number, number]
function score(open: OpenSheet[], unplaced: number): Score {
  return [unplaced, open.length, -open.reduce((a, o) => a + fill(o) ** 2, 0)]
}
function lessScore(a: Score, b: Score): boolean {
  if (a[0] !== b[0]) return a[0] < b[0]
  if (a[1] !== b[1]) return a[1] < b[1]
  return a[2] < b[2] - 1e-9
}

function toSheet(o: OpenSheet, index: number, materialId: string | null, thickness: number): NestedSheet {
  const { ox, oy } = usable(o.stock)
  return {
    index, materialId, thickness, stock: o.stock,
    // Internal coords are bottom-up; mirror vertically within the usable area so
    // the dense cluster lands against the top trim and leftover space sits at the
    // bottom. Only the output Y flips — the part itself (orientation, grain, hole
    // positions) is unchanged.
    placements: o.placed.map(p => ({
      uid: p.part.uid, baseUid: p.part.baseUid, label: p.part.label,
      x: ox + p.x, y: oy + (o.uH - (p.y + p.h)), w: p.w, h: p.h, rotated: p.rotated,
    })),
    efficiency: fill(o),
  }
}

export function nest(
  parts: NestPartInput[],
  stockByGroup: Record<string, GroupStock>,
  settings: NestSettings,
): NestResult {
  // Group by material+thickness.
  const groups = new Map<string, NestPartInput[]>()
  for (const p of parts) {
    const k = materialGroupKey(p.materialId, p.thickness)
    const arr = groups.get(k) ?? []
    arr.push(p); groups.set(k, arr)
  }

  const allSheets: NestedSheet[] = []
  const allUnplaced: NestPartInput[] = []
  let globalIndex = 0

  for (const [key, groupParts] of groups) {
    const stock = stockByGroup[key]
    if (!stock) { allUnplaced.push(...groupParts); continue }
    const matId = groupParts[0]?.materialId ?? null
    const gap = (matId != null ? settings.marginByMaterial[matId] : undefined) ?? settings.defaultMargin
    const thickness = groupParts[0]?.thickness ?? 0

    let best: { open: OpenSheet[]; unplaced: NestPartInput[]; s: Score } | null = null
    for (const a of attempts(groupParts, settings.quality)) {
      const r = packGroup(a.parts, stock, gap, settings.allowRotation, a.rule)
      const s = score(r.open, r.unplaced.length)
      if (!best || lessScore(s, best.s)) best = { ...r, s }
    }
    // Sheets in the order they were opened (priority parts / grain blocks
    // early), except the emptiest — the leftover sheet — goes last.
    const ordered = [...(best?.open ?? [])]
    let ei = -1
    ordered.forEach((o, i) => { if (ei < 0 || fill(o) < fill(ordered[ei]) - EPS) ei = i })
    if (ei >= 0) ordered.push(...ordered.splice(ei, 1))
    for (const o of ordered) allSheets.push(toSheet(o, globalIndex++, matId, thickness))
    allUnplaced.push(...(best?.unplaced ?? []))
  }

  return { sheets: allSheets, unplaced: allUnplaced }
}
