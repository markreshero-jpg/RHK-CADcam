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

const COLS = 'id,source_part_key,operation_type,pos_x,pos_y,diameter,width,length,size_dx,size_dy,size_dz,depth,pos_z,plane_kind,repeat_count,repeat_spacing,repeat_axis,parameters'
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

// Axis-aligned box (mm) enclosing the face points, extruded `depth` along the panel
// normal (in `dir`) so the marker shows the op's real depth into the material. Groove
// cross-axis (zero extent) is widened to the tool width.
function aabb(pts: Pt[], normal: 'x' | 'y' | 'z', radius: number, depth: number, dir: 1 | -1) {
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
  // Extrude the through-normal axis to the op depth, centred half a depth inward.
  const pos: [number, number, number] = [cx, cy, cz]
  if (normal === 'x')      { sx = depth; pos[0] = cx + dir * depth / 2 }
  else if (normal === 'y') { sy = depth; pos[1] = cy + dir * depth / 2 }
  else                     { sz = depth; pos[2] = cz + dir * depth / 2 }
  return { pos, size: [sx, sy, sz] as [number, number, number] }
}

export function HandOpMarkers3D({ markers, color = HAND_COLOR, csgPartKeys }: { markers: CabinetOpMarker[]; color?: string; csgPartKeys?: Set<string> }) {
  return (
    <group>
      {markers.map(m => {
        // Area ops on CSG'd parts are drawn as real recesses in the part mesh — skip
        // the overlay marker so they aren't double-drawn.
        if (m.kind === 'area' && csgPartKeys?.has(m.partKey)) return null
        if (m.kind === 'drill') {
          const rot: [number, number, number] = m.normal === 'x' ? [0, 0, Math.PI / 2] : m.normal === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0]
          const off = (h: Pt): [number, number, number] => m.normal === 'x'
            ? [h.x + m.dir * m.depth / 2, h.y, h.z]
            : m.normal === 'y' ? [h.x, h.y + m.dir * m.depth / 2, h.z]
            : [h.x, h.y, h.z + m.dir * m.depth / 2]
          return m.holes.map((h, i) => (
            <mesh key={`${m.id}-${i}`} position={off(h)} rotation={rot}>
              <cylinderGeometry args={[m.radius, m.radius, m.depth, 20]} />
              <meshStandardMaterial color={color} />
            </mesh>
          ))
        }
        const pts = m.kind === 'groove' ? m.ends : m.corners
        const radius = m.kind === 'groove' ? m.radius : 0
        const box = aabb(pts, m.normal, radius, m.depth, m.dir)
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

// Shift a face point inward along the panel normal by the op depth — the "floor" of
// the recess/bore. Drawing both face and floor (and connecting them) shows depth in
// any view: it reads as the footprint face-on and as a depth cross-section edge-on.
function floorPt(p: Pt, normal: 'x' | 'y' | 'z', dir: 1 | -1, depth: number): Pt {
  return { ...p, [normal]: p[normal] + dir * depth }
}

export function HandOpMarkersSVG({ markers, project, color = HAND_COLOR }: {
  markers: CabinetOpMarker[]
  project: (x: number, y: number, z: number) => { x: number; y: number }
  color?: string
}) {
  const pr = (p: Pt) => project(p.x, p.y, p.z)
  // Screen length of a 1mm step along a cabinet axis from point p — used to tell
  // whether an axis lies in the screen plane (visible) or points at the viewer.
  const axStep = (p: Pt, ax: 'x' | 'y' | 'z', base: { x: number; y: number }) => {
    const q = project(p.x + (ax === 'x' ? 1 : 0), p.y + (ax === 'y' ? 1 : 0), p.z + (ax === 'z' ? 1 : 0))
    return Math.hypot(q.x - base.x, q.y - base.y)
  }
  return (
    <g style={{ pointerEvents: 'none' }}>
      {markers.map(m => {
        if (m.kind === 'drill') {
          const inPlane = (['x', 'y', 'z'] as const).filter(a => a !== m.normal)
          return m.holes.map((h, i) => {
            const f = pr(h)
            // Face-on (bore points at the viewer): the normal barely moves on screen →
            // draw the round opening. Edge-on (Side/Top): draw the bore as a
            // diameter×depth cross-section along whichever in-plane axis is visible.
            if (axStep(h, m.normal, f) < 0.02) {
              return <circle key={`${m.id}-${i}`} cx={f.x} cy={f.y} r={m.radius}
                fill="none" stroke={color} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
            }
            const vis = axStep(h, inPlane[0], f) >= axStep(h, inPlane[1], f) ? inPlane[0] : inPlane[1]
            const e0: Pt = { ...h, [vis]: h[vis] - m.radius }
            const e1: Pt = { ...h, [vis]: h[vis] + m.radius }
            const quad = [pr(e0), pr(e1), pr(floorPt(e1, m.normal, m.dir, m.depth)), pr(floorPt(e0, m.normal, m.dir, m.depth))]
            return <polygon key={`${m.id}-${i}`} points={quad.map(p => `${p.x},${p.y}`).join(' ')}
              fill="none" stroke={color} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
          })
        }
        if (m.kind === 'groove') {
          const a0 = pr(m.ends[0]), b0 = pr(m.ends[1])
          const a1 = pr(floorPt(m.ends[0], m.normal, m.dir, m.depth)), b1 = pr(floorPt(m.ends[1], m.normal, m.dir, m.depth))
          return (
            <g key={m.id}>
              <line x1={a0.x} y1={a0.y} x2={b0.x} y2={b0.y} stroke={color} strokeWidth={Math.max(1, m.radius * 2)} strokeOpacity={0.75} strokeLinecap="round" />
              <line x1={a1.x} y1={a1.y} x2={b1.x} y2={b1.y} stroke={color} strokeWidth={0.6} strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
              <line x1={a0.x} y1={a0.y} x2={a1.x} y2={a1.y} stroke={color} strokeWidth={0.5} strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
              <line x1={b0.x} y1={b0.y} x2={b1.x} y2={b1.y} stroke={color} strokeWidth={0.5} strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
            </g>
          )
        }
        const face = m.corners.map(pr)
        const floor = m.corners.map(c => pr(floorPt(c, m.normal, m.dir, m.depth)))
        return (
          <g key={m.id}>
            <polygon points={face.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth={0.7} vectorEffect="non-scaling-stroke" />
            <polygon points={floor.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth={0.5} strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
            {face.map((p, i) => <line key={i} x1={p.x} y1={p.y} x2={floor[i].x} y2={floor[i].y} stroke={color} strokeWidth={0.5} strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />)}
          </g>
        )
      })}
    </g>
  )
}
