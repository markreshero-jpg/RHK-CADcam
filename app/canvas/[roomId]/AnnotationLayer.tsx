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
  type ArcGeom, type CircleGeom, arcSvgPath, arcPoint, arcStart, arcEnd, arcMid, arcSample, sweepOf,
  mapPt, mapRot, arrowHead, trimEnd, layoutText, leaderAttachLocal, rotatePt, cloudPath,
  dimLayout, readableAngle, dimText, annotLayerItem, boxCorners,
} from '@/src/lib/annotations/geometry'
import { resolveStyle, printStyle, dashPattern, type ResolvedStyle, type ArrowType } from '@/src/lib/annotations/style'

const FONT = 'Arial, Helvetica, sans-serif'

export interface AnnotationLayerProps {
  annotations:   RoomAnnotation[]
  frame:         AnnotFrame
  /** svg units per paper mm (canvas: room annotation scale; report: its print scale). */
  paper:         number
  layers?:       LayerView
  /** Reports: "Print annotation colours" (decision 6). Canvas always shows colours. */
  printColours?: boolean
  /** Canvas editing (A2): selection outlines, hit areas and grips. Reports omit it. */
  edit?: AnnotationEditProps
}

/** rotate / width: text grips. vN: drag vertex N of a line, cloud or leader. mN: drag
 *  the midpoint of segment N→N+1 to insert a vertex there. cN: box / ellipse corner N. */
export type AnnotGrip = 'rotate' | 'width' | 'size' | 'offset' | `v${number}` | `m${number}` | `c${number}`
  | 'arcS' | 'arcE' | 'arcM' | 'rad'

export interface AnnotationEditProps {
  selectedIds: ReadonlySet<string>
  /** Being typed in the inline editor — the editor draws it instead. */
  hiddenId?:   string | null
  /** Hit / grip size in svg units (≈ a fixed number of screen px). */
  hitWidth:    number
  /** Hit areas take clicks (CAD select tool, or plain select mode). */
  hittable:    boolean
  onDown:      (e: React.PointerEvent, id: string) => void
  onDouble:    (e: React.MouseEvent, id: string) => void
  onGrip:      (e: React.PointerEvent, id: string, grip: AnnotGrip) => void
}

const SEL = '#38bdf8'

export default function AnnotationLayer({ annotations, frame, paper, layers, printColours = true, edit }: AnnotationLayerProps) {
  if (!annotations.length) return null
  const sorted = [...annotations].sort((a, b) => a.sort_order - b.sort_order)
  return (
    <g data-layer="annotations" style={{ pointerEvents: 'none' }}>
      {sorted.map(a => {
        const item = annotLayerItem(a.kind)
        if (layers && !layers.show(item)) return null   // only what's shown is selectable
        const s = printStyle(resolveStyle(a.kind, a.style), printColours)
        const opacity = layers ? layers.alpha(item) : 1
        const hidden = edit?.hiddenId === a.id
        return (
          <g key={a.id}>
            {/* Being typed: the editor shows the text, but a leader stays drawn (B2 fix). */}
            <g opacity={opacity < 1 ? opacity : undefined}>{renderOne(a, s, frame, paper, hidden)}</g>
            {edit && !hidden && edit.hittable && (
              <g style={{ cursor: 'move' }}
                onPointerDown={e => { if (e.button === 0) edit.onDown(e, a.id) }}
                onDoubleClick={e => edit.onDouble(e, a.id)}>
                {hitShape(a, s, frame, paper, edit.hitWidth)}
              </g>
            )}
            {edit?.selectedIds.has(a.id) && selection(a, s, frame, paper, edit)}
          </g>
        )
      })}
    </g>
  )
}

