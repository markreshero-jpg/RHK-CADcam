'use client'

import { useState, useEffect, type Dispatch, type SetStateAction } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { ResolvedCabinet, ResolvedCasePart, ResolvedToekickPart, ResolvedInternalPart, ResolvedFaceZone, ResolvedDrawerBoxPart, ResolvedDrawerSlide } from '@/src/lib/resolver/types'
import { dbAddCustomPart, dbUpdateCustomPart, dbDeleteCustomPart, type CabinetCustomPart, type PartPosOverrides } from './canvasDB'
import { DB_PART_LABELS } from './cabinetEditSvgHelpers'

// ── Parts list helpers ────────────────────────────────────────────────────────

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
  spreader_vertical:   'Spreader (Vertical)',
  spreader_horizontal: 'Spreader (Horizontal)',
  adj_shelf:           'Adj. Shelf',
  fixed_shelf:         'Fixed Shelf',
  inner_drawer_bottom: 'Drawer Bottom',
  inner_drawer_back:   'Drawer Back',
}

const SECTION_COLOR: Record<string, string> = {
  carcass:   '#3b82f6',
  toekick:   '#f59e0b',
  internal:  '#818cf8',
  face:      '#60a5fa',
  drawerbox: '#22c55e',
  slide:     '#d97706',
  custom:    '#a78bfa',
}

function EBDots({ t, b, l, r }: { t: boolean; b: boolean; l: boolean; r: boolean }) {
  const dot = (on: boolean, label: string) => (
    <span
      key={label}
      title={`${label}: ${on ? 'banded' : 'no band'}`}
      className={`inline-block w-4 h-4 rounded-sm text-[9px] leading-4 text-center font-bold ${
        on ? 'bg-amber-500 text-gray-900' : 'bg-gray-700 text-gray-500'
      }`}
    >
      {label}
    </span>
  )
  return (
    <span className="flex gap-0.5">
      {dot(t, 'T')}{dot(b, 'B')}{dot(l, 'L')}{dot(r, 'R')}
    </span>
  )
}

function SectionHeader({ color, title, count }: { color: string; title: string; count: number }) {
  return (
    <tr>
      <td colSpan={6} className="pt-4 pb-1 px-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full flex-none" style={{ background: color }} />
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</span>
          <span className="text-[10px] text-gray-600 ml-1">{count} part{count !== 1 ? 's' : ''}</span>
        </div>
      </td>
    </tr>
  )
}

function PartRow({ name, material, dy, dx, dz, eb }: {
  name: string; material: string; dy: number; dx: number; dz: number
  eb: { top: boolean; bottom: boolean; left: boolean; right: boolean }
}) {
  return (
    <tr className="border-t border-gray-800/60 hover:bg-gray-800/30">
      <td className="px-3 py-1.5 text-xs text-gray-300">{name}</td>
      <td className="px-3 py-1.5 text-xs text-gray-400">{material}</td>
      <td className="px-3 py-1.5 text-xs font-mono text-right text-gray-200">{dy.toFixed(1)}</td>
      <td className="px-3 py-1.5 text-xs font-mono text-right text-gray-200">{dx.toFixed(1)}</td>
      <td className="px-3 py-1.5 text-xs font-mono text-right text-gray-400">{dz.toFixed(1)}</td>
      <td className="px-3 py-1.5">
        <EBDots t={eb.top} b={eb.bottom} l={eb.left} r={eb.right} />
      </td>
    </tr>
  )
}

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

  const cats    = ['all', ...Array.from(new Set(libParts.map(p => p.category)))]
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
          {/* Left: library browser */}
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
          {/* Right: form */}
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

// ── Parts View ────────────────────────────────────────────────────────────────

