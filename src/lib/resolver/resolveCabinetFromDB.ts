// Orchestrates: load cabinet from DB → resolve geometry → persist parts back to DB.
// Call this whenever a cabinet is created or updated.

import { supabase } from '@/src/lib/supabase'
import { loadCabinetInput } from './loadCabinetInput'
import { resolveCabinet } from './resolver'
import { persistResolved } from './persistResolved'
import { CabinetInput, ResolvedCabinet } from './types'
import { buildPartContext, evalPartFields } from '../partFormula'

// Evaluate parametric custom-part formulas against the resolved assembly and write
// the computed dims/positions back to cabinet_custom_parts (the literal columns are
// the cache every view/report/cut-list reads). No-op when no part has formulas.
async function resolveCustomParts(cabinetId: string, resolved: ResolvedCabinet, input: CabinetInput) {
  const { data: parts } = await supabase
    .from('cabinet_custom_parts')
    .select('id, dx, dy, dz, x, y, z, expressions')
    .eq('cabinet_instance_id', cabinetId)
  if (!parts || parts.length === 0) return
  if (!parts.some(p => p.expressions && Object.keys(p.expressions).length > 0)) return
  const ctx = buildPartContext(resolved, input)
  for (const p of parts) {
    const literal = { dx: Number(p.dx), dy: Number(p.dy), dz: Number(p.dz), x: Number(p.x), y: Number(p.y), z: Number(p.z) }
    const patch = evalPartFields(literal, p.expressions as Record<string, string> | null, ctx)
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('cabinet_custom_parts').update(patch).eq('id', p.id)
      if (error) console.error('resolveCustomParts update', error)
    }
  }
}

// Module-level caches: populated after each full DB load.
const _inputCache     = new Map<string, CabinetInput>()
const _edgeOvCache    = new Map<string, Awaited<ReturnType<typeof loadEdgeOverrides>>>()
const _hiddenCache    = new Map<string, string[]>()

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
    supabase.from('face_zones').select('row_index,col_index,edge_band_top,edge_band_bottom,edge_band_left,edge_band_right').eq('cabinet_instance_id', cabinetId),
  ])
  return {
    case:     new Map((cp.data ?? []).map(p => [p.part_key, { top: p.edge_band_top, bottom: p.edge_band_bottom, left: p.edge_band_left, right: p.edge_band_right }])),
    toekick:  new Map((tp.data ?? []).map(p => [`${p.part_key}_${p.sort_order}`, { top: p.edge_band_top, bottom: p.edge_band_bottom, left: p.edge_band_left, right: p.edge_band_right }])),
    internal: new Map((ip.data ?? []).map(p => [`${p.part_type}_${p.sort_order}`, { top: p.edge_band_top, bottom: p.edge_band_bottom, left: p.edge_band_back, right: p.edge_band_front }])),
    zone:     new Map((fz.data ?? []).map(z => [`${z.row_index}_${z.col_index}`, { top: z.edge_band_top, bottom: z.edge_band_bottom, left: z.edge_band_left, right: z.edge_band_right }])),
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
    const e = ov.zone.get(`${z.row_index}_${z.col_index}`)
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

export async function resolveCabinetFromDB(
  cabinetId: string,
  opts: { quiet?: boolean } = {},
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
  persistResolved(resolved).catch(e => console.error('persistResolved:', e))
  // Re-evaluate any parametric custom parts against the fresh geometry (background).
  resolveCustomParts(cabinetId, resolved, input).catch(e => console.error('resolveCustomParts:', e))
  return resolved
}
