/**
 * Generates an elevation PDF directly using jsPDF primitives.
 * No SVG → canvas → image conversion. All geometry is calculated
 * from raw wall/cabinet data and drawn with doc.line / doc.rect / doc.text.
 */
import { jsPDF } from 'jspdf'
import type { Wall, Room, CabinetInstance } from '@/src/lib/types'
import { cabT } from '@/src/lib/geometry'

// ── Physical annotation sizes (mm on paper — fixed regardless of scale) ──────
const SW    = 0.45   // main stroke width
const THIN  = 0.22   // thin/witness stroke
const FS    = 3.5    // cabinet label (mm → pt via ×2.835)
const DFS   = 3.0    // dimension text
const TFS   = 5.5    // wall title
const TICK  = 3.0    // tick half-height

// ── Fixed layout margins (mm on paper) ───────────────────────────────────────
const LEFT_W  = 22   // left margin for height markers
const RIGHT_W =  5
const TOP_PAD =  8
const TITLE_H = 10
const CEIL_GAP =  5   // gap between title block and ceiling line
const DIM_GAP = 10   // floor → first dim row
const DIM_ROW = 17   // vertical space per dim row

const STANDARD_SCALES = [5, 10, 15, 20, 25, 50, 100]
const MM_PER_PT = 1 / 2.835

function wallCabTopH(wall: Wall, room: Room): number {
  if (wall.soffit_height != null)
    return (wall.height ?? room.room_dy ?? 2400) - wall.soffit_height
  return room.soffit_height ?? room.wall_cabinet_top ?? 2100
}

function cabFloorH(cab: CabinetInstance, wall: Wall, room: Room): number {
  if (cab.assembly_class === 'wall' || cab.assembly_class === 'wall_corner')
    return wallCabTopH(wall, room) - cab.dy
  return 0
}

function widthChain(
  cabs: CabinetInstance[],
  wall: Wall,
): { from: number; to: number; len: number }[] {
  const sorted = [...cabs].sort((a, b) => cabT(a, wall) - cabT(b, wall))
  const segs: { from: number; to: number; len: number }[] = []
  let cursor = 0
  for (const cab of sorted) {
    const t = cabT(cab, wall)
    if (t > cursor + 1) segs.push({ from: cursor, to: t, len: Math.round(t - cursor) })
    segs.push({ from: t, to: t + cab.dx, len: Math.round(cab.dx) })
    cursor = t + cab.dx
  }
  if (cursor < wall.length - 1)
    segs.push({ from: cursor, to: wall.length, len: Math.round(wall.length - cursor) })
  return segs
}

/** Returns the smallest standard scale that fits wall + room on the given paper. */
function computeAutoScale(wall: Wall, room: Room, paperW: number, paperH: number): number {
  const roomH   = room.room_dy ?? 2400
  const fixedH  = TOP_PAD + TITLE_H + CEIL_GAP + DIM_GAP + DIM_ROW * 2
  const availW  = paperW - LEFT_W - RIGHT_W
  const availH  = paperH - fixedH

  const minScaleW = wall.length / availW
  const minScaleH = roomH / availH
  const minScale  = Math.max(minScaleW, minScaleH)

  return STANDARD_SCALES.find(s => s >= minScale) ?? 100
}

function drawHeightMarker(
  doc: jsPDF,
  x: number,
  yLow: number,   // lower point in PDF coords (closer to floor)
  yHigh: number,  // upper point in PDF coords (closer to ceiling)
  label: string,
) {
  const my = (yLow + yHigh) / 2
  doc.setDrawColor(80); doc.setLineWidth(THIN)
  doc.line(x - TICK, yLow,  x + TICK, yLow)
  doc.line(x - TICK, yHigh, x + TICK, yHigh)
  doc.line(x, yLow, x, yHigh)
  doc.setFontSize(DFS / MM_PER_PT * 0.9)
  doc.setTextColor(80)
  doc.text(label, x - TICK * 2, my, { angle: 90, align: 'center', baseline: 'middle' })
}

