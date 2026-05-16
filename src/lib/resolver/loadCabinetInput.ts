import { supabase } from '@/src/lib/supabase'
import { CabinetInput, ConstructionRules, FaceGridInput, Material, DEFAULT_RULES } from './types'
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
  }
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

  // ── 2. Load room + shop default schedule IDs in parallel ────────────────────
  const [roomRes, shopAsmRes, shopTkRes, shopFrontRes] = await Promise.all([
    supabase.from('rooms').select('project_id, assembly_schedule_id, toekick_schedule_id, front_schedule_id').eq('id', cab.room_id).single(),
    supabase.from('assembly_schedules').select('id').eq('is_default', true).limit(1).maybeSingle(),
    supabase.from('toekick_schedules').select('id').eq('is_default', true).limit(1).maybeSingle(),
    supabase.from('front_schedules').select('id').eq('is_default', true).limit(1).maybeSingle(),
  ])

  const room      = roomRes.data
  const projectId = room?.project_id as string | undefined

  // ── 3. Load project schedule IDs (if we have a project) ─────────────────────
  let projRow: Record<string, string | null> | null = null
  if (projectId) {
    const { data } = await supabase
      .from('projects')
      .select('assembly_schedule_id, toekick_schedule_id, front_schedule_id')
      .eq('id', projectId)
      .single()
    projRow = data as Record<string, string | null> | null
  }

  // ── 4. Resolve effective schedule IDs: room → project → shop default ─────────
  const asmSchedId   = room?.assembly_schedule_id   ?? projRow?.assembly_schedule_id   ?? shopAsmRes.data?.id   ?? null
  const tkSchedId    = room?.toekick_schedule_id     ?? projRow?.toekick_schedule_id     ?? shopTkRes.data?.id    ?? null
  const frontSchedId = room?.front_schedule_id       ?? projRow?.front_schedule_id       ?? shopFrontRes.data?.id ?? null

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
    methodRes,
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
    supabase.from('hardware_slides').select('side_deduction').eq('active', true).order('created_at', { ascending: true }).limit(1).maybeSingle(),
    cab.construction_method_id
      ? supabase.from('construction_methods').select('rules').eq('id', cab.construction_method_id).single()
      : supabase.from('construction_methods').select('rules').eq('is_default', true).limit(1).maybeSingle(),
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
  const methodRules = (methodRes.data?.rules ?? {}) as Partial<ConstructionRules>
  const rules = mergeRules(DEFAULT_RULES, methodRules, (cab.rule_overrides ?? {}) as Partial<ConstructionRules>)

  // ── 8. Resolve required materials ───────────────────────────────────────────
  const interior = matMap.get('interior')
  const doorFace = matMap.get('door_face')
  const shelf    = matMap.get('shelf') ?? matMap.get('interior')
  const tkFace   = tkMap.get('face')
  const tkInt    = tkMap.get('interior')

  if (!interior) throw new Error(`No interior material for assembly_class: ${cab.assembly_class}`)
  if (!doorFace) throw new Error(`No door_face material for assembly_class: ${cab.assembly_class}`)
  if (!shelf)    throw new Error(`No shelf material`)
  if (!tkFace)   throw new Error(`No toekick face material`)
  if (!tkInt)    throw new Error(`No toekick interior material`)

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
    slide_side_deduction:      slideRes.data?.side_deduction ?? 13,
    rules,
    face_grid:     (cab.face_grid as FaceGridInput | null) ?? DEFAULT_FACE_GRID,
    adj_shelves:   [],
    fixed_shelves: [],
    inner_drawers: [],
  }
}
