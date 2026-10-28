// ============================================================
// Floating shelf settings (z_floating_shelf/FLOATING-SHELF-SPEC.md).
//
// A non-null `float_shelf` on a definition / instance marks it as a floating
// shelf (`FLSHLF`): a wall-class item that sits at its own height (pos_z = its
// underside), built from 2 or 3 layers of exposed board glued up and edged
// after, with a hidden cleat in a pocket along the back and unseen sides
// (resolver/resolveFloatShelf.ts generates the parts).
// ============================================================

import type { CabinetInstance } from './types'

export type FloatShelfBuild = 'double' | 'triple_buildup' | 'triple_solid'

export interface FloatShelfSettings {
  build:         FloatShelfBuild
  seen_left:     boolean
  seen_right:    boolean
  rebate_depth:  number          // slot depth in from the back / an unseen side
  rebate_h:      number          // per board (double build) — the slot is twice this
  stop:          number          // slot stops this far short of a seen edge
  strip_w:       number          // triple build-up middle-layer strips
  strip_spacing: number          // cross strips, max centres
  cleat:         boolean
  tape_id:       string | null   // wide tape for the glued blank; null = exposed edgeband
  radius_l:      number          // front-left corner radius (0 = square)
  radius_r:      number          // front-right corner radius
}

export const FS_BUILDS: { value: FloatShelfBuild; label: string; layers: number }[] = [
  { value: 'double',         label: 'Double (2 boards)',      layers: 2 },
  { value: 'triple_buildup', label: 'Triple — build-up strips', layers: 3 },
  { value: 'triple_solid',   label: 'Triple — solid',         layers: 3 },
]

export const DEFAULT_FLOAT_SHELF: FloatShelfSettings = {
  build: 'double', seen_left: false, seen_right: false,
  rebate_depth: 30, rebate_h: 10, stop: 30,
  strip_w: 90, strip_spacing: 600,
  cleat: true, tape_id: null,
  radius_l: 0, radius_r: 0,
}

// Every board of the shelf carries this comment (prints on the CNC labels).
export const FS_BOARD_NOTE = 'build up then edge'
export const FS_CLEAT_NOTE = 'hand cut timber / MDF strip — not on the CNC'

export const fsLayers = (b: FloatShelfBuild): number => b === 'double' ? 2 : 3

export const isFloatShelf = (c: Pick<CabinetInstance, 'float_shelf'> | null | undefined): boolean => !!c?.float_shelf

const pos = (v: unknown, d: number) => typeof v === 'number' && v > 0 ? v : d

// Tolerates partial / legacy stored values.
export function normaliseFloatShelf(s: Partial<FloatShelfSettings> | null | undefined): FloatShelfSettings | null {
  if (!s) return null
  const d = DEFAULT_FLOAT_SHELF
  return {
    build: s.build === 'triple_buildup' || s.build === 'triple_solid' ? s.build : 'double',
    seen_left: !!s.seen_left,
    seen_right: !!s.seen_right,
    rebate_depth: pos(s.rebate_depth, d.rebate_depth),
    rebate_h: pos(s.rebate_h, d.rebate_h),
    stop: typeof s.stop === 'number' && s.stop >= 0 ? s.stop : d.stop,
    strip_w: pos(s.strip_w, d.strip_w),
    strip_spacing: pos(s.strip_spacing, d.strip_spacing),
    cleat: s.cleat ?? d.cleat,
    tape_id: typeof s.tape_id === 'string' && s.tape_id ? s.tape_id : null,
    radius_l: typeof s.radius_l === 'number' && s.radius_l > 0 ? s.radius_l : 0,
    radius_r: typeof s.radius_r === 'number' && s.radius_r > 0 ? s.radius_r : 0,
  }
}

/** The front-corner radii, capped so they fit the shelf (each ≤ D, together ≤ W). */
export function fsCornerRadii(s: Pick<FloatShelfSettings, 'radius_l' | 'radius_r'> | null | undefined, W: number, D: number): [number, number] {
  let l = Math.min(Math.max(0, s?.radius_l ?? 0), D), r = Math.min(Math.max(0, s?.radius_r ?? 0), D)
  if (l + r > W && l + r > 0) { const k = W / (l + r); l *= k; r *= k }
  return [l, r]
}

