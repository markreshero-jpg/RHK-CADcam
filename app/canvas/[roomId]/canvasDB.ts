import { supabase } from '@/src/lib/supabase'
import type { Wall, CabinetInstance, CabinetDefinition, NeighbourType, RoomAnnotation, Room, RoomFixture } from '@/src/lib/types'
import { contentsFromFixtures } from '@/src/lib/cabinetContents'
import {
  opsForLibrary, opsForInstance, keyedForLibrary, keyedForInstance, fromLibraryKey, remapCustomKey, type PartOpRow,
} from '@/src/lib/libraryPartData'
import { cabBottomZ } from '@/src/lib/geometry'
import type { CustomOrient } from '@/src/lib/customPartBox'
import { seedClassDepthParams, presetBox } from '@/src/lib/cabinetShape/presets'
import { resolveCabinetFromDB, resolveCustomParts, getCachedInput, setCachedInput, applyEdgeOverridesFromCache, getCachedHidden } from '@/src/lib/resolver/resolveCabinetFromDB'
import { resolveCabinet } from '@/src/lib/resolver/resolver'
import { loadCabinetInput } from '@/src/lib/resolver/loadCabinetInput'
import { resolveHinges } from '@/src/lib/resolver/resolveHinges'
import { enumerateInternalSeams } from '@/src/lib/resolver/resolveJoints'
import { enumerateShapedSeams } from '@/src/lib/resolver/shapedSeams'
import { topSeamPartKeys, topSeamSibling } from '@/src/lib/cabinetSeams'
import { persistResolved } from '@/src/lib/resolver/persistResolved'
import type {
  ResolvedCabinet, ResolvedSeamJoint, JointTypeOp, SeamJointAssign,
  CabinetInput, HingeHardwareInput, HingePlateInput, HingeRuleInput, ExistingHingeInput, HingeBoreHole,
  FaceGridInput, PartHideViews, PartHideView,
} from '@/src/lib/resolver/types'
import { rowToJointTypeOp, seamAssignJoint, seamAssignRows } from '@/src/lib/resolver/types'
import type { ConstructionRules } from '@/src/lib/resolver/types'
import { mergeRules } from '@/src/lib/resolver/mergeRules'
import { normaliseBulkhead } from '@/src/lib/bulkhead'
import { normaliseSplit } from '@/src/lib/cabinetSplit'
import { normaliseFloatShelf } from '@/src/lib/floatShelf'
import { normaliseBackPanel } from '@/src/lib/backPanel'
import { normaliseCurvedEnd, curvedEndFootprint } from '@/src/lib/curvedEnd/settings'
import { FLOAT_Z } from '@/src/lib/floating'

const DIM_KEYS = new Set(['dx', 'dy', 'dz'])

// cabinet_instances.resolved_drawer_hw — written by persistResolved.
// hinge_instances: saved since z_cabinet_shape Phase 3b; warnings since
// z_material_colours MC5 (both absent on older saves).
// df_markers: drawer front marker pricks (z_handles D22), absent before 2026-10-29.
type DrawerHw = Pick<ResolvedCabinet, 'drawer_stacks' | 'internal_slides'> & Partial<Pick<ResolvedCabinet, 'hinge_instances' | 'warnings'>>
  & { df_markers?: { row_index: number; col_index: number; holes: { x: number; y: number }[] }[] }

// `needsResolve` (optional) collects cabinets whose saved copy can't be drawn
// as-is and needs a live resolve: drawers but no saved drawer hardware (saved
// before resolved_drawer_hw existed), or face rows saved without their fronts
// (an interrupted pre-RPC save).
export async function dbLoadResolvedParts(cabinetIds: string[], needsResolve?: Set<string>): Promise<Map<string, ResolvedCabinet>> {
  if (cabinetIds.length === 0) return new Map()

  const [cp, tp, ip, fr, fc, fz, ci, hin] = await Promise.all([
    supabase.from('case_parts').select('*').in('cabinet_instance_id', cabinetIds),
    supabase.from('toekick_parts').select('*').in('cabinet_instance_id', cabinetIds),
    supabase.from('internal_parts').select('*').in('cabinet_instance_id', cabinetIds),
    supabase.from('face_rows').select('*').in('cabinet_instance_id', cabinetIds),
    supabase.from('face_cols').select('*').in('cabinet_instance_id', cabinetIds),
    supabase.from('face_zones').select('*').in('cabinet_instance_id', cabinetIds),
    supabase.from('cabinet_instances').select('id, carcase_joints, part_hide_views, face_grid, resolved_drawer_hw').in('id', cabinetIds),
    supabase.from('hinge_instances').select('*').in('cabinet_instance_id', cabinetIds),
  ])

  // Hinge reconstruction (DB-rebuild path): the resolver's hinge_instances aren't
  // re-run here, so load the persisted rows + their hardware and re-run the pure
  // hinge resolver per cabinet to recover drills + 3D model fields for rendering.
  const hingeRows = (hin.data ?? []) as Record<string, unknown>[]
  const instancesByCab = new Map<string, Record<string, unknown>[]>()
  for (const r of hingeRows) {
    const cid = r.cabinet_instance_id as string
    const arr = instancesByCab.get(cid) ?? []
    arr.push(r)
    instancesByCab.set(cid, arr)
  }
  const { hardwareById, plateById, countRules } = await loadHingeHardware(hingeRows)

  // Collect joint type IDs from per-cabinet carcase_joints overrides
  const carcaseJointsById = new Map<string, Record<string, SeamJointAssign>>()
  const hiddenById = new Map<string, PartHideViews>()
  const faceGridById = new Map<string, FaceGridInput | null>()
  const drawerHwById = new Map<string, DrawerHw>()
  const jointTypeIds = new Set<string>()
  for (const row of (ci.data ?? []) as { id: string; carcase_joints: Record<string, SeamJointAssign> | null; part_hide_views: PartHideViews | null; face_grid: FaceGridInput | null; resolved_drawer_hw: DrawerHw | null }[]) {
    const joints = row.carcase_joints ?? {}
    carcaseJointsById.set(row.id, joints)
    hiddenById.set(row.id, row.part_hide_views ?? {})
    faceGridById.set(row.id, row.face_grid ?? null)
    if (row.resolved_drawer_hw) drawerHwById.set(row.id, row.resolved_drawer_hw)
    for (const v of Object.values(joints)) {
      const j = seamAssignJoint(v)
      if (j) jointTypeIds.add(j)
    }
  }

  // Load joint operations and names for all referenced joint types in one batch
  const jointOpsById: Record<string, JointTypeOp[]> = {}
  const jointNamesById: Record<string, string> = {}
  if (jointTypeIds.size > 0) {
    const ids = [...jointTypeIds]
    const [opsRes, namesRes] = await Promise.all([
      supabase.from('joint_type_operations').select('*').in('joint_type_id', ids).order('operation_order'),
      supabase.from('joint_types').select('id, name').in('id', ids),
    ])
    for (const op of (opsRes.data ?? []) as Record<string, unknown>[]) {
      const jid = op.joint_type_id as string
      if (!jointOpsById[jid]) jointOpsById[jid] = []
      jointOpsById[jid].push(rowToJointTypeOp(op))
    }
    for (const n of (namesRes.data ?? []) as { id: string; name: string }[]) {
      jointNamesById[n.id] = n.name
    }
  }

  const result = new Map<string, ResolvedCabinet>()
  for (const id of cabinetIds) {
    const myCase  = (cp.data ?? []).filter(p => p.cabinet_instance_id === id)
    const myTk    = (tp.data ?? []).filter(p => p.cabinet_instance_id === id)
    const myInt   = (ip.data ?? []).filter(p => p.cabinet_instance_id === id)
    const myRows  = (fr.data ?? []).filter(r => r.cabinet_instance_id === id)
    const myCols  = (fc.data ?? []).filter(c => c.cabinet_instance_id === id)
    const myZones = (fz.data ?? []).filter(z => z.cabinet_instance_id === id)

    if (myCase.length === 0 && myTk.length === 0 && myZones.length === 0) continue

    // Reconstruct seam joints from persisted case parts + cabinet-level joint assignments
    const carcaseJoints = carcaseJointsById.get(id) ?? {}
    const partKeys = new Set(myCase.map(p => p.part_key as string))
    const has = (k: string) => partKeys.has(k)

    const candidateSeams: string[] = []
    if (partKeys.has('bottom')   && partKeys.has('left_side'))  candidateSeams.push('bottom:left_side')
    if (partKeys.has('bottom')   && partKeys.has('right_side')) candidateSeams.push('bottom:right_side')
    for (const topKey of topSeamPartKeys(has)) {
      if (partKeys.has('left_side'))  candidateSeams.push(`${topKey}:left_side`)
      if (partKeys.has('right_side')) candidateSeams.push(`${topKey}:right_side`)
    }
    if (partKeys.has('back')     && partKeys.has('left_side'))  candidateSeams.push('back:left_side')
    if (partKeys.has('back')     && partKeys.has('right_side')) candidateSeams.push('back:right_side')
    if (partKeys.has('back')     && partKeys.has('bottom'))     candidateSeams.push('back:bottom')
    if (partKeys.has('back')     && partKeys.has('back_rail'))  candidateSeams.push('back:back_rail')

    const casePartsArr = myCase.map(p => ({
      part_key: p.part_key,
      DX: p.dx, DY: p.dy, DZ: p.dz,
      X: p.x, Y: p.y, Z: p.z,
      AX: p.ax, AY: p.ay, AZ: p.az,
      material_id: p.material_id,
      edge_band: { top: p.edge_band_top, bottom: p.edge_band_bottom, left: p.edge_band_left, right: p.edge_band_right, id: p.edge_band_id ?? undefined },
      ...(p.outline ? { outline: p.outline } : {}),
      ...(p.bevel_lo ? { bevel_lo: Number(p.bevel_lo) } : {}),
      ...(p.bevel_hi ? { bevel_hi: Number(p.bevel_hi) } : {}),
      ...(p.upright ? { upright: true } : {}),
      ...(p.wrap ? { wrap: p.wrap } : {}),
      ...(p.lh ? { lh: p.lh } : {}),   // linear strip handle's sharknose (z_handles D17)
    }))
    const intPartsArr = myInt.map(p => ({
      part_type: p.part_type,
      sort_order: p.sort_order,
      y_locked: p.y_locked,
      DX: p.dx, DY: p.dy, DZ: p.dz,
      X: p.x, Y: p.y, Z: p.z,
      AX: p.ax, AY: p.ay, AZ: p.az,
      material_id: p.material_id,
      // edge_band_front (DB) = right in resolver space (front DY edge)
      // edge_band_back  (DB) = left in resolver space
      edge_band: { top: p.edge_band_top, bottom: p.edge_band_bottom, left: p.edge_band_back, right: p.edge_band_front, id: p.edge_band_id ?? undefined },
      ...(p.outline ? { outline: p.outline } : {}),
      ...(p.accessory ? { accessory: p.accessory } : {}),
    }))

    const seamJoints: ResolvedSeamJoint[] = []
    for (const seamKey of candidateSeams) {
      const sibling     = topSeamSibling(seamKey, has)
      const own         = Object.prototype.hasOwnProperty.call(carcaseJoints, seamKey) ? seamAssignJoint(carcaseJoints[seamKey]) : undefined
      const jointTypeId = own !== undefined ? own : sibling ? seamAssignJoint(carcaseJoints[sibling]) : undefined
      if (!jointTypeId) continue
      const colonIdx = seamKey.indexOf(':')
      seamJoints.push({
        seam_key:        seamKey,
        joint_type_id:   jointTypeId,
        joint_type_name: jointNamesById[jointTypeId] ?? 'Unknown',
        source:          'cabinet',
        part_a_key:      seamKey.slice(0, colonIdx),
        part_b_key:      seamKey.slice(colonIdx + 1),
        ops:             jointOpsById[jointTypeId] ?? [],
      })
    }
    // Internal seams (shelf ↔ support, divider ↔ panel): parity with the carcase
    // reconstruction above — only per-cabinet assignments are known here (CM
    // joint_defaults aren't loaded in this path).
    for (const cand of enumerateInternalSeams(casePartsArr, intPartsArr)) {
      const entry = carcaseJoints[cand.seam_key]
      const jointTypeId = seamAssignJoint(entry)
      if (!jointTypeId) continue
      seamJoints.push({
        seam_key:        cand.seam_key,
        joint_type_id:   jointTypeId,
        joint_type_name: jointNamesById[jointTypeId] ?? 'Unknown',
        source:          'cabinet',
        part_a_key:      cand.part_a_key,
        part_b_key:      cand.part_b_key,
        ops:             jointOpsById[jointTypeId] ?? [],
        internal_edge:   cand.edge,
        rows_override:   seamAssignRows(entry),
      })
    }
    // Shaped-cabinet seams (z_cabinet_shape L3) — same parity rule.
    for (const cand of enumerateShapedSeams(casePartsArr, intPartsArr)) {
      const entry = carcaseJoints[cand.seam_key]
      const jointTypeId = seamAssignJoint(entry)
      if (!jointTypeId) continue
      seamJoints.push({
        seam_key:        cand.seam_key,
        joint_type_id:   jointTypeId,
        joint_type_name: jointNamesById[jointTypeId] ?? 'Unknown',
        source:          'cabinet',
        part_a_key:      cand.part_a_key,
        part_b_key:      cand.part_b_key,
        ops:             jointOpsById[jointTypeId] ?? [],
        shaped:          cand.shaped,
        ...(cand.internal_edge ? { internal_edge: cand.internal_edge } : {}),
        ...(cand.bank ? { bank: cand.bank } : {}),
        rows_override:   seamAssignRows(entry),
      })
    }

    const built: ResolvedCabinet = {
      cabinet_id: id,
      case_parts: casePartsArr,
      toekick_parts: myTk.map(p => ({
        part_key: p.part_key,
        sort_order: p.sort_order,
        is_detached: p.is_detached,
        DX: p.dx, DY: p.dy, DZ: p.dz,
        X: p.x, Y: p.y, Z: p.z,
        AX: p.ax, AY: p.ay, AZ: p.az,
        material_id: p.material_id,
        edge_band: { top: p.edge_band_top, bottom: p.edge_band_bottom, left: p.edge_band_left, right: p.edge_band_right, id: p.edge_band_id ?? undefined },
        ...(p.bevel_lo ? { bevel_lo: Number(p.bevel_lo) } : {}),
        ...(p.bevel_hi ? { bevel_hi: Number(p.bevel_hi) } : {}),
      })),
      internal_parts: intPartsArr,
      face_rows: myRows.map(r => ({
        row_index: r.row_index, height: r.height, height_locked: r.height_locked,
        ...(r.facet ? { facet: r.facet } : {}),
      })),
      face_cols: myCols.map(c => ({
        col_index: c.col_index, width: c.width, width_locked: c.width_locked,
        ...(c.facet ? { facet: c.facet } : {}),
      })),
      face_zones: myZones.map(z => ({
        row_index: z.row_index, col_index: z.col_index,
        face_type: z.face_type, hinge_side: z.hinge_side ?? undefined,
        DX: z.dx, DY: z.dy, DZ: z.dz,
        X: z.x, Y: z.y, Z: z.z,
        AX: z.ax, AY: z.ay, AZ: z.az,
        material_id: z.material_id,
        edge_band: { top: z.edge_band_top, bottom: z.edge_band_bottom, left: z.edge_band_left, right: z.edge_band_right, id: z.edge_band_id ?? undefined },
        door_style_id: z.door_style_id ?? null,
        door_profile_id: z.door_profile_id ?? null,
        door_profile: z.door_profile ?? null,
        // NULL = saved before handles (undefined → sheet falls back to the
        // schedule); { none: true } = resolved to no handle (see persistResolved).
        handle: z.handle == null ? undefined : z.handle.none ? null : z.handle,
        ...(z.facet ? { facet: z.facet } : {}),
        ...(z.bevel_l ? { bevel_l: Number(z.bevel_l) } : {}),
        ...(z.bevel_r ? { bevel_r: Number(z.bevel_r) } : {}),
      })),
      drawer_stacks: drawerHwById.get(id)?.drawer_stacks ?? [],
      internal_slides: drawerHwById.get(id)?.internal_slides ?? [],
      seam_joints: seamJoints,
      hinge_instances: [],
      errors: [],
      warnings: drawerHwById.get(id)?.warnings ?? [],
      part_hide_views: hiddenById.get(id) ?? {},
    }
    // Recover hinges (drills + 3D model fields) from the persisted instances so
    // they render in the canvas + edit modal without a live re-resolve.
    // Saved resolved hinges win; older saves rebuild them from the hinge rows.
    for (const m of drawerHwById.get(id)?.df_markers ?? []) {
      const z = built.face_zones.find(fz => !fz.facet && fz.row_index === m.row_index && fz.col_index === m.col_index)
      if (z) z.marker_holes = m.holes
    }
    built.hinge_instances = drawerHwById.get(id)?.hinge_instances
      ?? reconstructHinges(id, built, instancesByCab, hardwareById, plateById, countRules, faceGridById.get(id) ?? null)
    if (needsResolve) {
      const hasDrawers = built.face_zones.some(z => z.face_type === 'drawer_face')
        || built.internal_parts.some(p => p.part_type.startsWith('inner_drawer') || p.part_type.startsWith('pull_out'))
      const halfSaved = built.face_rows.length > 0 && built.face_zones.length === 0
      // Fronts saved before handles (z_handles H1: column NULL) or before handle
      // holes (H2: no `holes`) re-resolve once so their handles + holes appear.
      const handleStale = built.face_zones.some(z =>
        (z.face_type === 'door' || z.face_type === 'drawer_face')
        && (z.handle === undefined || (z.handle !== null && !Array.isArray(z.handle.holes))))
      // Drawer fronts saved before the marker pricks (z_handles D22) re-resolve once.
      const markersStale = drawerHwById.has(id) && drawerHwById.get(id)!.df_markers === undefined
        && built.face_zones.some(z => z.face_type === 'drawer_face')
      if ((hasDrawers && !drawerHwById.has(id)) || halfSaved || handleStale || markersStale) needsResolve.add(id)
    }
    // NB: left UNFILTERED — this map also feeds the edit modal (which never hides
    // anything) and the cut lists. Room views + their print reports call
    // filterHiddenMap(map, view) at render.
    result.set(id, built)
  }
  return result
}

