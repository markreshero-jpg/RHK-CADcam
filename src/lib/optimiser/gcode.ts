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
import { computeGangs, type DrillBlockConfig, type GangGroup } from './gangDrill'
import { clearPath, outlinePath, type Pt2 } from './routePatterns'
import { loopArea, toolPathLoop } from './shapes'
import { fitLoopArcs } from '../shapePath'

// Gold reference's longest comment carries 78 characters of content, so the
// controller's real limit is at least that. 80 is the default until Pencil
// confirms the exact ceiling; override per machine via max_comment_length.
export const DEFAULT_MAX_COMMENT = 80

export interface PostProfile {
  material_surface_z: string       // top_of_material | spoilboard (Z zero reference)
  z_axis_up: boolean               // true = +Z points up away from the table
  // Output datum: origin corner + axis senses. Machine coord = signed distance
  // from the origin corner along each axis's positive direction. E.g. Anderson =
  // origin_corner 'top_left' + x 'positive_right' + y 'positive_up' → X = x,
  // Y = y − sheetH (negative downward).
  origin_corner: string            // bottom_left | top_left | bottom_right | top_right
  x_axis_direction: string         // positive_right | positive_left
  y_axis_direction: string         // positive_up | positive_down
  safe_z_clearance: number
  clearance_z: number              // retract/ramp clearance plane, mm above material top
  onion_skin_z: number
  through_cut_z: number
  drill_rapid_z: number
  rough_pass_z_step: number
  pass_strategy: string            // single | onion_skin | roughing_finishing | multi_depth
  milling_direction: string        // climb | conventional | auto
  cutter_compensation: string      // off | computer (offset path by tool radius) | control (G41/G42)
  entry_strategy: string           // PERIMETER entry: ramp | helical | pre_drill | straight_plunge (realistically ramp)
  perimeter_approach_type: string  // PERIMETER lead-in: 'straight' (on the edge) | 'offset' (into the waste by tool_entry_offset)
  pocket_entry_strategy: string    // POCKET/hole entry: helical | ramp | pre_drill | straight_plunge
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
  // Plunge / ramp entry feed in mm/min, taken straight from the routing tool.
  // Absolute rather than a % of the cutting feed: the reference programs use a
  // fixed entry feed (F6000) independent of how fast the tool then cuts.
  plunge_feed_rate: number
  // ── Drill-block emission (Anderson EVO49, spec §8) ──────────────────────────
  drill_block_work_offset: string  // work offset for drilling moves (e.g. G54)
  router_work_offset: string       // work offset for routing moves (e.g. G59)
  drill_cycle_code: string         // canned cycle (G81)
  drill_return_code: string        // return mode after each drill (G98 / G99)
  sign_y: number                   // Y axis sign (-1 → output Y negative)
  mirror_y: boolean                // material loaded face down → Y mirrored about the sheet
  drill_bank_prep_codes: string    // machine prep lines before bank selection (newline-separated)
  drill_band_height_mm: number     // gang drilling is emitted band-by-band (horizontal
                                   // strips of this height) so singles + gangs that are
                                   // near each other drill together, instead of sweeping
                                   // the whole sheet once per diameter/bitmask. ~400 = a
                                   // few big bands. Bank re-selects are cheap on the EVO49.
  // ── Output dialect (Anderson .anc style) ────────────────────────────────────
  // The datum (origin_corner + axis directions, above) drives the XY transform;
  // these control the rest of the Anderson-style output.
  keep_decimal_point: boolean      // keep a trailing '.' on whole numbers (X360. not X360)
  modal_output: boolean            // omit unchanged F + coords on feed moves (compact .anc style)
  emit_tool_length_offset: boolean // emit G43 H{h} Z{safe} at the routing tool call
  // Routing tool-length register is ALWAYS computed from the machine rule
  // (H = tool_number + delta) — never a free/typed value, so a wrong H can't be
  // entered and crash the Z. Anderson maps pockets 101-109 → H11-H19 (delta -90).
  tool_h_offset_delta: number
  emit_router_work_offset: boolean // emit the router work offset (e.g. G59) at routing start
  max_comment_length: number       // controller comment limit; gold reference uses 78 chars
  // ── Drill block Z + feed (defects D5, D9) ───────────────────────────────
  // The gang block runs off one drive at one feed: the gold reference uses
  // F3000. for EVERY cycle regardless of bit diameter or hole depth, so this
  // is a machine value, not a per-bit one (cnc_drills carries no feed column).
  drill_feed_rate: number
  // Retract plane. 'above_material' derives R = material thickness + clearance,
  // which is what the gold reference does (16.5 + 20 = R36.5) and the only
  // form that stays correct across thicknesses. 'absolute' keeps the older
  // behaviour of using drill_rapid_z verbatim.
  drill_retract_mode: string        // above_material | absolute
  drill_clearance_z: number         // mm above the material top, when derived
  // Extra depth added ONLY to holes that go right through, so the slug releases
  // instead of hanging on a whisker of board. Blind holes (dowel, hinge, shelf
  // pin) are untouched. The gold reference drills its through-holes to Z-0.2 in
  // a 16.5mm panel, i.e. 0.2mm past the back face.
  drill_through_overshoot: number
  // (The tool-change position is NOT configured: it is wherever the previous
  // operation left the head, restated in the incoming tool's work offset. See
  // the tool-change block in generateSheetGcode.)
  file_extension: string            // posted file extension, no dot (e.g. 'anc')
  header_template: string | null   // full machine preamble; REPLACES the built-in one when set
  footer_template: string | null   // full machine postamble; REPLACES the built-in one when set
}

export const DEFAULT_POST: PostProfile = {
  material_surface_z: 'top_of_material', z_axis_up: true,
  origin_corner: 'bottom_left', x_axis_direction: 'positive_right', y_axis_direction: 'positive_up',
  safe_z_clearance: 15, clearance_z: 3, onion_skin_z: 0.4, through_cut_z: -0.5, drill_rapid_z: 5,
  rough_pass_z_step: 8, pass_strategy: 'onion_skin', milling_direction: 'climb', cutter_compensation: 'computer',
  entry_strategy: 'ramp', perimeter_approach_type: 'offset', pocket_entry_strategy: 'helical', ramp_in_distance: 20, ramp_in_angle: 3, ramp_in_feed_pct: 50, tool_entry_offset: 2,
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
  base_feed_rate: 6000, base_spindle_speed: 18000, plunge_feed_rate: 1500,
  drill_block_work_offset: 'G54', router_work_offset: 'G59',
  drill_cycle_code: 'G81', drill_return_code: 'G98',
  sign_y: -1, mirror_y: true, drill_bank_prep_codes: 'M23\nM21', drill_band_height_mm: 400,
  keep_decimal_point: false, modal_output: false,
  emit_tool_length_offset: false, emit_router_work_offset: false,
  tool_h_offset_delta: 0, max_comment_length: DEFAULT_MAX_COMMENT,
  drill_feed_rate: 3000, drill_retract_mode: 'above_material', drill_clearance_z: 20,
  drill_through_overshoot: 0.2,
  file_extension: 'anc',
  header_template: null, footer_template: null,
}

export interface SheetDrill {
  x: number; y: number; diameter: number; depth: number
  passes?: number   // plunges at this hole (2 = "drill twice" for hard board); default 1
  // When set, this hole can't be drilled (no matching bit) and is routed as a
  // circular pocket with the given router bit (helical ram-in).
  pocket?: { toolNumber: number; toolDiameter: number }
}

// An internal routing feature projected into sheet space (bottom-left origin),
// carrying its own resolved router bit. `groove` = a straight slot along a line;
// `area` = a rectangle either boundary-cut (clear=false → outline/profile) or
// cleared (clear=true → pocket). Emitted BEFORE the part perimeter so the part is
// still fully held. Face/flip is deliberately ignored for now — every route runs
// on the back / material-up pass (Phase B §3c without the two-sided flip).
export type SheetRoute =
  | { kind: 'groove'; label: string; x1: number; y1: number; x2: number; y2: number
      width: number; depth: number; toolNumber: number; toolDiameter: number; maxDepthPerPass: number | null }
  | { kind: 'area'; label: string; x: number; y: number; w: number; h: number
      depth: number; clear: boolean
      // Clear strategy (clear=true): 'raster' | 'spiral_in' | 'spiral_out' (null → raster).
      fillStrategy: string | null; rasterAngleDeg: number; stepoverPct: number
      toolNumber: number; toolDiameter: number; maxDepthPerPass: number | null }

export interface GcodeInput {
  sheet: NestedSheet
  thickness: number
  profile: PostProfile
  drills: SheetDrill[]
  routes?: SheetRoute[]   // internal route/groove features (Phase B §3c)
  toolNumber: number       // routing bit tool number
  toolDiameter?: number    // routing bit diameter (mm) — needed for cutter compensation
  drillToolNumber?: number
  maxDepthPerPass?: number // routing tool's max cut depth per pass (mm); falls back to rough_pass_z_step
  // Template substitution values for header_template / footer_template.
  jobNumber?: string | null
  materialName?: string | null
  toolName?: string | null   // routing bit name, for the tool comment block
  // Name per tool number, so pocket and internal-feature tools get named too.
  toolNames?: Record<number, string | null>
  programNumber?: string | null
  // When present, the drilling pass uses Anderson gang detection + M88/M89
  // bitmask output instead of the generic single-spindle plunge loop.
  drillBlock?: DrillBlockConfig
  // Shaped parts (phase plan O4): placement uid → the part's finished/cut
  // outline in SHEET coords (bottom-left origin, mm) — shapes.placedOutline +
  // the placement corner. The perimeter cut follows it instead of the rect.
  outlines?: Record<string, { x: number; y: number }[]>
  // Through-cut holes (benchtop sink / cooktop cutouts): placement uid → closed
  // loops in SHEET coords (shapes.placedHoles + the placement corner). Each is
  // cut as an inside profile just before that part's perimeter.
  holes?: Record<string, { x: number; y: number }[][]>
}

