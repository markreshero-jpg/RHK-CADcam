'use client'
// Cross section view (z_section_view): a live side-on cut through the elevation
// wall at the cut line, filling the main canvas (the elevation moves to the
// right-hand column, where the line is dragged). Slices the 3D model; only the
// cut faces are drawn (fixtures + hardware via CrossSectionMeshes), plus the wall (hatched, openings left out) and floor /
// ceiling lines. Colours, styles and visibility follow the elevation layer set,
// painted like the elevation draws each part.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Wall, CabinetInstance, Room, BenchtopInstance, BenchtopEdgeProfile, RoomFixture } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import type { LayerView } from '@/src/lib/displayLayers/resolve'
import { LAYER_ITEM_BY_ID } from '@/src/lib/displayLayers/registry'
import { centroid } from '@/src/lib/geometry'
import { elevationFrame, openingOnWall } from '@/src/lib/fixtureGeometry'
import { sliceFaces, alongRange, loopsPath, sliceTriangles, chainPaths, chainPathD, trisAlongRange, type CutPlane } from '@/src/lib/crossSection'
import { cabinetSectionSolids, benchtopSectionSolids, type SectionSolid } from '@/src/lib/crossSectionRoom'
import { sectionPaint, sectionMeshPaint } from '@/src/lib/sectionPaint'
import type { BtSolidInfo } from '@/src/lib/benchtopSolids'
import { getPalette, paletteToPartColors } from '@/src/lib/partPalette'
import CrossSectionMeshes, { type SectionMesh } from './CrossSectionMeshes'
import { dbLoadRoomPartDetails, type PartPosOverrides, type ShapeOverrides } from './canvasDB'
import { roundMm } from '@/src/lib/format'
import { FillPatternDef, fillPaint } from './FillPattern'

