// ============================================================
// Formula Resolver — Test Suite
// Run: npx ts-node src/test.ts
// ============================================================

import { resolveCabinet } from './resolver'
import { mergeRules } from './mergeRules'
import { CabinetInput, DEFAULT_RULES, Material } from './types'

// ── Test materials ─────────────────────────────────────────────
const whiteboard18: Material = {
  id: 'mat-001', name: 'Whiteboard 18mm', DZ: 18,
  sheet_dx: 2400, sheet_dy: 1200, has_grain: false
}
const lxMoleskin18: Material = {
  id: 'mat-002', name: 'Lx Moleskin 18mm', DZ: 18,
  sheet_dx: 2400, sheet_dy: 1200, has_grain: true, grain_direction: 'vertical'
}

// ── Helper to build a standard 2-door base cabinet ────────────
function make2DoorBase(overrides: Partial<CabinetInput> = {}): CabinetInput {
  return {
    id: 'test-cab-001',
    assembly_class: 'base',
    label: 'BC-01',
    DX: 600, DY: 900, DZ: 580,
    has_carcass: true, has_internal: true,
    has_face: true, has_toekick: true,
    left_neighbour:  'cabinet',
    right_neighbour: 'cabinet',
    exposed_interior: false,
    material:                  whiteboard18,
    door_material:             lxMoleskin18,
    shelf_material:            whiteboard18,
    toekick_face_material:     lxMoleskin18,
    toekick_interior_material: whiteboard18,
    slide_side_deduction: 13,
    rules: mergeRules(DEFAULT_RULES),
    face_grid: {
      rows: [{ row_index: 0, height_locked: false }],
      cols: [
        { col_index: 0, width_locked: false },
        { col_index: 1, width_locked: false },
      ],
      zones: [
        { row_index: 0, col_index: 0, face_type: 'door', hinge_side: 'left' },
        { row_index: 0, col_index: 1, face_type: 'door', hinge_side: 'right' },
      ]
    },
    adj_shelves: [
      { sort_order: 0, y_locked: false },
      { sort_order: 1, y_locked: false },
    ],
    fixed_shelves: [],
    inner_drawers: [],
    ...overrides,
  }
}

