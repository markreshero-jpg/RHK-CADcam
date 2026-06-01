'use client'

import React, { useMemo } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { PartMeta } from '@/src/components/three/PartViewer'
import { patchEdgeOverrideCache } from '@/src/lib/resolver/resolveCabinetFromDB'
import { caseBox, type SeamDrill, type DrillAxis } from '@/src/lib/jointDrilling'
import type { PartPosOverrides } from './canvasDB'
import type {
  ResolvedCasePart, ResolvedToekickPart, ResolvedInternalPart,
  ResolvedFaceZone, ResolvedDrawerBoxPart, ResolvedDrawerSlide, ResolvedDrawerStack,
  ResolvedSlideDrill,
} from '@/src/lib/resolver/types'
import { slideSilhouettePath, slideSilhouetteOutline, type SlidePlacement } from '@/src/lib/slideSilhouette'
import { doorProfilePrimitives } from '@/src/lib/doorProfile'

// ── Palette ────────────────────────────────────────────────────────────────────
export const C_PANEL  = '#374151'
export const C_STROKE = '#4b5563'
export const C_FACE   = '#4b5563'
export const C_INT    = '#0f172a'
export const C_DIM    = '#6b7280'
export const C_LABEL  = '#9ca3af'
export const C_WALL   = '#1e293b'
export const C_CUT    = '#475569'

export const RC = {
  carcass:   { fill: '#374151', stroke: '#4b5563' },
  toekick:   { fill: '#451a03', stroke: '#92400e' },
  shelf:     { fill: '#1e1b4b', stroke: '#4338ca' },
  door:      { fill: '#1e3a5f', stroke: '#3b82f6' },
  drawer:    { fill: '#3b1f5f', stroke: '#8b5cf6' },
  face:      { fill: '#0f2240', stroke: '#60a5fa' },
  drawerBox: { fill: '#052e16', stroke: '#22c55e' },
  slide:     { fill: '#1c1917', stroke: '#d97706' },
}

// ── Part label maps ────────────────────────────────────────────────────────────
const CASE_LABELS: Record<string, string> = {
  left_side: 'Left Gable', right_side: 'Right Gable', bottom: 'Bottom Panel',
  back: 'Back Panel', full_top: 'Top Panel', front_rail: 'Front Top Rail', back_rail: 'Back Top Rail',
}
const TK_LABELS: Record<string, string> = {
  kick_front_face: 'Toe Kick Face', kick_sub_front: 'Toe Kick Sub-Front',
  kick_back: 'Toe Kick Back', spreader_vertical: 'Toe Kick Leg', spreader_horizontal: 'Toe Kick Spreader',
}
const INT_LABELS: Record<string, string> = {
  adj_shelf: 'Adjustable Shelf', fixed_shelf: 'Fixed Shelf',
  inner_drawer_bottom: 'Inner Drawer Bottom', inner_drawer_back: 'Inner Drawer Back',
  inner_drawer_side:   'Inner Drawer Side',  inner_drawer_front: 'Inner Drawer Front',
  pull_out_bottom:     'Pull-out Bottom',    pull_out_side:      'Pull-out Side',
  pull_out_back:       'Pull-out Back',
  accessory:           'Accessory',
  divider: 'Divider',
}
const FACE_LABELS_MAP: Record<string, string> = {
  door: 'Door', drawer_face: 'Drawer Face', false_panel: 'False Panel',
}
export const DB_PART_LABELS: Record<string, string> = {
  db_left_side: 'Drawer Box Left Side', db_right_side: 'Drawer Box Right Side',
  db_bottom: 'Drawer Box Bottom', db_front: 'Drawer Box Front', db_back: 'Drawer Box Back',
}

// ── SVG dimension helpers ──────────────────────────────────────────────────────

export function dimH(x1: number, x2: number, y: number, label: string, above = false) {
  const mid = (x1 + x2) / 2
  const ty = above ? y - 28 : y + 28
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={C_DIM} strokeWidth={1.5} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
      <line x1={x1} y1={y - 8} x2={x1} y2={y + 8} stroke={C_DIM} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <line x1={x2} y1={y - 8} x2={x2} y2={y + 8} stroke={C_DIM} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <text x={mid} y={ty} textAnchor="middle" dominantBaseline="central" fontSize={24} fill={C_LABEL} fontFamily="system-ui,sans-serif">{label}</text>
    </g>
  )
}

export function dimV(x: number, y1: number, y2: number, label: string, right = false) {
  const mid = (y1 + y2) / 2
  const tx = right ? x + 14 : x - 14
  const anchor = right ? 'start' : 'end'
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={C_DIM} strokeWidth={1.5} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
      <line x1={x - 8} y1={y1} x2={x + 8} y2={y1} stroke={C_DIM} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <line x1={x - 8} y1={y2} x2={x + 8} y2={y2} stroke={C_DIM} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <text x={tx} y={mid} textAnchor={anchor} dominantBaseline="central" fontSize={24} fill={C_LABEL} fontFamily="system-ui,sans-serif">{label}</text>
    </g>
  )
}

