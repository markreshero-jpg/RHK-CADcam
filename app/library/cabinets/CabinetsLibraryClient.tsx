'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/src/lib/supabase'
import { ThemeToggle } from '../../ThemeToggle'
import { DEFAULT_DIMS, type AssemblyClass } from '@/src/lib/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Category   { id: string; name: string; sort_order: number; parent_id: string | null; active: boolean }
interface Definition {
  id: string; name: string; assembly_class: AssemblyClass
  category_id: string | null; description: string | null
  sort_order: number; active: boolean
  default_dx: number; default_dy: number; default_dz: number
}

const CLASSES: AssemblyClass[] = ['base', 'wall', 'tall', 'base_corner', 'wall_corner', 'tall_corner']
type SortKey = 'name' | 'assembly_class' | 'default_dx' | 'default_dy' | 'default_dz' | 'category' | 'active'

// ── Component ─────────────────────────────────────────────────────────────────

export default function CabinetsLibraryClient({
  initialCategories = [], initialDefinitions = [], embedded = false,
}: {
  initialCategories?: Record<string, unknown>[]
  initialDefinitions?: Record<string, unknown>[]
  embedded?: boolean
}) {
  const [cats, setCats] = useState<Category[]>(() => initialCategories as unknown as Category[])
  const [defs, setDefs] = useState<Definition[]>(() => initialDefinitions as unknown as Definition[])
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 })
  const [err, setErr] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const [c, d] = await Promise.all([
      supabase.from('cabinet_categories').select('id,name,sort_order,parent_id,active').order('sort_order'),
      supabase.from('cabinet_definitions').select('*').order('sort_order'),
    ])
    setCats((c.data ?? []) as unknown as Category[])
    setDefs((d.data ?? []) as unknown as Definition[])
  }, [])
  useEffect(() => { if (embedded) void reload() }, [embedded, reload])

  // ── Category tree helpers (for the per-row category dropdown + path label) ──
  const childrenOf = (parentId: string | null) =>
    cats.filter(c => c.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  const catOptions = useMemo(() => {
    const out: { id: string; label: string }[] = []
    const walk = (parentId: string | null, depth: number) => {
      for (const c of childrenOf(parentId)) {
        out.push({ id: c.id, label: `${'   '.repeat(depth)}${c.name}` })
        walk(c.id, depth + 1)
      }
    }
    walk(null, 0)
    return out
  }, [cats])
  const pathOf = (id: string | null): string => {
    if (!id) return ''
    const names: string[] = []
    let cur = cats.find(c => c.id === id)
    while (cur) { names.unshift(cur.name); cur = cur.parent_id ? cats.find(c => c.id === cur!.parent_id) : undefined }
    return names.join(' › ')
  }

  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await p
    if (error) { setErr(error.message); return false }
    setErr(null); return true
  }

  async function updateDef(id: string, patch: Partial<Definition>) {
    setDefs(ds => ds.map(d => d.id === id ? { ...d, ...patch } : d))
    await run(supabase.from('cabinet_definitions').update(patch).eq('id', id))
  }
  async function deleteDef(d: Definition) {
    if (!confirm(`Delete “${d.name}” from the library?\nPlaced cabinets are unaffected.`)) return
    if (!(await run(supabase.from('cabinet_definitions').delete().eq('id', d.id)))) return
    setDefs(ds => ds.filter(x => x.id !== d.id))
  }
  async function duplicateDef(d: Definition) {
    const { data: full } = await supabase.from('cabinet_definitions').select('*').eq('id', d.id).single()
    if (!full) return
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, created_at, updated_at, ...rest } = full as Record<string, unknown>
    const sort_order = defs.reduce((m, x) => Math.max(m, x.sort_order), -1) + 1
    const { data, error } = await supabase.from('cabinet_definitions').insert({ ...rest, name: `${d.name} copy`, sort_order }).select('*').single()
    if (error) { setErr(error.message); return }
    if (data) setDefs(ds => [...ds, data as unknown as Definition])
  }
  async function newCabinet() {
    const dims = DEFAULT_DIMS.base
    const sort_order = defs.reduce((m, x) => Math.max(m, x.sort_order), -1) + 1
    const { data, error } = await supabase.from('cabinet_definitions').insert({
      name: 'New cabinet', assembly_class: 'base',
      default_dx: dims.dx, default_dy: dims.dy, default_dz: dims.dz,
      has_carcass: true, has_internal: true, has_face: true, has_toekick: true,
      top_type: 'front_rail', toe_type: 'ladder',
      face_grid: {}, is_library_item: true, active: true, sort_order,
    }).select('*').single()
    if (error) { setErr(error.message); return }
    if (data) setDefs(ds => [...ds, data as unknown as Definition])
  }
  async function newCategory() {
    const name = typeof window !== 'undefined' ? window.prompt('New top-level category name') : null
    if (!name?.trim()) return
    const sort_order = childrenOf(null).reduce((m, c) => Math.max(m, c.sort_order), -1) + 1
    const { data, error } = await supabase.from('cabinet_categories').insert({ name: name.trim(), parent_id: null, sort_order }).select('*').single()
    if (error) { setErr(error.message); return }
    if (data) setCats(cs => [...cs, data as unknown as Category])
  }

  // ── Filter + sort ──
  const q = search.trim().toLowerCase()
  const rows = useMemo(() => {
    const filtered = defs.filter(d =>
      !q || d.name.toLowerCase().includes(q) || (d.description ?? '').toLowerCase().includes(q) ||
      d.assembly_class.includes(q) || pathOf(d.category_id).toLowerCase().includes(q))
    const k = sort.key
    return [...filtered].sort((a, b) => {
      let av: string | number, bv: string | number
      if (k === 'category') { av = pathOf(a.category_id); bv = pathOf(b.category_id) }
      else if (k === 'active') { av = a.active ? 1 : 0; bv = b.active ? 1 : 0 }
      else { av = a[k] as string | number; bv = b[k] as string | number }
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * sort.dir
      return ((av as number) - (bv as number)) * sort.dir
    })
  }, [defs, q, sort, cats])

  function toggleSort(key: SortKey) {
    setSort(s => s.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) } : { key, dir: 1 })
  }

  const thCls = 'text-left text-[10px] font-semibold text-ink-muted uppercase tracking-wider px-2 py-2 border-b border-edge cursor-pointer select-none whitespace-nowrap hover:text-ink'
  const cellInput = 'w-full bg-transparent border border-transparent hover:border-edge-strong focus:border-accent rounded px-1.5 py-1 text-sm text-ink focus:outline-none'
  const arrow = (key: SortKey) => sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''

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

      {/* Toolbar */}
      <div className="flex-none px-4 py-2.5 flex items-center gap-2 border-b border-edge">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, class, category…"
          className="w-64 bg-surface-2/60 border border-edge-strong rounded-md px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-accent"
        />
        <span className="text-xs text-ink-subtle">{rows.length} cabinet{rows.length === 1 ? '' : 's'}</span>
        <div className="flex-1" />
        <button onClick={newCategory} className="px-2.5 py-1.5 rounded-md text-sm border border-edge-strong text-ink-muted hover:text-ink hover:border-accent transition-colors">+ Category</button>
        <button onClick={newCabinet} className="px-3 py-1.5 rounded-md text-sm bg-accent/20 text-accent-ink hover:bg-accent/30 transition-colors">+ New cabinet</button>
      </div>

      {err && <div className="flex-none px-4 py-2 bg-red-500/10 text-red-400 text-xs border-b border-red-500/20">{err}</div>}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-canvas z-10">
            <tr>
              <th className={thCls} onClick={() => toggleSort('name')}>Name{arrow('name')}</th>
              <th className={thCls} onClick={() => toggleSort('assembly_class')}>Class{arrow('assembly_class')}</th>
              <th className={`${thCls} text-right`} onClick={() => toggleSort('default_dx')}>W{arrow('default_dx')}</th>
              <th className={`${thCls} text-right`} onClick={() => toggleSort('default_dy')}>H{arrow('default_dy')}</th>
              <th className={`${thCls} text-right`} onClick={() => toggleSort('default_dz')}>D{arrow('default_dz')}</th>
              <th className={thCls} onClick={() => toggleSort('category')}>Category{arrow('category')}</th>
              <th className={thCls}>Description</th>
              <th className={`${thCls} text-center`} onClick={() => toggleSort('active')}>Active{arrow('active')}</th>
              <th className={`${thCls} w-8`}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d, i) => (
              <tr key={d.id} className={`${i % 2 ? 'bg-surface/30' : ''} ${d.active ? '' : 'opacity-50'} hover:bg-surface-2/30`}>
                <td className="px-1 py-0.5 min-w-[180px]">
                  <input defaultValue={d.name} onBlur={e => { const v = e.target.value.trim(); if (v && v !== d.name) updateDef(d.id, { name: v }) }} className={`${cellInput} font-medium`} />
                </td>
                <td className="px-1 py-0.5">
                  <select value={d.assembly_class} onChange={e => updateDef(d.id, { assembly_class: e.target.value as AssemblyClass })} className={cellInput}>
                    {CLASSES.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                  </select>
                </td>
                {(['default_dx', 'default_dy', 'default_dz'] as const).map(dim => (
                  <td key={dim} className="px-1 py-0.5 w-16">
                    <input type="number" defaultValue={d[dim]} onBlur={e => { const v = parseFloat(e.target.value); if (v > 0 && v !== d[dim]) updateDef(d.id, { [dim]: v }) }} className={`${cellInput} text-right`} />
                  </td>
                ))}
                <td className="px-1 py-0.5 min-w-[140px]">
                  <select value={d.category_id ?? ''} onChange={e => updateDef(d.id, { category_id: e.target.value || null })} className={cellInput}>
                    <option value="">—</option>
                    {catOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </td>
                <td className="px-1 py-0.5 min-w-[200px]">
                  <input defaultValue={d.description ?? ''} placeholder="—" onBlur={e => { const v = e.target.value.trim(); if (v !== (d.description ?? '')) updateDef(d.id, { description: v || null }) }} className={cellInput} />
                </td>
                <td className="px-1 py-0.5 text-center">
                  <input type="checkbox" checked={d.active} onChange={e => updateDef(d.id, { active: e.target.checked })} className="accent-accent" />
                </td>
                <td className="px-1 py-0.5 text-center whitespace-nowrap">
                  <button title="Duplicate" onClick={() => duplicateDef(d)} className="text-ink-subtle hover:text-accent-ink px-1">⧉</button>
                  <button title="Delete" onClick={() => deleteDef(d)} className="text-ink-subtle hover:text-red-400 px-1">✕</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-ink-subtle italic">
                {defs.length === 0 ? 'No cabinets yet — add one with “+ New cabinet”, or save one from the canvas.' : 'No cabinets match your search.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex-none px-4 py-1.5 border-t border-edge text-[11px] text-ink-subtle">
        Edit cells inline · changes save automatically. New cabinets start as a plain box — author doors/drawers on the canvas, then “Save to library”. Folder nesting is managed in the canvas library sidebar.
      </div>
    </div>
  )
}
