// ============================================================
// Part labels (Cabinet Vision layout, z_Part_label_example) — optimiser
// Stage 7 and the headless run. Laid out on a 102 × 48 design and scaled to
// the chosen label size. One label per page on a label printer (roll), or
// tiled on A4. Sizes default to CUT size (edgeband conventions); length =
// DY (grain), width = DX.
// ============================================================

import type { jsPDF as JsPDF } from 'jspdf'
import type { OptiPart } from './types'
import type { NestResult } from './nest'
import { cutBlank } from './shapes'
import { grainMatchTags, grainMatchLine, type GrainMatchTag } from './grainBlocks'

type Placement = import('./nest').Placement
type Pt = { x: number; y: number }

// ── Settings ──────────────────────────────────────────────────────────────────

export interface LabelSize { id: string; name: string; w: number; h: number }

export const LABEL_SIZES: LabelSize[] = [
  { id: '102x48', name: '102 × 48 (Cabinet Vision)', w: 102, h: 48 },
  { id: '100x50', name: '100 × 50', w: 100, h: 50 },
  { id: '100x75', name: '100 × 75', w: 100, h: 75 },
  { id: '100x100', name: '100 × 100', w: 100, h: 100 },
  { id: '102x152', name: '102 × 152 (4 × 6″)', w: 152, h: 102 },
  { id: '89x36', name: '89 × 36 (Dymo large address)', w: 89, h: 36 },
  { id: '62x29', name: '62 × 29 (Brother DK-11209)', w: 62, h: 29 },
  { id: 'custom', name: 'Custom…', w: 102, h: 48 },
]

export interface LabelSettings {
  sizeId: string
  w: number; h: number            // mm, landscape (w ≥ h reads best)
  printer: 'roll' | 'a4'          // label printer: one label per page; A4: tiled sheets
  dims: 'cut' | 'finished'
  picture: boolean
  offsetX: number; offsetY: number  // mm nudge for printer alignment
}

export const DEFAULT_LABEL_SETTINGS: LabelSettings = {
  sizeId: '102x48', w: 102, h: 48, printer: 'roll', dims: 'cut', picture: true, offsetX: 0, offsetY: 0,
}

// ── Label data ────────────────────────────────────────────────────────────────

export interface LabelLookups {
  projectName: string
  cabType: Map<string, string>      // cabinet_instance_id → cabinet definition name
  tapeName: Map<string, string>     // edge_banding id → name
  colourName: Map<string, string>   // material id → colour name
  matName: (id: string | null) => string | null
}

export interface LabelData {
  projectName: string; room: string; cabType: string; part: string
  material: string; colour: string; grainMatch: string | null
  edging: string; comment: string; cab: string
  sheetNo: number; partNo: number
  len: number; wid: number; grainAcross: boolean
  // Part picture in the cut-blank frame (x = width, y = length).
  pic: { W: number; H: number; edges: [Pt, Pt, boolean][]; holes: { x: number; y: number; d: number }[] }
}

/** Part numbers: 1, 2, 3… on each sheet, in placement order (Mark, 2026-10-29) —
 *  label "Sheet 2 / Part 3" matches the sheet prints. */
export function partNumbers(nest: NestResult): Map<string, number> {
  const out = new Map<string, number>()
  for (const s of nest.sheets) s.placements.forEach((pl, i) => out.set(pl.uid, i + 1))
  return out
}

/** A hole belongs to the part whose placed rectangle holds it. */
export function holesIn<T extends Pt>(pl: Placement, drills: T[]): T[] {
  return drills.filter(h => h.x >= pl.x - 0.01 && h.x <= pl.x + pl.w + 0.01 && h.y >= pl.y - 0.01 && h.y <= pl.y + pl.h + 0.01)
}

