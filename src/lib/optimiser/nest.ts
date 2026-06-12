// ============================================================
// Panel nesting engine.
// Groups parts by material+thickness, then packs each group onto
// sheets with a skyline placer (rectangles, with rotation when grain
// allows). The skyline packs bottom-up internally but the final layout
// is mirrored to fill from the TOP-left (see tryPlace), so leftover
// space falls to the bottom of a part sheet. Quality tiers add
// random-restart repacking ("light annealing") and keep the best layout.
//
// Pure & framework-free — callable from the optimiser client and
// re-usable/testable on its own. Arbitrary-polygon NFP packing is
// a future extension; cabinet parts are rectangles today, so the
// skyline packer covers the real workload. (spec §5.6)
// ============================================================

import { materialGroupKey } from './types'

export interface NestPartInput {
  uid: string            // unique per physical instance (qty already expanded)
  baseUid: string        // the source part uid (before qty expansion)
  label: string
  w: number; h: number   // cut size (mm)
  thickness: number
  materialId: string | null
  grainLock: boolean     // true → orientation fixed (no rotation)
  priority: number       // higher places earlier within its group
}

export interface SheetStock {
  w: number; h: number
  trimTop: number; trimBottom: number; trimLeft: number; trimRight: number
  isOffcut: boolean
  label: string | null
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

// Stock available per material group: unlimited standard sheets plus a finite
// pool of offcuts (consumed first).
export interface GroupStock {
  standard: SheetStock
  offcuts: SheetStock[]
}

interface Seg { x: number; width: number; y: number }
const EPS = 1e-6

function usable(stock: SheetStock) {
  return {
    w: stock.w - stock.trimLeft - stock.trimRight,
    h: stock.h - stock.trimTop - stock.trimBottom,
    ox: stock.trimLeft,
    oy: stock.trimBottom,
  }
}

// Lowest, then leftmost position where w×h fits the skyline.
function findPos(sky: Seg[], uW: number, uH: number, w: number, h: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null
  for (let i = 0; i < sky.length; i++) {
    const x = sky[i].x
    if (x + w > uW + EPS) continue
    let y = 0, acc = 0, j = i
    while (j < sky.length && acc < w - EPS) { y = Math.max(y, sky[j].y); acc += sky[j].width; j++ }
    if (acc < w - EPS) continue
    if (y + h > uH + EPS) continue
    if (!best || y < best.y - EPS || (Math.abs(y - best.y) < EPS && x < best.x)) best = { x, y }
  }
  return best
}

function raise(sky: Seg[], x: number, w: number, top: number): Seg[] {
  const res: Seg[] = []
  for (const s of sky) {
    if (s.x + s.width <= x + EPS || s.x >= x + w - EPS) { res.push(s); continue }
    if (s.x < x - EPS) res.push({ x: s.x, width: x - s.x, y: s.y })
    if (s.x + s.width > x + w + EPS) res.push({ x: x + w, width: s.x + s.width - (x + w), y: s.y })
  }
  res.push({ x, width: w, y: top })
  res.sort((a, b) => a.x - b.x)
  const merged: Seg[] = []
  for (const s of res) {
    const last = merged[merged.length - 1]
    if (last && Math.abs(last.y - s.y) < EPS && Math.abs(last.x + last.width - s.x) < EPS) last.width += s.width
    else merged.push({ ...s })
  }
  return merged
}

interface OpenSheet { sheet: NestedSheet; sky: Seg[]; uW: number; uH: number; placedArea: number }

function tryPlace(open: OpenSheet, part: NestPartInput, gap: number, allowRot: boolean): boolean {
  const orients: [number, number, boolean][] = [[part.w, part.h, false]]
  if (allowRot && !part.grainLock && Math.abs(part.w - part.h) > EPS) orients.push([part.h, part.w, true])

  let chosen: { x: number; y: number; w: number; h: number; rotated: boolean } | null = null
  for (const [w, h, rotated] of orients) {
    const pos = findPos(open.sky, open.uW, open.uH, w + gap, h + gap)
    if (pos && (!chosen || pos.y < chosen.y - EPS)) chosen = { x: pos.x, y: pos.y, w, h, rotated }
  }
  if (!chosen) return false

  const { ox, oy } = usable(open.sheet.stock)
  // The skyline packs bottom-up internally (lowest-first), but we want the layout
  // to fill from the TOP-left: mirror the placement vertically within the usable
  // area so the dense cluster lands against the top trim and any leftover space
  // sits at the bottom. Only the output Y flips — the part itself (orientation,
  // grain, hole positions) is unchanged, and the skyline below stays bottom-up.
  const yTop = open.uH - (chosen.y + chosen.h)
  open.sheet.placements.push({
    uid: part.uid, baseUid: part.baseUid, label: part.label,
    x: ox + chosen.x, y: oy + yTop, w: chosen.w, h: chosen.h, rotated: chosen.rotated,
  })
  open.sky = raise(open.sky, chosen.x, chosen.w + gap, chosen.y + chosen.h + gap)
  open.placedArea += chosen.w * chosen.h
  return true
}

function makeOpen(stock: SheetStock, index: number, materialId: string | null, thickness: number): OpenSheet {
  const u = usable(stock)
  return {
    sheet: { index, materialId, thickness, stock, placements: [], efficiency: 0 },
    sky: [{ x: 0, width: u.w, y: 0 }],
    uW: u.w, uH: u.h, placedArea: 0,
  }
}

// Pack one ordered list of same-group parts. Offcuts are opened first.
function packGroup(parts: NestPartInput[], stock: GroupStock, settings: NestSettings): { sheets: NestedSheet[]; unplaced: NestPartInput[] } {
  const matId = parts[0]?.materialId ?? null
  const gap = (matId != null ? settings.marginByMaterial[matId] : undefined) ?? settings.defaultMargin
  const thickness = parts[0]?.thickness ?? 0
  const offcutQueue = [...stock.offcuts]
  const open: OpenSheet[] = []
  const unplaced: NestPartInput[] = []
  let sheetIdx = 0

  // Does an empty sheet of this stock have room for the part (either orientation)?
  const fitsEmpty = (stk: SheetStock, part: NestPartInput): boolean => {
    const u = usable(stk)
    const ok = (w: number, h: number) => w + gap <= u.w + EPS && h + gap <= u.h + EPS
    return ok(part.w, part.h) || (settings.allowRotation && !part.grainLock && ok(part.h, part.w))
  }

  for (const part of parts) {
    let placed = false
    for (const o of open) if (tryPlace(o, part, gap, settings.allowRotation)) { placed = true; break }
    if (placed) continue
    // No open sheet fits — open a fresh one that does. Prefer offcuts (free
    // material), but only consume an offcut that can actually hold the part so
    // small offcuts stay available for smaller parts.
    const idx = offcutQueue.findIndex(o => fitsEmpty(o, part))
    const stk = idx >= 0 ? offcutQueue.splice(idx, 1)[0]
      : fitsEmpty(stock.standard, part) ? stock.standard : null
    if (!stk) { unplaced.push(part); continue }
    const o = makeOpen(stk, sheetIdx++, matId, thickness)
    open.push(o)
    tryPlace(o, part, gap, settings.allowRotation)
  }

  const sheets = open.filter(o => o.sheet.placements.length > 0).map(o => {
    o.sheet.efficiency = o.placedArea / (o.uW * o.uH)
    return o.sheet
  })
  return { sheets, unplaced }
}

// Order parts for a packing attempt. seed 0 = deterministic (priority then
// area desc); seed > 0 = light perturbation for random-restart annealing.
function order(parts: NestPartInput[], seed: number): NestPartInput[] {
  const base = [...parts].sort((a, b) => (b.priority - a.priority) || (b.w * b.h - a.w * a.h))
  if (seed === 0) return base
  // Swap a few neighbouring pairs pseudo-randomly (seeded by index+seed).
  const arr = [...base]
  for (let i = 0; i < arr.length - 1; i++) {
    const r = ((i * 9301 + seed * 49297) % 233280) / 233280
    if (r < 0.25) { const t = arr[i]; arr[i] = arr[i + 1]; arr[i + 1] = t }
  }
  return arr
}

const ITERATIONS = { fast: 1, balanced: 8, best: 40 } as const

function score(sheets: NestedSheet[]): number {
  // Fewer sheets first, then higher average efficiency.
  const avgEff = sheets.length ? sheets.reduce((a, s) => a + s.efficiency, 0) / sheets.length : 0
  return sheets.length * 1000 - avgEff
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
  const iters = ITERATIONS[settings.quality]
  let globalIndex = 0

  for (const [key, groupParts] of groups) {
    const stock = stockByGroup[key]
    if (!stock) { allUnplaced.push(...groupParts); continue }

    let bestSheets: NestedSheet[] | null = null
    let bestUnplaced: NestPartInput[] = []
    for (let seed = 0; seed < iters; seed++) {
      const { sheets, unplaced } = packGroup(order(groupParts, seed), stock, settings)
      if (!bestSheets || unplaced.length < bestUnplaced.length ||
          (unplaced.length === bestUnplaced.length && score(sheets) < score(bestSheets))) {
        bestSheets = sheets; bestUnplaced = unplaced
      }
    }
    for (const s of bestSheets ?? []) { s.index = globalIndex++; allSheets.push(s) }
    allUnplaced.push(...bestUnplaced)
  }

  return { sheets: allSheets, unplaced: allUnplaced }
}
