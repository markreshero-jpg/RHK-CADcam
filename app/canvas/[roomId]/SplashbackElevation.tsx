'use client'

// ============================================================
// Splashbacks on a wall elevation (z_splashback S2).
// Outline in the elevation frame (x as seen, y = height up);
// svg y = roomH − height. Wall openings cut it live (L2).
// Fill pattern per material: stone hatch, glass diagonals,
// tile grid, board plain. Gated by layer item 'splashbacks'.
//
// Select mode: click picks; a selected piece drags to move,
// and a rectangle shows edge handles (drag to stretch).
// Draw mode (mode 'draw_splashback'): drag a rectangle, or
// click over a benchtop for the default size (L3: bench top
// up to the lowest of overheads / rangehood / bulkhead / ceiling).
// ============================================================

import { useState } from 'react'
import type { SplashbackInstance } from '@/src/lib/types'
import type { LayerView } from '@/src/lib/displayLayers/resolve'
import {
  sbBounds, sbElevPath, isRect, stretchEdge, moveSegments, rectSegments, openingHoles, defaultSplashbackRect,
  MIN_SB, type SbRect, type SbEdge, type SbObstacle,
} from '@/src/lib/splashbackGeometry'
import type { SbInfo } from './useSplashbacks'
import type { BenchtopSegment } from '@/src/lib/types'

const r1 = (v: number) => Math.round(v)

/** Client point → this group's local mm (the elevation's transformed frame). */
function toLocal(e: { clientX: number; clientY: number }, el: SVGGraphicsElement | null) {
  const m = el?.getScreenCTM()
  if (!el || !m) return null
  const svg = el.ownerSVGElement
  if (!svg) return null
  const pt = svg.createSVGPoint()
  pt.x = e.clientX; pt.y = e.clientY
  const p = pt.matrixTransform(m.inverse())
  return { x: p.x, y: p.y }
}

const KIND_COLOUR: Record<string, string> = {
  stone: '#a8a29e', glass: '#7dd3fc', mirror: '#cbd5e1', tile: '#fcd34d', acrylic: '#f9a8d4',
  timber: '#d6a35c', solid_wood: '#d6a35c', laminate: '#a3a3a3', board: '#e5e7eb',
}

function Patterns({ zoom }: { zoom: number }) {
  // Pattern spacing in mm so it scales with the drawing; lines stay hairline.
  const sw = 0.8 / zoom
  return (
    <defs>
      <pattern id="sb-hatch-stone" patternUnits="userSpaceOnUse" width={60} height={60} patternTransform="rotate(45)">
        <line x1={0} y1={0} x2={0} y2={60} stroke="currentColor" strokeWidth={sw} />
      </pattern>
      <pattern id="sb-hatch-glass" patternUnits="userSpaceOnUse" width={240} height={240} patternTransform="rotate(-45)">
        <line x1={0} y1={0} x2={0} y2={90} stroke="currentColor" strokeWidth={sw} />
        <line x1={25} y1={0} x2={25} y2={60} stroke="currentColor" strokeWidth={sw} />
      </pattern>
      <pattern id="sb-hatch-tile" patternUnits="userSpaceOnUse" width={100} height={100}>
        <path d="M 0 0 H 100 M 0 0 V 100" fill="none" stroke="currentColor" strokeWidth={sw} />
      </pattern>
    </defs>
  )
}

const hatchFor = (kind: string) =>
  kind === 'glass' || kind === 'mirror' || kind === 'acrylic' ? 'glass' : kind === 'tile' ? 'tile' : kind === 'board' ? null : 'stone'

type Drag =
  | { kind: 'edge'; id: string; edge: SbEdge; segs: BenchtopSegment[] }
  | { kind: 'move'; id: string; start: { x: number; y: number }; segs: BenchtopSegment[]; moved: boolean }
  | { kind: 'draw'; start: { x: number; y: number }; cur: { x: number; y: number } }

