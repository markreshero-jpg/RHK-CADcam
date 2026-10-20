// ============================================================
// Curved end settings (z_curved_end/CURVED-END-SPEC.md, C2).
//
// A non-null `curved_end` on a definition / instance marks it as a curved
// fixed-panel cabinet (BCRVFIXP / WCRVFIXP / TCRVFIXP). The cabinet's box is
// the kit's W / D / H (DX / DZ / DY); the board thicknesses come from the
// shop materials (face board = exposed / end panel board, decision 11;
// carcass = the cabinet's board). resolver/resolveCurvedEnd.ts builds the parts.
// The plan outline is a footprint from the internal `curved_end` /
// `curved_end_double` presets, rebuilt whenever the hand or radius changes.
// ============================================================

import { buildPresetFootprint } from '../cabinetShape/presets'
import type { Footprint, FootprintDims } from '../cabinetShape/footprint'
import { CURVED_END_DEFAULTS, type CurvedEndHand, type CurvedEndParams } from './geometry'

export type CurvedEndGrain = 'vertical' | 'horizontal'

export interface CurvedEndSettings {
  hand:    CurvedEndHand   // RH = curve on the right, LH = on the left, DOUBLE = both front corners
  R:       number          // outside radius
  SK:      number          // skin left across the curve (decision 10: default 2, warn < 2 / > 3)
  OG:      number          // gable overhang (single ends)
  OL:      number          // back overhang, left
  OR:      number          // back overhang, right
  SBK:     number          // back scribe
  SBT:     number          // bottom scribe
  STP:     number          // top scribe
  lighten: boolean         // rib cut-outs (cut in C4)
  B:       number          // rib cut-out border
  onion:   boolean
  OS:      number          // onion skin
  blkS:    boolean         // side fixing block
  blkF:    boolean         // front fixing block
  grain:   CurvedEndGrain  // face board grain (decision 8: vertical by default)
  ribs:    number | null   // ribs between top and bottom; null = auto (the kit's gap rule)
  kick:    boolean         // C5: carcass on a kick (TOEH up) with a curved kick board; base / tall only
}

export const DEFAULT_CURVED_END: CurvedEndSettings = {
  hand: 'RH', R: CURVED_END_DEFAULTS.R, SK: CURVED_END_DEFAULTS.SK,
  OG: 0, OL: 0, OR: 0, SBK: 0, SBT: 0, STP: 0,
  lighten: false, B: CURVED_END_DEFAULTS.B, onion: false, OS: CURVED_END_DEFAULTS.OS,
  blkS: false, blkF: false, grain: 'vertical', ribs: null, kick: false,
}

const num = (v: unknown, d: number, min = 0) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= min ? n : d
}

// Tolerates partial / legacy stored values.
export function normaliseCurvedEnd(s: Partial<CurvedEndSettings> | null | undefined): CurvedEndSettings | null {
  if (!s) return null
  const d = DEFAULT_CURVED_END
  return {
    hand:    s.hand === 'LH' || s.hand === 'DOUBLE' ? s.hand : 'RH',
    R:       num(s.R, d.R, 1),
    SK:      num(s.SK, d.SK),
    OG:      num(s.OG, 0), OL: num(s.OL, 0), OR: num(s.OR, 0),
    SBK:     num(s.SBK, 0), SBT: num(s.SBT, 0), STP: num(s.STP, 0),
    lighten: !!s.lighten,
    B:       num(s.B, d.B, 1),
    onion:   !!s.onion,
    OS:      num(s.OS, d.OS),
    blkS:    !!s.blkS, blkF: !!s.blkF,
    grain:   s.grain === 'horizontal' ? 'horizontal' : 'vertical',
    ribs:    s.ribs != null && Number.isFinite(Number(s.ribs)) && Number(s.ribs) >= 0 ? Math.round(Number(s.ribs)) : null,
    kick:    !!s.kick,
  }
}

/** Height the curved end sits up on its kick (C5): TOEH when `kick` is on
 *  (base / tall), else 0. The cabinet's DY includes it, like any kicked base. */
export function curvedEndKickH(s: Pick<CurvedEndSettings, 'kick'>, assemblyClass: string, TOEH: number): number {
  return s.kick && !assemblyClass.startsWith('wall') ? Math.max(0, TOEH) : 0
}

/** Engine inputs: settings + the cabinet box + the real board thicknesses.
 *  `kickH` (curvedEndKickH) comes off the height: the engine builds above the kick. */
export function curvedEndParams(
  s: CurvedEndSettings, box: { DX: number; DY: number; DZ: number }, faceThickness: number, carcassThickness: number,
  kickH = 0,
): CurvedEndParams {
  return {
    W: box.DX, D: box.DZ, H: box.DY - kickH, R: s.R, FT: faceThickness, SK: s.SK, T: carcassThickness, hand: s.hand,
    OL: s.OL, OR: s.OR, OG: s.OG, SBK: s.SBK, SBT: s.SBT, STP: s.STP,
    lighten: s.lighten, B: s.B, onion: s.onion, OS: s.OS, blkS: s.blkS, blkF: s.blkF, ribs: s.ribs,
  }
}

/** Plan outline for the cabinet (plan view, benchtop seeding, obstacles). */
export function curvedEndFootprint(s: Pick<CurvedEndSettings, 'hand' | 'R'>, dims: FootprintDims): Footprint | null {
  return s.hand === 'DOUBLE'
    ? buildPresetFootprint('curved_end_double', { radius: s.R }, dims)
    : buildPresetFootprint('curved_end', { radius: s.R, side: s.hand === 'LH' ? 'left' : 'right' }, dims)
}

export const HAND_OPTIONS: { value: CurvedEndHand; label: string; suffix: string }[] = [
  { value: 'RH',     label: 'Right', suffix: '/R' },
  { value: 'LH',     label: 'Left',  suffix: '/L' },
  { value: 'DOUBLE', label: 'Both',  suffix: '/2' },
]

/** Displayed code with the hand modifier (decision 3), e.g. BCRVFIXP/R. */
export function curvedEndCode(base: string, hand: CurvedEndHand): string {
  const suffix = HAND_OPTIONS.find(h => h.value === hand)?.suffix ?? ''
  return base.replace(/\/(L|R|2)$/, '') + suffix
}
