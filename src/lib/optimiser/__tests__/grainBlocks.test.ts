import { describe, it, expect } from 'vitest'
import { layoutBlock, memberPlacement, buildGrainBlocks, expandGrainBlocks, type GrainBlock } from '../grainBlocks'
import { nest, type NestPartInput, type SheetStock } from '../nest'
import type { OptiCabinet, OptiPart } from '../types'

const G = 12
const front = (uid: string, x: number, y: number, w: number, h: number) => ({ uid, rect: { x, y, w, h }, w, h })
const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a, gap: number) =>
  !(a.x + a.w + gap <= b.x + 1e-6 || b.x + b.w + gap <= a.x + 1e-6 || a.y + a.h + gap <= b.y + 1e-6 || b.y + b.h + gap <= a.y + 1e-6)

describe('grain match block layout', () => {
  it('opens a 3 mm reveal to the cutter gap', () => {
    const b = layoutBlock([front('a', 1000, 150, 448, 700), front('b', 1451, 150, 448, 700)], G)
    expect(b.members.map(m => [m.bx, m.by])).toEqual([[0, 0], [460, 0]])
    expect(b.W).toBe(908); expect(b.H).toBe(700)
  })
  it('keeps two drawer banks in rows and columns', () => {
    const fs = [0, 1].flatMap(c => [0, 1, 2].map(r => front(`c${c}r${r}`, c * 603, 150 + r * 250, 600, 247)))
    const b = layoutBlock(fs, G)
    const at = (u: string) => b.members.find(m => m.uid === u)!
    expect(at('c1r0').bx).toBe(612)
    expect(at('c0r1').by).toBe(259); expect(at('c1r1').by).toBe(259)
    expect(at('c0r2').by).toBe(518)
  })
  it('a wide drawer over two doors: doors pushed apart, wide front stays put, rows gapped', () => {
    const b = layoutBlock([front('d1', 0, 0, 448, 500), front('d2', 451, 0, 448, 500), front('top', 0, 503, 899, 200)], G)
    const at = (u: string) => b.members.find(m => m.uid === u)!
    expect(at('d2').bx).toBe(460)
    expect(at('top').bx).toBe(0)
    expect(at('top').by).toBe(512)
  })
  it('squeezes the band between a base row and an overhead row to the gap', () => {
    const b = layoutBlock([front('base', 0, 150, 600, 720), front('wall', 0, 1500, 600, 700)], G)
    expect(b.members.find(m => m.uid === 'wall')!.by).toBe(732)
    expect(b.H).toBe(1432)
  })
  it('turned blocks keep every front inside the block, none touching (true quarter turn)', () => {
    const b = layoutBlock([front('d1', 0, 0, 448, 500), front('d2', 451, 0, 448, 500), front('top', 0, 503, 899, 200)], G)
    const def = { baseUid: 'x', label: 'x' }
    const pls = b.members.map(m => memberPlacement({ x: 100, y: 50, rotated: true }, b, m, def))
    for (const p of pls) {
      expect(p.x).toBeGreaterThanOrEqual(100 - 1e-6); expect(p.y).toBeGreaterThanOrEqual(50 - 1e-6)
      expect(p.x + p.w).toBeLessThanOrEqual(100 + b.H + 1e-6); expect(p.y + p.h).toBeLessThanOrEqual(50 + b.W + 1e-6)
    }
    for (let i = 0; i < pls.length; i++) for (let j = i + 1; j < pls.length; j++) expect(overlap(pls[i], pls[j], G - 1e-6)).toBe(false)
    // CCW: the top of the wall points to sheet −x → the top front sits at the left.
    expect(pls.find(p => p.uid === 'top')!.x).toBe(100)
  })
})

