// ============================================================
// Finger-pull backing rails (z_handles H6, spec §7 / D11)
// A strip of door-matching board behind every finger gap, so the gap shows
// door colour and the cabinet isn't open to the air. Each rail:
//   • runs the full carcass width, sitting in a notch cut out of each side
//     (the full side thickness), its front face flush with the sides' front edge
//   • is RAILH tall (45): RAILUP (5) up behind the front on the plain side of
//     the gap, the FPGAP gap itself (20), and the rest (20) behind the
//     sharknose front, clear of its bevel
//   • at the carcass top (base) / bottom (wall) gap it is clamped to the carcass
//   • takes the board of the front it backs (door colour → board), thickness
//     from that front
// Rails are case parts keyed `fprail:<n>` (face-kind panels like the shaped
// `back:` keys: DX = height, DY = width, DZ = thickness). The notches are cut
// into the sides' outlines so every view shows them; CNC notch routing and
// knock-in block holes are H6b.
// Off with rule FPRAIL = false (job / room / cabinet rule_overrides).
// Box-front cabinets only: shaped (footprint) cabinets get no rails yet.
// ============================================================

import type { CabinetInput, ConstructionRules, ResolvedCasePart, ResolvedFaceZone } from './types'

export interface FingerRail {
  key:       `fprail:${number}`
  bottom:    number   // cabinet Y
  top:       number
  frontZ:    number
  thickness: number
  material_id: string
}

const EPS = 0.01

export function fingerRails(
  cab: CabinetInput, r: ConstructionRules, zones: ResolvedFaceZone[], caseParts: ResolvedCasePart[],
): FingerRail[] {
  if (cab.footprint || r.FPRAIL === false) return []
  const left = caseParts.find(p => p.part_key === 'left_side')
  const right = caseParts.find(p => p.part_key === 'right_side')
  if (!left || !right) return []

  const frontZ = Math.min(left.Z + left.DX, right.Z + right.DX)
  const carcTop = Math.max(left.Y + left.DY, right.Y + right.DY)
  const carcBot = Math.min(left.Y, right.Y)
  const down = Math.max(r.RAILH - r.FPGAP - r.RAILUP, 0)   // behind the bevelled front

  // One rail per gap: the front's own gap (D14), with RAILUP and `down` fixed,
  // so a bigger gap makes a taller rail. Fronts side by side on one seam share
  // a rail; where their gaps differ the rails overlap and merge into one, tall
  // enough for both (until H5b splits rails at dividers, D15).
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
    found.push({ key: 'fprail:0', bottom, top, frontZ, thickness: z.DZ, material_id: z.material_id })
  }
  const merged: FingerRail[] = []
  for (const rl of found.sort((a, b) => a.bottom - b.bottom)) {
    const prev = merged[merged.length - 1]
    if (prev && rl.bottom < prev.top - EPS) { prev.top = Math.max(prev.top, rl.top); continue }
    merged.push({ ...rl })
  }
  return merged.map((rail, i) => ({ ...rail, key: `fprail:${i}` as const }))
}

/** Rail case parts (face-kind: DX = height, DY = width, DZ = thickness). */
export function fingerRailParts(cab: CabinetInput, r: ConstructionRules, rails: FingerRail[]): ResolvedCasePart[] {
  return rails.map(rl => ({
    grain_direction: r.RAILGRAIN ?? 'horizontal',
    fprail: { cut: r.RAILCUT, blockSetback: r.RAILBLK, blockDia: r.RAILBLKD, blockDepth: r.RAILBLKZ },
    part_key: rl.key,
    DX: rl.top - rl.bottom, DY: cab.DX, DZ: rl.thickness,
    X: 0, Y: rl.bottom, Z: rl.frontZ - rl.thickness,
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
  const frontTop = front.Y + front.DZ
  const topRail = rails.find(rl => rl.top >= frontTop - EPS && rl.bottom < frontTop)
  if (topRail) front.Z -= topRail.thickness
}

/** One side notch in the side's shape frame (y down from the side's top). */
export interface SideNotch {
  y1: number; y2: number          // top / bottom of the notch
  t: number                       // depth = rail thickness
  cut: number                     // relief: extra depth at a closed end (cutter radius)
  openTop: boolean; openBottom: boolean   // runs out through the side's top / bottom edge
}

/** The rail notches for one side. A notch is the rail thickness deep for its
 *  full height. At each CLOSED end the round cutter would leave a radiused
 *  corner at the rail's back edge, so a relief goes `cut` deeper over one
 *  cutter width (2 × cut) there; an end that runs out through the side's top /
 *  bottom edge has no corner and gets no relief (user, 2026-10-14). */
export function sideNotches(side: ResolvedCasePart, rails: FingerRail[], cut: number): SideNotch[] {
  const D = side.DX, H = side.DY, topY = side.Y + side.DY
  return rails
    .map(rl => {
      const y1 = Math.max(topY - rl.top, 0), y2 = Math.min(topY - rl.bottom, H)
      return { y1, y2, t: Math.min(rl.thickness, D), cut, openTop: y1 <= EPS, openBottom: y2 >= H - EPS }
    })
    .filter(n => n.y2 - n.y1 > EPS)
    .sort((a, b) => a.y1 - b.y1)
}

/** Notch each side's front edge for the rails: the side's outline in the side
 *  shape frame (x = depth from the back, y down from the side's top), with the
 *  closed-end reliefs drawn square. */
export function notchSides(caseParts: ResolvedCasePart[], rails: FingerRail[], cut = 0): void {
  if (!rails.length) return
  for (const side of caseParts) {
    if (side.part_key !== 'left_side' && side.part_key !== 'right_side') continue
    const D = side.DX, H = side.DY
    const notches = sideNotches(side, rails, cut)
    if (!notches.length) continue
    // Walk down the front edge; a notch that reaches the top / bottom of the
    // side opens onto that edge instead of leaving a zero-width spike.
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
