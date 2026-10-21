import { describe, it, expect } from 'vitest'
import { fixtureDisplayName } from '../fixtureDisplayName'

// Short names on the drawings (z_shop_drawings, Mark 2026-10-21).
const f = (kind: string | null, category = 'appliance', name = 'Bosch Serie 8 HBG7741B1 Built-in Oven', display_name: string | null = null) =>
  ({ kind, category, name, display_name }) as Parameters<typeof fixtureDisplayName>[0]

describe('fixture display name', () => {
  it('generic names from the kind', () => {
    expect(fixtureDisplayName(f('Kitchen sink', 'sink'))).toBe('Sink')
    expect(fixtureDisplayName(f('Vanity basin', 'sink'))).toBe('Basin')
    expect(fixtureDisplayName(f('Tap', 'tap'))).toBe('Tap')
    expect(fixtureDisplayName(f('Oven'))).toBe('Oven')
    expect(fixtureDisplayName(f('Dishwasher'))).toBe('D/W')
    expect(fixtureDisplayName(f('Cooktop'))).toBe('Cooktop')
  })
  it('the display name wins; unknown kinds show as-is; no kind → category, then name', () => {
    expect(fixtureDisplayName(f('Oven', 'appliance', 'x', 'Steam oven'))).toBe('Steam oven')
    expect(fixtureDisplayName(f('Wine fridge'))).toBe('Fridge')
    expect(fixtureDisplayName(f('Pizza oven'))).toBe('Oven')
    expect(fixtureDisplayName(f('Warming drawer'))).toBe('Warming drawer')
    expect(fixtureDisplayName(f(null, 'tap'))).toBe('Tap')
    expect(fixtureDisplayName(f(null, 'decorative', 'Pendant light'))).toBe('Pendant light')
  })
})
