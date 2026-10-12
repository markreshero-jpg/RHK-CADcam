'use client'
// Layer Manager — create / edit / delete shop-wide layer sets (all editable).
// Spec: z_display_layers/DISPLAY-LAYERS-SPEC.md
// One active set drives every view; the Plan / Elevation / 3D tabs edit that
// set's per-view items. Docked right so the canvas stays visible; edits preview live.

import { useEffect, useMemo, useState } from 'react'
import {
  LAYER_GROUPS, LAYER_VIEWS, WEIGHT_OPTIONS, OPACITY_OPTIONS, CABINET_FILL_CLASSES, itemsForView,
  type LayerSet, type LayerSetSettings, type LayerStyle, type LayerViewId, type ViewLayerSettings,
} from '@/src/lib/displayLayers/registry'
import { effectiveSetting, sparseViewSettings } from '@/src/lib/displayLayers/resolve'
import type { LayerSetsApi } from '@/src/lib/displayLayers/useLayerSets'

const STYLES: LayerStyle[] = ['solid', 'dashed', 'ghost']
const WEIGHT_LABEL: Record<number, string> = { 0.5: '½×', 1: '1×', 1.5: '1½×', 2: '2×', 3: '3×' }

// Colour override swatch: unset = dashed "default" chip (the renderer's normal
// colour); set = filled chip with a small × to clear back to default.
function ColorSwatch({ value, onChange, disabled, title }: {
  value?: string
  onChange: (v: string | undefined) => void
  disabled?: boolean
  title: string
}) {
  return (
    <span className={`relative inline-flex items-center ${disabled ? 'opacity-40' : ''}`}>
      <label title={value ? `${title}: ${value}` : `${title}: default`}
        className={`block w-5 h-5 rounded border cursor-pointer ${value ? 'border-gray-500' : 'border-dashed border-gray-600 bg-[repeating-linear-gradient(45deg,#374151_0_3px,transparent_3px_6px)]'}`}
        style={value ? { background: value } : undefined}>
        <input type="color" className="sr-only" disabled={disabled}
          value={value ?? '#888888'} onChange={e => onChange(e.target.value)} />
      </label>
      {value && !disabled && (
        <button type="button" onClick={() => onChange(undefined)} title="Reset to default colour"
          className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-gray-700 text-[8px] leading-3 text-gray-200 hover:bg-red-600">×</button>
      )}
    </span>
  )
}
const EMPTY_SET: LayerSet = { id: '', name: '', sort_order: 0, settings: {} }

function sparseSettings(settings: LayerSetSettings): LayerSetSettings {
  const out: LayerSetSettings = {}
  for (const { id } of LAYER_VIEWS) {
    const vs = settings[id]
    if (vs) out[id] = sparseViewSettings(vs, id)
  }
  return out
}

const sameSettings = (a: LayerSetSettings, b: LayerSetSettings) =>
  JSON.stringify(sparseSettings(a)) === JSON.stringify(sparseSettings(b))

