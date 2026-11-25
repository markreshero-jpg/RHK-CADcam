// ============================================================
// Front inserts (z_faced_doors F9) — the bought-in pieces a front carries:
//   • the insert in a door's opening (mirror / glass … picked on the door profile
//     operation or the door's own Face Grid override), sitting in the rebate
//     routed from the back;
//   • a faced door's facing (z_faced_doors F1), stuck on the whole face.
// One pure list per front, used by every view (clickable part), the cabinet
// parts list and the Glass Order — so there is one set of numbers.
// Never cut from the board: these parts do not go to the optimiser.
// ============================================================

import type { ResolvedFaceZone } from './resolver/types'
import { doorPaneRects } from './doorProfile'
import { zoneKey } from './cabinetShape/partKeys'

export interface FrontInsert {
  id: string                      // part id, `hw_insert_<zone>_<n>` (hardware: no Part Editor / delete)
  row_index: number; col_index: number
  name: string                    // '4mm Mirror'
  kind: 'mirror' | 'glass' | 'other'
  source: 'profile' | 'facing'
  w: number; h: number; thickness: number   // the piece to order
  // false = the front was resolved before the rebate was carried on the profile:
  // w × h is only the opening, save the cabinet to get the order size.
  sized: boolean
  // Box in the front's own frame: x across from its left edge, y up from its
  // bottom, z out from its BACK face (so z + thickness ≤ rebate depth).
  lx: number; ly: number; lz: number
  opening?: { x: number; y: number; w: number; h: number }
  rebate?:  { w: number; h: number; depth: number }
}

const r1 = (n: number) => Math.round(n * 10) / 10

export function frontInserts(z: ResolvedFaceZone): FrontInsert[] {
  if (z.face_type === 'open') return []
  const out: FrontInsert[] = []
  const base = `hw_insert_${zoneKey(z)}`
  const ref = { row_index: z.row_index, col_index: z.col_index }
  if (z.door_profile) {
    doorPaneRects(z.door_profile, { w: z.DX, h: z.DY }).forEach((p, i) => {
      const g = p.glass ?? p
      const dep = p.rebate ? Math.min(p.rebate.depth, z.DZ) : 0
      out.push({
        id: `${base}_${i}`, ...ref, name: p.type, kind: p.kind, source: 'profile',
        w: r1(g.w), h: r1(g.h), thickness: p.thickness_mm, sized: !!p.glass,
        lx: g.x, ly: g.y, lz: Math.max(dep - p.thickness_mm, 0),
        opening: { x: p.x, y: p.y, w: r1(p.w), h: r1(p.h) },
        ...(p.rebate ? { rebate: { w: r1(p.rebate.w), h: r1(p.rebate.h), depth: p.rebate.depth } } : {}),
      })
    })
  }
  if (z.facing?.thickness_mm) {
    out.push({
      id: `${base}_f`, ...ref, name: z.facing.name, kind: /mirror/i.test(z.facing.name) ? 'mirror' : 'other', source: 'facing',
      w: r1(z.DX), h: r1(z.DY), thickness: z.facing.thickness_mm, sized: true,
      lx: 0, ly: 0, lz: z.DZ,
    })
  }
  return out
}

/** One line for info panels / lists: order size, then where it sits. */
export function insertDetail(ins: FrontInsert): string {
  const parts = [ins.sized ? `Order ${ins.w} × ${ins.h} × ${ins.thickness}` : 'Save the cabinet for the order size']
  if (ins.source === 'facing') parts.push('stuck on the door face')
  else {
    if (ins.opening) parts.push(`opening ${ins.opening.w} × ${ins.opening.h}`)
    if (ins.rebate) parts.push(`rebate ${ins.rebate.w} × ${ins.rebate.h} × ${ins.rebate.depth} deep, from the back`)
  }
  return parts.join(' · ')
}
