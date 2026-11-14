// Splashback material cascade (z_splashback S1, decisions L4 + L5).
//
// A row names its material from EITHER library:
//   material_id          → materials          (board stock / colours — CNC'd)
//   benchtop_material_id → benchtop_materials (stone, glass, tile… — supply only)
//
// Order: schedule (instance → room → job → shop → is_default) gives the base
// rows, then per-role job overrides, then room overrides (room wins). A
// override replaces the whole material choice for its role, so a board
// override never leaves a stale stone id behind. Last, when the shop setting
// `splashback_inherits_benchtop` is on, an empty `panel` takes the benchtop's
// worktop material.

export type SplashbackPartRole = 'panel' | 'substrate' | 'packer'

export const SPLASHBACK_ROLES: { key: SplashbackPartRole; label: string; desc: string }[] = [
  { key: 'panel',     label: 'Panel',     desc: 'The splashback itself' },
  { key: 'substrate', label: 'Substrate', desc: 'Backing board behind tile / glass' },
  { key: 'packer',    label: 'Packer',    desc: 'Battens when set off the wall' },
]

export interface SplashbackMaterialRow {
  part_role:            SplashbackPartRole
  material_id:          string | null
  benchtop_material_id: string | null
  edgeband_id:          string | null
  /** Where the effective choice came from — for UI hints. */
  source?: 'schedule' | 'job' | 'room' | 'benchtop'
}

export function pickSplashbackScheduleId(
  ...ids: (string | null | undefined)[]
): string | null {
  for (const id of ids) if (id) return id
  return null
}

/** The benchtop material a splashback panel inherits: stone slab first, else the worktop panel. */
export function benchtopPanelMaterial(
  rows: { part_role: string; material_id: string | null; benchtop_material_id: string | null }[],
): { material_id: string | null; benchtop_material_id: string | null } | null {
  for (const role of ['stone_slab', 'worktop_panel']) {
    const r = rows.find(x => x.part_role === role)
    if (r && (r.material_id || r.benchtop_material_id)) {
      return { material_id: r.material_id, benchtop_material_id: r.benchtop_material_id }
    }
  }
  return null
}

type Ovr = Omit<SplashbackMaterialRow, 'source'>

export function effectiveSplashbackRows(args: {
  scheduleRows:   Ovr[]
  jobOverrides?:  Ovr[]
  roomOverrides?: Ovr[]
  inheritBenchtop: boolean
  benchtopPanel?: { material_id: string | null; benchtop_material_id: string | null } | null
}): SplashbackMaterialRow[] {
  const byRole = new Map<SplashbackPartRole, SplashbackMaterialRow>()
  const has = (r: Ovr) => !!(r.material_id || r.benchtop_material_id)

  for (const r of args.scheduleRows) if (has(r)) byRole.set(r.part_role, { ...r, source: 'schedule' })
  for (const [list, source] of [[args.jobOverrides, 'job'], [args.roomOverrides, 'room']] as const) {
    for (const o of list ?? []) {
      if (!has(o)) continue
      const prev = byRole.get(o.part_role)
      byRole.set(o.part_role, {
        part_role:            o.part_role,
        material_id:          o.material_id,
        benchtop_material_id: o.material_id ? null : o.benchtop_material_id,
        edgeband_id:          o.edgeband_id ?? prev?.edgeband_id ?? null,
        source,
      })
    }
  }

  if (!byRole.has('panel') && args.inheritBenchtop && args.benchtopPanel) {
    const bp = args.benchtopPanel
    if (bp.material_id || bp.benchtop_material_id) {
      byRole.set('panel', {
        part_role:            'panel',
        material_id:          bp.material_id,
        benchtop_material_id: bp.material_id ? null : bp.benchtop_material_id,
        edgeband_id:          null,
        source:               'benchtop',
      })
    }
  }

  return SPLASHBACK_ROLES.map(r => byRole.get(r.key)).filter((r): r is SplashbackMaterialRow => !!r)
}

/** Board-library panels are cut parts; surface-library ones are supply only. */
export function splashbackPanelIsBoard(row: SplashbackMaterialRow | undefined): boolean {
  return !!row?.material_id
}
