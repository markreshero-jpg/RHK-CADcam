'use client'

// ── SlideModelEditor ──────────────────────────────────────────────────────────
// Mounted below the entry form on the Materials → Slides tab when editing an
// existing row. Handles GLB/STL/OBJ upload to the public slide-models bucket,
// stores model_url + model_format on the slide row, and exposes the nudge
// fields (model_scale, model_anchor_x/y/z) with a live inline 3D preview.

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/src/lib/supabase'
import { PreviewCanvas } from '@/src/components/three/PartViewer'

// SlideModel uses three/drei loaders — load only on the client (matches how
// DrawerBox3DView is loaded via dynamic in the preview panel).
const SlideModel = dynamic(
  () => import('@/src/components/three/SlideModel').then(m => ({ default: m.SlideModel })),
  { ssr: false }
)

const BUCKET = 'slide-models'

export interface SlideModelRow {
  id:             string
  name:           string
  colour:         string | null
  runner_thickness: number
  box_height:     number | null
  nominal_length: number | null
  model_url:      string | null
  model_format:   'glb' | 'stl' | 'obj' | null
  model_scale:    number
  model_anchor_x: number
  model_anchor_y: number
  model_anchor_z: number
}

interface Props {
  row:     SlideModelRow
  onSaved: (patch: Partial<SlideModelRow>) => void
}

function formatFromName(name: string): 'glb' | 'stl' | 'obj' | null {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'glb') return 'glb'
  if (ext === 'gltf') return 'glb'
  if (ext === 'stl') return 'stl'
  if (ext === 'obj') return 'obj'
  return null
}

function objectPathFromUrl(publicUrl: string): string | null {
  // Public URL shape: https://<proj>.supabase.co/storage/v1/object/public/<bucket>/<path>
  const marker = `/object/public/${BUCKET}/`
  const idx = publicUrl.indexOf(marker)
  if (idx < 0) return null
  return publicUrl.slice(idx + marker.length)
}

