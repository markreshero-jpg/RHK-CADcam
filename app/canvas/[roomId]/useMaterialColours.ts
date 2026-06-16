import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet, ResolvedCustomPart } from '@/src/lib/resolver/types'
import { getCachedInput } from '@/src/lib/resolver/resolveCabinetFromDB'
import { dbLoadResolvedParts, dbResolveAndPersistCabinet } from './canvasDB'

export type MatColours  = Record<string, { face?: string; back?: string; edge?: string }>
export type EbByMatId   = Record<string, { thickness: number; color: string | null }>

const CUSTOM_PART_COLS = 'id,cabinet_instance_id,name,material_id,dx,dy,dz,x,y,z,edge_top,edge_bottom,edge_left,edge_right,visible,show_in_room,orientation'

// Minimal resolved cabinet carrying only custom parts — for standalone panels /
// fillers / end panels that have no carcass, so they still render in room views.
function emptyResolved(cabinet_id: string, custom_parts: ResolvedCustomPart[]): ResolvedCabinet {
  return {
    cabinet_id, custom_parts,
    case_parts: [], toekick_parts: [], internal_parts: [], internal_slides: [],
    face_rows: [], face_cols: [], face_zones: [], drawer_stacks: [],
    seam_joints: [], hinge_instances: [], errors: [], warnings: [], hidden_parts: [],
  }
}

// Group custom-part rows by cabinet and attach to the resolved map, creating
// skeleton entries for cabinets that have only custom parts.
function attachCustomParts(map: Map<string, ResolvedCabinet>, rows: Record<string, unknown>[]) {
  const byCab = new Map<string, ResolvedCustomPart[]>()
  for (const r of rows) {
    const cabId = r.cabinet_instance_id as string
    const arr = byCab.get(cabId) ?? []
    arr.push(r as unknown as ResolvedCustomPart)
    byCab.set(cabId, arr)
  }
  for (const [cabId, parts] of byCab) {
    const existing = map.get(cabId)
    if (existing) existing.custom_parts = parts
    else map.set(cabId, emptyResolved(cabId, parts))
  }
}

export function useMaterialColours(initialCabinets: CabinetInstance[]) {
  const [resolvedParts, setResolvedParts] = useState<Map<string, ResolvedCabinet>>(new Map())
  const [matColours,    setMatColours]    = useState<MatColours>({})
  const [ebByMatId,     setEbByMatId]     = useState<EbByMatId>({})

  // Load persisted resolved parts + material colours + edgebands on mount
  useEffect(() => {
    const ids = initialCabinets.map(c => c.id)
    if (ids.length === 0) return
    dbLoadResolvedParts(ids).then(async map => {
      // Attach standalone custom parts (panels/fillers/end panels) so room views
      // can draw them; this also creates entries for custom-only cabinets.
      const { data: cps } = await supabase.from('cabinet_custom_parts').select(CUSTOM_PART_COLS).in('cabinet_instance_id', ids)
      if (cps && cps.length) attachCustomParts(map, cps as Record<string, unknown>[])
      if (map.size === 0) return
      setResolvedParts(map)

      // Re-resolve cabinets whose drawer hardware is computed-only (never persisted):
      // face drawers (drawer_face zones → drawer_stacks) AND inner drawers / pull-outs
      // (internal_parts → internal_slides). dbLoadResolvedParts hardcodes both
      // drawer_stacks and internal_slides to [], so without this re-resolve the slide
      // rails + their drilling vanish on reopen.
      const drawerCabIds = [...map.keys()].filter(id => {
        const rp = map.get(id)
        const hasDrawerFace = (rp?.face_zones ?? []).some(z => z.face_type === 'drawer_face')
        const hasInnerDrawer = (rp?.internal_parts ?? []).some(p =>
          p.part_type.startsWith('inner_drawer') || p.part_type.startsWith('pull_out'))
        return hasDrawerFace || hasInnerDrawer
      })
      if (drawerCabIds.length > 0) {
        Promise.allSettled(drawerCabIds.map(id => dbResolveAndPersistCabinet(id))).then(results => {
          setResolvedParts(prev => {
            const next = new Map(prev)
            results.forEach((r, i) => {
              if (r.status === 'fulfilled' && r.value)
                next.set(drawerCabIds[i], { ...r.value, custom_parts: prev.get(drawerCabIds[i])?.custom_parts })
            })
            return next
          })
        })
      }

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
