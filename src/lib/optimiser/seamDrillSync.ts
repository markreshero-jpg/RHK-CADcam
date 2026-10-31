// ============================================================
// Resolver → drills bridge.
// Materialises every machine-drilled hole the resolver computes —
// carcase seam joints, hinge cup/plate holes, and slide-imposed
// holes — into part_operations rows, so the optimiser's existing
// pipeline (buildSheetDrills → generateSheetGcode) drills them with
// no further changes. One generated row per hole.
//
// Generated rows are tagged parameters.generated = 'seam_joint'
// (kept for backward-compatible cleanup) plus a `kind` for clarity,
// and are deleted/re-inserted on every sync, so hand-added rows from
// CabinetRoutesPanel are never touched.
// ============================================================

import { supabase } from '@/src/lib/supabase'
import { resolveCabinetFromDB } from '@/src/lib/resolver/resolveCabinetFromDB'
import { cabinetSeamDrills, caseBox } from '@/src/lib/jointDrilling'
import { caseFrame, zoneFrame, boxFrame, intFrame, projectToFrame, type FootprintFrame } from './partFootprint'
import { coalesceByKey } from './coalesce'
import type { ResolvedCabinet, ResolvedCasePart } from '@/src/lib/resolver/types'
import { dbPartId, zoneKey, zonePartId, stackKey, isShapedPanelKey } from '@/src/lib/cabinetShape/partKeys'
import { turnDrill, turnPoint } from '@/src/lib/resolver/hardwareTurn'
import { filterRemovedParts } from '@/src/lib/resolver/filterHidden'
import { splitCaseParts, splitPieceFor, isSplitKey } from '@/src/lib/cabinetSplit'
import { railBlockEnds } from '@/src/lib/resolver/railBlocks'
import { MARKER_DIA, MARKER_DEPTH } from '@/src/lib/resolver/resolveDrawerMarkers'
import { backTopMarker } from '@/src/lib/slideDrilling'
import { doorProfileCuts } from '@/src/lib/doorProfile'

const GENERATED_MARK = 'seam_joint'

interface GeneratedDrill {
  source_table: string
  source_cabinet_id: string
  source_part_key: string
  operation_type: 'drill'
  operation_key: string
  pos_x: number
  pos_y: number
  diameter: number
  depth: number
  output_face: string
  plane_kind: string | null
  repeat_count: number
  output_to_cnc: boolean
  router_tool_id: string | null
  drill_id: string | null
  auto_tool: boolean
  parameters: Record<string, unknown>
}

// Hardware holes (hinge/slide) carry no tool assignment from the resolver, so
// they auto-select a bit by diameter at G-code time.
const AUTO_TOOL = { router_tool_id: null as string | null, drill_id: null as string | null, auto_tool: true }

const round = (n: number) => Math.round(n * 100) / 100

// ── Shaped cabinets (z_cabinet_shape 3c) ──────────────────────────────────────
// An angled panel (side:/back:<edge>) is turned AY about its outer start corner;
// caseFrame describes it unturned. Bring a cabinet-space drill into that frame.
function intoPanel<T extends { x: number; y: number; z: number; axis: string; dir?: { x: number; y: number; z: number } }>(cp: ResolvedCasePart, d: T): T {
  if (!cp.AY) return d
  return turnDrill({ AY: -cp.AY, X: cp.X, Y: 0, Z: cp.Z }, d as T & { axis: 'x-' | 'x+' | 'y-' | 'y+' | 'z-' | 'z+' })
}

// The vertical carcass panel a cabinet-space bore lands in: inside the panel's
// thickness (±1 mm) and within its face. Null = no panel there (a packer).
function memberPanel(parts: ResolvedCasePart[], d: { x: number; y: number; z: number; axis: string }): ResolvedCasePart | null {
  for (const cp of parts) {
    const vertical = cp.part_key === 'left_side' || cp.part_key === 'right_side' || isShapedPanelKey(cp.part_key)
    if (!vertical || cp.part_key.startsWith('back:')) continue
    const q = intoPanel(cp, { ...d, axis: d.axis as 'x-' })
    const b = cp.AY
      ? { x0: cp.X, x1: cp.X + cp.DY, y0: cp.Y, y1: cp.Y + cp.DX, z0: cp.Z, z1: cp.Z + cp.DZ }
      : (() => { const c = caseBox(cp); return { x0: c.x, x1: c.x + c.w, y0: c.y, y1: c.y + c.h, z0: c.z, z1: c.z + c.d } })()
    const T = 1
    if (q.x >= b.x0 - T && q.x <= b.x1 + T && q.y >= b.y0 - T && q.y <= b.y1 + T && q.z >= b.z0 - T && q.z <= b.z1 + T) return cp
  }
  return null
}

