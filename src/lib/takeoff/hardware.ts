// ============================================================
// Hardware pick list + takeoff counts (z_takeoff T1). Pure rollups over the
// saved resolved cabinets (ReportsModal's allResolved: removed parts already
// out via filterRemovedParts, so a removed front takes its hinges / runners /
// handle with it).
//
// Hardware = what the resolver places: hinges + plates, runners (pairs, by
// product + length, inner drawers on their own lines), pull-out bins, handles
// (knobs/pulls, push-to-open, linear strips), hanging rails + supports. Finger
// pulls (sharknose / rail / routed / channel) are worked into the fronts — they
// are counted for the takeoff, not picked.
// ============================================================

import type { ResolvedCabinet, GripKind } from '../resolver/types'

// ── Cabinet classification ───────────────────────────────────────────────────

export type TakeoffKind = 'base' | 'wall' | 'tall' | 'end_panel' | 'filler' | 'bulkhead' | 'shadowline' | 'floating_shelf'

export const KIND_LABEL: Record<TakeoffKind, string> = {
  base: 'Base cabinets', wall: 'Wall cabinets', tall: 'Tall cabinets',
  end_panel: 'End panels', filler: 'Fillers', bulkhead: 'Bulkheads', shadowline: 'Shadowlines', floating_shelf: 'Floating shelves',
}
export const KIND_ORDER: TakeoffKind[] = ['base', 'wall', 'tall', 'end_panel', 'filler', 'bulkhead', 'shadowline', 'floating_shelf']

export interface TakeoffCab {
  id: string
  room_id: string
  label: string | null
  assembly_class: string | null
  is_kick_assembly?: boolean | null
  bulkhead?: unknown
  float_shelf?: unknown
}

/**
 * What a placed item counts as, from its library code (cabinet-codes skill):
 * BHSL shadowline, BH* bulkhead, FLSHLF floating shelf, *EP* / IBP* / BUP / WUP /
 * *CRVFIXP panels, [BTW]F* fillers; everything else is a cabinet of its class
 * (corners fold into base / wall / tall). Kick assemblies → null (not counted).
 */
export function takeoffKind(code: string | null | undefined, cab: TakeoffCab): TakeoffKind | null {
  if (cab.is_kick_assembly) return null
  const c = (code ?? '').toUpperCase()
  if (c.startsWith('BHSL')) return 'shadowline'
  if (c.startsWith('BH') || cab.bulkhead) return 'bulkhead'
  if (c.startsWith('FLSHLF') || cab.float_shelf) return 'floating_shelf'
  if (/^[BTW]EP/.test(c) || /^IBP/.test(c) || /^[BW]UP$/.test(c) || /CRVFIXP$/.test(c)) return 'end_panel'
  if (/^[BTW]F/.test(c)) return 'filler'
  const ac = cab.assembly_class ?? 'base'
  return ac.startsWith('wall') ? 'wall' : ac.startsWith('tall') ? 'tall' : 'base'
}

export interface KindCount { kind: TakeoffKind; count: number; codes: { code: string; count: number }[] }

export function countKinds(cabs: TakeoffCab[], codeOf: (c: TakeoffCab) => string | null): KindCount[] {
  const by = new Map<TakeoffKind, Map<string, number>>()
  for (const c of cabs) {
    const code = codeOf(c)
    const kind = takeoffKind(code, c)
    if (!kind) continue
    const m = by.get(kind) ?? new Map<string, number>()
    const k = code || 'Custom'
    m.set(k, (m.get(k) ?? 0) + 1)
    by.set(kind, m)
  }
  return KIND_ORDER.filter(k => by.has(k)).map(kind => {
    const codes = [...by.get(kind)!].map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code, undefined, { numeric: true }))
    return { kind, count: codes.reduce((a, c) => a + c.count, 0), codes }
  })
}

// ── Hardware ─────────────────────────────────────────────────────────────────

