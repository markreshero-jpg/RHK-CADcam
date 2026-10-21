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

export function fixtureDisplayName(f: Pick<RoomFixture, 'display_name' | 'kind' | 'category' | 'name'>): string {
  const own = f.display_name?.trim()
  if (own) return own
  const kind = (f.kind ?? '').trim()
  const k = kind.toLowerCase()
  if (BY_KIND[k]) return BY_KIND[k]
  for (const [key, v] of Object.entries(BY_KIND)) if (k.includes(key)) return v
  if (kind) return kind
  return BY_CATEGORY[f.category] || f.name
}
