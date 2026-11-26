'use client'

// ============================================================
// Reports → Paint Shop Sheet (z_paint_shop). A simple form per room + paint
// colour: Job, Room, Paint colour, Gloss level, Parts, Paint area (one face +
// edges at 0.1 m, Mark 2026-11-26), Date. Satin Board parts only;
// which colours a room uses comes from src/lib/takeoff/paint.ts.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { Room, Project, CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { buildPaintParts, paintColourGroups, paintColourLabel, type PaintColour, type PaintColourGroup } from '@/src/lib/takeoff/paint'

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

// One simple form per room + paint colour (Mark 2026-11-18): Job, Room, Paint
// colour, Gloss level, Parts, Paint area, Date.
export interface PaintForm { job: string; room: string; colour: string; gloss: string; parts: string; area: string; date: string; missing: boolean }

/** "4.82 m² (face 3.60 + edges 1.22)". */
export const paintAreaText = (g: Pick<PaintColourGroup, 'm2' | 'faceM2' | 'edgeM2'>) =>
  `${g.m2.toFixed(2)} m² (face ${g.faceM2.toFixed(2)} + edges ${g.edgeM2.toFixed(2)})`

export function paintForms(data: PaintShopData | null, project: Project | null): PaintForm[] {
  if (!data) return []
  const job = [project?.job_number, project?.name].filter(Boolean).join(' – ') || '—'
  const date = new Date().toLocaleDateString('en-AU')
  return data.rooms.flatMap(r => r.groups.map(g => ({
    job, room: r.room.name, date,
    colour: paintColourLabel(g.colour),
    gloss: g.colour?.finish || 'TBC',
    parts: String(g.qty),
    area: paintAreaText(g),
    missing: !g.colour,
  })))
}

const FIELDS: [keyof PaintForm, string][] = [['job', 'Job'], ['room', 'Room'], ['colour', 'Paint colour'], ['gloss', 'Gloss level'], ['parts', 'Parts'], ['area', 'Paint area'], ['date', 'Date']]

export function PaintShopSheet({ data, project }: { data: PaintShopData | null; project: Project | null }) {
  if (!data) return <div className="text-gray-500 text-center py-12 text-sm">Loading…</div>
  const forms = paintForms(data, project)
  if (!forms.length) return <div className="text-gray-500 text-center py-12 text-sm">No Satin Board parts in this scope.</div>
  return (
    <div className="space-y-6 max-w-xl">
      {forms.map((f, i) => (
        <table key={i} className="w-full text-sm border border-gray-600 border-collapse">
          <tbody>{FIELDS.map(([k, label]) => (
            <tr key={k} className="border-b border-gray-700">
              <th className="w-36 text-left font-medium text-gray-400 px-3 py-2 bg-gray-800/60">{label}</th>
              <td className={`px-3 py-2 font-semibold ${f.missing && (k === 'colour' || k === 'gloss') ? 'text-red-300' : 'text-white'}`}>{f[k] as string}</td>
            </tr>
          ))}</tbody>
        </table>
      ))}
    </div>
  )
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Print HTML (inside ReportsModal's print shell): one form per page. */
export function paintShopPrintHtml(data: PaintShopData | null, project: Project | null): string {
  return paintForms(data, project).map((f, i) => `
    <table style="width:100%;border-collapse:collapse;font-size:18px;margin-top:12px;${i ? 'page-break-before:always;' : ''}">
      ${FIELDS.map(([k, label]) => `<tr><th style="width:30%;text-align:left;border:1.5px solid #000;padding:14px 12px;background:#eee">${label}</th><td style="border:1.5px solid #000;padding:14px 12px;font-weight:700;${f.missing && (k === 'colour' || k === 'gloss') ? 'color:#c00' : ''}">${esc(f[k] as string)}</td></tr>`).join('')}
    </table>`).join('')
}
