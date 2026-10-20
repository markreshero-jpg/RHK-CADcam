// ============================================================
// Curved end — the kit's fixing-hole rules (kit SPEC.md §5).
//
// The ORACLE only: production holes come from the joints library on
// generator-declared seams (CURVED-END-SPEC "Holes via the joints
// library", C3). C3's seeded default joints must reproduce these
// positions to 0.01 mm. Part-local frame as curvedEndParts.
// ============================================================

import { spread, INSET, BACK_INSET, MAX_PITCH, type CurvedEndGeometry, type CurvedEndPartName } from './geometry'

const r2 = (v: number) => Math.round(v * 100) / 100

/** Ø5 through-hole centres per part, part-local [x, y]. */
export function kitHoles(c: CurvedEndGeometry): Partial<Record<CurvedEndPartName, [number, number][]>> {
  const { T, FT } = c.p
  const out: Partial<Record<CurvedEndPartName, [number, number][]>> = {}
  const pt = (x: number, y: number): [number, number] => [r2(x), r2(y)]

  if (!c.double) {
    // fixing panel → every former's edge, and → the back's edge
    const toFormerX = spread(c.Dc - T - FT, INSET, MAX_PITCH)
    const h: [number, number][] = []
    for (const y of c.holeY) for (const x of toFormerX) h.push(pt(x, y))
    for (const y of spread(c.Hc, INSET, MAX_PITCH)) h.push(pt(c.Dc - T / 2 - FT, y))
    out.FixingPanel = h
  }
  // back → every former's back edge
  const backX = spread(c.backW, BACK_INSET, MAX_PITCH)
  out.Back = c.holeY.flatMap(y => backX.map(x => pt(x, y)))

  // blocks: end holes back into every former's notch edge (2 × 25 in on a ≥ 80 block, else 1 centred),
  // face holes up the centre out into the face board, dropping any within 20 of an end hole
  const faceY = spread(c.Hc, INSET, MAX_PITCH)
  for (const k of c.blocks) {
    const ex = k.wb >= 80 ? [25, k.wb - 25] : [k.wb / 2]
    const ends = c.holeY.flatMap(y => ex.map(x => [x, y] as [number, number]))
    const faces = faceY.map(y => [k.wb / 2, y] as [number, number])
      .filter(([x, y]) => !ends.some(([a, b]) => Math.hypot(a - x, b - y) < 20))
    out[k.name] = [...faces, ...ends].map(([x, y]) => pt(x, y))
  }
  return out
}
