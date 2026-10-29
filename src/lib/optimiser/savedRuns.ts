// ============================================================
// Saved optimiser runs (spec §5.2 "snapshot fidelity"). Stage 6 saves the
// whole workspace every time it generates G-code, so a run can be reopened
// later (Stage 1 → Saved runs) to reprint labels / cut sheets or re-download
// programs without re-nesting.
//   nest_jobs.snapshot  — the workspace (RunSnapshot): layout, selection,
//                         settings, the nested parts as they were cut, holes
//   nest_sheets.gcode   — one program per sheet
//   nest_placements     — flat placement rows (reporting)
// A run file (RHK6570-R3.rhkrun, RunFile) is the same run as one JSON file,
// downloaded next to the NC files — the backup that survives the run being
// deleted from the app (like Cabinet Vision's export file). Opening it from
// Stage 1 puts the run back.
// ============================================================

import { supabase } from '@/src/lib/supabase'
import type { OptiPart } from './types'
import type { NestResult, NestPartInput, GroupStock } from './nest'
import type { PreOptSettings } from './store'

export type SheetDrill = { x: number; y: number; diameter: number }
type Pt = { x: number; y: number }

export interface SavedRunFile {
  sheetIndex: number; fileName: string; gcode: string
  outlines?: Record<string, Pt[]>; holes?: Record<string, Pt[][]>
}

/** The run behind the current layout, in memory. Only valid while
 *  `nest === store.nestResult` — any edit makes a new layout. */
export interface SavedRun {
  id: string | null            // null until the save lands
  runNo: number | null         // per job, never reused (projects.nest_run_seq)
  name: string
  savedAt: string
  nest: NestResult
  files: SavedRunFile[]
  drillsBySheet: Map<number, SheetDrill[]>
  sim?: unknown                // simulator datum + drill block (Stage 6)
}

export interface RunSnapshot {
  v: 2
  savedAt: string
  runNo?: number | null
  nestResult: NestResult
  partIndex: Record<string, NestPartInput>
  selectedUids: string[]
  cutQty: Record<string, number>
  filterRoomIds: string[]; filterCabinetIds: string[]; filterMaterialIds: string[]
  includedProjectIds: string[]
  settings: PreOptSettings
  stock: Record<string, GroupStock>
  machineId: string | null
  profileId: string | null
  parts: OptiPart[]            // the nested parts as they were cut (names, comments, shapes)
  files: Omit<SavedRunFile, 'gcode'>[]
  drills: [number, SheetDrill[]][]
  sim?: unknown
}

export interface RunListItem { id: string; name: string; savedAt: string; sheets: number; parts: number; batch: boolean }

/** The live workspace pieces a snapshot is built from. */
export type RunState = Omit<RunSnapshot, 'v' | 'savedAt' | 'runNo' | 'files' | 'drills' | 'sim'>

/** "RHK6570-R3" — the run's name on the NC files, programs, cut sheets and labels. */
export const runCode = (jobNumber: string | null, runNo: number) => `${jobNumber || 'JOB'}-R${runNo}`

/** The job's next run number. A counter (never max+1), so a deleted run's number
 *  is never handed out again — its NC files may still be on the server. */
export async function reserveRunNo(projectId: string): Promise<number> {
  const { data, error } = await supabase.rpc('next_nest_run_no', { p_project_id: projectId })
  if (error || typeof data !== 'number') throw new Error(`run number: ${error?.message ?? 'no number'}`)
  return data
}

export interface RunInput {
  runNo?: number | null; state: RunState
  files: SavedRunFile[]; drillsBySheet: Map<number, SheetDrill[]>; sim?: unknown
  savedAt?: string             // kept when a run file is put back
}

export function buildSnapshot(inp: RunInput): RunSnapshot {
  return {
    v: 2, savedAt: inp.savedAt ?? new Date().toISOString(), runNo: inp.runNo ?? null, ...inp.state,
    files: inp.files.map(({ gcode: _g, ...f }) => f),
    drills: [...inp.drillsBySheet],
    sim: inp.sim,
  }
}

/** Save a run. `replaceId` (the same layout generated again) is deleted first. */
export async function saveRun(inp: RunInput & { projectId: string; name: string; replaceId?: string | null }): Promise<{ id: string; savedAt: string }> {
  const { state } = inp
  const snapshot = buildSnapshot(inp)
  const savedAt = snapshot.savedAt
  if (inp.replaceId) await supabase.from('nest_jobs').delete().eq('id', inp.replaceId)   // sheets + placements cascade

  const { data: job, error: jErr } = await supabase.from('nest_jobs').insert({
    project_id: inp.projectId, project_ids: state.includedProjectIds, cnc_machine_id: state.machineId,
    status: 'complete', snapshot, generated_at: savedAt, name: inp.name,
  }).select('id').single()
  if (jErr || !job) throw new Error(jErr?.message ?? 'job insert failed')
  const jobId = (job as { id: string }).id

  const partProject = new Map(state.parts.map(p => [p.uid, p.project_id]))
  // O3: the part's outline in its own op frame (mm, origin bottom-left, y up,
  // FINISHED size, pre-rotation) — rotation / sheet_x / sheet_y place it.
  const partShape = new Map(state.parts.map(p => [p.uid, p.shape?.op_polygon?.length ? p.shape.op_polygon : null]))
  for (const [i, sheet] of state.nestResult.sheets.entries()) {
    const file = inp.files.find(f => f.sheetIndex === sheet.index)
    const { data: ns, error: sErr } = await supabase.from('nest_sheets').insert({
      nest_job_id: jobId, material_id: sheet.materialId, sheet_number: i + 1,
      efficiency: sheet.efficiency, gcode: file?.gcode ?? null,
      sheet_dx: sheet.stock.w, sheet_dy: sheet.stock.h, is_offcut: sheet.stock.isOffcut, sheet_label: sheet.stock.label,
    }).select('id').single()
    if (sErr || !ns) throw new Error(sErr?.message ?? 'sheet insert failed')
    if (!sheet.placements.length) continue
    const rows = sheet.placements.map(pl => {
      // uid = table:rowId[:n] (benchtop pieces carry a piece number) — the row id only.
      const [stbl, rowId] = pl.baseUid.split(':')
      return {
        nest_sheet_id: (ns as { id: string }).id,
        source_table: stbl, source_part_id: rowId,
        sheet_x: pl.x, sheet_y: pl.y, rotation: pl.rotated ? 90 : 0,
        cut_dx: pl.w, cut_dy: pl.h,
        part_label: pl.label, project_id: partProject.get(pl.baseUid) ?? inp.projectId, cut_quantity: 1,
        shape_polygon: partShape.get(pl.baseUid) ?? null,
      }
    })
    const { error: pErr } = await supabase.from('nest_placements').insert(rows)
    if (pErr) throw new Error(pErr.message)
  }
  return { id: jobId, savedAt }
}

