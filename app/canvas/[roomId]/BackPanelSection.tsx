'use client'

// Island back panel section of the cabinet panel (z_island_back_panel): to the
// floor / to the kick, and the sheet width it splits at (equal pieces).
// Writes `back_panel`; the depth follows the exposed board (CanvasClient).

import { CabinetInstance } from '@/src/lib/types'
import CalcInput from '@/src/components/CalcInput'
import { normaliseBackPanel, backPanelPieces, type BackPanelSettings } from '@/src/lib/backPanel'

export default function BackPanelSection({ cabinet, onUpdate, inp, lbl }: {
  cabinet: CabinetInstance
  onUpdate: (id: string, u: Partial<CabinetInstance>) => Promise<void>
  inp: string
  lbl: string
}) {
  const s = normaliseBackPanel(cabinet.back_panel)
  if (!s) return null
  const put = (next: Partial<BackPanelSettings>) => void onUpdate(cabinet.id, { back_panel: { ...s, ...next } })
  const n = backPanelPieces(cabinet.dx, s.sheet_w)
  const each = n > 0 ? Math.round(cabinet.dx / n * 10) / 10 : 0

  return (
    <div className="space-y-2 border-t border-gray-800 pt-3">
      <p className={lbl}>Island back panel</p>
      <div className="flex gap-4">
        {(['floor', 'kick'] as const).map(m => (
          <label key={m} className="flex items-center gap-2 text-xs text-gray-300">
            <input type="radio" checked={s.mount === m} onChange={() => put({ mount: m })} />
            {m === 'floor' ? 'To floor' : 'To kick'}
          </label>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_4.5rem] gap-1 items-center"
        title="Widest piece the board allows (grain boards: the sheet width). Wider panels split into equal pieces.">
        <label className="text-xs text-gray-300">Sheet width</label>
        <CalcInput value={s.sheet_w} decimals={1} onCommit={v => { if (v >= 100) put({ sheet_w: v }) }} className={inp + ' text-right'} />
      </div>
      <p className="text-[10px] text-gray-500">
        {n > 1 ? `${n} pieces × ${each}` : `1 piece`} — grain runs up the panel; taped all round, joins included{s.mount === 'floor' ? ' (bottom edge raw on the floor)' : ''}.
      </p>
    </div>
  )
}
