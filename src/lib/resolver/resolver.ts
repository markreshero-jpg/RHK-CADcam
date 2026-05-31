// ============================================================
// Cabinet Formula Resolver — Main Entry Point
// Schema v0.4
//
// Usage:
//   import { resolveCabinet } from './resolver'
//   const result = resolveCabinet(cabinetInput)
//   // result.case_parts, result.toekick_parts, etc. ready to write to Supabase
// ============================================================

import { CabinetInput, ResolvedCabinet, ResolverError } from './types'
import { resolveCaseParts }      from './resolveCase'
import { resolveToekickParts }   from './resolveToekick'
import { resolveInternalParts }  from './resolveInternal'
import { resolveFace }           from './resolveFace'
import { resolveDrawerStacks }   from './resolveDrawerStack'
import { resolveJoints }         from './resolveJoints'

export function resolveCabinet(cab: CabinetInput): ResolvedCabinet {
  const allErrors:   ResolverError[] = []
  const allWarnings: ResolverError[] = []

  const r = cab.rules  // already merged from system → job → room → cabinet

  // ── 1. Case Module ────────────────────────────────────────────
  const { parts: caseParts, errors: caseErrors } = cab.has_carcass
    ? resolveCaseParts(cab, r)
    : { parts: [], errors: [] }
  allErrors.push(...caseErrors)

  // ── 2. Toe Kick Module ────────────────────────────────────────
  const { parts: toekickParts, errors: toekickErrors } = cab.has_toekick
    ? resolveToekickParts(cab, r)
    : { parts: [], errors: [] }
  allErrors.push(...toekickErrors)

  // ── 3. Face Module ────────────────────────────────────────────
  // Resolve face first — internal module needs face zone Y positions
  const { rows, cols, zones, errors: faceErrors } = cab.has_face
    ? resolveFace(cab, r)
    : { rows: [], cols: [], zones: [], errors: [] }
  allErrors.push(...faceErrors)

  // ── 4. Internal Module ────────────────────────────────────────
  const { parts: internalParts, slides: internalSlides, errors: internalErrors } = cab.has_internal
    ? resolveInternalParts(cab, r)
    : { parts: [], slides: [], errors: [] }
  allErrors.push(...internalErrors)

  // ── 5. Drawer Stacks ──────────────────────────────────────────
  // Resolves one drawer box + two slides per drawer_face zone
  const drawerStacks = cab.has_face
    ? resolveDrawerStacks(cab, r, zones)
    : []

  // ── 6. Seam Joints ────────────────────────────────────────────
  // For each case-part seam that has a joint assigned (per-cabinet or CM default),
  // collect the joint type operations ready for display and eventual drilling export.
  const seamJoints = resolveJoints(cab, caseParts)

  // ── 7. Warnings ───────────────────────────────────────────────
  // Non-fatal checks
  if (cab.DX > 1200) {
    allWarnings.push({
      code: 'WIDE_CABINET',
      message: `Cabinet width ${cab.DX}mm exceeds 1200mm — consider a partition`,
    })
  }

  return {
    cabinet_id:      cab.id,
    case_parts:      caseParts,
    toekick_parts:   toekickParts,
    internal_parts:  internalParts,
    internal_slides: internalSlides,
    face_rows:       rows,
    face_cols:       cols,
    face_zones:      zones,
    drawer_stacks:   drawerStacks,
    seam_joints:     seamJoints,
    errors:          allErrors,
    warnings:        allWarnings,
  }
}

// Re-export types for consumers
export * from './types'
export { mergeRules, resolveReveal } from './mergeRules'
