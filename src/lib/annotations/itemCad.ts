// Item CAD (z_item_cad/ITEM-CAD-SPEC.md): CAD notes owned by a library item — a front
// type (e.g. every bin front), a cabinet code, later a fixture model. Pure — the
// Cabinet Edit modal, the elevation canvas and the prints share it.
//
// An item's notes are CAD block items (blocks.ts) plus an anchor: one of 9 points of
// the box they're attached to (the front, or the cabinet's front). Geometry is PAPER
// mm from that point, so the notes stay the same size (decision 2) and keep their
// place on the item as it resizes.

import type { RoomAnnotation } from '../types'
import type { CadBlockItem } from './blocks'
import { mapGeom, annotationsBounds } from './blocks'
import type { Pt, Box } from './geometry'
import type { SheetView } from './owner'

export type ItemCadAnchor = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br'
export type ItemCadOwnerKind = 'front_type' | 'cabinet_def' | 'fixture_model'
export type ItemCadView = 'elevation' | 'plan' | 'side'

/** The Cabinet Edit modal tab a library view is drawn on (IC3a): front = elevation,
 *  top = plan, side = side. */
export const sheetItemCadView = (s: SheetView): ItemCadView => s === 'front' ? 'elevation' : s === 'top' ? 'plan' : 'side'
export const itemCadViewSheet = (v: ItemCadView): SheetView => v === 'elevation' ? 'front' : v === 'plan' ? 'top' : 'side'

export interface ItemCadItem extends CadBlockItem { anchor: ItemCadAnchor }

export interface LibraryCad {
  id:         string
  owner_kind: ItemCadOwnerKind
  owner_key:  string
  view:       ItemCadView
  items:      ItemCadItem[]
  version:    number
  created_at: string
}

/** A job's pinned copy of a library_cad row (decision 4). */
export interface JobItemCad {
  id:             string
  project_id:     string
  library_cad_id: string
  version:        number
  items:          ItemCadItem[]
}

/** One place on a cabinet item CAD can attach to, in the drawing's frame (y down). */
export interface ItemCadTarget {
  kind:  ItemCadOwnerKind
  key:   string
  label: string
  box:   Box
  /** Bin products on this target (a bin front: its bin; the cabinet: all its bins). */
  binIds?: string[]
}

// ── Item fields (IC2) ────────────────────────────────────────────────────────
// Filled per item: a note on a bin front reads that front's bin. Room / job fields
// (blocks.ts CAD_FIELDS) work in item CAD too.

export const ITEM_CAD_FIELDS: { key: string; label: string }[] = [
  { key: 'bin',   label: 'Bin on this front' },
  { key: 'code',  label: 'Cabinet code' },
  { key: 'label', label: 'Cabinet label' },
  { key: 'w',     label: 'Width' },
  { key: 'h',     label: 'Height' },
  { key: 'd',     label: 'Depth' },
]

/** A bin product's display name: brand + name, unless the name already starts with it. */
export function binProductName(name: string | null | undefined, brand: string | null | undefined): string {
  const n = (name ?? '').trim(), b = (brand ?? '').trim()
  return b && !n.toLowerCase().startsWith(b.toLowerCase()) ? `${b} ${n}` : n
}

/** Item field values for one cabinet (and one of its targets). `bins` = product names,
 *  repeats shown "2 x …" like the room's {bins}. */
export function itemFieldValues(o: { code?: string | null; label?: string | null; w: number; h: number; d: number; bins: string[] }): Record<string, string> {
  const count = new Map<string, number>()
  for (const b of o.bins) count.set(b, (count.get(b) ?? 0) + 1)
  return {
    bin:   [...count].map(([n, c]) => (c > 1 ? `${c} x ${n}` : n)).join('\n'),
    code:  o.code ?? '',
    label: o.label ?? '',
    w: String(Math.round(o.w)), h: String(Math.round(o.h)), d: String(Math.round(o.d)),
  }
}

export const FRONT_TYPE_LABELS: Record<string, string> = { bin: 'Bin front' }