/** Text block outline in svg (4 corners), padding included. */
function textOutline(a: RoomAnnotation, s: ResolvedStyle, f: AnnotFrame, k: number): Pt[] {
  const g = a.geom as TextGeom
  const block = layoutText(a.text ?? '', s.size, { bold: s.bold, lineSpacing: s.lineSpacing, width: g.width, height: g.height })
  const pad = s.bg !== 'none' || s.border !== 'none' ? s.bgPad : 0
  const at = mapPt(f, g.at), rot = mapRot(f, g.rot)
  return [{ x: -pad, y: -pad }, { x: block.w + pad, y: -pad }, { x: block.w + pad, y: block.h + pad }, { x: -pad, y: block.h + pad }]
    .map(c => { const r = rotatePt({ x: c.x * k, y: c.y * k }, rot); return { x: at.x + r.x, y: at.y + r.y } })
}

const ptsAttr = (pts: Pt[]) => pts.map(p => `${p.x},${p.y}`).join(' ')

/** Invisible click target: the text block, or the drawn strokes widened to hitWidth
 *  (plus the inside of filled shapes). */
function hitShape(a: RoomAnnotation, s: ResolvedStyle, f: AnnotFrame, k: number, hw: number): React.ReactNode {
  const stroke = { stroke: 'transparent', strokeWidth: hw, fill: 'none', pointerEvents: 'stroke' as const }
  const filled = s.fill !== 'none'
  switch (a.kind) {
    case 'text': {
      const g = a.geom as TextGeom
      if (!g?.at) return null
      return <>
        <polygon points={ptsAttr(textOutline(a, s, f, k))} fill="transparent" style={{ pointerEvents: 'all' }} />
        {g.leader?.length ? <polyline points={ptsAttr(g.leader.map(p => mapPt(f, p)))} {...stroke} /> : null}
      </>
    }
    case 'line':
      return <polyline points={ptsAttr(((a.geom as LineGeom).pts ?? []).map(p => mapPt(f, p)))} {...stroke} />
    case 'cloud': {
      const pts = ((a.geom as CloudGeom).pts ?? []).map(p => mapPt(f, p))
      return <polygon points={ptsAttr(pts)} {...stroke} fill={filled ? 'transparent' : 'none'}
        style={{ pointerEvents: filled ? 'all' : 'stroke' }} />
    }
    case 'rect':
    case 'ellipse': {
      const g = a.geom as BoxGeom
      const p = mapPt(f, g.a), q = mapPt(f, g.b)
      const cx = (p.x + q.x) / 2, cy = (p.y + q.y) / 2, w = Math.abs(q.x - p.x), h = Math.abs(q.y - p.y)
      const rot = mapRot(f, g.rot)
      const props = { ...stroke, fill: filled ? 'transparent' : 'none', style: { pointerEvents: filled ? 'all' as const : 'stroke' as const },
        transform: rot ? `rotate(${rot} ${cx} ${cy})` : undefined }
      return a.kind === 'rect'
        ? <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} {...props} />
        : <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} {...props} />
    }
    case 'arc': {
      const g = a.geom as ArcGeom
      return g?.c ? <path d={arcSvgPath(f, g)} {...stroke} /> : null
    }
    case 'circle': {
      const g = a.geom as CircleGeom
      if (!g?.c) return null
      const c = mapPt(f, g.c)
      return <circle cx={c.x} cy={c.y} r={g.r * f.s} {...stroke} fill={filled ? 'transparent' : 'none'}
        style={{ pointerEvents: filled ? 'all' : 'stroke' }} />
    }
    case 'dim': {
      const g = a.geom as DimGeom
      if (!g?.p1 || !g?.p2) return null
      const l = dimLayout(g)
      return <polyline points={ptsAttr([g.p1, l.d1, l.d2, g.p2].map(p => mapPt(f, p)))} {...stroke} />
    }
  }
}

/** Vertex grips (circles) + midpoint insert grips (small diamonds) along a polyline.
 *  closed: a cloud — the last point joins back to the first. */
