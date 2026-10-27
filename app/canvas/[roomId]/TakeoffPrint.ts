// Printable HTML for the Hardware Pick List + Takeoff (z_takeoff). Goes inside
// ReportsModal's print shell (its header + base table styles); everything here
// is scoped under .tk. One room per page — `.room + .room` (not :first-child:
// the <style> block sits before the first room).

import type { TakeoffData } from './TakeoffReport'
import type { HardwareLine, FingerPullLine, KindCount, HardwareGroup } from '@/src/lib/takeoff/hardware'
import { KIND_LABEL, GRIP_LABEL, lengthsText, unitLabel } from '@/src/lib/takeoff/hardware'
import type { SheetLine } from '@/src/lib/takeoff/roomSheets'
import type { EdgebandLine } from '@/src/lib/optimiser/edgebandLength'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const m2 = (m: number) => m.toFixed(2)
const pct = (v: number) => `${Math.round(v * 100)}%`
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

const CSS = `<style>
  .tk { color: #1a1a1a; }
  .tk .room + .room { break-before: page; }
  .tk .band { display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
    background: #1f2937; color: #fff; padding: 7px 10px; border-radius: 3px; margin: 4px 0 12px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .tk .band .name { font-size: 14px; font-weight: bold; }
  .tk .band .stats { font-size: 10px; color: #cbd5e1; white-space: nowrap; }
  .tk .sec { margin: 14px 0 0; }
  .tk .sec h3 { font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; color: #1d4ed8;
    border-bottom: 1.5px solid #1d4ed8; padding-bottom: 2px; margin: 0 0 5px; }
  .tk .tiles { display: flex; gap: 6px; margin-bottom: 6px; break-inside: avoid; }
  .tk .tile { flex: 1 1 0; border: 1px solid #d1d5db; border-radius: 3px; padding: 5px 8px; min-width: 0; }
  .tk .tile .n { font-size: 20px; font-weight: bold; line-height: 1.1; }
  .tk .tile .l { font-size: 8.5px; text-transform: uppercase; letter-spacing: .05em; color: #4b5563; }
  .tk .tile .c { font-size: 8.5px; color: #6b7280; margin-top: 3px; font-family: 'Courier New', monospace; }
  .tk .tile.total { background: #f3f4f6; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .tk .tile.sm .n { font-size: 14px; }
  .tk table { width: 100%; border-collapse: collapse; margin: 0; }
  .tk th { background: #f3f4f6; border-bottom: 1px solid #9ca3af; padding: 3px 6px; font-size: 9.5px; color: #374151;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .tk td { padding: 3px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; background: none !important; }
  .tk tr { break-inside: avoid; }
  .tk .r { text-align: right; }
  .tk .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .tk .key { font-weight: bold; font-size: 12px; }
  .tk .muted { color: #6b7280; }
  .tk .small { font-size: 9.5px; }
  .tk .mono { font-family: 'Courier New', monospace; }
  .tk .warn { color: #b45309; font-size: 10px; margin: 4px 0 0; }
  .tk tr.grp td { background: #e5e7eb !important; font-weight: bold; font-size: 9.5px; text-transform: uppercase;
    letter-spacing: .05em; color: #374151; border-bottom: none; padding-top: 4px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .tk .tick { display: inline-block; width: 13px; height: 13px; border: 1.5px solid #111; border-radius: 2px; }
  .tk .sign { display: flex; gap: 28px; margin-top: 18px; font-size: 10px; color: #374151; }
  .tk .sign span { flex: 1; border-top: 1px solid #111; padding-top: 3px; }
  .tk .note { font-size: 9.5px; color: #6b7280; margin: -6px 0 10px; }
</style>`

const band = (name: string, stats: string) => `<div class="band"><span class="name">${esc(name)}</span><span class="stats">${esc(stats)}</span></div>`
const nowrapList = (items: string[]) => items.map(s => `<span style="white-space:nowrap">${esc(s)}</span>`).join(', ')
const cabLabels = (l: HardwareLine) => nowrapList(l.cabinets.map(c => (c.qty > 1 ? `${c.label} ×${c.qty}` : c.label)))
const prodSub = (l: HardwareLine) => [l.brand, l.code].filter(Boolean).join(' · ')
const product = (l: HardwareLine) => `${esc(l.name)}${prodSub(l) ? ` <span class="muted small">· ${esc(prodSub(l))}</span>` : ''}`
  + (l.lengths ? `<div class="muted small">${esc(lengthsText(l.lengths))}</div>` : '')
