// Floating cabinets (z_floating): wall-hung base units with no kick.
import type { CabinetInstance } from './types'

/** Default height off the floor for a floating cabinet (Mark, 2026-10-20). */
export const FLOAT_Z = 300

export function isFloating(cab: Pick<CabinetInstance, 'rule_overrides'>): boolean {
  return !!cab.rule_overrides?.FLOAT
}

/** Classes that can float — floor-standing base units. */
export function canFloat(cab: Pick<CabinetInstance, 'assembly_class'>): boolean {
  return cab.assembly_class === 'base' || cab.assembly_class === 'base_corner'
}

/** Cabinet patch to turn floating on or off. On: drop the kick (the carcass keeps
 *  its size, so dy loses the kick height) and hang it at FLOAT_Z. Off: the kick
 *  comes back under it on the floor. kickH is the cabinet's resolved TOEH. */
export function floatingPatch(
  cab: Pick<CabinetInstance, 'dy' | 'has_toekick' | 'rule_overrides'>,
  on: boolean,
  kickH: number,
): Partial<CabinetInstance> {
  const ro = { ...(cab.rule_overrides ?? {}) }
  if (on) {
    ro.FLOAT = true
    return {
      rule_overrides: ro,
      has_toekick: false,
      dy: cab.has_toekick ? Math.max(1, cab.dy - kickH) : cab.dy,
      pos_z: FLOAT_Z,
    }
  }
  delete ro.FLOAT
  delete ro.FLOAT_BOTTOM
  return {
    rule_overrides: ro,
    has_toekick: true,
    dy: cab.dy + kickH,
    pos_z: 0,
  }
}
