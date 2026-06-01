import { supabase } from '@/src/lib/supabase'
import {
  CabinetInput, ConstructionRules, FaceGridInput, Section, EMPTY_SECTION, Material, DEFAULT_RULES,
  SlideProduct, SlideScheduleEntry, SlideDrillOp, DrawerBoxRules, DEFAULT_DB_RULES,
  JointTypeOp, JointTargetPart, JointMachineOp, JointFace,
  RawProfileOp, ResolvedDoorStyleInput,
} from './types'
import { mergeRules } from './mergeRules'

function dbRowToMaterial(row: Record<string, unknown>): Material {
  return {
    id:              row.id as string,
    name:            row.name as string,
    DZ:              Number(row.dz),
    sheet_dx:        Number(row.sheet_dx),
    sheet_dy:        Number(row.sheet_dy),
    has_grain:       Boolean(row.has_grain),
    grain_direction: row.grain_direction as Material['grain_direction'],
    face_colour:     (row.face_colour as string | null) ?? undefined,
    back_colour:     (row.back_colour as string | null) ?? undefined,
    edge_colour:     (row.edge_colour as string | null) ?? undefined,
  }
}

// Resolve the door-style cascade per zone (zone → room → job) and load each
// distinct style's catalogue thickness + profile operations. Returns a map
// keyed `${row}_${col}` for door zones that resolve to a style.
async function resolveDoorStyles(
  grid: FaceGridInput,
  roomStyleId: string | null,
  projStyleId: string | null,
): Promise<Record<string, ResolvedDoorStyleInput>> {
  // Effective style id per door zone (lowest set level wins).
  const zoneStyle = new Map<string, string>()
  for (const z of grid.zones) {
    if (z.face_type !== 'door') continue
    const styleId = z.door_style_id ?? roomStyleId ?? projStyleId ?? null
    if (styleId) zoneStyle.set(`${z.row_index}_${z.col_index}`, styleId)
  }
  const distinctIds = [...new Set(zoneStyle.values())]
  if (distinctIds.length === 0) return {}

  // One nested query: style → catalogue(thickness) → profile(+ops).
  const { data, error } = await supabase
    .from('door_styles')
    .select(`
      id, default_material_id,
      catalogue:door_catalogue ( thickness_mm ),
      profile:door_profiles (
        id, profile_type,
        ops:door_profile_operations ( operation_type, depth_mm, width_mm, offset_from_edge_mm, repeat_axis, spacing_mm, tool_diameter_mm, face, expressions, sort_order )
      )
    `)
    .in('id', distinctIds)
  if (error) { console.error('[loadCabinetInput] door_styles query error:', error); return {} }

  // Optional: resolve default colour → linked board material id (best effort).
  const colourIds = ((data ?? []) as { default_material_id: string | null }[])
    .map(r => r.default_material_id).filter((x): x is string => !!x)
  const colourMatById = new Map<string, string | null>()
  if (colourIds.length > 0) {
    const { data: cols } = await supabase
      .from('door_schedule_materials').select('id, material_id').in('id', colourIds)
    for (const c of (cols ?? []) as { id: string; material_id: string | null }[]) {
      colourMatById.set(c.id, c.material_id)
    }
  }

  type StyleRow = {
    id: string
    default_material_id: string | null
    catalogue: { thickness_mm: number } | null
    profile: { id: string; profile_type: string; ops: Record<string, unknown>[] } | null
  }
  const styleById = new Map<string, ResolvedDoorStyleInput>()
  for (const row of ((data ?? []) as unknown as StyleRow[])) {
    const ops: RawProfileOp[] = (row.profile?.ops ?? []).map(o => ({
      operation_type:      (o.operation_type as RawProfileOp['operation_type']) ?? 'route',
      depth_mm:            o.depth_mm != null ? Number(o.depth_mm) : null,
      width_mm:            o.width_mm != null ? Number(o.width_mm) : null,
      offset_from_edge_mm: o.offset_from_edge_mm != null ? Number(o.offset_from_edge_mm) : null,
      repeat_axis:         (o.repeat_axis as RawProfileOp['repeat_axis']) ?? 'none',
      spacing_mm:          o.spacing_mm != null ? Number(o.spacing_mm) : null,
      tool_diameter_mm:    o.tool_diameter_mm != null ? Number(o.tool_diameter_mm) : null,
      face:                (o.face as RawProfileOp['face']) ?? 'front',
      expressions:         (o.expressions as Record<string, string> | null) ?? null,
      sort_order:          (o.sort_order as number) ?? 0,
    }))
    styleById.set(row.id, {
      style_id:           row.id,
      profile_id:         row.profile?.id ?? null,
      thickness_mm:       row.catalogue?.thickness_mm != null ? Number(row.catalogue.thickness_mm) : 18,
      profile_type:       (row.profile?.profile_type as ResolvedDoorStyleInput['profile_type']) ?? null,
      ops,
      colour_material_id: row.default_material_id ? (colourMatById.get(row.default_material_id) ?? null) : null,
    })
  }

  const out: Record<string, ResolvedDoorStyleInput> = {}
  for (const [zoneKey, styleId] of zoneStyle) {
    const resolved = styleById.get(styleId)
    if (resolved) out[zoneKey] = resolved
  }
  return out
}

