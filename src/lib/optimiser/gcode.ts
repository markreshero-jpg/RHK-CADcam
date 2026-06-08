// ============================================================
// Panel Optimiser G-code post-processor (spec §5.8).
// One program per sheet. NON-NEGOTIABLE ordering: ALL drilling
// before ANY routing; routing is inside-out (internal features
// before outer profiles). Driven by cnc_machine_profiles fields.
//
// v1 emits part-perimeter cutting (the core panel workload) with
// multi-pass depth, tool-entry strategy, real G2/G3 arc lead-in & lead-out
// (also straight / perpendicular / none), optional tabs, climb/conventional
// direction, plus a stripe-sequenced drilling section. Pure & framework-free.
//
// The cut starts at the MIDPOINT OF THE PART'S LONGEST EDGE. The `ramp` entry
// descends ALONG the contour from that point (drop / tan(angle) of travel),
// then a clean finishing lap — far fewer lines than an in-scrap zig-zag and no
// long scrap run needed. Other entries (helical / pre_drill / straight_plunge)
// plunge at an offset point and lead onto the same start. NOTE: the finishing
// lap re-cuts the perimeter (acts as a spring/finish pass); helical/scrap moves
// are NOT collision-checked against neighbouring parts; pre_drill is a
// comment + plunge (no auto pre-drill op from pre_drill_tool_id); dogbones are
// approximations. Drill ops are fed in (from part_operations by the caller) —
// empty is valid and still emits correct structure.
// ============================================================

import type { NestedSheet } from './nest'
import { computeGangs, type DrillBlockConfig } from './gangDrill'

export interface PostProfile {
  material_surface_z: string       // top_of_material | spoilboard (Z zero reference)
  z_axis_up: boolean               // true = +Z points up away from the table
  safe_z_clearance: number
  onion_skin_z: number
  through_cut_z: number
  drill_rapid_z: number
  rough_pass_z_step: number
  pass_strategy: string            // single | onion_skin | roughing_finishing | multi_depth
  milling_direction: string        // climb | conventional | auto
  entry_strategy: string           // ramp | helical | pre_drill | straight_plunge
  ramp_in_distance: number
  ramp_in_angle: number
  ramp_in_feed_pct: number
  tool_entry_offset: number        // ramp starts this far into the gap off the edge, drifting onto the outline by the end
  helical_radius: number
  helical_feed_pct: number
  helical_passes: number
  lead_in_type: string             // straight | arc_tangent | perpendicular | none
  lead_in_length: number
  lead_in_feed_pct: number
  lead_out_type: string            // straight | arc_tangent | perpendicular | none
  lead_out_length: number
  lead_out_feed_pct: number
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
  plunge_feed_pct: number   // plunge/Z feed as a % of base cutting feed (from the routing tool)
  // ── Drill-block emission (Anderson EVO49, spec §8) ──────────────────────────
  drill_block_work_offset: string  // work offset for drilling moves (e.g. G54)
  router_work_offset: string       // work offset for routing moves (e.g. G59)
  drill_cycle_code: string         // canned cycle (G81)
  drill_return_code: string        // return mode after each drill (G98 / G99)
  sign_y: number                   // Y axis sign (-1 → output Y negative)
  mirror_y: boolean                // material loaded face down → Y mirrored about the sheet
  drill_bank_prep_codes: string    // machine prep lines before bank selection (newline-separated)
}

export const DEFAULT_POST: PostProfile = {
  material_surface_z: 'top_of_material', z_axis_up: true,
  safe_z_clearance: 15, onion_skin_z: 0.4, through_cut_z: -0.5, drill_rapid_z: 5,
  rough_pass_z_step: 8, pass_strategy: 'onion_skin', milling_direction: 'climb',
  entry_strategy: 'ramp', ramp_in_distance: 20, ramp_in_angle: 3, ramp_in_feed_pct: 50, tool_entry_offset: 2,
  helical_radius: 8, helical_feed_pct: 40, helical_passes: 1,
  lead_in_type: 'arc_tangent', lead_in_length: 8, lead_in_feed_pct: 60,
  lead_out_type: 'arc_tangent', lead_out_length: 8, lead_out_feed_pct: 100,
  tabs_enabled: false, tab_width: 6, tab_height: 4,
  tab_min_part_area: 10000, tabs_per_side_min: 1,
  drill_sequence_strategy: 'stripe', stripe_direction: 'horizontal', stripe_width: 50,
  sheet_load_pause: true, dust_extraction_enabled: true, push_off_enabled: false, push_off_distance: 0,
  program_header: null, program_footer: null,
  spindle_on_code: 'M03', spindle_off_code: 'M05', coolant_on_code: 'M08', coolant_off_code: 'M09',
  tool_change_code: 'T{n} M06', work_offset_code: 'G54', units_code: 'G21',
  decimal_places: 3, line_numbers_enabled: false, line_number_increment: 10,
  base_feed_rate: 6000, base_spindle_speed: 18000, plunge_feed_pct: 25,
  drill_block_work_offset: 'G54', router_work_offset: 'G59',
  drill_cycle_code: 'G81', drill_return_code: 'G98',
  sign_y: -1, mirror_y: true, drill_bank_prep_codes: 'M23\nM21',
}