const qty = (l: HardwareLine) => `${l.qty}${unitLabel(l) ? ` <span class="muted small">${unitLabel(l)}</span>` : ''}`
const itemCount = (ls: HardwareLine[]) => ls.reduce((a, l) => a + l.qty, 0)

function byGroup(lines: HardwareLine[]): [HardwareGroup, HardwareLine[]][] {
  const m = new Map<HardwareGroup, HardwareLine[]>()
  for (const l of lines) m.set(l.group, [...(m.get(l.group) ?? []), l])
  return [...m]
}

// ── Hardware Pick List ───────────────────────────────────────────────────────

function pickTable(lines: HardwareLine[], showCabs: boolean): string {
  const cols = showCabs ? 4 : 3
  return `<table>
    <colgroup><col style="width:22px"><col style="width:62px"><col${showCabs ? ' style="width:42%"' : ''}>${showCabs ? '<col>' : ''}</colgroup>
    <thead><tr><th></th><th class="r">Qty</th><th>Product</th>${showCabs ? '<th>Cabinets</th>' : ''}</tr></thead>
    <tbody>${byGroup(lines).map(([g, ls]) => `
      <tr class="grp"><td colspan="${cols}">${g}</td></tr>${ls.map(l => `
      <tr><td><span class="tick"></span></td><td class="num key">${qty(l)}</td><td>${product(l)}</td>${showCabs ? `<td class="mono small">${cabLabels(l)}</td>` : ''}</tr>`).join('')}`).join('')}
    </tbody></table>`
}

export function hardwarePickPrintHtml(data: TakeoffData | null): string {
  if (!data?.hardware.length) return ''
  const rooms = data.rooms.filter(r => r.hardware.length)
  return `${CSS}<div class="tk">${rooms.map(r => `
    <div class="room">
      ${band(r.room.name, `${plural(r.hardware.length, 'line')} · ${plural(itemCount(r.hardware), 'item')}`)}
      ${pickTable(r.hardware, true)}
      <div class="sign"><span>Picked by</span><span>Checked by</span><span>Date</span></div>
    </div>`).join('')}
    ${rooms.length > 1 ? `<div class="room">
      ${band('Job totals', `${plural(rooms.length, 'room')} · ${plural(itemCount(data.hardware), 'item')}`)}
      ${pickTable(data.hardware, false)}
    </div>` : ''}
  </div>`
}

// ── Takeoff ──────────────────────────────────────────────────────────────────

const CAB_KINDS = new Set(['base', 'wall', 'tall'])
const codes = (k: KindCount) => k.codes.map(c => `${c.code}${c.count > 1 ? ` ×${c.count}` : ''}`).join(', ')
const fingerTotal = (f: FingerPullLine[]) => f.reduce((a, l) => a + l.fronts, 0)

interface Block { kinds: KindCount[]; fingerPulls: FingerPullLine[]; sheets: SheetLine[] | null; jobSheets?: SheetLine[] | null; sheetNotes: string[]; tape: EdgebandLine[]; hardware: HardwareLine[] }

const cabCount = (b: Block) => b.kinds.filter(k => CAB_KINDS.has(k.kind)).reduce((a, k) => a + k.count, 0)
const sheetCount = (b: Block) => (b.sheets ?? []).reduce((a, l) => a + l.sheets, 0)
const tapeM = (b: Block) => b.tape.reduce((a, l) => a + l.mWaste, 0)
const blockStats = (b: Block) => `${plural(cabCount(b), 'cabinet')} · ${plural(sheetCount(b), 'sheet')} · ${tapeM(b).toFixed(1)} m tape`

function countsHtml(b: Block): string {
  const cabs = b.kinds.filter(k => CAB_KINDS.has(k.kind))
  const extras = b.kinds.filter(k => !CAB_KINDS.has(k.kind))
  if (!cabs.length && !extras.length && !b.fingerPulls.length) return '<p class="muted">None placed.</p>'
  const tile = (label: string, n: number, c: string, cls = '') =>
    `<div class="tile ${cls}"><div class="l">${esc(label)}</div><div class="n">${n}</div>${c ? `<div class="c">${esc(c)}</div>` : ''}</div>`
  const main = (['base', 'wall', 'tall'] as const).map(kind => {
    const k = cabs.find(x => x.kind === kind)
    return tile(KIND_LABEL[kind].replace(' cabinets', ''), k?.count ?? 0, k ? codes(k) : '')
  }).join('') + tile('Total cabinets', cabCount(b), '', 'total')
  const small = [
    ...extras.map(k => tile(KIND_LABEL[k.kind], k.count, codes(k), 'sm')),
    ...(b.fingerPulls.length ? [tile('Finger pull fronts', fingerTotal(b.fingerPulls),
      b.fingerPulls.map(f => `${GRIP_LABEL[f.grip] ?? f.grip} ${f.name} ×${f.fronts}`).join(', '), 'sm')] : []),
  ]
  // Small tiles in rows of up to four so they keep a readable width.
  const rows: string[] = []
  for (let i = 0; i < small.length; i += 4) rows.push(`<div class="tiles">${small.slice(i, i + 4).join('')}${'<div style="flex:1 1 0"></div>'.repeat(i + 4 > small.length ? i + 4 - small.length : 0)}</div>`)
  return `<div class="tiles">${main}</div>${rows.join('')}`
}