export function viewLabel(cx: number, y: number, text: string) {
  return <text x={cx} y={y} textAnchor="middle" dominantBaseline="central" fontSize={20} fill={C_CUT} fontFamily="system-ui,sans-serif" letterSpacing={1}>{text}</text>
}

// ── Geometry helpers ───────────────────────────────────────────────────────────
// Cabinet coordinate origin: bottom-left-BACK corner (+X=right, +Y=up, +Z=front)

export function isSidePanel(key: string) {
  return key === 'left_side' || key === 'right_side'
}

// Elevation (X-Y plane, front face)
export function elevRect(p: { X: number; Y: number; DX: number; DY: number; DZ: number; part_key?: string }) {
  const isSide = p.part_key ? isSidePanel(p.part_key) : false
  if (isSide) return { ex: p.X, ey: p.Y + p.DY, ew: p.DZ, eh: p.DY }
  if (p.part_key === 'back') return { ex: p.X, ey: p.Y + p.DZ + p.DX, ew: p.DY, eh: p.DX }
  return { ex: p.X, ey: p.Y + p.DZ, ew: p.DY, eh: p.DZ }
}
export function tkElevRect(p: ResolvedToekickPart) {
  if (p.part_key === 'spreader_horizontal') return { ex: p.X, ey: p.Y + p.DY, ew: p.DX, eh: p.DY }
  return { ex: p.X, ey: p.Y + p.DX, ew: p.DY, eh: p.DX }
}
export function zoneElevRect(z: ResolvedFaceZone)     { return { ex: z.X, ey: z.Y + z.DX, ew: z.DY, eh: z.DX } }

// Door-profile overlay for a face zone, mapped into an already-computed SVG rect.
// Returns inset-frame <rect>s + groove <line>s (face-local mm → rect, y flipped to
// SVG top-down). `sw` = stroke width in the caller's units. Shared by every
// elevation/sheet renderer so the profile geometry is computed in exactly one place.
export function doorProfileSvg(
  z: ResolvedFaceZone,
  rect: { x: number; y: number; w: number; h: number },
  stroke: string,
  sw: number,
  opacity = 0.85,
  nonScaling = false,
): React.ReactNode {
  if (z.face_type !== 'door' || !z.door_profile) return null
  const W = z.DY, H = z.DX
  if (W <= 0 || H <= 0) return null
  const prims = doorProfilePrimitives(z.door_profile, { w: W, h: H, thickness: z.DZ })
  if (prims.insetRects.length === 0 && prims.grooveLines.length === 0) return null
  const mapX = (lx: number) => rect.x + (lx / W) * rect.w
  const mapY = (ly: number) => rect.y + rect.h - (ly / H) * rect.h   // flip: local +y up → SVG +y down
  const ve = nonScaling ? ('non-scaling-stroke' as const) : undefined
  return (
    <g style={{ pointerEvents: 'none' }}>
      {prims.insetRects.map((ir, i) => {
        const x0 = mapX(ir.x), x1 = mapX(ir.x + ir.w)
        const y0 = mapY(ir.y + ir.h), y1 = mapY(ir.y)
        return (
          <rect key={`pir${i}`} x={Math.min(x0, x1)} y={Math.min(y0, y1)}
            width={Math.abs(x1 - x0)} height={Math.abs(y1 - y0)}
            fill="none" stroke={stroke} strokeWidth={sw} strokeOpacity={opacity} vectorEffect={ve} />
        )
      })}
      {prims.grooveLines.map((gl, i) => (
        <line key={`pgl${i}`} x1={mapX(gl.x1)} y1={mapY(gl.y1)} x2={mapX(gl.x2)} y2={mapY(gl.y2)}
          stroke={stroke} strokeWidth={sw} strokeOpacity={opacity} vectorEffect={ve} />
      ))}
    </g>
  )
}
export function shelfElevRect(p: ResolvedInternalPart) { return { ex: p.X, ey: p.Y + p.DZ, ew: p.DY, eh: p.DZ } }
export function intElevRect(p: ResolvedInternalPart) {
  switch (p.part_type) {
    case 'inner_drawer_front':
    case 'inner_drawer_back':
    case 'pull_out_back':
      // Face panel (drawer-box convention): DY = width (X), DX = height (Y)
      return { ex: p.X, ey: p.Y + p.DX, ew: p.DY, eh: p.DX }
    case 'inner_drawer_side':
    case 'pull_out_side':
      // Side panel edge-on: DZ = visible thickness (X), DY = height (Y)
      return { ex: p.X, ey: p.Y + p.DY, ew: p.DZ, eh: p.DY }
    case 'divider':
      // Divider edge-on: DZ = thickness (X), DY = height (Y)
      return { ex: p.X, ey: p.Y + p.DY, ew: p.DZ, eh: p.DY }
    default:
      // adj_shelf, fixed_shelf, accessory, inner_drawer_bottom, pull_out_bottom
      return { ex: p.X, ey: p.Y + p.DZ, ew: p.DY, eh: p.DZ }
  }
}

