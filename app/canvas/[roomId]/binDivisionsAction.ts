// The "Add divisions" button behind a NO_BIN_FITS warning (z_bin_cabinet B4).
// Shared by the errors panel and the face grid editor's Bin section.
import type { CabinetInstance } from '@/src/lib/types'
import type { ResolverAction } from '@/src/lib/resolver/types'
import { applyBinDivisions } from '@/src/lib/binDivisions'
import { normalizeSection } from './InternalGridEditor'

// Returns false (and changes nothing) when the interior already has divisions.
export async function addBinDivisions(
  cabinet: CabinetInstance,
  action: Extract<ResolverAction, { type: 'add_bin_divisions' }>,
  onUpdate: (id: string, u: Partial<CabinetInstance>) => Promise<void>,
): Promise<boolean> {
  const tree = applyBinDivisions(normalizeSection((cabinet.internal_grid as { tree?: unknown } | null)?.tree), action.void_mm)
  if (!tree) return false
  await onUpdate(cabinet.id, {
    internal_grid: { ...(cabinet.internal_grid ?? {}), tree } as unknown as Record<string, unknown>,
    ...(cabinet.has_internal ? {} : { has_internal: true }),   // divisions are internal parts
  })
  return true
}
