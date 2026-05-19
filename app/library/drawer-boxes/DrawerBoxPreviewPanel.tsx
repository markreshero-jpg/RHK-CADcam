'use client'

// ── Drawer Box Preview Panel ───────────────────────────────────────────────────
// Self-contained: owns material schedule selection, W/H/D inputs, view tabs,
// and resize. Mirrors the PreviewPanel in ConstructionMethodsClient.

import { useState, useEffect, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/src/lib/supabase'
import { DrawerBoxRules, DEFAULT_DB_RULES, Material, ResolvedDrawerBoxPart, DrawerType } from '@/src/lib/resolver/types'
import { resolveDrawerBox, mergeDbRules } from '@/src/lib/resolver/resolveDrawerBox'
import type { MatColour } from './DrawerBox3DView'

const DrawerBox3DView = dynamic(() => import('./DrawerBox3DView'), { ssr: false })

// ── Colour tokens (match construction methods palette) ────────────────────────

const C_INT   = '#0f172a'
const C_DIM   = '#6b7280'
const C_LABEL = '#9ca3af'
const C_CUT   = '#475569'
const C_BACK  = '#334155'

const RC = {
  side:   { fill: '#374151', stroke: '#4b5563' },
  bottom: { fill: '#1e1b4b', stroke: '#4338ca' },
  front:  { fill: '#2d3748', stroke: '#718096' },
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface DbSched {
  id:                 string
  name:               string
  is_default:         boolean
  material_id:        string | null
  edgeband_id:        string | null
  bottom_material_id: string | null
  bottom_edgeband_id: string | null
}

interface MatRow {
  id:          string
  name:        string
  dz:          number
  face_colour: string | null
  back_colour: string | null
  edge_colour: string | null
}

interface EbRow {
  id:                string
  name:              string
  thickness:         number
  color:             string | null
  material_match_id: string | null
}

interface SlideRow {
  id:               string
  name:             string
  brand:            string | null
  nominal_length:   number | null
  box_height:       number | null
  runner_thickness: number
  colour:           string | null
  side_deduction:   number
}

type PView = 'front' | 'top' | 'side' | '3d'

const SLIDE_H = 30   // rendered channel height (mm)

// ── Zoomable SVG wrapper ────────────────────────────────────────────────────────

function ZoomableArea({ children, resetKey }: { children: React.ReactNode; resetKey?: unknown }) {
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 })
  const viewRef = useRef({ scale: 1, tx: 0, ty: 0 })
  viewRef.current = view

  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ sx: number; sy: number; tx0: number; ty0: number } | null>(null)

  useEffect(() => {
    const v = { scale: 1, tx: 0, ty: 0 }
    viewRef.current = v
    setView(v)
  }, [resetKey])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const factor = e.deltaY < 0 ? 1.15 : 0.87
      const prev = viewRef.current
      const ns = Math.max(0.1, Math.min(12, prev.scale * factor))
      const r = ns / prev.scale
      const next = { scale: ns, tx: mx * (1 - r) + prev.tx * r, ty: my * (1 - r) + prev.ty * r }
      viewRef.current = next
      setView(next)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  const isIdentity = view.scale === 1 && view.tx === 0 && view.ty === 0

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden select-none"
      style={{ cursor: dragRef.current ? 'grabbing' : 'grab' }}
      onPointerDown={e => {
        dragRef.current = { sx: e.clientX, sy: e.clientY, tx0: viewRef.current.tx, ty0: viewRef.current.ty }
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      }}
      onPointerMove={e => {
        if (!dragRef.current) return
        const { sx, sy, tx0, ty0 } = dragRef.current
        const next = { scale: viewRef.current.scale, tx: tx0 + e.clientX - sx, ty: ty0 + e.clientY - sy }
        viewRef.current = next
        setView(next)
      }}
      onPointerUp={() => { dragRef.current = null }}
      onPointerCancel={() => { dragRef.current = null }}
    >
      <div
        style={{
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
          transformOrigin: '0 0',
          width: '100%',
          height: '100%',
        }}
      >
        {children}
      </div>
      {!isIdentity && (
        <button
          className="absolute bottom-2 right-2 text-[9px] bg-gray-700/80 hover:bg-gray-600 text-gray-300 rounded px-2 py-0.5 z-10"
          onPointerDown={e => e.stopPropagation()}
          onClick={() => {
            const v = { scale: 1, tx: 0, ty: 0 }
            viewRef.current = v
            setView(v)
          }}
        >
          Reset view
        </button>
      )}
    </div>
  )
}

// ── SVG helpers ────────────────────────────────────────────────────────────────

