'use client'

// ============================================================
// Reports → Glass Order (z_cnc_tools T3). Per room: every glass door with its
// door / opening / glass sizes; then the glazier's order — panes grouped by
// size + thickness. Glass doors = fronts whose door profile uses a glass tool
// set (cnc_tool_sets.glass_thickness_mm). Maths in src/lib/takeoff/glass.ts.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { Room, CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { buildGlassPanes, glassSizeLines, type GlassSet, type GlassPane, type GlassSizeLine } from '@/src/lib/takeoff/glass'

export interface GlassOrderData {
  rooms: { room: Room; panes: GlassPane[] }[]
  totals: GlassSizeLine[]
  sets: GlassSet[]
}

/** Loads the glass tool sets while `active` and rolls up the panes. */
export function useGlassOrder({ active, rooms, cabinets, resolved }: {
  active: boolean; rooms: Room[]; cabinets: CabinetInstance[]; resolved: Map<string, ResolvedCabinet>
}): GlassOrderData | null {
  const [sets, setSets] = useState<Map<string, GlassSet> | null>(null)
  useEffect(() => {
    if (!active || sets) return
    let cancelled = false
    void (async () => {
      const { data: setRows } = await supabase.from('cnc_tool_sets').select('id,name,glass_thickness_mm,glass_clearance_mm').not('glass_thickness_mm', 'is', null)
      const ids = (setRows ?? []).map(s => s.id as string)
      const { data: stepRows } = ids.length
        ? await supabase.from('cnc_tool_set_operations').select('tool_set_id,ring_width_mm,offset_top_mm,offset_bottom_mm,offset_left_mm,offset_right_mm').in('tool_set_id', ids)
        : { data: [] as Record<string, unknown>[] }
      if (cancelled) return
      const n = (v: unknown) => (v == null ? null : Number(v))
      const m = new Map<string, GlassSet>()
      for (const s of setRows ?? []) {
        const ring = (stepRows ?? []).find(r => r.tool_set_id === s.id && n(r.ring_width_mm) != null)
        m.set(s.id as string, {
          id: s.id as string, name: s.name as string,
          thickness: Number(s.glass_thickness_mm), clearance: n(s.glass_clearance_mm),
          ring: ring ? { top: n(ring.offset_top_mm), bottom: n(ring.offset_bottom_mm), left: n(ring.offset_left_mm), right: n(ring.offset_right_mm) } : null,
        })
      }
      setSets(m)
    })()
    return () => { cancelled = true }
  }, [active, sets])

  return useMemo(() => {
    if (!sets) return null
    const ids = new Set(rooms.map(r => r.id))
    const panes = buildGlassPanes(cabinets.filter(c => ids.has(c.room_id)).map(c => ({ id: c.id, room_id: c.room_id, label: c.label ?? null })), resolved, sets)
    return {
      rooms: rooms.map(room => ({ room, panes: panes.filter(p => p.roomId === room.id) })).filter(r => r.panes.length),
      totals: glassSizeLines(panes),
      sets: [...sets.values()],
    }
  }, [sets, rooms, cabinets, resolved])
}

const TH = 'pb-1 pr-3 font-medium border-b border-gray-800'
const rowCls = (i: number) => (i % 2 === 0 ? 'text-gray-300' : 'text-gray-400 bg-gray-800/30')
const sz = (w: number, h: number) => `${w} × ${h}`
const setNote = (s: GlassSet) => `${s.name}: ${s.thickness}mm glass, ${s.clearance ?? 1.5}mm clearance each side`

