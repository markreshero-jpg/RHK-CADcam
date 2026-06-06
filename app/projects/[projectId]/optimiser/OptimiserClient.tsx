'use client'

// ============================================================
// Panel Optimiser — standalone workspace at
// /projects/[projectId]/optimiser  (spec §5).
// Six-stage flow over a snapshot of the project's parts. Stages
// 1-2 (machine/tool + part selection) are implemented here;
// 3-6 are filled in by later build steps.
// ============================================================

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { ThemeToggle } from '@/app/ThemeToggle'
import { useOptiStore, type Stage } from '@/src/lib/optimiser/store'
import type { OptiSnapshot } from '@/src/lib/optimiser/types'

const STAGES: { n: Stage; label: string }[] = [
  { n: 1, label: 'Machine & Tool' },
  { n: 2, label: 'Parts' },
  { n: 3, label: 'Settings' },
  { n: 4, label: 'Nesting' },
  { n: 5, label: 'Editing' },
  { n: 6, label: 'G-code' },
]

const sel = 'bg-surface-2 border border-edge-strong rounded px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-accent'

export default function OptimiserClient({ snapshot }: { snapshot: OptiSnapshot }) {
  const init = useOptiStore(s => s.init)
  const stage = useOptiStore(s => s.stage)
  const setStage = useOptiStore(s => s.setStage)
  const maxStageReached = useOptiStore(s => s.maxStageReached)
  const machineId = useOptiStore(s => s.machineId)
  const selectedUids = useOptiStore(s => s.selectedUids)

  // Seed the store from the server snapshot once.
  useEffect(() => { init(snapshot) }, [init, snapshot])

  const canAdvance = useMemo(() => {
    if (stage === 1) return !!machineId
    if (stage === 2) return selectedUids.size > 0
    return true
  }, [stage, machineId, selectedUids])

  return (
    <div className="h-screen bg-canvas text-ink flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-none border-b border-edge px-6 py-3 flex items-center gap-3">
        <ThemeToggle />
        <Link href="/" className="text-ink-subtle hover:text-ink-muted text-sm transition-colors">← Projects</Link>
        <span className="text-ink-subtle">|</span>
        <span className="text-sm font-semibold text-ink">Panel Optimiser</span>
        <span className="text-xs text-ink-subtle ml-1">
          {snapshot.projectName}{snapshot.jobNumber ? ` · ${snapshot.jobNumber}` : ''}
        </span>
      </div>

      {/* Stepper */}
      <div className="flex-none border-b border-edge px-6 py-2.5 flex items-center gap-1">
        {STAGES.map((st, i) => {
          const reachable = st.n <= maxStageReached
          const active = st.n === stage
          return (
            <div key={st.n} className="flex items-center">
              <button
                disabled={!reachable}
                onClick={() => reachable && setStage(st.n)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  active ? 'bg-accent text-white'
                  : reachable ? 'text-ink-muted hover:bg-surface-2' : 'text-ink-subtle cursor-not-allowed'
                }`}>
                <span className={`w-5 h-5 rounded-full grid place-items-center text-[10px] font-semibold ${
                  active ? 'bg-white/25' : 'bg-surface-3 text-ink-subtle'
                }`}>{st.n}</span>
                {st.label}
              </button>
              {i < STAGES.length - 1 && <span className="text-ink-subtle mx-0.5">›</span>}
            </div>
          )
        })}
      </div>

      {/* Stage body */}
      <div className="flex-1 overflow-hidden">
        {stage === 1 && <Stage1Machine />}
        {stage === 2 && <Stage2Parts />}
        {stage === 3 && <StagePlaceholder n={3} title="Pre-optimisation settings" note="Sheet stock, kerf, pad, rotation and quality — built in the next step." />}
        {stage === 4 && <StagePlaceholder n={4} title="Auto-nesting" note="NFP + simulated-annealing nesting engine — built in the next step." />}
        {stage === 5 && <StagePlaceholder n={5} title="Manual editing" note="Interactive SVG sheet canvas with drag/drop and clipboard — built in the next step." />}
        {stage === 6 && <StagePlaceholder n={6} title="G-code generation" note="Per-sheet export + snapshot save — built in the next step." />}
      </div>

      {/* Footer nav */}
      <div className="flex-none border-t border-edge px-6 py-3 flex items-center justify-between">
        <button
          disabled={stage === 1}
          onClick={() => setStage((stage - 1) as Stage)}
          className="px-4 py-1.5 text-xs rounded-lg border border-edge-strong text-ink-muted hover:bg-surface-2 disabled:opacity-40 transition-colors">
          ← Back
        </button>
        <span className="text-[11px] text-ink-subtle">Stage {stage} of 6</span>
        <button
          disabled={stage === 6 || !canAdvance}
          onClick={() => setStage((stage + 1) as Stage)}
          className="px-4 py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-40 transition-colors">
          Next →
        </button>
      </div>
    </div>
  )
}

// ── Stage 1 — Machine & cutting profile ───────────────────────────────────────────
function Stage1Machine() {
  const snap = useOptiStore(s => s.snapshot)!
  const machineId = useOptiStore(s => s.machineId)
  const profileId = useOptiStore(s => s.profileId)
  const setMachine = useOptiStore(s => s.setMachine)
  const setProfile = useOptiStore(s => s.setProfile)
  const machineProfiles = snap.profiles.filter(p => p.cnc_machine_id === machineId)

  return (
    <div className="h-full overflow-y-auto px-8 py-6 max-w-3xl">
      <h2 className="text-sm font-semibold text-ink mb-1">Machine &amp; Tool Setup</h2>
      <p className="text-xs text-ink-subtle mb-6">Choose the CNC machine and cutting profile this run will be posted for.</p>

      {snap.machines.length === 0 ? (
        <p className="text-xs text-amber-500">No CNC machines configured. Add one in Settings → CNC → CNC Machine Setup.</p>
      ) : (
        <div className="space-y-6 max-w-md">
          <div>
            <label className="block text-xs text-ink-muted mb-1">CNC machine</label>
            <select className={`${sel} w-full`} value={machineId ?? ''} onChange={e => setMachine(e.target.value || null)}>
              {snap.machines.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.table_dx && m.table_dy ? ` · ${m.table_dx}×${m.table_dy}mm` : ''}{m.is_default ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1">Cutting profile</label>
            <select className={`${sel} w-full`} value={profileId ?? ''} onChange={e => setProfile(e.target.value || null)} disabled={machineProfiles.length === 0}>
              {machineProfiles.length === 0 && <option value="">No profiles for this machine</option>}
              {machineProfiles.map(p => <option key={p.id} value={p.id}>{p.name}{p.is_default ? ' (default)' : ''}</option>)}
            </select>
            {machineProfiles.length === 0 && (
              <p className="text-[11px] text-ink-subtle mt-1">This machine has no cutting profiles yet. The run will use machine defaults.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Stage 2 — Project & part selection ────────────────────────────────────────────
function Stage2Parts() {
  const snap = useOptiStore(s => s.snapshot)!
  const filterRoomIds = useOptiStore(s => s.filterRoomIds)
  const filterCabinetIds = useOptiStore(s => s.filterCabinetIds)
  const filterMaterialIds = useOptiStore(s => s.filterMaterialIds)
  const setFilterRooms = useOptiStore(s => s.setFilterRooms)
  const setFilterCabinets = useOptiStore(s => s.setFilterCabinets)
  const setFilterMaterials = useOptiStore(s => s.setFilterMaterials)
  const selectedUids = useOptiStore(s => s.selectedUids)
  const togglePart = useOptiStore(s => s.togglePart)
  const setSelected = useOptiStore(s => s.setSelected)
  const cutQty = useOptiStore(s => s.cutQty)
  const setCutQty = useOptiStore(s => s.setCutQty)

  const matName = useMemo(() => new Map(snap.materials.map(m => [m.id, m.name])), [snap.materials])
  // Cabinet filter options reflect the room filter.
  const cabOptions = useMemo(
    () => snap.cabinets.filter(c => filterRoomIds.length === 0 || filterRoomIds.includes(c.room_id)),
    [snap.cabinets, filterRoomIds],
  )

  const filtered = useMemo(() => snap.parts.filter(p =>
    (filterRoomIds.length === 0 || filterRoomIds.includes(p.room_id)) &&
    (filterCabinetIds.length === 0 || filterCabinetIds.includes(p.cabinet_instance_id)) &&
    (filterMaterialIds.length === 0 || (p.material_id != null && filterMaterialIds.includes(p.material_id))),
  ), [snap.parts, filterRoomIds, filterCabinetIds, filterMaterialIds])

  const selectedParts = snap.parts.filter(p => selectedUids.has(p.uid))
  const totalArea = selectedParts.reduce((a, p) => a + (p.w * p.h * (cutQty[p.uid] ?? 1)) / 1e6, 0)

  function selectAllShown() { setSelected([...new Set([...selectedUids, ...filtered.map(p => p.uid)])]) }
  function deselectAllShown() {
    const shown = new Set(filtered.map(p => p.uid))
    setSelected([...selectedUids].filter(u => !shown.has(u)))
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Filters */}
      <div className="flex-none px-8 pt-5 pb-3 space-y-3 border-b border-edge">
        <ChipFilter label="Rooms" options={snap.rooms.map(r => ({ id: r.id, label: r.name }))} selected={filterRoomIds} onChange={setFilterRooms} />
        <ChipFilter label="Cabinets" options={cabOptions.map(c => ({ id: c.id, label: c.label }))} selected={filterCabinetIds} onChange={setFilterCabinets} />
        <ChipFilter label="Materials" options={snap.materials.map(m => ({ id: m.id, label: m.name }))} selected={filterMaterialIds} onChange={setFilterMaterials} />
      </div>

      {/* Actions + summary */}
      <div className="flex-none px-8 py-2 flex items-center gap-3 text-xs border-b border-edge">
        <button onClick={selectAllShown} className="px-2.5 py-1 rounded border border-edge-strong text-ink-muted hover:bg-surface-2 transition-colors">Select shown</button>
        <button onClick={deselectAllShown} className="px-2.5 py-1 rounded border border-edge-strong text-ink-muted hover:bg-surface-2 transition-colors">Deselect shown</button>
        <span className="ml-auto text-ink-subtle">
          {selectedUids.size} part{selectedUids.size === 1 ? '' : 's'} selected · {totalArea.toFixed(2)} m² · showing {filtered.length} of {snap.parts.length}
        </span>
      </div>

      {/* Part table */}
      <div className="flex-1 overflow-y-auto px-8 py-2">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-canvas">
            <tr className="text-ink-subtle text-left">
              <th className="py-2 w-8"></th>
              <th className="py-2 font-medium">Part</th>
              <th className="py-2 font-medium">Cabinet</th>
              <th className="py-2 font-medium">Room</th>
              <th className="py-2 font-medium text-right">W×H (mm)</th>
              <th className="py-2 font-medium text-right">Thk</th>
              <th className="py-2 font-medium">Material</th>
              <th className="py-2 font-medium text-right pr-2">Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge/60">
            {filtered.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-ink-subtle">No parts match the current filters.</td></tr>}
            {filtered.map(p => {
              const on = selectedUids.has(p.uid)
              return (
                <tr key={p.uid} className={`hover:bg-surface/60 ${on ? '' : 'opacity-55'}`}>
                  <td className="py-1.5"><input type="checkbox" checked={on} onChange={() => togglePart(p.uid)} /></td>
                  <td className="py-1.5 text-ink">{p.label}</td>
                  <td className="py-1.5 text-ink-muted">{p.cabinet_label}</td>
                  <td className="py-1.5 text-ink-muted">{p.room_name}</td>
                  <td className="py-1.5 text-right font-mono text-ink-muted">{Math.round(p.w)}×{Math.round(p.h)}</td>
                  <td className="py-1.5 text-right font-mono text-ink-muted">{p.thickness}</td>
                  <td className="py-1.5 text-ink-muted">{p.material_id ? (matName.get(p.material_id) ?? '—') : <span className="text-amber-600">none</span>}</td>
                  <td className="py-1.5 text-right pr-2">
                    <input type="number" min={0} value={cutQty[p.uid] ?? 1} disabled={!on}
                      onChange={e => setCutQty(p.uid, parseInt(e.target.value) || 0)}
                      className="w-14 bg-surface-2 border border-edge-strong rounded px-1.5 py-0.5 text-right font-mono text-ink disabled:opacity-40 focus:outline-none focus:border-accent" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Multi-select chip row. Empty selection = "All".
function ChipFilter({ label, options, selected, onChange }: {
  label: string; options: { id: string; label: string }[]; selected: string[]; onChange: (ids: string[]) => void
}) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  }
  return (
    <div className="flex items-start gap-3">
      <span className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wider w-16 shrink-0 pt-1.5">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => onChange([])}
          className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${selected.length === 0 ? 'bg-accent text-white' : 'bg-surface-2 text-ink-muted hover:text-ink'}`}>All</button>
        {options.map(o => (
          <button key={o.id} onClick={() => toggle(o.id)}
            className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${selected.includes(o.id) ? 'bg-accent text-white' : 'bg-surface-2 text-ink-muted hover:text-ink'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function StagePlaceholder({ n, title, note }: { n: number; title: string; note: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-8">
      <span className="w-10 h-10 rounded-xl bg-surface-2 border border-edge-strong grid place-items-center text-ink-subtle text-sm font-semibold">{n}</span>
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="text-xs text-ink-subtle max-w-sm">{note}</p>
    </div>
  )
}