function dimH(x1: number, x2: number, y: number, label: string, above = false) {
  const mid = (x1 + x2) / 2
  const ty = above ? y - 28 : y + 28
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={C_DIM} strokeWidth={1.5} strokeDasharray="5 3" />
      <line x1={x1} y1={y - 8} x2={x1} y2={y + 8} stroke={C_DIM} strokeWidth={1.5} />
      <line x1={x2} y1={y - 8} x2={x2} y2={y + 8} stroke={C_DIM} strokeWidth={1.5} />
      <text x={mid} y={ty} textAnchor="middle" dominantBaseline="central" fontSize={24} fill={C_LABEL} fontFamily="system-ui,sans-serif">{label}</text>
    </g>
  )
}

function dimV(x: number, y1: number, y2: number, label: string, right = false) {
  const mid = (y1 + y2) / 2
  const tx = right ? x + 14 : x - 14
  const anchor = right ? 'start' : 'end'
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={C_DIM} strokeWidth={1.5} strokeDasharray="5 3" />
      <line x1={x - 8} y1={y1} x2={x + 8} y2={y1} stroke={C_DIM} strokeWidth={1.5} />
      <line x1={x - 8} y1={y2} x2={x + 8} y2={y2} stroke={C_DIM} strokeWidth={1.5} />
      <text x={tx} y={mid} textAnchor={anchor} dominantBaseline="central" fontSize={24} fill={C_LABEL} fontFamily="system-ui,sans-serif">{label}</text>
    </g>
  )
}

function viewLabel(cx: number, y: number, text: string) {
  return <text x={cx} y={y} textAnchor="middle" dominantBaseline="central" fontSize={20} fill={C_CUT} fontFamily="system-ui,sans-serif" letterSpacing={1}>{text}</text>
}

// ── Coordinate projection helpers ──────────────────────────────────────────────
//
// Drawer box resolver convention (origin = back-bottom-left of box):
//   DX = extent in depth direction (Z world)
//   DY = extent in width direction (X world) for horizontal/face panels,
//        or height (Y world) for side panels
//   DZ = material thickness
//
// Part          | DX    | DY       | DZ
// db_left_side  | depth | height   | Ts (X-thickness)
// db_right_side | depth | height   | Ts (X-thickness)
// db_bottom     | depth | width    | Tb (Y-thickness)
// db_front      | height| width    | Ts (Z-thickness)
// db_back       | height| width    | Ts (Z-thickness)

function frontRect(p: ResolvedDrawerBoxPart): { x: number; yBottom: number; w: number; h: number } {
  // Front view: project onto X-Y plane
  switch (p.part_type) {
    case 'db_left_side':
    case 'db_right_side':
      // X-span=[p.X, p.X+DZ], Y-span=[p.Y, p.Y+DY]
      return { x: p.X, yBottom: p.Y, w: p.DZ, h: p.DY }
    case 'db_bottom':
      // X-span=[p.X, p.X+DY], Y-span=[p.Y, p.Y+DZ]
      return { x: p.X, yBottom: p.Y, w: p.DY, h: p.DZ }
    case 'db_front':
    case 'db_back':
      // X-span=[p.X, p.X+DY], Y-span=[p.Y, p.Y+DX]
      return { x: p.X, yBottom: p.Y, w: p.DY, h: p.DX }
  }
}

function sideRect(p: ResolvedDrawerBoxPart): { z: number; yBottom: number; d: number; h: number } {
  // Side view: project onto Z-Y plane (looking from right, +X)
  switch (p.part_type) {
    case 'db_left_side':
    case 'db_right_side':
      // Z-span=[p.Z, p.Z+DX], Y-span=[p.Y, p.Y+DY]
      return { z: p.Z, yBottom: p.Y, d: p.DX, h: p.DY }
    case 'db_bottom':
      // Z-span=[p.Z, p.Z+DX], Y-span=[p.Y, p.Y+DZ]
      return { z: p.Z, yBottom: p.Y, d: p.DX, h: p.DZ }
    case 'db_front':
    case 'db_back':
      // Z-span=[p.Z, p.Z+DZ], Y-span=[p.Y, p.Y+DX]
      return { z: p.Z, yBottom: p.Y, d: p.DZ, h: p.DX }
  }
}

function topRect(p: ResolvedDrawerBoxPart): { x: number; z: number; w: number; d: number } {
  // Top view: project onto X-Z plane (looking from above, +Y)
  switch (p.part_type) {
    case 'db_left_side':
    case 'db_right_side':
      // X-span=[p.X, p.X+DZ], Z-span=[p.Z, p.Z+DX]
      return { x: p.X, z: p.Z, w: p.DZ, d: p.DX }
    case 'db_bottom':
      // X-span=[p.X, p.X+DY], Z-span=[p.Z, p.Z+DX]
      return { x: p.X, z: p.Z, w: p.DY, d: p.DX }
    case 'db_front':
    case 'db_back':
      // X-span=[p.X, p.X+DY], Z-span=[p.Z, p.Z+DZ]
      return { x: p.X, z: p.Z, w: p.DY, d: p.DZ }
  }
}