function vertexGrips(id: string, pts: Pt[], edit: AnnotationEditProps, closed = false, mids = true): React.ReactNode {
  const hw = edit.hitWidth
  const down = (g: AnnotGrip) => (e: React.PointerEvent) => { if (e.button === 0) { e.stopPropagation(); edit.onGrip(e, id, g) } }
  return <>
    {mids && (closed ? pts : pts.slice(0, -1)).map((p, i) => {
      const q = pts[(i + 1) % pts.length], m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, r = hw * 0.32
      return <path key={`m${i}`} d={`M${m.x} ${m.y - r}L${m.x + r} ${m.y}L${m.x} ${m.y + r}L${m.x - r} ${m.y}Z`}
        fill={SEL} fillOpacity={0.5} style={{ pointerEvents: 'all', cursor: 'copy' }} onPointerDown={down(`m${i}`)} />
    })}
    {pts.map((p, i) => (
      <circle key={`v${i}`} cx={p.x} cy={p.y} r={hw * 0.4} fill="#0f172a" stroke={SEL} strokeWidth={hw / 6}
        style={{ pointerEvents: 'all', cursor: 'crosshair' }} onPointerDown={down(`v${i}`)} />
    ))}
  </>
}

/** Dashed outline round a selected annotation; text also gets rotate + (text box) width
 *  grips, lines and leaders get vertex grips. */