// Collect every resolver-computed hole, projected onto its target part's flat
// footprint and keyed so the optimiser's buildSheetDrills can find it.
// Exported for tests.
export function collectDrillRows(rp: ResolvedCabinet, cabinetId: string): { rows: GeneratedDrill[]; skipped: number } {
  rp = filterRemovedParts(rp)   // removed parts cause no drilling (PART-HIDE-SPEC R-D3)
  const rows: GeneratedDrill[] = []
  let skipped = 0
  const shaped = rp.case_parts.some(p => p.AY) || rp.face_zones.some(z => z.facet || z.AY)

  const caseByKey = new Map(rp.case_parts.map(p => [p.part_key, p]))
  // Cut sides / back (z_cabinet_split) — holes are worked on the whole part, then moved to their piece.
  const cutPieces = rp.split_at?.length ? splitCaseParts(rp.case_parts, rp.split_at) : null
  const zoneByKey = new Map(rp.face_zones.map(z => [zoneKey(z), z]))
  const intByKey = new Map(rp.internal_parts.map(p => [`${p.part_type}_${p.sort_order}`, p]))

  const add = (
    sourceTable: string, sourcePartKey: string, frame: FootprintFrame | null | undefined,
    drill: { x: number; y: number; z: number; axis: string; radius: number; depthLen: number },
    kind: string, operationKey: string,
    tool: { router_tool_id: string | null; drill_id: string | null; auto_tool: boolean },
    // Which face of a front panel this bore drills into. Hinge cups & drawer-front
    // fixings machine on the BACK (interior) face, so the Part Editor shows them on
    // the back. Non-face parts (gables, box panels) pass null — front/back is
    // meaningless there and the editor's face toggle isn't shown for them.
    planeKind: string | null = null,
  ) => {
    // Height split (z_cabinet_split): a hole in a cut side / back goes to the piece it lands in.
    if (sourceTable === 'case_parts' && cutPieces) {
      const base = sourcePartKey.slice(5)
      if (isSplitKey(base)) {
        const piece = splitPieceFor(cutPieces, base, drill.y)
        // The frame reads the panel kind off the key — build it as the part it came from.
        if (piece) { sourcePartKey = `case_${piece.part_key}`; frame = caseFrame({ ...piece, part_key: base as typeof piece.part_key }) }
      }
    }
    if (!frame) { skipped++; return }
    const proj = projectToFrame(drill, frame)
    if (!proj) { skipped++; return }
    rows.push({
      source_table: sourceTable,
      source_cabinet_id: cabinetId,
      source_part_key: sourcePartKey,
      operation_type: 'drill',
      operation_key: operationKey,
      pos_x: round(proj.pos_x),
      pos_y: round(proj.pos_y),
      diameter: round(drill.radius * 2),
      depth: round(drill.depthLen),
      output_face: proj.output_face,
      plane_kind: planeKind,
      repeat_count: 1,
      output_to_cnc: true,
      ...tool,
      parameters: { generated: GENERATED_MARK, kind },
    })
  }

  // 1. Seam joints → case parts (carcase seams) or internal shelves/dividers
  //    (internal seams — targetPartKey already carries the int_… identity).
  for (const d of cabinetSeamDrills(rp)) {
    const tool = { router_tool_id: d.router_tool_id ?? null, drill_id: d.drill_id ?? null, auto_tool: d.auto_tool ?? false }
    if (d.targetPartKey.startsWith('int_')) {
      const ip = intByKey.get(d.targetPartKey.slice(4))
      add('internal_parts', d.targetPartKey, ip ? intFrame(ip) : null, d, 'joint', d.seamKey, tool)
    } else {
      const part = caseByKey.get(d.targetPartKey as never)
      add('case_parts', `case_${d.targetPartKey}`, part ? caseFrame(part) : null, part ? intoPanel(part, d) : d, 'joint', d.seamKey, tool)
    }
  }

  // 2. Hinges → cup holes on the door, plate holes on the mounting gable.
  // Facet doors (z_cabinet_shape 3c): cup drills are already in the door's own
  // square frame; plates are turned to cabinet coords, then into the panel's
  // own frame when the panel is angled.
  for (const h of rp.hinge_instances) {
    const opKey = `hinge_${zoneKey(h)}_${h.sort_order}`
    const zone = zoneByKey.get(zoneKey(h))
    for (const cd of h.cup_drills) {
      add('face_zones', zonePartId(h), zone ? zoneFrame(zone) : null, cd, 'hinge_cup', opKey, AUTO_TOOL, 'face_back')
    }
    const mt = h.mount_target
    if (mt?.table === 'case_parts' && mt.part_key) {
      const cp = caseByKey.get(mt.part_key)
      for (const pd of h.plate_drills) {
        const d = turnDrill(h.turn, pd)
        add('case_parts', `case_${mt.part_key}`, cp ? caseFrame(cp) : null, cp ? intoPanel(cp, d) : d, 'hinge_plate', opKey, AUTO_TOOL)
      }
    } else if (mt?.table === 'face_zones' && mt.row_index != null && mt.col_index != null) {
      // Bi-fold (z_cabinet_shape L2): screw holes on the trailing door's back
      // face, already in that door's own square frame.
      const ref = { facet: mt.facet, row_index: mt.row_index, col_index: mt.col_index }
      const tz = zoneByKey.get(zoneKey(ref))
      for (const pd of h.plate_drills) {
        add('face_zones', zonePartId(ref), tz ? zoneFrame(tz) : null, pd, 'hinge_plate', opKey, AUTO_TOOL, 'face_back')
      }
    } else if (mt?.table === 'internal_parts' && mt.internal_part_type != null && mt.internal_sort_order != null) {
      // Plate mounted on an internal divider (vertical) or shelf (horizontal).
      const ip = intByKey.get(`${mt.internal_part_type}_${mt.internal_sort_order}`)
      const partKey = `int_${mt.internal_part_type}_${mt.internal_sort_order}`   // matches normalize's key
      for (const pd of h.plate_drills) {
        add('internal_parts', partKey, ip ? intFrame(ip) : null, pd, 'hinge_plate', opKey, AUTO_TOOL)
      }
    } else {
      skipped += h.plate_drills.length
    }
  }

  // 3. Slides → cabinet member (gable), drawer front (face), and box panels.
  // Facet drawers (z_cabinet_shape 3c): box parts and the front are in the
  // zone's square frame like the drills; the runner's cabinet-member holes go
  // into whichever panel the runner actually sits on (none → packer, hand-fixed).
  for (const stack of rp.drawer_stacks) {
    const opKey = `slide_${stackKey(stack)}`
    const zone = zoneByKey.get(stackKey(stack))
    const boxByType = new Map(stack.box_parts.map(p => [p.part_type, p]))
    // Must match svgDbMeta / normalize's key (db_<row>_<col>_<part_type>) so generated
    // slide drills land on the same part identity the nest/editor use.
    const dboxKey = (t: string) => dbPartId(stack, t)

    for (const sl of stack.slides) {
      for (const sd of sl.drills) {
        if (sd.machine_operation !== 'drill') { skipped++; continue }
        switch (sd.surface) {
          case 'cabinet_member': {
            // A runner on an internal divider (z_dividers V2) drills that divider.
            const mt = sl.member
            if (mt?.internal_part_type != null && mt.internal_sort_order != null) {
              const ip = intByKey.get(`${mt.internal_part_type}_${mt.internal_sort_order}`)
              add('internal_parts', `int_${mt.internal_part_type}_${mt.internal_sort_order}`, ip ? intFrame(ip) : null, sd, 'slide', opKey, AUTO_TOOL)
              break
            }
            const d = turnDrill(stack.turn, sd)
            const cp = shaped ? memberPanel(rp.case_parts, d) : caseByKey.get(sd.side === 'left' ? 'left_side' : 'right_side')
            if (!cp) { skipped++; break }
            add('case_parts', `case_${cp.part_key}`, caseFrame(cp), intoPanel(cp, d), 'slide', opKey, AUTO_TOOL)
            break
          }
          case 'drawer_front':
            add('face_zones', `zone_${stackKey(stack)}`, zone ? zoneFrame(zone) : null, sd, 'slide', opKey, AUTO_TOOL, 'face_back')
            break
          case 'drawer_side': {
            const t = sd.side === 'left' ? 'db_left_side' : 'db_right_side'
            const bp = boxByType.get(t)
            add('drawer_box_parts', dboxKey(t), bp ? boxFrame(bp) : null, sd, 'slide', opKey, AUTO_TOOL)
            break
          }
          case 'drawer_bottom': {
            const bp = boxByType.get('db_bottom')
            add('drawer_box_parts', dboxKey('db_bottom'), bp ? boxFrame(bp) : null, sd, 'slide', opKey, AUTO_TOOL)
            break
          }
          case 'drawer_back': {
            const bp = boxByType.get('db_back')
            add('drawer_box_parts', dboxKey('db_back'), bp ? boxFrame(bp) : null, sd, 'slide', opKey, AUTO_TOOL)
            break
          }
          default:
            skipped++
        }
      }
      const mark = backTopMarker(sl.drills)
      if (mark) {
        const bp = boxByType.get('db_back')
        add('drawer_box_parts', dboxKey('db_back'), bp ? boxFrame(bp) : null, mark, 'db_back_marker', `${opKey}_back_marker`, AUTO_TOOL)
      }
    }
  }

  // 4. Handles → through-holes on the door / drawer front, drilled from the
  //    back face like the hinge cups (z_handles H2, D8). Facet fronts of shaped
  //    cabinets are skipped like their hinges.
  for (const z of rp.face_zones) {
    const h = z.handle
    if (!h || !h.holes?.length || z.facet || z.AY) continue
    const opKey = `handle_${z.row_index}_${z.col_index}`
    for (const p of h.holes) {
      add('face_zones', `zone_${z.row_index}_${z.col_index}`, zoneFrame(z),
        { x: z.X + p.x, y: z.Y + p.y, z: z.Z, axis: 'z+', radius: h.hole_dia / 2, depthLen: z.DZ },
        'handle', opKey, AUTO_TOOL, 'face_back')
    }
  }

  // 4b. Drawer front marker pricks (z_handles D22): 1 hole on the top front,
  //     2 on the next …, 1 deep into the back face, bottom left (front view).
  for (const z of rp.face_zones) {
    if (!z.marker_holes?.length) continue
    const opKey = `df_marker_${z.row_index}_${z.col_index}`
    for (const p of z.marker_holes) {
      add('face_zones', `zone_${z.row_index}_${z.col_index}`, zoneFrame(z),
        { x: z.X + p.x, y: z.Y + p.y, z: z.Z, axis: 'z+', radius: MARKER_DIA / 2, depthLen: MARKER_DEPTH },
        'df_marker', opKey, AUTO_TOOL, 'face_back')
    }
  }

  // 4c. Sliding bi-fold fittings (z_bifold_slide): carriage / guide cups on the
  //     leading door, centre hinge holes on both, into the back face.
  for (const z of rp.face_zones) {
    if (!z.bifold_holes?.length) continue
    const opKey = `bifold_${z.row_index}_${z.col_index}`
    for (const p of z.bifold_holes) {
      add('face_zones', `zone_${z.row_index}_${z.col_index}`, zoneFrame(z),
        { x: z.X + p.x, y: z.Y + p.y, z: z.Z, axis: 'z+', radius: p.dia / 2, depthLen: p.depth },
        p.dia >= 35 ? 'hinge_cup' : 'bifold', opKey, AUTO_TOOL, 'face_back')
    }
  }

  // 5. Finger-pull backing rails (z_handles H6 / H5b): a knock-in block hole
  //    at each rail end, into the inner face of the panel (side or divider)
  //    that end sits in, RAILBLK behind the back of the rail, centred on the
  //    rail's height. A rail running through a division gets none there, and
  //    the top rail fixed by an on-edge front rail gets none at all (D20).
  //    Positions from railBlockEnds, shared with the 3D block model.
  const panels = new Map(railPanels(rp).map(p => [p.key, p]))
  for (const e of railBlockEnds(rp.case_parts, rp.internal_parts)) {
    const p = panels.get(e.panelKey)
    if (!p) { skipped++; continue }
    add(p.table, p.key, p.frame,
      { x: e.x, y: e.y, z: e.z, axis: e.axis, radius: e.dia / 2, depthLen: e.depth },
      'fprail_block', `fprail_block_${e.railKey.slice(7)}`, AUTO_TOOL)
  }

  // 5b. Shaped facet rails: the same block hole at each end that sits in a
  //     panel, worked in the rail's own frame and turned into the panel's.
  for (const e of shapedRailEnds(rp)) {
    const { rail, panel, atStart } = e
    const m = rail.fprail!
    const lx = atStart ? panel.DZ : rail.DY - panel.DZ
    const d = turnDrill({ AY: rail.AY, X: rail.X, Y: 0, Z: rail.Z }, {
      x: rail.X + lx, y: rail.Y + rail.DX / 2, z: rail.Z - m.blockSetback,
      axis: (atStart ? 'x-' : 'x+') as 'x-' | 'x+', radius: m.blockDia / 2, depthLen: m.blockDepth,
    })
    add('case_parts', `case_${panel.part_key}`, caseFrame(panel), intoPanel(panel, d),
      'fprail_block', `fprail_block_${rail.part_key.slice(7)}`, AUTO_TOOL)
  }

  return { rows, skipped }
}

