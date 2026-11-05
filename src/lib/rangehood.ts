// ============================================================
// Undermount rangehood settings (z_rangehood/RANGEHOOD-SPEC.md, R5).
//
// A non-null `rangehood` on a definition / instance makes it a `WRH`: the
// hole through the carcass bottom (and the WUP under it, R6), the flue notch
// in the first fixed shelf and the top, the first fixed shelf at `shelf_h`
// from the cabinet's underside, and the U-shaped flue box above the shelf
// (resolver/resolveRangehood.ts builds them all).
// ============================================================

import type { CabinetInstance } from './types'

export interface RangehoodSettings {
  // Rangehood hole through the bottom. w / d null = not set yet (the
  // appliance's cut-out size is still to come) — the cabinet warns, no hole.
  hole: { w: number | null; d: number | null; setback: number; offset: number; radius: number }
  // Flue path: notch in the shelf + top, from their back edge; the box sides
  // stand on its edges, the front piece across them. offset + = to the right.
  flue: { w: number; d: number; offset: number }
  shelf_h: number   // cabinet underside (incl. under panel) → first fixed shelf underside
  // Hood cover (RHK6592 WC-03): a carcass-board panel standing between the gables,
  // flush with their front edges, from the bottom of the inside up `h` — hides the
  // hood body behind the doors. D notches (w in from the gable × h tall, inner
  // corners r) at every hinge on a gable whose plate falls on it, so the hinges
  // clear when shut; they follow the hinges. null = none.
  cover: { h: number; notch_w: number; notch_h: number; notch_r: number } | null
  // Onion skin left in the under panel's rangehood hole (mm, 0 = cut through).
  panel_skin: number
}

export const DEFAULT_RANGEHOOD: RangehoodSettings = {
  hole: { w: null, d: null, setback: 50, offset: 0, radius: 0 },
  flue: { w: 200, d: 250, offset: 0 },
  shelf_h: 350,
  cover: null,
  panel_skin: 0,
}

export const DEFAULT_RANGEHOOD_COVER = { h: 260, notch_w: 40, notch_h: 80, notch_r: 15 }

export const isRangehood = (c: Pick<CabinetInstance, 'rangehood'> | null | undefined): boolean => !!c?.rangehood

const pos = (v: unknown, d: number) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d
const num = (v: unknown, d: number) => typeof v === 'number' && Number.isFinite(v) ? v : d
const size = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null

// Tolerates partial / legacy stored values.
export function normaliseRangehood(s: unknown): RangehoodSettings | null {
  if (!s || typeof s !== 'object') return null
  const o = s as Partial<{ hole: Record<string, unknown>; flue: Record<string, unknown>; shelf_h: unknown; cover: Record<string, unknown> | null; panel_skin: unknown }>
  const h = o.hole ?? {}, f = o.flue ?? {}, d = DEFAULT_RANGEHOOD
  return {
    hole: {
      w: size(h.w), d: size(h.d),
      setback: Math.max(0, num(h.setback, d.hole.setback)),
      offset:  num(h.offset, d.hole.offset),
      radius:  Math.max(0, num(h.radius, d.hole.radius)),
    },
    flue: { w: pos(f.w, d.flue.w), d: pos(f.d, d.flue.d), offset: num(f.offset, d.flue.offset) },
    shelf_h: pos(o.shelf_h, d.shelf_h),
    cover: o.cover && typeof o.cover === 'object' && size(o.cover.h) != null ? {
      h: size(o.cover.h)!,
      notch_w: pos(o.cover.notch_w, DEFAULT_RANGEHOOD_COVER.notch_w),
      notch_h: pos(o.cover.notch_h, DEFAULT_RANGEHOOD_COVER.notch_h),
      notch_r: Math.max(0, num(o.cover.notch_r, DEFAULT_RANGEHOOD_COVER.notch_r)),
    } : null,
    panel_skin: Math.max(0, num(o.panel_skin, d.panel_skin)),
  }
}

// Part names (the flue box parts' keys would humanize badly).
const RH_LABELS: Record<string, string> = {
  'rh:flue_l':     'Flue Box Left Side',
  'rh:flue_r':     'Flue Box Right Side',
  'rh:flue_front': 'Flue Box Front',
  'rh:cover':      'Rangehood Cover Panel',
}
export const rangehoodPartLabel = (k: string): string | undefined => RH_LABELS[k]

/** Construction-method default keys for the flue box joints (seeded with 5mm Dynamic Holes). */
export const RH_SEAMS = {
  shelf: 'rh_flue:shelf',   // shelf → each box piece's bottom edge
  top:   'rh_flue:top',     // top → each box piece's top edge
  front: 'rh_flue:front',   // front piece → each side's front edge
  rib:   'rh_flue:rib',     // curved end (C9): each box piece screwed into a rib it passes, one centred hole
} as const
