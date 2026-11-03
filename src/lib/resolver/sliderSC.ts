// ============================================================
// Häfele Slider SC — soft close sliding robe doors in a recess (z_slider_sc)
// Pure data + geometry: profiles (end shapes off the AA01SLIDERSC brochure,
// 04.2026, pages 3–6), catalogue numbers, panel sizes, door layout on the
// tracks, and the track / profile cut list.
//
// Häfele's "Door Width" formulas (page 6) are the BOARD PANEL width: adding each
// vertical profile's reach past the board edge gives exactly the 60 overlap per
// joint (handle H 37.8, slimline 3.5, 16 handle 21 — see PROFILE_REACH). Door
// height = inside height − 55 (page 6).
//
// Coordinates used here:
//   x — along the opening, from its left end (as seen from the front)
//   d — depth back from the opening's front face (front = 0, + into the recess)
// ============================================================

import type { ResolvedSlider, ResolvedFaceZone } from './types'

export type SliderFinish = 'white' | 'silver' | 'black'
export type SliderStile = 'handle' | 'slimline' | 'handle16'
export type SliderLayout = '2' | '3' | '3T'   // 2 door / 3 door double track / 3 door triple track

export const SLIDER = {
  heightDeduct: 55,          // door height = IH − 55
  overlap: 60,               // X: doors overlap 60 at each joint, handle included
  trackPitch: 39,            // door planes 39 apart (rail centres, guide channels)
  slimlineSpacer: 6,         // 6 mm spacer under rollers + guide with the slimline stile
  maxDoorHeight: 2750,
  minDoorWidth: 900, maxDoorWidth: 1350,
  maxWeightKg: 50,
  boardMin: 16, boardMax: 18,
  guideHeight: 50,           // top guide track, open down
  railHeight: 8,             // running rail ribs above the floor
  railLip: 19,               // lip return down the front of the rail
  railBase: 1,
  doorBottom: 15,            // door (stile) bottom above the rail base: 8 ribs + roller clearance — Claude's guess
} as const

/** Panel width = (ICW + a) ÷ n — Häfele page 6, per stile and door count. */
const PANEL_FORMULA: Record<SliderStile, { 2: number; 3: number }> = {
  handle:   { 2: -92,       3: -108 },
  slimline: { 2: 60 - 14,   3: 120 - 21 },
  handle16: { 2: -24,       3: -6 },
}

/** How far each vertical profile reaches past the board edge (from the sections). */
export const PROFILE_REACH: Record<SliderStile, number> = { handle: 37.8, slimline: 3.5, handle16: 21 }

/** Max board thickness each vertical profile takes. */
export const STILE_BOARD_MAX: Record<SliderStile, number> = { handle: 18, slimline: 18, handle16: 16 }

export function doorCount(layout: SliderLayout): 2 | 3 { return layout === '2' ? 2 : 3 }

export function panelWidth(icw: number, layout: SliderLayout, stile: SliderStile): number {
  const n = doorCount(layout)
  return (icw + PANEL_FORMULA[stile][n]) / n
}

/** Panel height. The slimline stile needs a 6 spacer under the rollers and the
 *  guide (page 3 note), so its panel is 12 shorter — Claude's reading, check on
 *  the first door. */
export function panelHeight(ih: number, stile: SliderStile): number {
  return ih - SLIDER.heightDeduct - (stile === 'slimline' ? 2 * SLIDER.slimlineSpacer : 0)
}

// ── Door layout ─────────────────────────────────────────────────────────────

export interface SliderDoor {
  index: number              // 0 = leftmost
  track: number              // 0 = front track
  panelX: number             // board panel left edge along the opening
  panelW: number
  panelH: number
  x0: number; x1: number     // overall door incl. vertical profiles
  dCentre: number            // depth of the door's centre plane behind the opening front
}

/** Which track each door runs on, left to right (0 = front). From the page 6
 *  diagrams: 2 door — left front, right back; 3 door double track — outer two
 *  front, middle back; triple — stepped back left to right. */
export function trackOrder(layout: SliderLayout): number[] {
  return layout === '2' ? [0, 1] : layout === '3' ? [0, 1, 0] : [0, 1, 2]
}

