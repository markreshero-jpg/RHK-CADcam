'use client'

// ── HingeDetailEditor ─────────────────────────────────────────────────────────
// Mounted below the entry form on the Materials → Hinges tab when editing a
// hinge. Three sections:
//   1. Anchor holes — the cup's fixing holes (hardware_hinges.anchor_holes jsonb)
//   2. Combined 3D model — the two-mesh animated GLB (model_combined_* columns)
//   3. Plate library — child hardware_hinge_plates rows for this hinge, each with
//      its own mounting-hole pattern, compatible surfaces, offset and default.

import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { HingeHole, HingePlateType } from '@/src/lib/types'
import CalcInput from '@/src/components/CalcInput'

const MODEL_BUCKET = 'hinge-models'

interface Props {
  hinge: Record<string, unknown>
  onHingePatch: (patch: Record<string, unknown>) => void
}

interface PlateRow {
  id: string
  hinge_id: string
  name: string
  plate_type: HingePlateType
  plate_offset_mm: number
  mounting_hole_pattern: HingeHole[]
  compatible_surfaces: string[]
  is_default: boolean
  active: boolean
  supplier_code: string | null
  cost_per_unit: number | null
}

const SURFACES = ['side', 'top', 'bottom', 'shelf'] as const
const PLATE_TYPES: { value: HingePlateType; label: string }[] = [
  { value: 'standard',        label: 'Standard' },
  { value: 'thick_door',      label: 'Thick Door' },
  { value: 'frame_mount',     label: 'Frame Mount' },
  { value: 'zero_protrusion', label: 'Zero Protrusion' },
  { value: 'other',           label: 'Other' },
]

function toHoles(v: unknown): HingeHole[] {
  if (!Array.isArray(v)) return []
  return v.map(h => {
    const o = (h ?? {}) as Record<string, unknown>
    return {
      offset_x: Number(o.offset_x ?? 0),
      offset_y: Number(o.offset_y ?? 0),
      diameter: Number(o.diameter ?? 0),
      depth:    Number(o.depth ?? 0),
    }
  })
}

export default function HingeDetailEditor({ hinge, onHingePatch }: Props) {
  const hingeId = hinge.id as string

  return (
    <div className="flex-none border-b border-edge-strong bg-surface-2/40 px-4 py-3 flex flex-wrap gap-6">
      <AnchorHolesSection hingeId={hingeId} hinge={hinge} onHingePatch={onHingePatch} />
      <ModelSection hingeId={hingeId} hinge={hinge} onHingePatch={onHingePatch} />
      <PlatesSection hingeId={hingeId} />
    </div>
  )
}

// ── Reusable holes table ──────────────────────────────────────────────────────
function HolesTable({ holes, onChange }: { holes: HingeHole[]; onChange: (h: HingeHole[]) => void }) {
  function patch(i: number, key: keyof HingeHole, raw: string) {
    const n = Number(raw)
    const next = holes.map((h, idx) => idx === i ? { ...h, [key]: isFinite(n) ? n : 0 } : h)
    onChange(next)
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-1 text-[9px] text-ink-subtle uppercase tracking-wide">
        <span>Off X</span><span>Off Y</span><span>⌀</span><span>Depth</span><span />
      </div>
      {holes.length === 0 && <span className="text-[10px] text-ink-subtle italic">No holes</span>}
      {holes.map((h, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-1 items-center">
          {(['offset_x', 'offset_y', 'diameter', 'depth'] as const).map(k => (
            <input
              key={k}
              type="number"
              value={String(h[k])}
              step="0.5"
              onChange={e => patch(i, k, e.target.value)}
              onFocus={e => e.target.select()}
              className="w-14 bg-transparent border-b border-edge-strong px-0.5 py-0.5 text-xs text-ink text-right tabular-nums focus:outline-none focus:border-accent"
            />
          ))}
          <button
            onClick={() => onChange(holes.filter((_, idx) => idx !== i))}
            className="text-ink-subtle hover:text-red-400 text-xs px-1"
          >✕</button>
        </div>
      ))}
      <button
        onClick={() => onChange([...holes, { offset_x: 0, offset_y: 0, diameter: 5, depth: 12 }])}
        className="mt-1 self-start px-2 py-0.5 bg-surface-3 hover:bg-surface-3 text-ink-muted text-[11px] rounded"
      >+ Hole</button>
    </div>
  )
}

