// ============================================================
// Phase 2 toolpath simulator — G-code parser (spec §7.3).
// Turns a stored nest_sheets.gcode program into a timed sequence
// of 2-D moves with metadata. PURE REPLAY: it interprets the
// already-posted record, it does NOT re-calculate toolpaths.
//
// Pure & framework-free so the simulator (and tests) can share it.
// Coordinates are machine/sheet space (origin bottom-left, mm),
// matching the post-processor in gcode.ts and SheetSVG's flip.
// ============================================================

export type MoveKind = 'rapid' | 'cut' | 'plunge' | 'drill'
export type Phase = 'setup' | 'drill' | 'route'

export interface SimMove {
  kind: MoveKind
  x0: number; y0: number; z0: number   // start (mm)
  x1: number; y1: number; z1: number   // end (mm)
  feed: number                          // mm/min actually used for this move
  tool: number | null                   // active T number
  phase: Phase
  context: string                       // nearest comment label (part name / "Drilling …")
  lineIndex: number                     // index into `lines`
  t0: number; t1: number                // cumulative program time (ms)
}

export interface ParsedProgram {
  lines: string[]
  moves: SimMove[]
  totalTime: number                     // ms
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
  pauses: number[]                      // line indices of M00 program stops
  tools: number[]                       // distinct T numbers referenced, in order
}

export interface ParseOpts {
  rapidFeed?: number   // synthetic G0 feed for pacing (mm/min)
  baseFeed?: number    // fallback when no F is modal yet
}

const EPS = 1e-6

// Parse a single G-code program into a replayable timeline.
export function parseGcode(text: string, opts?: ParseOpts): ParsedProgram {
  const RAPID = opts?.rapidFeed ?? 25000
  const BASE = opts?.baseFeed ?? 6000
  const lines = text.split(/\r?\n/)

  let x = 0, y = 0, z = 0, feed = BASE
  let motion = 0                  // 0 = G0 (rapid), 1 = G1 (feed); G2/G3 collapse to linear
  let tool: number | null = null
  let phase: Phase = 'setup'
  let context = ''
  let t = 0

  const moves: SimMove[] = []
  const pauses: number[] = []
  const tools: number[] = []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]

    // ── Comments drive phase + context labels ───────────────────────────────
    const cm = raw.match(/\(([^)]*)\)/)
    if (cm) {
      const txt = cm[1].trim()
      if (/drill/i.test(txt)) { phase = 'drill'; context = txt }
      else if (/routing bit/i.test(txt)) phase = 'route'
      else if (/^Part\b/i.test(txt)) { phase = 'route'; context = txt.replace(/^Part\s+/i, '') }
      else if (txt) context = txt
    }

    // Strip comments, then tokenise the executable part.
    const code = raw.replace(/\([^)]*\)/g, ' ').trim()
    if (!code) continue

    let nx = x, ny = y, nz = z, nf = feed
    let hasCoord = false
    let sawTool = false
    const words = code.matchAll(/([A-Za-z])\s*(-?\d*\.?\d+)/g)
    for (const w of words) {
      const L = w[1].toUpperCase()
      const v = parseFloat(w[2])
      switch (L) {
        case 'G':
          if (v === 0) motion = 0
          else if (v === 1 || v === 2 || v === 3) motion = 1   // G2/G3 → linear approx
          break
        case 'X': nx = v; hasCoord = true; break
        case 'Y': ny = v; hasCoord = true; break
        case 'Z': nz = v; hasCoord = true; break
        case 'F': nf = v; break
        case 'T': tool = v; sawTool = true; break
        case 'M': if (v === 0) pauses.push(i); break
      }
    }
    feed = nf
    if (sawTool && tool != null && !tools.includes(tool)) tools.push(tool)
    if (!hasCoord) continue

    // ── Classify the motion ─────────────────────────────────────────────────
    const dxy = Math.hypot(nx - x, ny - y)
    let kind: MoveKind
    if (motion === 0) kind = 'rapid'
    else if (dxy < EPS && nz < z - EPS) kind = phase === 'drill' ? 'drill' : 'plunge'
    else kind = 'cut'

    const len = dxy > EPS ? dxy : Math.abs(nz - z)
    const f = kind === 'rapid' ? RAPID : (feed > 0 ? feed : BASE)
    const dur = len > 0 ? (len / f) * 60000 : 0
    const t0 = t, t1 = t + dur

    moves.push({ kind, x0: x, y0: y, z0: z, x1: nx, y1: ny, z1: nz, feed: f, tool, phase, context, lineIndex: i, t0, t1 })
    t = t1

    if (Number.isFinite(nx)) { minX = Math.min(minX, x, nx); maxX = Math.max(maxX, x, nx) }
    if (Number.isFinite(ny)) { minY = Math.min(minY, y, ny); maxY = Math.max(maxY, y, ny) }
    x = nx; y = ny; z = nz
  }

  if (!Number.isFinite(minX)) { minX = 0; maxX = 0; minY = 0; maxY = 0 }
  return { lines, moves, totalTime: t, bounds: { minX, minY, maxX, maxY }, pauses, tools }
}

// ── Frame derivation ──────────────────────────────────────────────────────────
export interface SimFrame {
  pos: { x: number; y: number; z: number }
  index: number                // count of fully-completed moves
  current: SimMove | null      // move in progress (null when finished)
  tool: number | null
  phase: Phase
  context: string
  lineIndex: number
  cutting: boolean             // tool currently engaged in material
}

// Linear position lookup for a given program time (ms). Cheap enough to call
// every animation frame.
export function frameAtTime(prog: ParsedProgram, time: number): SimFrame {
  const { moves } = prog
  if (moves.length === 0) {
    return { pos: { x: 0, y: 0, z: 0 }, index: 0, current: null, tool: null, phase: 'setup', context: '', lineIndex: 0, cutting: false }
  }
  // First move whose end is still ahead of `time`.
  const idx = moves.findIndex(m => m.t1 > time)
  if (idx < 0) {
    const last = moves[moves.length - 1]
    return { pos: { x: last.x1, y: last.y1, z: last.z1 }, index: moves.length, current: null, tool: last.tool, phase: last.phase, context: last.context, lineIndex: last.lineIndex, cutting: false }
  }
  const cur = moves[idx]
  const span = cur.t1 - cur.t0
  const frac = span > EPS ? Math.min(1, Math.max(0, (time - cur.t0) / span)) : 1
  const cutting = (cur.kind === 'cut' || cur.kind === 'plunge' || cur.kind === 'drill') && cur.z1 < 0 + EPS
  return {
    pos: { x: cur.x0 + (cur.x1 - cur.x0) * frac, y: cur.y0 + (cur.y1 - cur.y0) * frac, z: cur.z0 + (cur.z1 - cur.z0) * frac },
    index: idx, current: cur, tool: cur.tool, phase: cur.phase, context: cur.context, lineIndex: cur.lineIndex, cutting,
  }
}

export const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
