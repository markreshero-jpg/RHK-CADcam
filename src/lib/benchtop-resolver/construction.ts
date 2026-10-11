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
