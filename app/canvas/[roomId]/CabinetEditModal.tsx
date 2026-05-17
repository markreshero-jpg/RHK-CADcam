'use client'

import { useState, useEffect } from 'react'
import type { CabinetInstance, Wall } from '@/src/lib/types'
import type { ResolvedCabinet, ResolvedCasePart, ResolvedToekickPart, ResolvedInternalPart, ResolvedFaceZone } from '@/src/lib/resolver/types'
import CabinetPanel from './CabinetPanel'
import Cabinet3DView from './Cabinet3DView'
import FaceGridEditor from './FaceGridEditor'

type ViewId = 'top' | 'elevation' | 'side' | 'section-face' | 'section-interior' | 'parts' | '3d' | 'face'

const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'top',              label: 'Top' },
  { id: 'elevation',        label: 'Elevation' },
  { id: 'side',             label: 'Side' },
  { id: 'section-face',     label: 'Section Face' },
  { id: 'section-interior', label: 'Section Interior' },
  { id: 'face',             label: 'Face Grid' },
  { id: '3d',               label: '3D' },
  { id: 'parts',            label: 'Parts' },
]

// ── Fallback approximation constants (used when resolver data not available) ──
const PT   = 18
const BT   = 9
const FF   = 22
const FFS  = 38
const FFR  = 44
const TKH  = 150

// Drawing layout
const L = 130
const T = 100
const R = 80
const B = 70

// Palette
const C_PANEL  = '#374151'
const C_STROKE = '#4b5563'
const C_FACE   = '#4b5563'
const C_INT    = '#0f172a'
const C_DIM    = '#6b7280'
const C_LABEL  = '#9ca3af'
const C_WALL   = '#1e293b'
const C_CUT    = '#475569'

// Resolved part colours
const RC = {
  carcass: { fill: '#374151', stroke: '#4b5563' },
  toekick: { fill: '#451a03', stroke: '#92400e' },
  shelf:   { fill: '#1e1b4b', stroke: '#4338ca' },
  door:    { fill: '#1e3a5f', stroke: '#3b82f6' },
  drawer:  { fill: '#3b1f5f', stroke: '#8b5cf6' },
  face:    { fill: '#0f2240', stroke: '#60a5fa' },
}

function Hatch({ id }: { id: string }) {
  return (
    <pattern id={id} width={10} height={10} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1={0} y1={0} x2={0} y2={10} stroke={C_CUT} strokeWidth={3} />
    </pattern>
  )
}

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

// ── Resolved geometry helpers ─────────────────────────────────────────────────
// Cabinet coordinate origin: bottom-left-BACK corner (+X=right, +Y=up, +Z=front)
// DX = Z extent, DY = X or Y extent (see part type), DZ = material thickness

function isSidePanel(key: string) {
  return key === 'left_side' || key === 'right_side'
}

// Elevation (X-Y plane, front face):  ey = TOP of part in cabinet Y coords
function elevRect(p: { X: number; Y: number; DX: number; DY: number; DZ: number; part_key?: string }) {
  const isSide = p.part_key ? isSidePanel(p.part_key) : false
  return isSide
    ? { ex: p.X, ey: p.Y + p.DY, ew: p.DZ, eh: p.DY }
    : { ex: p.X, ey: p.Y + p.DZ, ew: p.DY, eh: p.DZ }
}
function tkElevRect(p: ResolvedToekickPart) {
  // spreader_horizontal lays flat: DX = X extent (100mm width), DY = Y extent (material thickness)
  if (p.part_key === 'spreader_horizontal') return { ex: p.X, ey: p.Y + p.DY, ew: p.DX, eh: p.DY }
  // All vertical toekick parts: DX = Y extent (height), DY = X extent (width)
  return { ex: p.X, ey: p.Y + p.DX, ew: p.DY, eh: p.DX }
}
function zoneElevRect(z: ResolvedFaceZone)    { return { ex: z.X, ey: z.Y + z.DX, ew: z.DY, eh: z.DX } }
function shelfElevRect(p: ResolvedInternalPart){ return { ex: p.X, ey: p.Y + p.DZ, ew: p.DY, eh: p.DZ } }

// Top (X-Z plane, looking down): wall at top (Z=0), front at bottom (Z=dz)
function topRect(p: ResolvedCasePart) {
  if (isSidePanel(p.part_key)) return { tx: p.X, tz: p.Z, tw: p.DZ, td: p.DX }
  if (p.part_key === 'back')   return { tx: p.X, tz: p.Z, tw: p.DY, td: p.DZ } // thin strip at back
  return { tx: p.X, tz: p.Z, tw: p.DY, td: p.DX }
}
function tkTopRect(p: ResolvedToekickPart) {
  // spreader_horizontal: DX = X extent (width), DZ = Z extent (depth)
  if (p.part_key === 'spreader_horizontal') return { tx: p.X, tz: p.Z, tw: p.DX, td: p.DZ }
  // spreader_vertical and face panels: DY = X extent, DZ = Z extent
  return { tx: p.X, tz: p.Z, tw: p.DY, td: p.DZ }
}
function shelfTopRect(p: ResolvedInternalPart){ return { tx: p.X, tz: p.Z, tw: p.DY, td: p.DX } }
function zoneTopRect(z: ResolvedFaceZone)     { return { tx: z.X, tz: z.Z, tw: z.DY, td: z.DZ } }

