// Orchestrates: load cabinet from DB → resolve geometry → persist parts back to DB.
// Call this whenever a cabinet is created or updated.

import { supabase } from '@/src/lib/supabase'
import { loadCabinetInput, loadCabinetInputFromRow } from './loadCabinetInput'
import type { CabinetInstance } from '../types'
import { resolveCabinet } from './resolver'
import { zoneKey } from '../cabinetShape/partKeys'
import { persistResolved } from './persistResolved'
import { CabinetInput, ResolvedCabinet } from './types'
import { applyPartExpressions } from '../formula/partExpressions'
import { evalCustomPartFields } from '../formula/customParts'
import { buildFormulaScope } from '../formula/context'
import { invalidateResolverCascade } from './cascadeCache'
import { withLibraryKey } from '../displayLayers/customPartKinds'

// Map a part's role (parts_library.material_role) to the assembly's scheduled
// material id for that role. Used to auto-assign a custom part's material when the
// user hasn't set an explicit override. Falls back to the carcass material.
function roleMaterialId(role: string | null | undefined, input: CabinetInput): string | null {
  switch (role) {
    case 'door': case 'door_face':
      return input.door_material?.id ?? input.material?.id ?? null
    case 'shelf':
      return input.shelf_material?.id ?? input.material?.id ?? null
    case 'toekick': case 'toekick_face':
      return input.toekick_face_material?.id ?? input.material?.id ?? null
    case 'drawerbox': case 'drawer':
      return input.drawer_material?.id ?? input.material?.id ?? null
    case 'exposed': case 'exposed_interior': case 'end_panel': // legacy aliases fold into exposed
      return input.exposed_material?.id ?? input.material?.id ?? null
    default: // interior / unknown
      return input.material?.id ?? null
  }
}

// Room-view custom part columns plus what resolution needs (formulas, override,
// role). Same embed as ROOM_CUSTOM_PART_COLS, widened with material_role.
const CUSTOM_PART_RESOLVE_COLS =
  'id,cabinet_instance_id,part_library_id,name,material_id,dx,dy,dz,x,y,z,edge_top,edge_bottom,edge_left,edge_right,visible,show_in_room,orientation,' +
  'expressions,material_override_id,parts_library(key,material_role)'

// Resolve each custom part against its assembly: (1) evaluate parametric formulas
// and write the computed dims/positions back, and (2) resolve its effective material
// — an explicit material_override_id wins, otherwise the part role's scheduled
// material. Both land in the literal columns (material_id / dx…z) that every
// view/report/cut-list reads. The patched rows are then attached as
// resolved.custom_parts — room views draw added parts from there, so a resolve
// without them makes carcass-less assemblies (end panels, fillers) vanish.
export async function resolveCustomParts(cabinetId: string, resolved: ResolvedCabinet, input: CabinetInput) {
  const { data: parts } = await supabase
    .from('cabinet_custom_parts')
    .select(CUSTOM_PART_RESOLVE_COLS)
    .eq('cabinet_instance_id', cabinetId)
  if (!parts || parts.length === 0) { resolved.custom_parts = []; return }
  const scope = buildFormulaScope(resolved, input)
  for (const p of parts as unknown as Record<string, unknown>[]) {
    const literal = { dx: Number(p.dx), dy: Number(p.dy), dz: Number(p.dz), x: Number(p.x), y: Number(p.y), z: Number(p.z) }
    const patch: Record<string, unknown> = evalCustomPartFields(literal, p.expressions as Record<string, string> | null, scope)
    // Effective material: explicit override, else role default from the schedule.
    const role = (p.parts_library as { material_role?: string | null } | null)?.material_role ?? null
    const eff = (p.material_override_id as string | null) ?? roleMaterialId(role, input)
    if (eff && eff !== p.material_id) patch.material_id = eff
    if (Object.keys(patch).length > 0) {
      Object.assign(p, patch)
      const { error } = await supabase.from('cabinet_custom_parts').update(patch).eq('id', p.id)
      if (error) console.error('resolveCustomParts update', error)
    }
  }
  resolved.custom_parts = withLibraryKey(parts as unknown as Record<string, unknown>[]) as unknown as ResolvedCabinet['custom_parts']
}

// Module-level caches: populated after each full DB load.
const _inputCache     = new Map<string, CabinetInput>()
const _edgeOvCache    = new Map<string, Awaited<ReturnType<typeof loadEdgeOverrides>>>()
const _hiddenCache    = new Map<string, string[]>()

/**
 * Drop every resolver cache: the per-cabinet inputs above AND the shared
 * cascade/library reads (cascadeCache.ts). Call after saving room, job, shop or
 * library data, and when the canvas mounts — otherwise a fast path could resolve
 * against a stale cascade. The next resolve reloads everything from the DB.
 */
