'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { CabinetInstance } from '@/src/lib/types'
import { saveCabinetToLibrary, type PreserveOptions } from './canvasDB'

type Tax = { id: string; name: string; sort_order: number }

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
  const [cats, setCats] = useState<Tax[]>([])
  const [subs, setSubs] = useState<Tax[]>([])
  const [name, setName] = useState(cab.label ?? '')
  const [categoryId, setCategoryId] = useState<string>('')
  const [subcategoryId, setSubcategoryId] = useState<string>('')
  const [preserve, setPreserve] = useState<PreserveOptions>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [c, s] = await Promise.all([
        supabase.from('cabinet_categories').select('id,name,sort_order').eq('active', true).order('sort_order'),
        supabase.from('cabinet_subcategories').select('id,name,sort_order').eq('active', true).order('sort_order'),
      ])
      if (cancelled) return
      const cc = (c.data ?? []) as Tax[]
      const ss = (s.data ?? []) as Tax[]
      setCats(cc); setSubs(ss)
      // Preselect a category whose name matches the assembly class, else the first.
      const clsKey = cab.assembly_class.replace('_corner', '')
      setCategoryId(cc.find(x => x.name.toLowerCase().startsWith(clsKey))?.id ?? cc[0]?.id ?? '')
      setSubcategoryId(ss.find(x => x.name.toLowerCase() === 'cabinets')?.id ?? ss[0]?.id ?? '')
    })()
    return () => { cancelled = true }
  }, [cab.assembly_class])

  function toggle(key: keyof PreserveOptions) {
    setPreserve(p => ({ ...p, [key]: !p[key] }))
  }

  async function save() {
    const n = name.trim()
    if (!n) { setErr('Enter a name'); return }
    setSaving(true); setErr(null)
    const id = await saveCabinetToLibrary(cab.id, {
      name: n, categoryId: categoryId || null, subcategoryId: subcategoryId || null, preserve,
    })
    setSaving(false)
    if (!id) { setErr('Save failed — see console'); return }
    onSaved(id, n)
  }

  const selCls = 'w-full bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500'

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

        {/* Pathway picker */}
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">Category</span>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={selCls}>
              <option value="">—</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">Subcategory</span>
            <select value={subcategoryId} onChange={e => setSubcategoryId(e.target.value)} className={selCls}>
              <option value="">—</option>
              {subs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
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