// Side (Z-Y plane, looking left from right): cy_top = TOP of part in cabinet Y coords
function sideRect(p: ResolvedCasePart): { sz: number; cy_top: number; sw: number; sh: number } | null {
  if (isSidePanel(p.part_key)) return { sz: p.Z, cy_top: p.Y + p.DY, sw: p.DX, sh: p.DY }
  if (p.part_key === 'back')   return null  // Y extent not encoded; skip
  return { sz: p.Z, cy_top: p.Y + p.DZ, sw: p.DX, sh: p.DZ }
}
function tkSideRect(p: ResolvedToekickPart) {
  // spreader_horizontal lays flat: DY = Y extent (thickness), DZ = Z extent (depth)
  if (p.part_key === 'spreader_horizontal') return { sz: p.Z, cy_top: p.Y + p.DY, sw: p.DZ, sh: p.DY }
  // Vertical parts: DX = Y extent (height), DZ = Z extent (depth)
  return { sz: p.Z, cy_top: p.Y + p.DX, sw: p.DZ, sh: p.DX }
}
function shelfSideRect(p: ResolvedInternalPart){ return { sz: p.Z, cy_top: p.Y + p.DZ, sw: p.DX, sh: p.DZ } }
function zoneSideRect(z: ResolvedFaceZone)     { return { sz: z.Z, cy_top: z.Y + z.DX, sw: z.DZ, sh: z.DX } }

// ── Resolved views ────────────────────────────────────────────────────────────

function ResolvedElevation({ cab, rp }: { cab: CabinetInstance; rp: ResolvedCabinet }) {
  const { dx, dy } = cab
  const pl = 80, pt = 50, pr = 40, pb = 40
  const vw = dx + pl + pr
  const vh = dy + pt + pb
  const ox = pl, oy = pt

  // ey = top of part in cabinet Y; svgY = oy + dy - ey
  function toSVG(ex: number, ey: number, ew: number, eh: number) {
    return { x: ox + ex, y: oy + dy - ey, w: ew, h: eh }
  }

  function faceColor(ft: string) {
    return ft === 'drawer_face' ? RC.drawer : RC.door
  }

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%' }}>
      {/* Interior bg */}
      <rect x={ox} y={oy} width={dx} height={dy} fill={C_INT} />

      {/* Toekick */}
      {rp.toekick_parts.map((p, i) => {
        const { ex, ey, ew, eh } = tkElevRect(p)
        const r = toSVG(ex, ey, ew, eh)
        const isSpreader = p.part_key === 'spreader_vertical' || p.part_key === 'spreader_horizontal'
        return isSpreader
          ? <rect key={`tk${i}`} x={r.x} y={r.y} width={r.w} height={r.h}
              fill="none" stroke={RC.toekick.stroke} strokeWidth={1} strokeDasharray="4 3" />
          : <rect key={`tk${i}`} x={r.x} y={r.y} width={r.w} height={r.h}
              fill={RC.toekick.fill} stroke={RC.toekick.stroke} strokeWidth={0.75} />
      })}

      {/* Shelves */}
      {rp.internal_parts.map((p, i) => {
        const { ex, ey, ew, eh } = shelfElevRect(p)
        const r = toSVG(ex, ey, ew, eh)
        return <rect key={`sh${i}`} x={r.x} y={r.y} width={r.w} height={r.h}
          fill={RC.shelf.fill} stroke={RC.shelf.stroke} strokeWidth={0.5} />
      })}

      {/* Carcass */}
      {rp.case_parts.map((p, i) => {
        const { ex, ey, ew, eh } = elevRect({ ...p, part_key: p.part_key })
        const r = toSVG(ex, ey, ew, eh)
        return <rect key={`cp${i}`} x={r.x} y={r.y} width={r.w} height={r.h}
          fill={RC.carcass.fill} stroke={RC.carcass.stroke} strokeWidth={0.75} />
      })}

      {/* Face zones */}
      {rp.face_zones.filter(z => z.face_type !== 'open').map((z, i) => {
        const { ex, ey, ew, eh } = zoneElevRect(z)
        const r = toSVG(ex, ey, ew, eh)
        const col = faceColor(z.face_type)
        return (
          <g key={`fz${i}`}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h}
              fill={col.fill} stroke={col.stroke} strokeWidth={1} fillOpacity={0.85} />
            {z.hinge_side === 'left'  && <line x1={r.x}      y1={r.y} x2={r.x}      y2={r.y+r.h} stroke={col.stroke} strokeWidth={2} />}
            {z.hinge_side === 'right' && <line x1={r.x+r.w}  y1={r.y} x2={r.x+r.w}  y2={r.y+r.h} stroke={col.stroke} strokeWidth={2} />}
          </g>
        )
      })}

      {/* Outline + floor */}
      <rect x={ox} y={oy} width={dx} height={dy} fill="none" stroke="#6b7280" strokeWidth={1.5} />
      <line x1={ox-20} y1={oy+dy} x2={ox+dx+20} y2={oy+dy} stroke="#334155" strokeWidth={2} strokeDasharray="8 4" />

      {dimH(ox, ox+dx, oy-35, `${dx}mm`, true)}
      {dimV(ox-50, oy, oy+dy, `${dy}mm`)}
      {viewLabel(ox+dx/2, vh-14, 'ELEVATION — WIDTH × HEIGHT')}
    </svg>
  )
}

