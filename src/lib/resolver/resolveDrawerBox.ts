// ============================================================
// Drawer Box Resolver
// Computes 5-piece drawer box geometry from opening dimensions
// and a drawer box construction method.
//
// Coordinate convention:
//   DX = dimension in depth direction (box Z, from front toward back)
//   DY = dimension in width direction (box X) or height for vertical panels
//   DZ = material thickness
//   X, Y, Z = position of the part's front-bottom-left corner
//              Z=0 is the FRONT face of the box; Z increases toward the back.
//
// Origin for a standalone drawer box preview: X=Y=Z=0 (front-bottom-left).
// In cabinet space, caller maps: cabinet_Z = zone.Z - local_Z.
// ============================================================

import {
  DrawerBoxInput, ResolvedDrawerBoxPart, DrawerBoxRules,
  EdgeBanding, EdgeSides, DbEdgingKey, DEFAULT_DB_EDGING,
} from './types'

function ebFromSides(sides: EdgeSides, id?: string): EdgeBanding {
  return {
    top:    sides.includes('top'),
    bottom: sides.includes('bottom'),
    left:   sides.includes('left'),
    right:  sides.includes('right'),
    id,
  }
}

function getEdging(part: DbEdgingKey, rules: DrawerBoxRules): EdgeSides {
  return rules.DB_EDGING?.[part] ?? DEFAULT_DB_EDGING[part]
}

export function resolveDrawerBox(input: DrawerBoxInput): ResolvedDrawerBoxPart[] {
  const { box_width: W, box_height: H, box_depth: D, material, edgeband_id, bottom_material, bottom_edgeband_id, front_material, front_edgeband_id, rules: r, slide_box_height } = input
  const Ts      = r.DB_SIDE_T                        // positional: side deduction for width/X calculations
  const panelT  = material.DZ                        // actual cut thickness for side/front/back panels
  const Tb      = (bottom_material ?? material).DZ   // bottom panel thickness
  const Tf      = (front_material  ?? material).DZ   // front panel thickness
  const mid  = material.id
  const bmid = bottom_material?.id ?? mid
  const fmid = front_material?.id ?? mid
  const feb  = front_edgeband_id ?? edgeband_id

  const parts: ResolvedDrawerBoxPart[] = []

  // ── Left Side (DX=depth, DY=height, DZ=panelT) ───────────────
  parts.push({
    part_type:   'db_left_side',
    DX: D, DY: H, DZ: panelT,
    X: 0, Y: 0, Z: 0,
    AX: 0, AY: 0, AZ: 0,
    material_id: mid,
    edge_band:   ebFromSides(getEdging('db_left_side', r), edgeband_id),
  })

  // ── Right Side ────────────────────────────────────────────────
  parts.push({
    part_type:   'db_right_side',
    DX: D, DY: H, DZ: panelT,
    X: W - Ts, Y: 0, Z: 0,
    AX: 0, AY: 0, AZ: 0,
    material_id: mid,
    edge_band:   ebFromSides(getEdging('db_right_side', r), edgeband_id),
  })

  // ── Bottom ────────────────────────────────────────────────────
  // For dado: sits in the groove at DB_DADO_HEIGHT from the bottom of the sides.
  // For screwed: sits at the very bottom (Y=0) between the sides.
  const bottomY = r.DB_BOTTOM_JOIN === 'dado' ? r.DB_DADO_HEIGHT : 0
  parts.push({
    part_type:   'db_bottom',
    DX: D - r.DB_BACK_SETBACK,
    DY: W - 2 * Ts,
    DZ: Tb,
    X: Ts, Y: bottomY, Z: 0,
    AX: 0, AY: 0, AZ: 0,
    material_id: bmid,
    edge_band:   ebFromSides(getEdging('db_bottom', r), bottom_edgeband_id ?? edgeband_id),
  })

  // ── Front & Back (butt joint) ─────────────────────────────────
  // For dado bottom:
  //   Front: spans from dado_h to top (height = H - dado_h)
  //   Back:  shorter still — must clear the bottom so it can slide in from the back
  //          (height = H - dado_h - Tb)
  // For screwed:
  //   Front/back span full height (H)

  if (r.DB_JOINT_TYPE === 'butt') {
    // Front panel — sits at the front face of the box (Z=0)
    const frontH = r.DB_BOTTOM_JOIN === 'dado' ? H - r.DB_DADO_HEIGHT : H
    const frontY = r.DB_BOTTOM_JOIN === 'dado' ? r.DB_DADO_HEIGHT       : 0
    parts.push({
      part_type:   'db_front',
      DX: frontH,
      DY: W - 2 * Ts,
      DZ: Tf,
      X: Ts, Y: frontY, Z: 0,
      AX: 0, AY: 0, AZ: 0,
      material_id: fmid,
      edge_band:   ebFromSides(getEdging('db_front', r), feb),
    })

    // Back panel — front face aligns with the bottom's back edge (Z = D - DB_BACK_SETBACK)
    const backH = slide_box_height != null
      ? slide_box_height - r.DB_BACK_HEIGHT_ADJUST
      : (r.DB_BOTTOM_JOIN === 'dado' ? H - r.DB_DADO_HEIGHT - Tb : H)
    const backY = (slide_box_height != null
      ? 0
      : (r.DB_BOTTOM_JOIN === 'dado' ? r.DB_DADO_HEIGHT + Tb : 0)) + r.DB_BACK_Y_OFFSET
    const backWidthAdj = r.DB_BACK_WIDTH_ADJUST
    parts.push({
      part_type:   'db_back',
      DX: backH,
      DY: W - 2 * Ts - backWidthAdj,
      DZ: panelT,
      X: Ts + backWidthAdj / 2, Y: backY, Z: D - r.DB_BACK_SETBACK,
      AX: 0, AY: 0, AZ: 0,
      material_id: mid,
      edge_band:   ebFromSides(getEdging('db_back', r), edgeband_id),
    })
  }

  return parts
}

// Merge a Partial<DrawerBoxRules> delta on top of defaults
export function mergeDbRules(
  base: DrawerBoxRules,
  ...deltas: Partial<DrawerBoxRules>[]
): DrawerBoxRules {
  let result = { ...base }
  for (const d of deltas) {
    result = { ...result, ...d }
  }
  return result
}