function partColour(pt: ResolvedDrawerBoxPart['part_type'], mat: MatColour) {
  if (pt === 'db_bottom') return { fill: mat.face ?? RC.bottom.fill, stroke: RC.bottom.stroke }
  if (pt === 'db_front' || pt === 'db_back') return { fill: RC.front.fill, stroke: RC.front.stroke }
  return { fill: mat.face ?? RC.side.fill, stroke: RC.side.stroke }
}

// ── SVG View components ────────────────────────────────────────────────────────

function DbFrontView({ parts, W, H, mat, slide, casinetW, isSystem }: { parts: ResolvedDrawerBoxPart[]; W: number; H: number; mat: MatColour; slide?: SlideRow | null; casinetW?: number; isSystem?: boolean }) {
  // System drawers: runner_thickness IS the side; always render runners at full box height.
  // Five-piece drawers: render runners only when a slide is selected, at SLIDE_H band height.
  const sw = slide?.runner_thickness ?? 0
  const showRunners = sw > 0 && (isSystem || !!slide)
  const runnerH = isSystem ? H : SLIDE_H
  const showCarcase = casinetW !== undefined && casinetW > W
  const halfDed = showCarcase ? (casinetW - W) / 2 : 0
  // pt must leave room for: carcase dim (+ 40px label) and box dim (+ 28px label) above box
  const pl = 80, pt = showCarcase ? 115 : 80, pr = 40, pb = 40
  const vw = W + pl + pr
  const vh = H + pt + pb
  const ox = pl, oy = pt

  function toSVG(r: { x: number; yBottom: number; w: number; h: number }) {
    return { x: ox + r.x, y: oy + H - r.yBottom - r.h, w: r.w, h: r.h }
  }

  const sc = slide?.colour ?? '#6b7280'
  const lx = ox - halfDed
  const rx = ox + W + halfDed

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%' }}>
      <rect x={ox} y={oy} width={W} height={H} fill={C_INT} />
      {/* Carcase internal boundary lines */}
      {showCarcase && (
        <g>
          <line x1={lx} y1={oy - 8} x2={lx} y2={oy + H + 8} stroke={C_CUT} strokeWidth={1} strokeDasharray="5 3" />
          <line x1={rx} y1={oy - 8} x2={rx} y2={oy + H + 8} stroke={C_CUT} strokeWidth={1} strokeDasharray="5 3" />
          {dimH(lx, rx, oy - 75, `${casinetW}mm`, true)}
          <text x={(lx + rx) / 2} y={oy - 78} textAnchor="middle" dominantBaseline="auto"
            fontSize={15} fill={C_CUT} fontFamily="system-ui,sans-serif" letterSpacing={0.5}>CARCASE INT.</text>
        </g>
      )}
      {/* Runners / system sides — drawn behind box parts */}
      {showRunners && (() => {
        const lr = toSVG({ x: -sw, yBottom: 0, w: sw, h: runnerH })
        const rr = toSVG({ x: W,   yBottom: 0, w: sw, h: runnerH })
        return (
          <g>
            <rect x={lr.x} y={lr.y} width={lr.w} height={lr.h} fill={sc} fillOpacity={0.85} rx={1} />
            <rect x={rr.x} y={rr.y} width={rr.w} height={rr.h} fill={sc} fillOpacity={0.85} rx={1} />
            {!isSystem && (
              <text x={lr.x - 3} y={lr.y + lr.h / 2} textAnchor="end" dominantBaseline="central"
                fontSize={18} fill={C_LABEL} fontFamily="system-ui,sans-serif">runner</text>
            )}
          </g>
        )
      })()}
      {/* Back panel first (deepest) */}
      {parts.filter(p => p.part_type === 'db_back').map((p, i) => {
        const r = toSVG(frontRect(p)); const c = partColour(p.part_type, mat)
        return <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={c.fill} stroke={c.stroke} strokeWidth={0.75} />
      })}
      {/* Bottom */}
      {parts.filter(p => p.part_type === 'db_bottom').map((p, i) => {
        const r = toSVG(frontRect(p)); const c = partColour(p.part_type, mat)
        return <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={c.fill} stroke={c.stroke} strokeWidth={0.75} />
      })}
      {/* Sides */}
      {parts.filter(p => p.part_type === 'db_left_side' || p.part_type === 'db_right_side').map((p, i) => {
        const r = toSVG(frontRect(p)); const c = partColour(p.part_type, mat)
        return <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={c.fill} stroke={c.stroke} strokeWidth={0.75} />
      })}
      {/* Front panel on top */}
      {parts.filter(p => p.part_type === 'db_front').map((p, i) => {
        const r = toSVG(frontRect(p)); const c = partColour(p.part_type, mat)
        return <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={c.fill} stroke={c.stroke} strokeWidth={0.75} />
      })}
      <rect x={ox} y={oy} width={W} height={H} fill="none" stroke="#6b7280" strokeWidth={1.5} />
      {dimH(ox, ox + W, oy - 40, `${W}mm`, true)}
      {dimV(ox - 50, oy, oy + H, `${H}mm`)}
      {viewLabel(ox + W / 2, vh - 14, 'FRONT — BOX W × HEIGHT')}
    </svg>
  )
}

