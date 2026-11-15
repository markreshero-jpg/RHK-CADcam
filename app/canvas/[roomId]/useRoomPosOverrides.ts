// Per-cabinet part_pos_overrides for a set of cabinets, re-fetched whenever the
// resolved map changes (an edit re-resolves → new map) — same load as CanvasSVG's
// plan fronts, shared by the elevation views so rotated parts draw turned.
import { useEffect, useState } from 'react'
import { dbLoadRoomPartDetails, type PartPosOverrides } from './canvasDB'

export function useRoomPosOverrides(cabinetIds: string[], refresh: unknown): Map<string, PartPosOverrides> {
  const key = cabinetIds.join(',')
  const [byId, setById] = useState<Map<string, PartPosOverrides>>(new Map())
  useEffect(() => {
    let cancelled = false
    dbLoadRoomPartDetails(key ? key.split(',') : []).then(d => { if (!cancelled) setById(d.posById) })
    return () => { cancelled = true }
  }, [key, refresh])
  return byId
}
