// Orchestrates: load cabinet from DB → resolve geometry → persist parts back to DB.
// Call this whenever a cabinet is created or updated.

import { supabase } from '@/src/lib/supabase'
import { loadCabinetInput, loadCabinetInputFromRow } from './loadCabinetInput'
import type { CabinetInstance } from '../types'
import { resolveCabinet } from './resolver'
import { zoneKey } from '../cabinetShape/partKeys'
import { persistResolved } from './persistResolved'
import { CabinetInput, ResolvedCabinet, type PartHideViews } from './types'
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
  'id,cabinet_instance_id,part_library_id,name,material_id,dx,dy,dz,x,y,z,edge_top,edge_bottom,edge_left,edge_right,visible,show_in_room,hide_views,orientation,' +
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
const _hiddenCache    = new Map<string, PartHideViews>()

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

// Per-view hide map from the last full resolve — lets the fast resize path carry
// part_hide_views without an extra round-trip.
export function getCachedHidden(id: string): PartHideViews | undefined {
  return _hiddenCache.get(id)
}

export function getCachedInput(id: string): CabinetInput | undefined {
  return _inputCache.get(id)
}

export function setCachedInput(id: string, input: CabinetInput): void {
  _inputCache.set(id, input)
}

// Hand-edited edge bands live on cabinet_instances.edge_overrides, keyed by the
// editor's part id (case_<key>, tk_<key>_<sort>, int_<type>_<sort>, zone_<zoneKey>).
// Only those are re-applied after a resolve — the persisted part rows are the
// resolver's own output and must not override it, or rule-driven edging (e.g.
// FLOAT taping gable ends) never reaches a cabinet that was resolved before.
export type EdgeFlags = { top: boolean; bottom: boolean; left: boolean; right: boolean }
export type EdgeOverrides = Record<string, EdgeFlags>

async function loadEdgeOverrides(cabinetId: string): Promise<EdgeOverrides> {
  const { data } = await supabase.from('cabinet_instances').select('edge_overrides').eq('id', cabinetId).maybeSingle()
  return { ...((data?.edge_overrides ?? {}) as EdgeOverrides) }
}

// Load the user's per-view hide map so it can be carried on the resolved cabinet
// (room views strip parts via filterHiddenParts).
export async function loadHiddenParts(cabinetId: string): Promise<PartHideViews> {
  const { data } = await supabase
    .from('cabinet_instances').select('part_hide_views').eq('id', cabinetId).single()
  return ((data as { part_hide_views?: unknown } | null)?.part_hide_views ?? {}) as PartHideViews
}

// Merge hand-edited edge bands onto freshly-resolved parts (they survive resolves).
export function applyEdgeOverrides(resolved: ResolvedCabinet, ov: EdgeOverrides) {
  for (const p of resolved.case_parts) {
    const e = ov[`case_${p.part_key}`]
    if (e) p.edge_band = { ...p.edge_band, ...e }
  }
  for (const p of resolved.toekick_parts) {
    const e = ov[`tk_${p.part_key}_${p.sort_order}`]
    if (e) p.edge_band = { ...p.edge_band, ...e }
  }
  for (const p of resolved.internal_parts) {
    const e = ov[`int_${p.part_type}_${p.sort_order}`]
    if (e) p.edge_band = { ...p.edge_band, ...e }
  }
  for (const z of resolved.face_zones) {
    const e = ov[`zone_${zoneKey(z)}`]
    if (e) z.edge_band = { ...z.edge_band, ...e }
  }
}

// Apply cached edge overrides to a freshly-resolved cabinet (used by the fast resize path).
export function applyEdgeOverridesFromCache(resolved: ResolvedCabinet) {
  const ov = _edgeOvCache.get(resolved.cabinet_id)
  if (ov) applyEdgeOverrides(resolved, ov)
}

// Saves are chained per cabinet so quick successive edge clicks don't race the
// read-modify-write of edge_overrides.
const _edgeSaveChain = new Map<string, Promise<unknown>>()

/** Record a hand edge edit on the cabinet (edge_overrides) and patch the cache
 *  so the fast resize path keeps it. The caller updates the part row itself. */
export function saveEdgeOverride(cabinetId: string, partId: string, edge: EdgeFlags): Promise<unknown> {
  const flags = { top: edge.top, bottom: edge.bottom, left: edge.left, right: edge.right }
  const cached = _edgeOvCache.get(cabinetId)
  if (cached) cached[partId] = flags
  const run = (_edgeSaveChain.get(cabinetId) ?? Promise.resolve()).then(async () => {
    const { data, error: readErr } = await supabase.from('cabinet_instances').select('edge_overrides').eq('id', cabinetId).single()
    if (readErr) throw readErr
    const next = { ...((data?.edge_overrides ?? {}) as EdgeOverrides), [partId]: flags }
    const { error } = await supabase.from('cabinet_instances').update({ edge_overrides: next }).eq('id', cabinetId)
    if (error) throw error
  }).catch(e => console.error('[edge override save]', e))
  _edgeSaveChain.set(cabinetId, run)
  return run
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
  resolved.part_hide_views = {}
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
      hide_views: (p.hide_views as string[] | undefined) ?? [],
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
  resolved.part_hide_views = hidden

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