// ── Hinge reconstruction helpers (DB-rebuild path) ────────────────────────────
function toHingeHoles(v: unknown): HingeBoreHole[] {
  if (!Array.isArray(v)) return []
  return v.map(h => {
    const o = (h ?? {}) as Record<string, unknown>
    return {
      offset_x: Number(o.offset_x ?? 0), offset_y: Number(o.offset_y ?? 0),
      diameter: Number(o.diameter ?? 0), depth: Number(o.depth ?? 0),
    }
  })
}

// Batch-load the hinge cup/plate hardware + count rules referenced by a set of
// persisted hinge_instances rows.
async function loadHingeHardware(rows: Record<string, unknown>[]): Promise<{
  hardwareById: Map<string, HingeHardwareInput>
  plateById:    Map<string, HingePlateInput>
  countRules:   HingeRuleInput[]
}> {
  const hwIds    = [...new Set(rows.map(r => r.hinge_hardware_id as string).filter(Boolean))]
  const plateIds = [...new Set(rows.map(r => r.hinge_plate_id).filter(Boolean) as string[])]
  if (hwIds.length === 0) return { hardwareById: new Map(), plateById: new Map(), countRules: [] }

  const [hwRes, plRes, ruleRes] = await Promise.all([
    supabase.from('hardware_hinges')
      .select('id, default_hinge_edge, cup_x_from_edge_mm, cup_diameter, cup_depth_mm, anchor_holes, opening_angle, model_combined_url, model_combined_scale, bore_centre_to_door_face_mm, model_arm_fold_fraction')
      .in('id', hwIds),
    plateIds.length
      ? supabase.from('hardware_hinge_plates').select('id, plate_offset_mm, mounting_hole_pattern, compatible_surfaces, model_plate_url, model_plate_scale, model_plate_anchor_x, model_plate_anchor_y, model_plate_anchor_z').in('id', plateIds)
      : Promise.resolve({ data: [] as unknown[] }),
    supabase.from('hinge_count_rules').select('max_height_mm, hinge_count, top_inset_mm, bottom_inset_mm').eq('active', true).order('max_height_mm', { ascending: true }),
  ])

  const hardwareById = new Map<string, HingeHardwareInput>()
  for (const h of ((hwRes as { data: unknown[] | null }).data ?? []) as Record<string, unknown>[]) {
    hardwareById.set(h.id as string, {
      id:                 h.id as string,
      default_hinge_edge: (h.default_hinge_edge as HingeHardwareInput['default_hinge_edge']) ?? 'left',
      cup_x_from_edge_mm: Number(h.cup_x_from_edge_mm ?? 22),
      cup_diameter:       h.cup_diameter != null ? Number(h.cup_diameter) : null,
      cup_depth_mm:       h.cup_depth_mm != null ? Number(h.cup_depth_mm) : null,
      anchor_holes:       toHingeHoles(h.anchor_holes),
      model_combined_url:          (h.model_combined_url as string | null) ?? null,
      model_combined_scale:        h.model_combined_scale != null ? Number(h.model_combined_scale) : 1,
      bore_centre_to_door_face_mm: h.bore_centre_to_door_face_mm != null ? Number(h.bore_centre_to_door_face_mm) : null,
      open_angle_deg:              h.opening_angle != null ? Number(h.opening_angle) : null,
      model_arm_fold_fraction:     h.model_arm_fold_fraction != null ? Number(h.model_arm_fold_fraction) : 0.5,
    })
  }
  const plateById = new Map<string, HingePlateInput>()
  for (const p of ((plRes as { data: unknown[] | null }).data ?? []) as Record<string, unknown>[]) {
    plateById.set(p.id as string, {
      id:                    p.id as string,
      plate_offset_mm:       Number(p.plate_offset_mm ?? 0),
      mounting_hole_pattern: toHingeHoles(p.mounting_hole_pattern),
      compatible_surfaces:   Array.isArray(p.compatible_surfaces) ? (p.compatible_surfaces as HingePlateInput['compatible_surfaces']) : ['side'],
      model_plate_url:       (p.model_plate_url as string | null) ?? null,
      model_plate_scale:     p.model_plate_scale != null ? Number(p.model_plate_scale) : 1,
      model_plate_anchor_x:  p.model_plate_anchor_x != null ? Number(p.model_plate_anchor_x) : 0,
      model_plate_anchor_y:  p.model_plate_anchor_y != null ? Number(p.model_plate_anchor_y) : 0,
      model_plate_anchor_z:  p.model_plate_anchor_z != null ? Number(p.model_plate_anchor_z) : 0,
    })
  }
  const countRules: HingeRuleInput[] = (((ruleRes as { data: unknown[] | null }).data ?? []) as Record<string, unknown>[]).map(r => ({
    max_height_mm:   Number(r.max_height_mm),
    hinge_count:     Number(r.hinge_count),
    top_inset_mm:    Number(r.top_inset_mm ?? 100),
    bottom_inset_mm: Number(r.bottom_inset_mm ?? 100),
  }))
  return { hardwareById, plateById, countRules }
}

