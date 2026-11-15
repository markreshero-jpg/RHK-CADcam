// <option>s for a benchtop_materials picker (z_benchtop_colours C2).
// Stone colours are child rows of a stone type (parent_id). The picker lists the
// types first, then one group per type + brand ("20mm Stone · YDL") holding its
// colours, so ~100 supplier colours don't swamp the list.
export type SurfaceMat = {
  id: string; name: string; dz: number; material_type?: string | null
  parent_id?: string | null; brand?: string | null; colour_name?: string | null; range_name?: string | null
}

/** Columns to select for a picker list. */
export const SURFACE_MAT_COLS = 'id, name, dz, material_type, parent_id, brand, colour_name, range_name'

export function BenchtopSurfaceOptions({ mats, prefix = '', typesLabel = 'Types', showType = false }: {
  mats: SurfaceMat[]
  /** Value prefix, e.g. 'surface:' for pickers mixing boards and surfaces. */
  prefix?: string
  typesLabel?: string
  showType?: boolean
}) {
  const types = mats.filter(m => !m.parent_id)
  const groups = new Map<string, { label: string; rows: SurfaceMat[] }>()
  for (const m of mats) {
    if (!m.parent_id) continue
    const parent = mats.find(t => t.id === m.parent_id)
    const key = `${m.parent_id}|${m.brand ?? ''}`
    if (!groups.has(key)) groups.set(key, { label: `${parent?.name ?? 'Colours'} · ${m.brand ?? 'colours'}`, rows: [] })
    groups.get(key)!.rows.push(m)
  }
  const sorted = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label))
  return (
    <>
      <optgroup label={typesLabel}>
        {types.map(m => (
          <option key={m.id} value={prefix + m.id}>
            {m.name} ({m.dz}mm){showType && m.material_type ? ` · ${m.material_type}` : ''}
          </option>
        ))}
      </optgroup>
      {sorted.map(g => (
        <optgroup key={g.label} label={g.label}>
          {g.rows.sort((a, b) => (a.colour_name ?? '').localeCompare(b.colour_name ?? '')).map(m => (
            <option key={m.id} value={prefix + m.id}>
              {m.brand ? `${m.brand} ` : ''}{m.colour_name}{m.range_name ? ` — ${m.range_name}` : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  )
}
