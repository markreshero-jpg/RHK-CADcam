import { describe, expect, it } from 'vitest'
import { cadSvg, cadText, sketchCount, type CadRow } from '../cadImage'

const rows: CadRow[] = [
  { kind: 'line', geom: { pts: [{ x: 0, y: 0 }, { x: 10, y: 3 }, { x: 25, y: 0 }], freehand: true }, text: null, style: { color: '#2563eb' } },
  { kind: 'rect', geom: { a: { x: 0, y: 0 }, b: { x: 600, y: 580 } }, text: null },
  { kind: 'dim', geom: { p1: { x: 0, y: 0 }, p2: { x: 1970, y: 0 }, offset: -200, axis: 'x' }, text: null },
  { kind: 'text', geom: { at: { x: 100, y: 900 } }, text: 'CH = 2430\ncornice 90' },
  { kind: 'dim', geom: { p1: { x: 0, y: 0 }, p2: { x: 0, y: 805 }, offset: 100, axis: 'y' }, text: '805 W/M' },
]

describe('cad picture', () => {
  it('draws every kind with a labelled grid', () => {
    const p = cadSvg(rows, { title: 'Plan' })!
    expect(p.items).toBe(5)
    expect(p.svg).toContain('<svg')
    expect(p.svg).toContain('>1970<')            // dim value
    expect(p.svg).toContain('805 W/M')            // typed-over dim text
    expect(p.svg).toContain('CH = 2430')
    expect(p.svg).toMatch(/grid \d+ mm/)
    expect(Math.max(p.width, p.height)).toBe(1600)
  })

  it('flips y for an elevation', () => {
    const plan = cadSvg([rows[1]])!, elev = cadSvg([rows[1]], { flipY: true })!
    expect(plan.svg).not.toBe(elev.svg)
    expect(elev.svg).toContain('height off the floor')
  })

  it('lists typed text and dims as words, and counts sketch strokes', () => {
    const t = cadText(rows)
    expect(t).toContain('text at (100, 900): "CH = 2430 / cornice 90"')
    expect(t.some(l => l.startsWith('dim 1970 from (0, 0) to (1970, 0)'))).toBe(true)
    expect(t.some(l => l.includes('805 W/M') && l.includes('measured 805'))).toBe(true)
    expect(sketchCount(rows)).toBe(1)
  })

  it('returns null with nothing to draw', () => {
    expect(cadSvg([])).toBeNull()
    expect(cadSvg([{ kind: 'text', geom: { at: { x: 0, y: 0 } }, text: '' }])).toBeNull()
  })
})