// Re-run the pure hinge resolver against a rebuilt cabinet using the loaded
// hardware + persisted instances, recovering drills + 3D model fields.
function reconstructHinges(
  cabId: string,
  built: ResolvedCabinet,
  instancesByCab: Map<string, Record<string, unknown>[]>,
  hardwareById:   Map<string, HingeHardwareInput>,
  plateById:      Map<string, HingePlateInput>,
  countRules:     HingeRuleInput[],
  faceGrid:       FaceGridInput | null,
): ResolvedCabinet['hinge_instances'] {
  const instances = instancesByCab.get(cabId)
  if (!instances || instances.length === 0) return []
  const hw = hardwareById.get(instances[0].hinge_hardware_id as string)
  if (!hw) return []
  const plateId = (instances[0].hinge_plate_id as string | null) ?? null
  const plate = plateId ? (plateById.get(plateId) ?? null) : null
  const existing: ExistingHingeInput[] = instances.map(e => ({
    row_index:               Number(e.row_index),
    col_index:               Number(e.col_index),
    sort_order:              Number(e.sort_order),
    y_position_mm:           Number(e.y_position_mm),
    y_locked:                Boolean(e.y_locked),
    hinge_edge:              (e.hinge_edge as ExistingHingeInput['hinge_edge']) ?? 'left',
    mounting_surface:        (e.mounting_surface as ExistingHingeInput['mounting_surface']) ?? 'auto',
    shelf_snap_tolerance_mm: Number(e.shelf_snap_tolerance_mm ?? 3),
    hinge_plate_id:          (e.hinge_plate_id as string | null) ?? null,
  }))
  const cab = {
    hinge_hardware: hw, hinge_plate: plate, hinge_count_rules: countRules, existing_hinges: existing,
    face_grid: faceGrid ?? undefined,
  } as unknown as CabinetInput
  // Facet / turned doors of a shaped cabinet need its footprint — they only
  // come back from the saved resolved hinges.
  return resolveHinges(cab, built.face_zones.filter(z => !z.facet && !z.AY), built.case_parts, built.internal_parts)
}

export async function dbSaveWall(data: Omit<Wall, 'id' | 'created_at'>): Promise<Wall | null> {
  const { data: row, error } = await supabase.from('walls').insert(data).select().single()
  if (error) { console.error(error); return null }
  return row as Wall
}

export async function dbUpdateWall(id: string, u: Partial<Wall>) {
  const { error } = await supabase.from('walls').update(u).eq('id', id)
  if (error) console.error(error)
}

export async function dbDeleteWall(id: string) {
  const { error } = await supabase.from('walls').delete().eq('id', id)
  if (error) console.error('dbDeleteWall', error)
}

export async function dbInsertCabinet(
  data: Omit<CabinetInstance, 'id' | 'created_at' | 'updated_at'>,
): Promise<CabinetInstance | null> {
  const { data: row, error } = await supabase.from('cabinet_instances').insert(data).select().single()
  if (error) { console.error(error); return null }
  return row as CabinetInstance
}

export async function dbResolveAndPersistCabinet(id: string, opts: { awaitPersist?: boolean } = {}): Promise<ResolvedCabinet | null> {
  try {
    // resolveCabinetFromDB attaches custom_parts (room views draw them from there).
    return await resolveCabinetFromDB(id, opts)
  } catch (e) { console.error('resolve after save:', e); return null }
}

// ── Definition-driven placement (Cabinet Library) ─────────────────────────────
// Copy-not-link: a library definition is a placement-time template. We snapshot
// its frozen-geometry + composition fields into a fresh, fully-independent
// cabinet_instances row. Materials/hardware/door-style still resolve through the
// Job → Room → Assembly cascade, except for any preserved assembly-level overrides
// the definition carries. cabinet_definition_id is an audit/origin pointer only.

export async function dbLoadCabinetDefinition(id: string): Promise<CabinetDefinition | null> {
  const { data, error } = await supabase.from('cabinet_definitions').select('*').eq('id', id).single()
  if (error) { console.error('dbLoadCabinetDefinition', error); return null }
  return data as CabinetDefinition
}

// Caller-supplied placement context. Position/neighbour/label are computed exactly
// as the non-library placeCabinet path does (nextLabel, slotting, wall angle).
export interface DefinitionPlacement {
  room_id:               string
  wall_id:               string
  label:                 string
  pos_x:                 number
  pos_y:                 number
  rotation:              number
  dx?:                   number   // gap-fit width override; falls back to default_dx
  // Cascade-resolved Height/Depth for the definition's class (room→job→shop→system).
  // Used unless the definition preserves that axis. Omit → fall back to default_d*.
  cascade_dy?:           number
  cascade_dz?:           number
  left_neighbour_type?:  NeighbourType
  right_neighbour_type?: NeighbourType
}

// Build the instance row from a definition. Pure mapping — no DB writes — so it is
// callable/testable in isolation (agent-readiness invariant).
export function buildInstanceFromDefinition(
  def: CabinetDefinition,
  p: DefinitionPlacement,
): Omit<CabinetInstance, 'id' | 'created_at' | 'updated_at'> {
  // An empty face_grid object behaves like "no face grid" — normalise to null so
  // the resolver falls back to its default face, matching the legacy null path.
  const faceGrid = def.face_grid && Object.keys(def.face_grid).length > 0 ? def.face_grid : null
  const internalGrid = def.internal_grid && Object.keys(def.internal_grid).length > 0 ? def.internal_grid : null
  const dx = p.dx != null && p.dx > 0 ? Math.round(p.dx) : def.default_dx
  // Height/depth cascade unless the definition preserves that axis. A missing
  // cascade value (older callers) also falls back to the frozen default.
  const dz = def.preserve_dz || p.cascade_dz == null ? def.default_dz : p.cascade_dz
  // Shape params that follow the run's depth (L corner legs) take the cascaded
  // class depth even when the box depth itself is preserved (900 × 900 corner).
  // A curved end (z_curved_end) takes its plan outline from its own settings.
  const curvedEnd = normaliseCurvedEnd(def.curved_end)
  const footprint = curvedEnd
    ? curvedEndFootprint(curvedEnd, { w: dx, d: dz })
    : seedClassDepthParams(def.footprint ?? null, p.cascade_dz, { w: dx, d: dz })
  // A shape that sets its own box (angled corner filler, z_angled_filler).
  const shapeBox = presetBox(footprint)
  return {
    room_id: p.room_id, wall_id: p.wall_id,
    cabinet_definition_id: def.id,                 // audit / origin pointer only
    label: p.label, assembly_class: def.assembly_class,
    // A floating definition (z_floating) hangs off the floor; it was saved kick-less.
    pos_x: p.pos_x, pos_y: p.pos_y, pos_z: def.rule_overrides?.FLOAT ? FLOAT_Z : 0, rotation: p.rotation,
    dx: shapeBox?.w ?? dx,
    // A bulkhead never takes the wall-cabinet height: it keeps its own (or fits the
    // ceiling at placement when "Height to ceiling" is on).
    dy: def.preserve_dy || def.bulkhead || def.float_shelf || p.cascade_dy == null ? def.default_dy : p.cascade_dy,
    dz: shapeBox?.d ?? dz,
    has_carcass: def.has_carcass, has_internal: def.has_internal,
    has_face: def.has_face, has_toekick: def.has_toekick,
    construction_method_id: def.construction_method_id,
    top_type: def.top_type, toe_type: def.toe_type,
    left_neighbour_type: p.left_neighbour_type ?? 'wall',
    right_neighbour_type: p.right_neighbour_type ?? 'wall',
    exposed_interior: def.exposed_interior,
    rule_overrides: def.rule_overrides,
    material_overrides: def.material_overrides,
    toekick_overrides: def.toekick_overrides,
    drawerbox_overrides: def.drawerbox_overrides,
    hardware_overrides: def.hardware_overrides,
    face_grid: faceGrid,
    internal_grid: internalGrid,
    carcase_joints: def.carcase_joints,
    no_cnc: def.no_cnc ?? false,
    footprint,
    bulkhead: def.bulkhead ?? null,
    curved_end: curvedEnd,
    float_shelf: normaliseFloatShelf(def.float_shelf),
    back_panel: normaliseBackPanel(def.back_panel),
    faces: def.faces ?? null,
    part_hide_views: def.part_hide_views ?? {},
    part_no_cnc: def.part_no_cnc ?? [],
    schema_version: '0.4', notes: null,
  }
}

// Insert a snapshot of custom parts (from a definition) as rows for a new cabinet.
// Returns the new part ids in snapshot order (library ops / comments point at
// custom parts by that index — src/lib/libraryPartData.ts).
export async function dbInsertCustomPartsSnapshot(cabinetId: string, snapshot: Record<string, unknown>[]): Promise<string[]> {
  if (!snapshot || snapshot.length === 0) return []
  const rows = snapshot.map((p, i) => ({
    cabinet_instance_id: cabinetId,
    part_library_id: p.part_library_id,
    name: (p.name as string | null) ?? null,
    dx: (p.dx as number) ?? 0, dy: (p.dy as number) ?? 0, dz: (p.dz as number) ?? 18,
    x: (p.x as number) ?? 0, y: (p.y as number) ?? 0, z: (p.z as number) ?? 0,
    expressions: p.expressions ?? {},
    // Carry only the explicit override; material_id is left null so the resolver
    // re-derives the effective material (override ?? role) for THIS job's schedule.
    material_override_id: (p.material_override_id as string | null) ?? null,
    edge_top: !!p.edge_top, edge_bottom: !!p.edge_bottom, edge_left: !!p.edge_left, edge_right: !!p.edge_right,
    visible: p.visible !== false,
    show_in_room: p.show_in_room !== false,
    hide_views: (p.hide_views as string[] | undefined) ?? [],
    orientation: (p.orientation as string) ?? 'flat',
    no_cnc: !!p.no_cnc,
    sort_order: (p.sort_order as number) ?? i,
  }))
  // Ids made here so each is known to belong to its snapshot index — one insert.
  const ids = rows.map(() => crypto.randomUUID())
  const { error } = await supabase.from('cabinet_custom_parts').insert(rows.map((r, i) => ({ ...r, id: ids[i] })))
  if (error) { console.error('dbInsertCustomPartsSnapshot', error); return [] }
  return ids
}

