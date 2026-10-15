// ============================================================
// Finger-pull backing rails (z_handles H6, spec §7 / D11; per column H5b / D15)
// A strip of door-matching board behind every finger gap, so the gap shows
// door colour and the cabinet isn't open to the air. Each rail:
//   • sits in a notch cut out of each panel it passes through or ends in (the
//     full panel thickness), its front face flush with the sides' front edge
//   • is RAILH tall (45): RAILUP (5) up behind the front on the plain side of
//     the gap, the gap itself (FPGAP 20, or the front's own, D14), and the rest
//     (20) behind the sharknose front, clear of its bevel — a bigger gap makes
//     a taller rail
//   • at the carcass top (base) / bottom (wall) gap it is clamped to the carcass
//   • takes the board of the front it backs (door colour → board), thickness
//     from that front
// Per column (D15): a rail runs between the sides / internal divisions either
// side of its front. Rails at the same height in neighbouring columns join and
// run through the division (notching it). Where they differ, each stops at the
// division: at a double divider on the joint line (each panel carries its own
// rail); at a single divider with nothing on the far side, through it like a
// side. Different gaps against a single divider, or side by side with no
// division at all, are warned.
// Rails are case parts keyed `fprail:<n>` (face-kind panels like the shaped
// `back:` keys: DX = height, DY = width, DZ = thickness). The notches are cut
// into the panels' outlines so every view shows them; seamDrillSync routes
// them and drills the knock-in block holes.
// Off with rule FPRAIL = false (job / room / cabinet rule_overrides).
// Box-front cabinets only: shaped (footprint) cabinets use resolveShapedFingerRails.
// ============================================================

import type {
  CabinetInput, ConstructionRules, ResolvedCasePart, ResolvedFaceZone, ResolvedInternalPart, ResolverError,
} from './types'
import { DEFAULT_RULES } from './types'

export interface FingerRail {
  key:       `fprail:${number}`
  bottom:    number   // cabinet Y
  top:       number
  x0:        number   // cabinet X: left end (0 = the left side's outer face)
  x1:        number   // right end
  frontZ:    number
  thickness: number
  material_id: string
}

const EPS = 0.01
const SAME = 0.5   // rails within this of each other count as the same height

// An internal division: one divider panel, or two back to back (double).
interface Division { x0: number; x1: number; joint: number; double: boolean; y0: number; y1: number }

function divisionsOf(dividers: ResolvedInternalPart[]): Division[] {
  const out: Division[] = []
  for (const d of [...dividers].sort((a, b) => a.X - b.X)) {
    const prev = out[out.length - 1]
    if (prev && !prev.double && Math.abs(d.X - prev.x1) < EPS) {
      prev.double = true
      prev.joint = prev.x1
      prev.x1 = d.X + d.DZ
      prev.y0 = Math.min(prev.y0, d.Y); prev.y1 = Math.max(prev.y1, d.Y + d.DY)
      continue
    }
    out.push({ x0: d.X, x1: d.X + d.DZ, joint: d.X + d.DZ / 2, double: false, y0: d.Y, y1: d.Y + d.DY })
  }
  return out
}

