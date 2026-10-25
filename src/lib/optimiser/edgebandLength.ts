// ============================================================
// Edgeband length (phase plan O7) — metres of tape a part takes, and the
// job / room rollup by edgeband product (metres + waste × cost_per_metre).
//
// Lengths are FINISHED edge lengths (stored dims are finished size —
// edgeband-size-conventions), so nothing is deducted here. A rectangle =
// the banded sides' lengths. A shaped part = the banded edges of its op
// outline, classified exactly as shapes.cutBlank does for the deduction (an
// edge's own band tag, else the rectangle side it lies on, inner edges none),
// so the metres follow the same edges the tape is taken off.
// ============================================================

import type { OptiPart } from './types'
import type { ShapePt } from '@/src/lib/shapePath'

/** Tape on the four footprint sides: w1 / w2 = the x = 0 / x = w edges, h1 / h2 = y = 0 / y = h. */
export type EbSides = [boolean, boolean, boolean, boolean]

/** Banded length (mm) per tape. id null = the edge is banded but the part carries no tape. */
export interface TapeRun { id: string | null; mm: number }

const round1 = (v: number) => Math.round(v * 10) / 10

/**
 * Banded length of one cabinet part. `outline` / `band` = the op-frame
 * outline and each edge's band tag (null = untagged), when the part is cut
 * shaped; otherwise its w × h rectangle.
 */
export function bandedLengthMM(
  w: number, h: number, sides: EbSides,
  outline?: ShapePt[] | null, band?: (boolean | null)[],
): number {
  if (!outline || outline.length < 3) {
    return round1((sides[0] ? h : 0) + (sides[1] ? h : 0) + (sides[2] ? w : 0) + (sides[3] ? w : 0))
  }
  const T = 0.05
  const on = (a: number, b: number, v: number) => Math.abs(a - v) < T && Math.abs(b - v) < T
  let mm = 0
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length]
    const tag = band?.[i]
    const banded = tag != null ? tag
      : on(a.x, b.x, 0) ? sides[0] : on(a.x, b.x, w) ? sides[1]
      : on(a.y, b.y, 0) ? sides[2] : on(a.y, b.y, h) ? sides[3] : false
    if (banded) mm += Math.hypot(b.x - a.x, b.y - a.y)
  })
  return round1(mm)
}

/** One tape run list for a cabinet part with a single tape (or none known). */
export function tapeRuns(id: string | null, mm: number): TapeRun[] {
  return mm > 0 ? [{ id, mm }] : []
}

// ── Rollup ───────────────────────────────────────────────────────────────────

export interface EdgebandProduct {
  id: string; name: string; brand?: string | null; color?: string | null
  thickness?: number | null; width?: number | null; cost_per_metre?: number | null
}

export interface EdgebandLine {
  id: string | null          // null = banded, no tape set on the part
  name: string
  thickness: number | null
  width: number | null
  parts: number              // parts carrying this tape
  m: number                  // finished banded length (metres)
  mWaste: number             // m × (1 + waste)
  costPerMetre: number | null
  cost: number | null        // mWaste × costPerMetre (null when no price)
}

export interface EdgebandCabinetLine { cabinetId: string; cabinet: string; tape: string; parts: number; m: number }

export interface EdgebandRoom { roomId: string; room: string; cabinets: EdgebandCabinetLine[]; lines: EdgebandLine[] }

export interface EdgebandReport {
  rooms: EdgebandRoom[]
  totals: EdgebandLine[]
  totalM: number
  totalMWaste: number
  totalCost: number          // priced lines only
  unpriced: number           // lines with metres but no cost_per_metre
}

export function tapeName(p: EdgebandProduct | undefined, id: string | null): string {
  if (!id) return 'Tape not set'
  if (!p) return 'Unknown tape'
  // Most tape names already carry their size ("White 21x1") — add it only when missing.
  const size = p.thickness != null && p.width != null && !/\d\s*[x×]\s*\d/i.test(p.name) ? ` ${p.width}×${p.thickness}` : ''
  return [p.brand, p.name].filter(Boolean).join(' ') + size
}

const NATURAL = { numeric: true } as const

function rollup(runs: { id: string | null; mm: number; uid: string }[], products: Map<string, EdgebandProduct>, waste: number): EdgebandLine[] {
  const by = new Map<string | null, { mm: number; parts: Set<string> }>()
  for (const r of runs) {
    const e = by.get(r.id) ?? { mm: 0, parts: new Set<string>() }
    e.mm += r.mm; e.parts.add(r.uid); by.set(r.id, e)
  }
  return [...by.entries()].map(([id, e]) => {
    const p = id ? products.get(id) : undefined
    const m = e.mm / 1000
    const mWaste = m * (1 + waste)
    const costPerMetre = p?.cost_per_metre ?? null
    return {
      id, name: tapeName(p, id), thickness: p?.thickness ?? null, width: p?.width ?? null,
      parts: e.parts.size, m, mWaste, costPerMetre,
      cost: costPerMetre != null ? mWaste * costPerMetre : null,
    }
  }).sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || a.name.localeCompare(b.name, undefined, NATURAL))
}

/**
 * Edgeband report over snapshot parts (already scoped to the rooms wanted).
 * `waste` = fraction added on top of the finished metres (0.1 = 10%).
 */
export function buildEdgebandReport(
  parts: Pick<OptiPart, 'uid' | 'room_id' | 'room_name' | 'cabinet_instance_id' | 'cabinet_label' | 'eb_tape'>[],
  products: Map<string, EdgebandProduct>,
  waste: number,
  roomOrder: string[] = [],
): EdgebandReport {
  const runs = parts.flatMap(p => (p.eb_tape ?? []).map(t => ({ ...t, uid: p.uid, part: p })))
  const roomIds = [...new Set(runs.map(r => r.part.room_id))]
    .sort((a, b) => (roomOrder.indexOf(a) + 1 || 1e9) - (roomOrder.indexOf(b) + 1 || 1e9))
  const rooms: EdgebandRoom[] = roomIds.map(roomId => {
    const rr = runs.filter(r => r.part.room_id === roomId)
    const cab = new Map<string, EdgebandCabinetLine>()
    const uids = new Map<string, Set<string>>()
    for (const r of rr) {
      const k = `${r.part.cabinet_instance_id}|${r.id ?? ''}`
      const e = cab.get(k) ?? { cabinetId: r.part.cabinet_instance_id, cabinet: r.part.cabinet_label, tape: tapeName(r.id ? products.get(r.id) : undefined, r.id), parts: 0, m: 0 }
      const u = uids.get(k) ?? new Set<string>()
      u.add(r.uid); uids.set(k, u)
      e.m += r.mm / 1000; e.parts = u.size
      cab.set(k, e)
    }
    return {
      roomId, room: rr[0].part.room_name,
      cabinets: [...cab.values()]
        .sort((a, b) => a.cabinet.localeCompare(b.cabinet, undefined, NATURAL) || a.tape.localeCompare(b.tape)),
      lines: rollup(rr, products, waste),
    }
  })
  const totals = rollup(runs, products, waste)
  return {
    rooms, totals,
    totalM: totals.reduce((a, l) => a + l.m, 0),
    totalMWaste: totals.reduce((a, l) => a + l.mWaste, 0),
    totalCost: totals.reduce((a, l) => a + (l.cost ?? 0), 0),
    unpriced: totals.filter(l => l.cost == null && l.m > 0).length,
  }
}