function DbSideView({ parts, D, H, mat, isSystem, slide }: { parts: ResolvedDrawerBoxPart[]; D: number; H: number; mat: MatColour; isSystem?: boolean; slide?: SlideRow | null }) {
  const pl = 80, pt = 60, pr = 80, pb = 40
  const vw = D + pl + pr
  const vh = H + pt + pb
  const oz = pl, oy = pt

  function toSVG(r: { z: number; yBottom: number; d: number; h: number }) {
    return { x: oz + r.z, y: oy + H - r.yBottom - r.h, w: r.d, h: r.h }
  }

  const side = parts.find(p => p.part_type === 'db_right_side')

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%' }}>
      {/* Background interior space */}
      <rect x={oz} y={oy} width={D} height={H} fill={C_INT} />
      {/* Slide runner band — drawn before box parts (behind them) */}
      {slide && (() => {
        const runnerD = Math.min(slide.nominal_length ?? D, D)
        const sc = slide.colour ?? '#6b7280'
        const r = toSVG({ z: 0, yBottom: 0, d: runnerD, h: SLIDE_H })
        return (
          <g>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={sc} fillOpacity={0.85} rx={1} />
            <text x={r.x + r.w + 3} y={r.y + r.h / 2} textAnchor="start" dominantBaseline="central"
              fontSize={18} fill={C_LABEL} fontFamily="system-ui,sans-serif">runner</text>
          </g>
        )
      })()}
      {/* Side panel — solid for 5-piece, dashed outline for system (metal runner) */}
      {isSystem ? (
        <rect x={oz} y={oy} width={D} height={H} fill="none" stroke="#6b7280" strokeWidth={1.5} strokeDasharray="6 3" />
      ) : side ? (() => {
        const r = toSVG(sideRect(side)); const c = partColour(side.part_type, mat)
        return <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={c.fill} stroke={c.stroke} strokeWidth={0.75} />
      })() : null}
      {/* System label */}
      {isSystem && (
        <text x={oz + D / 2} y={oy + H / 2 - 10} textAnchor="middle" dominantBaseline="central"
          fontSize={18} fill="#6b7280" fontFamily="system-ui,sans-serif">metal runner</text>
      )}
      {/* Bottom panel */}
      {parts.filter(p => p.part_type === 'db_bottom').map((p, i) => {
        const r = toSVG(sideRect(p)); const c = partColour(p.part_type, mat)
        return <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={c.fill} stroke={c.stroke} strokeWidth={0.75} />
      })}
      {/* Front panel */}
      {parts.filter(p => p.part_type === 'db_front').map((p, i) => {
        const r = toSVG(sideRect(p)); const c = partColour(p.part_type, mat)
        return <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={c.fill} stroke={c.stroke} strokeWidth={0.75} />
      })}
      {/* Back panel */}
      {parts.filter(p => p.part_type === 'db_back').map((p, i) => {
        const r = toSVG(sideRect(p)); const c = partColour(p.part_type, mat)
        return <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={c.fill} stroke={c.stroke} strokeWidth={0.75} />
      })}
      <rect x={oz} y={oy} width={D} height={H} fill="none" stroke="#6b7280" strokeWidth={1.5} />
      {/* Floor line */}
      <line x1={oz - 20} y1={oy + H} x2={oz + D + 20} y2={oy + H} stroke={C_BACK} strokeWidth={2} strokeDasharray="8 4" />
      {dimH(oz, oz + D, oy - 45, `${D}mm`, true)}
      {dimV(oz + D + 55, oy, oy + H, `${H}mm`, true)}
      {viewLabel(oz + D / 2, vh - 14, 'SIDE — DEPTH × HEIGHT')}
    </svg>
  )
}

