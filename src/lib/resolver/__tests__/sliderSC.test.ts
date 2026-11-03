import { describe, it, expect } from 'vitest'
import { panelWidth, panelHeight, sliderDoors, sliderCuts, sliderBuyList, sliderWarnings, PROFILE_REACH, SLIDER, guideSection, railSection, type SliderLayout, type SliderStile } from '../sliderSC'

const stiles: SliderStile[] = ['handle', 'slimline', 'handle16']

describe('Slider SC panel sizes (Häfele page 6)', () => {
  it('panel widths match the brochure formulas', () => {
    expect(panelWidth(2400, '2', 'handle')).toBe((2400 - 92) / 2)
    expect(panelWidth(3000, '3', 'handle')).toBe((3000 - 108) / 3)
    expect(panelWidth(2400, '2', 'slimline')).toBe((2400 + 60 - 14) / 2)
    expect(panelWidth(3000, '3T', 'slimline')).toBe((3000 + 120 - 21) / 3)
    expect(panelWidth(2400, '2', 'handle16')).toBe((2400 - 24) / 2)
    expect(panelWidth(3000, '3', 'handle16')).toBe((3000 - 6) / 3)
  })

  it('profile reach gives a ~60 overlap at every joint', () => {
    for (const s of stiles) for (const layout of ['2', '3', '3T'] as SliderLayout[]) {
      const n = layout === '2' ? 2 : 3
      const doorW = panelWidth(3000, layout, s) + 2 * PROFILE_REACH[s]
      const overlap = (n * doorW - 3000) / (n - 1)
      expect(Math.abs(overlap - SLIDER.overlap)).toBeLessThan(1)
    }
  })

  it('door height = IH − 55; slimline panel 12 shorter for the spacers', () => {
    expect(panelHeight(2400, 'handle')).toBe(2345)
    expect(panelHeight(2400, 'slimline')).toBe(2333)
  })
})

describe('Slider SC door layout', () => {
  it('outer doors meet the recess ends, tracks per the page 6 diagrams', () => {
    const d = sliderDoors(2400, 2400, '2', 'handle')
    expect(d[0].x0).toBe(0)
    expect(d[1].x1).toBeCloseTo(2400)
    expect(d.map(x => x.track)).toEqual([0, 1])
    expect(d[1].dCentre - d[0].dCentre).toBe(39)
    expect(sliderDoors(3000, 2400, '3', 'handle').map(x => x.track)).toEqual([0, 1, 0])
    expect(sliderDoors(3000, 2400, '3T', 'handle').map(x => x.track)).toEqual([0, 1, 2])
  })
})

describe('Slider SC cuts and bars', () => {
  it('tracks at the opening width, verticals at door height, horizontals at panel width', () => {
    const cuts = sliderCuts(2400, 2400, { layout: '2', stile: 'handle', finish: 'silver', railLip: true })
    expect(cuts.find(c => c.key === 'guide2')!.length).toBe(2400)
    expect(cuts.find(c => c.key === 'rail2Lip')!.length).toBe(2400)
    expect(cuts.find(c => c.key === 'handle')).toMatchObject({ length: 2345, qty: 4 })
    expect(cuts.find(c => c.key === 'horiz')).toMatchObject({ length: 1154, qty: 4 })
  })

  it('buys the shortest bar that fits, and shares bars between short cuts', () => {
    const { buy, tooLong } = sliderBuyList(sliderCuts(2400, 2400, { layout: '2', stile: 'handle', finish: 'silver', railLip: true }), 'silver')
    expect(tooLong).toEqual([])
    expect(buy.find(b => b.key === 'guide2')).toMatchObject({ length: 2700, cat: '403.90.802', qty: 1 })
    expect(buy.find(b => b.key === 'handle')).toMatchObject({ length: 2750, cat: '126.35.913', qty: 4 })
    // 4 × 1154: two per 2700 bar → 2 bars of 2700... or shorter where they fit
    const horiz = buy.filter(b => b.key === 'horiz')
    expect(horiz.reduce((s, b) => s + b.qty * b.length, 0)).toBeGreaterThanOrEqual(4 * 1154)
    expect(horiz.reduce((s, b) => s + b.qty, 0)).toBe(2)
  })
})

describe('Slider SC warnings', () => {
  it('flags door size, board thickness, finish and over-length', () => {
    const codes = (icw: number, ih: number, board: number, stile: SliderStile, finish: 'white' | 'silver' | 'black' = 'silver') =>
      sliderWarnings(icw, ih, board, { layout: '2', stile, finish, railLip: true }).map(w => w.code)
    expect(codes(2400, 2400, 16.5, 'handle')).toEqual([])
    expect(codes(2400, 2900, 16.5, 'handle')).toContain('SLIDER_DOOR_HEIGHT')
    expect(codes(1500, 2400, 16.5, 'handle')).toContain('SLIDER_DOOR_WIDTH')
    expect(codes(2400, 2400, 18, 'handle16')).toContain('SLIDER_BOARD_THICK')
    expect(codes(2400, 2400, 16, 'handle16', 'black')).toContain('SLIDER_FINISH_NA')
    expect(codes(3700, 2400, 16.5, 'handle')).toContain('SLIDER_TOO_LONG')
  })
})

describe('Slider SC track sections', () => {
  it('guide 79 / 117 wide, 50 high; rail 81 / 53 / 119', () => {
    const span = (p: readonly (readonly [number, number])[], i: 0 | 1) => Math.max(...p.map(q => q[i])) - Math.min(...p.map(q => q[i]))
    expect(span(guideSection(2), 0)).toBe(79)
    expect(span(guideSection(3), 0)).toBe(117)
    expect(span(guideSection(2), 1)).toBe(50)
    expect(span(railSection(2, true), 0)).toBe(81)
    expect(span(railSection(2, false), 0)).toBe(53)
    expect(span(railSection(3, true), 0)).toBe(119)
  })
})