// A definition's hand-drawn part ops + part comments / labels onto a newly
// placed cabinet (z_wot K0). `customIds` = the new custom part ids, snapshot order.
export async function dbApplyDefinitionPartData(
  def: Pick<CabinetDefinition, 'part_operations' | 'part_comments' | 'part_labels'>,
  cabinetId: string,
  customIds: string[],
) {
  const mapKey = fromLibraryKey(customIds)
  const ops = opsForInstance(def.part_operations ?? [], cabinetId, mapKey)
  if (ops.length) {
    const { error } = await supabase.from('part_operations').insert(ops)
    if (error) console.error('dbApplyDefinitionPartData ops', error)
  }
  const part_comments = keyedForInstance(def.part_comments, mapKey)
  const part_labels = keyedForInstance(def.part_labels, mapKey)
  if (Object.keys(part_comments).length || Object.keys(part_labels).length) {
    const { error } = await supabase.from('cabinet_instances').update({ part_comments, part_labels }).eq('id', cabinetId)
    if (error) console.error('dbApplyDefinitionPartData comments', error)
  }
}

// Copy/paste: clone a cabinet's user-authored child rows (custom parts + shape
// overrides) onto a freshly-inserted copy. Resolver output (case/face/internal
// parts etc.) is regenerated by the resolve that follows, so it isn't copied.
// Shape overrides on custom parts are keyed `custom_<partId>` — remap to the new ids.
export async function dbCopyCabinetChildren(srcCabinetId: string, dstCabinetId: string) {
  // Per-view part hides are saved straight from the editor, so the in-memory
  // instance the copy was built from may be stale — take them from the DB.
  const hide = await dbLoadHiddenParts(srcCabinetId)
  if (Object.keys(hide).length) await dbSaveHiddenParts(dstCabinetId, hide)
  const noCnc = await dbLoadNoCncParts(srcCabinetId)
  if (noCnc.length) await dbSaveNoCncParts(dstCabinetId, noCnc)
  const { data: cps } = await supabase.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', srcCabinetId).order('sort_order')
  const idMap = new Map<string, string>()
  for (const p of cps ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, created_at, updated_at, ...rest } = p
    const { data, error } = await supabase.from('cabinet_custom_parts').insert({ ...rest, cabinet_instance_id: dstCabinetId }).select('id').single()
    if (error) { console.error('dbCopyCabinetChildren parts', error); continue }
    idMap.set(id as string, data.id as string)
  }
  const { data: ovs } = await supabase.from('part_shape_overrides').select('*').eq('cabinet_id', srcCabinetId)
  if (ovs?.length) {
    const rows = ovs.map(o => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, created_at, ...rest } = o
      const key = o.part_key as string
      const newKey = key.startsWith('custom_') && idMap.has(key.slice(7)) ? `custom_${idMap.get(key.slice(7))}` : key
      return { ...rest, cabinet_id: dstCabinetId, part_key: newKey }
    })
    const { error } = await supabase.from('part_shape_overrides').insert(rows)
    if (error) console.error('dbCopyCabinetChildren shapes', error)
  }
  // Hand-drawn drilling / routes + part comments and labels (z_wot K0).
  const mapKey = remapCustomKey(idMap)
  const [{ data: srcOps }, { data: srcInst }] = await Promise.all([
    supabase.from('part_operations').select('*').eq('source_cabinet_id', srcCabinetId),
    supabase.from('cabinet_instances').select('part_comments,part_labels').eq('id', srcCabinetId).single(),
  ])
  const ops = opsForInstance((srcOps ?? []) as PartOpRow[], dstCabinetId, mapKey)
  if (ops.length) {
    const { error } = await supabase.from('part_operations').insert(ops)
    if (error) console.error('dbCopyCabinetChildren ops', error)
  }
  const part_comments = keyedForInstance(srcInst?.part_comments as Record<string, string> | null, mapKey)
  const part_labels = keyedForInstance(srcInst?.part_labels as Record<string, string> | null, mapKey)
  const { error: kErr } = await supabase.from('cabinet_instances').update({ part_comments, part_labels }).eq('id', dstCabinetId)
  if (kErr) console.error('dbCopyCabinetChildren comments', kErr)
}

// Copy a definition's stored custom parts (+ their drilling / comments) onto a
// newly-placed cabinet.
export async function dbInsertDefinitionParts(definitionId: string, cabinetId: string) {
  const { data } = await supabase.from('cabinet_definitions')
    .select('custom_parts,part_operations,part_comments,part_labels').eq('id', definitionId).single()
  const ids = await dbInsertCustomPartsSnapshot(cabinetId, ((data?.custom_parts ?? []) as Record<string, unknown>[]))
  if (data) await dbApplyDefinitionPartData(data as Pick<CabinetDefinition, 'part_operations' | 'part_comments' | 'part_labels'>, cabinetId, ids)
}

// Load → build → insert → resolve. Returns the new instance plus its resolved
// parts (resolution is persisted to the DB by dbResolveAndPersistCabinet).
export async function dbPlaceCabinetFromDefinition(
  definitionId: string,
  placement: DefinitionPlacement,
): Promise<{ cabinet: CabinetInstance; resolved: ResolvedCabinet | null } | null> {
  const def = await dbLoadCabinetDefinition(definitionId)
  if (!def) return null
  const cabinet = await dbInsertCabinet(buildInstanceFromDefinition(def, placement))
  if (!cabinet) return null
  const ids = await dbInsertCustomPartsSnapshot(cabinet.id, (def.custom_parts ?? []) as Record<string, unknown>[])
  await dbApplyDefinitionPartData(def, cabinet.id, ids)
  const resolved = await dbResolveAndPersistCabinet(cabinet.id)
  return { cabinet, resolved }
}

// ── Save a configured cabinet to the library (Save-As) ────────────────────────
// Snapshots the instance's frozen geometry/composition into a new definition.
// Materials/hardware otherwise resolve via the cascade at placement; ticked
// preservation items capture the *resolved* value into the matching override
// channel so it travels with the definition as a clearable assembly-level override.

// Each flag maps to an override channel the resolver reads (see Stage 4b/1).
export interface PreserveOptions {
  carcase_material?: boolean   // → material_overrides.interior
  toekick_material?: boolean   // → toekick_overrides.face/.interior
  hinge?:            boolean   // → hardware_overrides.hinge_hardware_id (+ hinge_plate_id)
  slide?:            boolean   // → hardware_overrides.slide_id
  exposed_interior?: boolean   // → exposed_interior flag
  // Per-axis size freeze. Unticked → that axis cascades (room→job→shop→system) at
  // placement. dy/dz cascade; dx has no cascade source so it always uses default_dx.
  width?:            boolean   // → preserve_dx
  height?:           boolean   // → preserve_dy
  depth?:            boolean   // → preserve_dz
}

