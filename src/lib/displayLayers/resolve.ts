// ── LayerView: the one API renderers use ──────────────────────────────────────
// Merges a layer set's stored (sparse) settings for one view with the registry
// defaults. Renderers ask show(id) / props(id, zoom) — never read raw settings.

import {
  LAYER_ITEM_BY_ID, SPLIT_FROM, itemDefault,
  type ItemSetting, type LayerSet, type LayerStyle, type LayerViewId, type ViewLayerSettings,
  type CabinetFillClass,
} from './registry'
import { CAB_FILL, CAB_FILL_SEL } from '../geometry'

/** Ghost style in 3D — the material alpha (matches the 2D ghost's 0.25 opacity). */
export const GHOST_ALPHA = 0.25

export interface LayerSVGProps {
  opacity: number
  strokeDasharray?: string   // undefined = solid
  fillOpacity: number
}

/** SVG props for a style at a zoom (zoom keeps dash lengths constant on screen). */
export function layerSVGProps(style: LayerStyle, zoom: number): LayerSVGProps {
  switch (style) {
    case 'solid':  return { opacity: 1, fillOpacity: 1 }
    case 'dashed': return { opacity: 1, strokeDasharray: `${8 / zoom} ${4 / zoom}`, fillOpacity: 0 }
    case 'ghost':  return { opacity: 0.25, fillOpacity: 0.15 }
  }
}

export interface LayerView {
  view:        LayerViewId
  setId:       string
  lineDrawing: boolean
  setting(id: string): ItemSetting
  show(id: string): boolean
  style(id: string): LayerStyle
  props(id: string, zoom: number): LayerSVGProps
  /** true when any of the ids is shown */
  any(...ids: string[]): boolean
  /** Item colour override, else `fallback` (the renderer's normal colour). */
  color(id: string, fallback: string): string
  /** Item colour override or undefined. */
  colorOf(id: string): string | undefined
  /** `base` scaled by the item's weight multiplier (line width / text size). */
  w(id: string, base: number): number
  /** Item opacity multiplier (1 = unchanged). props() already includes it. */
  op(id: string): number
  /** 3D material alpha: ghost style × opacity (1 = fully opaque). */
  alpha(id: string): number
  /** View background override or undefined. */
  background?: string
  /** Cabinet fill for an assembly class (set override, else CAB_FILL). */
  cabFill(assemblyClass: string): string
  /** Selected-cabinet fill: a brighter version of an overridden fill, else CAB_FILL_SEL. */
  cabFillSel(assemblyClass: string): string
  /** Cabinet fill opacity multiplier (fill only; 1 = unchanged). */
  cabFillOpacity: number
}

/** base_corner → base etc.; unknown classes fall back to base. */
function fillClass(assemblyClass: string): CabinetFillClass {
  const c = assemblyClass.replace(/_corner$/, '')
  return c === 'wall' || c === 'tall' ? c : 'base'
}

/** Brighter, more saturated version of a fill — the selected-cabinet colour. */
export function selectedFill(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h = (h * 60 + 360) % 360
  const l0 = (max + min) / 2
  const s0 = d ? d / (1 - Math.abs(2 * l0 - 1)) : 0
  const l = Math.min(l0 + 0.25, 0.85)
  const s = d ? Math.max(s0, 0.6) : 0
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  const to = (v: number) => Math.round((v + l - c / 2) * 255).toString(16).padStart(2, '0')
  return `#${to(r1)}${to(g1)}${to(b1)}`
}

/** Effective setting for one item in one view (stored override ?? registry default). */
export function effectiveSetting(vs: ViewLayerSettings | undefined, id: string, view: LayerViewId): ItemSetting {
  const def = LAYER_ITEM_BY_ID[id]
  const base: ItemSetting = def ? itemDefault(def, view) : { visible: false, style: 'solid' }
  // An item split from a retired one inherits the retired item's stored setting
  // until it gets its own.
  const legacyId = SPLIT_FROM[id]
  return { ...base, ...(vs?.items?.[id] ?? (legacyId ? vs?.items?.[legacyId] : undefined) ?? {}) }
}

