// Benchtop edge text along each edge of one top (plan canvas + plan prints):
// edge length just inside the edge (layer item benchtop_sizes), profile code just
// outside it (benchtop_edges, prints only — the canvas draws its own coloured codes),
// and the top's name with its overall length × depth under it (benchtop_sizes) — at
// the centre, or slid along the top to clear `avoid` boxes (sinks, taps and their
// labels on prints). Text reads along the edge, never upside down. Sizes are model
// mm; the caller scales them for zoom / 1:P.
'use client'
import { roundMm } from '@/src/lib/format'
import type { BenchtopSegment } from '@/src/lib/types'
import { segMid, segLength, outwardNormal, outlineCentroid, overallSize, longAxis, outlinePoints } from '@/src/lib/benchtopGeometry'
import { pointInPolygon } from '@/src/lib/fixtureGeometry'

const FONT = 'Arial, Helvetica, sans-serif'

export interface Box { minX: number; minY: number; maxX: number; maxY: number }
type Pt = { x: number; y: number }

/** Where the name block (w wide, dy0…dy1 about its anchor) goes: the centre, or the nearest
 *  spot along the top's length that is inside the top and clear of every box. */
function nameSpot(segs: BenchtopSegment[], c: Pt, w: number, dy0: number, dy1: number, avoid: Box[], pad: number): Pt {
  if (!avoid.length) return c
  const ring = outlinePoints(segs, 8), u = longAxis(segs), half = overallSize(segs).length / 2
  const fits = (p: Pt) => {
    const b = { minX: p.x - w / 2 - pad, maxX: p.x + w / 2 + pad, minY: p.y + dy0 - pad, maxY: p.y + dy1 + pad }
    const corners = [{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY }]
    return corners.every(q => pointInPolygon(ring, q))
      && !avoid.some(a => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY)
  }
  const step = Math.max(pad, half / 24)
  for (let t = 0; t <= half; t += step) {
    for (const p of t ? [{ x: c.x - u.x * t, y: c.y - u.y * t }, { x: c.x + u.x * t, y: c.y + u.y * t }] : [c]) if (fits(p)) return p
  }
  return c
}

function upright(s: BenchtopSegment) {
  let a = Math.atan2(s.p1.y - s.p0.y, s.p1.x - s.p0.x) * 180 / Math.PI
  if (a > 90) a -= 180
  else if (a <= -90) a += 180
  return a
}

export default function BenchtopEdgeLabels({ segs, name, sizes, codes, fs, gap, fill, opacity, avoid }: {
  segs: BenchtopSegment[]
  /** Top name at the centre, overall size under it (with sizes). */
  name?: string | null
  /** Edge lengths inside each edge. */
  sizes: boolean
  /** Profile code per edge index (outside the edge); null = none. */
  codes?: (i: number) => string | null
  fs: number
  /** Distance from the edge to the text centre line. */
  gap: number
  fill: string
  opacity?: number
  /** Plan boxes the name + size keep clear of (fixtures and their labels). */
  avoid?: Box[]
}) {
  const size = overallSize(segs)
  const sizeText = `${roundMm(size.length)} × ${roundMm(size.depth)}`
  // A shallow top has no room for a second line: the size goes after the name.
  const inline = size.depth < fs * 10
  // Name block width (Arial ≈ 0.55 em a character) and its extent above / below the name line.
  const nameW = (name ?? '').length * fs * 1.25 * 0.55, sizeW = sizeText.length * fs * 0.55
  const c = sizes && name
    ? nameSpot(segs, outlineCentroid(segs), inline ? nameW + fs * 0.6 + sizeW : Math.max(nameW, sizeW),
      -fs * 0.7, inline ? fs * 0.7 : fs * 2.2, avoid ?? [], fs * 0.4)
    : outlineCentroid(segs)
  return (
    <g opacity={opacity} fontFamily={FONT} style={{ pointerEvents: 'none', userSelect: 'none' }}>
      {segs.map((s, i) => {
        const len = segLength(s)
        if (len < fs * 2) return null
        const m = segMid(s), n = outwardNormal(segs, i), a = upright(s)
        const code = codes?.(i)
        const at = (d: number) => ({ x: m.x + n.x * d, y: m.y + n.y * d })
        const pin = at(-gap), pout = at(gap)
        return (
          <g key={i}>
            {sizes && (
              <text x={pin.x} y={pin.y} transform={`rotate(${a} ${pin.x} ${pin.y})`}
                textAnchor="middle" dominantBaseline="middle" fontSize={fs} fill={fill}>
                {roundMm(len)}{s.type === 'line' ? '' : ' arc'}
              </text>
            )}
            {code && (
              <text x={pout.x} y={pout.y} transform={`rotate(${a} ${pout.x} ${pout.y})`}
                textAnchor="middle" dominantBaseline="middle" fontSize={fs} fontWeight={700} fill={fill}>
                {code}
              </text>
            )}
          </g>
        )
      })}
      {sizes && name && (
        inline ? (
          <text x={c.x} y={c.y} textAnchor="middle" dominantBaseline="middle" fontSize={fs * 1.25} fontWeight={700} fill={fill}>
            {name}<tspan dx={fs * 0.6} fontSize={fs} fontWeight={400}>{sizeText}</tspan>
          </text>
        ) : (
          <>
            <text x={c.x} y={c.y} textAnchor="middle" dominantBaseline="middle" fontSize={fs * 1.25} fontWeight={700} fill={fill}>
              {name}
            </text>
            <text x={c.x} y={c.y + fs * 1.6} textAnchor="middle" dominantBaseline="middle" fontSize={fs} fill={fill}>
              {sizeText}
            </text>
          </>
        )
      )}
    </g>
  )
}
