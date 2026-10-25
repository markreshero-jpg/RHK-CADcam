// ============================================================
// Handle Resolver (z_handles/HANDLES-SPEC.md — H1)
// Puts one grip on every door / drawer front: the zone's own override, else
// the handle schedule's row for the zone's role. Placement follows the shop
// defaults carried by the schedule row (D6):
//   • grip edge = top on base/tall, bottom on wall (D5); a door hinged on its
//     top or bottom edge grips on the opposite edge
//   • offset_from_edge_mm = grip edge → the handle's nearest hole line
//   • doors: inset_from_side_mm = non-hinged edge → nearest hole line;
//     drawers (and null inset) centre left to right
// Positionless grips (push-to-open, sharknose, rail, channel) resolve with
// x / y = null — they're counted and listed, not drawn as a bar.
// ============================================================

import type {
  CabinetInput, FaceGridInput, FaceZoneInput, HandleProductInput, HandleRole,
  HandleScheduleEntryInput, ResolvedCasePart, ResolvedFaceZone, ResolvedHandle,
} from './types'

// The bits of a zone the grip lookup needs — a resolved zone or a face-grid
// input zone (resolveFace sizes finger gaps before zones are resolved).
type ZoneLike = Pick<FaceZoneInput, 'row_index' | 'col_index' | 'face_type' | 'hinge_side'> & { facet?: string }

const POSITIONED = new Set(['hardware', 'routed'])

export function handleRole(cab: CabinetInput, zone: ZoneLike): HandleRole | null {
  if (zone.face_type === 'drawer_face') return 'drawer'
  if (zone.face_type !== 'door') return null
  const cls = cab.assembly_class
  if (cls === 'wall' || cls === 'wall_corner') return 'door_wall'
  if (cls === 'tall' || cls === 'tall_corner') return 'door_tall'
  return 'door_base'
}

function gripEdge(cab: CabinetInput, zone: ZoneLike): 'top' | 'bottom' {
  if (zone.hinge_side === 'top')    return 'bottom'
  if (zone.hinge_side === 'bottom') return 'top'
  return (cab.assembly_class === 'wall' || cab.assembly_class === 'wall_corner') ? 'bottom' : 'top'
}

function zoneGrid(cab: CabinetInput, zone: ZoneLike): FaceGridInput | undefined {
  return zone.facet ? cab.faces?.[zone.facet] : cab.face_grid
}

export interface ZoneGrip {
  role:     HandleRole
  entry:    HandleScheduleEntryInput | undefined
  product:  HandleProductInput
  override: boolean
  edge:     'top' | 'bottom'
  zoneIn:   FaceZoneInput | undefined
}

/** Which grip a front gets (zone override → schedule row) and its grip edge. */
export function zoneGrip(cab: CabinetInput, zone: ZoneLike): ZoneGrip | null {
  const role = handleRole(cab, zone)
  if (!role) return null
  const entry = cab.handle_schedule?.[role]
  const zoneIn = zoneGrid(cab, zone)?.zones.find(z => z.row_index === zone.row_index && z.col_index === zone.col_index)
  const override = zoneIn?.handle_id ? cab.handle_products?.[zoneIn.handle_id] : undefined
  const product = override ?? entry?.handle ?? null
  if (!product) return null
  // The front's own grip edge (D14) wins over the hinge / class default.
  const edge = zoneIn?.grip_edge ?? gripEdge(cab, zone)
  return { role, entry, product, override: !!override, edge, zoneIn }
}

/** The finger gap a front wants at its grip edge (D4): the front's own size
 *  (D14), else FPGAP. Null when its grip needs no gap. */
export function fingerGap(cab: CabinetInput, zone: ZoneLike, fpgap: number): { edge: 'top' | 'bottom'; gap: number } | null {
  const g = zoneGrip(cab, zone)
  if (!g?.product.needs_finger_gap) return null
  return { edge: g.edge, gap: g.zoneIn?.finger_gap ?? fpgap }
}

