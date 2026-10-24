// ============================================================
// Cabinet Formula Resolver — Main Entry Point
// Schema v0.4
//
// Usage:
//   import { resolveCabinet } from './resolver'
//   const result = resolveCabinet(cabinetInput)
//   // result.case_parts, result.toekick_parts, etc. ready to write to Supabase
// ============================================================

import { CabinetInput, DeclaredSeam, ResolvedCabinet, ResolverError } from './types'
import { resolveCaseParts }      from './resolveCase'
import { resolveToekickParts }   from './resolveToekick'
import { resolveInternalParts }  from './resolveInternal'
import { resolveFace }           from './resolveFace'
import { resolveDrawerStacks, treeHasDrawerFittings } from './resolveDrawerStack'
import { resolveJoints }         from './resolveJoints'
import { resolveHinges }         from './resolveHinges'
import { checkHingeFixedShelfClash, checkHingeInnerDrawerClash, checkHingeShelfHoleClash } from './hingeClash'
import { shapeCaseParts, shapeShelves } from './resolveShapedCase'
import { resolveShapedFaces } from './resolveShapedFace'
import { shapedHardwareCtx, drawerOpening, drawerClashes } from './resolveShapedHardware'
import { resolveHandles } from './resolveHandles'
import { fingerRails, fingerRailParts, notchPanels, pushFrontRailBack, type FingerRail } from './resolveFingerRails'
import { shapedFingerRails } from './resolveShapedFingerRails'
import { resolveFillerCleats } from './resolveFillerCleats'
import { resolveBulkhead } from './resolveBulkhead'
import { resolveCurvedEnd } from './resolveCurvedEnd'
import { resolveFloatShelf } from './resolveFloatShelf'
import { resolveBackPanel } from './resolveBackPanel'

