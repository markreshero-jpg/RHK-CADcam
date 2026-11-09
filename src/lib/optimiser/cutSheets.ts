// ============================================================
// Cut sheets report — one A4 landscape page per nested sheet (the cut
// pattern: part outlines, numbers, cut sizes, holes, grain-match blocks) plus a
// parts list. Optimiser Stage 7 and the headless run. Part numbers restart on
// each sheet, the same as the labels (labels.partNumbers).
// ============================================================

import type { jsPDF as JsPDF } from 'jspdf'
import type { OptiPart } from './types'
import type { NestResult } from './nest'
import { placedOutline, placedHoles } from './shapes'
import { blockRectOn, grainMatchTags, grainMatchLine } from './grainBlocks'
import { grainMatchColour } from '../grainMatch'
import { partNumbers, sheetPartOrder, holesIn, sheetNumbers } from './labels'
import { sixthFaceZMap, sixthFaceTrimStrips, SIXTH_FACE_TRIM, type SheetRoute, type PostProfile } from './gcode'

// program: 6th face (drills.ts ProgramFace) — which half of the page it shows in.
type Drill = { x: number; y: number; diameter: number; program?: 'A' | 'Z' }

export interface CutSheetRow {
  no: number; sheet: number; sheetNo: number; materialId: string | null; cab: string; part: string
  w: number; h: number; finW: number; finH: number; rotated: boolean
  holes: number; comment: string | null; gm: string | null
}

