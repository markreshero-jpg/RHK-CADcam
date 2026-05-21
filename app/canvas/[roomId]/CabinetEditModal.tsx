'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { CabinetInstance, Wall } from '@/src/lib/types'
import type { ResolvedCabinet, ResolvedCasePart, ResolvedToekickPart, ResolvedInternalPart, ResolvedFaceZone, ResolvedDrawerBoxPart, ResolvedDrawerSlide, ResolvedDrawerStack } from '@/src/lib/resolver/types'
import { PartMeta, PartEdge, PartPropertiesPanel } from '@/src/components/three/PartViewer'
import { patchEdgeOverrideCache } from '@/src/lib/resolver/resolveCabinetFromDB'
import { dbResolveAndPersistCabinet } from './canvasDB'
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
  carcass:   { fill: '#374151', stroke: '#4b5563' },
  toekick:   { fill: '#451a03', stroke: '#92400e' },
  shelf:     { fill: '#1e1b4b', stroke: '#4338ca' },
  door:      { fill: '#1e3a5f', stroke: '#3b82f6' },
  drawer:    { fill: '#3b1f5f', stroke: '#8b5cf6' },
  face:      { fill: '#0f2240', stroke: '#60a5fa' },
  drawerBox: { fill: '#052e16', stroke: '#22c55e' },
  slide:     { fill: '#1c1917', stroke: '#d97706' },
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

// ── Drawer box & slide rect helpers ──────────────────────────────────────────
// p.Z for db parts is the front face Z; subtract DX/DZ to get the back face.

function dbElevRect(p: ResolvedDrawerBoxPart) {
  switch (p.part_type) {
    case 'db_left_side':
    case 'db_right_side': return { ex: p.X, ey: p.Y + p.DY, ew: p.DZ, eh: p.DY }
    case 'db_bottom':     return { ex: p.X, ey: p.Y + p.DZ, ew: p.DY, eh: p.DZ }
    case 'db_front':
    case 'db_back':
    default:              return { ex: p.X, ey: p.Y + p.DX, ew: p.DY, eh: p.DX }
  }
}
function dbTopRect(p: ResolvedDrawerBoxPart) {
  switch (p.part_type) {
    case 'db_left_side':
    case 'db_right_side': return { tx: p.X, tz: p.Z - p.DX, tw: p.DZ, td: p.DX }
    case 'db_bottom':     return { tx: p.X, tz: p.Z - p.DX, tw: p.DY, td: p.DX }
    case 'db_front':
    case 'db_back':
    default:              return { tx: p.X, tz: p.Z - p.DZ, tw: p.DY, td: p.DZ }
  }
}
function dbSideRect(p: ResolvedDrawerBoxPart) {
  switch (p.part_type) {
    case 'db_left_side':
    case 'db_right_side': return { sz: p.Z - p.DX, cy_top: p.Y + p.DY, sw: p.DX, sh: p.DY }
    case 'db_bottom':     return { sz: p.Z - p.DX, cy_top: p.Y + p.DZ, sw: p.DX, sh: p.DZ }
    case 'db_front':
    case 'db_back':
    default:              return { sz: p.Z - p.DZ, cy_top: p.Y + p.DX, sw: p.DZ, sh: p.DX }
  }
}
function slideElevRect(s: ResolvedDrawerSlide) { return { ex: s.X, ey: s.Y + s.DY, ew: s.DZ, eh: s.DY } }
function slideTopRect(s: ResolvedDrawerSlide)  { return { tx: s.X, tz: s.Z, tw: s.DZ, td: s.DX } }
function slideSideRect(s: ResolvedDrawerSlide) { return { sz: s.Z, cy_top: s.Y + s.DY, sw: s.DX, sh: s.DY } }

// ── PartMeta builders (for click-to-inspect in SVG views) ─────────────────────

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
const DB_PART_LABELS: Record<string, string> = {
  db_left_side: 'Drawer Box Left Side', db_right_side: 'Drawer Box Right Side',
  db_bottom: 'Drawer Box Bottom', db_front: 'Drawer Box Front', db_back: 'Drawer Box Back',
}

