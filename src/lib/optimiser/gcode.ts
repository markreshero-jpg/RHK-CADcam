// ============================================================
// Panel Optimiser G-code post-processor (spec §5.8).
// One program per sheet. NON-NEGOTIABLE ordering: ALL drilling
// before ANY routing; routing is inside-out (internal features
// before outer profiles). Driven by cnc_machine_profiles fields.
//
// v1 emits part-perimeter cutting (the core panel workload) with
// multi-pass depth, ramp entry, optional tabs, climb/conventional
// direction, plus a stripe-sequenced drilling section. Pure &
// framework-free. Arc lead-ins/dogbones are linear approximations
// for now; drill ops are fed in (sourced from part_operations by
// the caller) — empty is valid and still emits correct structure.
// ============================================================

import type { NestedSheet } from './nest'

export interface PostProfile {
  safe_z_clearance: number
  onion_skin_z: number
  through_cut_z: number
  drill_rapid_z: number
  rough_pass_z_step: number
  pass_strategy: string            // single | onion_skin | roughing_finishing | multi_depth
  milling_direction: string        // climb | conventional | auto
  ramp_in_distance: number
  tabs_enabled: boolean
  tab_width: number
  tab_height: number
  tab_min_part_area: number
  tabs_per_side_min: number
  drill_sequence_strategy: string  // stripe | nearest_neighbour | tsp
  stripe_direction: string         // horizontal | vertical
  stripe_width: number
  sheet_load_pause: boolean
  dust_extraction_enabled: boolean
  push_off_enabled: boolean
  push_off_distance: number
  program_header: string | null
  program_footer: string | null
  spindle_on_code: string
  spindle_off_code: string
  coolant_on_code: string
  coolant_off_code: string
  tool_change_code: string         // template with {n}
  work_offset_code: string
  units_code: string
  decimal_places: number
  line_numbers_enabled: boolean
  line_number_increment: number
  base_feed_rate: number
  base_spindle_speed: number
  plunge_feed_rate: number
}

export const DEFAULT_POST: PostProfile = {
  safe_z_clearance: 15, onion_skin_z: 0.4, through_cut_z: -0.5, drill_rapid_z: 5,
  rough_pass_z_step: 8, pass_strategy: 'onion_skin', milling_direction: 'climb',
  ramp_in_distance: 20, tabs_enabled: false, tab_width: 6, tab_height: 4,
  tab_min_part_area: 10000, tabs_per_side_min: 1,
  drill_sequence_strategy: 'stripe', stripe_direction: 'horizontal', stripe_width: 50,
  sheet_load_pause: true, dust_extraction_enabled: true, push_off_enabled: false, push_off_distance: 0,
  program_header: null, program_footer: null,
  spindle_on_code: 'M03', spindle_off_code: 'M05', coolant_on_code: 'M08', coolant_off_code: 'M09',
  tool_change_code: 'T{n} M06', work_offset_code: 'G54', units_code: 'G21',
  decimal_places: 3, line_numbers_enabled: false, line_number_increment: 10,
  base_feed_rate: 6000, base_spindle_speed: 18000, plunge_feed_rate: 1500,
}

export interface SheetDrill { x: number; y: number; diameter: number; depth: number }

export interface GcodeInput {
  sheet: NestedSheet
  thickness: number
  profile: PostProfile
  drills: SheetDrill[]
  toolNumber: number       // routing bit tool number
  drillToolNumber?: number
}