// Modal compaction (spec §5.8 / Anderson .anc). Drops words that are unchanged
// from the last move, the way a Fanuc-style control reads them. It ONLY touches
// "pure motion" lines (just G0–3 / X / Y / Z / I / J / F); anything else — comments,
// macros, canned cycles, dwells, tool/spindle/work-offset lines, % and templates —
// passes through untouched and resets the modal memory (so the next motion line is
// emitted in full). Rules matched to the sample output: the motion G is omitted
// while it stays the same; on a RAPID (G0) all given axes are re-stated; on a FEED
// (G1/2/3) an axis is shown only when it changes; F only when it changes.

// ── Output encoding (defects D1-D3) ─────────────────────────────────────────
// The EVO49's Osai/Fanuc-family controller reads the file as raw 7-bit ASCII
// with DOS line endings. Two classes of defect grounded a program in the field:
//   • UTF-8 em-dashes (E2 80 94) from smart-punctuation in an editor — three
//     illegal bytes mid-comment.
//   • A stray ')' inside a comment. G-code comments are delimited by ( ) and do
//     NOT nest, so "3 gang group(s) over 1 band(s)" closes at the ')' after
//     "group(s" and the controller parses " over 1 band..." as code — 'o','v',
//     'e','r' are not valid addresses, so it alarms.
// A stray OPENING bracket is harmless: the gold reference ships
// "(JOB NUMBER (1491.5)" and runs. Both are stripped regardless.
const ASCII_MAP: Record<string, string> = {
  '\u2014': '-', '\u2013': '-', '\u2212': '-',        // em dash, en dash, minus
  '\u2018': "'", '\u2019': "'", '\u201a': "'",        // curly single quotes
  '\u201c': '"', '\u201d': '"',                       // curly double quotes
  '\u2026': '...',                                    // ellipsis
  '\u00a0': ' ', '\u2007': ' ', '\u202f': ' ',        // non-breaking spaces
  '\u00b0': 'deg', '\u00d8': 'DIA', '\u2300': 'DIA',  // degree, diameter signs
  '\u00b1': '+/-', '\u00d7': 'x', '\u00bd': '1/2', '\u00bc': '1/4', '\u00be': '3/4',
}

// One character folded to printable ASCII: transliterated, or dropped entirely.
function asciiChar(ch: string): string {
  const mapped = ASCII_MAP[ch]
  if (mapped !== undefined) return mapped
  const code = ch.codePointAt(0)!
  return code >= 0x20 && code <= 0x7e ? ch : ''
}

// Whole-program ASCII fold — the last safety net, covering text this module did
// not author: header_template / footer_template / program_header / program_footer
// come from the machine profile row and are emitted verbatim.
//
// Whitespace is preserved, not normalised. The gold reference carries a literal
// tab at the end of its G52 line and runs, so a tab is something the controller
// accepts; rewriting it would be this post-processor editing working output.
// (Comments are a separate matter — sanitiseComment does flatten tabs, because
// a comment must stay on one line.)
export function toAscii(s: string): string {
  let out = ''
  for (const ch of s) {
    out += ch === '\r' || ch === '\n' || ch === '\t' ? ch : asciiChar(ch)
  }
  return out
}

/**
 * The ONLY way a comment may be emitted. Strips comment delimiters, folds to
 * ASCII, collapses whitespace, truncates, and wraps in a single ( ).
 */
export function sanitiseComment(text: string, maxLen: number = DEFAULT_MAX_COMMENT): string {
  let out = ''
  for (const ch of String(text ?? '')) {
    // Dropped, not replaced: it keeps the "group(s)" plural idiom readable as
    // "groups" rather than "group s".
    if (ch === '(' || ch === ')') continue
    out += ch === '\r' || ch === '\n' || ch === '\t' ? ' ' : asciiChar(ch)
  }
  out = out.replace(/ {2,}/g, ' ').trim()
  const cap = maxLen > 0 ? maxLen : DEFAULT_MAX_COMMENT
  if (out.length > cap) out = out.slice(0, cap).trimEnd()
  return `(${out})`
}

// DOS line ending, always — never os.EOL. The file may be generated on any host
// and the controller needs CRLF regardless of where it was posted.
const EOL = '\r\n'

// Canned cycles (modal group 09). While one is active the controller reads a
// bare `X Y Z` line as a repeat plunge at the cycle's depth — and ANY group-01
// code (G00-G03) cancels the cycle, turning every following repeat hole into a
// rapid move to hole depth with a stationary drill. So inside a cycle, lines
// pass through VERBATIM: modalize must never introduce a motion word here.
const CYCLE_OPEN = /\bG(?:7[346]|8[1-9])\b/
const CYCLE_CANCEL = /\bG80\b/
const GROUP_01 = /\bG0*[0-3]\b/

export function modalize(lines: string[]): string[] {
  let lg: string | undefined, lx: string | undefined, ly: string | undefined, lz: string | undefined, lf: string | undefined
  const reset = () => { lg = lx = ly = lz = lf = undefined }
  const out: string[] = []
  let cycleOpen = false
  for (const line of lines) {
    const t = line.trim()
    if (t.startsWith('(')) { out.push(line); continue }   // comment — keep, don't reset

    // ── Canned cycle: hands off ────────────────────────────────────────────
    if (cycleOpen) {
      if (GROUP_01.test(t)) {
        throw new Error(`G-code post: group-01 motion "${t}" inside an open canned cycle. This cancels the cycle and rapid-plunges the drill into the sheet.`)
      }
      out.push(line)
      if (CYCLE_CANCEL.test(t)) { cycleOpen = false; reset() }
      continue
    }
    if (CYCLE_OPEN.test(t)) {
      // The opening block's Z/R/F are cycle parameters, not a position — drop
      // modal memory so nothing downstream compacts against them.
      out.push(line); cycleOpen = true; reset(); continue
    }
    const toks = t.match(/[A-Za-z][-+0-9.]*/g)
    const pure = !!toks && toks.length > 0 && toks.every(tk => {
      const L = tk[0].toUpperCase()
      return L === 'G' ? ['0', '1', '2', '3'].includes(tk.slice(1)) : 'XYZIJF'.includes(L)
    })
    if (!pure) { out.push(line); reset(); continue }
    let g: string | undefined, x: string | undefined, y: string | undefined, z: string | undefined, ii: string | undefined, jj: string | undefined, ff: string | undefined
    for (const tk of toks!) {
      const L = tk[0].toUpperCase(), v = tk.slice(1)
      if (L === 'G') g = v; else if (L === 'X') x = v; else if (L === 'Y') y = v
      else if (L === 'Z') z = v; else if (L === 'I') ii = v; else if (L === 'J') jj = v; else if (L === 'F') ff = v
    }
    // A line with no G word inherits whatever motion mode is CURRENTLY modal —
    // it must never be assumed to be G0. When that mode is unknown (the previous
    // line reset modal memory) the line passes through exactly as emitted:
    // inventing a G0 here is what cancelled the drill cycle on the machine.
    const gm = g ?? lg?.slice(1)
    if (gm === undefined) {
      out.push(line)
      // The coordinates are still facts about where the tool now is, whatever
      // mode got it there — keep them so the next line can compact against them.
      if (x !== undefined) lx = x
      if (y !== undefined) ly = y
      if (z !== undefined) lz = z
      if (ff !== undefined) lf = ff
      continue
    }
    const rapid = gm === '0'
    const w: string[] = []
    if (('G' + gm) !== lg) w.push('G' + gm)
    lg = 'G' + gm
    if (x !== undefined) { if (rapid || x !== lx) w.push('X' + x); lx = x }
    if (y !== undefined) { if (rapid || y !== ly) w.push('Y' + y); ly = y }
    if (z !== undefined) { if (rapid || z !== lz) w.push('Z' + z); lz = z }
    if (ii !== undefined) w.push('I' + ii)
    if (jj !== undefined) w.push('J' + jj)
    if (ff !== undefined) { if (ff !== lf) w.push('F' + ff); lf = ff }
    if (w.length) out.push(w.join(' '))   // skip no-op moves where everything was modal
  }
  if (cycleOpen) throw new Error('G-code post: a canned cycle was opened but never cancelled with G80.')
  return out
}