function sheetsHtml(b: Block): string {
  if (!b.sheets?.length) return '<p class="muted">No cut parts.</p>'
  const job = b.jobSheets
  return `<table>
    <thead><tr><th>Material</th><th class="r">Thk</th><th>Sheet size</th><th class="r">Parts</th><th class="r">Sheets</th><th class="r">Sheet equiv.</th><th class="r">Yield</th>${job ? '<th class="r">Cut together</th>' : ''}</tr></thead>
    <tbody>${b.sheets.map(l => `<tr><td>${esc(l.material)}</td><td class="num">${l.thickness}</td><td class="muted">${l.sheetW} × ${l.sheetH}</td>
      <td class="num">${l.parts}</td><td class="num key">${l.sheets}</td><td class="num">${l.sheetEquiv.toFixed(2)}</td><td class="num muted">${pct(l.efficiency)}</td>
      ${job ? `<td class="num key">${job.find(j => j.groupKey === l.groupKey)?.sheets ?? '—'}</td>` : ''}</tr>`).join('')}</tbody>
  </table>${b.sheetNotes.map(n => `<p class="warn">⚠ ${esc(n)}</p>`).join('')}`
}

function tapeHtml(b: Block, waste: number): string {
  if (!b.tape.length) return '<p class="muted">No edgebanded parts.</p>'
  return `<table>
    <thead><tr><th>Tape</th><th>Finish</th><th class="r">Metres</th><th class="r">+${Math.round(waste * 100)}% waste</th></tr></thead>
    <tbody>${b.tape.map(l => `<tr><td>${esc(l.name)}</td><td>${esc(l.finish)}${l.colourNotChosen ? ' <b class="warn">— colour not chosen</b>' : ''}</td>
      <td class="num">${m2(l.m)}</td><td class="num key">${m2(l.mWaste)}</td></tr>`).join('')}</tbody>
  </table>`
}

function hardwareHtml(b: Block): string {
  if (!b.hardware.length) return '<p class="muted">No hardware.</p>'
  return `<table>
    <colgroup><col style="width:24%"><col><col style="width:80px"></colgroup>
    <thead><tr><th>Type</th><th>Product</th><th class="r">Qty</th></tr></thead>
    <tbody>${byGroup(b.hardware).map(([g, ls]) => ls.map((l, i) => `<tr><td class="muted">${i === 0 ? g : ''}</td><td>${product(l)}</td><td class="num key">${qty(l)}</td></tr>`).join('')).join('')}</tbody>
  </table>`
}

const sec = (title: string, body: string) => `<div class="sec"><h3>${title}</h3>${body}</div>`

function blockHtml(b: Block, waste: number): string {
  return sec('Cabinets', countsHtml(b)) + sec('Sheets', sheetsHtml(b)) + sec('Edgetape', tapeHtml(b, waste)) + sec('Hardware', hardwareHtml(b))
}

export function takeoffPrintHtml(data: TakeoffData | null): string {
  if (!data) return ''
  const job: Block = { kinds: data.kinds, fingerPulls: data.fingerPulls, sheets: data.sheetsByRoom, jobSheets: data.sheetsJob, sheetNotes: [], tape: data.tape, hardware: data.hardware }
  return `${CSS}<div class="tk">${data.rooms.map(r => `
    <div class="room">${band(r.room.name, blockStats(r))}${blockHtml(r, data.tapeWaste)}</div>`).join('')}
    ${data.rooms.length > 1 ? `<div class="room">${band('Job totals', `${plural(data.rooms.length, 'room')} · ${blockStats(job)}`)}
      <p class="note">Sheets = the room nests added up · Cut together = every room nested as one</p>
      ${blockHtml(job, data.tapeWaste)}</div>` : ''}
  </div>`
}
