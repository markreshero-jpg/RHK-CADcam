// Cabinet-space boxes for drawer hardware — shared by the cabinet 3D view, the
// room 3D view and the plan view so every view places boxes + runners identically.
// Cabinet origin = bottom-left-back corner (+X right, +Y up, +Z front).
// { x,y,z = min corner, w/h/d = X/Y/Z extents }.

import type { ResolvedDrawerBoxPart, ResolvedDrawerSlide } from '@/src/lib/resolver/types'

export type HwBox = { x: number; y: number; z: number; w: number; h: number; d: number }

export function dbBox(p: ResolvedDrawerBoxPart): HwBox {
  // Resolver Z is the front face; subtract depth extent to get the minimum-Z (back) corner.
  switch (p.part_type) {
    case 'db_left_side':
    case 'db_right_side':
      return { x: p.X, y: p.Y, z: p.Z - p.DX, w: p.DZ, h: p.DY, d: p.DX }
    case 'db_bottom':
      return { x: p.X, y: p.Y, z: p.Z - p.DX, w: p.DY, h: p.DZ, d: p.DX }
    case 'db_front':
    case 'db_back':
    default:
      return { x: p.X, y: p.Y, z: p.Z - p.DZ, w: p.DY, h: p.DX, d: p.DZ }
  }
}

export function slideBox(s: ResolvedDrawerSlide): HwBox {
  // DX=depth (Z direction), DY=channel height (Y direction), DZ=runner thickness (X direction)
  return { x: s.X, y: s.Y, z: s.Z, w: s.DZ, h: s.DY, d: s.DX }
}
