// ============================================================
// Bulkhead settings (z_bulkhead/BULKHEAD-SPEC.md).
//
// A non-null `bulkhead` on a definition / instance marks it as a bulkhead: a
// wall-class cabinet that hangs from the ceiling over the overheads, built from
// a fascia plus optional left / right / bottom returns and an L fixing cleat
// (resolver/resolveBulkhead.ts generates the parts).
// ============================================================

import type { Wall, Room } from './types'
import { wallCabTop } from './geometry'

export type BulkheadJoint = 'mitre' | 'butt'
export interface BulkheadReturn { on: boolean; depth: number; joint: BulkheadJoint }

export interface BulkheadSettings {
  front:  'doors' | 'carcase'   // front face flush with the overhead doors / carcase
  auto_h: boolean               // height follows ceiling − wall-cab top until typed
  cleat:  boolean
  left:   BulkheadReturn
  right:  BulkheadReturn
  bottom: BulkheadReturn
}

export const BH_RETURN_DEPTH = 600
// Two 100 mm legs; a bulkhead lower than this has no room for one.
export const BH_CLEAT_LEG = 100

const ret = (on: boolean): BulkheadReturn => ({ on, depth: BH_RETURN_DEPTH, joint: 'mitre' })

export const DEFAULT_BULKHEAD: BulkheadSettings = {
  front: 'doors', auto_h: true, cleat: true,
  left: ret(false), right: ret(false), bottom: ret(false),
}

// Tolerates partial / legacy stored values.
export function normaliseBulkhead(b: Partial<BulkheadSettings> | null | undefined): BulkheadSettings | null {
  if (!b) return null
  const r = (x: Partial<BulkheadReturn> | undefined, d: BulkheadReturn): BulkheadReturn => ({
    on: x?.on ?? d.on,
    depth: x?.depth != null && x.depth > 0 ? x.depth : d.depth,
    joint: x?.joint === 'butt' ? 'butt' : 'mitre',
  })
  return {
    front:  b.front === 'carcase' ? 'carcase' : 'doors',
    auto_h: b.auto_h ?? DEFAULT_BULKHEAD.auto_h,
    cleat:  b.cleat ?? DEFAULT_BULKHEAD.cleat,
    left:   r(b.left, DEFAULT_BULKHEAD.left),
    right:  r(b.right, DEFAULT_BULKHEAD.right),
    bottom: r(b.bottom, DEFAULT_BULKHEAD.bottom),
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
