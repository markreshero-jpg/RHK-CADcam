// ============================================================
// Hinge Module Resolver (schema v0.6)
// ------------------------------------------------------------
// For each door face zone, produce one ResolvedHingeInstance per physical
// hinge:
//   • count + position from the shop hinge_count_rules (9.1)
//   • mounting surface resolved against case / internal parts (9.2)
//   • cup drills (door back face) + plate drills (mounting surface) (9.3)
//
// y_locked instances are preserved: their stored y_position / edge / plate /
// mounting_surface override the recomputed values. Persisted identity is the
// stable (row_index, col_index, sort_order) tuple — see persistHinges.
//
// Geometry conventions (cabinet origin = bottom-left-back; +Z = front):
//   Door zone: X = left edge, Y = bottom, Z = front face plane.
//              DX = height (cabinet-Y extent), DY = width (cabinet-X extent),
//              DZ = panel thickness (cabinet-Z extent).
//
// Side-hung (hinge_edge left/right) is the primary, fully-modelled case:
// hinges distribute up the door height, cup is cup_x_from_edge_mm in from the
// hinged vertical edge, plate fires on the carcass gable.
//
// Pivot (hinge_edge top/bottom) is provisional: hinges distribute across the
// door width at a constant height line cup_x_from_edge_mm in from the hinged
// horizontal edge; plate fires on a snapped shelf or the top/bottom panel. The
// count rule + insets are interpreted along the distribution axis.
// ============================================================

import {
  CabinetInput, ResolvedFaceZone, ResolvedCasePart, ResolvedInternalPart,
  ResolvedHingeInstance, ResolvedHingeDrill, ResolvedHingeMountTarget,
  HingeRuleInput, HingeHardwareInput, HingePlateInput, ExistingHingeInput,
  HingeBoreHole, ResolverError,
} from './types'
import {
  hingeMount, gridForFacet, zoneTurn, piePairs, type ShapedHardwareCtx, type ShapedMount,
} from './resolveShapedHardware'
import { turnDrill } from './hardwareTurn'
import { zoneKey } from '../cabinetShape/partKeys'

// Flatten every hinge's cup + plate drills into one list for overlay rendering.
export function cabinetHingeDrills(hinges: ResolvedHingeInstance[]): ResolvedHingeDrill[] {
  const out: ResolvedHingeDrill[] = []
  // A turned facet door's drills are zone-frame — return cabinet coords. A
  // bi-fold's plate drills are in the trailing door's frame (plate_turn).
  for (const h of hinges) {
    out.push(...h.cup_drills.map(d => turnDrill(h.turn, d)))
    out.push(...h.plate_drills.map(d => turnDrill(h.pie === 'bifold' ? h.plate_turn : h.turn, d)))
  }
  return out
}

const DEFAULT_RULES: HingeRuleInput[] = [
  { max_height_mm: 900,  hinge_count: 2, top_inset_mm: 100, bottom_inset_mm: 100 },
  { max_height_mm: 1800, hinge_count: 3, top_inset_mm: 100, bottom_inset_mm: 100 },
  { max_height_mm: 2400, hinge_count: 4, top_inset_mm: 100, bottom_inset_mm: 100 },
  { max_height_mm: 3000, hinge_count: 5, top_inset_mm: 100, bottom_inset_mm: 100 },
]

interface RulePick { count: number; topInset: number; bottomInset: number }

// Walk rules ASC by max_height; return the first whose bound covers `span`.
// Falls back to the largest rule when the span exceeds every bound.
function pickRule(rules: HingeRuleInput[], span: number): RulePick {
  const sorted = [...rules].sort((a, b) => a.max_height_mm - b.max_height_mm)
  const hit = sorted.find(r => span <= r.max_height_mm) ?? sorted[sorted.length - 1]
  return { count: hit.hinge_count, topInset: hit.top_inset_mm, bottomInset: hit.bottom_inset_mm }
}

