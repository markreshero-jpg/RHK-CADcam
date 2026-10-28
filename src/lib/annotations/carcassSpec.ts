// {carcass} spec-block field (z_CAD_tool, Mark 2026-10-28): the cabinet BOXES
// only — gables, tops, bottoms, backs, rails. End panels, fillers, applied
// panels, bulkheads, floating shelves and shelves are not carcass.
//
//   Internal: <the room's usual box board> (BC-03, WC-02: <other board>)
//   External: <exposed board> (BC-07)          ← only when a box is built in it
//
// Internal = each cabinet's box board (the most-used board on its carcass
// parts). The usual board comes from cabinets with no material overrides of
// their own (the job / room colour), falling back to the most common; a cabinet
// on a different board is named as an exception. External = a box in the
// exposed colour: an exposed-interior cabinet, or a carcass part on a board
// other than its cabinet's box board (a finished gable).

import type { ResolvedCabinet } from '../resolver/types'

export interface CarcassSpecCab {
  id: string
  label?: string | null
  exposed_interior?: boolean | null
  material_overrides?: Record<string, unknown> | null
}

const BOX_KEYS = new Set(['left_side', 'right_side', 'bottom', 'full_top', 'back', 'front_rail', 'back_rail'])
/** A carcass (box) part — plain box keys, a shaped cabinet's side:/back:/rail:, a height-split piece of one. */
export function isCarcassPartKey(k: string): boolean {
  const base = k.startsWith('split:') ? k.split(':')[1] : k
  return BOX_KEYS.has(base) || /^(side|back|rail):/.test(base)
}

const most = (xs: string[]) => {
  const n = new Map<string, number>()
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}
// BC-2 before BC-10.
const byLabel = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

export function carcassSpec(
  cabinets: CarcassSpecCab[],
  resolved: Map<string, ResolvedCabinet>,
  name: (materialId: string) => string | null,
): { internal: string; external: string; text: string } {
  const boxOf = new Map<string, { label: string; board: string; plain: boolean }>()
  const external = new Map<string, Set<string>>()     // board → cabinet labels
  const addExt = (board: string, label: string) => {
    if (!external.has(board)) external.set(board, new Set())
    external.get(board)!.add(label)
  }
  for (const cab of cabinets) {
    const r = resolved.get(cab.id)
    const mats = (r?.case_parts ?? []).filter(p => isCarcassPartKey(String(p.part_key)) && p.material_id).map(p => p.material_id)
    if (!mats.length) continue
    const label = cab.label ?? '?'
    const board = most(mats)!
    if (cab.exposed_interior) { addExt(board, label); continue }
    boxOf.set(cab.id, { label, board, plain: !cab.material_overrides || Object.keys(cab.material_overrides).length === 0 })
    for (const m of new Set(mats)) if (m !== board) addExt(m, label)
  }
  const boxes = [...boxOf.values()]
  const usual = most(boxes.filter(b => b.plain).map(b => b.board)) ?? most(boxes.map(b => b.board))
  const nm = (id: string) => name(id) ?? 'Unknown board'
  const groups = (m: Map<string, Set<string>>) => [...m].map(([board, labels]) => ({ board, labels: [...labels].sort(byLabel) }))

  const odd = new Map<string, Set<string>>()
  for (const b of boxes) if (b.board !== usual) {
    if (!odd.has(b.board)) odd.set(b.board, new Set())
    odd.get(b.board)!.add(b.label)
  }
  const internal = usual
    ? nm(usual) + (odd.size ? ` (${groups(odd).map(g => `${g.labels.join(', ')}: ${nm(g.board)}`).join('; ')})` : '')
    : ''
  const ext = groups(external).map(g => `${nm(g.board)} (${g.labels.join(', ')})`).join('; ')
  const text = [internal && `Internal: ${internal}`, ext && `External: ${ext}`].filter(Boolean).join('\n')
  return { internal, external: ext, text }
}