export function resolveHandle(cab: CabinetInput, zone: ResolvedFaceZone): ResolvedHandle | null {
  const g = zoneGrip(cab, zone)
  if (!g) return null
  const { role, entry, product, zoneIn, edge } = g
  const override = g.override
  if (product.grip_kind === 'linear') return linearHandle(cab, zone, g)
  const orientation = entry?.orientation ?? (role === 'drawer' ? 'horizontal' : 'vertical')
  const offset      = zoneIn?.handle_offset ?? entry?.offset_from_edge_mm ?? 50
  const inset       = role === 'drawer' ? null : (zoneIn?.handle_inset ?? entry?.inset_from_side_mm ?? null)
  const half        = (product.bore_centres ?? 0) / 2

  let x: number | null = null
  let y: number | null = null
  if (POSITIONED.has(product.grip_kind)) {
    // Across the grip edge: a vertical handle's nearest hole sits at `offset`,
    // so its centre is half the bore centres further in.
    const fromEdge = offset + (orientation === 'vertical' ? half : 0)
    y = edge === 'top' ? zone.DY - fromEdge : fromEdge

    // Along the grip edge: centred, or `inset` from the non-hinged side edge.
    const side = zone.hinge_side === 'left' ? 'right' : zone.hinge_side === 'right' ? 'left' : null
    if (inset == null || !side) {
      x = zone.DX / 2
    } else {
      const fromSide = inset + (orientation === 'horizontal' ? half : 0)
      x = side === 'left' ? fromSide : zone.DX - fromSide
    }
  }

  // Through-holes (D8): only bought handles are machine-drilled, and only when
  // drilling is on (D13): the front's own switch, else the HANDLE_DRILL rule
  // (job → room → cabinet rule_overrides), else on.
  const drilled = zoneIn?.handle_drill ?? cab.rules.HANDLE_DRILL ?? true
  const holes: { x: number; y: number }[] = []
  if (product.grip_kind === 'hardware' && drilled && x != null && y != null) {
    const pattern = product.holes.length
      ? product.holes
      : half > 0
        ? [{ offset_x: -half, offset_y: 0 }, { offset_x: half, offset_y: 0 }]
        : [{ offset_x: 0, offset_y: 0 }]
    for (const h of pattern) {
      holes.push(orientation === 'horizontal'
        ? { x: x + h.offset_x, y: y + h.offset_y }
        : { x: x + h.offset_y, y: y + h.offset_x })
    }
  }

  return {
    handle_id:    product.id,
    name:         product.name,
    grip_kind:    product.grip_kind,
    role,
    source:       override ? 'zone' : 'schedule',
    grip_edge:    edge,
    orientation,
    x, y,
    length:       product.length,
    bore_centres: product.bore_centres,
    projection:   product.projection,
    holes,
    hole_dia:     product.hole_dia_mm ?? 5,
    drilled:      product.grip_kind === 'hardware' && drilled,
    finger_gap:   product.needs_finger_gap,
    finger_gap_mm: product.needs_finger_gap ? (zoneIn?.finger_gap ?? cab.rules.FPGAP) : null,
    bevel:        product.grip_kind === 'sharknose' ? sharknoseBevel(product, zone.DZ) : null,
  }
}

