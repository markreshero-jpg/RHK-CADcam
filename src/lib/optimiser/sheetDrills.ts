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
import { buildSheetRoutes, groupRouteOps, expandToolSetMember, type RouteOpRaw, type RouteGeom, type ToolSetMember } from './routes'
import { resolveDrillTool, type DrillLibItem, type RouterToolItem } from './resolveDrillTools'
import { syncSeamDrillOperationsForCabinets } from './seamDrillSync'
import { syncMasterSlavesForCabinets } from './masterSlaveSync'
import type { NestedSheet } from './nest'
import type { SheetDrill, SheetRoute } from './gcode'
import type { OptiPart } from './types'

export interface SheetDrillsResult {
  bySheet: Map<number, SheetDrill[]>
  routesBySheet: Map<number, SheetRoute[]>
  warnings: string[]
}

// Parse a cnc_tools.tool_number (text, may be 'T101') to its integer register.
const toolNum = (tn: unknown): number => { const d = String(tn ?? '').replace(/\D/g, ''); return d ? Number(d) : NaN }

// The expensive half: sync joint holes, read part_operations, resolve tools.
// Returns part-local ops grouped by stable key — independent of where parts sit
// on sheets, so it only needs re-running when the cabinet data changes, NOT on
// every nest edit. Pair with projectSheetDrills for the cheap per-sheet layout.
export interface ResolvedDrillOps {
  opsByKey: Map<string, DrillOpRaw[]>
  routesByKey: Map<string, RouteOpRaw[]>
  partByUid: Map<string, PartRef>
  warnings: string[]
}