// ── Test runner ────────────────────────────────────────────────
let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✅ ${name}`)
    passed++
  } catch (e: any) {
    console.log(`  ❌ ${name}`)
    console.log(`     ${e.message}`)
    failed++
  }
}

function expect(val: any) {
  return {
    toBe: (expected: any) => {
      if (val !== expected) throw new Error(`Expected ${expected}, got ${val}`)
    },
    toBeCloseTo: (expected: number, decimals = 1) => {
      const factor = Math.pow(10, decimals)
      if (Math.round(val * factor) !== Math.round(expected * factor)) {
        throw new Error(`Expected ~${expected}, got ${val}`)
      }
    },
    toBeGreaterThan: (n: number) => {
      if (val <= n) throw new Error(`Expected > ${n}, got ${val}`)
    },
    toBeLessThan: (n: number) => {
      if (val >= n) throw new Error(`Expected < ${n}, got ${val}`)
    },
    toHaveLength: (n: number) => {
      if (val.length !== n) throw new Error(`Expected length ${n}, got ${val.length}`)
    },
  }
}

// ══════════════════════════════════════════════════════════════
console.log('\n📦 CASE MODULE')
// ══════════════════════════════════════════════════════════════

test('produces 5 case parts for front_rail top', () => {
  const result = resolveCabinet(make2DoorBase())
  // left_side, right_side, bottom, back, front_rail
  expect(result.case_parts).toHaveLength(5)
  expect(result.errors).toHaveLength(0)
})

test('left side dimensions correct', () => {
  const result = resolveCabinet(make2DoorBase())
  const ls = result.case_parts.find(p => p.part_key === 'left_side')!
  expect(ls.DX).toBe(580)          // Cabinet.DZ
  expect(ls.DY).toBe(900 - 150)    // Cabinet.DY - TOEH = 750
  expect(ls.DZ).toBe(18)           // @material.DZ
  expect(ls.X).toBe(0)
  expect(ls.Y).toBe(150)           // TOEH
  expect(ls.Z).toBe(0)
})

test('right side X position correct', () => {
  const result = resolveCabinet(make2DoorBase())
  const rs = result.case_parts.find(p => p.part_key === 'right_side')!
  expect(rs.X).toBe(600 - 18)      // Cabinet.DX - material.DZ = 582
})

test('bottom panel sits between sides', () => {
  const result = resolveCabinet(make2DoorBase())
  const bot = result.case_parts.find(p => p.part_key === 'bottom')!
  expect(bot.DY).toBe(600 - 2 * 18)  // 564mm
  expect(bot.X).toBe(18)
  expect(bot.Y).toBe(150)             // TOEH
})

test('back panel full height between sides', () => {
  const result = resolveCabinet(make2DoorBase())
  const back = result.case_parts.find(p => p.part_key === 'back')!
  expect(back.DX).toBe(580)           // Cabinet.DZ - SCRBK
  expect(back.DY).toBe(600 - 2 * 18) // 564mm
  expect(back.Z).toBe(0)             // SCRBK = 0
})

test('front rail depth = RD, flush with cabinet front', () => {
  const result = resolveCabinet(make2DoorBase())
  const rail = result.case_parts.find(p => p.part_key === 'front_rail')!
  expect(rail.DX).toBe(100)          // RD
  expect(rail.Z).toBe(580 - 100)     // Cabinet.DZ - RD = 480
  // Front edge: Z + DX = 480 + 100 = 580 = Cabinet.DZ ✓
  expect(rail.Z + rail.DX).toBe(580)
})

test('full_top inset from back correctly', () => {
  const result = resolveCabinet(make2DoorBase({
    top_type: 'full_top',
    rules: mergeRules(DEFAULT_RULES),
  }))
  const top = result.case_parts.find(p => p.part_key === 'full_top')!
  expect(top.Z).toBe(18 + 0)         // T + SCRBK = 18
  // Front edge: Z + DX = 18 + (580-18-0) = 580 ✓
  expect(top.Z + top.DX).toBe(580)
})

test('double_rail produces front and back rail', () => {
  const result = resolveCabinet(make2DoorBase({
    top_type: 'double_rail',
  }))
  const rails = result.case_parts.filter(p =>
    p.part_key === 'front_rail' || p.part_key === 'back_rail'
  )
  expect(rails).toHaveLength(2)
})

// ══════════════════════════════════════════════════════════════
console.log('\n🦵 TOE KICK MODULE')
// ══════════════════════════════════════════════════════════════

test('ladder frame produces front, sub, back + spreaders', () => {
  const result = resolveCabinet(make2DoorBase())
  const tk = result.toekick_parts
  const front = tk.filter(p => p.part_key === 'kick_front_face')
  const sub   = tk.filter(p => p.part_key === 'kick_sub_front')
  const back  = tk.filter(p => p.part_key === 'kick_back')
  const vSpr  = tk.filter(p => p.part_key === 'spreader_vertical')
  const hSpr  = tk.filter(p => p.part_key === 'spreader_horizontal')
  expect(front).toHaveLength(1)
  expect(sub).toHaveLength(1)
  expect(back).toHaveLength(1)
  // 600mm cabinet / 450mm spacing → 0 internal + 2 end = 2 vertical spreaders
  expect(vSpr).toHaveLength(2)
  expect(hSpr).toHaveLength(2)
})

test('kick front face Z position correct with TOESCF=40', () => {
  const result = resolveCabinet(make2DoorBase())
  const front = result.toekick_parts.find(p => p.part_key === 'kick_front_face')!
  // kickFrontZ = DZ - TOESCF - TF = 580 - 40 - 18 = 522
  expect(front.Z).toBe(522)
})

test('spreader Z span correct', () => {
  const result = resolveCabinet(make2DoorBase())
  const spr = result.toekick_parts.find(p => p.part_key === 'spreader_vertical')!
  // sprZ0 = kickBackZ + TI = 0 + 18 = 18
  // sprZ1 = kickSubZ = kickFrontZ - TI = 522 - 18 = 504
  // sprEZ = 504 - 18 = 486
  expect(spr.Z).toBe(18)
  expect(spr.DZ).toBe(486)
})

test('leg kick produces only front face', () => {
  const result = resolveCabinet(make2DoorBase({ toe_type: 'leg' }))
  expect(result.toekick_parts).toHaveLength(1)
  expect(result.toekick_parts[0].part_key).toBe('kick_front_face')
})

// ══════════════════════════════════════════════════════════════
console.log('\n📚 INTERNAL MODULE')
// ══════════════════════════════════════════════════════════════

test('two adj shelves equalised correctly', () => {
  const result = resolveCabinet(make2DoorBase())
  const shelves = result.internal_parts.filter(p => p.part_type === 'adj_shelf')
  expect(shelves).toHaveLength(2)

  // Internal height = 900 - 150 - 2*18 = 714mm
  // N=2 shelves: opening = 714/3 = 238mm
  // Shelf 0 Y = 150 + 18 + 238*1 - 1*18/2 = 168 + 238 - 9 = 397
  const intH = 900 - 150 - 2 * 18  // 714
  const openH = intH / 3
  const shY0 = 150 + 18 + openH * 1 - 1 * 18 / 2
  expect(shelves[0].Y).toBeCloseTo(shY0)
})

test('adj shelf DX = internal depth less setbacks', () => {
  const result = resolveCabinet(make2DoorBase())
  const shelf = result.internal_parts.find(p => p.part_type === 'adj_shelf')!
  // intD = 580 - 0 - 18 = 562mm
  // shDX = 562 - 10 - 0 = 552mm (less ADJSB_F=10, ADJSB_B=0)
  expect(shelf.DX).toBe(552)
})

test('adj shelf DY = internal width less clearances', () => {
  const result = resolveCabinet(make2DoorBase())
  const shelf = result.internal_parts.find(p => p.part_type === 'adj_shelf')!
  // intW = 600 - 2*18 - 0 - 0 = 564mm
  // shDY = 564 - 1 - 1 = 562mm
  expect(shelf.DY).toBe(562)
})

test('fixed shelf at mid height', () => {
  const result = resolveCabinet(make2DoorBase({
    adj_shelves: [],
    fixed_shelves: [{ sort_order: 0, y_locked: false }],
  }))
  const fs = result.internal_parts.find(p => p.part_type === 'fixed_shelf')!
  // intH = 714mm, mid = 150 + 18 + 714/2 - 18/2 = 168 + 357 - 9 = 516
  const intH = 900 - 150 - 2 * 18
  const fsY = 150 + 18 + intH / 2 - 18 / 2
  expect(fs.Y).toBeCloseTo(fsY)
})

test('fixed shelf full internal width (no pin clearance)', () => {
  const result = resolveCabinet(make2DoorBase({
    adj_shelves: [],
    fixed_shelves: [{ sort_order: 0, y_locked: false }],
  }))
  const fs = result.internal_parts.find(p => p.part_type === 'fixed_shelf')!
  // intW = 564mm (no ADJSL/ADJSR deduction for fixed shelf)
  expect(fs.DY).toBe(564)
})

// ══════════════════════════════════════════════════════════════
console.log('\n🚪 FACE MODULE')
// ══════════════════════════════════════════════════════════════

test('2 door face generates 2 zones', () => {
  const result = resolveCabinet(make2DoorBase())
  expect(result.face_zones).toHaveLength(2)
  expect(result.errors).toHaveLength(0)
})

test('door width = half face opening less half centre gap', () => {
  const result = resolveCabinet(make2DoorBase())
  const leftDoor = result.face_zones.find(z => z.col_index === 0)!
  // faceW = 600 - 1 - 1 = 598mm (REVL=1, REVR=1)
  // col gap = GAPC/2 = 1mm (gap between cols)
  // equalColW = (598 - 1) / 2 = 298.5mm
  expect(leftDoor.DY).toBeCloseTo(298.5)
})

test('door height = face opening height', () => {
  const result = resolveCabinet(make2DoorBase())
  const door = result.face_zones[0]
  // faceH = 900 - 150 - 4 - 0 = 746mm
  expect(door.DX).toBeCloseTo(746)
})

test('door Z sits proud of carcass front by FACBUF', () => {
  const result = resolveCabinet(make2DoorBase())
  const door = result.face_zones[0]
  // Overlay mode: faceZ = CAB_DZ + FACBUF = 580 + 2 = 582
  expect(door.Z).toBe(582)
})

test('reveal changes when neighbour is wall', () => {
  const standard = resolveCabinet(make2DoorBase())
  const wallNeighbour = resolveCabinet(make2DoorBase({
    left_neighbour: 'wall',
  }))
  // Standard: REVL=1, wall: REVENDL=2 → left door starts 1mm further right
  const stdX  = standard.face_zones.find(z => z.col_index === 0)!.X
  const wallX = wallNeighbour.face_zones.find(z => z.col_index === 0)!.X
  expect(wallX - stdX).toBe(1)   // 2mm - 1mm = 1mm shift right
})

test('no errors on valid cabinet', () => {
  const result = resolveCabinet(make2DoorBase())
  expect(result.errors).toHaveLength(0)
})

// ══════════════════════════════════════════════════════════════
console.log('\n⚠️  VALIDATION')
// ══════════════════════════════════════════════════════════════

test('error when cabinet too narrow for material', () => {
  const result = resolveCabinet(make2DoorBase({ DX: 30 }))
  const err = result.errors.find(e => e.code === 'CASE_TOO_NARROW')
  expect(!!err).toBe(true)
})

test('warning when cabinet wider than 1200mm', () => {
  const result = resolveCabinet(make2DoorBase({ DX: 1300 }))
  const warn = result.warnings.find(w => w.code === 'WIDE_CABINET')
  expect(!!warn).toBe(true)
})

// ══════════════════════════════════════════════════════════════
// Results
// ══════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(40)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed === 0) {
  console.log('✅ All tests passed\n')
} else {
  console.log('❌ Some tests failed\n')
  process.exit(1)
}