// Positions along the hinged edge, measured from the START of the span
// (door bottom for side-hung; door left for pivot). sort_order 0 = topmost
// (side-hung) or leftmost (pivot): we return them START→END then label.
function positions(count: number, span: number, topInset: number, bottomInset: number): number[] {
  // For the distribution axis: "top" = far end (span - topInset),
  // "bottom" = near end (bottomInset).
  const far  = span - topInset
  const near = bottomInset
  if (count <= 1) return [near]
  if (count === 2) return [far, near]
  if (count === 3) return [far, span / 2, near]
  // count >= 4: ends pinned, middles equally spaced between them
  const out = [far]
  const gaps = count - 1
  const step = (near - far) / gaps // negative
  for (let i = 1; i < count - 1; i++) out.push(far + step * i)
  out.push(near)
  return out
}

// Shaped cabinets: the hinge built for the angle a door hangs at. Within
// 2.5° counts as a match; otherwise the default hinge, flagged unmatched.
function pickHinge(cab: CabinetInput, angle: number): { hw: HingeHardwareInput; matched: boolean } {
  const hw = cab.hinge_hardware!
  const pool = [hw, ...(cab.angled_hinges ?? [])]
  let best: HingeHardwareInput | null = null, bestD = Infinity
  for (const h of pool) {
    const d = Math.abs((h.mount_angle_deg ?? 0) - angle)
    if (d < bestD) { bestD = d; best = h }
  }
  return bestD <= 2.5 && best ? { hw: best, matched: true } : { hw, matched: false }
}

// Bi-fold hinges sit on the lead door after its own hinges; a fixed base keeps
// their identity stable when the lead door's hinge count changes.
const BIFOLD_SORT = 100

