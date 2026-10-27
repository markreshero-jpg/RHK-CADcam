// ============================================================
// Grain match blocks (z_grain_match G4).
// A group's selected fronts nest as ONE block, laid out as they hang
// on the wall (frontWallRects), every gap set to the cutter gap, so the
// grain runs on from front to front. The nester packs the block as a
// pseudo-part; expandGrainBlocks puts the member fronts back afterwards
// (a true quarter turn when the block is turned, so drilling follows).
// A block too big for a sheet is split at cabinet boundaries into the
// fewest pieces that fit. Finger-pull rails / linear handles never join
// (fronts = face_zones only — Mark 2026-10-27).
// Pure & framework-free.
// ============================================================

import type { FrontWallRect, WallRect } from '../frontWallRects'
import { grainOrient, type NestPartInput, type NestResult, type NestedSheet, type Placement, type SheetStock } from './nest'
import { materialGroupKey, type OptiCabinet, type OptiPart } from './types'
import { sheetEfficiency } from './edit'

export interface GrainBlockMember {
  uid: string            // nest instance uid (…#0)
  bx: number; by: number // block-local, y up (wall up)
  w: number; h: number   // cut size
}

export interface GrainBlock {
  uid: string            // the pseudo-part uid (gm:…)
  groupId: string
  name: string           // GM1
  direction: 'vertical' | 'horizontal'
  piece: number          // 1-based, when split
  pieces: number
  W: number; H: number   // block size (natural, y = wall up)
  members: GrainBlockMember[]
}

/** Placed block (after expansion): which nest uids belong together, for Stage 5 + outputs. */
export interface GrainBlockInfo {
  uid: string; groupId: string; name: string; direction: 'vertical' | 'horizontal'
  piece: number; pieces: number
  memberUids: string[]   // elevation order: left → right, top → bottom
  W: number; H: number
}

/** Copy each grouped front's wall rect onto its snapshot part (face_zones only). */
export function attachWallRects(parts: OptiPart[], rects: Map<string, FrontWallRect>): void {
  for (const p of parts) {
    if (p.source_table !== 'face_zones') continue
    const r = rects.get(p.source_part_id)
    if (r) { p.wall_rect = r.rect; p.wall_key = `${r.wallId}|${r.side}` }
  }
}

const EPS = 0.5
type Item = { lo: number; size: number; olo: number; ohi: number }

// One axis of the block layout. Empty bands wider than the gap (e.g. between a
// base row and an overhead row) shrink to the gap; then every pair of items that
// face each other across this axis (overlapping on the other axis) is pushed to
// at least `gap` apart. Every pair keeps at least its (squeezed) offset, so
// columns / rows that lined up on the wall still line up.
export function compactAxis(items: Item[], gap: number): number[] {
  // Squeeze: uncovered intervals longer than gap → gap.
  const iv = items.map(i => [i.lo, i.lo + i.size] as [number, number]).sort((a, b) => a[0] - b[0])
  const holes: [number, number][] = []
  let reach = iv.length ? iv[0][1] : 0
  for (const [a, b] of iv.slice(1)) {
    if (a > reach + gap) holes.push([reach, a - gap])
    reach = Math.max(reach, b)
  }
  const squeeze = (v: number) => v - holes.reduce((s, [a, b]) => s + (v >= b ? b - a : v > a ? v - a : 0), 0)
  const base = items.map(i => squeeze(i.lo))

  const order = items.map((_, k) => k).sort((a, b) => base[a] - base[b] || a - b)
  const pos: number[] = new Array(items.length).fill(0)
  const done: number[] = []
  for (const j of order) {
    let p = base[j]
    for (const i of done) {
      p = Math.max(p, pos[i] + (base[j] - base[i]))
      const facing = items[i].lo + items[i].size <= items[j].lo + EPS
        && items[i].olo < items[j].ohi - EPS && items[j].olo < items[i].ohi - EPS
      if (facing) p = Math.max(p, pos[i] + items[i].size + gap)
    }
    pos[j] = p
    done.push(j)
  }
  const min = Math.min(...pos)
  return pos.map(p => p - min)
}

/** Lay out fronts (cut size, centred on their finished wall rect) with `gap` between them. */
export function layoutBlock(fronts: { uid: string; rect: WallRect; w: number; h: number }[], gap: number): { members: GrainBlockMember[]; W: number; H: number } {
  const cut = fronts.map(f => ({ ...f, x: f.rect.x + (f.rect.w - f.w) / 2, y: f.rect.y + (f.rect.h - f.h) / 2 }))
  const xs = compactAxis(cut.map(c => ({ lo: c.x, size: c.w, olo: c.y, ohi: c.y + c.h })), gap)
  const ys = compactAxis(cut.map(c => ({ lo: c.y, size: c.h, olo: c.x, ohi: c.x + c.w })), gap)
  const members = cut.map((c, k) => ({ uid: c.uid, bx: xs[k], by: ys[k], w: c.w, h: c.h }))
  return {
    members,
    W: Math.max(...members.map(m => m.bx + m.w)),
    H: Math.max(...members.map(m => m.by + m.h)),
  }
}

