'use client'

// ── HandleModelEditor ─────────────────────────────────────────────────────────
// Mounted below the entry form on the Materials → Handles tab when editing a
// bought handle (z_handles D16 / H8a). Uploads a GLB / STL / OBJ to the public
// handle-models bucket and fits it to the handle-space convention:
//   origin = hole midpoint on the door's front face, +X along the handle,
//   +Y up, +Z out of the door.
// The model is always auto-aligned (centred on the holes, back on the door);
// rotation, scale and nudges correct a file that doesn't follow the
// convention. The preview draws a strip of door and the drilled holes as red
// dots on top, so a model whose posts miss the holes is obvious.

import { useCallback, useState } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/src/lib/supabase'
import { modelFormatFromName, MODEL_ACCEPT } from '@/src/lib/modelFormat'
import { handleHolePattern, lengthScale, looksLikeMetres } from '@/src/lib/handleModelFit'

// three/drei loaders, client only.
const PreviewCanvas = dynamic(
  () => import('@/src/components/three/PartViewer').then(m => ({ default: m.PreviewCanvas })),
  { ssr: false },
)
const HandlePreviewScene = dynamic(() => import('./HandlePreviewScene'), { ssr: false })

const BUCKET = 'handle-models'
const ROT_STEPS = [0, 90, 180, 270]

type Row = Record<string, unknown>
type Native = { x: number; y: number; z: number }

function objectPathFromUrl(publicUrl: string): string | null {
  const marker = `/object/public/${BUCKET}/`
  const idx = publicUrl.indexOf(marker)
  return idx < 0 ? null : publicUrl.slice(idx + marker.length)
}

const num = (v: unknown, d = 0) => { const n = Number(v); return isFinite(n) ? n : d }
const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp
const fmt = (v: number) => String(round(v, 1))