export function fingerRails(
  cab: CabinetInput, r: ConstructionRules, zones: ResolvedFaceZone[], caseParts: ResolvedCasePart[],
  dividers: ResolvedInternalPart[] = [],
): { rails: FingerRail[]; warnings: ResolverError[] } {
  const warnings: ResolverError[] = []
  if (cab.footprint || r.FPRAIL === false) return { rails: [], warnings }
  const left = caseParts.find(p => p.part_key === 'left_side')
  const right = caseParts.find(p => p.part_key === 'right_side')
  if (!left || !right) return { rails: [], warnings }

  const frontZ = Math.min(left.Z + left.DX, right.Z + right.DX)
  const carcTop = Math.max(left.Y + left.DY, right.Y + right.DY)
  const carcBot = Math.min(left.Y, right.Y)
  // Behind the bevelled front: fixed (20), whatever the gap. RAILH is the rail's
  // height at the standard gap (DEFAULT_RULES.FPGAP), so a wider gap — the
  // FPGAP rule or a front's own (D14) — makes a taller rail.
  const down = Math.max(r.RAILH - DEFAULT_RULES.FPGAP - r.RAILUP, 0)
  const divs = divisionsOf(dividers)
  const warn = (code: string, message: string) => {
    if (!warnings.some(w => w.message === message)) warnings.push({ code, message, part: 'fprail' })
  }

  // 1. One rail per front, spanning its column: from the division (or side)
  //    left of the front's centre to the one right of it. A division counts
  //    when it reaches into the rail's height.
  const found: FingerRail[] = []
  for (const z of zones) {
    const h = z.handle
    if (!h?.finger_gap || z.facet || z.AY) continue
    const gap = h.finger_gap_mm ?? r.FPGAP
    let bottom: number, top: number
    if (h.grip_edge === 'top') {
      const gapLo = z.Y + z.DY, gapHi = gapLo + gap
      bottom = gapLo - down
      top = Math.min(gapHi + r.RAILUP, carcTop)
    } else {
      const gapHi = z.Y, gapLo = gapHi - gap
      top = gapHi + down
      bottom = Math.max(gapLo - r.RAILUP, carcBot)
    }
    if (top - bottom <= EPS) continue
    const cx = z.X + z.DX / 2
    let x0 = 0, x1 = cab.DX
    for (const d of divs) {
      if (Math.min(top, d.y1) - Math.max(bottom, d.y0) <= EPS) continue
      if (d.joint <= cx && d.joint > x0) x0 = d.joint
      if (d.joint >= cx && d.joint < x1) x1 = d.joint
    }
    found.push({ key: 'fprail:0', bottom, top, x0, x1, frontZ, thickness: z.DZ, material_id: z.material_id })
  }

  // 2. Within a column, fronts on one seam share a rail; different gaps with
  //    no division between them merge into one tall enough for both.
  const merged: FingerRail[] = []
  for (const rl of found.sort((a, b) => a.x0 - b.x0 || a.bottom - b.bottom)) {
    const prev = merged.find(m => Math.abs(m.x0 - rl.x0) < EPS && Math.abs(m.x1 - rl.x1) < EPS
      && rl.bottom < m.top - EPS && rl.top > m.bottom + EPS)
    if (!prev) { merged.push({ ...rl }); continue }
    if (Math.abs(prev.bottom - rl.bottom) > SAME || Math.abs(prev.top - rl.top) > SAME)
      warn('FPRAIL_NO_DIVISION', 'Fronts side by side have different finger gaps with no division between them — their backing rails are merged; add a divider between them')
    prev.bottom = Math.min(prev.bottom, rl.bottom); prev.top = Math.max(prev.top, rl.top)
  }

  // 3. Rails at the same height either side of a division join through it.
  let joined = true
  while (joined) {
    joined = false
    for (const a of merged) {
      const b = merged.find(m => m !== a && Math.abs(m.x0 - a.x1) < EPS
        && Math.abs(m.bottom - a.bottom) < SAME && Math.abs(m.top - a.top) < SAME)
      if (!b) continue
      a.x1 = b.x1; a.top = Math.max(a.top, b.top); a.bottom = Math.min(a.bottom, b.bottom)
      merged.splice(merged.indexOf(b), 1)
      joined = true
      break
    }
  }

  // 4. Ends at a single divider: through it when nothing is on the far side;
  //    against a different rail, both stop on its centre line (warned).
  for (const rl of merged) {
    for (const end of ['x0', 'x1'] as const) {
      const d = divs.find(v => !v.double && Math.abs(v.joint - rl[end]) < EPS)
      if (!d) continue
      const across = merged.some(m => m !== rl && Math.abs((end === 'x1' ? m.x0 : m.x1) - rl[end]) < EPS
        && Math.min(m.top, rl.top) - Math.max(m.bottom, rl.bottom) > EPS)
      if (across) warn('FPRAIL_SINGLE_DIVIDER', 'Fronts either side of a single divider have different finger gaps — make it a double divider so each panel carries its own backing rail')
      else rl[end] = end === 'x1' ? d.x1 : d.x0
    }
  }

  const rails = merged
    .sort((a, b) => a.bottom - b.bottom || a.x0 - b.x0)
    .map((rail, i) => ({ ...rail, key: `fprail:${i}` as const }))
  return { rails, warnings }
}

/** Rail case parts (face-kind: DX = height, DY = width, DZ = thickness). */
export function fingerRailParts(_cab: CabinetInput, r: ConstructionRules, rails: FingerRail[]): ResolvedCasePart[] {
  return rails.map(rl => ({
    grain_direction: r.RAILGRAIN ?? 'horizontal',
    fprail: { cut: r.RAILCUT, blockSetback: r.RAILBLK, blockDia: r.RAILBLKD, blockDepth: r.RAILBLKZ },
    part_key: rl.key,
    DX: rl.top - rl.bottom, DY: rl.x1 - rl.x0, DZ: rl.thickness,
    X: rl.x0, Y: rl.bottom, Z: rl.frontZ - rl.thickness,
    AX: 0, AY: 0, AZ: 0,
    material_id: rl.material_id,
    edge_band: { top: false, bottom: false, left: false, right: false },
  }) as ResolvedCasePart)
}

