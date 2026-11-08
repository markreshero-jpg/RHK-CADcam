// Bulk-by-filter edits for the AI helper (z_ai_helper "Tools"): the AI names
// WHICH cabinets with a filter and WHAT to change; this expands it into one
// patch per cabinet. Pure — no DB — so it is testable and the server can show
// the expanded list before anything is saved.

import type { AssemblyClass, CabinetInstance, Wall } from '@/src/lib/types'
import { wallOffset } from './roomSummary'

export type NumField = 'dx' | 'dy' | 'dz' | 'pos_z' | 'offset'
export type Op = '=' | '!=' | '<' | '<=' | '>' | '>='

export interface CabinetFilter {
  labels?: string[]                 // e.g. ["WC-03", "WC-04"]
  codes?: string[]                  // library definition names, e.g. ["B2", "D3-1S2Pot"]
  classes?: AssemblyClass[]         // 'wall' also takes 'wall_corner', etc.
  walls?: string[]                  // wall names
  where?: { field: NumField; op: Op; value: number }[]
}

export type ScribeSide = 'left' | 'right' | 'top' | 'bottom' | 'back'
/** Scribe side → rule_overrides key (cabinet panel "Scribes (mm)"). */
export const SCRIBE_KEY: Record<ScribeSide, string> = { left: 'SCRL', right: 'SCRR', top: 'SCRT', bottom: 'SCRBT', back: 'SCRBK' }

/** Board colour roles the AI can set. Cabinet: material_overrides (role → materials.id),
 *  kick face: toekick_overrides.face. Room / job: room_materials / job_materials rows. */
export type MaterialRole = 'fronts' | 'carcass' | 'exposed' | 'shelf' | 'divider' | 'kick'
export const ROLE_KEY: Record<Exclude<MaterialRole, 'kick'>, string> = {
  fronts: 'door_face', carcass: 'interior', exposed: 'exposed', shelf: 'shelf', divider: 'divider',
}
export const MATERIAL_ROLES = ['fronts', 'carcass', 'exposed', 'shelf', 'divider', 'kick'] as const

/** Change whitelist (AI0 + AI2 + AI3b colours). */
export interface CabinetChanges {
  dx?: number
  dy?: number
  dz?: number
  pos_z?: number
  offset?: number                   // mm from the wall's start, as the summary shows it
  notes?: string | null
  /** mm per side; null = back to the inherited (room / job) scribe. */
  scribes?: Partial<Record<ScribeSide, number | null>>
  /** handle_schedules id (the server turns the name into it); null = inherit room / job. */
  handle_schedule_id?: string | null
  /** This cabinet's own board colours: role → materials.id (the server turns names into ids); null = inherit room / job. */
  materials?: Partial<Record<MaterialRole, string | null>>
}

export const CHANGE_KEYS = ['dx', 'dy', 'dz', 'pos_z', 'offset', 'notes', 'scribes', 'handle_schedule_id', 'materials'] as const

export interface MatchContext {
  walls: Wall[]
  defNames: Map<string, string>     // cabinet_definition_id → code
}

const CMP: Record<Op, (a: number, b: number) => boolean> = {
  '=': (a, b) => a === b, '!=': (a, b) => a !== b,
  '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b,
}

const lower = (xs?: string[]) => xs?.length ? new Set(xs.map(x => x.trim().toLowerCase())) : null

/** True when the filter names at least one condition — an empty filter matches nothing. */
export function filterHasCriteria(f: CabinetFilter): boolean {
  return !!(f.labels?.length || f.codes?.length || f.classes?.length || f.walls?.length || f.where?.length)
}

export function matchCabinets(f: CabinetFilter, cabinets: CabinetInstance[], ctx: MatchContext): CabinetInstance[] {
  if (!filterHasCriteria(f)) return []
  const labels = lower(f.labels), codes = lower(f.codes), walls = lower(f.walls)
  const classes = f.classes?.length ? new Set(f.classes) : null
  const wallById = new Map(ctx.walls.map(w => [w.id, w]))
  return cabinets.filter(c => {
    // A joined kick is its run's synthetic assembly — only edited when named.
    if (c.is_kick_assembly && !labels) return false
    if (labels && !labels.has((c.label ?? '').toLowerCase())) return false
    if (codes && !codes.has((c.cabinet_definition_id && ctx.defNames.get(c.cabinet_definition_id) || '').toLowerCase())) return false
    if (classes && !classes.has(c.assembly_class) && !classes.has(c.assembly_class.replace('_corner', '') as AssemblyClass)) return false
    const w = c.wall_id ? wallById.get(c.wall_id) : undefined
    if (walls && !(w && walls.has(w.name.toLowerCase()))) return false
    for (const cond of f.where ?? []) {
      const v = cond.field === 'offset' ? (w ? wallOffset(c, w) : NaN) : Number(c[cond.field] ?? 0)
      if (!CMP[cond.op]?.(v, cond.value)) return false
    }
    return true
  })
}

