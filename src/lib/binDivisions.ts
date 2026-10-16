// "Add divisions" for a bin that is too narrow for its cabinet (z_bin_cabinet
// B4, B-D4): a division each side so the bin sits central. The interior becomes
// void | bin column | void; the bin column keeps whatever was there (e.g. the
// BBIN+I1 inner drawer), the voids are locked to `voidMm` so the bin column
// fills the rest — the clear width the resolver asked for.

import type { Section } from './resolver/types'

// null when the interior already has divisions across it (the user sets those
// up in the Interior tab) or the voids would have no width.
export function applyBinDivisions(tree: Section | null | undefined, voidMm: number): Section | null {
  if (tree?.type === 'vsplit') return null
  if (!(voidMm > 0)) return null
  const v = Math.round(voidMm * 10) / 10
  return {
    type: 'vsplit',
    children: [
      { size: v, divider: 'single', section: { type: 'open', fittings: [] } },
      { divider: 'single', section: tree ?? { type: 'open', fittings: [] } },
      { size: v, section: { type: 'open', fittings: [] } },
    ],
  }
}
