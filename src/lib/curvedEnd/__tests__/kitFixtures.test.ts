// Curved end C1: the native engine against the shop-proven kit fixtures
// (z_curved_end/kit/fixtures). Derived numbers vs expected.json, and every
// part's outline / pocket / cut-out / holes vs the golden DXFs, entity by
// entity to 0.01 mm (same keys as the kit's check_dxf.mjs). The S2M layer
// names below exist only to read the golden files — RHK cuts natively.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { calcCurvedEnd, curvedEndParts, partFileName, revLoop, type CurvedEndParams, type Loop } from '../geometry'
import { kitHoles } from '../kitHoles'
import type { OutlinePt } from '../../shapePath'

const FIX = path.join(process.cwd(), 'z_curved_end', 'kit', 'fixtures')
const cases: { id: string; p: Partial<CurvedEndParams> }[] = JSON.parse(fs.readFileSync(path.join(FIX, 'cases.json'), 'utf8'))
const expected = JSON.parse(fs.readFileSync(path.join(FIX, 'expected.json'), 'utf8'))
const r2 = (v: number) => Math.round(v * 100) / 100

// ── golden DXF reader (port of check_dxf.mjs parse/key) ──
interface Ent { type: 'poly' | 'circle'; layer: string; closed?: boolean; pts?: { x: number; y: number; b: number }[]; x?: number; y?: number; r?: number }
function parseDxf(text: string): Ent[] {
  const L = text.split(/\r?\n/), ents: Ent[] = []
  let inEnt = false, cur: (Ent & { _v?: { x: number; y: number; b: number } | null }) | null = null
  for (let i = 0; i + 1 < L.length; i += 2) {
    const g = L[i].trim(), v = L[i + 1].trim()
    if (g === '2' && v === 'ENTITIES') { inEnt = true; continue }
    if (!inEnt) continue
    if (g === '0' && v === 'ENDSEC') break
    if (g === '0') {
      if (v === 'POLYLINE') { cur = { type: 'poly', layer: '', pts: [], closed: false }; ents.push(cur) }
      else if (v === 'VERTEX') { const p = { x: 0, y: 0, b: 0 }; cur!.pts!.push(p); cur!._v = p }
      else if (v === 'SEQEND') { cur!._v = null }
      else if (v === 'CIRCLE') { cur = { type: 'circle', layer: '', x: 0, y: 0, r: 0 }; ents.push(cur) }
      else cur = null
      continue
    }
    if (!cur) continue
    const t: Record<string, number> = (cur._v ?? cur) as unknown as Record<string, number>
    if (g === '8' && !cur._v) cur.layer = v
    if (g === '70' && cur.type === 'poly' && !cur._v) cur.closed = (+v & 1) === 1
    if (g === '10') t.x = +v
    if (g === '20') t.y = +v
    if (g === '40') t.r = +v
    if (g === '42') t.b = +v
  }
  return ents
}
const key = (e: Ent) => e.type === 'circle'
  ? `C|${e.layer}|${e.x!.toFixed(2)}|${e.y!.toFixed(2)}|${e.r!.toFixed(2)}`
  : `P|${e.layer}|${e.closed}|` + e.pts!.map(p => `${(p.x + 0).toFixed(2)},${(p.y + 0).toFixed(2)},${(p.b + 0).toFixed(4)}`).join(';')

// ── our parts → the same entity keys ──
const lnum = (v: number) => String(+(+v).toFixed(2)).replace('.', 'P')
const r3 = (v: number) => Math.round(v * 1000) / 1000
const poly = (layer: string, pts: [number, number, number][]): Ent =>
  ({ type: 'poly', layer, closed: true, pts: pts.map(([x, y, b]) => ({ x: r3(x), y: r3(y), b: b || 0 })) })
const toLoop = (o: OutlinePt[]): Loop => o.map(p => [p.x, p.y, p.b ?? 0])
const rectCCW = (L: number, H: number): Loop => [[0, 0, 0], [L, 0, 0], [L, H, 0], [0, H, 0]]
const rectCW = (L: number, H: number): Loop => [[0, 0, 0], [0, H, 0], [L, H, 0], [L, 0, 0]]

