// ============================================================
// Gang-drilling detection for the Anderson EVO49 drill block
// (Drill Block spec, Part D §7). Pure / framework-free / testable.
//
// Detects holes that can be drilled simultaneously by adjacent
// same-diameter spindles on the 32 mm grid and turns them into
// gang groups carrying the M88/M89 bitmask. The block config says
// which spindle (1-based position) holds which diameter — only
// spindles that physically hold the matching bit can fire, so a
// gang is a CONTIGUOUS run of same-diameter spindles, and the
// number of holes per plunge is capped by that run's length.
//
// Bit value of spindle N = 2^(N-1); a gang's B-value = the sum of
// the bit values of the spindles it fires. The X bank (M88) and the
// Y bank (M89) are independent bit spaces. The MASTER spindle is the
// lowest-position spindle of the run; only the master coordinate is
// emitted — slaves fire automatically at their fixed 32 mm offsets.
// ============================================================

export interface DrillBlockConfig {
  bankXCount: number
  bankYCount: number
  spacingMm: number            // 32 (System 32)
  xBankMcode: string           // 'M88'
  yBankMcode: string           // 'M89'
  sharedCorner: boolean
  headOffsetXMm: number        // physical block head offset, X
  headOffsetYMm: number        // physical block head offset, Y (e.g. -128)
  workOffsetCode: string       // 'G54' (drill block work offset)
  // Fitted bit diameter per spindle, indexed by (position − 1). null = empty.
  xDiameters: (number | null)[]
  yDiameters: (number | null)[]
}

export interface GangGroup {
  bank: 'x' | 'y'
  diameter: number
  depth: number
  masterSpindle: number        // lowest spindle position in the run
  slaveSpindles: number[]      // remaining spindle positions, ascending
  bitmask: number              // Σ 2^(pos-1) over master+slaves
  masters: { x: number; y: number }[]   // sheet-local master hole positions
}

export interface GangResult {
  groups: GangGroup[]
  warnings: string[]
}

interface Hole { x: number; y: number; diameter: number; depth: number; used: boolean }
interface DrillHit { x: number; y: number; diameter: number; depth: number }

const TOL = 0.6   // mm — collinearity / grid-spacing slop

const bitFor = (pos: number) => 2 ** (pos - 1)

// Maximal contiguous runs of spindles whose fitted bit matches `diam`.
// Returns the 1-based start position and length of each run.
function spindleRuns(diam: number, dias: (number | null)[]): { start: number; len: number }[] {
  const runs: { start: number; len: number }[] = []
  let start = -1
  for (let i = 0; i < dias.length; i++) {
    const match = dias[i] != null && Math.abs((dias[i] as number) - diam) < TOL
    if (match && start < 0) start = i + 1
    if ((!match || i === dias.length - 1) && start >= 0) {
      const end = match ? i + 1 : i
      runs.push({ start, len: end - start + 1 })
      start = -1
    }
  }
  return runs
}

// The lowest K spindle positions of the longest available same-diameter run
// (length ≥ K). null when no such run exists.
function pickSpindles(diam: number, dias: (number | null)[], k: number): number[] | null {
  const runs = spindleRuns(diam, dias).filter(r => r.len >= k).sort((a, b) => b.len - a.len || a.start - b.start)
  if (!runs.length) return null
  const r = runs[0]
  return Array.from({ length: k }, (_, i) => r.start + i)
}

const maxRun = (diam: number, dias: (number | null)[]) =>
  spindleRuns(diam, dias).reduce((m, r) => Math.max(m, r.len), 0)

// Maximal collinear runs of holes at exact one-spacing centres. A gap larger
// than `spacing` breaks the run (gangs need physically adjacent spindles).
// axis 'x' → holes share Y and step in X; 'y' → share X and step in Y.
function collinearRuns(holes: Hole[], axis: 'x' | 'y', spacing: number): Hole[][] {
  const along = (h: Hole) => axis === 'x' ? h.x : h.y
  const across = (h: Hole) => axis === 'x' ? h.y : h.x
  // bucket by the across-coordinate (same line)
  const lines: Hole[][] = []
  for (const h of holes) {
    const line = lines.find(l => Math.abs(across(l[0]) - across(h)) < TOL)
    if (line) line.push(h); else lines.push([h])
  }
  const runs: Hole[][] = []
  for (const line of lines) {
    const sorted = [...line].sort((a, b) => along(a) - along(b))
    let run: Hole[] = [sorted[0]]
    for (let i = 1; i < sorted.length; i++) {
      const gap = along(sorted[i]) - along(sorted[i - 1])
      if (Math.abs(gap - spacing) < TOL) run.push(sorted[i])
      else { runs.push(run); run = [sorted[i]] }
    }
    runs.push(run)
  }
  return runs
}

