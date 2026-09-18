// ============================================================
// Standard-part formulas (M2) — storage + resolve-time evaluation.
//
// cabinet_instances.part_expressions holds formula SOURCE per stable part id
// per display-box size slot (sw/sh/sd = box W/H/D — the same slots
// part_pos_overrides uses). At resolve time applyPartExpressions() evaluates
// every formula against the freshly-resolved cabinet (buildFormulaScope) and
// caches the computed values into part_pos_overrides, so the 3D view,
// Overrides tab and optimiser snapshot keep reading plain numbers with zero
// changes. Same write-back-cache pattern as custom parts
// (partFormula.ts / resolveCustomParts), on the new safe engine.
//
// Custom parts are excluded — they keep cabinet_custom_parts.expressions.
// ============================================================

import { supabase } from '@/src/lib/supabase'
import type { CabinetInput, ResolvedCabinet } from '../resolver/types'
import { parse } from './parser'
import { evaluate } from './evaluate'
import { buildFormulaScope } from './context'

export type PartSizeSlot = 'sw' | 'sh' | 'sd'
export const PART_SIZE_SLOTS: PartSizeSlot[] = ['sw', 'sh', 'sd']

/** stable part id → slot → formula source */
export type PartExpressions = Record<string, Partial<Record<PartSizeSlot, string>>>

// Matches canvasDB.PartPosOverrides[string] — declared locally so resolver-side
// code doesn't import from app/. Extra keys (oax…) pass through untouched.
type PosOvEntry = { ox: number; oy: number; oz: number } & Partial<Record<PartSizeSlot, number>> & Record<string, unknown>
type PosOverrides = Record<string, PosOvEntry>

export async function dbLoadPartExpressions(cabinetId: string): Promise<PartExpressions> {
  const { data } = await supabase
    .from('cabinet_instances').select('part_expressions').eq('id', cabinetId).single()
  return ((data as { part_expressions?: unknown } | null)?.part_expressions ?? {}) as PartExpressions
}

export async function dbSavePartExpressions(cabinetId: string, updated: PartExpressions): Promise<void> {
  const { error } = await supabase
    .from('cabinet_instances').update({ part_expressions: updated }).eq('id', cabinetId)
  if (error) console.error('[part expressions save]', error)
}

/** Pure update: set (or clear with null) one slot's formula. Empty entries are dropped. */
export function setPartExpression(
  current: PartExpressions, partId: string, slot: PartSizeSlot, formula: string | null,
): PartExpressions {
  const entry = { ...(current[partId] ?? {}) }
  if (formula && formula.trim()) entry[slot] = formula.trim()
  else delete entry[slot]
  if (Object.keys(entry).length === 0) {
    const { [partId]: _removed, ...rest } = current
    return rest
  }
  return { ...current, [partId]: entry }
}

/**
 * Evaluate a cabinet's part formulas against fresh resolver output and cache
 * the results into part_pos_overrides (sw/sh/sd slots). Fire-and-forget from
 * resolveCabinetFromDB — same pattern as resolveCustomParts. Formulas that
 * fail to evaluate leave their cached value untouched (last good value wins)
 * and log a warning.
 */
export async function applyPartExpressions(
  cabinetId: string, resolved: ResolvedCabinet, input: CabinetInput,
): Promise<void> {
  const { data } = await supabase
    .from('cabinet_instances')
    .select('part_expressions, part_pos_overrides')
    .eq('id', cabinetId)
    .single()
  const expressions = ((data as { part_expressions?: unknown } | null)?.part_expressions ?? {}) as PartExpressions
  if (Object.keys(expressions).length === 0) return
  const overrides = ((data as { part_pos_overrides?: unknown } | null)?.part_pos_overrides ?? {}) as PosOverrides

  const scope = buildFormulaScope(resolved, input)
  let changed = false
  const next: PosOverrides = { ...overrides }

  for (const [partId, slots] of Object.entries(expressions)) {
    for (const slot of PART_SIZE_SLOTS) {
      const src = slots[slot]
      if (!src) continue
      let value: number
      try {
        value = evaluate(parse(src), scope)
      } catch (e) {
        console.warn(`[part formula] ${partId}.${slot} "${src}":`, e instanceof Error ? e.message : e)
        continue
      }
      if (!Number.isFinite(value) || value <= 0) {
        console.warn(`[part formula] ${partId}.${slot} "${src}" → ${value} (ignored)`)
        continue
      }
      const entry = next[partId] ?? { ox: 0, oy: 0, oz: 0 }
      if (Math.abs((entry[slot] ?? Number.NaN) - value) > 1e-6) {
        next[partId] = { ...entry, [slot]: value }
        changed = true
      }
    }
  }

  if (!changed) return
  const { error } = await supabase
    .from('cabinet_instances').update({ part_pos_overrides: next }).eq('id', cabinetId)
  if (error) console.error('[part formula cache]', error)
}
