// ============================================================
// Drawer Box Resolver
// Computes 5-piece drawer box geometry from opening dimensions
// and a drawer box construction method.
//
// Coordinate convention (matches cabinet resolver):
//   DX = dimension in depth direction (cabinet Z)
//   DY = dimension in width direction (cabinet X) or height for vertical panels
//   DZ = material thickness
//   X, Y, Z = position of the part's back-bottom-left corner
//
// Origin for a standalone drawer box preview: X=Y=Z=0
// In cabinet space, caller offsets by (idX, yStart, SCRBK+T).
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
  const { box_width: W, box_height: H, box_depth: D, material, edgeband_id, bottom_material, bottom_edgeband_id, rules: r } = input
  const Ts   = r.DB_SIDE_T
  const Tb   = r.DB_BOTTOM_T
  const mid  = material.id
  const bmid = bottom_material?.id ?? mid

  const parts: ResolvedDrawerBoxPart[] = []

  // ── Left Side (DX=depth, DY=height, DZ=Ts) ───────────────────
  parts.push({
    part_type:   'db_left_side',
    DX: D, DY: H, DZ: Ts,
    X: 0, Y: 0, Z: 0,
    AX: 0, AY: 0, AZ: 0,
    material_id: mid,
    edge_band:   ebFromSides(getEdging('db_left_side', r), edgeband_id),
  })

  // ── Right Side ────────────────────────────────────────────────
  parts.push({
    part_type:   'db_right_side',
    DX: D, DY: H, DZ: Ts,
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
    // Front panel (vertical, DX=height, DY=width-between-sides, DZ=Ts in depth direction)
    // Sits at the front face of the box: Z = D - Ts
    const frontH = r.DB_BOTTOM_JOIN === 'dado' ? H - r.DB_DADO_HEIGHT : H
    const frontY = r.DB_BOTTOM_JOIN === 'dado' ? r.DB_DADO_HEIGHT       : 0
    parts.push({
      part_type:   'db_front',
      DX: frontH,
      DY: W - 2 * Ts,
      DZ: Ts,
      X: Ts, Y: frontY, Z: D - Ts,
      AX: 0, AY: 0, AZ: 0,
      material_id: mid,
      edge_band:   ebFromSides(getEdging('db_front', r), edgeband_id),
    })

    // Back panel — shorter so bottom can slide in
    const backH = r.DB_BOTTOM_JOIN === 'dado' ? H - r.DB_DADO_HEIGHT - Tb : H
    const backY = r.DB_BOTTOM_JOIN === 'dado' ? r.DB_DADO_HEIGHT + Tb       : 0
    parts.push({
      part_type:   'db_back',
      DX: backH,
      DY: W - 2 * Ts,
      DZ: Ts,
      X: Ts, Y: backY, Z: 0,
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