function ResolvedTop({ cab, rp }: { cab: CabinetInstance; rp: ResolvedCabinet }) {
  const { dx, dz } = cab
  const wallH = 40
  const pl = 80, pt = 50 + wallH, pr = 40, pb = 50
  const vw = dx + pl + pr
  const vh = dz + pt + pb
  const ox = pl, oz = pt  // SVG origin: wall at top (z=0), front at bottom (z=dz)

  function toSVG(tx: number, tz: number, tw: number, td: number) {
    return { x: ox + tx, y: oz + tz, w: tw, h: td }
  }

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%' }}>
      {/* Wall indicator */}
      <rect x={ox} y={oz - wallH} width={dx} height={wallH} fill={C_WALL} stroke={C_STROKE} strokeWidth={1} />
      <text x={ox + dx/2} y={oz - wallH/2} textAnchor="middle" dominantBaseline="central"
        fontSize={18} fill="#475569" fontFamily="system-ui,sans-serif" letterSpacing={2}>WALL</text>

      {/* Interior bg */}
      <rect x={ox} y={oz} width={dx} height={dz} fill={C_INT} />

      {/* Shelves */}
      {rp.internal_parts.map((p, i) => {
        const r = shelfTopRect(p); const s = toSVG(r.tx, r.tz, r.tw, r.td)
        return <rect key={`sh${i}`} x={s.x} y={s.y} width={s.w} height={s.h}
          fill={RC.shelf.fill} stroke={RC.shelf.stroke} strokeWidth={0.5} />
      })}

      {/* Carcass */}
      {rp.case_parts.map((p, i) => {
        const r = topRect(p); const s = toSVG(r.tx, r.tz, r.tw, r.td)
        return <rect key={`cp${i}`} x={s.x} y={s.y} width={s.w} height={s.h}
          fill={RC.carcass.fill} stroke={RC.carcass.stroke} strokeWidth={0.75} />
      })}

      {/* Toekick */}
      {rp.toekick_parts.map((p, i) => {
        const r = tkTopRect(p); const s = toSVG(r.tx, r.tz, r.tw, r.td)
        return <rect key={`tk${i}`} x={s.x} y={s.y} width={s.w} height={s.h}
          fill={RC.toekick.fill} stroke={RC.toekick.stroke} strokeWidth={0.75} />
      })}

      {/* Face zones */}
      {rp.face_zones.filter(z => z.face_type !== 'open').map((z, i) => {
        const r = zoneTopRect(z); const s = toSVG(r.tx, r.tz, r.tw, r.td)
        const col = z.face_type === 'drawer_face' ? RC.drawer : RC.door
        return <rect key={`fz${i}`} x={s.x} y={s.y} width={s.w} height={s.h}
          fill={col.fill} stroke={col.stroke} strokeWidth={1} fillOpacity={0.85} />
      })}

      {/* Outline + front label */}
      <rect x={ox} y={oz} width={dx} height={dz} fill="none" stroke="#6b7280" strokeWidth={1.5} />
      <text x={ox + dx/2} y={oz + dz + 22} textAnchor="middle" dominantBaseline="central"
        fontSize={18} fill="#374151" fontFamily="system-ui,sans-serif">ACCESS</text>

      {dimH(ox, ox + dx, oz + dz + 50, `${dx}mm`)}
      {dimV(ox - 50, oz, oz + dz, `${dz}mm`)}
      {viewLabel(ox + dx/2, vh - 14, 'TOP — WIDTH × DEPTH')}
    </svg>
  )
}