function drawElevationPage(
  doc: jsPDF,
  wall: Wall,
  cabs: CabinetInstance[],
  room: Room,
  scale: number,
) {
  const S      = 1 / scale          // model mm → physical mm
  const roomH  = room.room_dy ?? 2400
  const cabTop = wallCabTopH(wall, room)
  const wallW  = wall.length * S    // physical mm
  const roomHmm = roomH * S

  // Y positions (PDF: top=0, increases down)
  const titleCY = TOP_PAD + TITLE_H / 2
  const ceilY   = TOP_PAD + TITLE_H + CEIL_GAP
  const floorY  = ceilY + roomHmm
  const dimR1Y  = floorY + DIM_GAP + DIM_ROW * 0.52
  const dimR2Y  = floorY + DIM_GAP + DIM_ROW * 1.55

  // X origin for wall left edge
  const ox = LEFT_W

  // height-from-floor → PDF Y
  const sy = (h: number) => floorY - h * S

  // ── Title ─────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(TFS / MM_PER_PT)
  doc.setTextColor(0)
  doc.text(wall.name, ox + wallW / 2, titleCY, { align: 'center', baseline: 'middle' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(DFS / MM_PER_PT * 0.9)
  doc.setTextColor(100)
  doc.text(`1:${scale}`, ox + wallW + RIGHT_W - 1, titleCY, { align: 'right', baseline: 'middle' })

  // ── Ceiling ────────────────────────────────────────────────────────────────
  doc.setDrawColor(180); doc.setLineWidth(THIN)
  ;(doc as any).setLineDash([SW * 6, SW * 3])
  doc.line(ox, ceilY, ox + wallW, ceilY)
  ;(doc as any).setLineDash([])
  doc.setFontSize(DFS / MM_PER_PT * 0.85)
  doc.setTextColor(150)
  doc.text(`C ${roomH}`, ox + wallW + 1, ceilY, { align: 'left', baseline: 'middle' })

  // ── Soffit / wall-cab top ─────────────────────────────────────────────────
  if (cabTop < roomH - 20) {
    const soffitY = sy(cabTop)
    doc.setDrawColor(200); doc.setLineWidth(THIN)
    ;(doc as any).setLineDash([SW * 3, SW * 2])
    doc.line(ox, soffitY, ox + wallW, soffitY)
    ;(doc as any).setLineDash([])
    doc.setTextColor(180)
    doc.text(`WC ${cabTop}`, ox + wallW + 1, soffitY, { align: 'left', baseline: 'middle' })
  }

  // ── Cabinets ──────────────────────────────────────────────────────────────
  doc.setTextColor(0)
  for (const cab of cabs) {
    const t   = cabT(cab, wall) * S
    const fH  = cabFloorH(cab, wall, room)
    const top = sy(fH + cab.dy)
    const ht  = cab.dy * S
    const wd  = cab.dx * S
    const ins = Math.min(SW * 4, wd * 0.05, ht * 0.05)

    doc.setDrawColor(17); doc.setLineWidth(SW); doc.setFillColor(255, 255, 255)
    doc.rect(ox + t, top, wd, ht, 'FD')

    doc.setDrawColor(200); doc.setLineWidth(THIN)
    doc.rect(ox + t + ins, top + ins, wd - ins * 2, ht - ins * 2)

    if (cab.label && wd > 4 && ht > 4) {
      doc.setFontSize(Math.min(FS / MM_PER_PT, (wd * 0.9) / MM_PER_PT, (ht * 0.9) / MM_PER_PT))
      doc.setDrawColor(0); doc.setTextColor(17)
      doc.text(cab.label, ox + t + wd / 2, top + ht / 2, { align: 'center', baseline: 'middle' })
    }
  }

  // ── Floor line ────────────────────────────────────────────────────────────
  doc.setDrawColor(17); doc.setLineWidth(SW * 3)
  doc.line(ox - THIN, floorY, ox + wallW + THIN, floorY)
  doc.setFontSize(DFS / MM_PER_PT * 0.85)
  doc.setTextColor(80)
  doc.text('±0', ox - 1, floorY, { align: 'right', baseline: 'middle' })

  // ── Width dimension chain ─────────────────────────────────────────────────
  const chain = widthChain(cabs, wall)
  const witnessXs = new Set<number>([0, wall.length])
  chain.forEach(s => { witnessXs.add(s.from); witnessXs.add(s.to) })

  // Witness lines
  doc.setDrawColor(120); doc.setLineWidth(THIN * 0.8)
  ;(doc as any).setLineDash([SW * 2.5, SW * 1.2])
  for (const x of witnessXs) {
    doc.line(ox + x * S, floorY + SW, ox + x * S, dimR1Y + DIM_ROW * 0.63)
  }
  ;(doc as any).setLineDash([])

  // Row 1 — individual segments
  doc.setDrawColor(50); doc.setLineWidth(THIN)
  for (const seg of chain) {
    const x1 = ox + seg.from * S, x2 = ox + seg.to * S, mx = (x1 + x2) / 2
    doc.line(x1, dimR1Y, x2, dimR1Y)
    doc.line(x1, dimR1Y - TICK, x1, dimR1Y + TICK)
    doc.line(x2, dimR1Y - TICK, x2, dimR1Y + TICK)
    if (x2 - x1 >= 8) {
      doc.setFontSize(DFS / MM_PER_PT)
      doc.setTextColor(17)
      doc.text(String(seg.len), mx, dimR1Y - DFS * 0.65, { align: 'center', baseline: 'bottom' })
    }
  }

  // Row 2 — overall width
  doc.setDrawColor(17); doc.setLineWidth(SW * 0.9)
  doc.line(ox, dimR2Y, ox + wallW, dimR2Y)
  doc.line(ox, dimR2Y - TICK * 1.4, ox, dimR2Y + TICK * 1.4)
  doc.line(ox + wallW, dimR2Y - TICK * 1.4, ox + wallW, dimR2Y + TICK * 1.4)
  doc.setFontSize(DFS * 1.1 / MM_PER_PT)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(17)
  doc.text(
    String(Math.round(wall.length)),
    ox + wallW / 2, dimR2Y - DFS * 0.85,
    { align: 'center', baseline: 'bottom' },
  )
  doc.setFont('helvetica', 'normal')

  // ── Height markers (left side) ────────────────────────────────────────────
  const hmX = ox - LEFT_W * 0.58
  drawHeightMarker(doc, hmX, floorY, ceilY, `${roomH}`)
  if (cabTop < roomH - 20) {
    drawHeightMarker(doc, hmX - TICK * 4, sy(cabTop), ceilY, `${Math.round(roomH - cabTop)}`)
  }
}

/** Public entry point — returns a jsPDF document ready to save. */
export function generateElevationPDF(
  walls: Wall[],
  cabinets: CabinetInstance[],
  room: Room,
  paper: { w: number; h: number },
): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: [paper.w, paper.h] })

  const standard = walls.filter(w => w.wall_type === 'standard')
  standard.forEach((wall, i) => {
    if (i > 0) doc.addPage([paper.w, paper.h])
    const wallCabs = cabinets.filter(c => c.wall_id === wall.id)
    const scale    = computeAutoScale(wall, room, paper.w, paper.h)
    drawElevationPage(doc, wall, wallCabs, room, scale)
  })

  return doc
}
