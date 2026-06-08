'use client'

// ============================================================
// OperationToolSelect  (Drill Block spec, Part C §6.4)
// One <select> that picks the tool for an operation, driven by
// the operation type:
//   • a drill operation  → options come from cnc_drills
//   • any routing op      → options come from cnc_tools (router bits)
// The first real option is always "Auto-select" (auto_tool = true,
// both FK columns null); below a divider sits the filtered library.
//
// Presentational only — renders the select, no label. Callers wrap
// it with their own label/cell. The encode/decode of the three
// columns (router_tool_id / drill_id / auto_tool) lives here so every
// operation editor stays consistent.
// ============================================================

import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase'

export interface ToolLite { id: string; name: string; tool_number: string | null }
export interface DrillLite { id: string; name: string; diameter: number | null }

export interface OpToolValue {
  router_tool_id: string | null
  drill_id: string | null
  auto_tool: boolean
}

// Operation types whose tool comes from the drill library. Everything
// else (pocket/outline/profile/groove/raster/route/saw/square_off …)
// is a routing operation and draws from cnc_tools. Joint/slide editors
// pass their `machine_operation` here, which is also 'drill' for boring.
const DRILL_OP_TYPES = new Set(['drill'])
export function isDrillOp(opType: string): boolean {
  return DRILL_OP_TYPES.has(opType)
}

export default function OperationToolSelect({
  operationType, value, tools, drills, onChange, className, disabled,
}: {
  operationType: string
  value: OpToolValue
  tools: ToolLite[]
  drills: DrillLite[]
  onChange: (v: OpToolValue) => void
  className?: string
  disabled?: boolean
}) {
  const drillMode = isDrillOp(operationType)

  const current = value.auto_tool ? 'auto'
    : value.drill_id ? `d:${value.drill_id}`
    : value.router_tool_id ? `r:${value.router_tool_id}`
    : ''

  function handle(v: string) {
    if (v === 'auto') onChange({ auto_tool: true, router_tool_id: null, drill_id: null })
    else if (v === '__div') return
    else if (v === '') onChange({ auto_tool: false, router_tool_id: null, drill_id: null })
    else if (v.startsWith('d:')) onChange({ auto_tool: false, drill_id: v.slice(2), router_tool_id: null })
    else if (v.startsWith('r:')) onChange({ auto_tool: false, router_tool_id: v.slice(2), drill_id: null })
  }

  return (
    <select className={className} value={current} disabled={disabled} onChange={e => handle(e.target.value)}>
      {/* Only surfaces when an op has no tool and isn't auto (legacy / fresh rows). */}
      {current === '' && <option value="">— not set —</option>}
      <option value="auto">Auto-select</option>
      <option value="__div" disabled>──────────</option>
      {drillMode
        ? drills.map(d => (
            <option key={d.id} value={`d:${d.id}`}>
              {d.name}{d.diameter != null ? ` · ⌀${d.diameter}` : ''}
            </option>
          ))
        : tools.map(t => (
            <option key={t.id} value={`r:${t.id}`}>
              {t.tool_number ? `${t.tool_number} · ` : ''}{t.name}
            </option>
          ))}
    </select>
  )
}

// Shared loader for both tool libraries — used by operation editors that
// didn't previously fetch cnc_tools. Inactive tools/drills are excluded so
// they drop out of every assignment dropdown.
export function useToolLibraries() {
  const [tools, setTools] = useState<ToolLite[]>([])
  const [drills, setDrills] = useState<DrillLite[]>([])
  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('cnc_tools').select('id,name,tool_number').eq('active', true).order('tool_number', { nullsFirst: false }),
      supabase.from('cnc_drills').select('id,name,diameter').eq('is_active', true).order('diameter'),
    ]).then(([tR, dR]) => {
      if (cancelled) return
      setTools((tR.data ?? []) as ToolLite[])
      setDrills((dR.data ?? []) as DrillLite[])
    })
    return () => { cancelled = true }
  }, [])
  return { tools, drills }
}