/** A rail at the carcass top sits where a base cabinet's horizontal front rail
 *  was: push the front rail back by the backing rail's thickness (user, 2026-10-14). */
export function pushFrontRailBack(caseParts: ResolvedCasePart[], rails: FingerRail[]): void {
  const front = caseParts.find(p => p.part_key === 'front_rail')
  if (!front) return
  const frontTop = front.Y + (front.upright ? front.DX : front.DZ)   // on edge: RD tall
  const topRail = rails.find(rl => rl.top >= frontTop - EPS && rl.bottom < frontTop)
  if (topRail) front.Z -= topRail.thickness
}

/** A vertical panel a rail can pass through: a carcass side or an internal
 *  divider — both DX = depth, DY = height, DZ = thickness along X. */
type RailPanel = Pick<ResolvedCasePart, 'X' | 'Y' | 'DX' | 'DY' | 'DZ'> & { outline?: { x: number; y: number }[] }

/** Does this rail pass through (or end inside) the panel's thickness? */
export function railInPanel(rl: { x0: number; x1: number }, p: RailPanel): boolean {
  return Math.min(rl.x1, p.X + p.DZ) - Math.max(rl.x0, p.X) > EPS
}

/** One panel notch in the panel's shape frame (y down from the panel's top). */
export interface SideNotch {
  y1: number; y2: number          // top / bottom of the notch
  t: number                       // depth = rail thickness
  cut: number                     // relief: extra depth at a closed end (cutter radius)
  openTop: boolean; openBottom: boolean   // runs out through the panel's top / bottom edge
}

/** The rail notches for one panel (only the rails that reach it). A notch is
 *  the rail thickness deep for its full height. At each CLOSED end the round
 *  cutter would leave a radiused corner at the rail's back edge, so a relief
 *  goes `cut` deeper over one cutter width (2 × cut) there; an end that runs
 *  out through the panel's top / bottom edge has no corner and gets no relief
 *  (user, 2026-10-14). */
export function sideNotches(side: RailPanel, rails: FingerRail[], cut: number): SideNotch[] {
  const D = side.DX, H = side.DY, topY = side.Y + side.DY
  return rails
    .filter(rl => railInPanel(rl, side))
    .map(rl => {
      const y1 = Math.max(topY - rl.top, 0), y2 = Math.min(topY - rl.bottom, H)
      return { y1, y2, t: Math.min(rl.thickness, D), cut, openTop: y1 <= EPS, openBottom: y2 >= H - EPS }
    })
    .filter(n => n.y2 - n.y1 > EPS)
    .sort((a, b) => a.y1 - b.y1)
}

/** Notch each panel's front edge for the rails that reach it: the outline in
 *  the panel's shape frame (x = depth from the back, y down from the top),
 *  with the closed-end reliefs drawn square. Sides and dividers share it. */
export function notchPanels(panels: RailPanel[], rails: FingerRail[], cut = 0): void {
  if (!rails.length) return
  for (const side of panels) {
    const D = side.DX, H = side.DY
    const notches = sideNotches(side, rails, cut)
    if (!notches.length) continue
    // Walk down the front edge; a notch that reaches the top / bottom of the
    // panel opens onto that edge instead of leaving a zero-width spike.
    const pts: { x: number; y: number }[] = [{ x: 0, y: 0 }]
    if (!notches[0].openTop) pts.push({ x: D, y: 0 })
    for (const n of notches) {
      const back = D - n.t, relief = Math.min(back, D) - n.cut
      const rh = Math.min(2 * n.cut, (n.y2 - n.y1) / 2)
      const reliefTop = n.cut > 0 && !n.openTop, reliefBot = n.cut > 0 && !n.openBottom
      if (!n.openTop) pts.push({ x: D, y: n.y1 })
      if (reliefTop) pts.push({ x: relief, y: n.y1 }, { x: relief, y: n.y1 + rh }, { x: back, y: n.y1 + rh })
      else pts.push({ x: back, y: n.y1 })
      if (reliefBot) pts.push({ x: back, y: n.y2 - rh }, { x: relief, y: n.y2 - rh }, { x: relief, y: n.y2 })
      else pts.push({ x: back, y: n.y2 })
      if (!n.openBottom) pts.push({ x: D, y: n.y2 })
    }
    if (!notches[notches.length - 1].openBottom) pts.push({ x: D, y: H })
    pts.push({ x: 0, y: H })
    side.outline = pts
  }
}
