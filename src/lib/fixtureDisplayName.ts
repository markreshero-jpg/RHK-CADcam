// The name a fixture shows ON THE DRAWINGS (plan, elevation, shop drawings) —
// short, so labels don't crowd the sheet; the full name / model lives in the
// spec block and schedules (label || name). z_shop_drawings, Mark 2026-10-21.
import type { RoomFixture } from './types'

/** Generic short names by catalogue kind (lower-case). */
const BY_KIND: Record<string, string> = {
  'kitchen sink': 'Sink', sink: 'Sink',
  'vanity basin': 'Basin', basin: 'Basin',
  tap: 'Tap', mixer: 'Tap',
  cooktop: 'Cooktop', hob: 'Cooktop',
  oven: 'Oven', microwave: 'Microwave', dishwasher: 'D/W',
  rangehood: 'Rangehood', fridge: 'Fridge', refrigerator: 'Fridge',
}
const BY_CATEGORY: Record<string, string> = { sink: 'Sink', tap: 'Tap', appliance: 'Appliance', decorative: '' }

/**
 * Integrated appliance (Mark 2026-11-05, RHK6478 kitchen): a dishwasher linked
 * to a cabinet (it sits behind that cabinet's front) or named "integrated".
 * It labels "Integrated DW" and isn't drawn in elevation — the cabinet front
 * in front of it is all that shows.
 */
export function fixtureIntegrated(f: Pick<RoomFixture, 'kind' | 'name'> & { cabinet_id?: string | null }): boolean {
  if (!/dishwasher/i.test(f.kind ?? '')) return false
  return !!f.cabinet_id || (/integrated/i.test(f.name ?? '') && !/semi/i.test(f.name ?? ''))
}

export function fixtureDisplayName(f: Pick<RoomFixture, 'display_name' | 'kind' | 'category' | 'name'> & { cabinet_id?: string | null }): string {
  const own = f.display_name?.trim()
  if (own) return own
  if (fixtureIntegrated(f)) return 'Integrated DW'
  const kind = (f.kind ?? '').trim()
  const k = kind.toLowerCase()
  if (BY_KIND[k]) return BY_KIND[k]
  for (const [key, v] of Object.entries(BY_KIND)) if (k.includes(key)) return v
  if (kind) return kind
  return BY_CATEGORY[f.category] || f.name
}