// Top (X-Z plane, looking down)
export function topRect(p: ResolvedCasePart) {
  if (isSidePanel(p.part_key)) return { tx: p.X, tz: p.Z, tw: p.DZ, td: p.DX }
  if (p.part_key === 'back')   return { tx: p.X, tz: p.Z, tw: p.DY, td: p.DZ }
  return { tx: p.X, tz: p.Z, tw: p.DY, td: p.DX }
}
export function tkTopRect(p: ResolvedToekickPart) {
  if (p.part_key === 'spreader_horizontal') return { tx: p.X, tz: p.Z, tw: p.DX, td: p.DZ }
  return { tx: p.X, tz: p.Z, tw: p.DY, td: p.DZ }
}
export function shelfTopRect(p: ResolvedInternalPart) { return { tx: p.X, tz: p.Z, tw: p.DY, td: p.DX } }
export function intTopRect(p: ResolvedInternalPart) {
  // Drawer-box-derived parts store Z = front-most edge (cabinet front = larger Z),
  // with the panel extending back. Subtract the depth/thickness to get the back
  // edge for top-view rendering. Shelves/dividers anchor at the back edge instead.
  switch (p.part_type) {
    case 'inner_drawer_side':
    case 'pull_out_side':
      return { tx: p.X, tz: p.Z - p.DX, tw: p.DZ, td: p.DX }
    case 'inner_drawer_bottom':
    case 'pull_out_bottom':
      return { tx: p.X, tz: p.Z - p.DX, tw: p.DY, td: p.DX }
    case 'inner_drawer_front':
    case 'inner_drawer_back':
    case 'pull_out_back':
      return { tx: p.X, tz: p.Z - p.DZ, tw: p.DY, td: p.DZ }
    case 'divider':
      return { tx: p.X, tz: p.Z, tw: p.DZ, td: p.DX }
    default:
      // adj_shelf, fixed_shelf, accessory — back-anchored
      return { tx: p.X, tz: p.Z, tw: p.DY, td: p.DX }
  }
}
export function zoneTopRect(z: ResolvedFaceZone)      { return { tx: z.X, tz: z.Z, tw: z.DY, td: z.DZ } }

// Side (Z-Y plane, looking left from right)
export function sideRect(p: ResolvedCasePart): { sz: number; cy_top: number; sw: number; sh: number } | null {
  if (isSidePanel(p.part_key)) return { sz: p.Z, cy_top: p.Y + p.DY, sw: p.DX, sh: p.DY }
  if (p.part_key === 'back')   return { sz: p.Z, cy_top: p.Y + p.DZ + p.DX, sw: p.DZ, sh: p.DX }
  return { sz: p.Z, cy_top: p.Y + p.DZ, sw: p.DX, sh: p.DZ }
}
export function tkSideRect(p: ResolvedToekickPart) {
  if (p.part_key === 'spreader_horizontal') return { sz: p.Z, cy_top: p.Y + p.DY, sw: p.DZ, sh: p.DY }
  return { sz: p.Z, cy_top: p.Y + p.DX, sw: p.DZ, sh: p.DX }
}
export function shelfSideRect(p: ResolvedInternalPart) { return { sz: p.Z, cy_top: p.Y + p.DZ, sw: p.DX, sh: p.DZ } }
export function intSideRect(p: ResolvedInternalPart) {
  // Same anchor logic as intTopRect: drawer-box-derived parts have Z =
  // front edge and extend back; shelves/dividers have Z = back edge.
  switch (p.part_type) {
    case 'inner_drawer_side':
    case 'pull_out_side':
      // Side panel seen face-on from cabinet side: depth × height
      return { sz: p.Z - p.DX, cy_top: p.Y + p.DY, sw: p.DX, sh: p.DY }
    case 'inner_drawer_bottom':
    case 'pull_out_bottom':
      // Bottom panel edge-on from side: depth × thickness
      return { sz: p.Z - p.DX, cy_top: p.Y + p.DZ, sw: p.DX, sh: p.DZ }
    case 'inner_drawer_front':
    case 'inner_drawer_back':
    case 'pull_out_back':
      // Face panel edge-on from side: thickness × height
      return { sz: p.Z - p.DZ, cy_top: p.Y + p.DX, sw: p.DZ, sh: p.DX }
    case 'divider':
      return { sz: p.Z, cy_top: p.Y + p.DY, sw: p.DX, sh: p.DY }
    default:
      return { sz: p.Z, cy_top: p.Y + p.DZ, sw: p.DX, sh: p.DZ }
  }
}
export function zoneSideRect(z: ResolvedFaceZone)      { return { sz: z.Z, cy_top: z.Y + z.DX, sw: z.DZ, sh: z.DX } }

