// ============================================================
// Automatic double divider for drawers side by side (z_dividers V-D3 / V4).
// When a face-grid edit puts drawer fronts side by side at a new column
// boundary, the cabinet needs a divider there for the runners. This works out
// what to do with the interior tree; the resolver then makes an automatic
// divider on the seam double (resolveInternal: autoDouble).
// ============================================================

import type { FaceGridInput, Section, SectionChild } from '@/src/lib/resolver/types'

/** Column boundaries (c = between col c and c + 1) with drawer fronts on both
 *  sides in at least one row. `full` = drawers on both sides in every row. */
export function drawerBoundaries(grid: FaceGridInput): Map<number, { full: boolean }> {
  const out = new Map<number, { full: boolean }>()
  const at = (r: number, c: number) => grid.zones.find(z => z.row_index === r && z.col_index === c)?.face_type
  for (let c = 0; c < grid.cols.length - 1; c++) {
    const rows = grid.rows.map(r => at(r.row_index, c) === 'drawer_face' && at(r.row_index, c + 1) === 'drawer_face')
    if (rows.some(Boolean)) out.set(c, { full: rows.every(Boolean) })
  }
  return out
}

export type AutoDividerOutcome =
  | { kind: 'created'; tree: Section }   // new double divider(s) added to the tree
  | { kind: 'auto' }                     // a divider already on the seam goes double
  | { kind: 'single' }                   // a divider on the seam the user set to single — leave it
  | { kind: 'manual' }                   // can't place it automatically: ask the user

export interface SeamGeometry {
  seamX:     Map<number, number>   // boundary → centre of the gap between the fronts (cabinet X)
  intLeft:   number                // interior left face (cabinet X)
  T:         number                // divider board thickness
  equalCols: boolean               // every column auto-sized (unlocked) → equal bays line up on their own
  dividers:  { x: number; key: string; child: SectionChild }[]   // root-level dividers' centre X
}

const NEAR = 30

/** What to do for the boundaries that just gained drawers side by side. */
export function planAutoDivider(tree: Section, boundaries: number[], nCols: number, geo: SeamGeometry, full: (c: number) => boolean): AutoDividerOutcome | null {
  if (!boundaries.length) return null

  // An open interior and drawers the full height: split it at each boundary.
  if (tree.type === 'open') {
    if (!boundaries.every(full)) return { kind: 'manual' }
    const cuts = [...boundaries].sort((a, b) => a - b)
    // Equal columns cut at every boundary: equal bays put each double divider
    // on its seam. Otherwise lock the bays to the seams.
    const sized = !(geo.equalCols && cuts.length === nCols - 1)
    if (sized && cuts.some(c => geo.seamX.get(c) == null)) return { kind: 'manual' }
    const children: SectionChild[] = []
    let from = geo.intLeft
    cuts.forEach(c => {
      const left = geo.seamX.get(c)! - geo.T   // a double's left face
      children.push({ ...(sized ? { size: Math.round(left - from) } : {}), section: structuredClone(tree) })
      from = left + 2 * geo.T
    })
    children.push({ section: structuredClone(tree) })
    return { kind: 'created', tree: { type: 'vsplit', children } }
  }

  // A divider already near each seam: automatic → double, explicit single → keep.
  const near = boundaries.map(c => {
    const x = geo.seamX.get(c)
    return x == null ? undefined : geo.dividers.find(d => Math.abs(d.x - x) <= NEAR + geo.T)
  })
  if (near.some(d => !d)) return { kind: 'manual' }
  return near.every(d => d!.child.divider === 'single') ? { kind: 'single' } : { kind: 'auto' }
}

export const AUTO_DIVIDER_NOTE: Record<AutoDividerOutcome['kind'], string | null> = {
  created: 'Drawers side by side: a double divider has been added between them. Each drawer needs its own panel for its runners (and its finger-pull rail). Click the divider in the Internals view to switch it back to single.',
  auto:    'Drawers side by side: the divider between them is now a double divider. Each drawer needs its own panel for its runners (and its finger-pull rail). Click the divider in the Internals view to switch it back to single.',
  single:  null,
  manual:  'Drawers side by side need a divider between them for the runners. Add one in the Internals view at the gap between the drawers. It becomes a double divider automatically.',
}