export function GlassOrderSheet({ data }: { data: GlassOrderData | null }) {
  if (!data) return <div className="text-gray-500 text-center py-12 text-sm">Loading…</div>
  if (!data.sets.length) return <div className="text-gray-500 text-center py-12 text-sm">No glass tool set. Set a glass thickness on one in Settings → CNC Tool Sets.</div>
  if (!data.totals.length) return <div className="text-gray-500 text-center py-12 text-sm">No glass doors in this scope.</div>
  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-baseline gap-3 mb-3 pb-1.5 border-b border-gray-700">
          <span className="text-sm font-semibold text-white">Glass to order</span>
          <span className="text-xs text-gray-500">width × height, mm · {data.sets.map(setNote).join(' · ')}</span>
        </div>
        <table className="w-full text-[11px] border-collapse">
          <thead><tr className="text-gray-500 text-[10px]">
            {['Glass W × H', 'Thick', 'Qty', 'Cabinets'].map((h, i) => <th key={h} className={`${TH} ${i === 1 || i === 2 ? 'text-right' : 'text-left'}`}>{h}</th>)}
          </tr></thead>
          <tbody>{data.totals.map((l, i) => (
            <tr key={`${l.glassW}x${l.glassH}x${l.thickness}`} className={rowCls(i)}>
              <td className="py-0.5 pr-3 font-mono font-semibold text-white">{sz(l.glassW, l.glassH)}</td>
              <td className="py-0.5 pr-3 text-right font-mono">{l.thickness}</td>
              <td className="py-0.5 pr-3 text-right font-mono font-semibold text-white">{l.qty}</td>
              <td className="py-0.5 pr-3 font-mono text-gray-500">{l.cabinets.join(', ')}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {data.rooms.map(r => (
        <div key={r.room.id}>
          <div className="flex items-baseline gap-3 mb-3 pb-1.5 border-b border-gray-700">
            <span className="text-sm font-semibold text-white">{r.room.name}</span>
            <span className="text-xs text-gray-500">{r.panes.length} pane{r.panes.length === 1 ? '' : 's'}</span>
          </div>
          <table className="w-full text-[11px] border-collapse">
            <thead><tr className="text-gray-500 text-[10px]">
              {['Cab #', 'Door', 'Door W × H', 'Opening W × H', 'Glass W × H', 'Thick'].map((h, i) => <th key={h} className={`${TH} ${i === 5 ? 'text-right' : 'text-left'}`}>{h}</th>)}
            </tr></thead>
            <tbody>{r.panes.map((p, i) => (
              <tr key={`${p.cabinetId}-${p.door}`} className={rowCls(i)}>
                <td className="py-0.5 pr-3 font-mono">{p.cabinetLabel}</td>
                <td className="py-0.5 pr-3 text-gray-500">{p.door}</td>
                <td className="py-0.5 pr-3 font-mono">{sz(p.doorW, p.doorH)}</td>
                <td className="py-0.5 pr-3 font-mono">{sz(p.openW, p.openH)}</td>
                <td className="py-0.5 pr-3 font-mono font-semibold text-white">{sz(p.glassW, p.glassH)}</td>
                <td className="py-0.5 pr-3 text-right font-mono">{p.thickness}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Print HTML (inside ReportsModal's print shell). */
export function glassOrderPrintHtml(data: GlassOrderData | null): string {
  if (!data || !data.totals.length) return ''
  const totals = `<h2>Glass to order</h2>
    <p style="font-size:10px;color:#555;margin:0 0 6px">Width × height, mm · ${esc(data.sets.map(setNote).join(' · '))}</p>
    <table><thead><tr><th>Glass W × H</th><th class="r">Thick</th><th class="r">Qty</th><th>Cabinets</th></tr></thead><tbody>
    ${data.totals.map(l => `<tr><td><b>${sz(l.glassW, l.glassH)}</b></td><td class="r">${l.thickness}</td><td class="r"><b>${l.qty}</b></td><td>${esc(l.cabinets.join(', '))}</td></tr>`).join('')}
    </tbody></table>`
  const rooms = data.rooms.map(r => `<h2>${esc(r.room.name)}</h2>
    <table><thead><tr><th>Cab #</th><th>Door</th><th>Door W × H</th><th>Opening W × H</th><th>Glass W × H</th><th class="r">Thick</th></tr></thead><tbody>
    ${r.panes.map(p => `<tr><td>${esc(p.cabinetLabel)}</td><td>${esc(p.door)}</td><td>${sz(p.doorW, p.doorH)}</td><td>${sz(p.openW, p.openH)}</td><td><b>${sz(p.glassW, p.glassH)}</b></td><td class="r">${p.thickness}</td></tr>`).join('')}
    </tbody></table>`).join('')
  return totals + rooms
}