function DbTopView({ parts, W, D, mat, slide, casinetW, isSystem }: { parts: ResolvedDrawerBoxPart[]; W: number; D: number; mat: MatColour; slide?: SlideRow | null; casinetW?: number; isSystem?: boolean }) {
  // Top view: X horizontal, Z vertical (front of box at bottom of SVG)
  const sw = slide?.runner_thickness ?? 0
  const showRunners = sw > 0 && (isSystem || !!slide)
  const showCarcase = casinetW !== undefined && casinetW > W
  const halfDed = showCarcase ? (casinetW - W) / 2 : 0
  // Pad sides enough to fit both runners and carcase boundary lines
  const padSide = Math.max(sw, halfDed)
  const pl = 80 + padSide, pt = showCarcase ? 110 : 80, pr = 40 + padSide, pb = 50
  const vw = W + pl + pr
  const vh = D + pt + pb
  const ox = pl, oz = pt

  function toSVG(r: { x: number; z: number; w: number; d: number }) {
    return { x: ox + r.x, y: oz + r.z, w: r.w, h: r.d }
  }

  const sc = slide?.colour ?? '#6b7280'
  const lx = ox - halfDed
  const rx = ox + W + halfDed

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%' }}>
      <rect x={ox} y={oz} width={W} height={D} fill={C_INT} />
      {/* Carcase internal boundary lines */}
      {showCarcase && (
        <g>
          <line x1={lx} y1={oz - 8} x2={lx} y2={oz + D + 8} stroke={C_CUT} strokeWidth={1} strokeDasharray="5 3" />
          <line x1={rx} y1={oz - 8} x2={rx} y2={oz + D + 8} stroke={C_CUT} strokeWidth={1} strokeDasharray="5 3" />
          {dimH(lx, rx, oz - 70, `${casinetW}mm`, true)}
          <text x={(lx + rx) / 2} y={oz - 73} textAnchor="middle" dominantBaseline="auto"
            fontSize={15} fill={C_CUT} fontFamily="system-ui,sans-serif" letterSpacing={0.5}>CARCASE INT.</text>
        </g>
      )}
      {/* Runners / system sides — drawn before box parts */}
      {showRunners && (() => {
        // System: runner spans full depth; 5-piece: runner spans nominal_length
        const runnerD = isSystem ? D : Math.min(slide?.nominal_length ?? D, D)
        const lr = toSVG({ x: -sw, z: 0, w: sw, d: runnerD })
        const rr = toSVG({ x: W,   z: 0, w: sw, d: runnerD })
        return (
          <g>
            <rect x={lr.x} y={lr.y} width={lr.w} height={lr.h} fill={sc} fillOpacity={0.85} rx={1} />
            <rect x={rr.x} y={rr.y} width={rr.w} height={rr.h} fill={sc} fillOpacity={0.85} rx={1} />
          </g>
        )
      })()}
      {/* Bottom first */}
      {parts.filter(p => p.part_type === 'db_bottom').map((p, i) => {
        const r = toSVG(topRect(p)); const c = partColour(p.part_type, mat)
        return <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={c.fill} stroke={c.stroke} strokeWidth={0.75} />
      })}
      {/* Front/back panels */}
      {parts.filter(p => p.part_type === 'db_front' || p.part_type === 'db_back').map((p, i) => {
        const r = toSVG(topRect(p)); const c = partColour(p.part_type, mat)
        return <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={c.fill} stroke={c.stroke} strokeWidth={0.75} />
      })}
      {/* Side panels on top (widest) */}
      {parts.filter(p => p.part_type === 'db_left_side' || p.part_type === 'db_right_side').map((p, i) => {
        const r = toSVG(topRect(p)); const c = partColour(p.part_type, mat)
        return <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={c.fill} stroke={c.stroke} strokeWidth={0.75} />
      })}
      <rect x={ox} y={oz} width={W} height={D} fill="none" stroke="#6b7280" strokeWidth={1.5} />
      {/* "FRONT" label at the top (Z=0 = front face) */}
      <text x={ox + W / 2} y={oz - 16} textAnchor="middle" dominantBaseline="central"
        fontSize={18} fill="#374151" fontFamily="system-ui,sans-serif">FRONT</text>
      <text x={ox + W / 2} y={oz + D + 22} textAnchor="middle" dominantBaseline="central"
        fontSize={18} fill="#374151" fontFamily="system-ui,sans-serif">BACK</text>
      {dimH(ox, ox + W, oz - 45, `${W}mm`, true)}
      {dimV(ox - padSide - 40, oz, oz + D, `${D}mm`)}
      {viewLabel(ox + W / 2, vh - 14, 'TOP — BOX W × DEPTH')}
    </svg>
  )
}

// ── Main Panel ─────────────────────────────────────────────────────────────────

const VIEWS: { id: PView; label: string }[] = [
  { id: 'front', label: 'Front' },
  { id: 'top',   label: 'Top'   },
  { id: 'side',  label: 'Side'  },
  { id: '3d',    label: '3D'    },
]

const PART_LABELS: Record<string, string> = {
  db_left_side:  'L.Side',
  db_right_side: 'R.Side',
  db_bottom:     'Bottom',
  db_front:      'Front',
  db_back:       'Back',
}

const FALLBACK_MATERIAL: Material = {
  id: '__preview__', name: 'Generic', DZ: 18,
  sheet_dx: 2400, sheet_dy: 1200, has_grain: false,
}

const FALLBACK_COL: MatColour = { face: '#374151', back: '#1e293b', edge: '#4b5563' }

const SYSTEM_PART_TYPES = new Set(['db_back', 'db_bottom'])

