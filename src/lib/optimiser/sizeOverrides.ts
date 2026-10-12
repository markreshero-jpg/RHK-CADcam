// ============================================================
// Per-part size overrides → optimiser snapshot (phase plan O1).
//
// cabinet_instances.part_pos_overrides carries {sw?, sh?, sd?} per stable
// part id — written by hand-resizes (Overrides tab / Part Editor sidebar)
// AND by shape saves (bbox becomes the part size). Those slots override the
// DISPLAY BOX extents (PartMeta w/h/d), so which of the row's dx/dy/dz each
// slot lands on depends on the part kind. The mapping below is the inverse
// of the svg*Meta builders in cabinetEditSvgHelpers.tsx — it must stay in
// lockstep with them (they define box w/h/d FROM DX/DY/DZ; we write back).
//
// Applied at snapshot time only (locked decision 2026-08-02): the resolved
// part tables stay pure resolver output; persistResolved is untouched.
// Custom parts are excluded — their row dx/dy/dz are already authoritative
// (resizes write the row directly, never part_pos_overrides).
// ============================================================

import type { SourceTable } from './types'
import { isShapedPanelKey } from '@/src/lib/cabinetShape/partKeys'

export type SizeOv = { sw?: number | null; sh?: number | null; sd?: number | null }
/** cabinet_instance_id → stable part id → override record */
export type SizeOvByCab = Map<string, Record<string, SizeOv>>

type Row = Record<string, unknown>
type Axis = 'dx' | 'dy' | 'dz'

/** Build the lookup from raw cabinet_instances rows (part_pos_overrides jsonb). */
export function buildSizeOvByCab(cabs: { id: string; part_pos_overrides?: Record<string, SizeOv> | null }[]): SizeOvByCab {
  const m: SizeOvByCab = new Map()
  for (const c of cabs) if (c.part_pos_overrides && Object.keys(c.part_pos_overrides).length) m.set(c.id, c.part_pos_overrides)
  return m
}

// [box-w axis, box-h axis, box-d axis] per part kind — mirrors svgCaseMeta /
// svgTkMeta / svgIntMeta / svgZoneMeta / svgDbMeta exactly:
//   side kinds:       w=DZ h=DY d=DX
//   face kinds:       w=DY h=DX d=DZ   (face zones: w=DX h=DY d=DZ, dxIsWidth)
//   horizontal kinds: w=DY h=DZ d=DX
function boxAxes(table: SourceTable, row: Row): [Axis, Axis, Axis] | null {
  switch (table) {
    case 'case_parts': {
      const key = String(row.part_key)
      if (key === 'left_side' || key === 'right_side') return ['dz', 'dy', 'dx']
      if (key === 'back' || isShapedPanelKey(key)) return ['dy', 'dx', 'dz']
      return ['dy', 'dz', 'dx']
    }
    case 'toekick_parts':
      // svgTkMeta: w = isH ? DX : DY, h = isH ? DY : DX, d = DZ
      return String(row.part_key) === 'spreader_horizontal' ? ['dx', 'dy', 'dz'] : ['dy', 'dx', 'dz']
    case 'internal_parts': {
      const t = String(row.part_type)
      if (t === 'inner_drawer_side' || t === 'pull_out_side' || t === 'divider') return ['dz', 'dy', 'dx']
      if (t === 'inner_drawer_front' || t === 'inner_drawer_back' || t === 'pull_out_back') return ['dy', 'dx', 'dz']
      return ['dy', 'dz', 'dx']
    }
    case 'face_zones':
      return ['dx', 'dy', 'dz']
    case 'drawer_box_parts': {
      const t = String(row.part_type)
      if (t === 'db_left_side' || t === 'db_right_side') return ['dz', 'dy', 'dx']
      if (t === 'db_bottom') return ['dy', 'dz', 'dx']
      return ['dy', 'dx', 'dz']
    }
    case 'custom_parts':
    case 'benchtop_parts':   // benchtop Phase 5 — no size overrides
      return null
  }
}

/**
 * Return the row with sw/sh/sd overrides folded into dx/dy/dz (a copy — the
 * input row is never mutated), plus whether anything actually changed.
 */
export function applySizeOverride(
  table: SourceTable, row: Row, partKey: string, ovByCab: SizeOvByCab,
): { row: Row; overridden: boolean } {
  const ov = ovByCab.get(row.cabinet_instance_id as string)?.[partKey]
  if (!ov || (ov.sw == null && ov.sh == null && ov.sd == null)) return { row, overridden: false }
  const axes = boxAxes(table, row)
  if (!axes) return { row, overridden: false }
  const next = { ...row }
  let changed = false
  const slots: (number | null | undefined)[] = [ov.sw, ov.sh, ov.sd]
  axes.forEach((axis, i) => {
    const v = slots[i]
    if (v != null && Number.isFinite(v) && Math.abs(Number(next[axis]) - v) > 1e-6) {
      next[axis] = v
      changed = true
    }
  })
  return { row: next, overridden: changed }
}
