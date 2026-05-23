'use client'

import React from 'react'
import { supabase } from '@/src/lib/supabase'
import type { PartMeta } from '@/src/components/three/PartViewer'
import { patchEdgeOverrideCache } from '@/src/lib/resolver/resolveCabinetFromDB'
import type {
  ResolvedCasePart, ResolvedToekickPart, ResolvedInternalPart,
  ResolvedFaceZone, ResolvedDrawerBoxPart, ResolvedDrawerSlide, ResolvedDrawerStack,
} from '@/src/lib/resolver/types'

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
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={C_DIM} strokeWidth={1.5} strokeDasharray="5 3" />
      <line x1={x1} y1={y - 8} x2={x1} y2={y + 8} stroke={C_DIM} strokeWidth={1.5} />
      <line x1={x2} y1={y - 8} x2={x2} y2={y + 8} stroke={C_DIM} strokeWidth={1.5} />
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
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={C_DIM} strokeWidth={1.5} strokeDasharray="5 3" />
      <line x1={x - 8} y1={y1} x2={x + 8} y2={y1} stroke={C_DIM} strokeWidth={1.5} />
      <line x1={x - 8} y1={y2} x2={x + 8} y2={y2} stroke={C_DIM} strokeWidth={1.5} />
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
export function shelfElevRect(p: ResolvedInternalPart) { return { ex: p.X, ey: p.Y + p.DZ, ew: p.DY, eh: p.DZ } }

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
  return {
    id: `int_${p.part_type}_${p.sort_order}`,
    label: `${INT_LABELS[p.part_type] ?? p.part_type} ${p.sort_order + 1}`,
    w: p.DY, h: p.DZ, d: p.DX,
    thickness: p.DZ, edge: p.edge_band, panelKind: 'horizontal',
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
