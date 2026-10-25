// ── Generic wood grain lines (z_material_colours MC9 / MC11) ──────────────────
// One tile of grain lines in real mm, shared by the 3D texture (woodGrain.ts)
// and the printed / on-screen elevations (GrainSVG), so both show the same
// grain. x runs across the grain [0, GRAIN_TILE.across), y along it
// [0, GRAIN_TILE.along]. Lines wander with integer cycles per tile so each
// meets itself top to bottom; a line near a side edge is repeated by the
// consumer (x ± across) so the tile repeats seamlessly. Seeded random → the
// same grain every load.

// Real-world size of one tile: across the grain × along the grain (mm).
export const GRAIN_TILE = { across: 300, along: 1200 }

export interface GrainLine {
  pts:   [number, number][]   // mm
  width: number               // mm
  shade: number               // 0 = black … 1 = white
  alpha: number
}

// Small seeded PRNG (mulberry32).
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let lines: GrainLine[] | null = null

export function grainLines(): GrainLine[] {
  if (lines) return lines
  const rand = rng(20261025)
  const TAU = Math.PI * 2
  const STEP = GRAIN_TILE.along / 256
  const out: GrainLine[] = []
  // Lines roughly every 6–16 mm across the board, some drawn as close pairs.
  let x = 0
  for (;;) {
    x += 6 + rand() * 10
    if (x >= GRAIN_TILE.across) break
    const a1 = 0.6 + rand() * 1.6, f1 = 1 + Math.floor(rand() * 2), p1 = rand() * TAU
    const a2 = 0.2 + rand() * 0.6, f2 = 3 + Math.floor(rand() * 4), p2 = rand() * TAU
    const shade = (70 + rand() * 60) / 255
    const width = (0.9 + rand() * 0.9) * (GRAIN_TILE.across / 512)
    const pair = rand() < 0.3 ? 1.2 + rand() * 1.5 : 0
    for (const off of pair ? [0, pair] : [0]) {
      const pts: [number, number][] = []
      for (let y = 0; y <= GRAIN_TILE.along + 1e-6; y += STEP) {
        const t = y / GRAIN_TILE.along
        pts.push([x + off + a1 * Math.sin(TAU * f1 * t + p1) + a2 * Math.sin(TAU * f2 * t + p2), y])
      }
      out.push({ pts, width: off ? width * 0.7 : width, shade, alpha: 0.55 + rand() * 0.35 })
    }
  }
  lines = out
  return out
}

let tileD: string | null = null

// Every line of one tile, with its wrapped copies, as a single SVG path `d`
// in mm (tile origin at 0,0).
export function grainTilePath(): string {
  if (tileD) return tileD
  const r = (v: number) => Math.round(v * 10) / 10
  const parts: string[] = []
  for (const l of grainLines()) {
    for (const wrap of [-GRAIN_TILE.across, 0, GRAIN_TILE.across]) {
      const xs = l.pts.map(p => p[0] + wrap)
      if (Math.max(...xs) < 0 || Math.min(...xs) > GRAIN_TILE.across) continue
      parts.push('M' + l.pts.map(p => `${r(p[0] + wrap)} ${r(p[1])}`).join('L'))
    }
  }
  tileD = parts.join('')
  return tileD
}