export function resolveLayerView(set: LayerSet | undefined, view: LayerViewId): LayerView {
  const vs = set?.settings[view]
  const cache = new Map<string, ItemSetting>()
  const setting = (id: string) => {
    let s = cache.get(id)
    if (!s) { s = effectiveSetting(vs, id, view); cache.set(id, s) }
    return s
  }
  return {
    view,
    setId: set?.id ?? '',
    lineDrawing: !!vs?.lineDrawing,
    setting,
    show:  id => setting(id).visible,
    style: id => setting(id).style,
    props: (id, zoom) => {
      const p = layerSVGProps(setting(id).style, zoom)
      return { ...p, opacity: p.opacity * (setting(id).opacity ?? 1) }
    },
    any:   (...ids) => ids.some(id => setting(id).visible),
    color:   (id, fallback) => setting(id).color ?? fallback,
    colorOf: id => setting(id).color,
    w:       (id, base) => base * (setting(id).weight ?? 1),
    op:      id => setting(id).opacity ?? 1,
    // 3D has no line style: ghost = see-through material, dashed = solid.
    alpha:   id => (setting(id).style === 'ghost' ? GHOST_ALPHA : 1) * (setting(id).opacity ?? 1),
    background: vs?.background,
    cabFill: cls => vs?.cabinetFill?.[fillClass(cls)] ?? CAB_FILL[fillClass(cls)],
    cabFillSel: cls => {
      const o = vs?.cabinetFill?.[fillClass(cls)]
      return o ? selectedFill(o) : CAB_FILL_SEL[fillClass(cls)]
    },
    cabFillOpacity: vs?.cabinetFillOpacity ?? 1,
  }
}

/** Strip entries equal to the registry default so stored settings stay sparse. */
export function sparseViewSettings(vs: ViewLayerSettings, view: LayerViewId): ViewLayerSettings {
  const items: Record<string, Partial<ItemSetting>> = {}
  // Split items: hand the retired item's setting to each child that has none, then
  // drop it — otherwise a child set back to its default would be stripped below and
  // fall back to the retired setting again.
  const src: Record<string, Partial<ItemSetting>> = { ...(vs.items ?? {}) }
  for (const [child, legacy] of Object.entries(SPLIT_FROM)) {
    if (src[legacy] && !src[child]) src[child] = { ...src[legacy] }
  }
  for (const legacy of new Set(Object.values(SPLIT_FROM))) delete src[legacy]
  for (const [id, s] of Object.entries(src)) {
    const def = LAYER_ITEM_BY_ID[id]
    if (!def) { items[id] = s; continue }    // unknown (newer build) — keep untouched
    const d = itemDefault(def, view)
    const diff: Partial<ItemSetting> = {}
    if (s.visible !== undefined && s.visible !== d.visible) diff.visible = s.visible
    if (s.style !== undefined && s.style !== d.style) diff.style = s.style
    if (s.color) diff.color = s.color
    if (s.weight !== undefined && s.weight !== 1) diff.weight = s.weight
    if (s.opacity !== undefined && s.opacity !== 1) diff.opacity = s.opacity
    if (Object.keys(diff).length) items[id] = diff
  }
  const out: ViewLayerSettings = { items }
  if (vs.lineDrawing) out.lineDrawing = true
  if (vs.background) out.background = vs.background
  const fill = Object.fromEntries(Object.entries(vs.cabinetFill ?? {}).filter(([, v]) => !!v))
  if (Object.keys(fill).length) out.cabinetFill = fill
  if (vs.cabinetFillOpacity !== undefined && vs.cabinetFillOpacity !== 1) out.cabinetFillOpacity = vs.cabinetFillOpacity
  return out
}
