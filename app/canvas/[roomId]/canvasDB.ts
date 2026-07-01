import { supabase } from '@/src/lib/supabase'
import type { Wall, CabinetInstance, CabinetDefinition, NeighbourType } from '@/src/lib/types'
import type { CustomOrient } from '@/src/lib/customPartBox'
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
  try {
    const resolved = await resolveCabinetFromDB(id)
    // Attach custom parts so room views (which read resolved.custom_parts) stay in
    // sync after a re-resolve instead of dropping them until a page reload.
    const { data } = await supabase.from('cabinet_custom_parts')
      .select('id,name,material_id,dx,dy,dz,x,y,z,edge_top,edge_bottom,edge_left,edge_right,visible,show_in_room,orientation')
      .eq('cabinet_instance_id', id)
    resolved.custom_parts = (data ?? []) as unknown as ResolvedCabinet['custom_parts']
    return resolved
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
  return {
    room_id: p.room_id, wall_id: p.wall_id,
    cabinet_definition_id: def.id,                 // audit / origin pointer only
    label: p.label, assembly_class: def.assembly_class,
    pos_x: p.pos_x, pos_y: p.pos_y, pos_z: 0, rotation: p.rotation,
    dx: p.dx != null && p.dx > 0 ? Math.round(p.dx) : def.default_dx,
    // Height/depth cascade unless the definition preserves that axis. A missing
    // cascade value (older callers) also falls back to the frozen default.
    dy: def.preserve_dy || p.cascade_dy == null ? def.default_dy : p.cascade_dy,
    dz: def.preserve_dz || p.cascade_dz == null ? def.default_dz : p.cascade_dz,
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
    show_in_room: p.show_in_room !== false,
    orientation: (p.orientation as string) ?? 'flat',
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
  const { data: cps } = await supabase.from('cabinet_custom_parts')
    .select('part_library_id,name,dx,dy,dz,x,y,z,expressions,material_override_id,edge_top,edge_bottom,edge_left,edge_right,visible,show_in_room,orientation,no_cnc,sort_order')
    .eq('cabinet_instance_id', cabinetInstanceId).order('sort_order')

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
  // Kick-run members are excluded: their width change reshapes the run's merged
  // kick (owned by the lead), which the single-cabinet fast path can't see — they
  // fall through to a full resolve, and the caller fans the run out (resolveKickRun).
  const keys = Object.keys(u)
  const cached = keys.length > 0 && keys.every(k => DIM_KEYS.has(k)) ? getCachedInput(id) : undefined
  if (cached && !cached.kick_run) {
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
  show_in_room:        boolean   // drawn in room plan / elevation / 3D when true
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
