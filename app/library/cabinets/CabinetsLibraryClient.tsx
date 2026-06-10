'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/src/lib/supabase'
import { ThemeToggle } from '../../ThemeToggle'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Category    { id: string; name: string; sort_order: number; accent_color: string | null; active: boolean }
interface Subcategory { id: string; name: string; sort_order: number; active: boolean }
interface Definition  {
  id: string; name: string; assembly_class: string
  category_id: string | null; subcategory_id: string | null
  description: string | null; sort_order: number; active: boolean
  default_dx: number; default_dy: number; default_dz: number
}

type ReassignTarget = { kind: 'category' | 'subcategory'; id: string; name: string; count: number } | null

// ── Component ─────────────────────────────────────────────────────────────────

export default function CabinetsLibraryClient({
  initialCategories = [], initialSubcategories = [], initialDefinitions = [], embedded = false,
}: {
  initialCategories?: Record<string, unknown>[]
  initialSubcategories?: Record<string, unknown>[]
  initialDefinitions?: Record<string, unknown>[]
  embedded?: boolean
}) {
  const [cats, setCats] = useState<Category[]>(() => initialCategories as unknown as Category[])
  const [subs, setSubs] = useState<Subcategory[]>(() => initialSubcategories as unknown as Subcategory[])
  const [defs, setDefs] = useState<Definition[]>(() => initialDefinitions as unknown as Definition[])

  const [selectedCat, setSelectedCat] = useState<string | null>(() => (initialCategories[0]?.id as string) ?? null)
  const [newCat, setNewCat] = useState('')
  const [newSub, setNewSub] = useState('')
  const [reassign, setReassign] = useState<ReassignTarget>(null)
  const [reassignTo, setReassignTo] = useState<string>('')
  const [err, setErr] = useState<string | null>(null)

  // When embedded in Settings the server props aren't supplied — load directly.
  const reload = useCallback(async () => {
    const [c, s, d] = await Promise.all([
      supabase.from('cabinet_categories').select('*').order('sort_order'),
      supabase.from('cabinet_subcategories').select('*').order('sort_order'),
      supabase.from('cabinet_definitions').select('*').order('sort_order'),
    ])
    setCats((c.data ?? []) as unknown as Category[])
    setSubs((s.data ?? []) as unknown as Subcategory[])
    setDefs((d.data ?? []) as unknown as Definition[])
    setSelectedCat(prev => prev ?? (c.data?.[0]?.id as string) ?? null)
  }, [])
  useEffect(() => { if (embedded) void reload() }, [embedded, reload])

  const byOrder = <T extends { sort_order: number; name: string }>(a: T, b: T) =>
    a.sort_order - b.sort_order || a.name.localeCompare(b.name)

  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await p
    if (error) { setErr(error.message); return false }
    setErr(null); return true
  }

  // ── Category CRUD ──
  async function addCategory() {
    const name = newCat.trim(); if (!name) return
    const sort_order = (cats.reduce((m, c) => Math.max(m, c.sort_order), -1)) + 1
    const { data, error } = await supabase.from('cabinet_categories').insert({ name, sort_order }).select().single()
    if (error) { setErr(error.message); return }
    setCats(cs => [...cs, data as Category]); setNewCat('')
  }
  async function renameCategory(id: string, name: string) {
    setCats(cs => cs.map(c => c.id === id ? { ...c, name } : c))
    await run(supabase.from('cabinet_categories').update({ name }).eq('id', id))
  }
  async function toggleCategory(id: string, active: boolean) {
    setCats(cs => cs.map(c => c.id === id ? { ...c, active } : c))
    await run(supabase.from('cabinet_categories').update({ active }).eq('id', id))
  }

  // ── Subcategory CRUD ──
  async function addSubcategory() {
    const name = newSub.trim(); if (!name) return
    const sort_order = (subs.reduce((m, s) => Math.max(m, s.sort_order), -1)) + 1
    const { data, error } = await supabase.from('cabinet_subcategories').insert({ name, sort_order }).select().single()
    if (error) { setErr(error.message); return }
    setSubs(ss => [...ss, data as Subcategory]); setNewSub('')
  }
  async function renameSubcategory(id: string, name: string) {
    setSubs(ss => ss.map(s => s.id === id ? { ...s, name } : s))
    await run(supabase.from('cabinet_subcategories').update({ name }).eq('id', id))
  }
  async function toggleSubcategory(id: string, active: boolean) {
    setSubs(ss => ss.map(s => s.id === id ? { ...s, active } : s))
    await run(supabase.from('cabinet_subcategories').update({ active }).eq('id', id))
  }

  // ── Reorder (swap sort_order with neighbour) ──
  async function moveCat(id: string, dir: -1 | 1) {
    const ordered = [...cats].sort(byOrder)
    const i = ordered.findIndex(c => c.id === id); const j = i + dir
    if (j < 0 || j >= ordered.length) return
    const a = ordered[i], b = ordered[j]
    setCats(cs => cs.map(c => c.id === a.id ? { ...c, sort_order: b.sort_order } : c.id === b.id ? { ...c, sort_order: a.sort_order } : c))
    await run(supabase.from('cabinet_categories').update({ sort_order: b.sort_order }).eq('id', a.id))
    await run(supabase.from('cabinet_categories').update({ sort_order: a.sort_order }).eq('id', b.id))
  }
  async function moveSub(id: string, dir: -1 | 1) {
    const ordered = [...subs].sort(byOrder)
    const i = ordered.findIndex(s => s.id === id); const j = i + dir
    if (j < 0 || j >= ordered.length) return
    const a = ordered[i], b = ordered[j]
    setSubs(ss => ss.map(s => s.id === a.id ? { ...s, sort_order: b.sort_order } : s.id === b.id ? { ...s, sort_order: a.sort_order } : s))
    await run(supabase.from('cabinet_subcategories').update({ sort_order: b.sort_order }).eq('id', a.id))
    await run(supabase.from('cabinet_subcategories').update({ sort_order: a.sort_order }).eq('id', b.id))
  }

  // ── Delete (FK RESTRICT → reassign-then-delete when in use) ──
  function requestDeleteCat(c: Category) {
    const count = defs.filter(d => d.category_id === c.id).length
    if (count === 0) { if (confirm(`Delete category “${c.name}”?`)) void doDeleteCat(c.id); return }
    setReassign({ kind: 'category', id: c.id, name: c.name, count })
    setReassignTo(cats.find(x => x.id !== c.id)?.id ?? '')
  }
  function requestDeleteSub(s: Subcategory) {
    const count = defs.filter(d => d.subcategory_id === s.id).length
    if (count === 0) { if (confirm(`Delete subcategory “${s.name}”?`)) void doDeleteSub(s.id); return }
    setReassign({ kind: 'subcategory', id: s.id, name: s.name, count })
    setReassignTo(subs.find(x => x.id !== s.id)?.id ?? '')
  }
  async function doDeleteCat(id: string) {
    if (!(await run(supabase.from('cabinet_categories').delete().eq('id', id)))) return
    setCats(cs => cs.filter(c => c.id !== id))
    if (selectedCat === id) setSelectedCat(null)
  }
  async function doDeleteSub(id: string) {
    if (!(await run(supabase.from('cabinet_subcategories').delete().eq('id', id)))) return
    setSubs(ss => ss.filter(s => s.id !== id))
  }
  async function confirmReassign() {
    if (!reassign || !reassignTo) return
    const col = reassign.kind === 'category' ? 'category_id' : 'subcategory_id'
    if (!(await run(supabase.from('cabinet_definitions').update({ [col]: reassignTo }).eq(col, reassign.id)))) return
    const matches = (d: Definition) => (reassign.kind === 'category' ? d.category_id : d.subcategory_id) === reassign.id
    setDefs(ds => ds.map(d => matches(d) ? { ...d, [col]: reassignTo } : d))
    if (reassign.kind === 'category') await doDeleteCat(reassign.id); else await doDeleteSub(reassign.id)
    setReassign(null)
  }

  // ── Definition edits ──
  async function updateDef(id: string, patch: Partial<Definition>) {
    setDefs(ds => ds.map(d => d.id === id ? { ...d, ...patch } : d))
    await run(supabase.from('cabinet_definitions').update(patch).eq('id', id))
  }
  async function deleteDef(d: Definition) {
    if (!confirm(`Delete “${d.name}” from the library? Placed cabinets are unaffected.`)) return
    if (!(await run(supabase.from('cabinet_definitions').delete().eq('id', d.id)))) return
    setDefs(ds => ds.filter(x => x.id !== d.id))
  }

  // ── Derived ──
  const orderedCats = [...cats].sort(byOrder)
  const orderedSubs = [...subs].sort(byOrder)
  const shownDefs = defs.filter(d => selectedCat === null || d.category_id === selectedCat)
  const catName = (id: string | null) => cats.find(c => c.id === id)?.name ?? '—'

  const inputCls = 'bg-surface-2/60 border border-transparent hover:border-edge-strong rounded px-1.5 py-0.5 text-sm text-ink focus:outline-none focus:border-accent'

  return (
    <div className="h-screen bg-canvas text-ink flex flex-col overflow-hidden">
      {!embedded && (
        <div className="flex-none border-b border-edge px-6 py-3 flex items-center gap-3">
          <ThemeToggle />
          <Link href="/settings" className="text-ink-subtle hover:text-ink-muted text-sm transition-colors">← Settings</Link>
          <span className="text-ink-subtle">|</span>
          <Link href="/library/materials" className="text-ink-subtle hover:text-ink-muted text-sm transition-colors">Materials</Link>
          <span className="text-ink-subtle">|</span>
          <Link href="/library/joints" className="text-ink-subtle hover:text-ink-muted text-sm transition-colors">Joints</Link>
          <span className="text-ink-subtle">|</span>
          <Link href="/library/doors" className="text-ink-subtle hover:text-ink-muted text-sm transition-colors">Doors</Link>
          <span className="text-ink-subtle">|</span>
          <span className="text-sm font-semibold text-ink">Cabinets</span>
        </div>
      )}

      {err && <div className="flex-none px-6 py-2 bg-red-500/10 text-red-400 text-xs border-b border-red-500/20">{err}</div>}

      <div className="flex-1 flex min-h-0">
        {/* ── Taxonomy panel ── */}
        <div className="flex-none w-72 border-r border-edge overflow-y-auto p-3 space-y-5">
          {/* Categories */}
          <section>
            <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1.5">Categories</h3>
            <ul className="space-y-0.5">
              <li>
                <button onClick={() => setSelectedCat(null)}
                  className={`w-full text-left px-2 py-1 rounded text-sm transition-colors ${selectedCat === null ? 'bg-accent/10 text-accent-ink' : 'text-ink-muted hover:bg-surface-2/60'}`}>
                  All categories <span className="text-ink-subtle">({defs.length})</span>
                </button>
              </li>
              {orderedCats.map((c, i) => (
                <li key={c.id} className="group flex items-center gap-1">
                  <button onClick={() => setSelectedCat(c.id)}
                    className={`flex-1 text-left px-2 py-1 rounded text-sm transition-colors ${selectedCat === c.id ? 'bg-accent/10 text-accent-ink' : c.active ? 'text-ink hover:bg-surface-2/60' : 'text-ink-subtle line-through hover:bg-surface-2/60'}`}>
                    <input
                      defaultValue={c.name}
                      onClick={e => e.stopPropagation()}
                      onBlur={e => { const v = e.target.value.trim(); if (v && v !== c.name) renameCategory(c.id, v) }}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      className="bg-transparent outline-none w-full focus:bg-surface-2/60 rounded px-1"
                    />
                    <span className="text-ink-subtle text-xs ml-1">({defs.filter(d => d.category_id === c.id).length})</span>
                  </button>
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button title="Move up" disabled={i === 0} onClick={() => moveCat(c.id, -1)} className="px-1 text-ink-subtle hover:text-ink disabled:opacity-30">▲</button>
                    <button title="Move down" disabled={i === orderedCats.length - 1} onClick={() => moveCat(c.id, 1)} className="px-1 text-ink-subtle hover:text-ink disabled:opacity-30">▼</button>
                    <button title={c.active ? 'Deactivate' : 'Activate'} onClick={() => toggleCategory(c.id, !c.active)} className="px-1 text-ink-subtle hover:text-ink">{c.active ? '◉' : '○'}</button>
                    <button title="Delete" onClick={() => requestDeleteCat(c)} className="px-1 text-ink-subtle hover:text-red-400">✕</button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex gap-1 mt-1.5">
              <input value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCategory() }}
                placeholder="New category…" className={`${inputCls} flex-1`} />
              <button onClick={addCategory} className="px-2 py-0.5 rounded bg-accent/15 text-accent-ink text-sm hover:bg-accent/25">+</button>
            </div>
          </section>

          {/* Subcategories (global) */}
          <section>
            <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1.5">Subcategories <span className="normal-case font-normal text-ink-subtle">(global)</span></h3>
            <ul className="space-y-0.5">
              {orderedSubs.map((s, i) => (
                <li key={s.id} className="group flex items-center gap-1">
                  <span className={`flex-1 px-2 py-1 rounded text-sm ${s.active ? 'text-ink' : 'text-ink-subtle line-through'}`}>
                    <input
                      defaultValue={s.name}
                      onBlur={e => { const v = e.target.value.trim(); if (v && v !== s.name) renameSubcategory(s.id, v) }}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      className="bg-transparent outline-none w-full focus:bg-surface-2/60 rounded px-1"
                    />
                    <span className="text-ink-subtle text-xs ml-1">({defs.filter(d => d.subcategory_id === s.id).length})</span>
                  </span>
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button title="Move up" disabled={i === 0} onClick={() => moveSub(s.id, -1)} className="px-1 text-ink-subtle hover:text-ink disabled:opacity-30">▲</button>
                    <button title="Move down" disabled={i === orderedSubs.length - 1} onClick={() => moveSub(s.id, 1)} className="px-1 text-ink-subtle hover:text-ink disabled:opacity-30">▼</button>
                    <button title={s.active ? 'Deactivate' : 'Activate'} onClick={() => toggleSubcategory(s.id, !s.active)} className="px-1 text-ink-subtle hover:text-ink">{s.active ? '◉' : '○'}</button>
                    <button title="Delete" onClick={() => requestDeleteSub(s)} className="px-1 text-ink-subtle hover:text-red-400">✕</button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex gap-1 mt-1.5">
              <input value={newSub} onChange={e => setNewSub(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSubcategory() }}
                placeholder="New subcategory…" className={`${inputCls} flex-1`} />
              <button onClick={addSubcategory} className="px-2 py-0.5 rounded bg-accent/15 text-accent-ink text-sm hover:bg-accent/25">+</button>
            </div>
          </section>
        </div>

        {/* ── Definitions panel ── */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink">
              {selectedCat === null ? 'All cabinets' : catName(selectedCat)}
              <span className="text-ink-subtle font-normal"> · {shownDefs.length}</span>
            </h2>
            <p className="text-xs text-ink-subtle">Author geometry on the canvas → <span className="text-ink-muted">Save to library</span>. This page manages organisation only.</p>
          </div>

          {orderedSubs.map(sub => {
            const rows = shownDefs.filter(d => d.subcategory_id === sub.id).sort(byOrder)
            if (rows.length === 0) return null
            return (
              <div key={sub.id} className="mb-5">
                <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1.5">{sub.name}</h3>
                <div className="space-y-1">
                  {rows.map(d => (
                    <div key={d.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border ${d.active ? 'border-edge bg-surface/40' : 'border-edge bg-surface/20 opacity-60'}`}>
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-surface-2/60 text-ink-muted shrink-0">{d.assembly_class}</span>
                      <input defaultValue={d.name}
                        onBlur={e => { const v = e.target.value.trim(); if (v && v !== d.name) updateDef(d.id, { name: v }) }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        className={`${inputCls} w-44 font-medium`} />
                      <span className="text-xs text-ink-subtle shrink-0 w-28">{d.default_dx}×{d.default_dy}×{d.default_dz}</span>
                      <input defaultValue={d.description ?? ''} placeholder="Description…"
                        onBlur={e => { const v = e.target.value.trim(); if (v !== (d.description ?? '')) updateDef(d.id, { description: v || null }) }}
                        className={`${inputCls} flex-1 min-w-0`} />
                      {/* Move: category */}
                      <select value={d.category_id ?? ''} onChange={e => updateDef(d.id, { category_id: e.target.value || null })}
                        className={`${inputCls} w-24 shrink-0`}>
                        <option value="">—</option>
                        {orderedCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      {/* Move: subcategory */}
                      <select value={d.subcategory_id ?? ''} onChange={e => updateDef(d.id, { subcategory_id: e.target.value || null })}
                        className={`${inputCls} w-24 shrink-0`}>
                        <option value="">—</option>
                        {orderedSubs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <input type="number" defaultValue={d.sort_order} title="Sort order"
                        onBlur={e => { const v = parseInt(e.target.value) || 0; if (v !== d.sort_order) updateDef(d.id, { sort_order: v }) }}
                        className={`${inputCls} w-14 shrink-0`} />
                      <button title={d.active ? 'Deactivate' : 'Activate'} onClick={() => updateDef(d.id, { active: !d.active })}
                        className="px-1 text-ink-subtle hover:text-ink shrink-0">{d.active ? '◉' : '○'}</button>
                      <button title="Delete" onClick={() => deleteDef(d)} className="px-1 text-ink-subtle hover:text-red-400 shrink-0">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {shownDefs.length === 0 && (
            <p className="text-sm text-ink-subtle italic py-8 text-center">No cabinets here yet. Place &amp; configure a cabinet on the canvas, then “Save to library”.</p>
          )}
        </div>
      </div>

      {/* ── Reassign-then-delete dialog ── */}
      {reassign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setReassign(null)}>
          <div className="bg-surface border border-edge rounded-xl shadow-xl p-5 w-96" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-ink mb-1">Delete “{reassign.name}”</h3>
            <p className="text-xs text-ink-muted mb-3">
              {reassign.count} cabinet{reassign.count === 1 ? '' : 's'} still use this {reassign.kind}. Reassign {reassign.count === 1 ? 'it' : 'them'} before deleting:
            </p>
            <select value={reassignTo} onChange={e => setReassignTo(e.target.value)}
              className="w-full bg-surface-2/60 border border-edge-strong rounded px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-accent mb-4">
              {(reassign.kind === 'category' ? orderedCats : orderedSubs).filter(x => x.id !== reassign.id).map(x => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setReassign(null)} className="px-3 py-1.5 rounded text-sm text-ink-muted hover:text-ink">Cancel</button>
              <button onClick={confirmReassign} disabled={!reassignTo}
                className="px-3 py-1.5 rounded text-sm bg-red-500/80 text-white hover:bg-red-500 disabled:opacity-40">Reassign &amp; delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