/** Runs that include this project (as the initiating project or in a batch), newest first. */
export async function listRuns(projectId: string): Promise<RunListItem[]> {
  const { data, error } = await supabase.from('nest_jobs')
    .select('id,name,generated_at,project_ids,sheets:snapshot->nestResult->sheets,v:snapshot->v')
    .or(`project_id.eq.${projectId},project_ids.cs.{${projectId}}`)
    .order('generated_at', { ascending: false }).limit(50)
  if (error) throw new Error(error.message)
  return (data ?? [])
    .filter(r => (r as { v?: number }).v === 2)
    .map(r => {
      const row = r as { id: string; name: string | null; generated_at: string; project_ids: string[] | null; sheets: { placements: unknown[] }[] | null }
      return {
        id: row.id, name: row.name ?? 'Run', savedAt: row.generated_at,
        sheets: row.sheets?.length ?? 0, parts: (row.sheets ?? []).reduce((n, s) => n + s.placements.length, 0),
        batch: (row.project_ids?.length ?? 1) > 1,
      }
    })
}

export async function loadRun(id: string): Promise<{ name: string; snap: RunSnapshot; files: SavedRunFile[] }> {
  const { data: job, error } = await supabase.from('nest_jobs').select('name,snapshot').eq('id', id).single()
  if (error || !job) throw new Error(error?.message ?? 'run not found')
  const snap = (job as { snapshot: RunSnapshot }).snapshot
  if (snap?.v !== 2) throw new Error('This run was saved before runs could be reopened.')
  const { data: sheets } = await supabase.from('nest_sheets').select('sheet_number,gcode').eq('nest_job_id', id)
  const gcodeByNo = new Map((sheets ?? []).map(s => [s.sheet_number as number, (s.gcode as string | null) ?? '']))
  const files = snap.nestResult.sheets.flatMap((s, i) => {
    const f = snap.files.find(x => x.sheetIndex === s.index)
    const gcode = gcodeByNo.get(i + 1)
    return f && gcode ? [{ ...f, gcode }] : []
  })
  return { name: (job as { name: string | null }).name ?? 'Run', snap, files }
}

// ── Run file (backup) ─────────────────────────────────────────────────────────

const RUN_FILE_KIND = 'rhk-optimiser-run'

export interface RunFile {
  kind: typeof RUN_FILE_KIND; v: 1
  id: string | null; name: string; projectId: string; jobNumber: string | null
  snapshot: RunSnapshot
  gcode: [number, string][]    // sheetIndex → program
}

export function runFileName(jobNumber: string | null, runNo: number | null | undefined, savedAt: string): string {
  return `${runNo ? runCode(jobNumber, runNo) : `${jobNumber || 'JOB'} run ${savedAt.slice(0, 10)}`}.rhkrun`
}

export function runFileText(f: Omit<RunFile, 'kind' | 'v' | 'snapshot' | 'gcode'> & { run: RunInput }): string {
  const file: RunFile = {
    kind: RUN_FILE_KIND, v: 1, id: f.id, name: f.name, projectId: f.projectId, jobNumber: f.jobNumber,
    snapshot: buildSnapshot(f.run),
    gcode: f.run.files.map(x => [x.sheetIndex, x.gcode]),
  }
  return JSON.stringify(file)
}

export function parseRunFile(text: string): { file: RunFile; files: SavedRunFile[] } {
  let file: RunFile
  try { file = JSON.parse(text) } catch { throw new Error('That isn’t a run file.') }
  if (file?.kind !== RUN_FILE_KIND || file.snapshot?.v !== 2) throw new Error('That isn’t a run file.')
  const gcode = new Map(file.gcode)
  const files = file.snapshot.files.flatMap(f => gcode.has(f.sheetIndex) ? [{ ...f, gcode: gcode.get(f.sheetIndex)! }] : [])
  return { file, files }
}

/** Is this saved run still in the app? */
export async function runExists(id: string | null): Promise<boolean> {
  if (!id) return false
  const { data } = await supabase.from('nest_jobs').select('id').eq('id', id).maybeSingle()
  return !!data
}

export async function deleteRun(id: string): Promise<void> {
  const { error } = await supabase.from('nest_jobs').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
