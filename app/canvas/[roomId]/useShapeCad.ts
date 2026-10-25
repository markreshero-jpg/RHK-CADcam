'use client'

// CAD tools on a cabinet's footprint (z_cabinet_shape_edit E4b). A second
// useAnnotationTool, active in Edit shape, working on ONE annotation: the
// footprint as a closed line in plan mm. Its store reads every change back into
// the footprint (footprintCad.lineToFootprint — edge ids kept, formulas, new box)
// and applies it through the Edit shape hook (write-through, one undo step):
//   update  a grip / side drag, fillet, chamfer, join on the outline
//   insert  a closed outline drawn in edit mode (Box, a closed line, an offset
//           copy) replaces the shape
//   remove  refused — a cabinet needs an outline
// A refused change (open, self-crossing, < 10 mm edge, no panel edge) puts the
// line back and shows why. Tools: Select, Line, Box, Offset, Fillet, Chamfer, Join.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CabinetInstance, Room, RoomAnnotation, Wall } from '@/src/lib/types'
import { cabWallPerp, wallInwardNormal, type Pt } from '@/src/lib/geometry'
import { IDENTITY_FRAME, rectPts, type BoxGeom, type LineGeom } from '@/src/lib/annotations/geometry'
import { PLAN_OWNER, ownerColumns } from '@/src/lib/annotations/owner'
import type { SnapGeometry } from '@/src/lib/annotations/cadSnap'
import { footprintLine, lineToFootprint, planMap } from '@/src/lib/cabinetShape/footprintCad'
import { useAnnotationTool, type AnnotStore, type CadTool } from './useAnnotationTool'
import type { useCabinetShapeEdit } from './useCabinetShapeEdit'

export const SHAPE_OUTLINE_ID = 'shape-edit-outline'
export const SHAPE_TOOLS: ReadonlySet<CadTool> = new Set<CadTool>(['select', 'line', 'rect', 'offset', 'fillet', 'chamfer', 'join'])
// A thin white line over the coloured edges: it moves live while a grip is dragged.
const OUTLINE_STYLE = { color: '#ffffff', weight: 0.18 }

type ShapeEditApi = ReturnType<typeof useCabinetShapeEdit>

export function useShapeCad({ shp, cabinets, walls, roomRef, room, paper, zoom, active, toWorld, snap, onExit }: {
  shp: ShapeEditApi
  cabinets: CabinetInstance[]
  walls: Wall[]
  roomRef: Pt
  room: Room
  paper: number
  zoom: number
  active: boolean
  toWorld: (e: { clientX: number; clientY: number }) => Pt
  snap: (p: Pt, prev: Pt | null, exclude: ReadonlySet<string>, own?: SnapGeometry) => { pt: Pt; kind: string | null }
  onExit: () => void
}) {
  const edit = shp.edit
  const cab = edit ? cabinets.find(c => c.id === edit.cabId) : undefined
  const wall = cab ? walls.find(w => w.id === cab.wall_id) : undefined

  // Cabinet frame ↔ plan, and the footprint as the CAD line.
  const geo = useMemo(() => {
    if (!edit || !cab || !wall) return null
    const m = planMap(cab, wall, cabWallPerp(cab, wall, wallInwardNormal(wall, roomRef)))
    const dims = { w: cab.dx, d: cab.dz }
    return { m, dims, line: footprintLine(edit.fp, dims, m) }
  }, [edit, cab, wall, roomRef])

  const outline = useCallback((): RoomAnnotation[] => {
    if (!geo) return []
    const now = new Date().toISOString()
    return [{
      id: SHAPE_OUTLINE_ID, room_id: room.id, ...ownerColumns(PLAN_OWNER),
      kind: 'line', geom: geo.line.geom, text: null, style: OUTLINE_STYLE, sort_order: 0, created_at: now, updated_at: now,
    } as RoomAnnotation]
  }, [geo, room.id])

  const [annotations, setAnnotations] = useState<RoomAnnotation[]>([])
  useEffect(() => { setAnnotations(outline()) }, [outline])
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { if (!edit) setMsg(null) }, [edit])

  const geoRef = useRef(geo)
  useEffect(() => { geoRef.current = geo }, [geo])
  const editRef = useRef(edit)
  useEffect(() => { editRef.current = edit }, [edit])
  const cabRef = useRef(cab)
  useEffect(() => { cabRef.current = cab }, [cab])

  /** Read a line back into the footprint; refused → the outline goes back as it was. */
  const take = useCallback((geom: LineGeom, replacing: boolean) => {
    const g = geoRef.current, e = editRef.current, c = cabRef.current
    if (!g || !e || !c) return
    const r = lineToFootprint(e.fp, g.dims, g.line, geom, g.m, replacing)
    if (r.error || !r.fp) {
      setMsg(r.error ?? 'That change can\'t be made.')
      setAnnotations(outline())
      return
    }
    const extra: Partial<CabinetInstance> = {}
    if (Math.abs((r.dx ?? c.dx) - c.dx) > 0.05) extra.dx = r.dx
    if (Math.abs((r.dz ?? c.dz) - c.dz) > 0.05) extra.dz = r.dz
    if (r.shift && (Math.abs(r.shift.x) > 0.05 || Math.abs(r.shift.y) > 0.05 || extra.dx != null)) {
      const pos = g.m.posFor(r.shift.x, r.shift.y, r.dx ?? c.dx)
      if (Math.abs(pos.x - c.pos_x) > 0.05 || Math.abs(pos.y - c.pos_y) > 0.05) { extra.pos_x = pos.x; extra.pos_y = pos.y }
    }
    setMsg(r.dropped?.length ? `Corner choices on removed edges were dropped (${r.dropped.length}).` : null)
    shp.apply(r.fp, extra)
  }, [outline, shp])

  const store = useMemo<AnnotStore>(() => ({
    update(id, patch) {
      if (id !== SHAPE_OUTLINE_ID || !patch.geom) return
      take(patch.geom as LineGeom, false)
    },
    insert(rows) {
      // The last closed shape drawn replaces the outline.
      const r = [...rows].reverse().find(a => (a.kind === 'line' && (a.geom as LineGeom).closed) || a.kind === 'rect')
      if (!r) {
        setMsg('Draw a closed outline (Box, or a line back to its start) to replace the shape.')
        setAnnotations(outline())
        return
      }
      if (r.kind === 'rect') {
        const b = r.geom as BoxGeom
        const c = { x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2 }, t = ((b.rot ?? 0) * Math.PI) / 180
        const pts = rectPts(b.a, b.b).map(p => ({
          x: c.x + (p.x - c.x) * Math.cos(t) - (p.y - c.y) * Math.sin(t),
          y: c.y + (p.x - c.x) * Math.sin(t) + (p.y - c.y) * Math.cos(t),
        }))
        take({ pts, closed: true }, true)
      } else take(r.geom as LineGeom, true)
    },
    remove(ids) {
      if (!ids.includes(SHAPE_OUTLINE_ID)) return
      setMsg('A cabinet needs an outline — draw a new one with Box to replace it.')
      setAnnotations(outline())
    },
  }), [take, outline])

  const noop = useCallback(() => {}, [])
  const cad = useAnnotationTool({
    room, annotations, setAnnotations, captureSnapshot: noop, owner: PLAN_OWNER, frame: IDENTITY_FRAME,
    paper, zoom, active: active && !!geo, toWorld, snap, enterCad: noop, exitCad: onExit, store, tools: SHAPE_TOOLS,
  })

  return { cad, annotations, msg, clearMsg: () => setMsg(null) }
}

export type ShapeCad = ReturnType<typeof useShapeCad>