const DEFAULT_FACE_GRID: FaceGridInput = {
  rows:  [{ row_index: 0, height_locked: false }],
  cols:  [{ col_index: 0, width_locked: false }, { col_index: 1, width_locked: false }],
  zones: [
    { row_index: 0, col_index: 0, face_type: 'door', hinge_side: 'left' },
    { row_index: 0, col_index: 1, face_type: 'door', hinge_side: 'right' },
  ],
}

type MatRow = { material_role?: string; part_role?: string; materials: unknown }

function applyRows(
  rows: unknown[],
  roleKey: 'material_role' | 'part_role',
  target: Map<string, Material>,
) {
  for (const row of rows as MatRow[]) {
    const role = row[roleKey] as string | undefined
    if (role && row.materials) target.set(role, dbRowToMaterial(row.materials as Record<string, unknown>))
  }
}

export async function loadCabinetInput(cabinetId: string): Promise<CabinetInput> {
  // ── 1. Load cabinet ──────────────────────────────────────────────────────────
  const { data: cab, error: cabErr } = await supabase
    .from('cabinet_instances')
    .select('*')
    .eq('id', cabinetId)
    .single()

  if (cabErr || !cab) throw new Error(`Cabinet not found: ${cabinetId}`)

  // ── 2. Load room + shop defaults in parallel ─────────────────────────────────
  const [roomRes, shopAsmRes, shopTkRes, shopFrontRes, shopSettingsRes, shopSlideRes] = await Promise.all([
    supabase.from('rooms').select('project_id, assembly_schedule_id, toekick_schedule_id, front_schedule_id, construction_schedule_id, slide_schedule_id, inner_drawerbox_schedule_id, inner_drawer_box_method_id, door_style_override_id, rule_overrides').eq('id', cab.room_id).single(),
    supabase.from('assembly_schedules').select('id').eq('is_default', true).limit(1).maybeSingle(),
    supabase.from('toekick_schedules').select('id').eq('is_default', true).limit(1).maybeSingle(),
    supabase.from('front_schedules').select('id').eq('is_default', true).limit(1).maybeSingle(),
    supabase.from('shop_settings').select('construction_schedule_id, drawer_box_method_id, inner_drawerbox_schedule_id').limit(1).maybeSingle(),
    supabase.from('slide_schedules').select('id').eq('is_default', true).limit(1).maybeSingle(),
  ])

  const room       = roomRes.data
  const projectId  = room?.project_id as string | undefined
  const shopConStrSchedId    = shopSettingsRes.data?.construction_schedule_id     as string | undefined
  const shopDbMethodId       = shopSettingsRes.data?.drawer_box_method_id         as string | undefined
  const shopInnerSchedId     = shopSettingsRes.data?.inner_drawerbox_schedule_id  as string | undefined

  // ── 3. Load project schedule IDs (if we have a project) ─────────────────────
  let projRow: Record<string, string | null> | null = null
  if (projectId) {
    const { data } = await supabase
      .from('projects')
      .select('assembly_schedule_id, toekick_schedule_id, front_schedule_id, construction_schedule_id, drawer_box_method_id, inner_drawerbox_schedule_id, slide_schedule_id, default_door_style_id, rule_overrides')
      .eq('id', projectId)
      .single()
    projRow = data as Record<string, string | null> | null
  }

  // Effective drawer box method: project overrides shop default
  const effectiveDbMethodId = projRow?.drawer_box_method_id ?? shopDbMethodId ?? null

  // inner_drawer_box_method_id is a newer column — read it defensively (separate from
  // the main config selects) so the resolver keeps working if the ALTER hasn't been
  // applied yet: a missing column yields { error, data: null } here, not a throw, and
  // we fall back to the face method below.
  const [shopInnerMethodRes, projInnerMethodRes] = await Promise.all([
    supabase.from('shop_settings').select('inner_drawer_box_method_id').limit(1).maybeSingle(),
    projectId
      ? supabase.from('projects').select('inner_drawer_box_method_id').eq('id', projectId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const shopInnerDbMethodId = (shopInnerMethodRes.data as { inner_drawer_box_method_id?: string | null } | null)?.inner_drawer_box_method_id ?? undefined
  const projInnerDbMethodId = (projInnerMethodRes.data as { inner_drawer_box_method_id?: string | null } | null)?.inner_drawer_box_method_id ?? undefined

  // Inner-drawer method: room → project → shop, falling back to the face method
  // (so inner drawers still resolve sensibly before a dedicated inner method is
  // configured). Per-fitting `drawer_box_method_id` overrides this in fittings.ts.
  const roomInnerDbMethodId = (room as { inner_drawer_box_method_id?: string | null } | null)?.inner_drawer_box_method_id ?? undefined
  const effectiveInnerDbMethodId =
    roomInnerDbMethodId ?? projInnerDbMethodId ?? shopInnerDbMethodId ?? effectiveDbMethodId ?? null

  // Inner-drawer material schedule: room → project → shop.
  const effectiveInnerSchedId =
    (room?.inner_drawerbox_schedule_id as string | null | undefined)
    ?? (projRow?.inner_drawerbox_schedule_id as string | null | undefined)
    ?? shopInnerSchedId
    ?? null

  // Resolve effective construction method schedule: room → project → shop
  const conStrSchedId =
    (room?.construction_schedule_id as string | null)
    ?? projRow?.construction_schedule_id
    ?? shopConStrSchedId
    ?? null

  // ── 4. Resolve effective schedule IDs: room → project → shop default ─────────
  const asmSchedId   = room?.assembly_schedule_id   ?? projRow?.assembly_schedule_id   ?? shopAsmRes.data?.id   ?? null
  const tkSchedId    = room?.toekick_schedule_id     ?? projRow?.toekick_schedule_id     ?? shopTkRes.data?.id    ?? null
  const frontSchedId = room?.front_schedule_id       ?? projRow?.front_schedule_id       ?? shopFrontRes.data?.id ?? null
  const slideSchedId = (room?.slide_schedule_id as string | null) ?? (projRow?.slide_schedule_id as string | null) ?? shopSlideRes.data?.id ?? null

  // ── 5. Load schedule rows + per-role overrides + construction method in parallel
  const [
    asmRowsRes,
    frontRowsRes,
    tkRowsRes,
    jobMatsRes,
    jobTkRes,
    roomMatsRes,
    roomTkRes,
    slideRes,
    slideOpsRes,
    methodRes,
    conStrSchedRowRes,
    slideSchedEntryRes,
    dbMethodRes,
    innerDbMethodRes,
    innerSchedRes,
  ] = await Promise.all([
    asmSchedId
      ? supabase.from('assembly_schedule_rows').select('material_role, edgeband_id, materials(*)').eq('schedule_id', asmSchedId).eq('assembly_class', cab.assembly_class)
      : Promise.resolve({ data: [] as unknown[] }),
    frontSchedId
      ? supabase.from('front_schedule_rows').select('edgeband_id, materials(*)').eq('schedule_id', frontSchedId).eq('assembly_class', cab.assembly_class).maybeSingle()
      : Promise.resolve({ data: null }),
    tkSchedId
      ? supabase.from('toekick_schedule_rows').select('part_role, edgeband_id, materials(*)').eq('schedule_id', tkSchedId)
      : Promise.resolve({ data: [] as unknown[] }),
    projectId
      ? supabase.from('job_materials').select('material_role, materials(*)').eq('project_id', projectId).eq('assembly_class', cab.assembly_class)
      : Promise.resolve({ data: [] as unknown[] }),
    projectId
      ? supabase.from('job_toekick_materials').select('part_role, materials(*)').eq('project_id', projectId)
      : Promise.resolve({ data: [] as unknown[] }),
    supabase.from('room_materials').select('material_role, materials(*)').eq('room_id', cab.room_id).eq('assembly_class', cab.assembly_class),
    supabase.from('room_toekick_materials').select('part_role, materials(*)').eq('room_id', cab.room_id),
    // All active slide products (for resolver lookup)
    supabase
      .from('hardware_slides')
      .select('id, name, brand, nominal_length, box_height, runner_thickness, side_deduction, min_runner_depth, max_runner_depth, soft_close, full_extension, cost_per_pair, colour, model_url, model_format, model_scale, model_anchor_x, model_anchor_y, model_anchor_z')
      .eq('active', true)
      .order('nominal_length', { ascending: true }),
    // Slide drilling operations (child rows of hardware_slides), grouped onto
    // each slide product below.
    supabase
      .from('drawer_slide_operations')
      .select('id, slide_id, operation_order, target_surface, machine_operation, tool_diameter_mm, depth_mm, along_off_mm, up_off_mm, qty, spacing_mm, repeat_axis, side, tool, notes, expressions')
      .order('operation_order'),
    cab.construction_method_id
      ? supabase.from('construction_methods').select('rules').eq('id', cab.construction_method_id).single()
      : supabase.from('construction_methods').select('rules').eq('is_default', true).limit(1).maybeSingle(),
    // Construction method schedule row for this assembly class
    conStrSchedId
      ? supabase.from('construction_method_schedule_rows').select('rules, joint_defaults').eq('schedule_id', conStrSchedId).eq('assembly_class', cab.assembly_class).maybeSingle()
      : Promise.resolve({ data: null }),
    slideSchedId
      ? supabase.from('slide_schedule_entries').select('id, schedule_id, depth_threshold, height_threshold, slide_id').eq('schedule_id', slideSchedId).order('depth_threshold').order('height_threshold')
      : Promise.resolve({ data: [] as unknown[] }),
    // Drawer box method rules (project → shop cascade, resolved above)
    effectiveDbMethodId
      ? supabase.from('drawer_box_methods').select('rules, drawer_type').eq('id', effectiveDbMethodId).single()
      : Promise.resolve({ data: null }),
    // Inner-drawer method rules (project → shop → face fallback)
    effectiveInnerDbMethodId
      ? supabase.from('drawer_box_methods').select('rules, drawer_type').eq('id', effectiveInnerDbMethodId).single()
      : Promise.resolve({ data: null }),
    // Inner-drawer material schedule (room → project → shop) with embedded materials
    // for box / bottom / front roles.
    effectiveInnerSchedId
      ? supabase
          .from('inner_drawerbox_schedules')
          .select('material_id, edgeband_id, bottom_material_id, bottom_edgeband_id, front_material_id, front_edgeband_id, material:materials!inner_drawerbox_schedules_material_id_fkey(*), bottom_material:materials!inner_drawerbox_schedules_bottom_material_id_fkey(*), front_material:materials!inner_drawerbox_schedules_front_material_id_fkey(*)')
          .eq('id', effectiveInnerSchedId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  // ── 6. Build material maps through cascade ───────────────────────────────────
  const matMap = new Map<string, Material>()
  const tkMap  = new Map<string, Material>()
  const ebMap  = new Map<string, string>()  // role → edgeband_id

  type AsmRow = MatRow & { material_role?: string; edgeband_id?: string | null }
  type TkRow  = MatRow & { part_role?: string;     edgeband_id?: string | null }
  type FrontRow = MatRow & { edgeband_id?: string | null }

  // Assembly schedule rows (excludes door_face — that comes from front schedule)
  for (const row of ((asmRowsRes as { data: unknown[] }).data ?? []) as AsmRow[]) {
    if (row.material_role && row.materials) {
      matMap.set(row.material_role, dbRowToMaterial(row.materials as Record<string, unknown>))
      if (row.edgeband_id) ebMap.set(row.material_role, row.edgeband_id)
    }
  }

  // Front schedule → door_face
  const frontRow = (frontRowsRes as { data: unknown }).data as FrontRow | null
  if (frontRow?.materials) {
    matMap.set('door_face', dbRowToMaterial(frontRow.materials as Record<string, unknown>))
    if (frontRow.edgeband_id) ebMap.set('door_face', frontRow.edgeband_id)
  }

  // Toekick schedule rows
  for (const row of ((tkRowsRes as { data: unknown[] }).data ?? []) as TkRow[]) {
    if (row.part_role && row.materials) {
      tkMap.set(row.part_role, dbRowToMaterial(row.materials as Record<string, unknown>))
      if (row.edgeband_id) ebMap.set(`tk_${row.part_role}`, row.edgeband_id)
    }
  }

  // Per-role overrides: job → room (each can override any role incl. door_face)
  applyRows((jobMatsRes  as { data: unknown[] }).data ?? [], 'material_role', matMap)
  applyRows((roomMatsRes as { data: unknown[] }).data ?? [], 'material_role', matMap)
  applyRows((jobTkRes    as { data: unknown[] }).data ?? [], 'part_role',     tkMap)
  applyRows((roomTkRes   as { data: unknown[] }).data ?? [], 'part_role',     tkMap)

  // Cabinet-level material_overrides JSONB: { role: material_id }
  const matOverrides = (cab.material_overrides ?? {}) as Record<string, string>
  if (Object.keys(matOverrides).length > 0) {
    const overrideIds = Object.values(matOverrides)
    const { data: overrideMats } = await supabase.from('materials').select('*').in('id', overrideIds)
    const byId = new Map((overrideMats ?? []).map(m => [m.id, dbRowToMaterial(m as Record<string, unknown>)]))
    for (const [role, matId] of Object.entries(matOverrides)) {
      const mat = byId.get(matId)
      if (mat) matMap.set(role, mat)
    }
  }

  // ── 7. Build construction rules ──────────────────────────────────────────────
  // Cascade: system defaults → schedule row → cabinet method → project overrides → room overrides → cabinet overrides
  const scheduleRules = (conStrSchedRowRes.data?.rules ?? {}) as Partial<ConstructionRules>
  const methodRules   = (methodRes.data?.rules ?? {}) as Partial<ConstructionRules>
  const projRules     = ((projRow as Record<string, unknown> | null)?.rule_overrides ?? {}) as Partial<ConstructionRules>
  const roomRules     = ((room as Record<string, unknown> | null)?.rule_overrides   ?? {}) as Partial<ConstructionRules>
  const rules = mergeRules(DEFAULT_RULES, scheduleRules, methodRules, projRules, roomRules, (cab.rule_overrides ?? {}) as Partial<ConstructionRules>)

  // ── 8. Resolve required materials ───────────────────────────────────────────
  const interior   = matMap.get('interior')
  const doorFace   = matMap.get('door_face')
  const shelf      = matMap.get('shelf') ?? matMap.get('interior')
  const tkFace     = tkMap.get('face')
  const tkInt      = tkMap.get('interior')
  const drawerboxMat = matMap.get('drawerbox') ?? matMap.get('interior')

  if (!interior) throw new Error(`No interior material for assembly_class: ${cab.assembly_class}`)
  if (!doorFace) throw new Error(`No door_face material for assembly_class: ${cab.assembly_class}`)
  if (!shelf)    throw new Error(`No shelf material`)
  if (!tkFace)   throw new Error(`No toekick face material`)
  if (!tkInt)    throw new Error(`No toekick interior material`)

  // ── 9. Build slide products list ────────────────────────────────────────────
  // Group slide drilling ops by slide_id so each product carries its own holes.
  const slideOpsBySlideId = new Map<string, SlideDrillOp[]>()
  for (const o of (((slideOpsRes as { data: unknown[] | null }).data ?? []) as Record<string, unknown>[])) {
    const sid = o.slide_id as string
    const arr = slideOpsBySlideId.get(sid) ?? []
    arr.push({
      id:                o.id as string,
      slide_id:          sid,
      operation_order:   Number(o.operation_order ?? 0),
      target_surface:    o.target_surface as SlideDrillOp['target_surface'],
      machine_operation: o.machine_operation as SlideDrillOp['machine_operation'],
      tool_diameter_mm:  Number(o.tool_diameter_mm ?? 5),
      depth_mm:          Number(o.depth_mm ?? 12),
      along_off_mm:      Number(o.along_off_mm ?? 0),
      up_off_mm:         Number(o.up_off_mm ?? 0),
      qty:               Number(o.qty ?? 1),
      spacing_mm:        o.spacing_mm == null ? null : Number(o.spacing_mm),
      repeat_axis:       (o.repeat_axis as 'along' | 'up') ?? 'up',
      side:              (o.side as SlideDrillOp['side']) ?? 'both',
      tool:              (o.tool as string | null) ?? null,
      notes:             (o.notes as string | null) ?? null,
      expressions:       (o.expressions as Record<string, string> | null) ?? null,
    })
    slideOpsBySlideId.set(sid, arr)
  }

  type SlideRow = Record<string, unknown>
  const slideRows = ((slideRes as { data: unknown[] | null }).data ?? []) as SlideRow[]
  const slideProducts: SlideProduct[] = slideRows.map(r => ({
    id:               r.id as string,
    name:             r.name as string,
    brand:            (r.brand as string | null) ?? null,
    nominal_length:   r.nominal_length != null ? Number(r.nominal_length) : null,
    box_height:       r.box_height     != null ? Number(r.box_height)     : null,
    runner_thickness: r.runner_thickness != null ? Number(r.runner_thickness) : 12,
    side_deduction:   Number(r.side_deduction ?? 13),
    min_runner_depth: r.min_runner_depth != null ? Number(r.min_runner_depth) : null,
    max_runner_depth: r.max_runner_depth != null ? Number(r.max_runner_depth) : null,
    soft_close:       Boolean(r.soft_close),
    full_extension:   Boolean(r.full_extension),
    cost_per_pair:    r.cost_per_pair != null ? Number(r.cost_per_pair) : null,
    colour:           (r.colour as string | null) ?? null,
    model_url:        (r.model_url as string | null) ?? null,
    model_format:     (r.model_format as 'glb' | 'stl' | 'obj' | null) ?? null,
    model_scale:      r.model_scale    != null ? Number(r.model_scale)    : 1,
    model_anchor_x:   r.model_anchor_x != null ? Number(r.model_anchor_x) : 0,
    model_anchor_y:   r.model_anchor_y != null ? Number(r.model_anchor_y) : 0,
    model_anchor_z:   r.model_anchor_z != null ? Number(r.model_anchor_z) : 0,
    drill_ops:        slideOpsBySlideId.get(r.id as string) ?? [],
  }))

  type SlideEntryRow = { id: string; schedule_id: string; depth_threshold: unknown; height_threshold: unknown; slide_id: string }
  const slideSchedule: SlideScheduleEntry[] = ((slideSchedEntryRes as { data: SlideEntryRow[] | null }).data ?? []).map(r => ({
    id:               r.id,
    schedule_id:      r.schedule_id,
    depth_threshold:  Number(r.depth_threshold),
    height_threshold: Number(r.height_threshold),
    slide_id:         r.slide_id,
  }))

  // Drawer box rules cascade: system defaults → method (project/shop) → cabinet overrides
  const dbMethodRules = (dbMethodRes.data?.rules ?? {}) as Partial<DrawerBoxRules>
  const drawerBoxRules: DrawerBoxRules = {
    ...DEFAULT_DB_RULES,
    ...dbMethodRules,
    ...((cab.drawerbox_overrides ?? {}) as Partial<DrawerBoxRules>),
  }

  // Inner-drawer rules: system defaults → inner method (project/shop → face fallback).
  const innerDbMethodRules = (innerDbMethodRes.data?.rules ?? {}) as Partial<DrawerBoxRules>
  const innerDrawerBoxRules: DrawerBoxRules = {
    ...DEFAULT_DB_RULES,
    ...innerDbMethodRules,
  }

  // Inner-drawer material + edgeband (per role: box / bottom / front).
  // Schedule → face drawerbox material → interior. Each role falls back independently
  // so a partially-configured schedule still resolves sensibly.
  const innerSchedRow = innerSchedRes.data as {
    material_id?: string | null
    edgeband_id?: string | null
    bottom_material_id?: string | null
    bottom_edgeband_id?: string | null
    front_material_id?: string | null
    front_edgeband_id?: string | null
    material?: unknown
    bottom_material?: unknown
    front_material?: unknown
  } | null
  const innerDrawerMat  = innerSchedRow?.material
    ? dbRowToMaterial(innerSchedRow.material as Record<string, unknown>)
    : (drawerboxMat ?? interior)
  const innerDrawerEbId = (innerSchedRow?.edgeband_id as string | null | undefined) ?? ebMap.get('interior')

  const innerDrawerBottomMat  = innerSchedRow?.bottom_material
    ? dbRowToMaterial(innerSchedRow.bottom_material as Record<string, unknown>)
    : undefined
  const innerDrawerBottomEbId = (innerSchedRow?.bottom_edgeband_id as string | null | undefined) ?? undefined

  const innerDrawerFrontMat  = innerSchedRow?.front_material
    ? dbRowToMaterial(innerSchedRow.front_material as Record<string, unknown>)
    : undefined
  const innerDrawerFrontEbId = (innerSchedRow?.front_edgeband_id as string | null | undefined) ?? undefined

  // Fallback side_deduction from first slide product
  const fallbackDeduction = slideProducts[0]?.side_deduction ?? 13

  // ── 10. Resolve joint type operations ───────────────────────────────────────
  const cabJoints    = (cab.carcase_joints ?? {}) as Record<string, string | null>
  const cmSchedRow   = conStrSchedRowRes.data as Record<string, unknown> | null
  const jointDefaults = (cmSchedRow?.joint_defaults ?? {}) as Record<string, string>

  // Collect all joint type IDs referenced in either map
  const jointTypeIds = new Set<string>()
  for (const v of Object.values(cabJoints))    if (v) jointTypeIds.add(v)
  for (const v of Object.values(jointDefaults)) if (v) jointTypeIds.add(v)

  const jointTypeOps:   Record<string, JointTypeOp[]> = {}
  const jointTypeNames: Record<string, string>          = {}

  if (jointTypeIds.size > 0) {
    const ids = [...jointTypeIds]
    const [opsRes, namesRes] = await Promise.all([
      supabase.from('joint_type_operations').select('*').in('joint_type_id', ids).order('operation_order'),
      supabase.from('joint_types').select('id, name').in('id', ids),
    ])

    if (opsRes.error)   console.error('[loadCabinetInput] joint_type_operations query error:', opsRes.error)
    if (namesRes.error) console.error('[loadCabinetInput] joint_types query error:', namesRes.error)

    for (const op of ((opsRes.data ?? []) as Record<string, unknown>[])) {
      const jid = op.joint_type_id as string
      if (!jointTypeOps[jid]) jointTypeOps[jid] = []
      jointTypeOps[jid].push({
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
        tool:              (op.tool as string | null) ?? null,
        notes:             (op.notes as string | null) ?? null,
        expressions:       (op.expressions as Record<string, string> | null) ?? null,
      })
    }

    for (const n of ((namesRes.data ?? []) as { id: string; name: string }[])) {
      jointTypeNames[n.id] = n.name
    }
  }

  // ── 11. Resolve per-fitting drawer_box_method_id overrides ──────────────────
  // Scan the internal tree for distinct drawer_box_method_id values on inner-drawer
  // fittings; pre-fetch their rules so the resolver's fitting registry can pick
  // per-fitting rules without async work inside the resolver itself.
  const internalTree: Section = ((cab.internal_grid as { tree?: Section } | null)?.tree) ?? EMPTY_SECTION
  const methodIdsInTree = new Set<string>()
  const visit = (s: unknown): void => {
    const sec = s as Record<string, unknown> | null
    if (!sec || typeof sec !== 'object') return
    if (sec.type === 'open' && Array.isArray(sec.fittings)) {
      for (const f of sec.fittings as Record<string, unknown>[]) {
        if (f?.type === 'inner_drawer' && typeof f.drawer_box_method_id === 'string') {
          methodIdsInTree.add(f.drawer_box_method_id)
        }
      }
    } else if ((sec.type === 'hsplit' || sec.type === 'vsplit') && Array.isArray(sec.children)) {
      for (const c of sec.children as Record<string, unknown>[]) visit(c?.section)
    }
  }
  visit(internalTree)

  const methodRulesById: Record<string, DrawerBoxRules> = {}
  if (methodIdsInTree.size > 0) {
    const { data: rows } = await supabase
      .from('drawer_box_methods')
      .select('id, rules')
      .in('id', [...methodIdsInTree])
    for (const row of ((rows ?? []) as { id: string; rules: unknown }[])) {
      methodRulesById[row.id] = {
        ...DEFAULT_DB_RULES,
        ...((row.rules ?? {}) as Partial<DrawerBoxRules>),
      }
    }
  }

  // ── 12. Resolve door styles per zone (cascade: zone → room → job) ───────────
  const faceGridInput = (cab.face_grid as FaceGridInput | null) ?? DEFAULT_FACE_GRID
  const resolvedDoors = await resolveDoorStyles(
    faceGridInput,
    (room?.door_style_override_id as string | null | undefined) ?? null,
    (projRow?.default_door_style_id as string | null | undefined) ?? null,
  )

  return {
    id:              cab.id,
    assembly_class:  cab.assembly_class,
    label:           cab.label ?? undefined,
    DX:              Number(cab.dx),
    DY:              Number(cab.dy),
    DZ:              Number(cab.dz),
    has_carcass:     cab.has_carcass,
    has_internal:    cab.has_internal,
    has_face:        cab.has_face,
    has_toekick:     cab.has_toekick,
    top_type:        cab.top_type ?? undefined,
    toe_type:        cab.toe_type ?? undefined,
    left_neighbour:  (cab.left_neighbour_type  ?? 'wall') as CabinetInput['left_neighbour'],
    right_neighbour: (cab.right_neighbour_type ?? 'wall') as CabinetInput['right_neighbour'],
    exposed_interior: cab.exposed_interior,
    material:                  interior,
    door_material:             doorFace,
    shelf_material:            shelf,
    toekick_face_material:     tkFace,
    toekick_interior_material: tkInt,
    interior_edgeband_id:         ebMap.get('interior'),
    door_edgeband_id:             ebMap.get('door_face'),
    shelf_edgeband_id:            ebMap.get('shelf') ?? ebMap.get('interior'),
    toekick_face_edgeband_id:     ebMap.get('tk_face'),
    toekick_interior_edgeband_id: ebMap.get('tk_interior'),
    slide_side_deduction:      fallbackDeduction,
    default_drawer_type:       (dbMethodRes.data?.drawer_type as 'system' | 'five_piece' | null) ?? undefined,
    default_inner_drawer_type: (innerDbMethodRes.data?.drawer_type as 'system' | 'five_piece' | null)
                               ?? (dbMethodRes.data?.drawer_type as 'system' | 'five_piece' | null)
                               ?? undefined,
    drawer_material:           drawerboxMat ?? interior,
    drawer_box_rules:          drawerBoxRules,
    inner_drawer_box_rules:           innerDrawerBoxRules,
    inner_drawer_material:            innerDrawerMat,
    inner_drawer_edgeband_id:         innerDrawerEbId,
    inner_drawer_bottom_material:     innerDrawerBottomMat,
    inner_drawer_bottom_edgeband_id:  innerDrawerBottomEbId,
    inner_drawer_front_material:      innerDrawerFrontMat,
    inner_drawer_front_edgeband_id:   innerDrawerFrontEbId,
    slide_products:            slideProducts,
    slide_schedule:            slideSchedule,
    rules,
    carcase_joints:   cabJoints,
    joint_defaults:   jointDefaults,
    joint_type_ops:   jointTypeOps,
    joint_type_names: jointTypeNames,
    face_grid:     faceGridInput,
    resolved_doors: resolvedDoors,
    // Internal layout: recursive section tree stored as internal_grid = { tree }.
    // Anything without a tree (e.g. legacy flat grids) resolves to an empty interior.
    internal_tree: internalTree,
    // Per-cabinet override for the vertical gap between stacked fittings,
    // stored alongside the tree as internal_grid.stack_gap. Unset → resolver
    // default (DEFAULT_STACK_GAP = 3mm).
    internal_stack_gap: (() => {
      const g = (cab.internal_grid as { stack_gap?: unknown } | null)?.stack_gap
      return typeof g === 'number' && g >= 0 ? g : undefined
    })(),
    drawer_box_method_rules: methodRulesById,
  }
}