export default function DrawerBoxPreviewPanel({ delta, drawerType = 'five_piece' }: { delta: Partial<DrawerBoxRules>; drawerType?: DrawerType }) {
  const [panelW,      setPanelW]      = useState(420)
  const [activeView,  setActiveView]  = useState<PView>('3d')
  const [dbScheds,    setDbScheds]    = useState<DbSched[]>([])
  const [selSchedId,  setSelSchedId]  = useState<string | null>(null)
  const [materials,   setMaterials]   = useState<MatRow[]>([])
  const [edgebands,   setEdgebands]   = useState<EbRow[]>([])
  const [prevW,       setPrevW]       = useState(400)
  const [prevH,       setPrevH]       = useState(200)
  const [prevD,       setPrevD]       = useState(450)
  const [slides,      setSlides]      = useState<SlideRow[]>([])
  const [selSlideId,  setSelSlideId]  = useState<string | null>(null)
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null)

  // Set initial width to ~half the remaining space
  useEffect(() => {
    setPanelW(Math.round((window.innerWidth - 240) / 2))
  }, [])

  // Load drawer box material schedules, materials, and edgebands
  useEffect(() => {
    Promise.all([
      supabase.from('drawerbox_schedules')
        .select('id,name,is_default,material_id,edgeband_id,bottom_material_id,bottom_edgeband_id')
        .eq('active', true).order('name'),
      supabase.from('materials')
        .select('id,name,dz,face_colour,back_colour,edge_colour')
        .eq('active', true).order('name'),
      supabase.from('edge_banding')
        .select('id,name,thickness,color,material_match_id')
        .eq('active', true).order('name'),
      supabase.from('hardware_slides')
        .select('id,name,brand,nominal_length,box_height,runner_thickness,colour,side_deduction')
        .eq('active', true).order('nominal_length'),
    ]).then(([schedRes, matsRes, ebRes, slideRes]) => {
      const scheds = (schedRes.data ?? []) as DbSched[]
      setDbScheds(scheds)
      setSelSchedId(scheds.find(s => s.is_default)?.id ?? scheds[0]?.id ?? null)
      setMaterials((matsRes.data ?? []) as MatRow[])
      setEdgebands((ebRes.data ?? []) as EbRow[])
      setSlides((slideRes.data ?? []) as SlideRow[])
    })
  }, [])

  // ── Derived state ──────────────────────────────────────────────────────────

  const selSched    = dbScheds.find(s => s.id === selSchedId) ?? null
  const selMat      = materials.find(m => m.id === selSched?.material_id)        ?? null
  const selBotMat   = materials.find(m => m.id === selSched?.bottom_material_id) ?? null
  const selSlide    = slides.find(s => s.id === selSlideId) ?? null
  const selEb       = edgebands.find(e => e.id === selSched?.edgeband_id) ?? null
  const runnerThick = selSlide ? Number(selSlide.runner_thickness) : 0
  const boxW        = Math.max(1, prevW - runnerThick * 2)
  // System: height is fixed by the slide product; 5-piece: user-entered opening height
  const boxH        = drawerType === 'system' && selSlide?.box_height != null
    ? Number(selSlide.box_height)
    : prevH

  function toMaterial(row: MatRow): Material {
    return {
      id:          row.id,
      name:        row.name,
      DZ:          row.dz,
      sheet_dx:    2400,
      sheet_dy:    1200,
      has_grain:   false,
      face_colour: row.face_colour ?? undefined,
      back_colour: row.back_colour ?? undefined,
      edge_colour: row.edge_colour ?? undefined,
    }
  }

  const previewMaterial: Material = useMemo(
    () => selMat ? toMaterial(selMat) : FALLBACK_MATERIAL,
    [selMat],
  )

  const bottomMaterial: Material | undefined = useMemo(
    () => selBotMat ? toMaterial(selBotMat) : undefined,
    [selBotMat],
  )

  const matCol: MatColour = useMemo(() => ({
    face: selMat?.face_colour ?? FALLBACK_COL.face,
    back: selMat?.back_colour ?? FALLBACK_COL.back,
    edge: selMat?.edge_colour ?? FALLBACK_COL.edge,
  }), [selMat])

  const ebSpec = selEb
    ? { thick: Number(selEb.thickness), color: selEb.color ?? matCol.edge }
    : undefined

  // Use material DZ as DB_SIDE_T so preview reflects real sheet thickness
  const effectiveRules = useMemo(() => {
    const merged = mergeDbRules(DEFAULT_DB_RULES, delta)
    return selMat ? { ...merged, DB_SIDE_T: selMat.dz } : merged
  }, [delta, selMat])

  // ── Schedule field save ────────────────────────────────────────────────────

  async function saveSchedField(field: string, value: string) {
    if (!selSchedId) return
    const v = value || null
    await supabase.from('drawerbox_schedules').update({ [field]: v }).eq('id', selSchedId)
    setDbScheds(prev => prev.map(s => s.id === selSchedId ? ({ ...s, [field]: v } as DbSched) : s))
  }

  function ebOpts(matId: string | null): EbRow[] {
    if (!matId) return edgebands
    const matched = edgebands.filter(eb => eb.material_match_id === matId)
    return matched.length > 0 ? matched : edgebands
  }

  const previewParts: ResolvedDrawerBoxPart[] = useMemo(() => {
    try {
      const rulesForResolve = drawerType === 'system'
        ? { ...effectiveRules, DB_SIDE_T: 0 }
        : effectiveRules
      const all = resolveDrawerBox({
        box_width:          boxW,
        box_height:         boxH,
        box_depth:          prevD,
        material:           previewMaterial,
        edgeband_id:        selSched?.edgeband_id        ?? undefined,
        bottom_material:    bottomMaterial,
        bottom_edgeband_id: selSched?.bottom_edgeband_id ?? undefined,
        rules:              rulesForResolve,
        slide_box_height:   selSlide?.box_height != null ? Number(selSlide.box_height) : undefined,
      })
      return drawerType === 'system'
        ? all.filter(p => SYSTEM_PART_TYPES.has(p.part_type))
        : all
    } catch { return [] }
  }, [boxW, boxH, prevD, previewMaterial, bottomMaterial, selSched, effectiveRules, drawerType, selSlide])

  // ── Resize ─────────────────────────────────────────────────────────────────

  function onResizeDown(e: React.PointerEvent<HTMLDivElement>) {
    resizeRef.current = { startX: e.clientX, startW: panelW }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizeRef.current) return
    const diff = resizeRef.current.startX - e.clientX
    setPanelW(Math.max(300, Math.min(800, resizeRef.current.startW + diff)))
  }
  function onResizeUp() { resizeRef.current = null }

  const tabCls = (active: boolean) =>
    `px-2.5 py-1 text-[10px] font-medium rounded transition-colors ${active ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:text-gray-300'}`

  return (
    <div style={{ width: panelW }} className="flex-none border-l border-gray-800 flex flex-col bg-gray-900/40 relative">

      {/* Drag-to-resize handle on left edge */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/60 active:bg-blue-500 transition-colors z-10"
        style={{ touchAction: 'none' }}
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
      />

      {/* Header: view tabs + dimensions */}
      <div className="flex-none pl-3 pr-4 py-2 border-b border-gray-800 flex items-center gap-0.5">
        <span className="text-[9px] text-gray-600 uppercase tracking-wider mr-2 select-none">Preview</span>
        {VIEWS.map(v => (
          <button key={v.id} onClick={() => setActiveView(v.id)} className={tabCls(activeView === v.id)}>
            {v.label}
          </button>
        ))}
        <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded font-medium ${
          drawerType === 'system'
            ? 'bg-violet-900/50 text-violet-300'
            : 'bg-blue-900/50 text-blue-300'
        }`}>
          {drawerType === 'system' ? 'System' : '5-Piece'}
        </span>
        <span className="ml-auto text-[9px] text-gray-600 font-mono whitespace-nowrap pl-2">
          {prevW}×{boxH}×{prevD}
        </span>
      </div>

      {/* View content */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

        {/* Parts strip */}
        <div className="flex-none border-b border-gray-700">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-gray-800/80 text-gray-400 uppercase tracking-wide text-[9px]">
                <th className="text-left font-semibold px-2 py-1 border-r border-gray-700">Part</th>
                <th className="text-right font-semibold px-2 py-1 border-r border-gray-700">L</th>
                <th className="text-right font-semibold px-2 py-1 border-r border-gray-700">W</th>
                <th className="text-right font-semibold px-2 py-1">T</th>
              </tr>
            </thead>
            <tbody>
              {previewParts.map((p, i) => (
                <tr key={i} className="border-t border-gray-800 even:bg-gray-800/20">
                  <td className="px-2 py-0.5 text-gray-400 border-r border-gray-800">{PART_LABELS[p.part_type] ?? p.part_type}</td>
                  <td className="px-2 py-0.5 text-right font-mono text-gray-200 border-r border-gray-800">{Math.max(p.DX, p.DY)}</td>
                  <td className="px-2 py-0.5 text-right font-mono text-gray-200 border-r border-gray-800">{Math.min(p.DX, p.DY)}</td>
                  <td className="px-2 py-0.5 text-right font-mono text-gray-200">{p.DZ}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Viewer */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {activeView === '3d' ? (
            <div className="w-full h-full">
              <DrawerBox3DView
                parts={previewParts}
                boxWidth={prevW}
                boxHeight={boxH}
                boxDepth={prevD}
                matCol={matCol}
                ebSpec={ebSpec}
              />
            </div>
          ) : (
            <ZoomableArea resetKey={`${activeView}-${prevW}-${boxH}-${prevD}`}>
              <div className="w-full h-full flex items-center justify-center p-4">
                {activeView === 'front' && <DbFrontView parts={previewParts} W={boxW} H={boxH} mat={matCol} slide={selSlide} casinetW={prevW} isSystem={drawerType === 'system'} />}
                {activeView === 'top'   && <DbTopView   parts={previewParts} W={boxW} D={prevD} mat={matCol} slide={selSlide} casinetW={prevW} isSystem={drawerType === 'system'} />}
                {activeView === 'side'  && <DbSideView  parts={previewParts} D={prevD} H={boxH} mat={matCol} isSystem={drawerType === 'system'} slide={selSlide} />}
              </div>
            </ZoomableArea>
          )}
        </div>
      </div>

      {/* Footer: material schedule + dimension inputs */}
      <div className="flex-none px-4 py-2 border-t border-gray-800 space-y-1.5 text-[10px]">
        {/* Material schedule picker */}
        <div className="flex items-center gap-2">
          <span className="text-gray-600 w-12 shrink-0">Schedule</span>
          <select
            value={selSchedId ?? ''}
            onChange={e => setSelSchedId(e.target.value || null)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-[10px] text-gray-300 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="">— generic —</option>
            {dbScheds.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        {/* Slide picker */}
        <div className="flex items-center gap-2">
          <span className="text-gray-600 w-12 shrink-0">Slide</span>
          <select
            value={selSlideId ?? ''}
            onChange={e => setSelSlideId(e.target.value || null)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-[10px] text-gray-300 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="">— none —</option>
            {slides.map(s => (
              <option key={s.id} value={s.id}>
                {s.brand ? `${s.brand} — ` : ''}{s.name}{s.nominal_length ? ` (${s.nominal_length}mm)` : ''}
              </option>
            ))}
          </select>
        </div>
        {/* Schedule material/edgeband editors */}
        {selSched && (
          <>
            {([
              { label: 'Box',    mField: 'material_id'        as keyof DbSched, ebField: 'edgeband_id'        as keyof DbSched },
              { label: 'Bottom', mField: 'bottom_material_id' as keyof DbSched, ebField: 'bottom_edgeband_id' as keyof DbSched },
            ]).map(({ label, mField, ebField }) => {
              const mId = (selSched[mField] as string | null) ?? ''
              const eId = (selSched[ebField] as string | null) ?? ''
              const opts = ebOpts(mId || null)
              return (
                <div key={label} className="flex items-center gap-1.5">
                  <span className="text-gray-600 w-12 shrink-0 text-right">{label}</span>
                  <select
                    value={mId}
                    onChange={e => saveSchedField(mField, e.target.value)}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-300 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {!mId && <option value="">— not set —</option>}
                    {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.dz}mm)</option>)}
                  </select>
                  <select
                    value={eId}
                    onChange={e => saveSchedField(ebField, e.target.value)}
                    disabled={!mId}
                    className="flex-1 bg-gray-800/60 border border-gray-700/60 rounded px-1.5 py-0.5 text-[10px] text-gray-400 focus:outline-none focus:border-purple-600 disabled:opacity-40 cursor-pointer"
                  >
                    <option value="">{mId ? '— no banding —' : '—'}</option>
                    {opts.map(eb => <option key={eb.id} value={eb.id}>{eb.name} ({eb.thickness}mm)</option>)}
                  </select>
                </div>
              )
            })}
          </>
        )}
        {/* Carcass / H / D inputs */}
        <div className="flex items-center gap-3 text-gray-600 pt-0.5 border-t border-gray-800/60">
          {([['Carcass', prevW, setPrevW], ['D', prevD, setPrevD]] as const).map(([label, val, set]) => (
            <label key={label} className="flex items-center gap-1">
              <span>{label}</span>
              <input
                type="number"
                min={50}
                max={1200}
                value={val}
                onChange={e => set(Number(e.target.value))}
                className="w-14 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-right text-gray-300 focus:outline-none focus:border-blue-500"
              />
              <span className="text-gray-700">mm</span>
            </label>
          ))}
          {/* H input: editable for 5-piece; read-only from slide for system */}
          <label className="flex items-center gap-1">
            <span>H</span>
            {drawerType === 'system' && selSlide?.box_height != null ? (
              <span className="w-14 bg-gray-800/50 border border-gray-700/50 rounded px-1.5 py-0.5 text-[10px] text-right text-gray-500 font-mono select-none">{boxH}</span>
            ) : (
              <input
                type="number"
                min={50}
                max={1200}
                value={prevH}
                onChange={e => setPrevH(Number(e.target.value))}
                className="w-14 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-right text-gray-300 focus:outline-none focus:border-blue-500"
              />
            )}
            <span className="text-gray-700">mm</span>
          </label>
          <span className="ml-auto text-right space-x-2">
            <span><span className="text-gray-500">box W: </span><span className="text-gray-300 font-mono">{boxW}mm</span></span>
            <span><span className="text-gray-500">box H: </span><span className="text-gray-300 font-mono">{boxH}mm</span></span>
          </span>
        </div>
      </div>
    </div>
  )
}