export const ownerId = (kind: ItemCadOwnerKind, key: string) => `${kind}:${key}`

const ANCHORS: ItemCadAnchor[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br']

/** The anchor's point on a frame box (y down: t = minY). */
export function anchorPoint(b: Box, a: ItemCadAnchor): Pt {
  const x = a[1] === 'l' ? b.minX : a[1] === 'r' ? b.maxX : (b.minX + b.maxX) / 2
  const y = a[0] === 't' ? b.minY : a[0] === 'b' ? b.maxY : (b.minY + b.maxY) / 2
  return { x, y }
}

/** The anchor nearest a point. */
export function nearestAnchor(b: Box, p: Pt): ItemCadAnchor {
  let best: ItemCadAnchor = 'mc', bd = Infinity
  for (const a of ANCHORS) {
    const q = anchorPoint(b, a), d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2
    if (d < bd) { bd = d; best = a }
  }
  return best
}

const boxCentre = (b: Box): Pt => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 })

/** Drawn notes → item CAD items on `box`: each note anchors to the point nearest its own
 *  centre. `k` = frame mm per paper mm. */
export function toItemCadItems(xs: RoomAnnotation[], box: Box, k: number): ItemCadItem[] {
  return [...xs].sort((a, b) => a.sort_order - b.sort_order).map(a => {
    const nb = annotationsBounds([a], k)
    const anchor = nearestAnchor(box, nb ? boxCentre(nb) : boxCentre(box))
    const A = anchorPoint(box, anchor)
    return {
      kind: a.kind, text: a.text, style: a.style, anchor,
      geom: mapGeom(a.kind, a.geom, p => ({ x: (p.x - A.x) / k, y: (p.y - A.y) / k }), 1 / k),
    }
  })
}

/** Item CAD items → frame geometry on `box`. */
export function placeItemCad(items: ItemCadItem[], box: Box, k: number): CadBlockItem[] {
  return items.map(it => {
    const A = anchorPoint(box, it.anchor)
    return { kind: it.kind, text: it.text, style: it.style, geom: mapGeom(it.kind, it.geom, p => ({ x: A.x + p.x * k, y: A.y + p.y * k }), k) }
  })
}

/** Placed items as read-only annotation rows for AnnotationLayer (ids `prefix:i`). */
export function asAnnotationRows(items: CadBlockItem[], prefix: string, roomId: string, sheet: SheetView = 'front'): RoomAnnotation[] {
  return items.map((it, i) => ({
    id: `${prefix}:${i}`, room_id: roomId, view: 'cabinet_sheet', wall_id: null, cabinet_id: null, sheet_view: sheet,
    wall_side: null, kind: it.kind, geom: it.geom, text: it.text, style: it.style, sort_order: i,
    created_at: '', updated_at: '',
  }))
}

/** Which item CAD a job draws for an owner + view: its pinned copy, else (no job — a
 *  room outside a project) the library's current version. */
export function itemsForOwner(lib: LibraryCad[], job: JobItemCad[] | null, kind: ItemCadOwnerKind, key: string, view: ItemCadView): ItemCadItem[] {
  const row = lib.find(l => l.owner_kind === kind && l.owner_key === key && l.view === view)
  if (!row) return []
  if (!job) return row.items
  return job.find(j => j.library_cad_id === row.id)?.items ?? []
}

/** Library rows the job uses (an owner it draws) that it has no copy of yet, and that
 *  were in the library when the job started (`jobStart`): item CAD added later never
 *  appears in an existing job by itself (decision 4) — Update job brings it in. */
export function missingJobCopies(lib: LibraryCad[], job: JobItemCad[], used: ReadonlySet<string>, jobStart?: string | null): LibraryCad[] {
  const have = new Set(job.map(j => j.library_cad_id))
  const start = jobStart ? Date.parse(jobStart) : Infinity
  return lib.filter(l => !have.has(l.id) && l.items.length > 0 && used.has(ownerId(l.owner_kind, l.owner_key))
    && !(Date.parse(l.created_at) > start))
}
