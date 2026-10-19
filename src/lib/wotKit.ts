// WOT / WOT-COMBI library data (z_wot K4) — kept in code so the tests check the
// exact layout the library holds; scripts/seedWotKit.mjs writes it to the
// cabinet_definitions rows.
//
// The oven core is the definition itself (no carcass): two 80 cleats 600 high
// stood on the D2-LL top, front face 20 behind the end-panel fronts, two 5 mm
// through holes each 50 from the ends, front edge banded ("edge in black"). The
// end panels' front plane, in the core's frame, is cab.d + t.door + 2 (TEPK
// depth = cab.d + t.door + 2, both from the tall cascade).

import type { CabinetKit, KitMember } from './cabinetKit'

export const PARTS_LIBRARY = {
  nailer:       'ce464194-e6d0-43bd-936d-51db9bfb56e5',  // Nailer / Cleat (interior)
  appliedPanel: '0b364a0a-9018-4852-8ef5-172ab05dac32',  // Applied Panel (exposed)
  bottom:       'fc6b4720-babe-412d-98c8-8889a4b6cddd',  // Bottom Panel (interior)
} as const

const FRONT = 'cab.d + t.door + 2'         // end-panel front plane, from the wall
const CLEAT_W = 80, CLEAT_SET_BACK = 20, HOLE_IN = 50
export const OVEN_H = 600                  // oven cleats / opening
export const COMBI_H = 450                 // combi cleats / opening
export const MICRO_OPENING = 380           // open microwave box, clear height
export const MICRO_SHELF_D = 450
export const DRAWERS_H = 650               // D2-LL, kick included — oven sits on it

const flags = (front: boolean) => ({ edge_top: front, edge_bottom: false, edge_left: false, edge_right: false })
const common = { visible: true, show_in_room: true, hide_views: [], no_cnc: false, material_override_id: null }

function cleat(name: string, right: boolean, y: number | string, h: number, sort: number) {
  return {
    ...common, ...flags(true), part_library_id: PARTS_LIBRARY.nailer, name, orientation: 'side', sort_order: sort,
    x: 0, y: typeof y === 'number' ? y : 0, z: 0, dx: CLEAT_W, dy: h, dz: 18,
    expressions: {
      ...(right ? { x: 'cab.w - t.gable' } : {}),
      ...(typeof y === 'string' ? { y } : {}),
      z: `${FRONT} - ${CLEAT_SET_BACK + CLEAT_W}`, dz: 't.gable',
    },
  }
}

// Two through holes per cleat, part-local (side part: u = depth across the 80,
// v = up the length), on the custom part at `index` in the snapshot.
function cleatHoles(index: number, h: number) {
  return [HOLE_IN, h - HOLE_IN].map((v, i) => ({
    source_table: 'cabinet_custom_parts', source_part_key: `custom_@${index}`,
    operation_type: 'drill', operation_role: 'local', plane_kind: 'face_front',
    output_to_cnc: true, auto_tool: true, repeat_count: 1, repeat_spacing: 32,
    diameter: 5, depth: 18,   // ≥ board thickness → drilled through (+ overshoot)
    pos_x: CLEAT_W / 2, pos_y: v, sort_order: i,
  }))
}

const EDGE_NOTE = 'Edge in black'

// ── WOT: oven + open microwave box ───────────────────────────────────────────
const wotParts = [
  cleat('Oven Cleat L', false, 0, OVEN_H, 0),
  cleat('Oven Cleat R', true, 0, OVEN_H, 1),
  {
    ...common, ...flags(true), part_library_id: PARTS_LIBRARY.appliedPanel, name: 'Microwave Shelf', orientation: 'flat', sort_order: 2,
    x: 0, y: OVEN_H, z: 0, dx: MICRO_SHELF_D, dy: 600, dz: 18,
    expressions: { dy: 'cab.w', z: `${FRONT} - ${MICRO_SHELF_D}`, dz: 't.exposed' },
  },
  {
    ...common, ...flags(false), part_library_id: PARTS_LIBRARY.appliedPanel, name: 'Back Panel', orientation: 'front', sort_order: 3,
    x: 0, y: OVEN_H, z: 0, dx: 600, dy: 400, dz: 18,
    expressions: { dx: 'cab.w', dy: `cab.h - ${OVEN_H}`, z: `${FRONT} - ${MICRO_SHELF_D} - t.exposed`, dz: 't.exposed' },
  },
]