export function trackCount(layout: SliderLayout): 2 | 3 { return layout === '3T' ? 3 : 2 }

/** Depth of the front track's centre behind the opening front: the rail's front
 *  pair of ribs sits 34.5 back from the lip face (54 to the rail middle − 19.5). */
export const FRONT_TRACK_D = 34.5

export function sliderDoors(icw: number, ih: number, layout: SliderLayout, stile: SliderStile): SliderDoor[] {
  const n = doorCount(layout)
  const pw = panelWidth(icw, layout, stile)
  const ph = panelHeight(ih, stile)
  const reach = PROFILE_REACH[stile]
  const doorW = pw + 2 * reach
  const order = trackOrder(layout)
  // Doors spread evenly so the outer ones meet the recess ends and the
  // overlaps share what's left (≈ 60 each).
  const step = n > 1 ? (icw - doorW) / (n - 1) : 0
  return Array.from({ length: n }, (_, i) => {
    const x0 = i * step
    return {
      index: i, track: order[i],
      panelX: x0 + reach, panelW: pw, panelH: ph,
      x0, x1: x0 + doorW,
      dCentre: FRONT_TRACK_D + order[i] * SLIDER.trackPitch,
    }
  })
}

// ── Catalogue (page 3–5) ────────────────────────────────────────────────────

export interface StockBar { length: number; cat: Record<SliderFinish, string | null> }

const bars = (rows: [number, string | null, string | null, string | null][]): StockBar[] =>
  rows.map(([length, white, silver, black]) => ({ length, cat: { white, silver, black } }))

export const SLIDER_STOCK = {
  guide2:   bars([[1800, '403.90.815', '403.90.801', '403.90.805'], [2700, '403.90.816', '403.90.802', '403.90.806'], [3600, '403.90.012', '403.90.803', '403.90.807']]),
  guide3:   bars([[3600, '403.90.813', '403.90.809', '403.90.810']]),
  rail2Lip: bars([[1800, '403.90.008', '403.90.602', '403.90.610'], [2700, '403.90.009', '403.90.603', '403.90.611'], [3600, '403.90.013', '403.90.604', '403.90.612']]),
  rail2:    bars([[1800, null, '403.90.614', '403.90.606'], [2700, null, '403.90.615', '403.90.607'], [3600, '403.90.014', '403.90.616', '403.90.608']]),
  rail3Lip: bars([[3600, '403.90.814', '403.90.811', '403.90.812']]),
  handle:   bars([[2750, '403.90.015', '126.35.913', '126.35.914']]),
  handle16: bars([[2900, null, '403.93.953', null]]),
  slimline: bars([[2750, '403.90.016', '944.02.328', '126.14.936']]),
  horiz:    bars([[1800, '944.02.735', '944.02.700', '944.02.730'], [2700, '944.02.736', '944.02.701', '944.02.731'], [3600, '403.90.017', '944.02.702', '944.02.732']]),
} as const

export type SliderStockKey = keyof typeof SLIDER_STOCK

export const STOCK_LABEL: Record<SliderStockKey, string> = {
  guide2: 'Slider SC double guide track', guide3: 'Slider SC triple guide track',
  rail2Lip: 'Slider SC double running rail with lip', rail2: 'Slider SC double running rail',
  rail3Lip: 'Slider SC triple running rail with lip',
  handle: 'Slider SC handle profile', handle16: 'Slider SC 16mm handle profile',
  slimline: 'Slider SC slimline vertical stile', horiz: 'Slider SC slimline horizontal stile',
}

// ── Cut list ────────────────────────────────────────────────────────────────

export interface SliderCut { key: SliderStockKey; length: number; qty: number; label: string }

export interface SliderOptions {
  layout: SliderLayout
  stile: SliderStile
  finish: SliderFinish
  railLip: boolean           // running rail with lip (default) or the plain one
}

/** Profiles cut for one unit: tracks the opening width, a vertical profile up each
 *  door edge (door height), a horizontal stile top and bottom of each panel. */