// Shaped facet rails (resolveShapedFingerRails): each end of a rail that sits
// in a vertical panel. Local rail frame: x along its length from (X, Z), y up,
// z = 0 its back face → DZ its front (as the box rails); it runs through the
// end panel to the panel's outer face.
interface ShapedRailEnd { rail: ResolvedCasePart; panel: ResolvedCasePart; atStart: boolean }
function shapedRailEnds(rp: ResolvedCabinet): ShapedRailEnd[] {
  const out: ShapedRailEnd[] = []
  const panels = rp.case_parts.filter(p => !p.part_key.startsWith('fprail:'))
  for (const rail of rp.case_parts) {
    if (!rail.part_key.startsWith('fprail:') || !rail.fprail?.shaped) continue
    const t = { AY: rail.AY, X: rail.X, Y: 0, Z: rail.Z }
    for (const atStart of [true, false]) {
      const [x, y, z] = turnPoint(t, rail.X + (atStart ? 1 : rail.DY - 1), rail.Y + rail.DX / 2, rail.Z + rail.DZ / 2)
      const panel = memberPanel(panels, { x, y, z, axis: 'x-' })
      if (panel) out.push({ rail, panel, atStart })
    }
  }
  return out
}

// The vertical panels finger rails sit in (z_handles H5b): the carcass sides
// and internal dividers. All share the side frame (u = depth from the back,
// v = height; DZ = thickness along X).
const RAIL_EPS = 0.01
interface RailPanelRef {
  table: 'case_parts' | 'internal_parts'
  key: string                 // optimiser part key (case_left_side / int_divider_0)
  frame: FootprintFrame | null
  face: 'left' | 'right'      // through-op output face, as each side uses
  X: number; Y: number; Z: number; DX: number; DY: number; DZ: number
}
function railPanels(rp: ResolvedCabinet): RailPanelRef[] {
  const out: RailPanelRef[] = []
  for (const p of rp.case_parts) {
    if (p.part_key !== 'left_side' && p.part_key !== 'right_side') continue
    out.push({ table: 'case_parts', key: `case_${p.part_key}`, frame: caseFrame(p), face: p.part_key === 'left_side' ? 'left' : 'right',
      X: p.X, Y: p.Y, Z: p.Z, DX: p.DX, DY: p.DY, DZ: p.DZ })
  }
  for (const p of rp.internal_parts) {
    if (p.part_type !== 'divider') continue
    out.push({ table: 'internal_parts', key: `int_divider_${p.sort_order}`, frame: intFrame(p), face: 'left',
      X: p.X, Y: p.Y, Z: p.Z, DX: p.DX, DY: p.DY, DZ: p.DZ })
  }
  return out
}

