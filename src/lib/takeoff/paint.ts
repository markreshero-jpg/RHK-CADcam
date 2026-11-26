// ============================================================
// Paint Shop Sheet (z_paint_shop). Pure rollup over the resolved cabinets.
//
// A painted part = one on a Satin Board board or one of its colours (only
// Satin Board goes to the paint shop). Its colour:
//   fronts  → the Colour Ranges colour the front resolved to (face_zones
//             .door_colour_id: zone > room class > job class > style default)
//   others  → the cabinet's first painted front's colour (2pac over 2pac), else
//             the room / job colour for the cabinet's class.
// Fronts saved before door_colour_id existed fall back to the room / job colour
// until the cabinet is re-resolved.
//
// Paint area (Mark 2026-11-26): one face + every edge. Each edge counts as a
// PAINT_EDGE_M wide strip (0.1 m, whatever the board thickness), so a part's
// edge area = its perimeter (m) × 0.1.
// ============================================================

import type { CabinetInstance, Room, Project } from '../types'
import type { ResolvedCabinet } from '../resolver/types'
import { filterRemovedParts } from '../resolver/filterHidden'

export interface PaintColour { id: string; name: string; code: string | null; brand: string | null; finish: string | null; range: string | null }

export interface PaintPart {
  roomId: string
  cabinetLabel: string
  part: string
  height: number      // DY (along the grain / up)
  width: number       // DX
  thickness: number
  colourId: string | null   // null = colour not chosen
  front: boolean
}

/** Paint allowance per edge, metres wide (an 18 mm edge is painted as 0.1 m). */
export const PAINT_EDGE_M = 0.1

export interface PaintLine {
  part: string; height: number; width: number; thickness: number
  qty: number; cabinets: string[]
  /** One face. */
  faceM2: number
  /** All 4 edges at PAINT_EDGE_M wide. */
  edgeM2: number
  /** faceM2 + edgeM2. */
  m2: number
}

export interface PaintColourGroup {
  colourId: string | null
  colour: PaintColour | null
  lines: PaintLine[]
  qty: number
  faceM2: number
  edgeM2: number
  m2: number
}

/** "Brand Name Code" for a paint colour, brand left off when the name starts with it. */
export function paintColourLabel(c: PaintColour | null): string {
  if (!c) return 'COLOUR NOT CHOSEN'
  return [c.brand && !c.name.toLowerCase().startsWith(c.brand.toLowerCase()) ? c.brand : null, c.name, c.code].filter(Boolean).join(' ')
}

const FACE: Record<string, string> = { door: 'Door', drawer_face: 'Drawer Front', false_panel: 'False Panel' }
const CASE: Record<string, string> = { left_side: 'End Panel L', right_side: 'End Panel R', bottom: 'Bottom', back: 'Back', full_top: 'Top', front_rail: 'Front Rail', back_rail: 'Back Rail' }
const TK: Record<string, string> = { kick_front_face: 'Kick', kick_return: 'Kick Return', kick_sub_front: 'Sub Front', kick_back: 'Kick Back' }
const INT: Record<string, string> = { adj_shelf: 'Adj Shelf', fixed_shelf: 'Fixed Shelf' }

const r1 = (n: number) => Math.round(n * 10) / 10

type ClassKey = 'base' | 'wall' | 'tall'
/** Room colour for a class, else the job's. */
export function classColour(cls: string | null | undefined, room: Partial<Room> | undefined, project: Partial<Project> | null): string | null {
  const k = (cls === 'wall' || cls === 'tall' ? cls : 'base') as ClassKey
  const key = `${k}_door_colour_id` as const
  return (room?.[key] as string | null | undefined) ?? (project?.[key] as string | null | undefined) ?? null
}

