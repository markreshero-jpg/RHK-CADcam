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
  HandleScheduleEntryInput, ResolvedFaceZone, ResolvedHandle,
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
  return { role, entry, product, override: !!override, edge: gripEdge(cab, zone), zoneIn }
}

/** The grip edge needing the FPGAP finger gap, or null (D4). */
export function fingerGapEdge(cab: CabinetInput, zone: ZoneLike): 'top' | 'bottom' | null {
  const g = zoneGrip(cab, zone)
  return g?.product.needs_finger_gap ? g.edge : null
}

export function resolveHandle(cab: CabinetInput, zone: ResolvedFaceZone): ResolvedHandle | null {
  const g = zoneGrip(cab, zone)
  if (!g) return null
  const { role, entry, product, zoneIn, edge } = g
  const override = g.override
  const orientation = entry?.orientation ?? (role === 'drawer' ? 'horizontal' : 'vertical')
  const offset      = entry?.offset_from_edge_mm ?? 50
  const inset       = role === 'drawer' ? null : (entry?.inset_from_side_mm ?? null)
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
    bevel:        product.grip_kind === 'sharknose' ? sharknoseBevel(product, zone.DZ) : null,
  }
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
