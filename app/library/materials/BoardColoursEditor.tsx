'use client'

// ── BoardColoursEditor ────────────────────────────────────────────────────────
// Mounted below the entry form on Materials → Board Stock when a board is
// selected (z_material_colours MC2). A colour is a materials row whose
// parent_id is the board; the DB trigger copies the board's thickness, brand,
// CNC settings and (unless overridden) sheet size into it, and names it
// "<board> – <colour>". Every edit here saves straight away and reads the row
// back so trigger-set fields stay true.

import { useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import { useTutorial } from '@/src/lib/tutorial/store'

type Row = Record<string, unknown>

const num = (v: unknown) => { const n = parseFloat(String(v ?? '')); return isNaN(n) ? null : n }

export default function BoardColoursEditor({ board, colours, edgebands, onColours, onEdgebands }: {
  board: Row
  colours: Row[]
  edgebands: Row[]
  onColours: (rows: Row[]) => void              // upserted colour rows (fresh from DB)
  onEdgebands: (patch: { id: string; material_match_id: string | null }[]) => void
}) {
  const [error, setError]     = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy]       = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  const boardId = String(board.id)
  const list = colours
    .filter(c => showInactive || c.active !== false)
    .sort((a, b) => String(a.colour_name ?? '').localeCompare(String(b.colour_name ?? '')))

  async function save(id: string, patch: Row) {
    setError(null)
    const { data, error } = await supabase.from('materials').update(patch).eq('id', id).select().single()
    if (error) { setError(error.message); return }
    onColours([data as Row])
  }

  async function addColour() {
    const name = newName.trim()
    if (!name) return
    setBusy(true); setError(null)
    const { data, error } = await supabase.from('materials').insert({
      parent_id: boardId,
      colour_name: name,
      finish: board.finish ?? null,
      has_grain: Boolean(board.has_grain),
      face_colour: board.face_colour ?? null,
      edge_colour: board.edge_colour ?? null,
      is_default_colour: colours.length === 0,
      active: true,
    }).select().single()
    setBusy(false)
    if (error) { setError(error.message); return }
    setNewName('')
    onColours([data as Row])
    useTutorial.getState().emit('board_colour_added')   // tutorial board_colours
  }

  // One default per board (unique index): clear the old one first.
  async function makeDefault(id: string) {
    setError(null)
    const { data: cleared, error: e1 } = await supabase.from('materials')
      .update({ is_default_colour: false }).eq('parent_id', boardId).neq('id', id).eq('is_default_colour', true).select()
    if (e1) { setError(e1.message); return }
    const { data, error } = await supabase.from('materials').update({ is_default_colour: true }).eq('id', id).select().single()
    if (error) { setError(error.message); return }
    onColours([...(cleared ?? []) as Row[], data as Row])
  }

  // Sheet size: a value different from the board's is an override; blank or
  // equal to the board's drops the override and the trigger copies the board's.
  async function saveSheet(c: Row, key: 'sheet_dx' | 'sheet_dy', raw: string) {
    const v = num(raw)
    const over = new Set((c.overridden as string[] | null) ?? [])
    if (v == null || v === num(board[key])) over.delete(key)
    else over.add(key)
    await save(String(c.id), { overridden: [...over], ...(over.has(key) ? { [key]: v } : {}) })
  }

  // Matching tape = the edge_banding row whose material_match_id is this colour.
  async function saveTape(colourId: string, bandId: string) {
    setError(null)
    const patches: { id: string; material_match_id: string | null }[] = []
    const { data: cleared, error: e1 } = await supabase.from('edge_banding')
      .update({ material_match_id: null }).eq('material_match_id', colourId).select('id')
    if (e1) { setError(e1.message); return }
    for (const r of cleared ?? []) patches.push({ id: String(r.id), material_match_id: null })
    if (bandId) {
      const { error } = await supabase.from('edge_banding').update({ material_match_id: colourId }).eq('id', bandId)
      if (error) { setError(error.message); onEdgebands(patches); return }
      patches.push({ id: bandId, material_match_id: colourId })
    }
    onEdgebands(patches)
  }

  const activeBands = edgebands.filter(b => b.active !== false)
    .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')))

  const head = 'px-1.5 py-1 text-[9px] uppercase tracking-wide text-ink-subtle text-left font-normal'
  const cell = 'px-1.5 py-1 align-middle'

  return (
    <div className="flex-none border-b border-edge-strong bg-surface-2/40 max-h-[45vh] overflow-auto">
      <div className="px-4 py-3 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="text-[10px] uppercase tracking-wide text-ink-subtle">
            Colours · {String(board.name ?? '')}
          </div>
          <span className="text-[10px] text-ink-subtle">
            Thickness, brand, CNC settings and sheet size come from the board. Back blank = same as face.
          </span>
          <div className="flex-1" />
          <label className="flex items-center gap-1.5 text-[10px] text-ink-subtle cursor-pointer select-none">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="accent-blue-500" />
            Show inactive
          </label>
        </div>

        {list.length > 0 && (
          <table className="text-xs border-collapse min-w-max">
            <thead>
              <tr className="border-b border-edge-strong">
                <th className={head}>Default</th>
                <th className={head}>Colour</th>
                <th className={head}>Code</th>
                <th className={head}>Finish</th>
                <th className={head}>Face</th>
                <th className={head}>Back</th>
                <th className={head}>Edge</th>
                <th className={head}>Grain</th>
                <th className={head}>Matching tape</th>
                <th className={`${head} text-right`}>L mm</th>
                <th className={`${head} text-right`}>W mm</th>
                <th className={`${head} text-right`}>$/sht</th>
                <th className={head}>Active</th>
              </tr>
            </thead>
            <tbody>
              {list.map(c => {
                const id = String(c.id)
                const over = new Set((c.overridden as string[] | null) ?? [])
                const tape = edgebands.find(b => b.material_match_id === id)
                return (
                  <tr key={id} className={`border-b border-edge/60 ${c.active === false ? 'opacity-40' : ''}`}>
                    <td className={`${cell} text-center`}>
                      <input type="radio" name={`default-${boardId}`} checked={Boolean(c.is_default_colour)}
                        onChange={() => makeDefault(id)} className="accent-blue-500"
                        title="Used when a job picks this board without choosing a colour" />
                    </td>
                    <td className={cell}><TextCell value={c.colour_name} w={150} onCommit={v => v && save(id, { colour_name: v })} /></td>
                    <td className={cell}><TextCell value={c.colour_code} w={80} onCommit={v => save(id, { colour_code: v || null })} /></td>
                    <td className={cell}><TextCell value={c.finish} w={90} onCommit={v => save(id, { finish: v || null })} /></td>
                    <td className={cell}><ColourCell value={c.face_colour} onCommit={v => save(id, { face_colour: v })} /></td>
                    <td className={cell}><ColourCell value={c.back_colour} blankLabel="= face" onCommit={v => save(id, { back_colour: v })} /></td>
                    <td className={cell}><ColourCell value={c.edge_colour} blankLabel="= face" onCommit={v => save(id, { edge_colour: v })} /></td>
                    <td className={`${cell} text-center`}>
                      <input type="checkbox" checked={Boolean(c.has_grain)} onChange={e => save(id, { has_grain: e.target.checked })} className="accent-blue-500" />
                    </td>
                    <td className={cell}>
                      <select value={tape ? String(tape.id) : ''} onChange={e => saveTape(id, e.target.value)}
                        className="bg-transparent border-b border-edge-strong text-xs text-ink focus:outline-none focus:border-accent py-0.5 w-44">
                        <option value="" className="bg-surface">— board / schedule tape —</option>
                        {activeBands.map(b => (
                          <option key={String(b.id)} value={String(b.id)} className="bg-surface">
                            {String(b.name ?? '')}{b.material_match_id && b.material_match_id !== id ? ' (matched elsewhere)' : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={cell}><NumCell value={c.sheet_dx} overridden={over.has('sheet_dx')} onCommit={v => saveSheet(c, 'sheet_dx', v)} /></td>
                    <td className={cell}><NumCell value={c.sheet_dy} overridden={over.has('sheet_dy')} onCommit={v => saveSheet(c, 'sheet_dy', v)} /></td>
                    <td className={cell}><NumCell value={c.cost_per_sheet} step="0.01" onCommit={v => save(id, { cost_per_sheet: num(v) })} /></td>
                    <td className={`${cell} text-center`}>
                      <input type="checkbox" checked={c.active !== false} onChange={e => save(id, { active: e.target.checked })} className="accent-blue-500" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {list.length === 0 && (
          <p className="text-[11px] text-ink-subtle">
            No colours yet. A board with no colours is used as it is. Add colours to pick one per job.
          </p>
        )}

        <div className="flex items-center gap-2">
          <input
            type="text" value={newName} placeholder="New colour name, e.g. Natural Walnut"
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addColour() }}
            className="bg-transparent border-b border-edge-strong px-0.5 py-0.5 text-xs text-ink focus:outline-none focus:border-accent placeholder:text-ink-subtle w-64"
          />
          <button onClick={addColour} disabled={busy || !newName.trim()}
            className="px-2.5 py-1 bg-accent hover:bg-accent-hover disabled:opacity-40 text-white text-xs rounded whitespace-nowrap">
            {busy ? '…' : '+ Add colour'}
          </button>
          {error && <span className="text-[11px] text-red-500">{error}</span>}
        </div>
      </div>
    </div>
  )
}

// ── Inline cells: edit locally, save on blur / Enter ─────────────────────────

function TextCell({ value, w, onCommit }: { value: unknown; w: number; onCommit: (v: string) => void }) {
  const init = value == null ? '' : String(value)
  const [v, setV] = useState(init)
  const [seen, setSeen] = useState(init)
  if (init !== seen) { setSeen(init); setV(init) }
  return (
    <input
      type="text" value={v} style={{ width: w }}
      onChange={e => setV(e.target.value)}
      onBlur={() => { const t = v.trim(); if (t !== init) onCommit(t) }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className="bg-transparent border-b border-edge-strong px-0.5 py-0.5 text-xs text-ink focus:outline-none focus:border-accent"
    />
  )
}

function NumCell({ value, step, overridden, onCommit }: { value: unknown; step?: string; overridden?: boolean; onCommit: (v: string) => void }) {
  const init = value == null ? '' : String(Number(value))
  const [v, setV] = useState(init)
  const [seen, setSeen] = useState(init)
  if (init !== seen) { setSeen(init); setV(init) }
  return (
    <input
      type="number" step={step} value={v}
      title={overridden === undefined ? undefined : overridden ? 'Overrides the board (clear to use the board size)' : 'From the board'}
      onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== init) onCommit(v) }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      onFocus={e => e.target.select()}
      className={`bg-transparent border-b border-edge-strong px-0.5 py-0.5 text-xs focus:outline-none focus:border-accent text-right tabular-nums w-16 ${
        overridden === false ? 'text-ink-subtle' : overridden ? 'text-accent-ink' : 'text-ink'
      }`}
    />
  )
}

function ColourCell({ value, blankLabel, onCommit }: { value: unknown; blankLabel?: string; onCommit: (v: string | null) => void }) {
  const init = value ? String(value) : ''
  const [hex, setHex] = useState(init)
  const [seen, setSeen] = useState(init)
  if (init !== seen) { setSeen(init); setHex(init) }
  // The picker fires on every drag step; save once when it closes (blur).
  return (
    <div className="flex items-center gap-1">
      <input
        type="color" value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : '#ffffff'}
        onChange={e => setHex(e.target.value)}
        onBlur={() => { if (hex && hex !== init) onCommit(hex) }}
        className="w-6 h-5 rounded cursor-pointer border border-edge-strong bg-transparent p-0 flex-none"
      />
      <span className={`font-mono text-[10px] w-14 ${hex ? 'text-ink-muted' : 'text-ink-subtle'}`}>{hex || blankLabel || '—'}</span>
      {hex && blankLabel && (
        <button onClick={() => onCommit(null)} title={`Clear (${blankLabel})`} className="text-ink-subtle hover:text-ink-muted text-[10px]">✕</button>
      )}
    </div>
  )
}