export function sliderCuts(icw: number, ih: number, o: SliderOptions): SliderCut[] {
  const doors = sliderDoors(icw, ih, o.layout, o.stile)
  const n = doors.length, three = o.layout === '3T'
  const doorH = ih - SLIDER.heightDeduct
  return [
    { key: three ? 'guide3' : 'guide2', length: icw, qty: 1, label: 'top guide track' },
    { key: three ? 'rail3Lip' : o.railLip ? 'rail2Lip' : 'rail2', length: icw, qty: 1, label: 'bottom running rail' },
    { key: o.stile, length: doorH, qty: 2 * n, label: 'vertical door profile' },
    { key: 'horiz', length: doors[0].panelW, qty: 2 * n, label: 'horizontal door profile' },
  ]
}

export interface SliderBuy { key: SliderStockKey; length: number; cat: string | null; qty: number }

/** Bars to buy: each cut from the shortest stock length that takes it; cuts of
 *  the same profile share bars (first-fit decreasing, 3 kerf). A cut longer than
 *  every stock length is returned in `tooLong`. */
export function sliderBuyList(cuts: SliderCut[], finish: SliderFinish, kerf = 3): { buy: SliderBuy[]; tooLong: SliderCut[] } {
  const buy: SliderBuy[] = []
  const tooLong: SliderCut[] = []
  const byKey = new Map<SliderStockKey, number[]>()
  for (const c of cuts) {
    const list = byKey.get(c.key) ?? []
    for (let i = 0; i < c.qty; i++) list.push(c.length)
    byKey.set(c.key, list)
  }
  for (const [key, lens] of byKey) {
    const stock = SLIDER_STOCK[key]
    const maxLen = Math.max(...stock.map(s => s.length))
    const bins: { len: number; left: number }[] = []
    for (const len of [...lens].sort((a, b) => b - a)) {
      if (len > maxLen) { tooLong.push({ key, length: len, qty: 1, label: STOCK_LABEL[key] }); continue }
      const bin = bins.find(b => b.left >= len)
      if (bin) { bin.left -= len + kerf; continue }
      bins.push({ len: maxLen, left: maxLen - len - kerf })   // swapped down below
    }
    // A bar whose cuts fit a shorter stock length is swapped down.
    for (const b of bins) {
      const used = b.len - b.left
      const shorter = stock.find(s => s.length >= used - kerf)
      if (shorter && shorter.length < b.len) { b.left -= b.len - shorter.length; b.len = shorter.length }
    }
    for (const s of stock) {
      const qty = bins.filter(b => b.len === s.length).length
      if (qty) buy.push({ key, length: s.length, cat: s.cat[finish], qty })
    }
  }
  return { buy, tooLong }
}

// ── Warnings ────────────────────────────────────────────────────────────────

export type SliderWarning =
  | 'SLIDER_DOOR_HEIGHT' | 'SLIDER_DOOR_WIDTH' | 'SLIDER_BOARD_THICK'
  | 'SLIDER_FINISH_NA' | 'SLIDER_TOO_LONG'

export function sliderWarnings(icw: number, ih: number, board: number, o: SliderOptions): { code: SliderWarning; message: string }[] {
  const out: { code: SliderWarning; message: string }[] = []
  const doorH = ih - SLIDER.heightDeduct
  const pw = panelWidth(icw, o.layout, o.stile)
  const doorW = pw + 2 * PROFILE_REACH[o.stile]
  if (doorH > SLIDER.maxDoorHeight) out.push({ code: 'SLIDER_DOOR_HEIGHT', message: `Door height ${Math.round(doorH)} is over the Slider SC 2750 max` })
  if (doorW < SLIDER.minDoorWidth || doorW > SLIDER.maxDoorWidth) out.push({ code: 'SLIDER_DOOR_WIDTH', message: `Door width ${Math.round(doorW)} is outside the Slider SC 900–1350 range` })
  if (board > STILE_BOARD_MAX[o.stile] + 1) out.push({ code: 'SLIDER_BOARD_THICK', message: `Board ${board} is too thick for the ${o.stile === 'handle16' ? '16mm handle' : o.stile} profile (${STILE_BOARD_MAX[o.stile]} max)` })
  if (o.stile === 'handle16' && o.finish !== 'silver') out.push({ code: 'SLIDER_FINISH_NA', message: 'The 16mm handle profile comes in silver only' })
  const { tooLong } = sliderBuyList(sliderCuts(icw, ih, o), o.finish)
  if (tooLong.length) out.push({ code: 'SLIDER_TOO_LONG', message: `${tooLong.map(c => c.label).join(', ')} longer than the longest bar (${Math.max(...tooLong.map(c => c.length))})` })
  return out
}