export interface SheetDrill { x: number; y: number; diameter: number; depth: number }

export interface GcodeInput {
  sheet: NestedSheet
  thickness: number
  profile: PostProfile
  drills: SheetDrill[]
  toolNumber: number       // routing bit tool number
  drillToolNumber?: number
  maxDepthPerPass?: number // routing tool's max cut depth per pass (mm); falls back to rough_pass_z_step
  // When present, the drilling pass uses Anderson gang detection + M88/M89
  // bitmask output instead of the generic single-spindle plunge loop.
  drillBlock?: DrillBlockConfig
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
  // Z datum transform. Internally every Z is computed in the "top-of-material,
  // +up" frame (top = 0, rapids positive, cuts negative). Shift to the profile's
  // reference: spoilboard zero = bottom of material, so add the material thickness
  // (the machine's work offset / surfacing skim handles the spoilboard itself —
  // spoilboard_thickness is deliberately NOT used here). Flip sign if +Z is down.
  const zOff = p.material_surface_z === 'spoilboard' ? thickness : 0
  const zSign = p.z_axis_up === false ? -1 : 1
  const fz = (v: number) => f((v + zOff) * zSign)
  // Final cut depth is onion-skin driven: a positive onion skin leaves that much
  // uncut at the bottom (depth = thickness − skin); onion skin 0 cuts fully through
  // plus the thru-cut overshoot (depth = thickness + |through_cut_z|, ~0.2mm into
  // the spoilboard) so parts release cleanly.
  // Onion-skin workflow: when a skin is left, ALL parts are roughed to the skin depth
  // first (held by the skin so nothing shifts), then a second loop separates them by
  // cutting through. Roughing stops at thickness − skin; the through/separation cut
  // dips |thru-cut| into the spoilboard so parts release cleanly.
  const hasSkin = p.onion_skin_z > 0
  const roughDepth = thickness - Math.max(0, p.onion_skin_z)
  const throughDepth = thickness + Math.abs(p.through_cut_z)
  // Step-down per pass comes from the routing tool's max depth per pass; if no tool
  // value is supplied, fall back to the machine profile's rough Z step.
  const stepDown = input.maxDepthPerPass && input.maxDepthPerPass > 0 ? input.maxDepthPerPass : p.rough_pass_z_step
  // Plunge/Z feed = % of the (material-adjusted) cutting feed, from the routing tool.
  const plungeFeed = f(p.base_feed_rate * (p.plunge_feed_pct > 0 ? p.plunge_feed_pct : 100) / 100)

  // ── 1. Header ─────────────────────────────────────────────────────────────────
  c(`Sheet ${sheet.index + 1}  ${sheet.stock.w}x${sheet.stock.h}mm  ${thickness}mm`)
  if (p.program_header) p.program_header.split('\n').forEach(l => emit(l))
  emit(`${p.units_code} G90 G17`)            // mm, absolute, XY plane
  emit(p.work_offset_code)
  emit(`G0 Z${fz(safeZ)}`)

  // ── 2. Sheet load pause ──────────────────────────────────────────────────────
  if (p.sheet_load_pause) { c('Load sheet'); emit('M00') }

  // ── 3. Dust extraction on ────────────────────────────────────────────────────
  if (p.dust_extraction_enabled) { c('Dust extraction on'); emit(p.coolant_on_code) }