export default function PartsView({ rp, cabinetId, customParts, setCustomParts, partOverrides, onDeletePosOverride }: {
  rp: ResolvedCabinet; cabinetId: string
  customParts: CabinetCustomPart[]
  setCustomParts: Dispatch<SetStateAction<CabinetCustomPart[]>>
  partOverrides?: PartPosOverrides
  onDeletePosOverride?: (partId: string) => void
}) {
  const [matNames,    setMatNames]    = useState<Record<string, string>>({})
  const [matColours,  setMatColours]  = useState<Record<string, string | null>>({})
  const [libNames,    setLibNames]    = useState<Record<string, string>>({})
  const [showAdd,     setShowAdd]     = useState(false)

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

  async function handleToggleVisible(part: CabinetCustomPart) {
    const next = !part.visible
    await dbUpdateCustomPart(part.id, { visible: next })
    setCustomParts(prev => prev.map(p => p.id === part.id ? { ...p, visible: next } : p))
  }

  async function handleDeleteCustom(id: string) {
    await dbDeleteCustomPart(id)
    setCustomParts(prev => prev.filter(p => p.id !== id))
  }

  const mat = (id: string) => matNames[id] ?? '—'

  const faceCount      = rp.face_zones.filter(z => z.face_type !== 'open').length
  const drawerBoxCount = (rp.drawer_stacks ?? []).reduce((n, s) => n + s.box_parts.length, 0)
  const slideCount     = (rp.drawer_stacks ?? []).reduce((n, s) => n + s.slides.length, 0)
  const totalResolved  = rp.case_parts.length + rp.toekick_parts.length + rp.internal_parts.length + faceCount + drawerBoxCount + slideCount

  return (
    <div className="w-full h-full overflow-auto p-4">
      <div className="text-[10px] text-gray-500 mb-3 flex items-center gap-3">
        <span>{totalResolved} resolved · {customParts.length} custom</span>
        {rp.errors.length > 0   && <span className="text-red-400">{rp.errors.length} error{rp.errors.length !== 1 ? 's' : ''}</span>}
        {rp.warnings.length > 0 && <span className="text-amber-400">{rp.warnings.length} warning{rp.warnings.length !== 1 ? 's' : ''}</span>}
        <button onClick={() => setShowAdd(true)}
          className="ml-auto px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition-colors">
          + Add Part
        </button>
      </div>
      {rp.errors.length > 0 && (
        <div className="mb-3 rounded bg-red-950/60 border border-red-800 px-3 py-2 text-xs text-red-300 space-y-0.5">
          {rp.errors.map((e, i) => <div key={i}>{e.code}: {e.message}</div>)}
        </div>
      )}
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-gray-700">
            <th className="px-3 pb-1.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">Part</th>
            <th className="px-3 pb-1.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">Material</th>
            <th className="px-3 pb-1.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider text-right">W (DY)</th>
            <th className="px-3 pb-1.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider text-right">H (DX)</th>
            <th className="px-3 pb-1.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider text-right">T (DZ)</th>
            <th className="px-3 pb-1.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">Edge</th>
          </tr>
        </thead>
        <tbody>
          {rp.case_parts.length > 0 && (
            <>
              <SectionHeader color={SECTION_COLOR.carcass} title="Carcass" count={rp.case_parts.length} />
              {rp.case_parts.map((p: ResolvedCasePart, i: number) => (
                <PartRow key={`cp-${i}`} name={PART_LABEL[p.part_key] ?? p.part_key}
                  material={mat(p.material_id)} dy={p.DY} dx={p.DX} dz={p.DZ} eb={p.edge_band} />
              ))}
            </>
          )}
          {rp.toekick_parts.length > 0 && (
            <>
              <SectionHeader color={SECTION_COLOR.toekick} title="Toekick" count={rp.toekick_parts.length} />
              {rp.toekick_parts.map((p: ResolvedToekickPart, i: number) => (
                <PartRow key={`tk-${i}`} name={PART_LABEL[p.part_key] ?? p.part_key}
                  material={mat(p.material_id)} dy={p.DY} dx={p.DX} dz={p.DZ} eb={p.edge_band} />
              ))}
            </>
          )}
          {rp.internal_parts.length > 0 && (
            <>
              <SectionHeader color={SECTION_COLOR.internal} title="Internal" count={rp.internal_parts.length} />
              {rp.internal_parts.map((p: ResolvedInternalPart, i: number) => (
                <PartRow key={`ip-${i}`} name={PART_LABEL[p.part_type] ?? p.part_type}
                  material={mat(p.material_id)} dy={p.DY} dx={p.DX} dz={p.DZ} eb={p.edge_band} />
              ))}
            </>
          )}
          {faceCount > 0 && (
            <>
              <SectionHeader color={SECTION_COLOR.face} title="Face" count={faceCount} />
              {rp.face_zones.filter((z: ResolvedFaceZone) => z.face_type !== 'open').map((z: ResolvedFaceZone, i: number) => (
                <PartRow key={`fz-${i}`}
                  name={`${z.face_type === 'door' ? 'Door' : z.face_type === 'drawer_face' ? 'Drawer Face' : 'False Panel'} R${z.row_index + 1}C${z.col_index + 1}`}
                  material={mat(z.material_id)} dy={z.DY} dx={z.DX} dz={z.DZ} eb={z.edge_band} />
              ))}
            </>
          )}
          {drawerBoxCount > 0 && (
            <>
              <SectionHeader color={SECTION_COLOR.drawerbox} title="Drawer Boxes" count={drawerBoxCount} />
              {(rp.drawer_stacks ?? []).flatMap((stack, si) =>
                stack.box_parts.map((p: ResolvedDrawerBoxPart, pi: number) => (
                  <PartRow key={`db-${si}-${pi}`}
                    name={`${DB_PART_LABELS[p.part_type] ?? p.part_type} R${stack.face_zone_row + 1}C${stack.face_zone_col + 1}`}
                    material={mat(p.material_id)} dy={p.DY} dx={p.DX} dz={p.DZ} eb={p.edge_band} />
                ))
              )}
            </>
          )}
          {slideCount > 0 && (
            <>
              <SectionHeader color={SECTION_COLOR.slide} title="Drawer Slides" count={slideCount} />
              {(rp.drawer_stacks ?? []).flatMap((stack, si) =>
                stack.slides.map((s: ResolvedDrawerSlide, li: number) => (
                  <PartRow key={`sl-${si}-${li}`}
                    name={`Slide (${s.side}) R${stack.face_zone_row + 1}C${stack.face_zone_col + 1}`}
                    material={`${s.nominal_length}mm NL`}
                    dy={s.DY} dx={s.DX} dz={s.DZ}
                    eb={{ top: false, bottom: false, left: false, right: false }} />
                ))
              )}
            </>
          )}
          {customParts.length > 0 && (
            <>
              <SectionHeader color={SECTION_COLOR.custom} title="Custom Parts" count={customParts.length} />
              {customParts.map(p => {
                const displayName = p.name ?? libNames[p.part_library_id] ?? '?'
                const dz = Number(p.dz)
                const colour = matColours[p.material_id ?? '']
                return (
                  <tr key={p.id} className="border-t border-gray-800/60 hover:bg-gray-800/30">
                    <td className="px-3 py-1.5 text-xs text-gray-300">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleToggleVisible(p)} title={p.visible ? 'Visible — click to hide' : 'Hidden — click to show'}
                          className={`w-3.5 h-3.5 rounded-sm border flex-none transition-colors ${p.visible ? 'bg-blue-600 border-blue-500' : 'border-gray-600'}`} />
                        {displayName}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-xs text-gray-400">
                      <div className="flex items-center gap-1.5">
                        {colour && <span className="w-3 h-3 rounded-sm flex-none border border-gray-600 inline-block" style={{ background: colour }} />}
                        {mat(p.material_id ?? '')}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-xs font-mono text-right text-gray-200">{Number(p.dy).toFixed(1)}</td>
                    <td className="px-3 py-1.5 text-xs font-mono text-right text-gray-200">{Number(p.dx).toFixed(1)}</td>
                    <td className="px-3 py-1.5 text-xs font-mono text-right text-gray-400">{dz.toFixed(1)}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        <EBDots t={p.edge_top} b={p.edge_bottom} l={p.edge_left} r={p.edge_right} />
                        <button onClick={() => handleDeleteCustom(p.id)}
                          className="ml-2 text-gray-600 hover:text-red-400 text-xs leading-none transition-colors" title="Remove">✕</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </>
          )}
          {Object.keys(partOverrides ?? {}).length > 0 && (
            <>
              <SectionHeader color="#f97316" title="Position Overrides" count={Object.keys(partOverrides!).length} />
              {Object.entries(partOverrides!).map(([partId, ov]) => (
                <tr key={partId} className="border-t border-gray-800/60 hover:bg-gray-800/30">
                  <td className="px-3 py-1.5 text-xs text-gray-300">{partIdLabel(partId)}</td>
                  <td className="px-3 py-1.5 text-xs font-mono text-gray-500" colSpan={4}>
                    X{ov.ox >= 0 ? '+' : ''}{ov.ox} &nbsp;Y{ov.oy >= 0 ? '+' : ''}{ov.oy} &nbsp;Z{ov.oz >= 0 ? '+' : ''}{ov.oz}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button onClick={() => onDeletePosOverride?.(partId)}
                      className="text-gray-600 hover:text-red-400 text-xs leading-none transition-colors" title="Remove override">✕</button>
                  </td>
                </tr>
              ))}
            </>
          )}
        </tbody>
      </table>
      <p className="mt-4 text-[10px] text-gray-600">
        W = DY (width) · H = DX (height/depth) · T = DZ (thickness) · all mm · blue square = visible toggle
      </p>
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
