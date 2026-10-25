'use client'

// Plan overlay for Edit shape (z_cabinet_shape_edit E3): dims the room, draws
// the cabinet's footprint bold with every edge in its type's colour + a label,
// and a dot on each corner that has a join choice (filled = hand-set). Edges and
// corners are the click targets; the side panel edits what is picked. Drawn in
// room mm like the other plan layers. A transient tool overlay, not a layer item
// (spec "Plan edit mode").

import { useMemo } from 'react'
import type { CabinetInstance, Wall } from '@/src/lib/types'
import { cabinetToPlan, cabWallPerp, wallInwardNormal, type Pt } from '@/src/lib/geometry'
import {
  EDGE_ROLES, EDGE_SUBS, edgeSub, footprintEdgesPlan, withEdgeOverrides,
  type EdgeRole, type FootprintEdge,
} from '@/src/lib/cabinetShape/footprint'
import { footprintJunctions } from '@/src/lib/cabinetShape/junctions'
import type { CabinetShapeEdit, ShapeEditSel } from './useCabinetShapeEdit'

export const ROLE_COLOUR: Record<EdgeRole, string> = {
  back: '#94a3b8', side: '#f59e0b', front: '#3b82f6', open: '#22c55e',
}

/** Short label for an edge on the plan: its sub-type when not the default, else its type. */
export function edgePlanLabel(e: FootprintEdge): string {
  const sub = edgeSub(e)
  const subs = EDGE_SUBS[e.role]
  const role = EDGE_ROLES.find(r => r.value === e.role)?.label ?? e.role
  if (!sub || sub === subs[0]?.value) return role.replace(' (face)', '')
  const l = subs.find(o => o.value === sub)?.label ?? sub
  return sub === 'scribe' && e.scribe != null ? `${l} ${e.scribe}` : l
}

const same = (a: ShapeEditSel, b: ShapeEditSel) =>
  !!a && !!b && a.kind === b.kind && (a.kind === 'edge' ? a.id === (b as { id: string }).id : a.key === (b as { key: string }).key)

export default function CabinetShapeEditPlan({ edit, cab, wall, roomRef, zoom, onPick, onHover }: {
  edit: CabinetShapeEdit
  cab: CabinetInstance
  wall: Wall
  roomRef: Pt
  zoom: number
  onPick: (s: ShapeEditSel) => void
  onHover: (s: ShapeEditSel) => void
}) {
  const geo = useMemo(() => {
    const perp = cabWallPerp(cab, wall, wallInwardNormal(wall, roomRef))
    const toPlan = cabinetToPlan(cab, wall, perp)
    const dims = { w: cab.dx, d: cab.dz }
    const edges = footprintEdgesPlan(withEdgeOverrides(edit.fp), dims, toPlan)
    const all = edges.flatMap(e => e.pts)
    const c = all.reduce((a, p) => ({ x: a.x + p.x / all.length, y: a.y + p.y / all.length }), { x: 0, y: 0 })
    const corners = footprintJunctions(edit.fp, dims.w, dims.d).map(j => ({ j, p: toPlan(j.at.x, j.at.y) }))
    // The outline as one ring (each edge's points, its end = the next start).
    const ring = edges.flatMap(e => e.pts.slice(0, -1))
    return { edges, corners, c, ring }
  }, [edit.fp, cab, wall, roomRef])

  const px = (n: number) => n / zoom
  const down = (s: ShapeEditSel) => (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation(); e.preventDefault()
    onPick(s)
  }

  return (
    <g data-shape-edit>
      {/* Dim everything else (still visible); the edited cabinet is cut out of it. */}
      <path fillRule="evenodd" fill="#030712" fillOpacity={0.55} style={{ pointerEvents: 'none' }}
        d={`M-1e6,-1e6H1e6V1e6H-1e6Z${geo.ring.length > 2 ? 'M' + geo.ring.map(p => `${p.x},${p.y}`).join('L') + 'Z' : ''}`} />

      {geo.edges.map(({ edge, pts }) => {
        const s: ShapeEditSel = { kind: 'edge', id: edge.id }
        const on = same(edit.sel, s), hov = same(edit.hover, s)
        const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')
        // Label at the edge's middle, pushed out away from the cabinet's centre.
        const m = pts[Math.floor((pts.length - 1) / 2)], m2 = pts[Math.ceil((pts.length - 1) / 2)]
        const mid = pts.length === 2 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : { x: (m.x + m2.x) / 2, y: (m.y + m2.y) / 2 }
        const ox = mid.x - geo.c.x, oy = mid.y - geo.c.y, ol = Math.hypot(ox, oy) || 1
        const lp = { x: mid.x + (ox / ol) * px(16), y: mid.y + (oy / ol) * px(16) }
        const col = ROLE_COLOUR[edge.role]
        return (
          <g key={edge.id} data-edge={edge.id} style={{ cursor: 'pointer' }}
            onPointerDown={down(s)} onPointerEnter={() => onHover(s)} onPointerLeave={() => onHover(null)}>
            {(on || hov) && <path d={d} fill="none" stroke="#ffffff" strokeOpacity={on ? 0.55 : 0.25} strokeWidth={px(12)} strokeLinecap="round" />}
            <path d={d} fill="none" stroke={col} strokeWidth={px(on ? 5 : 3.5)} strokeLinecap="round" />
            <path d={d} fill="none" stroke="transparent" strokeWidth={px(16)} />
            <text x={lp.x} y={lp.y} fontSize={px(11)} textAnchor="middle" dominantBaseline="middle"
              fill={on ? '#ffffff' : col} stroke="#030712" strokeWidth={px(3)} paintOrder="stroke"
              style={{ pointerEvents: 'none', userSelect: 'none', fontWeight: on ? 600 : 400 }}>
              {edgePlanLabel(edge)}
            </text>
          </g>
        )
      })}

      {geo.corners.map(({ j, p }) => {
        const s: ShapeEditSel = { kind: 'corner', key: j.key }
        const on = same(edit.sel, s), hov = same(edit.hover, s)
        return (
          <g key={j.key} data-corner={j.key} style={{ cursor: 'pointer' }}
            onPointerDown={down(s)} onPointerEnter={() => onHover(s)} onPointerLeave={() => onHover(null)}>
            <circle cx={p.x} cy={p.y} r={px(11)} fill="transparent" />
            <circle cx={p.x} cy={p.y} r={px(on ? 7 : hov ? 6.5 : 5)}
              fill={j.choice ? '#e5e7eb' : '#030712'} stroke={on ? '#ffffff' : '#e5e7eb'} strokeWidth={px(on ? 2.5 : 1.5)} />
          </g>
        )
      })}
    </g>
  )
}