/** Validate a change set; returns the problems (empty = OK). */
export function validateChanges(ch: CabinetChanges): string[] {
  const errs: string[] = []
  for (const k of Object.keys(ch)) if (!(CHANGE_KEYS as readonly string[]).includes(k)) errs.push(`can't change "${k}" yet`)
  for (const k of ['dx', 'dy', 'dz'] as const) {
    const v = ch[k]
    if (v !== undefined && !(Number.isFinite(v) && v > 0 && v <= 6000)) errs.push(`${k} must be 1–6000 mm`)
  }
  if (ch.pos_z !== undefined && !(Number.isFinite(ch.pos_z) && ch.pos_z >= 0 && ch.pos_z <= 4000)) errs.push('pos_z must be 0–4000 mm')
  if (ch.offset !== undefined && !(Number.isFinite(ch.offset) && ch.offset >= 0)) errs.push('offset must be ≥ 0 mm')
  for (const role of Object.keys(ch.materials ?? {})) {
    if (!(MATERIAL_ROLES as readonly string[]).includes(role)) errs.push(`unknown colour role "${role}" (${MATERIAL_ROLES.join(', ')})`)
  }
  for (const [side, v] of Object.entries(ch.scribes ?? {})) {
    if (!(side in SCRIBE_KEY)) errs.push(`unknown scribe side "${side}" (left, right, top, bottom, back)`)
    else if (v !== null && !(Number.isFinite(v) && v >= 0 && v <= 200)) errs.push(`scribe ${side} must be 0–200 mm`)
  }
  return errs
}

/** The row patch for one cabinet (only fields that actually change), or null. */
export function patchFor(c: CabinetInstance, ch: CabinetChanges, walls: Wall[]): Partial<CabinetInstance> | null {
  const u: Partial<CabinetInstance> = {}
  for (const k of ['dx', 'dy', 'dz', 'pos_z'] as const) {
    if (ch[k] !== undefined && Number(c[k]) !== ch[k]) u[k] = Math.round(ch[k]! * 10) / 10
  }
  if (ch.notes !== undefined && (c.notes ?? null) !== ch.notes) u.notes = ch.notes
  if (ch.scribes) {
    const cur = (c.rule_overrides ?? {}) as Record<string, unknown>
    const next = { ...cur }
    for (const [side, v] of Object.entries(ch.scribes) as [ScribeSide, number | null][]) {
      const key = SCRIBE_KEY[side]
      if (v === null) delete next[key]; else next[key] = Math.round(v * 10) / 10
    }
    if (JSON.stringify(next) !== JSON.stringify(cur)) u.rule_overrides = next
  }
  if (ch.materials) {
    const merge = (cur: Record<string, unknown>, key: string, v: string | null) => {
      const next = { ...cur }
      if (v === null) delete next[key]; else next[key] = v
      return next
    }
    let mo = (c.material_overrides ?? {}) as Record<string, unknown>
    let to = (c.toekick_overrides ?? {}) as Record<string, unknown>
    for (const [role, v] of Object.entries(ch.materials) as [MaterialRole, string | null][]) {
      if (v === undefined) continue
      if (role === 'kick') to = merge(to, 'face', v)
      else mo = merge(mo, ROLE_KEY[role], v)
    }
    if (JSON.stringify(mo) !== JSON.stringify(c.material_overrides ?? {})) u.material_overrides = mo
    if (JSON.stringify(to) !== JSON.stringify(c.toekick_overrides ?? {})) u.toekick_overrides = to
  }
  if (ch.handle_schedule_id !== undefined) {
    const cur = (c.hardware_overrides ?? {}) as Record<string, unknown>
    if ((cur.handle_schedule_id ?? null) !== ch.handle_schedule_id) {
      const next = { ...cur }
      if (ch.handle_schedule_id === null) delete next.handle_schedule_id; else next.handle_schedule_id = ch.handle_schedule_id
      u.hardware_overrides = next
    }
  }
  if (ch.offset !== undefined) {
    const w = walls.find(x => x.id === c.wall_id)
    if (w && wallOffset(c, w) !== Math.round(ch.offset)) {
      const rad = (w.angle * Math.PI) / 180
      // Keep the cabinet's distance off the wall line; slide it along the wall.
      const along = ch.offset - wallOffset(c, w)
      u.pos_x = c.pos_x + along * Math.cos(rad)
      u.pos_y = c.pos_y + along * Math.sin(rad)
    }
  }
  return Object.keys(u).length ? u : null
}
