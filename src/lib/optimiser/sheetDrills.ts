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
import { buildSheetDrills, groupDrillOps, drillKey, type DrillOpRaw, type PartRef } from './drills'
import { buildSheetRoutes, groupRouteOps, expandToolSetMember, type RouteOpRaw, type RouteGeom, type ToolSetMember } from './routes'
import { resolveDrillTool, type DrillLibItem, type RouterToolItem } from './resolveDrillTools'
import { syncSeamDrillOperations } from './seamDrillSync'
import { syncMasterSlaves } from './masterSlaveSync'
import { resolveCabinetFromDB } from '@/src/lib/resolver/resolveCabinetFromDB'
import type { ResolvedCabinet } from '@/src/lib/resolver/types'
import type { NestedSheet } from './nest'
import type { SheetDrill, SheetRoute } from './gcode'
import type { OptiPart } from './types'
import { cutBlank } from './shapes'

export interface SheetDrillsResult {
  bySheet: Map<number, SheetDrill[]>
  routesBySheet: Map<number, SheetRoute[]>
  warnings: string[]
}

// Parse a cnc_tools.tool_number (text, may be 'T101') to its integer register.
const toolNum = (tn: unknown): number => { const d = String(tn ?? '').replace(/\D/g, ''); return d ? Number(d) : NaN }

// Every part_operations row of the given types on these cabinets. PostgREST caps
// a response at 1000 rows and a whole job runs to thousands of holes (RHK6581:
// 3–5k), so one .in() read silently dropped every cabinet past the cap — their
// parts nested with no drilling. Cabinets go in chunks (short URLs, parallel),
// each paged by id until a short page.
const OPS_CABS_PER_READ = 25
const OPS_PAGE = 1000
async function selectCabinetOps(select: string, cabIds: string[], types: string[]): Promise<Record<string, unknown>[]> {
  const chunks: string[][] = []
  for (let i = 0; i < cabIds.length; i += OPS_CABS_PER_READ) chunks.push(cabIds.slice(i, i + OPS_CABS_PER_READ))
  const pages = await Promise.all(chunks.map(async ids => {
    const rows: Record<string, unknown>[] = []
    for (let from = 0; ; from += OPS_PAGE) {
      const { data, error } = await supabase.from('part_operations').select(select)
        .in('source_cabinet_id', ids).in('operation_type', types)
        .order('id').range(from, from + OPS_PAGE - 1)
      if (error) throw error
      const page = (data ?? []) as unknown as Record<string, unknown>[]
      rows.push(...page)
      if (page.length < OPS_PAGE) return rows
    }
  }))
  return pages.flat()
}

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

// Cabinets whose parts can carry part_operations (benchtops can't).
export const drillCabinetIds = (parts: OptiPart[]): string[] =>
  [...new Set(parts.filter(p => p.source_table !== 'benchtop_parts').map(p => p.cabinet_instance_id))]

// Regenerate ONE cabinet's generated part_operations against final geometry
// (§6.2 — authoritative pass): seam/hinge/slide rows, then master/joint slaves.
// One resolve feeds both passes — each used to load + resolve + re-persist the
// cabinet itself, all DB round-trips (the resolve is ~1ms). Run in that order,
// never concurrently, so the two delete+inserts don't race on the cabinet.
async function syncCabinetDrilling(cabinetId: string): Promise<void> {
  let rp: ResolvedCabinet
  try {
    rp = await resolveCabinetFromDB(cabinetId, { quiet: true })
  } catch (e) {
    // Deleted after the nest was built — it keeps whatever rows it has.
    if (e instanceof Error && /not found/i.test(e.message)) return
    throw e
  }
  await syncSeamDrillOperations(cabinetId, rp)
  await syncMasterSlaves(cabinetId, rp)
}

// At most this many cabinets syncing at once, across every caller.
const SYNC_CONCURRENCY = 12   // DB-latency bound (~240ms a call), not CPU
let syncRunning = 0
const syncWaiting: (() => void)[] = []
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (syncRunning < SYNC_CONCURRENCY) syncRunning++
  else await new Promise<void>(r => syncWaiting.push(r))   // slot handed over on release
  try { return await fn() }
  finally { const next = syncWaiting.shift(); if (next) next(); else syncRunning-- }
}

// One drilling regeneration per cabinet per optimiser session. Started in the
// background for the nested cabinets when the nest runs (Stage 4); Stage 5 and
// Stage 6 await the same runs instead of re-syncing on entry / Generate. Kept
// per cabinet so a re-nest with an overlapping set reuses what's done, and a
// cabinet never has two delete+inserts in flight (a new run chains after one).
const cabRuns = new Map<string, Promise<void>>()
const freshCabs = new Set<string>()   // synced since the optimiser opened

