'use client'
// Return cabinet sections (z_section_view R1): the cabinets on an elevation's
// return walls, cut through side-on at the depth of this wall's own cabinets
// (src/lib/returnSection). Drawn in the elevation's coordinates (x along the
// wall, y = roomH − height) on screen and in the print / shop drawings, gated by
// the `return_sections` layer item and then each part's own item.
//
// Hardware (handles, hinges, runners, bins) comes from the cross section's
// hidden 3D scene (CrossSectionMeshes). One scene per view / report — reports
// draw many walls at once, and each scene holds a WebGL context — so the owner
// calls useReturnSectionData once, renders its `host`, and passes `data` down.

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Wall, CabinetInstance, Room, BenchtopInstance, BenchtopEdgeProfile } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import type { LayerView } from '@/src/lib/displayLayers/resolve'
import { centroid } from '@/src/lib/geometry'
import { elevationFrame } from '@/src/lib/fixtureGeometry'
import { sliceTriangles, chainPaths } from '@/src/lib/crossSection'
import { cabinetSectionSolids, benchtopSectionSolids, type SectionSolid } from '@/src/lib/crossSectionRoom'
import type { BtSolidInfo } from '@/src/lib/benchtopSolids'
import { returnWallsOf, returnCutDepth, returnCutPlane, returnSectionLoops, elevLoopsPath, elevChainPath } from '@/src/lib/returnSection'
import { sectionPaint, sectionMeshPaint } from '@/src/lib/sectionPaint'
import { getPalette, paletteToPartColors } from '@/src/lib/partPalette'
import { PRINT_INK } from '@/src/lib/shopDrawings/pens'
import CrossSectionMeshes, { type SectionMesh } from './CrossSectionMeshes'
import { dbLoadRoomPartDetails, type PartPosOverrides, type ShapeOverrides } from './canvasDB'

export interface ReturnSectionData {
  details: { posById: Map<string, PartPosOverrides>; shapesById: Map<string, ShapeOverrides> } | null
  meshes: SectionMesh[]
}

/** The cabinets sitting on a return wall of `wall` (screen: only these are sliced). */
export function returnCabinets(wall: Wall | null, walls: Wall[], cabinets: CabinetInstance[]): CabinetInstance[] {
  if (!wall) return []
  const { left, right } = returnWallsOf(wall, walls)
  const ids = new Set([left?.id, right?.id].filter(Boolean))
  return cabinets.filter(c => c.wall_id != null && ids.has(c.wall_id))
}

/** Return-wall cabinets of any of these walls (reports: one scene for every page). */
export function returnCabinetsOfWalls(ws: Wall[], walls: Wall[], cabinets: CabinetInstance[]): CabinetInstance[] {
  const seen = new Set<string>()
  return ws.flatMap(w => returnCabinets(w, walls, cabinets)).filter(c => !seen.has(c.id) && !!seen.add(c.id))
}

/** Part overrides + hardware meshes for the given cabinets. Render `host`
 *  somewhere in the DOM (it's a 2 px off-screen canvas). */
export function useReturnSectionData({ walls, cabinets, room, resolvedParts, layers, enabled }: {
  walls: Wall[]
  /** The cabinets that may be cut (keep it to return-wall cabinets). */
  cabinets: CabinetInstance[]
  room: Room
  resolvedParts: Map<string, ResolvedCabinet> | undefined
  layers: LayerView
  enabled: boolean
}): { data: ReturnSectionData; host: ReactNode } {
  const idsKey = enabled ? cabinets.map(c => c.id).join(',') : ''
  const [details, setDetails] = useState<ReturnSectionData['details']>(null)
  useEffect(() => {
    if (!idsKey) return
    let cancelled = false
    dbLoadRoomPartDetails(idsKey.split(',')).then(d => { if (!cancelled) setDetails(d) })
    return () => { cancelled = true }
  }, [idsKey, resolvedParts])
  const [meshes, setMeshes] = useState<SectionMesh[]>([])
  const rc = useMemo(() => centroid(walls), [walls])
  const host = idsKey && resolvedParts ? (
    <CrossSectionMeshes walls={walls} cabinets={cabinets} room={room} rc={rc} resolvedParts={resolvedParts}
      details={details} layers={layers} fixtures={[]} onMeshes={setMeshes} />
  ) : null
  return { data: { details: idsKey ? details : null, meshes: idsKey ? meshes : [] }, host }
}