export function resolveHinges(
  cab: CabinetInput,
  zones: ResolvedFaceZone[],
  caseParts: ResolvedCasePart[],
  internalParts: ResolvedInternalPart[],
  // Shaped cabinets (z_cabinet_shape Phase 3b): hinges on every facet, mounted
  // on the real adjacent panel; drills are in each zone's square frame.
  shaped?: ShapedHardwareCtx | null,
  warnings?: ResolverError[],
): ResolvedHingeInstance[] {
  const hw = cab.hinge_hardware
  if (!hw) return []
  const plate = cab.hinge_plate ?? null
  const rules = (cab.hinge_count_rules && cab.hinge_count_rules.length > 0)
    ? cab.hinge_count_rules
    : DEFAULT_RULES

  // Index existing locked instances by identity for preservation.
  const lockedByKey = new Map<string, ExistingHingeInput>()
  for (const e of cab.existing_hinges ?? []) {
    if (e.y_locked) lockedByKey.set(`${e.facet ?? ''}:${e.row_index}:${e.col_index}:${e.sort_order}`, e)
  }

  const out: ResolvedHingeInstance[] = []

  // Pie-corner bi-fold pairs (z_cabinet_shape L2).
  const pies = shaped ? piePairs(shaped, zones) : null
  const bifold = cab.pie_hinges?.bifold

  for (const z of zones) {
    if (z.face_type !== 'door') continue
    const pie = pies?.get(zoneKey(z))
    // The trailing door has no cups: the lead door's bi-fold carries it.
    if (pie?.role === 'trailing') continue
    // A sliding bi-fold's leading door rides its tracks (z_bifold_slide).
    if (z.bifold_role === 'leading') continue

    const doorH = z.DY   // cabinet-Y extent (height)
    const doorW = z.DX   // cabinet-X extent (width)
    const edge: 'left' | 'right' | 'top' | 'bottom' =
      (z.hinge_side as 'left' | 'right' | 'top' | 'bottom' | undefined) ?? hw.default_hinge_edge

    const sideHung = edge === 'left' || edge === 'right'
    const span = sideHung ? doorH : doorW
    const doorRef = `${z.facet ? `${z.facet} ` : ''}[${z.row_index},${z.col_index}]`

    // Shaped cabinet, side-hung: the panel at that end of the facet decides the
    // plate position and the hinge angle.
    let mount: ShapedMount | null = null
    let doorHw = hw
    let angleMatched: boolean | undefined
    if (shaped && sideHung) {
      const m = hingeMount(cab, shaped, z, edge, plate?.plate_offset_mm ?? 0, caseParts)
      if ('error' in m) {
        warnings?.push({ code: 'HINGE_NO_PANEL', message: `Door ${doorRef} hinges ${edge}, but ${m.error} — hinge it the other way or add a panel`, part: 'hinge' })
      } else {
        mount = m.mount
        if (pie?.role === 'lead') {
          if (cab.pie_hinges?.lead) doorHw = cab.pie_hinges.lead
          else warnings?.push({ code: 'PIE_HINGE_MISSING', message: `Door ${doorRef} leads a bi-fold pair, but no hinge in the library has Pie role "lead" (the 170°) — using the default hinge`, part: 'hinge' })
        }
        if (mount.angleDeg) {
          const pick = pickHinge(cab, mount.angleDeg)
          doorHw = pick.hw
          angleMatched = pick.matched
          if (!pick.matched) warnings?.push({
            code: 'HINGE_ANGLE_MISSING',
            message: `Door ${doorRef} hangs on a panel at ${Math.round(90 + mount.angleDeg)}° — needs a ${mount.angleDeg > 0 ? '+' : ''}${mount.angleDeg}° hinge; none in the hinge library (set Mount° on one)`,
            part: 'hinge',
          })
        }
      }
    }

    // Manual per-door hinge positions (from the face grid) override the shop
    // rules entirely — the user has placed these hinges explicitly.
    // A defined `hinges` array (even empty) is a manual override; undefined = auto.
    const manual = gridForFacet(cab, z.facet)?.zones
      .find(fz => fz.row_index === z.row_index && fz.col_index === z.col_index)?.hinges
    const useManual = Array.isArray(manual)

    if (pie?.role === 'lead' && !bifold) warnings?.push({
      code: 'PIE_HINGE_MISSING',
      message: `Door ${doorRef} leads a bi-fold pair, but no hinge in the library has Pie role "bifold" — no bi-fold hinges or trailing-door holes`,
      part: 'hinge',
    })

    let pos: number[]
    if (useManual) {
      pos = manual as number[]
    } else {
      const { count, topInset, bottomInset } = pickRule(rules, span)
      pos = positions(count, span, topInset, bottomInset)
    }

    pos.forEach((alongPos, i) => {
      const key = `${z.facet ?? ''}:${z.row_index}:${z.col_index}:${i}`
      const locked = useManual ? undefined : lockedByKey.get(key)

      // Manual hinges use their given position (locked). Otherwise locked
      // instances keep their stored placement & overrides.
      const along        = locked ? locked.y_position_mm : alongPos
      const yLocked      = useManual ? true : !!locked
      const hingeEdge    = locked ? locked.hinge_edge : edge
      const mountSurface = locked ? locked.mounting_surface : 'auto'
      const snapTol      = locked ? locked.shelf_snap_tolerance_mm : 3
      const plateId      = locked ? locked.hinge_plate_id : (plate?.id ?? null)

      // Cup centre in cabinet coords.
      let cupX: number, cupY: number
      if (hingeEdge === 'left')       { cupX = z.X + doorHw.cup_x_from_edge_mm;          cupY = z.Y + along }
      else if (hingeEdge === 'right') { cupX = z.X + doorW - doorHw.cup_x_from_edge_mm;  cupY = z.Y + along }
      else if (hingeEdge === 'top')   { cupX = z.X + along;  cupY = z.Y + doorH - doorHw.cup_x_from_edge_mm }
      else                            { cupX = z.X + along;  cupY = z.Y + doorHw.cup_x_from_edge_mm } // bottom

      // z.Z is already the door BACK (mounting) face — resolveFaceZ returns the
      // back plane for both overlay (cabinetDZ + buf) and inset doors. The cup is
      // bored into that face going forward (+Z) into the door.
      const backZ = z.Z

      const cupDrills = buildCupDrills(doorHw, cupX, cupY, backZ, hingeEdge)

      // Resolve the mounting surface (where the plate fires). A shaped
      // cabinet's door uses the panel at its facet end (none → no plate).
      let target: ResolvedHingeMountTarget | null
      let plateDrills: ResolvedHingeDrill[]
      if (shaped && sideHung) {
        target = mount?.part_key ? { table: 'case_parts', part_key: mount.part_key as ResolvedCasePart['part_key'] } : null
        plateDrills = (plate && mount && target) ? buildAngledPlateDrills(plate, mount, cupY) : []
      } else {
        const res = resolveMount(hingeEdge, mountSurface, snapTol, cupY, z, caseParts, internalParts, plate)
        target = res.target
        plateDrills = (plate && target) ? buildPlateDrills(plate, res.mountX, res.mountY, res.mountZ, res.mountAxis) : []
      }

      out.push({
        ...(z.facet ? { facet: z.facet } : {}),
        ...(shaped && z.AY ? { turn: zoneTurn(z) } : {}),
        ...(mount?.angleDeg ? { mount_angle_deg: mount.angleDeg, angle_matched: angleMatched } : {}),
        row_index:  z.row_index,
        col_index:  z.col_index,
        sort_order: i,
        hinge_edge: hingeEdge,
        y_position_mm: along,
        y_locked: yLocked,
        mounting_surface: mountSurface,
        shelf_snap_tolerance_mm: snapTol,
        ...(pie?.role === 'lead' ? { pie: 'lead' as const } : {}),
        ...(doorHw.name ? { hinge_name: doorHw.name } : {}),
        hinge_hardware_id: doorHw.id,
        hinge_plate_id: plateId,
        mount_target: target,
        cup_drills: cupDrills,
        plate_drills: plateDrills,
        model_url:       doorHw.model_combined_url,
        model_scale:     doorHw.model_combined_scale,
        bore_to_door_mm: doorHw.bore_centre_to_door_face_mm,
        open_angle_deg:  doorHw.open_angle_deg,
        arm_fold_fraction: doorHw.model_arm_fold_fraction,
        cup_x_from_edge_mm: doorHw.cup_x_from_edge_mm,
        plate_model_url:   plate?.model_plate_url ?? null,
        plate_model_scale: plate?.model_plate_scale ?? 1,
        plate_anchor_x:    plate?.model_plate_anchor_x ?? 0,
        plate_anchor_y:    plate?.model_plate_anchor_y ?? 0,
        plate_anchor_z:    plate?.model_plate_anchor_z ?? 0,
      })

      // Bi-fold at the same height: cup on the lead door's pie edge, plate
      // holes on the trailing door's back face in that door's own frame.
      if (pie?.role === 'lead' && bifold && sideHung) {
        const t = pie.other
        const tEdge = t.hinge_side as 'left' | 'right'
        const bx = pie.pieEdge === 'left' ? z.X + bifold.cup_x_from_edge_mm : z.X + doorW - bifold.cup_x_from_edge_mm
        out.push({
          ...(z.facet ? { facet: z.facet } : {}),
          ...(z.AY ? { turn: zoneTurn(z) } : {}),
          ...(t.AY ? { plate_turn: zoneTurn(t) } : {}),
          pie: 'bifold',
          ...(bifold.name ? { hinge_name: bifold.name } : {}),
          row_index:  z.row_index,
          col_index:  z.col_index,
          sort_order: BIFOLD_SORT + i,
          hinge_edge: pie.pieEdge,
          y_position_mm: along,
          y_locked: false,
          mounting_surface: 'auto',
          shelf_snap_tolerance_mm: 3,
          hinge_hardware_id: bifold.id,
          hinge_plate_id: null,
          mount_target: { table: 'face_zones', ...(t.facet ? { facet: t.facet } : {}), row_index: t.row_index, col_index: t.col_index },
          cup_drills: buildCupDrills(bifold, bx, cupY, backZ, pie.pieEdge),
          plate_drills: (bifold.door_plate_holes ?? []).map(h => ({
            x: tEdge === 'left' ? t.X + h.offset_x : t.X + t.DX - h.offset_x,
            y: cupY + h.offset_y,
            z: t.Z,
            axis: 'z+' as const,
            radius: (h.diameter ?? 0) / 2,
            depthLen: h.depth ?? 0,
            kind: 'plate' as const,
          })),
          model_url:        bifold.model_combined_url,
          model_scale:      bifold.model_combined_scale,
          bore_to_door_mm:  bifold.bore_centre_to_door_face_mm,
          open_angle_deg:   bifold.open_angle_deg,
          arm_fold_fraction: bifold.model_arm_fold_fraction,
          cup_x_from_edge_mm: bifold.cup_x_from_edge_mm,
          plate_model_url:   null,
          plate_model_scale: 1,
          plate_anchor_x:    0,
          plate_anchor_y:    0,
          plate_anchor_z:    0,
        })
      }
    })
  }

  return out
}