function ResolvedSide({ cab, rp }: { cab: CabinetInstance; rp: ResolvedCabinet }) {
  const { dz, dy } = cab
  const wallW = 40

  const tkHeight = rp.toekick_parts
    .filter(p => p.part_key !== 'spreader_horizontal')
    .reduce((max, p) => Math.max(max, p.DX), 0)

  const kickZmin = rp.toekick_parts.reduce((min, p) => Math.min(min, p.Z), Infinity)
  const kickZmax = rp.toekick_parts.reduce((max, p) => Math.max(max, p.Z + p.DZ), -Infinity)

  const visibleZones = rp.face_zones
    .filter(z => z.face_type !== 'open')
    .sort((a, b) => a.Y - b.Y)

  const pl = 80 + wallW, pt = 80, pr = visibleZones.length > 0 ? 275 : 110, pb = 80
  const vw = dz + pl + pr
  const vh = dy + pt + pb
  const oz = pl, oy = pt  // SVG: Z goes left→right, Y goes bottom→top (flipped)

  // cy_top = top of part in cabinet Y
  function toSVG(sz: number, cy_top: number, sw: number, sh: number) {
    return { x: oz + sz, y: oy + dy - cy_top, w: sw, h: sh }
  }

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%' }}>
      {/* Wall indicator */}
      <rect x={oz - wallW} y={oy} width={wallW} height={dy} fill={C_WALL} stroke={C_STROKE} strokeWidth={1} />
      <text x={oz - wallW/2} y={oy + dy/2} textAnchor="middle" dominantBaseline="central"
        fontSize={16} fill="#475569" fontFamily="system-ui,sans-serif"
        transform={`rotate(-90,${oz - wallW/2},${oy + dy/2})`}>WALL</text>

      {/* Interior bg */}
      <rect x={oz} y={oy} width={dz} height={dy} fill={C_INT} />

      {/* Shelves */}
      {rp.internal_parts.map((p, i) => {
        const r = shelfSideRect(p); const s = toSVG(r.sz, r.cy_top, r.sw, r.sh)
        return <rect key={`sh${i}`} x={s.x} y={s.y} width={s.w} height={s.h}
          fill={RC.shelf.fill} stroke={RC.shelf.stroke} strokeWidth={0.5} />
      })}

      {/* Carcass */}
      {rp.case_parts.map((p, i) => {
        const r = sideRect(p); if (!r) return null
        const s = toSVG(r.sz, r.cy_top, r.sw, r.sh)
        return <rect key={`cp${i}`} x={s.x} y={s.y} width={s.w} height={s.h}
          fill={RC.carcass.fill} stroke={RC.carcass.stroke} strokeWidth={0.75} />
      })}

      {/* Toekick */}
      {rp.toekick_parts.map((p, i) => {
        const r = tkSideRect(p); const s = toSVG(r.sz, r.cy_top, r.sw, r.sh)
        return <rect key={`tk${i}`} x={s.x} y={s.y} width={s.w} height={s.h}
          fill={RC.toekick.fill} stroke={RC.toekick.stroke} strokeWidth={0.75} />
      })}

      {/* Face zones */}
      {rp.face_zones.filter(z => z.face_type !== 'open').map((z, i) => {
        const r = zoneSideRect(z); const s = toSVG(r.sz, r.cy_top, r.sw, r.sh)
        const col = z.face_type === 'drawer_face' ? RC.drawer : RC.door
        return <rect key={`fz${i}`} x={s.x} y={s.y} width={s.w} height={s.h}
          fill={col.fill} stroke={col.stroke} strokeWidth={1} fillOpacity={0.85} />
      })}

      {/* Outline + floor */}
      <rect x={oz} y={oy} width={dz} height={dy} fill="none" stroke="#6b7280" strokeWidth={1.5} />
      <line x1={oz-20} y1={oy+dy} x2={oz+dz+20} y2={oy+dy} stroke="#334155" strokeWidth={2} strokeDasharray="8 4" />

      {dimH(oz, oz + dz, oy - 50, `${dz}mm`, false)}
      {kickZmin < Infinity && dimH(oz + kickZmin, oz + kickZmax, oy + dy + 30, `${Math.round(kickZmax - kickZmin)}mm`)}
      {dimV(visibleZones.length > 0 ? oz + dz + 250 : oz + dz + 55, oy, oy + dy, `${dy}mm`, true)}
      {tkHeight > 0 && dimV(oz + dz + 90, oy + dy - tkHeight, oy + dy, `${Math.round(tkHeight)}mm`, true)}
      {visibleZones.map((z, i) => {
        const y1 = oy + dy - (z.Y + z.DX)
        const y2 = oy + dy - z.Y
        const next = visibleZones[i + 1]
        const gap = next ? next.Y - (z.Y + z.DX) : 0
        return (
          <g key={`fd${i}`}>
            {dimV(oz + dz + 90, y1, y2, `${Math.round(z.DX)}mm`, true)}
            {gap > 1 && dimV(oz + dz + 125, oy + dy - next.Y, y1, `${Math.round(gap)}mm`, true)}
          </g>
        )
      })}
    </svg>
  )
}

// ── Approximate fallback views (used when resolver data not available) ─────────

function TopView({ cab }: { cab: CabinetInstance }) {
  const { dx, dz, has_carcass, has_face } = cab
  const wallH = 50
  const vw = dx + L + R
  const vh = dz + T + B + wallH
  const x0 = L, y0 = T + wallH

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%' }}>
      <rect x={x0} y={T} width={dx} height={wallH} fill={C_WALL} stroke={C_STROKE} strokeWidth={1} />
      <text x={x0 + dx/2} y={T + wallH/2} textAnchor="middle" dominantBaseline="central" fontSize={20} fill="#475569" fontFamily="system-ui,sans-serif" letterSpacing={2}>WALL</text>
      <rect x={x0} y={y0} width={dx} height={dz} fill={C_INT} />
      {has_carcass && <>
        <rect x={x0} y={y0} width={dx} height={BT} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} />
        <rect x={x0} y={y0} width={PT} height={dz} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} />
        <rect x={x0 + dx - PT} y={y0} width={PT} height={dz} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} />
      </>}
      {has_face && (
        <rect x={x0} y={y0 + dz - FF} width={dx} height={FF} fill={C_FACE} stroke="#6b7280" strokeWidth={1.5} />
      )}
      <rect x={x0} y={y0} width={dx} height={dz} fill="none" stroke="#6b7280" strokeWidth={2} />
      <text x={x0 + dx/2} y={y0 + dz + 22} textAnchor="middle" dominantBaseline="central" fontSize={18} fill="#374151" fontFamily="system-ui,sans-serif">ACCESS</text>
      {dimH(x0, x0 + dx, y0 + dz + 50, `${dx}mm`)}
      {dimV(x0 - 50, y0, y0 + dz, `${dz}mm`)}
      {viewLabel(x0 + dx/2, vh - 14, 'TOP — WIDTH × DEPTH')}
    </svg>
  )
}

