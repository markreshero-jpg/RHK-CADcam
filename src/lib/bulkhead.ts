// ============================================================
// Bulkhead settings (z_bulkhead/BULKHEAD-SPEC.md).
//
// A non-null `bulkhead` on a definition / instance marks it as a bulkhead: a
// wall-class cabinet that hangs from the ceiling over the overheads, built from
// a fascia plus optional left / right / bottom returns and an L fixing cleat
// (resolver/resolveBulkhead.ts generates the parts).
//
// `kind: 'shadowline'` is the light version: one flat strip of exposed board
// (its thickness high, `width` deep) lying on the overhead tops, flush with
// their carcase front, with optional flat left / right returns back to the wall
// (mitred to the strip by default, or butted behind it). It sits on the overheads rather than hanging
// from the ceiling; set the soffit to the board thickness so it meets the
// ceiling.
// ============================================================

import type { Wall, Room } from './types'
import { wallCabTop } from './geometry'

export type BulkheadKind = 'bulkhead' | 'shadowline'
export type BulkheadJoint = 'mitre' | 'butt'
/** `angle` (left / right ends only, degrees, 0 = square): the end meets a wall
 *  that isn't square to the run. The fascia end is cut to it, nothing behind
 *  the fascia runs past the wall line, and that end gets no return. + = the
 *  wall closes in behind the end (the back is shorter than the front). */
export interface BulkheadReturn { on: boolean; depth: number; joint: BulkheadJoint; angle?: number }
/** Shadowline split (B7): a flat rail of its own board under the bulkhead, its
 *  front edge `setback` behind the bulkhead face, `width` deep. The bulkhead
 *  builds above it, so a rail-thickness × setback recess shows. */
export interface BulkheadSplit { on: boolean; width: number; setback: number; material_id: string | null }

export interface BulkheadSettings {
  kind:   BulkheadKind
  width:  number                // shadowline strip width (front to back)
  front:  'doors' | 'carcase'   // front face flush with the overhead doors / carcase
  auto_h: boolean               // height follows ceiling − wall-cab top until typed
  cleat:  boolean
  left:   BulkheadReturn
  right:  BulkheadReturn
  bottom: BulkheadReturn
  split:  BulkheadSplit
}

export const BH_RETURN_DEPTH = 600
export const BH_MAX_END_ANGLE = 75
// Two 100 mm legs; a bulkhead lower than this has no room for one.
export const BH_CLEAT_LEG = 100
export const SL_WIDTH = 60
// Shadowline split rail (B7, Mark 2026-10-24): 60 wide, 10 MDF, a square 10 recess.
export const SPLIT_WIDTH = 60, SPLIT_SETBACK = 10
export const SPLIT_MATERIAL_NAME = 'MDF 10mm'
const NO_SPLIT: BulkheadSplit = { on: false, width: SPLIT_WIDTH, setback: SPLIT_SETBACK, material_id: null }

const ret = (on: boolean): BulkheadReturn => ({ on, depth: BH_RETURN_DEPTH, joint: 'mitre' })

export const DEFAULT_BULKHEAD: BulkheadSettings = {
  kind: 'bulkhead', width: SL_WIDTH,
  front: 'doors', auto_h: true, cleat: true,
  left: ret(false), right: ret(false), bottom: ret(false), split: NO_SPLIT,
}

// Shadowline: no ceiling fit, cleat or bottom return.
export const DEFAULT_SHADOWLINE: BulkheadSettings = {
  ...DEFAULT_BULKHEAD, kind: 'shadowline', front: 'carcase', auto_h: false, cleat: false,
}

export const isShadowline = (b: { kind?: unknown } | null | undefined): boolean => b?.kind === 'shadowline'

// Tolerates partial / legacy stored values.
export function normaliseBulkhead(b: Partial<BulkheadSettings> | null | undefined): BulkheadSettings | null {
  if (!b) return null
  const sl = b.kind === 'shadowline'
  const r = (x: Partial<BulkheadReturn> | undefined, d: BulkheadReturn): BulkheadReturn => ({
    on: x?.on ?? d.on,
    depth: x?.depth != null && x.depth > 0 ? x.depth : d.depth,
    joint: x?.joint === 'butt' ? 'butt' : 'mitre',
    ...(x?.angle != null && x.angle > 0 ? { angle: Math.min(x.angle, BH_MAX_END_ANGLE) } : {}),
  })
  return {
    kind:   sl ? 'shadowline' : 'bulkhead',
    width:  b.width != null && b.width > 0 ? b.width : SL_WIDTH,
    front:  b.front === 'carcase' ? 'carcase' : 'doors',
    auto_h: sl ? false : b.auto_h ?? DEFAULT_BULKHEAD.auto_h,
    cleat:  sl ? false : b.cleat ?? DEFAULT_BULKHEAD.cleat,
    left:   r(b.left, DEFAULT_BULKHEAD.left),
    right:  r(b.right, DEFAULT_BULKHEAD.right),
    bottom: r(b.bottom, DEFAULT_BULKHEAD.bottom),
    // A shadowline strip sits on the overheads itself — no split under it.
    split: sl || !b.split ? NO_SPLIT : {
      on:          !!b.split.on,
      width:       b.split.width > 0 ? b.split.width : SPLIT_WIDTH,
      setback:     b.split.setback >= 0 ? b.split.setback : SPLIT_SETBACK,
      material_id: b.split.material_id ?? null,
    },
  }
}

/** Ceiling height (mm from floor) a bulkhead hangs from. */
export function ceilingZ(wall: Wall | null | undefined, room: Room): number {
  return wall?.height ?? room.room_dy ?? 2400
}

/** Auto height: from the wall-cabinet top up to the ceiling (the soffit drop). */
export function bulkheadAutoHeight(wall: Wall | null | undefined, room: Room): number {
  return Math.round(ceilingZ(wall, room) - wallCabTop(wall, room))
}