export function invalidateResolverCaches(): void {
  _inputCache.clear()
  _edgeOvCache.clear()
  _hiddenCache.clear()
  invalidateResolverCascade()
}

// Hidden-part set from the last full resolve — lets the fast resize path carry
// hidden_parts without an extra round-trip.
export function getCachedHidden(id: string): string[] | undefined {
  return _hiddenCache.get(id)
}

export function getCachedInput(id: string): CabinetInput | undefined {
  return _inputCache.get(id)
}

export function setCachedInput(id: string, input: CabinetInput): void {
  _inputCache.set(id, input)
}

// Load manually-edited edge bands from the DB so they survive re-resolution.
async function loadEdgeOverrides(cabinetId: string) {
  const [cp, tp, ip, fz] = await Promise.all([
    supabase.from('case_parts').select('part_key,edge_band_top,edge_band_bottom,edge_band_left,edge_band_right').eq('cabinet_instance_id', cabinetId),
    supabase.from('toekick_parts').select('part_key,sort_order,edge_band_top,edge_band_bottom,edge_band_left,edge_band_right').eq('cabinet_instance_id', cabinetId),
    supabase.from('internal_parts').select('part_type,sort_order,edge_band_top,edge_band_bottom,edge_band_front,edge_band_back').eq('cabinet_instance_id', cabinetId),
    supabase.from('face_zones').select('facet,row_index,col_index,edge_band_top,edge_band_bottom,edge_band_left,edge_band_right').eq('cabinet_instance_id', cabinetId),
  ])
  return {
    case:     new Map((cp.data ?? []).map(p => [p.part_key, { top: p.edge_band_top, bottom: p.edge_band_bottom, left: p.edge_band_left, right: p.edge_band_right }])),
    toekick:  new Map((tp.data ?? []).map(p => [`${p.part_key}_${p.sort_order}`, { top: p.edge_band_top, bottom: p.edge_band_bottom, left: p.edge_band_left, right: p.edge_band_right }])),
    internal: new Map((ip.data ?? []).map(p => [`${p.part_type}_${p.sort_order}`, { top: p.edge_band_top, bottom: p.edge_band_bottom, left: p.edge_band_back, right: p.edge_band_front }])),
    // Keyed like the zone part id minus 'zone_' (zoneKey): facets get `edge.r_c`.
    zone:     new Map((fz.data ?? []).map(z => [zoneKey(z), { top: z.edge_band_top, bottom: z.edge_band_bottom, left: z.edge_band_left, right: z.edge_band_right }])),
  }
}

// Load the user's hidden-part ID set so it can be carried on the resolved cabinet
// (consumers strip them via filterHiddenParts).
export async function loadHiddenParts(cabinetId: string): Promise<string[]> {
  const { data } = await supabase
    .from('cabinet_instances').select('hidden_parts').eq('id', cabinetId).single()
  return ((data as { hidden_parts?: unknown } | null)?.hidden_parts ?? []) as string[]
}

// Merge saved edge bands back onto freshly-resolved parts (preserves manual edits through resolves).
function applyEdgeOverrides(
  resolved: ResolvedCabinet,
  ov: Awaited<ReturnType<typeof loadEdgeOverrides>>,
) {
  for (const p of resolved.case_parts) {
    const e = ov.case.get(p.part_key)
    if (e) p.edge_band = { ...p.edge_band, ...e }
  }
  for (const p of resolved.toekick_parts) {
    const e = ov.toekick.get(`${p.part_key}_${p.sort_order}`)
    if (e) p.edge_band = { ...p.edge_band, ...e }
  }
  for (const p of resolved.internal_parts) {
    const e = ov.internal.get(`${p.part_type}_${p.sort_order}`)
    if (e) p.edge_band = { ...p.edge_band, ...e }
  }
  for (const z of resolved.face_zones) {
    const e = ov.zone.get(zoneKey(z))
    if (e) z.edge_band = { ...z.edge_band, ...e }
  }
}

// Apply cached edge overrides to a freshly-resolved cabinet (used by the fast resize path).
export function applyEdgeOverridesFromCache(resolved: ResolvedCabinet) {
  const ov = _edgeOvCache.get(resolved.cabinet_id)
  if (ov) applyEdgeOverrides(resolved, ov)
}

