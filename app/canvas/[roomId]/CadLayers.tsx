'use client'

// Named CAD layers (z_cad_layers/CAD-LAYERS-SPEC.md): the job's layer list in the CAD
// panel (on/off, colour, print, current layer), the layer manager (add / rename /
// recolour / reorder / delete / Add from shop list), and the same editor for the shop
// list in Settings → CAD Layers. On/off, colour and print are for the whole job.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { CadLayer, RoomAnnotation } from '@/src/lib/types'
import { jobRowsFromShop, sortCadLayers } from '@/src/lib/annotations/cadLayers'
import { useTutorial } from '@/src/lib/tutorial/store'

const COLS = 'id, project_id, shop_layer_id, name, color, visible, print, is_default, sort_order'
const SHOP_COLS = 'id, name, color, visible, print, is_default, sort_order'

export type CadLayerPatch = Partial<Pick<CadLayer, 'name' | 'color' | 'visible' | 'print' | 'sort_order'>>

export interface CadLayerOps {
  update: (id: string, patch: CadLayerPatch) => void
  add:    () => void
  /** Items on it move to General (the FK sets them null). */
  remove: (id: string) => void
  move:   (id: string, dir: -1 | 1) => void
  /** Job only: shop layers this job doesn't have yet. Resolves to how many were added. */
  addFromShop?: () => Promise<number>
}

/** Layer edits for one list: the job's (job_cad_layers) or the shop's (cad_layers).
 *  Changes show at once and save in the background. */
export function useCadLayerOps({ table, projectId, layers, setLayers, setAnnotations }: {
  table:      'job_cad_layers' | 'cad_layers'
  projectId?: string
  layers:     CadLayer[]
  setLayers:  React.Dispatch<React.SetStateAction<CadLayer[]>>
  /** Job: items on a deleted layer go to General here too (the DB does it itself). */
  setAnnotations?: React.Dispatch<React.SetStateAction<RoomAnnotation[]>>
}): CadLayerOps {
  const save = useCallback(async (id: string, patch: CadLayerPatch) => {
    const { error } = await supabase.from(table).update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) console.error('[cad layer update]', error)
  }, [table])

  const update = useCallback((id: string, patch: CadLayerPatch) => {
    setLayers(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l))
    void save(id, patch)
    if (patch.visible != null) useTutorial.getState().emit('cad_layer_toggle')
  }, [setLayers, save])

  const add = useCallback(() => {
    const names = new Set(layers.map(l => l.name.toLowerCase()))
    let n = 1, name = 'New layer'
    while (names.has(name.toLowerCase())) name = `New layer ${++n}`
    const row = {
      ...(table === 'job_cad_layers' ? { project_id: projectId, shop_layer_id: null } : {}),
      name, color: '#0891b2', visible: true, print: true, is_default: false,
      sort_order: layers.reduce((m, l) => Math.max(m, l.sort_order + 1), 0),
    }
    void supabase.from(table).insert(row).select(table === 'job_cad_layers' ? COLS : SHOP_COLS).single()
      .then(({ data, error }) => {
        if (error) { console.error('[cad layer add]', error); return }
        setLayers(ls => [...ls, data as unknown as CadLayer])
      })
  }, [layers, table, projectId, setLayers])

  const remove = useCallback((id: string) => {
    const l = layers.find(x => x.id === id)
    if (!l || l.is_default) return
    setLayers(ls => ls.filter(x => x.id !== id))
    setAnnotations?.(xs => xs.map(a => a.cad_layer_id === id ? { ...a, cad_layer_id: null } : a))
    void supabase.from(table).delete().eq('id', id).then(({ error }) => { if (error) console.error('[cad layer delete]', error) })
  }, [layers, table, setLayers, setAnnotations])

  const move = useCallback((id: string, dir: -1 | 1) => {
    // General stays on top; the rest swap places in list order.
    const list = sortCadLayers(layers).filter(l => !l.is_default)
    const i = list.findIndex(l => l.id === id), j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    const a = list[i], b = list[j]
    const [oa, ob] = a.sort_order === b.sort_order ? [b.sort_order + dir, a.sort_order] : [b.sort_order, a.sort_order]
    update(a.id, { sort_order: oa }); update(b.id, { sort_order: ob })
  }, [layers, update])

  const addFromShop = useCallback(async () => {
    if (table !== 'job_cad_layers' || !projectId) return 0
    const { data: shop } = await supabase.from('cad_layers').select(SHOP_COLS).order('sort_order')
    // Same name already in the job (e.g. the job made its own "Gas"): don't double up.
    const names = new Set(layers.map(l => l.name.toLowerCase()))
    const rows = jobRowsFromShop(projectId, ((shop ?? []) as unknown as CadLayer[]).filter(s => !names.has(s.name.toLowerCase())), layers)
    if (!rows.length) return 0
    const { data, error } = await supabase.from('job_cad_layers').insert(rows).select(COLS)
    if (error) { console.error('[cad layer add from shop]', error); return 0 }
    setLayers(ls => [...ls, ...((data ?? []) as unknown as CadLayer[])])
    return rows.length
  }, [table, projectId, layers, setLayers])

  return { update, add, remove, move, addFromShop: table === 'job_cad_layers' ? addFromShop : undefined }
}

