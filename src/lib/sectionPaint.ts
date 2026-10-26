// Section paint (z_section_view D8): a cut part or hardware mesh painted the way
// the elevation draws it — palette colour by part key, layer colour override,
// line-drawing mode, layer style + weight. Shared by the cross section and the
// elevation's return cabinet sections.

import type { LayerView } from './displayLayers/resolve'
import type { SectionRole, SectionSolid } from './crossSectionRoom'

/** The elevation's fallback colour per role when the palette has no entry. */
export const SECTION_FALLBACK: Record<SectionRole, string> = {
  case: '#b8c8dc', kick: '#f59e0b', spreader: '#f59e0b', face: '#60a5fa', int: '#818cf8',
  db: '#34d399', custom: '#a78bfa', bench: '#134e4a',
}

/** A cut solid's SVG paint. `base` = the unweighted stroke width. */
export function sectionPaint(layers: LayerView, partColors: Record<string, string>, s: SectionSolid, selected: boolean, base = 1) {
  const ld = layers.lineDrawing
  const c = s.role === 'bench' ? layers.color('benchtops', SECTION_FALLBACK.bench)
    : s.role === 'custom' ? layers.color(s.item, SECTION_FALLBACK.custom)
    : layers.colorOf(s.item) ?? (s.key ? partColors[s.key] : undefined) ?? SECTION_FALLBACK[s.role]
  const line = s.role === 'bench' ? layers.color('benchtops', '#14b8a6') : s.role === 'custom' && !ld ? layers.color(s.item, '#7c3aed') : c
  const fo = s.role === 'bench' ? 0.85 : s.role === 'custom' ? 0.4 : 0.6
  const p = layers.props(s.item, 1)
  return {
    fill: ld ? 'none' : c, fillOpacity: ld ? 0 : fo * p.fillOpacity,
    stroke: selected ? '#e2e8f0' : line, strokeWidth: layers.w(s.item, selected ? base * 1.75 : base),
    strokeDasharray: p.strokeDasharray ? '6 3' : undefined, opacity: p.opacity,
  }
}

/** A hardware / fixture mesh's paint, coloured like the elevation draws it. */
export function sectionMeshPaint(layers: LayerView, partColors: Record<string, string>,
  m: { item: string; fixtureId?: string }, selected: boolean, base = 1) {
  const ld = layers.lineDrawing
  const c = m.item === 'hinges' ? layers.color('hinges', ld ? '#475569' : '#a855f7')
    : m.item === 'handles' ? layers.color('handles', ld ? '#334155' : '#94a3b8')
    : m.item === 'bins' ? layers.color('bins', '#6b7280')
    : m.item === 'drawer_runners' || m.item === 'inner_drawer_runners' ? layers.color(m.item, partColors.db_slide ?? '#94a3b8')
    : layers.color(m.item, m.item === 'fixture_openings' ? '#94a3b8' : '#0ea5e9')
  const p = layers.props(m.item, 1)
  return {
    color: c, stroke: selected ? '#e2e8f0' : c, fillOpacity: ld ? 0 : (m.fixtureId ? 0.25 : 0.7) * p.fillOpacity,
    strokeWidth: layers.w(m.item, base), strokeDasharray: p.strokeDasharray ? '6 3' : undefined, opacity: p.opacity,
  }
}
