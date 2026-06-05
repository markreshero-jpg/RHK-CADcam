// Shared measurement formatting. All user-facing mm readouts (measure tool,
// part properties sidebar, parts list, object tree) round to the nearest 0.1mm.
// A trailing ".0" is trimmed so whole numbers read clean (489, not 489.0) while
// fractional values keep one decimal (489.5).

export function fmtMm(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const rounded = Math.round(value * 10) / 10
  // toFixed(1) then strip a trailing .0
  const s = rounded.toFixed(1)
  return s.endsWith('.0') ? s.slice(0, -2) : s
}

// Same rounding, returned as a number (for cases that append their own unit or
// feed another calculation). NaN-safe → 0.
export function roundMm(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0
  return Math.round(value * 10) / 10
}
