'use client'

// Live measurements for the CAD tools (z_CAD_tool B2b) — screen-only, never printed.
// While drawing: the length + angle of the segment being placed, or W × H of a box being
// dragged out. A single selected line / cloud labels every side; a box / ellipse its
// width and height. Sizes in screen px (÷ zoom).

import type { RoomAnnotation } from '@/src/lib/types'
import {
  type AnnotFrame, type Pt, type LineGeom, type BoxGeom, type ArcGeom, type CircleGeom,
  mapPt, segAngle, segLength, arcMid, arcLength, arcPoint, sweepOf,
} from '@/src/lib/annotations/geometry'

export type LiveMeasure = { mode: 'seg' | 'box'; a: Pt; b: Pt } | { mode: 'label'; at: Pt; text: string } | null

const fmt = (n: number) => String(Math.round(n))

function Tag({ at, text, zoom, dx = 0, dy = 0 }: { at: Pt; text: string; zoom: number; dx?: number; dy?: number }) {
  const fs = 11 / zoom, padX = 4 / zoom, h = 16 / zoom
  const w = text.length * fs * 0.6 + padX * 2
  const x = at.x + dx / zoom, y = at.y + dy / zoom
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={3 / zoom} fill="#0f172a" fillOpacity={0.85} stroke="#facc15" strokeWidth={0.75 / zoom} />
      <text x={x} y={y + fs * 0.36} fontSize={fs} fill="#fde68a" textAnchor="middle" fontFamily="ui-monospace, Menlo, monospace">{text}</text>
    </g>
  )
}

export default function CadMeasureOverlay({ live, selected, frame, zoom }: {
  live:     LiveMeasure
  /** The single selected annotation (not while typing), else null. */
  selected: RoomAnnotation | null
  frame:    AnnotFrame
  zoom:     number
}) {
  const out: React.ReactNode[] = []

  if (live?.mode === 'label') {
    out.push(<Tag key="live" at={mapPt(frame, live.at)} zoom={zoom} dy={-22} text={live.text} />)
  } else if (live) {
    const b = mapPt(frame, live.b)
    if (live.mode === 'seg') {
      out.push(<Tag key="live" at={b} zoom={zoom} dx={0} dy={-22}
        text={`${fmt(segLength(live.a, live.b))} mm  ${segAngle(live.a, live.b).toFixed(1)}°`} />)
    } else {
      out.push(<Tag key="live" at={b} zoom={zoom} dx={0} dy={-22}
        text={`${fmt(Math.abs(live.b.x - live.a.x))} × ${fmt(Math.abs(live.b.y - live.a.y))}`} />)
    }
  }

  if (selected) {
    const sideTags = (pts: Pt[], closed: boolean) => {
      const n = pts.length
      for (let i = 0; i < (closed ? n : n - 1); i++) {
        const p = pts[i], q = pts[(i + 1) % n]
        const L = segLength(p, q)
        if (L < 1e-6) continue
        const m = mapPt(frame, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 })
        // Off to the side of the segment (its normal, flipped to point up / right on screen).
        const sp = mapPt(frame, p), sq = mapPt(frame, q), sl = Math.hypot(sq.x - sp.x, sq.y - sp.y) || 1
        let nx = -(sq.y - sp.y) / sl, ny = (sq.x - sp.x) / sl
        if (ny > 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny }
        const off = 12 + Math.abs(nx) * 14
        out.push(<Tag key={`s${i}`} at={m} zoom={zoom} dx={nx * off} dy={ny * off} text={fmt(L)} />)
      }
    }
    if (selected.kind === 'arc' && (selected.geom as ArcGeom)?.c) {
      const g = selected.geom as ArcGeom
      out.push(<Tag key="r" at={mapPt(frame, arcMid(g))} zoom={zoom} dy={-16} text={`R${fmt(g.r)} · ${fmt(sweepOf(g.a0, g.a1))}° · ${fmt(arcLength(g))}`} />)
    } else if (selected.kind === 'circle' && (selected.geom as CircleGeom)?.c) {
      const g = selected.geom as CircleGeom
      out.push(<Tag key="r" at={mapPt(frame, arcPoint(g, 0))} zoom={zoom} dx={52} text={`R${fmt(g.r)}  Ø${fmt(g.r * 2)}`} />)
    }
    if (selected.kind === 'line') sideTags((selected.geom as LineGeom).pts ?? [], false)
    else if (selected.kind === 'cloud') sideTags((selected.geom as LineGeom).pts ?? [], true)
    else if ((selected.kind === 'rect' || selected.kind === 'ellipse') && !(selected.geom as BoxGeom).rot) {
      const g = selected.geom as BoxGeom
      const minX = Math.min(g.a.x, g.b.x), maxX = Math.max(g.a.x, g.b.x)
      const minY = Math.min(g.a.y, g.b.y), maxY = Math.max(g.a.y, g.b.y)
      out.push(<Tag key="w" at={mapPt(frame, { x: (minX + maxX) / 2, y: minY })} zoom={zoom} dy={-14} text={`W ${fmt(maxX - minX)}`} />)
      out.push(<Tag key="h" at={mapPt(frame, { x: maxX, y: (minY + maxY) / 2 })} zoom={zoom} dx={34} text={`H ${fmt(maxY - minY)}`} />)
    }
  }

  return out.length ? <g data-layer="cad-measure">{out}</g> : null
}