export async function saveCabinetToLibrary(
  cabinetInstanceId: string,
  opts: { name: string; categoryId: string | null; subcategoryId: string | null; description?: string | null; preserve: PreserveOptions },
): Promise<string | null> {
  const { data: inst, error } = await supabase.from('cabinet_instances').select('*').eq('id', cabinetInstanceId).single()
  if (error || !inst) { console.error('saveCabinetToLibrary load', error); return null }
  const p = opts.preserve

  const material_overrides: Record<string, string> = {}
  const toekick_overrides:  Record<string, string> = {}
  const hardware_overrides: Record<string, string> = {}

  // Capture resolved cascade values for any ticked preservation item.
  if (p.carcase_material || p.toekick_material || p.hinge || p.slide) {
    try {
      const input = await loadCabinetInput(cabinetInstanceId)
      if (p.carcase_material && input.material?.id) material_overrides.interior = input.material.id
      if (p.toekick_material) {
        if (input.toekick_face_material?.id)     toekick_overrides.face     = input.toekick_face_material.id
        if (input.toekick_interior_material?.id) toekick_overrides.interior = input.toekick_interior_material.id
      }
      if (p.hinge && input.hinge_hardware?.id) {
        hardware_overrides.hinge_hardware_id = input.hinge_hardware.id
        if (input.hinge_plate?.id) hardware_overrides.hinge_plate_id = input.hinge_plate.id
      }
      if (p.slide) {
        const resolved = resolveCabinet(input)
        const slideId =
          resolved.drawer_stacks.flatMap(s => s.slides).find(Boolean)?.slide_id ??
          resolved.internal_slides.find(Boolean)?.slide_id
        if (slideId) hardware_overrides.slide_id = slideId
      }
    } catch (e) {
      console.error('saveCabinetToLibrary resolve', e)   // capture is best-effort; still save geometry
    }
  }

  // Append after the last definition in the chosen subcategory.
  let sort_order = 0
  if (opts.subcategoryId) {
    const { data: sibs } = await supabase.from('cabinet_definitions').select('sort_order').eq('subcategory_id', opts.subcategoryId)
    sort_order = (sibs ?? []).reduce((m, r) => Math.max(m, (r.sort_order as number) ?? 0), -1) + 1
  }

  // Snapshot the instance's custom parts so the definition carries them.
  const { data: cpRows } = await supabase.from('cabinet_custom_parts')
    .select('id,part_library_id,name,dx,dy,dz,x,y,z,expressions,material_override_id,edge_top,edge_bottom,edge_left,edge_right,visible,show_in_room,hide_views,orientation,no_cnc,sort_order')
    .eq('cabinet_instance_id', cabinetInstanceId).order('sort_order')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const cps = (cpRows ?? []).map(({ id, ...rest }) => rest)
  // Hand-drawn drilling / routes + part comments and labels go with it (z_wot K0),
  // custom parts referenced by their index in that snapshot.
  const customIds = (cpRows ?? []).map(r => r.id as string)
  const { data: opRows } = await supabase.from('part_operations').select('*').eq('source_cabinet_id', cabinetInstanceId)
  const part_operations = opsForLibrary((opRows ?? []) as PartOpRow[], customIds)
  const part_comments = keyedForLibrary(inst.part_comments as Record<string, string> | null, customIds)
  const part_labels = keyedForLibrary(inst.part_labels as Record<string, string> | null, customIds)

  // Fixtures linked to it become the definition's default contents (z_ubo U6):
  // the oven seated in its opening, a sink on its base…
  const [{ data: fxs }, { data: roomRow }, { data: wallRow }] = await Promise.all([
    supabase.from('room_fixtures').select('*').eq('cabinet_id', cabinetInstanceId),
    supabase.from('rooms').select('*').eq('id', inst.room_id).maybeSingle(),
    inst.wall_id ? supabase.from('walls').select('*').eq('id', inst.wall_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const contents = roomRow
    ? contentsFromFixtures((fxs ?? []) as RoomFixture[], cabBottomZ(inst as CabinetInstance, roomRow as Room, (wallRow ?? null) as Wall | null))
    : []

  // Carcass choices made on the cabinet travel with it (z_ubo U6) — a saved
  // UBO copy keeps its back rail. Other cabinet overrides (e.g. the kick height
  // a kick join writes) stay behind.
  const CARRIED_RULES = ['BACK_TYPE', 'BKRH', 'RAIL_ORIENT', 'BACK_RAIL_ORIENT', 'FLOAT', 'UNDER_PANEL'] as const
  const instRules = (inst.rule_overrides ?? {}) as Record<string, unknown>
  const rule_overrides = Object.fromEntries(CARRIED_RULES.filter(k => instRules[k] !== undefined).map(k => [k, instRules[k]]))

  const row = {
    name: opts.name,
    assembly_class: inst.assembly_class,
    category_id: opts.categoryId,
    subcategory_id: opts.subcategoryId,
    default_dx: inst.dx, default_dy: inst.dy, default_dz: inst.dz,
    preserve_dx: !!p.width, preserve_dy: !!p.height, preserve_dz: !!p.depth,
    has_carcass: inst.has_carcass, has_internal: inst.has_internal, has_face: inst.has_face, has_toekick: inst.has_toekick,
    top_type: inst.top_type, toe_type: inst.toe_type,
    construction_method_id: inst.construction_method_id,
    face_grid: inst.face_grid ?? {}, internal_grid: inst.internal_grid, carcase_joints: inst.carcase_joints ?? {},
    rule_overrides,
    contents,
    material_overrides, hardware_overrides, toekick_overrides, drawerbox_overrides: {},
    exposed_interior: p.exposed_interior ? !!inst.exposed_interior : false,
    no_cnc: !!inst.no_cnc,
    footprint: inst.footprint ?? null,
    bulkhead: inst.bulkhead ?? null,
    curved_end: inst.curved_end ?? null,
    float_shelf: inst.float_shelf ?? null,
    back_panel: inst.back_panel ?? null,
    faces: inst.faces ?? null,
    custom_parts: cps,
    part_operations, part_comments, part_labels,
    // Per-view part hides travel with the definition (z_display_layers/PART-HIDE-SPEC.md).
    part_hide_views: inst.part_hide_views ?? {},
    part_no_cnc: inst.part_no_cnc ?? [],
    description: opts.description ?? null,
    is_library_item: true, active: true, sort_order,
  }
  const { data: created, error: insErr } = await supabase.from('cabinet_definitions').insert(row).select('id').single()
  if (insErr || !created) { console.error('saveCabinetToLibrary insert', insErr); return null }
  return created.id as string
}

// Fast-path tail shared by dbUpdateCabinet: resolve the patched cached input
// locally, persist in background, then re-evaluate custom-part formulas against
// the new geometry — awaited so the result carries custom_parts (room views draw
// end panels / fillers from there; without them the assembly vanishes).
async function resolveFromCachedInput(id: string, input: CabinetInput): Promise<ResolvedCabinet> {
  const resolved = resolveCabinet(input)
  applyEdgeOverridesFromCache(resolved)
  resolved.part_hide_views = getCachedHidden(id) ?? {}
  persistResolved(resolved).catch(e => console.error('persist:', e))
  await resolveCustomParts(id, resolved, input).catch(e => console.error('resolveCustomParts:', e))
  return resolved
}

export async function dbUpdateCabinet(
  id: string,
  u: Partial<CabinetInstance>,
): Promise<ResolvedCabinet | null> {
  const { error } = await supabase.from('cabinet_instances').update(u).eq('id', id)
  if (error) { console.error(error); return null }

  // Fast path: dimension-only change + cached input → resolve synchronously,
  // persist in background. Eliminates ~17 Supabase round-trips per resize.
  // Kick-run members are excluded: their width change reshapes the run's merged
  // kick (owned by the lead), which the single-cabinet fast path can't see — they
  // fall through to a full resolve, and the caller fans the run out (resolveKickRun).
  const keys = Object.keys(u)
  // Bulkhead settings (z_bulkhead) only feed resolveBulkhead — same fast path.
  // So do curved end settings (z_curved_end) and the plan outline they rebuild,
  // and floating shelf settings (z_floating_shelf).
  const cached = keys.length > 0 && keys.every(k => DIM_KEYS.has(k) || k === 'bulkhead' || k === 'curved_end' || k === 'float_shelf' || k === 'back_panel' || k === 'split' || (k === 'footprint' && 'curved_end' in u)) ? getCachedInput(id) : undefined
  // A shadowline split rail (z_bulkhead B7) switched on / to another board needs
  // that board loaded — full resolve.
  const split = u.bulkhead !== undefined ? normaliseBulkhead(u.bulkhead)?.split : undefined
  const splitBoardMoved = !!cached && !!split && (split.on ? split.material_id : null) !== (cached.split_material?.id ?? null)
  if (cached && !cached.kick_run && !splitBoardMoved) {
    const updated = {
      ...cached,
      ...(u.dx !== undefined && { DX: Number(u.dx) }),
      ...(u.dy !== undefined && { DY: Number(u.dy) }),
      ...(u.dz !== undefined && { DZ: Number(u.dz) }),
      ...(u.bulkhead !== undefined && { bulkhead: normaliseBulkhead(u.bulkhead) }),
      ...(u.curved_end !== undefined && { curved_end: normaliseCurvedEnd(u.curved_end) }),
      ...(u.float_shelf !== undefined && { float_shelf: normaliseFloatShelf(u.float_shelf) }),
      ...(u.back_panel !== undefined && { back_panel: normaliseBackPanel(u.back_panel) }),
      ...(u.split !== undefined && { split: normaliseSplit(u.split) }),
      ...(u.footprint !== undefined && { footprint: u.footprint ?? null }),
    }
    setCachedInput(id, updated)
    return resolveFromCachedInput(id, updated)
  }

  // Fast path: cabinet rule-override-only change (scribes, reveals, gaps…) + cached
  // input → re-merge the rules locally and resolve synchronously. Safe because
  // rule_overrides is the LAST cascade layer and loadCabinetInput never uses the
  // merged rules to decide what else to fetch — so nothing else in the input moves.
  // Turns a ~13-round-trip reload into zero reads.
  if (keys.length === 1 && keys[0] === 'rule_overrides') {
    const cachedR = getCachedInput(id)
    if (cachedR?.rules_base && !cachedR.kick_run) {
      const ov = (u.rule_overrides ?? {}) as Partial<ConstructionRules>
      const updated = { ...cachedR, rules: mergeRules(cachedR.rules_base, ov) }
      setCachedInput(id, updated)
      return resolveFromCachedInput(id, updated)
    }
  }

  // Fast path: neighbour-only change (auto-detected neighbours) + cached input —
  // only the side reveals move, so nothing needs reloading.
  if (keys.length > 0 && keys.every(k => k === 'left_neighbour_type' || k === 'right_neighbour_type')) {
    const cachedN = getCachedInput(id)
    if (cachedN && !cachedN.kick_run) {
      const updated = {
        ...cachedN,
        ...(u.left_neighbour_type != null && { left_neighbour: u.left_neighbour_type }),
        ...(u.right_neighbour_type != null && { right_neighbour: u.right_neighbour_type }),
      }
      setCachedInput(id, updated)
      return resolveFromCachedInput(id, updated)
    }
  }

  // Fast path: joint-override-only change + cached input → resolve synchronously
  // so seam drilling updates instantly in the open editor. Falls through to a
  // full reload when a newly-assigned joint's ops aren't in the cached input.
  if (keys.length === 1 && keys[0] === 'carcase_joints') {
    const cj = (u.carcase_joints ?? {}) as Record<string, SeamJointAssign>
    const cachedJ = getCachedInput(id)
    const opsKnown = cachedJ && Object.values(cj).every(v => {
      const j = seamAssignJoint(v)
      return !j || !!cachedJ.joint_type_ops?.[j]
    })
    if (cachedJ && opsKnown && !cachedJ.kick_run) {
      const updated = { ...cachedJ, carcase_joints: cj }
      setCachedInput(id, updated)
      return resolveFromCachedInput(id, updated)
    }
  }

  try { return await resolveCabinetFromDB(id) } catch (e) { console.error('resolve after update:', e); return null }
}

// ── Kick-run orchestration ────────────────────────────────────────────────────
// A joined kick run is owned by a synthetic "kick assembly" cabinet (toe-kick
// only, is_kick_assembly = true) whose width = run length and depth = deepest
// member; the member cabinets resolve no kick. Mutations return a KickRunMutation
// describing how the canvas should update its cabinet list + resolved geometry.

// Fallback kick height (mm) if a member's own kick height can't be read.
const KICK_ASSEMBLY_DY = 150

// A member's current toe-kick height = its persisted kick_front_face DX (TOEH).
async function memberKickHeight(cabId: string): Promise<number> {
  const { data } = await supabase.from('toekick_parts')
    .select('dx').eq('cabinet_instance_id', cabId).eq('part_key', 'kick_front_face').limit(1).maybeSingle()
  const dx = (data as { dx?: number } | null)?.dx
  return dx != null && Number(dx) > 0 ? Number(dx) : KICK_ASSEMBLY_DY
}

// Detach a member's kick into the run assembly: it becomes a kick-less carcase, so
// its dy shrinks to the carcase height and it's raised by the kick height (pos_z) to
// stay put. Returns the kick height moved out. (See z_kick_join — option "B".)
async function applyDetachTransform(cabId: string): Promise<number> {
  const kickH = await memberKickHeight(cabId)
  const { data } = await supabase.from('cabinet_instances').select('dy, pos_z').eq('id', cabId).maybeSingle()
  const c = data as { dy: number; pos_z: number } | null
  if (!c) return kickH
  await supabase.from('cabinet_instances').update({
    dy:          Math.max(1, Number(c.dy) - kickH),
    pos_z:       Number(c.pos_z ?? 0) + kickH,
    has_toekick: false,
  }).eq('id', cabId)
  return kickH
}

// Reverse of applyDetachTransform: give a member back a kick of height kickH (the
// assembly's current height), lowering it to the floor and re-enabling its own kick.
async function applyReattachTransform(cabId: string, kickH: number): Promise<void> {
  const { data } = await supabase.from('cabinet_instances').select('dy, pos_z, rule_overrides').eq('id', cabId).maybeSingle()
  const c = data as { dy: number; pos_z: number; rule_overrides: Record<string, unknown> | null } | null
  if (!c) return
  await supabase.from('cabinet_instances').update({
    dy:             Number(c.dy) + kickH,
    pos_z:          Math.max(0, Number(c.pos_z ?? 0) - kickH),
    has_toekick:    true,
    rule_overrides: { ...(c.rule_overrides ?? {}), TOEH: kickH },
  }).eq('id', cabId)
}

export interface KickRunMutation {
  addedAssembly?:    CabinetInstance                       // new kick assembly to add to state
  assemblyPatch?:    { id: string; u: Partial<CabinetInstance> }  // geometry update to an existing assembly
  memberPatches?:    { id: string; u: Partial<CabinetInstance> }[]  // member field changes (dy/pos_z/has_toekick/kick_run_id)
  removedCabinetIds: string[]                              // cabinet rows to drop from state
  resolved:          Map<string, ResolvedCabinet>          // fresh geometry to merge
}

// Read members' current detach-relevant fields so the canvas state mirrors the DB
// after a join/separate transform.
async function readMemberPatches(memberIds: string[]): Promise<{ id: string; u: Partial<CabinetInstance> }[]> {
  if (memberIds.length === 0) return []
  const { data } = await supabase.from('cabinet_instances')
    .select('id, dy, pos_z, has_toekick, kick_run_id').in('id', memberIds)
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    id: r.id as string,
    u: {
      dy:          Number(r.dy),
      pos_z:       Number(r.pos_z),
      has_toekick: Boolean(r.has_toekick),
      kick_run_id: (r.kick_run_id as string | null) ?? null,
    },
  }))
}

const EMPTY_MUTATION = (): KickRunMutation => ({ removedCabinetIds: [], resolved: new Map() })