export type HardwareGroup = 'Hinges' | 'Hinge plates' | 'Runners' | 'Inner drawer runners' | 'Bins' | 'Handles' | 'Push to open' | 'Linear handles' | 'Hanging rails' | 'Rail supports'
export const HARDWARE_GROUPS: HardwareGroup[] = ['Hinges', 'Hinge plates', 'Runners', 'Inner drawer runners', 'Bins', 'Handles', 'Push to open', 'Linear handles', 'Hanging rails', 'Rail supports']

export interface HardwareProduct { name: string; brand?: string | null; code?: string | null }
export interface HardwareProducts {
  hinges: Map<string, HardwareProduct>
  plates: Map<string, HardwareProduct>
  slides: Map<string, HardwareProduct>
  handles: Map<string, HardwareProduct>
  accessories: Map<string, HardwareProduct>
}

export interface HardwareLine {
  key: string
  group: HardwareGroup
  name: string
  brand: string | null
  code: string | null
  qty: number
  unit: 'ea' | 'pr'
  /** Hanging rails / linear handles: each cut length (mm), longest first. */
  lengths?: number[]
  /** Cabinet labels using it, with how many each. */
  cabinets: { label: string; qty: number }[]
}

export interface FingerPullLine { name: string; grip: GripKind; fronts: number }

export interface RoomHardware { roomId: string; lines: HardwareLine[]; fingerPulls: FingerPullLine[] }

const FINGER_GRIPS: GripKind[] = ['sharknose', 'rail', 'routed', 'channel']

class Acc {
  lines = new Map<string, HardwareLine>()
  add(group: HardwareGroup, id: string, extra: string, prod: HardwareProduct | undefined, fallback: string, cab: string, qty: number, unit: 'ea' | 'pr', length?: number) {
    const key = `${group}|${id}|${extra}`
    let l = this.lines.get(key)
    if (!l) {
      const name = (prod?.name ?? fallback) + (extra ? ` ${extra}` : '')
      l = { key, group, name, brand: prod?.brand ?? null, code: prod?.code ?? null, qty: 0, unit, cabinets: [] }
      this.lines.set(key, l)
    }
    l.qty += qty
    if (length != null) (l.lengths ??= []).push(Math.round(length))
    const c = l.cabinets.find(x => x.label === cab)
    if (c) c.qty += qty; else l.cabinets.push({ label: cab, qty })
  }
}

/** Pairs in a run of slides: one left + one right = a pair (a lone rail still needs a pair). */
function pairs(n: number) { return Math.ceil(n / 2) }
/** Runner length tag — skipped when the product name already carries it ("Dragon Pro 500x127"). */
const lenTag = (p: HardwareProduct | undefined, nl: number) => (p?.name.includes(String(nl)) ? '' : `${nl}mm`)

function cabinetHardware(r: ResolvedCabinet, label: string, P: HardwareProducts, acc: Acc, fp: Map<string, FingerPullLine>) {
  for (const h of r.hinge_instances ?? []) {
    acc.add('Hinges', h.hinge_hardware_id, '', P.hinges.get(h.hinge_hardware_id), h.hinge_name ?? 'Hinge', label, 1, 'ea')
    if (h.hinge_plate_id) acc.add('Hinge plates', h.hinge_plate_id, '', P.plates.get(h.hinge_plate_id), 'Hinge plate', label, 1, 'ea')
  }
  for (const s of r.drawer_stacks ?? []) {
    if (!s.slides.length) continue
    const id = s.slides[0].slide_id
    if (s.drawer_type === 'bin') { acc.add('Bins', id, '', P.slides.get(id), 'Pull-out bin', label, 1, 'ea'); continue }
    const nl = s.slides[0].nominal_length
    acc.add('Runners', id, lenTag(P.slides.get(id), nl), P.slides.get(id), 'Runner', label, pairs(s.slides.length), 'pr')
  }
  // Inner drawer / pull-out rails: grouped by the drawer they belong to.
  const inner = new Map<string, { id: string; nl: number; n: number }>()
  for (const s of r.internal_slides ?? []) {
    const k = `${s.inner_drawer_index ?? 'x'}|${s.slide_id}`
    const e = inner.get(k) ?? { id: s.slide_id, nl: s.nominal_length, n: 0 }
    e.n++; inner.set(k, e)
  }
  for (const e of inner.values()) acc.add('Inner drawer runners', e.id, lenTag(P.slides.get(e.id), e.nl), P.slides.get(e.id), 'Runner', label, pairs(e.n), 'pr')

  for (const z of r.face_zones ?? []) {
    const h = z.handle
    if (!h || !h.handle_id) continue
    if (FINGER_GRIPS.includes(h.grip_kind)) {
      const k = `${h.grip_kind}|${h.handle_id}`
      const l = fp.get(k) ?? { name: P.handles.get(h.handle_id)?.name ?? h.name, grip: h.grip_kind, fronts: 0 }
      l.fronts++; fp.set(k, l)
      continue
    }
    const group: HardwareGroup = h.grip_kind === 'push' ? 'Push to open' : h.grip_kind === 'linear' ? 'Linear handles' : 'Handles'
    acc.add(group, h.handle_id, '', P.handles.get(h.handle_id), h.name, label, 1, 'ea', h.grip_kind === 'linear' ? (h.strip?.length ?? h.length ?? undefined) : undefined)
  }

  for (const p of r.internal_parts ?? []) {
    if (!p.accessory) continue
    if (p.part_type === 'accessory') acc.add('Hanging rails', p.accessory.product_id, '', P.accessories.get(p.accessory.product_id), p.accessory.name, label, 1, 'ea', p.DY)
    else if (p.part_type === 'rail_support') acc.add('Rail supports', p.accessory.product_id, '', P.accessories.get(p.accessory.product_id), p.accessory.name, label, 1, 'ea')
  }
}

