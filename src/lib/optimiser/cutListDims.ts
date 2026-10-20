// ============================================================
// Paper cut lists (cabinet sheet, Parts List Summary) — phase plan O6.
//
// A resolved part's listed size, read the SAME way the optimiser snapshot
// reads it (normalize.ts): part_pos_overrides sw/sh/sd folded in through
// sizeOverrides.applySizeOverride, and the shape marker from
// shapes.attachShape (a drawn shape — stale when the part changed size after
// it was drawn — wins over the resolver's outline; a resolver outline that no
// longer fits a hand-resized part is dropped). Sizes are FINISHED, listed
// L = DY (with the grain), W = DX, T = DZ (CV part convention), so the paper
// matches Stage 2 with deduction off.
// ============================================================

import type { SourceTable } from './types'
import { applySizeOverride, type SizeOv, type SizeOvByCab } from './sizeOverrides'
import { attachShape, type ShapeRow, type ShapesByCab } from './shapes'
import type { OutlinePt } from '@/src/lib/shapePath'
import { zonePartId, dbPartId, type ZoneRef, type StackRef } from '@/src/lib/cabinetShape/partKeys'

export type CutListTable = Exclude<SourceTable, 'custom_parts' | 'benchtop_parts'>

/** What the cut-list helper needs from a resolved part (any of the five tables). */
export interface CutListPart {
  DX: number; DY: number; DZ: number
  part_key?: string; part_type?: string; sort_order?: number
  outline?: OutlinePt[] | null
}

export interface CutListDims {
  partId: string          // stable part id (overrides / shapes / ops key)
  DX: number; DY: number; DZ: number   // effective (finished) dims
  overridden: boolean     // sw / sh / sd changed it
  base?: { DX: number; DY: number; DZ: number }
  shape: null | { source: 'drawn' | 'resolver'; stale: boolean; revision: number }
}

/** Stable part id per table — the keys normalize.ts / Cabinet3DView use. */
export function cutListPartId(table: CutListTable, p: CutListPart, ref?: ZoneRef | StackRef): string {
  switch (table) {
    case 'case_parts': return `case_${p.part_key}`
    case 'toekick_parts': return `tk_${p.part_key}_${p.sort_order}`
    case 'internal_parts': return `int_${p.part_type}_${p.sort_order}`
    case 'face_zones': return zonePartId(ref as ZoneRef)
    case 'drawer_box_parts': return dbPartId(ref as StackRef, String(p.part_type))
  }
}

/**
 * Effective listed size + shape marker for one resolved part. `ref` = the zone
 * (face_zones) or the drawer stack (drawer_box_parts).
 */
export function cutListDims(
  table: CutListTable, p: CutListPart, cabinetId: string,
  sizeOv: SizeOvByCab, shapes: ShapesByCab, ref?: ZoneRef | StackRef,
): CutListDims {
  const partId = cutListPartId(table, p, ref)
  const row = { cabinet_instance_id: cabinetId, part_key: p.part_key, part_type: p.part_type, dx: p.DX, dy: p.DY, dz: p.DZ }
  const { row: eff, overridden } = applySizeOverride(table, row, partId, sizeOv)
  const DX = Number(eff.dx), DY = Number(eff.dy), DZ = Number(eff.dz)
  const { shape, stale } = attachShape(shapes.get(cabinetId)?.[partId], DX, DY, undefined, p.outline ?? null)
  return {
    partId, DX, DY, DZ, overridden,
    ...(overridden ? { base: { DX: p.DX, DY: p.DY, DZ: p.DZ } } : {}),
    shape: shape ? { source: shape.source, stale, revision: shape.revision } : null,
  }
}

/** One cabinet's lookups from its part_pos_overrides + loaded shape rows. */
export function cabinetLookups(cabinetId: string, ov: Record<string, SizeOv> | null | undefined, shapeRows: ShapeRow[] = []): { sizeOv: SizeOvByCab; shapes: ShapesByCab } {
  const sizeOv: SizeOvByCab = new Map(ov && Object.keys(ov).length ? [[cabinetId, ov]] : [])
  const byPart: Record<string, ShapeRow> = {}
  for (const r of [...shapeRows].sort((a, b) => b.revision - a.revision)) if (!(r.part_key in byPart)) byPart[r.part_key] = r
  return { sizeOv, shapes: new Map(shapeRows.length ? [[cabinetId, byPart]] : []) }
}

/** Short marker for a listed part: "⬠" (drawn), "⬠ auto" (resolver), "⬠ STALE". */
export function shapeMark(d: Pick<CutListDims, 'shape'>): string {
  if (!d.shape) return ''
  if (d.shape.stale) return '⬠ STALE'
  return d.shape.source === 'resolver' ? '⬠ auto' : '⬠'
}
