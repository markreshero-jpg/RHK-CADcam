import type { BenchtopConstruction, BenchtopPartRole } from '@/src/lib/types'

// Construction styles a build method can use. Shared by the resolver, the
// build method editor and the setup wizard so labels and role defaults agree.

export const CONSTRUCTIONS: { key: BenchtopConstruction; label: string; desc: string }[] = [
  { key: 'buildup_flat',     label: 'Built-up — flat strips',   desc: 'Board top with strips laid flat underneath (e.g. 16.5 + 16.5 = 33)' },
  { key: 'buildup_vertical', label: 'Built-up — vertical rails', desc: 'Board top with rails on edge underneath; rail height sets the build-up' },
  { key: 'solid',            label: 'Solid board',               desc: 'Single board cut to shape and edged — no build-up parts' },
  { key: 'outsourced',       label: 'Outsourced',                desc: 'Stone or laminate made by a supplier — measure + report only' },
]

export const isBuildUp = (c: BenchtopConstruction) => c === 'buildup_flat' || c === 'buildup_vertical'

// Roles that only make sense for build-up construction.
export const BUILDUP_ROLES: BenchtopPartRole[] = ['buildup_rail', 'buildup_cross_member']

// Starting role set when a method switches construction. The user can still
// tick extras (fascias, substrate) afterwards.
export function defaultRolesFor(c: BenchtopConstruction): BenchtopPartRole[] {
  switch (c) {
    case 'buildup_flat':
    case 'buildup_vertical': return ['worktop_panel', 'buildup_rail', 'buildup_cross_member']
    case 'solid':            return ['worktop_panel']
    case 'outsourced':       return ['stone_slab']
  }
}

// Roles after switching to construction `c`: core roles (worktop, stone,
// build-up) follow the construction; extras the user ticked (fascias,
// substrate) are kept.
export function rolesForConstruction(c: BenchtopConstruction, current: BenchtopPartRole[]): BenchtopPartRole[] {
  const core: BenchtopPartRole[] = ['worktop_panel', 'stone_slab', ...BUILDUP_ROLES]
  return [...defaultRolesFor(c), ...current.filter(r => !core.includes(r))]
}

// Fallback cross member spacing when a build-up method leaves it blank.
export const DEFAULT_CROSS_MEMBER_SPACING = 600

// Clear gap kept between a cross member and a sink / cooktop cutout it was
// moved off (room for the sink's clips and the cutter).
export const CUTOUT_CLEARANCE = 10

/**
 * Cross-member centres along the piece (part x), evenly spaced over
 * [setBack, setBack + innerRun], moved clear of the cutouts' x-spans: a member
 * whose band (centre ± width / 2) lands in a cutout moves across to the
 * nearer side that is clear by CUTOUT_CLEARANCE and still between the end
 * members. One with no room either side, or that would land on a member
 * already placed, is left out (the end member / neighbour carries that edge).
 */
export function crossMemberPositions(
  innerRun: number, setBack: number, spacing: number, width: number,
  cutouts: { x0: number; x1: number }[] = [],
): number[] {
  const count = Math.max(0, Math.ceil(innerRun / spacing) - 1)
  const half = width / 2
  const lo = setBack + half, hi = setBack + innerRun - half
  // Merge cutout spans (grown by the clearance) that touch or overlap.
  const spans = cutouts.map(c => ({ x0: c.x0 - CUTOUT_CLEARANCE, x1: c.x1 + CUTOUT_CLEARANCE }))
    .sort((a, b) => a.x0 - b.x0)
    .reduce<{ x0: number; x1: number }[]>((out, s) => {
      const last = out[out.length - 1]
      if (last && s.x0 <= last.x1) last.x1 = Math.max(last.x1, s.x1)
      else out.push({ ...s })
      return out
    }, [])
  const hits = (c: number) => spans.find(s => c + half > s.x0 + 1e-6 && c - half < s.x1 - 1e-6)
  const out: number[] = []
  for (let k = 1; k <= count; k++) {
    let c = setBack + (innerRun * k) / (count + 1)
    const s = hits(c)
    if (s) {
      const opts = [s.x0 - half, s.x1 + half].filter(x => x >= lo - 1e-6 && x <= hi + 1e-6 && !hits(x))
      if (!opts.length) continue
      c = opts.reduce((a, b) => (Math.abs(b - c) < Math.abs(a - c) ? b : a))
    }
    if (out.some(o => Math.abs(o - c) < width)) continue
    out.push(c)
  }
  return out
}