// Drawer box & slide rects
export function dbElevRect(p: ResolvedDrawerBoxPart) {
  switch (p.part_type) {
    case 'db_left_side':
    case 'db_right_side': return { ex: p.X, ey: p.Y + p.DY, ew: p.DZ, eh: p.DY }
    case 'db_bottom':     return { ex: p.X, ey: p.Y + p.DZ, ew: p.DY, eh: p.DZ }
    case 'db_front':
    case 'db_back':
    default:              return { ex: p.X, ey: p.Y + p.DX, ew: p.DY, eh: p.DX }
  }
}
export function dbTopRect(p: ResolvedDrawerBoxPart) {
  switch (p.part_type) {
    case 'db_left_side':
    case 'db_right_side': return { tx: p.X, tz: p.Z - p.DX, tw: p.DZ, td: p.DX }
    case 'db_bottom':     return { tx: p.X, tz: p.Z - p.DX, tw: p.DY, td: p.DX }
    case 'db_front':
    case 'db_back':
    default:              return { tx: p.X, tz: p.Z - p.DZ, tw: p.DY, td: p.DZ }
  }
}
export function dbSideRect(p: ResolvedDrawerBoxPart) {
  switch (p.part_type) {
    case 'db_left_side':
    case 'db_right_side': return { sz: p.Z - p.DX, cy_top: p.Y + p.DY, sw: p.DX, sh: p.DY }
    case 'db_bottom':     return { sz: p.Z - p.DX, cy_top: p.Y + p.DZ, sw: p.DX, sh: p.DZ }
    case 'db_front':
    case 'db_back':
    default:              return { sz: p.Z - p.DZ, cy_top: p.Y + p.DX, sw: p.DZ, sh: p.DX }
  }
}
export function slideElevRect(s: ResolvedDrawerSlide) { return { ex: s.X, ey: s.Y + s.DY, ew: s.DZ, eh: s.DY } }
export function slideTopRect(s: ResolvedDrawerSlide)  { return { tx: s.X, tz: s.Z, tw: s.DZ, td: s.DX } }
export function slideSideRect(s: ResolvedDrawerSlide) { return { sz: s.Z, cy_top: s.Y + s.DY, sw: s.DX, sh: s.DY } }

// ── PartMeta builders ──────────────────────────────────────────────────────────