// ── Finger-rail notches (z_handles H6 / H5b) ─────────────────────────────────
// Each rail sits in a notch cut right through every panel it reaches (sides,
// and dividers it passes through or ends in) at the front edge,
// the rail thickness deep and the rail's height (user, 2026-10-14):
//   • a generated through pocket for the notch, run NOTCH_OVERRUN past the
//     front edge — and past the side's top / bottom where the notch runs out
//     there — so the cutter leaves those mouths square (the overrun is inside
//     the nest gap, which the profile cut clears anyway)
//   • at each CLOSED end, a relief slot one cutter wide (2 × RAILCUT) running
//     RAILCUT deeper than the rail: the round cutter's corner lands behind the
//     rail, so the rail's back corners seat square
const NOTCH_OVERRUN = 5
const NOTCH_TOOL_DIA = 10

interface GeneratedRoute {
  source_table: 'case_parts' | 'internal_parts' | 'drawer_box_parts' | 'face_zones'
  source_cabinet_id: string
  source_part_key: string
  operation_type: 'route' | 'groove'
  operation_action: 'pocket' | null
  operation_key: string
  pos_x: number; pos_y: number
  size_dx: number | null; size_dy: number | null
  length: number | null; width: number | null
  angle_az?: number                 // groove direction (90 = along the part's v)
  depth: number
  output_face: string
  plane_kind?: string | null
  output_to_cnc: boolean
  router_tool_id: string | null
  tool_set_id?: string | null
  parameters: Record<string, unknown>
}

