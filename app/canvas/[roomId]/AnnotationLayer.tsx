'use client'

// CAD annotations (z_CAD_tool/ANNOTATION-SPEC.md) — one renderer for the canvas and
// the printed reports. geom is frame mm (mapped by `frame`); every style size is paper
// mm × `paper` (svg units per paper mm), so text prints the same size at any scale.
// Gated per item through the display layers (show / ghost / opacity only).

import React from 'react'
import type { RoomAnnotation } from '@/src/lib/types'
import type { LayerView } from '@/src/lib/displayLayers/resolve'
import {
  type AnnotFrame, type Pt, type TextGeom, type LineGeom, type BoxGeom, type CloudGeom, type DimGeom,
  mapPt, mapRot, arrowHead, trimEnd, layoutText, leaderAttachLocal, rotatePt, cloudPath,
  dimLayout, readableAngle, dimText, annotLayerItem,
} from '@/src/lib/annotations/geometry'
import { resolveStyle, printStyle, dashPattern, type ResolvedStyle, type ArrowType } from '@/src/lib/annotations/style'

const FONT = 'Arial, Helvetica, sans-serif'
const CLOUD_BUMP = 6   // paper mm per scallop

export interface AnnotationLayerProps {
  annotations:   RoomAnnotation[]
  frame:         AnnotFrame
  /** svg units per paper mm (canvas: room annotation scale; report: its print scale). */
  paper:         number
  layers?:       LayerView
  /** Reports: "Print annotation colours" (decision 6). Canvas always shows colours. */
  printColours?: boolean
}

export default function AnnotationLayer({ annotations, frame, paper, layers, printColours = true }: AnnotationLayerProps) {
  if (!annotations.length) return null
  const sorted = [...annotations].sort((a, b) => a.sort_order - b.sort_order)
  return (
    <g data-layer="annotations" style={{ pointerEvents: 'none' }}>
      {sorted.map(a => {
        const item = annotLayerItem(a.kind)
        if (layers && !layers.show(item)) return null
        const s = printStyle(resolveStyle(a.kind, a.style), printColours)
        const opacity = layers ? layers.alpha(item) : 1
        return (
          <g key={a.id} opacity={opacity < 1 ? opacity : undefined}>
            {renderOne(a, s, frame, paper)}
          </g>
        )
      })}
    </g>
  )
}

function strokeProps(s: ResolvedStyle, k: number, weight = s.weight, dash = s.dash, color = s.color) {
  const pat = dashPattern(dash, weight)
  return {
    stroke: color,
    strokeWidth: weight * k,
    strokeDasharray: pat.length ? pat.map(v => v * k).join(' ') : undefined,
    strokeLinecap: (dash === 'dotted' ? 'round' : 'butt') as 'round' | 'butt',
    strokeLinejoin: 'round' as const,
    fill: 'none',
  }
}

function shapeFill(s: ResolvedStyle): { fill: string; fillOpacity?: number } {
  if (s.fill === 'solid') return { fill: s.fillColor }
  if (s.fill === 'tint')  return { fill: s.fillColor, fillOpacity: s.fillOpacity }
  return { fill: 'none' }
}

/** Polyline with optional heads at each end; closed heads trim the line under them. */
function Arrowed({ pts, s, k, start, end }: { pts: Pt[]; s: ResolvedStyle; k: number; start: ArrowType; end: ArrowType }) {
  if (pts.length < 2) return null
  const size = s.arrowSize * k
  const hs = arrowHead(pts[0], pts[1], start, size)
  const he = arrowHead(pts[pts.length - 1], pts[pts.length - 2], end, size)
  const line = [...pts]
  if (hs) line[0] = trimEnd(line[0], line[1], hs.trim)
  if (he) line[line.length - 1] = trimEnd(line[line.length - 1], line[line.length - 2], he.trim)
  const headProps = (h: { filled: boolean }) => ({
    fill: h.filled ? s.color : (s.bg === 'none' ? 'none' : '#ffffff'),
    stroke: s.color, strokeWidth: s.weight * k, strokeLinejoin: 'miter' as const,
  })
  return (
    <>
      <polyline points={line.map(p => `${p.x},${p.y}`).join(' ')} {...strokeProps(s, k)} />
      {hs && <path d={hs.d} {...headProps(hs)} />}
      {he && <path d={he.d} {...headProps(he)} />}
    </>
  )
}

function renderOne(a: RoomAnnotation, s: ResolvedStyle, f: AnnotFrame, k: number): React.ReactNode {
  switch (a.kind) {
    case 'text':    return <TextNote a={a} s={s} f={f} k={k} />
    case 'line': {
      const pts = ((a.geom as LineGeom).pts ?? []).map(p => mapPt(f, p))
      return <Arrowed pts={pts} s={s} k={k} start={s.arrowStart} end={s.arrowEnd} />
    }
    case 'rect':
    case 'ellipse': {
      const g = a.geom as BoxGeom
      const p = mapPt(f, g.a), q = mapPt(f, g.b)
      const cx = (p.x + q.x) / 2, cy = (p.y + q.y) / 2, w = Math.abs(q.x - p.x), h = Math.abs(q.y - p.y)
      const rot = mapRot(f, g.rot)
      const tf = rot ? `rotate(${rot} ${cx} ${cy})` : undefined
      const props = { ...strokeProps(s, k), ...shapeFill(s), transform: tf }
      return a.kind === 'rect'
        ? <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} {...props} />
        : <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} {...props} />
    }
    case 'cloud': {
      const pts = ((a.geom as CloudGeom).pts ?? []).map(p => mapPt(f, p))
      return <path d={cloudPath(pts, CLOUD_BUMP * k)} {...strokeProps(s, k)} {...shapeFill(s)} />
    }
    case 'dim':     return <ManualDim a={a} s={s} f={f} k={k} />
  }
}

