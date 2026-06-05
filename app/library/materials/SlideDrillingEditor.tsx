'use client'

// ── SlideDrillingEditor ───────────────────────────────────────────────────────
// Mounted below SlideModelEditor on the Materials → Slides tab when editing a
// slide. CRUD for drawer_slide_operations: the holes/routes a slide imposes on
// the surfaces it touches. The slide analogue of the joints catalog — the user
// enters each operation (surface, size, depth, position) and the resolver will
// later turn these into drill positions on the cabinet member + drawer box.
//
// Phase 1 = data entry only. Position datums (along/up) are per-surface and are
// interpreted by the resolver in a later phase; here we just capture the numbers.

import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { SlideDrillOp, SlideDrillSurface, SlideDrillSide } from '@/src/lib/resolver/types'

const TABLE = 'drawer_slide_operations'

// Surfaces, in the order a machinist meets them. Each becomes a tab; only the
// active surface's table is shown so the slide list below stays in view. `tab`
// is the short tab label; `label`/`hint` describe the surface + its datums.
const SURFACES: { key: SlideDrillSurface; tab: string; label: string; hint: string }[] = [
  { key: 'cabinet_member', tab: 'Cabinet member', label: 'Cabinet member (gable / divider)', hint: 'along = from cabinet front · up = height up the gable · drills into the panel face' },
  { key: 'drawer_bottom',  tab: 'Drawer bottom',  label: 'Drawer bottom',                    hint: 'along = from box front · up = across the box width · drills up into the underside' },
  { key: 'drawer_back',    tab: 'Drawer back',    label: 'Drawer back',                      hint: 'along = across the box width · up = height · drills front-ward into the back' },
  { key: 'drawer_front',   tab: 'Drawer front',   label: 'Drawer front (visible face)',      hint: 'along = across the face · up = height · drills into the back of the face — must NOT break through' },
  { key: 'drawer_side',    tab: 'Drawer side',    label: 'Drawer side',                      hint: 'along = from box front · up = height · drills into the side (side-mount slides)' },
]

const MACHINE_OPS: { value: SlideDrillOp['machine_operation']; label: string }[] = [
  { value: 'drill', label: 'Drill' },
  { value: 'route', label: 'Route' },
  { value: 'pocket', label: 'Pocket' },
]

