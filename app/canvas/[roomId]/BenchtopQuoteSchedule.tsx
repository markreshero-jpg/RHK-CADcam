// Benchtop Quote report — the schedule page after the plan: one row per top
// (material, thickness, m², exposed edges lm per profile, wall / joint edges,
// cutouts, waterfall legs) and totals. Preview in HTML; the PDF page is drawn
// with jsPDF text so it stays crisp and selectable.
'use client'
import type { jsPDF } from 'jspdf'
import type { BenchtopEdgeProfile } from '@/src/lib/types'
import { profilesText, type QuoteTop, type QuoteTotals } from '@/src/lib/benchtopQuote'

const HEAD = ['Top', 'Material', 'Thk', 'm²', 'Exposed edges (code lm)', 'Wall edges lm', 'Joins lm', 'Cutouts', 'Waterfalls']
const m = (mm: number) => mm > 0 ? (mm / 1000).toFixed(2) : '—'

function rows(tops: QuoteTop[]): string[][] {
  return tops.map(t => [
    t.name, t.material ?? '—', t.thickness ? `${Math.round(t.thickness)}` : '—', t.area_m2.toFixed(2),
    profilesText(t.profiles) || '—', m(t.wallMm), m(t.jointMm), `${t.cutouts || '—'}`, `${t.waterfalls || '—'}`,
  ])
}

/** Profile codes in use with their names, for the legend. */
function legend(totals: QuoteTotals, profiles: Record<string, BenchtopEdgeProfile>): string[] {
  const byCode = new Map(Object.values(profiles).map(p => [p.code ?? p.name, p.name]))
  return totals.profiles.map(p => `${p.code} = ${p.code === '—' ? 'no profile set' : byCode.get(p.code) ?? p.code}`)
}

export function BenchtopQuoteSchedule({ tops, totals, profiles }: {
  tops: QuoteTop[]; totals: QuoteTotals; profiles: Record<string, BenchtopEdgeProfile>
}) {
  if (!tops.length) return <div className="p-4 text-sm text-gray-500">No benchtops in this room.</div>
  return (
    <div className="p-4 text-[11px] text-gray-900">
      <div className="font-semibold text-sm mb-2">Benchtop schedule</div>
      <table className="w-full border-collapse">
        <thead>
          <tr>{HEAD.map((h, i) => <th key={h} className={`border-b border-gray-400 pb-1 pr-3 font-semibold ${i >= 2 && i !== 4 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows(tops).map((r, ri) => (
            <tr key={ri} className="align-top">
              {r.map((c, i) => <td key={i} className={`py-0.5 pr-3 border-b border-gray-200 ${i >= 2 && i !== 4 ? 'text-right font-mono' : ''}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 space-y-0.5">
        <div><b>Total area:</b> {totals.area_m2.toFixed(2)} m² · <b>Cutouts:</b> {totals.cutouts} · <b>Waterfall legs:</b> {totals.waterfalls}</div>
        <div><b>Edges:</b> {totals.profiles.map(p => `${p.code} ${(p.mm / 1000).toFixed(2)} lm`).join(' · ') || '—'}</div>
        <div className="text-gray-600">{legend(totals, profiles).join(' · ')}</div>
        <div className="text-gray-600">Areas and lengths are from the drawing (finished sizes, cutouts deducted). Check on site before cutting.</div>
      </div>
    </div>
  )
}

/** Draw the schedule on the doc's current page, inside the given box (paper mm). */
export function drawBenchtopQuoteSchedule(doc: jsPDF, box: { x: number; y: number; w: number },
  tops: QuoteTop[], totals: QuoteTotals, profiles: Record<string, BenchtopEdgeProfile>, title: string) {
  const W = [0.13, 0.17, 0.05, 0.06, 0.25, 0.09, 0.08, 0.07, 0.10].map(f => f * box.w)
  const right = (i: number) => i >= 2 && i !== 4
  let y = box.y
  doc.setTextColor(0)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
  doc.text(title, box.x, y + 5); y += 11
  doc.setFontSize(8.5)
  const drawRow = (cells: string[], bold: boolean) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    const lines = cells.map((c, i) => doc.splitTextToSize(c, W[i] - 2) as string[])
    const h = Math.max(...lines.map(l => l.length)) * 3.8 + 1.5
    let x = box.x
    lines.forEach((l, i) => {
      if (right(i)) doc.text(l, x + W[i] - 2, y + 3.5, { align: 'right' })
      else doc.text(l, x, y + 3.5)
      x += W[i]
    })
    y += h
    doc.setDrawColor(bold ? 0 : 200); doc.setLineWidth(bold ? 0.3 : 0.1)
    doc.line(box.x, y - 0.6, box.x + box.w, y - 0.6)
  }
  drawRow(HEAD, true)
  for (const r of rows(tops)) drawRow(r, false)
  y += 4
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5)
  doc.text(`Total area ${totals.area_m2.toFixed(2)} m²   ·   Cutouts ${totals.cutouts}   ·   Waterfall legs ${totals.waterfalls}`, box.x, y); y += 5.5
  doc.text(`Edges: ${totals.profiles.map(p => `${p.code} ${(p.mm / 1000).toFixed(2)} lm`).join('   ·   ') || '—'}`, box.x, y); y += 5.5
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
  for (const l of doc.splitTextToSize(legend(totals, profiles).join('   ·   '), box.w) as string[]) { doc.text(l, box.x, y); y += 4 }
  doc.text('Areas and lengths are from the drawing (finished sizes, cutouts deducted). Check on site before cutting.', box.x, y + 1)
}