export function resolveCabinet(cab: CabinetInput): ResolvedCabinet {
  const allErrors:   ResolverError[] = []
  const allWarnings: ResolverError[] = []

  const r = cab.rules  // already merged from system → job → room → cabinet

  // ── 1. Case Module ────────────────────────────────────────────
  const { parts: rectCaseParts, errors: caseErrors } = cab.has_carcass
    ? resolveCaseParts(cab, r)
    : { parts: [], errors: [] }
  // Shaped cabinets (z_cabinet_shape): reshape the box carcass to the footprint.
  // A curved end's footprint is only its plan outline — resolveCurvedEnd builds every part.
  const caseParts = cab.footprint && !cab.curved_end ? shapeCaseParts(cab, r, rectCaseParts, caseErrors) : rectCaseParts
  allErrors.push(...caseErrors)

  // ── 2. Toe Kick Module ────────────────────────────────────────
  // A floating cabinet (z_floating) never builds a kick, whatever has_toekick says;
  // a curved end builds its own curved kick (resolveCurvedEnd, z_curved_end C5).
  const { parts: toekickParts, errors: toekickErrors } = cab.has_toekick && !r.FLOAT && !cab.curved_end
    ? resolveToekickParts(cab, r)
    : { parts: [], errors: [] }
  allErrors.push(...toekickErrors)

  // ── 3. Face Module ────────────────────────────────────────────
  // Resolve face first — internal module needs face zone Y positions
  const { rows, cols, zones, open_zones: openZones = [], errors: faceErrors } = cab.has_face
    ? (cab.footprint ? resolveShapedFaces(cab, r) : resolveFace(cab, r))
    : { rows: [], cols: [], zones: [], errors: [] }
  allErrors.push(...faceErrors)
  // Shaped fronts keep facet zones in their own frames — open cells reported
  // for the primary box front only.
  const openCells = cab.footprint ? [] : openZones
  // One grip per door / drawer front from the handle schedule (z_handles H1).
  resolveHandles(cab, zones)
  // Face fillers with the support carcass off: return cleats (z_angled_filler).
  if (cab.footprint && !cab.has_carcass) caseParts.push(...resolveFillerCleats(cab, r, zones))
  // Bulkheads (z_bulkhead): fascia, returns + fixing cleat. A curved bulkhead
  // (BHCRVFIXP, z_curved_end C7) is a curved end hung like a bulkhead —
  // resolveCurvedEnd builds its parts and its split rail.
  if (cab.bulkhead && !cab.curved_end) caseParts.push(...resolveBulkhead(cab, r))
  // Floating shelves (z_floating_shelf): glued-up boards / strips + hand-cut cleats.
  if (cab.float_shelf) caseParts.push(...resolveFloatShelf(cab))
  // Island back panels (z_island_back_panel): equal sheet-width pieces of exposed board.
  if (cab.back_panel) caseParts.push(...resolveBackPanel(cab, r))
  // Curved fixed-panel cabinets (z_curved_end): face board, formers, panels, blocks.
  const declaredSeams: DeclaredSeam[] = []
  if (cab.curved_end) {
    const crv = resolveCurvedEnd(cab)
    caseParts.push(...crv.parts)
    declaredSeams.push(...crv.seams)
    allErrors.push(...crv.errors)
    allWarnings.push(...crv.warnings)
  }
  // Shaped cabinets (z_cabinet_shape Phase 3b): hinges + drawer boxes on every
  // facet, fitted to the footprint and built in each zone's square frame.
  const shapedHw = cab.footprint ? shapedHardwareCtx(cab) : null

  // ── 4. Internal Module ────────────────────────────────────────
  let internal = cab.has_internal
    ? resolveInternalParts(cab, r, cab.footprint ? [] : zones, { openZones: openCells })
    : { parts: [], slides: [], errors: [], autoDouble: undefined }
  // A pull-out bin on the floor (z_bin_cabinet B3): inner drawers / pull-outs
  // start above it. The bin pick needs the dividers, so plan it off the first
  // pass, then re-run the interior with the fittings floor raised.
  if (internal.parts.length && cab.has_face && !cab.footprint && treeHasDrawerFittings(cab.internal_tree)) {
    const divs = internal.parts.filter(p => p.part_type === 'divider')
    const planRails = cab.has_carcass ? fingerRails(cab, r, zones, caseParts, divs).rails : []
    const binTop = Math.max(-Infinity, ...resolveDrawerStacks(cab, r, zones, undefined, divs, planRails)
      .stacks.filter(s => s.drawer_type === 'bin').map(s => s.box_Y + s.box_height))
    if (Number.isFinite(binTop)) internal = resolveInternalParts(cab, r, zones, { fittingFloorY: binTop + r.BINGAP, openZones: openCells })
  }
  const { parts: rectInternalParts, slides: internalSlides, errors: internalErrors, autoDouble } = internal
  const internalParts = cab.footprint ? shapeShelves(cab, r, rectInternalParts) : rectInternalParts
  allErrors.push(...internalErrors)

  // Backing rail behind each finger gap, per column between the sides and
  // internal dividers, notched into every panel it passes through (z_handles
  // H6 / H5b). After the internals, so the rails know where the divisions are.
  // Shaped cabinets: per front facet (resolveShapedFingerRails).
  let backingRails: FingerRail[] = []
  if (cab.has_carcass && cab.has_face && cab.footprint) {
    caseParts.push(...shapedFingerRails(cab, r, zones, caseParts))
  } else if (cab.has_carcass && cab.has_face) {
    const dividers = internalParts.filter(p => p.part_type === 'divider')
    const { rails, warnings: railWarnings } = fingerRails(cab, r, zones, caseParts, dividers)
    backingRails = rails
    notchPanels([...caseParts.filter(p => p.part_key === 'left_side' || p.part_key === 'right_side'), ...dividers], rails, r.RAILCUT)
    pushFrontRailBack(caseParts, rails)
    caseParts.push(...fingerRailParts(cab, r, rails))
    allWarnings.push(...railWarnings)
  }

  // ── 5. Drawer Stacks ──────────────────────────────────────────
  // Resolves one drawer box + two slides per drawer_face zone
  const {
    stacks: drawerStacks,
    errors: drawerErrors,
    warnings: drawerWarnings,
  } = cab.has_face
    ? resolveDrawerStacks(cab, r, zones, shapedHw ? z => drawerOpening(shapedHw, z, r) : undefined,
        internalParts.filter(p => p.part_type === 'divider'), backingRails)
    : { stacks: [], errors: [], warnings: [] }
  allErrors.push(...drawerErrors)
  allWarnings.push(...drawerWarnings)
  if (shapedHw) allWarnings.push(...drawerClashes(drawerStacks))

  // ── 6. Seam Joints ────────────────────────────────────────────
  // For each seam that has a joint assigned (per-cabinet or CM default) — carcase
  // part seams plus internal seams (shelf ↔ support, divider ↔ panel) — collect
  // the joint type operations ready for display and drilling export.
  const seamJoints = resolveJoints(cab, caseParts, internalParts, declaredSeams)

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

  // ── 6d. Hinge plate ↔ adj-shelf hole clash ────────────────────
  // A plate over a shelf-pin hole can't be screwed on — an error (Mark).
  allErrors.push(...checkHingeShelfHoleClash(hingeInstances, caseParts, internalParts, seamJoints))
  allErrors.push(...checkHingeFixedShelfClash(hingeInstances, internalParts))

  // ── 7. Warnings ───────────────────────────────────────────────
  // Non-fatal checks
  if (cab.has_carcass && cab.DX > 1200) {   // panels (BUP / WUP, island backs) run long
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
    ...(autoDouble ? { auto_double_dividers: autoDouble } : {}),
    face_rows:       rows,
    face_cols:       cols,
    face_zones:      zones,
    ...(openCells.length ? { open_zones: openCells } : {}),
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