export default function CrossSectionView({ walls, cabinets, room, wall, side, cutX, look, onCutX, onFlip, onClose,
  resolvedParts, layers, benchtops, btInfo, profiles, fixtures, selectedCabId, onSelectCabinet }: {
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
  /** Filtered for the elevation (part hide ticks). */
  resolvedParts: Map<string, ResolvedCabinet>
  /** The elevation layer view. */
  layers: LayerView
  benchtops: BenchtopInstance[]
  btInfo: (bt: BenchtopInstance) => BtSolidInfo
  profiles: Record<string, BenchtopEdgeProfile>
  fixtures: RoomFixture[]
  selectedCabId: string | null
  onSelectCabinet: (id: string) => void
}) {
  const rc = useMemo(() => centroid(walls), [walls])
  const roomH = room.room_dy ?? 2400
  const frame = useMemo(() => elevationFrame(wall, side, rc), [wall, side, rc])
  const PART_COLORS = useMemo(() => paletteToPartColors(getPalette()), [])

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

  // Fit window: wall thickness → the deepest thing on this wall, fixed per wall so
  // the drawing doesn't jump while the line slides.
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
    return { u0: u0 - 150, u1: u1 + 250, v0: -120, v1: roomH + 120 }
  }, [solids, wall, frame, roomH])

  // Fixtures + hardware (X4): model meshes read back from a hidden 3D scene.
  const [meshes, setMeshes] = useState<SectionMesh[]>([])
  const meshRanges = useMemo(() => meshes.map(m => { const [lo, hi] = trisAlongRange(m.tris, frame.o, frame.d); return { m, lo, hi } }), [meshes, frame])

  const plane: CutPlane = { ...frame, at: cutX }
  const flip = look === -1
  const cut = solids.flatMap(s => {
    if (cutX < s.lo || cutX > s.hi || !layers.show(s.item)) return []
    const loops = sliceFaces(s.faces, plane)
    return loops.length ? [{ s, d: loopsPath(loops, flip) }] : []
  })
  const meshCut = meshRanges.flatMap(({ m, lo, hi }) => {
    if (cutX < lo || cutX > hi || !layers.show(m.item)) return []
    const paths = chainPaths(sliceTriangles(m.tris, plane))
    return paths.length ? [{ m, fill: chainPathD(paths, true, flip), line: chainPathD(paths, false, flip) }] : []
  })

  // Paint a cut part / mesh the way the elevation draws it (src/lib/sectionPaint).
  const ld = layers.lineDrawing
  const paint = (s: SectionSolid) => sectionPaint(layers, PART_COLORS, s, !!s.cabId && s.cabId === selectedCabId)
  const meshPaint = (m: SectionMesh) => sectionMeshPaint(layers, PART_COLORS, m, !!m.cabId && m.cabId === selectedCabId)
  const fixtureName = new Map(fixtures.map(f => [f.id, f.name ?? '']))

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
  const wallInk = layers.color('walls', '#9ca3af')
  const wallPat = layers.pattern('wall_fill', 'hatch')

  // Fit box (mm, y down) and the canvas size → a viewBox with the canvas's aspect,
  // so the whole canvas is drawing (no letterbox) and the floor runs edge to edge.
  const fbX = flip ? -win.u1 : win.u0, fbW = win.u1 - win.u0
  const fbY = -win.v1, fbH = win.v1 - win.v0
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  useEffect(() => {
    const el = svgRef.current; if (!el) return
    const ro = new ResizeObserver(([e]) => { const r = e.contentRect; if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height }) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const fitS = Math.max(fbW / size.w, fbH / size.h)   // mm per px at zoom 1
  const cabLabel = new Map(cabinets.map(c => [c.id, c.label ?? '']))

  // Zoom / pan (scroll = zoom about the cursor, drag = pan, double-click = fit).
  // Kept per wall + side + look direction; anything else re-fits.
  const viewKey = `${wall.id}:${side}:${look}`
  const [zoom, setZoom] = useState<{ key: string; s: number; cx: number; cy: number } | null>(null)
  const z = zoom?.key === viewKey ? zoom : { key: viewKey, s: 1, cx: fbX + fbW / 2, cy: fbY + fbH / 2 }
  const vw = size.w * fitS / z.s, vh = size.h * fitS / z.s
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
        const cur = prev?.key === viewKey ? prev : { key: viewKey, s: 1, cx: fbX + fbW / 2, cy: fbY + fbH / 2 }
        const s2 = Math.max(0.5, Math.min(60, cur.s * f)), k = cur.s / s2
        // Keep the point under the cursor still.
        return { key: viewKey, s: s2, cx: p.x + (cur.cx - p.x) * k, cy: p.y + (cur.cy - p.y) * k }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [viewKey, fbX, fbY, fbW, fbH])
  // Drag = pan; a press that doesn't move is a click (selects the cabinet under it).
  const panRef = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null)
  const [panning, setPanning] = useState(false)
  const x0 = z.cx - vw / 2, x1 = z.cx + vw / 2

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: layers.background ?? '#030712' }}>
      <div className="flex-none flex items-center gap-2 px-3 py-1.5 bg-gray-900 border-b border-gray-800 overflow-x-auto">
        <span className="text-[11px] font-medium text-violet-300 whitespace-nowrap">Cross section</span>
        <span className="text-[10px] text-gray-500 whitespace-nowrap">{wall.name}{side === 'back' ? ' (back)' : ''}</span>
        <div className="mx-1 h-4 border-l border-gray-700" />
        <span className="text-[10px] text-gray-500">At</span>
        <input type="number" step={1} min={0} max={roundMm(wall.length)}
          value={roundMm(cutX)}
          onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) onCutX(Math.max(0, Math.min(wall.length, v))) }}
          className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-[10px] text-violet-300 font-mono text-right focus:outline-none focus:border-violet-500" />
        <span className="text-[10px] text-gray-500 whitespace-nowrap">mm from the left end · drag the line on the elevation (right)</span>
        <button type="button" onClick={onFlip}
          title={flip ? 'Looking toward the left end — click to look toward the right end' : 'Looking toward the right end — click to look toward the left end'}
          className="ml-1 px-2.5 py-0.5 text-[10px] rounded text-gray-300 bg-gray-800 hover:bg-gray-700 whitespace-nowrap">
          Flip {flip ? '←' : '→'}
        </button>
        <span className="flex-1" />
        <span className="text-[10px] text-gray-600 whitespace-nowrap select-none">Scroll to zoom · drag to pan · double-click to fit</span>
        <button type="button" onClick={onClose} title="Close the cross section (back to the elevation)"
          className="px-2.5 py-0.5 text-[10px] rounded text-gray-300 bg-gray-800 hover:bg-gray-700 whitespace-nowrap">
          Close
        </button>
      </div>
      <svg ref={svgRef} viewBox={`${x0} ${z.cy - vh / 2} ${vw} ${vh}`} preserveAspectRatio="xMidYMid meet"
        className="flex-1 min-h-0 w-full select-none" style={{ cursor: panning ? 'grabbing' : 'grab', touchAction: 'none' }}
        onPointerDown={e => {
          if (e.button !== 0) return
          const p = toSvg(e.clientX, e.clientY); if (!p) return
          panRef.current = { x: p.x, y: p.y, px: e.clientX, py: e.clientY, moved: false }; setPanning(true)
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={e => {
          const pr = panRef.current; if (!pr) return
          if (!pr.moved && Math.hypot(e.clientX - pr.px, e.clientY - pr.py) < 4) return
          pr.moved = true
          const p = toSvg(e.clientX, e.clientY); if (!p) return
          setZoom({ ...z, cx: z.cx - (p.x - pr.x), cy: z.cy - (p.y - pr.y) })
        }}
        onPointerUp={e => {
          const pr = panRef.current
          panRef.current = null; setPanning(false)
          if (pr && !pr.moved) {
            // Pointer capture retargets the event to the svg — find the shape under it.
            const hit = document.elementsFromPoint(e.clientX, e.clientY).find(el => el instanceof SVGElement && el.dataset.cab)
            const id = (hit as SVGElement | undefined)?.dataset.cab
            if (id) onSelectCabinet(id)
          }
        }}
        onDoubleClick={() => setZoom(null)}>
        <defs>
          <FillPatternDef id="xsec-hatch" pattern={wallPat} step={28} color={layers.color('wall_fill', wallInk)} width={layers.w('wall_fill', 3)} />
        </defs>
        {/* Floor + ceiling */}
        <line x1={x0} y1={0} x2={x1} y2={0} stroke="#6b7280" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <line x1={x0} y1={-roomH} x2={x1} y2={-roomH} stroke="#4b5563" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        {wallRects.map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h}
            fill={layers.show('wall_fill') ? fillPaint(wallPat, 'xsec-hatch', layers.color('wall_fill', wallInk)) : 'none'}
            fillOpacity={0.7 * layers.op('wall_fill')}
            stroke={layers.show('walls') ? wallInk : 'none'} strokeWidth={layers.w('walls', 1)}
            strokeOpacity={layers.op('walls')} vectorEffect="non-scaling-stroke" />
        ))}
        {cut.map(({ s, d }) => (
          <path key={s.id} d={d} data-item={s.item} data-cab={s.cabId} fillRule="evenodd" {...paint(s)}
            strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ cursor: s.cabId ? 'pointer' : undefined }}>
            <title>{[s.cabId ? cabLabel.get(s.cabId) : 'Benchtop', LAYER_ITEM_BY_ID[s.item]?.label].filter(Boolean).join(' · ')}</title>
          </path>
        ))}
        {meshCut.map(({ m, fill, line }) => {
          const p = meshPaint(m)
          const title = m.fixtureId ? fixtureName.get(m.fixtureId) || LAYER_ITEM_BY_ID[m.item]?.label
            : [m.cabId ? cabLabel.get(m.cabId) : '', LAYER_ITEM_BY_ID[m.item]?.label].filter(Boolean).join(' · ')
          return (
            <g key={m.id} data-item={m.item} opacity={p.opacity}>
              {fill && <path d={fill} data-cab={m.cabId} fillRule='evenodd' fill={ld ? 'none' : p.color} fillOpacity={p.fillOpacity}
                stroke={p.stroke} strokeWidth={p.strokeWidth} strokeDasharray={p.strokeDasharray} strokeLinejoin='round' vectorEffect='non-scaling-stroke'
                style={{ cursor: m.cabId ? 'pointer' : undefined }}><title>{title}</title></path>}
              {line && <path d={line} data-cab={m.cabId} fill='none' stroke={p.stroke} strokeWidth={p.strokeWidth} strokeDasharray={p.strokeDasharray}
                strokeLinejoin='round' vectorEffect='non-scaling-stroke'><title>{title}</title></path>}
            </g>
          )
        })}
      </svg>
      <CrossSectionMeshes walls={walls} cabinets={cabinets} room={room} rc={rc} resolvedParts={resolvedParts} details={details}
        layers={layers} fixtures={fixtures} onMeshes={setMeshes} />
    </div>
  )
}