// ── Anchor holes (on hardware_hinges) ─────────────────────────────────────────
function AnchorHolesSection({ hingeId, hinge, onHingePatch }: { hingeId: string; hinge: Record<string, unknown>; onHingePatch: (p: Record<string, unknown>) => void }) {
  // Initialised from props; the parent remounts this editor (keyed by hinge id)
  // when a different hinge row is selected, so no prop-sync effect is needed.
  const [holes, setHoles] = useState<HingeHole[]>(() => toHoles(hinge.anchor_holes))
  const [saving, setSaving] = useState(false)

  async function save(next: HingeHole[]) {
    setHoles(next)
    setSaving(true)
    const { error } = await supabase.from('hardware_hinges').update({ anchor_holes: next }).eq('id', hingeId)
    if (!error) onHingePatch({ anchor_holes: next })
    else console.error('anchor_holes save:', error)
    setSaving(false)
  }

  return (
    <div className="min-w-[260px]">
      <div className="text-[10px] uppercase tracking-wide text-ink-subtle mb-1.5">
        Anchor holes {saving && <span className="text-ink-subtle">· saving…</span>}
      </div>
      <p className="text-[9px] text-ink-subtle mb-1.5 leading-snug">Offsets from cup centre (mm). Fire on the door alongside the cup bore.</p>
      <HolesTable holes={holes} onChange={save} />
    </div>
  )
}

// ── Combined GLB model (on hardware_hinges) ───────────────────────────────────
function formatFromName(name: string): 'glb' | null {
  const ext = name.split('.').pop()?.toLowerCase()
  return ext === 'glb' || ext === 'gltf' ? 'glb' : null
}
function objectPathFromUrl(url: string): string | null {
  const marker = `/object/public/${MODEL_BUCKET}/`
  const idx = url.indexOf(marker)
  return idx < 0 ? null : url.slice(idx + marker.length)
}

