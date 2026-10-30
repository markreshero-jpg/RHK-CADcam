// ============================================================
// Cut-length stickers (z_takeoff T5) — one sticker per piece of cut-to-length
// hardware on the Hardware Pick List (hanging rails, linear handle strips), so
// the cut piece is labelled for its cabinet. Same size / printer / nudge as the
// optimiser's part labels (Stage 7 settings, 102 × 48 by default); laid out on
// a 102 × 48 design and scaled.
// ============================================================

import type { jsPDF as JsPDF } from 'jspdf'
import type { HardwareLine } from './hardware'
import { labelPagesPdf, type LabelSettings } from '../optimiser/labels'

export interface CutSticker {
  projectName: string
  room: string
  group: string        // "Hanging rail"
  product: string
  code: string | null
  cab: string
  length: number       // cut length, mm
  no: number; of: number
}

const singular = (g: string) => g.replace(/s$/, '')

/** Every cut piece in the rooms, room by room, in pick-list order. */
export function buildCutStickers(projectName: string, rooms: { name: string; lines: HardwareLine[] }[]): CutSticker[] {
  const out: Omit<CutSticker, 'no' | 'of'>[] = []
  for (const r of rooms) for (const l of r.lines) for (const c of l.cuts ?? []) {
    out.push({ projectName, room: r.name, group: singular(l.group), product: l.name, code: l.code, cab: c.label, length: c.length })
  }
  return out.map((s, i) => ({ ...s, no: i + 1, of: out.length }))
}

const BASE_W = 102, BASE_H = 48

/** One sticker with its top-left at (ox, oy), scaled from the 102 × 48 design. */
export function drawCutSticker(doc: JsPDF, d: CutSticker, ox: number, oy: number, W: number, H: number): void {
  const kx = W / BASE_W, ky = H / BASE_H, kf = Math.min(kx, ky)
  const X = (x: number) => ox + x * kx, Y = (y: number) => oy + y * ky
  const fs = (f: number) => doc.setFontSize(f * kf)
  const fit = (txt: string, x: number, y: number, maxW: number, f: number, minF: number, opts?: { align?: 'right' | 'center' }) => {
    let g = f
    fs(g)
    while (g > minF && doc.getTextWidth(txt) > maxW * kx) { g -= 0.5; fs(g) }
    doc.text(txt, X(x), Y(y), opts)
  }
  doc.setTextColor(0); doc.setDrawColor(0); doc.setLineWidth(0.2 * kf)

  // Left: job, room, what it is. Right: cabinet (as the part labels).
  doc.setFont('helvetica', 'bold'); fit(d.projectName, 3, 6.5, 56, 11, 7)
  doc.setFont('helvetica', 'normal'); fit(d.room, 3, 10.5, 56, 8.5, 6)
  fit(d.group, 3, 14.5, 56, 8.5, 6)
  fs(10); doc.text('Cab #', X(64), Y(8.5)); doc.line(X(64), Y(9.1), X(64) + doc.getTextWidth('Cab #'), Y(9.1))
  doc.setFont('helvetica', 'bold'); fit(d.cab, 76, 9.5, 23, 18, 9)

  // Product: up to two lines, shrinking to fit.
  doc.setFont('helvetica', 'bold')
  let f = 9, lines: string[] = []
  for (;; f -= 0.5) { fs(f); lines = doc.splitTextToSize(d.product, 96 * kx); if (lines.length <= 2 || f <= 6) break }
  lines.slice(0, 2).forEach((ln, i) => doc.text(ln, X(3), Y(20) + i * f * kf * 0.3528 * 1.15))
  if (d.code) { doc.setFont('helvetica', 'normal'); fit(d.code, 3, 28.5, 60, 7, 5) }

  // Cut length, big.
  doc.setLineWidth(0.3 * kf); doc.line(X(3), Y(31), X(99), Y(31))
  doc.setFont('helvetica', 'normal'); fs(7); doc.text('CUT LENGTH', X(3), Y(35.5))
  doc.setFont('helvetica', 'bold'); fs(24); doc.text(`${d.length}`, X(3), Y(45.5))
  const lw = doc.getTextWidth(`${d.length}`)
  doc.setFont('helvetica', 'normal'); fs(10); doc.text('mm', X(3) + lw + 1.5 * kx, Y(45.5))
  fs(7); doc.text(`${d.no} of ${d.of}`, X(99), Y(45.5), { align: 'right' })
}

export function cutStickersPdf(stickers: CutSticker[], st: LabelSettings): Promise<JsPDF> {
  return labelPagesPdf(stickers, st, (doc, d, x, y) => drawCutSticker(doc, d, x, y, st.w, st.h))
}
