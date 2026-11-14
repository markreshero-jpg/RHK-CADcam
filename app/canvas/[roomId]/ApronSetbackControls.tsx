'use client'
// Set-back apron (edge.apron_setback, z_benchtop_builder 2026-11-14, Mark RHK6468):
// the edge keeps its own profile (the top overhangs) and a stone band of the picked
// apron profile's drop hangs under the slab `inset` in from the edge, with a return
// at each end back out to the edge line (mitred to an in-line mitred apron).
// Used by the F4 Edit edges panel for a clicked straight, exposed, non-apron edge.
import type { ApronSetback, BenchtopEdgeProfile, BenchtopSegment } from '@/src/lib/types'
import { apronSetbackOf } from '@/src/lib/benchtopGeometry'

export default function ApronSetbackControls({ seg, profiles, onSet }: {
  seg: BenchtopSegment
  profiles: BenchtopEdgeProfile[]
  onSet: (sb: ApronSetback | null) => void
}) {
  const aprons = profiles.filter(p => p.active && p.generates === 'apron' && Number(p.apron_drop_mm) > 0)
  const sb = apronSetbackOf(seg)
  return (
    <div className="flex flex-wrap items-center gap-1 text-[10px] w-full"
      title="A stone band under the top, set in from this edge (the top overhangs for seating), with a return at each end back out to the edge — mitred to the next edge's apron">
      <label className="flex items-center gap-1 text-gray-400">
        <input type="checkbox" checked={!!sb} disabled={!aprons.length}
          onChange={e => onSet(e.target.checked && aprons.length ? { inset_mm: 300, profile_id: aprons[0].id } : null)} />
        Set-back apron
      </label>
      {sb && (
        <>
          <label className="flex items-center gap-1 text-gray-400" title="From the top's edge to the band's face (the overhang)">
            In
            <input key={`sb-${sb.inset_mm}`} type="number" min={1} step={10} defaultValue={sb.inset_mm}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              onBlur={e => {
                const v = Math.round(Number(e.target.value))
                if (Number.isFinite(v) && v > 0 && v !== sb.inset_mm) onSet({ ...sb, inset_mm: v })
              }}
              className="w-14 bg-gray-900 border border-gray-700 rounded px-1 text-gray-200" />
          </label>
          <select value={sb.profile_id} onChange={e => onSet({ ...sb, profile_id: e.target.value })}
            className="bg-gray-900 border border-gray-700 rounded px-1 text-gray-200 max-w-[8rem]"
            title="The apron profile — its drop sets the band's depth">
            {!aprons.some(p => p.id === sb.profile_id) && <option value={sb.profile_id}>Unknown profile</option>}
            {aprons.map(p => <option key={p.id} value={p.id}>{p.code ?? p.name} ({p.apron_drop_mm})</option>)}
          </select>
        </>
      )}
    </div>
  )
}