// Optimiser opened (fresh snapshot): cabinets may have been edited since their
// last sync, so the next request re-syncs each one (after any still in flight).
export function resetDrillSync(): void { freshCabs.clear() }

export function syncDrillingForParts(parts: OptiPart[], opts: { force?: boolean } = {}): Promise<void> {
  return Promise.all(drillCabinetIds(parts).map(id => {
    const cur = cabRuns.get(id)
    if (cur && freshCabs.has(id) && !opts.force) return cur
    const run = (cur ?? Promise.resolve())
      .then(() => limited(() => syncCabinetDrilling(id)))
      .catch(e => console.error('[drillSync] cabinet failed, continuing:', id, e))
    cabRuns.set(id, run); freshCabs.add(id)
    return run
  })).then(() => {})
}

// The snapshot parts actually in the nest (placed or unplaced) — drilling is
// synced and read for these cabinets only, not the whole job.
export function nestedParts(parts: OptiPart[], partIndex: Record<string, { baseUid: string }>): OptiPart[] {
  const base = new Set(Object.values(partIndex).map(p => p.baseUid))
  return parts.filter(p => base.has(p.uid))
}

export async function loadResolvedDrillOps(
  parts: OptiPart[],
  // sync: wait for these cabinets' drilling regeneration (started if not yet);
  // 'force' runs a fresh one (Stage 5 "Regenerate", after editing joints).
  opts: { sync?: boolean | 'force'; blockDiameters?: number[]; routerTools?: RouterToolItem[]; preferredPocketToolNumber?: number | null; deductEdgeband?: boolean } = {},
): Promise<ResolvedDrillOps> {
  // Benchtop parts (Phase 5) have no part_operations — their "cabinet" id is a benchtop.
  const cabIds = drillCabinetIds(parts)
  if (opts.sync && cabIds.length) await syncDrillingForParts(parts, { force: opts.sync === 'force' })

  const opRows = cabIds.length
    ? await selectCabinetOps('source_table,source_cabinet_id,source_part_key,pos_x,pos_y,diameter,depth,repeat_count,repeat_spacing,repeat_axis,output_to_cnc,operation_type,drill_id,auto_tool,output_face', cabIds, ['drill'])
    : []
  const drillOps = (opRows as unknown as (DrillOpRaw & { output_to_cnc: boolean | null })[]).filter(o => o.output_to_cnc !== false)

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
    const rRows = await selectCabinetOps('source_table,source_cabinet_id,source_part_key,operation_key,operation_type,operation_action,output_face,plane_kind,pos_x,pos_y,size_dx,size_dy,offset_top_mm,offset_bottom_mm,offset_left_mm,offset_right_mm,length,width,depth,size_dz,fill_strategy,raster_angle_deg,raster_stepover_pct,router_tool_id,tool_set_id,output_to_cnc',
      cabIds, ['route', 'groove'])
    type RouteRow = RouteGeom & { router_tool_id: string | null; tool_set_id: string | null; output_to_cnc: boolean | null }
    // Finger-pull notches + reliefs are already in a gable's resolver outline, so
    // the perimeter cut takes them out in one go (z_handles H6). Their generated
    // pockets / slots only run when the part is cut as a plain rectangle (e.g. a
    // hand size override dropped its outline).
    const outlined = new Set(parts.filter(p => p.shape?.source === 'resolver').map(p => drillKey(p.source_table, p.cabinet_instance_id, p.source_part_key)))
    const notchCut = (o: RouteRow & { operation_key?: string | null }) =>
      /^fprail_(notch|relief)_/.test(o.operation_key ?? '') && outlined.has(drillKey(o.source_table, o.source_cabinet_id, o.source_part_key))
    const rawRoutes = (rRows as unknown as (RouteRow & { operation_key?: string | null })[]).filter(o => o.output_to_cnc !== false && !notchCut(o))
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

  const partByUid = new Map<string, PartRef>(parts.map(p => {
    // Ops shift by how far the cut blank's edges came in (a shaped part's
    // banded-edge offset, O5; the tape on a rectangle's sides).
    const b = cutBlank(p, !!opts.deductEdgeband)
    return [p.uid, {
      source_table: p.source_table, cabinet_instance_id: p.cabinet_instance_id, source_part_key: p.source_part_key, w: p.w, h: p.h,
      deduct: !!opts.deductEdgeband, eb_w1: b.sx, eb_w2: b.sx2, eb_h1: b.sy,
    }]
  }))
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
  opts: { sync?: boolean | 'force'; blockDiameters?: number[]; routerTools?: RouterToolItem[]; preferredPocketToolNumber?: number | null; deductEdgeband?: boolean } = {},
): Promise<SheetDrillsResult> {
  const ops = await loadResolvedDrillOps(parts, opts)
  return { bySheet: projectSheetDrills(sheets, ops), routesBySheet: projectSheetRoutes(sheets, ops), warnings: ops.warnings }
}
