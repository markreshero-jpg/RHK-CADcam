// CAD blocks + live fields (z_CAD_tool/ANNOTATION-SPEC.md, phase C). Pure — the
// canvas, the CAD panel and the reports share it.
//
// A block is a saved group of annotations stored in PAPER mm from the group's
// top-left, so it drops in at any annotation scale. Text may hold `{field}`
// tokens that are filled from the job / room when drawn.

import type { AnnotationKind, RoomAnnotation } from '../types'
import type { AnnotationStyle } from './style'
import { resolveStyle } from './style'
import {
  type Pt, type AnnotationGeom, type TextGeom, type LineGeom, type BoxGeom, type DimGeom,
  type ArcGeom, type CircleGeom, type SpecialDim, type Box,
  isSpecialDim, annotationFramePoints, boundsOf, boxesOverlap,
} from './geometry'

export interface CadBlockItem {
  kind:  AnnotationKind
  geom:  AnnotationGeom
  text:  string | null
  style: AnnotationStyle
}

export interface CadBlock {
  id:          string
  name:        string
  description: string | null
  items:       CadBlockItem[]
  sort_order:  number
}

/** Map every point of a geometry through `f`; lengths in frame mm (radii, dim
 *  offsets) scale by `s`. Text sizes / box widths are paper mm and don't change. */
export function mapGeom(kind: AnnotationKind, geom: AnnotationGeom, f: (p: Pt) => Pt, s: number): AnnotationGeom {
  switch (kind) {
    case 'text':    { const g = geom as TextGeom; return { ...g, at: f(g.at), leader: g.leader?.map(f) } }
    case 'line':
    case 'cloud':   { const g = geom as LineGeom; return { ...g, pts: (g.pts ?? []).map(f) } }
    case 'rect':
    case 'ellipse': { const g = geom as BoxGeom; return { ...g, a: f(g.a), b: f(g.b) } }
    case 'dim': {
      if (isSpecialDim(geom)) {
        const g = geom as SpecialDim
        if (g.dt === 'angular') return { ...g, c: f(g.c), a: f(g.a), b: f(g.b), at: f(g.at) }
        if (g.dt === 'arclen') return { ...g, c: f(g.c), r: g.r * s, off: g.off * s }
        return { ...g, c: f(g.c), r: g.r * s, at: f(g.at) }
      }
      const g = geom as DimGeom; return { ...g, p1: f(g.p1), p2: f(g.p2), offset: g.offset * s }
    }
    case 'arc':     { const g = geom as ArcGeom; return { ...g, c: f(g.c), r: g.r * s } }
    case 'circle':  { const g = geom as CircleGeom; return { ...g, c: f(g.c), r: g.r * s } }
  }
}

/** Frame-mm bounds of some annotations; `k` = frame mm per paper mm. */
export function annotationsBounds(xs: Pick<RoomAnnotation, 'kind' | 'geom' | 'text' | 'style'>[], k: number): Box | null {
  return boundsOf(xs.flatMap(a => annotationFramePoints(a.kind, a.geom, a.text, resolveStyle(a.kind, a.style).size, k)))
}

/** Selected annotations → block items (paper mm from the selection's top-left). */
export function toBlockItems(xs: RoomAnnotation[], k: number): CadBlockItem[] {
  const b = annotationsBounds(xs, k)
  if (!b) return []
  const f = (p: Pt): Pt => ({ x: (p.x - b.minX) / k, y: (p.y - b.minY) / k })
  return [...xs].sort((x, y) => x.sort_order - y.sort_order)
    .map(a => ({ kind: a.kind, geom: mapGeom(a.kind, a.geom, f, 1 / k), text: a.text, style: a.style }))
}

/** Block items → frame geometry with the block's top-left at `at`. */
export function placeBlockItems(items: CadBlockItem[], at: Pt, k: number): CadBlockItem[] {
  const f = (p: Pt): Pt => ({ x: at.x + p.x * k, y: at.y + p.y * k })
  return items.map(it => ({ ...it, geom: mapGeom(it.kind, it.geom, f, k) }))
}

/**
 * Where a block drops in (spec default): its top-left `gap` frame mm right of
 * `wallBox` (the walls' outer extents) at the walls' top, moved down below any
 * existing note it would overlap.
 */
export function blockInsertPoint(items: CadBlockItem[], wallBox: Box, existing: Box[], k: number, gap = 25 * k): Pt {
  const at = { x: wallBox.maxX + gap, y: wallBox.minY }
  const size = annotationsBounds(placeBlockItems(items, { x: 0, y: 0 }, k), k)
  const w = size ? size.maxX : 0, h = size ? size.maxY : 0
  for (let guard = 0; guard < 200; guard++) {
    const box = { minX: at.x, minY: at.y, maxX: at.x + w, maxY: at.y + h }
    const hit = existing.filter(e => boxesOverlap(e, box))
    if (!hit.length) break
    at.y = Math.max(...hit.map(e => e.maxY)) + 5 * k
  }
  return at
}

// ── Live fields ────────────────────────────────────────────────────────────

export const CAD_FIELDS: { key: string; label: string }[] = [
  { key: 'job',        label: 'Job no. + client' },
  { key: 'job_number', label: 'Job no.' },
  { key: 'client',     label: 'Client' },
  { key: 'room',       label: 'Room name' },
  { key: 'date',       label: 'Today’s date' },
  { key: 'benchtop',   label: 'Benchtop material' },
  { key: 'fronts',     label: 'Door style + colour' },
  { key: 'panels',     label: 'Panels (exposed board)' },
  { key: 'handles',    label: 'Handles' },
  { key: 'carcass',    label: 'Carcass material' },
  { key: 'drawer_box', label: 'Drawer box' },
  { key: 'runners',    label: 'Runners + lengths' },
  { key: 'hinges',     label: 'Hinges' },
  { key: 'basins',     label: 'Basins / sinks' },
]

export type CadFieldValues = Record<string, string>

const TOKEN = /\{([a-z_]+)\}/g

/** Replace `{field}` tokens with their values; unknown tokens stay as typed, a
 *  known field with no value shows "-". */
export function fillFields(text: string | null, values: CadFieldValues | null | undefined): string | null {
  if (text == null || !values || !text.includes('{')) return text
  return text.replace(TOKEN, (m, key: string) =>
    key in values ? (values[key]?.trim() || '-') : CAD_FIELDS.some(f => f.key === key) ? '-' : m)
}

/** The annotations with their text fields filled (for drawing / printing). */
export function withFieldsFilled<T extends Pick<RoomAnnotation, 'text'>>(xs: T[], values: CadFieldValues | null | undefined): T[] {
  if (!values) return xs
  return xs.map(a => {
    const text = fillFields(a.text, values)
    return text === a.text ? a : { ...a, text }
  })
}
