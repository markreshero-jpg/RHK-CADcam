// Custom-part orientation. A custom part stores intrinsic dims (resolver/PartsView
// convention): width = dy, height = dx, thickness = dz. Orientation decides how
// that flat panel sits in cabinet space (X = width across, Y = up, Z = depth/front):
//   flat  — lies horizontal (shelf/top): thickness is vertical.        [default]
//   side  — stands on its side (end panel/gable): thickness runs along X.
//   front — stands facing front (filler/applied front): thickness along Z.
// Cabinet origin = bottom-left-back; +Z toward the front.

export type CustomOrient = 'flat' | 'side' | 'front'

// Cabinet-space extents (ex = X/width, ey = Y/height, ez = Z/depth) for a part.
export function customExtents(orient: CustomOrient, dx: number, dy: number, dz: number) {
  switch (orient) {
    case 'side':  return { ex: dz, ey: dx, ez: dy } // thin sideways · tall · full depth
    case 'front': return { ex: dy, ey: dx, ez: dz } // wide · tall · thin front-to-back
    default:      return { ex: dy, ey: dz, ez: dx } // flat: wide · thin · deep
  }
}

// Inverse of customExtents: which intrinsic field a box extent maps to. Used when
// editing a part's size from the 3D box (w = ex, h = ey, d = ez).
export function customFieldForExtent(orient: CustomOrient, ext: 'w' | 'h' | 'd'): 'dx' | 'dy' | 'dz' {
  if (orient === 'side')  return ext === 'w' ? 'dz' : ext === 'h' ? 'dx' : 'dy'
  if (orient === 'front') return ext === 'w' ? 'dy' : ext === 'h' ? 'dx' : 'dz'
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
