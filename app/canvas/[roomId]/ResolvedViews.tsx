'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import type { CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet, ResolvedCasePart, ResolvedToekickPart, ResolvedInternalPart, ResolvedFaceZone, ResolvedDrawerBoxPart, ResolvedDrawerSlide, ResolvedDrawerStack } from '@/src/lib/resolver/types'
import type { PartMeta } from '@/src/components/three/PartViewer'
import type { CabinetCustomPart, PartLabels, PartComments } from './canvasDB'
import { getUserPrefs } from '@/src/lib/userPrefs'
import type { PartPosOverrides } from './canvasDB'
import {
  C_INT, C_WALL, C_STROKE, C_PANEL, C_FACE,
  RC,
  dimH, dimV, viewLabel,
  elevRect, tkElevRect, zoneElevRect, shelfElevRect, intElevRect,
  topRect, tkTopRect, shelfTopRect, zoneTopRect, intTopRect,
  sideRect, tkSideRect, shelfSideRect, zoneSideRect, intSideRect,
  dbElevRect, dbTopRect, dbSideRect,
  slideElevRect, slideTopRect, slideSideRect,
  svgCaseMeta, svgTkMeta, svgIntMeta, svgZoneMeta, svgDbMeta, svgSlideMeta, svgInternalSlideMeta,
  svgHitParts, partIdColor, DrillOverlay,
  PartShape, SlideShape, caseBox, tkBox3, intBox3, zoneBox3, dbBox3, slideBox3,
} from './cabinetEditSvgHelpers'
import { cabinetSeamDrills, type DrillAxis } from '@/src/lib/jointDrilling'
import { useSlideTriangles, triKey } from '@/src/lib/slideSilhouette'

// Fallback approximation constants (used when resolver data not available)
const PT   = 18
const BT   = 9
const FF   = 22
const FFS  = 38
const FFR  = 44
const TKH  = 150
const L = 130
const T = 100
const R = 80
const B = 70

const SEL_STROKE = '#f59e0b'

// ── Helpers ───────────────────────────────────────────────────────────────────

function applyOv<T extends { X: number; Y: number; Z: number }>(p: T, id: string, overrides: PartPosOverrides | undefined): T {
  const ov = overrides?.[id]
  return ov ? { ...p, X: p.X + ov.ox, Y: p.Y + ov.oy, Z: p.Z + ov.oz } : p
}

function svgCustomMeta(p: CabinetCustomPart): PartMeta {
  return {
    id: `custom_${p.id}`,
    label: p.name ?? 'Custom Part',
    w: p.dy, h: p.dx, d: p.dz,
    thickness: p.dz,
    edge: { top: p.edge_top, bottom: p.edge_bottom, left: p.edge_left, right: p.edge_right },
    panelKind: 'horizontal',
    x: p.x, y: p.y, z: p.z,
  }
}

// ── Part picker ───────────────────────────────────────────────────────────────

