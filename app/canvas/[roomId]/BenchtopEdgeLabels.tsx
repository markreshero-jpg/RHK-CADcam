// Benchtop edge text along each edge of one top (plan canvas + plan prints):
// edge length just inside the edge (layer item benchtop_sizes), profile code just
// outside it (benchtop_edges, prints only — the canvas draws its own coloured codes),
// and the top's name at its centre (benchtop_sizes). Text reads along the edge,
// never upside down. Sizes are model mm; the caller scales them for zoom / 1:P.
'use client'
import type { BenchtopSegment } from '@/src/lib/types'
import { segMid, segLength, outwardNormal, outlineCentroid } from '@/src/lib/benchtopGeometry'

const FONT = 'Arial, Helvetica, sans-serif'

function upright(s: BenchtopSegment) {
  let a = Math.atan2(s.p1.y - s.p0.y, s.p1.x - s.p0.x) * 180 / Math.PI
  if (a > 90) a -= 180
  else if (a <= -90) a += 180
  return a
}

export default function BenchtopEdgeLabels({ segs, name, sizes, codes, fs, gap, fill, opacity }: {
  segs: BenchtopSegment[]
  /** Top name at the centre (with sizes). */
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
}) {
  const c = outlineCentroid(segs)
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
                {Math.round(len)}{s.type === 'line' ? '' : ' arc'}
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
        <text x={c.x} y={c.y} textAnchor="middle" dominantBaseline="middle" fontSize={fs * 1.25} fontWeight={700} fill={fill}>
          {name}
        </text>
      )}
    </g>
  )
}
