'use client'
// Appliance schedule (z_fixtures P4): every appliance, sink and tap placed in the
// room / job — what it is, brand + model number (from the library row it came
// from), size, and where it goes (the cabinet it sits on, else its wall).
// Decorative items are left out.

import type { Room, Wall, CabinetInstance, RoomFixture } from '@/src/lib/types'

export interface ScheduleLine {
  item:     string
  name:     string
  brand:    string
  modelNo:  string
  size:     string
  location: string
}
export interface ScheduleRoomData { room: Room; lines: ScheduleLine[] }
export type CatalogRef = { brand: string | null; model_no: string | null }

const CATEGORY_ORDER = ['appliance', 'sink', 'tap']
const CATEGORY_LABEL: Record<string, string> = { appliance: 'Appliance', sink: 'Sink', tap: 'Tap' }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function buildSchedule(
  rooms: Room[], fixtures: RoomFixture[], cabinets: CabinetInstance[], walls: Wall[],
  catalog: Map<string, CatalogRef>,
): ScheduleRoomData[] {
  return rooms.map(room => {
    const lines = fixtures
      .filter(f => f.room_id === room.id && CATEGORY_ORDER.includes(f.category))
      .sort((a, b) =>
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
        || (a.kind ?? '').localeCompare(b.kind ?? '')
        || (a.label || a.name).localeCompare(b.label || b.name, undefined, { numeric: true }))
      .map(f => {
        const cat = f.catalog_id ? catalog.get(f.catalog_id) : undefined
        const cab = f.cabinet_id ? cabinets.find(c => c.id === f.cabinet_id) : undefined
        const wall = f.wall_id ? walls.find(w => w.id === f.wall_id) : undefined
        return {
          item:     f.kind || CATEGORY_LABEL[f.category] || f.category,
          name:     f.label || f.name,
          brand:    cat?.brand ?? '',
          modelNo:  cat?.model_no ?? '',
          size:     `${Math.round(f.width)} × ${Math.round(f.depth)} × ${Math.round(f.height)}`,
          location: cab ? `On ${cab.label ?? 'cabinet'}` : wall ? (wall.name || 'Wall') : 'Free-standing',
        }
      })
    return { room, lines }
  })
}

const HEAD = ['Item', 'Name', 'Brand', 'Model no.', 'W × D × H (mm)', 'Location']

export function ApplianceScheduleSheet({ data }: { data: ScheduleRoomData[] }) {
  if (!data.some(d => d.lines.length)) {
    return (
      <div className="text-center py-12 text-gray-500 text-sm">
        No appliances placed.
        <div className="text-xs mt-1 text-gray-600">Place appliances, sinks and taps with F6 on the canvas.</div>
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
                {HEAD.map(h => <th key={h} className="pb-1 pr-3 font-medium border-b border-gray-800 text-left">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className={i % 2 ? 'bg-gray-800/30' : ''}>
                  <td className="py-1 pr-3 text-gray-300">{l.item}</td>
                  <td className="py-1 pr-3 text-white">{l.name}</td>
                  <td className="py-1 pr-3 text-gray-300">{l.brand}</td>
                  <td className="py-1 pr-3 text-gray-300 font-mono">{l.modelNo}</td>
                  <td className="py-1 pr-3 text-gray-300 font-mono">{l.size}</td>
                  <td className="py-1 pr-3 text-gray-300">{l.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

export function schedulePrintHtml(data: ScheduleRoomData[]): string {
  return data.filter(d => d.lines.length).map(({ room, lines }) => `
    <h2>${esc(room.name)}</h2>
    <table>
      <thead><tr>${HEAD.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>
        ${lines.map((l, i) => `
          <tr class="${i % 2 ? 'alt' : ''}">
            <td>${esc(l.item)}</td><td>${esc(l.name)}</td><td>${esc(l.brand)}</td>
            <td class="mono">${esc(l.modelNo)}</td><td class="mono">${esc(l.size)}</td><td>${esc(l.location)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`).join('')
}