function ElevationView({ cab }: { cab: CabinetInstance }) {
  const { dx, dy, has_carcass, has_face, has_toekick, assembly_class, top_type } = cab
  const isBase = assembly_class === 'base' || assembly_class === 'base_corner'
  const carcH = isBase ? dy - TKH : dy
  const vw = dx + L + R
  const vh = dy + T + B
  const x0 = L, y0 = T

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%' }}>
      <rect x={x0} y={y0} width={dx} height={carcH} fill={C_INT} />
      {isBase && has_toekick && (
        <rect x={x0} y={y0 + carcH} width={dx} height={TKH} fill="#080f1a" stroke={C_STROKE} strokeWidth={1} />
      )}
      {has_carcass && <>
        <rect x={x0} y={y0} width={PT} height={carcH} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} />
        <rect x={x0 + dx - PT} y={y0} width={PT} height={carcH} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} />
        {top_type === 'full_top'
          ? <rect x={x0} y={y0} width={dx} height={PT} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} />
          : <>
              <rect x={x0} y={y0} width={FFS} height={PT} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} />
              <rect x={x0 + dx - FFS} y={y0} width={FFS} height={PT} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} />
            </>
        }
        {isBase && <rect x={x0} y={y0 + carcH - PT} width={dx} height={PT} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} />}
      </>}
      {has_face && <>
        <rect x={x0} y={y0} width={FFS} height={carcH} fill={C_FACE} stroke="#6b7280" strokeWidth={1} opacity={0.55} />
        <rect x={x0 + dx - FFS} y={y0} width={FFS} height={carcH} fill={C_FACE} stroke="#6b7280" strokeWidth={1} opacity={0.55} />
        <rect x={x0} y={y0} width={dx} height={FFR} fill={C_FACE} stroke="#6b7280" strokeWidth={1} opacity={0.55} />
        <rect x={x0} y={y0 + carcH - FFR} width={dx} height={FFR} fill={C_FACE} stroke="#6b7280" strokeWidth={1} opacity={0.55} />
      </>}
      <rect x={x0} y={y0} width={dx} height={dy} fill="none" stroke="#6b7280" strokeWidth={2} />
      <line x1={x0-20} y1={y0+dy} x2={x0+dx+20} y2={y0+dy} stroke="#334155" strokeWidth={2} strokeDasharray="10 5" />
      {dimH(x0, x0+dx, y0-50, `${dx}mm`, true)}
      {dimV(x0-50, y0, y0+dy, `${dy}mm`)}
      {viewLabel(x0+dx/2, vh-14, 'ELEVATION — WIDTH × HEIGHT')}
    </svg>
  )
}

function SideView({ cab }: { cab: CabinetInstance }) {
  const { dz, dy, has_carcass, has_face, has_toekick, assembly_class, top_type } = cab
  const isBase = assembly_class === 'base' || assembly_class === 'base_corner'
  const carcH = isBase ? dy - TKH : dy
  const vw = dz + L + R + 60
  const vh = dy + T + B
  const x0 = L, y0 = T
  const wallW = 50

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%' }}>
      <rect x={x0 - wallW} y={y0} width={wallW} height={dy} fill={C_WALL} stroke={C_STROKE} strokeWidth={1} />
      <text x={x0 - wallW/2} y={y0 + dy/2} textAnchor="middle" dominantBaseline="central" fontSize={18} fill="#475569" fontFamily="system-ui,sans-serif"
        transform={`rotate(-90,${x0 - wallW/2},${y0 + dy/2})`}>WALL</text>
      <rect x={x0} y={y0} width={dz} height={carcH} fill={C_INT} />
      {isBase && has_toekick && (
        <rect x={x0} y={y0 + carcH} width={dz} height={TKH} fill="#080f1a" stroke={C_STROKE} strokeWidth={1} />
      )}
      {has_carcass && <>
        <rect x={x0} y={y0} width={BT} height={dy} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} />
        {top_type === 'full_top'
          ? <rect x={x0} y={y0} width={dz} height={PT} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} />
          : <>
              <rect x={x0} y={y0} width={BT + PT} height={PT} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} />
              <rect x={x0 + dz - FF - PT} y={y0} width={FF + PT} height={PT} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} />
            </>
        }
        {isBase && <rect x={x0} y={y0 + carcH - PT} width={dz} height={PT} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} />}
        {isBase && has_toekick && (
          <rect x={x0 + dz - 60} y={y0 + carcH} width={60} height={TKH} fill={C_WALL} stroke={C_STROKE} strokeWidth={1} />
        )}
      </>}
      {has_face && (
        <rect x={x0 + dz - FF} y={y0} width={FF} height={carcH} fill={C_FACE} stroke="#6b7280" strokeWidth={1.5} opacity={0.6} />
      )}
      <rect x={x0} y={y0} width={dz} height={dy} fill="none" stroke="#6b7280" strokeWidth={2} />
      <line x1={x0-20} y1={y0+dy} x2={x0+dz+20} y2={y0+dy} stroke="#334155" strokeWidth={2} strokeDasharray="10 5" />
      {dimH(x0, x0+dz, y0-50, `${dz}mm`, true)}
      {dimV(x0+dz+55, y0, y0+dy, `${dy}mm`, true)}
      {isBase && has_toekick && dimV(x0+dz+90, y0+carcH, y0+dy, `${TKH}mm`, true)}
      {viewLabel(x0+dz/2, vh-14, 'SIDE — DEPTH × HEIGHT')}
    </svg>
  )
}