// Door profile face routes (two-sided spec §0, build step 1): each styled front's
// profile ops — shaker / bead outlines, pockets, VJ lines — as generated route and
// groove rows, from doorProfileCuts — the same geometry the previews, elevations
// and 3D draw. An area's rectangle goes as-is: a pocket clears it; an outline's
// tool path runs a radius inside it, so on the offset line when the op's width
// is the bit's diameter.
// Doors nest back face up (zoneFrame upSign '+'), so front-face cuts are stored
// mirrored across the width, entering from the 'back' like a front-face bore.
// The tool is the op's own bit or tool set; none → the loader warns and skips it.
export function collectDoorProfileRoutes(rp: ResolvedCabinet, cabinetId: string): { rows: GeneratedRoute[] } {
  rp = filterRemovedParts(rp)
  const rows: GeneratedRoute[] = []
  for (const z of rp.face_zones) {
    if (!z.door_profile?.ops.length || z.facet || z.AY) continue
    const W = z.DX
    for (const c of doorProfileCuts(z.door_profile, { w: W, h: z.DY, thickness: z.DZ })) {
      const front = c.face === 'front'
      const mx = (x: number) => front ? W - x : x
      const base = {
        source_table: 'face_zones' as const, source_cabinet_id: cabinetId, source_part_key: `zone_${z.row_index}_${z.col_index}`,
        depth: round(c.depth),
        output_face: front ? 'back' : 'front', plane_kind: front ? 'face_front' : 'face_back',
        output_to_cnc: true, router_tool_id: c.router_tool_id, tool_set_id: c.tool_set_id,
        parameters: { generated: GENERATED_MARK, kind: 'door_profile' },
      }
      if (c.kind === 'groove') {
        // A groove runs +x from its start, or +y (angle 90) when it runs up the door.
        const vertical = Math.abs(c.x2 - c.x1) < 0.001
        const x0 = Math.min(c.x1, c.x2), x1 = Math.max(c.x1, c.x2)
        rows.push({ ...base, operation_type: 'groove', operation_action: null, operation_key: `door_profile_${c.opIndex}_${c.lineIndex}`,
          pos_x: round(vertical ? mx(x0) : front ? W - x1 : x0), pos_y: round(Math.min(c.y1, c.y2)),
          size_dx: null, size_dy: null, length: round(Math.hypot(c.x2 - c.x1, c.y2 - c.y1)), width: c.width,
          ...(vertical ? { angle_az: 90 } : {}) })
      } else {
        rows.push({ ...base, operation_type: 'route', operation_action: c.clear ? 'pocket' : null, operation_key: `door_profile_${c.opIndex}`,
          pos_x: round(mx(c.x + c.w / 2)), pos_y: round(c.y + c.h / 2), size_dx: round(c.w), size_dy: round(c.h), length: null, width: null })
      }
    }
  }
  return { rows }
}

// Exported for tests.
export function collectNotchRoutes(rp: ResolvedCabinet, cabinetId: string, toolId: string | null): { rows: GeneratedRoute[]; skipped: number } {
  rp = filterRemovedParts(rp)
  const rows: GeneratedRoute[] = []
  let skipped = 0
  const rails = rp.case_parts.filter(p => p.part_key.startsWith('fprail:') && p.fprail && !p.fprail.shaped)
  shapedNotchRoutes(rp, cabinetId, toolId, rows, () => skipped++)
  if (!rails.length) return { rows, skipped }
  const EPS = RAIL_EPS
  for (const side of railPanels(rp)) {
    for (const rail of rails) {
      // Only the rails that pass through or end in this panel.
      if (Math.min(rail.X + rail.DY, side.X + side.DZ) - Math.max(rail.X, side.X) <= EPS) continue
      if (!toolId) { skipped++; continue }
      const n = rail.part_key.slice(7)
      const cut = rail.fprail!.cut
      const base = {
        source_table: side.table, source_cabinet_id: cabinetId, source_part_key: side.key,
        depth: round(side.DZ + 0.2),          // right through, with the usual through-hole overshoot
        output_face: side.face,
        output_to_cnc: true, router_tool_id: toolId,
        parameters: { generated: GENERATED_MARK, kind: 'fprail_notch' },
      }
      // Side footprint (caseFrame): u = depth from the side's back (side.Z), v = height.
      const front = rail.Z + rail.DZ - side.Z
      const back = front - rail.DZ
      const bot = rail.Y - side.Y, top = bot + rail.DX
      const openBot = bot <= EPS, openTop = top >= side.DY - EPS
      const u0 = back, u1 = front + NOTCH_OVERRUN
      const v0 = openBot ? bot - NOTCH_OVERRUN : bot, v1 = openTop ? top + NOTCH_OVERRUN : top
      // The left side's op frame runs front to back, like its holes (caseFrame
      // upSign '+' → projectToFrame mirrors its x− bores) — its notch goes the same way.
      const mx = (u: number) => side.key === 'case_left_side' ? side.DX - u : u
      rows.push({
        ...base, operation_type: 'route', operation_action: 'pocket', operation_key: `fprail_notch_${n}`,
        pos_x: round(mx((u0 + u1) / 2)), pos_y: round((v0 + v1) / 2),
        size_dx: round(u1 - u0), size_dy: round(v1 - v0), length: null, width: null,
      })
      // Closed-end reliefs: a slot centred one cutter radius in from the end,
      // starting at the rail's back face (the slot's round end reaches `cut`
      // deeper) and running out past the front edge.
      if (cut > 0 && top - bot > 4 * cut) {
        const ends = [...(openTop ? [] : [top - cut]), ...(openBot ? [] : [bot + cut])]
        ends.forEach((v, i) => rows.push({
          ...base, operation_type: 'groove', operation_action: null, operation_key: `fprail_relief_${n}_${i}`,
          pos_x: round(Math.min(mx(back), mx(u1))), pos_y: round(v), size_dx: null, size_dy: null,
          length: round(u1 - back), width: round(2 * cut),
        }))
      }
    }
  }
  return { rows, skipped }
}

