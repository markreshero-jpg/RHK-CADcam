'use client'

// ── LiftSystemExtras ─────────────────────────────────────────────────────────
// Mounted below the entry form on Materials → Lift systems (z_lift_systems LS1)
// when editing a row:
//  - Companions: the other Lincoln Sentry lines that go with this row (front
//    brackets, cover caps, TIP-ON unit…). Stored as [{id, qty}]; per front the
//    hardware list takes qty × the row's qty_per_front.
//  - 3D model: GLB / STL / OBJ in the public lift-models bucket. Fitting and
//    drawing come later (LS4); this just keeps the file with the row.

import { useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import { modelFormatFromName, MODEL_ACCEPT } from '@/src/lib/modelFormat'

const BUCKET = 'lift-models'

type Row = Record<string, unknown>
type Companion = { id: string; qty: number }

function objectPathFromUrl(publicUrl: string): string | null {
  const marker = `/object/public/${BUCKET}/`
  const idx = publicUrl.indexOf(marker)
  return idx < 0 ? null : publicUrl.slice(idx + marker.length)
}

export function parseCompanions(v: unknown): Companion[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((c): c is { id: unknown; qty?: unknown } => !!c && typeof c === 'object' && 'id' in c)
    .map(c => ({ id: String(c.id), qty: Number(c.qty) > 0 ? Number(c.qty) : 1 }))
}

export default function LiftSystemExtras({ row, allRows, onSaved }: {
  row: Row
  allRows: Row[]
  onSaved: (patch: Row) => void
}) {
  const id = String(row.id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addId, setAddId] = useState('')

  const companions = parseCompanions(row.companions)
  const modelUrl = (row.model_url as string | null) ?? null
  const label = (r: Row | undefined) => r ? `${r.supplier_code ?? '—'} · ${r.name}` : '(missing row)'

  async function commitPatch(patch: Row) {
    const { error: e } = await supabase.from('hardware_lift_systems').update(patch).eq('id', id)
    if (e) { setError(e.message); return false }
    setError(null)
    onSaved(patch)
    return true
  }

  const saveCompanions = (next: Companion[]) => commitPatch({ companions: next })

  // Same family first, then the rest; never the row itself or a mechanism.
  const pickable = allRows
    .filter(r => r.id !== row.id && r.role !== 'mechanism' && !companions.some(c => c.id === r.id))
    .sort((a, b) => (a.family === row.family ? 0 : 1) - (b.family === row.family ? 0 : 1)
      || String(a.name).localeCompare(String(b.name)))

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const format = modelFormatFromName(file.name)
    if (!format) { setError(`Unsupported format: ${file.name}. Accepted: .glb .stl .obj`); return }
    setBusy(true)
    const path = `${id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error: upErr } = await supabase.storage.from(BUCKET)
      .upload(path, file, { upsert: true, cacheControl: '3600', contentType: 'application/octet-stream' })
    if (upErr) { setError(`Upload failed: ${upErr.message}`); setBusy(false); return }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
    const prior = modelUrl ? objectPathFromUrl(modelUrl) : null
    const ok = await commitPatch({ model_url: pub.publicUrl, model_format: format, model_scale: 1 })
    if (ok && prior) await supabase.storage.from(BUCKET).remove([prior])
    if (!ok) await supabase.storage.from(BUCKET).remove([path])
    setBusy(false)
  }

  async function handleRemoveModel() {
    if (!modelUrl) return
    setBusy(true)
    const path = objectPathFromUrl(modelUrl)
    if (await commitPatch({ model_url: null, model_format: null }) && path) {
      await supabase.storage.from(BUCKET).remove([path])
    }
    setBusy(false)
  }

  return (
    <div className="flex-none border-b border-edge-strong bg-surface-2/40">
      <div className="flex items-start gap-8 px-4 py-3">

        <div className="flex flex-col gap-2 min-w-[420px] max-w-[560px]">
          <div className="text-[10px] uppercase tracking-wide text-ink-subtle">
            Goes with it (per {Number(row.qty_per_front ?? 1) === 1 ? 'set' : 'mechanism'})
          </div>
          {companions.length === 0 && <div className="text-xs text-ink-subtle">Nothing linked.</div>}
          {companions.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2 text-xs">
              <input type="number" min={1} step={1} value={c.qty} disabled={busy}
                onChange={e => {
                  const qty = Math.max(1, Number(e.target.value) || 1)
                  saveCompanions(companions.map((x, j) => j === i ? { ...x, qty } : x))
                }}
                className="w-12 px-1.5 py-0.5 bg-surface-1 border border-edge rounded text-ink" />
              <span className="text-ink-muted">×</span>
              <span className="text-ink flex-1 truncate">{label(allRows.find(r => r.id === c.id))}</span>
              <button disabled={busy} onClick={() => saveCompanions(companions.filter((_, j) => j !== i))}
                className="px-2 py-0.5 bg-surface-3 text-ink-muted rounded">Remove</button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <select value={addId} onChange={e => setAddId(e.target.value)} disabled={busy}
              className="flex-1 px-1.5 py-1 bg-surface-1 border border-edge rounded text-xs text-ink">
              <option value="">Add a line…</option>
              {pickable.map(r => <option key={String(r.id)} value={String(r.id)}>{label(r)}</option>)}
            </select>
            <button disabled={busy || !addId}
              onClick={async () => { if (await saveCompanions([...companions, { id: addId, qty: 1 }])) setAddId('') }}
              className="px-2.5 py-1 bg-accent hover:bg-accent-hover text-white text-xs rounded disabled:opacity-50">Add</button>
          </div>
        </div>

        <div className="flex flex-col gap-2 min-w-[260px]">
          <div className="text-[10px] uppercase tracking-wide text-ink-subtle">3D model</div>
          <div className="flex items-center gap-2">
            <label className="px-2.5 py-1 bg-accent hover:bg-accent-hover text-white text-xs rounded cursor-pointer whitespace-nowrap">
              {busy ? 'Saving…' : modelUrl ? 'Replace' : 'Upload model'}
              <input type="file" accept={MODEL_ACCEPT} onChange={handleFile} disabled={busy} className="hidden" />
            </label>
            {modelUrl && (
              <button onClick={handleRemoveModel} disabled={busy}
                className="px-2.5 py-1 bg-surface-3 text-ink-muted text-xs rounded">Remove</button>
            )}
          </div>
          <span className="text-[10px] text-ink-subtle">
            {modelUrl
              ? <a href={modelUrl} target="_blank" rel="noreferrer" className="underline">{String(row.model_format ?? '').toUpperCase()} file</a>
              : 'None yet. Drawn in plan / elevation / 3D later (LS4).'}
          </span>
        </div>

        {error && <div className="text-xs text-red-500">{error}</div>}
      </div>
    </div>
  )
}
