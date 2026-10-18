// Added (custom) parts → display layer item, by their parts_library key.
// Phase 3b: applied / end panels, fillers and other added parts switch separately.
// The key is known from parts_library (joined on load); a module cache keyed by
// part_library_id covers rows that arrive without the join (e.g. live updates
// from the cabinet editor).

const keyByLibraryId = new Map<string, string>()

export function rememberLibraryKeys(rows: { id: string; key: string | null }[]) {
  for (const r of rows) if (r.id && r.key) keyByLibraryId.set(r.id, r.key)
}

type CustomPartLike = { library_key?: string | null; part_library_id?: string | null }

export function customPartLibraryKey(p: CustomPartLike): string | undefined {
  return p.library_key ?? (p.part_library_id ? keyByLibraryId.get(p.part_library_id) : undefined)
}

/** Layer item id for an added part: applied_panels / fillers / custom_panels. */
export function customPartItem(p: CustomPartLike): string {
  const key = customPartLibraryKey(p)
  if (key === 'applied_panel') return 'applied_panels'
  if (key === 'filler_strip') return 'fillers'
  return 'custom_panels'
}

export const CUSTOM_PART_ITEMS = ['applied_panels', 'fillers', 'custom_panels'] as const

/** Supabase select for room-view custom part rows (includes the library key). */
export const ROOM_CUSTOM_PART_COLS =
  'id,cabinet_instance_id,part_library_id,name,material_id,dx,dy,dz,x,y,z,edge_top,edge_bottom,edge_left,edge_right,visible,show_in_room,hide_views,orientation,parts_library(key)'

/** Flatten the parts_library join onto the row as library_key (and cache it). */
export function withLibraryKey<T extends Record<string, unknown>>(rows: T[]): (T & { library_key: string | null })[] {
  return rows.map(r => {
    const lib = r.parts_library as { key?: string } | { key?: string }[] | null | undefined
    const key = (Array.isArray(lib) ? lib[0]?.key : lib?.key) ?? null
    if (key && typeof r.part_library_id === 'string') keyByLibraryId.set(r.part_library_id, key)
    const { parts_library: _omit, ...rest } = r
    void _omit
    return { ...(rest as T), library_key: key }
  })
}
