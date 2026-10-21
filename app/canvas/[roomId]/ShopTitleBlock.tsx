// Shop drawings title block (z_shop_drawings S1) — the Cabinet Vision layout:
// signature line above; company | job | scale | sheet box; copyright below.
// A standalone SVG in paper mm (viewBox units = mm), placed at the foot of each
// PDF page by the report exports, so it prints at the same size at any scale.
'use client'
import { todayDdMmYy, type CompanyTitleInfo } from '@/src/lib/shopDrawings/companyTitle'
import type { Project, Room } from '@/src/lib/types'

export interface SheetTitleInfo {
  /** Job number + client, e.g. "RHK6456  Jeff and Suzie Morris". */
  jobLine:    string
  /** What's drawn, e.g. the room name. */
  drawingLine: string
  /** Site address. */
  siteLine:   string
  scale:      number
  sheetNo:    number
  sheetCount: number
  drawnBy:    string
  date:       string
}

export function sheetTitle(project: Project | null, room: Room, scale: number, sheetNo: number, sheetCount: number): SheetTitleInfo {
  return {
    jobLine:     [project?.job_number, project?.client_name || project?.name].filter(Boolean).join('  '),
    drawingLine: room.name,
    siteLine:    project?.client_address ?? '',
    scale, sheetNo, sheetCount,
    drawnBy: '',
    date:    todayDdMmYy(),
  }
}

/** Paper-mm placement of a page's title block and the drawing area left above it. */
export function pageLayout(paper: { w: number; h: number }, margin: number, tbH: number | null) {
  const usableW = paper.w - margin * 2
  const gap = 4
  const tb = tbH == null ? null : { x: margin, y: paper.h - margin - tbH, w: usableW, h: tbH }
  return { usableW, usableH: paper.h - margin * 2 - (tb ? tbH! + gap : 0), tb }
}

const FONT = 'Arial, Helvetica, sans-serif'
const INK = '#000'
const BOX_H = 24          // main box
const ROW_H = BOX_H / 3
const SIG_H = 6           // signature line above the box
const COPY_H = 4.5        // copyright line below the box
const LINE_OUTER = 0.35   // pen widths, paper mm
const LINE_INNER = 0.18

/** Total height in paper mm, for page layout. */
export function titleBlockHeight(company: CompanyTitleInfo): number {
  return (company.signatureLine ? SIG_H : 0) + BOX_H + (company.copyright ? COPY_H : 0)
}

/** Trim text to fit a width (Helvetica averages ~0.55 em per character). */
function fit(text: string, maxW: number, fs: number): string {
  const max = Math.floor(maxW / (fs * 0.55))
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`
}

export default function ShopTitleBlock({ company, sheet, width }: {
  company: CompanyTitleInfo
  sheet:   SheetTitleInfo
  /** Paper mm — normally the page's usable width. */
  width:   number
}) {
  const h = titleBlockHeight(company)
  const boxY = company.signatureLine ? SIG_H : 0

  // Column edges (CV proportions): company | job | scale | sheet
  const x1 = width * 0.30, x2 = width * 0.66, x3 = width * 0.83
  const pad = 1.6

  // Company cell: logo left, details right.
  const logoW = company.logoDataUrl ? Math.min(28, x1 * 0.38) : 0
  const textX = pad + (logoW ? logoW + pad : 0)
  const textW = x1 - textX - pad
  const contact = [
    [company.phone && `Phone: ${company.phone}`, company.fax && `Fax: ${company.fax}`].filter(Boolean).join('   '),
    company.email,
    company.website,
  ].filter(Boolean) as string[]
  const lines: { t: string; bold: boolean }[] = [
    ...(company.name ? [{ t: company.name, bold: true }] : []),
    ...company.addressLines.map(t => ({ t, bold: false })),
    ...contact.map(t => ({ t, bold: false })),
  ].slice(0, 7)
  const lineH = Math.min(3.2, (BOX_H - 2 * pad) / Math.max(1, lines.length))
  const companyFs = lineH * 0.78

  const cell = (x: number, w: number, row: number, t: string, fs: number, bold = false) => (
    <text x={x + pad} y={boxY + ROW_H * (row + 0.5)} dominantBaseline="central"
      fontSize={fs} fontWeight={bold ? 'bold' : 'normal'}>
      {fit(t, w - 2 * pad, fs)}
    </text>
  )

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} ${h}`}
      width={`${width}mm`} height={`${h}mm`} style={{ width: '100%', height: 'auto', display: 'block' }}
      fontFamily={FONT} fill={INK} data-title-block-h={h}>

      {company.signatureLine && (
        <text x={width * 0.5} y={SIG_H * 0.5} dominantBaseline="central" fontSize={2.6}>
          {'Client Approved Signature : ........................................................'}
          <tspan dx={8}>{'Date : ..........................'}</tspan>
        </text>
      )}

      <rect x={0} y={boxY} width={width} height={BOX_H} fill="white" stroke={INK} strokeWidth={LINE_OUTER} strokeLinejoin="miter" />
      {[x1, x2, x3].map(x => (
        <line key={x} x1={x} y1={boxY} x2={x} y2={boxY + BOX_H} stroke={INK} strokeWidth={LINE_INNER} />
      ))}
      {[1, 2].map(r => (
        <line key={r} x1={x1} y1={boxY + ROW_H * r} x2={width} y2={boxY + ROW_H * r} stroke={INK} strokeWidth={LINE_INNER} />
      ))}

      {/* Company */}
      {company.logoDataUrl && (
        <image href={company.logoDataUrl} x={pad} y={boxY + pad} width={logoW} height={BOX_H - 2 * pad}
          preserveAspectRatio="xMidYMid meet" />
      )}
      {lines.map((l, i) => (
        <text key={i} x={textX} y={boxY + pad + lineH * (i + 0.5) + (BOX_H - 2 * pad - lineH * lines.length) / 2}
          dominantBaseline="central" fontSize={l.bold ? companyFs * 1.1 : companyFs} fontWeight={l.bold ? 'bold' : 'normal'}>
          {fit(l.t, textW, companyFs)}
        </text>
      ))}

      {/* Job */}
      {cell(x1, x2 - x1, 0, sheet.jobLine, 3)}
      {cell(x1, x2 - x1, 1, sheet.drawingLine, 3)}
      {cell(x1, x2 - x1, 2, sheet.siteLine, 3)}

      {/* Scale */}
      {cell(x2, x3 - x2, 0, `Scale: 1 : ${sheet.scale}`, 3, true)}
      {cell(x2, x3 - x2, 1, company.disclaimer, 2.2)}

      {/* Sheet */}
      {cell(x3, width - x3, 0, `Sheet ${sheet.sheetNo} of ${sheet.sheetCount}`, 3, true)}
      {cell(x3, width - x3, 1, `Drawn By: ${sheet.drawnBy}`, 2.6)}
      {cell(x3, width - x3, 2, `Date: ${sheet.date}`, 2.6)}

      {company.copyright && (
        <text x={width * 0.5} y={boxY + BOX_H + COPY_H * 0.55} textAnchor="middle" dominantBaseline="central" fontSize={2.2}>
          {fit(company.copyright, width, 2.2)}
        </text>
      )}
    </svg>
  )
}