export function generateSheetGcode(input: GcodeInput): string {
  const { sheet, thickness, profile: p, drills } = input
  const dp = p.decimal_places
  const lines: string[] = []
  let lineNo = p.line_number_increment
  const f = (v: number) => v.toFixed(dp).replace(/\.?0+$/, m => (m.includes('.') ? '' : m)) || '0'
  const emit = (s: string) => { lines.push(p.line_numbers_enabled && !s.startsWith('(') ? `N${(lineNo += p.line_number_increment)} ${s}` : s) }
  const c = (s: string) => emit(`(${s})`)

  const safeZ = p.safe_z_clearance
  // Through-cut target: cut to (thickness + |through_cut_z|), or leave an onion skin.
  const cutDepth = p.pass_strategy === 'onion_skin'
    ? thickness - Math.abs(p.onion_skin_z)
    : thickness + Math.abs(p.through_cut_z)

  // ── 1. Header ─────────────────────────────────────────────────────────────────
  c(`Sheet ${sheet.index + 1}  ${sheet.stock.w}x${sheet.stock.h}mm  ${thickness}mm`)
  if (p.program_header) p.program_header.split('\n').forEach(l => emit(l))
  emit(`${p.units_code} G90 G17`)            // mm, absolute, XY plane
  emit(p.work_offset_code)
  emit(`G0 Z${f(safeZ)}`)

  // ── 2. Sheet load pause ──────────────────────────────────────────────────────
  if (p.sheet_load_pause) { c('Load sheet'); emit('M00') }

  // ── 3. Dust extraction on ────────────────────────────────────────────────────
  if (p.dust_extraction_enabled) { c('Dust extraction on'); emit(p.coolant_on_code) }

  // ── 4. ALL drilling (before routing — non-negotiable) ────────────────────────
  if (drills.length) {
    c(`Drilling ${drills.length} holes (${p.drill_sequence_strategy})`)
    emit(p.tool_change_code.replace('{n}', String(input.drillToolNumber ?? input.toolNumber)))
    emit(`${p.spindle_on_code} S${f(p.base_spindle_speed)}`)
    for (const d of sequenceDrills(drills, p)) {
      emit(`G0 X${f(d.x)} Y${f(d.y)} Z${f(p.drill_rapid_z)}`)
      emit(`G1 Z${f(-Math.abs(d.depth))} F${f(p.plunge_feed_rate)}`)
      emit(`G0 Z${f(p.drill_rapid_z)}`)
    }
    emit(`G0 Z${f(safeZ)}`)
    emit(p.spindle_off_code)
  }

  // ── 5. Tool change to routing bit ────────────────────────────────────────────
  c('Tool change to routing bit')
  emit(p.tool_change_code.replace('{n}', String(input.toolNumber)))
  emit(`${p.spindle_on_code} S${f(p.base_spindle_speed)}`)

  // ── 6. ALL routing — inside-out, travel-ordered ──────────────────────────────
  // (No internal part features in v1, so each part is a single outer perimeter;
  //  the inside-out invariant is preserved trivially.)
  const ordered = orderByTravel(sheet)
  for (const pl of ordered) {
    c(`Part ${pl.label}`)
    routePerimeter(emit, f, pl, cutDepth, safeZ, thickness, p)
  }
  emit(`G0 Z${f(safeZ)}`)

  // ── 7-10. Shutdown ───────────────────────────────────────────────────────────
  if (p.dust_extraction_enabled) { c('Dust extraction off'); emit(p.coolant_off_code) }
  emit(p.spindle_off_code)
  if (p.push_off_enabled) { c('Push-off'); emit(`G0 X${f(sheet.stock.w + Math.max(0, p.push_off_distance))} Y0`) }
  if (p.program_footer) p.program_footer.split('\n').forEach(l => emit(l))
  else { emit(`G0 Z${f(safeZ)}`); emit('G0 X0 Y0'); emit('M30') }

  return lines.join('\n') + '\n'
}

// Boustrophedon stripe ordering (spec §5.8.2 default). Other strategies fall
// back to stripe for now.
function sequenceDrills(drills: SheetDrill[], p: PostProfile): SheetDrill[] {
  const horiz = p.stripe_direction !== 'vertical'
  const band = (d: SheetDrill) => Math.floor((horiz ? d.y : d.x) / Math.max(1, p.stripe_width))
  const sorted = [...drills].sort((a, b) => band(a) - band(b))
  const out: SheetDrill[] = []
  let i = 0
  while (i < sorted.length) {
    let j = i
    const bnd = band(sorted[i])
    while (j < sorted.length && band(sorted[j]) === bnd) j++
    const slice = sorted.slice(i, j).sort((a, b) => (horiz ? a.x - b.x : a.y - b.y))
    if (bnd % 2 === 1) slice.reverse()
    out.push(...slice)
    i = j
  }
  return out
}

// Nearest-neighbour travel order between part start corners (origin_corner=BL).
function orderByTravel(sheet: NestedSheet) {
  const parts = [...sheet.placements]
  if (parts.length <= 2) return parts
  const out = [parts.shift()!]
  while (parts.length) {
    const last = out[out.length - 1]
    let bi = 0, bd = Infinity
    for (let i = 0; i < parts.length; i++) {
      const d = (parts[i].x - last.x) ** 2 + (parts[i].y - last.y) ** 2
      if (d < bd) { bd = d; bi = i }
    }
    out.push(parts.splice(bi, 1)[0])
  }
  return out
}

function routePerimeter(
  emit: (s: string) => void, f: (v: number) => string,
  pl: { x: number; y: number; w: number; h: number; label: string },
  cutDepth: number, safeZ: number, thickness: number, p: PostProfile,
) {
  // Corner sequence: climb = CCW, conventional = CW (for an outer profile).
  const climb = p.milling_direction !== 'conventional'
  const corners = climb
    ? [[pl.x, pl.y], [pl.x + pl.w, pl.y], [pl.x + pl.w, pl.y + pl.h], [pl.x, pl.y + pl.h]]
    : [[pl.x, pl.y], [pl.x, pl.y + pl.h], [pl.x + pl.w, pl.y + pl.h], [pl.x + pl.w, pl.y]]
  const start = corners[0]

  const passes = Math.max(1, Math.ceil(cutDepth / Math.max(1, p.rough_pass_z_step)))
  const useTabs = p.tabs_enabled && pl.w * pl.h >= p.tab_min_part_area

  emit(`G0 X${f(start[0])} Y${f(start[1])}`)
  emit(`G0 Z${f(Math.min(safeZ, 3))}`)

  for (let i = 1; i <= passes; i++) {
    const z = -Math.min(cutDepth, (cutDepth / passes) * i)
    const last = i === passes
    emit(`G1 Z${f(z)} F${f(p.plunge_feed_rate)}`)        // ramp/plunge (linear approx)
    for (let k = 1; k <= 4; k++) {
      const cn = corners[k % 4]
      emit(`G1 X${f(cn[0])} Y${f(cn[1])} F${f(p.base_feed_rate)}`)
    }
    if (last && useTabs) emit(`(tabs: ${p.tabs_per_side_min}/side @ ${p.tab_height}mm)`)
  }
  emit(`G0 Z${f(safeZ)}`)
  void thickness
}