export function PartPickerMenu({ parts, clientX, clientY, onPick, onClose }: {
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

// ── Part context menu ─────────────────────────────────────────────────────────

export type PartContextAction = 'rename' | 'comment' | 'delete'

export function PartContextMenu({ part, clientX, clientY, isCustom, existingComment, onAction, onClose }: {
  part: PartMeta
  clientX: number
  clientY: number
  isCustom: boolean
  existingComment?: string
  onAction: (action: PartContextAction, value?: string) => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<null | 'rename' | 'comment'>(null)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (mode) return
      onClose()
    }
    const t = setTimeout(() => window.addEventListener('click', handler), 10)
    return () => { clearTimeout(t); window.removeEventListener('click', handler) }
  }, [mode, onClose])

  function startRename() { setDraft(part.label); setMode('rename') }
  function startComment() { setDraft(existingComment ?? ''); setMode('comment') }

  function commitRename() {
    const v = draft.trim()
    if (v && v !== part.label) onAction('rename', v)
    else onClose()
  }

  function commitComment() {
    onAction('comment', draft)
    onClose()
  }

  const menuW = 192
  const menuH = mode ? 120 : (isCustom ? 126 : 96)
  const top  = Math.min(clientY + 6, window.innerHeight - menuH - 8)
  const left = Math.min(clientX + 6, window.innerWidth  - menuW - 8)

  return (
    <div
      className="fixed z-[70] bg-gray-800 border border-gray-600 rounded-lg shadow-2xl overflow-hidden"
      style={{ top, left, width: menuW }}
      onClick={e => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b border-gray-700 bg-gray-900/60 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full flex-none" style={{ background: partIdColor(part.id) }} />
        <span className="text-[11px] text-gray-300 truncate font-medium">{part.label}</span>
      </div>

      {mode === 'rename' && (
        <div className="px-3 py-2 space-y-1.5">
          <span className="text-[10px] text-gray-500">New name</span>
          <input
            autoFocus
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') onClose() }}
            className="w-full bg-gray-900 border border-blue-500 rounded px-2 py-1 text-xs text-white focus:outline-none"
          />
          <div className="flex gap-1.5 pt-0.5">
            <button onClick={commitRename} className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition-colors">Save</button>
            <button onClick={onClose} className="px-2 py-1 text-gray-400 hover:text-white text-xs transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {mode === 'comment' && (
        <div className="px-3 py-2 space-y-1.5">
          <span className="text-[10px] text-gray-500">Comment (blank to clear)</span>
          <textarea
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') onClose() }}
            rows={3}
            className="w-full bg-gray-900 border border-amber-500/60 rounded px-2 py-1 text-xs text-white focus:outline-none resize-none"
          />
          <div className="flex gap-1.5 pt-0.5">
            <button onClick={commitComment} className="flex-1 px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs rounded transition-colors">Save</button>
            <button onClick={onClose} className="px-2 py-1 text-gray-400 hover:text-white text-xs transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {!mode && (
        <>
          <button onClick={startRename}
            className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2.5">
            <span className="text-gray-500">✎</span> Rename part
          </button>
          <button onClick={startComment}
            className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2.5">
            <span className="text-gray-500">💬</span>
            {existingComment ? 'Edit comment' : 'Add comment'}
          </button>
          {isCustom && (
            <button
              onClick={() => { onAction('delete'); onClose() }}
              className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-900/40 hover:text-red-300 flex items-center gap-2.5 border-t border-gray-700"
            >
              <span>✕</span> Delete part
            </button>
          )}
          {!isCustom && (
            <div className="px-3 py-2 text-[10px] text-gray-600 border-t border-gray-700 italic">
              Resolved parts cannot be deleted
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Origin marker ─────────────────────────────────────────────────────────────

function OriginMarker({ sx, sy, hLabel, vLabel, vUp = true }: {
  sx: number; sy: number; hLabel: string; vLabel: string; vUp?: boolean
}) {
  const arm = 28, r = 3.5, col = '#f59e0b', fs = 18
  const vy = vUp ? -arm : arm
  return (
    <g style={{ pointerEvents: 'none' }}>
      <line x1={sx} y1={sy} x2={sx + arm} y2={sy} stroke={col} strokeWidth={1.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <line x1={sx} y1={sy} x2={sx} y2={sy + vy} stroke={col} strokeWidth={1.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={sx} cy={sy} r={r} fill={col} stroke="#0f172a" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <text x={sx + arm + 4} y={sy} dominantBaseline="central" fontSize={fs} fill={col} fontFamily="system-ui,sans-serif">{hLabel}</text>
      <text x={sx} y={sy + vy + (vUp ? -4 : 4)} textAnchor="middle" dominantBaseline={vUp ? 'auto' : 'hanging'} fontSize={fs} fill={col} fontFamily="system-ui,sans-serif">{vLabel}</text>
    </g>
  )
}

// ── Wheel-zoom hook ───────────────────────────────────────────────────────────

function useSvgZoom(initW: number, initH: number) {
  const initRef = useRef({ w: initW, h: initH })
  const vbRef   = useRef({ x: 0, y: 0, w: initW, h: initH })
  const [vb, setVb] = useState({ x: 0, y: 0, w: initW, h: initH })
  const svgRef  = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const { x, y, w, h } = vbRef.current
      const delta = getUserPrefs().invertScroll ? -e.deltaY : e.deltaY
      const factor = delta > 0 ? 1.15 : 1 / 1.15
      const vx = x + (cx / rect.width) * w
      const vy = y + (cy / rect.height) * h
      const newW = Math.max(initRef.current.w / 20, Math.min(initRef.current.w * 4, w * factor))
      const newH = h * (newW / w)
      const next = { x: vx - (cx / rect.width) * newW, y: vy - (cy / rect.height) * newH, w: newW, h: newH }
      vbRef.current = next
      setVb({ ...next })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return { svgRef, viewBox: `${vb.x} ${vb.y} ${vb.w} ${vb.h}` }
}

// ── Resolved views ────────────────────────────────────────────────────────────

export function ResolvedElevation({ cab, rp, wireMode, showInternals, showDrilling, selectedPartId, onPartsAtPoint, onPartContextMenu, customParts, partOverrides, partLabels, partComments }: {
  cab: CabinetInstance; rp: ResolvedCabinet; wireMode: boolean; showInternals: boolean
  showDrilling?: boolean
  selectedPartId: string | null; onPartsAtPoint: (parts: PartMeta[], cx: number, cy: number) => void
  onPartContextMenu?: (parts: PartMeta[], cx: number, cy: number) => void
  customParts?: CabinetCustomPart[]; partOverrides?: PartPosOverrides
  partLabels?: PartLabels; partComments?: PartComments
}) {
  const { dx, dy } = cab
  const drills = useMemo(() => (showDrilling ? cabinetSeamDrills(rp) : []), [rp, showDrilling])
  const allSlides = useMemo(() => [...(rp.drawer_stacks ?? []).flatMap(s => s.slides), ...(rp.internal_slides ?? [])], [rp])
  const triMap = useSlideTriangles(allSlides)
  const pl = 80, pt = 50, pr = 40, pb = 40
  const vw = dx + pl + pr
  const vh = dy + pt + pb
  const ox = pl, oy = pt
  const { svgRef, viewBox } = useSvgZoom(vw, vh)

  function toSVG(ex: number, ey: number, ew: number, eh: number) {
    return { x: ox + ex, y: oy + dy - ey, w: ew, h: eh }
  }
  // Cabinet (x,y) → svg, for rotated-part silhouettes (Z ignored in elevation).
  const proj = (px: number, py: number) => ({ x: ox + px, y: oy + dy - py })
  function sel(id: string) { return selectedPartId === id }
  function stroke(id: string, base: string) { return sel(id) ? SEL_STROKE : base }
  function sw(id: string, base: number) { return sel(id) ? 2 : base }
  const cp: React.CSSProperties = { cursor: 'pointer' }
  function faceColor(ft: string) { return ft === 'drawer_face' ? RC.drawer : RC.door }

  const partMap = new Map<string, PartMeta>()
  rp.case_parts.forEach(p => {
    const m = svgCaseMeta(p); const ov = partOverrides?.[m.id]
    partMap.set(m.id, ov ? { ...m, x: (m.x ?? 0) + ov.ox, y: (m.y ?? 0) + ov.oy, z: (m.z ?? 0) + ov.oz } : m)
  })
  rp.toekick_parts.forEach(p => {
    const m = svgTkMeta(p); const ov = partOverrides?.[m.id]
    partMap.set(m.id, ov ? { ...m, x: (m.x ?? 0) + ov.ox, y: (m.y ?? 0) + ov.oy, z: (m.z ?? 0) + ov.oz } : m)
  })
  rp.internal_parts.forEach(p => {
    const m = svgIntMeta(p); const ov = partOverrides?.[m.id]
    partMap.set(m.id, ov ? { ...m, x: (m.x ?? 0) + ov.ox, y: (m.y ?? 0) + ov.oy, z: (m.z ?? 0) + ov.oz } : m)
  })
  rp.face_zones.filter(z => z.face_type !== 'open').forEach(z => {
    const m = svgZoneMeta(z); const ov = partOverrides?.[m.id]
    partMap.set(m.id, ov ? { ...m, x: (m.x ?? 0) + ov.ox, y: (m.y ?? 0) + ov.oy, z: (m.z ?? 0) + ov.oz } : m)
  })
  ;(rp.drawer_stacks ?? []).forEach(stack => {
    stack.box_parts.forEach(p => { const m = svgDbMeta(p, stack); partMap.set(m.id, m) })
    stack.slides.forEach(s => { const m = svgSlideMeta(s, stack); partMap.set(m.id, m) })
  })
  ;(rp.internal_slides ?? []).forEach(s => { const m = svgInternalSlideMeta(s); partMap.set(m.id, m) })
  ;(customParts ?? []).filter(p => p.visible).forEach(p => { const m = svgCustomMeta(p); partMap.set(m.id, m) })
  if (partLabels)   for (const [id, lbl]  of Object.entries(partLabels))   { const m = partMap.get(id); if (m) partMap.set(id, { ...m, label: lbl }) }
  if (partComments) for (const [id, cmt]  of Object.entries(partComments)) { const m = partMap.get(id); if (m) partMap.set(id, { ...m, comment: cmt }) }

  const selOrigin = selectedPartId ? partMap.get(selectedPartId) ?? null : null

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    e.stopPropagation()
    onPartsAtPoint(svgHitParts(e, partMap), e.clientX, e.clientY)
  }

  function handleContextMenu(e: React.MouseEvent<SVGSVGElement>) {
    e.preventDefault(); e.stopPropagation()
    const hits = svgHitParts(e, partMap)
    if (hits.length > 0) onPartContextMenu?.(hits, e.clientX, e.clientY)
  }

  return (
    <svg ref={svgRef} viewBox={viewBox} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%', cursor: 'crosshair' }} onClick={handleClick} onContextMenu={handleContextMenu}>
      <rect x={ox} y={oy} width={dx} height={dy} fill={wireMode ? '#050a12' : C_INT} />

      {showInternals && (rp.drawer_stacks ?? []).flatMap((stack, si) => [
        ...stack.box_parts.map((p, pi) => {
          const meta = svgDbMeta(p, stack)
          const pp = applyOv(p, meta.id, partOverrides)
          const { ex, ey, ew, eh } = dbElevRect(pp as typeof p)
          const r = toSVG(ex, ey, ew, eh)
          return <PartShape key={`db${si}_${pi}`} x={r.x} y={r.y} w={r.w} h={r.h}
            box={dbBox3(p)} ov={partOverrides?.[meta.id]} project={proj}
            fill={wireMode ? 'transparent' : RC.drawerBox.fill}
            stroke={stroke(meta.id, RC.drawerBox.stroke)} strokeWidth={sw(meta.id, 0.5)}
            dataPartId={meta.id} style={cp} />
        }),
        ...stack.slides.map((s, li) => {
          const meta = svgSlideMeta(s, stack)
          const pp = applyOv(s, meta.id, partOverrides)
          const { ex, ey, ew, eh } = slideElevRect(pp as typeof s)
          const r = toSVG(ex, ey, ew, eh)
          return <SlideShape key={`sl${si}_${li}`} rectX={r.x} rectY={r.y} rectW={r.w} rectH={r.h}
            box={slideBox3(s)} ov={partOverrides?.[meta.id]} project={proj}
            slide={pp} tris={triMap.get(triKey(s) ?? '')} wireMode={wireMode} selected={sel(meta.id)}
            fill={RC.slide.fill} stroke={RC.slide.stroke} strokeWidth={sw(meta.id, 0.5)}
            strokeDasharray="3 2" dataPartId={meta.id} style={cp} />
        }),
      ])}

      {showInternals && (rp.internal_slides ?? []).map((s, li) => {
        const meta = svgInternalSlideMeta(s)
        const pp = applyOv(s, meta.id, partOverrides)
        const { ex, ey, ew, eh } = slideElevRect(pp as typeof s)
        const r = toSVG(ex, ey, ew, eh)
        return <SlideShape key={`isl${li}`} rectX={r.x} rectY={r.y} rectW={r.w} rectH={r.h}
          box={slideBox3(s)} ov={partOverrides?.[meta.id]} project={proj}
          slide={pp} tris={triMap.get(triKey(s) ?? '')} wireMode={wireMode} selected={sel(meta.id)}
          fill={RC.slide.fill} stroke={RC.slide.stroke} strokeWidth={sw(meta.id, 0.5)}
          strokeDasharray="3 2" dataPartId={meta.id} style={cp} />
      })}

      {rp.toekick_parts.map((p, i) => {
        const meta = svgTkMeta(p)
        const pp = applyOv(p, meta.id, partOverrides)
        const { ex, ey, ew, eh } = tkElevRect(pp as typeof p)
        const r = toSVG(ex, ey, ew, eh)
        const isSpreader = p.part_key === 'spreader_vertical' || p.part_key === 'spreader_horizontal'
        return <PartShape key={`tk${i}`} x={r.x} y={r.y} w={r.w} h={r.h}
          box={tkBox3(p)} ov={partOverrides?.[meta.id]} project={proj}
          fill={isSpreader || wireMode ? 'transparent' : RC.toekick.fill}
          stroke={stroke(meta.id, RC.toekick.stroke)} strokeWidth={sw(meta.id, isSpreader ? 1 : 0.75)}
          strokeDasharray={isSpreader && !sel(meta.id) ? '4 3' : undefined}
          dataPartId={meta.id} style={cp} />
      })}

      {rp.internal_parts.map((p, i) => {
        const meta = svgIntMeta(p)
        const pp = applyOv(p, meta.id, partOverrides)
        const { ex, ey, ew, eh } = intElevRect(pp as typeof p)
        const r = toSVG(ex, ey, ew, eh)
        return <PartShape key={`sh${i}`} x={r.x} y={r.y} w={r.w} h={r.h}
          box={intBox3(p)} ov={partOverrides?.[meta.id]} project={proj}
          fill={wireMode ? 'transparent' : RC.shelf.fill}
          stroke={stroke(meta.id, RC.shelf.stroke)} strokeWidth={sw(meta.id, 0.5)}
          dataPartId={meta.id} style={cp} />
      })}

      {rp.case_parts.map((p, i) => {
        const meta = svgCaseMeta(p)
        const pp = applyOv(p, meta.id, partOverrides)
        const { ex, ey, ew, eh } = elevRect({ ...pp, part_key: p.part_key })
        const r = toSVG(ex, ey, ew, eh)
        return <PartShape key={`cp${i}`} x={r.x} y={r.y} w={r.w} h={r.h}
          box={caseBox(p)} ov={partOverrides?.[meta.id]} project={proj}
          fill={wireMode ? 'transparent' : RC.carcass.fill}
          stroke={stroke(meta.id, RC.carcass.stroke)} strokeWidth={sw(meta.id, 0.75)}
          dataPartId={meta.id} style={cp} />
      })}

      {rp.face_zones.filter(z => z.face_type !== 'open').map((z, i) => {
        const meta = svgZoneMeta(z)
        const pp = applyOv(z, meta.id, partOverrides)
        const { ex, ey, ew, eh } = zoneElevRect(pp as typeof z)
        const r = toSVG(ex, ey, ew, eh)
        const col = faceColor(z.face_type)
        return (
          <g key={`fz${i}`}>
            <PartShape x={r.x} y={r.y} w={r.w} h={r.h}
              box={zoneBox3(z)} ov={partOverrides?.[meta.id]} project={proj}
              fill={wireMode ? 'transparent' : col.fill}
              stroke={stroke(meta.id, col.stroke)} strokeWidth={sw(meta.id, wireMode ? 0.75 : 1)}
              fillOpacity={wireMode ? 1 : 0.85}
              dataPartId={meta.id} style={cp} />
            {z.hinge_side === 'left'  && <line x1={r.x}     y1={r.y} x2={r.x}     y2={r.y+r.h} stroke={stroke(meta.id, col.stroke)} strokeWidth={2} vectorEffect="non-scaling-stroke" data-part-id={meta.id} style={cp} />}
            {z.hinge_side === 'right' && <line x1={r.x+r.w} y1={r.y} x2={r.x+r.w} y2={r.y+r.h} stroke={stroke(meta.id, col.stroke)} strokeWidth={2} vectorEffect="non-scaling-stroke" data-part-id={meta.id} style={cp} />}
          </g>
        )
      })}

      {(customParts ?? []).filter(p => p.visible && Number(p.dz) > 0 && Number(p.dy) > 0).map((p, i) => {
        const meta = svgCustomMeta(p)
        const r = toSVG(p.x, p.y + Number(p.dz), Number(p.dy), Number(p.dz))
        return <rect key={`cust${i}`} x={r.x} y={r.y} width={Math.max(r.w, 1)} height={Math.max(r.h, 1)}
          fill={wireMode ? 'transparent' : '#2d1a4a'}
          stroke={stroke(meta.id, '#a78bfa')} strokeWidth={sw(meta.id, 1.5)} vectorEffect="non-scaling-stroke"
          strokeDasharray={sel(meta.id) ? undefined : '5 3'}
          data-part-id={meta.id} style={cp} />
      })}
      <DrillOverlay drills={drills} perp="z"
        project={(x, y) => ({ x: ox + x, y: oy + dy - y })}
        dirOf={(a: DrillAxis) => a === 'x+' ? { dx: 1, dy: 0 } : a === 'x-' ? { dx: -1, dy: 0 } : a === 'y+' ? { dx: 0, dy: -1 } : { dx: 0, dy: 1 }} />
      <rect x={ox} y={oy} width={dx} height={dy} fill="none" stroke="#6b7280" strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
      <line x1={ox-20} y1={oy+dy} x2={ox+dx+20} y2={oy+dy} stroke="#334155" strokeWidth={2} strokeDasharray="8 4" vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
      {dimH(ox, ox+dx, oy-35, `${dx}mm`, true)}
      {dimV(ox-50, oy, oy+dy, `${dy}mm`)}
      {selOrigin != null && selOrigin.x != null && selOrigin.y != null && (
        <OriginMarker sx={ox + selOrigin.x} sy={oy + dy - selOrigin.y} hLabel="X" vLabel="Y" />
      )}
      {viewLabel(ox+dx/2, vh-14, 'ELEVATION — WIDTH × HEIGHT')}
    </svg>
  )
}

export function ResolvedTop({ cab, rp, wireMode, showInternals, showDrilling, selectedPartId, onPartsAtPoint, onPartContextMenu, customParts, partOverrides, partLabels, partComments }: {
  cab: CabinetInstance; rp: ResolvedCabinet; wireMode: boolean; showInternals: boolean
  showDrilling?: boolean
  selectedPartId: string | null; onPartsAtPoint: (parts: PartMeta[], cx: number, cy: number) => void
  onPartContextMenu?: (parts: PartMeta[], cx: number, cy: number) => void
  customParts?: CabinetCustomPart[]; partOverrides?: PartPosOverrides
  partLabels?: PartLabels; partComments?: PartComments
}) {
  const { dx, dz } = cab
  const drills = useMemo(() => (showDrilling ? cabinetSeamDrills(rp) : []), [rp, showDrilling])
  const allSlides = useMemo(() => [...(rp.drawer_stacks ?? []).flatMap(s => s.slides), ...(rp.internal_slides ?? [])], [rp])
  const triMap = useSlideTriangles(allSlides)
  const wallH = 40
  const pl = 80, pt = 50 + wallH, pr = 40, pb = 50
  const vw = dx + pl + pr
  const vh = dz + pt + pb
  const ox = pl, oz = pt
  const { svgRef, viewBox } = useSvgZoom(vw, vh)

  function toSVG(tx: number, tz: number, tw: number, td: number) {
    return { x: ox + tx, y: oz + tz, w: tw, h: td }
  }
  // Cabinet (x,y,z) → svg, for rotated-part silhouettes (Y ignored in top view).
  const proj = (px: number, _py: number, pz: number) => ({ x: ox + px, y: oz + pz })
  function sel(id: string) { return selectedPartId === id }
  function stroke(id: string, base: string) { return sel(id) ? SEL_STROKE : base }
  function sw(id: string, base: number) { return sel(id) ? 2 : base }
  const cp: React.CSSProperties = { cursor: 'pointer' }

  const partMap = new Map<string, PartMeta>()
  rp.case_parts.forEach(p => {
    const m = svgCaseMeta(p); const ov = partOverrides?.[m.id]
    partMap.set(m.id, ov ? { ...m, x: (m.x ?? 0) + ov.ox, y: (m.y ?? 0) + ov.oy, z: (m.z ?? 0) + ov.oz } : m)
  })
  rp.toekick_parts.forEach(p => {
    const m = svgTkMeta(p); const ov = partOverrides?.[m.id]
    partMap.set(m.id, ov ? { ...m, x: (m.x ?? 0) + ov.ox, y: (m.y ?? 0) + ov.oy, z: (m.z ?? 0) + ov.oz } : m)
  })
  rp.internal_parts.forEach(p => {
    const m = svgIntMeta(p); const ov = partOverrides?.[m.id]
    partMap.set(m.id, ov ? { ...m, x: (m.x ?? 0) + ov.ox, y: (m.y ?? 0) + ov.oy, z: (m.z ?? 0) + ov.oz } : m)
  })
  rp.face_zones.filter(z => z.face_type !== 'open').forEach(z => {
    const m = svgZoneMeta(z); const ov = partOverrides?.[m.id]
    partMap.set(m.id, ov ? { ...m, x: (m.x ?? 0) + ov.ox, y: (m.y ?? 0) + ov.oy, z: (m.z ?? 0) + ov.oz } : m)
  })
  ;(rp.drawer_stacks ?? []).forEach(stack => {
    stack.box_parts.forEach(p => { const m = svgDbMeta(p, stack); partMap.set(m.id, m) })
    stack.slides.forEach(s => { const m = svgSlideMeta(s, stack); partMap.set(m.id, m) })
  })
  ;(rp.internal_slides ?? []).forEach(s => { const m = svgInternalSlideMeta(s); partMap.set(m.id, m) })
  ;(customParts ?? []).filter(p => p.visible).forEach(p => { const m = svgCustomMeta(p); partMap.set(m.id, m) })
  if (partLabels)   for (const [id, lbl] of Object.entries(partLabels))   { const m = partMap.get(id); if (m) partMap.set(id, { ...m, label: lbl }) }
  if (partComments) for (const [id, cmt] of Object.entries(partComments)) { const m = partMap.get(id); if (m) partMap.set(id, { ...m, comment: cmt }) }

  const selOrigin = selectedPartId ? partMap.get(selectedPartId) ?? null : null

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    e.stopPropagation()
    onPartsAtPoint(svgHitParts(e, partMap), e.clientX, e.clientY)
  }

  function handleContextMenu(e: React.MouseEvent<SVGSVGElement>) {
    e.preventDefault(); e.stopPropagation()
    const hits = svgHitParts(e, partMap)
    if (hits.length > 0) onPartContextMenu?.(hits, e.clientX, e.clientY)
  }

  return (
    <svg ref={svgRef} viewBox={viewBox} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%', cursor: 'crosshair' }} onClick={handleClick} onContextMenu={handleContextMenu}>
      <rect x={ox} y={oz - wallH} width={dx} height={wallH} fill={C_WALL} stroke={C_STROKE} strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
      <text x={ox + dx/2} y={oz - wallH/2} textAnchor="middle" dominantBaseline="central"
        fontSize={18} fill="#475569" fontFamily="system-ui,sans-serif" letterSpacing={2}>WALL</text>
      <rect x={ox} y={oz} width={dx} height={dz} fill={wireMode ? '#050a12' : C_INT} />

      {showInternals && (rp.drawer_stacks ?? []).flatMap((stack, si) => [
        ...stack.box_parts.map((p, pi) => {
          const meta = svgDbMeta(p, stack)
          const pp = applyOv(p, meta.id, partOverrides)
          const r = dbTopRect(pp as typeof p); const s = toSVG(r.tx, r.tz, r.tw, r.td)
          return <PartShape key={`db${si}_${pi}`} x={s.x} y={s.y} w={s.w} h={s.h}
            box={dbBox3(p)} ov={partOverrides?.[meta.id]} project={proj}
            fill={wireMode ? 'transparent' : RC.drawerBox.fill}
            stroke={stroke(meta.id, RC.drawerBox.stroke)} strokeWidth={sw(meta.id, 0.5)}
            dataPartId={meta.id} style={cp} />
        }),
        ...stack.slides.map((sl, li) => {
          const meta = svgSlideMeta(sl, stack)
          const pp = applyOv(sl, meta.id, partOverrides)
          const r = slideTopRect(pp as typeof sl); const s = toSVG(r.tx, r.tz, r.tw, r.td)
          return <SlideShape key={`sl${si}_${li}`} rectX={s.x} rectY={s.y} rectW={s.w} rectH={s.h}
            box={slideBox3(sl)} ov={partOverrides?.[meta.id]} project={proj}
            slide={pp} tris={triMap.get(triKey(sl) ?? '')} wireMode={wireMode} selected={sel(meta.id)}
            fill={RC.slide.fill} stroke={RC.slide.stroke} strokeWidth={sw(meta.id, 0.5)}
            strokeDasharray="3 2" dataPartId={meta.id} style={cp} />
        }),
      ])}

      {showInternals && (rp.internal_slides ?? []).map((sl, li) => {
        const meta = svgInternalSlideMeta(sl)
        const pp = applyOv(sl, meta.id, partOverrides)
        const r = slideTopRect(pp as typeof sl); const s = toSVG(r.tx, r.tz, r.tw, r.td)
        return <SlideShape key={`isl${li}`} rectX={s.x} rectY={s.y} rectW={s.w} rectH={s.h}
          box={slideBox3(sl)} ov={partOverrides?.[meta.id]} project={proj}
          slide={pp} tris={triMap.get(triKey(sl) ?? '')} wireMode={wireMode} selected={sel(meta.id)}
          fill={RC.slide.fill} stroke={RC.slide.stroke} strokeWidth={sw(meta.id, 0.5)}
          strokeDasharray="3 2" dataPartId={meta.id} style={cp} />
      })}

      {rp.internal_parts.map((p, i) => {
        const meta = svgIntMeta(p)
        const pp = applyOv(p, meta.id, partOverrides)
        const r = intTopRect(pp as typeof p); const s = toSVG(r.tx, r.tz, r.tw, r.td)
        return <PartShape key={`sh${i}`} x={s.x} y={s.y} w={s.w} h={s.h}
          box={intBox3(p)} ov={partOverrides?.[meta.id]} project={proj}
          fill={wireMode ? 'transparent' : RC.shelf.fill}
          stroke={stroke(meta.id, RC.shelf.stroke)} strokeWidth={sw(meta.id, 0.5)}
          dataPartId={meta.id} style={cp} />
      })}

      {rp.case_parts.map((p, i) => {
        const meta = svgCaseMeta(p)
        const pp = applyOv(p, meta.id, partOverrides)
        const r = topRect(pp as typeof p); const s = toSVG(r.tx, r.tz, r.tw, r.td)
        return <PartShape key={`cp${i}`} x={s.x} y={s.y} w={s.w} h={s.h}
          box={caseBox(p)} ov={partOverrides?.[meta.id]} project={proj}
          fill={wireMode ? 'transparent' : RC.carcass.fill}
          stroke={stroke(meta.id, RC.carcass.stroke)} strokeWidth={sw(meta.id, 0.75)}
          dataPartId={meta.id} style={cp} />
      })}

      {rp.toekick_parts.map((p, i) => {
        const meta = svgTkMeta(p)
        const pp = applyOv(p, meta.id, partOverrides)
        const r = tkTopRect(pp as typeof p); const s = toSVG(r.tx, r.tz, r.tw, r.td)
        return <PartShape key={`tk${i}`} x={s.x} y={s.y} w={s.w} h={s.h}
          box={tkBox3(p)} ov={partOverrides?.[meta.id]} project={proj}
          fill={wireMode ? 'transparent' : RC.toekick.fill}
          stroke={stroke(meta.id, RC.toekick.stroke)} strokeWidth={sw(meta.id, 0.75)}
          dataPartId={meta.id} style={cp} />
      })}

      {rp.face_zones.filter(z => z.face_type !== 'open').map((z, i) => {
        const meta = svgZoneMeta(z)
        const pp = applyOv(z, meta.id, partOverrides)
        const r = zoneTopRect(pp as typeof z); const s = toSVG(r.tx, r.tz, r.tw, r.td)
        const col = z.face_type === 'drawer_face' ? RC.drawer : RC.door
        return <PartShape key={`fz${i}`} x={s.x} y={s.y} w={s.w} h={s.h}
          box={zoneBox3(z)} ov={partOverrides?.[meta.id]} project={proj}
          fill={wireMode ? 'transparent' : col.fill}
          stroke={stroke(meta.id, col.stroke)} strokeWidth={sw(meta.id, wireMode ? 0.75 : 1)}
          fillOpacity={wireMode ? 1 : 0.85}
          dataPartId={meta.id} style={cp} />
      })}

      {(customParts ?? []).filter(p => p.visible && Number(p.dy) > 0 && Number(p.dx) > 0).map((p, i) => {
        const meta = svgCustomMeta(p)
        const s = toSVG(p.x, p.z, Number(p.dy), Number(p.dx))
        return <rect key={`cust${i}`} x={s.x} y={s.y} width={Math.max(s.w, 1)} height={Math.max(s.h, 1)}
          fill={wireMode ? 'transparent' : '#2d1a4a'}
          stroke={stroke(meta.id, '#a78bfa')} strokeWidth={sw(meta.id, 1.5)} vectorEffect="non-scaling-stroke"
          strokeDasharray={sel(meta.id) ? undefined : '5 3'}
          data-part-id={meta.id} style={cp} />
      })}
      <DrillOverlay drills={drills} perp="y"
        project={(x, _y, z) => ({ x: ox + x, y: oz + z })}
        dirOf={(a: DrillAxis) => a === 'x+' ? { dx: 1, dy: 0 } : a === 'x-' ? { dx: -1, dy: 0 } : a === 'z+' ? { dx: 0, dy: 1 } : { dx: 0, dy: -1 }} />
      <rect x={ox} y={oz} width={dx} height={dz} fill="none" stroke="#6b7280" strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
      <text x={ox + dx/2} y={oz + dz + 22} textAnchor="middle" dominantBaseline="central"
        fontSize={18} fill="#374151" fontFamily="system-ui,sans-serif">ACCESS</text>
      {dimH(ox, ox + dx, oz + dz + 50, `${dx}mm`)}
      {dimV(ox - 50, oz, oz + dz, `${dz}mm`)}
      {selOrigin != null && selOrigin.x != null && selOrigin.z != null && (
        <OriginMarker sx={ox + selOrigin.x} sy={oz + selOrigin.z} hLabel="X" vLabel="Z" vUp={false} />
      )}
      {viewLabel(ox + dx/2, vh - 14, 'TOP — WIDTH × DEPTH')}
    </svg>
  )
}

export function ResolvedSide({ cab, rp, wireMode, showInternals, showDrilling, selectedPartId, onPartsAtPoint, onPartContextMenu, customParts, partOverrides, partLabels, partComments }: {
  cab: CabinetInstance; rp: ResolvedCabinet; wireMode: boolean; showInternals: boolean
  showDrilling?: boolean
  selectedPartId: string | null; onPartsAtPoint: (parts: PartMeta[], cx: number, cy: number) => void
  onPartContextMenu?: (parts: PartMeta[], cx: number, cy: number) => void
  customParts?: CabinetCustomPart[]; partOverrides?: PartPosOverrides
  partLabels?: PartLabels; partComments?: PartComments
}) {
  const { dz, dy } = cab
  const drills = useMemo(() => (showDrilling ? cabinetSeamDrills(rp) : []), [rp, showDrilling])
  const allSlides = useMemo(() => [...(rp.drawer_stacks ?? []).flatMap(s => s.slides), ...(rp.internal_slides ?? [])], [rp])
  const triMap = useSlideTriangles(allSlides)
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
  const oz = pl, oy = pt
  const { svgRef, viewBox } = useSvgZoom(vw, vh)

  function toSVG(sz: number, cy_top: number, w: number, h: number) {
    return { x: oz + sz, y: oy + dy - cy_top, w, h }
  }
  // Cabinet (x,y,z) → svg, for rotated-part silhouettes (X ignored in side view).
  const proj = (_px: number, py: number, pz: number) => ({ x: oz + pz, y: oy + dy - py })
  function sel(id: string) { return selectedPartId === id }
  function stroke(id: string, base: string) { return sel(id) ? SEL_STROKE : base }
  function sw(id: string, base: number) { return sel(id) ? 2 : base }
  const cp: React.CSSProperties = { cursor: 'pointer' }

  const partMap = new Map<string, PartMeta>()
  rp.case_parts.forEach(p => {
    const m = svgCaseMeta(p); const ov = partOverrides?.[m.id]
    partMap.set(m.id, ov ? { ...m, x: (m.x ?? 0) + ov.ox, y: (m.y ?? 0) + ov.oy, z: (m.z ?? 0) + ov.oz } : m)
  })
  rp.toekick_parts.forEach(p => {
    const m = svgTkMeta(p); const ov = partOverrides?.[m.id]
    partMap.set(m.id, ov ? { ...m, x: (m.x ?? 0) + ov.ox, y: (m.y ?? 0) + ov.oy, z: (m.z ?? 0) + ov.oz } : m)
  })
  rp.internal_parts.forEach(p => {
    const m = svgIntMeta(p); const ov = partOverrides?.[m.id]
    partMap.set(m.id, ov ? { ...m, x: (m.x ?? 0) + ov.ox, y: (m.y ?? 0) + ov.oy, z: (m.z ?? 0) + ov.oz } : m)
  })
  rp.face_zones.filter(z => z.face_type !== 'open').forEach(z => {
    const m = svgZoneMeta(z); const ov = partOverrides?.[m.id]
    partMap.set(m.id, ov ? { ...m, x: (m.x ?? 0) + ov.ox, y: (m.y ?? 0) + ov.oy, z: (m.z ?? 0) + ov.oz } : m)
  })
  ;(rp.drawer_stacks ?? []).forEach(stack => {
    stack.box_parts.forEach(p => { const m = svgDbMeta(p, stack); partMap.set(m.id, m) })
    stack.slides.forEach(s => { const m = svgSlideMeta(s, stack); partMap.set(m.id, m) })
  })
  ;(rp.internal_slides ?? []).forEach(s => { const m = svgInternalSlideMeta(s); partMap.set(m.id, m) })
  ;(customParts ?? []).filter(p => p.visible).forEach(p => { const m = svgCustomMeta(p); partMap.set(m.id, m) })
  if (partLabels)   for (const [id, lbl] of Object.entries(partLabels))   { const m = partMap.get(id); if (m) partMap.set(id, { ...m, label: lbl }) }
  if (partComments) for (const [id, cmt] of Object.entries(partComments)) { const m = partMap.get(id); if (m) partMap.set(id, { ...m, comment: cmt }) }

  const selOrigin = selectedPartId ? partMap.get(selectedPartId) ?? null : null

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    e.stopPropagation()
    onPartsAtPoint(svgHitParts(e, partMap), e.clientX, e.clientY)
  }

  function handleContextMenu(e: React.MouseEvent<SVGSVGElement>) {
    e.preventDefault(); e.stopPropagation()
    const hits = svgHitParts(e, partMap)
    if (hits.length > 0) onPartContextMenu?.(hits, e.clientX, e.clientY)
  }

  return (
    <svg ref={svgRef} viewBox={viewBox} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%', cursor: 'crosshair' }} onClick={handleClick} onContextMenu={handleContextMenu}>
      <rect x={oz - wallW} y={oy} width={wallW} height={dy} fill={C_WALL} stroke={C_STROKE} strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
      <text x={oz - wallW/2} y={oy + dy/2} textAnchor="middle" dominantBaseline="central"
        fontSize={16} fill="#475569" fontFamily="system-ui,sans-serif"
        transform={`rotate(-90,${oz - wallW/2},${oy + dy/2})`}>WALL</text>
      <rect x={oz} y={oy} width={dz} height={dy} fill={wireMode ? '#050a12' : C_INT} />

      {showInternals && (rp.drawer_stacks ?? []).flatMap((stack, si) => [
        ...stack.box_parts.map((p, pi) => {
          const meta = svgDbMeta(p, stack)
          const pp = applyOv(p, meta.id, partOverrides)
          const r = dbSideRect(pp as typeof p); const s = toSVG(r.sz, r.cy_top, r.sw, r.sh)
          return <PartShape key={`db${si}_${pi}`} x={s.x} y={s.y} w={s.w} h={s.h}
            box={dbBox3(p)} ov={partOverrides?.[meta.id]} project={proj}
            fill={wireMode ? 'transparent' : RC.drawerBox.fill}
            stroke={stroke(meta.id, RC.drawerBox.stroke)} strokeWidth={sw(meta.id, 0.5)}
            dataPartId={meta.id} style={cp} />
        }),
        ...stack.slides.map((sl, li) => {
          const meta = svgSlideMeta(sl, stack)
          const pp = applyOv(sl, meta.id, partOverrides)
          const r = slideSideRect(pp as typeof sl); const s = toSVG(r.sz, r.cy_top, r.sw, r.sh)
          return <SlideShape key={`sl${si}_${li}`} rectX={s.x} rectY={s.y} rectW={s.w} rectH={s.h}
            box={slideBox3(sl)} ov={partOverrides?.[meta.id]} project={proj}
            slide={pp} tris={triMap.get(triKey(sl) ?? '')} wireMode={wireMode} selected={sel(meta.id)}
            fill={RC.slide.fill} stroke={RC.slide.stroke} strokeWidth={sw(meta.id, 0.5)}
            strokeDasharray="3 2" dataPartId={meta.id} style={cp} />
        }),
      ])}

      {showInternals && (rp.internal_slides ?? []).map((sl, li) => {
        const meta = svgInternalSlideMeta(sl)
        const pp = applyOv(sl, meta.id, partOverrides)
        const r = slideSideRect(pp as typeof sl); const s = toSVG(r.sz, r.cy_top, r.sw, r.sh)
        return <SlideShape key={`isl${li}`} rectX={s.x} rectY={s.y} rectW={s.w} rectH={s.h}
          box={slideBox3(sl)} ov={partOverrides?.[meta.id]} project={proj}
          slide={pp} tris={triMap.get(triKey(sl) ?? '')} wireMode={wireMode} selected={sel(meta.id)}
          fill={RC.slide.fill} stroke={RC.slide.stroke} strokeWidth={sw(meta.id, 0.5)}
          strokeDasharray="3 2" dataPartId={meta.id} style={cp} />
      })}

      {rp.internal_parts.map((p, i) => {
        const meta = svgIntMeta(p)
        const pp = applyOv(p, meta.id, partOverrides)
        const r = intSideRect(pp as typeof p); const s = toSVG(r.sz, r.cy_top, r.sw, r.sh)
        return <PartShape key={`sh${i}`} x={s.x} y={s.y} w={s.w} h={s.h}
          box={intBox3(p)} ov={partOverrides?.[meta.id]} project={proj}
          fill={wireMode ? 'transparent' : RC.shelf.fill}
          stroke={stroke(meta.id, RC.shelf.stroke)} strokeWidth={sw(meta.id, 0.5)}
          dataPartId={meta.id} style={cp} />
      })}

      {rp.case_parts.map((p, i) => {
        const meta = svgCaseMeta(p)
        const pp = applyOv(p, meta.id, partOverrides)
        const r = sideRect(pp as typeof p); if (!r) return null
        const s = toSVG(r.sz, r.cy_top, r.sw, r.sh)
        return <PartShape key={`cp${i}`} x={s.x} y={s.y} w={s.w} h={s.h}
          box={caseBox(p)} ov={partOverrides?.[meta.id]} project={proj}
          fill={wireMode ? 'transparent' : RC.carcass.fill}
          stroke={stroke(meta.id, RC.carcass.stroke)} strokeWidth={sw(meta.id, 0.75)}
          dataPartId={meta.id} style={cp} />
      })}

      {rp.toekick_parts.map((p, i) => {
        const meta = svgTkMeta(p)
        const pp = applyOv(p, meta.id, partOverrides)
        const r = tkSideRect(pp as typeof p); const s = toSVG(r.sz, r.cy_top, r.sw, r.sh)
        return <PartShape key={`tk${i}`} x={s.x} y={s.y} w={s.w} h={s.h}
          box={tkBox3(p)} ov={partOverrides?.[meta.id]} project={proj}
          fill={wireMode ? 'transparent' : RC.toekick.fill}
          stroke={stroke(meta.id, RC.toekick.stroke)} strokeWidth={sw(meta.id, 0.75)}
          dataPartId={meta.id} style={cp} />
      })}

      {rp.face_zones.filter(z => z.face_type !== 'open').map((z, i) => {
        const meta = svgZoneMeta(z)
        const pp = applyOv(z, meta.id, partOverrides)
        const r = zoneSideRect(pp as typeof z); const s = toSVG(r.sz, r.cy_top, r.sw, r.sh)
        const col = z.face_type === 'drawer_face' ? RC.drawer : RC.door
        return <PartShape key={`fz${i}`} x={s.x} y={s.y} w={s.w} h={s.h}
          box={zoneBox3(z)} ov={partOverrides?.[meta.id]} project={proj}
          fill={wireMode ? 'transparent' : col.fill}
          stroke={stroke(meta.id, col.stroke)} strokeWidth={sw(meta.id, wireMode ? 0.75 : 1)}
          fillOpacity={wireMode ? 1 : 0.85}
          dataPartId={meta.id} style={cp} />
      })}

      {(customParts ?? []).filter(p => p.visible && Number(p.dz) > 0 && Number(p.dx) > 0).map((p, i) => {
        const meta = svgCustomMeta(p)
        const s = toSVG(p.z, p.y + Number(p.dz), Number(p.dx), Number(p.dz))
        return <rect key={`cust${i}`} x={s.x} y={s.y} width={Math.max(s.w, 1)} height={Math.max(s.h, 1)}
          fill={wireMode ? 'transparent' : '#2d1a4a'}
          stroke={stroke(meta.id, '#a78bfa')} strokeWidth={sw(meta.id, 1.5)} vectorEffect="non-scaling-stroke"
          strokeDasharray={sel(meta.id) ? undefined : '5 3'}
          data-part-id={meta.id} style={cp} />
      })}
      <DrillOverlay drills={drills} perp="x"
        project={(_x, y, z) => ({ x: oz + z, y: oy + dy - y })}
        dirOf={(a: DrillAxis) => a === 'z+' ? { dx: 1, dy: 0 } : a === 'z-' ? { dx: -1, dy: 0 } : a === 'y+' ? { dx: 0, dy: -1 } : { dx: 0, dy: 1 }} />
      <rect x={oz} y={oy} width={dz} height={dy} fill="none" stroke="#6b7280" strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
      <line x1={oz-20} y1={oy+dy} x2={oz+dz+20} y2={oy+dy} stroke="#334155" strokeWidth={2} strokeDasharray="8 4" vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />

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
      {selOrigin != null && selOrigin.z != null && selOrigin.y != null && (
        <OriginMarker sx={oz + selOrigin.z} sy={oy + dy - selOrigin.y} hLabel="Z" vLabel="Y" />
      )}
    </svg>
  )
}

// ── Fallback approximate views (used when resolver data not available) ─────────

export function TopView({ cab }: { cab: CabinetInstance }) {
  const { dx, dz, has_carcass, has_face } = cab
  const wallH = 50
  const vw = dx + L + R
  const vh = dz + T + B + wallH
  const x0 = L, y0 = T + wallH
  const { svgRef, viewBox } = useSvgZoom(vw, vh)

  return (
    <svg ref={svgRef} viewBox={viewBox} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%' }}>
      <rect x={x0} y={T} width={dx} height={wallH} fill={C_WALL} stroke={C_STROKE} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <text x={x0 + dx/2} y={T + wallH/2} textAnchor="middle" dominantBaseline="central" fontSize={20} fill="#475569" fontFamily="system-ui,sans-serif" letterSpacing={2}>WALL</text>
      <rect x={x0} y={y0} width={dx} height={dz} fill={C_INT} />
      {has_carcass && <>
        <rect x={x0} y={y0} width={dx} height={BT} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <rect x={x0} y={y0} width={PT} height={dz} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <rect x={x0 + dx - PT} y={y0} width={PT} height={dz} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </>}
      {has_face && (
        <rect x={x0} y={y0 + dz - FF} width={dx} height={FF} fill={C_FACE} stroke="#6b7280" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      )}
      <rect x={x0} y={y0} width={dx} height={dz} fill="none" stroke="#6b7280" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <text x={x0 + dx/2} y={y0 + dz + 22} textAnchor="middle" dominantBaseline="central" fontSize={18} fill="#374151" fontFamily="system-ui,sans-serif">ACCESS</text>
      {dimH(x0, x0 + dx, y0 + dz + 50, `${dx}mm`)}
      {dimV(x0 - 50, y0, y0 + dz, `${dz}mm`)}
      {viewLabel(x0 + dx/2, vh - 14, 'TOP — WIDTH × DEPTH')}
    </svg>
  )
}

export function ElevationView({ cab }: { cab: CabinetInstance }) {
  const { dx, dy, has_carcass, has_face, has_toekick, assembly_class, top_type } = cab
  const isBase = assembly_class === 'base' || assembly_class === 'base_corner'
  const carcH = isBase ? dy - TKH : dy
  const vw = dx + L + R
  const vh = dy + T + B
  const x0 = L, y0 = T
  const { svgRef, viewBox } = useSvgZoom(vw, vh)

  return (
    <svg ref={svgRef} viewBox={viewBox} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%' }}>
      <rect x={x0} y={y0} width={dx} height={carcH} fill={C_INT} />
      {isBase && has_toekick && (
        <rect x={x0} y={y0 + carcH} width={dx} height={TKH} fill="#080f1a" stroke={C_STROKE} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      )}
      {has_carcass && <>
        <rect x={x0} y={y0} width={PT} height={carcH} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <rect x={x0 + dx - PT} y={y0} width={PT} height={carcH} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {top_type === 'full_top'
          ? <rect x={x0} y={y0} width={dx} height={PT} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          : <>
              <rect x={x0} y={y0} width={FFS} height={PT} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <rect x={x0 + dx - FFS} y={y0} width={FFS} height={PT} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            </>
        }
        {isBase && <rect x={x0} y={y0 + carcH - PT} width={dx} height={PT} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      </>}
      {has_face && <>
        <rect x={x0} y={y0} width={FFS} height={carcH} fill={C_FACE} stroke="#6b7280" strokeWidth={1} opacity={0.55} vectorEffect="non-scaling-stroke" />
        <rect x={x0 + dx - FFS} y={y0} width={FFS} height={carcH} fill={C_FACE} stroke="#6b7280" strokeWidth={1} opacity={0.55} vectorEffect="non-scaling-stroke" />
        <rect x={x0} y={y0} width={dx} height={FFR} fill={C_FACE} stroke="#6b7280" strokeWidth={1} opacity={0.55} vectorEffect="non-scaling-stroke" />
        <rect x={x0} y={y0 + carcH - FFR} width={dx} height={FFR} fill={C_FACE} stroke="#6b7280" strokeWidth={1} opacity={0.55} vectorEffect="non-scaling-stroke" />
      </>}
      <rect x={x0} y={y0} width={dx} height={dy} fill="none" stroke="#6b7280" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <line x1={x0-20} y1={y0+dy} x2={x0+dx+20} y2={y0+dy} stroke="#334155" strokeWidth={2} strokeDasharray="10 5" vectorEffect="non-scaling-stroke" />
      {dimH(x0, x0+dx, y0-50, `${dx}mm`, true)}
      {dimV(x0-50, y0, y0+dy, `${dy}mm`)}
      {viewLabel(x0+dx/2, vh-14, 'ELEVATION — WIDTH × HEIGHT')}
    </svg>
  )
}

export function SideView({ cab }: { cab: CabinetInstance }) {
  const { dz, dy, has_carcass, has_face, has_toekick, assembly_class, top_type } = cab
  const isBase = assembly_class === 'base' || assembly_class === 'base_corner'
  const carcH = isBase ? dy - TKH : dy
  const vw = dz + L + R + 60
  const vh = dy + T + B
  const x0 = L, y0 = T
  const wallW = 50
  const { svgRef, viewBox } = useSvgZoom(vw, vh)

  return (
    <svg ref={svgRef} viewBox={viewBox} width="100%" height="100%" style={{ maxHeight: '100%', maxWidth: '100%' }}>
      <rect x={x0 - wallW} y={y0} width={wallW} height={dy} fill={C_WALL} stroke={C_STROKE} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <text x={x0 - wallW/2} y={y0 + dy/2} textAnchor="middle" dominantBaseline="central" fontSize={18} fill="#475569" fontFamily="system-ui,sans-serif"
        transform={`rotate(-90,${x0 - wallW/2},${y0 + dy/2})`}>WALL</text>
      <rect x={x0} y={y0} width={dz} height={carcH} fill={C_INT} />
      {isBase && has_toekick && (
        <rect x={x0} y={y0 + carcH} width={dz} height={TKH} fill="#080f1a" stroke={C_STROKE} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      )}
      {has_carcass && <>
        <rect x={x0} y={y0} width={BT} height={dy} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {top_type === 'full_top'
          ? <rect x={x0} y={y0} width={dz} height={PT} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          : <>
              <rect x={x0} y={y0} width={BT + PT} height={PT} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <rect x={x0 + dz - FF - PT} y={y0} width={FF + PT} height={PT} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            </>
        }
        {isBase && <rect x={x0} y={y0 + carcH - PT} width={dz} height={PT} fill={C_PANEL} stroke={C_STROKE} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        {isBase && has_toekick && (
          <rect x={x0 + dz - 60} y={y0 + carcH} width={60} height={TKH} fill={C_WALL} stroke={C_STROKE} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
      </>}
      {has_face && (
        <rect x={x0 + dz - FF} y={y0} width={FF} height={carcH} fill={C_FACE} stroke="#6b7280" strokeWidth={1.5} opacity={0.6} vectorEffect="non-scaling-stroke" />
      )}
      <rect x={x0} y={y0} width={dz} height={dy} fill="none" stroke="#6b7280" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <line x1={x0-20} y1={y0+dy} x2={x0+dz+20} y2={y0+dy} stroke="#334155" strokeWidth={2} strokeDasharray="10 5" vectorEffect="non-scaling-stroke" />
      {dimH(x0, x0+dz, y0-50, `${dz}mm`, true)}
      {dimV(x0+dz+55, y0, y0+dy, `${dy}mm`, true)}
      {isBase && has_toekick && dimV(x0+dz+90, y0+carcH, y0+dy, `${TKH}mm`, true)}
      {viewLabel(x0+dz/2, vh-14, 'SIDE — DEPTH × HEIGHT')}
    </svg>
  )
}
