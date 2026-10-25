'use client'
// Cross section pane (z_section_view): a live side-on cut through the elevation
// wall at the cut line, in the right-hand column. Slices the 3D model (3D layer
// view, 3D hidden-part filter): only the cut faces are drawn, plus the wall
// (hatched, openings left out) and floor / ceiling lines.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Wall, CabinetInstance, Room, BenchtopInstance, BenchtopEdgeProfile, RoomFixture } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import type { LayerView } from '@/src/lib/displayLayers/resolve'
import { LAYER_ITEM_BY_ID } from '@/src/lib/displayLayers/registry'
import { centroid } from '@/src/lib/geometry'
import { elevationFrame, openingOnWall } from '@/src/lib/fixtureGeometry'
import { sliceFaces, alongRange, loopsPath, type CutPlane } from '@/src/lib/crossSection'
import { cabinetSectionSolids, benchtopSectionSolids, type SectionRole, type SectionSolid } from '@/src/lib/crossSectionRoom'
import type { BtSolidInfo } from '@/src/lib/benchtopSolids'
import { dbLoadRoomPartDetails, type PartPosOverrides, type ShapeOverrides } from './canvasDB'
import { roundMm } from '@/src/lib/format'

const FILL: Record<SectionRole, string> = {
  case: '#d6c7a1', kick: '#8a7a5c', spreader: '#8a7a5c', face: '#eadfc4', int: '#c9b98f',
  db: '#9fb3c8', custom: '#d6c7a1', bench: '#a8a29e',
}