function ModelSection({ hingeId, hinge, onHingePatch }: { hingeId: string; hinge: Record<string, unknown>; onHingePatch: (p: Record<string, unknown>) => void }) {
  const modelUrl = (hinge.model_combined_url as string | null) ?? null
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scaleVal = Number(hinge.model_combined_scale ?? 1)
  const boreVal  = hinge.bore_centre_to_door_face_mm != null ? Number(hinge.bore_centre_to_door_face_mm) : null

  async function commit(patch: Record<string, unknown>) {
    const { error: e } = await supabase.from('hardware_hinges').update(patch).eq('id', hingeId)
    if (e) { setError(e.message); return false }
    setError(null); onHingePatch(patch); return true
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    if (!formatFromName(file.name)) { setError('Combined hinge models must be .glb'); return }
    setUploading(true); setError(null)
    if (modelUrl) { const prior = objectPathFromUrl(modelUrl); if (prior) await supabase.storage.from(MODEL_BUCKET).remove([prior]) }
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${hingeId}/${Date.now()}-${safe}`
    const { error: upErr } = await supabase.storage.from(MODEL_BUCKET).upload(path, file, { upsert: true, cacheControl: '3600' })
    if (upErr) { setError(`Upload failed: ${upErr.message} (does the "${MODEL_BUCKET}" bucket exist?)`); setUploading(false); return }
    const { data: pub } = supabase.storage.from(MODEL_BUCKET).getPublicUrl(path)
    const ok = await commit({ model_combined_url: pub.publicUrl, model_combined_format: 'glb' })
    setUploading(false)
    if (!ok) await supabase.storage.from(MODEL_BUCKET).remove([path])
  }

  async function handleRemove() {
    if (!modelUrl) return
    setUploading(true)
    const path = objectPathFromUrl(modelUrl)
    if (path) await supabase.storage.from(MODEL_BUCKET).remove([path])
    await commit({ model_combined_url: null, model_combined_format: null })
    setUploading(false)
  }

  return (
    <div className="min-w-[240px]">
      <div className="text-[10px] uppercase tracking-wide text-ink-subtle mb-1.5">Combined 3D model (GLB)</div>
      <div className="flex items-center gap-2">
        <label className="px-2.5 py-1 bg-accent hover:bg-accent-hover text-white text-xs rounded cursor-pointer whitespace-nowrap">
          {uploading ? '…' : modelUrl ? 'Replace' : 'Upload'}
          <input type="file" accept=".glb,.gltf" onChange={handleFile} disabled={uploading} className="hidden" />
        </label>
        {modelUrl && (
          <button onClick={handleRemove} disabled={uploading} className="px-2.5 py-1 bg-surface-3 hover:bg-surface-3 text-ink-muted text-xs rounded">Remove</button>
        )}
        <span className="text-[10px] text-ink-subtle truncate">{modelUrl ? 'GLB' : 'No model'}</span>
      </div>
      {error && <div className="text-[10px] text-red-400 mt-1 max-w-[220px]">{error}</div>}
      <div className="grid grid-cols-2 gap-2 mt-2">
        <LabeledCalc label="Scale" value={scaleVal} onCommit={v => commit({ model_combined_scale: v })} />
        <LabeledCalc label="Bore→face mm" value={boreVal} onCommit={v => commit({ bore_centre_to_door_face_mm: v })} onClear={() => commit({ bore_centre_to_door_face_mm: null })} />
      </div>
      <p className="text-[9px] text-ink-subtle mt-1.5 leading-snug">
        Meshes must be named <code className="text-ink-muted">HingePlate</code> + <code className="text-ink-muted">HingeCupArm</code>; origin = plate-face bore centre. Animation viewer is a later pass.
      </p>
    </div>
  )
}

// ── Plate sub-library (hardware_hinge_plates) ─────────────────────────────────
function PlatesSection({ hingeId }: { hingeId: string }) {
  const [plates, setPlates] = useState<PlateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selId, setSelId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase.from('hardware_hinge_plates').select('*').eq('hinge_id', hingeId).order('name')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { setErr(`Load failed: ${error.message}`); setLoading(false); return }
        const rows = (data ?? []) as Record<string, unknown>[]
        setPlates(rows.map(rowToPlate))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [hingeId])

  function rowToPlate(r: Record<string, unknown>): PlateRow {
    return {
      id: r.id as string,
      hinge_id: r.hinge_id as string,
      name: (r.name as string) ?? '',
      plate_type: (r.plate_type as HingePlateType) ?? 'standard',
      plate_offset_mm: Number(r.plate_offset_mm ?? 0),
      mounting_hole_pattern: toHoles(r.mounting_hole_pattern),
      compatible_surfaces: Array.isArray(r.compatible_surfaces) ? (r.compatible_surfaces as string[]) : ['side'],
      is_default: Boolean(r.is_default),
      active: r.active !== false,
      supplier_code: (r.supplier_code as string | null) ?? null,
      cost_per_unit: r.cost_per_unit != null ? Number(r.cost_per_unit) : null,
    }
  }

  async function addPlate() {
    setErr(null)
    const payload = {
      hinge_id: hingeId,
      name: 'New Plate',
      plate_type: 'standard',
      plate_offset_mm: 0,
      mounting_hole_pattern: [{ offset_x: 0, offset_y: 0, diameter: 5, depth: 12 }],
      compatible_surfaces: ['side'],
      // Only the very first plate defaults to is_default, and only when none of
      // this hinge's existing plates already claims it (the partial unique index
      // allows just one default per hinge).
      is_default: plates.length === 0 && !plates.some(p => p.is_default),
      active: true,
    }
    const { data, error } = await supabase.from('hardware_hinge_plates').insert(payload).select().single()
    if (error) { console.error('add plate:', error); setErr(`Add failed: ${error.message}`); return }
    const p = rowToPlate(data as Record<string, unknown>)
    setPlates(prev => [...prev, p])
    setSelId(p.id)
  }

  async function patchPlate(id: string, patch: Partial<PlateRow>) {
    setErr(null)
    setPlates(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
    // Setting this plate as default: clear the others in the DB first, otherwise
    // the partial unique index (one default per hinge) rejects the update.
    if (patch.is_default) {
      const others = plates.filter(p => p.id !== id && p.is_default).map(p => p.id)
      if (others.length) await supabase.from('hardware_hinge_plates').update({ is_default: false }).in('id', others)
      setPlates(prev => prev.map(p => p.id === id ? p : { ...p, is_default: false }))
    }
    const { error } = await supabase.from('hardware_hinge_plates').update(patch).eq('id', id)
    if (error) { console.error('patch plate:', error); setErr(`Save failed: ${error.message}`) }
  }

  async function deletePlate(id: string) {
    setErr(null)
    const { error } = await supabase.from('hardware_hinge_plates').delete().eq('id', id)
    if (error) { console.error('delete plate:', error); setErr(`Delete failed: ${error.message}`); return }
    setPlates(prev => prev.filter(p => p.id !== id))
    if (selId === id) setSelId(null)
  }

  const sel = plates.find(p => p.id === selId) ?? null

  return (
    <div className="min-w-[300px] flex-1">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[10px] uppercase tracking-wide text-ink-subtle">Plates {loading && '· loading…'}</div>
        <button onClick={addPlate} className="px-2 py-0.5 bg-accent hover:bg-accent-hover text-white text-[11px] rounded">+ Plate</button>
      </div>

      {err && <p className="text-[10px] text-red-400 mb-1.5 max-w-[280px]">{err}</p>}

      {plates.length === 0 && !loading && (
        <p className="text-[10px] text-ink-subtle italic">No plates yet. A hinge needs at least one plate to drill mounting holes.</p>
      )}

      <div className="flex flex-wrap gap-1 mb-2">
        {plates.map(p => (
          <button
            key={p.id}
            onClick={() => setSelId(p.id === selId ? null : p.id)}
            className={`px-2 py-0.5 rounded text-[11px] border ${p.id === selId ? 'border-accent text-ink bg-accent/10' : 'border-edge-strong text-ink-muted'} ${p.active ? '' : 'opacity-40'}`}
          >
            {p.name}{p.is_default && <span className="text-accent-ink"> ★</span>}
          </button>
        ))}
      </div>

      {sel && (
        <div className="border border-edge-strong rounded p-2.5 flex flex-col gap-2 bg-surface/60">
          <div className="flex items-center gap-2">
            <input
              value={sel.name}
              onChange={e => patchPlate(sel.id, { name: e.target.value })}
              className="flex-1 bg-transparent border-b border-edge-strong px-0.5 py-0.5 text-xs text-ink focus:outline-none focus:border-accent"
            />
            <select
              value={sel.plate_type}
              onChange={e => patchPlate(sel.id, { plate_type: e.target.value as HingePlateType })}
              className="bg-transparent border-b border-edge-strong text-xs text-ink py-0.5 focus:outline-none focus:border-accent"
            >
              {PLATE_TYPES.map(t => <option key={t.value} value={t.value} className="bg-surface">{t.label}</option>)}
            </select>
            <button onClick={() => deletePlate(sel.id)} className="text-ink-subtle hover:text-red-400 text-xs px-1">Delete</button>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <LabeledCalc label="Offset mm" value={sel.plate_offset_mm} onCommit={v => patchPlate(sel.id, { plate_offset_mm: v })} />
            <label className="flex items-center gap-1.5 text-[11px] text-ink-muted cursor-pointer">
              <input type="checkbox" checked={sel.is_default} onChange={e => patchPlate(sel.id, { is_default: e.target.checked })} className="accent-blue-500" />
              Default
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-ink-muted cursor-pointer">
              <input type="checkbox" checked={sel.active} onChange={e => patchPlate(sel.id, { active: e.target.checked })} className="accent-blue-500" />
              Active
            </label>
          </div>

          <div>
            <div className="text-[9px] uppercase tracking-wide text-ink-subtle mb-1">Mounts to</div>
            <div className="flex gap-2">
              {SURFACES.map(s => (
                <label key={s} className="flex items-center gap-1 text-[11px] text-ink-muted cursor-pointer capitalize">
                  <input
                    type="checkbox"
                    checked={sel.compatible_surfaces.includes(s)}
                    onChange={e => {
                      const next = e.target.checked
                        ? [...sel.compatible_surfaces, s]
                        : sel.compatible_surfaces.filter(x => x !== s)
                      patchPlate(sel.id, { compatible_surfaces: next })
                    }}
                    className="accent-blue-500"
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[9px] uppercase tracking-wide text-ink-subtle mb-1">Mounting holes (from plate centre)</div>
            <HolesTable holes={sel.mounting_hole_pattern} onChange={h => patchPlate(sel.id, { mounting_hole_pattern: h })} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Compact labelled calc field (commit on blur; accepts arithmetic) ──────────
function LabeledCalc({
  label, value, onCommit, onClear,
}: {
  label: string; value: number | null; onCommit: (n: number) => void; onClear?: () => void
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] text-ink-subtle leading-none mb-0.5">{label}</span>
      <CalcInput
        value={value}
        onCommit={onCommit}
        onClear={onClear}
        className="w-24 bg-transparent border-b border-edge-strong px-0.5 py-0.5 text-xs text-ink text-right tabular-nums focus:outline-none focus:border-accent"
      />
    </div>
  )
}
