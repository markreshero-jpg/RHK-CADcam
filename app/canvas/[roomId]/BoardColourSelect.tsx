'use client'

// ── BoardColourSelect ─────────────────────────────────────────────────────────
// Two-step material picker (z_material_colours MC4): pick a board, then one of
// its colours. A board with no colours is picked as it is. A board with colours
// but no colour chosen saves the board itself — the resolver then uses the
// board's default colour and warns COLOUR_NOT_CHOSEN — so the colour select is
// shown amber until a colour is picked. value '' = inherit (inheritLabel).

import { useTutorial } from '@/src/lib/tutorial/store'

// Tutorial job_colours: a board pick, then a colour pick.
function pick(onChange: (id: string) => void, id: string, isColour: boolean) {
  if (id) useTutorial.getState().emit(isColour ? 'mat_colour_pick' : 'mat_board_pick')
  onChange(id)
}

export interface PickMat {
  id: string
  name: string
  dz: number
  parent_id: string | null
  colour_name: string | null
}

export default function BoardColourSelect({ value, mats, inheritLabel, onChange, className }: {
  value: string
  mats: PickMat[]
  inheritLabel: string
  onChange: (id: string) => void
  className: (active: boolean) => string
}) {
  const cur     = value ? mats.find(m => m.id === value) : undefined
  const boardId = cur ? (cur.parent_id ?? cur.id) : ''
  const boards  = mats.filter(m => !m.parent_id)
  const colours = boardId ? mats.filter(m => m.parent_id === boardId) : []
  const noColour = colours.length > 0 && !cur?.parent_id

  return (
    <div className="flex flex-col gap-1">
      <select value={boardId} onChange={e => pick(onChange, e.target.value, false)} className={className(!!value)}>
        <option value="">{inheritLabel}</option>
        {boards.map(b => (
          <option key={b.id} value={b.id}>{b.name} ({b.dz}mm)</option>
        ))}
        {/* A saved id that isn't in the active list (inactive material). */}
        {value && !cur && <option value={value}>{value.slice(0, 8)}…</option>}
      </select>
      {colours.length > 0 && (
        <select
          value={cur?.parent_id ? cur.id : boardId}
          onChange={e => pick(onChange, e.target.value, e.target.value !== boardId)}
          className={noColour
            ? 'w-full bg-gray-800 border border-amber-600 rounded px-2 py-1 text-xs text-amber-300 focus:outline-none focus:border-amber-400'
            : className(true)}
          title={noColour ? 'No colour chosen: the board\'s default colour is used, with a warning' : undefined}
        >
          <option value={boardId}>— choose colour —</option>
          {colours.map(c => (
            <option key={c.id} value={c.id}>{c.colour_name}</option>
          ))}
        </select>
      )}
    </div>
  )
}