// Patch the cache when a single part's edge bands are saved manually.
// Keeps the fast resize path from overwriting the just-saved values.
export function patchEdgeOverrideCache(
  cabinetId: string,
  partId: string,
  edge: { top: boolean; bottom: boolean; left: boolean; right: boolean },
) {
  const ov = _edgeOvCache.get(cabinetId)
  if (!ov) return
  if      (partId.startsWith('case_'))  ov.case.set(partId.slice(5), edge)
  else if (partId.startsWith('tk_'))    ov.toekick.set(partId.slice(3), edge)
  else if (partId.startsWith('int_'))   ov.internal.set(partId.slice(4), edge)
  else if (partId.startsWith('zone_'))  ov.zone.set(partId.slice(5), edge)
}

/**
 * Resolve an UNSAVED cabinet (e.g. the armed library definition) for preview.
 * Same cascade + resolver as a placed cabinet, but nothing is cached or
 * persisted. `customParts` = the definition's custom_parts snapshot; their
 * formulas and role materials are evaluated in memory, exactly as
 * resolveCustomParts does for a placed cabinet.
 */
export async function resolveDraftCabinet(
  draft: CabinetInstance,
  customParts: Record<string, unknown>[] = [],
): Promise<ResolvedCabinet> {
  const input = await loadCabinetInputFromRow(draft, { persisted: false })
  const resolved = resolveCabinet(input)
  resolved.hidden_parts = []
  if (customParts.length === 0) { resolved.custom_parts = []; return resolved }

  const libIds = [...new Set(customParts.map(p => p.part_library_id).filter((v): v is string => typeof v === 'string'))]
  const { data: libs } = libIds.length > 0
    ? await supabase.from('parts_library').select('id,key,material_role').in('id', libIds)
    : { data: [] as { id: string; key: string | null; material_role: string | null }[] }
  const libById = new Map((libs ?? []).map(l => [l.id as string, l]))
  const scope = buildFormulaScope(resolved, input)
  resolved.custom_parts = customParts.map((p, i) => {
    const literal = { dx: Number(p.dx ?? 0), dy: Number(p.dy ?? 0), dz: Number(p.dz ?? 18), x: Number(p.x ?? 0), y: Number(p.y ?? 0), z: Number(p.z ?? 0) }
    const lib = libById.get(p.part_library_id as string)
    return {
      ...p,
      ...literal,
      ...evalCustomPartFields(literal, p.expressions as Record<string, string> | null, scope),
      id: `draft_custom_${i}`,
      cabinet_instance_id: draft.id,
      material_id: (p.material_override_id as string | null) ?? roleMaterialId(lib?.material_role, input),
      visible: p.visible !== false,
      show_in_room: p.show_in_room !== false,
      orientation: (p.orientation as string) ?? 'flat',
      library_key: lib?.key ?? null,
    }
  }) as unknown as ResolvedCabinet['custom_parts']
  return resolved
}

export async function resolveCabinetFromDB(
  cabinetId: string,
  opts: { quiet?: boolean; awaitPersist?: boolean } = {},
): Promise<ResolvedCabinet> {
  const [input, edgeOverrides, hidden] = await Promise.all([
    loadCabinetInput(cabinetId),
    loadEdgeOverrides(cabinetId),
    loadHiddenParts(cabinetId),
  ])
  _inputCache.set(cabinetId, input)
  _edgeOvCache.set(cabinetId, edgeOverrides)
  _hiddenCache.set(cabinetId, hidden)

  const resolved = resolveCabinet(input)
  if (resolved.errors.length > 0) {
    // quiet: callers that resolve many cabinets at once (e.g. the optimiser drill
    // sync) downgrade handled errors to a warning so a single broken cabinet does
    // not trip the dev error overlay.
    const log = opts.quiet ? console.warn : console.error
    log('Resolver errors for cabinet', cabinetId, resolved.errors)
  }
  resolved.hidden_parts = hidden

  applyEdgeOverrides(resolved, edgeOverrides)

  // Persist in background so callers can return resolved data immediately.
  // awaitPersist: batch callers that tear down right after (e.g. the headless
  // getIssues sweep) must wait, or closing the page aborts the delete+insert
  // mid-cycle and the cabinet loses its persisted parts.
  const persisted = persistResolved(resolved).catch(e => console.error('persistResolved:', e))
  // Re-evaluate any parametric custom parts against the fresh geometry. Awaited
  // (one read when the cabinet has none) so the result carries custom_parts.
  const customed = resolveCustomParts(cabinetId, resolved, input).catch(e => console.error('resolveCustomParts:', e))
  // Re-evaluate standard-part formulas → cache into part_pos_overrides (background).
  const exprs = applyPartExpressions(cabinetId, resolved, input).catch(e => console.error('applyPartExpressions:', e))
  await customed
  if (opts.awaitPersist) await Promise.all([persisted, exprs])
  return resolved
}
