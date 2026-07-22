// ============================================================================
// Part Editor — central operation enums (Phase 2 §3, §10).
// SINGLE SOURCE OF TRUTH. Import these everywhere (editor, validation,
// optimiser) instead of re-declaring string lists — the old free-text drift
// (e.g. pocket appearing as both a type and an action, a stray 'saw') is what
// this module removes.
// ============================================================================

/**
 * The verb the machine performs. Read by the optimiser (gcode.ts / drills.ts /
 * seamDrillSync) — operation_type is NEVER migrated or renamed.
 *   drill  — a bore; single or a repeated pattern (repeat_count/spacing/axis)
 *   route  — cutter follows a path or clears an area; behaviour set by the action
 *   groove — a straight-line slot; the TOOL drives the profile (§3.3)
 * 'saw' and pocket-as-a-type were removed in Phase 2 (pocket → route + action=pocket).
 */
export const OPERATION_TYPES = ['drill', 'route', 'groove'] as const
export type OperationType = typeof OPERATION_TYPES[number]

/**
 * Route strategy — only meaningful for operation_type='route' (§3.2).
 *   outline — cut along a boundary (on/inside/outside)
 *   pocket  — clear the area within a boundary (fill strategy: raster/offset)
 *   profile — edge profiling
 *   square_off — corner squaring
 */
export const ROUTE_ACTIONS = ['outline', 'pocket', 'profile', 'square_off'] as const
export type RouteAction = typeof ROUTE_ACTIONS[number]

/**
 * Depth qualifier — ORTHOGONAL to the route action (§3.2). A route can be
 * action=pocket AND through at the same time, so this is NOT an operation_action
 * value (that conflation is what Phase 2 removes). Defined here so the editor,
 * validation and G-code layer agree; its dedicated storage + inspector control
 * land with the strategy fields in M8 (§3.4). Until then no rows carry it.
 */
export const DEPTH_MODES = ['through', 'stopped'] as const
export type DepthMode = typeof DEPTH_MODES[number]

/**
 * Operation role — the ONE switch that decides firing behaviour (§2).
 *   local  — acts on the local part only; never fires (Phase 1 default).
 *   master — fires a materialised slave onto coincident part(s); params hand-set.
 *   joint  — like master, but params come from the Joints library (snapshot, §6).
 * Every Phase 1 op is 'local'.
 */
export const OPERATION_ROLES = ['local', 'master', 'joint'] as const
export type OperationRole = typeof OPERATION_ROLES[number]

/**
 * Roles that project a slave via the firing engine (§5). is_master is kept as a
 * denormalised mirror of this for the firing query, but operation_role is the
 * authoritative source.
 */
export const isFiringRole = (role: string | null | undefined): boolean =>
  role === 'master' || role === 'joint'