// Re-resolve every cabinet linked to a run (members + assembly) and return their
// fresh geometry — the assembly builds the kick, members drop theirs.
export async function resolveKickRun(runId: string): Promise<Map<string, ResolvedCabinet>> {
  const { data, error } = await supabase.from('cabinet_instances').select('id').eq('kick_run_id', runId)
  if (error) { console.error('resolveKickRun members', error); return new Map() }
  const out = new Map<string, ResolvedCabinet>()
  await Promise.all((data ?? []).map(async ({ id }) => {
    const r = await resolveCabinetFromDB(id as string).catch(e => { console.error('resolveKickRun member', id, e); return null })
    if (r) out.set(id as string, r)
  }))
  return out
}

// Geometry the kick assembly should take from its current member cabinets:
// positioned at the leftmost member's left edge, width = Σ member widths, depth =
// deepest member. Null when fewer than 2 real members remain (run should dissolve).
async function computeKickAssemblyGeom(runId: string): Promise<
  { pos_x: number; pos_y: number; rotation: number; wall_id: string | null; dx: number; dz: number } | null
> {
  const { data: linked } = await supabase
    .from('cabinet_instances')
    .select('id, dx, dz, pos_x, pos_y, rotation, wall_id, is_kick_assembly')
    .eq('kick_run_id', runId)
  const members = ((linked ?? []) as Record<string, unknown>[]).filter(m => !m.is_kick_assembly)
  if (members.length < 1) return null   // single-cabinet detach is valid (1 member)

  const wallId = (members[0].wall_id as string | null) ?? null
  let dirx = 1, diry = 0, wpx = 0, wpy = 0
  if (wallId) {
    const { data: wall } = await supabase.from('walls').select('pos_x, pos_y, angle').eq('id', wallId).maybeSingle()
    if (wall) {
      const ang = (Number(wall.angle) * Math.PI) / 180
      dirx = Math.cos(ang); diry = Math.sin(ang)
      wpx = Number(wall.pos_x); wpy = Number(wall.pos_y)
    }
  }
  const t = (m: Record<string, unknown>) => (Number(m.pos_x) - wpx) * dirx + (Number(m.pos_y) - wpy) * diry
  const sorted = [...members].sort((a, b) => t(a) - t(b))
  const left = sorted[0]
  // Span from the leftmost member's left edge to the rightmost member's right edge
  // (not Σ widths) — so the kick still covers the run if a move opens a gap.
  const leftT  = t(left)
  const rightT = Math.max(...sorted.map(m => t(m) + Number(m.dx)))
  return {
    pos_x:    Number(left.pos_x),
    pos_y:    Number(left.pos_y),
    rotation: Number(left.rotation),
    wall_id:  wallId,
    dx:       rightT - leftT,
    dz:       Math.max(...sorted.map(m => Number(m.dz))),
  }
}

// Detach kicks into a new run: create the run row, stamp the member(s), move each
// member's kick into the run (option B — member becomes a kick-less carcase, raised
// by its kick height), then create the standalone kick assembly sized to the run
// and link it. Works for a single cabinet (memberIds length 1) or a whole run.
export async function dbJoinKickRun(roomId: string, memberIds: string[], label: string): Promise<KickRunMutation> {
  const { data: runRow, error } = await supabase
    .from('kick_runs').insert({ room_id: roomId, split_mode: 'equal' }).select('id').single()
  if (error || !runRow) { console.error('dbJoinKickRun create', error); return EMPTY_MUTATION() }
  const runId = runRow.id as string

  const { error: upErr } = await supabase.from('cabinet_instances').update({ kick_run_id: runId }).in('id', memberIds)
  if (upErr) { console.error('dbJoinKickRun assign', upErr); return EMPTY_MUTATION() }

  // Move each member's kick into the run; the assembly takes the (representative)
  // kick height of the first member as its own height (DY drives the kick geometry).
  const kickHeights: number[] = []
  for (const mid of memberIds) kickHeights.push(await applyDetachTransform(mid))
  const assemblyKickH = kickHeights[0] ?? KICK_ASSEMBLY_DY

  const geom = await computeKickAssemblyGeom(runId)
  if (!geom) { console.error('dbJoinKickRun: no members'); return EMPTY_MUTATION() }
  await supabase.from('kick_runs').update({ build_to_depth: geom.dz }).eq('id', runId)

  const { data: asm, error: aerr } = await supabase.from('cabinet_instances').insert({
    room_id: roomId, wall_id: geom.wall_id, assembly_class: 'base', label,
    pos_x: geom.pos_x, pos_y: geom.pos_y, pos_z: 0, rotation: geom.rotation,
    dx: geom.dx, dy: assemblyKickH, dz: geom.dz,
    has_carcass: false, has_internal: false, has_face: false, has_toekick: true,
    is_kick_assembly: true, kick_run_id: runId,
  }).select('*').single()
  if (aerr || !asm) { console.error('dbJoinKickRun assembly', aerr); return EMPTY_MUTATION() }

  await supabase.from('kick_runs').update({ kick_cabinet_id: asm.id }).eq('id', runId)
  return {
    addedAssembly: asm as CabinetInstance,
    memberPatches: await readMemberPatches(memberIds),
    removedCabinetIds: [],
    resolved: await resolveKickRun(runId),
  }
}

// Re-fit the kick assembly to its (changed) members — new width/position/depth —
// then re-resolve the run. Dissolves the run when fewer than 2 members remain.
export async function syncKickAssembly(runId: string): Promise<KickRunMutation> {
  const geom = await computeKickAssemblyGeom(runId)
  if (!geom) return dissolveKickRun(runId)

  const { data: run } = await supabase.from('kick_runs').select('kick_cabinet_id').eq('id', runId).maybeSingle()
  const assemblyId = (run as { kick_cabinet_id?: string | null } | null)?.kick_cabinet_id ?? null
  let assemblyPatch: KickRunMutation['assemblyPatch']
  if (assemblyId) {
    const u: Partial<CabinetInstance> = {
      pos_x: geom.pos_x, pos_y: geom.pos_y, rotation: geom.rotation, wall_id: geom.wall_id, dx: geom.dx, dz: geom.dz,
    }
    await supabase.from('cabinet_instances').update(u).eq('id', assemblyId)
    await supabase.from('kick_runs').update({ build_to_depth: geom.dz }).eq('id', runId)
    assemblyPatch = { id: assemblyId, u }
  }
  return { assemblyPatch, removedCabinetIds: [], resolved: await resolveKickRun(runId) }
}

// Dissolve a run: give each member its kick back (reverse of the detach transform —
// re-enable has_toekick, restore dy and lower it to the floor), delete the kick
// assembly, drop the run row, and re-resolve members. The reattached kick height is
// the assembly's current height (so "Separate" returns exactly what's on screen);
// pass `kickH` when the assembly row is already gone (deleted by the caller).
async function dissolveKickRun(
  runId: string,
  opts?: { kickH?: number; assemblyAlreadyDeletedId?: string; reattach?: boolean },
): Promise<KickRunMutation> {
  const reattach = opts?.reattach ?? true
  const assemblyAlreadyDeletedId = opts?.assemblyAlreadyDeletedId
  const { data: run } = await supabase.from('kick_runs').select('kick_cabinet_id').eq('id', runId).maybeSingle()
  const assemblyId = (run as { kick_cabinet_id?: string | null } | null)?.kick_cabinet_id ?? assemblyAlreadyDeletedId ?? null

  // Kick height to give back = the assembly's current height (read it while it lives).
  let kickH = opts?.kickH
  if (reattach && kickH == null && assemblyId) {
    const { data: asm } = await supabase.from('cabinet_instances').select('dy').eq('id', assemblyId).maybeSingle()
    kickH = (asm as { dy?: number } | null)?.dy != null ? Number((asm as { dy: number }).dy) : undefined
  }
  if (kickH == null) kickH = KICK_ASSEMBLY_DY

  const { data: linked } = await supabase.from('cabinet_instances').select('id, is_kick_assembly').eq('kick_run_id', runId)
  const memberIds = ((linked ?? []) as { id: string; is_kick_assembly: boolean }[])
    .filter(c => !c.is_kick_assembly).map(c => c.id)

  // reattach (Separate): give each member its own kick back. Otherwise (Delete kick)
  // the members stay exactly as they are — kick-less carcases, raised where they sit.
  if (reattach) for (const cid of memberIds) await applyReattachTransform(cid, kickH)

  // Clear membership. When NOT reattaching, also force has_toekick=false so a member
  // can never rebuild its own kick (covers any not-yet-migrated old-model member).
  await supabase.from('cabinet_instances')
    .update(reattach ? { kick_run_id: null } : { kick_run_id: null, has_toekick: false })
    .eq('kick_run_id', runId)
  await supabase.from('kick_runs').delete().eq('id', runId)
  if (assemblyId && assemblyId !== assemblyAlreadyDeletedId) {
    await supabase.from('cabinet_instances').delete().eq('id', assemblyId)
  }

  const memberPatches = await readMemberPatches(memberIds)
  const resolved = new Map<string, ResolvedCabinet>()
  await Promise.all(memberIds.map(async cid => {
    const r = await resolveCabinetFromDB(cid).catch(e => { console.error('dissolveKickRun member', cid, e); return null })
    if (r) resolved.set(cid, r)
  }))
  return { memberPatches, removedCabinetIds: assemblyId ? [assemblyId] : [], resolved }
}

// Explicit "Separate kicks" — reattaches each member's kick at the assembly's height.
export async function dbSeparateKickRun(runId: string): Promise<KickRunMutation> {
  return dissolveKickRun(runId)
}

// One-time self-heal: migrate kick-run MEMBERS that were detached under the old
// model (kick still on the cabinet — has_toekick=true, full dy, pos_z=0) to the
// current "B" model (kick-less carcase: has_toekick=false, dy −= kickH, raised by
// kickH). The kick height is the run's assembly height. Re-resolves the migrated
// members so their persisted geometry (faces flush, no reserved kick) updates.
// Returns a mutation to merge into canvas state, or null when nothing to migrate.
export async function dbMigrateLegacyKickMembers(roomId: string): Promise<KickRunMutation | null> {
  const { data } = await supabase.from('cabinet_instances')
    .select('id, kick_run_id, dy, pos_z')
    .eq('room_id', roomId).eq('has_toekick', true).eq('is_kick_assembly', false)
    .not('kick_run_id', 'is', null)
  const legacy = (data ?? []) as { id: string; kick_run_id: string; dy: number; pos_z: number }[]
  if (legacy.length === 0) return null

  const runIds = [...new Set(legacy.map(m => m.kick_run_id))]
  const { data: asms } = await supabase.from('cabinet_instances')
    .select('kick_run_id, dy').eq('is_kick_assembly', true).in('kick_run_id', runIds)
  const kickHByRun = new Map<string, number>()
  for (const a of (asms ?? []) as { kick_run_id: string; dy: number }[]) kickHByRun.set(a.kick_run_id, Number(a.dy))

  for (const m of legacy) {
    const kickH = kickHByRun.get(m.kick_run_id) ?? KICK_ASSEMBLY_DY
    await supabase.from('cabinet_instances').update({
      dy:          Math.max(1, Number(m.dy) - kickH),
      pos_z:       Number(m.pos_z ?? 0) + kickH,
      has_toekick: false,
    }).eq('id', m.id)
  }

  const ids = legacy.map(m => m.id)
  const memberPatches = await readMemberPatches(ids)
  const resolved = new Map<string, ResolvedCabinet>()
  await Promise.all(ids.map(async cid => {
    const r = await resolveCabinetFromDB(cid).catch(e => { console.error('migrate legacy kick member', cid, e); return null })
    if (r) resolved.set(cid, r)
  }))
  return { memberPatches, removedCabinetIds: [], resolved }
}