// ── Linear strip handle (D17) ────────────────────────────────────────────────
// A strip of the front's own board on its face: horizontal along the grip edge
// (base doors, drawers; wall doors at the bottom), vertical against the
// non-hinged edge on tall doors. Full length unless the front's handle_length
// says otherwise; a shorter strip keeps to the non-hinged side (doors), the
// middle (drawers), or the top (tall doors), handle_inset in from there.
// Screws come through from the back of the front: at most screw_spacing apart,
// the outer ones screw_inset from the strip ends — drilled as handle holes, so
// HANDLE_DRILL / handle_drill switch them like any handle's (D13).
function linearHandle(cab: CabinetInput, zone: ResolvedFaceZone, g: ZoneGrip): ResolvedHandle {
  const { role, entry, product, zoneIn, edge } = g
  const W = product.strip_width_mm ?? 35
  const side = zone.hinge_side === 'left' ? 'right' : zone.hinge_side === 'right' ? 'left' : null
  const vertical = role === 'door_tall' && !!side && (entry?.orientation ?? 'vertical') === 'vertical'
  const full = vertical ? zone.DY : zone.DX
  const length = Math.max(1, zoneIn?.handle_length ?? full)
  const inset = zoneIn?.handle_inset ?? null

  // The strip's sharknose — on the strip, not the front (the front keeps a square edge).
  const bv = sharknoseBevel(product, zone.DZ)!
  const cut = { angle_deg: bv.angle_deg, land: bv.land }
  let strip: NonNullable<ResolvedHandle['strip']>
  if (vertical) {
    const y0 = zone.DY - (inset ?? 0) - length
    strip = side === 'right'
      ? { x0: zone.DX - W, y0, w: W, h: length, bevel_edge: 'left', ...cut, full, length, overridden: zoneIn?.handle_length != null }
      : { x0: 0, y0, w: W, h: length, bevel_edge: 'right', ...cut, full, length, overridden: zoneIn?.handle_length != null }
  } else {
    const x0 = role !== 'drawer' && side
      ? (side === 'right' ? zone.DX - (inset ?? 0) - length : (inset ?? 0))
      : (inset ?? (zone.DX - length) / 2)
    const top = edge === 'top'
    strip = { x0, y0: top ? zone.DY - W : 0, w: length, h: W, bevel_edge: top ? 'bottom' : 'top', ...cut,
      full, length, overridden: zoneIn?.handle_length != null }
  }

  // Screws along the strip's centre line.
  const drilled = zoneIn?.handle_drill ?? cab.rules.HANDLE_DRILL ?? true
  const holes: { x: number; y: number }[] = []
  if (drilled) {
    const spacing = product.screw_spacing_mm ?? 350
    const end = Math.min(product.screw_inset_mm ?? 50, length / 2)
    const run = length - 2 * end
    const n = run <= 0 ? 1 : Math.ceil(run / spacing) + 1
    for (let i = 0; i < n; i++) {
      const along = n === 1 ? length / 2 : end + (run * i) / (n - 1)
      holes.push(vertical
        ? { x: strip.x0 + W / 2, y: strip.y0 + along }
        : { x: strip.x0 + along, y: strip.y0 + W / 2 })
    }
  }

  return {
    handle_id:    product.id,
    name:         product.name,
    grip_kind:    'linear',
    role,
    source:       g.override ? 'zone' : 'schedule',
    grip_edge:    edge,
    orientation:  vertical ? 'vertical' : 'horizontal',
    x: strip.x0 + strip.w / 2, y: strip.y0 + strip.h / 2,
    length,
    bore_centres: null,
    projection:   zone.DZ,
    holes,
    hole_dia:     product.hole_dia_mm ?? 4.5,
    drilled,
    finger_gap:   false,
    finger_gap_mm: null,
    bevel:        null,
    strip,
  }
}

/** The strips as case parts `lh:<n>` (face-kind: DX = height, DY = width, DZ =
 *  thickness, X / Y = left / bottom, Z = back face), standing on each front's
 *  face in the front's own material. Tape on the long edge away from the
 *  sharknose and on both ends; the bevelled edge stays bare. Facet fronts of
 *  shaped cabinets are skipped (turned AY), like their handle holes. */
export function linearHandleParts(zones: ResolvedFaceZone[]): ResolvedCasePart[] {
  const out: ResolvedCasePart[] = []
  for (const z of zones) {
    const s = z.handle?.strip
    if (!s || z.facet || z.AY) continue
    const horizontal = s.bevel_edge === 'top' || s.bevel_edge === 'bottom'
    out.push({
      part_key: `lh:${out.length}`,
      X: z.X + s.x0, Y: z.Y + s.y0, Z: z.Z + z.DZ,
      DX: s.h, DY: s.w, DZ: z.DZ,
      AX: 0, AY: 0, AZ: 0,
      material_id: z.material_id,
      grain_direction: horizontal ? 'horizontal' : 'vertical',
      edge_band: horizontal
        ? { top: s.bevel_edge !== 'top', bottom: s.bevel_edge !== 'bottom', left: true, right: true, id: z.edge_band?.id }
        : { top: true, bottom: true, left: s.bevel_edge !== 'left', right: s.bevel_edge !== 'right', id: z.edge_band?.id },
      lh: { bevel_edge: s.bevel_edge, angle_deg: s.angle_deg, land: s.land },
    } as ResolvedCasePart)
  }
  return out
}

// Saw tilt from vertical cuts the back of the edge: the bevel runs
// (thickness − land) × tan(angle) along the face, leaving `land` at the front.
function sharknoseBevel(p: HandleProductInput, thick: number): ResolvedHandle['bevel'] {
  const angle = p.bevel_angle_deg ?? 45
  const land  = Math.min(Math.max(p.bevel_land_mm ?? 0, 0), thick)
  return { angle_deg: angle, land, run: (thick - land) * Math.tan(angle * Math.PI / 180) }
}

export function resolveHandles(cab: CabinetInput, zones: ResolvedFaceZone[]): void {
  for (const z of zones) z.handle = resolveHandle(cab, z)
}