const groupRank = (g: HardwareGroup) => HARDWARE_GROUPS.indexOf(g)
const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, undefined, { numeric: true })

function finish(acc: Acc, fp: Map<string, FingerPullLine>) {
  const lines = [...acc.lines.values()].sort((a, b) => groupRank(a.group) - groupRank(b.group) || a.name.localeCompare(b.name, undefined, { numeric: true }))
  for (const l of lines) { l.cabinets.sort(byLabel); l.lengths?.sort((a, b) => b - a) }
  const fingerPulls = [...fp.values()].sort((a, b) => a.grip.localeCompare(b.grip) || a.name.localeCompare(b.name))
  return { lines, fingerPulls }
}

export function buildHardware(
  roomIds: string[],
  cabs: TakeoffCab[],
  resolved: Map<string, ResolvedCabinet>,
  P: HardwareProducts,
): { rooms: RoomHardware[]; totals: HardwareLine[]; fingerPulls: FingerPullLine[] } {
  const jobAcc = new Acc()
  const jobFp = new Map<string, FingerPullLine>()
  const rooms = roomIds.map(roomId => {
    const acc = new Acc()
    const fp = new Map<string, FingerPullLine>()
    const roomCabs = cabs.filter(c => c.room_id === roomId && !c.is_kick_assembly)
    for (const c of roomCabs) {
      const r = resolved.get(c.id)
      if (!r) continue
      cabinetHardware(r, c.label ?? '?', P, acc, fp)
      cabinetHardware(r, c.label ?? '?', P, jobAcc, jobFp)
    }
    return { roomId, ...finish(acc, fp) }
  })
  const job = finish(jobAcc, jobFp)
  return { rooms, totals: job.lines, fingerPulls: job.fingerPulls }
}

export const GRIP_LABEL: Partial<Record<GripKind, string>> = { sharknose: 'Sharknose', rail: 'Finger rail', routed: 'Routed', channel: 'Channel' }

export const unitLabel = (l: HardwareLine) => (l.unit === 'pr' ? (l.qty === 1 ? 'pair' : 'pairs') : '')

/** "2 × 1200, 900" → metres too, for rails / linear handles. */
export function lengthsText(ls: number[] | undefined): string {
  if (!ls?.length) return ''
  const by = new Map<number, number>()
  for (const l of ls) by.set(l, (by.get(l) ?? 0) + 1)
  const total = ls.reduce((a, b) => a + b, 0) / 1000
  return [...by].map(([l, n]) => (n > 1 ? `${n} × ${l}` : `${l}`)).join(', ') + ` (${total.toFixed(2)} m)`
}