export function buildLabelData(
  p: OptiPart, pl: Placement, sheetNo: number, partNo: number,
  sheetDrills: { x: number; y: number; diameter: number }[],
  deductEb: boolean, look: LabelLookups, gm: GrainMatchTag | undefined, dims: 'cut' | 'finished',
): LabelData {
  const blank = cutBlank(p, deductEb)
  const Wc = blank.w, Hc = blank.h
  const size = dims === 'cut' ? { w: Wc, h: Hc } : { w: p.w, h: p.h }
  // Banded sides from eb_on, so a 0 mm "no tape" band (sprayed round-over) still shows.
  const [onW1, onW2, onH1, onH2] = p.eb_on ?? [p.eb_w1 > 0, p.eb_w2 > 0, p.eb_h1 > 0, p.eb_h2 > 0]
  const lEdges = (onW1 ? 1 : 0) + (onW2 ? 1 : 0)
  const wEdges = (onH1 ? 1 : 0) + (onH2 ? 1 : 0)
  const tapes = [...new Set((p.eb_tape ?? []).map(t => (t.id && look.tapeName.get(t.id)) || ''))].filter(Boolean).join(', ')

  // Picture edges. Shaped part: the finished outline put onto the cut blank the
  // way its holes are (shifted by the tape, mirrored for a left gable —
  // shapes.makeBlank), each edge taped per its tag or the rectangle side it lies on.
  const edges: [Pt, Pt, boolean][] = []
  const poly = p.shape?.op_polygon && p.shape.op_polygon.length >= 3 ? p.shape.op_polygon : null
  if (poly) {
    const mirror = p.shape!.blank_mirror
    const toBlank = (q: Pt): Pt => {
      const b = { x: q.x - blank.sx, y: q.y - blank.sy }
      return mirror === 'x' ? { x: Wc - b.x, y: b.y } : mirror === 'y' ? { x: b.x, y: Hc - b.y } : b
    }
    const T = 0.05
    const on = (a: number, b: number, v: number) => Math.abs(a - v) < T && Math.abs(b - v) < T
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length]
      const tag = p.shape!.op_band?.[i] ?? (p.shape!.op_tape?.[i] != null ? p.shape!.op_tape![i]! > 0 : null)
      const taped = tag != null ? tag : on(a.x, b.x, 0) ? onW1 : on(a.x, b.x, p.w) ? onW2 : on(a.y, b.y, 0) ? onH1 : on(a.y, b.y, p.h) ? onH2 : false
      edges.push([toBlank(a), toBlank(b), taped])
    })
  } else {
    edges.push([{ x: 0, y: 0 }, { x: 0, y: Hc }, onW1], [{ x: Wc, y: 0 }, { x: Wc, y: Hc }, onW2],
      [{ x: 0, y: 0 }, { x: Wc, y: 0 }, onH1], [{ x: 0, y: Hc }, { x: Wc, y: Hc }, onH2])
  }
  // Holes: sheet → placement-local → blank frame (undo the placement turn).
  const holes = holesIn(pl, sheetDrills).map(hd => {
    const dx = hd.x - pl.x, dy = hd.y - pl.y
    const [x, y] = pl.rotated ? [dy, pl.w - dx] : [dx, dy]
    return { x, y, d: hd.diameter }
  })

  return {
    projectName: look.projectName, room: p.room_name, cabType: look.cabType.get(p.cabinet_instance_id) ?? '', part: p.label,
    material: look.matName(p.material_id) ?? '', colour: look.colourName.get(p.material_id ?? '') ?? '',
    grainMatch: gm ? `Grain match ${grainMatchLine(gm)} ${gm.direction === 'horizontal' ? '(grain across)' : '(grain up)'}` : null,
    edging: lEdges + wEdges ? `${lEdges}L ${wEdges}W${tapes ? ` - ${tapes}` : ''}` : 'None',
    comment: p.comment ?? '', cab: p.cabinet_label, sheetNo, partNo,
    len: Math.round(size.h * 10) / 10, wid: Math.round(size.w * 10) / 10, grainAcross: !!p.grain_across,
    pic: { W: Wc, H: Hc, edges, holes },
  }
}

/** Every placed part's label, in part-number order. */
export function buildAllLabels(
  nest: NestResult, partByUid: Map<string, OptiPart>,
  drillsBySheet: Map<number, { x: number; y: number; diameter: number }[]>,
  deductEb: boolean, look: LabelLookups, dims: 'cut' | 'finished',
): LabelData[] {
  const nos = partNumbers(nest)
  const gm = grainMatchTags(nest)
  const out: LabelData[] = []
  nest.sheets.forEach((s, si) => s.placements.forEach(pl => {
    const p = partByUid.get(pl.baseUid)
    if (!p) return
    out.push(buildLabelData(p, pl, si + 1, nos.get(pl.uid)!, drillsBySheet.get(s.index) ?? [], deductEb, look, gm.get(pl.uid), dims))
  }))
  return out
}

// ── Lookups (names the snapshot doesn't carry) ────────────────────────────────

// Minimal client surface so the browser client and the headless run's both fit.
interface Db { from: (t: string) => any }   // eslint-disable-line @typescript-eslint/no-explicit-any

