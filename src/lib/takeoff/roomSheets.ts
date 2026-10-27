// ============================================================
// Takeoff sheet counts (z_takeoff T2): nest each room's cut parts on their own,
// the way the optimiser's Stage 4 run() does (same cut blanks, margins, grain
// locks and grain match blocks), and count sheets per material. Full sheets
// only — offcuts are a production call, not a quoting one. The whole job is
// also nested in one go, so the quote can see what cutting rooms together saves.
// ============================================================

import { nest, type NestPartInput, type GroupStock, type SheetStock, type NestResult } from '../optimiser/nest'
import { materialGroupKey, buildMargins, type OptiPart, type OptiCabinet, type OptiMaterial, type OptiProfile, type OptiTool } from '../optimiser/types'
import { cutBlank } from '../optimiser/shapes'
import { buildGrainBlocks, expandGrainBlocks } from '../optimiser/grainBlocks'

export interface SheetLine {
  groupKey: string
  materialId: string | null
  material: string
  thickness: number
  sheetW: number; sheetH: number
  sheets: number
  parts: number
  /** Placed part area ÷ usable sheet area over this line's sheets (0–1). */
  efficiency: number
  /** Part area as a fraction of one usable sheet (what a "part sheet" quote uses). */
  sheetEquiv: number
}

export interface RoomSheets { roomId: string; lines: SheetLine[]; unplaced: string[]; stale: string[] }

export interface SheetInputs {
  parts: OptiPart[]
  cabinets: OptiCabinet[]
  materials: OptiMaterial[]
  profiles: OptiProfile[]
  tools: OptiTool[]
  /** The default machine's default profile (edgeband deduction + margins). */
  profileId: string | null
  quality?: 'fast' | 'balanced' | 'best'
}

function seedStock(m: OptiMaterial | undefined): SheetStock {
  return {
    w: m?.sheet_dx ?? 2400, h: m?.sheet_dy ?? 1200,
    trimTop: m?.trim_top ?? 5, trimBottom: m?.trim_bottom ?? 5, trimLeft: m?.trim_left ?? 5, trimRight: m?.trim_right ?? 5,
    isOffcut: false, label: null, grainAlong: m?.grain_direction === 'width' ? 'h' : 'w',
  }
}

const usableArea = (s: SheetStock) => Math.max(0, s.w - s.trimLeft - s.trimRight) * Math.max(0, s.h - s.trimTop - s.trimBottom)

/** Nest one set of parts (a room, or the whole job). Mirrors headlessRun.test.ts / Stage 4 run(). */
export function nestSheets(inp: SheetInputs, parts: OptiPart[]): { lines: SheetLine[]; unplaced: string[]; stale: string[] } {
  const matById = new Map(inp.materials.map(m => [m.id, m]))
  const prof = inp.profileId ? inp.profiles.find(p => p.id === inp.profileId) : null
  const deductEb = prof?.deduct_edgeband === true
  const run = parts.filter(p => p.output_to_cnc)
  const stale = run.filter(p => p.shape_stale).map(p => `${p.cabinet_label} ${p.label}`)

  const instances: NestPartInput[] = []
  const index: Record<string, NestPartInput> = {}
  const stock: Record<string, GroupStock> = {}
  for (const p of run.filter(p => !p.shape_stale)) {
    const gk = materialGroupKey(p.material_id, p.thickness)
    if (!stock[gk]) stock[gk] = { standard: seedStock(p.material_id ? matById.get(p.material_id) : undefined), offcuts: [] }
    const dims = cutBlank(p, deductEb)
    const inst: NestPartInput = {
      uid: `${p.uid}#0`, baseUid: p.uid, label: p.label, w: dims.w, h: dims.h, thickness: p.thickness, materialId: p.material_id,
      grainLock: !!(p.material_id && matById.get(p.material_id)?.has_grain), grainAcross: p.grain_across, priority: p.nest_priority,
    }
    instances.push(inst); index[inst.uid] = inst
  }
  if (!instances.length) return { lines: [], unplaced: [], stale }

  const margins = buildMargins(inp, inp.profileId)
  const cabById = new Map(inp.cabinets.map(c => [c.id, c]))
  const groupFrontCount = new Map<string, number>()
  for (const p of run) {
    const gid = p.wall_rect ? cabById.get(p.cabinet_instance_id)?.grain_match?.id : undefined
    if (gid) groupFrontCount.set(gid, (groupFrontCount.get(gid) ?? 0) + 1)
  }
  const gm = buildGrainBlocks({
    instances, partByUid: new Map(run.map(p => [p.uid, p])), cabById, groupFrontCount,
    stockFor: (m, t) => stock[materialGroupKey(m, t)]?.standard,
    gapFor: m => (m != null ? margins.byMaterial[m] : undefined) ?? margins.fallback,
    allowRotation: true,
  })
  const res: NestResult = expandGrainBlocks(nest(gm.parts, stock, {
    quality: inp.quality ?? 'balanced', allowRotation: true,
    marginByMaterial: margins.byMaterial, defaultMargin: margins.fallback,
  }), gm.blocks, index, gm.warnings)

  const byGroup = new Map<string, SheetLine>()
  const partArea = new Map<string, number>()
  for (const inst of instances) {
    const gk = materialGroupKey(inst.materialId, inst.thickness)
    partArea.set(gk, (partArea.get(gk) ?? 0) + inst.w * inst.h)
    const line = byGroup.get(gk)
    if (line) { line.parts++; continue }
    const m = inst.materialId ? matById.get(inst.materialId) : undefined
    const st = stock[gk].standard
    byGroup.set(gk, {
      groupKey: gk, materialId: inst.materialId, material: m?.name ?? 'No material', thickness: inst.thickness,
      sheetW: st.w, sheetH: st.h, sheets: 0, parts: 1, efficiency: 0, sheetEquiv: 0,
    })
  }
  const effSum = new Map<string, number>()
  for (const s of res.sheets) {
    const line = byGroup.get(materialGroupKey(s.materialId, s.thickness))
    if (!line) continue
    line.sheets++
    effSum.set(line.groupKey, (effSum.get(line.groupKey) ?? 0) + s.efficiency)
  }
  for (const line of byGroup.values()) {
    line.efficiency = line.sheets ? (effSum.get(line.groupKey) ?? 0) / line.sheets : 0
    const ua = usableArea(stock[line.groupKey].standard)
    line.sheetEquiv = ua ? (partArea.get(line.groupKey) ?? 0) / ua : 0
  }
  const lines = [...byGroup.values()].sort((a, b) => a.material.localeCompare(b.material) || a.thickness - b.thickness)
  return { lines, unplaced: res.unplaced.map(u => `${u.label} ${Math.round(u.w)}×${Math.round(u.h)}`), stale }
}

/** Per-room nests + one whole-job nest. */
export function nestRoomsAndJob(inp: SheetInputs, roomIds: string[]): { rooms: RoomSheets[]; job: SheetLine[] } {
  const rooms = roomIds.map(roomId => ({ roomId, ...nestSheets(inp, inp.parts.filter(p => p.room_id === roomId)) }))
  const ids = new Set(roomIds)
  return { rooms, job: nestSheets(inp, inp.parts.filter(p => ids.has(p.room_id))).lines }
}
