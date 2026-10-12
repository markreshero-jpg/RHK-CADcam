'use client'
// Benchtop supply sheet (benchtop Phase 5): the order list for outsourced
// stone / laminate tops — one line per piece, waterfall leg and apron, with
// area, edge-profile lineal metres, cutouts and joins, plus job totals.
// Built from benchtop_resolved_parts supply items (src/lib/benchtop-resolver/supply.ts).

import type { Room } from '@/src/lib/types'
import type { SupplyLine, SupplyTotals } from '@/src/lib/benchtop-resolver/supply'

export interface SupplyRoomData { room: Room; lines: SupplyLine[] }

const lm = (mm: number) => (mm / 1000).toFixed(2)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function itemName(l: SupplyLine) {
  const leg = l.waterfallJoin ? ` (${l.waterfallJoin})` : ''
  return l.label + leg
}
function edgesText(l: SupplyLine) {
  return Object.entries(l.profiles).map(([c, mm]) => `${c} ${lm(mm)}`).join(', ')
}
function notesText(l: SupplyLine) {
  const n: string[] = []
  if (l.outline) n.push('shaped — see outline')
  if (l.cutouts.length) n.push(l.cutouts.map(c => c.round ? `Ø${c.w}` : `${c.w}×${c.h}`).join(', ') + ' cutout' + (l.cutouts.length > 1 ? 's' : ''))
  if (l.joins.length) n.push(l.joins.map(j => `${j.type} join ${j.length}`).join(', '))
  return n.join(' · ')
}