// Shaped facet rails: the notch (and closed-end reliefs) in each end panel,
// worked as boxes in the rail's frame and projected into the panel's own
// footprint frame — a turned `side:<edge>` panel is face-kind (u = height,
// v = length), so reliefs go out as one-cutter-wide pockets rather than
// grooves (a pocket exactly the cutter wide leaves the same round end).
function shapedNotchRoutes(
  rp: ResolvedCabinet, cabinetId: string, toolId: string | null, rows: GeneratedRoute[], skip: () => void,
): void {
  for (const { rail, panel, atStart } of shapedRailEnds(rp)) {
    if (!toolId) { skip(); continue }
    const frame = caseFrame(panel)
    const t = { AY: rail.AY, X: rail.X, Y: 0, Z: rail.Z }
    const pY0 = panel.Y, pY1 = panel.Y + (panel.part_key.startsWith('side:') ? panel.DX : panel.DY)
    const bot = rail.Y, top = rail.Y + rail.DX
    const openBot = bot <= pY0 + RAIL_EPS, openTop = top >= pY1 - RAIL_EPS
    const x0 = atStart ? 0 : rail.DY - panel.DZ, x1 = atStart ? panel.DZ : rail.DY
    // A box in rail-local coords → u / v extents in the panel's frame.
    const rect = (y0: number, y1: number, z0: number, z1: number) => {
      const us: number[] = [], vs: number[] = []
      for (const lx of [x0, x1]) for (const ly of [y0, y1]) for (const lz of [z0, z1]) {
        const [x, y, z] = turnPoint(t, rail.X + lx, ly, rail.Z + lz)
        const q = intoPanel(panel, { x, y, z, axis: 'x-' as const }) as { x: number; y: number; z: number }
        us.push(q[frame.u.axis] - frame.u.origin); vs.push(q[frame.v.axis] - frame.v.origin)
      }
      const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs)
      // A left side's op frame runs front to back, like its holes (see collectNotchRoutes).
      const uc = (u0 + u1) / 2
      return { pos_x: round(panel.part_key === 'left_side' ? frame.u.extent - uc : uc), pos_y: round((v0 + v1) / 2), size_dx: round(u1 - u0), size_dy: round(v1 - v0) }
    }
    const n = rail.part_key.slice(7)
    const cut = rail.fprail!.cut
    const base = {
      source_table: 'case_parts' as const, source_cabinet_id: cabinetId, source_part_key: `case_${panel.part_key}`,
      depth: round(panel.DZ + 0.2),
      output_face: isShapedPanelKey(panel.part_key) ? 'back' : panel.part_key === 'left_side' ? 'left' : 'right',
      output_to_cnc: true, router_tool_id: toolId, length: null, width: null,
      parameters: { generated: GENERATED_MARK, kind: 'fprail_notch' },
    }
    rows.push({ ...base, operation_type: 'route', operation_action: 'pocket', operation_key: `fprail_notch_${n}_${atStart ? 0 : 1}`,
      ...rect(openBot ? bot - NOTCH_OVERRUN : bot, openTop ? top + NOTCH_OVERRUN : top, 0, rail.DZ + NOTCH_OVERRUN) })
    if (cut > 0 && top - bot > 4 * cut) {
      const ends = [...(openTop ? [] : [top - cut]), ...(openBot ? [] : [bot + cut])]
      ends.forEach((v, i) => rows.push({ ...base, operation_type: 'route', operation_action: 'pocket',
        operation_key: `fprail_relief_${n}_${atStart ? 0 : 1}_${i}`,
        ...rect(v - cut, v + cut, -cut, rail.DZ + NOTCH_OVERRUN) }))
    }
  }
}

// Curved end bend pockets (z_curved_end C3): one back-face pocket per curve on
// the face board, the full height plus an overrun of the cutter radius + 1 past
// the top and bottom edges so the cut-out comes out clean and square (decision
// 13 — the nest gap is the outline cutter + pad + entry, ~14 with a 10 mm bit).
// Same cutter as the finger-rail notches: the active 10 mm bit.
// Part-local frame = DX × DY; the wrap runs along DX (vertical grain) or DY.
export const CURVED_POCKET_OVERRUN = NOTCH_TOOL_DIA / 2 + 1

export function collectCurvedPocketRoutes(rp: ResolvedCabinet, cabinetId: string, toolId: string | null): { rows: GeneratedRoute[]; skipped: number } {
  rp = filterRemovedParts(rp)
  const rows: GeneratedRoute[] = []
  let skipped = 0
  for (const p of rp.case_parts) {
    const bend = p.wrap?.bend
    if (!bend) continue
    if (!toolId) { skipped += bend.at.length; continue }
    // grain along the wrap (horizontal) puts the wrap on DY, else DX (resolveCurvedEnd)
    const H = p.wrap!.h, along = p.grain_direction === 'horizontal' ? 'y' : 'x'
    bend.at.forEach(([a, b], i) => {
      const mid = (a + b) / 2, len = b - a, across = H + 2 * CURVED_POCKET_OVERRUN
      rows.push({
        source_table: 'case_parts', source_cabinet_id: cabinetId, source_part_key: `case_${p.part_key}`,
        operation_type: 'route', operation_action: 'pocket', operation_key: `curved_pocket_${i}`,
        ...(along === 'x'
          ? { pos_x: round(mid), pos_y: round(H / 2), size_dx: round(len), size_dy: round(across) }
          : { pos_x: round(H / 2), pos_y: round(mid), size_dx: round(across), size_dy: round(len) }),
        length: null, width: null,
        depth: round(bend.depth),
        output_face: 'back',          // the face board machines back face up (kit §6)
        output_to_cnc: true, router_tool_id: toolId,
        parameters: { generated: GENERATED_MARK, kind: 'curved_pocket' },
      })
    })
  }
  return { rows, skipped }
}