function SectionFaceView({ cab }: { cab: CabinetInstance }) {
  const { dx, dy, has_carcass, has_face, has_toekick, assembly_class, top_type } = cab
  const isBase = assembly_class === 'base' || assembly_class === 'base_corner'
  const carcH = isBase ? dy - TKH : dy
  const vw = dx + L + R
  const vh = dy + T + B
  const x0 = L, y0 = T
  const hid = 'h-sf'

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%' }}>
      <defs><Hatch id={hid} /></defs>
      <rect x={x0} y={y0} width={dx} height={carcH} fill={C_INT} />
      {isBase && has_toekick && (
        <rect x={x0} y={y0 + carcH} width={dx} height={TKH} fill="#080f1a" stroke={C_STROKE} strokeWidth={1} />
      )}
      {has_carcass && <>
        <rect x={x0} y={y0} width={PT} height={carcH} fill={`url(#${hid})`} stroke={C_CUT} strokeWidth={1.5} />
        <rect x={x0 + dx - PT} y={y0} width={PT} height={carcH} fill={`url(#${hid})`} stroke={C_CUT} strokeWidth={1.5} />
        {top_type === 'full_top'
          ? <rect x={x0} y={y0} width={dx} height={PT} fill={`url(#${hid})`} stroke={C_CUT} strokeWidth={1.5} />
          : <>
              <rect x={x0} y={y0} width={FFS} height={PT} fill={`url(#${hid})`} stroke={C_CUT} strokeWidth={1.5} />
              <rect x={x0 + dx - FFS} y={y0} width={FFS} height={PT} fill={`url(#${hid})`} stroke={C_CUT} strokeWidth={1.5} />
            </>
        }
        {isBase && <rect x={x0} y={y0 + carcH - PT} width={dx} height={PT} fill={`url(#${hid})`} stroke={C_CUT} strokeWidth={1.5} />}
      </>}
      {has_face && <>
        <rect x={x0} y={y0} width={FFS} height={carcH} fill={`url(#${hid})`} stroke={C_CUT} strokeWidth={2} opacity={0.8} />
        <rect x={x0 + dx - FFS} y={y0} width={FFS} height={carcH} fill={`url(#${hid})`} stroke={C_CUT} strokeWidth={2} opacity={0.8} />
        <rect x={x0 + FFS} y={y0} width={dx - FFS*2} height={FFR} fill={`url(#${hid})`} stroke={C_CUT} strokeWidth={1.5} opacity={0.8} />
        <rect x={x0 + FFS} y={y0 + carcH - FFR} width={dx - FFS*2} height={FFR} fill={`url(#${hid})`} stroke={C_CUT} strokeWidth={1.5} opacity={0.8} />
      </>}
      <rect x={x0} y={y0} width={dx} height={dy} fill="none" stroke="#6b7280" strokeWidth={2} />
      <line x1={x0-20} y1={y0+dy} x2={x0+dx+20} y2={y0+dy} stroke="#334155" strokeWidth={2} strokeDasharray="10 5" />
      <line x1={0} y1={y0-14} x2={vw} y2={y0-14} stroke="#3b82f6" strokeWidth={1} strokeDasharray="14 5" opacity={0.4} />
      {dimH(x0, x0+dx, y0-60, `${dx}mm`, true)}
      {dimV(x0-50, y0, y0+dy, `${dy}mm`)}
      {viewLabel(x0+dx/2, vh-14, 'SECTION FACE — cut at face plane')}
    </svg>
  )
}

function SectionInteriorView({ cab }: { cab: CabinetInstance }) {
  const { dz, dy, has_carcass, has_face, has_toekick, assembly_class, top_type } = cab
  const isBase = assembly_class === 'base' || assembly_class === 'base_corner'
  const carcH = isBase ? dy - TKH : dy
  const vw = dz + L + R + 60
  const vh = dy + T + B
  const x0 = L, y0 = T
  const hid = 'h-si'
  const wallW = 50

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%' }}>
      <defs><Hatch id={hid} /></defs>
      <rect x={x0 - wallW} y={y0} width={wallW} height={dy} fill={C_WALL} stroke={C_STROKE} strokeWidth={1} />
      <text x={x0 - wallW/2} y={y0 + dy/2} textAnchor="middle" dominantBaseline="central" fontSize={18} fill="#475569" fontFamily="system-ui,sans-serif"
        transform={`rotate(-90,${x0 - wallW/2},${y0 + dy/2})`}>WALL</text>
      <rect x={x0} y={y0} width={dz} height={carcH} fill={C_INT} />
      {isBase && has_toekick && (
        <rect x={x0} y={y0 + carcH} width={dz} height={TKH} fill="#080f1a" stroke={C_STROKE} strokeWidth={1} />
      )}
      {has_carcass && <>
        <rect x={x0} y={y0} width={BT} height={dy} fill={`url(#${hid})`} stroke={C_CUT} strokeWidth={1.5} />
        {top_type === 'full_top'
          ? <rect x={x0} y={y0} width={dz} height={PT} fill={`url(#${hid})`} stroke={C_CUT} strokeWidth={1.5} />
          : <>
              <rect x={x0} y={y0} width={BT+PT} height={PT} fill={`url(#${hid})`} stroke={C_CUT} strokeWidth={1.5} />
              <rect x={x0 + dz - FF - PT} y={y0} width={FF+PT} height={PT} fill={`url(#${hid})`} stroke={C_CUT} strokeWidth={1.5} />
            </>
        }
        {isBase && <rect x={x0} y={y0 + carcH - PT} width={dz} height={PT} fill={`url(#${hid})`} stroke={C_CUT} strokeWidth={1.5} />}
        {isBase && has_toekick && (
          <rect x={x0 + dz - 60} y={y0 + carcH} width={60} height={TKH} fill={C_WALL} stroke={C_STROKE} strokeWidth={1} />
        )}
      </>}
      {has_face && (
        <rect x={x0 + dz - FF} y={y0} width={FF} height={carcH} fill={`url(#${hid})`} stroke={C_CUT} strokeWidth={2} opacity={0.8} />
      )}
      <rect x={x0} y={y0} width={dz} height={dy} fill="none" stroke="#6b7280" strokeWidth={2} />
      <line x1={x0-20} y1={y0+dy} x2={x0+dz+20} y2={y0+dy} stroke="#334155" strokeWidth={2} strokeDasharray="10 5" />
      <line x1={0} y1={y0-14} x2={vw} y2={y0-14} stroke="#3b82f6" strokeWidth={1} strokeDasharray="14 5" opacity={0.4} />
      {dimH(x0, x0+dz, y0-60, `${dz}mm`, true)}
      {dimV(x0+dz+55, y0, y0+dy, `${dy}mm`, true)}
      {viewLabel(x0+dz/2, vh-14, 'SECTION INTERIOR — cut at mid-width')}
    </svg>
  )
}

