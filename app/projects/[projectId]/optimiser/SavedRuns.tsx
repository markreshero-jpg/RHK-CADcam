'use client'

// ============================================================
// Stage 1 — Saved runs (src/lib/optimiser/savedRuns.ts). Every G-code
// generation saves its run; reopening one puts the workspace back as it was
// (layout, holes, programs) and jumps to Labels & Cut Sheets — for when you
// left the optimiser before printing labels.
// ============================================================

import { useEffect, useState } from 'react'
import { useOptiStore } from '@/src/lib/optimiser/store'
import { listRuns, loadRun, deleteRun, type RunListItem } from '@/src/lib/optimiser/savedRuns'
import { loadProjectParts } from '@/src/lib/optimiser/loadClient'

const when = (iso: string) => {
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`
}

export default function SavedRuns() {
  const projectId = useOptiStore(s => s.snapshot!.projectId)
  const savedRun = useOptiStore(s => s.savedRun)
  const [runs, setRuns] = useState<RunListItem[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let dead = false
    listRuns(projectId).then(r => { if (!dead) setRuns(r) }).catch(e => { if (!dead) setError(String(e instanceof Error ? e.message : e)) })
    return () => { dead = true }
  }, [projectId, savedRun?.id])

  async function reopen(id: string) {
    setBusy(id); setError(null)
    try {
      const { name, snap: rs, files } = await loadRun(id)
      const store = useOptiStore.getState()
      // Batch runs: bring the run's projects in (and drop any others) before the layout lands.
      for (const pid of store.includedProjectIds) if (!rs.includedProjectIds.includes(pid)) store.removeProjectData(pid)
      for (const pid of rs.includedProjectIds) {
        if (!useOptiStore.getState().includedProjectIds.includes(pid)) store.mergeProjectData(pid, await loadProjectParts(pid))
      }
      store.restoreRun(rs, {
        id, runNo: rs.runNo ?? null, name, savedAt: rs.savedAt, nest: rs.nestResult, files,
        drillsBySheet: new Map(rs.drills), sim: rs.sim,
      })
    } catch (e) {
      setError(`Couldn't reopen: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setBusy(null) }
  }

  async function remove(id: string) {
    setBusy(id); setError(null); setConfirmDel(null)
    try { await deleteRun(id); setRuns(r => r?.filter(x => x.id !== id) ?? null) }
    catch (e) { setError(`Couldn't delete: ${e instanceof Error ? e.message : String(e)}`) }
    finally { setBusy(null) }
  }

  return (
    <div className="mt-10 max-w-xl">
      <h3 className="text-xs font-semibold text-ink mb-1">Saved runs</h3>
      <p className="text-[11px] text-ink-subtle mb-3">
        Each time G-code is generated (Stage 6) the run is saved with a number — RHK6570-R3 — that is also on its NC file names, program headers, cut sheets and labels. Reopen one to print its labels and cut sheets or download its programs again — no re-nesting.
      </p>
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      {!runs ? <p className="text-xs text-ink-subtle">Loading…</p>
        : !runs.length ? <p className="text-xs text-ink-subtle">No saved runs for this job yet.</p>
        : (
          <div className="space-y-1.5">
            {runs.map(r => {
              const open = savedRun?.id === r.id
              return (
                <div key={r.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${open ? 'border-accent bg-accent/10' : 'border-edge-strong'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-ink truncate">{r.name}</div>
                    <div className="text-[11px] text-ink-subtle">{when(r.savedAt)} · {r.sheets} sheet{r.sheets === 1 ? '' : 's'} · {r.parts} parts{r.batch ? ' · batch' : ''}</div>
                  </div>
                  {confirmDel === r.id ? <>
                    <button onClick={() => remove(r.id)} disabled={!!busy}
                      className="text-[11px] px-2 py-0.5 rounded border border-red-700/60 text-red-400 hover:bg-red-900/20 transition-colors">Delete</button>
                    <button onClick={() => setConfirmDel(null)}
                      className="text-[11px] px-2 py-0.5 rounded border border-edge-strong text-ink-muted hover:bg-surface-2 transition-colors">Keep</button>
                  </> : <>
                    <button onClick={() => reopen(r.id)} disabled={!!busy}
                      className="text-[11px] px-2.5 py-0.5 rounded bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
                      {busy === r.id ? 'Opening…' : open ? 'Open' : 'Reopen'}
                    </button>
                    <button onClick={() => setConfirmDel(r.id)} disabled={!!busy} title="Delete this saved run"
                      className="text-[11px] px-1.5 py-0.5 rounded text-ink-subtle hover:text-red-400 disabled:opacity-50 transition-colors">✕</button>
                  </>}
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}
