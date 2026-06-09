'use client'

// ============================================================
// Cabinet → Routes / Operations  (CabinetEditModal tab)
// Per-part CNC operations on the extended part_operations table.
// Operations are keyed by the STABLE identity
// (source_table, source_cabinet_id, source_part_key) because
// case_parts rows are regenerated on every resolve — see
// migration part_operations_stable_part_key. source_part_id is
// left null and resolved to the live row at G-code time.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/src/lib/supabase'
import type { CabinetInstance } from '@/src/lib/types'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import { svgCaseMeta, svgTkMeta, svgIntMeta, svgZoneMeta } from './cabinetEditSvgHelpers'
import OperationToolSelect, { type DrillLite } from '@/src/components/cnc/OperationToolSelect'
import { syncSeamDrillOperations } from '@/src/lib/optimiser/seamDrillSync'

const OP_TYPES = ['route', 'drill', 'pocket', 'saw', 'outline', 'square_off', 'profile', 'groove', 'raster'] as const
const FILL_STRATEGIES = ['raster', 'spiral_in', 'spiral_out'] as const
const AREA_OPS = ['pocket', 'outline', 'square_off', 'profile']
const FILL_OPS = ['pocket', 'raster']

type AddKind = 'single' | 'toolset' | 'drill' | 'groove'

interface PartOp {
  id: string
  source_table: string; source_cabinet_id: string | null; source_part_key: string | null
  operation_type: string
  router_tool_id: string | null; drill_id: string | null; auto_tool: boolean
  tool_set_id: string | null
  depth: number | null; diameter: number | null; width: number | null; length: number | null
  pos_x: number | null; pos_y: number | null
  repeat_count: number | null; repeat_spacing: number | null
  offset_top_mm: number | null; offset_bottom_mm: number | null
  offset_left_mm: number | null; offset_right_mm: number | null
  fill_strategy: string | null; raster_angle_deg: number | null; raster_stepover_pct: number | null
  output_to_cnc: boolean; sort_order: number
  parameters: Record<string, unknown> | null
}
interface ToolItem { id: string; name: string; tool_number: string | null }
interface ToolSetItem { id: string; name: string }
interface RoutablePart { table: string; key: string; label: string }

const dInp = 'bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500 w-full'
const dLbl = 'text-[10px] text-gray-500 uppercase tracking-wide mb-1 block'