// ── PARTS LIST ────────────────────────────────────────────────────────────────

const PART_LABEL: Record<string, string> = {
  left_side:           'Left Side',
  right_side:          'Right Side',
  bottom:              'Bottom',
  back:                'Back',
  full_top:            'Full Top',
  front_rail:          'Front Rail',
  back_rail:           'Back Rail',
  kick_front_face:     'Kick Front Face',
  kick_sub_front:      'Kick Sub Front',
  kick_back:           'Kick Back',
  spreader_vertical:   'Spreader (Vertical)',
  spreader_horizontal: 'Spreader (Horizontal)',
  adj_shelf:           'Adj. Shelf',
  fixed_shelf:         'Fixed Shelf',
  inner_drawer_bottom: 'Drawer Bottom',
  inner_drawer_back:   'Drawer Back',
}

const SECTION_COLOR: Record<string, string> = {
  carcass:  '#3b82f6',
  toekick:  '#f59e0b',
  internal: '#818cf8',
  face:     '#60a5fa',
}

function EBDots({ t, b, l, r }: { t: boolean; b: boolean; l: boolean; r: boolean }) {
  const dot = (on: boolean, label: string) => (
    <span
      key={label}
      title={`${label}: ${on ? 'banded' : 'no band'}`}
      className={`inline-block w-4 h-4 rounded-sm text-[9px] leading-4 text-center font-bold ${
        on ? 'bg-amber-500 text-gray-900' : 'bg-gray-700 text-gray-500'
      }`}
    >
      {label}
    </span>
  )
  return (
    <span className="flex gap-0.5">
      {dot(t, 'T')}{dot(b, 'B')}{dot(l, 'L')}{dot(r, 'R')}
    </span>
  )
}

function SectionHeader({ color, title, count }: { color: string; title: string; count: number }) {
  return (
    <tr>
      <td colSpan={5} className="pt-4 pb-1 px-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full flex-none" style={{ background: color }} />
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</span>
          <span className="text-[10px] text-gray-600 ml-1">{count} part{count !== 1 ? 's' : ''}</span>
        </div>
      </td>
    </tr>
  )
}

function PartRow({ name, dy, dx, dz, eb }: {
  name: string; dy: number; dx: number; dz: number
  eb: { top: boolean; bottom: boolean; left: boolean; right: boolean }
}) {
  return (
    <tr className="border-t border-gray-800/60 hover:bg-gray-800/30">
      <td className="px-3 py-1.5 text-xs text-gray-300">{name}</td>
      <td className="px-3 py-1.5 text-xs font-mono text-right text-gray-200">{Math.round(dy)}</td>
      <td className="px-3 py-1.5 text-xs font-mono text-right text-gray-200">{Math.round(dx)}</td>
      <td className="px-3 py-1.5 text-xs font-mono text-right text-gray-400">{Math.round(dz)}</td>
      <td className="px-3 py-1.5">
        <EBDots t={eb.top} b={eb.bottom} l={eb.left} r={eb.right} />
      </td>
    </tr>
  )
}

function PartsView({ rp }: { rp: ResolvedCabinet }) {
  const faceCount = rp.face_zones.filter(z => z.face_type !== 'open').length
  const totalParts = rp.case_parts.length + rp.toekick_parts.length + rp.internal_parts.length + faceCount

  return (
    <div className="w-full h-full overflow-auto p-4">
      <div className="text-[10px] text-gray-500 mb-3 flex items-center gap-3">
        <span>{totalParts} parts total</span>
        {rp.errors.length > 0 && <span className="text-red-400">{rp.errors.length} resolver error{rp.errors.length !== 1 ? 's' : ''}</span>}
        {rp.warnings.length > 0 && <span className="text-amber-400">{rp.warnings.length} warning{rp.warnings.length !== 1 ? 's' : ''}</span>}
      </div>
      {rp.errors.length > 0 && (
        <div className="mb-3 rounded bg-red-950/60 border border-red-800 px-3 py-2 text-xs text-red-300 space-y-0.5">
          {rp.errors.map((e, i) => <div key={i}>{e.code}: {e.message}</div>)}
        </div>
      )}
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-gray-700">
            <th className="px-3 pb-1.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">Part</th>
            <th className="px-3 pb-1.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider text-right">W (DY)</th>
            <th className="px-3 pb-1.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider text-right">H (DX)</th>
            <th className="px-3 pb-1.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider text-right">T (DZ)</th>
            <th className="px-3 pb-1.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">Edge</th>
          </tr>
        </thead>
        <tbody>
          {rp.case_parts.length > 0 && (
            <>
              <SectionHeader color={SECTION_COLOR.carcass} title="Carcass" count={rp.case_parts.length} />
              {rp.case_parts.map((p: ResolvedCasePart, i: number) => (
                <PartRow key={`cp-${i}`} name={PART_LABEL[p.part_key] ?? p.part_key}
                  dy={p.DY} dx={p.DX} dz={p.DZ} eb={p.edge_band} />
              ))}
            </>
          )}
          {rp.toekick_parts.length > 0 && (
            <>
              <SectionHeader color={SECTION_COLOR.toekick} title="Toekick" count={rp.toekick_parts.length} />
              {rp.toekick_parts.map((p: ResolvedToekickPart, i: number) => (
                <PartRow key={`tk-${i}`} name={PART_LABEL[p.part_key] ?? p.part_key}
                  dy={p.DY} dx={p.DX} dz={p.DZ} eb={p.edge_band} />
              ))}
            </>
          )}
          {rp.internal_parts.length > 0 && (
            <>
              <SectionHeader color={SECTION_COLOR.internal} title="Internal" count={rp.internal_parts.length} />
              {rp.internal_parts.map((p: ResolvedInternalPart, i: number) => (
                <PartRow key={`ip-${i}`} name={PART_LABEL[p.part_type] ?? p.part_type}
                  dy={p.DY} dx={p.DX} dz={p.DZ} eb={p.edge_band} />
              ))}
            </>
          )}
          {faceCount > 0 && (
            <>
              <SectionHeader color={SECTION_COLOR.face} title="Face" count={faceCount} />
              {rp.face_zones.filter((z: ResolvedFaceZone) => z.face_type !== 'open').map((z: ResolvedFaceZone, i: number) => (
                <PartRow key={`fz-${i}`}
                  name={`${z.face_type === 'door' ? 'Door' : z.face_type === 'drawer_face' ? 'Drawer Face' : 'False Panel'} R${z.row_index + 1}C${z.col_index + 1}`}
                  dy={z.DY} dx={z.DX} dz={z.DZ} eb={z.edge_band} />
              ))}
            </>
          )}
        </tbody>
      </table>
      <p className="mt-4 text-[10px] text-gray-600">
        W = DY (width) · H = DX (height/depth) · T = DZ (thickness) · all mm
      </p>
    </div>
  )
}