function ourEntities(p: Partial<CurvedEndParams>): Record<string, string[]> {
  const c = calcCurvedEnd(p), holes = kitHoles(c), out: Record<string, string[]> = {}
  const lb = `VBOREZ${lnum(c.p.T + 0.2)}`
  for (const part of curvedEndParts(c)) {
    const lo = `OUTLINEZ${lnum(part.thickness)}L`
    const ents: Ent[] = [poly('PART', rectCCW(part.sizeX, part.sizeY))]
    ents.push(poly(lo, part.outline ? revLoop(toLoop(part.outline)) : rectCW(part.sizeX, part.sizeY)))
    for (const k of part.pockets ?? []) ents.push(poly(`PKZ${lnum(k.depth)}`, [[k.x0, k.y0, 0], [k.x1, k.y0, 0], [k.x1, k.y1, 0], [k.x0, k.y1, 0]]))
    if (part.cutout) ents.push(poly(`ROUTEZ${lnum(part.cutout.depth)}L`, toLoop(part.cutout.loop)))
    for (const [x, y] of holes[part.name] ?? []) ents.push({ type: 'circle', layer: lb, x, y, r: 2.5 })
    out[partFileName(part.name) + '.dxf'] = ents.map(key).sort()
  }
  return out
}

describe('curved end engine vs kit fixtures', () => {
  for (const k of cases) {
    const exp = expected[k.id]
    it(`${k.id}: derived numbers, warnings and notes`, () => {
      const c = calcCurvedEnd(k.p)
      expect(c.warnings).toEqual(exp.warnings)
      expect(c.notes).toEqual(exp.notes)
      const d = exp.derived
      expect(r2(c.wrapLen)).toBe(d.wrapLen)
      expect(c.pockets.map(a => a.map(r2))).toEqual(d.pockets)
      expect([c.gaps, c.gaps - 1, r2(c.pitch), r2(c.clear)]).toEqual([d.gaps, d.ribs, d.pitch, d.clear])
      expect({ Dc: r2(c.Dc), Hc: r2(c.Hc), y0: r2(c.y0) }).toEqual(d.carcass)
      expect({ w: r2(c.formerW), d: r2(c.formerD), R: r2(c.RI) }).toEqual(d.former)
      expect(c.double ? null : { l: r2(c.fixDepth), h: r2(c.Hc) }).toEqual(d.fixingPanel)
      expect({ w: r2(c.backW), h: r2(c.Hc) }).toEqual(d.back)
      expect(!!c.cut).toBe(d.ribCutOut)
      const holes = kitHoles(c)
      expect(c.blocks.map(b => ({ name: b.name, w: b.wb, holes: holes[b.name]!.length }))).toEqual(d.blocks)
    })

    it(`${k.id}: part list`, () => {
      expect(Object.keys(ourEntities(k.p)).sort()).toEqual([...exp.files].sort())
    })

    const dir = path.join(FIX, 'dxf', k.id)
    const golden = fs.readdirSync(dir).filter(f => f.endsWith('.dxf'))
    if (!golden.length) continue   // the warning case writes no files
    it(`${k.id}: every part matches the golden DXF`, () => {
      const ours = ourEntities(k.p)
      for (const f of golden) {
        const want = parseDxf(fs.readFileSync(path.join(dir, f), 'utf8')).map(key).sort()
        expect(ours[f], f).toEqual(want)
      }
    })
  }
})

describe('curved end skin limits (decision 10)', () => {
  it('warns (does not block) outside 2–3 mm', () => {
    expect(calcCurvedEnd({ SK: 2 }).notes).toEqual([])
    expect(calcCurvedEnd({ SK: 3 }).notes).toEqual([])
    const thin = calcCurvedEnd({ SK: 1.5 }), thick = calcCurvedEnd({ SK: 4 })
    expect(thin.warnings).toEqual([]); expect(thin.notes[0]).toMatch(/too thin/)
    expect(thick.warnings).toEqual([]); expect(thick.notes[0]).toMatch(/too thick/)
    expect(calcCurvedEnd({ SK: 18 }).warnings).toContain('Skin must be thinner than the face board.')
  })
})
