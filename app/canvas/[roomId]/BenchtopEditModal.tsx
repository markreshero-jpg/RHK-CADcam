'use client'

// Benchtop edit window (Mark 2026-11-27): "right click edit … see them in a
// cabinet edit modal style window … use the same window". Same frame as the
// cabinet editor (EditModalShell): tabs Top / Front / 3D / Parts on the left,
// the benchtop side bar (BenchtopPanel, built by the canvas) on the right.
// Entry: right-click a top → Edit…, double-click a top, or Enter on a selected top.
// Spec: z_benchtop_builder/BENCHTOP-SPEC.md Phase 9.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import EditModalShell, { type ShellTab } from './EditModalShell'
import BenchtopElevation, { btElevBands, type BtElevInfo } from './BenchtopElevation'
import { BenchtopMesh } from './Room3DScene'
import { useIsPhone } from '@/src/lib/usePhone'
import { wheelZoomFactor } from '@/src/lib/wheelZoom'
import { useViewBoxPinch } from './usePinchZoom'
import { useTutorial } from '@/src/lib/tutorial/store'
import CalcInput from '@/src/components/CalcInput'
import { benchtopSectionSolids } from '@/src/lib/crossSectionRoom'
import { sliceFaces, alongRange, type P2 } from '@/src/lib/crossSection'
import type { BenchtopInstance, BenchtopEdgeProfile, Wall } from '@/src/lib/types'
import type { Pt } from '@/src/lib/geometry'
import type { LayerView } from '@/src/lib/displayLayers/resolve'
import { INVERT_FILTER } from '@/src/lib/displayLayers/resolve'
import {
  btSegments, segPoint, segLength, outlinePoints, outlineBounds, outwardNormal,
  effectiveProfileId, edgeProfileColor, waterfallJoin,
} from '@/src/lib/benchtopGeometry'
import { loadResolvedParts, resolveBenchtopFromDB } from '@/src/lib/benchtop-resolver/resolveBenchtopFromDB'
import type { ResolvedBenchtopPart } from '@/src/lib/benchtop-resolver/types'
import { btLocal, type BtShapeEdit } from './canvasTypes'
import { wallFrame } from '@/src/lib/benchtopAnchor'

export type BtViewId = 'top' | 'front' | 'side' | '3d' | 'parts'

const VIEWS: { id: BtViewId; label: string }[] = [
  { id: 'top',   label: 'Top' },
  { id: 'front', label: 'Front' },
  { id: 'side',  label: 'Side' },
  { id: '3d',    label: '3D' },
  { id: 'parts', label: 'Parts' },
]

/** Container size in px (fits the drawings; strokes / text are sized from it). */
function useBoxSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 500 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 800, h: el.clientHeight || 500 }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

/** The modal draws the top whatever the canvas layer set hides — like the cabinet
 *  editor, the set only gives the background / invert (and colours). */
function alwaysShowBenchtop(l: LayerView): LayerView {
  return { ...l, show: (id: string) => id.startsWith('benchtop') || l.show(id) }
}

type VB = { x: number; y: number; w: number; h: number }

/** A drawing fitted to its box that zooms with the wheel about the cursor (the same
 *  feel as the cabinet editor's views: wheelZoomFactor, so touchpads / smooth mice
 *  zoom smoothly and the invert-scroll pref is honoured), pinch-zooms on touch, pans
 *  with a mouse drag, and double-click fits it again. The viewBox lives in a ref so
 *  fast wheel events never work from a stale view. `children(k)` gets px per mm, so
 *  text and strokes stay the same screen size at any zoom. */