// ── Profile end shapes (mm, from the brochure sections; not to scale there, so
//    the small details are approximate — overall sizes are the dimensioned ones) ──

export type Pt = readonly [number, number]

/** Vertical profiles in plan section: u = out from the board edge (+ away from the
 *  panel), v = toward the front from the board's back face (board occupies
 *  u < 0, 0 ≤ v ≤ t). Drawn for the right-hand edge of a door; mirror u for the left. */
export const STILE_SECTION: Record<SliderStile, readonly Pt[]> = {
  // T handle (page 4): back flange 53.3 (15.5 over the board, chamfered tip),
  // web on the board edge, front lip 15 (5 over the board), 22.1 overall.
  handle: [
    [-15.5, -1.8], [37.8, -1.8], [37.8, 1.2], [36.6, 3.2], [33.8, 0],
    [1.5, 0], [1.5, 18.5], [10, 18.5], [10, 20.3], [-5, 20.3], [-5, 18.5], [0, 18.5], [0, 0], [-15.5, 0],
  ],
  // Slimline (page 5): wraps the edge 3.5 past it, 33 deep (a 2 back plate
  // 15.5 over the board, a hook behind it), 9 front lip.
  slimline: [
    [-15.5, 0], [-15.5, -2], [-4.5, -2], [-4.5, -12.5], [-2.5, -12.5], [-2.5, -14.5],
    [3.5, -14.5], [3.5, 18.5], [-5.5, 18.5], [-5.5, 17.5], [0, 17.5], [0, 0],
  ],
  // 16 mm handle (page 4): 31 wide (21 past the edge, 10 over the board's
  // front), 31.25 deep, finger hollow on the front.
  handle16: [
    [-6, -3], [8, -3], [8, -1.5], [0, -1.5], [0, 16], [10, 16], [10, 28.25],
    [4, 26.5], [-4, 25.6], [-12, 26.5], [-21, 28.25], [-21, -3],
  ],
}

/** Slimline horizontal stile (page 5), section across the door's top / bottom
 *  edge: s = across the thickness from the back face, h = out from the panel
 *  edge (board occupies h < 0). L: 15.87 seat under the edge, 6 upstand on the back. */
export const HORIZ_SECTION: readonly Pt[] = [
  [-1.5, -4.5], [0, -4.5], [0, 0], [14.37, 0], [14.37, 1.5], [-1.5, 1.5],
]

/** Track end shapes: w = depth back from the track's front edge, h = away from the
 *  surface it's fixed to (ceiling / floor). */
export function guideSection(tracks: 2 | 3): Pt[] {
  // Open-down comb: top plate + (tracks + 1) walls, 50 high. Double 79, triple 117.
  const W = tracks === 3 ? 117 : 79, H = SLIDER.guideHeight, t = 1.5
  const walls = Array.from({ length: tracks + 1 }, (_, i) => (i * (W - t)) / tracks)
  const pts: Pt[] = [[0, 0], [W, 0]]
  for (let i = walls.length - 1; i >= 0; i--) {
    const a = walls[i]
    pts.push([a + t, H], [a, H])
    if (i > 0) pts.push([a, t], [walls[i - 1] + t, t])
  }
  return pts
}

/** Running rail: 1 base, pairs of 8-high ribs on each track centre, optional 19
 *  lip down the front. Double with lip 81, plain 53, triple with lip 119. */