// Floating shelf cleat slot (z_floating_shelf): each board's inner-face pockets.
// Rects come in the horizontal shape frame (x along the width, y back from the
// front); the op frame of a flat case part is x = DX − y (from the back edge),
// y = x. An edge on the board's boundary is open — it overruns by the cutter
// radius + 1 like the bend pockets so the slot comes out clean.
export function collectFloatShelfPocketRoutes(rp: ResolvedCabinet, cabinetId: string, toolId: string | null): { rows: GeneratedRoute[]; skipped: number } {
  rp = filterRemovedParts(rp)
  const rows: GeneratedRoute[] = []
  let skipped = 0
  const ov = CURVED_POCKET_OVERRUN
  for (const p of rp.case_parts) {
    if (!p.pockets?.length) continue
    if (!toolId) { skipped += p.pockets.length; continue }
    p.pockets.forEach((k, i) => {
      const x0 = k.x0 <= 0.01 ? -ov : k.x0, x1 = k.x1 >= p.DY - 0.01 ? p.DY + ov : k.x1
      const y0 = k.y0 <= 0.01 ? -ov : k.y0, y1 = k.y1 >= p.DX - 0.01 ? p.DX + ov : k.y1
      rows.push({
        source_table: 'case_parts', source_cabinet_id: cabinetId, source_part_key: `case_${p.part_key}`,
        operation_type: 'route', operation_action: 'pocket', operation_key: `fs_pocket_${i}`,
        pos_x: round(p.DX - (y0 + y1) / 2), pos_y: round((x0 + x1) / 2),
        size_dx: round(y1 - y0), size_dy: round(x1 - x0),
        length: null, width: null,
        depth: round(k.depth),
        output_face: 'back',          // the inner (glue) face; the show face is the front
        output_to_cnc: true, router_tool_id: toolId,
        parameters: { generated: GENERATED_MARK, kind: 'float_shelf_pocket' },
      })
    })
  }
  return { rows, skipped }
}

// Thick drawer bottoms (18 board in a runner made for 16): the underside rebate
// along the left + right edges, one pocket strip per edge. Op frame of a box
// bottom (boxFrame): x = DX (depth), y = DY (width), so the strips run the full
// DX at y 0..w and DY−w..DY, overrunning the open edges like the other pockets.
export function collectDrawerBottomRebateRoutes(rp: ResolvedCabinet, cabinetId: string, toolId: string | null): { rows: GeneratedRoute[]; skipped: number } {
  rp = filterRemovedParts(rp)
  const rows: GeneratedRoute[] = []
  let skipped = 0
  const ov = CURVED_POCKET_OVERRUN
  for (const stack of rp.drawer_stacks) {
    const p = stack.box_parts.find(b => b.part_type === 'db_bottom')
    if (!p?.rebate) continue
    if (!toolId) { skipped += 2; continue }
    const w = Math.min(p.rebate.width, p.DY / 2)
    ;([['l', -ov, w], ['r', p.DY - w, p.DY + ov]] as const).forEach(([side, y0, y1]) => {
      rows.push({
        source_table: 'drawer_box_parts', source_cabinet_id: cabinetId, source_part_key: dbPartId(stack, 'db_bottom'),
        operation_type: 'route', operation_action: 'pocket', operation_key: `db_rebate_${stackKey(stack)}_${side}`,
        pos_x: round(p.DX / 2), pos_y: round((y0 + y1) / 2),
        size_dx: round(p.DX + 2 * ov), size_dy: round(y1 - y0),
        length: null, width: null,
        depth: round(p.rebate!.depth),
        output_face: 'bottom',        // the underside — it sits on the runner ledges
        output_to_cnc: true, router_tool_id: toolId,
        parameters: { generated: GENERATED_MARK, kind: 'db_bottom_rebate' },
      })
    })
  }
  return { rows, skipped }
}

// The notch cutter: the active 10mm router bit with the lowest tool number.
async function notchToolId(): Promise<string | null> {
  const { data } = await supabase.from('cnc_tools').select('id,tool_number,diameter').eq('active', true)
  const tools = ((data ?? []) as { id: string; tool_number: string | null; diameter: number | string | null }[])
    .filter(t => Number(t.diameter) === NOTCH_TOOL_DIA)
    .sort((a, b) => String(a.tool_number ?? '').localeCompare(String(b.tool_number ?? ''), undefined, { numeric: true }))
  return tools[0]?.id ?? null
}

export interface SeamDrillSyncResult { written: number; skipped: number }

// Coalesce concurrent syncs for the SAME cabinet onto one in-flight promise. The
// delete+insert below is not atomic, so two overlapping runs (StrictMode double
// mount, manual regen racing an optimise pass) would each delete then each insert,
// doubling every generated hole. See coalesce.ts.
const inFlight = new Map<string, Promise<SeamDrillSyncResult>>()

