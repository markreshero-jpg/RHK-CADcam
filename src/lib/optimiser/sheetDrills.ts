// ============================================================
// Per-sheet drilling loader shared by Stage 5 (nest preview) and
// Stage 6 (G-code). Optionally regenerates joint-drilling rows,
// reads part_operations, resolves auto_tool/drill_id to concrete
// bits, and projects every hole into sheet space.
//
// Centralising this guarantees the holes drawn on the pieces in
// Stage 5 match exactly what Stage 6 emits to G-code.
// ============================================================

import { supabase } from '@/src/lib/supabase'
import { buildSheetDrills, groupDrillOps, type DrillOpRaw, type PartRef } from './drills'
import { resolveDrillTool, type DrillLibItem, type RouterToolItem } from './resolveDrillTools'
import { syncSeamDrillOperationsForCabinets } from './seamDrillSync'
import type { NestedSheet } from './nest'
import type { SheetDrill } from './gcode'
import type { OptiPart } from './types'

export interface SheetDrillsResult {
  bySheet: Map<number, SheetDrill[]>
  warnings: string[]
}

// The expensive half: sync joint holes, read part_operations, resolve tools.
// Returns part-local ops grouped by stable key — independent of where parts sit
// on sheets, so it only needs re-running when the cabinet data changes, NOT on
// every nest edit. Pair with projectSheetDrills for the cheap per-sheet layout.
export interface ResolvedDrillOps {
  opsByKey: Map<string, DrillOpRaw[]>
  partByUid: Map<string, PartRef>
  warnings: string[]
}

export async function loadResolvedDrillOps(
  parts: OptiPart[],
  opts: { sync?: boolean; blockDiameters?: number[]; routerTools?: RouterToolItem[]; preferredPocketToolNumber?: number | null } = {},
): Promise<ResolvedDrillOps> {
  const cabIds = [...new Set(parts.map(p => p.cabinet_instance_id))]
  // Regenerate joint-drilling rows so the read below is current (best-effort).
  if (opts.sync && cabIds.length) await syncSeamDrillOperationsForCabinets(cabIds)

  const { data: opRows } = cabIds.length
    ? await supabase.from('part_operations')
        .select('source_table,source_cabinet_id,source_part_key,pos_x,pos_y,diameter,depth,repeat_count,repeat_spacing,repeat_axis,output_to_cnc,operation_type,drill_id,auto_tool')
        .in('source_cabinet_id', cabIds).eq('operation_type', 'drill')
    : { data: [] }
  const drillOps = ((opRows ?? []) as (DrillOpRaw & { output_to_cnc: boolean | null })[]).filter(o => o.output_to_cnc !== false)

  // Resolve auto_tool / drill_id → a concrete bit (mutates diameter/depth in place).
  const { data: drillLibRows } = await supabase.from('cnc_drills')
    .select('id,name,diameter,max_depth,rotation,drill_type').eq('is_active', true)
  const drillLib = (drillLibRows ?? []) as DrillLibItem[]
  const warnings = new Set<string>()
  for (const op of drillOps) {
    const r = resolveDrillTool(
      { diameter: op.diameter, depth: op.depth, drill_id: op.drill_id ?? null, auto_tool: op.auto_tool ?? false },
      drillLib, { blockDiameters: opts.blockDiameters, routerTools: opts.routerTools, preferredPocketToolNumber: opts.preferredPocketToolNumber },
    )
    op.diameter = r.diameter
    op.depth = r.depth
    op.pocket = r.mode === 'pocket' && r.router_tool_number != null && r.router_diameter != null
      ? { toolNumber: r.router_tool_number, toolDiameter: r.router_diameter }
      : null
    r.warnings.forEach(w => warnings.add(w))
  }

  const opsByKey = groupDrillOps(drillOps)
  const partByUid = new Map<string, PartRef>(parts.map(p => [p.uid, {
    source_table: p.source_table, cabinet_instance_id: p.cabinet_instance_id, source_part_key: p.source_part_key, w: p.w, h: p.h,
  }]))
  return { opsByKey, partByUid, warnings: [...warnings] }
}

// The cheap half: project the resolved ops onto each sheet's current layout.
// Safe to call on every nest edit.
export function projectSheetDrills(sheets: NestedSheet[], ops: ResolvedDrillOps): Map<number, SheetDrill[]> {
  const bySheet = new Map<number, SheetDrill[]>()
  for (const sheet of sheets) bySheet.set(sheet.index, buildSheetDrills(sheet, ops.partByUid, ops.opsByKey, sheet.thickness))
  return bySheet
}

export async function loadSheetDrills(
  parts: OptiPart[],
  sheets: NestedSheet[],
  opts: { sync?: boolean; blockDiameters?: number[]; routerTools?: RouterToolItem[]; preferredPocketToolNumber?: number | null } = {},
): Promise<SheetDrillsResult> {
  const ops = await loadResolvedDrillOps(parts, opts)
  return { bySheet: projectSheetDrills(sheets, ops), warnings: ops.warnings }
}
