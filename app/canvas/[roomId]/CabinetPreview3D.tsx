'use client'
// Sidebar preview of the armed library definition. Resolves the armed draft
// (definition + this room's cascade + any edits made in the right-hand panel)
// through the real resolver and draws it with CabinetScene — the same renderer
// as the cabinet editor and room 3D — so the preview is the true cabinet.
import { useEffect, useMemo, useState } from 'react'
import type { CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { resolveDraftCabinet } from '@/src/lib/resolver/resolveCabinetFromDB'
import { PreviewCanvas, PassivePartsContext, type PartEdge, type MatColMap } from '@/src/components/three/PartViewer'
import { CabinetScene, type SceneCustomPart } from './Cabinet3DView'
import type { EbByMatId } from './useMaterialColours'

interface Props {
  draft:            CabinetInstance
  customParts?:     Record<string, unknown>[]   // the definition's custom_parts snapshot
  label:            string
  canvasWidth:      number
  materialColours?: MatColMap
  ebByMatId?:       EbByMatId
}

const NOOP = () => {}
const EMPTY_DRAWERS = new Map<string, number>()
const EMPTY_INNER_DRAWERS = new Map<number, number>()
const EMPTY_EDGES = new Map<string, PartEdge>()

export default function CabinetPreview3D({ draft, customParts, label, canvasWidth, materialColours, ebByMatId }: Props) {
  const W = Math.max(80, canvasWidth)
  const H = Math.round(W * 0.85)

  // Resolved result tagged with the draft it belongs to, so a stale result
  // (previous definition) is never drawn against the new draft.
  const [res, setRes] = useState<{ draft: CabinetInstance; rp: ResolvedCabinet } | null>(null)
  const [error, setError] = useState(false)

  // Debounced: typing a width in the panel patches the draft on every keystroke.
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      resolveDraftCabinet(draft, customParts ?? [])
        .then(rp => { if (!cancelled) { setRes({ draft, rp }); setError(false) } })
        .catch(e => { if (!cancelled) { console.error('CabinetPreview3D resolve', e); setError(true) } })
    }, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [draft, customParts])

  // Keep showing the last resolve of the same definition while a re-resolve runs.
  const rp = res && res.draft.cabinet_definition_id === draft.cabinet_definition_id ? res.rp : null
  const cab = rp ? res!.draft : draft

  const sceneParts = useMemo(
    () => (rp?.custom_parts ?? []) as unknown as SceneCustomPart[],
    [rp?.custom_parts],
  )

  return (
    <div className="rounded-lg bg-gray-950 border border-gray-800 hover:border-orange-500 overflow-hidden select-none transition-colors">
      <div style={{ width: W, height: H }} className="relative">
        <PreviewCanvas dx={cab.dx} dy={cab.dy} dz={cab.dz} bgColor="#030712" hint="">
          {rp ? (
            <PassivePartsContext.Provider value>
              <CabinetScene
                cab={cab}
                rp={rp}
                selected={null}
                onSelect={NOOP}
                materialColours={materialColours}
                ebByMatId={ebByMatId}
                doorsOpen={false}
                openDrawers={EMPTY_DRAWERS}
                openInnerDrawers={EMPTY_INNER_DRAWERS}
                edgeOverrides={EMPTY_EDGES}
                customParts={sceneParts}
              />
            </PassivePartsContext.Provider>
          ) : (
            <mesh>
              <boxGeometry args={[cab.dx, cab.dy, cab.dz]} />
              <meshStandardMaterial color="#374151" roughness={0.8} transparent opacity={0.5} />
            </mesh>
          )}
        </PreviewCanvas>
        {!rp && (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-500 pointer-events-none">
            {error ? 'Preview unavailable' : 'Resolving…'}
          </div>
        )}
      </div>
      <div className="px-2 pb-2 pt-1.5 border-t border-gray-800">
        <div className="text-[11px] font-semibold text-white/80 truncate">{label}</div>
        <div className="text-[10px] text-gray-500 mt-0.5 font-mono">
          {draft.dx} × {draft.dy} × {draft.dz} mm
        </div>
      </div>
    </div>
  )
}