// Regenerate ALL resolver-computed drilling rows for ONE cabinet.
// `resolved`: the cabinet already resolved by the caller (one resolve shared with
// the master/slave pass) — skips the DB load.
export function syncSeamDrillOperations(cabinetId: string, resolved?: ResolvedCabinet): Promise<SeamDrillSyncResult> {
  return coalesceByKey(inFlight, cabinetId, () => runSeamDrillSync(cabinetId, resolved))
}

async function runSeamDrillSync(cabinetId: string, resolved?: ResolvedCabinet): Promise<SeamDrillSyncResult> {
  // Quiet: a project may contain a half-built cabinet; its resolver errors must
  // not surface as a hard error while we generate drilling for the whole nest.
  let rp: ResolvedCabinet
  try {
    rp = resolved ?? await resolveCabinetFromDB(cabinetId, { quiet: true })
  } catch (e) {
    // The cabinet was deleted after this nest was built. Its parts keep whatever
    // part_operations they already have — there are no live joints to regenerate.
    // Expected/recoverable, so skip it quietly (a warning, not an error, so the
    // dev overlay doesn't trip). Re-throw anything that isn't a missing cabinet.
    if (e instanceof Error && /not found/i.test(e.message)) {
      console.warn('[seamDrillSync] cabinet missing (deleted after nesting), skipping:', cabinetId)
      return { written: 0, skipped: 0 }
    }
    throw e
  }
  const { rows, skipped } = collectDrillRows(rp, cabinetId)

  // Generated routes + grooves (finger-rail notches + reliefs) — same wholesale replace.
  const hasRails = rp.case_parts.some(p => p.part_key.startsWith('fprail:'))
  const hasBends = rp.case_parts.some(p => p.wrap?.bend)
  const hasSlots = rp.case_parts.some(p => p.pockets?.length)
  const hasRebates = rp.drawer_stacks.some(s => s.box_parts.some(b => b.rebate))
  const cutter = hasRails || hasBends || hasSlots || hasRebates ? await notchToolId() : null
  const notch = collectNotchRoutes(rp, cabinetId, hasRails ? cutter : null)
  const bends = collectCurvedPocketRoutes(rp, cabinetId, cutter)
  notch.rows.push(...bends.rows)
  const slots = collectFloatShelfPocketRoutes(rp, cabinetId, cutter)
  notch.rows.push(...slots.rows)
  const rebates = collectDrawerBottomRebateRoutes(rp, cabinetId, cutter)
  notch.rows.push(...rebates.rows)
  notch.rows.push(...collectDoorProfileRoutes(rp, cabinetId).rows)
  if (hasRebates && rebates.skipped) console.warn(`[seamDrillSync] ${rebates.skipped} drawer bottom rebate pocket(s) skipped — no active ${NOTCH_TOOL_DIA}mm router bit`)
  if (hasSlots && slots.skipped) console.warn(`[seamDrillSync] ${slots.skipped} floating shelf slot pocket(s) skipped — no active ${NOTCH_TOOL_DIA}mm router bit`)
  if (hasBends && bends.skipped) console.warn(`[seamDrillSync] ${bends.skipped} curved end bend pocket(s) skipped — no active ${NOTCH_TOOL_DIA}mm router bit`)

  // Replace this cabinet's generated drill + route rows wholesale. Hand-added rows
  // (no parameters.generated marker) are left untouched. One delete, then the
  // two inserts side by side (their column sets differ, so they stay separate) —
  // each call is a full DB round-trip, which is what made Stage 6 slow.
  const { error: delErr } = await supabase.from('part_operations')
    .delete()
    .eq('source_cabinet_id', cabinetId)
    .in('operation_type', ['drill', 'route', 'groove'])
    .contains('parameters', { generated: GENERATED_MARK })
  if (delErr) { console.error('[seamDrillSync] delete', delErr); throw delErr }
  const [ins, insR] = await Promise.all([
    rows.length ? supabase.from('part_operations').insert(rows) : null,
    // Every row carries the same columns (door profile rows add a few), so one insert works.
    notch.rows.length ? supabase.from('part_operations').insert(notch.rows.map(r => ({ angle_az: 0, plane_kind: null, tool_set_id: null, ...r }))) : null,
  ])
  if (ins?.error) { console.error('[seamDrillSync] insert', ins.error); throw ins.error }
  if (insR?.error) { console.error('[seamDrillSync] insert routes', insR.error); throw insR.error }
  if (hasRails && notch.skipped) console.warn(`[seamDrillSync] ${notch.skipped} finger-rail notch(es) skipped — no active ${NOTCH_TOOL_DIA}mm router bit`)

  return { written: rows.length + notch.rows.length, skipped: skipped + notch.skipped + bends.skipped + slots.skipped + rebates.skipped }
}

// Regenerate for many cabinets (e.g. every cabinet in a nest), with bounded
// concurrency so a project of 20+ cabinets doesn't take a minute. The resolver
// caches are keyed by cabinetId, so concurrent distinct cabinets don't collide.
export async function syncSeamDrillOperationsForCabinets(
  cabinetIds: string[],
  opts: { concurrency?: number } = {},
): Promise<SeamDrillSyncResult> {
  const total: SeamDrillSyncResult = { written: 0, skipped: 0 }
  const concurrency = Math.max(1, opts.concurrency ?? 6)
  let next = 0
  async function worker() {
    while (next < cabinetIds.length) {
      const id = cabinetIds[next++]
      try {
        const r = await syncSeamDrillOperations(id)
        total.written += r.written
        total.skipped += r.skipped
      } catch (e) {
        console.error('[seamDrillSync] cabinet failed, continuing:', id, e)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, cabinetIds.length) }, worker))
  return total
}
