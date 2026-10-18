'use client'

// ── Fixtures & Appliances library ─────────────────────────────────────────────
// Spec: z_fixtures/FIXTURES-SPEC.md. Catalogue of bought-in items (appliances,
// sinks, taps, decorative) placed into jobs from the canvas (F6). Each row has
// an outside size, a mount type and an optional uploaded 3D model that is
// auto-fitted into that size.
//
// Uploaded model files are never deleted on replace / row delete — placed
// fixtures copy model_url into the job and keep pointing at the file.

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ThemeToggle } from '../../ThemeToggle'
import dynamic from 'next/dynamic'
import { supabase } from '@/src/lib/supabase'
import type { FixtureCatalogItem, FixtureCategory, FixtureMount, FixtureGroup } from '@/src/lib/types'
import FixtureIcon, { FixtureIconPicker } from '@/src/components/FixtureIcon'
import { confirmDelete } from '@/src/components/ConfirmDeleteModal'
import { modelFormatFromName, MODEL_ACCEPT } from '@/src/lib/modelFormat'
import { fitScale } from '@/src/lib/fixtureFit'
import { planShapePath } from '@/src/lib/fixturePlanShape'
import { traceShapes } from '@/src/lib/fixturePlanShapeLoad'

// three/drei loaders — client only.
const PreviewCanvas = dynamic(
  () => import('@/src/components/three/PartViewer').then(m => ({ default: m.PreviewCanvas })),
  { ssr: false },
)
const FixtureModel = dynamic(
  () => import('@/src/components/three/FixtureModel').then(m => ({ default: m.FixtureModel })),
  { ssr: false },
)

const TABLE  = 'fixture_catalog'
const GROUPS = 'fixture_groups'
/** Tab key for items with no category (group deleted, or not sorted yet). */
const OTHER = 'other'
const BUCKET = 'fixture-models'

// ── Config ────────────────────────────────────────────────────────────────────

const CATEGORIES: { key: FixtureCategory; label: string; mount: FixtureMount; size: [number, number, number]; kinds: string[]; sill?: number }[] = [
  { key: 'appliance',  label: 'Appliances', mount: 'floor',    size: [600, 600, 850],
    kinds: ['Oven', 'Cooktop', 'Dishwasher', 'Fridge', 'Rangehood', 'Microwave', 'Washing machine', 'Dryer'] },
  { key: 'sink',       label: 'Sinks',      mount: 'benchtop', size: [800, 450, 220],
    kinds: ['Kitchen sink', 'Laundry tub', 'Vanity basin', 'Bar sink'] },
  { key: 'tap',        label: 'Taps',       mount: 'benchtop', size: [60, 200, 350],
    kinds: ['Mixer', 'Pull-out mixer', 'Filter tap', 'Boiling water tap'] },
  { key: 'decorative', label: 'Decorative', mount: 'floor',    size: [400, 400, 800],
    kinds: ['Plant', 'Table', 'Stool', 'Chair', 'Bowl', 'Lamp'] },
  // P5: sit IN a wall — depth follows the wall thickness, mount_height = sill.
  { key: 'opening',    label: 'Doors & windows', mount: 'wall', size: [900, 100, 1200], sill: 900,
    kinds: ['Window', 'Door', 'Sliding door', 'Opening'] },
]

const MOUNTS: { key: FixtureMount; label: string; desc: string }[] = [
  { key: 'floor',       label: 'Floor',        desc: 'Stands on the floor (fridge, freestanding oven)' },
  { key: 'under_bench', label: 'Under bench',  desc: 'Fits under the benchtop (dishwasher, under-bench oven)' },
  { key: 'benchtop',    label: 'On benchtop',  desc: 'Sits on / drops into the benchtop (sink, cooktop, tap)' },
  { key: 'wall',        label: 'Wall',         desc: 'Hangs on the wall at the mount height (rangehood)' },
]

const ROT_STEPS = [0, 90, 180, 270]

// ── Component ─────────────────────────────────────────────────────────────────

async function fetchItems() {
  const [{ data, error }, { data: g, error: ge }] = await Promise.all([
    supabase.from(TABLE).select('*').order('sort_order').order('name'),
    supabase.from(GROUPS).select('*').order('sort_order').order('name'),
  ])
  return { rows: (data ?? []) as FixtureCatalogItem[], groups: (g ?? []) as FixtureGroup[], error: error?.message ?? ge?.message ?? null }
}