const SIDES: { value: SlideDrillSide; label: string }[] = [
  { value: 'both', label: 'Both' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
]

// DB row → local op (numbers stay numbers; we only edit through committed patches)
function rowToOp(r: Record<string, unknown>): SlideDrillOp {
  return {
    id:                String(r.id),
    slide_id:          String(r.slide_id),
    operation_order:   Number(r.operation_order ?? 0),
    target_surface:    (r.target_surface as SlideDrillSurface) ?? 'cabinet_member',
    machine_operation: (r.machine_operation as SlideDrillOp['machine_operation']) ?? 'drill',
    tool_diameter_mm:  Number(r.tool_diameter_mm ?? 5),
    depth_mm:          Number(r.depth_mm ?? 12),
    along_off_mm:      Number(r.along_off_mm ?? 0),
    up_off_mm:         Number(r.up_off_mm ?? 0),
    qty:               Number(r.qty ?? 1),
    spacing_mm:        r.spacing_mm == null ? null : Number(r.spacing_mm),
    repeat_axis:       (r.repeat_axis as 'along' | 'up') ?? 'up',
    side:              (r.side as SlideDrillSide) ?? 'both',
    tool:              (r.tool as string | null) ?? null,
    notes:             (r.notes as string | null) ?? null,
    expressions:       (r.expressions as Record<string, string> | null) ?? null,
  }
}

interface Props {
  slideId: string
}

export default function SlideDrillingEditor({ slideId }: Props) {
  const [ops, setOps] = useState<SlideDrillOp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeSurface, setActiveSurface] = useState<SlideDrillSurface>('cabinet_member')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from(TABLE)
      .select('*')
      .eq('slide_id', slideId)
      .order('target_surface')
      .order('operation_order')
      .then(({ data, error: e }) => {
        if (cancelled) return
        if (e) setError(e.message)
        else setOps((data ?? []).map(rowToOp))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [slideId])

  async function addOp(surface: SlideDrillSurface) {
    const orderInSurface = ops.filter(o => o.target_surface === surface).length
    const payload = {
      slide_id: slideId,
      target_surface: surface,
      operation_order: orderInSurface,
      machine_operation: 'drill',
      tool_diameter_mm: 5,
      depth_mm: 12,
      along_off_mm: 0,
      up_off_mm: 0,
      qty: 1,
      spacing_mm: null,
      repeat_axis: 'up',
      side: 'both',
    }
    const { data, error: e } = await supabase.from(TABLE).insert(payload).select().single()
    if (e) { setError(e.message); return }
    if (data) setOps(prev => [...prev, rowToOp(data as Record<string, unknown>)])
  }

  async function patchOp(id: string, patch: Partial<SlideDrillOp>) {
    // optimistic local update
    setOps(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o))
    const { error: e } = await supabase.from(TABLE).update(patch).eq('id', id)
    if (e) setError(e.message)
  }

  async function deleteOp(id: string) {
    const prev = ops
    setOps(p => p.filter(o => o.id !== id))
    const { error: e } = await supabase.from(TABLE).delete().eq('id', id)
    if (e) { setError(e.message); setOps(prev) }
  }

  return (
    <div className="flex-none border-b border-edge-strong bg-surface-2/40 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-[10px] uppercase tracking-wide text-ink-subtle">Slide drilling</div>
        <span className="text-[9px] text-ink-subtle">
          holes this slide imposes on the cabinet member &amp; drawer box
        </span>
      </div>

      {error && <div className="text-[10px] text-red-400 mb-2">{error}</div>}
      {loading ? (
        <div className="text-[10px] text-ink-subtle py-2">Loading…</div>
      ) : (() => {
        const active = SURFACES.find(s => s.key === activeSurface) ?? SURFACES[0]
        const surfaceOps = ops
          .filter(o => o.target_surface === active.key)
          .sort((a, b) => a.operation_order - b.operation_order)
        return (
          <div>
            {/* tab strip — one per surface, with op count; active tab opens into the box below */}
            <div className="flex flex-wrap items-end gap-1 px-0.5">
              {SURFACES.map(s => {
                const count = ops.filter(o => o.target_surface === s.key).length
                const isActive = s.key === activeSurface
                return (
                  <button
                    key={s.key}
                    onClick={() => setActiveSurface(s.key)}
                    className={`px-2.5 py-1 text-[10px] rounded-t border ${
                      isActive
                        ? 'relative z-10 -mb-px border-edge border-b-0 bg-surface text-ink font-medium'
                        : 'border-transparent text-ink-subtle hover:text-ink hover:border-edge/50'
                    }`}
                  >
                    {s.tab}
                    {count > 0 && (
                      <span className={`ml-1 text-[9px] ${isActive ? 'text-accent' : 'text-ink-subtle'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* content box — outline wraps the table and connects up to the active tab */}
            <div className="rounded-b rounded-tr border border-edge bg-surface">
            {/* active surface — datum hint + add button */}
            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-edge/40">
              <span className="text-[9px] text-ink-subtle truncate">{active.hint}</span>
              <button
                onClick={() => addOp(active.key)}
                className="flex-none ml-2 px-2 py-0.5 bg-accent hover:bg-accent-hover text-white text-[10px] rounded"
              >
                + Hole
              </button>
            </div>

            {surfaceOps.length === 0 ? (
              <div className="px-2.5 py-2 text-[10px] text-ink-subtle">No operations.</div>
            ) : (
              <div>
                {/* column header */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 text-[9px] uppercase tracking-wide text-ink-subtle border-b border-edge/40">
                  <span className="w-[72px]">Op</span>
                  <span className="w-[54px] text-right">⌀ mm</span>
                  <span className="w-[54px] text-right">Depth</span>
                  <span className="w-[60px] text-right">Along</span>
                  <span className="w-[60px] text-right">Up</span>
                  <span className="w-[40px] text-right">Qty</span>
                  <span className="w-[60px] text-right">Spacing</span>
                  <span className="w-[64px]">Repeat</span>
                  <span className="w-[64px]">Side</span>
                  <span className="flex-1">Notes</span>
                  <span className="w-[20px]" />
                </div>
                {surfaceOps.map(op => (
                  <OpRow key={op.id} op={op} onPatch={patchOp} onDelete={deleteOp} />
                ))}
              </div>
            )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── One editable operation row ────────────────────────────────────────────────

function OpRow({
  op, onPatch, onDelete,
}: {
  op: SlideDrillOp
  onPatch: (id: string, patch: Partial<SlideDrillOp>) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 border-b border-edge/30 hover:bg-surface-2/30">
      <select
        value={op.machine_operation}
        onChange={e => onPatch(op.id, { machine_operation: e.target.value as SlideDrillOp['machine_operation'] })}
        className="w-[72px] bg-transparent border-b border-edge-strong text-xs text-ink py-0.5 focus:outline-none focus:border-accent"
      >
        {MACHINE_OPS.map(m => <option key={m.value} value={m.value} className="bg-surface">{m.label}</option>)}
      </select>
      <NumCell value={op.tool_diameter_mm} w={54} step="0.5" onCommit={v => onPatch(op.id, { tool_diameter_mm: v ?? 0 })} />
      <NumCell value={op.depth_mm}         w={54} step="0.5" onCommit={v => onPatch(op.id, { depth_mm: v ?? 0 })} />
      <NumCell value={op.along_off_mm}     w={60} step="0.5" onCommit={v => onPatch(op.id, { along_off_mm: v ?? 0 })} />
      <NumCell value={op.up_off_mm}        w={60} step="0.5" onCommit={v => onPatch(op.id, { up_off_mm: v ?? 0 })} />
      <NumCell value={op.qty}              w={40} step="1"   onCommit={v => onPatch(op.id, { qty: Math.max(1, Math.round(v ?? 1)) })} />
      <NumCell value={op.spacing_mm}       w={60} step="0.5" nullable onCommit={v => onPatch(op.id, { spacing_mm: v })} />
      <select
        value={op.repeat_axis}
        onChange={e => onPatch(op.id, { repeat_axis: e.target.value as 'along' | 'up' })}
        disabled={op.qty <= 1}
        title="Direction repeated holes step"
        className="w-[64px] bg-transparent border-b border-edge-strong text-xs text-ink py-0.5 focus:outline-none focus:border-accent disabled:opacity-40"
      >
        <option value="up" className="bg-surface">Up</option>
        <option value="along" className="bg-surface">Along</option>
      </select>
      <select
        value={op.side}
        onChange={e => onPatch(op.id, { side: e.target.value as SlideDrillSide })}
        className="w-[64px] bg-transparent border-b border-edge-strong text-xs text-ink py-0.5 focus:outline-none focus:border-accent"
      >
        {SIDES.map(s => <option key={s.value} value={s.value} className="bg-surface">{s.label}</option>)}
      </select>
      <TextCell value={op.notes} onCommit={v => onPatch(op.id, { notes: v })} />
      <button
        onClick={() => onDelete(op.id)}
        className="w-[20px] text-ink-subtle hover:text-red-400 text-xs flex-none"
        title="Delete operation"
      >✕</button>
    </div>
  )
}

// ── Cells: commit on blur so typing doesn't hammer the network ────────────────

function NumCell({
  value, w, step, nullable, onCommit,
}: {
  value: number | null
  w: number
  step: string
  nullable?: boolean
  onCommit: (v: number | null) => void
}) {
  const [local, setLocal] = useState(value == null ? '' : String(value))
  useEffect(() => { setLocal(value == null ? '' : String(value)) }, [value])
  function commit() {
    const s = local.trim()
    if (s === '') { onCommit(nullable ? null : 0); return }
    const n = Number(s)
    if (isFinite(n)) onCommit(n)
    else setLocal(value == null ? '' : String(value))
  }
  return (
    <input
      type="number"
      value={local}
      step={step}
      placeholder={nullable ? '—' : ''}
      onChange={e => setLocal(e.target.value)}
      onBlur={commit}
      onFocus={e => e.target.select()}
      style={{ width: w }}
      className="bg-transparent border-b border-edge-strong px-0.5 py-0.5 text-xs text-ink text-right tabular-nums focus:outline-none focus:border-accent placeholder:text-ink-subtle"
    />
  )
}

function TextCell({
  value, onCommit,
}: {
  value: string | null
  onCommit: (v: string | null) => void
}) {
  const [local, setLocal] = useState(value ?? '')
  useEffect(() => { setLocal(value ?? '') }, [value])
  return (
    <input
      type="text"
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => onCommit(local.trim() || null)}
      placeholder="—"
      className="flex-1 min-w-0 bg-transparent border-b border-edge-strong px-0.5 py-0.5 text-xs text-ink focus:outline-none focus:border-accent placeholder:text-ink-subtle"
    />
  )
}
