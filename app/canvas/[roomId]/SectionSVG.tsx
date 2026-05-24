'use client'
import { useState, useReducer, useRef, useEffect } from 'react'
import type { Wall, CabinetInstance, Room } from '@/src/lib/types'
import type { Pt } from '@/src/lib/geometry'
import { wallDir, wallCorners, wallInwardNormal, centroid, cabWallPerp } from '@/src/lib/geometry'
import { viewReducer } from './canvasTypes'
import type { SectionCut } from './canvasTypes'
import { getUserPrefs } from '@/src/lib/userPrefs'

// ── Geometry helpers ─────────────────────────────────────────────────────────

function cutBasis(cut: SectionCut): { d: Pt; n: Pt; P1: Pt; cutLen: number } {
  const dx = cut.x2 - cut.x1, dy = cut.y2 - cut.y1
  const len = Math.sqrt(dx * dx + dy * dy)
  const d = { x: dx / len, y: dy / len }
  const n = { x: -d.y, y: d.x }  // left perpendicular
  return { d, n, P1: { x: cut.x1, y: cut.y1 }, cutLen: len }
}

function projectU(p: Pt, P1: Pt, d: Pt): number {
  return (p.x - P1.x) * d.x + (p.y - P1.y) * d.y
}

function rawDepth(p: Pt, P1: Pt, n: Pt): number {
  return (p.x - P1.x) * n.x + (p.y - P1.y) * n.y
}

// Find u-range of the intersection of the cut LINE with a polygon
function polygonCutRange(corners: Pt[], P1: Pt, d: Pt, n: Pt): { uMin: number; uMax: number } | null {
  const depths = corners.map(c => rawDepth(c, P1, n))
  if (!depths.some(dd => dd > 0.5) || !depths.some(dd => dd < -0.5)) return null
  const us: number[] = []
  for (let i = 0; i < corners.length; i++) {
    const j = (i + 1) % corners.length
    const dA = depths[i], dB = depths[j]
    if ((dA > 0 && dB < 0) || (dA < 0 && dB > 0)) {
      const t = dA / (dA - dB)
      const px = corners[i].x + t * (corners[j].x - corners[i].x)
      const py = corners[i].y + t * (corners[j].y - corners[i].y)
      us.push(projectU({ x: px, y: py }, P1, d))
    }
  }
  if (us.length < 2) return null
  return { uMin: Math.min(...us), uMax: Math.max(...us) }
}

type CutClass = 'intersected' | 'inFront' | 'behind'

function classifyPolygon(corners: Pt[], P1: Pt, n: Pt, lookDir: 1 | -1): CutClass {
  const sd = corners.map(c => rawDepth(c, P1, n) * lookDir)
  if (sd.every(d => d > 0.5)) return 'inFront'
  if (sd.every(d => d < -0.5)) return 'behind'
  return 'intersected'
}

function cabWorldCorners(cab: CabinetInstance, wall: Wall, perp: Pt): Pt[] {
  const d = wallDir(wall)
  return [
    { x: cab.pos_x, y: cab.pos_y },
    { x: cab.pos_x + d.x * cab.dx, y: cab.pos_y + d.y * cab.dx },
    { x: cab.pos_x + d.x * cab.dx + perp.x * cab.dz, y: cab.pos_y + d.y * cab.dx + perp.y * cab.dz },
    { x: cab.pos_x + perp.x * cab.dz, y: cab.pos_y + perp.y * cab.dz },
  ]
}

function wallCabTopFor(w: Wall | null, room: Room): number {
  if (w?.soffit_height != null) return (w.height ?? room.room_dy ?? 2400) - w.soffit_height
  return room.soffit_height ?? room.wall_cabinet_top ?? 2100
}

function cabBottomZ(cab: CabinetInstance, room: Room, wall: Wall | null): number {
  if (cab.assembly_class === 'wall' || cab.assembly_class === 'wall_corner') {
    return wallCabTopFor(wall, room) - cab.dy
  }
  return 0
}

// ── Component ────────────────────────────────────────────────────────────────

interface SectionSVGProps {
  walls: Wall[]
  cabinets: CabinetInstance[]
  room: Room
  sectionCut: SectionCut | null
  onFlipLook: () => void
  onClearCut: () => void
}