/** The parts list: sheet by sheet, in part-number order. */
export function cutSheetRows(nest: NestResult, partByUid: Map<string, OptiPart>, drillsBySheet: Map<number, Drill[]>): CutSheetRow[] {
  const nos = partNumbers(nest)
  const sheetNos = sheetNumbers(nest.sheets)
  const gm = grainMatchTags(nest)
  const rows: CutSheetRow[] = []
  nest.sheets.forEach((s, si) => sheetPartOrder(s.placements).forEach(pl => {
    const p = partByUid.get(pl.baseUid)
    if (!p) return
    rows.push({
      no: nos.get(pl.uid)!, sheet: si + 1, sheetNo: sheetNos.get(s.index)!.no, materialId: s.materialId, cab: p.cabinet_label, part: p.label,
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
  // Routing features per sheet (pockets, grooves, notches, profile routes), in
  // sheet coords — exactly what the G-code cuts. Drawn when opt.routes.
  routesBySheet?: Map<number, SheetRoute[]>
  deductEb: boolean
  jobNumber: string | null
  projectName: string
  scope: string                              // e.g. the rooms in the run
  materialName: (id: string | null) => string
  fileNames?: (string | undefined)[]         // G-code program per sheet, when known
  runCode?: string | null                    // saved run, e.g. RHK6570-R3
  date?: Date
  // 6th face sheets (sheet index): the page shows program A on top and the sheet
  // as it lies for program Z (flipped over the long edge, trimmed) below. The
  // machine datum corner says which edges are trimmed and how Z mirrors.
  sixthFace?: Set<number>
  datum?: Pick<PostProfile, 'origin_corner'>
}

export interface CutSheetsOptions {
  sheets?: Set<number> | null                // sheet numbers (1-based) to print; null = all
  holes: boolean
  routes?: boolean
  partsList: boolean
}

export async function cutSheetsPdf(inp: CutSheetsInput, opt: CutSheetsOptions): Promise<JsPDF> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const PW = 297, PH = 210, M = 10
  const { nest, partByUid } = inp
  const nos = partNumbers(nest)
  const sheetNos = sheetNumbers(nest.sheets)
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
    doc.text(`${inp.materialName(sheet.materialId)}  ·  Sheet ${sheetNos.get(sheet.index)!.no} of ${sheetNos.get(sheet.index)!.of}  ·  ${W} × ${H}  ·  ${sheet.placements.length} parts  ·  ${drills.length} holes${opt.routes ? `  ·  ${inp.routesBySheet?.get(sheet.index)?.length ?? 0} routes` : ''}  ·  ${eff}% used${file ? `  ·  ${file}` : ''}`, M, M + 10)
    doc.text(`${inp.runCode ? `Run ${inp.runCode}   ` : ''}${dateTxt}`, PW - M, M + 4, { align: 'right' })

    const allRoutes = opt.routes ? inp.routesBySheet?.get(sheet.index) ?? [] : []
    const routes = allRoutes
    // One picture, or (6th face) two: A = the sheet as loaded, Z = flipped + trimmed.
    // Everything is laid out in program A's frame; a view maps it to its picture.
    type Pt = { x: number; y: number }
    type View = { tag: string | null; W: number; H: number; T: (q: Pt) => Pt; drills: Drill[]; routes: SheetRoute[]; trims: boolean }
    const datum = inp.datum ?? { origin_corner: 'top_left' }
    const sixth = !!inp.sixthFace?.has(sheet.index)
    const views: View[] = sixth
      ? [
          { tag: 'PROGRAM A  -  back face up: back drilling + routes, 5mm trimmed off the orange edges, parts stay in. Then flip over the long edge.',
            W, H, T: q => q, drills: drills.filter(d => d.program !== 'Z'), routes: allRoutes.filter(r => r.program !== 'Z'), trims: true },
          { tag: 'PROGRAM Z  -  after the flip, trimmed edges to X0 / Y0: face routes, then every part cut out.',
            W: W - SIXTH_FACE_TRIM, H: H - SIXTH_FACE_TRIM, T: sixthFaceZMap(sheet, datum).pt, drills: drills.filter(d => d.program === 'Z'), routes: allRoutes.filter(r => r.program === 'Z'), trims: false },
        ]
      : [{ tag: null, W, H, T: q => q, drills, routes: allRoutes, trims: false }]

    const areaTop = M + 15, areaH = PH - areaTop - M - 6
    const slotH = areaH / views.length
    views.forEach((v, vi) => {
    const top = areaTop + vi * slotH + (v.tag ? 5 : 0)
    const s = Math.min((PW - 2 * M) / v.W, (slotH - (v.tag ? 7 : 0)) / v.H)
    const ox = M, oy = top
    if (v.tag) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(150, 90, 0)
      doc.text(v.tag, M, top - 1.6)
      doc.setTextColor(0); doc.setFont('helvetica', 'normal')
    }
    // A-frame sheet coords → this picture (y up on the sheet, down on the page).
    const P = (x: number, y: number) => { const t = v.T({ x, y }); return [ox + t.x * s, oy + (v.H - t.y) * s] as [number, number] }
    const X = (x: number) => P(x, 0)[0]
    const Y = (y: number) => P(0, y)[1]
    // A sheet-space rectangle on the picture (a mirrored view swaps its corners).
    const rectP = (x: number, y: number, w: number, h: number, style: string) => {
      const a = P(x, y), b = P(x + w, y + h)
      doc.rect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), style)
    }
    doc.setDrawColor(40); doc.setLineWidth(0.4); doc.rect(ox, oy, v.W * s, v.H * s, 'S')
    if (v.trims) {
      // 5mm is a hair at this scale (and under the parts): mark each trimmed edge
      // with a 1.2mm orange band just outside the sheet.
      doc.setFillColor(240, 130, 70)
      const B = 1.2, SW = v.W * s, SH = v.H * s
      for (const t of sixthFaceTrimStrips(sheet, datum)) {
        const a = P(t.x, t.y), b = P(t.x + t.w, t.y + t.h)
        const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1])
        if (w < h) doc.rect(x < ox + SW / 2 ? ox - B : ox + SW, oy, B, SH, 'F')     // an end
        else doc.rect(ox, y < oy + SH / 2 ? oy - B : oy + SH, SW, B, 'F')             // a long edge
      }
    }
    doc.setLineDashPattern([1.2, 1], 0); doc.setLineWidth(0.15); doc.setDrawColor(140)
    rectP(sheet.stock.trimLeft, sheet.stock.trimBottom, W - sheet.stock.trimLeft - sheet.stock.trimRight, H - sheet.stock.trimTop - sheet.stock.trimBottom, 'S')
    doc.setLineDashPattern([], 0)
    // Machine origin hint (picture bottom-left).
    doc.setFontSize(6.5); doc.setTextColor(120); doc.text('0,0', ox + 0.6, oy + v.H * s - 0.8); doc.setTextColor(0)
    const labelJobs: (() => void)[] = []
    for (const pl of sheet.placements) {
      const p = partByUid.get(pl.baseUid)
      if (!p) continue
      const local = placedOutline(p, pl, inp.deductEb)
      doc.setDrawColor(20); doc.setLineWidth(0.3); doc.setFillColor(236, 240, 245)
      if (local) {
        // Shaped part: its placement rectangle dashed, the cut outline solid.
        doc.setLineDashPattern([0.8, 0.8], 0); doc.setLineWidth(0.1); rectP(pl.x, pl.y, pl.w, pl.h, 'S')
        doc.setLineDashPattern([], 0); doc.setLineWidth(0.3)
        const pts = local.map(q => P(pl.x + q.x, pl.y + q.y))
        doc.lines(pts.slice(1).map((q, i) => [q[0] - pts[i][0], q[1] - pts[i][1]]), pts[0][0], pts[0][1], [1, 1], 'FD', true)
      } else rectP(pl.x, pl.y, pl.w, pl.h, 'FD')
      // Through cut-outs (rangehood hole, rib cut-outs, benchtop sinks): white holes.
      if (opt.routes) {
        doc.setFillColor(255, 255, 255); doc.setDrawColor(30, 90, 200); doc.setLineWidth(0.2)
        for (const h of placedHoles(p as Parameters<typeof placedHoles>[0], pl, inp.deductEb)) {
          if (h.length < 3) continue
          const hp = h.map(q => P(pl.x + q.x, pl.y + q.y))
          doc.lines(hp.slice(1).map((q, i) => [q[0] - hp[i][0], q[1] - hp[i][1]]), hp[0][0], hp[0][1], [1, 1], 'FD', true)
        }
        doc.setDrawColor(20); doc.setLineWidth(0.3)
      }
      // Holes as small circles (true size, min 0.35 mm so 5 mm pins show).
      if (opt.holes) {
        doc.setDrawColor(200, 40, 40); doc.setLineWidth(0.12)
        for (const hd of holesIn(pl, v.drills)) { const c = P(hd.x, hd.y); doc.circle(c[0], c[1], Math.max(0.35, hd.diameter / 2 * s), 'S') }
        doc.setDrawColor(20)
      }
      // Label (drawn after the routes, so a pocket never covers it): number big,
      // then cabinet + part + cut size when it fits.
      labelJobs.push(() => {
        // Label: number big, then cabinet + part + cut size when it fits.
        const [cx, cy] = P(pl.x + pl.w / 2, pl.y + pl.h / 2)
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
      })
    }
    // Routes (Mark, 2026-11-05: show every route on the cut sheet). Blue: a
    // cleared pocket is filled, an outline-only route is its rectangle, a groove
    // is a band its width; each tagged with tool + depth when it fits.
    for (const r of v.routes) {
      doc.setDrawColor(30, 90, 200); doc.setFillColor(205, 222, 250); doc.setLineWidth(0.15)
      let tx: number, ty: number, room: number
      if (r.kind === 'groove') {
        const L = Math.hypot(r.x2 - r.x1, r.y2 - r.y1) || 1
        const nx = -(r.y2 - r.y1) / L * r.width / 2, ny = (r.x2 - r.x1) / L * r.width / 2
        const q = [[r.x1 + nx, r.y1 + ny], [r.x2 + nx, r.y2 + ny], [r.x2 - nx, r.y2 - ny], [r.x1 - nx, r.y1 - ny]].map(([x, y]) => P(x, y))
        doc.lines(q.slice(1).map((v, i) => [v[0] - q[i][0], v[1] - q[i][1]]), q[0][0], q[0][1], [1, 1], 'FD', true)
        ;[tx, ty] = P((r.x1 + r.x2) / 2, (r.y1 + r.y2) / 2); room = L * s
      } else {
        if (r.corners) continue                                 // corner clean-up: same rectangle as its pocket
        const fill = r.clear && !(r.ringWidth != null && r.ringWidth > 0)
        rectP(r.x, r.y, r.w, r.h, fill ? 'FD' : 'S')
        if (r.clear && r.ringWidth != null && r.ringWidth > 0) {
          const b = r.ringWidth
          doc.setLineDashPattern([0.6, 0.6], 0)
          if (r.w > 2 * b && r.h > 2 * b) rectP(r.x + b, r.y + b, r.w - 2 * b, r.h - 2 * b, 'S')
          doc.setLineDashPattern([], 0)
        }
        // Tag at the top inside edge, clear of the part label in the middle.
        const ca = P(r.x, r.y), cb = P(r.x + r.w, r.y + r.h)
        tx = (ca[0] + cb[0]) / 2; ty = Math.min(ca[1], cb[1]) + 1.6; room = Math.abs(cb[0] - ca[0])
      }
      const tag = `T${r.toolNumber} ${Math.round(r.depth * 10) / 10}d`
      doc.setFontSize(5); doc.setTextColor(30, 90, 200)
      if (doc.getTextWidth(tag) < room) doc.text(tag, tx, ty + 0.6, { align: 'center' })
      doc.setTextColor(0); doc.setDrawColor(20)
    }
    labelJobs.forEach(f => f())

    // Grain match blocks (z_grain_match G5): dashed outline in the group colour + tag.
    for (const b of nest.blocks ?? []) {
      const r = blockRectOn(sheet, b)
      if (!r) continue
      const hex = grainMatchColour(b).slice(1)
      const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
      const pad = 1.2
      const ca = P(r.x, r.y), cb = P(r.x + r.w, r.y + r.h)
      const bx = Math.min(ca[0], cb[0]), by = Math.min(ca[1], cb[1])
      doc.setDrawColor(...rgb); doc.setLineWidth(0.5); doc.setLineDashPattern([2, 1], 0)
      doc.rect(bx - pad, by - pad, r.w * s + 2 * pad, r.h * s + 2 * pad, 'S')
      doc.setLineDashPattern([], 0)
      const tag = b.pair ? `${b.name} pair` : `${b.name} ${b.direction === 'horizontal' ? 'grain across' : 'grain up'}${b.pieces > 1 ? `  ${b.piece}/${b.pieces}` : ''}`
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
      const tw = doc.getTextWidth(tag) + 2
      doc.setFillColor(...rgb); doc.rect(bx - pad, by - pad, tw, 3.4, 'F')
      doc.setTextColor(255); doc.text(tag, bx - pad + 1, by - pad + 2.5); doc.setTextColor(0)
      doc.setDrawColor(40); doc.setLineWidth(0.3); doc.setFont('helvetica', 'normal')
    }
    })
    doc.setFontSize(7); doc.setTextColor(110)
    doc.text(`Sizes are cut size, length (grain) × width.  (R) = turned 90° on the sheet.  "grain across" = grain runs along the width (horizontal grain match).${opt.holes ? '  Red circles = drilling.' : ''}${routes.length ? '  Blue = routing (filled = pocket cleared, T = tool, d = depth).' : ''}${sixth ? '  Orange = 6th face trim.' : ''}`, M, PH - M + 3)
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
    let mat: string | null | undefined
    for (const r of rows) {
      if (y > PH - M - (r.materialId !== mat ? 6 : 0)) { doc.addPage(); y = M + 4; header() }
      // Sheet numbers restart per material — a heading line where the material changes.
      if (r.materialId !== mat) {
        mat = r.materialId
        doc.setFont('helvetica', 'bold'); doc.text(inp.materialName(mat), M, y + 0.5); doc.setFont('helvetica', 'normal')
        y += 5.5
      }
      const cells = [String(r.sheetNo), String(r.no), r.cab, r.part, `${r1(r.h)} × ${r1(r.w)}`, `${r1(r.finH)} × ${r1(r.finW)}`, String(r.holes), r.gm ?? '', r.comment ?? '']
      cells.forEach((c, i) => doc.text(doc.splitTextToSize(c, (colX[i + 1] ?? PW - M) - colX[i] - 2)[0] ?? '', colX[i], y))
      y += 5
    }
  }
  return doc
}