// Split-to-size settings for a run's kick assembly.
export async function dbLoadKickRunSettings(
  runId: string,
): Promise<{ max_segment_length: number | null; split_mode: 'equal' | 'exact' }> {
  const { data } = await supabase.from('kick_runs').select('max_segment_length, split_mode').eq('id', runId).maybeSingle()
  const r = data as { max_segment_length: number | null; split_mode: string } | null
  return {
    max_segment_length: r?.max_segment_length != null ? Number(r.max_segment_length) : null,
    split_mode:         (r?.split_mode as 'equal' | 'exact') ?? 'equal',
  }
}

// Write split settings and re-resolve the run so the assembly re-segments live.
export async function dbUpdateKickRunSettings(
  runId: string,
  settings: { max_segment_length: number | null; split_mode: 'equal' | 'exact' },
): Promise<KickRunMutation> {
  const { error } = await supabase.from('kick_runs')
    .update({ max_segment_length: settings.max_segment_length, split_mode: settings.split_mode })
    .eq('id', runId)
  if (error) { console.error('dbUpdateKickRunSettings', error); return EMPTY_MUTATION() }
  return { removedCabinetIds: [], resolved: await resolveKickRun(runId) }
}

// Delete a cabinet, reconciling any kick run it belonged to:
//  • deleting the kick assembly → the kick is GONE; members are NOT given a kick back
//    (they stay as raised kick-less carcases where they sit). Use "Separate kicks" to
//    reattach instead.
//  • deleting a member → it just goes; the standalone assembly is left untouched
//    (kicks are independent once detached), unless no members remain, in which case
//    the orphaned assembly + run row are cleaned up.
export async function dbDeleteCabinet(id: string): Promise<KickRunMutation> {
  const { data: row } = await supabase
    .from('cabinet_instances').select('kick_run_id, is_kick_assembly').eq('id', id).maybeSingle()
  const info = row as { kick_run_id?: string | null; is_kick_assembly?: boolean } | null
  const runId = info?.kick_run_id ?? null
  const wasAssembly = !!info?.is_kick_assembly

  const { error } = await supabase.from('cabinet_instances').delete().eq('id', id)
  if (error) { console.error('dbDeleteCabinet', error); return EMPTY_MUTATION() }

  if (!runId) return EMPTY_MUTATION()
  if (wasAssembly) return dissolveKickRun(runId, { assemblyAlreadyDeletedId: id, reattach: false })

  // A member was deleted. If others remain, leave the assembly alone (independent).
  const { data: linked } = await supabase.from('cabinet_instances').select('id, is_kick_assembly').eq('kick_run_id', runId)
  const live = ((linked ?? []) as { id: string; is_kick_assembly: boolean }[])
  const members = live.filter(c => !c.is_kick_assembly)
  if (members.length > 0) return EMPTY_MUTATION()

  // No members left — drop the orphaned assembly + run row.
  const assemblyId = live.find(c => c.is_kick_assembly)?.id ?? null
  if (assemblyId) await supabase.from('cabinet_instances').delete().eq('id', assemblyId)
  await supabase.from('kick_runs').delete().eq('id', runId)
  return { removedCabinetIds: assemblyId ? [assemblyId] : [], resolved: new Map() }
}

// ── Custom Parts ──────────────────────────────────────────────────────────────

export interface CabinetCustomPart {
  id:                  string
  cabinet_instance_id: string
  part_library_id:     string
  name:                string | null
  dy:                  number
  dx:                  number
  dz:                  number
  x:                   number
  y:                   number
  z:                   number
  material_id:         string | null   // resolved cache (override ?? role material); written by the resolver
  material_override_id: string | null  // explicit user pick; wins over the role default
  edge_top:            boolean
  edge_bottom:         boolean
  edge_left:           boolean
  edge_right:          boolean
  visible:             boolean   // visibility inside the cabinet editor (3D / elevation)
  show_in_room:        boolean   // legacy all-views room flag — superseded by hide_views
  hide_views?:         PartHideView[]  // room views this part is hidden in (PART-HIDE-SPEC)
  orientation:         CustomOrient  // how the flat panel sits in cabinet space
  // Parametric formula per field (dx/dy/dz/x/y/z). Present key = that column is a
  // computed cache of the formula, re-evaluated on resolve. Absent = plain literal.
  expressions?:        Record<string, string>
  no_cnc?:             boolean
  sort_order:          number
}

export async function dbLoadCustomParts(cabinetId: string): Promise<CabinetCustomPart[]> {
  const { data } = await supabase
    .from('cabinet_custom_parts')
    .select('*')
    .eq('cabinet_instance_id', cabinetId)
    .order('sort_order')
  return (data ?? []) as CabinetCustomPart[]
}

export async function dbAddCustomPart(
  part: Omit<CabinetCustomPart, 'id'>,
): Promise<CabinetCustomPart | null> {
  const { data, error } = await supabase
    .from('cabinet_custom_parts')
    .insert(part)
    .select()
    .single()
  if (error) { console.error(error); return null }
  return data as CabinetCustomPart
}

export async function dbUpdateCustomPart(id: string, u: Partial<CabinetCustomPart>): Promise<void> {
  const { error } = await supabase.from('cabinet_custom_parts').update(u).eq('id', id)
  if (error) console.error(error)
}

export async function dbDeleteCustomPart(id: string): Promise<void> {
  const { error } = await supabase.from('cabinet_custom_parts').delete().eq('id', id)
  if (error) console.error(error)
}

// ── Part Labels ───────────────────────────────────────────────────────────────

export type PartLabels = Record<string, string>

export async function dbLoadPartLabels(cabinetId: string): Promise<PartLabels> {
  const { data } = await supabase
    .from('cabinet_instances').select('part_labels').eq('id', cabinetId).single()
  return ((data as { part_labels?: unknown } | null)?.part_labels ?? {}) as PartLabels
}

export async function dbSavePartLabel(cabinetId: string, partId: string, label: string, current: PartLabels): Promise<PartLabels> {
  const updated = { ...current, [partId]: label }
  const { error } = await supabase.from('cabinet_instances').update({ part_labels: updated }).eq('id', cabinetId)
  if (error) console.error('[part label save]', error)
  return updated
}

export async function dbDeletePartLabel(cabinetId: string, partId: string, current: PartLabels): Promise<PartLabels> {
  const { [partId]: _r, ...updated } = current
  const { error } = await supabase.from('cabinet_instances').update({ part_labels: updated }).eq('id', cabinetId)
  if (error) console.error('[part label delete]', error)
  return updated
}

// ── Per-view part hiding ──────────────────────────────────────────────────────
// part id → room views it is hidden in (z_display_layers/PART-HIDE-SPEC.md).
// Visual only. Custom parts carry their own cabinet_custom_parts.hide_views.

export async function dbLoadHiddenParts(cabinetId: string): Promise<PartHideViews> {
  const { data } = await supabase
    .from('cabinet_instances').select('part_hide_views').eq('id', cabinetId).single()
  return ((data as { part_hide_views?: unknown } | null)?.part_hide_views ?? {}) as PartHideViews
}

export async function dbSaveHiddenParts(cabinetId: string, hidden: PartHideViews): Promise<void> {
  const { error } = await supabase.from('cabinet_instances').update({ part_hide_views: hidden }).eq('id', cabinetId)
  if (error) console.error('[hidden parts save]', error)
}

// Per-part "No CNC": part ids left out of the optimiser / CNC (still drawn).
// Custom parts carry their own cabinet_custom_parts.no_cnc.
export async function dbLoadNoCncParts(cabinetId: string): Promise<string[]> {
  const { data } = await supabase
    .from('cabinet_instances').select('part_no_cnc').eq('id', cabinetId).single()
  const v = (data as { part_no_cnc?: unknown } | null)?.part_no_cnc
  return Array.isArray(v) ? v as string[] : []
}

export async function dbSaveNoCncParts(cabinetId: string, ids: string[]): Promise<void> {
  const { error } = await supabase.from('cabinet_instances').update({ part_no_cnc: ids }).eq('id', cabinetId)
  if (error) console.error('[no-cnc parts save]', error)
}

// ── Part Comments ─────────────────────────────────────────────────────────────

export type PartComments = Record<string, string>

export async function dbLoadPartComments(cabinetId: string): Promise<PartComments> {
  const { data } = await supabase
    .from('cabinet_instances').select('part_comments').eq('id', cabinetId).single()
  return ((data as { part_comments?: unknown } | null)?.part_comments ?? {}) as PartComments
}

export async function dbSavePartComment(cabinetId: string, partId: string, comment: string, current: PartComments): Promise<PartComments> {
  const updated = comment.trim() ? { ...current, [partId]: comment.trim() } : (() => { const { [partId]: _r, ...rest } = current; return rest })()
  const { error } = await supabase.from('cabinet_instances').update({ part_comments: updated }).eq('id', cabinetId)
  if (error) console.error('[part comment save]', error)
  return updated
}

// ── Part Names ────────────────────────────────────────────────────────────────
// User-authored display names, keyed by the same synthetic source_part_key as
// part_comments (case_left_side, db_0_1_db_bottom…). Lives on cabinet_instances
// so it survives persistResolved's delete-then-insert of the part rows. The
// part's part_type / part_key stays the hard-coded machine identity.

export type PartNames = Record<string, string>

export async function dbLoadPartNames(cabinetId: string): Promise<PartNames> {
  const { data } = await supabase
    .from('cabinet_instances').select('part_names').eq('id', cabinetId).single()
  return ((data as { part_names?: unknown } | null)?.part_names ?? {}) as PartNames
}

// Saving an empty name (or one equal to the generated default) clears the
// override, so the part falls back to the default label.
export async function dbSavePartName(cabinetId: string, partId: string, name: string, current: PartNames): Promise<PartNames> {
  const updated = name.trim() ? { ...current, [partId]: name.trim() } : (() => { const { [partId]: _r, ...rest } = current; return rest })()
  const { error } = await supabase.from('cabinet_instances').update({ part_names: updated }).eq('id', cabinetId)
  if (error) console.error('[part name save]', error)
  return updated
}

// ── Part Position Overrides ───────────────────────────────────────────────────

// Per-part overrides keyed by part id. ox/oy/oz = position nudge; oa* = rotation.
// sw/sh/sd = absolute size override (box width/height/depth in mm); omitted = use
// the resolved size. Size overrides are applied in the 3D/preview box build.
export type PartPosOverrides = Record<string, { ox: number; oy: number; oz: number; oax?: number; oay?: number; oaz?: number; sw?: number; sh?: number; sd?: number }>

export async function dbLoadPartPosOverrides(cabinetId: string): Promise<PartPosOverrides> {
  const { data } = await supabase
    .from('cabinet_instances')
    .select('part_pos_overrides')
    .eq('id', cabinetId)
    .single()
  return ((data as { part_pos_overrides?: unknown } | null)?.part_pos_overrides ?? {}) as PartPosOverrides
}