export default function ReturnSectionSVG({ wall, side, walls, cabinets, room, roomH, resolvedParts, layers,
  benchtops, btInfo, profiles, data, lw, print }: {
  wall: Wall
  side: 'face' | 'back'
  walls: Wall[]
  /** Every cabinet in the room (this wall's set the cut depth; the returns' are cut). */
  cabinets: CabinetInstance[]
  room: Room
  roomH: number
  /** Raw resolved parts (3D model), elevation part-hide filtered. */
  resolvedParts: Map<string, ResolvedCabinet> | undefined
  layers: LayerView
  benchtops?: BenchtopInstance[]
  btInfo?: (bt: BenchtopInstance) => BtSolidInfo
  profiles?: Record<string, BenchtopEdgeProfile>
  data: ReturnSectionData
  /** Base stroke width in drawing units. */
  lw: number
  /** Print: black ink on white, colours ignored. */
  print?: boolean
}) {
  const rc = useMemo(() => centroid(walls), [walls])
  const PART_COLORS = useMemo(() => paletteToPartColors(getPalette()), [])
  const depth = returnCutDepth(wall, side, cabinets)
  const plane = useMemo(() => returnCutPlane(elevationFrame(wall, side, rc), depth), [wall, side, rc, depth])

  const { left, right } = returnWallsOf(wall, walls)
  const retIds = new Set([left?.id, right?.id].filter(Boolean) as string[])
  const retKey = [...retIds].join(',')

  const solids = useMemo(() => {
    const out: SectionSolid[] = []
    if (!resolvedParts) return out
    for (const cab of cabinets) {
      if (!cab.wall_id || !retIds.has(cab.wall_id)) continue
      const w = walls.find(x => x.id === cab.wall_id)
      const rp = resolvedParts.get(cab.id)
      if (!w || !rp) continue
      out.push(...cabinetSectionSolids(cab, w, rc, room, rp, data.details?.posById.get(cab.id), data.details?.shapesById.get(cab.id)))
    }
    if (btInfo && profiles) for (const bt of benchtops ?? []) {
      if (bt.wall_id && retIds.has(bt.wall_id)) out.push(...benchtopSectionSolids(bt, btInfo(bt), profiles))
    }
    return out
    // retKey stands for retIds; btInfo is rebuilt per render (benchtops / profiles carry its inputs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cabinets, walls, rc, room, resolvedParts, data.details, benchtops, profiles, retKey])

  const cut = useMemo(() => returnSectionLoops(solids.filter(s => layers.show(s.item)), plane, wall.length),
    [solids, plane, wall.length, layers])
  const meshCut = useMemo(() => data.meshes.flatMap(m => {
    if (!m.cabId || !layers.show(m.item)) return []
    const cab = cabinets.find(c => c.id === m.cabId)
    if (!cab?.wall_id || !retIds.has(cab.wall_id)) return []
    const paths = chainPaths(sliceTriangles(m.tris, plane))
      .filter(p => p.pts.some(q => q.x > 0.5 && q.x < wall.length - 0.5))
    return paths.length ? [{ m, fill: elevChainPath(paths, true, roomH), line: elevChainPath(paths, false, roomH) }] : []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data.meshes, plane, layers, cabinets, retKey, wall.length, roomH])

  if (!cut.length && !meshCut.length) return null
  const dash = (on: boolean) => on ? `${6 * lw} ${3 * lw}` : undefined
  const grp = layers.props('return_sections', 1)

  return (
    <g data-role="return-sections" data-cut-at={depth} data-meshes={data.meshes.length} pointerEvents="none" opacity={grp.opacity}>
      {cut.map(({ s, loops }) => {
        const d = elevLoopsPath(loops, roomH)
        if (print) {
          const p = layers.props(s.item, 1)
          return <path key={s.id} d={d} data-item={s.item} fillRule="evenodd" fill="white" stroke={PRINT_INK}
            strokeWidth={layers.w(s.item, lw)} strokeDasharray={dash(!!p.strokeDasharray)} opacity={p.opacity} strokeLinejoin="round" />
        }
        const p = sectionPaint(layers, PART_COLORS, s, false, lw)
        return <path key={s.id} d={d} data-item={s.item} fillRule="evenodd" {...p} strokeDasharray={dash(!!p.strokeDasharray)} strokeLinejoin="round" />
      })}
      {meshCut.map(({ m, fill, line }) => {
        const p = sectionMeshPaint(layers, PART_COLORS, m, false, lw)
        const ink = print ? PRINT_INK : p.stroke
        return (
          <g key={m.id} data-item={m.item} opacity={p.opacity}>
            {fill && <path d={fill} fillRule="evenodd" fill={print ? 'white' : layers.lineDrawing ? 'none' : p.color}
              fillOpacity={print ? 1 : p.fillOpacity} stroke={ink} strokeWidth={p.strokeWidth}
              strokeDasharray={dash(!!p.strokeDasharray)} strokeLinejoin="round" />}
            {line && <path d={line} fill="none" stroke={ink} strokeWidth={p.strokeWidth}
              strokeDasharray={dash(!!p.strokeDasharray)} strokeLinejoin="round" />}
          </g>
        )
      })}
    </g>
  )
}