function svgCaseMeta(p: ResolvedCasePart): PartMeta {
  const isS = isSidePanel(p.part_key), isB = p.part_key === 'back'
  return {
    id: `case_${p.part_key}`, label: CASE_LABELS[p.part_key] ?? p.part_key,
    w: isS ? p.DZ : p.DY, h: isS ? p.DY : isB ? p.DX : p.DZ, d: isS ? p.DX : isB ? p.DZ : p.DX,
    thickness: p.DZ, edge: p.edge_band,
    panelKind: isS ? 'side' : isB ? 'face' : 'horizontal',
    x: p.X, y: p.Y, z: p.Z, ax: p.AX, ay: p.AY, az: p.AZ,
  }
}
function svgTkMeta(p: ResolvedToekickPart): PartMeta {
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
function svgIntMeta(p: ResolvedInternalPart): PartMeta {
  return {
    id: `int_${p.part_type}_${p.sort_order}`,
    label: `${INT_LABELS[p.part_type] ?? p.part_type} ${p.sort_order + 1}`,
    w: p.DY, h: p.DZ, d: p.DX,
    thickness: p.DZ, edge: p.edge_band, panelKind: 'horizontal',
    detail: p.y_locked ? 'Position locked' : undefined,
    x: p.X, y: p.Y, z: p.Z, ax: p.AX, ay: p.AY, az: p.AZ,
  }
}
function svgZoneMeta(z: ResolvedFaceZone): PartMeta {
  return {
    id: `zone_${z.row_index}_${z.col_index}`,
    label: FACE_LABELS_MAP[z.face_type] ?? z.face_type,
    w: z.DY, h: z.DX, d: z.DZ,
    thickness: z.DZ, edge: z.edge_band, panelKind: 'face',
    detail: [`Row ${z.row_index + 1}, Col ${z.col_index + 1}`, z.hinge_side ? `Hinge: ${z.hinge_side}` : null].filter(Boolean).join(' · '),
    x: z.X, y: z.Y, z: z.Z, ax: z.AX, ay: z.AY, az: z.AZ,
  }
}
function svgDbMeta(p: ResolvedDrawerBoxPart, stack: ResolvedDrawerStack): PartMeta {
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
function svgSlideMeta(s: ResolvedDrawerSlide, stack: ResolvedDrawerStack): PartMeta {
  return {
    id: `slide_${stack.face_zone_row}_${stack.face_zone_col}_${s.side}`,
    label: `Drawer Slide (${s.side})`,
    w: s.DZ, h: s.DY, d: s.DX, thickness: s.DZ,
    edge: { top: false, bottom: false, left: false, right: false }, panelKind: 'side',
    detail: `${s.nominal_length}mm NL · Box ht ${s.box_height}mm`,
    x: s.X, y: s.Y, z: s.Z,
  }
}

async function saveSVGEdge(cabId: string, part: PartMeta) {
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

// ── Multi-part hit testing & picker ──────────────────────────────────────────

function svgHitParts(e: React.MouseEvent, partMap: Map<string, PartMeta>): PartMeta[] {
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

function partIdColor(id: string): string {
  if (id.startsWith('case_'))  return RC.carcass.stroke
  if (id.startsWith('tk_'))    return RC.toekick.stroke
  if (id.startsWith('int_'))   return RC.shelf.stroke
  if (id.startsWith('zone_'))  return RC.door.stroke
  if (id.startsWith('db_'))    return RC.drawerBox.stroke
  if (id.startsWith('slide_')) return RC.slide.stroke
  return '#6b7280'
}

function PartPickerMenu({ parts, clientX, clientY, onPick, onClose }: {
  parts: PartMeta[]; clientX: number; clientY: number
  onPick: (part: PartMeta) => void; onClose: () => void
}) {
  useEffect(() => {
    const handler = () => onClose()
    const t = setTimeout(() => window.addEventListener('click', handler), 10)
    return () => { clearTimeout(t); window.removeEventListener('click', handler) }
  }, [onClose])

  const menuH = parts.length * 30 + 44
  const top  = Math.min(clientY + 6, window.innerHeight - menuH - 8)
  const left = Math.min(clientX + 6, window.innerWidth  - 200)

  return (
    <div
      className="fixed z-[70] bg-gray-800 border border-gray-600 rounded-lg shadow-2xl overflow-hidden"
      style={{ top, left, minWidth: 180 }}
      onClick={e => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-700 bg-gray-900/60">
        {parts.length} parts here — pick one
      </div>
      {parts.map(p => (
        <button
          key={p.id}
          className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
          onClick={() => onPick(p)}
        >
          <span className="w-2 h-2 rounded-full flex-none" style={{ background: partIdColor(p.id) }} />
          <span className="flex-1 truncate">{p.label}</span>
          {p.detail && <span className="text-gray-500 text-[10px] shrink-0">{p.detail.split(' · ')[0]}</span>}
        </button>
      ))}
    </div>
  )
}

// Highlight stroke helper
const SEL_STROKE = '#f59e0b'

// ── Resolved views ────────────────────────────────────────────────────────────

function ResolvedElevation({ cab, rp, wireMode, showInternals, selectedPartId, onPartsAtPoint }: {
  cab: CabinetInstance; rp: ResolvedCabinet; wireMode: boolean; showInternals: boolean
  selectedPartId: string | null; onPartsAtPoint: (parts: PartMeta[], cx: number, cy: number) => void
}) {
  const { dx, dy } = cab
  const pl = 80, pt = 50, pr = 40, pb = 40
  const vw = dx + pl + pr
  const vh = dy + pt + pb
  const ox = pl, oy = pt

  function toSVG(ex: number, ey: number, ew: number, eh: number) {
    return { x: ox + ex, y: oy + dy - ey, w: ew, h: eh }
  }
  function sel(id: string) { return selectedPartId === id }
  function stroke(id: string, base: string) { return sel(id) ? SEL_STROKE : base }
  function sw(id: string, base: number) { return sel(id) ? 2 : base }
  const cp: React.CSSProperties = { cursor: 'pointer' }
  function faceColor(ft: string) { return ft === 'drawer_face' ? RC.drawer : RC.door }

  const partMap = new Map<string, PartMeta>()
  rp.case_parts.forEach(p => { const m = svgCaseMeta(p); partMap.set(m.id, m) })
  rp.toekick_parts.forEach(p => { const m = svgTkMeta(p); partMap.set(m.id, m) })
  rp.internal_parts.forEach(p => { const m = svgIntMeta(p); partMap.set(m.id, m) })
  rp.face_zones.filter(z => z.face_type !== 'open').forEach(z => { const m = svgZoneMeta(z); partMap.set(m.id, m) })
  ;(rp.drawer_stacks ?? []).forEach(stack => {
    stack.box_parts.forEach(p => { const m = svgDbMeta(p, stack); partMap.set(m.id, m) })
    stack.slides.forEach(s => { const m = svgSlideMeta(s, stack); partMap.set(m.id, m) })
  })

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    e.stopPropagation()
    onPartsAtPoint(svgHitParts(e, partMap), e.clientX, e.clientY)
  }

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%', cursor: 'crosshair' }} onClick={handleClick}>
      <rect x={ox} y={oy} width={dx} height={dy} fill={wireMode ? '#050a12' : C_INT} />

      {showInternals && (rp.drawer_stacks ?? []).flatMap((stack, si) => [
        ...stack.box_parts.map((p, pi) => {
          const meta = svgDbMeta(p, stack)
          const { ex, ey, ew, eh } = dbElevRect(p)
          const r = toSVG(ex, ey, ew, eh)
          return <rect key={`db${si}_${pi}`} x={r.x} y={r.y} width={r.w} height={r.h}
            fill={wireMode ? 'transparent' : RC.drawerBox.fill}
            stroke={stroke(meta.id, RC.drawerBox.stroke)} strokeWidth={sw(meta.id, 0.5)}
            data-part-id={meta.id} style={cp} />
        }),
        ...stack.slides.map((s, li) => {
          const meta = svgSlideMeta(s, stack)
          const { ex, ey, ew, eh } = slideElevRect(s)
          const r = toSVG(ex, ey, ew, eh)
          return <rect key={`sl${si}_${li}`} x={r.x} y={r.y} width={r.w} height={r.h}
            fill={wireMode ? 'transparent' : RC.slide.fill}
            stroke={stroke(meta.id, RC.slide.stroke)} strokeWidth={sw(meta.id, 0.5)}
            strokeDasharray={sel(meta.id) ? undefined : '3 2'}
            data-part-id={meta.id} style={cp} />
        }),
      ])}

      {rp.toekick_parts.map((p, i) => {
        const meta = svgTkMeta(p)
        const { ex, ey, ew, eh } = tkElevRect(p)
        const r = toSVG(ex, ey, ew, eh)
        const isSpreader = p.part_key === 'spreader_vertical' || p.part_key === 'spreader_horizontal'
        return <rect key={`tk${i}`} x={r.x} y={r.y} width={r.w} height={r.h}
          fill={isSpreader || wireMode ? 'transparent' : RC.toekick.fill}
          stroke={stroke(meta.id, RC.toekick.stroke)} strokeWidth={sw(meta.id, isSpreader ? 1 : 0.75)}
          strokeDasharray={isSpreader && !sel(meta.id) ? '4 3' : undefined}
          data-part-id={meta.id} style={cp} />
      })}

      {rp.internal_parts.map((p, i) => {
        const meta = svgIntMeta(p)
        const { ex, ey, ew, eh } = shelfElevRect(p)
        const r = toSVG(ex, ey, ew, eh)
        return <rect key={`sh${i}`} x={r.x} y={r.y} width={r.w} height={r.h}
          fill={wireMode ? 'transparent' : RC.shelf.fill}
          stroke={stroke(meta.id, RC.shelf.stroke)} strokeWidth={sw(meta.id, 0.5)}
          data-part-id={meta.id} style={cp} />
      })}

      {rp.case_parts.map((p, i) => {
        const meta = svgCaseMeta(p)
        const { ex, ey, ew, eh } = elevRect({ ...p, part_key: p.part_key })
        const r = toSVG(ex, ey, ew, eh)
        return <rect key={`cp${i}`} x={r.x} y={r.y} width={r.w} height={r.h}
          fill={wireMode ? 'transparent' : RC.carcass.fill}
          stroke={stroke(meta.id, RC.carcass.stroke)} strokeWidth={sw(meta.id, 0.75)}
          data-part-id={meta.id} style={cp} />
      })}

      {rp.face_zones.filter(z => z.face_type !== 'open').map((z, i) => {
        const meta = svgZoneMeta(z)
        const { ex, ey, ew, eh } = zoneElevRect(z)
        const r = toSVG(ex, ey, ew, eh)
        const col = faceColor(z.face_type)
        return (
          <g key={`fz${i}`}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h}
              fill={wireMode ? 'transparent' : col.fill}
              stroke={stroke(meta.id, col.stroke)} strokeWidth={sw(meta.id, wireMode ? 0.75 : 1)}
              fillOpacity={wireMode ? 1 : 0.85}
              data-part-id={meta.id} style={cp} />
            {z.hinge_side === 'left'  && <line x1={r.x}     y1={r.y} x2={r.x}     y2={r.y+r.h} stroke={stroke(meta.id, col.stroke)} strokeWidth={2} data-part-id={meta.id} style={cp} />}
            {z.hinge_side === 'right' && <line x1={r.x+r.w} y1={r.y} x2={r.x+r.w} y2={r.y+r.h} stroke={stroke(meta.id, col.stroke)} strokeWidth={2} data-part-id={meta.id} style={cp} />}
          </g>
        )
      })}

      <rect x={ox} y={oy} width={dx} height={dy} fill="none" stroke="#6b7280" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
      <line x1={ox-20} y1={oy+dy} x2={ox+dx+20} y2={oy+dy} stroke="#334155" strokeWidth={2} strokeDasharray="8 4" style={{ pointerEvents: 'none' }} />
      {dimH(ox, ox+dx, oy-35, `${dx}mm`, true)}
      {dimV(ox-50, oy, oy+dy, `${dy}mm`)}
      {viewLabel(ox+dx/2, vh-14, 'ELEVATION — WIDTH × HEIGHT')}
    </svg>
  )
}

function ResolvedTop({ cab, rp, wireMode, showInternals, selectedPartId, onPartsAtPoint }: {
  cab: CabinetInstance; rp: ResolvedCabinet; wireMode: boolean; showInternals: boolean
  selectedPartId: string | null; onPartsAtPoint: (parts: PartMeta[], cx: number, cy: number) => void
}) {
  const { dx, dz } = cab
  const wallH = 40
  const pl = 80, pt = 50 + wallH, pr = 40, pb = 50
  const vw = dx + pl + pr
  const vh = dz + pt + pb
  const ox = pl, oz = pt

  function toSVG(tx: number, tz: number, tw: number, td: number) {
    return { x: ox + tx, y: oz + tz, w: tw, h: td }
  }
  function sel(id: string) { return selectedPartId === id }
  function stroke(id: string, base: string) { return sel(id) ? SEL_STROKE : base }
  function sw(id: string, base: number) { return sel(id) ? 2 : base }
  const cp: React.CSSProperties = { cursor: 'pointer' }

  const partMap = new Map<string, PartMeta>()
  rp.case_parts.forEach(p => { const m = svgCaseMeta(p); partMap.set(m.id, m) })
  rp.toekick_parts.forEach(p => { const m = svgTkMeta(p); partMap.set(m.id, m) })
  rp.internal_parts.forEach(p => { const m = svgIntMeta(p); partMap.set(m.id, m) })
  rp.face_zones.filter(z => z.face_type !== 'open').forEach(z => { const m = svgZoneMeta(z); partMap.set(m.id, m) })
  ;(rp.drawer_stacks ?? []).forEach(stack => {
    stack.box_parts.forEach(p => { const m = svgDbMeta(p, stack); partMap.set(m.id, m) })
    stack.slides.forEach(s => { const m = svgSlideMeta(s, stack); partMap.set(m.id, m) })
  })

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    e.stopPropagation()
    onPartsAtPoint(svgHitParts(e, partMap), e.clientX, e.clientY)
  }

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%', cursor: 'crosshair' }} onClick={handleClick}>
      <rect x={ox} y={oz - wallH} width={dx} height={wallH} fill={C_WALL} stroke={C_STROKE} strokeWidth={1} style={{ pointerEvents: 'none' }} />
      <text x={ox + dx/2} y={oz - wallH/2} textAnchor="middle" dominantBaseline="central"
        fontSize={18} fill="#475569" fontFamily="system-ui,sans-serif" letterSpacing={2}>WALL</text>
      <rect x={ox} y={oz} width={dx} height={dz} fill={wireMode ? '#050a12' : C_INT} />

      {showInternals && (rp.drawer_stacks ?? []).flatMap((stack, si) => [
        ...stack.box_parts.map((p, pi) => {
          const meta = svgDbMeta(p, stack)
          const r = dbTopRect(p); const s = toSVG(r.tx, r.tz, r.tw, r.td)
          return <rect key={`db${si}_${pi}`} x={s.x} y={s.y} width={s.w} height={s.h}
            fill={wireMode ? 'transparent' : RC.drawerBox.fill}
            stroke={stroke(meta.id, RC.drawerBox.stroke)} strokeWidth={sw(meta.id, 0.5)}
            data-part-id={meta.id} style={cp} />
        }),
        ...stack.slides.map((sl, li) => {
          const meta = svgSlideMeta(sl, stack)
          const r = slideTopRect(sl); const s = toSVG(r.tx, r.tz, r.tw, r.td)
          return <rect key={`sl${si}_${li}`} x={s.x} y={s.y} width={s.w} height={s.h}
            fill={wireMode ? 'transparent' : RC.slide.fill}
            stroke={stroke(meta.id, RC.slide.stroke)} strokeWidth={sw(meta.id, 0.5)}
            strokeDasharray={sel(meta.id) ? undefined : '3 2'}
            data-part-id={meta.id} style={cp} />
        }),
      ])}

      {rp.internal_parts.map((p, i) => {
        const meta = svgIntMeta(p)
        const r = shelfTopRect(p); const s = toSVG(r.tx, r.tz, r.tw, r.td)
        return <rect key={`sh${i}`} x={s.x} y={s.y} width={s.w} height={s.h}
          fill={wireMode ? 'transparent' : RC.shelf.fill}
          stroke={stroke(meta.id, RC.shelf.stroke)} strokeWidth={sw(meta.id, 0.5)}
          data-part-id={meta.id} style={cp} />
      })}

      {rp.case_parts.map((p, i) => {
        const meta = svgCaseMeta(p)
        const r = topRect(p); const s = toSVG(r.tx, r.tz, r.tw, r.td)
        return <rect key={`cp${i}`} x={s.x} y={s.y} width={s.w} height={s.h}
          fill={wireMode ? 'transparent' : RC.carcass.fill}
          stroke={stroke(meta.id, RC.carcass.stroke)} strokeWidth={sw(meta.id, 0.75)}
          data-part-id={meta.id} style={cp} />
      })}

      {rp.toekick_parts.map((p, i) => {
        const meta = svgTkMeta(p)
        const r = tkTopRect(p); const s = toSVG(r.tx, r.tz, r.tw, r.td)
        return <rect key={`tk${i}`} x={s.x} y={s.y} width={s.h} height={s.h}
          fill={wireMode ? 'transparent' : RC.toekick.fill}
          stroke={stroke(meta.id, RC.toekick.stroke)} strokeWidth={sw(meta.id, 0.75)}
          data-part-id={meta.id} style={cp} />
      })}

      {rp.face_zones.filter(z => z.face_type !== 'open').map((z, i) => {
        const meta = svgZoneMeta(z)
        const r = zoneTopRect(z); const s = toSVG(r.tx, r.tz, r.tw, r.td)
        const col = z.face_type === 'drawer_face' ? RC.drawer : RC.door
        return <rect key={`fz${i}`} x={s.x} y={s.y} width={s.w} height={s.h}
          fill={wireMode ? 'transparent' : col.fill}
          stroke={stroke(meta.id, col.stroke)} strokeWidth={sw(meta.id, wireMode ? 0.75 : 1)}
          fillOpacity={wireMode ? 1 : 0.85}
          data-part-id={meta.id} style={cp} />
      })}

      <rect x={ox} y={oz} width={dx} height={dz} fill="none" stroke="#6b7280" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
      <text x={ox + dx/2} y={oz + dz + 22} textAnchor="middle" dominantBaseline="central"
        fontSize={18} fill="#374151" fontFamily="system-ui,sans-serif">ACCESS</text>
      {dimH(ox, ox + dx, oz + dz + 50, `${dx}mm`)}
      {dimV(ox - 50, oz, oz + dz, `${dz}mm`)}
      {viewLabel(ox + dx/2, vh - 14, 'TOP — WIDTH × DEPTH')}
    </svg>
  )
}

