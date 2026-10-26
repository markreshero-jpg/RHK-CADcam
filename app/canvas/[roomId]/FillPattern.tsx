// ── Fill pattern defs for layer fill items (wall_fill) ───────────────────────
// Spec: z_display_layers/DISPLAY-LAYERS-SPEC.md — "Wall layers".
// Solid needs no <pattern>; hatch = 45° lines, cross = both diagonals.

import type { FillPattern } from '@/src/lib/displayLayers/registry'

/** `<pattern>` for a hatch / cross-hatch fill (nothing for solid). `step` = line
 *  spacing in user units; `bg` fills the gaps (unset = see-through). */
export function FillPatternDef({ id, pattern, step, color, width, bg }: {
  id: string; pattern: FillPattern; step: number; color: string; width: number; bg?: string
}) {
  if (pattern === 'solid') return null
  const h = step / 2
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width={step} height={step} patternTransform="rotate(45)">
      {bg && <rect width={step} height={step} fill={bg} />}
      <line x1={h} y1={0} x2={h} y2={step} stroke={color} strokeWidth={width} />
      {pattern === 'cross' && <line x1={0} y1={h} x2={step} y2={h} stroke={color} strokeWidth={width} />}
    </pattern>
  )
}

/** The `fill` value: the solid colour, or a reference to FillPatternDef `id`. */
export function fillPaint(pattern: FillPattern, id: string, solid: string): string {
  return pattern === 'solid' ? solid : `url(#${id})`
}