function Eye({ on }: { on: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
      {on ? <circle cx="8" cy="8" r="2" fill="currentColor" /> : <path d="M2.5 13.5l11-11" />}
    </svg>
  )
}

function Printer({ on }: { on: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
      <path d="M4.5 6V2h7v4M4.5 11.5h-2v-5h11v5h-2" /><path d="M4.5 9.5h7v4.5h-7z" />
      {!on && <path d="M2 14L14 2" strokeLinecap="round" />}
    </svg>
  )
}

function Swatch({ value, onChange, title }: { value: string; onChange: (c: string) => void; title: string }) {
  return (
    <label title={title} className="relative w-4 h-4 shrink-0 rounded-sm border border-gray-500 cursor-pointer overflow-hidden" style={{ background: value }}>
      <input type="color" value={value} onChange={e => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
    </label>
  )
}

const iconBtn = (on: boolean) => `w-5 h-5 shrink-0 flex items-center justify-center rounded hover:bg-gray-700 ${on ? 'text-gray-200' : 'text-gray-600'}`

/** The CAD panel's layer list: eye, colour, name (click = current layer), print, count. */
export function CadLayersSection({ layers, ops, current, setCurrent, counts, onManage, Section }: {
  layers:     CadLayer[]
  ops:        CadLayerOps
  current:    string | null
  setCurrent: (id: string | null) => void
  /** Items on each layer in the drawing on show (layer id, General = ''). */
  counts:     Map<string, number>
  onManage:   () => void
  Section:    (p: { title: string; children: React.ReactNode }) => React.ReactElement
}) {
  const list = sortCadLayers(layers)
  return (
    <Section title="Layers">
      <div className="flex flex-col gap-0.5" data-tour="cad-layers">
        {list.map(l => {
          const isCur = l.is_default ? current == null : current === l.id
          const n = counts.get(l.is_default ? '' : l.id) ?? 0
          return (
            <div key={l.id} data-cad-layer={l.name} className={`flex items-center gap-1.5 rounded px-1 py-0.5 ${isCur ? 'bg-rose-500/15' : ''}`}>
              <button title={l.visible ? 'On: click to hide this layer for the whole job' : 'Off: click to show it'}
                className={iconBtn(l.visible)} onClick={() => ops.update(l.id, { visible: !l.visible })}><Eye on={l.visible} /></button>
              <Swatch value={l.color} title="Layer colour (ByLayer items use it)" onChange={c => ops.update(l.id, { color: c })} />
              <button title="Make this the current layer: new items go on it" onClick={() => setCurrent(l.is_default ? null : l.id)}
                className={`flex-1 min-w-0 text-left text-xs truncate ${isCur ? 'text-rose-200 font-medium' : l.visible ? 'text-gray-200' : 'text-gray-500'}`}>
                {l.name}
              </button>
              {n > 0 && <span className="text-[10px] text-gray-500 font-mono">{n}</span>}
              <button title={l.print ? 'Prints: click to keep this layer off the reports' : 'Doesn’t print: click to print it'}
                className={iconBtn(l.print)} onClick={() => ops.update(l.id, { print: !l.print })}><Printer on={l.print} /></button>
            </div>
          )
        })}
      </div>
      <button onClick={onManage} className="mt-1.5 text-[11px] text-rose-300 hover:text-rose-200">Manage layers…</button>
    </Section>
  )
}

/** Full editor: rename, recolour, on / print, reorder, delete, add. The job's copy in a
 *  modal from the CAD panel, the shop list inline in Settings. */
export function CadLayerEditor({ layers, ops, scope, readOnly }: {
  layers:    CadLayer[]
  ops:       CadLayerOps
  scope:     'job' | 'shop'
  readOnly?: boolean
}) {
  const list = useMemo(() => sortCadLayers(layers), [layers])
  const [msg, setMsg] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const rest = list.filter(l => !l.is_default)
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[1.5rem_1.5rem_1fr_1.5rem_3.25rem_1.5rem] gap-1.5 px-1 text-[10px] uppercase tracking-wide text-gray-500">
        <span title="On / off">On</span><span>Col</span><span>Name</span><span title="Prints on the reports">Prt</span><span /><span />
      </div>
      {list.map(l => {
        const idx = rest.findIndex(x => x.id === l.id)
        return (
          <div key={l.id} className="grid grid-cols-[1.5rem_1.5rem_1fr_1.5rem_3.25rem_1.5rem] gap-1.5 items-center px-1">
            <button disabled={readOnly} className={iconBtn(l.visible)} title={scope === 'shop' ? 'On in new jobs' : 'On / off for the whole job'}
              onClick={() => ops.update(l.id, { visible: !l.visible })}><Eye on={l.visible} /></button>
            {readOnly ? <span className="w-4 h-4 rounded-sm border border-gray-600" style={{ background: l.color }} />
              : <Swatch value={l.color} title="Colour" onChange={c => ops.update(l.id, { color: c })} />}
            <input key={l.name} defaultValue={l.name} disabled={readOnly}
              onBlur={e => { const v = e.target.value.trim(); if (v && v !== l.name) ops.update(l.id, { name: v }); else e.target.value = l.name }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              className="h-7 min-w-0 bg-gray-800 border border-gray-700 rounded px-2 text-sm text-gray-100 outline-none focus:border-rose-500 disabled:opacity-60" />
            <button disabled={readOnly} className={iconBtn(l.print)} title="Prints on the reports"
              onClick={() => ops.update(l.id, { print: !l.print })}><Printer on={l.print} /></button>
            {l.is_default ? <span className="text-[10px] text-gray-500 text-center" title="Every job has it; items with no layer sit on it">default</span> : (
              <span className="flex">
                <button disabled={readOnly || idx <= 0} onClick={() => ops.move(l.id, -1)} title="Up" className="w-6 h-6 text-gray-400 hover:text-white disabled:opacity-30">▲</button>
                <button disabled={readOnly || idx >= rest.length - 1} onClick={() => ops.move(l.id, 1)} title="Down" className="w-6 h-6 text-gray-400 hover:text-white disabled:opacity-30">▼</button>
              </span>
            )}
            {l.is_default || readOnly ? <span /> : confirmDel === l.id ? (
              <button onClick={() => { ops.remove(l.id); setConfirmDel(null) }} onBlur={() => setConfirmDel(null)} autoFocus
                title={scope === 'job' ? 'Click again: delete it, its items move to General' : 'Click again to delete'}
                className="w-6 h-6 rounded bg-red-600 text-white text-xs">✓</button>
            ) : (
              <button onClick={() => setConfirmDel(l.id)} title="Delete layer" className="w-6 h-6 text-gray-500 hover:text-red-400">✕</button>
            )}
          </div>
        )
      })}
      {!readOnly && (
        <div className="flex items-center gap-3 mt-2 px-1">
          <button onClick={ops.add} className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm text-gray-100">+ Add layer</button>
          {ops.addFromShop && (
            <button title="Add the shop's standard layers this job doesn't have yet"
              onClick={() => void ops.addFromShop!().then(n => setMsg(n ? `Added ${n} layer${n === 1 ? '' : 's'} from the shop list` : 'This job already has every shop layer'))}
              className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm text-gray-100">Add from shop list</button>
          )}
          {msg && <span className="text-xs text-gray-400">{msg}</span>}
        </div>
      )}
      <p className="mt-2 px-1 text-[11px] text-gray-500 leading-snug">
        {scope === 'job'
          ? 'These layers belong to this job: on / off, colours and print apply to everyone on it, on screen and in the reports. Deleting a layer moves its items to General. Shop list changes never change this job; use Add from shop list.'
          : 'The standard layers every new job starts with. Changes here don’t change jobs already opened; a job picks new layers up with Add from shop list.'}
      </p>
    </div>
  )
}

export function CadLayerManagerModal({ layers, ops, onClose }: { layers: CadLayer[]; ops: CadLayerOps; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onPointerDown={onClose}>
      <div data-cad-layer-manager className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-lg bg-gray-900 border border-gray-700 shadow-2xl p-4"
        onPointerDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-100">CAD layers — this job</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none px-1">×</button>
        </div>
        <CadLayerEditor layers={layers} ops={ops} scope="job" />
      </div>
    </div>
  )
}

/** Settings → CAD Layers: the shop list (admin edits; everyone can see it). */
export function ShopCadLayers({ isAdmin }: { isAdmin: boolean }) {
  const [layers, setLayers] = useState<CadLayer[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    void supabase.from('cad_layers').select(SHOP_COLS).order('sort_order')
      .then(({ data }) => { setLayers((data ?? []) as unknown as CadLayer[]); setLoading(false) })
  }, [])
  return <ShopCadLayersInner layers={layers} setLayers={setLayers} isAdmin={isAdmin} loading={loading} />
}

function ShopCadLayersInner({ layers, setLayers, isAdmin, loading }: {
  layers: CadLayer[]; setLayers: React.Dispatch<React.SetStateAction<CadLayer[]>>; isAdmin: boolean; loading: boolean
}) {
  const ops = useCadLayerOps({ table: 'cad_layers', layers, setLayers })
  if (loading) return <div className="text-sm text-gray-500">Loading…</div>
  return (
    <div className="max-w-xl rounded-lg bg-gray-900 border border-gray-700 p-4">
      <CadLayerEditor layers={layers} ops={ops} scope="shop" readOnly={!isAdmin} />
      {!isAdmin && <p className="mt-2 px-1 text-xs text-amber-300">Only admins can change the shop list.</p>}
    </div>
  )
}