export default function CabinetRoutesPanel({ cabinet, rp }: { cabinet: CabinetInstance; rp: ResolvedCabinet }) {
  const parts = useMemo<RoutablePart[]>(() => {
    const out: RoutablePart[] = []
    for (const p of rp.case_parts)     { const m = svgCaseMeta(p); out.push({ table: 'case_parts',     key: m.id, label: m.label }) }
    for (const p of rp.toekick_parts)  { const m = svgTkMeta(p);   out.push({ table: 'toekick_parts',  key: m.id, label: m.label }) }
    for (const p of rp.internal_parts) { const m = svgIntMeta(p);  out.push({ table: 'internal_parts', key: m.id, label: m.label }) }
    for (const z of rp.face_zones)     { const m = svgZoneMeta(z); out.push({ table: 'face_zones',     key: m.id, label: m.label }) }
    return out
  }, [rp])

  const [ops, setOps] = useState<PartOp[]>([])
  const [tools, setTools] = useState<ToolItem[]>([])
  const [drills, setDrills] = useState<DrillLite[]>([])
  const [toolSets, setToolSets] = useState<ToolSetItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedKey, setSelectedKey] = useState<string | null>(parts[0]?.key ?? null)
  const [expandedOp, setExpandedOp] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [opR, toolR, drillR, tsR] = await Promise.all([
        supabase.from('part_operations').select('*').eq('source_cabinet_id', cabinet.id),
        supabase.from('cnc_tools').select('id,name,tool_number').eq('active', true).order('tool_number', { nullsFirst: false }),
        supabase.from('cnc_drills').select('id,name,diameter').eq('is_active', true).order('diameter'),
        supabase.from('cnc_tool_sets').select('id,name').eq('is_active', true).order('sort_order').order('name'),
      ])
      if (cancelled) return
      setOps((opR.data ?? []) as PartOp[])
      setTools((toolR.data ?? []) as ToolItem[])
      setDrills((drillR.data ?? []) as DrillLite[])
      setToolSets((tsR.data ?? []) as ToolSetItem[])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [cabinet.id])

  const selectedPart = parts.find(p => p.key === selectedKey) ?? null
  const partOps = useMemo(
    () => ops.filter(o => o.source_part_key === selectedKey).sort((a, b) => a.sort_order - b.sort_order),
    [ops, selectedKey],
  )
  const opCountByKey = useMemo(() => {
    const m: Record<string, number> = {}
    for (const o of ops) if (o.source_part_key) m[o.source_part_key] = (m[o.source_part_key] ?? 0) + 1
    return m
  }, [ops])

  async function patchOp(id: string, changes: Partial<PartOp>) {
    setOps(prev => prev.map(o => o.id === id ? { ...o, ...changes } : o))
    const { error } = await supabase.from('part_operations').update(changes as Record<string, unknown>).eq('id', id)
    if (error) console.error('[part_operations] update', error)
  }

  async function addOp(kind: AddKind) {
    setAddOpen(false)
    if (!selectedPart) return
    const nextOrder = partOps.length ? Math.max(...partOps.map(o => o.sort_order)) + 1 : 0
    const base = {
      source_table: selectedPart.table,
      source_cabinet_id: cabinet.id,
      source_part_key: selectedPart.key,
      output_to_cnc: true,
      sort_order: nextOrder,
    }
    let extra: Record<string, unknown>
    switch (kind) {
      case 'single':  extra = { operation_type: 'pocket', auto_tool: true }; break
      case 'toolset': extra = { operation_type: 'pocket', tool_set_id: toolSets[0]?.id ?? null }; break
      case 'drill':   extra = { operation_type: 'drill', auto_tool: true, repeat_count: 1, repeat_spacing: 32, diameter: 5, depth: 10, pos_x: 0, pos_y: 0 }; break
      case 'groove':  extra = { operation_type: 'groove', auto_tool: true, width: 8, depth: 6, pos_x: 0, pos_y: 0 }; break
    }
    const { data, error } = await supabase.from('part_operations').insert({ ...base, ...extra }).select().single()
    if (error || !data) { alert(`Add operation failed: ${error?.message}`); return }
    setOps(p => [...p, data as PartOp])
    setExpandedOp((data as PartOp).id)
  }

  async function deleteOp(id: string) {
    const { error } = await supabase.from('part_operations').delete().eq('id', id)
    if (error) { alert(`Delete failed: ${error.message}`); return }
    setOps(p => p.filter(o => o.id !== id))
    if (expandedOp === id) setExpandedOp(null)
  }

  // Trigger A: regenerate this cabinet's seam-joint drilling rows, then reload.
  // Only the generated rows are replaced — hand-added operations are untouched.
  async function regenJointDrills() {
    setSyncing(true); setSyncMsg(null)
    try {
      const { written, skipped } = await syncSeamDrillOperations(cabinet.id)
      const { data } = await supabase.from('part_operations').select('*').eq('source_cabinet_id', cabinet.id)
      setOps((data ?? []) as PartOp[])
      setSyncMsg(`${written} hole${written === 1 ? '' : 's'} generated${skipped ? ` · ${skipped} edge holes skipped` : ''}`)
    } catch {
      setSyncMsg('Regenerate failed — see console')
    } finally { setSyncing(false) }
  }

  if (loading) {
    return <div className="h-full flex items-center justify-center text-xs text-gray-500">Loading operations…</div>
  }

  return (
    <div className="h-full overflow-y-auto p-5 text-gray-200">
      <div className="max-w-3xl space-y-4">
        {/* Joint drilling bridge */}
        <div className="flex items-center gap-3 pb-3 border-b border-gray-800">
          <button onClick={regenJointDrills} disabled={syncing}
            className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-200 rounded transition-colors whitespace-nowrap">
            {syncing ? 'Regenerating…' : '↻ Regenerate joint drilling'}
          </button>
          <span className="text-[11px] text-gray-500">
            {syncMsg ?? 'Generates drill holes from this cabinet’s assigned joints.'}
          </span>
        </div>

        {/* Part selector */}
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className={dLbl}>Part</label>
            <select className={dInp} value={selectedKey ?? ''} onChange={e => { setSelectedKey(e.target.value || null); setExpandedOp(null) }}>
              {parts.length === 0 && <option value="">No routable parts</option>}
              {parts.map(p => (
                <option key={p.key} value={p.key}>
                  {p.label}{opCountByKey[p.key] ? `  (${opCountByKey[p.key]})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="relative">
            <button onClick={() => setAddOpen(o => !o)} disabled={!selectedPart}
              className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded transition-colors whitespace-nowrap">
              + Add operation ▾
            </button>
            {addOpen && (
              <div className="absolute right-0 mt-1 z-10 w-40 bg-gray-800 border border-gray-700 rounded shadow-xl py-1">
                {([['single', 'Single operation'], ['toolset', 'Tool set'], ['drill', 'Drill pattern'], ['groove', 'Groove']] as [AddKind, string][]).map(([k, lbl]) => (
                  <button key={k} onClick={() => addOp(k)} className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 transition-colors">{lbl}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Operations */}
        {partOps.length === 0 ? (
          <p className="text-xs text-gray-500 py-6 text-center border border-dashed border-gray-700 rounded">
            No operations on this part yet.
          </p>
        ) : (
          <div className="space-y-2">
            {partOps.map(op => {
              const isOpen = expandedOp === op.id
              const isArea = AREA_OPS.includes(op.operation_type)
              const isFill = FILL_OPS.includes(op.operation_type)
              const isDrill = op.operation_type === 'drill'
              const isGroove = op.operation_type === 'groove'
              return (
                <div key={op.id} className="border border-gray-700 rounded bg-gray-800/40">
                  {/* Summary row */}
                  <div className="flex items-center gap-2 px-2.5 py-1.5">
                    <button onClick={() => setExpandedOp(isOpen ? null : op.id)} className="text-gray-500 w-4">{isOpen ? '▾' : '▸'}</button>
                    <input type="number" title="Sort order" className={`${dInp} w-12 text-center`} defaultValue={op.sort_order} key={`so-${op.sort_order}`}
                      onBlur={e => patchOp(op.id, { sort_order: parseInt(e.target.value) || 0 })} />
                    <select className={`${dInp} w-28`} value={op.operation_type} onChange={e => patchOp(op.id, { operation_type: e.target.value })}>
                      {OP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <span className="flex-1 text-[11px] text-gray-400 truncate">
                      {op.tool_set_id ? `set: ${toolSets.find(s => s.id === op.tool_set_id)?.name ?? '—'}`
                        : op.auto_tool ? 'auto tool'
                        : op.drill_id ? (drills.find(d => d.id === op.drill_id)?.name ?? 'drill')
                        : op.router_tool_id ? (tools.find(t => t.id === op.router_tool_id)?.name ?? 'tool')
                        : op.depth != null ? `${op.depth}mm deep` : ''}
                    </span>
                    <button onClick={() => patchOp(op.id, { output_to_cnc: !op.output_to_cnc })}
                      title="Include in CNC output"
                      className={`px-1.5 py-0.5 rounded border text-[10px] transition-colors ${
                        op.output_to_cnc ? 'border-emerald-700 text-emerald-400 hover:bg-emerald-900/30' : 'border-gray-700 text-gray-600 hover:text-gray-400'}`}>
                      CNC
                    </button>
                    <button onClick={() => deleteOp(op.id)} className="text-gray-600 hover:text-red-400 text-base leading-none px-1">×</button>
                  </div>

                  {/* Expanded params */}
                  {isOpen && (
                    <div className="px-9 pb-3 pt-1 grid grid-cols-4 gap-x-3 gap-y-2.5 border-t border-gray-700/60">
                      {/* Tool set / tool */}
                      <div>
                        <label className={dLbl}>Tool set</label>
                        <select className={dInp} value={op.tool_set_id ?? ''} onChange={e => patchOp(op.id, { tool_set_id: e.target.value || null })}>
                          <option value="">— none —</option>
                          {toolSets.map(ts => <option key={ts.id} value={ts.id}>{ts.name}</option>)}
                        </select>
                      </div>
                      {!op.tool_set_id && (
                        <div>
                          <label className={dLbl}>Tool</label>
                          <OperationToolSelect
                            operationType={op.operation_type}
                            value={{ router_tool_id: op.router_tool_id, drill_id: op.drill_id, auto_tool: op.auto_tool }}
                            tools={tools} drills={drills}
                            onChange={v => patchOp(op.id, v)}
                            className={dInp} />
                        </div>
                      )}
                      <Num label="Depth (mm)" value={op.depth} onSave={v => patchOp(op.id, { depth: v })} />

                      {isDrill && <>
                        <Num label="Hole ⌀ (mm)" value={op.diameter} onSave={v => patchOp(op.id, { diameter: v })} />
                        <Num label="Holes" value={op.repeat_count} integer onSave={v => patchOp(op.id, { repeat_count: v })} />
                        <Num label="Spacing (mm)" value={op.repeat_spacing} onSave={v => patchOp(op.id, { repeat_spacing: v })} />
                        <Num label="Start X (mm)" value={op.pos_x} onSave={v => patchOp(op.id, { pos_x: v })} />
                        <Num label="Start Y (mm)" value={op.pos_y} onSave={v => patchOp(op.id, { pos_y: v })} />
                      </>}

                      {isGroove && <>
                        <Num label="Start X (mm)" value={op.pos_x} onSave={v => patchOp(op.id, { pos_x: v })} />
                        <Num label="Start Y (mm)" value={op.pos_y} onSave={v => patchOp(op.id, { pos_y: v })} />
                        <Num label="Length (mm)" value={op.length} onSave={v => patchOp(op.id, { length: v })} />
                        <Num label="Width (mm)" value={op.width} onSave={v => patchOp(op.id, { width: v })} />
                      </>}

                      {isArea && <>
                        <Num label="Off top (mm)"    value={op.offset_top_mm}    onSave={v => patchOp(op.id, { offset_top_mm: v })} />
                        <Num label="Off bottom (mm)" value={op.offset_bottom_mm} onSave={v => patchOp(op.id, { offset_bottom_mm: v })} />
                        <Num label="Off left (mm)"   value={op.offset_left_mm}   onSave={v => patchOp(op.id, { offset_left_mm: v })} />
                        <Num label="Off right (mm)"  value={op.offset_right_mm}  onSave={v => patchOp(op.id, { offset_right_mm: v })} />
                      </>}

                      {isFill && <>
                        <div>
                          <label className={dLbl}>Fill</label>
                          <select className={dInp} value={op.fill_strategy ?? ''} onChange={e => patchOp(op.id, { fill_strategy: e.target.value || null })}>
                            <option value="">—</option>
                            {FILL_STRATEGIES.map(f => <option key={f} value={f}>{f}</option>)}
                          </select>
                        </div>
                        <Num label="Raster°" value={op.raster_angle_deg} onSave={v => patchOp(op.id, { raster_angle_deg: v })} />
                        <Num label="Step %" value={op.raster_stepover_pct} onSave={v => patchOp(op.id, { raster_stepover_pct: v })} />
                      </>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <p className="text-[10px] text-gray-600">
          Operations attach to the stable part key (survives re-resolves). Drilling/boring always runs before routing at G-code time.
        </p>
      </div>
    </div>
  )
}

function Num({ label, value, onSave, integer }: { label: string; value: number | null; onSave: (v: number | null) => void; integer?: boolean }) {
  return (
    <div>
      <label className={dLbl}>{label}</label>
      <input type="number" step={integer ? 1 : 'any'} className={dInp} defaultValue={value ?? ''} key={String(value)}
        onBlur={e => {
          const raw = e.target.value.trim()
          if (raw === '') return onSave(null)
          const n = integer ? parseInt(raw) : parseFloat(raw)
          onSave(Number.isFinite(n) ? n : null)
        }} />
    </div>
  )
}
