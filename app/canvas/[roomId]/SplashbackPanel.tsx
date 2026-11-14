'use client'

// Properties of the selected splashback (z_splashback S2): position + size in
// the wall elevation (left / width / bottom / top), set off the wall, thickness,
// schedule, opening reveal, Edit shape, notes, delete.

import { useState } from 'react'
import PanelDeleteButton, { PanelCloseButton } from './PanelDeleteButton'
import CalcInput from '@/src/components/CalcInput'
import type { BenchtopSegment, SplashbackInstance } from '@/src/lib/types'
import { sbBounds, stretchEdge, moveSegments, isRect } from '@/src/lib/splashbackGeometry'
import type { SbInfo } from './useSplashbacks'

const SOURCE_TEXT: Record<string, string> = {
  schedule: 'from the schedule', job: 'job override', room: 'room override', benchtop: 'same as the benchtop',
}

export default function SplashbackPanel({
  sb, info, wallName, schedules, onUpdate, onDelete, onClose, onEditShape,
}: {
  sb: SplashbackInstance
  info: SbInfo
  wallName: string
  schedules: { id: string; name: string; is_default: boolean }[]
  onUpdate: (id: string, u: Partial<SplashbackInstance>) => void
  onDelete: (id: string) => void
  onClose: () => void
  onEditShape: (id: string) => void
}) {
  const inp = 'w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500'
  const lbl = 'text-[10px] text-gray-500 uppercase tracking-wider mb-0.5 block'
  const b = sbBounds(sb.segments)
  const [label, setLabel] = useState(sb.label ?? '')
  const [notes, setNotes] = useState(sb.notes ?? '')
  // The canvas mounts this with key = splashback id, so the drafts start fresh per piece.

  const setSegs = (segs: BenchtopSegment[]) => onUpdate(sb.id, { segments: segs })
  const field = (k: string, value: number, onCommit: ((v: number) => void) | null, title: string) => (
    <div title={title}>
      <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">{k}</div>
      {onCommit
        ? <CalcInput value={Math.round(value * 10) / 10} decimals={1} onCommit={onCommit} className={inp + ' text-right'} />
        : <div className="bg-gray-800/60 rounded px-2 py-1 text-xs text-gray-300 text-right tabular-nums">{value}</div>}
    </div>
  )

  return (
    <div className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-300">Splashback</p>
          <p className="text-[10px] text-gray-500">{wallName} · {sb.wall_side === 'back' ? 'back' : 'face'}{isRect(sb.segments) ? '' : ' · shaped'}</p>
        </div>
        <PanelCloseButton onClose={onClose} />
      </div>

      <div className="p-4 space-y-3">
        <div>
          <label className={lbl}>Name</label>
          <input value={label} onChange={e => setLabel(e.target.value)} onBlur={() => label !== (sb.label ?? '') && onUpdate(sb.id, { label: label || null })} className={inp} />
        </div>

        {b && (
          <div className="space-y-1.5">
            <label className={lbl}>Position + size (mm)</label>
            <div className="grid grid-cols-2 gap-1">
              {field('Left', b.x0, v => setSegs(moveSegments(sb.segments, v - b.x0, 0)), 'Left edge along the wall, as seen in this elevation. Moves the whole piece.')}
              {field('Width', b.x1 - b.x0, v => setSegs(stretchEdge(sb.segments, 'right', b.x0 + v)), 'Overall width — the right edge moves.')}
              {field('Bottom', b.z0, v => setSegs(moveSegments(sb.segments, 0, v - b.z0)), 'Bottom edge above the floor (usually the bench top). Moves the whole piece.')}
              {field('Height', b.z1 - b.z0, v => setSegs(stretchEdge(sb.segments, 'top', b.z0 + v)), 'Overall height — the top edge moves.')}
            </div>
            <p className="text-[10px] text-gray-500">Drag the piece in elevation to move it, or the orange handles to stretch an edge.</p>
          </div>
        )}

        <div className="space-y-1.5">
          <label className={lbl}>Material</label>
          <select value={sb.splashback_schedule_id ?? ''} onChange={e => onUpdate(sb.id, { splashback_schedule_id: e.target.value || null })} className={inp}>
            <option value="">— room / job default —</option>
            {schedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <p className="text-[10px] text-gray-400">
            {info.name ?? 'No material — set a schedule'}
            {info.source ? <span className="text-gray-500"> · {SOURCE_TEXT[info.source] ?? info.source}</span> : null}
            <span className="text-gray-500"> · {info.isBoard ? 'board, cut part' : 'supply only'}</span>
          </p>
        </div>

        <div className="grid grid-cols-3 gap-1">
          {field('Thick', info.thick, v => onUpdate(sb.id, { thickness_mm: v > 0 ? v : null }), 'Panel thickness. Blank / 0 = the material thickness.')}
          {field('Off wall', Number(sb.offset_mm) || 0, v => onUpdate(sb.id, { offset_mm: Math.max(0, v) }), 'Set off the wall face (packers / battens).')}
          {field('Reveal', Number(sb.opening_reveal_mm) || 0, v => onUpdate(sb.id, { opening_reveal_mm: Math.max(0, v) }), 'Gap kept around windows / doors that cut the splashback.')}
        </div>
        {sb.thickness_mm != null && (
          <button onClick={() => onUpdate(sb.id, { thickness_mm: null })} className="text-[10px] text-blue-400 hover:text-blue-300">Use the material thickness</button>
        )}

        <button onClick={() => onEditShape(sb.id)}
          className="w-full py-1.5 text-xs rounded border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors">
          Edit shape…
        </button>

        <div>
          <label className={lbl}>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={() => notes !== (sb.notes ?? '') && onUpdate(sb.id, { notes: notes || null })}
            rows={3} className={inp + ' resize-y'} />
        </div>
      </div>

      <PanelDeleteButton label="Delete splashback" onDelete={() => onDelete(sb.id)} />
    </div>
  )
}
