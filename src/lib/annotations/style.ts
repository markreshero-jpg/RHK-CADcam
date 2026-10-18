// CAD annotation styles (z_CAD_tool/ANNOTATION-SPEC.md, decisions 6–8).
// Every size here is PAPER mm — the renderer multiplies by "drawing units per paper
// mm" so 3.5mm text prints 3.5mm tall at any scale. Stored rows keep only what the
// user changed; resolveStyle fills the rest.

import type { AnnotationKind } from '../types'

export type ArrowType =
  | 'none' | 'closed' | 'closed_open' | 'open' | 'dot' | 'dot_open' | 'tick' | 'square'
export type DashType = 'solid' | 'dashed' | 'dotted' | 'dashdot'
export type TextAlign = 'left' | 'center' | 'right'

export interface AnnotationStyle {
  color?:        string
  // text
  size?:         number
  bold?:         boolean
  italic?:       boolean
  underline?:    boolean
  align?:        TextAlign
  lineSpacing?:  number            // × text size
  bg?:           'none' | 'mask' | 'solid'
  bgColor?:      string
  bgPad?:        number
  border?:       'none' | 'box' | 'round'
  borderColor?:  string
  borderWeight?: number
  borderDash?:   DashType
  // lines / shapes
  weight?:       number
  dash?:         DashType
  fill?:         'none' | 'solid' | 'tint'
  fillColor?:    string
  fillOpacity?:  number
  arrowStart?:   ArrowType
  arrowEnd?:     ArrowType
  arrowSize?:    number
}

export type ResolvedStyle = Required<AnnotationStyle>

export const ARROW_TYPES: { id: ArrowType; label: string }[] = [
  { id: 'none',        label: 'None' },
  { id: 'closed',      label: 'Closed filled' },
  { id: 'closed_open', label: 'Closed open' },
  { id: 'open',        label: 'Open' },
  { id: 'dot',         label: 'Dot' },
  { id: 'dot_open',    label: 'Open dot' },
  { id: 'tick',        label: 'Tick' },
  { id: 'square',      label: 'Square' },
]

export const TEXT_SIZES = [2.5, 3.5, 5, 7] as const

export const ANNOT_INK = '#111111'

const BASE: ResolvedStyle = {
  color: '#dc2626',
  size: 3.5, bold: false, italic: false, underline: false, align: 'left', lineSpacing: 1.3,
  bg: 'none', bgColor: '#ffffff', bgPad: 1,
  border: 'none', borderColor: '#dc2626', borderWeight: 0.25, borderDash: 'solid',
  weight: 0.35, dash: 'solid',
  fill: 'none', fillColor: '#dc2626', fillOpacity: 0.15,
  arrowStart: 'none', arrowEnd: 'none', arrowSize: 2.5,
}

/** Per-kind differences from BASE. */
const KIND_DEFAULTS: Record<AnnotationKind, AnnotationStyle> = {
  text:    { arrowStart: 'closed' },   // leader tip
  line:    {},
  rect:    {},
  ellipse: {},
  cloud:   {},
  dim:     { arrowStart: 'tick', arrowEnd: 'tick', size: 2.5, weight: 0.25 },
}

export function styleDefaults(kind: AnnotationKind): ResolvedStyle {
  return { ...BASE, ...KIND_DEFAULTS[kind] }
}

export function resolveStyle(kind: AnnotationKind, style: AnnotationStyle | null | undefined): ResolvedStyle {
  const out = styleDefaults(kind)
  for (const [k, v] of Object.entries(style ?? {})) if (v != null) (out as unknown as Record<string, unknown>)[k] = v
  return out
}

/** Print with colours off (decision 6): everything ink, coloured backgrounds go white,
 *  fills drop out. The canvas always passes print=false. */
export function printStyle(s: ResolvedStyle, printColours: boolean): ResolvedStyle {
  if (printColours) return s
  return {
    ...s,
    color: ANNOT_INK, borderColor: ANNOT_INK,
    bgColor: '#ffffff',
    fill: 'none',
  }
}

/** SVG dash array in paper mm (caller scales). Empty = solid. */
export function dashPattern(d: DashType, weight: number): number[] {
  switch (d) {
    case 'dashed':  return [2, 1]
    case 'dotted':  return [0.01, Math.max(0.8, weight * 3)]   // round caps draw the dots
    case 'dashdot': return [3, 1, 0.01, 1]
    default:        return []
  }
}