describe('buildGrainBlocks', () => {
  const stock: SheetStock = { w: 2415, h: 1211, trimTop: 10, trimBottom: 10, trimLeft: 10, trimRight: 10, isOffcut: false, label: null }
  const cab = (id: string, dir: 'vertical' | 'horizontal'): OptiCabinet => ({ id, label: id, room_id: 'r', grain_match: { id: 'g1', name: 'GM1', direction: dir } })
  const run = (n: number, dir: 'vertical' | 'horizontal', fw = 896, fh = 700) => {
    const cabs = new Map<string, OptiCabinet>()
    const parts = new Map<string, OptiPart>()
    const insts: NestPartInput[] = []
    for (let i = 0; i < n; i++) {
      cabs.set(`c${i}`, cab(`c${i}`, dir))
      const p = { uid: `p${i}`, cabinet_instance_id: `c${i}`, cabinet_label: `BC-0${i + 1}`, source_table: 'face_zones',
        wall_rect: { x: i * (fw + 3), y: 150, w: fw, h: fh }, wall_key: 'w|face' } as unknown as OptiPart
      parts.set(p.uid, p)
      insts.push({ uid: `p${i}#0`, baseUid: `p${i}`, label: `F${i}`, w: fw, h: fh, thickness: 18, materialId: 'oak', grainLock: true, grainAcross: dir === 'horizontal', priority: 0 })
    }
    insts.push({ uid: 'shelf#0', baseUid: 'shelf', label: 'Shelf', w: 300, h: 500, thickness: 18, materialId: 'oak', grainLock: true, priority: 0 })
    const index = Object.fromEntries(insts.map(i => [i.uid, i]))
    const gm = buildGrainBlocks({ instances: insts, partByUid: parts, cabById: cabs, groupFrontCount: new Map([['g1', n]]),
      stockFor: () => stock, gapFor: () => G, allowRotation: true })
    const res = expandGrainBlocks(nest(gm.parts, { 'oak__18': { standard: stock, offcuts: [] } }, { marginByMaterial: {}, defaultMargin: G, quality: 'fast', allowRotation: true }), gm.blocks, index, gm.warnings)
    return { gm, res }
  }

  it('a horizontal run nests as one unturned block, fronts side by side on the sheet', () => {
    const { gm, res } = run(2, 'horizontal')
    expect(gm.blocks).toHaveLength(1)
    const pl = res.sheets[0].placements
    const f0 = pl.find(p => p.uid === 'p0#0')!, f1 = pl.find(p => p.uid === 'p1#0')!
    expect(f0.rotated).toBe(false); expect(f1.x - (f0.x + f0.w)).toBeCloseTo(G)
    expect(f1.y).toBeCloseTo(f0.y)
    expect(res.blocks?.[0].memberUids).toEqual(['p0#0', 'p1#0'])
  })
  it('a vertical pair turns as one block with the grain (W-grain sheet)', () => {
    const { res } = run(2, 'vertical', 450, 700)
    const pl = res.sheets[0].placements
    const f0 = pl.find(p => p.uid === 'p0#0')!, f1 = pl.find(p => p.uid === 'p1#0')!
    expect(f0.rotated && f1.rotated).toBe(true)
    // turned CCW: wall-left front lower on the sheet, same x
    expect(f0.x).toBeCloseTo(f1.x); expect(f1.y - (f0.y + f0.h)).toBeCloseTo(G)
  })
  it('splits a run too long for one sheet at cabinet boundaries, with a warning', () => {
    const { gm, res } = run(4, 'horizontal')
    expect(gm.blocks.map(b => b.members.length)).toEqual([2, 2])
    expect(gm.warnings.join(' ')).toMatch(/GM1 split into 2 blocks/)
    expect(res.unplaced).toHaveLength(0)
  })
  it('notes a partly selected group', () => {
    const { gm } = run(2, 'horizontal')
    expect(gm.warnings).toHaveLength(0)
    const g2 = buildGrainBlocks({ instances: [], partByUid: new Map(), cabById: new Map(), groupFrontCount: new Map(), stockFor: () => stock, gapFor: () => G, allowRotation: true })
    expect(g2.blocks).toHaveLength(0)
  })
  it('an unplaced block sends its fronts to unplaced', () => {
    const tiny: SheetStock = { ...stock, w: 600, h: 600 }
    const b: GrainBlock = { uid: 'gm:x:1', groupId: 'g1', name: 'GM1', direction: 'vertical', piece: 1, pieces: 1, W: 900, H: 700, members: [{ uid: 'a#0', bx: 0, by: 0, w: 444, h: 700 }, { uid: 'b#0', bx: 456, by: 0, w: 444, h: 700 }] }
    const index = { 'a#0': { uid: 'a#0' } as NestPartInput, 'b#0': { uid: 'b#0' } as NestPartInput }
    const raw = nest([{ uid: b.uid, baseUid: b.uid, label: 'GM1', w: 900, h: 700, thickness: 18, materialId: 'oak', grainLock: true, priority: 1 }], { 'oak__18': { standard: tiny, offcuts: [] } }, { marginByMaterial: {}, defaultMargin: G, quality: 'fast', allowRotation: false })
    const res = expandGrainBlocks(raw, [b], index)
    expect(res.unplaced.map(u => u.uid)).toEqual(['a#0', 'b#0'])
    expect(res.warnings?.[0]).toMatch(/GM1 didn't fit/)
  })
})

describe('grainMatchTags', () => {
  it('numbers fronts across pieces in piece order', async () => {
    const { grainMatchTags, grainMatchLine } = await import('../grainBlocks')
    const res = { sheets: [], unplaced: [], blocks: [
      { uid: 'b2', groupId: 'g', name: 'GM1', direction: 'horizontal' as const, piece: 2, pieces: 2, memberUids: ['c', 'd'], W: 1, H: 1 },
      { uid: 'b1', groupId: 'g', name: 'GM1', direction: 'horizontal' as const, piece: 1, pieces: 2, memberUids: ['a', 'b'], W: 1, H: 1 },
    ] }
    const t = grainMatchTags(res)
    expect(grainMatchLine(t.get('a')!)).toBe('GM1 · 1 of 4')
    expect(grainMatchLine(t.get('d')!)).toBe('GM1 · 4 of 4')
  })
})
