'use client'

// ============================================================
// Reports → Paint Shop Sheet (z_paint_shop). Per room, per paint colour: every
// Satin Board part (fronts, end panels, kicks, panels …) — no other board with its size,
// qty and area, the colour name / code / sheen big at the top of each block.
// Maths in src/lib/takeoff/paint.ts.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { Room, Project, CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { buildPaintParts, paintColourGroups, type PaintColour, type PaintColourGroup } from '@/src/lib/takeoff/paint'

export interface PaintShopData {
  rooms: { room: Room; groups: PaintColourGroup[] }[]
}

/** Loads painted boards + Colour Ranges colours while `active` and rolls up the parts. */
export function usePaintShop({ active, project, rooms, cabinets, resolved }: {
  active: boolean; project: Project | null; rooms: Room[]; cabinets: CabinetInstance[]; resolved: Map<string, ResolvedCabinet>
}): PaintShopData | null {
  const [lib, setLib] = useState<{ painted: Set<string>; colours: Map<string, PaintColour> } | null>(null)
  useEffect(() => {
    if (!active || lib) return
    let cancelled = false
    void (async () => {
      const [{ data: mats }, { data: cols }] = await Promise.all([
        supabase.from('materials').select('id, name, parent_id'),
        supabase.from('door_schedule_materials').select('id, colour_name, colour_code, brand, finish, schedule:schedule_id(name)'),
      ])
      if (cancelled) return
      const colours = new Map<string, PaintColour>()
      for (const c of (cols ?? []) as unknown as { id: string; colour_name: string; colour_code: string | null; brand: string | null; finish: string | null; schedule: { name: string } | null }[])
        colours.set(c.id, { id: c.id, name: c.colour_name, code: c.colour_code, brand: c.brand, finish: c.finish, range: c.schedule?.name ?? null })
      // Paint shop = Satin Board only (Mark 2026-11-18): the boards and their colours.
      const rows = (mats ?? []) as { id: string; name: string; parent_id: string | null }[]
      const boards = new Set(rows.filter(m => /^satin board/i.test(m.name ?? '')).map(m => m.id))
      setLib({ painted: new Set(rows.filter(m => boards.has(m.id) || (m.parent_id && boards.has(m.parent_id))).map(m => m.id)), colours })
    })()
    return () => { cancelled = true }
  }, [active, lib])

  return useMemo(() => {
    if (!lib) return null
    const roomMap = new Map(rooms.map(r => [r.id, r]))
    const parts = buildPaintParts(cabinets.filter(c => roomMap.has(c.room_id)), resolved, id => !!id && lib.painted.has(id), roomMap, project)
    return {
      rooms: rooms
        .map(room => ({ room, groups: paintColourGroups(parts.filter(p => p.roomId === room.id), lib.colours) }))
        .filter(r => r.groups.length),
    }
  }, [lib, rooms, cabinets, resolved, project])
}

const TH = 'pb-1 pr-3 font-medium border-b border-gray-800'
const rowCls = (i: number) => (i % 2 === 0 ? 'text-gray-300' : 'text-gray-400 bg-gray-800/30')
const m2 = (n: number) => n.toFixed(2)
const colourTitle = (g: PaintColourGroup) => g.colour?.name ?? 'COLOUR NOT CHOSEN'
const colourSub = (g: PaintColourGroup) => g.colour
  ? [g.colour.brand, g.colour.code, g.colour.finish && `Sheen: ${g.colour.finish}`].filter(Boolean).join(' · ')
  : 'Pick the colour on the Doors tab (room / job) or on the front'

export function PaintShopSheet({ data }: { data: PaintShopData | null }) {
  if (!data) return <div className="text-gray-500 text-center py-12 text-sm">Loading…</div>
  if (!data.rooms.length) return <div className="text-gray-500 text-center py-12 text-sm">No Satin Board parts in this scope.</div>
  return (
    <div className="space-y-8">
      {data.rooms.map(r => (
        <div key={r.room.id} className="space-y-5">
          <div className="text-sm font-semibold text-white pb-1.5 border-b border-gray-700">{r.room.name}</div>
          {r.groups.map(g => (
            <div key={g.colourId ?? 'none'}>
              <div className={`mb-2 px-3 py-2 rounded border ${g.colour ? 'border-gray-600 bg-gray-800/60' : 'border-red-700 bg-red-950/40'}`}>
                <div className={`text-base font-bold ${g.colour ? 'text-white' : 'text-red-300'}`}>{colourTitle(g)}</div>
                <div className="text-xs text-gray-400">{colourSub(g)} · {g.qty} part{g.qty === 1 ? '' : 's'} · {m2(g.m2)} m² (one face)</div>
              </div>
              <table className="w-full text-[11px] border-collapse">
                <thead><tr className="text-gray-500 text-[10px]">
                  {['Part', 'Height × Width', 'Thick', 'Qty', 'm²', 'Cabinets'].map((h, i) => <th key={h} className={`${TH} ${i >= 2 && i <= 4 ? 'text-right' : 'text-left'}`}>{h}</th>)}
                </tr></thead>
                <tbody>{g.lines.map((l, i) => (
                  <tr key={`${l.part}|${l.height}|${l.width}|${l.thickness}`} className={rowCls(i)}>
                    <td className="py-0.5 pr-3">{l.part}</td>
                    <td className="py-0.5 pr-3 font-mono font-semibold text-white">{l.height} × {l.width}</td>
                    <td className="py-0.5 pr-3 text-right font-mono">{l.thickness}</td>
                    <td className="py-0.5 pr-3 text-right font-mono font-semibold text-white">{l.qty}</td>
                    <td className="py-0.5 pr-3 text-right font-mono">{m2(l.m2)}</td>
                    <td className="py-0.5 pr-3 font-mono text-gray-500">{l.cabinets.join(', ')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Print HTML (inside ReportsModal's print shell). */
export function paintShopPrintHtml(data: PaintShopData | null): string {
  if (!data || !data.rooms.length) return ''
  return data.rooms.map(r => `<h2>${esc(r.room.name)}</h2>` + r.groups.map(g => `
    <div style="border:2px solid ${g.colour ? '#000' : '#c00'};padding:6px 10px;margin:10px 0 6px;break-inside:avoid">
      <div style="font-size:18px;font-weight:700;${g.colour ? '' : 'color:#c00'}">${esc(colourTitle(g))}</div>
      <div style="font-size:11px;color:#444">${esc(colourSub(g))} · ${g.qty} part${g.qty === 1 ? '' : 's'} · ${m2(g.m2)} m² (one face)</div>
    </div>
    <table><thead><tr><th>Part</th><th>Height × Width</th><th class="r">Thick</th><th class="r">Qty</th><th class="r">m²</th><th>Cabinets</th></tr></thead><tbody>
    ${g.lines.map(l => `<tr><td>${esc(l.part)}</td><td><b>${l.height} × ${l.width}</b></td><td class="r">${l.thickness}</td><td class="r"><b>${l.qty}</b></td><td class="r">${m2(l.m2)}</td><td>${esc(l.cabinets.join(', '))}</td></tr>`).join('')}
    </tbody></table>`).join('')).join('')
}
