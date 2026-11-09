// ============================================================
// Pocket / area clearing toolpaths — PURE geometry, no G-code.
//
// Each function returns an ordered list of XY points (sheet coords,
// tool-centre) for ONE depth level. The caller (gcode.ts emitRoutes)
// walks the points emitting G1 moves, repeats per depth pass, and
// owns the entry (helical) + Z. Points are for the tool CENTRE inside
// an already-inset rectangle (x0,y0)–(x1,y1), so no cutter comp here.
//
// Strategies (Phase B §3c options): raster (zig-zag at an angle),
// spiral_out (centre → wall) and spiral_in (wall → centre), plus a
// plain boundary outline. Testable in isolation.
// ============================================================

export type Pt2 = { x: number; y: number }

// Liang–Barsky: clip the infinite line P + t·d to the axis-aligned rect and
// return the contained segment's two endpoints, or null if it misses entirely.
function clipLineToRect(
  px: number, py: number, dx: number, dy: number,
  xmin: number, ymin: number, xmax: number, ymax: number,
): [Pt2, Pt2] | null {
  let t0 = -Infinity, t1 = Infinity
  const p = [-dx, dx, -dy, dy]
  const q = [px - xmin, xmax - px, py - ymin, ymax - py]
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-12) { if (q[i] < 0) return null; continue }   // parallel & outside
    const r = q[i] / p[i]
    if (p[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r }
    else { if (r < t0) return null; if (r < t1) t1 = r }
  }
  if (t1 < t0) return null
  return [{ x: px + t0 * dx, y: py + t0 * dy }, { x: px + t1 * dx, y: py + t1 * dy }]
}

// Boundary rectangle (closed), tool-centre on the inset walls.
export function outlinePath(x0: number, y0: number, x1: number, y1: number): Pt2[] {
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }]
}

// Raster (zig-zag) lanes at angleDeg, spaced by stepover mm.
// angleDeg 0 / null = AUTO: lanes run along the pocket's long side (fewest lanes,
// fewest direction changes - quickest). Without this a long narrow LED groove
// running along sheet Y was cleared in hundreds of tiny side-to-side passes.
// Any other angle (90, 45 ...) is used exactly as given, in sheet coords
// (buildSheetRoutes has already turned a set angle with the part).
// Lanes serpentine; the step-across between lanes is left as an implicit G1 by the
// caller (it runs along the pocket wall, inside the cleared area).
export function rasterAutoAngle(x0: number, y0: number, x1: number, y1: number): number {
  return Math.abs(y1 - y0) > Math.abs(x1 - x0) + 1e-6 ? 90 : 0
}

export function rasterPath(x0: number, y0: number, x1: number, y1: number, stepover: number, angleDeg: number | null | undefined): Pt2[] {
  const step = Math.max(0.5, stepover)
  const ang = angleDeg ? angleDeg : rasterAutoAngle(x0, y0, x1, y1)
  const th = (ang * Math.PI) / 180
  // Snap trig so 90/180/270 lanes are exactly axis-aligned (cos 90 = 6e-17 made
  // the wall lanes fail the clip and vanish).
  const snap = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-9 ? Math.sign(v) : v)
  const dx = snap(Math.cos(th)), dy = snap(Math.sin(th))   // lane direction
  const nx = -dy, ny = dx                       // sweep normal
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  const corners: Pt2[] = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
  let tmin = Infinity, tmax = -Infinity
  for (const c of corners) { const t = (c.x - cx) * nx + (c.y - cy) * ny; tmin = Math.min(tmin, t); tmax = Math.max(tmax, t) }
  // Spread lanes evenly wall to wall (never wider than stepover) so the last lane
  // sits on the far wall - stepping by a fixed stepover could stop short of it.
  const range = tmax - tmin
  const n = Math.max(1, Math.ceil(range / step - 1e-6))
  const out: Pt2[] = []
  let flip = false
  for (let i = 0; i <= n; i++) {
    const t = range < 1e-6 ? tmin : tmin + (range * i) / n
    if (range < 1e-6 && i > 0) break
    const seg = clipLineToRect(cx + t * nx, cy + t * ny, dx, dy, x0 - 1e-6, y0 - 1e-6, x1 + 1e-6, y1 + 1e-6)
    if (!seg) continue
    const [a, b] = flip ? [seg[1], seg[0]] : seg
    out.push(a, b)
    flip = !flip
  }
  return out
}

// Concentric offset rectangles stepping in by stepover. dir 'in' = wall→centre,
// 'out' = centre→wall. Loops that collapse in one axis degenerate to a centre line.
export function spiralPath(x0: number, y0: number, x1: number, y1: number, stepover: number, dir: 'in' | 'out'): Pt2[] {
  const step = Math.max(0.5, stepover)
  const loops: Pt2[][] = []
  for (let k = 0; ; k++) {
    const ax = x0 + k * step, ay = y0 + k * step, bx = x1 - k * step, by = y1 - k * step
    if (ax > bx + 1e-6 || ay > by + 1e-6) break
    if (bx - ax < 1e-6) { loops.push([{ x: (ax + bx) / 2, y: ay }, { x: (ax + bx) / 2, y: by }]); break }
    if (by - ay < 1e-6) { loops.push([{ x: ax, y: (ay + by) / 2 }, { x: bx, y: (ay + by) / 2 }]); break }
    loops.push([{ x: ax, y: ay }, { x: bx, y: ay }, { x: bx, y: by }, { x: ax, y: by }, { x: ax, y: ay }])
  }
  return (dir === 'out' ? loops.reverse() : loops).flat()
}

// Dispatch by fill strategy. Unknown / null → raster (the safe default).
export function clearPath(
  strategy: string | null | undefined,
  x0: number, y0: number, x1: number, y1: number, stepover: number, angleDeg: number | null | undefined,
): Pt2[] {
  if (strategy === 'spiral_out') return spiralPath(x0, y0, x1, y1, stepover, 'out')
  if (strategy === 'spiral_in') return spiralPath(x0, y0, x1, y1, stepover, 'in')
  return rasterPath(x0, y0, x1, y1, stepover, angleDeg)
}