export default function SplashbackElevation({
  splashbacks, wallId, side, wallLength, roomH, zoom, lineScale = 1, layers, selectedId, infoFor, openings,
  interactive, drawing, benches, obstacles, onSelect, onChangeSegments, onCreate, onContextMenu,
}: {
  splashbacks: SplashbackInstance[]
  wallId: string
  side: 'face' | 'back'
  wallLength: number
  roomH: number
  zoom: number
  lineScale?: number
  layers: LayerView
  selectedId: string | null
  infoFor: (sb: SplashbackInstance) => SbInfo
  /** Wall openings on this side, elevation x + height ranges. */
  openings: SbRect[]
  /** Pieces pick + drag (select mode). */
  interactive: boolean
  /** Draw mode: the overlay takes presses. */
  drawing: boolean
  /** Benchtop bands on this side (elevation x, top height) — the click-to-default targets. */
  benches: { t0: number; t1: number; topZ: number }[]
  /** Overheads / rangehood / bulkheads (elevation x, underside height). */
  obstacles: SbObstacle[]
  onSelect: (id: string) => void
  onChangeSegments: (id: string, segs: BenchtopSegment[]) => void
  onCreate: (segs: BenchtopSegment[]) => void
  onContextMenu?: (e: React.MouseEvent, id: string) => void
}) {
  const [drag, setDrag] = useState<Drag | null>(null)
  if (!layers.show('splashbacks')) return null

  const z = zoom
  const lz = z / lineScale
  const lp = layers.props('splashbacks', z)
  const here = splashbacks.filter(s => s.wall_id === wallId && s.wall_side === side)
  // The pressed element has no transform of its own, so its frame is the elevation's.
  const local = (e: React.PointerEvent | React.MouseEvent) => {
    const p = toLocal(e, e.currentTarget as SVGGraphicsElement)
    return p ? { x: p.x, z: roomH - p.y } : null
  }

  // Live outline while dragging.
  const liveSegs = (sb: SplashbackInstance) => {
    if (!drag || drag.kind === 'draw' || drag.id !== sb.id) return sb.segments
    return drag.segs
  }

  function endDrag(e: React.PointerEvent) {
    if (!drag) return
    ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
    if (drag.kind === 'edge') onChangeSegments(drag.id, drag.segs)
    if (drag.kind === 'move' && drag.moved) onChangeSegments(drag.id, drag.segs)
    if (drag.kind === 'draw') {
      const a = drag.start, b = drag.cur
      if (Math.abs(b.x - a.x) >= MIN_SB && Math.abs(b.y - a.y) >= MIN_SB) {
        onCreate(rectSegments({ x0: r1(Math.min(a.x, b.x)), x1: r1(Math.max(a.x, b.x)), z0: r1(Math.min(a.y, b.y)), z1: r1(Math.max(a.y, b.y)) }))
      } else {
        // A click: default size over the bench under the cursor.
        const bench = benches.find(bn => a.x >= bn.t0 - 1 && a.x <= bn.t1 + 1)
        if (bench) {
          const rect = defaultSplashbackRect({ x0: r1(bench.t0), x1: r1(bench.t1), benchTopZ: r1(bench.topZ), ceilingZ: roomH, obstacles })
          onCreate(rectSegments({ ...rect, z1: r1(rect.z1) }))
        }
      }
    }
    setDrag(null)
  }

  const stroke = layers.color('splashbacks', '#38bdf8')
  const hs = 7 / z   // handle half-size, screen px

  return (
    <g>
      <Patterns zoom={z} />
      {here.map(sb => {
        const segs = liveSegs(sb)
        const b = sbBounds(segs)
        if (!b) return null
        const info = infoFor(sb)
        const holes = openingHoles(b, openings, Number(sb.opening_reveal_mm) || 0)
        const d = sbElevPath(segs, holes, roomH)
        const isSel = sb.id === selectedId
        const col = KIND_COLOUR[info.kind] ?? '#a8a29e'
        const hatch = hatchFor(info.kind)
        const fs = 11 / z
        const label = `SPLASHBACK${info.name ? ' – ' + info.name : ''}`
        return (
          <g key={sb.id} style={{ pointerEvents: interactive ? undefined : 'none', cursor: interactive ? (isSel ? 'move' : 'pointer') : undefined }}
            onPointerDown={e => {
              if (!interactive || e.button !== 0) return
              e.stopPropagation()
              if (!isSel) { onSelect(sb.id); return }
              const p = local(e)
              if (!p) return
              ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
              setDrag({ kind: 'move', id: sb.id, start: { x: p.x, y: p.z }, segs: sb.segments, moved: false })
            }}
            onPointerMove={e => {
              if (drag?.kind !== 'move' || drag.id !== sb.id) return
              const p = local(e)
              if (!p) return
              const dx = r1(p.x - drag.start.x), dz = r1(p.z - drag.start.y)
              if (!drag.moved && Math.abs(dx) * z < 4 && Math.abs(dz) * z < 4) return
              setDrag({ ...drag, segs: moveSegments(sb.segments, dx, dz), moved: true })
            }}
            onPointerUp={e => { if (drag?.kind === 'move') { e.stopPropagation(); endDrag(e) } }}
            onClick={e => { if (interactive) e.stopPropagation() }}
            onContextMenu={e => { if (interactive && onContextMenu) { e.preventDefault(); e.stopPropagation(); onSelect(sb.id); onContextMenu(e, sb.id) } }}
          >
            <path d={d} fillRule="evenodd"
              fill={layers.lineDrawing ? 'none' : col} fillOpacity={layers.lineDrawing ? 0 : Math.min(0.35, lp.fillOpacity ?? 0.35)}
              stroke={isSel ? '#f59e0b' : stroke} strokeWidth={layers.w('splashbacks', isSel ? 2 : 1.25) / lz} opacity={layers.op('splashbacks')} />
            {hatch && (
              <path d={d} fillRule="evenodd" fill={`url(#sb-hatch-${hatch})`} stroke="none"
                style={{ color: isSel ? '#f59e0b' : stroke }} opacity={0.6 * layers.op('splashbacks')} />
            )}
            {layers.show('splashback_labels') && (
              <text x={(b.x0 + b.x1) / 2} y={roomH - (b.z0 + b.z1) / 2} fontSize={fs} textAnchor="middle" dominantBaseline="middle"
                fill={isSel ? '#f59e0b' : stroke} style={{ pointerEvents: 'none', userSelect: 'none' }}>
                <tspan x={(b.x0 + b.x1) / 2} dy={-fs * 0.6}>{label}</tspan>
                <tspan x={(b.x0 + b.x1) / 2} dy={fs * 1.25}>{`${r1(b.x1 - b.x0)} × ${r1(b.z1 - b.z0)}${info.thick ? ` · ${info.thick}` : ''}`}</tspan>
              </text>
            )}
            {/* Edge handles on a selected rectangle */}
            {isSel && interactive && isRect(segs) && ([
              ['left',   b.x0, (b.z0 + b.z1) / 2],
              ['right',  b.x1, (b.z0 + b.z1) / 2],
              ['bottom', (b.x0 + b.x1) / 2, b.z0],
              ['top',    (b.x0 + b.x1) / 2, b.z1],
            ] as [SbEdge, number, number][]).map(([edge, hx, hz]) => (
              <rect key={edge} x={hx - hs} y={roomH - hz - hs} width={hs * 2} height={hs * 2}
                fill="#f59e0b" stroke="white" strokeWidth={1 / z}
                style={{ cursor: edge === 'left' || edge === 'right' ? 'ew-resize' : 'ns-resize' }}
                onPointerDown={e => {
                  if (e.button !== 0) return
                  e.stopPropagation()
                  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
                  setDrag({ kind: 'edge', id: sb.id, edge, segs: sb.segments })
                }}
                onPointerMove={e => {
                  if (drag?.kind !== 'edge' || drag.id !== sb.id || drag.edge !== edge) return
                  const p = local(e)
                  if (!p) return
                  const v = edge === 'left' || edge === 'right' ? r1(p.x) : r1(p.z)
                  setDrag({ ...drag, segs: stretchEdge(sb.segments, edge, v) })
                }}
                onPointerUp={e => { e.stopPropagation(); endDrag(e) }}
              />
            ))}
          </g>
        )
      })}

      {/* Draw overlay: drag a rectangle, or click a bench for the default size */}
      {drawing && (
        <>
          <rect x={-2000} y={-2000} width={wallLength + 4000} height={roomH + 4000} fill="transparent" style={{ cursor: 'crosshair' }}
            onPointerDown={e => {
              if (e.button !== 0) return
              e.stopPropagation()
              const p = local(e)
              if (!p) return
              ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
              setDrag({ kind: 'draw', start: { x: p.x, y: p.z }, cur: { x: p.x, y: p.z } })
            }}
            onPointerMove={e => {
              if (drag?.kind !== 'draw') return
              const p = local(e)
              if (p) setDrag({ ...drag, cur: { x: p.x, y: p.z } })
            }}
            onPointerUp={e => { if (e.button === 0) { e.stopPropagation(); endDrag(e) } }}
            onClick={e => e.stopPropagation()}
          />
          {benches.map((bn, i) => (
            <rect key={i} x={bn.t0} y={roomH - bn.topZ - 6 / z} width={bn.t1 - bn.t0} height={6 / z}
              fill="#38bdf8" opacity={0.5} style={{ pointerEvents: 'none' }} />
          ))}
          {drag?.kind === 'draw' && (
            <rect x={Math.min(drag.start.x, drag.cur.x)} y={roomH - Math.max(drag.start.y, drag.cur.y)}
              width={Math.abs(drag.cur.x - drag.start.x)} height={Math.abs(drag.cur.y - drag.start.y)}
              fill="#38bdf8" fillOpacity={0.15} stroke="#38bdf8" strokeWidth={1.25 / z} strokeDasharray={`${6 / z} ${4 / z}`}
              style={{ pointerEvents: 'none' }} />
          )}
        </>
      )}
    </g>
  )
}