export function generateSheetGcode(input: GcodeInput): string {
  const { sheet, thickness, profile: p, drills } = input
  // Holes a drill can make vs. odd-sized holes routed as circular pockets.
  const realDrills = drills.filter(d => !d.pocket)
  const pocketHoles = drills.filter(d => d.pocket)
  const dp = p.decimal_places
  const lines: string[] = []
  let lineNo = p.line_number_increment
  const f = (v: number) => {
    const raw = v.toFixed(dp)
    if (p.keep_decimal_point) {
      // Anderson controllers want an explicit decimal point: strip trailing
      // fraction zeros but keep the dot (X360. , 404.4); integers gain a dot.
      let t = raw.includes('.') ? raw.replace(/0+$/, '') : raw + '.'
      if (t === '-0.') t = '0.'
      return t
    }
    return raw.replace(/\.?0+$/, m => (m.includes('.') ? '' : m)) || '0'
  }
  // Integer format for registers/speeds (H, S, T) — never a decimal point, even
  // when keep_decimal_point is on (a controller can misread 'H11.' as an offset).
  const fInt = (v: number) => String(Math.round(v))
  // Plain number for COMMENT text: no forced trailing point, so "V 5MM" rather
  // than "V 5.MM". Coordinates never use this — they need the trailing point.
  const fPlain = (v: number) => String(Number(v.toFixed(dp)))
  const emit = (s: string) => { lines.push(p.line_numbers_enabled && !s.startsWith('(') ? `N${(lineNo += p.line_number_increment)} ${s}` : s) }
  // Every comment in the posted program goes through here — no exceptions.
  // Part labels and material names reach this from user data, so the stripping
  // is load-bearing, not cosmetic.
  const c = (s: string) => emit(sanitiseComment(s, p.max_comment_length))
  // Blank separator. Pushed directly so a line number is never prefixed to it.
  const blank = () => { lines.push('') }
  // Where the head was left by the last operation, as already-formatted machine
  // coordinates in the ROUTER's frame. The tool-change block restates this
  // before the T-word — the reference programs do exactly that, and for a
  // router-to-router change it is a zero-distance move whose only job is to
  // establish the work offset, G90 and rapid mode ahead of the tool call.
  let headAt: { x: string; y: string } | null = null
  // True once a routing section is open, so the next tool change knows to close
  // it first (G80 / home Z / M22, as the reference does between router tools).
  let routerOpen = false

  const safeZ = p.safe_z_clearance
  // Z datum transform. Internally every Z is computed in the "top-of-material,
  // +up" frame (top = 0, rapids positive, cuts negative). Shift to the profile's
  // reference: spoilboard zero = bottom of material, so add the material thickness
  // (the machine's work offset / surfacing skim handles the spoilboard itself —
  // spoilboard_thickness is deliberately NOT used here). Flip sign if +Z is down.
  const zOff = p.material_surface_z === 'spoilboard' ? thickness : 0
  const zSign = p.z_axis_up === false ? -1 : 1
  const fz = (v: number) => f((v + zOff) * zSign)
  // XY datum. Internal sheet coords are bottom-left origin (x from left, y from
  // bottom). Machine output = signed distance from the configured origin corner
  // along each axis's positive direction. Anderson: origin top_left + x right +
  // y up → X = x, Y = y − H (negative downward).
  const W = sheet.stock.w, H = sheet.stock.h
  const oX = p.origin_corner === 'top_right' || p.origin_corner === 'bottom_right' ? W : 0
  const oY = p.origin_corner === 'top_left' || p.origin_corner === 'top_right' ? H : 0
  const sX = p.x_axis_direction === 'positive_left' ? -1 : 1
  const sY = p.y_axis_direction === 'positive_down' ? -1 : 1
  const mapX = (x: number) => sX * (x - oX)
  const mapY = (y: number) => sY * (y - oY)
  // A single axis reflection (sX·sY < 0) reverses contour winding; routePerimeter
  // re-reverses the corner order so climb/conventional stays as configured.
  const flipWinding = sX * sY < 0
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
  // Routing runs on its own work offset (e.g. G59) — always when a drill block
  // has switched offsets, or whenever the profile opts in (Anderson-style).
  // Shared by EVERY routing section: pockets and internal features used to omit
  // it entirely and would cut in the drill block's offset after gang drilling.
  const rOff = input.drillBlock || p.emit_router_work_offset ? `${p.router_work_offset} G90 ` : ''

  // Emit one routing section (pockets / internal features / part perimeters)
  // behind a tool-change block shaped like the reference programs:
  //
  //   G80 / G17 G91 G28 Z0 M95 / M22   close the previous routing section
  //   (ROUTE TOOL #102:   COLOURBOARD 10MM)
  //   (DIAMETER: 10.)
  //   G0 G59 G90 X2192. Y-984.49       current position, in the NEW work offset
  //   T102                             call the tool
  //   G0 G59 G90 X705.9 Y-609.49 M13 S18000   to the lead-in, spindle up
  //   G43 H12 Z38.                     length offset at safe Z
  //   G0 Z28.                          approach plane
  //
  // The lead-in is only known once the section's own geometry has been laid
  // out, so `body` is run into a buffer first and its opening approach folded
  // up into the tool-change block. If the opening is not approach-shaped the
  // buffer is emitted untouched and the tool change still gets its work offset,
  // spindle and length offset — just without the combined move.
  const emitRouterSection = (
    toolNumber: number,
    toolDiameter: number | null | undefined,
    body: (e: (s: string) => void, cc: (s: string) => void) => void,
  ) => {
    const buf: string[] = []
    const e = (s: string) => { buf.push(s) }
    const cc = (s: string) => e(sanitiseComment(s, p.max_comment_length))
    body(e, cc)
    if (!buf.length) return

    let head = 0
    while (head < buf.length && buf[head].startsWith('(')) head++
    // Two shapes occur: "G0 X.. Y.." then "G0 Z..", or "G0 X.. Y.. Z.." in one.
    let leadIn: { x: string; y: string } | null = null
    let approachZ: string | null = null
    let eaten = 0
    const mXY = /^G0 X(-?[\d.]+) Y(-?[\d.]+)(?: Z(-?[\d.]+))?$/.exec(buf[head] ?? '')
    if (mXY) {
      leadIn = { x: mXY[1], y: mXY[2] }
      eaten = 1
      if (mXY[3] !== undefined) approachZ = `Z${mXY[3]}`
      else {
        const mZ = /^G0 (Z-?[\d.]+)$/.exec(buf[head + 1] ?? '')
        if (mZ) { approachZ = mZ[1]; eaten = 2 }
      }
    }

    if (routerOpen) { blank(); emit('G80'); emit('G17 G91 G28 Z0 M95'); emit('M22') }
    blank(); blank()

    const name = input.toolNames?.[toolNumber] ?? (toolNumber === input.toolNumber ? input.toolName : null)
    if (name) c(`ROUTE TOOL #${fInt(toolNumber)}: ${name}`)
    if (toolDiameter != null) c(`DIAMETER: ${f(toolDiameter)}`)

    if (headAt) emit(`G0 ${rOff}X${headAt.x} Y${headAt.y}`)
    emit(p.tool_change_code.replace('{n}', String(toolNumber)))
    const spindle = `${p.spindle_on_code} S${fInt(p.base_spindle_speed)}`
    if (leadIn) emit(`G0 ${rOff}X${leadIn.x} Y${leadIn.y} ${spindle}`)
    else {
      if (rOff) emit(p.router_work_offset)
      emit(spindle)
    }
    // The H register is ALWAYS derived from the machine rule (tool number +
    // delta) so a wrong/typed value can never reach the controller.
    if (p.emit_tool_length_offset) emit(`G43 H${fInt(toolNumber + p.tool_h_offset_delta)} Z${fz(safeZ)}`)
    if (approachZ) emit(`G0 ${approachZ}`)

    buf.slice(0, head).forEach(l => emit(l))          // the section's own comments
    buf.slice(head + eaten).forEach(l => emit(l))     // everything after the approach

    routerOpen = true
    // Remember where this section leaves the head, for the next tool change.
    for (let i = buf.length - 1; i >= 0; i--) {
      const m = /X(-?[\d.]+) Y(-?[\d.]+)/.exec(buf[i])
      if (m) { headAt = { x: m[1], y: m[2] }; break }
    }
  }
  // (The routing plunge feed is derived where it is used — routePerimeter and
  // emitRoutes each compute it from the routing tool. Drilling no longer shares
  // it; it has its own machine-level drill_feed_rate. See defect D5.)

  // Placeholder substitution for the machine header/footer templates.
  const subst = (tpl: string) => tpl
    .replace(/\{O\}/g, input.programNumber ?? `O${String(sheet.index + 1).padStart(4, '0')}`)
    .replace(/\{LENGTH\}/g, f(sheet.stock.w))
    .replace(/\{WIDTH\}/g, f(sheet.stock.h))
    .replace(/\{THICKNESS\}/g, f(thickness))
    .replace(/\{JOB\}/g, input.jobNumber ?? '')
    .replace(/\{MATERIAL\}/g, input.materialName ?? '')
    .replace(/\{SAFEZ\}/g, fz(safeZ))

  // ── 1-3. Header / setup ───────────────────────────────────────────────────────
  // A machine template (Anderson .anc) fully OWNS the preamble: the % wrapper,
  // O-number, #1/#2/#3 macros, vacuum/zone subprograms and look-ahead mode.
  if (p.header_template) {
    subst(p.header_template).split('\n').forEach(l => emit(l))
  } else {
    c(`Sheet ${sheet.index + 1}  ${sheet.stock.w}x${sheet.stock.h}mm  ${thickness}mm`)
    if (p.program_header) p.program_header.split('\n').forEach(l => emit(l))
    emit(`${p.units_code} G90 G17`)            // mm, absolute, XY plane
    emit(p.work_offset_code)
    emit(`G0 Z${fz(safeZ)}`)
    if (p.sheet_load_pause) { c('Load sheet'); emit('M00') }                              // sheet load pause
    if (p.dust_extraction_enabled) { c('Dust extraction on'); emit(p.coolant_on_code) }   // dust extraction on
  }

  // ── 4. ALL drilling (before routing — non-negotiable) ────────────────────────
  if (realDrills.length) {
    if (input.drillBlock) {
      // Anderson gang drilling — detect 32mm-grid runs and emit M88/M89 bitmasks.
      const lastMaster = emitGangDrilling(emit, c, f, fz, fPlain, blank, realDrills, input.drillBlock, p, sheet.stock.h, thickness)
      // Into the router's frame: the block reads the same physical point with
      // its head offset applied, the router reads it without.
      if (lastMaster) headAt = { x: f(mapX(lastMaster.x)), y: f(mapY(lastMaster.y)) }
    } else {
      c(`Drilling ${realDrills.length} holes, ${p.drill_sequence_strategy} order`)
      emit(p.tool_change_code.replace('{n}', String(input.drillToolNumber ?? input.toolNumber)))
      emit(`${p.spindle_on_code} S${fInt(p.base_spindle_speed)}`)
      // Drill retract plane, shared with the gang-block path so both agree.
      const drillRapid = fz(p.drill_retract_mode !== 'absolute' ? p.drill_clearance_z : p.drill_rapid_z)
      for (const d of sequenceDrills(realDrills, p)) {
        headAt = { x: f(mapX(d.x)), y: f(mapY(d.y)) }
        emit(`G0 X${f(mapX(d.x))} Y${f(mapY(d.y))} Z${drillRapid}`)
        // "Drill twice": plunge → retract, repeated `passes` times in hard board.
        const passes = Math.max(1, Math.round(d.passes ?? 1))
        for (let i = 0; i < passes; i++) {
          // Drilling feed, not the routing tool's plunge feed (defect D5).
          emit(`G1 Z${fz(-Math.abs(d.depth))} F${f(p.drill_feed_rate)}`)
          emit(`G0 Z${drillRapid}`)
        }
      }
      emit(`G0 Z${fz(safeZ)}`)
      emit(p.spindle_off_code)
    }
  }

  // ── 4b. Circular pockets for un-drillable holes (before routing) ─────────────
  // Each is helically ramped in with a router bit and cleared to the hole wall.
  if (pocketHoles.length) emitCircularPockets(emitRouterSection, f, fz, pocketHoles, p, mapX, mapY, safeZ, stepDown)

  // ── 4c. Internal routing features (grooves / routes / pockets) ───────────────
  // Cut BEFORE the part perimeter so the part is still fully held. Each carries its
  // own router bit (grouped → one tool change). All run on the back/material-up pass
  // for now — plane_kind/front-face flip is Phase B §3a/b/d, not yet built.
  if (input.routes?.length) emitRoutes(emitRouterSection, f, fz, input.routes, p, mapX, mapY, safeZ, thickness)

  // ── 5-6. ALL routing — inside-out, travel-ordered ──────────────────────────
  // Runs through the same section helper as the pocket and internal-feature
  // sections, so the tool-change block, work offset and head tracking are
  // identical wherever a tool is called.
  const ordered = orderByTravel(sheet)
  const toolR = (input.toolDiameter ?? 0) / 2
  const outlineOf = (pl: { uid: string }) => {
    const o = input.outlines?.[pl.uid]
    return o && o.length >= 3 ? o : undefined
  }
  // A part's holes, cut inside-out before its perimeter (the part still held).
  const cutHoles = (emitR: (s: string) => void, cR: (s: string) => void, pl: { uid: string; label: string }, depth: number, start: number) => {
    const hs = (input.holes?.[pl.uid] ?? []).filter(h => h.length >= 3)
    hs.forEach((h, i) => {
      cR(`Cutout ${i + 1} in ${pl.label}`)
      routePerimeter(emitR, f, fz, { x: 0, y: 0, w: 0, h: 0, label: `${pl.label} cutout ${i + 1}` }, depth, stepDown, safeZ, thickness, p, mapX, mapY, flipWinding, start, toolR, input.toolNumber, h, true)
    })
  }
  emitRouterSection(input.toolNumber, input.toolDiameter, (emitR, cR) => {
    if (p.cutter_compensation !== 'off' && toolR <= 0) cR('WARN: cutter compensation requested but routing tool diameter unknown - parts may cut undersized')
    if (hasSkin) {
      // Phase 1: rough every part down to the onion-skin depth (parts stay held).
      cR('Roughing pass - leave onion skin')
      for (const pl of ordered) {
        cutHoles(emitR, cR, pl, roughDepth, 0)
        cR(`Part ${pl.label}`)
        routePerimeter(emitR, f, fz, pl, roughDepth, stepDown, safeZ, thickness, p, mapX, mapY, flipWinding, 0, toolR, input.toolNumber, outlineOf(pl))
      }
      // Phase 2: separate every part — cut through the remaining skin.
      cR('Separation pass - cut through onion skin')
      for (const pl of ordered) {
        cutHoles(emitR, cR, pl, throughDepth, roughDepth)
        cR(`Part ${pl.label}`)
        routePerimeter(emitR, f, fz, pl, throughDepth, stepDown, safeZ, thickness, p, mapX, mapY, flipWinding, roughDepth, toolR, input.toolNumber, outlineOf(pl))
      }
    } else {
      for (const pl of ordered) {
        cutHoles(emitR, cR, pl, throughDepth, 0)
        cR(`Part ${pl.label}`)
        routePerimeter(emitR, f, fz, pl, throughDepth, stepDown, safeZ, thickness, p, mapX, mapY, flipWinding, 0, toolR, input.toolNumber, outlineOf(pl))
      }
    }
    // (each routePerimeter already lifts to safe Z; the footer/template homes)
  })


  // ── 7-10. Shutdown ───────────────────────────────────────────────────────────
  // A machine template fully OWNS the postamble (G80, G28 homing, drill banks off,
  // zone deselect, release-vacuum/push block-deletes, M30, closing %).
  if (p.footer_template) {
    subst(p.footer_template).split('\n').forEach(l => emit(l))
  } else {
    if (p.dust_extraction_enabled) { c('Dust extraction off'); emit(p.coolant_off_code) }
    emit(p.spindle_off_code)
    if (p.push_off_enabled) { c('Push-off'); emit(`G0 X${f(sheet.stock.w + Math.max(0, p.push_off_distance))} Y0`) }
    if (p.program_footer) p.program_footer.split('\n').forEach(l => emit(l))
    else { emit(`G0 Z${f(safeZ)}`); emit('G0 X0 Y0'); emit('M30') }
  }

  // CRLF + 7-bit ASCII. The ASCII fold is applied to the WHOLE program, not
  // just to comments, because the machine profile's header/footer templates are
  // emitted verbatim and are just as capable of carrying a smart-quote.
  const body = p.modal_output ? modalize(lines) : lines
  return toAscii(body.join(EOL) + EOL)
}