export function svgCaseMeta(p: ResolvedCasePart): PartMeta {
  const isS = isSidePanel(p.part_key), isB = p.part_key === 'back'
  return {
    id: `case_${p.part_key}`, label: CASE_LABELS[p.part_key] ?? p.part_key,
    w: isS ? p.DZ : p.DY, h: isS ? p.DY : isB ? p.DX : p.DZ, d: isS ? p.DX : isB ? p.DZ : p.DX,
    thickness: p.DZ, edge: p.edge_band,
    panelKind: isS ? 'side' : isB ? 'face' : 'horizontal',
    x: p.X, y: p.Y, z: p.Z, ax: p.AX, ay: p.AY, az: p.AZ,
  }
}
export function svgTkMeta(p: ResolvedToekickPart): PartMeta {
  const isH = p.part_key === 'spreader_horizontal'
  return {
    id: `tk_${p.part_key}_${p.sort_order}`, label: TK_LABELS[p.part_key] ?? p.part_key,
    w: isH ? p.DX : p.DY, h: isH ? p.DY : p.DX, d: p.DZ,
    thickness: p.DZ, edge: p.edge_band,
    panelKind: isH ? 'horizontal' : 'face',
    detail: p.sort_order > 0 ? `#${p.sort_order}` : undefined,
    x: p.X, y: p.Y, z: p.Z, ax: p.AX, ay: p.AY, az: p.AZ,
  }
}
export function svgIntMeta(p: ResolvedInternalPart): PartMeta {
  // Pick W/H/D and panelKind from the part's drawer-box-style dimension role:
  //   side  panels: DZ × DY × DX  (thin, tall, deep)
  //   face  panels: DY × DX × DZ  (wide, tall, thin)
  //   horiz panels: DY × DZ × DX  (wide, thin, deep) — also shelves/accessory
  let w: number, h: number, d: number, panelKind: 'side' | 'face' | 'horizontal'
  switch (p.part_type) {
    case 'inner_drawer_side':
    case 'pull_out_side':
    case 'divider':
      w = p.DZ; h = p.DY; d = p.DX; panelKind = 'side'; break
    case 'inner_drawer_front':
    case 'inner_drawer_back':
    case 'pull_out_back':
      w = p.DY; h = p.DX; d = p.DZ; panelKind = 'face'; break
    default:
      w = p.DY; h = p.DZ; d = p.DX; panelKind = 'horizontal'; break
  }
  return {
    id: `int_${p.part_type}_${p.sort_order}`,
    label: `${INT_LABELS[p.part_type] ?? p.part_type} ${p.sort_order + 1}`,
    w, h, d,
    thickness: p.DZ, edge: p.edge_band,
    panelKind,
    detail: p.y_locked ? 'Position locked' : undefined,
    x: p.X, y: p.Y, z: p.Z, ax: p.AX, ay: p.AY, az: p.AZ,
  }
}
export function svgZoneMeta(z: ResolvedFaceZone): PartMeta {
  return {
    id: `zone_${z.row_index}_${z.col_index}`,
    label: FACE_LABELS_MAP[z.face_type] ?? z.face_type,
    w: z.DY, h: z.DX, d: z.DZ,
    thickness: z.DZ, edge: z.edge_band, panelKind: 'face',
    detail: [`Row ${z.row_index + 1}, Col ${z.col_index + 1}`, z.hinge_side ? `Hinge: ${z.hinge_side}` : null].filter(Boolean).join(' · '),
    x: z.X, y: z.Y, z: z.Z, ax: z.AX, ay: z.AY, az: z.AZ,
  }
}
export function svgDbMeta(p: ResolvedDrawerBoxPart, stack: ResolvedDrawerStack): PartMeta {
  const isS = p.part_type === 'db_left_side' || p.part_type === 'db_right_side'
  const isH = p.part_type === 'db_bottom'
  const [w, h, d] = isS ? [p.DZ, p.DY, p.DX] : isH ? [p.DY, p.DZ, p.DX] : [p.DY, p.DX, p.DZ]
  return {
    id: `db_${stack.face_zone_row}_${stack.face_zone_col}_${p.part_type}`,
    label: DB_PART_LABELS[p.part_type] ?? p.part_type,
    w, h, d, thickness: p.DZ, edge: p.edge_band,
    panelKind: isS ? 'side' : isH ? 'horizontal' : 'face',
    detail: `Row ${stack.face_zone_row + 1}, Col ${stack.face_zone_col + 1} · ${stack.drawer_type}`,
    x: p.X, y: p.Y, z: p.Z, ax: p.AX, ay: p.AY, az: p.AZ,
  }
}
export function svgSlideMeta(s: ResolvedDrawerSlide, stack: ResolvedDrawerStack): PartMeta {
  return {
    id: `slide_${stack.face_zone_row}_${stack.face_zone_col}_${s.side}`,
    label: `Drawer Slide (${s.side})`,
    w: s.DZ, h: s.DY, d: s.DX, thickness: s.DZ,
    edge: { top: false, bottom: false, left: false, right: false }, panelKind: 'side',
    detail: `${s.nominal_length}mm NL · Box ht ${s.box_height}mm`,
    x: s.X, y: s.Y, z: s.Z,
  }
}

// Inner-drawer / pull-out slide — no parent stack, keyed by the slide's
// inner_drawer_index so the id is stable across re-resolves.
export function svgInternalSlideMeta(s: ResolvedDrawerSlide): PartMeta {
  const idx = s.inner_drawer_index ?? 0
  return {
    id: `int_slide_${idx}_${s.side}`,
    label: `Inner Drawer Slide (${s.side})`,
    w: s.DZ, h: s.DY, d: s.DX, thickness: s.DZ,
    edge: { top: false, bottom: false, left: false, right: false }, panelKind: 'side',
    detail: `${s.nominal_length}mm NL · Box ht ${s.box_height}mm`,
    x: s.X, y: s.Y, z: s.Z,
  }
}

// ── Edge persistence ───────────────────────────────────────────────────────────

export async function saveSVGEdge(cabId: string, part: PartMeta) {
  const { id, edge } = part
  const direct = { edge_band_top: edge.top, edge_band_bottom: edge.bottom, edge_band_left: edge.left, edge_band_right: edge.right }
  let result: { error: unknown }
  if (id.startsWith('case_')) {
    result = await supabase.from('case_parts').update(direct).eq('cabinet_instance_id', cabId).eq('part_key', id.slice(5))
  } else if (id.startsWith('tk_')) {
    const rest = id.slice(3), cut = rest.lastIndexOf('_')
    result = await supabase.from('toekick_parts').update(direct).eq('cabinet_instance_id', cabId).eq('part_key', rest.slice(0, cut)).eq('sort_order', parseInt(rest.slice(cut + 1)))
  } else if (id.startsWith('int_')) {
    const rest = id.slice(4), cut = rest.lastIndexOf('_')
    result = await supabase.from('internal_parts').update({ edge_band_top: edge.top, edge_band_bottom: edge.bottom, edge_band_back: edge.left, edge_band_front: edge.right }).eq('cabinet_instance_id', cabId).eq('part_type', rest.slice(0, cut)).eq('sort_order', parseInt(rest.slice(cut + 1)))
  } else if (id.startsWith('zone_')) {
    const [row, col] = id.slice(5).split('_').map(Number)
    result = await supabase.from('face_zones').update(direct).eq('cabinet_instance_id', cabId).eq('row_index', row).eq('col_index', col)
  } else {
    return
  }
  if (result.error) console.error('[svg edge save]', result.error)
  else patchEdgeOverrideCache(cabId, id, edge)
}