function selection(a: RoomAnnotation, s: ResolvedStyle, f: AnnotFrame, k: number, edit: AnnotationEditProps): React.ReactNode {
  const hw = edit.hitWidth
  const single = edit.selectedIds.size === 1
  const line = { stroke: SEL, strokeWidth: hw / 6, strokeDasharray: `${hw / 2} ${hw / 3}`, fill: 'none' }
  if (a.kind === 'text') {
    const g = a.geom as TextGeom
    if (!g?.at) return null
    const c = textOutline(a, s, f, k)
    // Rotate grip: above the top edge's middle. Width grip: middle of the right edge.
    const top = { x: (c[0].x + c[1].x) / 2, y: (c[0].y + c[1].y) / 2 }
    const ux = c[0].x - c[3].x, uy = c[0].y - c[3].y, ul = Math.hypot(ux, uy) || 1
    const rotG = { x: top.x + ux / ul * hw * 2.5, y: top.y + uy / ul * hw * 2.5 }
    const right = { x: (c[1].x + c[2].x) / 2, y: (c[1].y + c[2].y) / 2 }
    const grip = (p: Pt, kind: AnnotGrip, round: boolean) => (
      <g style={{ pointerEvents: 'all', cursor: kind === 'rotate' ? 'grab' : kind === 'size' ? 'nwse-resize' : 'ew-resize' }}
        onPointerDown={e => { if (e.button === 0) { e.stopPropagation(); edit.onGrip(e, a.id, kind) } }}>
        {round
          ? <circle cx={p.x} cy={p.y} r={hw * 0.45} fill="#0f172a" stroke={SEL} strokeWidth={hw / 6} />
          : <rect x={p.x - hw * 0.4} y={p.y - hw * 0.4} width={hw * 0.8} height={hw * 0.8} fill="#0f172a" stroke={SEL} strokeWidth={hw / 6} />}
      </g>
    )
    return <>
      <polygon points={ptsAttr(c)} {...line} />
      <line x1={top.x} y1={top.y} x2={rotG.x} y2={rotG.y} stroke={SEL} strokeWidth={hw / 6} />
      {grip(rotG, 'rotate', true)}
      {g.width != null && grip(right, 'width', false)}
      {g.width != null && grip(c[2], 'size', false)}
      {single && g.leader?.length ? vertexGrips(a.id, g.leader.map(p => mapPt(f, p)), edit) : null}
    </>
  }
  // Arc: both ends + the middle (drag = re-bend through it); a dot marks the centre.
  // Circle: one radius grip on the right.
  if ((a.kind === 'arc' || a.kind === 'circle') && single) {
    const grip = (p: Pt, g: AnnotGrip, cursor: string) => (
      <circle key={g} cx={p.x} cy={p.y} r={hw * 0.4} fill="#0f172a" stroke={SEL} strokeWidth={hw / 6}
        style={{ pointerEvents: 'all', cursor }}
        onPointerDown={e => { if (e.button === 0) { e.stopPropagation(); edit.onGrip(e, a.id, g) } }} />
    )
    if (a.kind === 'arc') {
      const g = a.geom as ArcGeom
      if (!g?.c) return null
      const c = mapPt(f, g.c)
      return <>
        <circle cx={c.x} cy={c.y} r={hw * 0.18} fill={SEL} />
        {grip(mapPt(f, arcStart(g)), 'arcS', 'crosshair')}
        {grip(mapPt(f, arcEnd(g)), 'arcE', 'crosshair')}
        {grip(mapPt(f, arcMid(g)), 'arcM', 'move')}
      </>
    }
    const g = a.geom as CircleGeom
    if (!g?.c) return null
    const c = mapPt(f, g.c)
    return <>
      <circle cx={c.x} cy={c.y} r={hw * 0.18} fill={SEL} />
      {grip(mapPt(f, arcPoint(g, 0)), 'rad', 'ew-resize')}
    </>
  }
  // Dim: its two measured points, and a bar grip on the dim line to slide it in / out.
  if (a.kind === 'dim' && single) {
    const g = a.geom as DimGeom
    if (!g?.p1 || !g?.p2) return null
    const l = dimLayout(g)
    const d1 = mapPt(f, l.d1), d2 = mapPt(f, l.d2), m = { x: (d1.x + d2.x) / 2, y: (d1.y + d2.y) / 2 }
    const ang = Math.atan2(d2.y - d1.y, d2.x - d1.x) * 180 / Math.PI
    return <>
      {vertexGrips(a.id, [mapPt(f, g.p1), mapPt(f, g.p2)], edit, false, false)}
      <rect x={m.x - hw * 0.7} y={m.y - hw * 0.25} width={hw * 1.4} height={hw * 0.5} rx={hw * 0.15}
        transform={`rotate(${ang} ${m.x} ${m.y})`} fill="#0f172a" stroke={SEL} strokeWidth={hw / 6}
        style={{ pointerEvents: 'all', cursor: 'move' }}
        onPointerDown={e => { if (e.button === 0) { e.stopPropagation(); edit.onGrip(e, a.id, 'offset') } }} />
    </>
  }
  if ((a.kind === 'line' || a.kind === 'cloud') && single) {
    const pts = ((a.geom as LineGeom).pts ?? []).map(p => mapPt(f, p))
    return vertexGrips(a.id, pts, edit, a.kind === 'cloud')
  }
  // Unrotated box / ellipse: a square grip on each corner of its frame. (Rotated ones
  // move and rotate only — resizing a turned box is left for later.)
  if ((a.kind === 'rect' || a.kind === 'ellipse') && single && !((a.geom as BoxGeom).rot)) {
    const c = boxCorners(a.geom as BoxGeom).map(p => mapPt(f, p))
    return <>
      <polygon points={ptsAttr(c)} {...line} />
      {c.map((p, i) => (
        <rect key={i} x={p.x - hw * 0.4} y={p.y - hw * 0.4} width={hw * 0.8} height={hw * 0.8}
          fill="#0f172a" stroke={SEL} strokeWidth={hw / 6} style={{ pointerEvents: 'all', cursor: 'nwse-resize' }}
          onPointerDown={e => { if (e.button === 0) { e.stopPropagation(); edit.onGrip(e, a.id, `c${i}`) } }} />
      ))}
    </>
  }
  const pts = selectionPoints(a, f)
  if (!pts.length) return null
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y), m = hw / 2
  return <rect x={Math.min(...xs) - m} y={Math.min(...ys) - m}
    width={Math.max(...xs) - Math.min(...xs) + 2 * m} height={Math.max(...ys) - Math.min(...ys) + 2 * m} {...line} />
}