/** Outline thumbnail (part frame x = length, y = width), fitted to w × h px. */
function outlineSvg(outline: { x: number; y: number }[], w: number, h: number, stroke: string) {
  let maxX = 1, maxY = 1
  for (const p of outline) { if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y }
  const k = Math.min((w - 2) / maxX, (h - 2) / maxY)
  const pts = outline.map(p => `${(1 + p.x * k).toFixed(1)},${(1 + p.y * k).toFixed(1)}`).join(' ')
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polygon points="${pts}" fill="none" stroke="${stroke}" stroke-width="1"/></svg>`
}

export function BenchtopSupplySheet({ data, totals }: { data: SupplyRoomData[]; totals: SupplyTotals }) {
  if (!data.some(d => d.lines.length)) {
    return (
      <div className="text-center py-12 text-gray-500 text-sm">
        No benchtop supply items.
        <div className="text-xs mt-1 text-gray-600">Outsourced (stone / laminate) tops appear here after &quot;Resolve Parts&quot; on the benchtop.</div>
      </div>
    )
  }
  return (
    <div className="space-y-8">
      {data.map(({ room, lines }) => lines.length === 0 ? null : (
        <div key={room.id}>
          <div className="flex items-baseline gap-3 mb-3 pb-1.5 border-b border-gray-700">
            <span className="text-sm font-semibold text-white">{room.name}</span>
            <span className="text-xs text-gray-500">{lines.length} item{lines.length > 1 ? 's' : ''}</span>
          </div>
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="text-gray-500 text-[10px]">
                {['Top', 'Item', 'Length', 'Width', 'Thk', 'Qty', 'Material', 'm²', 'Edges (lm)', 'Notes'].map((h, i) => (
                  <th key={h} className={`pb-1 pr-3 font-medium border-b border-gray-800 ${i >= 2 && i <= 5 || i === 7 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className={`align-top ${i % 2 === 0 ? 'text-gray-300' : 'text-gray-400 bg-gray-800/30'}`}>
                  <td className="py-0.5 pr-3 font-mono text-gray-500 text-[10px]">{l.source}</td>
                  <td className="py-0.5 pr-3">
                    {itemName(l)}
                    {l.outline && <span className="block mt-0.5" dangerouslySetInnerHTML={{ __html: outlineSvg(l.outline, 90, 40, '#38bdf8') }} />}
                  </td>
                  <td className="py-0.5 pr-3 text-right font-mono">{Math.round(l.length)}</td>
                  <td className="py-0.5 pr-3 text-right font-mono">{Math.round(l.width)}</td>
                  <td className="py-0.5 pr-3 text-right font-mono">{Math.round(l.thickness)}</td>
                  <td className="py-0.5 pr-3 text-right font-mono">{l.quantity}</td>
                  <td className="py-0.5 pr-3">{l.material}</td>
                  <td className="py-0.5 pr-3 text-right font-mono">{l.area_m2.toFixed(2)}</td>
                  <td className="py-0.5 pr-3 font-mono">{edgesText(l) || '—'}</td>
                  <td className="py-0.5 text-gray-500">{notesText(l)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <SupplyTotalsBlock totals={totals} />
    </div>
  )
}

function SupplyTotalsBlock({ totals }: { totals: SupplyTotals }) {
  return (
    <div className="border-t border-gray-700 pt-3 grid grid-cols-2 gap-6 text-[11px]">
      <div>
        <div className="text-[10px] font-semibold text-blue-400 uppercase tracking-widest mb-1.5">Totals by material</div>
        {totals.byMaterial.map(m => (
          <div key={m.material + m.thickness} className="flex justify-between text-gray-300">
            <span>{m.material} · {m.thickness}mm · {m.items} item{m.items > 1 ? 's' : ''}</span>
            <span className="font-mono">{m.area_m2.toFixed(2)} m²</span>
          </div>
        ))}
      </div>
      <div>
        <div className="text-[10px] font-semibold text-blue-400 uppercase tracking-widest mb-1.5">Edges · extras</div>
        {totals.byProfile.map(p => (
          <div key={p.code} className="flex justify-between text-gray-300">
            <span>{p.code}</span><span className="font-mono">{lm(p.mm)} lm</span>
          </div>
        ))}
        <div className="text-gray-400 mt-1">
          {totals.cutouts} cutout{totals.cutouts === 1 ? '' : 's'} · {totals.waterfalls} waterfall leg{totals.waterfalls === 1 ? '' : 's'} · {totals.joins} join{totals.joins === 1 ? '' : 's'}
        </div>
      </div>
    </div>
  )
}

/** Printable HTML body for the supply sheet (ReportsModal's Print / PDF). */
export function supplyPrintHtml(data: SupplyRoomData[], totals: SupplyTotals): string {
  const rooms = data.filter(d => d.lines.length).map(({ room, lines }) => `
    <h2>${esc(room.name)}</h2>
    <table>
      <thead><tr><th>Top</th><th>Item</th><th class="r">Length</th><th class="r">Width</th><th class="r">Thk</th><th class="r">Qty</th><th>Material</th><th class="r">m²</th><th>Edges (lm)</th><th>Notes</th></tr></thead>
      <tbody>${lines.map((l, i) => `
        <tr class="${i % 2 ? 'alt' : ''}">
          <td class="mono">${esc(l.source)}</td>
          <td>${esc(itemName(l))}${l.outline ? `<div>${outlineSvg(l.outline, 110, 50, '#111')}</div>` : ''}</td>
          <td class="r mono">${Math.round(l.length)}</td><td class="r mono">${Math.round(l.width)}</td>
          <td class="r mono">${Math.round(l.thickness)}</td><td class="r mono">${l.quantity}</td>
          <td>${esc(l.material)}</td><td class="r mono">${l.area_m2.toFixed(2)}</td>
          <td class="mono">${esc(edgesText(l)) || '—'}</td><td>${esc(notesText(l))}</td>
        </tr>`).join('')}
      </tbody>
    </table>`).join('')
  if (!rooms) return ''
  const mats = totals.byMaterial.map(m => `<tr><td>${esc(m.material)} · ${m.thickness}mm · ${m.items} item${m.items > 1 ? 's' : ''}</td><td class="r mono">${m.area_m2.toFixed(2)} m²</td></tr>`).join('')
  const profs = totals.byProfile.map(p => `<tr><td>${esc(p.code)}</td><td class="r mono">${lm(p.mm)} lm</td></tr>`).join('')
  return `${rooms}
    <h2>Totals</h2>
    <table><thead><tr><th>Material</th><th class="r">Area</th></tr></thead><tbody>${mats}</tbody></table>
    <table><thead><tr><th>Edge profile</th><th class="r">Lineal</th></tr></thead><tbody>${profs}</tbody></table>
    <p>${totals.cutouts} cutouts · ${totals.waterfalls} waterfall legs · ${totals.joins} joins</p>`
}