// ── Hit testing ────────────────────────────────────────────────────────────────

export function svgHitParts(e: React.MouseEvent, partMap: Map<string, PartMeta>): PartMeta[] {
  const hits: PartMeta[] = []
  const seen = new Set<string>()
  for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
    const id = el.getAttribute('data-part-id')
    if (id && partMap.has(id) && !seen.has(id)) {
      hits.push(partMap.get(id)!)
      seen.add(id)
    }
  }
  return hits
}

export function partIdColor(id: string): string {
  if (id.startsWith('case_'))  return RC.carcass.stroke
  if (id.startsWith('tk_'))    return RC.toekick.stroke
  if (id.startsWith('int_'))   return RC.shelf.stroke
  if (id.startsWith('zone_'))  return RC.door.stroke
  if (id.startsWith('db_'))    return RC.drawerBox.stroke
  if (id.startsWith('slide_')) return RC.slide.stroke
  return '#6b7280'
}

// ── Joint drilling overlay (2D ortho views) ─────────────────────────────────────
// Projects the shared cabinet-space drill ops (jointDrilling.seamDrillOps) onto the
// active view plane. A hole whose drill axis points at the viewer (perpendicular to
// the plane) is shown as a circle = tool diameter — you're looking down the bore.
// A hole whose axis lies in the plane is shown as a slot running from the entry
// face into the panel by the drill depth = an edge bore seen side-on.
// Colour follows the seam source: green = cabinet override, blue = method default.

const DRILL_COL: Record<SeamDrill['source'], string> = { cabinet: '#22c55e', method: '#60a5fa' }

export function DrillOverlay({ drills, project, perp, dirOf }: {
  drills:  SeamDrill[]
  project: (x: number, y: number, z: number) => { x: number; y: number }
  perp:    'x' | 'y' | 'z'
  dirOf:   (axis: DrillAxis) => { dx: number; dy: number }
}) {
  if (drills.length === 0) return null
  return (
    <g style={{ pointerEvents: 'none' }}>
      {drills.map((d, i) => {
        const { x: sx, y: sy } = project(d.x, d.y, d.z)
        const col = DRILL_COL[d.source]
        const r   = Math.max(d.radius, 0.75)

        if (d.axis[0] === perp) {
          // Looking down the bore → circle = tool diameter.
          return (
            <circle key={i} cx={sx} cy={sy} r={r}
              fill={col} fillOpacity={0.4} stroke={col} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
          )
        }

        // In-plane axis → slot from the entry face into the panel by drill depth.
        const dir = dirOf(d.axis)
        const ex  = sx + dir.dx * d.depthLen
        const ey  = sy + dir.dy * d.depthLen
        return (
          <g key={i}>
            <line x1={sx} y1={sy} x2={ex} y2={ey}
              stroke={col} strokeOpacity={0.35} strokeWidth={r * 2} strokeLinecap="butt" />
            <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={col} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
          </g>
        )
      })}
    </g>
  )
}

// Slide drilling overlay — identical geometry to DrillOverlay but for the holes
// a drawer slide imposes (ResolvedSlideDrill, no seam source). Drawn amber to
// stand apart from the green/blue carcase-joint holes, matching the amber slide
// markers in the 3D view.
const SLIDE_DRILL_COL = '#d97706'   // amber-600

export function SlideDrillOverlay({ drills, project, perp, dirOf }: {
  drills:  ResolvedSlideDrill[]
  project: (x: number, y: number, z: number) => { x: number; y: number }
  perp:    'x' | 'y' | 'z'
  dirOf:   (axis: DrillAxis) => { dx: number; dy: number }
}) {
  if (drills.length === 0) return null
  return (
    <g style={{ pointerEvents: 'none' }}>
      {drills.map((d, i) => {
        const { x: sx, y: sy } = project(d.x, d.y, d.z)
        const r = Math.max(d.radius, 0.75)

        if (d.axis[0] === perp) {
          // Looking down the bore → circle = tool diameter.
          return (
            <circle key={i} cx={sx} cy={sy} r={r}
              fill={SLIDE_DRILL_COL} fillOpacity={0.4} stroke={SLIDE_DRILL_COL} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
          )
        }

        // In-plane axis → slot from the entry face into the panel by drill depth.
        const dir = dirOf(d.axis)
        const ex  = sx + dir.dx * d.depthLen
        const ey  = sy + dir.dy * d.depthLen
        return (
          <g key={i}>
            <line x1={sx} y1={sy} x2={ex} y2={ey}
              stroke={SLIDE_DRILL_COL} strokeOpacity={0.35} strokeWidth={r * 2} strokeLinecap="butt" />
            <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={SLIDE_DRILL_COL} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
          </g>
        )
      })}
    </g>
  )
}