export default function CrossSectionPane({ walls, cabinets, room, wall, side, cutX, look, onCutX, onFlip, onClose,
  resolvedParts, layers, benchtops, btInfo, profiles, fixtures }: {
  walls: Wall[]
  cabinets: CabinetInstance[]
  room: Room
  wall: Wall
  side: 'face' | 'back'
  /** Cut position: mm from the elevation's left end. */
  cutX: number
  /** 1 = looking toward the elevation's right end (wall on the left); −1 = back the other way. */
  look: 1 | -1
  onCutX: (x: number) => void
  onFlip: () => void
  onClose: () => void
  /** Filtered for the 3D view (the section is a slice of the 3D model). */
  resolvedParts: Map<string, ResolvedCabinet>
  layers: LayerView
  benchtops: BenchtopInstance[]
  btInfo: (bt: BenchtopInstance) => BtSolidInfo
  profiles: Record<string, BenchtopEdgeProfile>
  fixtures: RoomFixture[]
}) {
  const rc = useMemo(() => centroid(walls), [walls])
  const roomH = room.room_dy ?? 2400
  const frame = useMemo(() => elevationFrame(wall, side, rc), [wall, side, rc])

  // Part overrides + drawn shapes, as the 3D view loads them.
  const cabIdsKey = cabinets.map(c => c.id).join(',')
  const [details, setDetails] = useState<{ posById: Map<string, PartPosOverrides>; shapesById: Map<string, ShapeOverrides> } | null>(null)
  useEffect(() => {
    let cancelled = false
    dbLoadRoomPartDetails(cabIdsKey ? cabIdsKey.split(',') : []).then(d => { if (!cancelled) setDetails(d) })
    return () => { cancelled = true }
  }, [cabIdsKey, resolvedParts])

  // Every solid in the room, with its extent along the cut direction.
  const solids = useMemo(() => {
    const out: (SectionSolid & { wallId: string | null; lo: number; hi: number })[] = []
    const add = (s: SectionSolid, wallId: string | null) => {
      const [lo, hi] = alongRange(s.faces, frame.o, frame.d)
      out.push({ ...s, wallId, lo, hi })
    }
    for (const cab of cabinets) {
      const w = walls.find(x => x.id === cab.wall_id)
      const rp = resolvedParts.get(cab.id)
      if (!w || !rp) continue
      for (const s of cabinetSectionSolids(cab, w, rc, room, rp, details?.posById.get(cab.id), details?.shapesById.get(cab.id))) add(s, w.id)
    }
    for (const bt of benchtops) for (const s of benchtopSectionSolids(bt, btInfo(bt), profiles)) add(s, bt.wall_id ?? null)
    return out
    // btInfo is rebuilt per render; benchtops / profiles carry its inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cabinets, walls, rc, room, resolvedParts, details, benchtops, profiles, frame])

  // Window: wall thickness → the deepest thing on this wall, fixed per wall so the
  // drawing doesn't jump while the line slides.
  const win = useMemo(() => {
    const thk = wall.wall_type === 'island' ? 0 : (wall.thickness ?? 0)
    let u0 = -thk, u1 = 600
    for (const s of solids) {
      if (s.wallId !== wall.id) continue
      for (const f of s.faces) for (const l of f) for (const v of l) {
        const u = (v[0] - frame.o.x) * frame.n.x + (v[2] - frame.o.y) * frame.n.y
        if (u < u0) u0 = u
        if (u > u1) u1 = u
      }
    }
    return { u0: u0 - 80, u1: u1 + 120, v0: -60, v1: roomH + 60 }
  }, [solids, wall, frame, roomH])

  const plane: CutPlane = { ...frame, at: cutX }
  const flip = look === -1
  const cut = solids.flatMap(s => {
    if (cutX < s.lo || cutX > s.hi || !layers.show(s.item)) return []
    const loops = sliceFaces(s.faces, plane)
    return loops.length ? [{ s, d: loopsPath(loops, flip) }] : []
  })

  // The wall itself, less any door / window it's cut through.
  const wallRects = (() => {
    const thk = wall.wall_type === 'island' ? 0 : (wall.thickness ?? 0)
    if (thk <= 0 || !layers.show('walls')) return []
    const wallH = wall.height ?? roomH
    const gaps = layers.show('fixture_openings') ? fixtures.flatMap(f => {
      const o = openingOnWall(f, wall, side, rc)
      if (!o || cutX < o.t0 || cutX > o.t1) return []
      const z0 = Number(f.z) || 0
      return [[z0, z0 + Number(f.height)] as [number, number]]
    }).sort((a, b) => a[0] - b[0]) : []
    const spans: [number, number][] = []
    let z = 0
    for (const [g0, g1] of gaps) { if (g0 > z) spans.push([z, Math.min(g0, wallH)]); z = Math.max(z, g1) }
    if (z < wallH) spans.push([z, wallH])
    return spans.filter(([a, b]) => b - a > 0.5).map(([a, b]) => ({ x: flip ? 0 : -thk, y: -b, w: thk, h: b - a }))
  })()

  const vbX = flip ? -win.u1 : win.u0
  const vbW = win.u1 - win.u0
  const vbY = -win.v1
  const vbH = win.v1 - win.v0
  const cabLabel = new Map(cabinets.map(c => [c.id, c.label ?? '']))

  // Zoom / pan inside the pane (scroll = zoom about the cursor, drag = pan,
  // double-click = fit). Kept per wall + look direction; anything else re-fits.
  const svgRef = useRef<SVGSVGElement>(null)
  const viewKey = `${wall.id}:${side}:${look}`
  const [zoom, setZoom] = useState<{ key: string; s: number; cx: number; cy: number } | null>(null)
  const z = zoom?.key === viewKey ? zoom : { key: viewKey, s: 1, cx: vbX + vbW / 2, cy: vbY + vbH / 2 }
  const vw = vbW / z.s, vh = vbH / z.s
  const toSvg = (cx: number, cy: number) => {
    const m = svgRef.current?.getScreenCTM()
    return m ? new DOMPoint(cx, cy).matrixTransform(m.inverse()) : null
  }
  useEffect(() => {
    const el = svgRef.current; if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = toSvg(e.clientX, e.clientY); if (!p) return
      const f = Math.exp(-e.deltaY * 0.0015)
      setZoom(prev => {
        const cur = prev?.key === viewKey ? prev : { key: viewKey, s: 1, cx: vbX + vbW / 2, cy: vbY + vbH / 2 }
        const s2 = Math.max(1, Math.min(40, cur.s * f)), k = cur.s / s2
        // Keep the point under the cursor still.
        return { key: viewKey, s: s2, cx: p.x + (cur.cx - p.x) * k, cy: p.y + (cur.cy - p.y) * k }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [viewKey, vbX, vbY, vbW, vbH])
  const panRef = useRef<{ x: number; y: number } | null>(null)
  const [panning, setPanning] = useState(false)

  return (
    <div className="w-72 flex-none bg-gray-900 border-l border-gray-800 flex flex-col">
      <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-2">
        <p className="text-xs font-medium text-gray-300 flex-1">Cross section</p>
        <button type="button" onClick={onFlip}
          title={flip ? 'Looking toward the left end — click to look toward the right end' : 'Looking toward the right end — click to look toward the left end'}
          className="px-2 py-0.5 text-[10px] rounded text-gray-300 bg-gray-800 hover:bg-gray-700">
          Flip {flip ? '←' : '→'}
        </button>
        <button type="button" onClick={onClose} title="Close the cross section" aria-label="Close"
          className="text-gray-500 hover:text-gray-200 text-sm leading-none px-1">×</button>
      </div>
      <div className="px-3 py-1.5 flex items-center gap-2 border-b border-gray-800">
        <span className="text-[10px] text-gray-500">At</span>
        <input type="number" step={1} min={0} max={roundMm(wall.length)}
          value={roundMm(cutX)}
          onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) onCutX(Math.max(0, Math.min(wall.length, v))) }}
          className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-[10px] text-violet-300 font-mono text-right focus:outline-none focus:border-violet-500" />
        <span className="text-[10px] text-gray-500">mm from the left end · drag the line</span>
      </div>
      <svg ref={svgRef} viewBox={`${z.cx - vw / 2} ${z.cy - vh / 2} ${vw} ${vh}`} preserveAspectRatio="xMidYMid meet"
        className="w-full bg-gray-950 select-none" style={{ height: 380, background: layers.background, cursor: panning ? 'grabbing' : 'grab', touchAction: 'none' }}
        onPointerDown={e => {
          if (e.button !== 0) return
          const p = toSvg(e.clientX, e.clientY); if (!p) return
          panRef.current = { x: p.x, y: p.y }; setPanning(true)
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={e => {
          if (!panRef.current) return
          const p = toSvg(e.clientX, e.clientY); if (!p) return
          setZoom({ ...z, cx: z.cx - (p.x - panRef.current.x), cy: z.cy - (p.y - panRef.current.y) })
        }}
        onPointerUp={() => { panRef.current = null; setPanning(false) }}
        onDoubleClick={() => setZoom(null)}>
        <defs>
          <pattern id="xsec-hatch" patternUnits="userSpaceOnUse" width="40" height="40">
            <line x1="0" y1="40" x2="40" y2="0" stroke="#6b7280" strokeWidth="3" />
          </pattern>
          <clipPath id="xsec-win"><rect x={vbX} y={vbY} width={vbW} height={vbH} /></clipPath>
        </defs>
        <g clipPath="url(#xsec-win)">
        {/* Floor + ceiling */}
        <line x1={vbX} y1={0} x2={vbX + vbW} y2={0} stroke="#6b7280" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <line x1={vbX} y1={-roomH} x2={vbX + vbW} y2={-roomH} stroke="#4b5563" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        {wallRects.map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill="url(#xsec-hatch)" stroke="#9ca3af" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {cut.map(({ s, d }) => (
          <path key={s.id} d={d} data-item={s.item} fillRule="evenodd" fill={layers.color(s.item, FILL[s.role])} fillOpacity={layers.op(s.item)}
            stroke="#f9fafb" strokeWidth={0.75} strokeLinejoin="round" vectorEffect="non-scaling-stroke">
            <title>{[s.cabId ? cabLabel.get(s.cabId) : 'Benchtop', LAYER_ITEM_BY_ID[s.item]?.label].filter(Boolean).join(' · ')}</title>
          </path>
        ))}
        </g>
      </svg>
      <p className="px-3 py-1 text-[10px] text-gray-600 select-none">Scroll to zoom · drag to pan · double-click to fit</p>
    </div>
  )
}
