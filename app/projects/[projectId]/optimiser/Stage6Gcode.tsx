'use client'

// ============================================================
// Stage 6 — G-code generation + snapshot save (spec §5.8).
// Generates one program per sheet (drilling → routing inside-out),
// lets the operator preview/download each, and saves the run straight
// away (savedRuns.ts) so it can be reopened from Stage 1 later — e.g. to
// print labels after leaving the optimiser.
// This is the ONLY stage that writes to job tables (spec §5.2).
// ============================================================

import { useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import { useOptiStore } from '@/src/lib/optimiser/store'
import { generateSheetGcode, postFromProfile, gcodeFileName, type PostProfile } from '@/src/lib/optimiser/gcode'
import { validateGcode, errorsOf, warningsOf, formatFinding, type Finding } from '@/src/lib/optimiser/gcodeValidate'
import { loadSheetDrills, nestedParts } from '@/src/lib/optimiser/sheetDrills'
import { placedOutline, placedHoles } from '@/src/lib/optimiser/shapes'
import type { DrillBlockConfig } from '@/src/lib/optimiser/gangDrill'
import { sheetNumbers } from '@/src/lib/optimiser/labels'
import { saveRun, reserveRunNo, runCode, runFileText, runFileName, type SheetDrill, type SavedRun, type RunInput } from '@/src/lib/optimiser/savedRuns'
import Simulator, { type SimCoord, type SimDrillCoord } from './Simulator'

interface SimState { coord: SimCoord | null; drillBlock: DrillBlockConfig | null; drillCoord: SimDrillCoord | null }
interface GenFile { sheetIndex: number; fileName: string; gcode: string; lines: number; findings: Finding[]; outlines?: Record<string, { x: number; y: number }[]>; holes?: Record<string, { x: number; y: number }[][]> }

function dateStamp() {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

function savedNote(iso: string) {
  const d = new Date(iso)
  return `Run saved ${d.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })} — reopen it any time from Stage 1 → Saved runs.`
}

function download(name: string, text: string) {
  // The controller reads raw bytes, so write one byte per character — a Blob
  // built from a JS string encodes UTF-8, which turns any stray non-ASCII into
  // multiple illegal bytes. generateSheetGcode has already folded the program
  // to 7-bit ASCII; this keeps it that way on the wire. No BOM.
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0x7f
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }))
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}