function PanZoomSvg({ fit, box, children }: { fit: VB; box: { w: number; h: number }; children: (k: number) => ReactNode }) {
  const svgRef = useRef<SVGSVGElement>(null)
  // The view = the fit box widened to the window's shape, so nothing is letterboxed
  // and the cursor maths below is exact.
  const fitted = useMemo(() => {
    const a = box.w / Math.max(1, box.h)
    const w = Math.max(fit.w, fit.h * a), h = w / a
    return { x: fit.x + fit.w / 2 - w / 2, y: fit.y + fit.h / 2 - h / 2, w, h }
  }, [fit.x, fit.y, fit.w, fit.h, box.w, box.h])
  const vbRef = useRef<VB>(fitted)
  const [vb, setVbState] = useState<VB>(fitted)
  const setVb = useCallback((v: VB) => { vbRef.current = v; setVbState(v) }, [])
  // A new fit (the top changed size, the window resized) → fit again.
  const fitKey = `${Math.round(fitted.x)},${Math.round(fitted.y)},${Math.round(fitted.w)},${Math.round(fitted.h)}`
  const [lastKey, setLastKey] = useState(fitKey)
  if (lastKey !== fitKey) { setLastKey(fitKey); setVbState(fitted) }
  // The refit above sets state only; the ref follows after the render commits.
  useEffect(() => { vbRef.current = vb }, [vb])
  const minW = fitted.w / 60, maxW = fitted.w * 4

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const { x, y, w, h } = vbRef.current
      if (!r.width || !w) return
      // Cursor in drawing mm from the live view (getScreenCTM lags a render behind).
      const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height
      const cx = x + fx * w, cy = y + fy * h
      const newW = Math.max(minW, Math.min(maxW, w / wheelZoomFactor(e)))
      const newH = h * (newW / w)
      setVb({ x: cx - fx * newW, y: cy - fy * newH, w: newW, h: newH })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [minW, maxW, setVb])
  useViewBoxPinch(svgRef, vbRef, setVb, minW, maxW)

  const drag = useRef<{ x: number; y: number; vb: VB } | null>(null)
  const [dragging, setDragging] = useState(false)
  const k = box.w / vb.w   // px per mm (the view has the window's shape)
  return (
    <svg ref={svgRef} width={box.w} height={box.h} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="block"
      style={{ cursor: dragging ? 'grabbing' : 'grab' }}
      onPointerDown={e => {
        if (e.pointerType === 'touch' || e.button !== 0) return   // touch = the pinch hook
        drag.current = { x: e.clientX, y: e.clientY, vb: vbRef.current }
        setDragging(true); e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={e => {
        const d = drag.current
        if (!d) return
        const kk = box.w / d.vb.w
        setVb({ ...d.vb, x: d.vb.x - (e.clientX - d.x) / kk, y: d.vb.y - (e.clientY - d.y) / kk })
      }}
      onPointerUp={() => { drag.current = null; setDragging(false) }}
      onPointerCancel={() => { drag.current = null; setDragging(false) }}
      onDoubleClick={() => setVb(fitted)}>
      {children(k)}
    </svg>
  )
}

/** Plan outline of a cabinet near the top (Top tab reference). */
export interface BtEditCab { id: string; label: string | null; pts: Pt[] }

export default function BenchtopEditModal({
  benchtop, drawn, cabs, walls, roomCx, roomH, info, profiles, planLayers, elevLayers, initialView, panel, onEdgesResolved, onClose,
}: {
  benchtop: BenchtopInstance
  /** The top as drawn: plus the sink / cooktop cut-outs its fixtures make (withFixtureCutouts). */
  drawn?: BenchtopInstance
  /** Cabinets in the room (plan outlines); the ones under / beside the top are drawn faint on Top. */
  cabs?: BtEditCab[]
  walls: Wall[]
  roomCx: Pt
  /** Room height — the elevation frame (y = roomH − height). */
  roomH: number
  info: BtElevInfo
  profiles: Record<string, BenchtopEdgeProfile>
  planLayers?: LayerView
  elevLayers?: LayerView
  initialView?: BtViewId
  /** The benchtop side bar; `onResolved` refreshes the Parts tab. */
  panel: (onResolved: () => void) => ReactNode
  /** Parts were resolved here (clears the canvas's "edges changed" nag). */
  onEdgesResolved: () => void
  onClose: () => void
}) {
  const phone = useIsPhone()
  const [panelHidden, setPanelHidden] = useState(phone)
  const [view, setView] = useState<BtViewId>(initialView ?? 'top')
  const [wire, setWire] = useState(false)
  // Side = a section across the top at this distance from its left end (null = halfway).
  const [cutAt, setCutAt] = useState<number | null>(null)
  // Bumped when either the panel or the Parts tab resolves, so both lists re-read.
  const [partsVer, setPartsVer] = useState(0)
  // Tutorial bt_edit_window.
  useEffect(() => { useTutorial.getState().emit('bt_edit_open') }, [])
  const pickView = (v: BtViewId) => { setView(v); useTutorial.getState().emit('bt_edit_tab') }

  // Esc closes. Canvas keys (Delete = delete the selected top, Enter, F-keys) are kept
  // from the plan underneath while the window is open; typing in a field is untouched.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (!['Escape', 'Delete', 'Backspace', 'Enter', 'F2', 'F3', 'F4', 'F7'].includes(e.key)) return
      e.stopPropagation()
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const shown = drawn ?? benchtop
  const segs = btSegments(benchtop)
  const bb = outlineBounds(segs)
  const frame = useMemo(() => viewFrame(benchtop, walls, roomCx), [benchtop, walls, roomCx])
  const size = useMemo(() => {
    const loc = outlinePoints(segs, 8).map(p => btLocal(frame, p))
    if (!loc.length) return { L: 0, D: 0, x0: 0 }
    return {
      x0: Math.min(...loc.map(p => p.x)),
      L: Math.round(Math.max(...loc.map(p => p.x)) - Math.min(...loc.map(p => p.x))),
      D: Math.round(Math.max(...loc.map(p => p.y)) - Math.min(...loc.map(p => p.y))),
    }
  }, [segs, frame])

  const drawingLayers = view === 'top' ? planLayers : elevLayers
  const isDrawing = view === 'top' || view === 'front' || view === 'side'
  const tabs: ShellTab<BtViewId>[] = VIEWS.map(v => ({ ...v, disabled: (v.id === '3d' || v.id === 'top' || v.id === 'side') && !bb }))
  // Cut position, mm from the top's left end (as seen from the room), kept inside the top.
  const cut = Math.max(1, Math.min(size.L - 1, cutAt ?? size.L / 2))
  const cutTools = (
    <div className="flex items-center gap-1.5 text-[11px] text-gray-400" title="Where the side section cuts across the top — mm from its left end. It shows as A–A on the Top tab.">
      <span>Cut A–A at</span>
      <input type="range" min={1} max={Math.max(2, size.L - 1)} step={1} value={cut}
        onChange={e => setCutAt(Number(e.target.value))} className="w-40 accent-amber-500" />
      <CalcInput value={Math.round(cut)} decimals={0} min={1} max={Math.max(2, size.L - 1)} onCommit={v => setCutAt(v)}
        className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-right text-gray-200 focus:outline-none focus:border-blue-500" />
      <span>from left</span>
      {cutAt != null && <button onClick={() => setCutAt(null)} className="px-1.5 py-0.5 rounded hover:bg-gray-700 text-gray-400" title="Back to halfway">↺</button>}
    </div>
  )

  return (
    <EditModalShell
      onClose={onClose}
      title={benchtop.label ?? 'Benchtop'}
      subtitle={`${size.L} × ${size.D} × ${info.thick.total}mm`}
      status={<span className="text-[10px] text-gray-500">top at {Math.round(info.topZ)}</span>}
      tabs={tabs}
      activeTab={view}
      onTab={pickView}
      toolbar={view === 'side' ? cutTools : view === '3d' ? (
        <button onClick={() => setWire(w => !w)} title="Toggle wire / solid view"
          className={`px-2.5 py-1 text-xs rounded transition-colors ${wire ? 'bg-sky-700/80 text-sky-200 hover:bg-sky-600/80' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'}`}>
          Wire
        </button>
      ) : undefined}
      contentClassName={view === 'parts' ? 'bg-gray-900' : 'bg-gray-950'}
      panel={<div className="h-full overflow-y-auto [&>.w-72]:min-h-full">{panel(() => setPartsVer(v => v + 1))}</div>}
      panelHidden={panelHidden}
      onTogglePanel={() => setPanelHidden(h => !h)}
    >
      {isDrawing && (
        <div className="w-full h-full canvas-keep-dark"
          style={{ background: drawingLayers?.background, filter: drawingLayers?.invert ? INVERT_FILTER : undefined }}>
          {view === 'top' && <TopDrawing benchtop={shown} handCuts={(benchtop.cutout_polygons ?? []).length} cabs={cabs ?? []} frame={frame} info={info} profiles={profiles} layers={planLayers} cut={size.x0 + cut} />}
          {view === 'side' && <SideDrawing benchtop={shown} frame={frame} at={size.x0 + cut} roomH={roomH} info={info} profiles={profiles} layers={elevLayers} />}
          {view === 'front' && <FrontDrawing benchtop={shown} walls={walls} roomCx={roomCx} roomH={roomH} info={info} profiles={profiles} layers={elevLayers} />}
        </div>
      )}
      {view === '3d' && <Top3D benchtop={shown} info={info} profiles={profiles} wire={wire} />}
      {view === 'parts' && (
        <PartsTab key={partsVer} benchtop={benchtop}
          onResolved={() => { onEdgesResolved(); setPartsVer(v => v + 1) }} />
      )}
    </EditModalShell>
  )
}

// ── Frame: back-left corner = 0,0, X along the anchor wall, Y off it (back at the top) ──
// Same frame as Edit shape's corner X / Y (useBenchtopInteraction.viewFrameFor).
function viewFrame(b: BenchtopInstance, walls: Wall[], roomCx: Pt): BtShapeEdit['frame'] {
  const segs = btSegments(b)
  const aw = b.wall_id ? walls.find(w => w.id === b.wall_id) : undefined
  let d = { x: 1, y: 0 }, n = { x: 0, y: 1 }, o0 = { x: 0, y: 0 }
  if (aw) {
    const f = wallFrame(aw, b.wall_side, roomCx)
    d = b.wall_side === 'back' ? { x: -f.d.x, y: -f.d.y } : f.d
    n = f.n; o0 = f.o
  }
  if (!segs.length) return { o: o0, d, n }
  const along = segs.map(s => (s.p0.x - o0.x) * d.x + (s.p0.y - o0.y) * d.y)
  const off = segs.map(s => (s.p0.x - o0.x) * n.x + (s.p0.y - o0.y) * n.y)
  const a0 = Math.min(...along), f0 = Math.min(...off)
  return { o: { x: o0.x + d.x * a0 + n.x * f0, y: o0.y + d.y * a0 + n.y * f0 }, d, n }
}

// ── Top: the top in its wall frame — edges by profile, joints, cut-outs, sizes ──
function TopDrawing({ benchtop, handCuts, cabs, frame, info, profiles, layers, cut }: {
  benchtop: BenchtopInstance
  /** The Side tab's section line (local x). */
  cut: number
  /** The first n cut-outs are hand-drawn; the rest come from fixtures (sink / cooktop). */
  handCuts: number
  cabs: BtEditCab[]
  frame: BtShapeEdit['frame']
  info: BtElevInfo
  profiles: Record<string, BenchtopEdgeProfile>
  layers?: LayerView
}) {
  const [boxRef, box] = useBoxSize()
  const segs = btSegments(benchtop)
  const local = segs.map(s => (s.type === 'line' ? [0, 1] : Array.from({ length: 25 }, (_, j) => j / 24)).map(t => btLocal(frame, segPoint(s, t))))
  const all = local.flat()
  if (!all.length) return <div ref={boxRef} className="w-full h-full" />
  const minX = Math.min(...all.map(p => p.x)), maxX = Math.max(...all.map(p => p.x))
  const minY = Math.min(...all.map(p => p.y)), maxY = Math.max(...all.map(p => p.y))
  const W = maxX - minX, H = maxY - minY
  // Fit with room round the top for edge labels + sizes.
  const pad = Math.max(W, H) * 0.12 + 120
  const fit = { x: minX - pad, y: minY - pad, w: W + 2 * pad, h: H + 2 * pad }
  const outline = outlinePoints(segs, 24).map(p => btLocal(frame, p))
  const fill = layers?.colorOf('benchtops') ?? info.color ?? '#134e4a'
  const stroke = layers?.color('benchtops', '#14b8a6') ?? '#14b8a6'
  const path = (pts: { x: number; y: number }[], close = false) =>
    pts.map((p, j) => `${j ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + (close ? ' Z' : '')
  const ln = (v: { x: number; y: number }) => ({ x: v.x * frame.d.x + v.y * frame.d.y, y: v.x * frame.n.x + v.y * frame.n.y })

  const cuts = (benchtop.cutout_polygons ?? []).map(c => c.map(p => btLocal(frame, p)))
  // Cabinets whose outline comes within 100 of the top: what it sits on, and its neighbours.
  const near = cabs.map(c => ({ ...c, loc: c.pts.map(p => btLocal(frame, p)) })).filter(c => c.loc.length > 2 &&
    Math.min(...c.loc.map(p => p.x)) < maxX + 100 && Math.max(...c.loc.map(p => p.x)) > minX - 100 &&
    Math.min(...c.loc.map(p => p.y)) < maxY + 100 && Math.max(...c.loc.map(p => p.y)) > minY - 100)

  return (
    <div ref={boxRef} className="w-full h-full relative">
      <PanZoomSvg fit={fit} box={box}>{k => {
        const px = (n: number) => n / k                  // n screen px in mm
        const fs = px(11)
        return <>
        {near.map(c => {
          const xs = c.loc.map(p => p.x), ys = c.loc.map(p => p.y)
          return (
            <g key={c.id} style={{ pointerEvents: 'none' }}>
              <path d={path(c.loc, true)} fill="none" stroke="#64748b" strokeWidth={px(1)} strokeDasharray={`${px(4)} ${px(3)}`} />
              {c.label && <text x={(Math.min(...xs) + Math.max(...xs)) / 2} y={(Math.min(...ys) + Math.max(...ys)) / 2} fontSize={px(10)}
                textAnchor="middle" dominantBaseline="middle" fill="#64748b" style={{ userSelect: 'none' }}>{c.label}</text>}
            </g>
          )
        })}
        <path d={path(outline, true) + ' ' + cuts.map(c => path(c, true)).join(' ')}
          fillRule="evenodd" fill={fill} fillOpacity={0.35} stroke={stroke} strokeWidth={px(1)} />
        {/* Cut-outs: size in the middle; a fixture's (sink / cooktop) follows the fixture */}
        {cuts.map((c, i) => {
          const xs = c.map(p => p.x), ys = c.map(p => p.y)
          const w = Math.max(...xs) - Math.min(...xs), d = Math.max(...ys) - Math.min(...ys)
          const mx = Math.min(...xs) + w / 2, my = Math.min(...ys) + d / 2
          return (
            <g key={`c${i}`} style={{ pointerEvents: 'none' }}>
              <path d={path(c, true)} fill="none" stroke="#f59e0b" strokeWidth={px(1.5)} />
              <text x={mx} y={my - px(6)} fontSize={fs} textAnchor="middle" fill="#f59e0b" style={{ userSelect: 'none' }}>{Math.round(w)} × {Math.round(d)}</text>
              <text x={mx} y={my + px(8)} fontSize={px(9)} textAnchor="middle" fill="#a16207" style={{ userSelect: 'none' }}>{i < handCuts ? 'cut-out' : 'fixture cut-out'}</text>
            </g>
          )
        })}
        {segs.map((s, i) => {
          const wall = !!s.edge?.wall
          const joint = s.edge?.joint
          const pid = wall || joint ? null : effectiveProfileId(s, info.defaultProfileId)
          const prof = pid ? profiles[pid] : undefined
          const col = joint ? '#ef4444' : wall ? '#6b7280' : prof ? edgeProfileColor(prof) : '#9ca3af'
          const mid = btLocal(frame, segPoint(s, 0.5))
          const nl = ln(outwardNormal(segs, i))
          const name = joint ? `joint ${joint === 'mitre' ? 'M' : 'B'}`
            : wall ? 'wall'
            : prof ? (prof.code ?? prof.name) + (prof.generates === 'waterfall' ? (waterfallJoin(s) === 'mitre' ? ' ▼ waterfall M' : ' ▼ waterfall B') : '')
            : 'no profile'
          const off = px(16)
          const tx = mid.x + nl.x * off, ty = mid.y + nl.y * off
          const ang = Math.atan2(s.p1.y - s.p0.y, s.p1.x - s.p0.x)
          const lv = ln({ x: Math.cos(ang), y: Math.sin(ang) })
          let deg = Math.atan2(lv.y, lv.x) * 180 / Math.PI
          if (deg > 90) deg -= 180; if (deg < -90) deg += 180
          return (
            <g key={i}>
              <path d={path(local[i])} fill="none" stroke={col} strokeWidth={px(wall || joint ? 2 : prof ? 5 : 2)}
                strokeDasharray={wall || joint ? `${px(6)} ${px(4)}` : undefined} strokeLinecap="round" />
              <text x={tx} y={ty} fontSize={fs} textAnchor="middle" dominantBaseline="middle" fill={col}
                transform={s.type === 'line' ? `rotate(${deg} ${tx} ${ty})` : undefined} style={{ userSelect: 'none' }}>
                {Math.round(segLength(s))} · {name}
              </text>
            </g>
          )
        })}
        {/* Overall sizes: length under the front, depth on the right */}
        <DimLine a={{ x: minX, y: maxY + px(46) }} b={{ x: maxX, y: maxY + px(46) }} label={`${Math.round(W)}`} fs={fs} px={px} />
        <DimLine a={{ x: maxX + px(60), y: minY }} b={{ x: maxX + px(60), y: maxY }} label={`${Math.round(H)}`} fs={fs} px={px} vertical />
        <text x={(minX + maxX) / 2} y={minY - px(40)} fontSize={fs} textAnchor="middle" fill="#6b7280" style={{ userSelect: 'none' }}>
          BACK{benchtop.wall_id ? ' (anchor wall)' : ''}
        </text>
        {/* Side section line A–A */}
        <g style={{ pointerEvents: 'none' }} stroke="#f59e0b" fill="#f59e0b">
          <line x1={cut} y1={minY - px(14)} x2={cut} y2={maxY + px(14)} strokeWidth={px(1)} strokeDasharray={`${px(10)} ${px(3)} ${px(2)} ${px(3)}`} />
          {[minY - px(22), maxY + px(32)].map((y, i) => (
            <text key={i} x={cut + px(6)} y={y} fontSize={px(11)} stroke="none" fontWeight={600} style={{ userSelect: 'none' }}>A</text>
          ))}
        </g>
        </>
      }}</PanZoomSvg>
      <p className="absolute bottom-2 left-3 px-1 rounded bg-gray-950/80 text-[10px] text-gray-500 pointer-events-none">Wheel = zoom · drag = pan · double-click = fit</p>
    </div>
  )
}

function DimLine({ a, b, label, fs, px, vertical }: {
  a: { x: number; y: number }; b: { x: number; y: number }; label: string; fs: number; px: (n: number) => number; vertical?: boolean
}) {
  const c = '#e5e7eb', t = px(5)
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
  return (
    <g stroke={c} strokeWidth={px(1)} fill={c}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      {vertical ? <>
        <line x1={a.x - t} y1={a.y} x2={a.x + t} y2={a.y} /><line x1={b.x - t} y1={b.y} x2={b.x + t} y2={b.y} />
      </> : <>
        <line x1={a.x} y1={a.y - t} x2={a.x} y2={a.y + t} /><line x1={b.x} y1={b.y - t} x2={b.x} y2={b.y + t} />
      </>}
      <text x={vertical ? mx + px(8) : mx} y={vertical ? my : my - px(6)} fontSize={fs} stroke="none"
        textAnchor={vertical ? 'start' : 'middle'} dominantBaseline={vertical ? 'middle' : 'auto'} style={{ userSelect: 'none' }}>{label}</text>
    </g>
  )
}

// ── Front: the anchor wall's elevation of just this top (BenchtopElevation) ──
function FrontDrawing({ benchtop, walls, roomCx, roomH, info, profiles, layers }: {
  benchtop: BenchtopInstance
  walls: Wall[]
  roomCx: Pt
  roomH: number
  info: BtElevInfo
  profiles: Record<string, BenchtopEdgeProfile>
  layers?: LayerView
}) {
  const [boxRef, box] = useBoxSize()
  const wall = benchtop.wall_id ? walls.find(w => w.id === benchtop.wall_id) : undefined
  const side = benchtop.wall_side ?? 'face'
  const band = wall && layers ? btElevBands([benchtop], walls, wall, side, roomCx, roomH, () => info)[0] : undefined
  if (!wall || !layers || !band) {
    return (
      <div ref={boxRef} className="w-full h-full flex items-center justify-center text-xs text-gray-500">
        {wall ? 'This top doesn’t show on its anchor wall’s elevation.' : 'Not anchored to a wall — pick one under Position in the panel to see its front.'}
      </div>
    )
  }
  const L = band.t1 - band.t0
  // Floor to a little over the top: waterfall legs, aprons and the height read in context.
  const y0 = band.yTop - Math.max(150, L * 0.08), y1 = roomH + 60
  const pad = Math.max(120, L * 0.08)
  const fit = { x: band.t0 - pad, y: y0, w: L + 2 * pad, h: y1 - y0 }
  const lv = alwaysShowBenchtop(layers)
  return (
    <div ref={boxRef} className="w-full h-full relative">
      <PanZoomSvg fit={fit} box={box}>{k => {
        const px = (n: number) => n / k
        const fs = px(11)
        return <>
        {/* floor */}
        <line x1={fit.x - L * 10} y1={roomH} x2={fit.x + fit.w + L * 10} y2={roomH} stroke="#4b5563" strokeWidth={px(1)} />
        <BenchtopElevation benchtops={[benchtop]} walls={walls} wall={wall} side={side} roomCx={roomCx} roomH={roomH}
          zoom={k} layers={lv} selectedId={null} info={() => info} profiles={profiles} onSelect={() => {}} interactive={false} />
        <DimLine a={{ x: band.t0, y: band.yTop - px(30) }} b={{ x: band.t1, y: band.yTop - px(30) }} label={`${Math.round(L)}`} fs={fs} px={px} />
        <DimLine a={{ x: band.t1 + px(40), y: band.yTop }} b={{ x: band.t1 + px(40), y: roomH }} label={`${Math.round(info.topZ)} to top`} fs={fs} px={px} vertical />
        <text x={band.t0} y={roomH + px(22)} fontSize={fs} fill="#6b7280" style={{ userSelect: 'none' }}>
          {wall.name} — {side === 'face' ? 'Face' : 'Back'} · {info.thick.total} thick
        </text>
        </>
      }}</PanZoomSvg>
      <p className="absolute bottom-2 left-3 px-1 rounded bg-gray-950/80 text-[10px] text-gray-500 pointer-events-none">Wheel = zoom into the edge · drag = pan · double-click = fit</p>
    </div>
  )
}

// ── Side: a section across the top at A–A (z_section_view slicing of the same solids
// as the 3D view): slab, build-up, aprons, set-back aprons, waterfall legs. Seen with
// the wall on the left and the front on the right.
function SideDrawing({ benchtop, frame, at, roomH, info, profiles, layers }: {
  benchtop: BenchtopInstance
  frame: BtShapeEdit['frame']
  /** Cut position, local x (along the anchor wall). */
  at: number
  roomH: number
  info: BtElevInfo
  profiles: Record<string, BenchtopEdgeProfile>
  layers?: LayerView
}) {
  const [boxRef, box] = useBoxSize()
  const solids = useMemo(() => benchtopSectionSolids(benchtop, info, profiles), [benchtop, info, profiles])
  const pl = { o: frame.o, d: frame.d, n: frame.n, at }
  const loops: P2[][] = solids.flatMap(sol => {
    const [lo, hi] = alongRange(sol.faces, frame.o, frame.d)
    return at < lo || at > hi ? [] : sliceFaces(sol.faces, pl)
  })
  if (!loops.length) {
    return <div ref={boxRef} className="w-full h-full flex items-center justify-center text-xs text-gray-500">The cut misses the top here — move it with the slider.</div>
  }
  const us = loops.flat().map(p => p.x), vs = loops.flat().map(p => p.y)
  const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs)
  const D = u1 - u0
  // y down in the SVG: y = roomH − height (as the elevation).
  const Y = (v: number) => roomH - v
  // Fit the section itself (the floor joins in when legs / aprons come near it).
  const pad = Math.max(150, D * 0.35)
  const yTop = Y(Math.max(v1, info.topZ)) - 140
  const yBot = v0 < 400 ? roomH + 80 : Y(v0) + 160
  const fit = { x: u0 - pad, y: yTop, w: D + 2 * pad, h: yBot - yTop }
  const fill = layers?.colorOf('benchtops') ?? info.color ?? '#14b8a6'
  const stroke = layers?.color('benchtops', '#14b8a6') ?? '#14b8a6'
  const d = loops.map(l => 'M' + l.map(p => `${p.x.toFixed(1)},${Y(p.y).toFixed(1)}`).join('L') + 'Z').join('')
  const T = Math.round(info.thick.total)
  const lowest = Math.round(v0)
  return (
    <div ref={boxRef} className="w-full h-full relative">
      <PanZoomSvg fit={fit} box={box}>{k => {
        const px = (n: number) => n / k
        const fs = px(11)
        return <>
          {/* floor */}
          <line x1={fit.x - D * 10} y1={roomH} x2={fit.x + fit.w + D * 10} y2={roomH} stroke="#4b5563" strokeWidth={px(1)} />
          <path d={d} fillRule="evenodd" fill={fill} fillOpacity={0.45} stroke={stroke} strokeWidth={px(1.5)} strokeLinejoin="round" />
          {/* depth at the cut */}
          <DimLine a={{ x: u0, y: Y(info.topZ) - px(30) }} b={{ x: u1, y: Y(info.topZ) - px(30) }} label={`${Math.round(D)}`} fs={fs} px={px} />
          {/* height to the top + thickness / drop at the front */}
          <text x={u1 + px(56)} y={Y(info.topZ)} fontSize={fs} fill="#e5e7eb" dominantBaseline="middle" style={{ userSelect: 'none' }}>
            top at {Math.round(info.topZ)} · underside {Math.round(info.topZ - T)}
          </text>
          <DimLine a={{ x: u1 + px(24), y: Y(info.topZ) }} b={{ x: u1 + px(24), y: Y(info.topZ - T) }} label={`${T}`} fs={fs} px={px} vertical />
          {Math.round(info.topZ) - lowest > T + 1 && lowest > 1 && (
            <text x={u0 - px(8)} y={Y(lowest)} fontSize={px(10)} textAnchor="end" dominantBaseline="middle" fill="#9ca3af" style={{ userSelect: 'none' }}>
              lowest {lowest} ({Math.round(info.topZ) - lowest} below the top)
            </text>
          )}
          <text x={(u0 + u1) / 2} y={Y(info.topZ) - px(58)} fontSize={fs} textAnchor="middle" fill="#6b7280" style={{ userSelect: 'none' }}>
            {benchtop.wall_id ? 'WALL ←' : 'BACK ←'} · section A–A · → FRONT
          </text>
        </>
      }}</PanZoomSvg>
      <p className="absolute bottom-2 left-3 px-1 rounded bg-gray-950/80 text-[10px] text-gray-500 pointer-events-none">Wheel = zoom · drag = pan · double-click = fit · move A–A with the slider above</p>
    </div>
  )
}

// ── 3D: just this top, orbit round it ──
function Top3D({ benchtop, info, profiles, wire }: {
  benchtop: BenchtopInstance
  info: BtElevInfo
  profiles: Record<string, BenchtopEdgeProfile>
  wire: boolean
}) {
  const segs = btSegments(benchtop)
  const bb = outlineBounds(segs)
  if (!bb) return null
  const cx = (bb.minX + bb.maxX) / 2, cz = (bb.minY + bb.maxY) / 2
  const span = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY, 600)
  const cy = info.topZ * 0.75
  return (
    <Canvas gl={{ antialias: true }} dpr={[1, 2]} style={{ background: '#1f2937' }}>
      <Suspense fallback={null}>
        <PerspectiveCamera makeDefault position={[cx + span * 0.6, info.topZ + span * 0.7, cz + span * 1.1]} fov={40} near={10} far={span * 20 + 20000} />
        <OrbitControls target={[cx, cy, cz]} makeDefault />
        <ambientLight intensity={1.8} />
        <directionalLight position={[cx + span, info.topZ * 2 + span, cz + span * 0.8]} intensity={1.6} />
        <directionalLight position={[cx - span * 0.4, info.topZ * 0.5, cz - span * 0.5]} intensity={0.6} color="#e8f0ff" />
        <BenchtopMesh bt={benchtop} info={info} profiles={profiles} selected={false}
          color={info.color ?? '#e7e5e4'} texture={info.texture} alpha={1} wire={wire} />
        {/* floor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]}>
          <planeGeometry args={[span * 3, span * 3]} />
          <meshStandardMaterial color="#374151" />
        </mesh>
      </Suspense>
    </Canvas>
  )
}

// ── Parts: the resolved cut list / supply items for this top ──
const ROLE_LABELS: Record<string, string> = {
  worktop_panel: 'Worktop', buildup_rail: 'Build-up rail', buildup_cross_member: 'Cross member',
  subtop: 'Subtop', drop_front_fascia: 'Drop front', side_fascia: 'Side fascia', back_fascia: 'Back fascia',
  stone_slab: 'Stone slab',
}

function PartsTab({ benchtop, onResolved }: { benchtop: BenchtopInstance; onResolved: () => void }) {
  const [parts, setParts] = useState<ResolvedBenchtopPart[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { void loadResolvedParts(benchtop.id).then(setParts) }, [benchtop.id])

  async function resolve() {
    if (btSegments(benchtop).length < 3) { setErr('Benchtop must have at least 3 corners before resolving.'); return }
    setBusy(true); setErr(null)
    try {
      const r = await resolveBenchtopFromDB(benchtop.id)
      if (r === null) setErr('Could not resolve — make sure a Build Method is assigned (at benchtop, room, or job level).')
      else { setParts(r); onResolved() }
    } finally { setBusy(false) }
  }

  const cut = (parts ?? []).filter(p => !p.supply_item)
  const supply = (parts ?? []).filter(p => p.supply_item)
  const th = 'px-2 py-1.5 text-left font-medium text-gray-400 border-b border-gray-700'
  const td = 'px-2 py-1 border-b border-gray-800 align-top'
  const table = (rows: ResolvedBenchtopPart[], title: string) => rows.length > 0 && (
    <div>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{title} ({rows.reduce((a, p) => a + p.quantity, 0)})</p>
      <table className="w-full text-[11px] text-gray-300">
        <thead><tr>
          <th className={th}>Pc</th><th className={th}>Part</th><th className={th}>Role</th>
          <th className={th + ' text-right'}>Length</th><th className={th + ' text-right'}>Width</th><th className={th + ' text-right'}>Thick</th>
          <th className={th + ' text-right'}>Qty</th><th className={th}>Material</th><th className={th}>Notes</th>
        </tr></thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={i} className="hover:bg-gray-800/60">
              <td className={td + ' text-gray-500'}>{p.piece ?? ''}</td>
              <td className={td}>{p.label}</td>
              <td className={td + ' text-gray-500'}>{ROLE_LABELS[p.part_role] ?? p.part_role}</td>
              <td className={td + ' text-right tabular-nums'}>{p.length_mm}</td>
              <td className={td + ' text-right tabular-nums'}>{p.width_mm}</td>
              <td className={td + ' text-right tabular-nums'}>{p.thickness_mm}</td>
              <td className={td + ' text-right tabular-nums'}>{p.quantity}</td>
              <td className={td + ' text-gray-400'}>{p.material_name ?? p.benchtop_material_name ?? '—'}</td>
              <td className={td + ' text-gray-500'}>
                {[
                  p.outline ? 'shaped' : null,
                  p.edgebands && Object.keys(p.edgebands.sides).length ? `taped ${Object.keys(p.edgebands.sides).length} sides` : null,
                  p.meta?.area_m2 != null ? `${p.meta.area_m2} m²` : null,
                  ...Object.entries(p.meta?.profiles ?? {}).map(([code, mm]) => `${code} ${(mm / 1000).toFixed(2)} lm`),
                  p.meta?.cutouts?.length ? `${p.meta.cutouts.length} cut-out${p.meta.cutouts.length > 1 ? 's' : ''}` : null,
                  p.holes?.length ? `${p.holes.length} hole${p.holes.length > 1 ? 's' : ''}` : null,
                  p.meta?.joins?.length ? `${p.meta.joins.map(j => j.type).join(', ')} join` : null,
                  p.meta?.waterfalls ? `${p.meta.waterfalls} waterfall` : null,
                ].filter(Boolean).join(' · ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => void resolve()} disabled={busy}
          className="px-3 py-1.5 rounded text-xs font-medium bg-teal-700 hover:bg-teal-600 text-white disabled:opacity-50">
          {busy ? 'Resolving…' : 'Resolve Parts'}
        </button>
        {parts && <span className="text-[11px] text-gray-500">{parts.length} part rows</span>}
        {err && <span className="text-[11px] text-red-400">{err}</span>}
      </div>
      {parts === null ? <p className="text-xs text-gray-500">Loading…</p>
        : parts.length === 0 ? <p className="text-xs text-gray-500">Not resolved yet — Resolve Parts to build the cut list.</p>
        : <>
            {table(cut, 'Cut list (made in-house)')}
            {table(supply, 'Supply items (ordered — not cut)')}
          </>}
    </div>
  )
}