// ── Cup + anchor drills on the door back face ─────────────────────────────────
function buildCupDrills(
  hw: HingeHardwareInput,
  cupX: number, cupY: number, backZ: number,
  edge: 'left' | 'right' | 'top' | 'bottom',
): ResolvedHingeDrill[] {
  const drills: ResolvedHingeDrill[] = []
  // Cup bore: from the back face, into the door (toward the front, +Z).
  drills.push({
    x: cupX, y: cupY, z: backZ,
    axis: 'z+',
    radius: (hw.cup_diameter ?? 35) / 2,
    depthLen: hw.cup_depth_mm ?? 12,
    kind: 'cup',
  })
  // Anchor holes: offsets measured from the cup centre. offset_x runs along the
  // door's hinged-edge-perpendicular axis, offset_y along the hinge line. We map
  // them onto cabinet X/Y per the hinge edge so they sit sensibly either side of
  // the cup.
  for (const h of hw.anchor_holes ?? []) {
    let ax = cupX, ay = cupY
    if (edge === 'left')       { ax = cupX + h.offset_x; ay = cupY + h.offset_y }
    else if (edge === 'right') { ax = cupX - h.offset_x; ay = cupY + h.offset_y }
    else if (edge === 'top')   { ax = cupX + h.offset_y; ay = cupY - h.offset_x }
    else                       { ax = cupX + h.offset_y; ay = cupY + h.offset_x } // bottom
    drills.push({
      x: ax, y: ay, z: backZ,
      axis: 'z+',
      radius: (h.diameter ?? 0) / 2,
      depthLen: h.depth ?? 0,
      kind: 'anchor',
    })
  }
  return drills
}

