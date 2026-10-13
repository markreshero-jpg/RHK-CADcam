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
import { resolveHinges }         from './resolveHinges'
import { checkHingeInnerDrawerClash } from './hingeClash'
import { shapeCaseParts, shapeShelves } from './resolveShapedCase'
import { resolveShapedFaces } from './resolveShapedFace'
import { shapedHardwareCtx, drawerOpening, drawerClashes } from './resolveShapedHardware'
import { resolveHandles } from './resolveHandles'

export function resolveCabinet(cab: CabinetInput): ResolvedCabinet {
  const allErrors:   ResolverError[] = []
  const allWarnings: ResolverError[] = []

  const r = cab.rules  // already merged from system → job → room → cabinet

  // ── 1. Case Module ────────────────────────────────────────────
  const { parts: rectCaseParts, errors: caseErrors } = cab.has_carcass
    ? resolveCaseParts(cab, r)
    : { parts: [], errors: [] }
  // Shaped cabinets (z_cabinet_shape): reshape the box carcass to the footprint.
  const caseParts = cab.footprint ? shapeCaseParts(cab, r, rectCaseParts, caseErrors) : rectCaseParts
  allErrors.push(...caseErrors)

  // ── 2. Toe Kick Module ────────────────────────────────────────
  const { parts: toekickParts, errors: toekickErrors } = cab.has_toekick
    ? resolveToekickParts(cab, r)
    : { parts: [], errors: [] }
  allErrors.push(...toekickErrors)

  // ── 3. Face Module ────────────────────────────────────────────
  // Resolve face first — internal module needs face zone Y positions
  const { rows, cols, zones, errors: faceErrors } = cab.has_face
    ? (cab.footprint ? resolveShapedFaces(cab, r) : resolveFace(cab, r))
    : { rows: [], cols: [], zones: [], errors: [] }
  allErrors.push(...faceErrors)
  // One grip per door / drawer front from the handle schedule (z_handles H1).
  resolveHandles(cab, zones)
  // Shaped cabinets (z_cabinet_shape Phase 3b): hinges + drawer boxes on every
  // facet, fitted to the footprint and built in each zone's square frame.
  const shapedHw = cab.footprint ? shapedHardwareCtx(cab) : null

  // ── 4. Internal Module ────────────────────────────────────────
  const { parts: rectInternalParts, slides: internalSlides, errors: internalErrors } = cab.has_internal
    ? resolveInternalParts(cab, r)
    : { parts: [], slides: [], errors: [] }
  const internalParts = cab.footprint ? shapeShelves(cab, rectInternalParts) : rectInternalParts
  allErrors.push(...internalErrors)

  // ── 5. Drawer Stacks ──────────────────────────────────────────
  // Resolves one drawer box + two slides per drawer_face zone
  const {
    stacks: drawerStacks,
    errors: drawerErrors,
    warnings: drawerWarnings,
  } = cab.has_face
    ? resolveDrawerStacks(cab, r, zones, shapedHw ? z => drawerOpening(shapedHw, z, r) : undefined)
    : { stacks: [], errors: [], warnings: [] }
  allErrors.push(...drawerErrors)
  allWarnings.push(...drawerWarnings)
  if (shapedHw) allWarnings.push(...drawerClashes(drawerStacks))

  // ── 6. Seam Joints ────────────────────────────────────────────
  // For each seam that has a joint assigned (per-cabinet or CM default) — carcase
  // part seams plus internal seams (shelf ↔ support, divider ↔ panel) — collect
  // the joint type operations ready for display and drilling export.
  const seamJoints = resolveJoints(cab, caseParts, internalParts)

  // ── 6b. Hinges ────────────────────────────────────────────────
  // One instance per physical hinge on each door zone. Count is driven by the
  // shop hinge_count_rules; mounting surface resolved against case/internal
  // parts; cup + plate drill positions computed. y_locked instances preserved.
  const hingeInstances = (cab.has_face && cab.hinge_hardware)
    ? resolveHinges(cab, zones, caseParts, internalParts, shapedHw, allWarnings)
    : []

  // ── 6c. Hinge ↔ inner-drawer clash ────────────────────────────
  // A hinge body protruding into the front of the interior can foul an inner
  // drawer at the same height. Reported as a warning (approximate geometry).
  allWarnings.push(...checkHingeInnerDrawerClash(hingeInstances, internalParts))

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
    hinge_instances: hingeInstances,
    errors:          allErrors,
    warnings:        allWarnings,
  }
}

// Re-export types for consumers
export * from './types'
export { mergeRules, resolveReveal } from './mergeRules'
