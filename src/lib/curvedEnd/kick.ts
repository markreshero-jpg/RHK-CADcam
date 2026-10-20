// ============================================================
// Curved kick (z_curved_end C5, decision 14).
//
// A curved end mounted on a kick sits its carcass TOEH up, and its kick board
// follows the face board round the curve: set back TOESCF from the front and
// the curved side, bent the same way as the face board (a back-face pocket
// across each curve, leaving the same skin SK). Behind it, like a ladder kick:
// a kick back along the wall line (TOESCB off it, lifted TOEFC) and spreaders
// on the flat front — one at the gable end (single ends), one just before
// each curve's pocket, and more between them at no more than TOESP centres.
//
// All in the kit's plan frame (x across from the gable / left, d from the
// front), the same frame as CurvedEndGeometry; resolveCurvedEnd maps it.
// ============================================================

import { POCK_EXT, f1, type CurvedEndGeometry, type Loop } from './geometry'

const TB = Math.tan(Math.PI / 8)   // bulge of a 90° arc
const r2 = (v: number) => Math.round(v * 100) / 100

export interface CurvedKickParams {
  H:  number   // kick height (TOEH)
  FC: number   // kick back / spreaders lifted off the floor (TOEFC)
  s:  number   // setback from the front and the curved side (TOESCF)
  sb: number   // setback off the wall (TOESCB)
  TF: number   // kick face board
  TI: number   // kick back / spreaders
  SP: number   // max spreader centres (TOESP)
}

export interface KickRect { x0: number; x1: number; d0: number; d1: number }

export interface CurvedKick {
  loop:    Loop                 // kick board plan shape (3D / plan), with the pocket notches
  len:     number               // flat blank length (outer face)
  arc:     number               // one curve's length on the outer face
  pockets: [number, number][]   // along the board from its gable (single) / left wall (DOUBLE) end
  back:    KickRect
  spreaders: KickRect[]
  warnings: string[]            // block the CNC
}

/** The curved kick for one curved end, or null with warnings when it can't be built. */
export function calcCurvedKick(c: CurvedEndGeometry, k: CurvedKickParams): (CurvedKick & { ok: true }) | { ok: false; warnings: string[] } {
  const { W, D, R, SK } = c.p, E = POCK_EXT
  const { s, TF, TI } = k
  const Rk = R - s, Dk = D - k.sb, side = Dk - R
  const warnings: string[] = []
  if (Rk - TF < 10) warnings.push(`Radius too small for the kick setback: the kick bends round ${f1(Rk)} mm and needs at least ${f1(TF + 10)}.`)
  if (side < 0) warnings.push(`Too shallow for a curved kick: the curve (${f1(R)}) runs past the kick’s wall line (${f1(Dk)}).`)
  if (SK >= TF) warnings.push(`Skin (${f1(SK)}) must be thinner than the kick board (${f1(TF)}).`)
  const sprLen = Dk - TI - (s + TF)
  if (sprLen <= 0) warnings.push('Too shallow for kick spreaders.')
  if (warnings.length) return { ok: false, warnings }

  const arc = Math.PI / 2 * Rk
  const fi = s + TF, fs = s + SK          // inner face / skin line of the front run
  let loop: Loop, len: number, pockets: [number, number][], back: KickRect, xs: number[]

  if (c.double) {
    const flat = W - 2 * R
    len = 2 * side + 2 * arc + flat
    pockets = [[side - E, side + arc + E], [side + arc + flat - E, side + 2 * arc + flat + E]]
    if (pockets[0][1] >= pockets[1][0]) pockets = [[pockets[0][0], pockets[1][1]]]
    const mid: Loop = flat >= 2 * E
      ? [[W - R, fs, 0], [W - R - E, fs, 0], [W - R - E, fi, 0], [R + E, fi, 0], [R + E, fs, 0], [R, fs, -TB]]
      : flat > 0.01 ? [[W - R, fs, 0], [R, fs, -TB]] : [[R, fs, -TB]]
    loop = [[s, Dk, 0], [s, R, TB], [R, s, 0], [W - R, s, TB], [W - s, R, 0], [W - s, Dk, 0],
      [W - fi, Dk, 0], [W - fi, R + E, 0], [W - fs, R + E, 0], [W - fs, R, -TB], ...mid,
      [fs, R, 0], [fs, R + E, 0], [fi, R + E, 0], [fi, Dk, 0]]
    back = { x0: fi, x1: W - fi, d0: Dk - TI, d1: Dk }
    // flat front between the curves' pockets
    const a = R + E, b = W - R - E - TI
    xs = b - a >= TI ? fill([a, b], k.SP, TI) : flat >= TI ? [W / 2 - TI / 2] : []
  } else {
    const CX = W - R
    len = CX + arc + side
    pockets = [[CX - E, CX + arc + E]]
    loop = [[0, s, 0], [CX, s, TB], [W - s, R, 0], [W - s, Dk, 0],
      [W - fi, Dk, 0], [W - fi, R + E, 0], [W - fs, R + E, 0], [W - fs, R, -TB],
      [CX, fs, 0], [CX - E, fs, 0], [CX - E, fi, 0], [0, fi, 0]]
    back = { x0: 0, x1: W - fi, d0: Dk - TI, d1: Dk }
    const b = CX - E - TI
    xs = b >= TI ? fill([0, b], k.SP, TI) : [0]
  }
  return {
    ok: true, loop, len: r2(len), arc: r2(arc), pockets: pockets.map(([a, b]) => [r2(a), r2(b)]),
    back, spreaders: xs.map(x => ({ x0: r2(x), x1: r2(x + TI), d0: fi, d1: Dk - TI })), warnings,
  }
}

// Spreaders at both ends of [a, b] (their left faces) and between, at no more than `sp` centres.
function fill([a, b]: [number, number], sp: number, t: number): number[] {
  const n = Math.max(1, Math.ceil((b - a) / Math.max(sp, t) - 1e-9))
  return Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n)
}