export default function HandleModelEditor({ row, onSaved }: {
  row: Row
  onSaved: (patch: Row) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [native, setNative]       = useState<Native | null>(null)
  const onNativeSize = useCallback((s: Native) => setNative(s), [])

  const id = String(row.id)
  const modelUrl = (row.model_url as string | null) ?? null
  const scale = num(row.model_scale, 1) || 1
  const length = row.length == null ? null : num(row.length)
  const projection = num(row.projection, 30) || 30
  const holes = handleHolePattern({
    holes: Array.isArray(row.holes) ? row.holes as { offset_x: number; offset_y: number }[] : null,
    bore_centres: row.bore_centres == null ? null : num(row.bore_centres),
  })

  async function commitPatch(patch: Row) {
    const { error: e } = await supabase.from('hardware_handles').update(patch).eq('id', id)
    if (e) { setError(e.message); return false }
    setError(null)
    onSaved(patch)
    return true
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const format = modelFormatFromName(file.name)
    if (!format) { setError(`Unsupported format: ${file.name}. Accepted: .glb .stl .obj`); return }
    setUploading(true)
    setError(null)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${id}/${Date.now()}-${safeName}`
    const { error: upErr } = await supabase.storage.from(BUCKET)
      .upload(path, file, { upsert: true, cacheControl: '3600', contentType: 'application/octet-stream' })
    if (upErr) { setError(`Upload failed: ${upErr.message}`); setUploading(false); return }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
    const prior = modelUrl ? objectPathFromUrl(modelUrl) : null
    // New model → reset the fit so the auto-align starts clean.
    setNative(null)
    const ok = await commitPatch({
      model_url: pub.publicUrl, model_format: format,
      model_scale: 1, model_rot_x: 0, model_rot_y: 0, model_rot_z: 0,
      model_off_x: 0, model_off_y: 0, model_off_z: 0,
    })
    if (ok && prior) await supabase.storage.from(BUCKET).remove([prior])
    if (!ok) await supabase.storage.from(BUCKET).remove([path])
    setUploading(false)
  }

  async function handleRemove() {
    if (!modelUrl) return
    setUploading(true)
    const path = objectPathFromUrl(modelUrl)
    if (await commitPatch({ model_url: null, model_format: null }) && path) {
      await supabase.storage.from(BUCKET).remove([path])
    }
    setNative(null)
    setUploading(false)
  }

  const fitLen = native ? lengthScale(native.x, length) : null
  const metres = native ? looksLikeMetres(native, scale) : false

  return (
    <div className="flex-none border-b border-edge-strong bg-surface-2/40">
      <div className="flex items-stretch gap-6 px-4 py-3">

        <div className="flex flex-col gap-2.5 min-w-[300px] max-w-[380px]">
          <div className="text-[10px] uppercase tracking-wide text-ink-subtle">3D model</div>

          <div className="flex items-center gap-2">
            <label className="px-2.5 py-1 bg-accent hover:bg-accent-hover text-white text-xs rounded cursor-pointer whitespace-nowrap">
              {uploading ? 'Uploading…' : modelUrl ? 'Replace' : 'Upload model'}
              <input type="file" accept={MODEL_ACCEPT} onChange={handleFile} disabled={uploading} className="hidden" />
            </label>
            {modelUrl && (
              <button onClick={handleRemove} disabled={uploading}
                className="px-2.5 py-1 bg-surface-3 text-ink-muted text-xs rounded">Remove</button>
            )}
            <span className="text-[10px] text-ink-subtle">
              {row.model_format ? String(row.model_format).toUpperCase() : 'none: shows the plain bar'}
            </span>
          </div>

          {error && <div className="text-[10px] text-red-400">{error}</div>}

          {modelUrl && (<>
            <div className="grid grid-cols-3 gap-2">
              <RotPicker label="Tip (X)"  value={num(row.model_rot_x)} onPick={v => commitPatch({ model_rot_x: v })} hint="Fixes Z-up exports (try 90 or 270)" />
              <RotPicker label="Turn (Y)" value={num(row.model_rot_y)} onPick={v => commitPatch({ model_rot_y: v })} hint="Spins about the vertical axis (try 180 if it faces into the door)" />
              <RotPicker label="Spin (Z)" value={num(row.model_rot_z)} onPick={v => commitPatch({ model_rot_z: v })} hint="Lays a handle modelled upright along the length (try 90)" />
            </div>

            <div className="flex items-end gap-2 flex-wrap">
              <NumField label="Scale" value={scale} step="0.001" onCommit={v => v > 0 && commitPatch({ model_scale: v })} />
              {fitLen && Math.abs(fitLen - scale) > 1e-6 && (
                <button onClick={() => commitPatch({ model_scale: round(fitLen, 6) })}
                  title="Scale so the model is exactly the handle's Length"
                  className="px-2 py-1 text-[11px] border border-edge-strong rounded text-ink-muted hover:bg-surface-2">
                  Fit to length ({fmt(length!)})
                </button>
              )}
              {metres && (
                <button onClick={() => commitPatch({ model_scale: 1000 })}
                  className="px-2 py-1 text-[11px] border border-amber-500/60 rounded text-amber-400 hover:bg-amber-500/10">
                  Looks like metres: ×1000
                </button>
              )}
            </div>
            {native && (
              <div className="text-[10px] text-ink-subtle">
                Model at this scale: {fmt(native.x * scale)} long × {fmt(native.y * scale)} high × {fmt(native.z * scale)} projection
                {length ? ` (Length field: ${fmt(length)})` : ''}
              </div>
            )}

            <div className="flex items-end gap-2">
              <NumField label="Nudge X" value={num(row.model_off_x)} step="0.5" onCommit={v => commitPatch({ model_off_x: v })} />
              <NumField label="Nudge Y" value={num(row.model_off_y)} step="0.5" onCommit={v => commitPatch({ model_off_y: v })} />
              <NumField label="Nudge Z" value={num(row.model_off_z)} step="0.5" onCommit={v => commitPatch({ model_off_z: v })} />
              <button onClick={() => commitPatch({ model_off_x: 0, model_off_y: 0, model_off_z: 0 })}
                title="Clear the nudges: centre on the holes, back on the door face"
                className="px-2 py-1 text-[11px] border border-edge-strong rounded text-ink-muted hover:bg-surface-2">
                Auto-fit
              </button>
            </div>
          </>)}

          <div className="text-[9px] text-ink-subtle leading-snug">
            Lay the handle horizontal, facing you. It's centred on the holes (red dots) and its back sits on
            the door. Vertical handles are turned when placed. GLB keeps its own finish; STL / OBJ use the
            Finish field&apos;s colour. Keep files under ~1 MB.
          </div>
        </div>

        <div className="w-[360px] h-[220px] border border-edge-strong rounded overflow-hidden bg-[#111827]">
          <PreviewCanvas
            dx={Math.max(length ?? 0, (native?.x ?? 0) * scale, 160) + 60} dy={80} dz={projection + 40}
            bgColor="#111827" viewModes initialView="3d" views={['3d', 'front', 'top', 'side']} enablePan
          >
            <HandlePreviewScene row={row} holes={holes} projection={projection} length={length} onNativeSize={onNativeSize} />
          </PreviewCanvas>
        </div>
      </div>
    </div>
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
        className="bg-transparent border-b border-edge-strong px-0.5 py-0.5 text-xs text-ink focus:outline-none focus:border-accent text-right tabular-nums w-20 font-mono"
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
              value === r ? 'bg-accent/15 text-accent-ink border-accent' : 'text-ink-muted hover:bg-surface-2'
            }`}
          >{r}°</button>
        ))}
      </div>
    </div>
  )
}
