'use client'

import { useState, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { ResolvedCabinet, ResolvedDrawerBoxPart, ResolvedDrawerSlide } from '@/src/lib/resolver/types'
import {
  dbAddCustomPart, dbUpdateCustomPart, dbDeleteCustomPart,
  type CabinetCustomPart, type PartPosOverrides, type PartLabels, type PartComments,
} from './canvasDB'
import { DB_PART_LABELS } from './cabinetEditSvgHelpers'

// ── Labels ────────────────────────────────────────────────────────────────────

const PART_LABEL: Record<string, string> = {
  left_side:           'Left Side',
  right_side:          'Right Side',
  bottom:              'Bottom',
  back:                'Back',
  full_top:            'Full Top',
  front_rail:          'Front Rail',
  back_rail:           'Back Rail',
  kick_front_face:     'Kick Front Face',
  kick_sub_front:      'Kick Sub Front',
  kick_back:           'Kick Back',
  spreader_vertical:   'Spreader (Vert)',
  spreader_horizontal: 'Spreader (Horiz)',
  adj_shelf:           'Adj. Shelf',
  fixed_shelf:         'Fixed Shelf',
  inner_drawer_bottom: 'Inner Drawer Bottom',
  inner_drawer_back:   'Inner Drawer Back',
  inner_drawer_side:   'Inner Drawer Side',
  inner_drawer_front:  'Inner Drawer Front',
  pull_out_bottom:     'Pull-out Bottom',
  pull_out_side:       'Pull-out Side',
  pull_out_back:       'Pull-out Back',
  accessory:           'Accessory',
}

const TYPE_COLOR: Record<string, string> = {
  carcass:   '#3b82f6',
  toekick:   '#f59e0b',
  internal:  '#818cf8',
  face:      '#60a5fa',
  drawerbox: '#22c55e',
  slide:     '#d97706',
  custom:    '#a78bfa',
  override:  '#f97316',
}

const TYPE_ORDER = ['carcass', 'toekick', 'internal', 'face', 'drawerbox', 'slide', 'custom', 'override']

// ── Column definitions ────────────────────────────────────────────────────────

const COLS = [
  { key: 'type',     label: 'Type',     w: 100, sortable: true  },
  { key: 'name',     label: 'Part',     w: 190, sortable: true  },
  { key: 'material', label: 'Material', w: 150, sortable: true  },
  { key: 'dy',       label: 'W (DY)',   w: 68,  sortable: true  },
  { key: 'dx',       label: 'H (DX)',   w: 68,  sortable: true  },
  { key: 'dz',       label: 'T (DZ)',   w: 58,  sortable: true  },
  { key: 'edge',     label: 'Edge',     w: 90,  sortable: false },
  { key: 'comment',  label: 'Comment',  w: 220, sortable: false },
] as const

type SortKey = 'type' | 'name' | 'material' | 'dy' | 'dx' | 'dz'

// ── Flat row ──────────────────────────────────────────────────────────────────

interface FlatRow {
  id: string
  typeKey: string
  typeLabel: string
  name: string
  material: string
  materialColor: string | null
  dy: number; dx: number; dz: number
  eb: { top: boolean; bottom: boolean; left: boolean; right: boolean } | null
  comment: string
  isCustom: boolean
  isOverride: boolean
  overridePartId?: string
  visible?: boolean
  customPartRef?: CabinetCustomPart
}

// ── Part ID label (for override rows) ────────────────────────────────────────

function partIdLabel(id: string): string {
  if (id.startsWith('case_')) {
    const key = id.slice(5)
    return PART_LABEL[key] ?? key.replace(/_/g, ' ')
  }
  if (id.startsWith('tk_')) {
    const rest = id.slice(3); const cut = rest.lastIndexOf('_')
    return PART_LABEL[rest.slice(0, cut)] ?? rest.slice(0, cut).replace(/_/g, ' ')
  }
  if (id.startsWith('int_')) {
    const rest = id.slice(4); const cut = rest.lastIndexOf('_')
    const idx = parseInt(rest.slice(cut + 1))
    return `${PART_LABEL[rest.slice(0, cut)] ?? rest.slice(0, cut).replace(/_/g, ' ')} ${idx + 1}`
  }
  if (id.startsWith('zone_')) {
    const [row, col] = id.slice(5).split('_').map(Number)
    return `Face R${row + 1}C${col + 1}`
  }
  if (id.startsWith('db_')) {
    const parts = id.slice(3).split('_')
    return `Drawer Box R${Number(parts[0]) + 1}C${Number(parts[1]) + 1}`
  }
  if (id.startsWith('slide_')) {
    const parts = id.slice(6).split('_')
    return `Slide (${parts[2]}) R${Number(parts[0]) + 1}C${Number(parts[1]) + 1}`
  }
  return id
}

// ── EBDots ────────────────────────────────────────────────────────────────────

function EBDots({ t, b, l, r }: { t: boolean; b: boolean; l: boolean; r: boolean }) {
  const dot = (on: boolean, label: string) => (
    <span key={label} title={`${label}: ${on ? 'banded' : 'no band'}`}
      className={`inline-block w-4 h-4 rounded-sm text-[9px] leading-4 text-center font-bold ${
        on ? 'bg-amber-500 text-gray-900' : 'bg-gray-700 text-gray-500'
      }`}>{label}</span>
  )
  return <span className="flex gap-0.5">{dot(t,'T')}{dot(b,'B')}{dot(l,'L')}{dot(r,'R')}</span>
}

// ── EditableName ──────────────────────────────────────────────────────────────

function EditableName({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value)

  function commit() {
    setEditing(false)
    const v = draft.trim()
    if (v && v !== value) onSave(v)
    else setDraft(value)
  }

  if (editing) {
    return (
      <input autoFocus type="text" value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
        className="w-full bg-gray-800 border border-blue-500 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
        onClick={e => e.stopPropagation()} />
    )
  }

  return (
    <button onClick={e => { e.stopPropagation(); setDraft(value); setEditing(true) }}
      title="Click to rename"
      className="text-left hover:text-blue-300 transition-colors truncate block w-full">
      {value}
    </button>
  )
}

// ── EditableComment ───────────────────────────────────────────────────────────

function EditableComment({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value)

  useEffect(() => { setDraft(value) }, [value])

  function commit() {
    setEditing(false)
    if (draft.trim() !== value) onSave(draft.trim())
  }

  if (editing) {
    return (
      <input autoFocus type="text" value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
        className="w-full bg-gray-800 border border-blue-500 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none" />
    )
  }

  if (value) {
    return (
      <button onClick={() => { setDraft(value); setEditing(true) }}
        className="text-left text-amber-300/80 hover:text-amber-200 transition-colors text-xs truncate block w-full"
        title={value}>
        {value}
      </button>
    )
  }

  return (
    <button onClick={() => { setDraft(''); setEditing(true) }}
      className="text-gray-700 hover:text-gray-400 text-xs transition-colors">
      + add
    </button>
  )
}

// ── Add Part Dialog ───────────────────────────────────────────────────────────

interface LibraryPart {
  id: string; key: string; name: string; category: string
  edge_top: boolean; edge_bottom: boolean; edge_left: boolean; edge_right: boolean
}

interface MatOption { id: string; name: string; dz: number; face_colour: string | null }

const CAT_LABELS: Record<string, string> = {
  all: 'All', assembly: 'Assembly', drawer_box: 'Drawer Box', benchtop: 'Benchtop',
  doors: 'Doors', shelves: 'Shelves', toekick: 'Toekick',
  slides: 'Slides', hinges: 'Hinges', misc: 'Misc', other: 'Other',
}

function AddPartDialog({ cabinetId, onAdd, onClose }: {
  cabinetId: string
  onAdd:     (part: CabinetCustomPart) => void
  onClose:   () => void
}) {
  const [libParts,  setLibParts]  = useState<LibraryPart[]>([])
  const [mats,      setMats]      = useState<MatOption[]>([])
  const [catFilter, setCatFilter] = useState('all')
  const [search,    setSearch]    = useState('')
  const [sel,       setSel]       = useState<LibraryPart | null>(null)
  const [nameOver,  setNameOver]  = useState('')
  const [dy,        setDy]        = useState(0)
  const [dx,        setDx]        = useState(0)
  const [matId,     setMatId]     = useState('')
  const [eTop,      setETop]      = useState(false)
  const [eBot,      setEBot]      = useState(false)
  const [eLeft,     setELeft]     = useState(false)
  const [eRight,    setERight]    = useState(false)
  const [visible,   setVisible]   = useState(true)
  const [posX,      setPosX]      = useState(0)
  const [posY,      setPosY]      = useState(0)
  const [posZ,      setPosZ]      = useState(0)
  const [saving,    setSaving]    = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('parts_library').select('id,key,name,category,edge_top,edge_bottom,edge_left,edge_right').eq('active', true).order('name'),
      supabase.from('materials').select('id,name,dz,face_colour').eq('active', true).order('name'),
    ]).then(([{ data: p }, { data: m }]) => {
      setLibParts((p ?? []) as LibraryPart[])
      setMats((m ?? []) as MatOption[])
    })
  }, [])

  function pickPart(p: LibraryPart) {
    setSel(p); setNameOver('')
    setETop(p.edge_top); setEBot(p.edge_bottom); setELeft(p.edge_left); setERight(p.edge_right)
  }

  const cats     = ['all', ...Array.from(new Set(libParts.map(p => p.category)))]
  const visible2 = libParts.filter(p =>
    (catFilter === 'all' || p.category === catFilter) &&
    (!search || p.name.toLowerCase().includes(search.toLowerCase()))
  )
  const matDz = mats.find(m => m.id === matId)?.dz ?? 0

  async function handleAdd() {
    if (!sel) return
    setSaving(true)
    const { data: ex } = await supabase
      .from('cabinet_custom_parts').select('sort_order')
      .eq('cabinet_instance_id', cabinetId).order('sort_order', { ascending: false }).limit(1)
    const nextOrder = ex && ex.length > 0 ? ex[0].sort_order + 1 : 0
    const result = await dbAddCustomPart({
      cabinet_instance_id: cabinetId, part_library_id: sel.id,
      name: nameOver.trim() || sel.name, dy, dx, dz: matDz || 18,
      x: posX, y: posY, z: posZ,
      material_id: matId || null,
      edge_top: eTop, edge_bottom: eBot, edge_left: eLeft, edge_right: eRight,
      visible, sort_order: nextOrder,
    })
    if (result) onAdd(result)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-6"
         onClick={onClose}>
      <div className="bg-gray-900 rounded-xl border border-gray-700 shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh]"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <span className="text-sm font-semibold text-white">Add Part</span>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">✕</button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="w-56 flex-none border-r border-gray-700 flex flex-col">
            <div className="flex flex-wrap gap-0.5 p-2 border-b border-gray-700">
              {cats.map(c => (
                <button key={c} onClick={() => setCatFilter(c)}
                  className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                    catFilter === c ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-200 hover:bg-gray-800'
                  }`}>
                  {CAT_LABELS[c] ?? c}
                </button>
              ))}
            </div>
            <div className="px-2 py-1.5 border-b border-gray-700">
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
            </div>
            <div className="flex-1 overflow-y-auto">
              {visible2.map(p => (
                <button key={p.id} onClick={() => pickPart(p)}
                  className={`w-full text-left px-3 py-2 text-xs border-b border-gray-800/50 transition-colors ${
                    sel?.id === p.id ? 'bg-blue-600/20 text-blue-300' : 'text-gray-300 hover:bg-gray-800/60'
                  }`}>
                  {p.name}
                  <span className="block text-[9px] text-gray-600 mt-0.5">{CAT_LABELS[p.category] ?? p.category}</span>
                </button>
              ))}
              {visible2.length === 0 && <p className="px-3 py-4 text-xs text-gray-600">No parts found</p>}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {!sel ? (
              <p className="text-xs text-gray-600 pt-6 text-center">Select a part from the list</p>
            ) : (<>
              <div>
                <p className="text-[10px] text-gray-500 mb-0.5">Selected</p>
                <p className="text-sm font-medium text-white">{sel.name}</p>
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Name override (optional)</label>
                <input type="text" value={nameOver} onChange={e => setNameOver(e.target.value)}
                  placeholder={sel.name}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">Width DY (mm)</label>
                  <input type="number" value={dy} step="0.5"
                    onChange={e => setDy(parseFloat(e.target.value) || 0)}
                    onFocus={e => e.target.select()}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white font-mono text-right focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">Height DX (mm)</label>
                  <input type="number" value={dx} step="0.5"
                    onChange={e => setDx(parseFloat(e.target.value) || 0)}
                    onFocus={e => e.target.select()}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white font-mono text-right focus:outline-none focus:border-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([['X pos', posX, setPosX], ['Y pos', posY, setPosY], ['Z pos', posZ, setPosZ]] as [string, number, (v: number) => void][]).map(([lbl, val, set]) => (
                  <div key={lbl}>
                    <label className="block text-[10px] text-gray-500 mb-1">{lbl} (mm)</label>
                    <input type="number" value={val} step="1"
                      onChange={e => set(parseFloat(e.target.value) || 0)}
                      onFocus={e => e.target.select()}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white font-mono text-right focus:outline-none focus:border-blue-500" />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Material</label>
                <select value={matId} onChange={e => setMatId(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500">
                  <option value="">— none —</option>
                  {mats.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.dz}mm)</option>
                  ))}
                </select>
                {matDz > 0 && (
                  <p className="text-[10px] text-gray-600 mt-0.5">Thickness DZ: {matDz}mm (from material)</p>
                )}
              </div>
              <div>
                <p className="text-[10px] text-gray-500 mb-1.5">Edge Band</p>
                <div className="flex items-center gap-4">
                  {([['Top', eTop, setETop], ['Bot', eBot, setEBot], ['Left', eLeft, setELeft], ['Right', eRight, setERight]] as [string, boolean, (v: boolean) => void][]).map(([lbl, val, set]) => (
                    <label key={lbl} className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} className="accent-amber-500 w-3 h-3" />
                      <span className="text-[10px] text-gray-400">{lbl}</span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} className="accent-blue-500 w-3.5 h-3.5" />
                <span className="text-xs text-gray-300">Visible in 3D / elevation</span>
              </label>
            </>)}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-700">
          <button onClick={onClose} className="px-4 py-1.5 text-xs text-gray-400 hover:text-white transition-colors">Cancel</button>
          <button onClick={handleAdd} disabled={!sel || saving}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs rounded transition-colors">
            {saving ? 'Adding…' : 'Add Part'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Parts View (spreadsheet) ──────────────────────────────────────────────────

export default function PartsView({
  rp, cabinetId, customParts, setCustomParts,
  partOverrides, onDeletePosOverride,
  partLabels, partComments, onLabelChange, onCommentChange,
  hiddenParts, onToggleHidden,
}: {
  rp: ResolvedCabinet
  cabinetId: string
  customParts: CabinetCustomPart[]
  setCustomParts: Dispatch<SetStateAction<CabinetCustomPart[]>>
  partOverrides?: PartPosOverrides
  onDeletePosOverride?: (partId: string) => void
  partLabels?: PartLabels
  partComments?: PartComments
  onLabelChange?: (partId: string, label: string) => void
  onCommentChange?: (partId: string, comment: string) => void
  hiddenParts?: string[]
  onToggleHidden?: (partId: string) => void
}) {
  const hiddenSet = useMemo(() => new Set(hiddenParts ?? []), [hiddenParts])
  const [matNames,   setMatNames]   = useState<Record<string, string>>({})
  const [matColours, setMatColours] = useState<Record<string, string | null>>({})
  const [libNames,   setLibNames]   = useState<Record<string, string>>({})
  const [showAdd,    setShowAdd]    = useState(false)
  const [search,     setSearch]     = useState('')
  const [sortKey,    setSortKey]    = useState<SortKey>('type')
  const [sortDir,    setSortDir]    = useState<'asc' | 'desc'>('asc')

  // Load material names/colours for all resolved parts
  useEffect(() => {
    const ids = new Set<string>()
    rp.case_parts.forEach(p    => ids.add(p.material_id))
    rp.toekick_parts.forEach(p => ids.add(p.material_id))
    rp.internal_parts.forEach(p => ids.add(p.material_id))
    rp.face_zones.forEach(z    => ids.add(z.material_id))
    ;(rp.drawer_stacks ?? []).forEach(s => s.box_parts.forEach(p => ids.add(p.material_id)))
    if (ids.size === 0) return
    supabase.from('materials').select('id,name,face_colour').in('id', [...ids]).then(({ data }) => {
      if (!data) return
      const names: Record<string, string>       = {}
      const cols:  Record<string, string | null> = {}
      for (const m of data) { names[m.id] = m.name; cols[m.id] = m.face_colour }
      setMatNames(names); setMatColours(cols)
    })
  }, [rp])

  // Load lib names + materials for custom parts
  useEffect(() => {
    const libIds = [...new Set(customParts.map(p => p.part_library_id))]
    if (libIds.length > 0) {
      supabase.from('parts_library').select('id,name').in('id', libIds).then(({ data }) => {
        if (data) setLibNames(Object.fromEntries(data.map(r => [r.id, r.name])))
      })
    }
    const matIds = [...new Set(customParts.map(p => p.material_id).filter(Boolean))] as string[]
    if (matIds.length > 0) {
      supabase.from('materials').select('id,name,face_colour').in('id', matIds).then(({ data }) => {
        if (!data) return
        setMatNames(prev => { const n = { ...prev }; data.forEach(m => { n[m.id] = m.name }); return n })
        setMatColours(prev => { const n = { ...prev }; data.forEach(m => { n[m.id] = m.face_colour }); return n })
      })
    }
  }, [customParts]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo((): FlatRow[] => {
    const result: FlatRow[] = []

    for (const p of rp.case_parts) {
      const id = `case_${p.part_key}`
      result.push({
        id, typeKey: 'carcass', typeLabel: 'Carcass',
        name: partLabels?.[id] ?? PART_LABEL[p.part_key] ?? p.part_key,
        material: matNames[p.material_id] ?? '—', materialColor: matColours[p.material_id] ?? null,
        dy: p.DY, dx: p.DX, dz: p.DZ, eb: p.edge_band,
        comment: partComments?.[id] ?? '',
        isCustom: false, isOverride: false,
      })
    }

    for (const p of rp.toekick_parts) {
      const id = `tk_${p.part_key}_${p.sort_order}`
      result.push({
        id, typeKey: 'toekick', typeLabel: 'Toekick',
        name: partLabels?.[id] ?? PART_LABEL[p.part_key] ?? p.part_key,
        material: matNames[p.material_id] ?? '—', materialColor: matColours[p.material_id] ?? null,
        dy: p.DY, dx: p.DX, dz: p.DZ, eb: p.edge_band,
        comment: partComments?.[id] ?? '',
        isCustom: false, isOverride: false,
      })
    }

    for (const p of rp.internal_parts) {
      const id = `int_${p.part_type}_${p.sort_order}`
      const base = PART_LABEL[p.part_type] ?? p.part_type
      result.push({
        id, typeKey: 'internal', typeLabel: 'Internal',
        name: partLabels?.[id] ?? `${base} ${p.sort_order + 1}`,
        material: matNames[p.material_id] ?? '—', materialColor: matColours[p.material_id] ?? null,
        dy: p.DY, dx: p.DX, dz: p.DZ, eb: p.edge_band,
        comment: partComments?.[id] ?? '',
        isCustom: false, isOverride: false,
      })
    }

    for (const z of rp.face_zones) {
      if (z.face_type === 'open') continue
      const id = `zone_${z.row_index}_${z.col_index}`
      const typeName = z.face_type === 'door' ? 'Door' : z.face_type === 'drawer_face' ? 'Drawer Face' : 'False Panel'
      result.push({
        id, typeKey: 'face', typeLabel: 'Face',
        name: partLabels?.[id] ?? `${typeName} R${z.row_index + 1}C${z.col_index + 1}`,
        material: matNames[z.material_id] ?? '—', materialColor: matColours[z.material_id] ?? null,
        dy: z.DY, dx: z.DX, dz: z.DZ, eb: z.edge_band,
        comment: partComments?.[id] ?? '',
        isCustom: false, isOverride: false,
      })
    }

    for (const stack of (rp.drawer_stacks ?? [])) {
      for (const p of stack.box_parts as ResolvedDrawerBoxPart[]) {
        const id = `db_${stack.face_zone_row}_${stack.face_zone_col}_${p.part_type}`
        result.push({
          id, typeKey: 'drawerbox', typeLabel: 'Drawer Box',
          name: partLabels?.[id] ?? `${DB_PART_LABELS[p.part_type] ?? p.part_type} R${stack.face_zone_row + 1}C${stack.face_zone_col + 1}`,
          material: matNames[p.material_id] ?? '—', materialColor: matColours[p.material_id] ?? null,
          dy: p.DY, dx: p.DX, dz: p.DZ, eb: p.edge_band,
          comment: partComments?.[id] ?? '',
          isCustom: false, isOverride: false,
        })
      }
      for (const s of stack.slides as ResolvedDrawerSlide[]) {
        const id = `slide_${stack.face_zone_row}_${stack.face_zone_col}_${s.side}`
        result.push({
          id, typeKey: 'slide', typeLabel: 'Slide',
          name: partLabels?.[id] ?? `Slide (${s.side}) R${stack.face_zone_row + 1}C${stack.face_zone_col + 1}`,
          material: `${s.nominal_length}mm`, materialColor: null,
          dy: s.DY, dx: s.DX, dz: s.DZ, eb: null,
          comment: partComments?.[id] ?? '',
          isCustom: false, isOverride: false,
        })
      }
    }

    for (const p of customParts) {
      const id = `custom_${p.id}`
      result.push({
        id, typeKey: 'custom', typeLabel: 'Custom',
        name: p.name ?? libNames[p.part_library_id] ?? '?',
        material: matNames[p.material_id ?? ''] ?? '—', materialColor: matColours[p.material_id ?? ''] ?? null,
        dy: Number(p.dy), dx: Number(p.dx), dz: Number(p.dz),
        eb: { top: p.edge_top, bottom: p.edge_bottom, left: p.edge_left, right: p.edge_right },
        comment: partComments?.[id] ?? '',
        isCustom: true, isOverride: false,
        visible: p.visible, customPartRef: p,
      })
    }

    for (const [partId, ov] of Object.entries(partOverrides ?? {})) {
      result.push({
        id: `ov__${partId}`, typeKey: 'override', typeLabel: 'Override',
        name: partIdLabel(partId),
        material: `X${ov.ox >= 0 ? '+' : ''}${ov.ox} Y${ov.oy >= 0 ? '+' : ''}${ov.oy} Z${ov.oz >= 0 ? '+' : ''}${ov.oz}`,
        materialColor: null,
        dy: 0, dx: 0, dz: 0, eb: null,
        comment: '',
        isCustom: false, isOverride: true, overridePartId: partId,
      })
    }

    return result
  }, [rp, customParts, partOverrides, matNames, matColours, libNames, partLabels, partComments])

  const filtered = useMemo(() => {
    let r = rows
    if (search) {
      const q = search.toLowerCase()
      r = r.filter(row => row.name.toLowerCase().includes(q) || row.typeLabel.toLowerCase().includes(q) || row.comment.toLowerCase().includes(q))
    }
    return [...r].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortKey) {
        case 'type': {
          const ai = TYPE_ORDER.indexOf(a.typeKey), bi = TYPE_ORDER.indexOf(b.typeKey)
          return (ai - bi) * dir
        }
        case 'dy': return (a.dy - b.dy) * dir
        case 'dx': return (a.dx - b.dx) * dir
        case 'dz': return (a.dz - b.dz) * dir
        case 'name':     return a.name.localeCompare(b.name) * dir
        case 'material': return a.material.localeCompare(b.material) * dir
        default: return 0
      }
    })
  }, [rows, search, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  async function handleToggleVisible(p: CabinetCustomPart) {
    const next = !p.visible
    await dbUpdateCustomPart(p.id, { visible: next })
    setCustomParts(prev => prev.map(q => q.id === p.id ? { ...q, visible: next } : q))
  }

  async function handleDeleteCustom(id: string) {
    await dbDeleteCustomPart(id)
    setCustomParts(prev => prev.filter(p => p.id !== id))
  }

  const totalResolved = rp.case_parts.length + rp.toekick_parts.length + rp.internal_parts.length +
    rp.face_zones.filter(z => z.face_type !== 'open').length +
    (rp.drawer_stacks ?? []).reduce((n, s) => n + s.box_parts.length + s.slides.length, 0)

  const cellCls = 'flex-none border-r border-gray-800 px-2 py-1.5 text-xs overflow-hidden'
  const hdCls   = 'flex-none border-r border-gray-800 px-2 pb-1.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider select-none'

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex-none flex items-center gap-3 px-3 py-2 border-b border-gray-800">
        <span className="text-[10px] text-gray-500 flex-none">
          {totalResolved} resolved · {customParts.length} custom
          {rp.errors.length   > 0 && <span className="text-red-400 ml-2">{rp.errors.length} error{rp.errors.length !== 1 ? 's' : ''}</span>}
          {rp.warnings.length > 0 && <span className="text-amber-400 ml-2">{rp.warnings.length} warning{rp.warnings.length !== 1 ? 's' : ''}</span>}
        </span>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter parts…"
          className="flex-1 max-w-[180px] bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
        <button onClick={() => setShowAdd(true)}
          className="ml-auto flex-none px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition-colors">
          + Add Part
        </button>
      </div>

      {rp.errors.length > 0 && (
        <div className="flex-none mx-3 mt-2 rounded bg-red-950/60 border border-red-800 px-3 py-2 text-xs text-red-300 space-y-0.5">
          {rp.errors.map((e, i) => <div key={i}>{e.code}: {e.message}</div>)}
        </div>
      )}

      {/* Spreadsheet */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-max">
          {/* Header */}
          <div className="flex items-end border-b border-gray-700 bg-gray-900/80 sticky top-0 z-10 pt-2">
            <div className={hdCls} style={{ width: 40 }} title="Show in viewers / reports">Show</div>
            {COLS.map(col => (
              <div key={col.key} className={hdCls} style={{ width: col.w }}>
                {col.sortable ? (
                  <button
                    onClick={() => toggleSort(col.key as SortKey)}
                    className={`flex items-center gap-1 hover:text-gray-300 transition-colors ${sortKey === col.key ? 'text-blue-400' : ''}`}>
                    {col.label}
                    {sortKey === col.key && (
                      <span className="text-[8px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </button>
                ) : col.label}
              </div>
            ))}
            <div className="flex-none w-8" />
          </div>

          {/* Rows */}
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-xs text-gray-600 text-center">
              {search ? 'No parts match the filter.' : 'No parts.'}
            </div>
          ) : filtered.map(row => {
            const isHidden = row.isOverride ? false : row.isCustom ? !row.visible : hiddenSet.has(row.id)
            const toggleVis = row.isOverride
              ? undefined
              : row.isCustom && row.customPartRef
              ? () => handleToggleVisible(row.customPartRef!)
              : () => onToggleHidden?.(row.id)
            return (
            <div key={row.id}
              className={`flex items-center border-b border-gray-800/50 hover:bg-gray-800/20 group min-h-[30px] ${
                row.isOverride ? 'opacity-70' : isHidden ? 'opacity-40' : ''
              }`}>

              {/* Show / hide */}
              <div className="flex-none border-r border-gray-800 px-2 py-1.5 flex items-center justify-center" style={{ width: 40 }}>
                {toggleVis && (
                  <input type="checkbox" checked={!isHidden} onChange={toggleVis}
                    title={isHidden ? 'Hidden — click to show' : 'Visible — click to hide'}
                    className="accent-blue-500 w-3.5 h-3.5 cursor-pointer" />
                )}
              </div>

              {/* Type */}
              <div className={cellCls} style={{ width: COLS[0].w }}>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: TYPE_COLOR[row.typeKey] ?? '#888' }} />
                  <span className="text-gray-400 truncate">{row.typeLabel}</span>
                </div>
              </div>

              {/* Part name */}
              <div className={cellCls} style={{ width: COLS[1].w }}>
                {row.isOverride ? (
                  <span className="text-gray-400 truncate">{row.name}</span>
                ) : row.isCustom && row.customPartRef ? (
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <EditableName
                      value={row.name}
                      onSave={name => {
                        const cp = row.customPartRef!
                        setCustomParts(prev => prev.map(p => p.id === cp.id ? { ...p, name } : p))
                        dbUpdateCustomPart(cp.id, { name }).catch(console.error)
                      }}
                    />
                  </div>
                ) : (
                  <EditableName
                    value={row.name}
                    onSave={name => onLabelChange?.(row.id, name)}
                  />
                )}
              </div>

              {/* Material */}
              <div className={cellCls} style={{ width: COLS[2].w }}>
                <div className="flex items-center gap-1.5 overflow-hidden">
                  {row.materialColor && (
                    <span className="w-3 h-3 rounded-sm flex-none border border-gray-600"
                      style={{ background: row.materialColor }} />
                  )}
                  <span className="text-gray-400 truncate">{row.material}</span>
                </div>
              </div>

              {/* W DY */}
              <div className={`${cellCls} text-right font-mono text-gray-200`} style={{ width: COLS[3].w }}>
                {row.dy > 0 ? row.dy.toFixed(1) : <span className="text-gray-700">—</span>}
              </div>

              {/* H DX */}
              <div className={`${cellCls} text-right font-mono text-gray-200`} style={{ width: COLS[4].w }}>
                {row.dx > 0 ? row.dx.toFixed(1) : <span className="text-gray-700">—</span>}
              </div>

              {/* T DZ */}
              <div className={`${cellCls} text-right font-mono text-gray-400`} style={{ width: COLS[5].w }}>
                {row.dz > 0 ? row.dz.toFixed(1) : <span className="text-gray-700">—</span>}
              </div>

              {/* Edge */}
              <div className={cellCls} style={{ width: COLS[6].w }}>
                {row.eb ? <EBDots t={row.eb.top} b={row.eb.bottom} l={row.eb.left} r={row.eb.right} /> : <span className="text-gray-700 text-[10px]">—</span>}
              </div>

              {/* Comment */}
              <div className={cellCls} style={{ width: COLS[7].w }}>
                {!row.isOverride && onCommentChange ? (
                  <EditableComment
                    value={row.comment}
                    onSave={v => onCommentChange(row.id, v)}
                  />
                ) : (
                  <span className="text-gray-600 text-xs">{row.comment}</span>
                )}
              </div>

              {/* Actions */}
              <div className="flex-none w-8 px-1 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {row.isCustom && row.customPartRef ? (
                  <button onClick={() => handleDeleteCustom(row.customPartRef!.id)}
                    className="text-gray-600 hover:text-red-400 transition-colors text-xs leading-none" title="Delete">✕</button>
                ) : row.isOverride && row.overridePartId ? (
                  <button onClick={() => onDeletePosOverride?.(row.overridePartId!)}
                    className="text-gray-600 hover:text-red-400 transition-colors text-xs leading-none" title="Remove override">✕</button>
                ) : null}
              </div>
            </div>
            )
          })}
        </div>
      </div>

      <div className="flex-none px-3 py-1.5 text-[10px] text-gray-700 border-t border-gray-800">
        W = DY · H = DX · T = DZ · all mm · click Part to rename · click Comment to edit
      </div>

      {showAdd && (
        <AddPartDialog
          cabinetId={cabinetId}
          onAdd={part => {
            setCustomParts(prev => [...prev, part])
            supabase.from('parts_library').select('id,name').eq('id', part.part_library_id).single()
              .then(({ data }) => { if (data) setLibNames(prev => ({ ...prev, [data.id]: data.name })) })
            if (part.material_id) {
              supabase.from('materials').select('id,name,face_colour').eq('id', part.material_id).single()
                .then(({ data: m }) => {
                  if (m) {
                    setMatNames(prev => ({ ...prev, [m.id]: m.name }))
                    setMatColours(prev => ({ ...prev, [m.id]: m.face_colour }))
                  }
                })
            }
            setShowAdd(false)
          }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  )
}
