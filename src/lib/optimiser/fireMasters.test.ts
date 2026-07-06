// ============================================================
// fireMasters — unit tests (spec §9 M2).
// Run: npx tsx src/lib/optimiser/fireMasters.test.ts  (tsx resolves the @/ path alias)
//
// Pure — no DB. Builds a minimal resolved cabinet (two side panels + a front
// rail whose ends butt the sides' inner faces) and checks the firing core:
//   • a master op on each rail end fires ONE slave onto the touching side panel
//   • a hand-added local op on a target defers that side's slave (§2.1)
//   • a master op that touches nothing fires no slave (§4)
// ============================================================

import { fireMasters, type FireOpRow } from './fireMasters'
import type { ResolvedCabinet, ResolvedCasePart } from '@/src/lib/resolver/types'

let passed = 0, failed = 0
function ok(cond: boolean, label: string, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else      { failed++; console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`) }
}
function group(name: string) { console.log(`\n${name}`) }

// ── Fixture ────────────────────────────────────────────────────────────────
// Cabinet 618 wide (two 18mm sides), 700 tall, 500 deep. Interior x ∈ [18, 600].
// A front rail spans that interior exactly, so its ends coincide with each side's
// inner face (butt joint) — the coincidence the firing engine keys on.
const casePart = (part_key: string, X: number, Y: number, Z: number, DX: number, DY: number, DZ = 18): ResolvedCasePart =>
  ({ part_key, X, Y, Z, DX, DY, DZ, AX: 0, AY: 0, AZ: 0 } as unknown as ResolvedCasePart)

const rp = {
  cabinet_id: 'test',
  case_parts: [
    casePart('left_side',  0,   0, 0, 500, 700),   // inner face at x=18
    casePart('right_side', 600, 0, 0, 500, 700),   // inner face at x=600
    casePart('front_rail', 18, 682, 420, 80, 582), // spans x ∈ [18, 600]
  ],
  face_zones: [],
  internal_parts: [],
} as unknown as ResolvedCabinet

// A master drill on the rail. pos_y selects the along-width position in the rail
// frame (v = cabinet X, origin 18): 0 → left end (x=18), 582 → right end (x=600).
const master = (id: string, pos_y: number): FireOpRow => ({
  id, source_part_key: 'case_front_rail', operation_type: 'drill', operation_action: null,
  operation_role: 'master', pos_x: 40, pos_y, pos_z: 0, diameter: 8, depth: 12,
  width: null, length: null, size_dx: null, size_dy: null, size_dz: null,
  repeat_count: 1, repeat_spacing: null, repeat_axis: null,
  router_tool_id: null, drill_id: null, auto_tool: true, tool_set_id: null,
  output_to_cnc: true, parameters: null,
})

// ── Tests ──────────────────────────────────────────────────────────────────
group('Rail + two end panels → two masters → two slaves')
{
  const r = fireMasters(rp, [master('m-left', 0), master('m-right', 582)], 'test')
  ok(r.slaves.length === 2, 'fires two slaves', `got ${r.slaves.length}`)
  ok(r.skipped === 0 && r.noTouch === 0, 'no skips, no no-touch', `skipped=${r.skipped} noTouch=${r.noTouch}`)

  const left  = r.slaves.find(s => s.source_part_key === 'case_left_side')
  const right = r.slaves.find(s => s.source_part_key === 'case_right_side')
  ok(!!left && !!right, 'one slave on each side panel')
  ok(!!left && left.master_operation_id === 'm-left', 'left slave back-refs its master')
  ok(!!left && left.output_face === 'right', 'left panel drilled on its inner (right) face', `got ${left?.output_face}`)
  ok(!!right && right.output_face === 'left', 'right panel drilled on its inner (left) face', `got ${right?.output_face}`)
  ok(!!left && left.is_master === false && left.parameters.generated === 'master_slave', 'slave tagged + not a master')
  // Left panel drilled on its +x (inner) face → projectToFrame mirrors the depth
  // axis (machined-face-up): rail depth 460-from-back → 500−460 = 40; height 691.
  ok(!!left && Math.abs(left.pos_x - 40) < 1e-6 && Math.abs(left.pos_y - 691) < 1e-6, 'left slave projected to (40, 691)', `got (${left?.pos_x}, ${left?.pos_y})`)
  // Right panel drilled on its −x face → no mirror: depth 460, height 691.
  ok(!!right && Math.abs(right.pos_x - 460) < 1e-6 && Math.abs(right.pos_y - 691) < 1e-6, 'right slave projected to (460, 691)', `got (${right?.pos_x}, ${right?.pos_y})`)
}

group('Local op on a target defers that slave (§2.1)')
{
  const localOnLeft: FireOpRow = { ...master('local', 0), operation_role: 'local', source_part_key: 'case_left_side', pos_x: 40, pos_y: 691 }
  const r = fireMasters(rp, [master('m-left', 0), master('m-right', 582), localOnLeft], 'test')
  ok(r.slaves.length === 1, 'only the right slave fires', `got ${r.slaves.length}`)
  ok(r.slaves[0]?.source_part_key === 'case_right_side', 'the surviving slave is on the right panel')
  ok(r.skipped === 1, 'the colliding left slave is counted as skipped', `skipped=${r.skipped}`)
}

group('Master touching nothing fires no slave (§4)')
{
  // pos_y=300 → x=318, mid-cabinet: on neither side face.
  const r = fireMasters(rp, [master('m-mid', 300)], 'test')
  ok(r.slaves.length === 0, 'no slave fired', `got ${r.slaves.length}`)
  ok(r.noTouch === 1, 'counted as no-touch', `noTouch=${r.noTouch}`)
}

console.log(`\n${failed === 0 ? '✓ ALL PASS' : '✗ FAIL'} — ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
