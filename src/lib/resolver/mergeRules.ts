// ============================================================
// Rules Merger
// Merges construction rules from system → job → room → cabinet
// using nullish coalescing so explicit zeros are preserved.
// ============================================================

import { ConstructionRules, DEFAULT_RULES, CabinetInput } from './types'

// Each level provides a partial set of overrides.
// Later levels take priority over earlier ones.
// We use ?? (nullish coalescing) so that an explicit 0
// at cabinet level correctly overrides a non-zero at room level.

export function mergeRules(
  ...levels: Array<Partial<ConstructionRules> | null | undefined>
): ConstructionRules {
  // Start with shop defaults, then apply each level on top
  const result = { ...DEFAULT_RULES }

  for (const level of levels) {
    if (!level) continue
    for (const key of Object.keys(level) as Array<keyof ConstructionRules>) {
      const val = level[key]
      if (val !== null && val !== undefined) {
        // Type-safe assignment
        (result as any)[key] = val
      }
    }
  }

  return result
}

// Job / room rule_overrides can carry per-class values under BY_CLASS
// ({ base: {...}, wall: {...}, tall: {...} }) — e.g. face reveals that differ
// between base, wall and tall cabinets. Flattens one level for a class:
// the class values win over the flat (all-class) ones at the same level.
export type RuleClass = 'base' | 'wall' | 'tall'
export const RULE_CLASSES: RuleClass[] = ['base', 'wall', 'tall']

export function rulesForClass(
  ro: Record<string, unknown> | null | undefined,
  cls: RuleClass,
): Partial<ConstructionRules> {
  if (!ro) return {}
  const { BY_CLASS, ...flat } = ro as { BY_CLASS?: Partial<Record<RuleClass, Partial<ConstructionRules>>> }
  return { ...(flat as Partial<ConstructionRules>), ...(BY_CLASS?.[cls] ?? {}) }
}

// Resolve the effective reveal for a given side,
// accounting for neighbour type
export function resolveReveal(
  side: 'left' | 'right',
  neighbourType: 'cabinet' | 'end_panel' | 'wall' | 'freestanding',
  rules: ConstructionRules,
  manualOverride?: number
): number {
  // Manual override always wins (cabinet-level explicit value): the argument,
  // else the cabinet's own side reveal (REVSL / REVSR).
  const manual = manualOverride ?? (side === 'left' ? rules.REVSL : rules.REVSR)
  if (manual !== undefined && manual !== null) {
    return manual
  }

  // Neighbour-aware resolution — a locked neighbour (NBRL / NBRR) beats the detected one.
  switch ((side === 'left' ? rules.NBRL : rules.NBRR) ?? neighbourType) {
    case 'cabinet':
      return side === 'left' ? rules.REVL : rules.REVR
    case 'end_panel':
    case 'wall':
    case 'freestanding':
    default:
      return side === 'left' ? rules.REVENDL : rules.REVENDR
  }
}

export type InsetSide = 'left' | 'right' | 'top' | 'bottom'
export type InsetReveals = Record<InsetSide, number>

/**
 * Inset fronts (D-INS): the reveal at each carcass edge that puts a front inside
 * the opening — the panel it meets (gable incl. its scribe, bottom above SCRBT,
 * top / on-edge front rail below SCRT) + INSGAP clearance. The kick is not in
 * here: resolveFace adds TK under every face anyway.
 */
export function insetReveals(
  cab: Pick<CabinetInput, 'material' | 'left_side_material' | 'right_side_material' | 'top_type' | 'bottom_type'>,
  r: ConstructionRules,
): InsetReveals {
  const t = cab.material.DZ
  const g = r.INSGAP ?? 2
  const bottomType = cab.bottom_type ?? r.BOTTOM_TYPE ?? 'full'
  const topType = cab.top_type ?? r.TOP_TYPE
  // Front rail on edge = RD tall at the top front; a full top or flat rail = its thickness.
  const topT = topType === 'none' ? 0
    : topType !== 'full_top' && r.RAIL_ORIENT === 'vertical' ? r.RD : t
  return {
    left:   (r.SCRL ?? 0) + (cab.left_side_material  ?? cab.material).DZ + g,
    right:  (r.SCRR ?? 0) + (cab.right_side_material ?? cab.material).DZ + g,
    bottom: (r.SCRBT ?? 0) + (bottomType === 'none' ? 0 : t) + g,
    top:    (r.SCRT ?? 0) + topT + g,
  }
}

/** The cabinet's own rule layer: cab.cabinet_rules, else (an older cached input) the
 *  keys where the merged rules differ from the cascade below the cabinet. */
export function cabinetRuleLayer(cab: Pick<CabinetInput, 'cabinet_rules' | 'rules' | 'rules_base'>): Partial<ConstructionRules> {
  if (cab.cabinet_rules) return cab.cabinet_rules
  if (!cab.rules_base) return {}
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(cab.rules) as (keyof ConstructionRules)[]) {
    if (cab.rules[k] !== cab.rules_base[k]) out[k] = cab.rules[k]
  }
  return out as Partial<ConstructionRules>
}

// Resolve face Z position based on inset/overlay mode
// and optional per-zone override
export function resolveFaceZ(
  cabinetDZ: number,
  faceMaterialDZ: number,
  rules: ConstructionRules,
  zoneInsOverride?: number,
  zoneBufOverride?: number
): number {
  const ins = zoneInsOverride ?? rules.FACINS
  const buf = zoneBufOverride ?? rules.FACBUF

  if (ins > 0) {
    // Inset mode: door sits inside the opening
    return cabinetDZ - ins - faceMaterialDZ
  } else {
    // Overlay mode: door back face protrudes by FACBUF
    return cabinetDZ + buf
  }
}