export default function SectionSVG({ walls, cabinets, room, sectionCut, onFlipLook, onClearCut }: SectionSVGProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [view, dispatchView] = useReducer(viewReducer, { panX: 80, panY: 60, zoom: 1 })
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const spaceRef = useRef(false)

  const roomH = room.room_dy ?? 2400
  const cx = centroid(walls)

  // Auto-fit when cut changes
  useEffect(() => {
    if (!svgRef.current || !sectionCut) return
    const { width, height } = svgRef.current.getBoundingClientRect()
    const { cutLen } = cutBasis(sectionCut)
    const pad = 100
    const zx = (width - pad * 2) / (cutLen + 400)
    const zy = (height - pad * 2) / roomH
    const z = Math.min(3, Math.max(0.02, Math.min(zx, zy)))
    dispatchView({ type: 'set', panX: (width - cutLen * z) / 2, panY: (height - roomH * z) / 2, zoom: z })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionCut?.x1, sectionCut?.y1, sectionCut?.x2, sectionCut?.y2])

  useEffect(() => {
    const svg = svgRef.current; if (!svg) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const r = svg.getBoundingClientRect()
      const inv = getUserPrefs().invertScroll
      const factor = (e.deltaY < 0) !== inv ? 1.15 : 1 / 1.15
      dispatchView({ type: 'zoom', factor, svgX: e.clientX - r.left, svgY: e.clientY - r.top })
    }
    svg.addEventListener('wheel', handler, { passive: false })
    return () => svg.removeEventListener('wheel', handler)
  }, [])

  useEffect(() => {
    const kd = (e: KeyboardEvent) => { if (e.key === ' ') { spaceRef.current = true; e.preventDefault() } }
    const ku = (e: KeyboardEvent) => { if (e.key === ' ') spaceRef.current = false }
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  }, [])

  function onPointerDown(e: React.PointerEvent) {
    if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
      e.preventDefault()
      panRef.current = { startX: e.clientX, startY: e.clientY, panX: view.panX, panY: view.panY }
      svgRef.current?.setPointerCapture(e.pointerId)
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!panRef.current) return
    dispatchView({
      type: 'pan',
      dx: e.clientX - panRef.current.startX - (view.panX - panRef.current.panX),
      dy: e.clientY - panRef.current.startY - (view.panY - panRef.current.panY),
    })
    panRef.current.startX = e.clientX; panRef.current.startY = e.clientY
    panRef.current.panX = view.panX; panRef.current.panY = view.panY
  }

  function onPointerUp() { panRef.current = null }

  const z = view.zoom
  const labelFs = 11 / z
  const tickH = 20 / z

  // ── Section geometry ────────────────────────────────────────────────────────
  const { wallEls, cabEls, cutLen } = (() => {
    if (!sectionCut) return { wallEls: [], cabEls: [], cutLen: 0 }
    const { d, n, P1, cutLen: cl } = cutBasis(sectionCut)
    const { lookDir } = sectionCut
    const wallEls: React.ReactNode[] = []
    const cabEls: React.ReactNode[] = []

    // When lookDir=-1 we're viewing from the opposite side, so u-coordinates mirror around cl/2.
    // dispRX returns the SVG x for a [uMin,uMax] span; width is always uMax-uMin.
    const dispRX = (uMin: number, uMax: number) => lookDir === 1 ? uMin : cl - uMax

    // Walls
    for (const w of walls) {
      const corners = wallCorners(w)
      const cls = classifyPolygon(corners, P1, n, lookDir)
      if (cls === 'behind') continue
      const wallH = w.height ?? roomH
      const y0 = roomH - wallH

      if (cls === 'intersected') {
        const range = polygonCutRange(corners, P1, d, n)
        if (!range) continue
        const wid = Math.max(2 / z, range.uMax - range.uMin)
        const rX = dispRX(range.uMin, range.uMax)
        const midU = rX + wid / 2
        const midV = y0 + wallH / 2
        wallEls.push(
          <g key={w.id} style={{ pointerEvents: 'none' }}>
            <rect x={rX} y={y0} width={wid} height={wallH}
              fill="url(#sec-hatch)" stroke="#6b7280" strokeWidth={1.5 / z} />
            <text x={midU} y={midV} textAnchor="middle" dominantBaseline="middle"
              fontSize={labelFs * 0.8} fill="#ffffff"
              transform={`rotate(-90,${midU},${midV})`}
              style={{ userSelect: 'none' }}>
              {w.name}
            </text>
          </g>
        )
      } else {
        // inFront: context outline
        const us = corners.map(c => projectU(c, P1, d))
        const uMin = Math.min(...us), uMax = Math.max(...us)
        if (uMax < -200 || uMin > cl + 200) continue
        const wid = Math.max(1 / z, uMax - uMin)
        wallEls.push(
          <rect key={w.id} x={dispRX(uMin, uMax)} y={y0} width={wid} height={wallH}
            fill="none" stroke="#374151" strokeWidth={1 / z}
            strokeDasharray={`${8 / z} ${4 / z}`}
            style={{ pointerEvents: 'none' }} />
        )
      }
    }

    // Cabinets
    for (const cab of cabinets) {
      const wall = walls.find(w => w.id === cab.wall_id)
      if (!wall) continue
      const inward = wallInwardNormal(wall, cx.x, cx.y)
      const perp = cabWallPerp(cab, wall, inward)
      const corners = cabWorldCorners(cab, wall, perp)
      const cls = classifyPolygon(corners, P1, n, lookDir)
      if (cls === 'behind') continue

      const bottomZ = cabBottomZ(cab, room, wall)
      const cabTopY = roomH - bottomZ - cab.dy
      const isBase = cab.assembly_class === 'base' || cab.assembly_class === 'base_corner'
      const isTall = cab.assembly_class === 'tall' || cab.assembly_class === 'tall_corner'
      const tkH = (isBase || isTall) && cab.has_toekick ? 150 : 0

      if (cls === 'intersected') {
        const range = polygonCutRange(corners, P1, d, n)
        if (!range) continue
        const wid = Math.max(1 / z, range.uMax - range.uMin)
        const rX = dispRX(range.uMin, range.uMax)
        const midU = rX + wid / 2

        // Simplified shelf positions
        const shelfLines: React.ReactNode[] = []
        if (cab.has_internal) {
          const intTop = cabTopY
          const intBot = roomH - bottomZ - tkH
          if (isTall) {
            for (let off = 300; off < cab.dy - tkH - 150; off += 350) {
              const sy = intTop + off
              if (sy > intTop + 10 / z && sy < intBot - 10 / z) {
                shelfLines.push(
                  <line key={off} x1={rX + 1 / z} y1={sy} x2={rX + wid - 1 / z} y2={sy}
                    stroke="#818cf8" strokeWidth={1 / z} />
                )
              }
            }
          } else {
            const sy = (intTop + intBot) / 2
            if (sy > intTop + 10 / z && sy < intBot - 10 / z) {
              shelfLines.push(
                <line key="shelf" x1={rX + 1 / z} y1={sy} x2={rX + wid - 1 / z} y2={sy}
                  stroke="#818cf8" strokeWidth={1 / z} />
              )
            }
          }
        }

        cabEls.push(
          <g key={cab.id} style={{ pointerEvents: 'none' }}>
            <rect x={rX} y={cabTopY} width={wid} height={cab.dy}
              fill="url(#sec-hatch)" stroke="#8b9eb0" strokeWidth={1.5 / z} />
            {tkH > 0 && (
              <rect x={rX} y={roomH - tkH} width={wid} height={tkH}
                fill="#111827" stroke="#8b9eb0" strokeWidth={0.5 / z} />
            )}
            {shelfLines}
            {cab.label && wid > 24 / z && (
              <text x={midU} y={cabTopY + cab.dy / 2} textAnchor="middle" dominantBaseline="middle"
                fontSize={labelFs * 0.75} fill="#ffffff"
                style={{ userSelect: 'none' }}>
                {cab.label}
              </text>
            )}
          </g>
        )
      } else {
        // inFront: context outline
        const us = corners.map(c => projectU(c, P1, d))
        const uMin = Math.min(...us), uMax = Math.max(...us)
        if (uMax < -200 || uMin > cl + 200) continue
        const wid = Math.max(1 / z, uMax - uMin)
        cabEls.push(
          <rect key={cab.id}
            x={dispRX(uMin, uMax)} y={cabTopY} width={wid} height={cab.dy}
            fill="none" stroke="#374151" strokeWidth={0.5 / z}
            strokeDasharray={`${6 / z} ${4 / z}`}
            style={{ pointerEvents: 'none' }} />
        )
      }
    }

    return { wallEls, cabEls, cutLen: cl }
  })()

  return (
    <div className="flex-1 flex flex-col bg-gray-950 overflow-hidden">

      {/* Toolbar */}
      <div className="flex-none flex items-center gap-1 px-3 py-1.5 bg-gray-900 border-b border-gray-800 shrink-0">
        <span className="text-[10px] text-gray-500 mr-2 whitespace-nowrap select-none">Section:</span>
        {sectionCut ? (
          <>
            <button onClick={onFlipLook}
              className="px-2.5 py-0.5 text-[10px] rounded text-gray-400 hover:text-gray-200 hover:bg-gray-800 whitespace-nowrap transition-colors">
              Flip Direction
            </button>
            <div className="mx-2 h-4 border-l border-gray-700" />
            <button onClick={onClearCut}
              className="px-2.5 py-0.5 text-[10px] rounded text-red-400 hover:text-red-200 hover:bg-red-900/30 whitespace-nowrap transition-colors">
              Clear Cut
            </button>
          </>
        ) : (
          <span className="text-[10px] text-gray-600 italic select-none">
            Switch to Plan view · click Section Cut · click and drag to draw
          </span>
        )}
      </div>

      {/* SVG or empty state */}
      {!sectionCut ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-700 text-sm select-none">
            No section cut — switch to Plan view and use the Section Cut tool
          </p>
        </div>
      ) : (
        <svg
          ref={svgRef}
          className="flex-1 bg-gray-950 select-none"
          style={{ cursor: spaceRef.current ? 'grab' : 'default' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <g transform={`translate(${view.panX},${view.panY}) scale(${z})`}>
            <defs>
              <pattern id="sec-hatch" patternUnits="userSpaceOnUse" width="20" height="20">
                <line x1="0" y1="20" x2="20" y2="0" stroke="#4b5563" strokeWidth="1.5" />
              </pattern>
            </defs>

            {/* Context outlines behind hatched elements */}
            {wallEls}

            {/* Floor */}
            <line x1={-200} y1={roomH} x2={cutLen + 200} y2={roomH}
              stroke="#4b5563" strokeWidth={2 / z} />

            {/* Ceiling */}
            <line x1={-200} y1={0} x2={cutLen + 200} y2={0}
              stroke="#374151" strokeWidth={0.5 / z} strokeDasharray={`${8 / z} ${4 / z}`} />

            {cabEls}

            {/* Y-axis dimension */}
            {(() => {
              const chainX = -60 / z
              const sw = 1 / z, fs = 12 / z, tk = 8 / z
              const midY = roomH / 2
              return (
                <g pointerEvents="none" style={{ userSelect: 'none' }}>
                  <line x1={chainX} y1={0} x2={chainX} y2={roomH} stroke="#fff" strokeWidth={sw} />
                  <line x1={chainX - tk} y1={0} x2={chainX + tk} y2={0} stroke="#fff" strokeWidth={sw} />
                  <line x1={chainX - tk} y1={roomH} x2={chainX + tk} y2={roomH} stroke="#fff" strokeWidth={sw} />
                  <g transform={`rotate(-90,${chainX},${midY})`}>
                    <rect x={chainX - fs * 2} y={midY - fs * 0.6} width={fs * 4} height={fs * 1.2} fill="#030712" />
                    <text x={chainX} y={midY} textAnchor="middle" dominantBaseline="middle"
                      fontSize={fs} fill="#fff">{Math.round(roomH)}</text>
                  </g>
                </g>
              )
            })()}

            {/* X-axis (cut length) dimension */}
            {(() => {
              const dimY = roomH + tickH * 3
              const sw = 1 / z, fs = 12 / z, tk = 8 / z
              const midX = cutLen / 2
              return (
                <g pointerEvents="none" style={{ userSelect: 'none' }}>
                  <line x1={0} y1={dimY} x2={cutLen} y2={dimY} stroke="#fff" strokeWidth={sw} />
                  <line x1={0} y1={dimY - tk} x2={0} y2={dimY + tk} stroke="#fff" strokeWidth={sw} />
                  <line x1={cutLen} y1={dimY - tk} x2={cutLen} y2={dimY + tk} stroke="#fff" strokeWidth={sw} />
                  <rect x={midX - fs * 2} y={dimY - fs * 0.6} width={fs * 4} height={fs * 1.2} fill="#030712" />
                  <text x={midX} y={dimY} textAnchor="middle" dominantBaseline="middle"
                    fontSize={fs} fill="#fff">{Math.round(cutLen)}</text>
                </g>
              )
            })()}

          </g>
        </svg>
      )}
    </div>
  )
}