// ── MODAL ─────────────────────────────────────────────────────────────────────
export default function CabinetEditModal({
  cabinet, wall, wallCabinets, resolvedCabinet, initialView, onUpdate, onDelete, onClose, materialColours, ebByMatId,
}: {
  cabinet: CabinetInstance
  wall: Wall | null
  wallCabinets: CabinetInstance[]
  resolvedCabinet?: ResolvedCabinet
  initialView?: ViewId
  onUpdate: (id: string, u: Partial<CabinetInstance>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onClose: () => void
  materialColours?: Record<string, string | { face?: string; back?: string; edge?: string }>
  ebByMatId?: Record<string, { thickness: number; color: string | null }>
}) {
  const [activeView, setActiveView] = useState<ViewId>(initialView ?? 'elevation')

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const rp = resolvedCabinet

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onPointerDown={onClose}
    >
      <div
        className="flex w-full h-full max-w-7xl max-h-[92vh] bg-gray-900 rounded-xl shadow-2xl overflow-hidden"
        onPointerDown={e => e.stopPropagation()}
      >
        {/* Left: view tabs + canvas */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          {/* Header */}
          <div className="flex-none bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
            <div className="flex items-baseline gap-3">
              <span className="text-sm font-medium text-gray-200">
                {cabinet.label ?? cabinet.assembly_class.replace(/_/g, ' ')}
              </span>
              <span className="text-xs text-gray-500 font-mono">
                {cabinet.dx} × {cabinet.dy} × {cabinet.dz}mm
              </span>
              {!rp && (
                <span className="text-[10px] text-amber-600 italic">resolver data unavailable — showing approximate views</span>
              )}
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none px-1">✕</button>
          </div>
          {/* Tabs */}
          <div className="flex-none bg-gray-800/60 border-b border-gray-700 px-4 py-1.5 flex gap-1">
            {VIEWS.map(v => {
              const disabled = (v.id === 'parts' || v.id === '3d') && !rp
              return (
                <button
                  key={v.id}
                  onClick={() => !disabled && setActiveView(v.id)}
                  disabled={disabled}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    activeView === v.id
                      ? 'bg-blue-600 text-white'
                      : disabled
                      ? 'text-gray-600 cursor-not-allowed'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  {v.label}
                </button>
              )
            })}
          </div>
          {/* Content */}
          <div className={`flex-1 overflow-hidden ${
            activeView === 'parts' ? 'bg-gray-900'
            : activeView === '3d'  ? 'bg-gray-950'
            : activeView === 'face' ? 'bg-gray-950'
            : 'flex items-center justify-center bg-gray-950 p-6'
          }`}>
            {activeView === 'top' && (
              rp ? <ResolvedTop cab={cabinet} rp={rp} /> : <TopView cab={cabinet} />
            )}
            {activeView === 'elevation' && (
              rp ? <ResolvedElevation cab={cabinet} rp={rp} /> : <ElevationView cab={cabinet} />
            )}
            {activeView === 'side' && (
              rp ? <ResolvedSide cab={cabinet} rp={rp} /> : <SideView cab={cabinet} />
            )}
            {activeView === 'section-face'     && <SectionFaceView     cab={cabinet} />}
            {activeView === 'section-interior' && <SectionInteriorView cab={cabinet} />}
            {activeView === 'face'             && <FaceGridEditor cabinet={cabinet} rp={rp} onUpdate={onUpdate} />}
            {activeView === '3d'               && rp && <Cabinet3DView cab={cabinet} rp={rp} materialColours={materialColours} ebByMatId={ebByMatId} />}
            {activeView === 'parts'            && rp && <PartsView rp={rp} />}
          </div>
        </div>

        {/* Right: properties panel */}
        <div className="flex-none w-72 border-l border-gray-800 overflow-y-auto">
          <CabinetPanel
            cabinet={cabinet}
            wall={wall}
            wallCabinets={wallCabinets}
            room={null}
            onUpdate={onUpdate}
            onDelete={async id => { await onDelete(id); onClose() }}
          />
        </div>
      </div>
    </div>
  )
}
