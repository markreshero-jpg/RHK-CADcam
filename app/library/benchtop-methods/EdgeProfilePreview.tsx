import type { BenchtopEdgeProfile } from '@/src/lib/types'

// Cross-section of a benchtop's front edge (looking along the edge), drawn from
// the profile's own fields so new profiles get a sensible picture without
// anyone authoring SVG. Shape is picked from generates → code → radius, in
// that order; a stored preview_svg overrides it entirely.

type Shape = 'square' | 'radius' | 'bullnose' | 'half_bullnose' | 'bevel'
  | 'shark_nose' | 'banded' | 'postform' | 'apron' | 'waterfall'

const CODE_SHAPE: Record<string, Shape> = {
  ARR: 'radius', BN: 'bullnose', HBN: 'half_bullnose', BEV: 'bevel',
  SQ: 'banded', RAD: 'radius', SN: 'shark_nose', PF: 'postform',
  SLE: 'banded', ABS: 'banded',
}

export function edgeProfileShape(p: Pick<BenchtopEdgeProfile, 'generates' | 'code' | 'radius_mm'>): Shape {
  if (p.generates === 'apron') return 'apron'
  if (p.generates === 'waterfall') return 'waterfall'
  const byCode = p.code ? CODE_SHAPE[p.code.toUpperCase()] : undefined
  if (byCode) return byCode
  return p.radius_mm && p.radius_mm > 0 ? 'radius' : 'square'
}

// Slab: x 10→110, y 30→54 (24 thick), front edge on the right at x=110.
function slabPath(shape: Shape): string {
  switch (shape) {
    case 'radius':        return 'M10 30 H104 Q110 30 110 36 V48 Q110 54 104 54 H10 Z'
    case 'bullnose':      return 'M10 30 H98 A12 12 0 0 1 98 54 H10 Z'
    case 'half_bullnose': return 'M10 30 H98 A12 12 0 0 1 110 42 V54 H10 Z'
    case 'bevel':         return 'M10 30 H100 L110 40 V54 H10 Z'
    case 'shark_nose':    return 'M10 30 H110 V36 L96 54 H10 Z'
    case 'apron':
    case 'waterfall':     return 'M10 30 H110 L86 54 H10 Z'   // mitre cut, leg drawn separately
    case 'postform':      return 'M10 30 H100 Q110 30 110 40 V58 H106 V42 Q106 34 100 34 H10 Z'
    default:              return 'M10 30 H110 V54 H10 Z'
  }
}

export default function EdgeProfilePreview({ profile, className }: {
  profile: Pick<BenchtopEdgeProfile, 'generates' | 'code' | 'radius_mm' | 'preview_svg'>
  className?: string
}) {
  if (profile.preview_svg) {
    return <div className={className} dangerouslySetInnerHTML={{ __html: profile.preview_svg }} />
  }
  const shape = edgeProfileShape(profile)
  return (
    <svg viewBox="0 0 130 100" className={className} role="img" aria-label="Edge profile cross-section">
      <path d={slabPath(shape)} fill="currentColor" fillOpacity={0.18} stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
      {shape === 'banded' && (
        <rect x={110} y={30} width={3} height={24} fill="currentColor" />
      )}
      {shape === 'apron' && (
        // Apron strip down the front edge, mitred to the slab
        <path d="M110 30 V80 H86 V54 Z" fill="currentColor" fillOpacity={0.18} stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
      )}
      {shape === 'waterfall' && (
        // Leg continues to the floor, mitred at the corner
        <path d="M110 30 V96 H86 V54 Z" fill="currentColor" fillOpacity={0.18} stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
      )}
      {/* Underside reference */}
      {shape !== 'waterfall' && <line x1={10} y1={92} x2={120} y2={92} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="4 3" />}
    </svg>
  )
}
