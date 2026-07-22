// ============================================================
// Code-level fallback part names — the LAST layer beneath the
// two data-driven layers (see src/lib/optimiser/normalize.ts):
//   1. cabinet_instances.part_names[source_part_key]  (per part)
//   2. parts_library.name where key = raw resolver key (per type, live)
//   3. PART_TYPE_LABELS[key]  ← THIS FILE              (code fallback)
//   4. humanize(part_key)                              (last resort)
// parts_library is seeded with every resolver key, so layers 3–4 only
// fire if a system row is deleted or deactivated.
//
// Keys are the RAW resolver identities (part_key / part_type / face_type) —
// collision-free across kinds because non-case parts carry their prefix in
// the key itself (db_bottom, inner_drawer_bottom, kick_back…). Only the
// drawer-box set is spelled out here: bare humanize would render db_bottom
// as "Bottom" at the optimiser, the ambiguity this fallback exists to avoid.
// ============================================================

export const PART_TYPE_LABELS: Record<string, string> = {
  db_left_side:  'Drawer Box Left Side',
  db_right_side: 'Drawer Box Right Side',
  db_bottom:     'Drawer Box Bottom',
  db_front:      'Drawer Box Front',
  db_back:       'Drawer Box Back',
}

export const humanizePartKey = (s: string): string =>
  s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

// Resolve a raw key to its code-default display name (beneath the two DB
// layers). `fallback` lets a caller pass a pre-humanized string it already
// computed; otherwise the raw key is humanized.
export const partTypeLabel = (typeKey: string, fallback?: string): string =>
  PART_TYPE_LABELS[typeKey] ?? fallback ?? humanizePartKey(typeKey)

// Full drawer-box panel names for the cabinet-context views (Cabinet3DView,
// cabinetEditSvgHelpers, PartsView) — keyed by raw part_type. Derived from
// PART_TYPE_LABELS so the strings live in exactly one place. NB: the drawer-box
// *library* views deliberately use a shorter register ("Bottom Panel", "Bottom")
// because there you are already inside a drawer box; those stay local.
export const DB_PART_LABELS: Record<string, string> = {
  db_left_side:  PART_TYPE_LABELS.db_left_side,
  db_right_side: PART_TYPE_LABELS.db_right_side,
  db_bottom:     PART_TYPE_LABELS.db_bottom,
  db_front:      PART_TYPE_LABELS.db_front,
  db_back:       PART_TYPE_LABELS.db_back,
}
