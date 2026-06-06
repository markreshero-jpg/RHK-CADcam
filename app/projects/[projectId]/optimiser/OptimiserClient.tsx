'use client'

// ============================================================
// Panel Optimiser — standalone workspace at
// /projects/[projectId]/optimiser  (spec §5).
// Six-stage flow over a snapshot of the project's parts. Stages
// 1-2 (machine/tool + part selection) are implemented here;
// 3-6 are filled in by later build steps.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ThemeToggle } from '@/app/ThemeToggle'
import { useOptiStore, type Stage } from '@/src/lib/optimiser/store'
import type { OptiSnapshot } from '@/src/lib/optimiser/types'
import { materialGroupKey } from '@/src/lib/optimiser/types'
import { nest, type NestPartInput, type GroupStock, type SheetStock } from '@/src/lib/optimiser/nest'
import { loadProjectParts } from '@/src/lib/optimiser/loadClient'
import SheetSVG from './SheetSVG'
import Stage5Edit from './Stage5Edit'
import Stage6Gcode from './Stage6Gcode'

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
        {stage === 3 && <Stage3Settings />}
        {stage === 4 && <Stage4Nesting />}
        {stage === 5 && <Stage5Edit />}
        {stage === 6 && <Stage6Gcode />}
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
  const includedProjectIds = useOptiStore(s => s.includedProjectIds)
  const mergeProjectData = useOptiStore(s => s.mergeProjectData)
  const removeProjectData = useOptiStore(s => s.removeProjectData)
  const [addingProject, setAddingProject] = useState(false)
  const isBatch = includedProjectIds.length > 1

  async function addProject(id: string) {
    if (!id || includedProjectIds.includes(id)) return
    setAddingProject(true)
    try { mergeProjectData(id, await loadProjectParts(id)) }
    finally { setAddingProject(false) }
  }

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
      {/* Batch projects */}
      <div className="flex-none px-8 pt-4 pb-2 flex items-center gap-2 flex-wrap border-b border-edge">
        <span className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wider w-16 shrink-0">Projects</span>
        {includedProjectIds.map(id => {
          const pr = snap.allProjects.find(p => p.id === id)
          const isInitiating = id === snap.projectId
          return (
            <span key={id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/15 text-accent-ink text-[11px]">
              {pr?.job_number ? `${pr.job_number} · ` : ''}{pr?.name ?? 'Project'}
              {!isInitiating && <button onClick={() => removeProjectData(id)} className="hover:text-red-400">✕</button>}
            </span>
          )
        })}
        <select disabled={addingProject} value="" onChange={e => addProject(e.target.value)}
          className="bg-surface-2 border border-edge-strong rounded px-2 py-1 text-[11px] text-ink-muted focus:outline-none focus:border-accent">
          <option value="">{addingProject ? 'Loading…' : '+ Add project to batch'}</option>
          {snap.allProjects.filter(p => !includedProjectIds.includes(p.id)).map(p => (
            <option key={p.id} value={p.id}>{p.job_number ? `${p.job_number} · ` : ''}{p.name}</option>
          ))}
        </select>
      </div>

      {/* Filters */}
      <div className="flex-none px-8 pt-3 pb-3 space-y-3 border-b border-edge">
        <ChipFilter label="Rooms" options={snap.rooms.map(r => ({ id: r.id, label: isBatch ? `${snap.parts.find(p => p.room_id === r.id)?.job_number ?? ''} ${r.name}`.trim() : r.name }))} selected={filterRoomIds} onChange={setFilterRooms} />
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
                  <td className="py-1.5 text-ink-muted">{isBatch && p.job_number ? <span className="text-ink-subtle">{p.job_number} · </span> : null}{p.room_name}</td>
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

// Material groups present in the current selection.
function useSelectedGroups() {
  const snap = useOptiStore(s => s.snapshot)!
  const selectedUids = useOptiStore(s => s.selectedUids)
  return useMemo(() => {
    const matName = new Map(snap.materials.map(m => [m.id, m.name]))
    const map = new Map<string, { key: string; materialId: string | null; thickness: number; name: string; count: number }>()
    for (const p of snap.parts) {
      if (!selectedUids.has(p.uid)) continue
      const key = materialGroupKey(p.material_id, p.thickness)
      const g = map.get(key)
      if (g) g.count++
      else map.set(key, {
        key, materialId: p.material_id, thickness: p.thickness,
        name: `${p.material_id ? (matName.get(p.material_id) ?? 'Material') : 'No material'} · ${p.thickness}mm`,
        count: 1,
      })
    }
    return [...map.values()]
  }, [snap, selectedUids])
}

function seedStock(snap: OptiSnapshot, materialId: string | null): SheetStock {
  const m = materialId ? snap.materials.find(x => x.id === materialId) : null
  return {
    w: m?.sheet_dx ?? 2400, h: m?.sheet_dy ?? 1200,
    trimTop: m?.trim_top ?? 0, trimBottom: m?.trim_bottom ?? 0,
    trimLeft: m?.trim_left ?? 0, trimRight: m?.trim_right ?? 0,
    isOffcut: false, label: null,
  }
}

// ── Stage 3 — Pre-optimisation settings ───────────────────────────────────────────
function Stage3Settings() {
  const snap = useOptiStore(s => s.snapshot)!
  const settings = useOptiStore(s => s.settings)
  const setSettings = useOptiStore(s => s.setSettings)
  const stock = useOptiStore(s => s.stock)
  const ensureStock = useOptiStore(s => s.ensureStock)
  const setStock = useOptiStore(s => s.setStock)
  const addOffcut = useOptiStore(s => s.addOffcut)
  const removeOffcut = useOptiStore(s => s.removeOffcut)
  const groups = useSelectedGroups()

  useEffect(() => { for (const g of groups) ensureStock(g.key, seedStock(snap, g.materialId)) }, [groups, ensureStock, snap])

  return (
    <div className="h-full overflow-y-auto px-8 py-6 max-w-4xl space-y-7">
      {/* Global settings */}
      <div>
        <h2 className="text-sm font-semibold text-ink mb-3">Optimisation Settings</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 max-w-xl">
          <NumSetting label="Kerf (mm)" value={settings.kerf} onChange={v => setSettings({ kerf: v })} />
          <NumSetting label="Pad / gap (mm)" value={settings.pad} onChange={v => setSettings({ pad: v })} />
          <div className="col-span-2 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-ink">Allow rotation</p>
              <p className="text-[11px] text-ink-subtle">Test 90° turns for non-grained materials. Grained sheets stay grain-locked.</p>
            </div>
            <button onClick={() => setSettings({ allowRotation: !settings.allowRotation })}
              className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${settings.allowRotation ? 'bg-accent' : 'bg-surface-3'}`}>
              <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white transition-transform ${settings.allowRotation ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <div className="col-span-2">
            <p className="text-xs font-medium text-ink mb-1.5">Quality</p>
            <div className="inline-flex rounded-lg border border-edge-strong overflow-hidden">
              {(['fast', 'balanced', 'best'] as const).map(q => (
                <button key={q} onClick={() => setSettings({ quality: q })}
                  className={`px-4 py-1.5 text-xs capitalize transition-colors ${settings.quality === q ? 'bg-accent text-white' : 'bg-surface-2 text-ink-muted hover:text-ink'}`}>
                  {q}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-ink-subtle mt-1">
              {settings.quality === 'fast' ? 'Single pass — fastest.' : settings.quality === 'balanced' ? 'Light annealing (~8 passes).' : 'Full annealing (~40 passes).'}
            </p>
          </div>
        </div>
      </div>

      {/* Sheet stock per material group */}
      <div>
        <h3 className="text-sm font-semibold text-ink mb-3">Sheet Stock</h3>
        {groups.length === 0 ? (
          <p className="text-xs text-ink-subtle">No parts selected.</p>
        ) : (
          <div className="space-y-3">
            {groups.map(g => {
              const gs = stock[g.key]
              if (!gs) return null
              return (
                <div key={g.key} className="border border-edge-strong rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-medium text-ink">{g.name} <span className="text-ink-subtle">· {g.count} parts</span></p>
                    <button onClick={() => addOffcut(g.key, { ...seedStock(snap, g.materialId), w: 1200, h: 600, isOffcut: true, label: `Offcut ${gs.offcuts.length + 1}` })}
                      className="text-[11px] px-2 py-1 rounded border border-edge-strong text-ink-muted hover:bg-surface-2 transition-colors">+ Offcut</button>
                  </div>
                  <div className="grid grid-cols-6 gap-3">
                    <MiniNum label="Sheet W" value={gs.standard.w} onChange={v => setStock(g.key, { w: v })} />
                    <MiniNum label="Sheet H" value={gs.standard.h} onChange={v => setStock(g.key, { h: v })} />
                    <MiniNum label="Trim T" value={gs.standard.trimTop} onChange={v => setStock(g.key, { trimTop: v })} />
                    <MiniNum label="Trim B" value={gs.standard.trimBottom} onChange={v => setStock(g.key, { trimBottom: v })} />
                    <MiniNum label="Trim L" value={gs.standard.trimLeft} onChange={v => setStock(g.key, { trimLeft: v })} />
                    <MiniNum label="Trim R" value={gs.standard.trimRight} onChange={v => setStock(g.key, { trimRight: v })} />
                  </div>
                  {gs.offcuts.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {gs.offcuts.map((o, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                          <span className="text-ink-subtle w-16">{o.label}</span>
                          <span className="font-mono text-ink-muted">{o.w}×{o.h}mm</span>
                          <button onClick={() => removeOffcut(g.key, i)} className="text-ink-subtle hover:text-red-400 ml-2">remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Stage 4 — Auto-nesting ────────────────────────────────────────────────────────
function Stage4Nesting() {
  const snap = useOptiStore(s => s.snapshot)!
  const selectedUids = useOptiStore(s => s.selectedUids)
  const cutQty = useOptiStore(s => s.cutQty)
  const settings = useOptiStore(s => s.settings)
  const stock = useOptiStore(s => s.stock)
  const nestResult = useOptiStore(s => s.nestResult)
  const nesting = useOptiStore(s => s.nesting)
  const setNestResult = useOptiStore(s => s.setNestResult)
  const setNesting = useOptiStore(s => s.setNesting)
  const setPartIndex = useOptiStore(s => s.setPartIndex)
  const includedProjectIds = useOptiStore(s => s.includedProjectIds)

  const matById = useMemo(() => new Map(snap.materials.map(m => [m.id, m])), [snap.materials])

  function run() {
    const isBatch = includedProjectIds.length > 1
    setNesting(true)
    // Defer so the button can repaint to "Nesting…" before a long "best" pass.
    setTimeout(() => {
      const parts: NestPartInput[] = []
      const index: Record<string, NestPartInput> = {}
      for (const p of snap.parts) {
        if (!selectedUids.has(p.uid)) continue
        const qty = cutQty[p.uid] ?? 1
        const grainLock = !!(p.material_id && matById.get(p.material_id)?.has_grain)
        const label = isBatch && p.job_number ? `${p.job_number} ${p.label}` : p.label
        for (let i = 0; i < qty; i++) {
          const inst: NestPartInput = { uid: `${p.uid}#${i}`, baseUid: p.uid, label, w: p.w, h: p.h, thickness: p.thickness, materialId: p.material_id, grainLock, priority: p.nest_priority }
          parts.push(inst); index[inst.uid] = inst
        }
      }
      setPartIndex(index)
      setNestResult(nest(parts, stock as Record<string, GroupStock>, settings))
      setNesting(false)
    }, 20)
  }

  const overall = useMemo(() => {
    if (!nestResult) return null
    let placed = 0, area = 0
    for (const s of nestResult.sheets) {
      const u = (s.stock.w - s.stock.trimLeft - s.stock.trimRight) * (s.stock.h - s.stock.trimTop - s.stock.trimBottom)
      area += u
      placed += s.placements.reduce((a, p) => a + p.w * p.h, 0)
    }
    return { sheets: nestResult.sheets.length, eff: area ? placed / area : 0, unplaced: nestResult.unplaced.length }
  }, [nestResult])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-none px-8 py-3 flex items-center gap-4 border-b border-edge">
        <button onClick={run} disabled={nesting || selectedUids.size === 0}
          className="px-4 py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
          {nesting ? 'Nesting…' : nestResult ? 'Re-nest' : 'Run nesting'}
        </button>
        {overall && (
          <span className="text-xs text-ink-muted">
            {overall.sheets} sheet{overall.sheets === 1 ? '' : 's'} · {(overall.eff * 100).toFixed(1)}% efficiency
            {overall.unplaced > 0 && <span className="text-amber-500"> · {overall.unplaced} unplaced</span>}
          </span>
        )}
        <span className="ml-auto text-[11px] text-ink-subtle capitalize">{settings.quality} quality</span>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-5">
        {!nestResult ? (
          <p className="text-xs text-ink-subtle text-center py-12">Run nesting to lay parts out on sheets.</p>
        ) : (
          <>
            {nestResult.unplaced.length > 0 && (
              <p className="text-[11px] text-amber-500 mb-4">
                {nestResult.unplaced.length} part(s) too large for any configured sheet/offcut: {[...new Set(nestResult.unplaced.map(u => u.label))].slice(0, 6).join(', ')}{nestResult.unplaced.length > 6 ? '…' : ''}
              </p>
            )}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-5">
              {nestResult.sheets.map(s => (
                <div key={s.index} className="space-y-1.5">
                  <SheetSVG sheet={s} pxWidth={230} />
                  <p className="text-[11px] text-ink-muted flex justify-between">
                    <span>Sheet {s.index + 1}{s.stock.isOffcut ? ` · ${s.stock.label ?? 'offcut'}` : ''}</span>
                    <span className="font-mono">{(s.efficiency * 100).toFixed(0)}% · {s.placements.length}</span>
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function NumSetting({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-xs text-ink-muted mb-1">{label}</label>
      <input type="number" step="any" defaultValue={value} key={value}
        onBlur={e => { const n = parseFloat(e.target.value); if (Number.isFinite(n)) onChange(n) }}
        className={`${sel} w-full`} />
    </div>
  )
}

function MiniNum({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-[10px] text-ink-subtle uppercase tracking-wide mb-1">{label}</label>
      <input type="number" step="any" defaultValue={value} key={value}
        onBlur={e => { const n = parseFloat(e.target.value); if (Number.isFinite(n)) onChange(n) }}
        className="w-full bg-surface-2 border border-edge-strong rounded px-2 py-1 text-xs text-ink font-mono focus:outline-none focus:border-accent" />
    </div>
  )
}

