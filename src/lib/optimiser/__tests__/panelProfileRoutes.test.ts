import { describe, it, expect, vi } from 'vitest'
vi.mock('@/src/lib/supabase', () => ({ supabase: {} }))
import { collectPanelProfileRoutes } from '../seamDrillSync'
import { panelProfileTargets, seenFacePoint } from '../../panelProfile'
import type { ResolvedCabinet, ResolvedCasePart, ResolvedCustomPart, PanelProfileSpec, RawProfileOp } from '../../resolver/types'

// Panel door profiles (DOOR_SYSTEM_SPEC §Panel profiles): RHK6592's Shaker — 2pac
// pocket (60 in, 5 deep, tool set) on island back panel pieces + an applied end panel.
const shaker = (face: PanelProfileSpec['face']): PanelProfileSpec => ({
  face, profile_type: 'perimeter_route',
  ops: [{ operation_type: 'pocket', depth_mm: 5, width_mm: 12, offset_from_edge_mm: 60, repeat_axis: 'none', spacing_mm: null,
    tool_diameter_mm: null, face: 'front', expressions: null, sort_order: 1, router_tool_id: null, tool_set_id: 'shaker-set' } as unknown as RawProfileOp],
})
// IBPF 2431 wide in 3 pieces (resolveBackPanel): AY 180 about each piece's right end, outer face +Z at Z = t.
const ibp = (n: number, x0: number, x1: number): ResolvedCasePart => ({
  part_key: `ibp:${n}`, DX: 880, DY: x1 - x0, DZ: 18, X: x1, Y: 0, Z: 18, AX: 0, AY: 180, AZ: 0, material_id: 'm',
  edge_band: { top: true, bottom: false, left: true, right: true, id: null },
} as unknown as ResolvedCasePart)
const applied = { id: 'p1', name: 'Applied Panel', material_id: 'm', dx: 580, dy: 840, dz: 18, x: 0, y: 0, z: 0,
  edge_top: true, edge_bottom: true, edge_left: true, edge_right: true, visible: true, show_in_room: true,
  orientation: 'side', library_key: 'applied_panel' } as unknown as ResolvedCustomPart
const cab = (spec: PanelProfileSpec | undefined, parts: Partial<ResolvedCabinet>): ResolvedCabinet => ({
  case_parts: [], internal_parts: [], drawer_stacks: [], hinge_instances: [], internal_slides: [], face_zones: [], seam_joints: [],
  ...(spec ? { panel_profile: spec } : {}), ...parts,
} as unknown as ResolvedCabinet)

describe('panel profile routes', () => {
  it('no PANEL_PROFILE → no routes (other jobs unchanged)', () => {
    expect(collectPanelProfileRoutes(cab(undefined, { case_parts: [ibp(1, 0, 810)] }), 'c').rows).toEqual([])
  })

  it('island back panel: one Shaker pocket per piece, 60 in all round, on the seen (down) face', () => {
    const rp = cab(shaker('front'), { case_parts: [ibp(1, 0, 810.3), ibp(2, 810.3, 1620.7), ibp(3, 1620.7, 2431)] })
    const rows = collectPanelProfileRoutes(rp, 'c').rows
    expect(rows).toHaveLength(3)
    expect(rows.map(r => r.source_part_key)).toEqual(['case_ibp:1', 'case_ibp:2', 'case_ibp:3'])
    // Face-kind nest frame: pos_x along the height (DX 880), pos_y along the width.
    expect(rows[0]).toMatchObject({ source_table: 'case_parts', operation_type: 'route', operation_action: 'pocket',
      pos_x: 440, pos_y: 405.15, size_dx: 760, size_dy: 690.3, depth: 5, tool_set_id: 'shaker-set',
      output_face: 'front', plane_kind: 'face_front' })
  })

  it('applied end panel: Shaker pocket 60 in on its seen face', () => {
    const rows = collectPanelProfileRoutes(cab(shaker('right'), { custom_parts: [applied] }), 'c').rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ source_table: 'custom_parts', source_part_key: 'custom_p1',
      pos_x: 290, pos_y: 420, size_dx: 460, size_dy: 720, output_face: 'front' })
  })

  it('seen face sits where the panel is: ibp outer face +Z, end panel +X / −X', () => {
    const [t] = panelProfileTargets(cab(shaker('front'), { case_parts: [ibp(1, 0, 810)] }))
    expect(seenFacePoint(t, 60, 60)).toEqual({ x: 60, y: 60, z: 18 })
    const [r] = panelProfileTargets(cab(shaker('right'), { custom_parts: [applied] }))
    expect(seenFacePoint(r, 0, 0)).toEqual({ x: 18, y: 0, z: 580 })   // viewer's left = the panel's front edge
    const [l] = panelProfileTargets(cab(shaker('left'), { custom_parts: [applied] }))
    expect(seenFacePoint(l, 0, 0)).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('a face that does not match the piece is skipped (end panel set to front, fillers never)', () => {
    expect(panelProfileTargets(cab(shaker('front'), { custom_parts: [applied] }))).toEqual([])
    const filler = { ...applied, id: 'f', dx: 70, library_key: 'filler_strip' } as unknown as ResolvedCustomPart
    expect(panelProfileTargets(cab(shaker('right'), { custom_parts: [filler] }))).toEqual([])
  })
})