function selectionPoints(a: RoomAnnotation, f: AnnotFrame): Pt[] {
  switch (a.kind) {
    case 'line':
    case 'cloud':   return ((a.geom as LineGeom).pts ?? []).map(p => mapPt(f, p))
    case 'rect':
    case 'ellipse': { const g = a.geom as BoxGeom; return [mapPt(f, g.a), mapPt(f, g.b)] }
    case 'dim':     { const g = a.geom as DimGeom; const l = dimLayout(g); return [g.p1, g.p2, l.d1, l.d2].map(p => mapPt(f, p)) }
    case 'arc':     return (a.geom as ArcGeom)?.c ? arcSample(a.geom as ArcGeom, 16).map(p => mapPt(f, p)) : []
    case 'circle':  { const g = a.geom as CircleGeom; return g?.c ? [mapPt(f, { x: g.c.x - g.r, y: g.c.y - g.r }), mapPt(f, { x: g.c.x + g.r, y: g.c.y + g.r })] : [] }
    default:        return []
  }
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

function renderOne(a: RoomAnnotation, s: ResolvedStyle, f: AnnotFrame, k: number, textHidden = false): React.ReactNode {
  if (textHidden && a.kind !== 'text') return null
  switch (a.kind) {
    case 'text':    return <TextNote a={a} s={s} f={f} k={k} leaderOnly={textHidden} />
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
      return <path d={cloudPath(pts, Math.max(1, s.cloudBump) * k)} {...strokeProps(s, k)} {...shapeFill(s)} />
    }
    case 'dim':     return <ManualDim a={a} s={s} f={f} k={k} />
    case 'arc': {
      const g = a.geom as ArcGeom
      if (!g?.c) return null
      return <ArcShape g={g} s={s} f={f} k={k} />
    }
    case 'circle': {
      const g = a.geom as CircleGeom
      if (!g?.c) return null
      const c = mapPt(f, g.c)
      return <circle cx={c.x} cy={c.y} r={g.r * f.s} {...strokeProps(s, k)} {...shapeFill(s)} />
    }
  }
}

/** Arc stroke + optional heads at its ends, pointing along the arc. */
function ArcShape({ g, s, f, k }: { g: ArcGeom; s: ResolvedStyle; f: AnnotFrame; k: number }) {
  const sw = sweepOf(g.a0, g.a1)
  const step = Math.min(sw * 0.1, 3)
  const size = s.arrowSize * k
  const hs = arrowHead(mapPt(f, arcStart(g)), mapPt(f, arcPoint(g, g.a0 + step)), s.arrowStart, size)
  const he = arrowHead(mapPt(f, arcEnd(g)), mapPt(f, arcPoint(g, g.a1 - step)), s.arrowEnd, size)
  const head = (h: { d: string; filled: boolean }) => (
    <path d={h.d} fill={h.filled ? s.color : 'none'} stroke={s.color} strokeWidth={s.weight * k} strokeLinejoin="miter" />
  )
  return <>
    <path d={arcSvgPath(f, g)} {...strokeProps(s, k)} />
    {hs && head(hs)}
    {he && head(he)}
  </>
}

function TextNote({ a, s, f, k, leaderOnly }: { a: RoomAnnotation; s: ResolvedStyle; f: AnnotFrame; k: number; leaderOnly?: boolean }) {
  const g = a.geom as TextGeom
  if (!g?.at) return null
  // Layout in paper mm, then scale the whole block by k.
  const block = layoutText(a.text ?? '', s.size, { bold: s.bold, lineSpacing: s.lineSpacing, width: g.width, height: g.height })
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
  if (leaderOnly) return leader
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
