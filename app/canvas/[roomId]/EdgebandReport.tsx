'use client'
// Edgeband length report (z_part_shape_editor/OPTIMISER-PHASE-PLAN.md O7):
// metres of tape per edgeband product, + a settable waste factor × the tape's
// cost_per_metre. Read from the same saved part snapshot the optimiser nests
// (loadProjectParts), so the metres follow the parts actually cut — removed
// parts out, size overrides and shaped outlines in. Finished edge lengths.
// Rollup: src/lib/optimiser/edgebandLength.ts.

import type { EdgebandReport, EdgebandLine } from '@/src/lib/optimiser/edgebandLength'

const m2 = (m: number) => m.toFixed(2)
const money = (v: number | null) => (v == null ? '—' : `$${v.toFixed(2)}`)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function LinesTable({ lines, waste }: { lines: EdgebandLine[]; waste: number }) {
  return (
    <table className="w-full text-[11px] border-collapse">
      <thead>
        <tr className="text-gray-500 text-[10px]">
          {['Tape', 'Parts', 'Metres', `+${Math.round(waste * 100)}% waste`, '$/m', 'Cost'].map((h, i) => (
            <th key={h} className={`pb-1 pr-3 font-medium border-b border-gray-800 ${i ? 'text-right' : 'text-left'}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={l.id ?? '-'} className={`${i % 2 === 0 ? 'text-gray-300' : 'text-gray-400 bg-gray-800/30'} ${l.id ? '' : 'text-amber-300'}`}>
            <td className="py-0.5 pr-3">{l.name}</td>
            <td className="py-0.5 pr-3 text-right font-mono">{l.parts}</td>
            <td className="py-0.5 pr-3 text-right font-mono">{m2(l.m)}</td>
            <td className="py-0.5 pr-3 text-right font-mono">{m2(l.mWaste)}</td>
            <td className="py-0.5 pr-3 text-right font-mono">{money(l.costPerMetre)}</td>
            <td className="py-0.5 text-right font-mono">{money(l.cost)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function EdgebandSheet({ report, waste, loading }: { report: EdgebandReport | null; waste: number; loading: boolean }) {
  if (loading || !report) return <div className="text-gray-500 text-center py-12 text-sm">Loading parts…</div>
  if (!report.totals.length) {
    return (
      <div className="text-center py-12 text-gray-500 text-sm">
        No edgebanded parts.
        <div className="text-xs mt-1 text-gray-600">Reads the saved parts, as the optimiser does — resolve and save cabinets first.</div>
      </div>
    )
  }
  return (
    <div className="space-y-8">
      {report.rooms.map(r => (
        <div key={r.roomId}>
          <div className="flex items-baseline gap-3 mb-3 pb-1.5 border-b border-gray-700">
            <span className="text-sm font-semibold text-white">{r.room}</span>
            <span className="text-xs text-gray-500">{m2(r.lines.reduce((a, l) => a + l.m, 0))} m</span>
          </div>
          <LinesTable lines={r.lines} waste={waste} />
          <table className="w-full text-[11px] border-collapse mt-3">
            <thead>
              <tr className="text-gray-500 text-[10px]">
                {['Cabinet', 'Tape', 'Parts', 'Metres'].map((h, i) => (
                  <th key={h} className={`pb-1 pr-3 font-medium border-b border-gray-800 ${i >= 2 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.cabinets.map((c, i) => (
                <tr key={`${c.cabinetId}|${c.tape}`} className={i % 2 === 0 ? 'text-gray-400' : 'text-gray-500 bg-gray-800/30'}>
                  <td className="py-0.5 pr-3 font-mono">{c.cabinet}</td>
                  <td className="py-0.5 pr-3">{c.tape}</td>
                  <td className="py-0.5 pr-3 text-right font-mono">{c.parts}</td>
                  <td className="py-0.5 text-right font-mono">{m2(c.m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {report.rooms.length > 1 && (
        <div>
          <div className="text-[10px] font-semibold text-blue-400 uppercase tracking-widest mb-1.5">Totals</div>
          <LinesTable lines={report.totals} waste={waste} />
        </div>
      )}
      <Footer report={report} />
    </div>
  )
}

function Footer({ report }: { report: EdgebandReport }) {
  return (
    <div className="border-t border-gray-700 pt-3 text-[11px] text-gray-300 flex flex-wrap gap-x-6 gap-y-1">
      <span>Total <span className="font-mono">{m2(report.totalM)} m</span></span>
      <span>With waste <span className="font-mono">{m2(report.totalMWaste)} m</span></span>
      <span>Cost <span className="font-mono">{money(report.totalCost)}</span>
        {report.unpriced > 0 && <span className="text-amber-300"> · {report.unpriced} tape{report.unpriced > 1 ? 's' : ''} with no $/m (Library → Materials)</span>}</span>
    </div>
  )
}

/** Printable HTML body (ReportsModal's Print / PDF). */
export function edgebandPrintHtml(report: EdgebandReport | null, waste: number): string {
  if (!report?.totals.length) return ''
  const lines = (ls: EdgebandLine[]) => `
    <table>
      <thead><tr><th>Tape</th><th class="r">Parts</th><th class="r">Metres</th><th class="r">+${Math.round(waste * 100)}% waste</th><th class="r">$/m</th><th class="r">Cost</th></tr></thead>
      <tbody>${ls.map((l, i) => `
        <tr class="${i % 2 ? 'alt' : ''}"><td>${esc(l.name)}</td><td class="r mono">${l.parts}</td><td class="r mono">${m2(l.m)}</td>
        <td class="r mono">${m2(l.mWaste)}</td><td class="r mono">${money(l.costPerMetre)}</td><td class="r mono">${money(l.cost)}</td></tr>`).join('')}
      </tbody>
    </table>`
  const rooms = report.rooms.map(r => `
    <h2>${esc(r.room)}</h2>
    ${lines(r.lines)}
    <h3>By cabinet</h3>
    <table>
      <thead><tr><th>Cabinet</th><th>Tape</th><th class="r">Parts</th><th class="r">Metres</th></tr></thead>
      <tbody>${r.cabinets.map((c, i) => `
        <tr class="${i % 2 ? 'alt' : ''}"><td class="mono">${esc(c.cabinet)}</td><td>${esc(c.tape)}</td><td class="r mono">${c.parts}</td><td class="r mono">${m2(c.m)}</td></tr>`).join('')}
      </tbody>
    </table>`).join('')
  return `${rooms}
    ${report.rooms.length > 1 ? `<h2>Totals</h2>${lines(report.totals)}` : ''}
    <p>Total ${m2(report.totalM)} m · with waste ${m2(report.totalMWaste)} m · cost ${money(report.totalCost)}${report.unpriced ? ` (${report.unpriced} tape${report.unpriced > 1 ? 's' : ''} unpriced)` : ''}</p>`
}
