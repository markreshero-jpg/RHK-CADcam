// Golden-sample validation for Anderson gang drilling (spec §9.4).
// Run:  npx tsx z_drill_block/validate_gang.ts
//
// Reproduces the two provided .anc samples at the gang-detection + emission
// level and asserts the bank selection, bitmask, master/slave spindles and the
// G54 / G98 G81 / G80 cycle structure match.

import { computeGangs, type DrillBlockConfig } from '../src/lib/optimiser/gangDrill'
import { generateSheetGcode, DEFAULT_POST, type PostProfile } from '../src/lib/optimiser/gcode'
import type { NestedSheet } from '../src/lib/optimiser/nest'

let failures = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`  ✓ ${name}`)
  else { console.log(`  ✗ ${name}  ${detail}`); failures++ }
}

// Spindle diameters fitted on each bank (index = position − 1). 5mm on
// X spindles 5-9 and Y spindles 3-7, exactly the sample machine's layout.
const xDiameters: (number | null)[] = Array(12).fill(null)
;[5, 6, 7, 8, 9].forEach(pos => { xDiameters[pos - 1] = 5 })
const yDiameters: (number | null)[] = Array(8).fill(null)
;[3, 4, 5, 6, 7].forEach(pos => { yDiameters[pos - 1] = 5 })

const block: DrillBlockConfig = {
  bankXCount: 12, bankYCount: 8, spacingMm: 32, xBankMcode: 'M88', yBankMcode: 'M89',
  sharedCorner: true, headOffsetXMm: 0, headOffsetYMm: -128, workOffsetCode: 'G54',
  xDiameters, yDiameters,
}

// ── Sample 1: drillgangexample.anc — M88 bank, master 5 slaves 6-9, B496 ──────
console.log('Sample 1 — M88 X-bank gang (expect B496, master 5, slaves 6,7,8,9)')
{
  // Two rows of 5 holes at 32mm centres along X (two parallel masters).
  const holes = [
    ...[0, 32, 64, 96, 128].map(x => ({ x, y: 100, diameter: 5, depth: 32 })),
    ...[0, 32, 64, 96, 128].map(x => ({ x, y: 300, diameter: 5, depth: 32 })),
  ]
  const { groups } = computeGangs(holes, block)
  check('one gang group', groups.length === 1, `got ${groups.length}`)
  const g = groups[0]
  if (g) {
    check('bank = x (M88)', g.bank === 'x')
    check('bitmask = 496', g.bitmask === 496, `got ${g.bitmask}`)
    check('master spindle = 5', g.masterSpindle === 5, `got ${g.masterSpindle}`)
    check('slaves = 6,7,8,9', g.slaveSpindles.join(',') === '6,7,8,9', g.slaveSpindles.join(','))
    check('two master positions (step-and-repeat rows)', g.masters.length === 2, `got ${g.masters.length}`)
  }
}

// ── Sample 2: R100101N.anc — M89 bank, master 3 slaves 4-7, B124 ──────────────
console.log('Sample 2 — M89 Y-bank gang (expect B124, master 3, slaves 4,5,6,7)')
{
  // Two columns of 5 holes at 32mm centres along Y.
  const holes = [
    ...[0, 32, 64, 96, 128].map(y => ({ x: 50, y, diameter: 5, depth: 32 })),
    ...[0, 32, 64, 96, 128].map(y => ({ x: 200, y, diameter: 5, depth: 32 })),
  ]
  const { groups } = computeGangs(holes, block)
  check('one gang group', groups.length === 1, `got ${groups.length}`)
  const g = groups[0]
  if (g) {
    check('bank = y (M89)', g.bank === 'y')
    check('bitmask = 124', g.bitmask === 124, `got ${g.bitmask}`)
    check('master spindle = 3', g.masterSpindle === 3, `got ${g.masterSpindle}`)
    check('slaves = 4,5,6,7', g.slaveSpindles.join(',') === '4,5,6,7', g.slaveSpindles.join(','))
    check('two master positions', g.masters.length === 2, `got ${g.masters.length}`)
  }
}

// ── Step-and-repeat: a column of 20 Y-holes → B255, B255, B15 (spec §7.3) ─────
// (Needs all 8 Y spindles fitted with 5mm for a full B255 gang.)
console.log('Step-and-repeat — 20 Y holes with full 8-spindle Y bank (expect B255,B255,B15)')
{
  const yFull: (number | null)[] = Array(8).fill(5)
  const blk2: DrillBlockConfig = { ...block, yDiameters: yFull }
  const holes = Array.from({ length: 20 }, (_, i) => ({ x: 10, y: i * 32, diameter: 5, depth: 20 }))
  const { groups } = computeGangs(holes, blk2)
  const masks = groups.flatMap(g => Array(g.masters.length).fill(g.bitmask)).sort((a, b) => a - b)
  check('three plunges total', masks.length === 3, `got ${masks.length}: ${masks}`)
  check('two full B255 gangs', masks.filter(m => m === 255).length === 2, `masks=${masks}`)
  check('one remainder B15 gang (4 spindles)', masks.includes(15), `masks=${masks}`)
}

// ── Full emission structure through generateSheetGcode ────────────────────────
console.log('Emission — Anderson G-code structure')
{
  const sheet: NestedSheet = {
    index: 0, materialId: null, thickness: 16,
    stock: { w: 2400, h: 1200, trimTop: 0, trimBottom: 0, trimLeft: 0, trimRight: 0, isOffcut: false, label: null },
    placements: [], efficiency: 0,
  }
  const profile: PostProfile = { ...DEFAULT_POST, drill_rapid_z: 36.5 }
  const drills = [0, 32, 64, 96, 128].map(x => ({ x, y: 100, diameter: 5, depth: 32 }))
  const out = generateSheetGcode({ sheet, thickness: 16, profile, drills, toolNumber: 101, drillBlock: block })
  check('selects M88 B496', out.includes('M88 B496'), '')
  check('clears both banks (M88 B0 / M89 B0)', out.includes('M88 B0') && out.includes('M89 B0'))
  check('prep codes M23 / M21', out.includes('\nM23\n') && out.includes('\nM21\n'))
  check('G54 drill-block work offset + G43 H1', /G90 G0 G54 G43 H1 X.* Y-.* Z36.5/.test(out), '')
  check('G98 G81 cycle with R36.5', /G98 G81 Z[\d.]+ R36\.5\d* F/.test(out))
  check('G80 cancels cycle', out.includes('\nG80\n'))
  check('negative Y output (sign_y=-1)', /Y-\d/.test(out))
  check('comment block present', out.includes('(DRILL MASTER: 5, SLAVE: 6,7,8,9)'))
  check('routing uses G59 offset', out.includes('G59'))
  if (failures) { console.log('\n--- emission dump ---\n' + out) }
}

console.log(failures === 0 ? '\nALL CHECKS PASSED ✓' : `\n${failures} CHECK(S) FAILED ✗`)
process.exit(failures === 0 ? 0 : 1)
