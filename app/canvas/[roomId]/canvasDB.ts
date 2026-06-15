import { supabase } from '@/src/lib/supabase'
import type { Wall, CabinetInstance, CabinetDefinition, NeighbourType } from '@/src/lib/types'
import { resolveCabinetFromDB, getCachedInput, setCachedInput, applyEdgeOverridesFromCache, getCachedHidden } from '@/src/lib/resolver/resolveCabinetFromDB'
import { resolveCabinet } from '@/src/lib/resolver/resolver'
import { loadCabinetInput } from '@/src/lib/resolver/loadCabinetInput'
import { resolveHinges } from '@/src/lib/resolver/resolveHinges'
import { persistResolved } from '@/src/lib/resolver/persistResolved'
import type {
  ResolvedCabinet, ResolvedSeamJoint, JointTypeOp, JointTargetPart, JointMachineOp, JointFace,
  CabinetInput, HingeHardwareInput, HingePlateInput, HingeRuleInput, ExistingHingeInput, HingeBoreHole,
  FaceGridInput,
} from '@/src/lib/resolver/types'

const DIM_KEYS = new Set(['dx', 'dy', 'dz'])

export async function dbLoadResolvedParts(cabinetIds: string[]): Promise<Map<string, ResolvedCabinet>> {
  if (cabinetIds.length === 0) return new Map()

  const [cp, tp, ip, fr, fc, fz, ci, hin] = await Promise.all([
    supabase.from('case_parts').select('*').in('cabinet_instance_id', cabinetIds),
    supabase.from('toekick_parts').select('*').in('cabinet_instance_id', cabinetIds),
    supabase.from('internal_parts').select('*').in('cabinet_instance_id', cabinetIds),
    supabase.from('face_rows').select('*').in('cabinet_instance_id', cabinetIds),
    supabase.from('face_cols').select('*').in('cabinet_instance_id', cabinetIds),
    supabase.from('face_zones').select('*').in('cabinet_instance_id', cabinetIds),
    supabase.from('cabinet_instances').select('id, carcase_joints, hidden_parts, face_grid').in('id', cabinetIds),
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
  const carcaseJointsById = new Map<string, Record<string, string | null>>()
  const hiddenById = new Map<string, string[]>()
  const faceGridById = new Map<string, FaceGridInput | null>()
  const jointTypeIds = new Set<string>()
  for (const row of (ci.data ?? []) as { id: string; carcase_joints: Record<string, string | null> | null; hidden_parts: string[] | null; face_grid: FaceGridInput | null }[]) {
    const joints = row.carcase_joints ?? {}
    carcaseJointsById.set(row.id, joints)
    hiddenById.set(row.id, row.hidden_parts ?? [])
    faceGridById.set(row.id, row.face_grid ?? null)
    for (const v of Object.values(joints)) if (v) jointTypeIds.add(v)
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
      jointOpsById[jid].push({
        id:                op.id as string,
        joint_type_id:     jid,
        operation_order:   op.operation_order as number,
        target_part:       op.target_part as JointTargetPart,
        machine_operation: op.machine_operation as JointMachineOp,
        face:              (op.face as JointFace) ?? 'normal',
        tool_diameter_mm:  op.tool_diameter_mm as number,
        depth_mm:          op.depth_mm as number,
        offset_x_mm:       (op.offset_x_mm as number) ?? 0,
        offset_y_mm:       (op.offset_y_mm as number) ?? 0,
        offset_z_mm:       (op.offset_z_mm as number) ?? 0,
        qty:               (op.qty as number) ?? 1,
        spacing_mm:        (op.spacing_mm as number | null) ?? null,
        router_tool_id:    (op.router_tool_id as string | null) ?? null,
        drill_id:          (op.drill_id as string | null) ?? null,
        auto_tool:         (op.auto_tool as boolean) ?? false,
        notes:             (op.notes as string | null) ?? null,
        expressions:       (op.expressions as Record<string, string> | null) ?? null,
      })
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
    const topKey = partKeys.has('full_top')   ? 'full_top'
                 : partKeys.has('front_rail') ? 'front_rail'
                 : partKeys.has('back_rail')  ? 'back_rail'
                 : null

    const candidateSeams: string[] = []
    if (partKeys.has('bottom')   && partKeys.has('left_side'))  candidateSeams.push('bottom:left_side')
    if (partKeys.has('bottom')   && partKeys.has('right_side')) candidateSeams.push('bottom:right_side')
    if (topKey && partKeys.has('left_side'))                    candidateSeams.push(`${topKey}:left_side`)
    if (topKey && partKeys.has('right_side'))                   candidateSeams.push(`${topKey}:right_side`)
    if (partKeys.has('back')     && partKeys.has('left_side'))  candidateSeams.push('back:left_side')
    if (partKeys.has('back')     && partKeys.has('right_side')) candidateSeams.push('back:right_side')
    if (partKeys.has('back')     && partKeys.has('bottom'))     candidateSeams.push('back:bottom')

    const seamJoints: ResolvedSeamJoint[] = []
    for (const seamKey of candidateSeams) {
      const jointTypeId = carcaseJoints[seamKey]
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

    const built: ResolvedCabinet = {
      cabinet_id: id,
      case_parts: myCase.map(p => ({
        part_key: p.part_key,
        DX: p.dx, DY: p.dy, DZ: p.dz,
        X: p.x, Y: p.y, Z: p.z,
        AX: p.ax, AY: p.ay, AZ: p.az,
        material_id: p.material_id,
        edge_band: { top: p.edge_band_top, bottom: p.edge_band_bottom, left: p.edge_band_left, right: p.edge_band_right },
      })),
      toekick_parts: myTk.map(p => ({
        part_key: p.part_key,
        sort_order: p.sort_order,
        is_detached: p.is_detached,
        DX: p.dx, DY: p.dy, DZ: p.dz,
        X: p.x, Y: p.y, Z: p.z,
        AX: p.ax, AY: p.ay, AZ: p.az,
        material_id: p.material_id,
        edge_band: { top: p.edge_band_top, bottom: p.edge_band_bottom, left: p.edge_band_left, right: p.edge_band_right },
      })),
      internal_parts: myInt.map(p => ({
        part_type: p.part_type,
        sort_order: p.sort_order,
        y_locked: p.y_locked,
        DX: p.dx, DY: p.dy, DZ: p.dz,
        X: p.x, Y: p.y, Z: p.z,
        AX: p.ax, AY: p.ay, AZ: p.az,
        material_id: p.material_id,
        // edge_band_front (DB) = right in resolver space (front DY edge)
        // edge_band_back  (DB) = left in resolver space
        edge_band: { top: p.edge_band_top, bottom: p.edge_band_bottom, left: p.edge_band_back, right: p.edge_band_front },
      })),
      face_rows: myRows.map(r => ({
        row_index: r.row_index, height: r.height, height_locked: r.height_locked,
      })),
      face_cols: myCols.map(c => ({
        col_index: c.col_index, width: c.width, width_locked: c.width_locked,
      })),
      face_zones: myZones.map(z => ({
        row_index: z.row_index, col_index: z.col_index,
        face_type: z.face_type, hinge_side: z.hinge_side ?? undefined,
        DX: z.dx, DY: z.dy, DZ: z.dz,
        X: z.x, Y: z.y, Z: z.z,
        AX: z.ax, AY: z.ay, AZ: z.az,
        material_id: z.material_id,
        edge_band: { top: z.edge_band_top, bottom: z.edge_band_bottom, left: z.edge_band_left, right: z.edge_band_right },
        door_style_id: z.door_style_id ?? null,
        door_profile_id: z.door_profile_id ?? null,
        door_profile: z.door_profile ?? null,
      })),
      drawer_stacks: [],
      internal_slides: [],
      seam_joints: seamJoints,
      hinge_instances: [],
      errors: [],
      warnings: [],
      hidden_parts: hiddenById.get(id) ?? [],
    }
    // Recover hinges (drills + 3D model fields) from the persisted instances so
    // they render in the canvas + edit modal without a live re-resolve.
    built.hinge_instances = reconstructHinges(id, built, instancesByCab, hardwareById, plateById, countRules, faceGridById.get(id) ?? null)
    // NB: left UNFILTERED — this map also feeds the edit modal, whose Parts tab
    // needs the full list. Consumers (canvas elevation/plan, reports, cut lists)
    // call filterHiddenParts() at render; the modal filters its own viewers.
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
  return resolveHinges(cab, built.face_zones, built.case_parts, built.internal_parts)
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

export async function dbResolveAndPersistCabinet(id: string): Promise<ResolvedCabinet | null> {
  try { return await resolveCabinetFromDB(id) } catch (e) { console.error('resolve after save:', e); return null }
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
  return {
    room_id: p.room_id, wall_id: p.wall_id,
    cabinet_definition_id: def.id,                 // audit / origin pointer only
    label: p.label, assembly_class: def.assembly_class,
    pos_x: p.pos_x, pos_y: p.pos_y, pos_z: 0, rotation: p.rotation,
    dx: p.dx != null && p.dx > 0 ? Math.round(p.dx) : def.default_dx,
    dy: def.default_dy, dz: def.default_dz,
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
    schema_version: '0.4', notes: null,
  }
}

// Insert a snapshot of custom parts (from a definition) as rows for a new cabinet.
export async function dbInsertCustomPartsSnapshot(cabinetId: string, snapshot: Record<string, unknown>[]) {
  if (!snapshot || snapshot.length === 0) return
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
    no_cnc: !!p.no_cnc,
    sort_order: (p.sort_order as number) ?? i,
  }))
  const { error } = await supabase.from('cabinet_custom_parts').insert(rows)
  if (error) console.error('dbInsertCustomPartsSnapshot', error)
}

// Copy a definition's stored custom parts onto a newly-placed cabinet.
export async function dbInsertDefinitionParts(definitionId: string, cabinetId: string) {
  const { data } = await supabase.from('cabinet_definitions').select('custom_parts').eq('id', definitionId).single()
  await dbInsertCustomPartsSnapshot(cabinetId, ((data?.custom_parts ?? []) as Record<string, unknown>[]))
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
  await dbInsertCustomPartsSnapshot(cabinet.id, (def.custom_parts ?? []) as Record<string, unknown>[])
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
  const { data: cps } = await supabase.from('cabinet_custom_parts')
    .select('part_library_id,name,dx,dy,dz,x,y,z,expressions,material_override_id,edge_top,edge_bottom,edge_left,edge_right,visible,no_cnc,sort_order')
    .eq('cabinet_instance_id', cabinetInstanceId).order('sort_order')

  const row = {
    name: opts.name,
    assembly_class: inst.assembly_class,
    category_id: opts.categoryId,
    subcategory_id: opts.subcategoryId,
    default_dx: inst.dx, default_dy: inst.dy, default_dz: inst.dz,
    has_carcass: inst.has_carcass, has_internal: inst.has_internal, has_face: inst.has_face, has_toekick: inst.has_toekick,
    top_type: inst.top_type, toe_type: inst.toe_type,
    construction_method_id: inst.construction_method_id,
    face_grid: inst.face_grid ?? {}, internal_grid: inst.internal_grid, carcase_joints: inst.carcase_joints ?? {},
    rule_overrides: {},
    material_overrides, hardware_overrides, toekick_overrides, drawerbox_overrides: {},
    exposed_interior: p.exposed_interior ? !!inst.exposed_interior : false,
    no_cnc: !!inst.no_cnc,
    custom_parts: cps ?? [],
    description: opts.description ?? null,
    is_library_item: true, active: true, sort_order,
  }
  const { data: created, error: insErr } = await supabase.from('cabinet_definitions').insert(row).select('id').single()
  if (insErr || !created) { console.error('saveCabinetToLibrary insert', insErr); return null }
  return created.id as string
}

export async function dbUpdateCabinet(
  id: string,
  u: Partial<CabinetInstance>,
): Promise<ResolvedCabinet | null> {
  const { error } = await supabase.from('cabinet_instances').update(u).eq('id', id)
  if (error) { console.error(error); return null }

  // Fast path: dimension-only change + cached input → resolve synchronously,
  // persist in background. Eliminates ~17 Supabase round-trips per resize.
  const keys = Object.keys(u)
  const cached = keys.length > 0 && keys.every(k => DIM_KEYS.has(k)) ? getCachedInput(id) : undefined
  if (cached) {
    const updated = {
      ...cached,
      ...(u.dx !== undefined && { DX: Number(u.dx) }),
      ...(u.dy !== undefined && { DY: Number(u.dy) }),
      ...(u.dz !== undefined && { DZ: Number(u.dz) }),
    }
    setCachedInput(id, updated)
    const resolved = resolveCabinet(updated)
    applyEdgeOverridesFromCache(resolved)
    resolved.hidden_parts = getCachedHidden(id) ?? []
    persistResolved(resolved).catch(e => console.error('persist:', e))
    return resolved
  }

  try { return await resolveCabinetFromDB(id) } catch (e) { console.error('resolve after update:', e); return null }
}

export async function dbDeleteCabinet(id: string) {
  const { error } = await supabase.from('cabinet_instances').delete().eq('id', id)
  if (error) console.error('dbDeleteCabinet', error)
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
  visible:             boolean
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

// ── Hidden Parts ──────────────────────────────────────────────────────────────
// Set of resolved-part IDs hidden from every viewer/report/cut list. Custom parts
// use cabinet_custom_parts.visible instead (handled in PartsView).

export type HiddenParts = string[]

export async function dbLoadHiddenParts(cabinetId: string): Promise<HiddenParts> {
  const { data } = await supabase
    .from('cabinet_instances').select('hidden_parts').eq('id', cabinetId).single()
  return ((data as { hidden_parts?: unknown } | null)?.hidden_parts ?? []) as HiddenParts
}

export async function dbSaveHiddenParts(cabinetId: string, hidden: HiddenParts): Promise<void> {
  const { error } = await supabase.from('cabinet_instances').update({ hidden_parts: hidden }).eq('id', cabinetId)
  if (error) console.error('[hidden parts save]', error)
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