function ResolvedSide({ cab, rp, wireMode, showInternals, selectedPartId, onPartsAtPoint }: {
  cab: CabinetInstance; rp: ResolvedCabinet; wireMode: boolean; showInternals: boolean
  selectedPartId: string | null; onPartsAtPoint: (parts: PartMeta[], cx: number, cy: number) => void
}) {
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

  function toSVG(sz: number, cy_top: number, w: number, h: number) {
    return { x: oz + sz, y: oy + dy - cy_top, w, h }
  }
  function sel(id: string) { return selectedPartId === id }
  function stroke(id: string, base: string) { return sel(id) ? SEL_STROKE : base }
  function sw(id: string, base: number) { return sel(id) ? 2 : base }
  const cp: React.CSSProperties = { cursor: 'pointer' }

  const partMap = new Map<string, PartMeta>()
  rp.case_parts.forEach(p => { const m = svgCaseMeta(p); partMap.set(m.id, m) })
  rp.toekick_parts.forEach(p => { const m = svgTkMeta(p); partMap.set(m.id, m) })
  rp.internal_parts.forEach(p => { const m = svgIntMeta(p); partMap.set(m.id, m) })
  rp.face_zones.filter(z => z.face_type !== 'open').forEach(z => { const m = svgZoneMeta(z); partMap.set(m.id, m) })
  ;(rp.drawer_stacks ?? []).forEach(stack => {
    stack.box_parts.forEach(p => { const m = svgDbMeta(p, stack); partMap.set(m.id, m) })
    stack.slides.forEach(s => { const m = svgSlideMeta(s, stack); partMap.set(m.id, m) })
  })

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    e.stopPropagation()
    onPartsAtPoint(svgHitParts(e, partMap), e.clientX, e.clientY)
  }

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%', cursor: 'crosshair' }} onClick={handleClick}>
      <rect x={oz - wallW} y={oy} width={wallW} height={dy} fill={C_WALL} stroke={C_STROKE} strokeWidth={1} style={{ pointerEvents: 'none' }} />
      <text x={oz - wallW/2} y={oy + dy/2} textAnchor="middle" dominantBaseline="central"
        fontSize={16} fill="#475569" fontFamily="system-ui,sans-serif"
        transform={`rotate(-90,${oz - wallW/2},${oy + dy/2})`}>WALL</text>
      <rect x={oz} y={oy} width={dz} height={dy} fill={wireMode ? '#050a12' : C_INT} />

      {showInternals && (rp.drawer_stacks ?? []).flatMap((stack, si) => [
        ...stack.box_parts.map((p, pi) => {
          const meta = svgDbMeta(p, stack)
          const r = dbSideRect(p); const s = toSVG(r.sz, r.cy_top, r.sw, r.sh)
          return <rect key={`db${si}_${pi}`} x={s.x} y={s.y} width={s.w} height={s.h}
            fill={wireMode ? 'transparent' : RC.drawerBox.fill}
            stroke={stroke(meta.id, RC.drawerBox.stroke)} strokeWidth={sw(meta.id, 0.5)}
            data-part-id={meta.id} style={cp} />
        }),
        ...stack.slides.map((sl, li) => {
          const meta = svgSlideMeta(sl, stack)
          const r = slideSideRect(sl); const s = toSVG(r.sz, r.cy_top, r.sw, r.sh)
          return <rect key={`sl${si}_${li}`} x={s.x} y={s.y} width={s.w} height={s.h}
            fill={wireMode ? 'transparent' : RC.slide.fill}
            stroke={stroke(meta.id, RC.slide.stroke)} strokeWidth={sw(meta.id, 0.5)}
            strokeDasharray={sel(meta.id) ? undefined : '3 2'}
            data-part-id={meta.id} style={cp} />
        }),
      ])}

      {rp.internal_parts.map((p, i) => {
        const meta = svgIntMeta(p)
        const r = shelfSideRect(p); const s = toSVG(r.sz, r.cy_top, r.sw, r.sh)
        return <rect key={`sh${i}`} x={s.x} y={s.y} width={s.w} height={s.h}
          fill={wireMode ? 'transparent' : RC.shelf.fill}
          stroke={stroke(meta.id, RC.shelf.stroke)} strokeWidth={sw(meta.id, 0.5)}
          data-part-id={meta.id} style={cp} />
      })}

      {rp.case_parts.map((p, i) => {
        const meta = svgCaseMeta(p)
        const r = sideRect(p); if (!r) return null
        const s = toSVG(r.sz, r.cy_top, r.sw, r.sh)
        return <rect key={`cp${i}`} x={s.x} y={s.y} width={s.w} height={s.h}
          fill={wireMode ? 'transparent' : RC.carcass.fill}
          stroke={stroke(meta.id, RC.carcass.stroke)} strokeWidth={sw(meta.id, 0.75)}
          data-part-id={meta.id} style={cp} />
      })}

      {rp.toekick_parts.map((p, i) => {
        const meta = svgTkMeta(p)
        const r = tkSideRect(p); const s = toSVG(r.sz, r.cy_top, r.sw, r.sh)
        return <rect key={`tk${i}`} x={s.x} y={s.y} width={s.w} height={s.h}
          fill={wireMode ? 'transparent' : RC.toekick.fill}
          stroke={stroke(meta.id, RC.toekick.stroke)} strokeWidth={sw(meta.id, 0.75)}
          data-part-id={meta.id} style={cp} />
      })}

      {rp.face_zones.filter(z => z.face_type !== 'open').map((z, i) => {
        const meta = svgZoneMeta(z)
        const r = zoneSideRect(z); const s = toSVG(r.sz, r.cy_top, r.sw, r.sh)
        const col = z.face_type === 'drawer_face' ? RC.drawer : RC.door
        return <rect key={`fz${i}`} x={s.x} y={s.y} width={s.w} height={s.h}
          fill={wireMode ? 'transparent' : col.fill}
          stroke={stroke(meta.id, col.stroke)} strokeWidth={sw(meta.id, wireMode ? 0.75 : 1)}
          fillOpacity={wireMode ? 1 : 0.85}
          data-part-id={meta.id} style={cp} />
      })}

      <rect x={oz} y={oy} width={dz} height={dy} fill="none" stroke="#6b7280" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
      <line x1={oz-20} y1={oy+dy} x2={oz+dz+20} y2={oy+dy} stroke="#334155" strokeWidth={2} strokeDasharray="8 4" style={{ pointerEvents: 'none' }} />

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
  carcass:   '#3b82f6',
  toekick:   '#f59e0b',
  internal:  '#818cf8',
  face:      '#60a5fa',
  drawerbox: '#22c55e',
  slide:     '#d97706',
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
      <td colSpan={6} className="pt-4 pb-1 px-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full flex-none" style={{ background: color }} />
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</span>
          <span className="text-[10px] text-gray-600 ml-1">{count} part{count !== 1 ? 's' : ''}</span>
        </div>
      </td>
    </tr>
  )
}

