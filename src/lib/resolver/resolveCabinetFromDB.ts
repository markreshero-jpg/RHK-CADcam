// Orchestrates: load cabinet from DB → resolve geometry → persist parts back to DB.
// Call this whenever a cabinet is created or updated.

import { loadCabinetInput } from './loadCabinetInput'
import { resolveCabinet } from './resolver'
import { persistResolved } from './persistResolved'
import { CabinetInput, ResolvedCabinet } from './types'

// Module-level cache: populated after each full DB load so dimension-only
// updates can resolve synchronously without re-fetching materials/rules.
const _inputCache = new Map<string, CabinetInput>()

export function getCachedInput(id: string): CabinetInput | undefined {
  return _inputCache.get(id)
}

export function setCachedInput(id: string, input: CabinetInput): void {
  _inputCache.set(id, input)
}

export async function resolveCabinetFromDB(cabinetId: string): Promise<ResolvedCabinet> {
  const input = await loadCabinetInput(cabinetId)
  _inputCache.set(cabinetId, input)

  const resolved = resolveCabinet(input)
  if (resolved.errors.length > 0) {
    console.error('Resolver errors for cabinet', cabinetId, resolved.errors)
  }

  // Persist in background so callers can return resolved data immediately.
  persistResolved(resolved).catch(e => console.error('persistResolved:', e))
  return resolved
}
