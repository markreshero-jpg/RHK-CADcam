// Custom-part orientation. A custom part stores intrinsic dims in the CV
// standard-part convention (same as every resolved part): LENGTH = dy (with
// the grain), WIDTH = dx (across the grain), THICKNESS = dz. Orientation
// decides how that flat panel sits in cabinet space (X = across, Y = up,
// Z = depth/front):
//   flat  — lies horizontal (shelf/top): length runs across X, thickness up.  [default]
//   side  — stands on its side (end panel/gable): length vertical, thickness along X.
//   front — stands facing front (filler/applied front): length vertical, thickness along Z.
// Cabinet origin = bottom-left-back; +Z toward the front.
// (2026-08-16: dy/dx semantics swapped for side/front to match the CV
// convention — DB rows migrated in the same change.)

export type CustomOrient = 'flat' | 'side' | 'front'

// Cabinet-space extents (ex = X/across, ey = Y/up, ez = Z/depth) for a part.
export function customExtents(orient: CustomOrient, dx: number, dy: number, dz: number) {
  switch (orient) {
    case 'side':  return { ex: dz, ey: dy, ez: dx } // thin sideways · length tall · width deep
    case 'front': return { ex: dx, ey: dy, ez: dz } // width across · length tall · thin front-to-back
    default:      return { ex: dy, ey: dz, ez: dx } // flat: length across · thin · width deep
  }
}

// Inverse of customExtents: which intrinsic field a box extent maps to. Used when
// editing a part's size from the 3D box (w = ex, h = ey, d = ez).
export function customFieldForExtent(orient: CustomOrient, ext: 'w' | 'h' | 'd'): 'dx' | 'dy' | 'dz' {
  if (orient === 'side')  return ext === 'w' ? 'dz' : ext === 'h' ? 'dy' : 'dx'
  if (orient === 'front') return ext === 'w' ? 'dx' : ext === 'h' ? 'dy' : 'dz'
  return ext === 'w' ? 'dy' : ext === 'h' ? 'dz' : 'dx' // flat
}

// Panel kind for face-colour / edge-strip geometry, derived from orientation.
export function customPanelKind(orient: CustomOrient): 'horizontal' | 'side' | 'face' {
  return orient === 'side' ? 'side' : orient === 'front' ? 'face' : 'horizontal'
}

export const CUSTOM_ORIENT_LABELS: Record<CustomOrient, string> = {
  flat:  'Flat (lies horizontal)',
  side:  'Side (vertical, e.g. end panel)',
  front: 'Front (vertical, e.g. filler)',
}