export default function FixturesLibraryClient({ embedded }: { embedded?: boolean }) {
  const [items,    setItems]    = useState<FixtureCatalogItem[]>([])
  const [groups,   setGroups]   = useState<FixtureGroup[]>([])
  const [grp,      setGrp]      = useState<string>(OTHER)
  /** Editing the active category (name / icon / type) instead of an item. */
  const [editGrp,  setEditGrp]  = useState(false)
  const [selId,    setSelId]    = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName,  setNewName]  = useState('')
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void fetchItems().then(r => {
      if (!live) return
      setItems(r.rows); setGroups(r.groups); setError(r.error)
      setGrp(g => g === OTHER && r.groups.length ? r.groups[0].id : g)
    })
    return () => { live = false }
  }, [])

  async function reload() {
    const r = await fetchItems()
    setItems(r.rows)
    setGroups(r.groups)
  }

  const group  = groups.find(g => g.id === grp) ?? null
  const inGrp  = (i: FixtureCatalogItem) => grp === OTHER ? !i.group_id || !groups.some(g => g.id === i.group_id) : i.group_id === grp
  const cat: FixtureCategory = group?.category ?? 'appliance'
  const catDef = CATEGORIES.find(c => c.key === cat)!
  const list   = items.filter(inGrp)
  const sel    = items.find(i => i.id === selId && inGrp(i)) ?? null
  const otherCount = items.filter(i => !i.group_id || !groups.some(g => g.id === i.group_id)).length
  const grpLabel = group?.name ?? 'Other'

  // Group the list by kind (unset kind last).
  const byKind = new Map<string, FixtureCatalogItem[]>()
  for (const i of list) {
    const k = i.kind?.trim() || 'Other'
    byKind.set(k, [...(byKind.get(k) ?? []), i])
  }
  const groupKeys = [...byKind.keys()].sort((a, b) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)))

  // ── Mutations ─────────────────────────────────────────────────────────────

  async function create() {
    const name = newName.trim()
    if (!name) return
    const [width, depth, height] = catDef.size
    const sort_order = Math.max(0, ...list.map(i => i.sort_order)) + 10
    const { data, error: e } = await supabase
      .from(TABLE)
      .insert({ name, category: cat, group_id: group?.id ?? null, mount: catDef.mount, width, depth, height, sort_order, ...(catDef.sill != null ? { mount_height: catDef.sill } : {}) })
      .select('*')
      .single()
    if (e) { setError(e.message); return }
    const row = data as FixtureCatalogItem
    setItems(prev => [...prev, row])
    setSelId(row.id)
    setNewName('')
    setCreating(false)
  }

  async function duplicate(src: FixtureCatalogItem) {
    const rest: Partial<FixtureCatalogItem> = { ...src }
    delete rest.id; delete rest.created_at; delete rest.updated_at
    const { data, error: e } = await supabase
      .from(TABLE)
      .insert({ ...rest, name: `${src.name} (copy)`, sort_order: src.sort_order + 1 })
      .select('*')
      .single()
    if (e) { setError(e.message); return }
    const row = data as FixtureCatalogItem
    setItems(prev => [...prev, row])
    setSelId(row.id)
  }

  async function del(i: FixtureCatalogItem) {
    const ok = await confirmDelete({
      title: 'Delete Fixture',
      message: `Delete "${i.name}" from the library? Fixtures already placed in jobs keep their copy.`,
    })
    if (!ok) return
    const { error: e } = await supabase.from(TABLE).delete().eq('id', i.id)
    if (e) { setError(e.message); return }
    if (selId === i.id) setSelId(null)
    setItems(prev => prev.filter(x => x.id !== i.id))
  }

  async function patch(id: string, updates: Partial<FixtureCatalogItem>) {
    setItems(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p))   // optimistic
    const { data, error: e } = await supabase
      .from(TABLE)
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single()
    if (e) { setError(e.message); await reload(); return }
    setError(null)
    const row = data as FixtureCatalogItem
    setItems(prev => prev.map(p => p.id === id ? row : p))
  }

  // ── Categories (fixture_groups, P6) ────────────────────────────────────────

  async function addGroup() {
    const sort_order = Math.max(0, ...groups.map(g => g.sort_order)) + 10
    const { data, error: e } = await supabase.from(GROUPS)
      .insert({ name: 'New category', icon: 'Box', category: 'appliance', sort_order }).select('*').single()
    if (e) { setError(e.message); return }
    const g = data as FixtureGroup
    setGroups(prev => [...prev, g])
    setGrp(g.id); setSelId(null); setCreating(false); setEditGrp(true)
  }

  async function patchGroup(id: string, updates: Partial<FixtureGroup>) {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g))
    const { error: e } = await supabase.from(GROUPS).update(updates).eq('id', id)
    if (e) { setError(e.message); await reload() }
  }

  /** Swap with the neighbour (dir −1 = left). */
  async function moveGroup(id: string, dir: -1 | 1) {
    const i = groups.findIndex(g => g.id === id), j = i + dir
    if (i < 0 || j < 0 || j >= groups.length) return
    const a = groups[i], b = groups[j]
    const next = [...groups]; next[i] = { ...b, sort_order: a.sort_order }; next[j] = { ...a, sort_order: b.sort_order }
    setGroups(next)
    await Promise.all([
      supabase.from(GROUPS).update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from(GROUPS).update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
  }

  async function deleteGroup(g: FixtureGroup) {
    const n = items.filter(i => i.group_id === g.id).length
    const ok = await confirmDelete({
      title: 'Delete Category',
      message: n ? `Delete "${g.name}"? Its ${n} item${n > 1 ? 's' : ''} move to Other.` : `Delete "${g.name}"?`,
    })
    if (!ok) return
    const { error: e } = await supabase.from(GROUPS).delete().eq('id', g.id)
    if (e) { setError(e.message); return }
    setGroups(prev => prev.filter(x => x.id !== g.id))
    setItems(prev => prev.map(i => i.group_id === g.id ? { ...i, group_id: null } : i))
    setGrp(groups.find(x => x.id !== g.id)?.id ?? OTHER); setEditGrp(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={embedded ? 'flex flex-col flex-1 overflow-hidden' : 'h-screen bg-canvas text-ink flex flex-col overflow-hidden'}>
      {!embedded && (
        <div className="flex-none border-b border-edge px-6 py-3 flex items-center gap-3">
          <ThemeToggle />
          <Link href="/" className="text-ink-subtle hover:text-ink-muted text-sm transition-colors">← Projects</Link>
          <span className="text-ink-subtle">|</span>
          <span className="text-sm font-semibold text-ink">Fixtures & Appliances</span>
        </div>
      )}

      {/* Category tabs — the user's categories (fixture_groups), each with its icon */}
      <div className="flex-none flex items-center gap-0.5 px-4 border-b border-edge overflow-x-auto">
        {[...groups.map(g => ({ key: g.id, label: g.name, icon: g.icon })), ...(otherCount ? [{ key: OTHER, label: 'Other', icon: 'Package' }] : [])].map(c => {
          const n = c.key === OTHER ? otherCount : items.filter(i => i.group_id === c.key).length
          const active = c.key === grp
          return (
            <button
              key={c.key}
              onClick={() => { setGrp(c.key); setCreating(false); setEditGrp(false) }}
              className={`flex items-center gap-1.5 px-2.5 py-2.5 text-xs border-b-2 -mb-px whitespace-nowrap transition-colors ${
                active ? 'border-accent text-accent-ink' : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              <FixtureIcon name={c.icon} size={14} />
              {c.label}<span className="text-[10px] text-ink-subtle">{n}</span>
            </button>
          )
        })}
        <button onClick={addGroup} title="Add a category"
          className="px-2.5 py-2.5 text-xs text-ink-subtle hover:text-accent-ink whitespace-nowrap">+ Category</button>
        {error && <span className="ml-auto text-[11px] text-red-400 truncate">{error}</span>}
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: items grouped by kind ─────────────────────────────────── */}
        <aside className="w-64 flex-none border-r border-edge flex flex-col overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-edge">
            <span className="flex items-center gap-1.5 min-w-0 text-xs font-semibold text-ink-muted uppercase tracking-wider">
              <FixtureIcon name={group?.icon ?? 'Package'} size={14} />
              <span className="truncate">{grpLabel}</span>
              {group && (
                <button onClick={() => { setEditGrp(true); setSelId(null) }} title="Edit this category (name, icon, type)"
                  className="text-ink-subtle hover:text-accent-ink normal-case font-normal">✎</button>
              )}
            </span>
            <button
              onClick={() => { setCreating(true); setNewName(''); setEditGrp(false) }}
              className="text-xs text-accent-ink hover:text-accent-ink transition-colors"
            >+ New</button>
          </div>

          {creating && (
            <div className="px-3 py-2 flex gap-2 border-b border-edge">
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setCreating(false) }}
                placeholder="Name…"
                className="flex-1 min-w-0 bg-surface-2 border border-edge-strong rounded px-2 py-1 text-xs text-ink focus:outline-none focus:border-accent"
              />
              <button onClick={create} className="text-xs text-accent-ink">✓</button>
              <button onClick={() => setCreating(false)} className="text-xs text-ink-subtle hover:text-ink-muted">✕</button>
            </div>
          )}

          {groupKeys.map(k => (
            <div key={k} className="border-b border-edge pb-1">
              <div className="px-4 pt-2 pb-1 text-[10px] text-ink-subtle uppercase tracking-wide">{k}</div>
              {byKind.get(k)!.map(i => (
                <div
                  key={i.id}
                  onClick={() => { setSelId(i.id); setEditGrp(false) }}
                  className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
                    selId === i.id ? 'bg-accent/10 text-accent-ink' : 'text-ink-muted hover:bg-surface-2/60'
                  }`}
                >
                  <span className="flex-1 text-xs truncate">{i.name}</span>
                  <span className="text-[9px] text-ink-subtle font-mono shrink-0">{i.width}×{i.depth}</span>
                  {i.model_url && <span className="text-[9px] bg-sky-900/30 text-sky-400 px-1 py-0.5 rounded shrink-0">3D</span>}
                  {!i.active && <span className="text-[9px] text-ink-subtle shrink-0">inactive</span>}
                  <button
                    onClick={e => { e.stopPropagation(); duplicate(i) }}
                    className="opacity-0 group-hover:opacity-100 text-ink-subtle hover:text-ink transition-all text-xs px-0.5"
                    title="Duplicate"
                  >⧉</button>
                  <button
                    onClick={e => { e.stopPropagation(); del(i) }}
                    className="opacity-0 group-hover:opacity-100 text-ink-subtle hover:text-red-400 transition-all text-xs px-0.5"
                    title="Delete"
                  >✕</button>
                </div>
              ))}
            </div>
          ))}
          {list.length === 0 && !creating && (
            <p className="px-4 py-3 text-[10px] text-ink-subtle">No {grpLabel.toLowerCase()} yet.</p>
          )}
        </aside>

        {/* ── Right: editor ───────────────────────────────────────────────── */}
        {editGrp && group ? (
          <GroupEditor key={group.id} group={group} itemCount={items.filter(i => i.group_id === group.id).length}
            first={groups[0]?.id === group.id} last={groups[groups.length - 1]?.id === group.id}
            onPatch={u => patchGroup(group.id, u)} onMove={d => moveGroup(group.id, d)}
            onDelete={() => deleteGroup(group)} onDone={() => setEditGrp(false)} />
        ) : !sel ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-ink-subtle">Select or create an item in {grpLabel}</p>
          </div>
        ) : (
          <FixtureEditor key={sel.id} item={sel} kinds={catDef.kinds} groups={groups} onPatch={u => patch(sel.id, u)} onError={setError} />
        )}
      </div>
    </div>
  )
}

