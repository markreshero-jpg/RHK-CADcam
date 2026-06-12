'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { CabinetInstance } from '@/src/lib/types'
import { saveCabinetToLibrary, type PreserveOptions } from './canvasDB'

type Cat = { id: string; name: string; sort_order: number; parent_id: string | null }

// Preservable cascade-resolved properties. Door style is preserved automatically
// via face_grid, so it is not a checkbox here.
const PRESERVABLES: { key: keyof PreserveOptions; label: string; hint: string }[] = [
  { key: 'carcase_material', label: 'Carcase material',  hint: 'interior panels' },
  { key: 'toekick_material', label: 'Toekick material',  hint: 'face + interior' },
  { key: 'hinge',            label: 'Hinge',             hint: 'cup + plate' },
  { key: 'slide',            label: 'Drawer slide',      hint: 'runner product' },
  { key: 'exposed_interior', label: 'Exposed interior',  hint: 'finished-end flag' },
]

export default function SaveToLibraryModal({ cab, onClose, onSaved }: {
  cab: CabinetInstance
  onClose: () => void
  onSaved: (definitionId: string, name: string) => void
}) {
  const [cats, setCats] = useState<Cat[]>([])
  const [name, setName] = useState(cab.label ?? '')
  const [categoryId, setCategoryId] = useState<string>('')
  const [openNodes, setOpenNodes] = useState<Set<string>>(new Set())
  const [preserve, setPreserve] = useState<PreserveOptions>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const { data } = await supabase.from('cabinet_categories')
      .select('id,name,sort_order,parent_id').eq('active', true).order('sort_order')
    const rows = (data ?? []) as Cat[]
    setCats(rows)
    return rows
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const rows = await reload()
      if (cancelled) return
      setOpenNodes(new Set(rows.map(c => c.id)))   // expand the whole tree by default
      // Preselect the root category whose name matches the assembly class.
      const clsKey = cab.assembly_class.replace('_corner', '')
      const root = rows.filter(c => !c.parent_id)
      setCategoryId(root.find(c => c.name.toLowerCase().startsWith(clsKey))?.id ?? root[0]?.id ?? '')
    })()
    return () => { cancelled = true }
  }, [reload, cab.assembly_class])

  const childrenOf = (parentId: string | null) =>
    cats.filter(c => c.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

  function toggleNode(id: string) {
    setOpenNodes(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function toggle(key: keyof PreserveOptions) {
    setPreserve(p => ({ ...p, [key]: !p[key] }))
  }

  // Breadcrumb path for the selected category.
  const pathOf = (id: string): string[] => {
    const out: string[] = []
    let cur = cats.find(c => c.id === id)
    while (cur) { out.unshift(cur.name); cur = cur.parent_id ? cats.find(c => c.id === cur!.parent_id) : undefined }
    return out
  }

  async function newFolder() {
    const parentId = categoryId || null
    const folderName = typeof window !== 'undefined' ? window.prompt(parentId ? 'New sub-category name' : 'New category name') : null
    if (!folderName?.trim()) return
    const sort_order = childrenOf(parentId).reduce((m, c) => Math.max(m, c.sort_order), -1) + 1
    const { data, error } = await supabase.from('cabinet_categories')
      .insert({ name: folderName.trim(), parent_id: parentId, sort_order }).select('id').single()
    if (error) { setErr(error.message); return }
    await reload()
    if (parentId) setOpenNodes(prev => new Set(prev).add(parentId))
    if (data) setCategoryId(data.id as string)
  }

  async function save() {
    const n = name.trim()
    if (!n) { setErr('Enter a name'); return }
    setSaving(true); setErr(null)
    const id = await saveCabinetToLibrary(cab.id, {
      name: n, categoryId: categoryId || null, subcategoryId: null, preserve,
    })
    setSaving(false)
    if (!id) { setErr('Save failed — see console'); return }
    onSaved(id, n)
  }

  const selCls = 'w-full bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500'

  function renderNode(cat: Cat, depth: number): React.ReactNode {
    const kids = childrenOf(cat.id)
    const open = openNodes.has(cat.id)
    const sel = categoryId === cat.id
    return (
      <div key={cat.id}>
        <div
          onClick={() => setCategoryId(cat.id)}
          className={`flex items-center gap-1 pr-2 py-1 rounded cursor-pointer text-sm transition-colors
            ${sel ? 'bg-blue-600/25 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
          style={{ paddingLeft: 6 + depth * 14 }}
        >
          <span
            onClick={e => { e.stopPropagation(); if (kids.length) toggleNode(cat.id) }}
            className="w-3 text-[9px] opacity-60 shrink-0"
          >{kids.length ? (open ? '▾' : '▸') : '·'}</span>
          <span className="flex-1 truncate">{cat.name}</span>
        </div>
        {open && kids.map(k => renderNode(k, depth + 1))}
      </div>
    )
  }

  const roots = childrenOf(null)
  const selPath = categoryId ? pathOf(categoryId) : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onPointerDown={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-96 p-6 flex flex-col gap-4" onPointerDown={e => e.stopPropagation()}>
        <div>
          <p className="text-sm font-semibold text-white">Save to library</p>
          <p className="text-xs text-gray-400 mt-1">
            Snapshots geometry from <span className="text-gray-200">{cab.label ?? cab.assembly_class}</span> ({cab.dx}×{cab.dy}×{cab.dz}). Materials &amp; hardware re-resolve per job unless preserved below.
          </p>
        </div>

        {/* Name */}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Name</span>
          <input value={name} autoFocus onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save() }}
            placeholder="e.g. 600 2-drawer base" className={selCls} />
        </label>

        {/* Folder tree (mirrors the library sidebar) */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Save into</span>
            <button onClick={newFolder} className="text-[11px] text-blue-400 hover:text-blue-300">＋ New folder</button>
          </div>
          <div className="max-h-44 overflow-y-auto bg-gray-800/40 border border-gray-700 rounded-md p-1">
            {roots.length ? roots.map(c => renderNode(c, 0))
              : <p className="px-2 py-2 text-xs text-gray-600 italic">No categories — use ＋ New folder.</p>}
          </div>
          <p className="text-[11px] text-gray-500 truncate">
            {selPath.length ? <>Into: <span className="text-gray-300">{selPath.join(' › ')}</span></> : 'Pick a folder (or leave uncategorised)'}
          </p>
        </div>

        {/* Preservation */}
        <div>
          <p className="text-xs text-gray-400 mb-1.5">Preserve (remember the current resolved value):</p>
          <div className="flex flex-col gap-1">
            {PRESERVABLES.map(({ key, label, hint }) => (
              <label key={key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-800 cursor-pointer">
                <input type="checkbox" checked={!!preserve[key]} onChange={() => toggle(key)} className="accent-blue-500" />
                <span className="text-sm text-gray-200">{label}</span>
                <span className="text-xs text-gray-500">· {hint}</span>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 mt-1.5">Door style travels automatically with the face layout.</p>
        </div>

        {err && <p className="text-xs text-red-400">{err}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-xs rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
