import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { getCachedInput } from '@/src/lib/resolver/resolveCabinetFromDB'
import { dbLoadResolvedParts } from './canvasDB'

export type MatColours  = Record<string, { face?: string; back?: string; edge?: string }>
export type EbByMatId   = Record<string, { thickness: number; color: string | null }>

export function useMaterialColours(initialCabinets: CabinetInstance[]) {
  const [resolvedParts, setResolvedParts] = useState<Map<string, ResolvedCabinet>>(new Map())
  const [matColours,    setMatColours]    = useState<MatColours>({})
  const [ebByMatId,     setEbByMatId]     = useState<EbByMatId>({})

  // Load persisted resolved parts + material colours + edgebands on mount
  useEffect(() => {
    const ids = initialCabinets.map(c => c.id)
    if (ids.length === 0) return
    dbLoadResolvedParts(ids).then(async map => {
      if (map.size === 0) return
      setResolvedParts(map)

      // Collect unique material IDs across all parts
      const matIds = new Set<string>()
      for (const rp of map.values()) {
        rp.case_parts.forEach(p    => matIds.add(p.material_id))
        rp.toekick_parts.forEach(p => matIds.add(p.material_id))
        rp.internal_parts.forEach(p=> matIds.add(p.material_id))
        rp.face_zones.forEach(z    => matIds.add(z.material_id))
      }
      if (matIds.size > 0) {
        const { data } = await supabase
          .from('materials').select('id, face_colour, back_colour, edge_colour')
          .in('id', [...matIds])
        if (data) {
          const colours: MatColours = {}
          for (const m of data) {
            colours[m.id] = {
              face: m.face_colour ?? undefined,
              back: m.back_colour ?? undefined,
              edge: m.edge_colour ?? undefined,
            }
          }
          setMatColours(colours)
        }
      }

      // Collect edgeband IDs paired with their material IDs
      const ebIdToMatIds = new Map<string, string[]>()
      for (const rp of map.values()) {
        for (const p of [...rp.case_parts, ...rp.toekick_parts, ...rp.internal_parts, ...rp.face_zones]) {
          const ebId = p.edge_band.id
          if (ebId) {
            const list = ebIdToMatIds.get(ebId) ?? []
            if (!list.includes(p.material_id)) ebIdToMatIds.set(ebId, [...list, p.material_id])
          }
        }
      }
      if (ebIdToMatIds.size > 0) {
        const { data: ebData } = await supabase
          .from('edge_banding').select('id, thickness, color')
          .in('id', [...ebIdToMatIds.keys()])
        if (ebData) {
          const specs: EbByMatId = {}
          for (const eb of ebData) {
            for (const matId of (ebIdToMatIds.get(eb.id) ?? [])) {
              specs[matId] = { thickness: eb.thickness, color: eb.color ?? null }
            }
          }
          if (Object.keys(specs).length > 0) setEbByMatId(specs)
        }
      }
    })
  }, []) // intentionally mount-only

  // Apply colours from a freshly-resolved cabinet input (called after resolve/persist)
  const applyInputColours = useCallback((id: string) => {
    const input = getCachedInput(id)
    if (!input) return
    const mats = [
      input.material, input.door_material, input.shelf_material,
      input.toekick_face_material, input.toekick_interior_material,
    ]
    const colours: MatColours = {}
    for (const m of mats) {
      if (m) colours[m.id] = {
        face: m.face_colour  ?? undefined,
        back: m.back_colour  ?? undefined,
        edge: m.edge_colour  ?? undefined,
      }
    }
    if (Object.keys(colours).length > 0) setMatColours(prev => ({ ...prev, ...colours }))
  }, [])

  const applyInputEdgebands = useCallback((id: string) => {
    const input = getCachedInput(id)
    if (!input) return
    const pairs: [string, string | undefined][] = [
      [input.material.id,                  input.interior_edgeband_id],
      [input.door_material.id,             input.door_edgeband_id],
      [input.shelf_material.id,            input.shelf_edgeband_id],
      [input.toekick_face_material.id,     input.toekick_face_edgeband_id],
      [input.toekick_interior_material.id, input.toekick_interior_edgeband_id],
    ]
    const needed = pairs.filter((p): p is [string, string] => !!p[1])
    if (needed.length === 0) return
    const uniqueEbIds = [...new Set(needed.map(([, ebId]) => ebId))]
    supabase.from('edge_banding').select('id, thickness, color').in('id', uniqueEbIds).then(({ data }) => {
      if (!data) return
      const ebMap = new Map(data.map(eb => [eb.id, eb]))
      const specs: EbByMatId = {}
      for (const [matId, ebId] of needed) {
        const eb = ebMap.get(ebId)
        if (eb) specs[matId] = { thickness: eb.thickness, color: eb.color ?? null }
      }
      if (Object.keys(specs).length > 0) setEbByMatId(prev => ({ ...prev, ...specs }))
    })
  }, [])

  return {
    resolvedParts, setResolvedParts,
    matColours,
    ebByMatId,
    applyInputColours,
    applyInputEdgebands,
  }
}