  // ── 4. ALL drilling (before routing — non-negotiable) ────────────────────────
  if (drills.length) {
    if (input.drillBlock) {
      // Anderson gang drilling — detect 32mm-grid runs and emit M88/M89 bitmasks.
      emitGangDrilling(emit, c, f, drills, input.drillBlock, p, sheet.stock.h)
    } else {
      c(`Drilling ${drills.length} holes (${p.drill_sequence_strategy})`)
      emit(p.tool_change_code.replace('{n}', String(input.drillToolNumber ?? input.toolNumber)))
      emit(`${p.spindle_on_code} S${f(p.base_spindle_speed)}`)
      for (const d of sequenceDrills(drills, p)) {
        emit(`G0 X${f(d.x)} Y${f(d.y)} Z${fz(p.drill_rapid_z)}`)
        emit(`G1 Z${fz(-Math.abs(d.depth))} F${plungeFeed}`)
        emit(`G0 Z${fz(p.drill_rapid_z)}`)
      }
      emit(`G0 Z${fz(safeZ)}`)
      emit(p.spindle_off_code)
    }
  }

  // ── 5. Tool change to routing bit ────────────────────────────────────────────
  c('Tool change to routing bit')
  emit(p.tool_change_code.replace('{n}', String(input.toolNumber)))
  if (input.drillBlock) emit(p.router_work_offset)   // routing runs on a separate offset (e.g. G59)
  emit(`${p.spindle_on_code} S${f(p.base_spindle_speed)}`)

  // ── 6. ALL routing — inside-out, travel-ordered ──────────────────────────────
  // (No internal part features in v1, so each part is a single outer perimeter;
  //  the inside-out invariant is preserved trivially.)
  const ordered = orderByTravel(sheet)
  if (hasSkin) {
    // Phase 1: rough every part down to the onion-skin depth (parts stay held).
    c('Roughing pass — leave onion skin')
    for (const pl of ordered) {
      c(`Part ${pl.label}`)
      routePerimeter(emit, f, fz, pl, roughDepth, stepDown, safeZ, thickness, p, 0)
    }
    // Phase 2: separate every part — cut through the remaining skin.
    c('Separation pass — cut through onion skin')
    for (const pl of ordered) {
      c(`Part ${pl.label}`)
      routePerimeter(emit, f, fz, pl, throughDepth, stepDown, safeZ, thickness, p, roughDepth)
    }
  } else {
    for (const pl of ordered) {
      c(`Part ${pl.label}`)
      routePerimeter(emit, f, fz, pl, throughDepth, stepDown, safeZ, thickness, p, 0)
    }
  }
  emit(`G0 Z${fz(safeZ)}`)

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

// Anderson gang-drilling section (spec §3, §7). Detects gangable runs, then for
// each gang group emits the comment block, clears + preps both banks, selects
// the bank bitmask, rapids to the master with the drill-block work offset (G54),
// runs the G81 canned cycle, lists any further master positions (step-and-repeat
// / parallel rows), then cancels. Only the MASTER coordinate is emitted — slaves
// fire at their fixed 32mm offsets. Y is signed/mirrored per the profile and the
// block head offset is applied (material loaded face down → negative Y output).
function emitGangDrilling(
  emit: (s: string) => void, c: (s: string) => void, f: (v: number) => string,
  drills: SheetDrill[], block: DrillBlockConfig, p: PostProfile, sheetHeight: number,
) {
  const { groups, warnings } = computeGangs(
    drills.map(d => ({ x: d.x, y: d.y, diameter: d.diameter, depth: d.depth })), block,
  )
  for (const w of warnings) c(`WARN: ${w}`)
  if (!groups.length) return

  // Sheet-local → machine coords. X carries the head offset; Y is mirrored (face
  // down) then signed, plus the head offset (the multidrill-head compensation).
  const tx = (x: number) => x + block.headOffsetXMm
  const ty = (y: number) => p.sign_y * (p.mirror_y ? sheetHeight - y : y) + block.headOffsetYMm
  // Drill-block Z is in the block's own datum frame: drill_rapid_z is the retract
  // plane (R), and each hole plunges that far below it. Set drill_rapid_z to the
  // machine's block clearance (e.g. 36.5) so output matches the controller.
  const rapidZ = p.drill_rapid_z
  const depthZ = (depth: number) => rapidZ - Math.abs(depth)
  const drillFeed = f(p.base_feed_rate * (p.plunge_feed_pct > 0 ? p.plunge_feed_pct : 25) / 100)
  const prep = (p.drill_bank_prep_codes || '').split('\n').map(s => s.trim()).filter(Boolean)

  c(`Drilling — ${groups.length} gang group(s), Anderson M88/M89`)
  for (const g of groups) {
    const mcode = g.bank === 'x' ? block.xBankMcode : block.yBankMcode
    c(`DRILL TOOL: V ${f(g.diameter)}MM`)
    c(`DRILL MASTER: ${g.masterSpindle}, SLAVE: ${g.slaveSpindles.join(',') || '-'}`)
    c(`DIAMETER: ${f(g.diameter)}.`)
    emit(`${block.xBankMcode} B0`)
    emit(`${block.yBankMcode} B0`)
    prep.forEach(l => emit(l))
    emit(`${mcode} B${g.bitmask}`)
    const m0 = g.masters[0]
    emit(`G90 G0 ${block.workOffsetCode} G43 H1 X${f(tx(m0.x))} Y${f(ty(m0.y))} Z${f(rapidZ)}`)
    emit(`${p.drill_return_code} ${p.drill_cycle_code} Z${f(depthZ(g.depth))} R${f(rapidZ)} F${drillFeed}`)
    for (const m of g.masters.slice(1)) emit(`X${f(tx(m.x))} Y${f(ty(m.y))} Z${f(depthZ(g.depth))}`)
    emit('G80')   // cancel canned cycle
    emit('G17 G91 G28 Z0 M95')
    emit(`${block.xBankMcode} B0`)
    emit(`${block.yBankMcode} B0`)
    emit('M22')
  }
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
  emit: (s: string) => void, f: (v: number) => string, fz: (v: number) => string,
  pl: { x: number; y: number; w: number; h: number; label: string },
  cutDepth: number, stepDown: number, safeZ: number, thickness: number, p: PostProfile,
  startDepth = 0,   // depth-from-top where this routing begins (>0 = separating into an existing kerf)
) {
  type V = [number, number]
  // Corner sequence: climb = CCW, conventional = CW (for an outer profile).
  const climb = p.milling_direction !== 'conventional'
  const corners: V[] = climb
    ? [[pl.x, pl.y], [pl.x + pl.w, pl.y], [pl.x + pl.w, pl.y + pl.h], [pl.x, pl.y + pl.h]]
    : [[pl.x, pl.y], [pl.x, pl.y + pl.h], [pl.x + pl.w, pl.y + pl.h], [pl.x + pl.w, pl.y]]

  const unit = (a: V, b: V): V => { const dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l] }
  const len = (a: V, b: V) => Math.hypot(b[0] - a[0], b[1] - a[1])