// ── Rotatable part shape ────────────────────────────────────────────────────────
// A 2D ortho view normally draws each part as an axis-aligned rect. When the part
// carries a rotation override (oax/oay/oaz) a flat rect can't show it, so we project
// the rotated 3D box's silhouette onto the view plane and draw that polygon instead.
// The cabinet-space AABB of each part type (below) matches Cabinet3DView's box
// helpers so 2D and 3D agree.

export type Box3 = { x: number; y: number; z: number; w: number; h: number; d: number }

export { caseBox }
export function tkBox3(p: ResolvedToekickPart): Box3 {
  return p.part_key === 'spreader_horizontal'
    ? { x: p.X, y: p.Y, z: p.Z, w: p.DX, h: p.DY, d: p.DZ }
    : { x: p.X, y: p.Y, z: p.Z, w: p.DY, h: p.DX, d: p.DZ }
}
export function intBox3(p: ResolvedInternalPart): Box3 {
  // AABB anchor must match cabinet coords: drawer-box-derived parts have
  // Z = front edge and extend back by depth, so subtract to get the back-edge
  // origin (`x,y,z` is the AABB minimum corner). Shelves/dividers anchor at back.
  switch (p.part_type) {
    case 'inner_drawer_side':
    case 'pull_out_side':
      return { x: p.X, y: p.Y, z: p.Z - p.DX, w: p.DZ, h: p.DY, d: p.DX }
    case 'inner_drawer_bottom':
    case 'pull_out_bottom':
      return { x: p.X, y: p.Y, z: p.Z - p.DX, w: p.DY, h: p.DZ, d: p.DX }
    case 'inner_drawer_front':
    case 'inner_drawer_back':
    case 'pull_out_back':
      return { x: p.X, y: p.Y, z: p.Z - p.DZ, w: p.DY, h: p.DX, d: p.DZ }
    case 'divider':
      return { x: p.X, y: p.Y, z: p.Z, w: p.DZ, h: p.DY, d: p.DX }
    default:
      // adj_shelf, fixed_shelf, accessory
      return { x: p.X, y: p.Y, z: p.Z, w: p.DY, h: p.DZ, d: p.DX }
  }
}
export function zoneBox3(z: ResolvedFaceZone): Box3 {
  return { x: z.X, y: z.Y, z: z.Z, w: z.DY, h: z.DX, d: z.DZ }
}
export function dbBox3(p: ResolvedDrawerBoxPart): Box3 {
  switch (p.part_type) {
    case 'db_left_side':
    case 'db_right_side': return { x: p.X, y: p.Y, z: p.Z - p.DX, w: p.DZ, h: p.DY, d: p.DX }
    case 'db_bottom':     return { x: p.X, y: p.Y, z: p.Z - p.DX, w: p.DY, h: p.DZ, d: p.DX }
    default:              return { x: p.X, y: p.Y, z: p.Z - p.DZ, w: p.DY, h: p.DX, d: p.DZ }
  }
}
export function slideBox3(s: ResolvedDrawerSlide): Box3 {
  return { x: s.X, y: s.Y, z: s.Z, w: s.DZ, h: s.DY, d: s.DX }
}

// Rotate a local offset by an Euler (degrees), matching three.js Matrix4
// makeRotationFromEuler order 'XYZ' so the 2D silhouette equals the 3D rotation.
function rotEulerXYZ(axDeg: number, ayDeg: number, azDeg: number, x: number, y: number, z: number): [number, number, number] {
  const D = Math.PI / 180
  const a = Math.cos(axDeg * D), b = Math.sin(axDeg * D)
  const c = Math.cos(ayDeg * D), d = Math.sin(ayDeg * D)
  const e = Math.cos(azDeg * D), f = Math.sin(azDeg * D)
  const ae = a * e, af = a * f, be = b * e, bf = b * f
  return [
    (c * e) * x + (-c * f) * y + (d) * z,
    (af + be * d) * x + (ae - bf * d) * y + (-b * c) * z,
    (bf - ae * d) * x + (be + af * d) * y + (a * c) * z,
  ]
}

type P2 = { x: number; y: number }

