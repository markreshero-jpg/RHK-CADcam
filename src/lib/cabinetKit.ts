// ── Cabinet kits (z_wot K3) ──────────────────────────────────────────────────
// A library definition can carry a kit: other library cabinets dropped with it
// from one pick, each its own cabinet (parts / nest / cost) — e.g. the WOT oven
// core with an end panel either side, a D2-LL below and a W2D above.
//
// Each member's position and size are formulas, evaluated in order with:
//   t.* / r.*   the member's own thicknesses + rules (its class's cascade)
//   tall / base / wallcab   { h, d } class sizes for the room (+ wallcab.top)
//   k.<key>     an earlier member: { x, y, w, h, d, gap, top }
// x runs left → right facing the kit's front, from the kit's left edge; y is the
// height off the floor (wall members hang from the wall-cabinet top, so their y
// is ignored); gap stands the member off the wall (K1).

import { evaluateFormula, type FormulaScope, type ScopeValue } from './formula'
import type { NeighbourType, TopType } from './types'

export type KitExpr = string | number

export interface KitMember {
  key: string
  /** Library definition name, or 'self' = the definition carrying the kit. */
  def: string
  x?: KitExpr; y?: KitExpr; dx?: KitExpr; dy?: KitExpr; dz?: KitExpr; gap?: KitExpr
  top_type?: TopType
  /** Rule overrides merged onto the member (formulas allowed). */
  rules?: Record<string, KitExpr>
  /** Custom parts added after the definition's own (definition snapshot shape). */
  parts?: Record<string, unknown>[]
  neighbours?: [NeighbourType, NeighbourType]
}

export interface CabinetKit { members: KitMember[] }

export interface KitMemberEnv {
  /** The member's size as built from its definition — the defaults for dx/dy/dz. */
  size: { dx: number; dy: number; dz: number }
  t: Record<string, number>
  r: Record<string, number>
}

export interface KitRoomEnv {
  tall: { h: number; d: number }
  base: { h: number; d: number }
  wallcab: { h: number; d: number; top: number }
}

export interface KitPlaced {
  key: string
  x: number; y: number; dx: number; dy: number; dz: number; gap: number
  rules: Record<string, number>
}

export function parseKit(raw: unknown): CabinetKit | null {
  const m = (raw as CabinetKit | null)?.members
  if (!Array.isArray(m) || !m.length) return null
  return { members: m.filter(x => x && typeof x.key === 'string' && typeof x.def === 'string') }
}

export function layoutKit(
  kit: CabinetKit,
  envFor: (m: KitMember) => KitMemberEnv,
  room: KitRoomEnv,
): { placed: KitPlaced[]; width: number; errors: string[] } {
  const placed: KitPlaced[] = []
  const errors: string[] = []
  const k: Record<string, ScopeValue> = {}
  for (const m of kit.members) {
    const env = envFor(m)
    const scope: FormulaScope = {
      roots: { t: env.t, r: env.r, tall: room.tall, base: room.base, wallcab: room.wallcab, k },
      lookup: () => undefined,
    }
    const ev = (e: KitExpr | undefined, fallback: number, what: string): number => {
      if (e == null || e === '') return fallback
      if (typeof e === 'number') return e
      const res = evaluateFormula(e, scope)
      if (res.ok) return res.value
      errors.push(`${m.key}.${what}: ${res.error.message}`)
      return fallback
    }
    const p: KitPlaced = {
      key: m.key,
      x: ev(m.x, 0, 'x'), y: ev(m.y, 0, 'y'),
      dx: ev(m.dx, env.size.dx, 'dx'), dy: ev(m.dy, env.size.dy, 'dy'), dz: ev(m.dz, env.size.dz, 'dz'),
      gap: 0, rules: {},
    }
    p.gap = Math.max(0, ev(m.gap, 0, 'gap'))
    for (const [rk, re] of Object.entries(m.rules ?? {})) p.rules[rk] = ev(re, 0, `rules.${rk}`)
    k[m.key] = { x: p.x, y: p.y, w: p.dx, h: p.dy, d: p.dz, gap: p.gap, top: p.y + p.dy }
    placed.push(p)
  }
  const width = placed.reduce((w, p) => Math.max(w, p.x + p.dx), 0)
  return { placed, width, errors }
}

/** Along-wall start of a member. A turned frame (local +X runs back along the
 *  wall — cabinetPlanFrame) mirrors the kit so its left stays on the left. */
export function kitMemberT(t0: number, width: number, p: Pick<KitPlaced, 'x' | 'dx'>, turned: boolean): number {
  return turned ? t0 + width - p.x - p.dx : t0 + p.x
}