// Does a w×h part (as the nester would orient it) fit an empty sheet?
function fitsSheet(part: Pick<NestPartInput, 'w' | 'h' | 'grainLock' | 'grainAcross'>, stock: SheetStock, gap: number, allowRot: boolean): boolean {
  const uW = stock.w - stock.trimLeft - stock.trimRight, uH = stock.h - stock.trimTop - stock.trimBottom
  const ok = (w: number, h: number) => w + gap <= uW + 1e-6 && h + gap <= uH + 1e-6
  const g = grainOrient({ ...part, grainAcross: part.grainAcross }, stock)
  if (g) return ok(g.w, g.h)
  return ok(part.w, part.h) || (allowRot && ok(part.h, part.w))
}

// Elevation order: left → right, then top → bottom.
const elevOrder = (a: { rect: WallRect }, b: { rect: WallRect }) =>
  (a.rect.x - b.rect.x) || ((b.rect.y + b.rect.h) - (a.rect.y + a.rect.h))

export interface BuildBlocksInput {
  instances: NestPartInput[]                       // the run, qty expanded
  partByUid: Map<string, OptiPart>                 // snapshot parts (baseUid → part)
  cabById: Map<string, OptiCabinet>
  /** Every front of each group in the snapshot (selected or not), for the partial-selection note. */
  groupFrontCount: Map<string, number>
  stockFor: (materialId: string | null, thickness: number) => SheetStock | undefined
  gapFor: (materialId: string | null) => number
  allowRotation: boolean
}

export interface BuildBlocksResult {
  parts: NestPartInput[]      // singles + block pseudo-parts, ready for nest()
  blocks: GrainBlock[]
  warnings: string[]
}

export function buildGrainBlocks(inp: BuildBlocksInput): BuildBlocksResult {
  type Front = { inst: NestPartInput; part: OptiPart; rect: WallRect; cabId: string }
  const byKey = new Map<string, Front[]>()
  const out: NestPartInput[] = []
  const warnings: string[] = []
  for (const inst of inp.instances) {
    const part = inp.partByUid.get(inst.baseUid)
    const gm = part ? inp.cabById.get(part.cabinet_instance_id)?.grain_match : undefined
    // Only the first cut of a front joins (extra cut qty nests on its own).
    if (!part || !gm || !part.wall_rect || !inst.uid.endsWith('#0')) { out.push(inst); continue }
    const key = `${gm.id}|${part.wall_key}|${materialGroupKey(inst.materialId, inst.thickness)}`
    const arr = byKey.get(key) ?? []
    arr.push({ inst, part, rect: part.wall_rect, cabId: part.cabinet_instance_id })
    byKey.set(key, arr)
  }

  const blocks: GrainBlock[] = []
  const keysByGroup = new Map<string, string[]>()
  for (const key of byKey.keys()) {
    const gid = key.split('|')[0]
    keysByGroup.set(gid, [...(keysByGroup.get(gid) ?? []), key])
  }
  for (const [gid, keys] of keysByGroup) {
    const sample = byKey.get(keys[0])![0]
    const gm = inp.cabById.get(sample.cabId)!.grain_match!
    const selected = keys.reduce((n, k) => n + byKey.get(k)!.length, 0)
    const total = inp.groupFrontCount.get(gid) ?? selected
    if (selected < total) warnings.push(`${gm.name}: ${selected} of ${total} fronts in this run — nesting those as the block.`)
    if (keys.length > 1) warnings.push(`${gm.name}: its fronts are on ${keys.length} boards / walls — one block each.`)
  }

  for (const [key, fronts] of byKey) {
    const first = fronts[0]
    const gm = inp.cabById.get(first.cabId)!.grain_match!
    if (fronts.length < 2) { out.push(first.inst); continue }
    const { materialId, thickness, grainLock } = first.inst
    const grainAcross = gm.direction === 'horizontal'
    const gap = inp.gapFor(materialId)
    const stock = inp.stockFor(materialId, thickness)
    const lay = (fs: Front[]) => layoutBlock(fs.map(f => ({ uid: f.inst.uid, rect: f.rect, w: f.inst.w, h: f.inst.h })), gap)
    const fits = (fs: Front[]) => {
      if (!stock) return true
      const b = lay(fs)
      return fitsSheet({ w: b.W, h: b.H, grainLock, grainAcross }, stock, gap, inp.allowRotation)
    }

    // Split at cabinet boundaries: cabinets in wall order, greedy (fewest pieces).
    const cabOrder = [...new Set([...fronts].sort(elevOrder).map(f => f.cabId))]
    const pieces: Front[][] = []
    let cur: Front[] = []
    for (const cid of cabOrder) {
      const mine = fronts.filter(f => f.cabId === cid)
      if (fits([...cur, ...mine])) { cur = [...cur, ...mine]; continue }
      if (cur.length) pieces.push(cur)
      if (fits(mine)) { cur = mine; continue }
      // One cabinet's own fronts don't fit a sheet together: they nest one by one.
      warnings.push(`${gm.name}: ${inp.partByUid.get(mine[0].inst.baseUid)?.cabinet_label ?? 'a cabinet'}'s fronts don't fit one sheet together — nested separately, not grain matched.`)
      out.push(...mine.map(f => f.inst))
      cur = []
    }
    if (cur.length) pieces.push(cur)
    if (pieces.length > 1) warnings.push(`${gm.name} split into ${pieces.length} blocks at cabinet boundaries — too big for one sheet as one block; the grain only runs on within each block.`)

    pieces.forEach((fs, k) => {
      if (fs.length < 2) { out.push(fs[0].inst); return }
      const b = lay(fs)
      const order = [...fs].sort(elevOrder).map(f => f.inst.uid)
      const uid = `gm:${key}:${k + 1}`
      blocks.push({
        uid, groupId: gm.id, name: gm.name, direction: gm.direction, piece: k + 1, pieces: pieces.length,
        W: b.W, H: b.H, members: order.map(u => b.members.find(m => m.uid === u)!),
      })
      out.push({
        uid, baseUid: uid, label: pieces.length > 1 ? `${gm.name} (${k + 1}/${pieces.length})` : gm.name,
        w: b.W, h: b.H, thickness, materialId, grainLock, grainAcross,
        // Blocks first (they need the most room), pieces in wall order.
        priority: 1e6 - k,
      })
    })
  }
  return { parts: out, blocks, warnings }
}