export async function loadLabelLookups(
  supabase: Db, parts: OptiPart[], projectName: string, matName: (id: string | null) => string | null,
): Promise<LabelLookups> {
  const cabIds = [...new Set(parts.map(p => p.cabinet_instance_id))]
  const tapeIds = [...new Set(parts.flatMap(p => (p.eb_tape ?? []).map(t => t.id).filter((x): x is string => !!x)))]
  const matIds = [...new Set(parts.map(p => p.material_id).filter((x): x is string => !!x))]
  const [defR, tapeR, colR] = await Promise.all([
    cabIds.length ? supabase.from('cabinet_instances').select('id,cabinet_definitions(name)').in('id', cabIds) : { data: [] },
    tapeIds.length ? supabase.from('edge_banding').select('id,name').in('id', tapeIds) : { data: [] },
    matIds.length ? supabase.from('materials').select('id,colour_name').in('id', matIds) : { data: [] },
  ])
  type Row = Record<string, unknown>
  return {
    projectName, matName,
    cabType: new Map(((defR.data ?? []) as Row[]).map(r => [r.id as string, ((r.cabinet_definitions as { name?: string } | null)?.name) ?? ''])),
    tapeName: new Map(((tapeR.data ?? []) as Row[]).map(t => [t.id as string, t.name as string])),
    colourName: new Map(((colR.data ?? []) as Row[]).map(r => [r.id as string, (r.colour_name as string | null) ?? ''])),
  }
}

// ── Drawing ───────────────────────────────────────────────────────────────────

const BASE_W = 102, BASE_H = 48

/** Draw one label with its top-left at (ox, oy), scaled from the 102 × 48 design. */
export function drawLabel(doc: JsPDF, d: LabelData, ox: number, oy: number, W: number, H: number, picture: boolean): void {
  const kx = W / BASE_W, ky = H / BASE_H, kf = Math.min(kx, ky)
  const X = (x: number) => ox + x * kx, Y = (y: number) => oy + y * ky
  const fs = (f: number) => doc.setFontSize(f * kf)
  const fit = (txt: string, x: number, y: number, maxW: number, f: number, minF: number, opts?: { align?: 'right' | 'center' }) => {
    let g = f
    fs(g)
    while (g > minF && doc.getTextWidth(txt) > maxW * kx) { g -= 0.5; fs(g) }
    doc.text(txt, X(x), Y(y), opts)
  }
  const underline = (txt: string, x: number, y: number) => { doc.text(txt, X(x), Y(y)); doc.line(X(x), Y(y + 0.6), X(x) + doc.getTextWidth(txt), Y(y + 0.6)) }

  doc.setTextColor(0); doc.setDrawColor(0); doc.setLineWidth(0.2 * kf)
  // Left column
  doc.setFont('helvetica', 'bold'); fit(d.projectName, 3, 6.5, 48, 11, 7)
  doc.setFont('helvetica', 'normal'); fit(d.room, 3, 10.5, 48, 8.5, 6)
  fit(d.cabType, 3, 14.5, 48, 8.5, 6)
  doc.setFont('helvetica', 'bold'); fit(d.part, 9, 19.5, 44, 11, 6.5)
  doc.setFont('helvetica', 'normal'); fit(d.material, 3, 24.5, 49, 8.5, 6)
  fit(d.colour, 3, 28.5, 49, 8.5, 6)
  if (d.grainMatch) { doc.setFont('helvetica', 'bold'); fit(d.grainMatch, 3, 31.9, 49, 7.5, 5); doc.setFont('helvetica', 'normal') }
  fs(7.5); underline('Edging:', 3, 35); fit(d.edging, 14, 35, 39, 7.5, 5)
  // Comment box: bottom left, clear of the sizes and the picture (x ≤ 53). The
  // text wraps, shrinking until it fits; past 4.5 pt it's cut with an ellipsis.
  // No comment → no box at all (Mark, 2026-10-29).
  const BX = 2, BY = 37, BW = 51, BH = 10
  if (d.comment.trim()) {
    doc.setLineWidth(0.2 * kf); doc.rect(X(BX), Y(BY), BW * kx, BH * ky)
    doc.setFont('helvetica', 'bold'); fs(5.5); doc.text('Comment:', X(BX + 1), Y(BY + 2.3))
    doc.setFont('helvetica', 'normal')
    const avail = (BH - 3.2) * ky, wrapW = (BW - 2) * kx
    let f = 7.5, lines: string[] = []
    const lineH = (g: number) => g * kf * 0.3528 * 1.15
    for (;; f -= 0.5) {
      fs(f); lines = doc.splitTextToSize(d.comment, wrapW)
      if (lines.length * lineH(f) <= avail || f <= 4.5) break
    }
    const max = Math.max(1, Math.floor(avail / lineH(f)))
    if (lines.length > max) { lines = lines.slice(0, max); lines[max - 1] = lines[max - 1].replace(/\s*\S{0,3}$/, '') + '…' }
    lines.forEach((ln, i) => doc.text(ln, X(BX + 1), Y(BY + 3.2) + lineH(f) * (i + 0.8)))
  }
  // Cab # + sheet / part numbers
  fs(10); underline('Cab #', 53, 8.5)
  doc.setFont('helvetica', 'bold'); fit(d.cab, 64, 9.5, 18, 18, 9)
  fs(7)
  doc.setFont('helvetica', 'normal'); doc.text('Sheet No:', X(95), Y(5), { align: 'right' }); doc.text('Part No:', X(95), Y(9), { align: 'right' })
  doc.setFont('helvetica', 'bold'); doc.text(String(d.sheetNo), X(99.5), Y(5), { align: 'right' }); doc.text(String(d.partNo), X(99.5), Y(9), { align: 'right' })

  // Part picture: length across, width up, seen from the machined (up) face —
  // the sheet view turned, never mirrored. Blank (x = width, y = length) →
  // picture (u, v) = (y, W − x).
  const AX = 61, AY = 14, AW = 37, AH = 21
  if (picture) {
    const { W: Wc, H: Hc } = d.pic
    const s = Math.min(AW * kx / Hc, AH * ky / Wc)
    const pw = Hc * s, ph = Math.max(Wc * s, 2.5 * ky)
    const vs = ph / Wc
    const px = X(AX) + (AW * kx - pw) / 2, py = Y(AY) + (AH * ky - ph) / 2
    const P = (q: Pt): [number, number] => [px + q.y * s, py + ph - (Wc - q.x) * vs]
    for (const [a, b, taped] of d.pic.edges) {
      doc.setLineWidth((taped ? 1.1 : 0.2) * kf)
      const [ax, ay] = P(a), [bx, by] = P(b)
      doc.line(ax, ay, bx, by)
    }
    doc.setFillColor(0, 0, 0)
    for (const h of d.pic.holes) {
      const [cx, cy] = P(h)
      doc.circle(cx, cy, Math.max(0.3 * kf, h.d / 2 * s), 'F')
    }
    doc.setLineWidth(0.2 * kf)
  }
  // Sizes: width up the left (across grain), length under (with grain).
  doc.setFont('helvetica', 'bold'); fs(11)
  doc.text(String(d.wid), X(58.5), Y(AY + AH / 2), { angle: 270, align: 'center' })
  doc.setFont('helvetica', 'normal'); fs(5.5); doc.text(d.grainAcross ? 'With Grain' : 'Across Grain', X(55), Y(AY + AH / 2), { angle: 270, align: 'center' })
  doc.setFont('helvetica', 'bold'); fs(11); doc.text(String(d.len), X(AX + AW / 2), Y(40.5), { align: 'center' })
  doc.setFont('helvetica', 'normal'); fs(5.5); doc.text(d.grainAcross ? 'Across Grain' : 'With Grain', X(AX + AW / 2), Y(43.5), { align: 'center' })
}