export async function dbSavePartPosOverride(
  cabinetId: string,
  partId: string,
  ov: PartPosOverrides[string],
  current: PartPosOverrides,
): Promise<PartPosOverrides> {
  const updated = { ...current, [partId]: ov }
  const { error } = await supabase
    .from('cabinet_instances')
    .update({ part_pos_overrides: updated })
    .eq('id', cabinetId)
  if (error) console.error('[pos override save]', error)
  return updated
}

export async function dbClearPartPosOverrides(cabinetId: string): Promise<void> {
  const { error } = await supabase
    .from('cabinet_instances')
    .update({ part_pos_overrides: {} })
    .eq('id', cabinetId)
  if (error) console.error('[pos override clear]', error)
}

export async function dbDeletePartPosOverride(
  cabinetId: string,
  partId: string,
  current: PartPosOverrides,
): Promise<PartPosOverrides> {
  const { [partId]: _removed, ...updated } = current
  const { error } = await supabase
    .from('cabinet_instances')
    .update({ part_pos_overrides: updated })
    .eq('id', cabinetId)
  if (error) console.error('[pos override delete]', error)
  return updated
}

// ── Part shape overrides (Shape Editor) ───────────────────────────────────────
// A drawn part outline is a per-cabinet override in part_shape_overrides,
// keyed by the same stable part id as part_pos_overrides / part_operations
// (case_left_side, zone_0_0, int_adj_shelf_2, custom_<uuid>, …). History is
// append-only: every save inserts revision = max+1; the highest revision per
// (cabinet_id, part_key) is the live shape. See
// z_part_shape_editor/INTEGRATION-PLAN.md.

// One outline segment in part-relative mm (ShapeEditor emit format). `edge`
// is the banding display tag block — opaque here, passed through untouched.
export type ShapeSegment = {
  type: 'line' | 'arc' | 'curve'
  p0: { x: number; y: number }
  p1: { x: number; y: number }
  cp1?: { x: number; y: number }
  cp2?: { x: number; y: number }
  rx?: number
  ry?: number
  largeArc?: 0 | 1
  sweep?: 0 | 1
  edge?: { band?: boolean; profile?: string }
}

// Which storage field a shape-frame axis writes its bbox dimension into:
// part_pos_overrides slots for resolved parts, intrinsic dims for custom parts.
export type ShapeSizeSlot = 'sw' | 'sh' | 'sd' | 'dx' | 'dy' | 'dz'

// ShapeEditor's onSave meta, stored verbatim alongside the segments — plus
// fields the Part Editor adds at save time so the Overrides tab can replay
// the bbox→size write (restore), clear it (remove) and flag staleness without
// re-deriving the part's frame.
export type ShapeMeta = {
  closed: boolean
  segmentCount: number
  bounds?: { minX: number; minY: number; maxX: number; maxY: number } | null
  originShift?: { dx: number; dy: number }
  bandedEdges?: number
  tapeLengthMM?: number
  // across = the slot the shape's x/width lands in, up = its y/height slot.
  sizeSlots?: { across: ShapeSizeSlot; up: ShapeSizeSlot; custom?: boolean }
  // The part's BASE resolved in-plane dims when the shape was saved (custom
  // parts: dims after the save). Compared order-insensitively against the
  // current base to flag "part size changed since shape was drawn".
  baseAtSave?: { w: number; h: number }
}

export type ShapeOverride = {
  revision: number
  segments: ShapeSegment[]
  meta: ShapeMeta | null
  created_at: string
  // Total stored revisions for this part (populated by dbLoadShapeOverrides).
  revisions?: number
}

// Latest shape per part id for one cabinet (mirrors PartPosOverrides shape).
export type ShapeOverrides = Record<string, ShapeOverride>

type ShapeRow = { part_key: string; revision: number; segments: ShapeSegment[]; meta: ShapeMeta | null; created_at: string }

export async function dbLoadShapeOverrides(cabinetId: string): Promise<ShapeOverrides> {
  const { data, error } = await supabase
    .from('part_shape_overrides')
    .select('part_key, revision, segments, meta, created_at')
    .eq('cabinet_id', cabinetId)
    .order('revision', { ascending: false })
  if (error) { console.error('[shape override load]', error); return {} }
  // Rows arrive revision-desc — first row seen per part_key is the live head.
  const out: ShapeOverrides = {}
  for (const r of (data ?? []) as ShapeRow[]) {
    if (!(r.part_key in out)) out[r.part_key] = { revision: r.revision, segments: r.segments, meta: r.meta, created_at: r.created_at, revisions: 1 }
    else out[r.part_key].revisions = (out[r.part_key].revisions ?? 1) + 1
  }
  return out
}

export async function dbSaveShapeOverride(
  cabinetId: string,
  partKey: string,
  segments: ShapeSegment[],
  meta: ShapeMeta | null,
): Promise<ShapeOverride | null> {
  const { data: head, error: headErr } = await supabase
    .from('part_shape_overrides')
    .select('revision')
    .eq('cabinet_id', cabinetId)
    .eq('part_key', partKey)
    .order('revision', { ascending: false })
    .limit(1)
  if (headErr) { console.error('[shape override save]', headErr); return null }
  const revision = ((head?.[0] as { revision: number } | undefined)?.revision ?? 0) + 1
  const { data, error } = await supabase
    .from('part_shape_overrides')
    .insert({ cabinet_id: cabinetId, part_key: partKey, revision, segments, meta })
    .select('revision, segments, meta, created_at')
    .single()
  if (error) { console.error('[shape override save]', error); return null }
  const r = data as Omit<ShapeRow, 'part_key'>
  return { revision: r.revision, segments: r.segments, meta: r.meta, created_at: r.created_at }
}

// Revision history entry — includes segments so pickers can render thumbnails
// and preview a revision live without committing anything.
export type ShapeRevisionEntry = { revision: number; created_at: string; meta: ShapeMeta | null; segments: ShapeSegment[] }

export async function dbListShapeRevisions(
  cabinetId: string,
  partKey: string,
): Promise<ShapeRevisionEntry[]> {
  const { data, error } = await supabase
    .from('part_shape_overrides')
    .select('revision, created_at, meta, segments')
    .eq('cabinet_id', cabinetId)
    .eq('part_key', partKey)
    .order('revision', { ascending: false })
  if (error) { console.error('[shape revisions list]', error); return [] }
  return (data ?? []) as ShapeRevisionEntry[]
}

// Restore = re-insert the old revision's segments as a NEW head revision, so
// history stays append-only and the restore itself can be rolled back.
export async function dbRestoreShapeRevision(
  cabinetId: string,
  partKey: string,
  revision: number,
): Promise<ShapeOverride | null> {
  const { data, error } = await supabase
    .from('part_shape_overrides')
    .select('segments, meta')
    .eq('cabinet_id', cabinetId)
    .eq('part_key', partKey)
    .eq('revision', revision)
    .single()
  if (error || !data) { console.error('[shape revision restore]', error); return null }
  const r = data as { segments: ShapeSegment[]; meta: ShapeMeta | null }
  return dbSaveShapeOverride(cabinetId, partKey, r.segments, r.meta)
}

// Remove the override entirely (all revisions) — the part reverts to its
// plain resolved rectangle. Callers are responsible for also clearing any
// sw/sh + ox/oy pos-override entries the shape save wrote.
export async function dbDeleteShapeOverride(cabinetId: string, partKey: string): Promise<void> {
  const { error } = await supabase
    .from('part_shape_overrides')
    .delete()
    .eq('cabinet_id', cabinetId)
    .eq('part_key', partKey)
  if (error) console.error('[shape override delete]', error)
}

// Wipe every shape (all parts, all revisions) for a cabinet — the shape half
// of "Clear all overrides". Callers clear the pos-override map separately.
export async function dbClearShapeOverrides(cabinetId: string): Promise<void> {
  const { error } = await supabase
    .from('part_shape_overrides')
    .delete()
    .eq('cabinet_id', cabinetId)
  if (error) console.error('[shape override clear]', error)
}

// Room 3D view: part position/size/rotation overrides + live shape overrides for
// every cabinet in the room, in two queries (the cabinet editor loads these per
// cabinet via dbLoadPartPosOverrides / dbLoadShapeOverrides).
export async function dbLoadRoomPartDetails(cabinetIds: string[]): Promise<{
  posById: Map<string, PartPosOverrides>
  shapesById: Map<string, ShapeOverrides>
}> {
  const posById = new Map<string, PartPosOverrides>()
  const shapesById = new Map<string, ShapeOverrides>()
  if (cabinetIds.length === 0) return { posById, shapesById }
  const [pos, shp] = await Promise.all([
    supabase.from('cabinet_instances').select('id, part_pos_overrides').in('id', cabinetIds),
    supabase.from('part_shape_overrides')
      .select('cabinet_id, part_key, revision, segments, meta, created_at')
      .in('cabinet_id', cabinetIds)
      .order('revision', { ascending: false }),
  ])
  if (pos.error) console.error('[room part overrides load]', pos.error)
  if (shp.error) console.error('[room shape overrides load]', shp.error)
  for (const r of (pos.data ?? []) as { id: string; part_pos_overrides: PartPosOverrides | null }[]) {
    if (r.part_pos_overrides && Object.keys(r.part_pos_overrides).length) posById.set(r.id, r.part_pos_overrides)
  }
  // Rows arrive revision-desc — first row seen per (cabinet, part_key) is the live head.
  for (const r of (shp.data ?? []) as (ShapeRow & { cabinet_id: string })[]) {
    const m = shapesById.get(r.cabinet_id) ?? {}
    if (!(r.part_key in m)) m[r.part_key] = { revision: r.revision, segments: r.segments, meta: r.meta, created_at: r.created_at }
    shapesById.set(r.cabinet_id, m)
  }
  return { posById, shapesById }
}

// ── CAD annotations (z_CAD_tool/ANNOTATION-SPEC.md) ──────────────────────────
// Paper-only markup; rows never feed the resolver / nest. The canvas loads a room's
// rows server-side (page.tsx); these are for authoring (A2+) and other screens.

export type AnnotationDraft = Omit<RoomAnnotation, 'id' | 'created_at' | 'updated_at'>
type AnnotationPatch = Partial<Pick<RoomAnnotation, 'geom' | 'text' | 'style' | 'sort_order' | 'kind' | 'cad_layer_id'>>

export async function dbLoadAnnotations(roomId: string): Promise<RoomAnnotation[]> {
  const { data, error } = await supabase.from('room_annotations').select('*').eq('room_id', roomId).order('sort_order')
  if (error) console.error('[annotations load]', error)
  return (data ?? []) as RoomAnnotation[]
}

export async function dbInsertAnnotation(draft: AnnotationDraft): Promise<RoomAnnotation | null> {
  const { data, error } = await supabase.from('room_annotations').insert(draft).select('*').single()
  if (error) { console.error('[annotation insert]', error); return null }
  return data as RoomAnnotation
}

export async function dbUpdateAnnotation(id: string, patch: AnnotationPatch): Promise<void> {
  const { error } = await supabase.from('room_annotations')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) console.error('[annotation update]', error)
}

export async function dbDeleteAnnotations(ids: string[]): Promise<void> {
  if (!ids.length) return
  const { error } = await supabase.from('room_annotations').delete().in('id', ids)
  if (error) console.error('[annotation delete]', error)
}