/** Every painted part on these cabinets, with its paint colour. */
export function buildPaintParts(
  cabs: Pick<CabinetInstance, 'id' | 'room_id' | 'label' | 'assembly_class'>[],
  resolved: Map<string, ResolvedCabinet>,
  isPainted: (materialId: string | null | undefined) => boolean,
  rooms: Map<string, Partial<Room>>,
  project: Partial<Project> | null,
): PaintPart[] {
  const out: PaintPart[] = []
  for (const cab of cabs) {
    const rp0 = resolved.get(cab.id)
    if (!rp0) continue
    const rp = filterRemovedParts(rp0)
    const room = rooms.get(cab.room_id)
    const fallback = classColour(cab.assembly_class, room, project)
    const label = cab.label ?? '—'
    const fronts = rp.face_zones.filter(z => z.face_type !== 'open' && isPainted(z.material_id))
    const cabColour = fronts.find(z => z.door_colour_id)?.door_colour_id ?? fallback
    const push = (part: string, DX: number, DY: number, DZ: number, colourId: string | null, front = false) =>
      out.push({ roomId: cab.room_id, cabinetLabel: label, part, height: r1(DY), width: r1(DX), thickness: r1(DZ), colourId, front })

    for (const z of fronts) push(FACE[z.face_type] ?? z.face_type, z.DX, z.DY, z.DZ, z.door_colour_id ?? fallback, true)
    for (const p of rp.case_parts) if (isPainted(p.material_id)) push(CASE[p.part_key] ?? p.part_key, p.DX, p.DY, p.DZ, cabColour)
    for (const p of rp.toekick_parts) if (isPainted(p.material_id)) push(TK[p.part_key] ?? p.part_key, p.DX, p.DY, p.DZ, cabColour)
    for (const p of rp.internal_parts) if (isPainted(p.material_id)) push(INT[p.part_type] ?? p.part_type, p.DX, p.DY, p.DZ, cabColour)
    for (const p of rp.custom_parts ?? []) if (isPainted(p.material_id)) push(p.name || 'Panel', Number(p.dx), Number(p.dy), Number(p.dz), cabColour)
  }
  return out
}

/** Group by colour, then same part + size into lines with a qty. Area = one face + edges. */
export function paintColourGroups(parts: PaintPart[], colours: Map<string, PaintColour>): PaintColourGroup[] {
  const groups = new Map<string, PaintColourGroup>()
  for (const p of parts) {
    const gk = p.colourId ?? ''
    let g = groups.get(gk)
    if (!g) { g = { colourId: p.colourId, colour: p.colourId ? colours.get(p.colourId) ?? null : null, lines: [], qty: 0, faceM2: 0, edgeM2: 0, m2: 0 }; groups.set(gk, g) }
    let l = g.lines.find(x => x.part === p.part && x.height === p.height && x.width === p.width && x.thickness === p.thickness)
    if (!l) { l = { part: p.part, height: p.height, width: p.width, thickness: p.thickness, qty: 0, cabinets: [], faceM2: 0, edgeM2: 0, m2: 0 }; g.lines.push(l) }
    l.qty++
    if (!l.cabinets.includes(p.cabinetLabel)) l.cabinets.push(p.cabinetLabel)
    const face = (p.height * p.width) / 1e6
    const edge = (2 * (p.height + p.width) / 1000) * PAINT_EDGE_M
    l.faceM2 += face; l.edgeM2 += edge; l.m2 += face + edge
    g.faceM2 += face; g.edgeM2 += edge; g.m2 += face + edge; g.qty++
  }
  for (const g of groups.values()) g.lines.sort((a, b) => a.part.localeCompare(b.part) || b.height - a.height || b.width - a.width)
  // Chosen colours by name, "colour not chosen" last.
  return [...groups.values()].sort((a, b) => (a.colour ? 0 : 1) - (b.colour ? 0 : 1) || (a.colour?.name ?? '').localeCompare(b.colour?.name ?? ''))
}

/** Add colour groups from several rooms into job totals, one per colour (lines dropped). */
export function sumPaintGroups(lists: PaintColourGroup[][]): PaintColourGroup[] {
  const by = new Map<string, PaintColourGroup>()
  for (const g of lists.flat()) {
    const k = g.colourId ?? ''
    const e = by.get(k)
    if (!e) { by.set(k, { ...g, lines: [] }); continue }
    e.qty += g.qty; e.faceM2 += g.faceM2; e.edgeM2 += g.edgeM2; e.m2 += g.m2
  }
  return [...by.values()].sort((a, b) => (a.colour ? 0 : 1) - (b.colour ? 0 : 1) || (a.colour?.name ?? '').localeCompare(b.colour?.name ?? ''))
}