// ── Mounting-surface resolution (9.2) ─────────────────────────────────────────
interface MountResult {
  target: ResolvedHingeMountTarget | null
  mountX: number   // plate-centre cabinet coords on the mounting surface
  mountY: number
  mountZ: number
  mountAxis: 'x-' | 'x+' | 'y-' | 'y+'  // drill direction into the surface
}

function resolveMount(
  edge: 'left' | 'right' | 'top' | 'bottom',
  surface: 'auto' | 'side' | 'top' | 'bottom' | 'shelf',
  snapTol: number,
  cupY: number,
  z: ResolvedFaceZone,
  caseParts: ResolvedCasePart[],
  internalParts: ResolvedInternalPart[],
  plate: HingePlateInput | null,
): MountResult {
  const offset = plate?.plate_offset_mm ?? 0
  const plateZ = z.Z - offset // behind the door back face (z.Z) by the plate offset
  const sideHung = edge === 'left' || edge === 'right'

  // Side-hung → carcass gable, always (no shelf-snap). The plate seats on the
  // gable's INNER face (toward the cabinet interior), NOT the door edge. A side
  // gable's cabinet-X extent is its thickness (caseBox width = part.DZ), so:
  //   left gable  inner face = part.X + part.DZ  (max-X face, faces +X)
  //   right gable inner face = part.X            (min-X face, faces −X)
  // Fall back to the door edge only when the gable part is missing.
  if (sideHung && (surface === 'auto' || surface === 'side')) {
    const key = edge === 'left' ? 'left_side' : 'right_side'
    const part = caseParts.find(p => p.part_key === key)
    const innerX = part
      ? (edge === 'left' ? part.X + part.DZ : part.X)
      : (edge === 'left' ? z.X : z.X + z.DX)
    return {
      target: part ? { table: 'case_parts', part_key: key } : null,
      mountX: innerX,
      mountY: cupY,
      mountZ: plateZ,
      mountAxis: edge === 'left' ? 'x-' : 'x+',
    }
  }

  // Explicit side override on a pivot door (unusual) — treat like side-hung.
  if (surface === 'side') {
    const part = caseParts.find(p => p.part_key === 'left_side')
    const innerX = part ? part.X + part.DZ : z.X
    return {
      target: part ? { table: 'case_parts', part_key: 'left_side' } : null,
      mountX: innerX, mountY: cupY, mountZ: plateZ, mountAxis: 'x-',
    }
  }

  // Pivot (top/bottom). Shelf-snap when auto; else fall back per edge.
  const shelves = internalParts.filter(p => p.part_type === 'adj_shelf' || p.part_type === 'fixed_shelf')

  if (surface === 'auto' || surface === 'shelf') {
    let best: ResolvedInternalPart | null = null
    let bestDist = Infinity
    for (const s of shelves) {
      const sCentreY = s.Y + s.DZ / 2
      const d = Math.abs(sCentreY - cupY)
      if (d < bestDist) { bestDist = d; best = s }
    }
    if (best && (surface === 'shelf' || bestDist <= snapTol)) {
      const sCentreY = best.Y + best.DZ / 2
      return {
        target: { table: 'internal_parts', internal_part_type: best.part_type, internal_sort_order: best.sort_order },
        mountX: z.X + z.DX / 2,
        mountY: sCentreY,
        mountZ: plateZ,
        // Plate fires on the shelf face toward the door (downward for a top hinge
        // shelf, upward for a bottom). Use edge to pick.
        mountAxis: edge === 'top' ? 'y-' : 'y+',
      }
    }
  }

  // Fall back to a case panel.
  if (edge === 'top' || surface === 'top') {
    const part = caseParts.find(p => p.part_key === 'full_top')
            ?? caseParts.find(p => p.part_key === 'front_rail')
    return {
      target: part ? { table: 'case_parts', part_key: part.part_key } : null,
      mountX: z.X + z.DX / 2,
      mountY: z.Y + z.DY,
      mountZ: plateZ,
      mountAxis: 'y-',
    }
  }
  // bottom
  const part = caseParts.find(p => p.part_key === 'bottom')
  return {
    target: part ? { table: 'case_parts', part_key: 'bottom' } : null,
    mountX: z.X + z.DX / 2,
    mountY: z.Y,
    mountZ: plateZ,
    mountAxis: 'y+',
  }
}

