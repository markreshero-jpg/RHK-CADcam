// ============================================================
// Glass order (z_cnc_tools T3). Pure rollup over the resolved cabinets.
//
// A glass door = a front whose door profile has an op using a GLASS tool set
// (cnc_tool_sets.glass_thickness_mm set — e.g. "Glass Door"). Its sizes:
//   opening = door − the op's frame offsets (per edge, else the edge offset)
//   rebate  = opening + the ring step's OUTWARD offsets (negative = outward)
//   glass   = rebate − 2 × clearance (per side, default 1.5)
// The rebate corners are squared to the 6mm cutter's R3, so a square glass corner
// needs ≥ 0.88 clearance to clear the fillet — 1.5 does.
//
// Faced doors (z_faced_doors): a front whose blank has a bought-in facing (e.g.
// 4mm mirror) orders it here too, cut to the door's own size.
// ============================================================

import type { ResolvedCabinet } from '../resolver/types'
import { filterRemovedParts } from '../resolver/filterHidden'

export interface GlassSet {
  id: string
  name: string
  thickness: number
  clearance: number | null
  // Ring (rebate) step offsets — negative grows the rebate outward from the opening.
  ring: { top: number | null; bottom: number | null; left: number | null; right: number | null } | null
}

export interface GlassPane {
  cabinetId: string
  cabinetLabel: string
  roomId: string
  door: string                 // 'Door r1 c2'
  doorW: number; doorH: number
  openW: number; openH: number
  glassW: number; glassH: number
  thickness: number
  setName: string
  type: string                 // 'Glass', or the facing's name ('4mm Mirror')
}

export interface GlassSizeLine { type: string; glassW: number; glassH: number; thickness: number; qty: number; cabinets: string[] }

export const DEFAULT_GLASS_CLEARANCE = 1.5

const r1 = (n: number) => Math.round(n * 10) / 10

/** Every glass pane on these cabinets, one per glass front. */
export function buildGlassPanes(
  cabs: { id: string; room_id: string; label: string | null }[],
  resolved: Map<string, ResolvedCabinet>,
  sets: Map<string, GlassSet>,
): GlassPane[] {
  const out: GlassPane[] = []
  for (const cab of cabs) {
    const rp0 = resolved.get(cab.id)
    if (!rp0) continue
    const rp = filterRemovedParts(rp0)
    for (const z of rp.face_zones) {
      if (z.facet || z.AY) continue
      if (z.facing?.thickness_mm) {
        const w = r1(z.DX), h = r1(z.DY)
        out.push({
          cabinetId: cab.id, cabinetLabel: cab.label ?? '—', roomId: cab.room_id,
          door: `Door r${z.row_index + 1} c${z.col_index + 1}`,
          doorW: w, doorH: h, openW: w, openH: h, glassW: w, glassH: h,
          thickness: z.facing.thickness_mm, setName: z.facing.name, type: z.facing.name,
        })
        continue
      }
      const op = z.door_profile?.ops.find(o => o.tool_set_id && sets.has(o.tool_set_id))
      if (!op) continue
      const set = sets.get(op.tool_set_id!)!
      const edge = op.offset_from_edge_mm ?? 0
      const l = op.offset_left_mm ?? edge, r = op.offset_right_mm ?? edge
      const t = op.offset_top_mm ?? edge, b = op.offset_bottom_mm ?? edge
      const openW = z.DX - l - r, openH = z.DY - t - b
      if (!(openW > 0 && openH > 0)) continue
      const out_ = (v: number | null | undefined) => (v != null && v < 0 ? -v : 0)
      const rebW = openW + out_(set.ring?.left) + out_(set.ring?.right)
      const rebH = openH + out_(set.ring?.top) + out_(set.ring?.bottom)
      const c = set.clearance ?? DEFAULT_GLASS_CLEARANCE
      out.push({
        cabinetId: cab.id, cabinetLabel: cab.label ?? '—', roomId: cab.room_id,
        door: `Door r${z.row_index + 1} c${z.col_index + 1}`,
        doorW: r1(z.DX), doorH: r1(z.DY), openW: r1(openW), openH: r1(openH),
        glassW: r1(rebW - 2 * c), glassH: r1(rebH - 2 * c),
        thickness: set.thickness, setName: set.name, type: 'Glass',
      })
    }
  }
  return out
}

/** Panes grouped by type + glass size + thickness (the glazier's order lines), largest first. */
export function glassSizeLines(panes: GlassPane[]): GlassSizeLine[] {
  const by = new Map<string, GlassSizeLine>()
  for (const p of panes) {
    const k = `${p.type}|${p.glassW}x${p.glassH}x${p.thickness}`
    const e = by.get(k) ?? { type: p.type, glassW: p.glassW, glassH: p.glassH, thickness: p.thickness, qty: 0, cabinets: [] }
    e.qty++
    if (!e.cabinets.includes(p.cabinetLabel)) e.cabinets.push(p.cabinetLabel)
    by.set(k, e)
  }
  return [...by.values()].sort((a, b) => a.type.localeCompare(b.type) || b.glassW * b.glassH - a.glassW * a.glassH || a.thickness - b.thickness)
}