/** A4 tiling: as many labels of the chosen size as fit, centred on the page. */
export function a4Grid(W: number, H: number): { cols: number; rows: number; x0: number; y0: number } {
  const PW = 210, PH = 297, M = 3   // most A4 printers reach to ~3 mm; 102 wide fits 2 across
  const cols = Math.max(1, Math.floor((PW - 2 * M) / W)), rows = Math.max(1, Math.floor((PH - 2 * M) / H))
  return { cols, rows, x0: (PW - cols * W) / 2, y0: (PH - rows * H) / 2 }
}

/** The labels PDF: one per page (label printer) or tiled on A4. */
export async function labelsPdf(labels: LabelData[], st: LabelSettings): Promise<JsPDF> {
  const { jsPDF } = await import('jspdf')
  const { w: W, h: H } = st
  if (st.printer === 'roll') {
    const orient = W >= H ? 'landscape' : 'portrait'
    const doc = new jsPDF({ orientation: orient, unit: 'mm', format: [Math.min(W, H), Math.max(W, H)] })
    labels.forEach((d, i) => {
      if (i) doc.addPage([Math.min(W, H), Math.max(W, H)], orient)
      drawLabel(doc, d, st.offsetX, st.offsetY, W, H, st.picture)
    })
    return doc
  }
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const g = a4Grid(W, H)
  const per = g.cols * g.rows
  labels.forEach((d, i) => {
    const k = i % per
    if (i && !k) doc.addPage('a4', 'portrait')
    const x = g.x0 + (k % g.cols) * W + st.offsetX, y = g.y0 + Math.floor(k / g.cols) * H + st.offsetY
    doc.setDrawColor(200); doc.setLineWidth(0.1); doc.rect(x, y, W, H)   // cut guide
    drawLabel(doc, d, x, y, W, H, st.picture)
  })
  return doc
}
