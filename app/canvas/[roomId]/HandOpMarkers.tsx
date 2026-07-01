'use client'

// ── Hand-added part_operations, rendered in the cabinet-wide views ──────────────
// Loads hand ops for a cabinet (generated rows are excluded at query time — the
// resolver already draws those) and projects them to cabinet space via
// partOpProject.handOpMarkers. Two renderers share that result: HandOpMarkers3D
// (R3F, inside CabinetScene's centred group) and HandOpMarkersSVG (Top/Elevation/
// Side + room elevation, via each view's project()).

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { handOpMarkers, type CabinetOpMarker, type HandOpRow, type Pt } from '@/src/lib/optimiser/partOpProject'

const COLS = 'id,source_part_key,operation_type,pos_x,pos_y,diameter,width,length,size_dx,size_dy,repeat_count,repeat_spacing,repeat_axis,parameters'
const HAND_COLOR = '#f97316'   // orange — distinct from the resolver's drilling markers

// Load hand ops for one cabinet → cabinet-space markers. Empty until rp is ready.
export function useHandOpMarkers(cabinetId: string | null | undefined, rp: ResolvedCabinet | null | undefined): CabinetOpMarker[] {
  const [rows, setRows] = useState<HandOpRow[]>([])
  useEffect(() => {
    if (!cabinetId) return
    let cancelled = false
    supabase.from('part_operations').select(COLS)
      .eq('source_cabinet_id', cabinetId)
      .is('parameters->>generated', null)          // hand-added only
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { console.error('[HandOpMarkers] load', error); return }
        setRows((data ?? []) as HandOpRow[])
      })
    return () => { cancelled = true }
  }, [cabinetId])
  return useMemo(() => (rp && cabinetId ? handOpMarkers(rp, rows) : []), [rp, rows, cabinetId])
}

// Multi-cabinet variant for the room elevation: one query for all cabinets on the
// wall, grouped → per-cabinet markers keyed by cabinet id.
type RowWithCab = HandOpRow & { source_cabinet_id: string }
export function useHandOpMarkersMulti(
  cabinetIds: string[],
  resolvedParts: Map<string, ResolvedCabinet> | undefined,
): Map<string, CabinetOpMarker[]> {
  const key = [...cabinetIds].sort().join(',')
  const [rows, setRows] = useState<RowWithCab[]>([])
  useEffect(() => {
    if (!key) { return }
    let cancelled = false
    supabase.from('part_operations').select(`${COLS},source_cabinet_id`)
      .in('source_cabinet_id', key.split(','))
      .is('parameters->>generated', null)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { console.error('[HandOpMarkers] load multi', error); return }
        setRows((data ?? []) as RowWithCab[])
      })
    return () => { cancelled = true }
  }, [key])
  return useMemo(() => {
    const out = new Map<string, CabinetOpMarker[]>()
    if (!resolvedParts) return out
    const byCab = new Map<string, RowWithCab[]>()
    for (const r of rows) {
      const arr = byCab.get(r.source_cabinet_id) ?? []
      arr.push(r); byCab.set(r.source_cabinet_id, arr)
    }
    for (const [cid, cabRows] of byCab) {
      const rp = resolvedParts.get(cid)
      if (rp) out.set(cid, handOpMarkers(rp, cabRows))
    }
    return out
  }, [rows, resolvedParts])
}

// Axis-aligned box (mm) enclosing the marker points, flattened to a thin plate on
// the panel face. Groove cross-axis (zero extent) is widened to the tool width.
function aabb(pts: Pt[], normal: 'x' | 'y' | 'z', radius: number) {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y), zs = pts.map(p => p.z)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2
  const cross = Math.max(2 * radius, 2)
  let sx = Math.max(...xs) - Math.min(...xs)
  let sy = Math.max(...ys) - Math.min(...ys)
  let sz = Math.max(...zs) - Math.min(...zs)
  if (normal !== 'x' && sx < 0.01) sx = cross
  if (normal !== 'y' && sy < 0.01) sy = cross
  if (normal !== 'z' && sz < 0.01) sz = cross
  if (normal === 'x') sx = 2; else if (normal === 'y') sy = 2; else sz = 2
  return { pos: [cx, cy, cz] as [number, number, number], size: [sx, sy, sz] as [number, number, number] }
}

export function HandOpMarkers3D({ markers, color = HAND_COLOR }: { markers: CabinetOpMarker[]; color?: string }) {
  return (
    <group>
      {markers.map(m => {
        if (m.kind === 'drill') {
          const rot: [number, number, number] = m.normal === 'x' ? [0, 0, Math.PI / 2] : m.normal === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0]
          return m.holes.map((h, i) => (
            <mesh key={`${m.id}-${i}`} position={[h.x, h.y, h.z]} rotation={rot}>
              <cylinderGeometry args={[m.radius, m.radius, 4, 20]} />
              <meshStandardMaterial color={color} />
            </mesh>
          ))
        }
        const pts = m.kind === 'groove' ? m.ends : m.corners
        const radius = m.kind === 'groove' ? m.radius : 0
        const box = aabb(pts, m.normal, radius)
        return (
          <mesh key={m.id} position={box.pos}>
            <boxGeometry args={box.size} />
            <meshStandardMaterial color={color} transparent opacity={0.55} />
          </mesh>
        )
      })}
    </group>
  )
}

export function HandOpMarkersSVG({ markers, project, color = HAND_COLOR }: {
  markers: CabinetOpMarker[]
  project: (x: number, y: number, z: number) => { x: number; y: number }
  color?: string
}) {
  return (
    <g style={{ pointerEvents: 'none' }}>
      {markers.map(m => {
        if (m.kind === 'drill') {
          return m.holes.map((h, i) => {
            const p = project(h.x, h.y, h.z)
            return <circle key={`${m.id}-${i}`} cx={p.x} cy={p.y} r={m.radius}
              fill="none" stroke={color} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
          })
        }
        if (m.kind === 'groove') {
          const a = project(m.ends[0].x, m.ends[0].y, m.ends[0].z)
          const b = project(m.ends[1].x, m.ends[1].y, m.ends[1].z)
          return <line key={m.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={color} strokeWidth={Math.max(1, m.radius * 2)} strokeOpacity={0.75} strokeLinecap="round" />
        }
        const pts = m.corners.map(c => project(c.x, c.y, c.z))
        return <polygon key={m.id} points={pts.map(p => `${p.x},${p.y}`).join(' ')}
          fill="none" stroke={color} strokeWidth={0.7} vectorEffect="non-scaling-stroke" />
      })}
    </g>
  )
}
