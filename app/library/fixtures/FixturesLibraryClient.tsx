'use client'

// ── Fixtures & Appliances library ─────────────────────────────────────────────
// Spec: z_fixtures/FIXTURES-SPEC.md. Catalogue of bought-in items (appliances,
// sinks, taps, decorative) placed into jobs from the canvas (F6). Each row has
// an outside size, a mount type and an optional uploaded 3D model that is
// auto-fitted into that size.
//
// Uploaded model files are never deleted on replace / row delete — placed
// fixtures copy model_url into the job and keep pointing at the file.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ThemeToggle } from '../../ThemeToggle'
import dynamic from 'next/dynamic'
import { supabase } from '@/src/lib/supabase'
import type { FixtureCatalogItem, FixtureCategory, FixtureMount } from '@/src/lib/types'
import { confirmDelete } from '@/src/components/ConfirmDeleteModal'
import { modelFormatFromName, MODEL_ACCEPT } from '@/src/lib/modelFormat'
import { fitScale } from '@/src/lib/fixtureFit'

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
  const { data, error } = await supabase.from(TABLE).select('*').order('sort_order').order('name')
  return { rows: (data ?? []) as FixtureCatalogItem[], error: error?.message ?? null }
}

export default function FixturesLibraryClient({ embedded }: { embedded?: boolean }) {
  const [items,    setItems]    = useState<FixtureCatalogItem[]>([])
  const [cat,      setCat]      = useState<FixtureCategory>('appliance')
  const [selId,    setSelId]    = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName,  setNewName]  = useState('')
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void fetchItems().then(r => { if (live) { setItems(r.rows); setError(r.error) } })
    return () => { live = false }
  }, [])

  async function reload() {
    const r = await fetchItems()
    setItems(r.rows)
  }

  const catDef = CATEGORIES.find(c => c.key === cat)!
  const list   = items.filter(i => i.category === cat)
  const sel    = items.find(i => i.id === selId && i.category === cat) ?? null

  // Group the list by kind (unset kind last).
  const groups = new Map<string, FixtureCatalogItem[]>()
  for (const i of list) {
    const k = i.kind?.trim() || 'Other'
    groups.set(k, [...(groups.get(k) ?? []), i])
  }
  const groupKeys = [...groups.keys()].sort((a, b) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)))

  // ── Mutations ─────────────────────────────────────────────────────────────

  async function create() {
    const name = newName.trim()
    if (!name) return
    const [width, depth, height] = catDef.size
    const sort_order = Math.max(0, ...list.map(i => i.sort_order)) + 10
    const { data, error: e } = await supabase
      .from(TABLE)
      .insert({ name, category: cat, mount: catDef.mount, width, depth, height, sort_order, ...(catDef.sill != null ? { mount_height: catDef.sill } : {}) })
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

      {/* Category tabs */}
      <div className="flex-none flex items-center gap-1 px-4 border-b border-edge">
        {CATEGORIES.map(c => {
          const n = items.filter(i => i.category === c.key).length
          const active = c.key === cat
          return (
            <button
              key={c.key}
              onClick={() => { setCat(c.key); setCreating(false) }}
              className={`px-3 py-2.5 text-xs border-b-2 -mb-px transition-colors ${
                active ? 'border-accent text-accent-ink' : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {c.label}<span className="ml-1.5 text-[10px] text-ink-subtle">{n}</span>
            </button>
          )
        })}
        {error && <span className="ml-auto text-[11px] text-red-400 truncate">{error}</span>}
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: items grouped by kind ─────────────────────────────────── */}
        <aside className="w-64 flex-none border-r border-edge flex flex-col overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-edge">
            <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">{catDef.label}</span>
            <button
              onClick={() => { setCreating(true); setNewName('') }}
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
              {groups.get(k)!.map(i => (
                <div
                  key={i.id}
                  onClick={() => setSelId(i.id)}
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
            <p className="px-4 py-3 text-[10px] text-ink-subtle">No {catDef.label.toLowerCase()} yet.</p>
          )}
        </aside>

        {/* ── Right: editor ───────────────────────────────────────────────── */}
        {!sel ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-ink-subtle">Select or create a {catDef.label.toLowerCase().replace(/s$/, '')}</p>
          </div>
        ) : (
          <FixtureEditor key={sel.id} item={sel} kinds={catDef.kinds} onPatch={u => patch(sel.id, u)} onError={setError} />
        )}
      </div>
    </div>
  )
}

// ── Editor ────────────────────────────────────────────────────────────────────

const inp = 'bg-surface-2 border border-edge-strong rounded px-2 py-1.5 text-xs text-ink focus:outline-none focus:border-accent'
const lbl = 'text-[10px] text-ink-subtle uppercase tracking-wide mb-1 block'

function FixtureEditor({ item, kinds, onPatch, onError }: {
  item:    FixtureCatalogItem
  kinds:   string[]
  onPatch: (u: Partial<FixtureCatalogItem>) => void
  onError: (msg: string | null) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [native,    setNative]    = useState<{ x: number; y: number; z: number } | null>(null)


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
            <div className="col-span-2">
              <label className={lbl}>Name</label>
              <TextField value={item.name} onCommit={v => v.trim() && onPatch({ name: v.trim() })} className={`${inp} w-full`} />
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
                <p className="text-[10px] text-ink-subtle mt-1">
                  From the maker&apos;s cutout template. Centred on the item unless offset (looking at its front).
                  Cut into whichever benchtop is under it.
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
