// ============================================================
// Benchtop supply sheet (Phase 5).
// Outsourced tops (stone / laminate) resolve to supply items, not cut parts.
// This turns the stored rows into an order sheet: one line per piece / leg /
// apron with its size, area, edge-profile lineal metres, cutouts and joins,
// plus job totals per material and per profile code.
// ============================================================

import type { ResolvedBenchtopPart, BenchtopPartJoin } from './types'

export type StoredBenchtopPart = ResolvedBenchtopPart & { id?: string; benchtop_id: string }

export interface SupplyBenchtop { id: string; label: string | null; room_id: string }

export interface SupplyLine {
  benchtopId:  string
  source:      string            // the top's label
  roomId:      string
  role:        ResolvedBenchtopPart['part_role']
  label:       string
  piece:       number | null
  length:      number
  width:       number
  thickness:   number
  quantity:    number
  material:    string
  area_m2:     number            // × quantity
  outline:     { x: number; y: number }[] | null
  profiles:    Record<string, number>   // code → lineal mm (× quantity)
  cutouts:     { w: number; h: number; round: boolean }[]
  joins:       BenchtopPartJoin[]
  waterfallJoin: 'butt' | 'mitre' | null
}

export interface SupplyTotals {
  byMaterial: { material: string; thickness: number; items: number; area_m2: number }[]
  byProfile:  { code: string; mm: number }[]
  cutouts:    number
  waterfalls: number
  joins:      number
}

const r2 = (v: number) => Math.round(v * 100) / 100

export function supplyMaterialName(p: ResolvedBenchtopPart): string {
  return p.benchtop_material_name ?? p.material_name ?? 'Unknown'
}

/** Supply lines in benchtop order (then piece, then role), skipping cut parts. */
export function buildSupplyLines(benchtops: SupplyBenchtop[], rows: StoredBenchtopPart[]): SupplyLine[] {
  const ROLE_ORDER: Record<string, number> = { stone_slab: 0, worktop_panel: 0, waterfall_panel: 1, apron_strip: 2 }
  const out: SupplyLine[] = []
  for (const bt of benchtops) {
    const mine = rows.filter(r => r.benchtop_id === bt.id && r.supply_item)
      .sort((a, b) => (a.piece ?? 0) - (b.piece ?? 0) || (ROLE_ORDER[a.part_role] ?? 9) - (ROLE_ORDER[b.part_role] ?? 9))
    for (const p of mine) {
      const q = p.quantity || 1
      const area = p.meta?.area_m2 ?? (p.length_mm * p.width_mm) / 1e6
      out.push({
        benchtopId: bt.id, source: bt.label ?? 'Benchtop', roomId: bt.room_id,
        role: p.part_role, label: p.label, piece: p.piece ?? null,
        length: p.length_mm, width: p.width_mm, thickness: p.thickness_mm, quantity: q,
        material: supplyMaterialName(p),
        area_m2: r2(area * q),
        outline: p.outline ?? null,
        profiles: Object.fromEntries(Object.entries(p.meta?.profiles ?? {}).map(([k, mm]) => [k, mm * q])),
        cutouts: p.meta?.cutouts ?? [],
        joins: p.meta?.joins ?? [],
        waterfallJoin: p.part_role === 'waterfall_panel' ? (p.meta?.waterfall_join ?? null) : null,
      })
    }
  }
  return out
}

export function supplyTotals(lines: SupplyLine[]): SupplyTotals {
  const mat = new Map<string, { material: string; thickness: number; items: number; area_m2: number }>()
  const prof = new Map<string, number>()
  let cutouts = 0, waterfalls = 0, joins = 0
  for (const l of lines) {
    const k = `${l.material}__${l.thickness}`
    const m = mat.get(k) ?? { material: l.material, thickness: l.thickness, items: 0, area_m2: 0 }
    m.items += l.quantity; m.area_m2 = r2(m.area_m2 + l.area_m2); mat.set(k, m)
    for (const [code, mm] of Object.entries(l.profiles)) prof.set(code, (prof.get(code) ?? 0) + mm)
    cutouts += l.cutouts.length * l.quantity
    joins += l.joins.length
    if (l.role === 'waterfall_panel') waterfalls += l.quantity
  }
  // A join is recorded on both pieces it separates — count it once.
  joins = Math.round(joins / 2)
  return {
    byMaterial: [...mat.values()].sort((a, b) => a.material.localeCompare(b.material) || a.thickness - b.thickness),
    byProfile: [...prof.entries()].map(([code, mm]) => ({ code, mm: Math.round(mm) })).sort((a, b) => a.code.localeCompare(b.code)),
    cutouts, waterfalls, joins,
  }
}
