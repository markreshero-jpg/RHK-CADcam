// Orchestrates: load cabinet from DB → resolve geometry → persist parts back to DB.
// Call this whenever a cabinet is created or updated.

import { loadCabinetInput } from './loadCabinetInput'
import { resolveCabinet } from './resolver'
import { persistResolved } from './persistResolved'
import { ResolvedCabinet } from './types'

export async function resolveCabinetFromDB(cabinetId: string): Promise<ResolvedCabinet> {
  const input    = await loadCabinetInput(cabinetId)
  const resolved = resolveCabinet(input)

  if (resolved.errors.length > 0) {
    console.error('Resolver errors for cabinet', cabinetId, resolved.errors)
  }

  await persistResolved(resolved)
  return resolved
}
