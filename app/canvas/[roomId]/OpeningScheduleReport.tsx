'use client'
// Door & window schedule (z_fixtures P5 gap): every opening placed in the room /
// job — a mark (its label, else D1 / W1 / S1 / O1 per room), what it is, size,
// sill + head heights, the wall it's in and, for hinged doors, hinge + swing.

import type { Room, Wall, RoomFixture } from '@/src/lib/types'

export interface OpeningLine {
  mark:     string
  item:     string
  name:     string
  size:     string
  sill:     string
  head:     string
  wall:     string
  hang:     string
}
export interface OpeningRoomData { room: Room; lines: OpeningLine[] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Sort order + mark prefix by kind. */
function kindOf(f: RoomFixture): { order: number; prefix: string; label: string } {
  const k = (f.kind ?? '').toLowerCase()
  if (k.includes('sliding')) return { order: 1, prefix: 'S', label: f.kind || 'Sliding door' }
  if (k.includes('door'))    return { order: 0, prefix: 'D', label: f.kind || 'Door' }
  if (k.includes('window'))  return { order: 2, prefix: 'W', label: f.kind || 'Window' }
  return { order: 3, prefix: 'O', label: f.kind || 'Opening' }
}

export function buildOpeningSchedule(rooms: Room[], fixtures: RoomFixture[], walls: Wall[]): OpeningRoomData[] {
  return rooms.map(room => {
    const wallName = (id: string | null) => {
      const i = walls.filter(w => w.room_id === room.id).findIndex(w => w.id === id)
      const w = i >= 0 ? walls.filter(w => w.room_id === room.id)[i] : undefined
      return w ? (w.name || `Wall ${i + 1}`) : ''
    }
    const count: Record<string, number> = {}
    const lines = fixtures
      .filter(f => f.room_id === room.id && f.category === 'opening')
      .map(f => ({ f, k: kindOf(f) }))
      .sort((a, b) => a.k.order - b.k.order || wallName(a.f.wall_id).localeCompare(wallName(b.f.wall_id), undefined, { numeric: true }) || a.f.x - b.f.x)
      .map(({ f, k }) => {
        count[k.prefix] = (count[k.prefix] ?? 0) + 1
        const sill = Number(f.z) || 0, h = Number(f.height)
        const hinged = k.prefix === 'D'
        return {
          mark: f.label || `${k.prefix}${count[k.prefix]}`,
          item: k.label,
          name: f.name,
          size: `${Math.round(f.width)} × ${Math.round(h)}`,
          sill: sill > 0.5 ? String(Math.round(sill)) : '—',
          head: String(Math.round(sill + h)),
          wall: wallName(f.wall_id),
          hang: hinged ? `${f.hinge_side === 'right' ? 'Right' : 'Left'} hinge · swings ${f.swing === 'out' ? 'out' : 'in'}` : '',
        }
      })
    return { room, lines }
  })
}

const HEAD = ['Mark', 'Type', 'Name', 'W × H (mm)', 'Sill', 'Head', 'Wall', 'Hinge / swing']
const cells = (l: OpeningLine) => [l.mark, l.item, l.name, l.size, l.sill, l.head, l.wall, l.hang]
const MONO = new Set([3, 4, 5])

export function OpeningScheduleSheet({ data }: { data: OpeningRoomData[] }) {
  if (!data.some(d => d.lines.length)) {
    return (
      <div className="text-center py-12 text-gray-500 text-sm">
        No doors or windows placed.
        <div className="text-xs mt-1 text-gray-600">Place them with F6 → Doors &amp; windows on the canvas.</div>
      </div>
    )
  }
  return (
    <div className="space-y-8">
      {data.map(({ room, lines }) => lines.length === 0 ? null : (
        <div key={room.id}>
          <div className="flex items-baseline gap-3 mb-3 pb-1.5 border-b border-gray-700">
            <span className="text-sm font-semibold text-white">{room.name}</span>
            <span className="text-xs text-gray-500">{lines.length} opening{lines.length > 1 ? 's' : ''}</span>
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
                  {cells(l).map((c, j) => (
                    <td key={j} className={`py-1 pr-3 ${j === 0 ? 'text-white font-medium' : 'text-gray-300'} ${MONO.has(j) ? 'font-mono' : ''}`}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

export function openingSchedulePrintHtml(data: OpeningRoomData[]): string {
  return data.filter(d => d.lines.length).map(({ room, lines }) => `
    <h2>${esc(room.name)}</h2>
    <table>
      <thead><tr>${HEAD.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>
        ${lines.map((l, i) => `
          <tr class="${i % 2 ? 'alt' : ''}">
            ${cells(l).map((c, j) => `<td${MONO.has(j) ? ' class="mono"' : ''}>${esc(c)}</td>`).join('')}
          </tr>`).join('')}
      </tbody>
    </table>`).join('')
}
