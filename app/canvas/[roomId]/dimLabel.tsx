// Shared dimension-segment label. Drawn in the label's own reading frame — callers
// wrap it in their rotate() for angled / vertical dims. When the text fits between
// the ticks it sits centred on the line over a backing chip; when the segment is too
// short it drops below the line (local +y) so the line and ticks stay visible. A run
// of short segments alternates below / above so neighbouring labels don't collide.

export type DimSide = 0 | 1 | -1  // 0 = on the line, 1 = below, -1 = above

const CHAR_W = 0.6  // approx glyph width as a fraction of font size (digits, Arial-ish)

export function dimLabelWidth(label: string | number, fs: number): number {
  return String(label).length * fs * CHAR_W + fs * 0.6
}

export function dimLabelFits(label: string | number, span: number, fs: number): boolean {
  return Math.abs(span) >= dimLabelWidth(label, fs) + fs * 0.3
}

// Placement per segment, in chain order.
export function dimLabelSides(items: { label: string | number; span: number }[], fs: number): DimSide[] {
  const out: DimSide[] = []
  for (let i = 0; i < items.length; i++) {
    if (dimLabelFits(items[i].label, items[i].span, fs)) { out.push(0); continue }
    const prev = out[i - 1]
    out.push(prev === 1 ? -1 : 1)
  }
  return out
}

export function DimLabel({
  x, y, label, fs, col, bg, side = 0, fontFamily, padY = 0.6,
}: {
  x: number
  y: number
  label: string | number
  fs: number
  col: string
  bg?: string        // backing-chip colour; omitted = no chip
  side?: DimSide
  fontFamily?: string
  padY?: number      // chip half-height as a fraction of fs
}) {
  const w = dimLabelWidth(label, fs)
  const ph = fs * padY
  // Off-line: clear the tick (≈0.6 fs) plus half the chip.
  const cy = y + side * (fs * 0.6 + ph + fs * 0.15)
  return (
    <g>
      {bg && <rect x={x - w / 2} y={cy - ph} width={w} height={ph * 2} fill={bg} />}
      <text x={x} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={fs} fill={col}
        fontFamily={fontFamily}>{label}</text>
    </g>
  )
}