function PartRow({ name, material, dy, dx, dz, eb }: {
  name: string; material: string; dy: number; dx: number; dz: number
  eb: { top: boolean; bottom: boolean; left: boolean; right: boolean }
}) {
  return (
    <tr className="border-t border-gray-800/60 hover:bg-gray-800/30">
      <td className="px-3 py-1.5 text-xs text-gray-300">{name}</td>
      <td className="px-3 py-1.5 text-xs text-gray-400">{material}</td>
      <td className="px-3 py-1.5 text-xs font-mono text-right text-gray-200">{dy.toFixed(1)}</td>
      <td className="px-3 py-1.5 text-xs font-mono text-right text-gray-200">{dx.toFixed(1)}</td>
      <td className="px-3 py-1.5 text-xs font-mono text-right text-gray-400">{dz.toFixed(1)}</td>
      <td className="px-3 py-1.5">
        <EBDots t={eb.top} b={eb.bottom} l={eb.left} r={eb.right} />
      </td>
    </tr>
  )
}

function PartsView({ rp }: { rp: ResolvedCabinet }) {
  const [matNames, setMatNames] = useState<Record<string, string>>({})

  useEffect(() => {
    const ids = new Set<string>()
    rp.case_parts.forEach(p    => ids.add(p.material_id))
    rp.toekick_parts.forEach(p => ids.add(p.material_id))
    rp.internal_parts.forEach(p => ids.add(p.material_id))
    rp.face_zones.forEach(z    => ids.add(z.material_id))
    ;(rp.drawer_stacks ?? []).forEach(stack => stack.box_parts.forEach(p => ids.add(p.material_id)))
    if (ids.size === 0) return
    supabase.from('materials').select('id,name').in('id', [...ids]).then(({ data }) => {
      if (!data) return
      const map: Record<string, string> = {}
      for (const m of data) map[m.id] = m.name
      setMatNames(map)
    })
  }, [rp])

  const mat = (id: string) => matNames[id] ?? '—'

  const faceCount      = rp.face_zones.filter(z => z.face_type !== 'open').length
  const drawerBoxCount = (rp.drawer_stacks ?? []).reduce((n, s) => n + s.box_parts.length, 0)
  const slideCount     = (rp.drawer_stacks ?? []).reduce((n, s) => n + s.slides.length, 0)
  const totalParts     = rp.case_parts.length + rp.toekick_parts.length + rp.internal_parts.length + faceCount + drawerBoxCount + slideCount

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
            <th className="px-3 pb-1.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">Material</th>
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
                  material={mat(p.material_id)} dy={p.DY} dx={p.DX} dz={p.DZ} eb={p.edge_band} />
              ))}
            </>
          )}
          {rp.toekick_parts.length > 0 && (
            <>
              <SectionHeader color={SECTION_COLOR.toekick} title="Toekick" count={rp.toekick_parts.length} />
              {rp.toekick_parts.map((p: ResolvedToekickPart, i: number) => (
                <PartRow key={`tk-${i}`} name={PART_LABEL[p.part_key] ?? p.part_key}
                  material={mat(p.material_id)} dy={p.DY} dx={p.DX} dz={p.DZ} eb={p.edge_band} />
              ))}
            </>
          )}
          {rp.internal_parts.length > 0 && (
            <>
              <SectionHeader color={SECTION_COLOR.internal} title="Internal" count={rp.internal_parts.length} />
              {rp.internal_parts.map((p: ResolvedInternalPart, i: number) => (
                <PartRow key={`ip-${i}`} name={PART_LABEL[p.part_type] ?? p.part_type}
                  material={mat(p.material_id)} dy={p.DY} dx={p.DX} dz={p.DZ} eb={p.edge_band} />
              ))}
            </>
          )}
          {faceCount > 0 && (
            <>
              <SectionHeader color={SECTION_COLOR.face} title="Face" count={faceCount} />
              {rp.face_zones.filter((z: ResolvedFaceZone) => z.face_type !== 'open').map((z: ResolvedFaceZone, i: number) => (
                <PartRow key={`fz-${i}`}
                  name={`${z.face_type === 'door' ? 'Door' : z.face_type === 'drawer_face' ? 'Drawer Face' : 'False Panel'} R${z.row_index + 1}C${z.col_index + 1}`}
                  material={mat(z.material_id)} dy={z.DY} dx={z.DX} dz={z.DZ} eb={z.edge_band} />
              ))}
            </>
          )}
          {drawerBoxCount > 0 && (
            <>
              <SectionHeader color={SECTION_COLOR.drawerbox} title="Drawer Boxes" count={drawerBoxCount} />
              {(rp.drawer_stacks ?? []).flatMap((stack, si) =>
                stack.box_parts.map((p: ResolvedDrawerBoxPart, pi: number) => (
                  <PartRow key={`db-${si}-${pi}`}
                    name={`${DB_PART_LABELS[p.part_type] ?? p.part_type} R${stack.face_zone_row + 1}C${stack.face_zone_col + 1}`}
                    material={mat(p.material_id)} dy={p.DY} dx={p.DX} dz={p.DZ} eb={p.edge_band} />
                ))
              )}
            </>
          )}
          {slideCount > 0 && (
            <>
              <SectionHeader color={SECTION_COLOR.slide} title="Drawer Slides" count={slideCount} />
              {(rp.drawer_stacks ?? []).flatMap((stack, si) =>
                stack.slides.map((s: ResolvedDrawerSlide, li: number) => (
                  <PartRow key={`sl-${si}-${li}`}
                    name={`Slide (${s.side}) R${stack.face_zone_row + 1}C${stack.face_zone_col + 1}`}
                    material={`${s.nominal_length}mm NL`}
                    dy={s.DY} dx={s.DX} dz={s.DZ}
                    eb={{ top: false, bottom: false, left: false, right: false }} />
                ))
              )}
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
  const [activeView, setActiveView]       = useState<ViewId>(initialView ?? 'elevation')
  const [wireMode, setWireMode]           = useState(true)
  const [showInternals, setShowInternals] = useState(true)
  const [selectedSVGPart, setSelectedSVGPart] = useState<PartMeta | null>(null)
  const [picker, setPicker] = useState<{ parts: PartMeta[]; clientX: number; clientY: number } | null>(null)
  const [localRp, setLocalRp]             = useState<ResolvedCabinet | null>(null)
  const [resolving, setResolving]         = useState(false)

  const prevPartRef     = useRef<PartMeta | null>(null)
  const originalEdgeRef = useRef<PartEdge | null>(null)

  const isOrthoView = activeView !== '3d' && activeView !== 'parts' && activeView !== 'face'

  // If parent didn't supply resolved data, resolve now so the interactive views work
  useEffect(() => {
    if (resolvedCabinet) return
    setResolving(true)
    dbResolveAndPersistCabinet(cabinet.id).then(result => {
      if (result) setLocalRp(result)
    }).finally(() => setResolving(false))
  }, [cabinet.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Auto-save edge changes when selection moves to another part
  useEffect(() => {
    const prev = prevPartRef.current
    if (prev && prev.id !== selectedSVGPart?.id && originalEdgeRef.current) {
      const orig = originalEdgeRef.current
      const changed = (Object.keys(orig) as (keyof PartEdge)[]).some(k => prev.edge[k] !== orig[k])
      if (changed) saveSVGEdge(cabinet.id, prev)
    }
    if (selectedSVGPart && selectedSVGPart.id !== prev?.id) {
      originalEdgeRef.current = { ...selectedSVGPart.edge }
    } else if (!selectedSVGPart) {
      originalEdgeRef.current = null
    }
    prevPartRef.current = selectedSVGPart
  }, [selectedSVGPart]) // eslint-disable-line react-hooks/exhaustive-deps

  function handlePartsAtPoint(parts: PartMeta[], cx: number, cy: number) {
    setPicker(null)
    if (parts.length === 0) {
      setSelectedSVGPart(null)
    } else if (parts.length === 1) {
      setSelectedSVGPart(prev => prev?.id === parts[0].id ? null : parts[0])
    } else {
      setPicker({ parts, clientX: cx, clientY: cy })
    }
  }

  function handleSVGEdgeChange(edge: PartEdge) {
    setSelectedSVGPart(prev => prev ? { ...prev, edge } : null)
  }

  const rp = resolvedCabinet ?? localRp ?? undefined

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
              {!rp && resolving && (
                <span className="text-[10px] text-sky-500 italic">resolving…</span>
              )}
              {!rp && !resolving && (
                <span className="text-[10px] text-amber-600 italic">resolver data unavailable — showing approximate views</span>
              )}
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none px-1">✕</button>
          </div>
          {/* Tabs */}
          <div className="flex-none bg-gray-800/60 border-b border-gray-700 px-4 py-1.5 flex items-center gap-1">
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
            {isOrthoView && rp && (
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  onClick={() => setWireMode(w => !w)}
                  title="Toggle wire / solid view"
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${
                    wireMode
                      ? 'bg-sky-700/80 text-sky-200 hover:bg-sky-600/80'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  Wire
                </button>
                <button
                  onClick={() => setShowInternals(s => !s)}
                  title="Toggle drawer box / slide visibility"
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${
                    showInternals
                      ? 'bg-emerald-800/80 text-emerald-300 hover:bg-emerald-700/80'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  Internals
                </button>
              </div>
            )}
          </div>
          {/* Content */}
          <div
            className={`flex-1 overflow-hidden relative ${
              activeView === 'parts' ? 'bg-gray-900'
              : activeView === '3d'  ? 'bg-gray-950'
              : activeView === 'face' ? 'bg-gray-950'
              : 'flex items-center justify-center bg-gray-950 p-6'
            }`}
            onClick={isOrthoView ? () => { setSelectedSVGPart(null); setPicker(null) } : undefined}
          >
            {activeView === 'top' && (
              rp ? <ResolvedTop cab={cabinet} rp={rp} wireMode={wireMode} showInternals={showInternals}
                selectedPartId={selectedSVGPart?.id ?? null} onPartsAtPoint={handlePartsAtPoint} />
              : <TopView cab={cabinet} />
            )}
            {activeView === 'elevation' && (
              rp ? <ResolvedElevation cab={cabinet} rp={rp} wireMode={wireMode} showInternals={showInternals}
                selectedPartId={selectedSVGPart?.id ?? null} onPartsAtPoint={handlePartsAtPoint} />
              : <ElevationView cab={cabinet} />
            )}
            {activeView === 'side' && (
              rp ? <ResolvedSide cab={cabinet} rp={rp} wireMode={wireMode} showInternals={showInternals}
                selectedPartId={selectedSVGPart?.id ?? null} onPartsAtPoint={handlePartsAtPoint} />
              : <SideView cab={cabinet} />
            )}
            {activeView === 'section-face'     && <SectionFaceView     cab={cabinet} />}
            {activeView === 'section-interior' && <SectionInteriorView cab={cabinet} />}
            {activeView === 'face'             && <FaceGridEditor cabinet={cabinet} rp={rp} onUpdate={onUpdate} />}
            {activeView === '3d'               && rp && <Cabinet3DView cab={cabinet} rp={rp} materialColours={materialColours} ebByMatId={ebByMatId} />}
            {activeView === 'parts'            && rp && <PartsView rp={rp} />}
            {/* Part info panel overlay */}
            {selectedSVGPart && isOrthoView && (
              <PartPropertiesPanel
                part={selectedSVGPart}
                onClose={() => setSelectedSVGPart(null)}
                onEdgeChange={handleSVGEdgeChange}
              />
            )}
            {/* Part picker — shown when multiple parts overlap at the click point */}
            {picker && (
              <PartPickerMenu
                parts={picker.parts}
                clientX={picker.clientX}
                clientY={picker.clientY}
                onPick={part => { setSelectedSVGPart(part); setPicker(null) }}
                onClose={() => setPicker(null)}
              />
            )}
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