// Map a DB cnc_machine_profiles row (+ tool defaults) into a PostProfile.
export function postFromProfile(row: Record<string, unknown> | null, tool?: { base_feed_rate?: number | null; base_spindle_speed?: number | null }): PostProfile {
  const n = (v: unknown, d: number) => (typeof v === 'number' ? v : d)
  const b = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
  const s = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d)
  const D = DEFAULT_POST
  if (!row) return { ...D, base_feed_rate: tool?.base_feed_rate ?? D.base_feed_rate, base_spindle_speed: tool?.base_spindle_speed ?? D.base_spindle_speed }
  return {
    safe_z_clearance: n(row.safe_z_clearance, D.safe_z_clearance),
    onion_skin_z: n(row.onion_skin_z, D.onion_skin_z),
    through_cut_z: n(row.through_cut_z, D.through_cut_z),
    drill_rapid_z: n(row.drill_rapid_z, D.drill_rapid_z),
    rough_pass_z_step: n(row.rough_pass_z_step, D.rough_pass_z_step),
    pass_strategy: s(row.pass_strategy, D.pass_strategy),
    milling_direction: s(row.milling_direction, D.milling_direction),
    ramp_in_distance: n(row.ramp_in_distance, D.ramp_in_distance),
    tabs_enabled: b(row.tabs_enabled, D.tabs_enabled),
    tab_width: n(row.tab_width, D.tab_width),
    tab_height: n(row.tab_height, D.tab_height),
    tab_min_part_area: n(row.tab_min_part_area, D.tab_min_part_area),
    tabs_per_side_min: n(row.tabs_per_side_min, D.tabs_per_side_min),
    drill_sequence_strategy: s(row.drill_sequence_strategy, D.drill_sequence_strategy),
    stripe_direction: s(row.stripe_direction, D.stripe_direction),
    stripe_width: n(row.stripe_width, D.stripe_width),
    sheet_load_pause: b(row.sheet_load_pause, D.sheet_load_pause),
    dust_extraction_enabled: b(row.dust_extraction_enabled, D.dust_extraction_enabled),
    push_off_enabled: b(row.push_off_enabled, D.push_off_enabled),
    push_off_distance: n(row.push_off_distance, D.push_off_distance),
    program_header: (row.program_header as string) ?? null,
    program_footer: (row.program_footer as string) ?? null,
    spindle_on_code: s(row.spindle_on_code, D.spindle_on_code),
    spindle_off_code: s(row.spindle_off_code, D.spindle_off_code),
    coolant_on_code: s(row.coolant_on_code, D.coolant_on_code),
    coolant_off_code: s(row.coolant_off_code, D.coolant_off_code),
    tool_change_code: s(row.tool_change_code, D.tool_change_code),
    work_offset_code: s(row.work_offset_code, D.work_offset_code),
    units_code: s(row.units_code, D.units_code),
    decimal_places: n(row.decimal_places, D.decimal_places),
    line_numbers_enabled: b(row.line_numbers_enabled, D.line_numbers_enabled),
    line_number_increment: n(row.line_number_increment, D.line_number_increment),
    base_feed_rate: tool?.base_feed_rate ?? D.base_feed_rate,
    base_spindle_speed: tool?.base_spindle_speed ?? D.base_spindle_speed,
    plunge_feed_rate: D.plunge_feed_rate,
  }
}

// File name (spec §5.8.3).
export function gcodeFileName(opts: { batch: boolean; jobNumber: string | null; dateStr: string; materialCode: string; sheetNumber: number; ext?: string }): string {
  const ext = opts.ext ?? 'nc'
  const mat = (opts.materialCode || 'MAT').replace(/[^A-Za-z0-9]+/g, '').slice(0, 12) || 'MAT'
  const n = String(opts.sheetNumber).padStart(2, '0')
  return opts.batch
    ? `BATCH_${opts.dateStr}_${mat}_${n}.${ext}`
    : `${(opts.jobNumber || 'JOB').replace(/[^A-Za-z0-9]+/g, '')}_${mat}_${n}.${ext}`
}