// Split a run into the maximal contiguous sub-runs of still-unused holes.
function unusedSubruns(run: Hole[]): Hole[][] {
  const out: Hole[][] = []
  let cur: Hole[] = []
  for (const h of run) {
    if (h.used) { if (cur.length) { out.push(cur); cur = [] } }
    else cur.push(h)
  }
  if (cur.length) out.push(cur)
  return out
}

export function computeGangs(drills: DrillHit[], block: DrillBlockConfig): GangResult {
  const holes: Hole[] = drills.map(d => ({ ...d, used: false }))
  const warnings: string[] = []
  const spacing = block.spacingMm || 32
  // key → group, so parallel rows / step-and-repeat chunks sharing the same
  // bank+bitmask+diameter+depth collapse under one bank selection.
  const groups = new Map<string, GangGroup>()

  const add = (bank: 'x' | 'y', diameter: number, depth: number, spindles: number[], mx: number, my: number) => {
    const master = spindles[0]
    const slaves = spindles.slice(1)
    const bitmask = spindles.reduce((s, p) => s + bitFor(p), 0)
    const key = `${bank}|${bitmask}|${diameter}|${depth}`
    let g = groups.get(key)
    if (!g) { g = { bank, diameter, depth, masterSpindle: master, slaveSpindles: slaves, bitmask, masters: [] }; groups.set(key, g) }
    g.masters.push({ x: mx, y: my })
  }

  // Group holes by diameter (rounded to tolerance).
  const diaKey = (d: number) => Math.round(d / TOL) * TOL
  const byDia = new Map<number, Hole[]>()
  for (const h of holes) { const k = diaKey(h.diameter); (byDia.get(k) ?? byDia.set(k, []).get(k)!).push(h) }

  for (const [, holesD] of byDia) {
    const diam = holesD[0].diameter
    const depthOf = (run: Hole[]) => run[0].depth

    // Candidate gang runs on each bank that actually holds ≥2 same-Ø spindles.
    const candidates: { bank: 'x' | 'y'; run: Hole[] }[] = []
    if (maxRun(diam, block.xDiameters) >= 2) for (const r of collinearRuns(holesD, 'x', spacing)) if (r.length >= 2) candidates.push({ bank: 'x', run: r })
    if (maxRun(diam, block.yDiameters) >= 2) for (const r of collinearRuns(holesD, 'y', spacing)) if (r.length >= 2) candidates.push({ bank: 'y', run: r })
    // Longest runs claim their holes first; overlaps fall to shorter sub-runs.
    candidates.sort((a, b) => b.run.length - a.run.length)

    for (const cand of candidates) {
      const dias = cand.bank === 'x' ? block.xDiameters : block.yDiameters
      const cap = maxRun(diam, dias)
      for (const sub of unusedSubruns(cand.run)) {
        if (sub.length < 2) continue
        sub.forEach(h => { h.used = true })
        // Tile the sub-run into gangs of size ≤ cap (step-and-repeat for the tail).
        for (let i = 0; i < sub.length; i += cap) {
          const chunk = sub.slice(i, i + cap)
          const spindles = pickSpindles(diam, dias, chunk.length)
          if (!spindles) { warnings.push(`No ${chunk.length} consecutive ⌀${diam} spindles on ${cand.bank} bank`); continue }
          add(cand.bank, diam, depthOf(chunk), spindles, chunk[0].x, chunk[0].y)
        }
      }
    }
  }

  // Leftover holes (off-grid, isolated, or too few to gang) → single-spindle hits.
  for (const h of holes) {
    if (h.used) continue
    const bank: 'x' | 'y' = maxRun(h.diameter, block.xDiameters) >= 1 ? 'x'
      : maxRun(h.diameter, block.yDiameters) >= 1 ? 'y' : 'x'
    const dias = bank === 'x' ? block.xDiameters : block.yDiameters
    const spindles = pickSpindles(h.diameter, dias, 1)
    if (!spindles) { warnings.push(`No spindle holds ⌀${h.diameter} — hole at (${h.x.toFixed(1)}, ${h.y.toFixed(1)}) skipped`); continue }
    add(bank, h.diameter, h.depth, spindles, h.x, h.y)
  }

  // Stable emission order: diameter, then bank (X before Y), then bitmask.
  const ordered = [...groups.values()].sort((a, b) =>
    a.diameter - b.diameter || a.bank.localeCompare(b.bank) || a.bitmask - b.bitmask)
  // Within a group, sequence masters bottom-left first (stripe-friendly).
  for (const g of ordered) g.masters.sort((a, b) => a.y - b.y || a.x - b.x)

  return { groups: ordered, warnings: [...new Set(warnings)] }
}