// ── Category editor (P6) ──────────────────────────────────────────────────────

const TYPE_LABEL: Record<FixtureCategory, string> = {
  appliance:  'Appliance — stands on the floor, under the bench or on the wall',
  sink:       'Sink — drops into the benchtop and cuts it',
  tap:        'Tap — sits on the benchtop',
  decorative: 'Decorative — furniture, plants, lamps',
  opening:    'Door / window — sits in a wall and cuts it',
}

function GroupEditor({ group, itemCount, first, last, onPatch, onMove, onDelete, onDone }: {
  group: FixtureGroup; itemCount: number; first: boolean; last: boolean
  onPatch: (u: Partial<FixtureGroup>) => void; onMove: (dir: -1 | 1) => void
  onDelete: () => void; onDone: () => void
}) {
  const [name, setName] = useState(group.name)
  const btn = 'px-2.5 py-1 rounded border border-edge-strong text-xs text-ink-muted hover:bg-surface-2 disabled:opacity-40'
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-xl space-y-5">
        <div className="flex items-center gap-2">
          <FixtureIcon name={group.icon} size={20} className="text-accent-ink" />
          <input value={name} onChange={e => setName(e.target.value)}
            onBlur={() => { const v = name.trim(); if (v && v !== group.name) onPatch({ name: v }) }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className={`${inp} flex-1 text-sm`} />
          <button onClick={onDone} className={btn}>Done</button>
        </div>

        <div>
          <label className={lbl}>Icon</label>
          <FixtureIconPicker value={group.icon} onPick={icon => onPatch({ icon })} />
        </div>

        <div>
          <label className={lbl}>Type</label>
          <select value={group.category} disabled={itemCount > 0}
            onChange={e => onPatch({ category: e.target.value as FixtureCategory })}
            className={`${inp} w-full disabled:opacity-60`}>
            {(Object.keys(TYPE_LABEL) as FixtureCategory[]).map(k => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}
          </select>
          <p className="text-[10px] text-ink-subtle mt-1">
            {itemCount > 0
              ? `Fixed while the category has items (${itemCount}) — it decides how they behave when placed.`
              : 'Decides how items in this category behave when placed.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => onMove(-1)} disabled={first} className={btn}>← Move left</button>
          <button onClick={() => onMove(1)} disabled={last} className={btn}>Move right →</button>
          <button onClick={onDelete} className="ml-auto px-2.5 py-1 rounded border border-red-800 text-xs text-red-400 hover:bg-red-950/40">Delete category</button>
        </div>
      </div>
    </div>
  )
}

// ── Editor ────────────────────────────────────────────────────────────────────

const inp = 'bg-surface-2 border border-edge-strong rounded px-2 py-1.5 text-xs text-ink focus:outline-none focus:border-accent'
const lbl = 'text-[10px] text-ink-subtle uppercase tracking-wide mb-1 block'

function FixtureEditor({ item, kinds, groups, onPatch, onError }: {
  item:    FixtureCatalogItem
  kinds:   string[]
  /** Categories (P6) — the item can move to any category of its own type. */
  groups:  FixtureGroup[]
  onPatch: (u: Partial<FixtureCatalogItem>) => void
  onError: (msg: string | null) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [native,    setNative]    = useState<{ x: number; y: number; z: number } | null>(null)
  const [tracing,   setTracing]   = useState(false)

  // ── Plan shape (P8): traced from the model whenever it or its fit changes
  // (and the first time an item with a model but no shape is opened). ──
  const fitKey = [item.model_url, item.model_format, item.model_scale, item.model_rot_x, item.model_rot_y,
    item.model_off_x, item.model_off_y, item.model_off_z, item.width, item.depth, item.height].join('|')
  const tracedKey = useRef<string | null>(item.plan_shape && item.elev_shape ? fitKey : null)
  useEffect(() => {
    if (!item.model_url) { tracedKey.current = fitKey; return }
    if (tracedKey.current === fitKey) return
    let live = true
    const t = setTimeout(() => { void retrace(() => live) }, 500)
    return () => { live = false; clearTimeout(t) }
  }, [fitKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function retrace(alive: () => boolean = () => true) {
    const key = fitKey
    setTracing(true)
    try {
      const shapes = await traceShapes(item)
      if (!alive()) return
      tracedKey.current = key
      onPatch(shapes)
      // Placed copies of this item with the same model get the drawings too (they're
      // derived from the model, not a spec change).
      if (item.model_url) {
        await supabase.from('room_fixtures').update(shapes)
          .eq('catalog_id', item.id).eq('model_url', item.model_url)
      }
    } catch (e) {
      if (alive()) onError(`Plan shape: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      if (alive()) setTracing(false)
    }
  }


  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const format = modelFormatFromName(file.name)
    if (!format) { onError(`Unsupported format: ${file.name}. Accepted: .glb .stl .obj`); return }
    setUploading(true)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${item.id}/${Date.now()}-${safeName}`
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, cacheControl: '3600', contentType: 'application/octet-stream' })
    setUploading(false)
    if (upErr) { onError(`Upload failed: ${upErr.message}`); return }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
    // New model → reset the fit so the auto-fit starts clean.
    onPatch({
      model_url: pub.publicUrl, model_format: format,
      model_scale: 1, model_rot_x: 0, model_rot_y: 0, model_off_x: 0, model_off_y: 0, model_off_z: 0,
    })
  }

  // Scale that makes the model fill the item box without exceeding any side.
  function fitToSize() {
    if (!native) return
    const s = fitScale(native, item)
    if (s) onPatch({ model_scale: round(s, 6), model_off_x: 0, model_off_y: 0, model_off_z: 0 })
  }

  // Item size from the model at its current scale (for correctly-sized exports).
  function sizeFromModel() {
    if (!native) return
    const s = item.model_scale || 1
    onPatch({ width: round(native.x * s, 1), height: round(native.y * s, 1), depth: round(native.z * s, 1) })
  }

  const w = Number(item.width) || 1, h = Number(item.height) || 1, d = Number(item.depth) || 1

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="flex gap-8 items-start">

        {/* ── Fields ─────────────────────────────────────────────────────── */}
        <div className="flex-1 max-w-md space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Name</label>
              <TextField value={item.name} onCommit={v => v.trim() && onPatch({ name: v.trim() })} className={`${inp} w-full`} />
            </div>
            <div title="Only categories of the same type — the type decides how the item behaves">
              <label className={lbl}>Category</label>
              <select value={item.group_id ?? ''} onChange={ev => onPatch({ group_id: ev.target.value || null })} className={`${inp} w-full`}>
                {groups.filter(g => g.category === item.category).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                <option value="">Other</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Kind</label>
              <TextField value={item.kind ?? ''} list="fixture-kinds" onCommit={v => onPatch({ kind: v.trim() || null })} className={`${inp} w-full`} />
              <datalist id="fixture-kinds">{kinds.map(k => <option key={k} value={k} />)}</datalist>
            </div>
            <div>
              <label className={lbl}>Brand</label>
              <TextField value={item.brand ?? ''} onCommit={v => onPatch({ brand: v.trim() || null })} className={`${inp} w-full`} />
            </div>
            <div className="col-span-2">
              <label className={lbl}>Model number</label>
              <TextField value={item.model_no ?? ''} onCommit={v => onPatch({ model_no: v.trim() || null })} className={`${inp} w-full font-mono`} />
            </div>
          </div>

          <div>
            <label className={lbl}>Outside size (mm)</label>
            <div className="flex gap-3">
              <NumField label="Width"  value={item.width}  onCommit={v => v > 0 && onPatch({ width: v })} />
              {item.category !== 'opening' && <NumField label="Depth"  value={item.depth}  onCommit={v => v > 0 && onPatch({ depth: v })} />}
              <NumField label="Height" value={item.height} onCommit={v => v > 0 && onPatch({ height: v })} />
            </div>
            {item.category === 'opening' && (
              <p className="text-[10px] text-ink-subtle mt-1">The opening in the wall (frame outside). Depth follows the wall it&apos;s placed in.</p>
            )}
          </div>

          {item.category === 'opening' ? (
            <div>
              <NumField label="Sill height from floor" value={item.mount_height ?? 0}
                onCommit={v => onPatch({ mount_height: Math.max(0, v), mount: 'wall' })} />
              <p className="text-[10px] text-ink-subtle mt-1">0 for doors and floor-level openings.</p>
            </div>
          ) : <>
          <div>
            <label className={lbl}>Mount</label>
            <div className="grid grid-cols-2 gap-1.5">
              {MOUNTS.map(m => (
                <button
                  key={m.key}
                  onClick={() => onPatch({ mount: m.key })}
                  title={m.desc}
                  className={`text-left px-2.5 py-1.5 rounded border text-xs transition-colors ${
                    item.mount === m.key ? 'border-accent bg-accent/10 text-accent-ink' : 'border-edge-strong text-ink-muted hover:bg-surface-2'
                  }`}
                >{m.label}</button>
              ))}
            </div>
            <p className="text-[10px] text-ink-subtle mt-1">{MOUNTS.find(m => m.key === item.mount)?.desc}</p>
            {item.mount === 'wall' && (
              <div className="mt-2">
                <NumField label="Underside height from floor" value={item.mount_height ?? 0}
                  onCommit={v => onPatch({ mount_height: v })} />
              </div>
            )}
            {item.mount === 'benchtop' && (
              <div className="mt-2 flex items-end gap-3">
                <NumField label="Drops below top" value={item.bench_drop ?? 0}
                  onCommit={v => onPatch({ bench_drop: Math.max(0, v) })} />
                <p className="text-[10px] text-ink-subtle pb-1.5">
                  Underside sits this far under the benchtop top — the bowl depth for a sink, 0 for a tap.
                </p>
              </div>
            )}
          </div>

          {/* ── Benchtop cutout template (z_fixtures P3) ── */}
          <div>
            <label className={lbl}>Benchtop cutout</label>
            <div className="flex gap-1.5">
              {([[null, 'None'], ['rect', 'Rectangle'], ['round', 'Round']] as const).map(([k, label]) => (
                <button
                  key={label}
                  onClick={() => onPatch(k && !item.cutout_shape && !(item.cutout_w > 0)
                    ? { cutout_shape: k, cutout_w: Math.max(0, item.width - 20), cutout_d: k === 'rect' ? Math.max(0, item.depth - 20) : item.cutout_d }
                    : { cutout_shape: k })}
                  className={`px-2.5 py-1 rounded border text-xs transition-colors ${
                    (item.cutout_shape ?? null) === k ? 'border-accent bg-accent/10 text-accent-ink' : 'border-edge-strong text-ink-muted hover:bg-surface-2'
                  }`}
                >{label}</button>
              ))}
            </div>
            {item.cutout_shape && (
              <>
                <div className="flex gap-3 mt-2">
                  {item.cutout_shape === 'round'
                    ? <NumField label="Diameter" value={item.cutout_w} onCommit={v => v > 0 && onPatch({ cutout_w: v })} />
                    : <>
                        <NumField label="Width"  value={item.cutout_w} onCommit={v => v > 0 && onPatch({ cutout_w: v })} />
                        <NumField label="Depth"  value={item.cutout_d} onCommit={v => v > 0 && onPatch({ cutout_d: v })} />
                        <NumField label="Corner radius" value={item.cutout_radius} onCommit={v => onPatch({ cutout_radius: Math.max(0, v) })} />
                      </>}
                </div>
                <div className="flex gap-3 mt-2">
                  <NumField label="Offset right" value={item.cutout_off_x} onCommit={v => onPatch({ cutout_off_x: v })} />
                  <NumField label="Offset forward" value={item.cutout_off_y} onCommit={v => onPatch({ cutout_off_y: v })} />
                </div>
                <label className="flex items-center gap-2 text-xs text-ink-muted mt-2 cursor-pointer">
                  <input type="checkbox" checked={item.cut_benchtop ?? true} onChange={e => onPatch({ cut_benchtop: e.target.checked })} />
                  Cut benchtop (default for new placements)
                </label>
                <p className="text-[10px] text-ink-subtle mt-1">
                  From the maker&apos;s cutout template. Centred on the item unless offset (looking at its front).
                  Cut into whichever benchtop is under it. Sizes can be overridden per placement in the job.
                </p>
              </>
            )}
          </div>
          </>}

          <div className="flex gap-6 items-end">
            <div>
              <label className={lbl}>Colour</label>
              <input
                type="color"
                value={item.colour ?? '#cbd5e1'}
                onChange={e => onPatch({ colour: e.target.value })}
                className="w-10 h-7 bg-transparent border border-edge-strong rounded cursor-pointer"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-ink-muted pb-1 cursor-pointer">
              <input type="checkbox" checked={item.active} onChange={e => onPatch({ active: e.target.checked })} />
              Active (shown in the F6 picker)
            </label>
          </div>

          <div>
            <label className={lbl}>Notes</label>
            <TextField value={item.notes ?? ''} multiline onCommit={v => onPatch({ notes: v.trim() || null })} className={`${inp} w-full h-16 resize-none`} />
          </div>
        </div>

        {/* ── 3D model ───────────────────────────────────────────────────── */}
        <div className="w-[380px] flex-none space-y-3">
          <div className="flex items-center gap-2">
            <span className={`${lbl} mb-0`}>3D model</span>
            <span className="text-[10px] text-ink-subtle">{item.model_format ? item.model_format.toUpperCase() : 'none — shows as a box'}</span>
          </div>

          <div className="w-[380px] h-[300px] border border-edge-strong rounded overflow-hidden bg-[#111827]">
            <PreviewCanvas dx={w} dy={h} dz={d} bgColor="#111827">
              <group position={[-w / 2, -h / 2, -d / 2]}>
                <FixtureModel f={item} onNativeSize={setNative} outline={!!item.model_url} />
              </group>
            </PreviewCanvas>
          </div>

          <div className="flex items-center gap-2">
            <label className="px-2.5 py-1 bg-accent hover:bg-accent-hover text-white text-xs rounded cursor-pointer whitespace-nowrap">
              {uploading ? 'Uploading…' : item.model_url ? 'Replace' : 'Upload model'}
              <input type="file" accept={MODEL_ACCEPT} onChange={handleFile} disabled={uploading} className="hidden" />
            </label>
            {item.model_url && (
              <button
                onClick={() => onPatch({ model_url: null, model_format: null })}
                className="px-2.5 py-1 bg-surface-3 text-ink-muted text-xs rounded"
              >Remove</button>
            )}
            <span className="text-[10px] text-ink-subtle">.glb (best) · .stl · .obj</span>
          </div>

          {item.model_url && (<>
            <div className="grid grid-cols-2 gap-3">
              <RotPicker label="Tip (X)" value={item.model_rot_x} onPick={v => onPatch({ model_rot_x: v })}
                hint="Use 270 for models exported Z-up (SketchUp, many CAD tools)" />
              <RotPicker label="Turn (Y)" value={item.model_rot_y} onPick={v => onPatch({ model_rot_y: v })}
                hint="Turn until the front of the model faces the front of the box" />
            </div>

            <div className="flex items-end gap-2">
              <NumField label="Scale" value={item.model_scale} step="0.001" onCommit={v => v > 0 && onPatch({ model_scale: v })} />
              <button onClick={fitToSize} disabled={!native}
                className="px-2.5 py-1.5 bg-surface-3 hover:bg-surface-2 text-ink-muted text-xs rounded disabled:opacity-40"
                title="Scale the model to fit inside the outside size">Fit to size</button>
              <button onClick={sizeFromModel} disabled={!native}
                className="px-2.5 py-1.5 bg-surface-3 hover:bg-surface-2 text-ink-muted text-xs rounded disabled:opacity-40"
                title="Set width / depth / height from the model at this scale">Size from model</button>
            </div>
            {native && (
              <p className="text-[10px] text-ink-subtle font-mono">
                Model at this scale: {fmt(native.x * item.model_scale)} W × {fmt(native.z * item.model_scale)} D × {fmt(native.y * item.model_scale)} H
              </p>
            )}
            {/* P11: the model follows width / depth when a placement is stretched. */}
            <label className="flex items-center gap-2 text-xs text-ink-muted cursor-pointer">
              <input type="checkbox" checked={!!item.resizable} onChange={e => {
                onPatch({ resizable: e.target.checked })
                if (e.target.checked && !item.stretch && item.model_url) void retrace()
              }} />
              Resizable (model stretches with the item)
            </label>
            {item.resizable && (
              <p className="text-[10px] text-ink-subtle">
                {item.stretch
                  ? 'Model has stretch bands — bowls, clips and cutout keep their shape. Height doesn’t stretch.'
                  : 'No stretch bands in this model — it scales to fill the width / depth.'}
              </p>
            )}
            {/* Blender / most glTF exporters write metres — at scale 1 a 600 mm oven
                is 0.6 mm and invisible. Offer the fix instead of guessing silently. */}
            {native && Number(item.model_scale) === 1 && Math.max(native.x, native.y, native.z) < 5 && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-amber-600/50 bg-amber-900/20 text-[11px] text-amber-300">
                <span className="flex-1">
                  This model looks like it&apos;s in metres ({round(native.x, 3)} × {round(native.z, 3)} × {round(native.y, 3)} m) — it&apos;s too small to see.
                </span>
                <button
                  onClick={() => onPatch({
                    model_scale: 1000, model_off_x: 0, model_off_y: 0, model_off_z: 0,
                    width: round(native.x * 1000, 1), depth: round(native.z * 1000, 1), height: round(native.y * 1000, 1),
                  })}
                  className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white whitespace-nowrap"
                  title="Scale ×1000 and set the size from the model"
                >Convert to mm</button>
              </div>
            )}

            <div className="flex gap-3">
              <NumField label="Nudge X" value={item.model_off_x} onCommit={v => onPatch({ model_off_x: v })} />
              <NumField label="Nudge Y" value={item.model_off_y} onCommit={v => onPatch({ model_off_y: v })} />
              <NumField label="Nudge Z" value={item.model_off_z} onCommit={v => onPatch({ model_off_z: v })} />
            </div>
            <p className="text-[10px] text-ink-subtle leading-snug">
              The model is centred in the box and stood on its base automatically. X = right,
              Y = up, Z = toward the front. A model in metres needs scale 1000; inches 25.4.
            </p>

            {/* Plan shape (P8) — what plan view draws instead of the box + symbol */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`${lbl} mb-0`}>Plan + front shape</span>
                <span className="text-[10px] text-ink-subtle">{tracing ? 'tracing…' : item.plan_shape?.lines.length ? 'traced from the model' : 'none'}</span>
                <button onClick={() => void retrace()} disabled={tracing}
                  className="ml-auto px-2 py-0.5 bg-surface-3 hover:bg-surface-2 text-ink-muted text-[11px] rounded disabled:opacity-40"
                  title="Trace the plan drawing from the model again">Re-trace</button>
              </div>
              <div className="border border-edge-strong rounded bg-[#030712] p-2">
                <svg viewBox={`-10 -10 ${w + 20} ${d + 20}`} className="w-full" style={{ maxHeight: 180 }}>
                  <rect x={0} y={0} width={w} height={d} fill="none" stroke="#334155" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
                  {item.plan_shape && (
                    <path d={planShapePath(item.plan_shape, w, d)} fill="none" stroke="#0ea5e9" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
                  )}
                  <line x1={0} y1={d} x2={w} y2={d} stroke="#64748b" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                </svg>
              </div>
              <div className="border border-edge-strong rounded bg-[#030712] p-2 mt-1.5">
                <svg viewBox={`-10 -10 ${w + 20} ${h + 20}`} className="w-full" style={{ maxHeight: 180 }}>
                  <rect x={0} y={0} width={w} height={h} fill="none" stroke="#334155" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
                  {item.elev_shape && (
                    <path d={planShapePath(item.elev_shape, w, h)} fill="none" stroke="#0ea5e9" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
                  )}
                </svg>
              </div>
              <p className="text-[10px] text-ink-subtle mt-1">Top: seen from above, front at the bottom. Bottom: seen from the front. Update when the model or its fit changes.</p>
            </div>
          </>)}
        </div>
      </div>
    </div>
  )
}

// ── Small pieces ──────────────────────────────────────────────────────────────

function round(v: number, dp: number) { const f = 10 ** dp; return Math.round(v * f) / f }
function fmt(v: number) { return String(round(v, 1)) }


function TextField({ value, onCommit, className, list, multiline }: {
  value: string; onCommit: (v: string) => void; className: string; list?: string; multiline?: boolean
}) {
  const [v, setV] = useState(value)
  // Re-sync when the saved value changes (adjust-during-render, not an effect).
  const [seen, setSeen] = useState(value)
  if (seen !== value) { setSeen(value); setV(value) }
  const commit = () => { if (v !== value) onCommit(v) }
  return multiline ? (
    <textarea value={v} onChange={e => setV(e.target.value)} onBlur={commit} className={className} />
  ) : (
    <input value={v} list={list} onChange={e => setV(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} className={className} />
  )
}

function NumField({ label, value, onCommit, step = '1' }: {
  label: string; value: number; onCommit: (v: number) => void; step?: string
}) {
  const [v, setV] = useState(String(value))
  const [seen, setSeen] = useState(value)
  if (seen !== value) { setSeen(value); setV(String(value)) }
  const commit = () => {
    const n = Number(v)
    if (v.trim() === '' || !isFinite(n)) { setV(String(value)); return }
    if (n !== Number(value)) onCommit(n)
  }
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-ink-subtle mb-0.5">{label}</span>
      <input
        type="number" step={step} value={v}
        onChange={e => setV(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        onFocus={e => e.target.select()}
        className={`${inp} w-24 text-right font-mono`}
      />
    </div>
  )
}

function RotPicker({ label, value, onPick, hint }: {
  label: string; value: number; onPick: (v: number) => void; hint: string
}) {
  return (
    <div title={hint}>
      <span className="text-[10px] text-ink-subtle mb-0.5 block">{label}</span>
      <div className="flex">
        {ROT_STEPS.map(r => (
          <button key={r} onClick={() => onPick(r)}
            className={`flex-1 px-1 py-1 text-[11px] border border-edge-strong first:rounded-l last:rounded-r -ml-px first:ml-0 ${
              Number(value) === r ? 'bg-accent/15 text-accent-ink border-accent' : 'text-ink-muted hover:bg-surface-2'
            }`}
          >{r}°</button>
        ))}
      </div>
    </div>
  )
}