export async function loadResolvedDrillOps(
  parts: OptiPart[],
  opts: { sync?: boolean; blockDiameters?: number[]; routerTools?: RouterToolItem[]; preferredPocketToolNumber?: number | null; deductEdgeband?: boolean } = {},
): Promise<ResolvedDrillOps> {
  const cabIds = [...new Set(parts.map(p => p.cabinet_instance_id))]
  // Regenerate generated part_operations against FINAL geometry so the read below is
  // current (§6.2 — authoritative pass). Two independent generators tagged with
  // different parameters.generated markers ('seam_joint' vs 'master_slave'); neither
  // reads the other's rows, so order is immaterial for correctness. Run sequentially
  // (seam first, then master/joint slaves) to avoid concurrent delete+insert on the
  // same cabinet's part_operations. Best-effort — each swallows per-cabinet errors.
  if (opts.sync && cabIds.length) {
    await syncSeamDrillOperationsForCabinets(cabIds)
    await syncMasterSlavesForCabinets(cabIds)
  }

  const { data: opRows } = cabIds.length
    ? await supabase.from('part_operations')
        .select('source_table,source_cabinet_id,source_part_key,pos_x,pos_y,diameter,depth,repeat_count,repeat_spacing,repeat_axis,output_to_cnc,operation_type,drill_id,auto_tool,output_face')
        .in('source_cabinet_id', cabIds).eq('operation_type', 'drill')
    : { data: [] }
  const drillOps = ((opRows ?? []) as (DrillOpRaw & { output_to_cnc: boolean | null })[]).filter(o => o.output_to_cnc !== false)

  // Resolve auto_tool / drill_id → a concrete bit (mutates diameter/depth in place).
  const { data: drillLibRows } = await supabase.from('cnc_drills')
    .select('id,name,diameter,max_depth,rotation,drill_type,passes').eq('is_active', true)
  const drillLib = (drillLibRows ?? []) as DrillLibItem[]
  const warnings = new Set<string>()
  for (const op of drillOps) {
    const r = resolveDrillTool(
      { diameter: op.diameter, depth: op.depth, drill_id: op.drill_id ?? null, auto_tool: op.auto_tool ?? false },
      drillLib, { blockDiameters: opts.blockDiameters, routerTools: opts.routerTools, preferredPocketToolNumber: opts.preferredPocketToolNumber },
    )
    op.diameter = r.diameter
    op.depth = r.depth
    op.passes = r.passes
    op.pocket = r.mode === 'pocket' && r.router_tool_number != null && r.router_diameter != null
      ? { toolNumber: r.router_tool_number, toolDiameter: r.router_diameter }
      : null
    r.warnings.forEach(w => warnings.add(w))
  }

  const opsByKey = groupDrillOps(drillOps)

  // Route / groove ops (Phase B §3c) — the routing emit path. A route carries EITHER
  // a single router bit (router_tool_id) OR a tool-set recipe (tool_set_id, expanded
  // into its ordered member ops). No fallback: an op with neither is dropped with a
  // warning (also flagged as an error in the Part Editor). All emit on the back/
  // material-up pass for now — plane_kind is loaded but not yet acted on.
  const routesByKey = new Map<string, RouteOpRaw[]>()
  if (cabIds.length) {
    const { data: rRows } = await supabase.from('part_operations')
      .select('source_table,source_cabinet_id,source_part_key,operation_type,operation_action,output_face,plane_kind,pos_x,pos_y,size_dx,size_dy,offset_top_mm,offset_bottom_mm,offset_left_mm,offset_right_mm,length,width,depth,size_dz,fill_strategy,raster_angle_deg,raster_stepover_pct,router_tool_id,tool_set_id,output_to_cnc')
      .in('source_cabinet_id', cabIds).in('operation_type', ['route', 'groove'])
    type RouteRow = RouteGeom & { router_tool_id: string | null; tool_set_id: string | null; output_to_cnc: boolean | null }
    const rawRoutes = ((rRows ?? []) as RouteRow[]).filter(o => o.output_to_cnc !== false)
    if (rawRoutes.length) {
      const { data: toolRows } = await supabase.from('cnc_tools')
        .select('id,tool_number,diameter,max_depth_per_pass').eq('active', true)
      const toolById = new Map((toolRows ?? []).map(t => [t.id as string, t]))
      // Resolve a cnc_tools id → concrete router bit, or null (with a warning).
      const bit = (toolId: string | null, label: string): { toolNumber: number; toolDiameter: number; maxDepthPerPass: number | null } | null => {
        const t = toolId ? toolById.get(toolId) : undefined
        const num = toolNum(t?.tool_number)
        const dia = t?.diameter != null ? Number(t.diameter) : NaN
        if (!Number.isFinite(num) || !Number.isFinite(dia) || dia <= 0) { warnings.add(`Route on ${label}: router tool has no number/diameter — skipped`); return null }
        return { toolNumber: num, toolDiameter: dia, maxDepthPerPass: t?.max_depth_per_pass != null ? Number(t.max_depth_per_pass) : null }
      }

      // Tool-set members for every referenced set, grouped + ordered.
      const setIds = [...new Set(rawRoutes.filter(o => o.tool_set_id).map(o => o.tool_set_id!))]
      const membersBySet = new Map<string, ToolSetMember[]>()
      if (setIds.length) {
        const { data: memRows } = await supabase.from('cnc_tool_set_operations')
          .select('tool_set_id,sort_order,operation_type,tool_id,depth_mm,width_mm,offset_top_mm,offset_bottom_mm,offset_left_mm,offset_right_mm,fill_strategy,raster_angle_deg,raster_stepover_pct')
          .in('tool_set_id', setIds).order('sort_order')
        for (const m of (memRows ?? []) as ({ tool_set_id: string } & ToolSetMember)[]) {
          const arr = membersBySet.get(m.tool_set_id) ?? []; arr.push(m); membersBySet.set(m.tool_set_id, arr)
        }
      }

      const resolved: RouteOpRaw[] = []
      for (const o of rawRoutes) {
        const label = o.source_part_key ?? 'part'
        if (o.tool_set_id) {
          const members = membersBySet.get(o.tool_set_id) ?? []
          if (!members.length) { warnings.add(`Route on ${label}: tool set is empty — nothing to machine`); continue }
          for (const m of members) {
            const geom = expandToolSetMember(o, m)
            if (!geom) continue                                  // e.g. a drill member — not a routing feature
            const b = bit(m.tool_id, label)
            if (!b) continue
            resolved.push({ ...geom, ...b })
          }
        } else if (o.router_tool_id) {
          const b = bit(o.router_tool_id, label)
          if (b) resolved.push({ ...o, ...b })
        } else {
          warnings.add(`Route on ${label}: no router tool or tool set assigned — skipped`)
        }
      }
      for (const [k, v] of groupRouteOps(resolved)) routesByKey.set(k, v)
    }
  }

  const partByUid = new Map<string, PartRef>(parts.map(p => [p.uid, {
    source_table: p.source_table, cabinet_instance_id: p.cabinet_instance_id, source_part_key: p.source_part_key, w: p.w, h: p.h,
    deduct: !!opts.deductEdgeband, eb_w1: p.eb_w1, eb_w2: p.eb_w2, eb_h1: p.eb_h1,
  }]))
  return { opsByKey, routesByKey, partByUid, warnings: [...warnings] }
}

// The cheap half: project the resolved ops onto each sheet's current layout.
// Safe to call on every nest edit.
export function projectSheetDrills(sheets: NestedSheet[], ops: ResolvedDrillOps): Map<number, SheetDrill[]> {
  const bySheet = new Map<number, SheetDrill[]>()
  for (const sheet of sheets) bySheet.set(sheet.index, buildSheetDrills(sheet, ops.partByUid, ops.opsByKey, sheet.thickness))
  return bySheet
}

// Same, for routing features (grooves / routes / pockets).
export function projectSheetRoutes(sheets: NestedSheet[], ops: ResolvedDrillOps): Map<number, SheetRoute[]> {
  const bySheet = new Map<number, SheetRoute[]>()
  for (const sheet of sheets) bySheet.set(sheet.index, buildSheetRoutes(sheet, ops.partByUid, ops.routesByKey))
  return bySheet
}

export async function loadSheetDrills(
  parts: OptiPart[],
  sheets: NestedSheet[],
  opts: { sync?: boolean; blockDiameters?: number[]; routerTools?: RouterToolItem[]; preferredPocketToolNumber?: number | null; deductEdgeband?: boolean } = {},
): Promise<SheetDrillsResult> {
  const ops = await loadResolvedDrillOps(parts, opts)
  return { bySheet: projectSheetDrills(sheets, ops), routesBySheet: projectSheetRoutes(sheets, ops), warnings: ops.warnings }
}