export default function Stage6Gcode() {
  const snap = useOptiStore(s => s.snapshot)!
  const nestResult = useOptiStore(s => s.nestResult)
  const partIndex = useOptiStore(s => s.partIndex)
  const machineId = useOptiStore(s => s.machineId)
  const profileId = useOptiStore(s => s.profileId)
  const settings = useOptiStore(s => s.settings)
  const stock = useOptiStore(s => s.stock)
  const includedProjectIds = useOptiStore(s => s.includedProjectIds)
  const isBatch = includedProjectIds.length > 1
  const savedRun = useOptiStore(s => s.savedRun)
  const setSavedRun = useOptiStore(s => s.setSavedRun)
  // The run already made for this exact layout (this visit or reopened from Stage 1).
  const current = savedRun && savedRun.nest === nestResult ? savedRun : null
  const sim0 = (current?.sim ?? null) as SimState | null

  const [files, setFiles] = useState<GenFile[]>(() => current?.files.map(f => ({ ...f, lines: f.gcode.split('\n').length, findings: [] })) ?? [])
  const [preview, setPreview] = useState<number | null>(() => current?.files[0]?.sheetIndex ?? null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<string | null>(() => current?.id ? savedNote(current.savedAt) : null)
  const [saveFailed, setSaveFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drillNotes, setDrillNotes] = useState<string[]>([])
  const [postWarnings, setPostWarnings] = useState<string[]>([])
  const [simulating, setSimulating] = useState(false)
  const [coord, setCoord] = useState<SimCoord | null>(sim0?.coord ?? null)
  const [simDrillBlock, setSimDrillBlock] = useState<DrillBlockConfig | null>(sim0?.drillBlock ?? null)
  const [simDrillCoord, setSimDrillCoord] = useState<SimDrillCoord | null>(sim0?.drillCoord ?? null)

  const matCode = (id: string | null) => id ? (snap.materials.find(m => m.id === id)?.name ?? 'MAT') : 'MAT'

  async function generate() {
    if (!nestResult || nestResult.sheets.length === 0) { setError('Nothing nested — run Stage 4 first.'); return }
    setBusy(true); setError(null); setSaved(null); setSaveFailed(false); setDrillNotes([]); setPostWarnings([])
    try {
      const { data: profileRow } = profileId
        ? await supabase.from('cnc_machine_profiles').select('*').eq('id', profileId).single()
        : { data: null }
      const profile = profileRow as Record<string, unknown> | null
      // Capture the output datum so the simulator can invert it back to sheet space.
      const post0 = postFromProfile(profile)
      const coordNow: SimCoord = {
        originCorner: post0.origin_corner, xDir: post0.x_axis_direction, yDir: post0.y_axis_direction,
        surfaceZ: post0.material_surface_z, zUp: post0.z_axis_up,
      }
      setCoord(coordNow)

      // Routing tool per material: materials.cnc_tool_id → cnc_tools (depth/feed/speed).
      const { data: toolRows } = await supabase.from('cnc_tools')
        .select('id,name,tool_number,diameter,max_depth_per_pass,base_feed_rate,base_spindle_speed,plunge_feed_rate').eq('active', true)
      const toolById = new Map((toolRows ?? []).map(t => [t.id as string, t]))
      const matById = new Map(snap.materials.map(m => [m.id, m]))
      const toolNum = (tn: unknown) => { const d = String(tn ?? '').replace(/\D/g, ''); return d ? Number(d) : 1 }

      // Tool name per tool number, so every tool change — pocket bits and
      // internal-feature bits included — can name its tool in the program.
      const toolNames: Record<number, string | null> = {}
      for (const t of toolRows ?? []) {
        const n = toolNum(t.tool_number)
        if (n) toolNames[n] = (t.name as string | null) ?? null
      }

      const ds = dateStamp()
      // Run number (RHK6570-R3): on every file name and program header so files on
      // the server lead back to the run. Regenerating the same layout keeps its number.
      let runNo = current?.runNo ?? null
      if (runNo == null) {
        try { runNo = await reserveRunNo(snap.projectId) }
        catch (e) { console.error('[optimiser] run number', e) }   // still post — just unnumbered
      }
      const now = new Date()
      const runNote = runNo != null
        ? `RUN ${runCode(snap.jobNumber, runNo)} ${runRooms()} ${now.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: '2-digit' })}`
        : null
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
              yBankAdjustXMm: Number(blk.y_bank_adjust_x_mm ?? 0), yBankAdjustYMm: Number(blk.y_bank_adjust_y_mm ?? 0),
              xBankSpindleCompMm: Number(blk.x_bank_spindle_comp_mm ?? 0), yBankSpindleCompMm: Number(blk.y_bank_spindle_comp_mm ?? 0),
              workOffsetCode: String(blk.work_offset_code ?? 'G54'), xDiameters, yDiameters,
            }
          }
        }
      }

      setSimDrillBlock(drillBlock ?? null)   // hand the block layout to the simulator overlay
      // Block datum so the simulator inverts gang-drilled holes from the block's
      // own G54 frame (not the routing datum) back onto the sheet.
      const drillCoordNow: SimDrillCoord | null = drillBlock
        ? { headOffsetX: drillBlock.headOffsetXMm, headOffsetY: drillBlock.headOffsetYMm, yBankAdjustX: drillBlock.yBankAdjustXMm ?? 0, yBankAdjustY: drillBlock.yBankAdjustYMm ?? 0, xSpindleComp: drillBlock.xBankSpindleCompMm ?? 0, ySpindleComp: drillBlock.yBankSpindleCompMm ?? 0, signY: post0.sign_y, mirrorY: post0.mirror_y }
        : null
      setSimDrillCoord(drillCoordNow)

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
        await loadSheetDrills(nestedParts(snap.parts, partIndex), nestResult.sheets, { sync: true, blockDiameters, routerTools, preferredPocketToolNumber, deductEdgeband: deductEb })
      setDrillNotes(drillWarnings)

      // Program number (O-word) derived from the job number, unique per sheet.
      const jobInt = parseInt((snap.jobNumber ?? '').match(/\d+/)?.[0] ?? '', 10)
      const oBase = Number.isFinite(jobInt) ? jobInt : 0

      // Shaped parts (O4): the perimeter cut follows each part's outline — the
      // same placement transform the sheet preview and the holes use.
      const partByUid = new Map(snap.parts.map(p => [p.uid, p]))
      const outlinesFor = (sheet: (typeof nestResult.sheets)[number]) => {
        const out: Record<string, { x: number; y: number }[]> = {}
        for (const pl of sheet.placements) {
          const part = partByUid.get(pl.baseUid)
          const local = part ? placedOutline(part, pl, deductEb) : null
          if (local) out[pl.uid] = local.map(q => ({ x: pl.x + q.x, y: pl.y + q.y }))
        }
        return out
      }
      // Benchtop sink / cooktop cutouts: cut inside each part before its perimeter.
      const holesFor = (sheet: (typeof nestResult.sheets)[number]) => {
        const out: Record<string, { x: number; y: number }[][]> = {}
        for (const pl of sheet.placements) {
          const part = partByUid.get(pl.baseUid)
          const hs = part ? placedHoles(part, pl, deductEb) : []
          if (hs.length) out[pl.uid] = hs.map(h => h.map(q => ({ x: pl.x + q.x, y: pl.y + q.y })))
        }
        return out
      }
      // Rib cut-outs (z_curved_end C4): the onion skin each hole leaves.
      const holeSkinsFor = (sheet: (typeof nestResult.sheets)[number]) => {
        const out: Record<string, number[]> = {}
        for (const pl of sheet.placements) {
          const skins = partByUid.get(pl.baseUid)?.cut_hole_skins
          if (skins?.some(s => s > 0)) out[pl.uid] = skins
        }
        return out
      }

      // Sheet numbers restart per material (Whiteboard 01-10, then LX 01-05). The
      // O-number stays unique across the whole run.
      const sheetNos = sheetNumbers(nestResult.sheets)
      const gen: GenFile[] = nestResult.sheets.map((sheet, i) => {
        const drills = sheetDrills.get(sheet.index) ?? []
        const routes = sheetRoutes.get(sheet.index) ?? []
        const mat = sheet.materialId ? matById.get(sheet.materialId) : undefined
        const tool = mat?.cnc_tool_id ? toolById.get(mat.cnc_tool_id) : undefined
        const post: PostProfile = postFromProfile(profile, tool
          ? { base_feed_rate: tool.base_feed_rate as number | null, base_spindle_speed: tool.base_spindle_speed as number | null, plunge_feed_rate: tool.plunge_feed_rate as number | null }
          : undefined)
        // Material-level feed override (% of the tool/profile base feed).
        if (mat?.feed_rate_pct && mat.feed_rate_pct > 0) post.base_feed_rate = Math.round(post.base_feed_rate * mat.feed_rate_pct / 100)
        const outlines = outlinesFor(sheet)
        const holes = holesFor(sheet)
        const gcode = generateSheetGcode({
          sheet, thickness: sheet.thickness, profile: post, drills, routes,
          toolNumber: toolNum(tool?.tool_number), drillToolNumber: 2,
          toolDiameter: tool?.diameter != null ? Number(tool.diameter) : undefined,
          maxDepthPerPass: tool?.max_depth_per_pass != null ? Number(tool.max_depth_per_pass) : undefined,
          jobNumber: snap.jobNumber, materialName: mat?.name ?? null,
          toolName: (tool?.name as string | null) ?? null, toolNames,
          programNumber: `O${String(oBase + i).padStart(4, '0')}`,
          runNote, sheetNo: sheetNos.get(sheet.index)!.no,
          drillBlock,
          outlines,
          holes,
          holeSkins: holeSkinsFor(sheet),
        })
        const fileName = gcodeFileName({ batch, jobNumber: snap.jobNumber, dateStr: ds, materialCode: matCode(sheet.materialId), sheetNumber: sheetNos.get(sheet.index)!.no, ext: post.file_extension, runNo })
        return {
          sheetIndex: sheet.index, fileName,
          gcode, lines: gcode.split('\n').length,
          findings: validateGcode(gcode, { maxCommentLength: post.max_comment_length }),
          outlines, holes,
        }
      })

      // Two materials can share a file-name code (Whiteboard 16.5 / Whiteboard 16 →
      // "Whiteboard16"); then their per-material numbers would clash — number those
      // files through the run instead so nothing is overwritten.
      const nameCount = new Map<string, number>()
      for (const g of gen) nameCount.set(g.fileName, (nameCount.get(g.fileName) ?? 0) + 1)
      gen.forEach((g, i) => {
        if (nameCount.get(g.fileName)! > 1) g.fileName = g.fileName.replace(/_(\d{2,})(\.[^.]+)$/, `_${String(i + 1).padStart(2, '0')}x$2`)
      })

      // Hard gate: a program with errors is never offered for download, and is
      // checked here rather than at the download button so that a bad program
      // cannot reach nest_sheets.gcode through the run save either. Warnings
      // surface but do not block.
      const blocking = gen.flatMap(g => errorsOf(g.findings).map(f => `${g.fileName}  ${formatFinding(f)}`))
      const warned = gen.flatMap(g => warningsOf(g.findings).map(f => `${g.fileName}  ${formatFinding(f)}`))
      if (blocking.length) {
        setFiles([]); setPreview(null)
        setPostWarnings([...blocking, ...warned])
        setError(`Export blocked: ${blocking.length} validation error(s) — the program would not load or would crash the machine.`)
        return
      }
      setPostWarnings(warned)

      setFiles(gen)
      setPreview(gen[0]?.sheetIndex ?? null)
      // Save straight away — the run can then be reopened from Stage 1.
      const sim: SimState = { coord: coordNow, drillBlock: drillBlock ?? null, drillCoord: drillCoordNow }
      const run = {
        id: null, runNo, name: runName(runNo), savedAt: new Date().toISOString(), nest: nestResult,
        files: gen.map(({ sheetIndex, fileName, gcode, outlines, holes }) => ({ sheetIndex, fileName, gcode, outlines, holes })),
        drillsBySheet: new Map<number, SheetDrill[]>([...sheetDrills].map(([k, v]) => [k, v.map(d => ({ x: d.x, y: d.y, diameter: d.diameter }))])),
        sim,
      }
      setSavedRun(run)
      await save(run, current?.id ?? null)
    } catch (e) {
      // The post-processor hard-fails rather than emit a program that would
      // crash the machine (e.g. group-01 motion inside an open canned cycle).
      // Surface it instead of leaving the stage blank, and emit nothing.
      setFiles([]); setPreview(null)
      setError(`G-code generation failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setBusy(false) }
  }

  // Rooms in the run; the saved run's name is "RHK6570-R3 Bed 2 Ensuite".
  function runRooms() {
    const rooms = [...new Set(nestedParts(snap.parts, partIndex).map(p => p.room_name).filter(Boolean))]
    return `${rooms.length ? rooms.join(', ') : 'All rooms'}${isBatch ? ' (batch)' : ''}`
  }
  function runName(runNo: number | null) {
    return `${runNo != null ? runCode(snap.jobNumber, runNo) : (snap.jobNumber ?? snap.projectName)} ${runRooms()}`
  }

  // The run as saved: the workspace now plus the run's own layout, files and holes.
  function runInput(run: SavedRun): RunInput {
    const st = useOptiStore.getState()
    const nested = new Set(Object.values(st.partIndex).map(p => p.baseUid))
    return {
      runNo: run.runNo, savedAt: run.savedAt,
      state: {
        nestResult: run.nest, partIndex: st.partIndex, selectedUids: [...st.selectedUids], cutQty: st.cutQty,
        filterRoomIds: st.filterRoomIds, filterCabinetIds: st.filterCabinetIds, filterMaterialIds: st.filterMaterialIds,
        includedProjectIds: st.includedProjectIds, settings: st.settings, stock: st.stock,
        machineId: st.machineId, profileId: st.profileId,
        parts: snap.parts.filter(p => nested.has(p.uid)),
      },
      files: run.files, drillsBySheet: run.drillsBySheet, sim: run.sim,
    }
  }

  // Backup copy of the run, kept next to the NC files (opened from Stage 1).
  function downloadRunFile() {
    if (!current) return
    const text = runFileText({ id: current.id, name: current.name, projectId: snap.projectId, jobNumber: snap.jobNumber, run: runInput(current) })
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url; a.download = runFileName(snap.jobNumber, current.runNo, current.savedAt); a.click()
    URL.revokeObjectURL(url)
  }

  async function save(run: SavedRun, replaceId: string | null) {
    try {
      const { id, savedAt } = await saveRun({ projectId: snap.projectId, name: run.name, replaceId, ...runInput(run) })
      if (useOptiStore.getState().savedRun?.nest === run.nest) setSavedRun({ ...run, id, savedAt })
      setSaved(savedNote(savedAt)); setSaveFailed(false)
    } catch (e) {
      setSaveFailed(true)
      setError(`Run not saved: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function retrySave() {
    if (!current) return
    setBusy(true); setError(null)
    try { await save(current, current.id) } finally { setBusy(false) }
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
            <button onClick={() => { files.forEach(f => download(f.fileName, f.gcode)); downloadRunFile() }}
              title="Every program plus the run file (backup copy of the run)"
              className="px-3 py-1.5 text-xs rounded-lg border border-edge-strong text-ink-muted hover:bg-surface-2 transition-colors">Download all</button>
            {current && <button onClick={downloadRunFile}
              title="Backup copy of this run — keep it with the NC files; Stage 1 → Open run file puts it back"
              className="px-3 py-1.5 text-xs rounded-lg border border-edge-strong text-ink-muted hover:bg-surface-2 transition-colors">Run file</button>}
            {saveFailed && <button onClick={retrySave} disabled={busy}
              className="px-3 py-1.5 text-xs rounded-lg border border-edge-strong text-ink-muted hover:bg-surface-2 disabled:opacity-50 transition-colors">Retry save</button>}
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

        {postWarnings.length > 0 && (
          <div className={`mx-8 mt-2 rounded-lg border px-3 py-2 ${files.length === 0 ? 'border-red-700/50 bg-red-900/15' : 'border-amber-700/50 bg-amber-900/15'}`}>
            <p className={`text-[11px] font-medium mb-0.5 ${files.length === 0 ? 'text-red-400' : 'text-amber-400'}`}>
              Post-processor validation ({postWarnings.length})
            </p>
            <ul className={`text-[11px] list-disc list-inside space-y-0.5 font-mono ${files.length === 0 ? 'text-red-300/90' : 'text-amber-300/90'}`}>
              {postWarnings.map((n, i) => <li key={i}>{n}</li>)}
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
          files={files.map(f => ({ sheetIndex: f.sheetIndex, fileName: f.fileName, gcode: f.gcode, outlines: f.outlines, holes: f.holes }))}
          sheets={nestResult.sheets}
          coord={coord ?? undefined}
          drillBlock={simDrillBlock ?? undefined}
          drillCoord={simDrillCoord ?? undefined}
          onClose={() => setSimulating(false)} />
      )}
    </div>
  )
}