function convexHull(points: P2[]): P2[] {
  const pts = points.slice().sort((p, q) => p.x - q.x || p.y - q.y)
  if (pts.length < 3) return pts
  const cross = (o: P2, a: P2, b: P2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: P2[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: P2[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop(); upper.pop()
  return lower.concat(upper)
}

type PartOv = PartPosOverrides[string]

// Returns the SVG polygon points for a rotated part, or null if there's no rotation
// (caller then draws the plain rect). `project` maps cabinet (x,y,z) → svg (x,y).
// Rotation pivots about the part's reference point (origin corner box.x/y/z + offset),
// matching the 3D Part, so the corner stays put and the part swings around it.
export function rotatedBoxPolygon(
  box: Box3,
  ov: PartOv | undefined,
  project: (x: number, y: number, z: number) => P2,
): string | null {
  if (!ov || (!ov.oax && !ov.oay && !ov.oaz)) return null
  const ox0 = box.x + (ov.ox ?? 0)
  const oy0 = box.y + (ov.oy ?? 0)
  const oz0 = box.z + (ov.oz ?? 0)
  const pts: P2[] = []
  for (const sx of [0, 1]) for (const sy of [0, 1]) for (const sz of [0, 1]) {
    const [rx, ry, rz] = rotEulerXYZ(ov.oax ?? 0, ov.oay ?? 0, ov.oaz ?? 0, sx * box.w, sy * box.h, sz * box.d)
    pts.push(project(ox0 + rx, oy0 + ry, oz0 + rz))
  }
  return convexHull(pts).map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
}

// Draws a part as an axis-aligned rect, or — when it has a rotation override — as the
// projected silhouette of its rotated 3D box. Same fill/stroke/hit-test either way.
export function PartShape({
  x, y, w, h, box, ov, project, fill, stroke, strokeWidth, strokeDasharray, fillOpacity, dataPartId, style,
}: {
  x: number; y: number; w: number; h: number
  box?: Box3
  ov?: PartOv
  project?: (x: number, y: number, z: number) => P2
  fill: string; stroke: string; strokeWidth: number
  strokeDasharray?: string; fillOpacity?: number
  dataPartId: string; style?: React.CSSProperties
}) {
  const poly = box && project ? rotatedBoxPolygon(box, ov, project) : null
  if (poly) {
    return <polygon points={poly} fill={fill} stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke"
      strokeDasharray={strokeDasharray} fillOpacity={fillOpacity} data-part-id={dataPartId} style={style} />
  }
  return <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke"
    strokeDasharray={strokeDasharray} fillOpacity={fillOpacity} data-part-id={dataPartId} style={style} />
}

// ── Slide silhouette ────────────────────────────────────────────────────────────
// Draws a drawer slide as the TRUE projected shape of its uploaded 3D model when
// the geometry is available, falling back to the box (PartShape) while the model
// loads, on load failure, when no model is attached, or when a rotation override
// is present (the box path already handles rotation, the silhouette doesn't).

const SLIDE_SEL = '#f59e0b'

export function SlideShape({
  rectX, rectY, rectW, rectH, box, ov, project, slide, tris, selected,
  stroke, strokeWidth, strokeDasharray, dataPartId, style,
}: {
  rectX: number; rectY: number; rectW: number; rectH: number
  box: Box3
  ov?: PartOv
  project: (x: number, y: number, z: number) => { x: number; y: number }
  slide: SlidePlacement
  tris?: Float32Array
  wireMode: boolean
  selected: boolean
  fill: string; stroke: string; strokeWidth: number
  strokeDasharray?: string
  dataPartId: string; style?: React.CSSProperties
}) {
  const rotated = !!ov && (!!ov.oax || !!ov.oay || !!ov.oaz)
  const useModel = !!tris && tris.length > 0 && !rotated
  // eslint-disable-next-line react-hooks/exhaustive-deps -- project is a stable mapping for a given view; depend on the placement instead
  const paths = useMemo(() => {
    if (!useModel) return null
    const fill = slideSilhouettePath(tris!, slide, project)
    if (!fill) return null
    return { fill, outline: slideSilhouetteOutline(tris!, slide, project) }
  }, [useModel, tris, slide.X, slide.Y, slide.Z, slide.DX, slide.DY, slide.DZ, slide.side,
      slide.model_scale, slide.model_anchor_x, slide.model_anchor_y, slide.model_anchor_z])

  // Slides always render as an OUTLINE (never a solid fill). A transparent fill
  // keeps the interior clickable (same trick the wire-mode parts use); the visible
  // edge is the stroked outline / box border.
  if (!paths) {
    return <PartShape x={rectX} y={rectY} w={rectW} h={rectH} box={box} ov={ov} project={project}
      fill="transparent" stroke={selected ? SLIDE_SEL : stroke} strokeWidth={strokeWidth}
      strokeDasharray={selected ? undefined : strokeDasharray} dataPartId={dataPartId} style={style} />
  }

  return (
    <g>
      <path d={paths.fill} fill="transparent" stroke="none" data-part-id={dataPartId} style={style} />
      {paths.outline && (
        <path d={paths.outline} fill="none"
          stroke={selected ? SLIDE_SEL : stroke} strokeWidth={selected ? 1.5 : strokeWidth}
          strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
          style={{ pointerEvents: 'none' }} />
      )}
    </g>
  )
}
