// ============================================================
// Paint Shop Sheet (z_paint_shop). Pure rollup over the resolved cabinets.
//
// A painted part = one whose board is flagged materials.is_painted (or whose
// board's parent is) — Satin Board today. Its colour:
//   fronts  → the Colour Ranges colour the front resolved to (face_zones
//             .door_colour_id: zone > room class > job class > style default)
//   others  → the cabinet's first painted front's colour (2pac over 2pac), else
//             the room / job colour for the cabinet's class.
// Fronts saved before door_colour_id existed fall back to the room / job colour
// until the cabinet is re-resolved.
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

export interface PaintLine {
  part: string; height: number; width: number; thickness: number
  qty: number; cabinets: string[]; m2: number
}

export interface PaintColourGroup {
  colourId: string | null
  colour: PaintColour | null
  lines: PaintLine[]
  qty: number
  m2: number
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

/** Group by colour, then same part + size into lines with a qty. Area = one face. */
export function paintColourGroups(parts: PaintPart[], colours: Map<string, PaintColour>): PaintColourGroup[] {
  const groups = new Map<string, PaintColourGroup>()
  for (const p of parts) {
    const gk = p.colourId ?? ''
    let g = groups.get(gk)
    if (!g) { g = { colourId: p.colourId, colour: p.colourId ? colours.get(p.colourId) ?? null : null, lines: [], qty: 0, m2: 0 }; groups.set(gk, g) }
    let l = g.lines.find(x => x.part === p.part && x.height === p.height && x.width === p.width && x.thickness === p.thickness)
    if (!l) { l = { part: p.part, height: p.height, width: p.width, thickness: p.thickness, qty: 0, cabinets: [], m2: 0 }; g.lines.push(l) }
    l.qty++
    if (!l.cabinets.includes(p.cabinetLabel)) l.cabinets.push(p.cabinetLabel)
    const a = (p.height * p.width) / 1e6
    l.m2 += a; g.m2 += a; g.qty++
  }
  for (const g of groups.values()) g.lines.sort((a, b) => a.part.localeCompare(b.part) || b.height - a.height || b.width - a.width)
  // Chosen colours by name, "colour not chosen" last.
  return [...groups.values()].sort((a, b) => (a.colour ? 0 : 1) - (b.colour ? 0 : 1) || (a.colour?.name ?? '').localeCompare(b.colour?.name ?? ''))
}
