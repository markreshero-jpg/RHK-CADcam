'use client'

// ============================================================
// Stage 6 — G-code generation + snapshot save (spec §5.8).
// Generates one program per sheet (drilling → routing inside-out),
// lets the operator preview/download each, and saves a complete
// reloadable snapshot to nest_jobs / nest_sheets / nest_placements.
// This is the ONLY stage that writes to job tables (spec §5.2).
// ============================================================

import { useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import { useOptiStore } from '@/src/lib/optimiser/store'
import { generateSheetGcode, postFromProfile, gcodeFileName, type PostProfile } from '@/src/lib/optimiser/gcode'
import { buildSheetDrills, groupDrillOps, type DrillOpRaw, type PartRef } from '@/src/lib/optimiser/drills'

interface GenFile { sheetIndex: number; fileName: string; gcode: string; lines: number }

function dateStamp() {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}

export default function Stage6Gcode() {
  const snap = useOptiStore(s => s.snapshot)!
  const nestResult = useOptiStore(s => s.nestResult)
  const machineId = useOptiStore(s => s.machineId)
  const profileId = useOptiStore(s => s.profileId)
  const settings = useOptiStore(s => s.settings)
  const stock = useOptiStore(s => s.stock)
  const includedProjectIds = useOptiStore(s => s.includedProjectIds)
  const isBatch = includedProjectIds.length > 1

  const [files, setFiles] = useState<GenFile[]>([])
  const [preview, setPreview] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const matCode = (id: string | null) => id ? (snap.materials.find(m => m.id === id)?.name ?? 'MAT') : 'MAT'

  async function generate() {
    if (!nestResult || nestResult.sheets.length === 0) { setError('Nothing nested — run Stage 4 first.'); return }
    setBusy(true); setError(null); setSaved(null)
    try {
      const { data: profileRow } = profileId
        ? await supabase.from('cnc_machine_profiles').select('*').eq('id', profileId).single()
        : { data: null }
      const post: PostProfile = postFromProfile(profileRow as Record<string, unknown> | null)
      const ds = dateStamp()
      const batch = isBatch

      // Source drilling ops from part_operations (keyed by stable cabinet+part_key).
      const cabIds = [...new Set(snap.parts.map(p => p.cabinet_instance_id))]
      const { data: opRows } = cabIds.length
        ? await supabase.from('part_operations')
            .select('source_table,source_cabinet_id,source_part_key,pos_x,pos_y,diameter,depth,repeat_count,repeat_spacing,repeat_axis,output_to_cnc,operation_type')
            .in('source_cabinet_id', cabIds).eq('operation_type', 'drill')
        : { data: [] }
      const drillOps = ((opRows ?? []) as (DrillOpRaw & { output_to_cnc: boolean | null })[]).filter(o => o.output_to_cnc !== false)
      const opsByKey = groupDrillOps(drillOps)
      const partByUid = new Map<string, PartRef>(snap.parts.map(p => [p.uid, {
        source_table: p.source_table, cabinet_instance_id: p.cabinet_instance_id, source_part_key: p.source_part_key, w: p.w, h: p.h,
      }]))

      const gen: GenFile[] = nestResult.sheets.map((sheet, i) => {
        const drills = buildSheetDrills(sheet, partByUid, opsByKey, sheet.thickness)
        const gcode = generateSheetGcode({ sheet, thickness: sheet.thickness, profile: post, drills, toolNumber: 1, drillToolNumber: 2 })
        return {
          sheetIndex: sheet.index,
          fileName: gcodeFileName({ batch, jobNumber: snap.jobNumber, dateStr: ds, materialCode: matCode(sheet.materialId), sheetNumber: i + 1 }),
          gcode, lines: gcode.split('\n').length,
        }
      })
      setFiles(gen)
      setPreview(gen[0]?.sheetIndex ?? null)
    } finally { setBusy(false) }
  }

  async function save() {
    if (!nestResult || files.length === 0) { setError('Generate G-code before saving.'); return }
    setBusy(true); setError(null)
    try {
      const snapshot = { nestResult, settings, stock, machineId, profileId, savedAt: new Date().toISOString() }
      const { data: job, error: jErr } = await supabase.from('nest_jobs').insert({
        project_id: snap.projectId, project_ids: includedProjectIds, cnc_machine_id: machineId,
        status: 'generated', snapshot, generated_at: new Date().toISOString(),
        name: `${snap.projectName} optimise ${dateStamp()}`,
      }).select().single()
      if (jErr || !job) throw new Error(jErr?.message ?? 'job insert failed')

      for (const [i, sheet] of nestResult.sheets.entries()) {
        const file = files.find(f => f.sheetIndex === sheet.index)
        const { data: ns, error: sErr } = await supabase.from('nest_sheets').insert({
          nest_job_id: (job as { id: string }).id, material_id: sheet.materialId, sheet_number: i + 1,
          efficiency: sheet.efficiency, gcode: file?.gcode ?? null,
          sheet_dx: sheet.stock.w, sheet_dy: sheet.stock.h, is_offcut: sheet.stock.isOffcut, sheet_label: sheet.stock.label,
        }).select().single()
        if (sErr || !ns) throw new Error(sErr?.message ?? 'sheet insert failed')

        if (sheet.placements.length) {
          const partProject = new Map(snap.parts.map(p => [p.uid, p.project_id]))
          const rows = sheet.placements.map(pl => {
            const [stbl, ...rest] = pl.baseUid.split(':')
            return {
              nest_sheet_id: (ns as { id: string }).id,
              source_table: stbl, source_part_id: rest.join(':') || null,
              sheet_x: pl.x, sheet_y: pl.y, rotation: pl.rotated ? 90 : 0,
              cut_dx: pl.w, cut_dy: pl.h,
              part_label: pl.label, project_id: partProject.get(pl.baseUid) ?? snap.projectId, cut_quantity: 1, shape_polygon: null,
            }
          })
          const { error: pErr } = await supabase.from('nest_placements').insert(rows)
          if (pErr) throw new Error(pErr.message)
        }
      }
      setSaved(`Saved run with ${nestResult.sheets.length} sheet(s).`)
    } catch (e) {
      setError(`Save failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setBusy(false) }
  }

  const previewFile = files.find(f => f.sheetIndex === preview)

  return (
    <div className="h-full flex overflow-hidden">
      {/* File list + actions */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-none px-8 py-3 flex items-center gap-3 border-b border-edge">
          <button onClick={generate} disabled={busy}
            className="px-4 py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
            {busy ? 'Working…' : files.length ? 'Regenerate' : 'Generate G-code'}
          </button>
          {files.length > 0 && <>
            <button onClick={() => files.forEach(f => download(f.fileName, f.gcode))}
              className="px-3 py-1.5 text-xs rounded-lg border border-edge-strong text-ink-muted hover:bg-surface-2 transition-colors">Download all</button>
            <button onClick={save} disabled={busy}
              className="px-3 py-1.5 text-xs rounded-lg border border-edge-strong text-ink-muted hover:bg-surface-2 disabled:opacity-50 transition-colors">Save run</button>
          </>}
          {saved && <span className="text-xs text-green-500">{saved}</span>}
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-4">
          {files.length === 0 ? (
            <p className="text-xs text-ink-subtle text-center py-12">Generate per-sheet G-code. Drilling is sequenced before routing; routing is inside-out.</p>
          ) : (
            <div className="space-y-1.5 max-w-2xl">
              {files.map(file => (
                <div key={file.sheetIndex}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${preview === file.sheetIndex ? 'border-accent bg-accent/10' : 'border-edge-strong hover:bg-surface-2'}`}
                  onClick={() => setPreview(file.sheetIndex)}>
                  <span className="text-xs font-mono text-ink flex-1">{file.fileName}</span>
                  <span className="text-[11px] text-ink-subtle">{file.lines} lines</span>
                  <button onClick={e => { e.stopPropagation(); download(file.fileName, file.gcode) }}
                    className="text-[11px] px-2 py-0.5 rounded border border-edge-strong text-ink-muted hover:bg-surface-3 transition-colors">Download</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* G-code preview */}
      {previewFile && (
        <div className="flex-none w-[460px] border-l border-edge flex flex-col overflow-hidden">
          <div className="flex-none px-4 py-2 border-b border-edge text-[11px] font-mono text-ink-muted">{previewFile.fileName}</div>
          <pre className="flex-1 overflow-auto px-4 py-3 text-[10.5px] leading-snug font-mono text-ink-muted whitespace-pre">{previewFile.gcode}</pre>
        </div>
      )}
    </div>
  )
}