// Emits one routing section behind a tool-change block. Supplied by
// generateSheetGcode, which owns the work offset, head tracking and section
// closing; the section itself only lays out its own geometry.
type RouterSection = (
  toolNumber: number,
  toolDiameter: number | null | undefined,
  body: (emit: (s: string) => void, c: (s: string) => void) => void,
) => void

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

// Circular pockets for holes no drill bit can make. Grouped by router tool;
// each hole is helically ramped from the clearance plane down to depth (the
// "slow ram-in" instead of a straight plunge), then concentric finishing
// circles clear out to the hole wall. Pure motion in sheet→machine coords.
function emitCircularPockets(
  section: RouterSection,
  f: (v: number) => string, fz: (v: number) => string,
  holes: SheetDrill[], p: PostProfile,
  mapX: (x: number) => number, mapY: (y: number) => number, safeZ: number, stepDown: number,
) {
  const helicalFeed = f(Math.round(p.base_feed_rate * (p.helical_feed_pct > 0 ? p.helical_feed_pct : 40) / 100))
  const cutFeed = f(p.base_feed_rate)
  const clearZ = p.clearance_z

  // Group by router tool so one tool change covers all its pockets.
  const byTool = new Map<number, SheetDrill[]>()
  for (const h of holes) { const t = h.pocket!.toolNumber; (byTool.get(t) ?? byTool.set(t, []).get(t)!).push(h) }

  for (const [toolN, hs] of byTool) {
    section(toolN, hs[0].pocket!.toolDiameter, (emit, c) => {
    c(`Pocket-route ${hs.length} holes - no drill match`)

    for (const h of hs) {
      const holeR = h.diameter / 2
      const routerR = h.pocket!.toolDiameter / 2
      const sweep = Math.max(0, holeR - routerR)        // bit-centre radius to reach the wall
      if (sweep <= 0.05) continue                        // bit ≥ hole: nothing to pocket
      const stepover = Math.max(0.5, h.pocket!.toolDiameter * 0.45)
      const entryR = Math.min(sweep, Math.max(0.5, routerR * 0.8))   // helix radius
      const depth = Math.abs(h.depth)

      const off = (r: number) => ({ sx: mapX(h.x + r), sy: mapY(h.y) })  // orbit point at radius r
      const cmx = mapX(h.x), cmy = mapY(h.y)
      const arc = (sx: number, sy: number, z: number | null, feed: string) =>
        emit(`G3 X${f(sx)} Y${f(sy)}${z != null ? ` Z${fz(z)}` : ''} I${f(cmx - sx)} J${f(cmy - sy)} F${feed}`)

      // Helical ram-in at entryR down to depth.
      const e = off(entryR)
      emit(`G0 X${f(e.sx)} Y${f(e.sy)} Z${fz(clearZ)}`)
      const passes = Math.max(1, Math.ceil(depth / Math.max(0.5, stepDown)))
      for (let i = 1; i <= passes; i++) arc(e.sx, e.sy, -Math.min(depth, i * stepDown), helicalFeed)
      arc(e.sx, e.sy, null, cutFeed)                     // flat finishing circle at entryR

      // Spiral outward to the wall with concentric circles at depth.
      let r = entryR
      while (r < sweep - 1e-3) {
        r = Math.min(sweep, r + stepover)
        const o = off(r)
        emit(`G1 X${f(o.sx)} Y${f(o.sy)} F${cutFeed}`)
        arc(o.sx, o.sy, null, cutFeed)
      }
      emit(`G0 Z${fz(safeZ)}`)
    }
    })
  }
}

