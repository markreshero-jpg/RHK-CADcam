// ============================================================
// Cut sheets report — one A4 landscape page per nested sheet (the cut
// pattern: part outlines, numbers, cut sizes, holes, grain-match blocks) plus a
// parts list. Optimiser Stage 7 and the headless run. Part numbers restart on
// each sheet, the same as the labels (labels.partNumbers).
// ============================================================

import type { jsPDF as JsPDF } from 'jspdf'
import type { OptiPart } from './types'
import type { NestResult } from './nest'
import { placedOutline } from './shapes'
import { blockRectOn, grainMatchTags, grainMatchLine } from './grainBlocks'
import { grainMatchColour } from '../grainMatch'
import { partNumbers, holesIn } from './labels'

type Drill = { x: number; y: number; diameter: number }

export interface CutSheetRow {
  no: number; sheet: number; cab: string; part: string
  w: number; h: number; finW: number; finH: number; rotated: boolean
  holes: number; comment: string | null; gm: string | null
}

/** The parts list: sheet by sheet, in placement order. */
export function cutSheetRows(nest: NestResult, partByUid: Map<string, OptiPart>, drillsBySheet: Map<number, Drill[]>): CutSheetRow[] {
  const nos = partNumbers(nest)
  const gm = grainMatchTags(nest)
  const rows: CutSheetRow[] = []
  nest.sheets.forEach((s, si) => s.placements.forEach(pl => {
    const p = partByUid.get(pl.baseUid)
    if (!p) return
    rows.push({
      no: nos.get(pl.uid)!, sheet: si + 1, cab: p.cabinet_label, part: p.label,
      w: pl.rotated ? pl.h : pl.w, h: pl.rotated ? pl.w : pl.h, finW: p.w, finH: p.h, rotated: pl.rotated,
      holes: holesIn(pl, drillsBySheet.get(s.index) ?? []).length, comment: p.comment,
      gm: gm.has(pl.uid) ? grainMatchLine(gm.get(pl.uid)!) : null,
    })
  }))
  return rows
}

export interface CutSheetsInput {
  nest: NestResult
  partByUid: Map<string, OptiPart>
  drillsBySheet: Map<number, Drill[]>
  deductEb: boolean
  jobNumber: string | null
  projectName: string
  scope: string                              // e.g. the rooms in the run
  materialName: (id: string | null) => string
  fileNames?: (string | undefined)[]         // G-code program per sheet, when known
  runCode?: string | null                    // saved run, e.g. RHK6570-R3
  date?: Date
}

export interface CutSheetsOptions {
  sheets?: Set<number> | null                // sheet numbers (1-based) to print; null = all
  holes: boolean
  partsList: boolean
}

