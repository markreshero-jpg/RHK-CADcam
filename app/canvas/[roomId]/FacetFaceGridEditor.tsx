'use client'

// Face grid editing for shaped cabinets (z_cabinet_shape Phase 3a). A plain
// cabinet goes straight to FaceGridEditor. A shaped one gets a facet picker;
// the chosen facet is edited as a stand-in cabinet as wide as the facet:
//   primary facet → cabinet.face_grid (zone ids zone_<r>_<c>, unchanged)
//   other facets  → cabinet.faces[edgeId]
// The resolved overlays are narrowed to that facet's zones; hinges, drawer
// boxes and internals stay on the primary facet only (Phase 3b).

import { useMemo, useState } from 'react'
import type { CabinetInstance } from '@/src/lib/types'
import type { FaceGridInput, ResolvedCabinet } from '@/src/lib/resolver/types'
import { canonicalSegments, edgeFrame } from '@/src/lib/cabinetShape/construct'
import { edgeLabel } from '@/src/lib/cabinetShape/footprint'
import { primaryFacetId } from '@/src/lib/resolver/resolveShapedFace'
import FaceGridEditor from './FaceGridEditor'
import type { EbByMatId } from './useMaterialColours'

type Facet = { id: string; width: number; primary: boolean }

export default function FacetFaceGridEditor({ cabinet, rp, showInternals, onUpdate, ebByMatId }: {
  cabinet: CabinetInstance
  rp?: ResolvedCabinet
  showInternals?: boolean
  onUpdate: (id: string, u: Partial<CabinetInstance>) => Promise<void>
  ebByMatId?: EbByMatId
}) {
  const facets = useMemo<Facet[]>(() => {
    if (!cabinet.footprint?.segments?.length) return []
    const segs = canonicalSegments(cabinet.footprint, cabinet.dx, cabinet.dz)
    const primary = primaryFacetId(segs, cabinet.dz)
    return segs
      .filter(s => s.type === 'line' && s.edge.role === 'front')
      .map(s => ({ id: s.edge.id, width: edgeFrame(s).len, primary: s.edge.id === primary }))
      .sort((a, b) => Number(b.primary) - Number(a.primary))
  }, [cabinet.footprint, cabinet.dx, cabinet.dz])
  const [sel, setSel] = useState<string | null>(null)

  if (facets.length === 0) {
    return <FaceGridEditor cabinet={cabinet} rp={rp} showInternals={showInternals} onUpdate={onUpdate} ebByMatId={ebByMatId} />
  }

  const active = facets.find(f => f.id === sel) ?? facets[0]
  const facetKey = active.primary ? '' : active.id
  const zonesHere = (rp?.face_zones ?? []).filter(z => (z.facet ?? '') === facetKey)

  // A facet with no stored grid shows what the resolver built: one door,
  // hinged as resolved.
  const grid: FaceGridInput | null = active.primary
    ? (cabinet.face_grid as FaceGridInput | null)
    : ((cabinet.faces?.[active.id] as FaceGridInput | undefined) ?? {
        rows: [{ row_index: 0, height_locked: false }],
        cols: [{ col_index: 0, width_locked: false }],
        zones: [{ row_index: 0, col_index: 0, face_type: 'door', hinge_side: zonesHere[0]?.hinge_side ?? 'left' }],
      })

  const stand: CabinetInstance = { ...cabinet, dx: Math.round(active.width), face_grid: grid as unknown as Record<string, unknown> | null }
  const standRp: ResolvedCabinet | undefined = rp && {
    ...rp,
    face_zones: zonesHere,
    hinge_instances: active.primary ? rp.hinge_instances : [],
    drawer_stacks: active.primary ? rp.drawer_stacks : [],
  }
  const update = (id: string, u: Partial<CabinetInstance>) => {
    if (active.primary || !('face_grid' in u)) return onUpdate(id, u)
    const { face_grid, ...rest } = u
    return onUpdate(id, { ...rest, faces: { ...(cabinet.faces ?? {}), [active.id]: face_grid as Record<string, unknown> } })
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-800 shrink-0">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1">Facet</span>
        {facets.map(f => (
          <button key={f.id} onClick={() => setSel(f.id)}
            className={`text-xs px-2 py-0.5 rounded border ${f.id === active.id
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}>
            {edgeLabel(f.id)} <span className="opacity-60">{Math.round(f.width)}</span>
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {/* Keyed: FaceGridEditor seeds its grid state once. Internals are drawn in
            the box frame, which only lines up with the plain front. */}
        <FaceGridEditor key={active.id} cabinet={stand} rp={standRp}
          showInternals={showInternals && active.primary && !cabinet.footprint}
          onUpdate={update} ebByMatId={ebByMatId} />
      </div>
    </div>
  )
}
