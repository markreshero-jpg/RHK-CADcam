// ============================================================
// Rules Merger
// Merges construction rules from system → job → room → cabinet
// using nullish coalescing so explicit zeros are preserved.
// ============================================================

import { ConstructionRules, DEFAULT_RULES } from './types'

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

// Resolve the effective reveal for a given side,
// accounting for neighbour type
export function resolveReveal(
  side: 'left' | 'right',
  neighbourType: 'cabinet' | 'end_panel' | 'wall' | 'freestanding',
  rules: ConstructionRules,
  manualOverride?: number
): number {
  // Manual override always wins (cabinet-level explicit value)
  if (manualOverride !== undefined && manualOverride !== null) {
    return manualOverride
  }

  // Neighbour-aware resolution
  switch (neighbourType) {
    case 'cabinet':
      return side === 'left' ? rules.REVL : rules.REVR
    case 'end_panel':
    case 'wall':
    case 'freestanding':
    default:
      return side === 'left' ? rules.REVENDL : rules.REVENDR
  }
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
