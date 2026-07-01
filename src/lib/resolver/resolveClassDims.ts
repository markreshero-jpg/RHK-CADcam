import { DEFAULT_DIMS } from '@/src/lib/types'

// ── Cabinet Height(dy)/Depth(dz) cascade ──────────────────────────────────────
// Resolved at PLACEMENT time (not in the resolver — per the library spec, dims are
// baked onto the instance and loadCabinetInput reads them from the instance row).
// Both the legacy class-based path and the library-definition path call this so a
// placed cabinet's size cascades:
//
//     room.class_dimension_defaults[class]
//       ?? project.class_dimension_defaults[class]   (Job Properties)
//       ?? shop.<class>                               (shop_settings.default_<class>_d*)
//       ?? DEFAULT_DIMS[class]                        (system constant)
//
// Only height/depth cascade — width (dx) stays intrinsic to the definition/gap-fit
// (there is no width default at any level). Corner classes map to their base key
// (base_corner → base) for the lookup, mirroring the legacy placeCabinet behaviour.

// JSONB shape stored on both projects.class_dimension_defaults and
// rooms.class_dimension_defaults.
export type ClassDimDefaults = {
  base?: { dy?: number | null; dz?: number | null }
  wall?: { dy?: number | null; dz?: number | null }
  tall?: { dy?: number | null; dz?: number | null }
}

// Shop-level defaults, mapped from the flat shop_settings columns
// (default_base_dy/dz, default_wall_dy/dz, default_tall_dy/dz) into the same shape.
export type ShopDimDefaults = ClassDimDefaults

export interface ClassDimContext {
  room?:    { class_dimension_defaults?: unknown } | null
  project?: { class_dimension_defaults?: unknown } | null
  shop?:    ShopDimDefaults | null
}

// Coerce to a finite positive number, else undefined (so null/NaN/0 fall through).
function dim(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function classDefaultsOf(src: { class_dimension_defaults?: unknown } | null | undefined, key: 'base' | 'wall' | 'tall') {
  const cd = (src?.class_dimension_defaults ?? null) as ClassDimDefaults | null
  return cd?.[key]
}

export function resolveClassDims(
  assemblyClass: string,
  ctx: ClassDimContext,
): { dy: number; dz: number } {
  const sys = DEFAULT_DIMS[assemblyClass] ?? DEFAULT_DIMS.base
  const key = assemblyClass.replace('_corner', '') as 'base' | 'wall' | 'tall'

  const room = classDefaultsOf(ctx.room, key)
  const job  = classDefaultsOf(ctx.project, key)
  const shop = ctx.shop?.[key]

  return {
    dy: dim(room?.dy) ?? dim(job?.dy) ?? dim(shop?.dy) ?? sys.dy,
    dz: dim(room?.dz) ?? dim(job?.dz) ?? dim(shop?.dz) ?? sys.dz,
  }
}

// Map the flat shop_settings row to ShopDimDefaults. Returns null when no row.
export function shopDimsFromSettings(
  s: Record<string, unknown> | null | undefined,
): ShopDimDefaults | null {
  if (!s) return null
  return {
    base: { dy: dim(s.default_base_dy) ?? null, dz: dim(s.default_base_dz) ?? null },
    wall: { dy: dim(s.default_wall_dy) ?? null, dz: dim(s.default_wall_dz) ?? null },
    tall: { dy: dim(s.default_tall_dy) ?? null, dz: dim(s.default_tall_dz) ?? null },
  }
}