// Internal routing features (Phase B §3c): grooves + rectangular routes/pockets,
// cut on the back/material-up pass with each op's own router bit. Grouped by tool so
// one change covers all its features. Depth is reached in stepdown passes (the op's
// tool max-depth-per-pass, else the profile's rough Z step). Pocket ENTRY is at the
// pocket centre and its METHOD comes from the machine profile (entry_strategy +
// helical_/ramp_ params) — helical corkscrew, zig-zag ramp, or straight/pre-drill
// plunge. Geometry is centreline (no cutter compensation): a groove is one or more
// lanes across its width; a cleared pocket is rastered/spiralled a tool-radius inside
// its rectangle (fillStrategy); an outline traces that inset rectangle.
function emitRoutes(
  section: RouterSection,
  f: (v: number) => string, fz: (v: number) => string,
  routes: SheetRoute[], p: PostProfile,
  mapX: (x: number) => number, mapY: (y: number) => number, safeZ: number, thickness: number,
) {
  // The section helper owns the output sink, but the geometry helpers below are
  // shared across tool groups, so the sink is a binding they close over and each
  // section fills in before running. Assigned synchronously inside section().
  let emit: (s: string) => void = () => {}
  let c: (s: string) => void = () => {}
  const cutFeed = f(p.base_feed_rate)
  const plungeFeed = f(p.plunge_feed_rate > 0 ? p.plunge_feed_rate : p.base_feed_rate)
  const helicalFeed = f(Math.round(p.base_feed_rate * (p.helical_feed_pct > 0 ? p.helical_feed_pct : 40) / 100))
  const clearZ = p.clearance_z
  // Walk a tool-centre polyline at a fixed depth (first point is where the tool
  // already sits after entry). Coords are datum-mapped here.
  const runPath = (pts: Pt2[], z: number, from = 1) => {
    for (let i = from; i < pts.length; i++) emit(`G1 X${f(mapX(pts[i].x))} Y${f(mapY(pts[i].y))} Z${fz(z)} F${cutFeed}`)
  }
  const rampFeed = f(Math.round(p.base_feed_rate * (p.ramp_in_feed_pct > 0 ? p.ramp_in_feed_pct : 50) / 100))
  // Enter a pocket AT ITS CENTRE down to zTarget, per the machine profile's POCKET
  // entry strategy (cnc_machine_profiles.pocket_entry_strategy + helical_/ramp_ params;
  // separate from the perimeter's entry_strategy so a helical pocket entry doesn't
  // force the perimeter to helix). Location
  // is always the centre (max interior room); only the METHOD comes from the profile.
  // `roomR` = the largest radius that fits inside the pocket. Returns the tool-centre
  // XY after entry, which the caller joins to the clearing path.
  const enterPocket = (cx: number, cy: number, roomR: number, zTarget: number, step: number): Pt2 => {
    const cmx = mapX(cx), cmy = mapY(cy)
    const strat = p.pocket_entry_strategy || 'helical'
    if (strat === 'helical' && roomR >= 0.6) {
      const rr = Math.min(p.helical_radius > 0 ? p.helical_radius : roomR, roomR)
      const sx = mapX(cx + rr), sy = mapY(cy)
      emit(`G0 X${f(sx)} Y${f(sy)} Z${fz(clearZ)}`)
      const arcs = Math.max(1, Math.ceil((clearZ - zTarget) / Math.max(0.5, step)))
      for (let a = 1; a <= arcs; a++) emit(`G3 X${f(sx)} Y${f(sy)} Z${fz(clearZ + (zTarget - clearZ) * (a / arcs))} I${f(cmx - sx)} J${f(cmy - sy)} F${helicalFeed}`)
      for (let k = 0; k < Math.max(1, p.helical_passes); k++) emit(`G3 X${f(sx)} Y${f(sy)} I${f(cmx - sx)} J${f(cmy - sy)} F${cutFeed}`)   // flat finishing turn(s)
      return { x: cx + rr, y: cy }
    }
    if (strat === 'ramp' && roomR >= 0.6) {
      // Zig-zag ramp along X, centred, bounded to the pocket; laps until at depth.
      const half = Math.min(roomR, Math.max(1, (p.ramp_in_distance > 0 ? p.ramp_in_distance : 20) / 2))
      const drop = clearZ - zTarget
      const run = drop / Math.max(1e-3, Math.tan((p.ramp_in_angle > 0 ? p.ramp_in_angle : 3) * Math.PI / 180))
      const laps = Math.max(1, Math.ceil(run / (2 * half)))
      emit(`G0 X${f(mapX(cx - half))} Y${f(cmy)} Z${fz(clearZ)}`)
      for (let l = 1; l <= laps; l++) emit(`G1 X${f(mapX(l % 2 === 1 ? cx + half : cx - half))} Y${f(cmy)} Z${fz(clearZ + (zTarget - clearZ) * (l / laps))} F${rampFeed}`)
      return { x: laps % 2 === 1 ? cx + half : cx - half, y: cy }
    }
    // straight_plunge / pre_drill / too-small fallback: plunge at the centre.
    if (strat === 'pre_drill') c('PRE-DRILL pocket entry (drill the entry hole first)')
    emit(`G0 X${f(cmx)} Y${f(cmy)} Z${fz(safeZ)}`)
    emit(`G1 Z${fz(zTarget)} F${plungeFeed}`)
    return { x: cx, y: cy }
  }

  const byTool = new Map<number, SheetRoute[]>()
  for (const r of routes) (byTool.get(r.toolNumber) ?? byTool.set(r.toolNumber, []).get(r.toolNumber)!).push(r)

  for (const [toolN, rs] of byTool) {
    section(toolN, rs[0].toolDiameter, (e, cc) => {
    emit = e; c = cc
    c(`Routing ${rs.length} internal features`)

    for (const r of rs) {
      const depth = Math.min(r.depth, thickness)   // never past the panel back
      const step = r.maxDepthPerPass && r.maxDepthPerPass > 0 ? r.maxDepthPerPass : p.rough_pass_z_step
      const passes = Math.max(1, Math.ceil(depth / Math.max(0.5, step)))
      const toolR = r.toolDiameter / 2

      if (r.kind === 'groove') {
        // Lanes across the slot width, centred on the line (≥1). A single-tool-wide
        // groove is one centreline pass; a wider slot fills with parallel lanes.
        const dx = r.x2 - r.x1, dy = r.y2 - r.y1
        const L = Math.hypot(dx, dy) || 1
        const nx = -dy / L, ny = dx / L                          // unit perpendicular
        const span = Math.max(0, r.width - r.toolDiameter)
        const lanes = span <= 0.01 ? 1 : Math.max(2, Math.ceil(span / Math.max(0.5, r.toolDiameter * 0.9)) + 1)
        for (let i = 1; i <= passes; i++) {
          const z = -Math.min(depth, i * step)
          for (let l = 0; l < lanes; l++) {
            const off = lanes === 1 ? 0 : (-span / 2 + (span * l) / (lanes - 1))
            const serp = l % 2 === 1                              // serpentine to cut travel
            const s0x = (serp ? r.x2 : r.x1) + nx * off, s0y = (serp ? r.y2 : r.y1) + ny * off
            const s1x = (serp ? r.x1 : r.x2) + nx * off, s1y = (serp ? r.y1 : r.y2) + ny * off
            emit(`G0 X${f(mapX(s0x))} Y${f(mapY(s0y))} Z${fz(safeZ)}`)
            emit(`G1 Z${fz(z)} F${plungeFeed}`)
            emit(`G1 X${f(mapX(s1x))} Y${f(mapY(s1y))} F${cutFeed}`)
          }
        }
        emit(`G0 Z${fz(safeZ)}`)
        continue
      }

      // Area op — tool-centre path stays inside the nominal rectangle (inset by the
      // tool radius). Clear = pocket (raster / spiral by fillStrategy); else outline.
      const x0 = r.x + toolR, y0 = r.y + toolR, x1 = r.x + r.w - toolR, y1 = r.y + r.h - toolR
      if (!(x1 > x0) || !(y1 > y0)) { c('WARN: route feature smaller than its tool - skipped'); continue }
      const stepover = Math.max(0.5, r.toolDiameter * (r.stepoverPct > 0 ? r.stepoverPct : 70) / 100)
      const pts = r.clear ? clearPath(r.fillStrategy, x0, y0, x1, y1, stepover, r.rasterAngleDeg) : outlinePath(x0, y0, x1, y1)
      if (pts.length < 2) continue
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
      const roomR = Math.min((x1 - x0) / 2, (y1 - y0) / 2)
      for (let i = 1; i <= passes; i++) {
        const z = -Math.min(depth, i * step)
        if (r.clear) {
          // Enter at the centre by the machine profile's strategy, then join the path.
          enterPocket(cx, cy, roomR, z, step)
          emit(`G1 X${f(mapX(pts[0].x))} Y${f(mapY(pts[0].y))} Z${fz(z)} F${cutFeed}`)
          runPath(pts, z, 1)
        } else {
          // Boundary outline: plunge at the path start (no interior to helix into).
          emit(`G0 X${f(mapX(pts[0].x))} Y${f(mapY(pts[0].y))} Z${fz(safeZ)}`)
          emit(`G1 Z${fz(z)} F${plungeFeed}`)
          runPath(pts, z, 1)
        }
        emit(`G0 Z${fz(safeZ)}`)
      }
    }
    })
  }
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
  fz: (v: number) => string, fPlain: (v: number) => string, blank: () => void,
  drills: SheetDrill[], block: DrillBlockConfig, p: PostProfile, sheetHeight: number,
  thickness: number,
): { x: number; y: number } | null {
  const { groups, warnings } = computeGangs(
    drills.map(d => ({ x: d.x, y: d.y, diameter: d.diameter, depth: d.depth })), block,
  )
  for (const w of warnings) c(`WARN: ${w}`)
  if (!groups.length) return null
  // The last master fired, in sheet coords — where the block leaves the head.
  let lastMaster: { x: number; y: number } | null = null

  // Sheet-local → machine coords. X carries the head offset; Y is mirrored (face
  // down) then signed, plus the head offset (the multidrill-head compensation).
  const tx = (x: number) => x + block.headOffsetXMm
  const ty = (y: number) => p.sign_y * (p.mirror_y ? sheetHeight - y : y) + block.headOffsetYMm
  // Drill-block Z (defect D9, plus the depth-datum bug it was hiding).
  //
  // Depth is measured from the MATERIAL SURFACE, not from the retract plane.
  // The old form — depthZ = drill_rapid_z - depth — put the air gap between the
  // retract plane and the sheet inside the hole, so every hole came out short by
  // exactly (drill_rapid_z - thickness). In the program that shipped that was
  // 3.5mm: a through-hole penetrated 13mm of a 16.5mm panel and never broke
  // through, and 12mm dowel holes came out at 8.5mm.
  //
  // fz() is the same Z transform the routing section uses, so drilling and
  // routing now share one datum. On the Anderson (spoilboard zero) it yields
  // exactly the gold reference's numbers: R = 16.5 + 20 = 36.5, and a 12mm hole
  // in a 16.5mm sheet plunges to Z4.5.
  const derivedRetract = p.drill_retract_mode !== 'absolute'
  const rapidZ = derivedRetract ? fz(p.drill_clearance_z) : f(p.drill_rapid_z)
  // A hole asked to go the full thickness is a THROUGH hole: add the overshoot
  // so the slug releases instead of hanging on a whisker. Blind holes (dowel,
  // hinge, shelf pin) keep their exact depth.
  const effectiveDepth = (depth: number) => {
    const d = Math.abs(depth)
    return d >= thickness - 0.01 ? thickness + Math.max(0, p.drill_through_overshoot) : d
  }
  const depthZ = (depth: number) => derivedRetract
    ? fz(-effectiveDepth(depth))
    : f(p.drill_rapid_z - effectiveDepth(depth))
  // One machine-level drill feed: the block runs off a single drive, and the
  // gold reference uses F3000. for every cycle whatever the bit or the depth.
  // Previously this was the ROUTING tool's feed scaled by plunge_feed_pct,
  // which is how F11200 (28000 x 40%) reached a drill block.
  const drillFeed = f(p.drill_feed_rate)
  const prep = (p.drill_bank_prep_codes || '').split('\n').map(s => s.trim()).filter(Boolean)
  // "Drill twice": plunges per hole come from the bit (via the resolved drills),
  // keyed by diameter — every hole of a given Ø shares the same bit/pass count.
  const diaKey = (dia: number) => Math.round(dia * 10) / 10
  const passesByDia = new Map<number, number>()
  for (const d of drills) {
    const k = diaKey(d.diameter)
    passesByDia.set(k, Math.max(passesByDia.get(k) ?? 1, Math.max(1, Math.round(d.passes ?? 1))))
  }

  // Emit one bank firing: select the gang's bitmask, then plunge at each master
  // in `masters` (step-and-repeat). Slaves fire automatically at fixed offsets.
  // When the bit is set to drill twice, each master's XY is re-issued inside the
  // canned cycle so the controller re-plunges at the same spot.
  const emitFiring = (g: GangGroup, masters: { x: number; y: number }[]) => {
    if (!masters.length) return
    lastMaster = masters[masters.length - 1]
    const mcode = g.bank === 'x' ? block.xBankMcode : block.yBankMcode
    const passes = passesByDia.get(diaKey(g.diameter)) ?? 1
    const dz = depthZ(g.depth)
    c(`DRILL TOOL: V ${fPlain(g.diameter)}MM`)
    c(`DRILL MASTER: ${g.masterSpindle}, SLAVE: ${g.slaveSpindles.join(',') || '-'}`)
    c(`DIAMETER: ${f(g.diameter)}${passes > 1 ? ` x${passes} passes` : ''}`)
    emit(`${block.xBankMcode} B0`)
    emit(`${block.yBankMcode} B0`)
    // Bank enable (M23/M21) is a once-per-section prep, exactly as the gold
    // reference does it — repeating it per firing achieved nothing.
    if (!prepDone) { prep.forEach(l => emit(l)); prepDone = true }
    emit(`${mcode} B${g.bitmask}`)
    const m0 = masters[0]
    emit(`G90 G0 ${block.workOffsetCode} G43 H1 X${f(tx(m0.x))} Y${f(ty(m0.y))} Z${rapidZ}`)
    emit(`${p.drill_return_code} ${p.drill_cycle_code} Z${dz} R${rapidZ} F${drillFeed}`)
    for (let k = 1; k < passes; k++) emit(`X${f(tx(m0.x))} Y${f(ty(m0.y))} Z${dz}`)   // re-plunge master 0
    for (const m of masters.slice(1)) for (let k = 0; k < passes; k++) emit(`X${f(tx(m.x))} Y${f(ty(m.y))} Z${dz}`)
    emit('G80')   // cancel canned cycle
    // NO Z-homing here. Between firings the block travels at the retract plane,
    // which already clears the sheet, so the gold reference homes ONCE after all
    // drilling — this used to fire a full G28 Z per bitmask.
    blank()
  }

  // Gang detection ran across the whole sheet (so gangs stay maximal), but we
  // EMIT band-by-band: split the sheet into horizontal strips of drill_band_height_mm
  // and, within each strip, fire every group that has masters there. This keeps
  // singles + nearby gangs drilling together and turns "one full-sheet sweep per
  // bitmask" into a single progression up the sheet. A group spanning two bands is
  // simply fired once per band (cheap re-select). Strips serpentine, and the masters
  // within each firing alternate direction too, so the head flows instead of
  // snapping back to X0.
  const bandH = Math.max(1, p.drill_band_height_mm)
  const bandOf = (y: number) => Math.floor(y / bandH)
  const minX = (ms: { x: number }[]) => Math.min(...ms.map(m => m.x))
  const bandList = [...new Set(groups.flatMap(g => g.masters.map(m => bandOf(m.y))))].sort((a, b) => a - b)

  let prepDone = false
  blank()
  c(`Drilling - ${groups.length} gang groups over ${bandList.length} bands of ${f(bandH)}mm, Anderson M88/M89`)
  bandList.forEach((band, bi) => {
    const dir = bi % 2 === 0 ? 1 : -1   // serpentine the strips
    const firings = groups
      .map(g => ({ g, ms: g.masters.filter(m => bandOf(m.y) === band) }))
      .filter(fr => fr.ms.length > 0)
      .sort((a, b) => dir * (minX(a.ms) - minX(b.ms)))
    firings.forEach((fr, fi) => {
      const mdir = fi % 2 === 0 ? dir : -dir   // alternate each firing so the head keeps flowing
      const ordered = [...fr.ms].sort((a, b) => mdir * (a.x - b.x) || (a.y - b.y))
      emitFiring(fr.g, ordered)
    })
  })

  // Close the drilling section ONCE: home Z, clear both banks, spindle stop.
  // Previously emitted after every bitmask firing.
  emit('G17 G91 G28 Z0 M95')
  emit(`${block.xBankMcode} B0`)
  emit(`${block.yBankMcode} B0`)
  emit('M22')
  return lastMaster
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
  mapX: (n: number) => number,   // internal sheet X → machine X (datum transform)
  mapY: (n: number) => number,   // internal sheet Y → machine Y
  flipWinding: boolean,          // true when the datum reflects one axis (reverse corner order)
  startDepth = 0,   // depth-from-top where this routing begins (>0 = separating into an existing kerf)
  toolRadius = 0,   // routing bit radius (mm) — used for cutter compensation
  toolNumber = 1,   // routing tool number — used as the G41/G42 offset register (D)
  outline?: { x: number; y: number }[],   // shaped part: closed outline, sheet coords (O4)
  inside = false,   // outline is a hole (benchtop cutout): the tool runs inside it, the slug is waste
) {
  type V = [number, number]
  // Cutter compensation so the part cuts to size (otherwise the tool centreline on the
  // outline removes the radius from every side → undersized).
  //   computer → grow the outline outward by the radius here (coords come out correct)
  //   control  → keep the outline, wrap the cut in G41/G42 + G40 so the MACHINE offsets
  //   off      → no compensation (only correct if the CAM already offset the geometry)
  const compMode = p.cutter_compensation || 'computer'
  const r = compMode === 'computer' ? toolRadius : 0
  const control = compMode === 'control' && toolRadius > 0
  // Outer profile: keep the tool OUTSIDE the contour. Emitted direction is CCW for climb,
  // so the outside is to the right → G42 (G41 for the conventional/CW case).
  // All geometry is built directly in MACHINE space (datum applied via mapX/mapY),
  // so tangents, normals and G2/G3 arcs all fall out correctly. The outline is
  // grown by the computer-comp radius r in internal coords first (|scale| = 1, so
  // no size distortion), then mapped.
  // Corner sequence: climb = CCW, conventional = CW (for an outer profile).
  const climb = p.milling_direction !== 'conventional'
  const compCode = climb ? 'G42' : 'G41'
  const ex = pl.x - r, ey = pl.y - r, ew = pl.w + 2 * r, eh = pl.h + 2 * r
  const m = (x: number, y: number): V => [mapX(x), mapY(y)]
  let corners: V[]
  if (outline) {
    // Shaped part (O4): the outline, wound CCW for climb / CW for conventional
    // like the rect, grown out by the computer-comp radius (sharp mitred
    // corners — an inside corner keeps the tool's radius, as any router does).
    // A recess narrower than the bit is skipped, never gouged (toolPathLoop).
    // A hole winds the other way (CW for climb): the waste is inside it.
    const wound = (loopArea(outline) >= 0) === (climb !== inside) ? outline : [...outline].reverse()
    const tp = toolPathLoop(wound, r, inside)
    // A hole the bit can't get round collapses (its tool path turns inside out).
    if (inside && (tp.pts.length < 3 || Math.sign(loopArea(tp.pts)) !== Math.sign(loopArea(wound)) || Math.abs(loopArea(tp.pts)) < 1)) {
      emit(sanitiseComment(`WARN: ${pl.label} is too small for the ${f(toolRadius * 2)}mm bit - not cut`, p.max_comment_length))
      return
    }
    if (tp.dropped) emit(sanitiseComment(`WARN: ${pl.label} has detail smaller than the ${f(toolRadius * 2)}mm bit - not cut there`, p.max_comment_length))
    corners = tp.pts.map(q => m(q.x, q.y))
  } else {
    corners = climb
      ? [m(ex, ey), m(ex + ew, ey), m(ex + ew, ey + eh), m(ex, ey + eh)]
      : [m(ex, ey), m(ex, ey + eh), m(ex + ew, ey + eh), m(ex + ew, ey)]
  }
  if (flipWinding) corners.reverse()
  const n = corners.length

  const unit = (a: V, b: V): V => { const dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l] }
  const len = (a: V, b: V) => Math.hypot(b[0] - a[0], b[1] - a[1])

  // The loop as moves. A shaped outline's sampled arcs (a radius end's 5° flats)
  // fit back into true arcs, cut as one G2/G3 each — fitted in machine space, so
  // the datum's mirror is already in the turn direction. A loop with no
  // straight edge to start on stays as flats.
  type Move = { a: V; b: V; arc?: { c: V; ccw: boolean } }
  let moves: Move[] = corners.map((a, i) => ({ a, b: corners[(i + 1) % n] }))
  if (outline) {
    const fit = fitLoopArcs(corners.map(([x, y]) => ({ x, y })))
    if (fit.some(mv => !mv.arc)) {
      moves = fit.map(mv => ({
        a: [mv.a.x, mv.a.y], b: [mv.b.x, mv.b.y],
        ...(mv.arc ? { arc: { c: [mv.arc.c.x, mv.arc.c.y] as V, ccw: mv.arc.ccw } } : {}),
      }))
    }
  }
  const nm = moves.length

  // Start point = midpoint of the part's LONGEST straight edge; on ties pick the edge
  // nearest the FRONT of the machine (lowest machine Y, then lowest X) so the
  // entry/exit scar lands in the near waste — matches the Anderson post.
  let eIdx = 0, bestL = -1, bestY = Infinity, bestX = Infinity
  for (let i = 0; i < nm; i++) {
    if (moves[i].arc) continue
    const { a, b } = moves[i]
    const l = len(a, b), my = (a[1] + b[1]) / 2, mx = (a[0] + b[0]) / 2
    if (l > bestL + 1e-6 ||
       (Math.abs(l - bestL) < 1e-6 && (my < bestY - 1e-6 || (Math.abs(my - bestY) < 1e-6 && mx < bestX - 1e-6)))) {
      bestL = l; bestY = my; bestX = mx; eIdx = i
    }
  }
  const A = moves[eIdx].a, B = moves[eIdx].b
  const S: V = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]
  // Closed cut path starting AND ending at S (the longest edge is split at its midpoint).
  const path: { to: V; arc?: Move['arc'] }[] = [{ to: S }, { to: B }]
  for (let k = 1; k < nm; k++) { const mv = moves[(eIdx + k) % nm]; path.push({ to: mv.b, ...(mv.arc ? { arc: mv.arc } : {}) }) }
  path.push({ to: S })

  // Tangent leaving S along the edge, and outward normal (into scrap). The cut both
  // leaves and returns to S along the same edge line, so in/out tangents coincide.
  // Outward = right of travel on a CCW (machine-space) loop, left on a CW one —
  // from the winding, so it holds for concave outlines too.
  let area2 = 0
  for (let i = 0; i < n; i++) { const a = corners[i], b = corners[(i + 1) % n]; area2 += a[0] * b[1] - b[0] * a[1] }
  // (A hole's waste is its inside: the other side.)
  const outward = (_at: V, tan: V): V => (area2 >= 0) !== inside ? [tan[1], -tan[0]] : [-tan[1], tan[0]]
  const tIn = unit(S, B)
  const nIn = outward(S, tIn)
  const tOut = tIn, nOut = nIn

  const passes = Math.max(1, Math.ceil((cutDepth - startDepth) / Math.max(1, stepDown)))
  const useTabs = p.tabs_enabled && pl.w * pl.h >= p.tab_min_part_area
  const clearZ = Math.min(p.clearance_z, safeZ)
  const fr = (pct: number) => f(Math.round(p.base_feed_rate * (pct > 0 ? pct : 100) / 100))
  // Plunge / ramp entry feed: an absolute mm/min value off the routing tool.
  const plungeF = f(p.plunge_feed_rate > 0 ? p.plunge_feed_rate : p.base_feed_rate)
  const cutF = f(Math.round(p.base_feed_rate))

  // Arc emitter (XY plane, I/J relative to current position `from`).
  const arc = (from: V, to: V, c: V, ccw: boolean, d: number, feed: string) =>
    emit(`G${ccw ? 3 : 2} X${f(to[0])} Y${f(to[1])} Z${fz(d)} I${f(c[0] - from[0])} J${f(c[1] - from[1])} F${feed}`)

  // Cut the full closed perimeter from S back to S at constant depth d.
  const cutLoop = (d: number) => {
    for (let i = 1; i < path.length; i++) {
      const { to, arc: a } = path[i]
      if (a) arc(path[i - 1].to, to, a.c, a.ccw, d, cutF)
      else emit(`G1 X${f(to[0])} Y${f(to[1])} Z${fz(d)} F${cutF}`)
    }
  }

  // Straight ramp entry/exit (Anderson .anc). Approach a point offset back along the
  // start edge by the ramp run (= drop / tan(angle)) and tool_entry_offset into the
  // waste, drop to the clearance plane, then a SINGLE G1 ramp down onto S at depth.
  // The exit mirrors it past a tool-diameter overshoot, lifting back to clearance.
  const firstDir = unit(S, path[1].to)
  const nrmS = outward(S, firstDir)
  // 'straight' approach ramps on the edge line (no lateral offset); 'offset' starts
  // tool_entry_offset into the waste so the entry scar sits off the finished edge.
  const offIn = p.perimeter_approach_type === 'straight' ? 0 : Math.max(0, p.tool_entry_offset)
  const toolDia = toolRadius * 2
  const rampRun = (d: number) => (clearZ - d) / Math.max(1e-3, Math.tan((p.ramp_in_angle > 0 ? p.ramp_in_angle : 3) * Math.PI / 180))
  // In a hole the run back along the edge would leave the hole and cut the
  // part, so the ramp zig-zags along the start edge (S back towards its start
  // and over again), no steeper than the set angle, finishing at S.
  const edgeRoom = Math.max(1, len(A, S) - 0.5)
  const zigRampIn = (d: number) => {
    const tv = rampRun(d)
    const legs = Math.max(1, Math.ceil(tv / edgeRoom))
    const runL = Math.min(edgeRoom, tv)
    const back: V = [S[0] - firstDir[0] * runL, S[1] - firstDir[1] * runL]
    const at = (k: number): V => ((legs - k) % 2 === 0 ? S : back)
    emit(`G0 X${f(at(0)[0])} Y${f(at(0)[1])}`)
    emit(`G0 Z${fz(clearZ)}`)
    for (let k = 1; k <= legs; k++) {
      const z = clearZ + (d - clearZ) * (k / legs)
      const to = at(k)
      emit(`G1 X${f(to[0])} Y${f(to[1])} Z${fz(z)} F${plungeF}`)
    }
  }
  const straightRampIn = (d: number) => {
    if (inside) return zigRampIn(d)
    const tv = rampRun(d)
    const ap: V = [S[0] - firstDir[0] * tv + nrmS[0] * offIn, S[1] - firstDir[1] * tv + nrmS[1] * offIn]
    emit(`G0 X${f(ap[0])} Y${f(ap[1])}`)
    emit(`G0 Z${fz(clearZ)}`)
    emit(`G1 X${f(S[0])} Y${f(S[1])} Z${fz(d)} F${plungeF}`)
  }
  const straightRampOut = (d: number) => {
    if (inside) {
      // Past S along the cut (already cut), then straight up out of the hole.
      const o = Math.min(toolDia, Math.max(0, len(S, B) - toolRadius))
      emit(`G1 X${f(S[0] + firstDir[0] * o)} Y${f(S[1] + firstDir[1] * o)} Z${fz(d)} F${cutF}`)
      emit(`G0 Z${fz(clearZ)}`)
      return
    }
    const tv = rampRun(d)
    const over: V = [S[0] + firstDir[0] * toolDia, S[1] + firstDir[1] * toolDia]
    const ex2: V = [over[0] + firstDir[0] * tv + nrmS[0] * offIn, over[1] + firstDir[1] * tv + nrmS[1] * offIn]
    emit(`G1 X${f(over[0])} Y${f(over[1])} Z${fz(d)} F${cutF}`)
    emit(`G1 X${f(ex2[0])} Y${f(ex2[1])} Z${fz(clearZ)} F${cutF}`)
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
        emit(`G1 Z${fz(d)} F${plungeF}`)
        break
      default: // straight_plunge
        emit(`G1 Z${fz(d)} F${plungeF}`)
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

  // Control compensation: enable G41/G42 with the tool's offset register before cutting,
  // cancel with G40 after. The machine applies the radius (verify the D register + side).
  if (control) emit(`${compCode} D${toolNumber}  (cutter comp on — machine applies radius)`)
  const useRamp = p.entry_strategy === 'ramp'
  // Each pass is self-contained and starts/ends at the longest-edge midpoint S.
  for (let i = 1; i <= passes; i++) {
    const d = -(startDepth + (cutDepth - startDepth) * (i / passes))
    const last = i === passes
    if (useRamp) {
      straightRampIn(d)   // straight ramp from the offset approach point onto S
      cutLoop(d)
    } else if (startDepth > 0) {
      // Separation pass: the perimeter kerf already exists down to startDepth, so just
      // rapid into the slot and plunge through the remaining skin — no ramp/lead-in.
      emit(`G0 X${f(S[0])} Y${f(S[1])}`)
      emit(`G0 Z${fz(Math.min(clearZ, -startDepth + 2))}`)   // drop into the existing kerf
      emit(`G1 Z${fz(d)} F${plungeF}`)
      cutLoop(d)
    } else {
      const E = E0()
      emit(`G0 X${f(E[0])} Y${f(E[1])}`)
      emit(`G0 Z${fz(clearZ)}`)
      entryDescend(E, d)
      leadIn(E, d)
      cutLoop(d)
    }
    if (last && useTabs) emit(`(tabs: ${p.tabs_per_side_min}/side @ ${p.tab_height}mm)`)
    if (useRamp) {
      if (last) straightRampOut(d); else emit(`G0 Z${fz(clearZ)}`)
    } else {
      if (last) leadOut(d)
      emit(`G0 Z${fz(clearZ)}`)
    }
  }
  if (control) emit('G40  (cutter comp off)')
  emit(`G0 Z${fz(safeZ)}`)
  void thickness
}

