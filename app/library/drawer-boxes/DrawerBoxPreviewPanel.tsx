'use client'

// ── Drawer Box Preview Panel ───────────────────────────────────────────────────
// Self-contained: owns material schedule selection, W/H/D inputs, view tabs,
// and resize. Mirrors the PreviewPanel in ConstructionMethodsClient.

import { useState, useEffect, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/src/lib/supabase'
import { DrawerBoxRules, DEFAULT_DB_RULES, Material, ResolvedDrawerBoxPart } from '@/src/lib/resolver/types'
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
  material_match_id: string | null
}

type PView = 'front' | 'top' | 'side' | '3d'

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

function DbFrontView({ parts, W, H, mat }: { parts: ResolvedDrawerBoxPart[]; W: number; H: number; mat: MatColour }) {
  const pl = 80, pt = 50, pr = 40, pb = 40
  const vw = W + pl + pr
  const vh = H + pt + pb
  const ox = pl, oy = pt

  function toSVG(r: { x: number; yBottom: number; w: number; h: number }) {
    return { x: ox + r.x, y: oy + H - r.yBottom - r.h, w: r.w, h: r.h }
  }

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%' }}>
      <rect x={ox} y={oy} width={W} height={H} fill={C_INT} />
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
      {dimH(ox, ox + W, oy - 35, `${W}mm`, true)}
      {dimV(ox - 50, oy, oy + H, `${H}mm`)}
      {viewLabel(ox + W / 2, vh - 14, 'FRONT — WIDTH × HEIGHT')}
    </svg>
  )
}

function DbSideView({ parts, D, H, mat }: { parts: ResolvedDrawerBoxPart[]; D: number; H: number; mat: MatColour }) {
  const pl = 80, pt = 60, pr = 80, pb = 40
  const vw = D + pl + pr
  const vh = H + pt + pb
  const oz = pl, oy = pt

  function toSVG(r: { z: number; yBottom: number; d: number; h: number }) {
    return { x: oz + r.z, y: oy + H - r.yBottom - r.h, w: r.d, h: r.h }
  }

  // Draw side panel outline, then overlay internal parts
  const side = parts.find(p => p.part_type === 'db_right_side')

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%' }}>
      {/* Background interior space */}
      <rect x={oz} y={oy} width={D} height={H} fill={C_INT} />
      {/* Side panel (solid block) */}
      {side && (() => {
        const r = toSVG(sideRect(side)); const c = partColour(side.part_type, mat)
        return <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={c.fill} stroke={c.stroke} strokeWidth={0.75} />
      })()}
      {/* Bottom panel (visible within the side's cross-section) */}
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

function DbTopView({ parts, W, D, mat }: { parts: ResolvedDrawerBoxPart[]; W: number; D: number; mat: MatColour }) {
  // Top view: X horizontal, Z vertical (front of box at bottom of SVG)
  const pl = 80, pt = 40, pr = 40, pb = 50
  const vw = W + pl + pr
  const vh = D + pt + pb
  const ox = pl, oz = pt

  function toSVG(r: { x: number; z: number; w: number; d: number }) {
    return { x: ox + r.x, y: oz + r.z, w: r.w, h: r.d }
  }

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%' }}>
      <rect x={ox} y={oz} width={W} height={D} fill={C_INT} />
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
      {/* "FRONT" label at the bottom */}
      <text x={ox + W / 2} y={oz + D + 22} textAnchor="middle" dominantBaseline="central"
        fontSize={18} fill="#374151" fontFamily="system-ui,sans-serif">FRONT</text>
      {dimH(ox, ox + W, oz - 35, `${W}mm`, true)}
      {dimV(ox - 50, oz, oz + D, `${D}mm`)}
      {viewLabel(ox + W / 2, vh - 14, 'TOP — WIDTH × DEPTH')}
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

const FALLBACK_MATERIAL: Material = {
  id: '__preview__', name: 'Generic', DZ: 18,
  sheet_dx: 2400, sheet_dy: 1200, has_grain: false,
}

const FALLBACK_COL: MatColour = { face: '#374151', back: '#1e293b', edge: '#4b5563' }

export default function DrawerBoxPreviewPanel({ delta }: { delta: Partial<DrawerBoxRules> }) {
  const [panelW,      setPanelW]      = useState(420)
  const [activeView,  setActiveView]  = useState<PView>('3d')
  const [dbScheds,    setDbScheds]    = useState<DbSched[]>([])
  const [selSchedId,  setSelSchedId]  = useState<string | null>(null)
  const [materials,   setMaterials]   = useState<MatRow[]>([])
  const [edgebands,   setEdgebands]   = useState<EbRow[]>([])
  const [prevW,       setPrevW]       = useState(400)
  const [prevH,       setPrevH]       = useState(200)
  const [prevD,       setPrevD]       = useState(450)
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
        .select('id,name,thickness,material_match_id')
        .eq('active', true).order('name'),
    ]).then(([schedRes, matsRes, ebRes]) => {
      const scheds = (schedRes.data ?? []) as DbSched[]
      setDbScheds(scheds)
      setSelSchedId(scheds.find(s => s.is_default)?.id ?? scheds[0]?.id ?? null)
      setMaterials((matsRes.data ?? []) as MatRow[])
      setEdgebands((ebRes.data ?? []) as EbRow[])
    })
  }, [])

  // ── Derived state ──────────────────────────────────────────────────────────

  const selSched   = dbScheds.find(s => s.id === selSchedId) ?? null
  const selMat     = materials.find(m => m.id === selSched?.material_id)    ?? null
  const selBotMat  = materials.find(m => m.id === selSched?.bottom_material_id) ?? null

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
      return resolveDrawerBox({
        box_width:          prevW,
        box_height:         prevH,
        box_depth:          prevD,
        material:           previewMaterial,
        edgeband_id:        selSched?.edgeband_id        ?? undefined,
        bottom_material:    bottomMaterial,
        bottom_edgeband_id: selSched?.bottom_edgeband_id ?? undefined,
        rules:              effectiveRules,
      })
    } catch { return [] }
  }, [prevW, prevH, prevD, previewMaterial, bottomMaterial, selSched, effectiveRules])

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
        <span className="ml-auto text-[9px] text-gray-600 font-mono whitespace-nowrap pl-2">
          {prevW}×{prevH}×{prevD}
        </span>
      </div>

      {/* View content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeView === '3d' ? (
          <div className="w-full h-full">
            <DrawerBox3DView
              parts={previewParts}
              boxWidth={prevW}
              boxHeight={prevH}
              boxDepth={prevD}
              matCol={matCol}
            />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center p-4">
            {activeView === 'front' && <DbFrontView parts={previewParts} W={prevW} H={prevH} mat={matCol} />}
            {activeView === 'top'   && <DbTopView   parts={previewParts} W={prevW} D={prevD} mat={matCol} />}
            {activeView === 'side'  && <DbSideView  parts={previewParts} D={prevD} H={prevH} mat={matCol} />}
          </div>
        )}
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
        {/* W / H / D inputs */}
        <div className="flex items-center gap-3 text-gray-600 pt-0.5 border-t border-gray-800/60">
          {([['W', prevW, setPrevW], ['H', prevH, setPrevH], ['D', prevD, setPrevD]] as const).map(([label, val, set]) => (
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
          <span className="ml-auto">
            Board: <span className="text-gray-300 font-mono">{previewMaterial.name} ({previewMaterial.DZ}mm)</span>
          </span>
        </div>
      </div>
    </div>
  )
}