/** Member placement for a placed block (natural block frame → sheet; rotated = quarter turn CCW). */
export function memberPlacement(bp: Pick<Placement, 'x' | 'y' | 'rotated'>, block: Pick<GrainBlock, 'H'>, m: GrainBlockMember, def: Pick<NestPartInput, 'baseUid' | 'label'>): Placement {
  return bp.rotated
    ? { uid: m.uid, baseUid: def.baseUid, label: def.label, x: bp.x + block.H - m.by - m.h, y: bp.y + m.bx, w: m.h, h: m.w, rotated: true }
    : { uid: m.uid, baseUid: def.baseUid, label: def.label, x: bp.x + m.bx, y: bp.y + m.by, w: m.w, h: m.h, rotated: false }
}

/** Replace each placed block with its fronts; an unplaced block's fronts go to unplaced. */
export function expandGrainBlocks(res: NestResult, blocks: GrainBlock[], index: Record<string, NestPartInput>, warnings: string[] = []): NestResult {
  const byUid = new Map(blocks.map(b => [b.uid, b]))
  const info: GrainBlockInfo[] = []
  const sheets: NestedSheet[] = res.sheets.map(s => {
    const placements: Placement[] = []
    for (const pl of s.placements) {
      const b = byUid.get(pl.uid)
      if (!b) { placements.push(pl); continue }
      for (const m of b.members) placements.push(memberPlacement(pl, b, m, index[m.uid]))
      info.push({ uid: b.uid, groupId: b.groupId, name: b.name, direction: b.direction, piece: b.piece, pieces: b.pieces, memberUids: b.members.map(m => m.uid), W: b.W, H: b.H })
    }
    const next = { ...s, placements }
    return { ...next, efficiency: sheetEfficiency(next) }
  })
  const unplaced: NestPartInput[] = []
  for (const u of res.unplaced) {
    const b = byUid.get(u.uid)
    if (!b) { unplaced.push(u); continue }
    unplaced.push(...b.members.map(m => index[m.uid]))
    warnings.push(`${b.name}${b.pieces > 1 ? ` (${b.piece}/${b.pieces})` : ''} didn't fit any sheet — its fronts are unplaced.`)
  }
  return { ...res, sheets, unplaced, blocks: info, warnings: [...(res.warnings ?? []), ...warnings] }
}

// ── Stage 5 editing ─────────────────────────────────────────

/** The grain match block holding nest uid `uid`, if any. */
export function blockOfUid(res: NestResult | null, uid: string): GrainBlockInfo | undefined {
  return res?.blocks?.find(b => b.memberUids.includes(uid))
}

/** Bounding rect of a block's members on a sheet (null when none are on it). */
export function blockRectOn(sheet: NestedSheet, b: GrainBlockInfo): { x: number; y: number; w: number; h: number } | null {
  const pls = sheet.placements.filter(p => b.memberUids.includes(p.uid))
  if (!pls.length) return null
  const x0 = Math.min(...pls.map(p => p.x)), y0 = Math.min(...pls.map(p => p.y))
  return { x: x0, y: y0, w: Math.max(...pls.map(p => p.x + p.w)) - x0, h: Math.max(...pls.map(p => p.y + p.h)) - y0 }
}

/** Take `uid` out of its block (mutates `res`); a block left with one front stops being a block. */
export function detachFromBlock(res: NestResult, uid: string, label: string): string | null {
  const b = blockOfUid(res, uid)
  if (!b) return null
  b.memberUids = b.memberUids.filter(u => u !== uid)
  if (b.memberUids.length < 2) res.blocks = (res.blocks ?? []).filter(x => x !== b)
  const msg = `${b.name}: ${label} taken out of the block — it's no longer grain matched with the rest.`
  res.warnings = [...(res.warnings ?? []), msg]
  return msg
}