export default function LayerManagerPanel({ api, initialView, activeSetId, onPreview, onUse, onClose }: {
  api: LayerSetsApi
  initialView: LayerViewId
  activeSetId: string | null
  /** Live preview of the set being edited (null = stop previewing). */
  onPreview: (set: LayerSet | null) => void
  /** Make a set the active one (all views). */
  onUse: (setId: string) => void
  onClose: () => void
}) {
  const [view, setView]             = useState<LayerViewId>(initialView)
  const [selectedId, setSelectedId] = useState(activeSetId ?? api.sets[0]?.id ?? '')
  const stored = api.sets.find(s => s.id === selectedId) ?? api.sets[0]
  const [draft, setDraft]           = useState<LayerSet>(stored ?? EMPTY_SET)
  const [creating, setCreating]     = useState<null | { name: string; from: LayerSet | null }>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy]             = useState(false)
  const [notice, setNotice]         = useState<string | null>(null)

  // Draft left empty because sets were still loading → adopt the first stored set.
  const hasSet = !!stored
  const effDraft = draft.id ? draft : (stored ?? EMPTY_SET)

  useEffect(() => { onPreview(effDraft.id ? effDraft : null) }, [effDraft]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onPreview(null), [])                                 // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => itemsForView(view), [view])
  const dirty = hasSet && (effDraft.name !== stored.name || !sameSettings(effDraft.settings, stored.settings))
  const vs: ViewLayerSettings = effDraft.settings[view] ?? {}
  const isActive = effDraft.id === activeSetId

  function selectSet(set: LayerSet) {
    setSelectedId(set.id); setDraft(set); setConfirmDelete(false)
  }

  function patchView(fn: (vs: ViewLayerSettings) => ViewLayerSettings) {
    if (!effDraft.id) return
    setDraft({ ...effDraft, settings: { ...effDraft.settings, [view]: fn(effDraft.settings[view] ?? {}) } })
  }
  function setItem(ids: string[], patch: { visible?: boolean; style?: LayerStyle; color?: string; weight?: number; opacity?: number }) {
    patchView(v => {
      const next = { ...(v.items ?? {}) }
      for (const id of ids) next[id] = { ...effectiveSetting(v, id, view), ...patch }
      return { ...v, items: next }
    })
  }

  function select(id: string) {
    if (id === effDraft.id) return
    if (dirty) { setNotice('Unsaved changes — Save or Revert first.'); return }
    const set = api.sets.find(s => s.id === id)
    if (set) { setNotice(null); setCreating(null); selectSet(set) }
  }

  async function save() {
    if (!dirty) return
    const name = effDraft.name.trim()
    if (!name) { setNotice('Name is required.'); return }
    if (api.sets.some(s => s.id !== effDraft.id && s.name.toLowerCase() === name.toLowerCase())) {
      setNotice('A set with that name already exists.'); return
    }
    setBusy(true)
    const ok = await api.update(effDraft.id, { name, settings: sparseSettings(effDraft.settings) })
    setBusy(false)
    setNotice(ok ? 'Saved.' : null)
  }

  async function createSet() {
    if (!creating) return
    const name = creating.name.trim()
    if (!name) return
    if (api.sets.some(s => s.name.toLowerCase() === name.toLowerCase())) { setNotice('A set with that name already exists.'); return }
    setBusy(true)
    const set = await api.create(name, sparseSettings(creating.from?.settings ?? {}))
    setBusy(false)
    if (set) { setCreating(null); setNotice(null); selectSet(set) }
  }

  async function deleteSet() {
    if (api.sets.length <= 1) { setNotice('Keep at least one layer set.'); setConfirmDelete(false); return }
    const next = api.sets.find(s => s.id !== effDraft.id)!
    setBusy(true)
    const ok = await api.remove(effDraft.id)
    setBusy(false)
    if (ok) {
      if (isActive) onUse(next.id)
      selectSet(next)
    }
  }

  const btn = 'whitespace-nowrap px-2 py-1 text-xs rounded border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-40 disabled:hover:bg-transparent'

  return (
    <div className="fixed right-0 top-8 bottom-0 z-40 w-[600px] max-w-full bg-gray-900 border-l border-gray-700 shadow-2xl flex flex-col text-gray-200"
      onPointerDown={e => e.stopPropagation()}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <span className="text-sm font-semibold">Layer Manager</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-100 text-lg leading-none" title="Close">×</button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Set list */}
        <div className="w-40 shrink-0 border-r border-gray-800 flex flex-col">
          <div className="flex-1 overflow-y-auto py-1">
            {api.sets.map(s => (
              <button key={s.id} onClick={() => select(s.id)}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-1 ${
                  s.id === effDraft.id ? 'bg-blue-600/30 text-white' : 'text-gray-300 hover:bg-gray-800'}`}>
                <span className="truncate flex-1">{s.id === effDraft.id ? effDraft.name || '(unnamed)' : s.name}</span>
                {s.id === activeSetId && <span className="text-[9px] px-1 rounded bg-blue-600/60 text-white" title="Active set">active</span>}
              </button>
            ))}
            {api.loading && <p className="px-3 py-1.5 text-[11px] text-gray-500">Loading…</p>}
          </div>
          <div className="p-2 border-t border-gray-800 flex flex-col gap-1">
            {creating ? (
              <>
                <input autoFocus value={creating.name} placeholder="Set name"
                  onChange={e => setCreating({ ...creating, name: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') createSet(); if (e.key === 'Escape') setCreating(null) }}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500" />
                <div className="flex gap-1">
                  <button className={btn + ' flex-1'} disabled={busy || !creating.name.trim()} onClick={createSet}>Create</button>
                  <button className={btn} onClick={() => setCreating(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <div className="flex gap-1">
                <button className={btn + ' flex-1'} disabled={dirty}
                  onClick={() => setCreating({ name: '', from: null })}>New</button>
                <button className={btn + ' flex-1'} disabled={dirty || !hasSet}
                  onClick={() => setCreating({ name: `${effDraft.name} copy`, from: effDraft })}>Duplicate</button>
              </div>
            )}
          </div>
        </div>

        {/* Editor */}
        {hasSet ? (
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="px-3 pt-2 pb-2 border-b border-gray-800 flex flex-col gap-2">
            <div className="flex gap-1 items-center">
              <input value={effDraft.name}
                onChange={e => setDraft({ ...effDraft, name: e.target.value })}
                className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs font-medium focus:outline-none focus:border-blue-500" />
              <button className={btn} disabled={isActive || dirty} title={dirty ? 'Save first' : 'Use this set in every view'}
                onClick={() => onUse(effDraft.id)}>
                {isActive ? 'Active' : 'Use this set'}
              </button>
            </div>
            <div className="flex gap-1 items-center">
              {LAYER_VIEWS.map(v => (
                <button key={v.id} onClick={() => setView(v.id)}
                  className={`px-2.5 py-1 text-xs rounded ${view === v.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
                  {v.label}
                </button>
              ))}
              <span className="ml-auto flex gap-1">
                <button className={btn} onClick={() => setItem(items.map(i => i.id), { visible: true })}>Show all</button>
                <button className={btn} onClick={() => setItem(items.map(i => i.id), { visible: false })}>Hide all</button>
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-300">
              <ColorSwatch title="Background" value={vs.background}
                onChange={v => patchView(cur => ({ ...cur, background: v }))} />
              Background colour
            </div>
            {view === 'plan' && (
              <div className="flex items-center gap-2 text-xs text-gray-300">
                {CABINET_FILL_CLASSES.map(c => (
                  <span key={c.id} className="flex items-center gap-1">
                    <ColorSwatch title={`${c.label} cabinet fill`} value={vs.cabinetFill?.[c.id]}
                      onChange={v => patchView(cur => ({ ...cur, cabinetFill: { ...cur.cabinetFill, [c.id]: v } }))} />
                    {c.label}
                  </span>
                ))}
                <select value={vs.cabinetFillOpacity ?? 1} title="Cabinet fill opacity (fill only — the outline keeps its own opacity)"
                  onChange={e => patchView(cur => ({ ...cur, cabinetFillOpacity: Number(e.target.value) }))}
                  className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[11px] text-gray-300">
                  {OPACITY_OPTIONS.map(o => <option key={o} value={o}>{Math.round(o * 100)}%</option>)}
                </select>
                Cabinet fill
              </div>
            )}
            {view === 'elevation' && (
              <label className="flex items-center gap-1.5 text-xs text-gray-300">
                <input type="checkbox" checked={!!vs.lineDrawing}
                  onChange={e => patchView(v => ({ ...v, lineDrawing: e.target.checked }))} className="accent-blue-500" />
                Line drawing (outlines in part colours)
              </label>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2">
            {LAYER_GROUPS.map(g => {
              const gi = items.filter(i => i.group === g.id)
              if (!gi.length) return null
              const allOn = gi.every(i => effectiveSetting(vs, i.id, view).visible)
              return (
                <div key={g.id} className="mb-3">
                  <label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-gray-500 mb-1">
                    <input type="checkbox" checked={allOn}
                      onChange={e => setItem(gi.map(i => i.id), { visible: e.target.checked })} className="accent-blue-500" />
                    {g.label}
                  </label>
                  {gi.map(item => {
                    const st = effectiveSetting(vs, item.id, view)
                    return (
                      <div key={item.id} className="flex items-center gap-2 pl-5 py-0.5" title={item.hint}>
                        <label className="flex items-center gap-2 flex-1 min-w-0 text-xs text-gray-200">
                          <input type="checkbox" checked={st.visible}
                            onChange={e => setItem([item.id], { visible: e.target.checked })} className="accent-blue-500" />
                          <span className={`truncate ${st.visible ? '' : 'text-gray-500'}`}>{item.label}</span>
                        </label>
                        <ColorSwatch title={`${item.label} colour`} value={st.color} disabled={!st.visible}
                          onChange={v => setItem([item.id], { color: v })} />
                        {view !== '3d' && (
                          <select value={st.weight ?? 1} disabled={!st.visible} title="Line weight (text: size)"
                            onChange={e => setItem([item.id], { weight: Number(e.target.value) })}
                            className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[11px] text-gray-300 disabled:opacity-40">
                            {WEIGHT_OPTIONS.map(w => <option key={w} value={w}>{WEIGHT_LABEL[w]}</option>)}
                          </select>
                        )}
                        {(
                          <select value={st.opacity ?? 1} disabled={!st.visible} title="Opacity"
                            onChange={e => setItem([item.id], { opacity: Number(e.target.value) })}
                            className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[11px] text-gray-300 disabled:opacity-40">
                            {OPACITY_OPTIONS.map(o => <option key={o} value={o}>{Math.round(o * 100)}%</option>)}
                          </select>
                        )}
                        {(
                          <select value={st.style} disabled={!st.visible} title={view === '3d' ? 'Ghost = see-through' : 'Line style'}
                            onChange={e => setItem([item.id], { style: e.target.value as LayerStyle })}
                            className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[11px] text-gray-300 disabled:opacity-40">
                            {/* 3D has no line style: solid or see-through (ghost). */}
                            {STYLES.filter(s => view !== '3d' || s !== 'dashed').map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-gray-800 flex items-center gap-1">
            {confirmDelete ? (
              <>
                <span className="text-xs text-red-300 truncate">Delete “{stored.name}” for the whole shop?</span>
                <button className={btn + ' ml-auto border-red-700 text-red-300'} disabled={busy} onClick={deleteSet}>Delete</button>
                <button className={btn} onClick={() => setConfirmDelete(false)}>Cancel</button>
              </>
            ) : (
              <>
                <button className={btn + ' text-red-300'} disabled={busy || api.sets.length <= 1} onClick={() => setConfirmDelete(true)}>Delete</button>
                <span className="text-[11px] text-gray-500 ml-2 truncate">{api.error ?? notice ?? (dirty ? 'Unsaved changes' : '')}</span>
                <button className={btn + ' ml-auto'} disabled={!dirty} onClick={() => { setDraft(stored); setNotice(null) }}>Revert</button>
                <button className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
                  disabled={!dirty || busy} onClick={save}>Save</button>
              </>
            )}
          </div>
        </div>
        ) : (
          <div className="flex-1 p-4 text-xs text-gray-400">
            {api.loading ? 'Loading…' : (api.error ?? 'No layer sets yet — click New to create one.')}
          </div>
        )}
      </div>
    </div>
  )
}
