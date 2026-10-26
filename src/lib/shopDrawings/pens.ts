// Shop drawings pen table (z_shop_drawings S2). Widths are PAPER mm, the same
// on every sheet at every scale; drawings multiply by their paper→model factor
// (P = scale). Every line prints solid black: weight and dash carry the
// hierarchy, not grey ink (thin grey lines are what make a PDF look soft).
// Layer-set weight multipliers still apply on top (layers.w(id, base)).
// Thinned about one step 2026-10-26 (Mark: prints looked heavy) — was 0.7 / 0.5 / 0.35 / 0.25 / 0.18 / 0.13.

export const PRINT_INK = '#000'

export const PEN = {
  /** Floor / ground line in elevations. */
  ground: 0.5,
  /** Walls (cut), island lines. */
  heavy:  0.35,
  /** Carcase outlines, openings. */
  medium: 0.25,
  /** Door / drawer fronts, kick faces. */
  front:  0.18,
  /** Dimensions, internals (shelves, drawer boxes, runners), swings, handles, chevrons. */
  thin:   0.13,
  /** Wall hatch and other fill-like linework. Also the floor for every pen. */
  fine:   0.09,
} as const

export type PenName = keyof typeof PEN

/** Smallest width a line may print at, paper mm — below this viewers draw hairlines. */
export const MIN_PEN = PEN.fine

/** A pen's width in model units for a drawing at 1:P. */
export function pen(name: PenName, P: number): number {
  return PEN[name] * P
}

/** Clamp a (layer-weighted) model-unit width so it never prints thinner than MIN_PEN. */
export function atLeastMin(width: number, P: number): number {
  return Math.max(width, MIN_PEN * P)
}