  // Start point = midpoint of the part's LONGEST edge (ties → first in cut order).
  let eIdx = 0, best = -1
  for (let i = 0; i < 4; i++) { const l = len(corners[i], corners[(i + 1) % 4]); if (l > best + 1e-6) { best = l; eIdx = i } }
  const A = corners[eIdx], B = corners[(eIdx + 1) % 4]
  const S: V = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]
  // Closed cut path starting AND ending at S (the longest edge is split at its midpoint).
  const path: V[] = [S, corners[(eIdx + 1) % 4], corners[(eIdx + 2) % 4], corners[(eIdx + 3) % 4], corners[eIdx], S]
  let perim = 0; for (let i = 0; i < path.length - 1; i++) perim += len(path[i], path[i + 1])

  // Tangent leaving S along the edge, and outward normal (into scrap). The cut both
  // leaves and returns to S along the same edge line, so in/out tangents coincide.
  const ctr: V = [pl.x + pl.w / 2, pl.y + pl.h / 2]
  const outward = (at: V, tan: V): V => { const c: V = [-tan[1], tan[0]]; return (at[0] - ctr[0]) * c[0] + (at[1] - ctr[1]) * c[1] >= 0 ? c : [tan[1], -tan[0]] }
  const tIn = unit(S, B)
  const nIn = outward(S, tIn)
  const tOut = tIn, nOut = nIn

  const passes = Math.max(1, Math.ceil((cutDepth - startDepth) / Math.max(1, stepDown)))
  const useTabs = p.tabs_enabled && pl.w * pl.h >= p.tab_min_part_area
  const clearZ = Math.min(safeZ, 3)
  const fr = (pct: number) => f(p.base_feed_rate * (pct > 0 ? pct : 100) / 100)
  const cutF = f(p.base_feed_rate)

  // Arc emitter (XY plane, I/J relative to current position `from`).
  const arc = (from: V, to: V, c: V, ccw: boolean, d: number, feed: string) =>
    emit(`G${ccw ? 3 : 2} X${f(to[0])} Y${f(to[1])} Z${fz(d)} I${f(c[0] - from[0])} J${f(c[1] - from[1])} F${feed}`)

  // Cut the full closed perimeter from S back to S at constant depth d.
  const cutLoop = (d: number) => { for (let i = 1; i < path.length; i++) emit(`G1 X${f(path[i][0])} Y${f(path[i][1])} Z${fz(d)} F${cutF}`) }

  // Ramp-on-contour: descend clearZ → d *while travelling the last `ramp travel`
  // (= drop / tan(angle)) of the perimeter INTO the start point S, so full depth is
  // reached exactly at S. The single cutLoop that follows then both cuts the part and
  // re-cuts (cleans) this ramped approach — so the perimeter is only cut once at depth,
  // no redundant finishing lap. Positions itself (G0) at the ramp-start point.
  const rampOnContour = (d: number) => {
    const ang = (p.ramp_in_angle > 0 ? p.ramp_in_angle : 3) * Math.PI / 180
    const drop = clearZ - d
    const rampTravel = Math.min(drop / Math.max(1e-3, Math.tan(ang)), perim)
    const sStart = perim - rampTravel                 // arc-length where the ramp begins
    let cum = 0, k = 0
    for (; k < path.length - 1; k++) { const sl = len(path[k], path[k + 1]); if (cum + sl >= sStart - 1e-6) break; cum += sl }
    const seg = len(path[k], path[k + 1])
    const tt = seg > 1e-9 ? (sStart - cum) / seg : 0
    const startPt: V = [path[k][0] + (path[k + 1][0] - path[k][0]) * tt, path[k][1] + (path[k + 1][1] - path[k][1]) * tt]
    // The ramp rides OFFSET into the gap (off the finished edge) at the start and drifts
    // back onto the outline as it descends — full offset at the start, zero at S — so the
    // ramp scar lands in the waste, not on the part edge.
    const off = Math.max(0, p.tool_entry_offset)
    const shift = (q: V, tan: V, frac: number): V => { const nrm = outward(q, tan); return [q[0] + nrm[0] * off * frac, q[1] + nrm[1] * off * frac] }
    const startO = shift(startPt, unit(path[k], path[k + 1]), 1)
    emit(`(ramp entry ${p.ramp_in_angle}deg, ${off}mm offset, drifting onto the outline)`)
    emit(`G0 X${f(startO[0])} Y${f(startO[1])}`)
    emit(`G0 Z${fz(clearZ)}`)
    // Descend from startPt through the remaining vertices to S; offset tapers to 0 at S.
    let arc = 0, prev: V = startPt
    for (let i = k + 1; i < path.length; i++) {
      const b = path[i]
      arc += len(prev, b)
      const frac = 1 - Math.min(1, arc / rampTravel)
      const q = shift(b, unit(prev, b), frac)
      emit(`G1 X${f(q[0])} Y${f(q[1])} Z${fz(clearZ - drop * Math.min(1, arc / rampTravel))} F${fr(p.ramp_in_feed_pct)}`)
      prev = b
    }
  }

  // Plunge straight down at S using the entry strategy (helical / plunge / pre-drill).
  // Used for non-ramp strategies; lead-in then joins the contour at S.
  const E0 = (): V => {
    switch (p.lead_in_type) {
      case 'none': return S
      case 'straight': return [S[0] - tIn[0] * p.lead_in_length, S[1] - tIn[1] * p.lead_in_length]
      case 'perpendicular': return [S[0] + nIn[0] * p.lead_in_length, S[1] + nIn[1] * p.lead_in_length]
      default: {
        const C: V = [S[0] + nIn[0] * p.lead_in_length, S[1] + nIn[1] * p.lead_in_length]
        const rS: V = [S[0] - C[0], S[1] - C[1]]
        const ccw = (-rS[1]) * tIn[0] + rS[0] * tIn[1] > 0
        return ccw ? [C[0] + rS[1], C[1] - rS[0]] : [C[0] - rS[1], C[1] + rS[0]]
      }
    }
  }
  const entryDescend = (E: V, d: number) => {
    const xy = (q: V) => `X${f(q[0])} Y${f(q[1])}`
    switch (p.entry_strategy) {
      case 'helical': {
        const r = Math.max(1, p.helical_radius)
        const Ch: V = [E[0] - tIn[0] * r, E[1] - tIn[1] * r]
        const loops = Math.max(1, Math.round(p.helical_passes))
        const dz = (clearZ - d) / loops
        const g = climb ? 3 : 2
        emit(`(helical entry r${r} x${loops})`)
        for (let l = 1; l <= loops; l++) emit(`G${g} ${xy(E)} Z${fz(clearZ - dz * l)} I${f(Ch[0] - E[0])} J${f(Ch[1] - E[1])} F${fr(p.helical_feed_pct)}`)
        break
      }
      case 'pre_drill':
        emit('(pre-drill assumed at entry point — plunging into clearance hole)')
        emit(`G1 Z${fz(d)} F${fr(p.plunge_feed_pct)}`)
        break
      default: // straight_plunge
        emit(`G1 Z${fz(d)} F${fr(p.plunge_feed_pct)}`)
    }
  }
  const leadIn = (E: V, d: number) => {
    switch (p.lead_in_type) {
      case 'none': return
      case 'straight':
      case 'perpendicular':
        emit(`G1 X${f(S[0])} Y${f(S[1])} Z${fz(d)} F${fr(p.lead_in_feed_pct)}`); return
      default: {
        const C: V = [S[0] + nIn[0] * p.lead_in_length, S[1] + nIn[1] * p.lead_in_length]
        const rS: V = [S[0] - C[0], S[1] - C[1]]
        const ccw = (-rS[1]) * tIn[0] + rS[0] * tIn[1] > 0
        arc(E, S, C, ccw, d, fr(p.lead_in_feed_pct))
      }
    }
  }

  const Lo = Math.max(0, p.lead_out_length)
  const leadOut = (d: number) => {
    switch (p.lead_out_type) {
      case 'none': return
      case 'straight':
        emit(`G1 X${f(S[0] + tOut[0] * Lo)} Y${f(S[1] + tOut[1] * Lo)} Z${fz(d)} F${fr(p.lead_out_feed_pct)}`); return
      case 'perpendicular':
        emit(`G1 X${f(S[0] + nOut[0] * Lo)} Y${f(S[1] + nOut[1] * Lo)} Z${fz(d)} F${fr(p.lead_out_feed_pct)}`); return
      default: { // arc_tangent: leave S tangent to the edge, 90° arc into scrap
        const C: V = [S[0] + nOut[0] * Lo, S[1] + nOut[1] * Lo]
        const rS: V = [S[0] - C[0], S[1] - C[1]]
        const ccw = (-rS[1]) * tOut[0] + rS[0] * tOut[1] > 0
        const X: V = ccw ? [C[0] - rS[1], C[1] + rS[0]] : [C[0] + rS[1], C[1] - rS[0]]
        arc(S, X, C, ccw, d, fr(p.lead_out_feed_pct))
      }
    }
  }

  // Ramp-out: mirror of the ramp-in — leave the outline at S and drift OUT into the gap
  // while lifting to clearance, so the exit scar lands in the waste, not on the edge.
  const rampOut = (d: number) => {
    const off = Math.max(0, p.tool_entry_offset)
    const fwd = Math.max(off, Lo)
    const X: V = [S[0] + tOut[0] * fwd + nOut[0] * off, S[1] + tOut[1] * fwd + nOut[1] * off]
    emit(`G1 X${f(X[0])} Y${f(X[1])} Z${fz(clearZ)} F${fr(p.lead_out_feed_pct)}`)   // drift out + lift
    void d
  }

  // Each pass is self-contained and starts/ends at the longest-edge midpoint S.
  for (let i = 1; i <= passes; i++) {
    const d = -(startDepth + (cutDepth - startDepth) * (i / passes))
    const last = i === passes
    if (startDepth > 0) {
      // Separation pass: the perimeter kerf already exists down to startDepth, so just
      // rapid into the slot and plunge through the remaining skin — no ramp/lead-in.
      emit(`G0 X${f(S[0])} Y${f(S[1])}`)
      emit(`G0 Z${fz(Math.min(clearZ, -startDepth + 2))}`)   // drop into the existing kerf
      emit(`G1 Z${fz(d)} F${fr(p.plunge_feed_pct)}`)
      cutLoop(d)
    } else if (p.entry_strategy === 'ramp') {
      rampOnContour(d)   // ramps the approach into S (handles its own positioning)
      cutLoop(d)         // ONE clean perimeter loop — also cleans the ramped approach
    } else {
      const E = E0()
      emit(`G0 X${f(E[0])} Y${f(E[1])}`)
      emit(`G0 Z${fz(clearZ)}`)
      entryDescend(E, d)
      leadIn(E, d)
      cutLoop(d)
    }
    if (last && useTabs) emit(`(tabs: ${p.tabs_per_side_min}/side @ ${p.tab_height}mm)`)
    if (last) { if (p.entry_strategy === 'ramp' && startDepth === 0) rampOut(d); else leadOut(d) }
    emit(`G0 Z${fz(clearZ)}`)
  }
  emit(`G0 Z${fz(safeZ)}`)
  void thickness
}