// Map a DB cnc_machine_profiles row (+ tool defaults) into a PostProfile.
export function postFromProfile(row: Record<string, unknown> | null, tool?: { base_feed_rate?: number | null; base_spindle_speed?: number | null; plunge_feed_rate?: number | null }): PostProfile {
  const n = (v: unknown, d: number) => (typeof v === 'number' ? v : d)
  const b = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
  const s = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d)
  const D = DEFAULT_POST
  if (!row) return { ...D, base_feed_rate: tool?.base_feed_rate ?? D.base_feed_rate, base_spindle_speed: tool?.base_spindle_speed ?? D.base_spindle_speed, plunge_feed_rate: tool?.plunge_feed_rate ?? D.plunge_feed_rate }
  return {
    material_surface_z: s(row.material_surface_z, D.material_surface_z),
    z_axis_up: b(row.z_axis_up, D.z_axis_up),
    origin_corner: s(row.origin_corner, D.origin_corner),
    x_axis_direction: s(row.x_axis_direction, D.x_axis_direction),
    y_axis_direction: s(row.y_axis_direction, D.y_axis_direction),
    safe_z_clearance: n(row.safe_z_clearance, D.safe_z_clearance),
    clearance_z: n(row.clearance_z, D.clearance_z),
    onion_skin_z: n(row.onion_skin_z, D.onion_skin_z),
    through_cut_z: n(row.through_cut_z, D.through_cut_z),
    drill_rapid_z: n(row.drill_rapid_z, D.drill_rapid_z),
    rough_pass_z_step: n(row.rough_pass_z_step, D.rough_pass_z_step),
    pass_strategy: s(row.pass_strategy, D.pass_strategy),
    milling_direction: s(row.milling_direction, D.milling_direction),
    cutter_compensation: s(row.cutter_compensation, D.cutter_compensation),
    entry_strategy: s(row.entry_strategy, D.entry_strategy),
    perimeter_approach_type: s(row.perimeter_approach_type, D.perimeter_approach_type),
    pocket_entry_strategy: s(row.pocket_entry_strategy, D.pocket_entry_strategy),
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
    plunge_feed_rate: tool?.plunge_feed_rate ?? D.plunge_feed_rate,
    drill_block_work_offset: s(row.drill_block_work_offset, D.drill_block_work_offset),
    router_work_offset: s(row.router_work_offset, D.router_work_offset),
    drill_cycle_code: s(row.drill_cycle_code, D.drill_cycle_code),
    drill_return_code: s(row.drill_return_code, D.drill_return_code),
    sign_y: n(row.sign_y, D.sign_y),
    mirror_y: b(row.mirror_y, D.mirror_y),
    drill_bank_prep_codes: s(row.drill_bank_prep_codes, D.drill_bank_prep_codes),
    drill_band_height_mm: n(row.drill_band_height_mm, D.drill_band_height_mm),
    keep_decimal_point: b(row.keep_decimal_point, D.keep_decimal_point),
    modal_output: b(row.modal_output, D.modal_output),
    emit_tool_length_offset: b(row.emit_tool_length_offset, D.emit_tool_length_offset),
    emit_router_work_offset: b(row.emit_router_work_offset, D.emit_router_work_offset),
    tool_h_offset_delta: n(row.tool_h_offset_delta, D.tool_h_offset_delta),
    max_comment_length: n(row.max_comment_length, D.max_comment_length),
    drill_feed_rate: n(row.drill_feed_rate, D.drill_feed_rate),
    drill_retract_mode: s(row.drill_retract_mode, D.drill_retract_mode),
    drill_clearance_z: n(row.drill_clearance_z, D.drill_clearance_z),
    drill_through_overshoot: n(row.drill_through_overshoot, D.drill_through_overshoot),

    file_extension: s(row.file_extension, D.file_extension),
    header_template: (row.header_template as string) ?? null,
    footer_template: (row.footer_template as string) ?? null,
  }
}

// File name (spec §5.8.3).
export function gcodeFileName(opts: { batch: boolean; jobNumber: string | null; dateStr: string; materialCode: string; sheetNumber: number; ext?: string }): string {
  // The extension is a controller/file-browser convention, not a format, so it
  // comes from the machine profile (file_extension). The machine's known-good
  // files are .anc. Leading dots and anything unsafe for a filename are stripped.
  const ext = (opts.ext ?? DEFAULT_POST.file_extension).replace(/[^A-Za-z0-9]+/g, '') || 'nc'
  const mat = (opts.materialCode || 'MAT').replace(/[^A-Za-z0-9]+/g, '').slice(0, 12) || 'MAT'
  const n = String(opts.sheetNumber).padStart(2, '0')
  return opts.batch
    ? `BATCH_${opts.dateStr}_${mat}_${n}.${ext}`
    : `${(opts.jobNumber || 'JOB').replace(/[^A-Za-z0-9]+/g, '')}_${mat}_${n}.${ext}`
}
