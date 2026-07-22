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
import { loadSheetDrills } from '@/src/lib/optimiser/sheetDrills'
import type { DrillBlockConfig } from '@/src/lib/optimiser/gangDrill'
import Simulator, { type SimCoord, type SimDrillCoord } from './Simulator'

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
  const [drillNotes, setDrillNotes] = useState<string[]>([])
  const [simulating, setSimulating] = useState(false)
  const [coord, setCoord] = useState<SimCoord | null>(null)
  const [simDrillBlock, setSimDrillBlock] = useState<DrillBlockConfig | null>(null)
  const [simDrillCoord, setSimDrillCoord] = useState<SimDrillCoord | null>(null)

  const matCode = (id: string | null) => id ? (snap.materials.find(m => m.id === id)?.name ?? 'MAT') : 'MAT'

  async function generate() {
    if (!nestResult || nestResult.sheets.length === 0) { setError('Nothing nested — run Stage 4 first.'); return }
    setBusy(true); setError(null); setSaved(null); setDrillNotes([])
    try {
      const { data: profileRow } = profileId
        ? await supabase.from('cnc_machine_profiles').select('*').eq('id', profileId).single()
        : { data: null }
      const profile = profileRow as Record<string, unknown> | null
      // Capture the output datum so the simulator can invert it back to sheet space.
      const post0 = postFromProfile(profile)
      setCoord({
        originCorner: post0.origin_corner, xDir: post0.x_axis_direction, yDir: post0.y_axis_direction,
        surfaceZ: post0.material_surface_z, zUp: post0.z_axis_up,
      })

      // Routing tool per material: materials.cnc_tool_id → cnc_tools (depth/feed/speed).
      const { data: toolRows } = await supabase.from('cnc_tools')
        .select('id,name,tool_number,diameter,max_depth_per_pass,base_feed_rate,base_spindle_speed,plunge_feed_pct').eq('active', true)
      const toolById = new Map((toolRows ?? []).map(t => [t.id as string, t]))
      const matById = new Map(snap.materials.map(m => [m.id, m]))
      const toolNum = (tn: unknown) => { const d = String(tn ?? '').replace(/\D/g, ''); return d ? Number(d) : 1 }

      const ds = dateStamp()
      const batch = isBatch

      // Drill block for Anderson gang drilling (per machine). Only activates the
      // M88/M89 path once ≥1 spindle has a bit fitted; otherwise the generic
      // single-spindle drilling is used so output is never silently dropped.
      let drillBlock: DrillBlockConfig | undefined
      if (machineId) {
        const { data: blkRow } = await supabase.from('cnc_drill_blocks')
          .select('*').eq('cnc_machine_id', machineId).eq('is_active', true).order('created_at').limit(1).maybeSingle()
        if (blkRow) {
          const blk = blkRow as Record<string, unknown>
          const { data: spRows } = await supabase.from('cnc_drill_block_spindles')
            .select('bank,position,drill_id').eq('drill_block_id', blk.id as string)
          const spindles = (spRows ?? []) as { bank: string; position: number; drill_id: string | null }[]
          if (spindles.some(s => s.drill_id)) {
            const { data: drillRows } = await supabase.from('cnc_drills').select('id,diameter')
            const diaById = new Map((drillRows ?? []).map(d => [d.id as string, (d.diameter as number | null) ?? null]))
            const xCount = Number(blk.bank_x_count ?? 12), yCount = Number(blk.bank_y_count ?? 8)
            const xDiameters: (number | null)[] = Array(xCount).fill(null)
            const yDiameters: (number | null)[] = Array(yCount).fill(null)
            for (const s of spindles) {
              const arr = s.bank === 'x' ? xDiameters : yDiameters
              if (s.position >= 1 && s.position <= arr.length) arr[s.position - 1] = s.drill_id ? diaById.get(s.drill_id) ?? null : null
            }
            drillBlock = {
              bankXCount: xCount, bankYCount: yCount, spacingMm: Number(blk.spacing_mm ?? 32),
              xBankMcode: String(blk.x_bank_mcode ?? 'M88'), yBankMcode: String(blk.y_bank_mcode ?? 'M89'),
              sharedCorner: Boolean(blk.shared_corner ?? true),
              headOffsetXMm: Number(blk.head_offset_x_mm ?? 0), headOffsetYMm: Number(blk.head_offset_y_mm ?? -128),
              workOffsetCode: String(blk.work_offset_code ?? 'G54'), xDiameters, yDiameters,
            }
          }
        }
      }

      setSimDrillBlock(drillBlock ?? null)   // hand the block layout to the simulator overlay
      // Block datum so the simulator inverts gang-drilled holes from the block's
      // own G54 frame (not the routing datum) back onto the sheet.
      setSimDrillCoord(drillBlock
        ? { headOffsetX: drillBlock.headOffsetXMm, headOffsetY: drillBlock.headOffsetYMm, signY: post0.sign_y, mirrorY: post0.mirror_y }
        : null)

      // Joint-sync + read part_operations + resolve auto_tool/drill_id, projected
      // to sheet space. Shared with Stage 5 so the holes match exactly.
      const blockDiameters = drillBlock
        ? [...drillBlock.xDiameters, ...drillBlock.yDiameters].filter((d): d is number => d != null)
        : undefined
      // Router bits available to pocket holes no drill can match, plus the
      // machine's preferred pocket tool (e.g. T102).
      const routerTools = (toolRows ?? [])
        .filter(t => t.diameter != null && Number(t.diameter) > 0)
        .map(t => ({ id: t.id as string, diameter: Number(t.diameter), tool_number: toolNum(t.tool_number), name: (t.name as string | null) ?? null }))
      const preferredPocketToolNumber = profile?.pocket_router_tool_number != null ? Number(profile.pocket_router_tool_number) : null
      // Nest was laid out at cut size when the profile deducts edgebanding —
      // holes must shift onto the deducted blanks to match.
      const deductEb = snap.profiles.find(p => p.id === profileId)?.deduct_edgeband === true
      const { bySheet: sheetDrills, routesBySheet: sheetRoutes, warnings: drillWarnings } =
        await loadSheetDrills(snap.parts, nestResult.sheets, { sync: true, blockDiameters, routerTools, preferredPocketToolNumber, deductEdgeband: deductEb })
      setDrillNotes(drillWarnings)

      // Program number (O-word) derived from the job number, unique per sheet.
      const jobInt = parseInt((snap.jobNumber ?? '').match(/\d+/)?.[0] ?? '', 10)
      const oBase = Number.isFinite(jobInt) ? jobInt : 0

      const gen: GenFile[] = nestResult.sheets.map((sheet, i) => {
        const drills = sheetDrills.get(sheet.index) ?? []
        const routes = sheetRoutes.get(sheet.index) ?? []
        const mat = sheet.materialId ? matById.get(sheet.materialId) : undefined
        const tool = mat?.cnc_tool_id ? toolById.get(mat.cnc_tool_id) : undefined
        const post: PostProfile = postFromProfile(profile, tool
          ? { base_feed_rate: tool.base_feed_rate as number | null, base_spindle_speed: tool.base_spindle_speed as number | null, plunge_feed_pct: tool.plunge_feed_pct as number | null }
          : undefined)
        // Material-level feed override (% of the tool/profile base feed).
        if (mat?.feed_rate_pct && mat.feed_rate_pct > 0) post.base_feed_rate = Math.round(post.base_feed_rate * mat.feed_rate_pct / 100)
        const gcode = generateSheetGcode({
          sheet, thickness: sheet.thickness, profile: post, drills, routes,
          toolNumber: toolNum(tool?.tool_number), drillToolNumber: 2,
          toolDiameter: tool?.diameter != null ? Number(tool.diameter) : undefined,
          maxDepthPerPass: tool?.max_depth_per_pass != null ? Number(tool.max_depth_per_pass) : undefined,
          jobNumber: snap.jobNumber, materialName: mat?.name ?? null,
          programNumber: `O${String(oBase + i).padStart(4, '0')}`,
          drillBlock,
        })
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
            <button onClick={() => setSimulating(true)}
              className="px-3 py-1.5 text-xs rounded-lg border border-edge-strong text-ink-muted hover:bg-surface-2 transition-colors">▶ Simulate</button>
            <button onClick={() => files.forEach(f => download(f.fileName, f.gcode))}
              className="px-3 py-1.5 text-xs rounded-lg border border-edge-strong text-ink-muted hover:bg-surface-2 transition-colors">Download all</button>
            <button onClick={save} disabled={busy}
              className="px-3 py-1.5 text-xs rounded-lg border border-edge-strong text-ink-muted hover:bg-surface-2 disabled:opacity-50 transition-colors">Save run</button>
          </>}
          {saved && <span className="text-xs text-green-500">{saved}</span>}
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>

        {drillNotes.length > 0 && (
          <div className="mx-8 mt-2 rounded-lg border border-amber-700/50 bg-amber-900/15 px-3 py-2">
            <p className="text-[11px] font-medium text-amber-400 mb-0.5">Drill tool resolution ({drillNotes.length})</p>
            <ul className="text-[11px] text-amber-300/90 list-disc list-inside space-y-0.5">
              {drillNotes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        )}

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

      {simulating && nestResult && (
        <Simulator
          files={files.map(f => ({ sheetIndex: f.sheetIndex, fileName: f.fileName, gcode: f.gcode }))}
          sheets={nestResult.sheets}
          coord={coord ?? undefined}
          drillBlock={simDrillBlock ?? undefined}
          drillCoord={simDrillCoord ?? undefined}
          onClose={() => setSimulating(false)} />
      )}
    </div>
  )
}
