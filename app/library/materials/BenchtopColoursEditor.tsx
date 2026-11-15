'use client'

// ── BenchtopColoursEditor ─────────────────────────────────────────────────────
// Mounted below the entry form on Materials → Benchtops when a stone type is
// selected (z_benchtop_colours C2). A colour is a benchtop_materials row whose
// parent_id is the type; the DB trigger copies the type's thickness, material
// type, grain and edge profile, and names it "<type> – <brand> <colour>".
// Slab size is per colour (suppliers differ). Slab photo (C4) = full-slab image
// in the benchtop-textures bucket, laid on the top at the slab's true size.

import { useRef, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import { useTutorial } from '@/src/lib/tutorial/store'
import { BENCHTOP_TEXTURE_BUCKET, benchtopTextureUrl, prepareSlabImage } from '@/src/lib/benchtopTextures'
import { TextCell, NumCell, ColourCell } from './BoardColoursEditor'

type Row = Record<string, unknown>
const num = (v: unknown) => { const n = parseFloat(String(v ?? '')); return isNaN(n) ? null : n }
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export default function BenchtopColoursEditor({ type, colours, onColours }: {
  type: Row
  colours: Row[]
  onColours: (rows: Row[]) => void              // upserted colour rows (fresh from DB)
}) {
  const [error, setError]     = useState<string | null>(null)
  const [newBrand, setNewBrand] = useState('')
  const [newName, setNewName] = useState('')
  const [busy, setBusy]       = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [brandFilter, setBrandFilter] = useState('')
  const [q, setQ] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadFor = useRef<Row | null>(null)

  const typeId = String(type.id)
  const brands = [...new Set(colours.map(c => String(c.brand ?? '')).filter(Boolean))].sort()
  const list = colours
    .filter(c => showInactive || c.active !== false)
    .filter(c => !brandFilter || c.brand === brandFilter)
    .filter(c => !q || `${c.colour_name} ${c.range_name ?? ''} ${c.colour_code ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => `${a.brand ?? ''} ${a.colour_name ?? ''}`.localeCompare(`${b.brand ?? ''} ${b.colour_name ?? ''}`))

  async function save(id: string, patch: Row) {
    setError(null)
    const { data, error } = await supabase.from('benchtop_materials').update(patch).eq('id', id).select().single()
    if (error) { setError(error.message); return }
    onColours([data as Row])
  }

  async function addColour() {
    const name = newName.trim()
    if (!name) return
    setBusy('add'); setError(null)
    const { data, error } = await supabase.from('benchtop_materials').insert({
      parent_id: typeId, brand: newBrand.trim() || null, colour_name: name,
      name, dz: type.dz ?? 20,                      // placeholders — the trigger sets them
      sheet_dx: type.sheet_dx, sheet_dy: type.sheet_dy, active: true,
    }).select().single()
    setBusy(null)
    if (error) { setError(error.message); return }
    setNewName('')
    onColours([data as Row])
    useTutorial.getState().emit('benchtop_colour_added')
  }

  // Slab size: a value different from the type's is an override (suppliers differ).
  async function saveSheet(c: Row, key: 'sheet_dx' | 'sheet_dy', raw: string) {
    const v = num(raw)
    const over = new Set((c.overridden as string[] | null) ?? [])
    if (v == null || v === num(type[key])) over.delete(key)
    else over.add(key)
    const patch: Row = { overridden: [...over], ...(over.has(key) ? { [key]: v } : {}) }
    // The photo shows the whole slab, so it follows the slab size.
    if (c.texture_path) patch[key === 'sheet_dx' ? 'texture_w_mm' : 'texture_h_mm'] = v ?? type[key]
    await save(String(c.id), patch)
  }

  // Upload a full-slab photo: shrunk to ≤ 4096 px (+ 320 px thumbnail), swatch
  // colour taken from it when the colour has none.
  async function upload(c: Row, file: File) {
    setBusy(String(c.id)); setError(null)
    try {
      const big = await prepareSlabImage(file, 4096)
      const thumb = await prepareSlabImage(file, 320)
      const base = `${slug(String(c.brand ?? 'other'))}/${slug(String(c.colour_name ?? c.id))}`
      for (const [path, blob] of [[`${base}.jpg`, big.blob], [`${base}-thumb.jpg`, thumb.blob]] as const) {
        const { error } = await supabase.storage.from(BENCHTOP_TEXTURE_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '60' })
        if (error) throw error
      }
      await save(String(c.id), {
        texture_path: `${base}.jpg`, thumb_path: `${base}-thumb.jpg`,
        texture_w_mm: num(c.sheet_dx), texture_h_mm: num(c.sheet_dy),
        ...(c.color ? {} : { color: big.hex }),
      })
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setBusy(null)
  }

  async function clearImage(c: Row) {
    const paths = [c.texture_path, c.thumb_path].filter(Boolean).map(String)
    if (paths.length) await supabase.storage.from(BENCHTOP_TEXTURE_BUCKET).remove(paths)
    await save(String(c.id), { texture_path: null, thumb_path: null, texture_w_mm: null, texture_h_mm: null })
  }

  const head = 'px-1.5 py-1 text-[9px] uppercase tracking-wide text-ink-subtle text-left font-normal'
  const cell = 'px-1.5 py-1 align-middle'
  const inp = 'bg-transparent border-b border-edge-strong px-0.5 py-0.5 text-xs text-ink focus:outline-none focus:border-accent placeholder:text-ink-subtle'

  return (
    <div className="flex-none border-b border-edge-strong bg-surface-2/40 max-h-[55vh] overflow-auto">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => {
        const f = e.target.files?.[0]; const c = uploadFor.current
        e.target.value = ''
        if (f && c) upload(c, f)
      }} />
      <div className="px-4 py-3 flex flex-col gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-[10px] uppercase tracking-wide text-ink-subtle">
            Colours · {String(type.name ?? '')}
          </div>
          <span className="text-[10px] text-ink-subtle">
            Thickness and type come from &ldquo;{String(type.name ?? '')}&rdquo;. Slab photo = the whole slab, laid on tops at true size.
          </span>
          <div className="flex-1" />
          <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)} className={`${inp} w-36`}>
            <option value="" className="bg-surface">All brands</option>
            {brands.map(b => <option key={b} value={b} className="bg-surface">{b}</option>)}
          </select>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find colour…" className={`${inp} w-32`} />
          <label className="flex items-center gap-1.5 text-[10px] text-ink-subtle cursor-pointer select-none">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="accent-blue-500" />
            Show inactive
          </label>
        </div>

        {list.length > 0 && (
          <table className="text-xs border-collapse min-w-max">
            <thead>
              <tr className="border-b border-edge-strong">
                <th className={head}>Slab photo</th>
                <th className={head}>Brand</th>
                <th className={head}>Colour</th>
                <th className={head}>Code</th>
                <th className={head}>Range</th>
                <th className={head}>Finish</th>
                <th className={head}>Swatch</th>
                <th className={`${head} text-right`}>Slab L</th>
                <th className={`${head} text-right`}>Slab W</th>
                <th className={head}>Source</th>
                <th className={head}>Active</th>
              </tr>
            </thead>
            <tbody>
              {list.map(c => {
                const id = String(c.id)
                const over = new Set((c.overridden as string[] | null) ?? [])
                const thumb = benchtopTextureUrl(String(c.thumb_path ?? '') || null)
                return (
                  <tr key={id} className={`border-b border-edge/60 ${c.active === false ? 'opacity-40' : ''}`}>
                    <td className={cell}>
                      <div className="flex items-center gap-1.5">
                        {thumb
                          ? <a href={benchtopTextureUrl(String(c.texture_path)) ?? undefined} target="_blank" rel="noreferrer" title="Open the full slab photo">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={thumb} alt="" className="w-20 h-10 object-cover rounded-sm border border-edge-strong" />
                            </a>
                          : <span className="w-20 h-10 rounded-sm border border-dashed border-edge-strong flex items-center justify-center text-[9px] text-ink-subtle">no photo</span>}
                        <button disabled={busy === id} onClick={() => { uploadFor.current = c; fileRef.current?.click() }}
                          className="text-[10px] text-accent-ink hover:underline disabled:opacity-40">{busy === id ? '…' : thumb ? 'Replace' : 'Upload'}</button>
                        {thumb && <button onClick={() => clearImage(c)} title="Remove the photo" className="text-ink-subtle hover:text-ink-muted text-[10px]">✕</button>}
                      </div>
                    </td>
                    <td className={cell}><TextCell value={c.brand} w={110} onCommit={v => save(id, { brand: v || null })} /></td>
                    <td className={cell}><TextCell value={c.colour_name} w={140} onCommit={v => v && save(id, { colour_name: v })} /></td>
                    <td className={cell}><TextCell value={c.colour_code} w={56} onCommit={v => save(id, { colour_code: v || null })} /></td>
                    <td className={cell}><TextCell value={c.range_name} w={140} onCommit={v => save(id, { range_name: v || null })} /></td>
                    <td className={cell}><TextCell value={c.finish} w={70} onCommit={v => save(id, { finish: v || null })} /></td>
                    <td className={cell}><ColourCell value={c.color} blankLabel="none" onCommit={v => save(id, { color: v })} /></td>
                    <td className={cell}><NumCell value={c.sheet_dx} overridden={over.has('sheet_dx')} onCommit={v => saveSheet(c, 'sheet_dx', v)} /></td>
                    <td className={cell}><NumCell value={c.sheet_dy} overridden={over.has('sheet_dy')} onCommit={v => saveSheet(c, 'sheet_dy', v)} /></td>
                    <td className={cell}>
                      {c.source_url ? <a href={String(c.source_url)} target="_blank" rel="noreferrer" className="text-[10px] text-accent-ink hover:underline">site</a> : <span className="text-ink-subtle">—</span>}
                      {c.notes ? <span title={String(c.notes)} className="ml-1 text-[10px] text-ink-subtle cursor-help">ⓘ</span> : null}
                    </td>
                    <td className={`${cell} text-center`}>
                      <input type="checkbox" checked={c.active !== false} onChange={e => save(id, { active: e.target.checked })} className="accent-blue-500" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {colours.length === 0 && (
          <p className="text-[11px] text-ink-subtle">
            No colours yet. A type with no colours is used as it is. Add colours to pick one per job.
          </p>
        )}

        <div className="flex items-center gap-2">
          <input type="text" value={newBrand} placeholder="Brand, e.g. YDL" list="bt-colour-brands"
            onChange={e => setNewBrand(e.target.value)} className={`${inp} w-36`} />
          <datalist id="bt-colour-brands">{brands.map(b => <option key={b} value={b} />)}</datalist>
          <input type="text" value={newName} placeholder="New colour, e.g. Calacatta Classico"
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addColour() }}
            className={`${inp} w-64`} />
          <button onClick={addColour} disabled={busy === 'add' || !newName.trim()}
            className="px-2.5 py-1 bg-accent hover:bg-accent-hover disabled:opacity-40 text-white text-xs rounded whitespace-nowrap">
            {busy === 'add' ? '…' : '+ Add colour'}
          </button>
          {error && <span className="text-[11px] text-red-500">{error}</span>}
        </div>
      </div>
    </div>
  )
}