export default function SlideModelEditor({ row, onSaved }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Local nudge values — committed to DB on blur (so dragging an input doesn't
  // hammer the network).
  const [scale,   setScale]   = useState(String(row.model_scale ?? 1))
  const [anchorX, setAnchorX] = useState(String(row.model_anchor_x ?? 0))
  const [anchorY, setAnchorY] = useState(String(row.model_anchor_y ?? 0))
  const [anchorZ, setAnchorZ] = useState(String(row.model_anchor_z ?? 0))

  // Preview dims — sized for a typical drawer slide.
  const previewDx = Math.max(600, Number(row.nominal_length ?? 500))
  const previewDy = 200
  const previewDz = previewDx

  // Live numeric values for the preview (use the in-progress local state, not
  // the saved row, so users see changes as they type).
  const liveScale   = useMemo(() => Number(scale)   || 1, [scale])
  const liveAnchorX = useMemo(() => Number(anchorX) || 0, [anchorX])
  const liveAnchorY = useMemo(() => Number(anchorY) || 0, [anchorY])
  const liveAnchorZ = useMemo(() => Number(anchorZ) || 0, [anchorZ])

  // Centre the rail in the preview viewport. Convention origin (front-top-
  // outer) sits at world (-w/2, +h/2, +d/2) so the rail body ends up centred.
  const fbW = Number(row.runner_thickness) || 12
  const fbH = Number(row.box_height ?? 30)  || 30
  const fbD = Number(row.nominal_length ?? 450) || 450
  const previewPos: [number, number, number] = [-fbW / 2, fbH / 2, fbD / 2]

  async function commitPatch(patch: Partial<SlideModelRow>) {
    const { error: e } = await supabase.from('hardware_slides').update(patch).eq('id', row.id)
    if (e) {
      setError(e.message)
      return false
    }
    setError(null)
    onSaved(patch)
    return true
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const format = formatFromName(file.name)
    if (!format) {
      setError(`Unsupported format: ${file.name}. Accepted: .glb .stl .obj`)
      return
    }
    setUploading(true)
    setError(null)

    // Remove the prior file (if any) before uploading a new one — keeps the
    // bucket tidy and avoids accidentally retaining files for deleted slides.
    if (row.model_url) {
      const prior = objectPathFromUrl(row.model_url)
      if (prior) await supabase.storage.from(BUCKET).remove([prior])
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${row.id}/${Date.now()}-${safeName}`
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, cacheControl: '3600' })
    if (uploadErr) {
      setError(`Upload failed: ${uploadErr.message}`)
      setUploading(false)
      return
    }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
    const model_url = pub.publicUrl
    const ok = await commitPatch({ model_url, model_format: format })
    setUploading(false)
    if (!ok) {
      // Roll back the upload so we don't leak orphaned files.
      await supabase.storage.from(BUCKET).remove([path])
    }
  }

  async function handleRemove() {
    if (!row.model_url) return
    setUploading(true)
    const path = objectPathFromUrl(row.model_url)
    if (path) await supabase.storage.from(BUCKET).remove([path])
    await commitPatch({ model_url: null, model_format: null })
    setUploading(false)
  }

  async function commitNumber(key: 'model_scale' | 'model_anchor_x' | 'model_anchor_y' | 'model_anchor_z', raw: string, fallback: number) {
    const n = Number(raw)
    const value = isFinite(n) ? n : fallback
    if (value === row[key]) return
    await commitPatch({ [key]: value })
  }

  return (
    <div className="flex-none border-b border-edge-strong bg-surface-2/40">
      <div className="flex items-stretch gap-4 px-4 py-3">

        {/* Upload + remove + numeric nudge fields */}
        <div className="flex flex-col gap-2 min-w-[260px]">
          <div className="text-[10px] uppercase tracking-wide text-ink-subtle">3D model</div>

          <div className="flex items-center gap-2">
            <label className="px-2.5 py-1 bg-accent hover:bg-accent-hover text-white text-xs rounded cursor-pointer whitespace-nowrap">
              {uploading ? '…' : row.model_url ? 'Replace' : 'Upload'}
              <input
                type="file"
                accept=".glb,.gltf,.stl,.obj"
                onChange={handleFile}
                disabled={uploading}
                className="hidden"
              />
            </label>
            {row.model_url && (
              <button
                onClick={handleRemove}
                disabled={uploading}
                className="px-2.5 py-1 bg-surface-3 hover:bg-surface-3 text-ink-muted text-xs rounded"
              >
                Remove
              </button>
            )}
            <span className="text-[10px] text-ink-subtle truncate">
              {row.model_format ? row.model_format.toUpperCase() : 'No model'}
            </span>
          </div>

          {error && <div className="text-[10px] text-red-400">{error}</div>}

          <div className="grid grid-cols-4 gap-1.5 mt-1">
            <NudgeField label="Scale"   value={scale}   onChange={setScale}   onBlur={() => commitNumber('model_scale',    scale,   1)} step="0.001" />
            <NudgeField label="Anch X"  value={anchorX} onChange={setAnchorX} onBlur={() => commitNumber('model_anchor_x', anchorX, 0)} step="0.5"   />
            <NudgeField label="Anch Y"  value={anchorY} onChange={setAnchorY} onBlur={() => commitNumber('model_anchor_y', anchorY, 0)} step="0.5"   />
            <NudgeField label="Anch Z"  value={anchorZ} onChange={setAnchorZ} onBlur={() => commitNumber('model_anchor_z', anchorZ, 0)} step="0.5"   />
          </div>
          <div className="text-[9px] text-ink-subtle leading-snug">
            Convention: origin = front-top-outer corner of runner. +X toward drawer, +Y up, +Z into cabinet.
            Use Scale for unit mismatches (e.g. a metres-export needs 1000).
          </div>
        </div>

        {/* Inline 3D preview */}
        <div className="w-[220px] h-[160px] border border-edge-strong rounded overflow-hidden bg-[#111827]">
          {row.model_url && row.model_format ? (
            <PreviewCanvas dx={previewDx} dy={previewDy} dz={previewDz} bgColor="#111827">
              <SlideModel
                url={row.model_url}
                format={row.model_format}
                scale={liveScale}
                anchor={{ x: liveAnchorX, y: liveAnchorY, z: liveAnchorZ }}
                position={previewPos}
                sideOrientation="left"
                color={row.colour}
                fallbackBox={{ w: fbW, h: fbH, d: fbD }}
              />
            </PreviewCanvas>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] text-ink-subtle">
              No model uploaded
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Compact labelled number field ─────────────────────────────────────────────

function NudgeField({
  label, value, onChange, onBlur, step,
}: { label: string; value: string; onChange: (v: string) => void; onBlur: () => void; step: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] text-ink-subtle leading-none mb-0.5">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        onFocus={e => e.target.select()}
        className="bg-transparent border-b border-edge-strong px-0.5 py-0.5 text-xs text-ink focus:outline-none focus:border-accent text-right tabular-nums"
      />
    </div>
  )
}