/** A full board with rounded front corners, in the horizontal shape frame (x
 *  along the width, y back from the front edge): front → right → back → left,
 *  each round a 90° bulge (tan 22.5°). null when both corners are square. */
export function fsRoundedBoard(W: number, D: number, rl: number, rr: number): { x: number; y: number; b?: number }[] | null {
  if (rl <= 0 && rr <= 0) return null
  const B = Math.SQRT2 - 1
  const pts: { x: number; y: number; b?: number }[] = []
  pts.push(rr > 0 ? { x: W - rr, y: 0, b: B } : { x: W, y: 0 })
  if (rr > 0 && rr < D) pts.push({ x: W, y: rr })
  pts.push({ x: W, y: D }, { x: 0, y: D })
  if (rl > 0 && rl < D) pts.push({ x: 0, y: rl, b: B })
  else if (rl > 0) pts[pts.length - 1].b = B
  pts.push({ x: rl, y: 0 })
  return pts
}

const FS_LABELS: Record<string, string> = {
  'fs:top': 'Floating Shelf Top', 'fs:bot': 'Floating Shelf Bottom', 'fs:mid': 'Floating Shelf Middle',
  'fs:rail_f': 'Floating Shelf Front Rail', 'fs:rail_b': 'Floating Shelf Back Rail',
  'fs:strip_l': 'Floating Shelf Left Strip', 'fs:strip_r': 'Floating Shelf Right Strip',
  'fs:cleat_b': 'Floating Shelf Back Cleat', 'fs:cleat_l': 'Floating Shelf Left Cleat', 'fs:cleat_r': 'Floating Shelf Right Cleat',
}

/** Display name of a floating shelf part key, or null for anything else. */
export function floatShelfPartLabel(k: string): string | null {
  if (!k.startsWith('fs:')) return null
  const m = /^fs:cross_(\d+)$/.exec(k)
  return m ? `Floating Shelf Cross Strip ${m[1]}` : FS_LABELS[k] ?? null
}

/** Default part comment: boards are glued up and edged after; cleats are hand cut. */
export function floatShelfPartNote(k: string): string | null {
  if (!k.startsWith('fs:')) return null
  return k.startsWith('fs:cleat_') ? FS_CLEAT_NOTE : FS_BOARD_NOTE
}

/** Built thickness of a resolved floating shelf (top of its top board), 0 if none. */
export function floatShelfThickness(rp: { case_parts: { part_key: string; Y: number; DZ: number }[] } | null | undefined): number {
  const top = rp?.case_parts.find(p => p.part_key === 'fs:top')
  return top ? Math.round((top.Y + top.DZ) * 10) / 10 : 0
}

/**
 * Elevation height chain (z_floating_shelf): stack the floating shelves whose
 * underside is at or above the chain's cursor — a gap segment up to each shelf,
 * then its thickness. `spans` = [bottomZ, topZ] from the floor; Y runs down
 * from the ceiling (Y = roomH − z). Only shelves between `minZ` and `maxZ`
 * (their tops) are taken, so the caller can stack those under the overheads
 * before them and the rest after. Returns the new cursor Y.
 */
export function stackShelfSegs(
  segs: { fromY: number; toY: number; label: string }[], cursorY: number, roomH: number,
  spans: [number, number][], maxZ = Infinity, label: (mm: number) => string = mm => `${Math.round(mm * 10) / 10}`,
): number {
  for (const [b, t] of [...spans].sort((x, y) => x[0] - y[0])) {
    if (t > maxZ + 0.5) continue
    const bY = roomH - b, tY = roomH - t
    if (bY > cursorY + 0.5) continue          // below the cursor (overlaps what's already chained)
    if (bY < cursorY - 0.5) segs.push({ fromY: bY, toY: cursorY, label: label(cursorY - bY) })
    segs.push({ fromY: tY, toY: bY, label: label(t - b) })
    cursorY = tY
  }
  return cursorY
}

/** Wide tape run on the glued blank (mm): the front plus each seen side. */
export function fsTapeLength(s: FloatShelfSettings, W: number, D: number): number {
  return Math.round(W + (s.seen_left ? D : 0) + (s.seen_right ? D : 0))
}