// Map a DB cnc_machine_profiles row (+ tool defaults) into a PostProfile.
export function postFromProfile(row: Record<string, unknown> | null, tool?: { base_feed_rate?: number | null; base_spindle_speed?: number | null; plunge_feed_pct?: number | null }): PostProfile {
  const n = (v: unknown, d: number) => (typeof v === 'number' ? v : d)
  const b = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
  const s = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d)
  const D = DEFAULT_POST
  if (!row) return { ...D, base_feed_rate: tool?.base_feed_rate ?? D.base_feed_rate, base_spindle_speed: tool?.base_spindle_speed ?? D.base_spindle_speed, plunge_feed_pct: tool?.plunge_feed_pct ?? D.plunge_feed_pct }
  return {
    material_surface_z: s(row.material_surface_z, D.material_surface_z),
    z_axis_up: b(row.z_axis_up, D.z_axis_up),
    safe_z_clearance: n(row.safe_z_clearance, D.safe_z_clearance),
    onion_skin_z: n(row.onion_skin_z, D.onion_skin_z),
    through_cut_z: n(row.through_cut_z, D.through_cut_z),
    drill_rapid_z: n(row.drill_rapid_z, D.drill_rapid_z),
    rough_pass_z_step: n(row.rough_pass_z_step, D.rough_pass_z_step),
    pass_strategy: s(row.pass_strategy, D.pass_strategy),
    milling_direction: s(row.milling_direction, D.milling_direction),
    entry_strategy: s(row.entry_strategy, D.entry_strategy),
    ramp_in_distance: n(row.ramp_in_distance, D.ramp_in_distance),
    ramp_in_angle: n(row.ramp_in_angle, D.ramp_in_angle),
    ramp_in_feed_pct: n(row.ramp_in_feed_pct, D.ramp_in_feed_pct),
    tool_entry_offset: n(row.tool_entry_offset, D.tool_entry_offset),
    helical_radius: n(row.helical_radius, D.helical_radius),
    helical_feed_pct: n(row.helical_feed_pct, D.helical_feed_pct),
    helical_passes: n(row.helical_passes, D.helical_passes),
    lead_in_type: s(row.lead_in_type, D.lead_in_type),
    lead_in_length: n(row.lead_in_length, D.lead_in_length),
    lead_in_feed_pct: n(row.lead_in_feed_pct, D.lead_in_feed_pct),
    lead_out_type: s(row.lead_out_type, D.lead_out_type),
    lead_out_length: n(row.lead_out_length, D.lead_out_length),
    lead_out_feed_pct: n(row.lead_out_feed_pct, D.lead_out_feed_pct),
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
    plunge_feed_pct: tool?.plunge_feed_pct ?? D.plunge_feed_pct,
    drill_block_work_offset: s(row.drill_block_work_offset, D.drill_block_work_offset),
    router_work_offset: s(row.router_work_offset, D.router_work_offset),
    drill_cycle_code: s(row.drill_cycle_code, D.drill_cycle_code),
    drill_return_code: s(row.drill_return_code, D.drill_return_code),
    sign_y: n(row.sign_y, D.sign_y),
    mirror_y: b(row.mirror_y, D.mirror_y),
    drill_bank_prep_codes: s(row.drill_bank_prep_codes, D.drill_bank_prep_codes),
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