function TextNote({ a, s, f, k }: { a: RoomAnnotation; s: ResolvedStyle; f: AnnotFrame; k: number }) {
  const g = a.geom as TextGeom
  if (!g?.at) return null
  // Layout in paper mm, then scale the whole block by k.
  const block = layoutText(a.text ?? '', s.size, { bold: s.bold, lineSpacing: s.lineSpacing, width: g.width })
  const at = mapPt(f, g.at)
  const rot = mapRot(f, g.rot)
  const pad = s.bg !== 'none' || s.border !== 'none' ? s.bgPad : 0
  const anchor = s.align === 'center' ? 'middle' : s.align === 'right' ? 'end' : 'start'
  const tx = s.align === 'center' ? block.w / 2 : s.align === 'right' ? block.w : 0

  // Leader: tip (arrowStart) → … → last point → nearer side of the block.
  let leader: React.ReactNode = null
  if (g.leader?.length) {
    const lp = g.leader.map(p => mapPt(f, p))
    const toLocal = (p: Pt) => rotatePt({ x: (p.x - at.x) / k, y: (p.y - at.y) / k }, -rot)
    const attachL = leaderAttachLocal(block, pad, toLocal(lp[lp.length - 1]))
    const r = rotatePt(attachL, rot)
    const attach = { x: at.x + r.x * k, y: at.y + r.y * k }
    leader = <Arrowed pts={[...lp, attach]} s={s} k={k} start={s.arrowStart} end="none" />
  }

  const bgFill = s.bg === 'mask' ? '#ffffff' : s.bg === 'solid' ? s.bgColor : null
  const boxW = block.w + 2 * pad, boxH = block.h + 2 * pad
  return (
    <>
      {leader}
      <g transform={`translate(${at.x} ${at.y})${rot ? ` rotate(${rot})` : ''} scale(${k})`}>
        {bgFill && <rect x={-pad} y={-pad} width={boxW} height={boxH} fill={bgFill}
          rx={s.border === 'round' ? s.size * 0.5 : undefined} />}
        {s.border !== 'none' && <rect x={-pad} y={-pad} width={boxW} height={boxH}
          rx={s.border === 'round' ? s.size * 0.5 : undefined}
          {...strokeProps(s, 1, s.borderWeight, s.borderDash, s.borderColor)} />}
        <text fontFamily={FONT} fontSize={s.size} fill={s.color} textAnchor={anchor}
          fontWeight={s.bold ? 700 : 400} fontStyle={s.italic ? 'italic' : undefined}
          textDecoration={s.underline ? 'underline' : undefined}>
          {block.lines.map((line, i) => (
            <tspan key={i} x={tx} y={block.baselines[i]}>{line || ' '}</tspan>
          ))}
        </text>
      </g>
    </>
  )
}

function ManualDim({ a, s, f, k }: { a: RoomAnnotation; s: ResolvedStyle; f: AnnotFrame; k: number }) {
  const g = a.geom as DimGeom
  if (!g?.p1 || !g?.p2) return null
  const l = dimLayout(g)
  const p1 = mapPt(f, g.p1), p2 = mapPt(f, g.p2), d1 = mapPt(f, l.d1), d2 = mapPt(f, l.d2)
  // Extension lines: a 1mm gap off the measured point, 1.5mm past the dim line (paper).
  const ext = (p: Pt, d: Pt) => {
    const v = { x: d.x - p.x, y: d.y - p.y }, L = Math.hypot(v.x, v.y)
    if (L < 1e-6) return null
    const u = { x: v.x / L, y: v.y / L }, gap = Math.min(1 * k, L), over = 1.5 * k
    return <line x1={p.x + u.x * gap} y1={p.y + u.y * gap} x2={d.x + u.x * over} y2={d.y + u.y * over}
      {...strokeProps(s, k, s.weight * 0.8, 'solid')} />
  }
  const mid = { x: (d1.x + d2.x) / 2, y: (d1.y + d2.y) / 2 }
  const ang = readableAngle(d1, d2)
  return (
    <>
      {ext(p1, d1)}
      {ext(p2, d2)}
      <Arrowed pts={[d1, d2]} s={{ ...s, dash: 'solid' }} k={k} start={s.arrowStart} end={s.arrowEnd} />
      <text transform={`translate(${mid.x} ${mid.y}) rotate(${ang})`} y={-0.8 * k}
        fontFamily={FONT} fontSize={s.size * k} fill={s.color} textAnchor="middle"
        fontWeight={s.bold ? 700 : 400}>
        {dimText(l.value, a.text)}
      </text>
    </>
  )
}