// ── WOT-COMBI: oven + integrated microwave / combi / steam oven ──────────────
const combiParts = [
  cleat('Oven Cleat L', false, 0, OVEN_H, 0),
  cleat('Oven Cleat R', true, 0, OVEN_H, 1),
  {
    ...common, ...flags(true), part_library_id: PARTS_LIBRARY.bottom, name: 'Combi Shelf', orientation: 'flat', sort_order: 2,
    x: 0, y: OVEN_H, z: 0, dx: 560, dy: 600, dz: 18,
    expressions: { dy: 'cab.w', dx: `${FRONT} - ${CLEAT_SET_BACK}`, dz: 't.gable' },
  },
  cleat('Combi Cleat L', false, `${OVEN_H} + t.gable`, COMBI_H, 3),
  cleat('Combi Cleat R', true, `${OVEN_H} + t.gable`, COMBI_H, 4),
]

// W2D under panel in the W2D's own frame (its door front = the panels' front).
// WOT: runs back past the W2D to meet the back panel behind the microwave shelf.
const underPanel = (meetBackPanel: boolean) => ({
  ...common, ...flags(false), part_library_id: PARTS_LIBRARY.appliedPanel, name: 'Under Panel', orientation: 'flat', sort_order: 0,
  x: 0, y: 0, z: 0, dx: 400, dy: 600, dz: 18,
  expressions: meetBackPanel
    ? { dy: 'cab.w', dx: `${MICRO_SHELF_D} - t.door - 2`, z: `cab.d + t.door + 2 - ${MICRO_SHELF_D}`, dz: 't.exposed' }
    : { dy: 'cab.w', dx: 'cab.d', dz: 't.exposed' },
})

const panel = (key: string, x: string): KitMember => ({
  key, def: 'TEPK', x, dx: 't.exposed', dy: 'tall.h', dz: 'tall.d',
})

function kit(coreH: string, meetBackPanel: boolean): CabinetKit {
  return {
    members: [
      panel('lp', '0'),
      { key: 'dr', def: 'D2-LL', x: 'k.lp.w', dx: 600, dy: DRAWERS_H, dz: 'tall.d', top_type: 'full_top', neighbours: ['cabinet', 'cabinet'] },
      { key: 'core', def: 'self', x: 'k.lp.w', y: 'k.dr.h', dx: 600, dy: coreH, dz: 'tall.d', neighbours: ['cabinet', 'cabinet'] },
      {
        key: 'up', def: 'W2D', x: 'k.lp.w', dx: 600, dz: 400, dy: 'wallcab.top - k.core.top', gap: 'tall.d - 400',
        rules: { SCRBT: 't.exposed' }, parts: [underPanel(meetBackPanel)], neighbours: ['cabinet', 'cabinet'],
      },
      panel('rp', 'k.lp.w + 600'),
    ],
  }
}

const notes = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`custom_@${i}`, EDGE_NOTE]))

export const WOT_LIBRARY = {
  WOT: {
    kit: kit(`${OVEN_H} + t.exposed + ${MICRO_OPENING}`, true),
    custom_parts: wotParts,
    part_operations: [...cleatHoles(0, OVEN_H), ...cleatHoles(1, OVEN_H)],
    part_comments: notes(2),
    description: 'Wall oven tower: TEPK either side, D2-LL below, oven on 80 cleats, open microwave box (380) on an exposed shelf with a back panel, W2D over it with an under panel.',
  },
  'WOT-COMBI': {
    kit: kit(`${OVEN_H} + t.gable + ${COMBI_H}`, false),
    custom_parts: combiParts,
    part_operations: [0, 1].flatMap(i => cleatHoles(i, OVEN_H)).concat([3, 4].flatMap(i => cleatHoles(i, COMBI_H))),
    part_comments: notes(5),
    description: 'Wall oven tower with an integrated microwave / combi: TEPK either side, D2-LL below, oven and combi each on their own 80 cleats with a shelf between, W2D over it with an under panel.',
  },
} as const

/** Fixtures that come with each (point anchors in the core frame; z above the core bottom). */
export const WOT_CONTENTS = {
  WOT: [{ name: 'Generic oven 600', link_x: 300, z: 0 }],
  'WOT-COMBI': [{ name: 'Generic oven 600', link_x: 300, z: 0 }, { name: 'Generic microwave 600 x 450', link_x: 300, z: OVEN_H + 16.5 }],   // on a 16.5 combi shelf
} as const