// ── Plate drills on the resolved mounting surface ─────────────────────────────
function buildPlateDrills(
  plate: HingePlateInput,
  cx: number, cy: number, cz: number,
  axis: 'x-' | 'x+' | 'y-' | 'y+',
): ResolvedHingeDrill[] {
  const onGable = axis === 'x-' || axis === 'x+'
  return (plate.mounting_hole_pattern ?? []).map((h: HingeBoreHole) => {
    // Map the plate-local (offset_x, offset_y) onto the mounting surface plane.
    // Gable plane: offset_x → depth (cabinet-Z), offset_y → height (cabinet-Y).
    // Horizontal panel/shelf plane: offset_x → depth (Z), offset_y → width (X).
    let x = cx, y = cy, z = cz
    if (onGable) { z = cz + h.offset_x; y = cy + h.offset_y }
    else         { z = cz + h.offset_x; x = cx + h.offset_y }
    return {
      x, y, z,
      axis,
      radius: (h.diameter ?? 0) / 2,
      depthLen: h.depth ?? 0,
      kind: 'plate' as const,
    }
  })
}

// ── Plate drills on an angled panel (shaped cabinets) ──────────────────────────
// Same plate pattern as a gable: offset_x runs along the panel face toward the
// front, offset_y up the height; bores go square into the panel.
function buildAngledPlateDrills(plate: HingePlateInput, m: ShapedMount, cy: number): ResolvedHingeDrill[] {
  const axis: ResolvedHingeDrill['axis'] = Math.abs(m.into.x) >= Math.abs(m.into.y)
    ? (m.into.x < 0 ? 'x-' : 'x+')
    : (m.into.y < 0 ? 'z-' : 'z+')
  return (plate.mounting_hole_pattern ?? []).map((h: HingeBoreHole) => ({
    x: m.x + m.along.x * h.offset_x,
    y: cy + h.offset_y,
    z: m.z + m.along.y * h.offset_x,
    axis,
    dir: { x: m.into.x, y: 0, z: m.into.y },
    radius: (h.diameter ?? 0) / 2,
    depthLen: h.depth ?? 0,
    kind: 'plate' as const,
  }))
}