export function railSection(tracks: 2 | 3, lip: boolean): Pt[] {
  const W = tracks === 3 ? 119 : lip ? 81 : 53
  const centres = Array.from({ length: tracks }, (_, i) => FRONT_TRACK_D + i * SLIDER.trackPitch - (lip || tracks === 3 ? 0 : 28))
  const base = SLIDER.railBase, rib = 1.6, half = 5.2, H = SLIDER.railHeight
  const pts: Pt[] = lip || tracks === 3 ? [[0, -SLIDER.railLip], [1, -SLIDER.railLip], [1, 0]] : [[0, 0]]
  for (const c of centres) {
    for (const r of [c - half, c + half]) pts.push([r - rib / 2, 0], [r - rib / 2, H], [r + rib / 2, H], [r + rib / 2, 0])
  }
  pts.push([W, 0], [W, base], [0, base])
  return pts
}

/** Track envelope depth (the recess needs at least this). */
export function sliderDepth(layout: SliderLayout, lip: boolean): number {
  return trackCount(layout) === 3 ? 119 : lip ? 81 : 79
}

// ── Pieces to draw (3D / 2D) from a resolved cabinet ────────────────────────


export interface SliderPiece {
  key: SliderStockKey
  finish: SliderFinish
  /** 'zy': pts are (z, y), extruded along X from `start`; 'xz': pts are (x, z),
   *  extruded along Y (up) from `start`. Cabinet coords. */
  plane: 'zy' | 'xz'
  pts: Pt[]
  start: number
  length: number
  role: 'guide' | 'rail' | 'stile' | 'horiz'
}

/** Guide track's front edge, back from the opening front: its first channel
 *  centred on the front door plane. */
function guideFront(tracks: 2 | 3): number { return FRONT_TRACK_D - (tracks === 3 ? 117 / 6 : 79 / 4) }
/** Running rail's front edge back from the opening front (the lip face is flush). */
function railFront(tracks: 2 | 3, lip: boolean): number { return lip || tracks === 3 ? 0 : FRONT_TRACK_D - 6.5 }

export function sliderProfiles(s: ResolvedSlider, zones: ResolvedFaceZone[]): SliderPiece[] {
  const tracks = trackCount(s.layout), lip = s.rail === 'lip'
  const out: SliderPiece[] = []
  const g = guideFront(tracks), rf = railFront(tracks, lip)
  out.push({ key: tracks === 3 ? 'guide3' : 'guide2', finish: s.finish, role: 'guide', plane: 'zy', start: 0, length: s.icw,
    pts: guideSection(tracks).map(([w, h]) => [s.front - g - w, s.ih - h] as Pt) })
  out.push({ key: tracks === 3 ? 'rail3Lip' : lip ? 'rail2Lip' : 'rail2', finish: s.finish, role: 'rail', plane: 'zy', start: 0, length: s.icw,
    pts: railSection(tracks, lip).map(([w, h]) => [s.front - rf - w, h] as Pt) })
  const doorH = s.ih - SLIDER.heightDeduct
  for (const d of s.doors) {
    const z = zones.find(q => q.row_index === d.row_index && q.col_index === d.col_index)
    if (!z) continue
    const sec = STILE_SECTION[s.stile]
    out.push({ key: s.stile, finish: s.finish, role: 'stile', plane: 'xz', start: SLIDER.doorBottom, length: doorH,
      pts: sec.map(([u, v]) => [z.X - u, z.Z + v] as Pt) })
    out.push({ key: s.stile, finish: s.finish, role: 'stile', plane: 'xz', start: SLIDER.doorBottom, length: doorH,
      pts: sec.map(([u, v]) => [z.X + z.DX + u, z.Z + v] as Pt) })
    out.push({ key: 'horiz', finish: s.finish, role: 'horiz', plane: 'zy', start: z.X, length: z.DX,
      pts: HORIZ_SECTION.map(([a, h]) => [z.Z + a, z.Y - h] as Pt) })
    out.push({ key: 'horiz', finish: s.finish, role: 'horiz', plane: 'zy', start: z.X, length: z.DX,
      pts: HORIZ_SECTION.map(([a, h]) => [z.Z + a, z.Y + z.DY + h] as Pt) })
  }
  return out
}

/** Aluminium colour per finish (3D / 2D). */
export const SLIDER_COLOUR: Record<SliderFinish, string> = { white: '#f2f2ee', silver: '#c9cbcd', black: '#26272a' }