export async function cutSheetsPdf(inp: CutSheetsInput, opt: CutSheetsOptions): Promise<JsPDF> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const PW = 297, PH = 210, M = 10
  const { nest, partByUid } = inp
  const nos = partNumbers(nest)
  const total = nest.sheets.length
  const d = inp.date ?? new Date()
  const dateTxt = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  const title = `${inp.jobNumber ?? ''} ${inp.projectName.replace(inp.jobNumber ?? '', '').trim()}  ·  ${inp.scope}`.trim()
  let pages = 0

  nest.sheets.forEach((sheet, si) => {
    if (opt.sheets && !opt.sheets.has(si + 1)) return
    if (pages++) doc.addPage()
    const drills = inp.drillsBySheet.get(sheet.index) ?? []
    const { w: W, h: H } = sheet.stock
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
    doc.text(title, M, M + 4)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5)
    const eff = (sheet.efficiency * 100).toFixed(0)
    const file = inp.fileNames?.[si]
    doc.text(`${inp.materialName(sheet.materialId)}  ·  Sheet ${si + 1} of ${total}  ·  ${W} × ${H}  ·  ${sheet.placements.length} parts  ·  ${drills.length} holes  ·  ${eff}% used${file ? `  ·  ${file}` : ''}`, M, M + 10)
    doc.text(`${inp.runCode ? `Run ${inp.runCode}   ` : ''}${dateTxt}`, PW - M, M + 4, { align: 'right' })

    const top = M + 15
    const s = Math.min((PW - 2 * M) / W, (PH - top - M - 6) / H)
    const ox = M, oy = top
    const X = (x: number) => ox + x * s, Y = (y: number) => oy + (H - y) * s
    doc.setDrawColor(40); doc.setLineWidth(0.4); doc.rect(ox, oy, W * s, H * s, 'S')
    doc.setLineDashPattern([1.2, 1], 0); doc.setLineWidth(0.15); doc.setDrawColor(140)
    doc.rect(X(sheet.stock.trimLeft), Y(H - sheet.stock.trimTop), (W - sheet.stock.trimLeft - sheet.stock.trimRight) * s, (H - sheet.stock.trimTop - sheet.stock.trimBottom) * s, 'S')
    doc.setLineDashPattern([], 0)
    // Machine origin hint (sheet bottom-left).
    doc.setFontSize(6.5); doc.setTextColor(120); doc.text('0,0', ox + 0.6, oy + H * s - 0.8); doc.setTextColor(0)

    for (const pl of sheet.placements) {
      const p = partByUid.get(pl.baseUid)
      if (!p) continue
      const local = placedOutline(p, pl, inp.deductEb)
      doc.setDrawColor(20); doc.setLineWidth(0.3); doc.setFillColor(236, 240, 245)
      if (local) {
        // Shaped part: its placement rectangle dashed, the cut outline solid.
        doc.setLineDashPattern([0.8, 0.8], 0); doc.setLineWidth(0.1); doc.rect(X(pl.x), Y(pl.y + pl.h), pl.w * s, pl.h * s, 'S')
        doc.setLineDashPattern([], 0); doc.setLineWidth(0.3)
        const pts = local.map(q => [X(pl.x + q.x), Y(pl.y + q.y)] as [number, number])
        doc.lines(pts.slice(1).map((q, i) => [q[0] - pts[i][0], q[1] - pts[i][1]]), pts[0][0], pts[0][1], [1, 1], 'FD', true)
      } else doc.rect(X(pl.x), Y(pl.y + pl.h), pl.w * s, pl.h * s, 'FD')
      // Holes as small circles (true size, min 0.35 mm so 5 mm pins show).
      if (opt.holes) {
        doc.setDrawColor(200, 40, 40); doc.setLineWidth(0.12)
        for (const hd of holesIn(pl, drills)) doc.circle(X(hd.x), Y(hd.y), Math.max(0.35, hd.diameter / 2 * s), 'S')
        doc.setDrawColor(20)
      }
      // Label: number big, then cabinet + part + cut size when it fits.
      const cx = X(pl.x + pl.w / 2), cy = Y(pl.y + pl.h / 2)
      const bw = pl.w * s - 1.5, bh = pl.h * s
      const no = String(nos.get(pl.uid))
      const cutW = pl.rotated ? pl.h : pl.w, cutH = pl.rotated ? pl.w : pl.h
      const lines = [`${p.cabinet_label}  ${p.label}`, `${Math.round(cutH * 10) / 10} × ${Math.round(cutW * 10) / 10}${pl.rotated ? ' (R)' : ''}${p.grain_across ? ' grain across' : ''}`]
      const fit = (txt: string, max: number, min: number) => {
        let f = max
        doc.setFontSize(f)
        while (f > min && doc.getTextWidth(txt) > bw) { f -= 0.5; doc.setFontSize(f) }
        return doc.getTextWidth(txt) <= bw ? f : 0
      }
      doc.setFont('helvetica', 'bold')
      const nfs = Math.min(fit(no, 11, 5), bh / 0.3528 * 0.55)
      const detail = bh > 9 ? lines.map(l => { doc.setFont('helvetica', 'normal'); return fit(l, 7, 4.5) }) : [0, 0]
      const shown = detail.filter(f => f > 0).length
      const blockH = (nfs > 0 ? nfs * 0.3528 : 0) + shown * 2.8
      let ty = cy - blockH / 2 + (nfs > 0 ? nfs * 0.3528 * 0.8 : 0)
      if (nfs > 0) { doc.setFont('helvetica', 'bold'); doc.setFontSize(nfs); doc.text(no, cx, ty, { align: 'center' }) }
      doc.setFont('helvetica', 'normal')
      lines.forEach((l, i) => {
        if (!detail[i]) return
        ty += 2.8
        doc.setFontSize(detail[i]); doc.text(l, cx, ty, { align: 'center' })
      })
    }
    // Grain match blocks (z_grain_match G5): dashed outline in the group colour + tag.
    for (const b of nest.blocks ?? []) {
      const r = blockRectOn(sheet, b)
      if (!r) continue
      const hex = grainMatchColour(b).slice(1)
      const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
      const pad = 1.2
      doc.setDrawColor(...rgb); doc.setLineWidth(0.5); doc.setLineDashPattern([2, 1], 0)
      doc.rect(X(r.x) - pad, Y(r.y + r.h) - pad, r.w * s + 2 * pad, r.h * s + 2 * pad, 'S')
      doc.setLineDashPattern([], 0)
      const tag = `${b.name} ${b.direction === 'horizontal' ? 'grain across' : 'grain up'}${b.pieces > 1 ? `  ${b.piece}/${b.pieces}` : ''}`
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
      const tw = doc.getTextWidth(tag) + 2
      doc.setFillColor(...rgb); doc.rect(X(r.x) - pad, Y(r.y + r.h) - pad, tw, 3.4, 'F')
      doc.setTextColor(255); doc.text(tag, X(r.x) - pad + 1, Y(r.y + r.h) - pad + 2.5); doc.setTextColor(0)
      doc.setDrawColor(40); doc.setLineWidth(0.3); doc.setFont('helvetica', 'normal')
    }
    doc.setFontSize(7); doc.setTextColor(110)
    doc.text(`Sizes are cut size, length (grain) × width.  (R) = turned 90° on the sheet.  "grain across" = grain runs along the width (horizontal grain match).${opt.holes ? '  Red circles = drilling.' : ''}`, M, PH - M + 3)
    doc.setTextColor(0)
  })

  if (opt.partsList) {
    const rows = cutSheetRows(nest, partByUid, inp.drillsBySheet).filter(r => !opt.sheets || opt.sheets.has(r.sheet))
    if (pages++) doc.addPage()
    const head = ['Sheet', '#', 'Cabinet', 'Part', 'Cut L × W', 'Finished L × W', 'Holes', 'Grain match', 'Comment']
    const colX = [M, M + 12, M + 24, M + 54, M + 124, M + 160, M + 198, M + 212, M + 238]
    let y = M + 4
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
    doc.text(`Parts list — ${title}  ·  ${rows.length} parts${inp.runCode ? `  ·  Run ${inp.runCode}` : ''}`, M, y)
    y += 8
    const header = () => { doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); head.forEach((h, i) => doc.text(h, colX[i], y)); doc.setLineWidth(0.2); doc.line(M, y + 1.2, PW - M, y + 1.2); y += 5.5; doc.setFont('helvetica', 'normal') }
    header()
    const r1 = (n: number) => String(Math.round(n * 10) / 10)
    for (const r of rows) {
      if (y > PH - M) { doc.addPage(); y = M + 4; header() }
      const cells = [String(r.sheet), String(r.no), r.cab, r.part, `${r1(r.h)} × ${r1(r.w)}`, `${r1(r.finH)} × ${r1(r.finW)}`, String(r.holes), r.gm ?? '', r.comment ?? '']
      cells.forEach((c, i) => doc.text(doc.splitTextToSize(c, (colX[i + 1] ?? PW - M) - colX[i] - 2)[0] ?? '', colX[i], y))
      y += 5
    }
  }
  return doc
}
