'use client'
// Return cabinet sections (z_section_view R1/R1a): the cabinets on an elevation's
// return walls, side-on, as a plain outline of each part — everything between
// this wall's face and a cut at the depth of its own cabinets
// (src/lib/returnSection). No hardware. Drawn in the elevation's coordinates
// (x along the wall, y = roomH − height) on screen and in the print / shop
// drawings, gated by the `return_sections` layer item and then each part's own item.

import { useEffect, useMemo, useState } from 'react'
import type { Wall, CabinetInstance, Room, BenchtopInstance, BenchtopEdgeProfile } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import type { LayerView } from '@/src/lib/displayLayers/resolve'
import { centroid } from '@/src/lib/geometry'
import { elevationFrame } from '@/src/lib/fixtureGeometry'
import { cabinetSectionSolids, benchtopSectionSolids, type SectionSolid } from '@/src/lib/crossSectionRoom'
import type { BtSolidInfo } from '@/src/lib/benchtopSolids'
import { returnWallsOf, returnCutDepth, returnCutPlane, returnProjectionLoops, elevLoopsPath } from '@/src/lib/returnSection'
import { sectionPaint } from '@/src/lib/sectionPaint'
import { getPalette, paletteToPartColors } from '@/src/lib/partPalette'
import { PRINT_INK } from '@/src/lib/shopDrawings/pens'
import { dbLoadRoomPartDetails, type PartPosOverrides, type ShapeOverrides } from './canvasDB'

/** Part position overrides + drawn shapes for the return cabinets. */
export type ReturnSectionData = { posById: Map<string, PartPosOverrides>; shapesById: Map<string, ShapeOverrides> } | null

/** The cabinets sitting on a return wall of `wall`. */
export function returnCabinets(wall: Wall | null, walls: Wall[], cabinets: CabinetInstance[]): CabinetInstance[] {
  if (!wall) return []
  const { left, right } = returnWallsOf(wall, walls)
  const ids = new Set([left?.id, right?.id].filter(Boolean))
  return cabinets.filter(c => c.wall_id != null && ids.has(c.wall_id))
}

/** Return-wall cabinets of any of these walls (reports: one load for every page). */
export function returnCabinetsOfWalls(ws: Wall[], walls: Wall[], cabinets: CabinetInstance[]): CabinetInstance[] {
  const seen = new Set<string>()
  return ws.flatMap(w => returnCabinets(w, walls, cabinets)).filter(c => !seen.has(c.id) && !!seen.add(c.id))
}

/** Loads the part overrides for the given cabinets (as the 3D view does). */
export function useReturnSectionData(cabinets: CabinetInstance[], resolvedParts: Map<string, ResolvedCabinet> | undefined, enabled: boolean): ReturnSectionData {
  const idsKey = enabled ? cabinets.map(c => c.id).join(',') : ''
  const [details, setDetails] = useState<ReturnSectionData>(null)
  useEffect(() => {
    if (!idsKey) return
    let cancelled = false
    dbLoadRoomPartDetails(idsKey.split(',')).then(d => { if (!cancelled) setDetails(d) })
    return () => { cancelled = true }
  }, [idsKey, resolvedParts])
  return idsKey ? details : null
}

export default function ReturnSectionSVG({ wall, side, walls, cabinets, room, roomH, resolvedParts, layers,
  benchtops, btInfo, profiles, data, lw, print }: {
  wall: Wall
  side: 'face' | 'back'
  walls: Wall[]
  /** Every cabinet in the room (this wall's set the cut depth; the returns' are drawn). */
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
  /** Print: black ink, colours ignored. */
  print?: boolean
}) {
  const rc = useMemo(() => centroid(walls), [walls])
  const PART_COLORS = useMemo(() => paletteToPartColors(getPalette()), [])
  const depth = returnCutDepth(wall, side, cabinets)
  const plane = useMemo(() => returnCutPlane(elevationFrame(wall, side, rc), depth), [wall, side, rc, depth])

  const { left, right } = returnWallsOf(wall, walls)
  const retKey = [left?.id, right?.id].filter(Boolean).join(',')

  const solids = useMemo(() => {
    const retIds = new Set(retKey.split(','))
    const out: SectionSolid[] = []
    if (!resolvedParts) return out
    for (const cab of cabinets) {
      if (!cab.wall_id || !retIds.has(cab.wall_id)) continue
      const w = walls.find(x => x.id === cab.wall_id)
      const rp = resolvedParts.get(cab.id)
      if (!w || !rp) continue
      out.push(...cabinetSectionSolids(cab, w, rc, room, rp, data?.posById.get(cab.id), data?.shapesById.get(cab.id)))
    }
    if (btInfo && profiles) for (const bt of benchtops ?? []) {
      if (bt.wall_id && retIds.has(bt.wall_id)) out.push(...benchtopSectionSolids(bt, btInfo(bt), profiles))
    }
    return out
    // btInfo is rebuilt per render; benchtops / profiles carry its inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cabinets, walls, rc, room, resolvedParts, data, benchtops, profiles, retKey])

  const drawn = useMemo(() => returnProjectionLoops(solids.filter(s => layers.show(s.item)), plane, wall.length),
    [solids, plane, wall.length, layers])

  if (!drawn.length) return null
  const grp = layers.props('return_sections', 1)

  return (
    <g data-role="return-sections" data-cut-at={depth} pointerEvents="none" opacity={grp.opacity} fill="none" strokeLinejoin="round">
      {drawn.map(({ s, loops }) => {
        const p = sectionPaint(layers, PART_COLORS, s, false, lw)
        return <path key={s.id} d={elevLoopsPath(loops, roomH)} data-item={s.item}
          stroke={print ? PRINT_INK : p.stroke} strokeWidth={p.strokeWidth} opacity={p.opacity}
          strokeDasharray={p.strokeDasharray ? `${6 * lw} ${3 * lw}` : undefined} />
      })}
    </g>
  )
}
