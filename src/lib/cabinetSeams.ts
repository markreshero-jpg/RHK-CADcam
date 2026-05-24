import type { ResolvedCabinet, ResolvedCasePart } from './resolver/types'

export interface ElevSeam {
  key: string
  label: string
  ex: number      // X in cabinet elevation space (from left edge)
  ey: number      // Y in cabinet elevation space (from bottom)
  isBack: boolean // involves the back panel (not front-visible)
}

// Maps actual part-key seam keys to generic keys used in CM joint_defaults.
// e.g. "front_rail:left_side" → "top:left_side"
export function toGenericSeamKey(key: string): string {
  return key.replace(/^(front_rail|full_top|back_rail):/, 'top:')
}

// ── Part-grouped edge model (CM builder joint UI) ────────────────────────────
// Describes each carcase part by the edges that join another part. The same
// seam key may appear under two parts (e.g. bottom:left_side under both Bottom
// and Left Gable) — assigning it from either side stays in sync automatically.
//
// Top seams are PART-SPECIFIC (full_top:left_side, front_rail:left_side, …) so
// each top variant carries its own joint/drilling and is remembered separately
// when TOP_TYPE changes. Bottom/back seams have no variants, so they use their
// plain keys. resolveJoints prefers the exact key and falls back to the generic
// "top:…" key (via toGenericSeamKey) for methods saved before this split.

export interface SeamPartEdge {
  edgeLabel:  string   // edge of this part, e.g. "Bottom edge"
  seamKey:    string   // generic key as stored in CM joint_defaults
  joinsLabel: string   // the part this edge meets, e.g. "Bottom Panel"
}

export interface SeamPart {
  partKey: string      // matches ResolvedCasePart.part_key (3D highlight key)
  label:   string      // human label, e.g. "Left Gable"
  edges:   SeamPartEdge[]
}

// Returns the carcase parts and their joinable edges for the active top type.
// `topType` is the construction method's TOP_TYPE rule.
export function carcaseSeamParts(topType: string): SeamPart[] {
  const hasTop   = topType !== 'none'
  const topLabel = topType === 'full_top'    ? 'Top Panel'
                 : topType === 'front_rail'  ? 'Front Top Rail'
                 : topType === 'double_rail' ? 'Top Rails'
                 : topType === 'back_rail'   ? 'Back Top Rail'
                 : 'Top'
  // Highlight key for the top part: double_rail highlights the front rail.
  const topPartKey = topType === 'full_top' ? 'full_top'
                   : topType === 'back_rail' ? 'back_rail'
                   : 'front_rail'

  const parts: SeamPart[] = [
    {
      partKey: 'left_side', label: 'Left Gable',
      edges: [
        { edgeLabel: 'Bottom edge', seamKey: 'bottom:left_side', joinsLabel: 'Bottom Panel' },
        ...(hasTop ? [{ edgeLabel: 'Top edge', seamKey: `${topPartKey}:left_side`, joinsLabel: topLabel }] : []),
        { edgeLabel: 'Back edge',   seamKey: 'back:left_side',   joinsLabel: 'Back Panel' },
      ],
    },
    {
      partKey: 'right_side', label: 'Right Gable',
      edges: [
        { edgeLabel: 'Bottom edge', seamKey: 'bottom:right_side', joinsLabel: 'Bottom Panel' },
        ...(hasTop ? [{ edgeLabel: 'Top edge', seamKey: `${topPartKey}:right_side`, joinsLabel: topLabel }] : []),
        { edgeLabel: 'Back edge',   seamKey: 'back:right_side',   joinsLabel: 'Back Panel' },
      ],
    },
    {
      partKey: 'bottom', label: 'Bottom Panel',
      edges: [
        { edgeLabel: 'Left edge',  seamKey: 'bottom:left_side',  joinsLabel: 'Left Gable' },
        { edgeLabel: 'Right edge', seamKey: 'bottom:right_side', joinsLabel: 'Right Gable' },
        { edgeLabel: 'Back edge',  seamKey: 'back:bottom',       joinsLabel: 'Back Panel' },
      ],
    },
    {
      partKey: 'back', label: 'Back Panel',
      edges: [
        { edgeLabel: 'Left edge',   seamKey: 'back:left_side',  joinsLabel: 'Left Gable' },
        { edgeLabel: 'Right edge',  seamKey: 'back:right_side', joinsLabel: 'Right Gable' },
        { edgeLabel: 'Bottom edge', seamKey: 'back:bottom',     joinsLabel: 'Bottom Panel' },
      ],
    },
  ]

  if (hasTop) {
    parts.push({
      partKey: topPartKey, label: topLabel,
      edges: [
        { edgeLabel: 'Left edge',  seamKey: `${topPartKey}:left_side`,  joinsLabel: 'Left Gable' },
        { edgeLabel: 'Right edge', seamKey: `${topPartKey}:right_side`, joinsLabel: 'Right Gable' },
      ],
    })
  }

  return parts
}

export function computeElevSeams(rp: ResolvedCabinet): ElevSeam[] {
  const byKey: Partial<Record<string, ResolvedCasePart>> = {}
  for (const p of rp.case_parts) byKey[p.part_key] = p

  const ls   = byKey['left_side']
  const rs   = byKey['right_side']
  const bot  = byKey['bottom']
  const back = byKey['back']
  const top  = byKey['full_top'] ?? byKey['front_rail'] ?? byKey['back_rail']
  const topKey = byKey['full_top']   ? 'full_top'
               : byKey['front_rail'] ? 'front_rail'
               : byKey['back_rail']  ? 'back_rail'
               : null

  const seams: ElevSeam[] = []

  if (ls && bot)
    seams.push({ key: 'bottom:left_side',  label: 'Bottom → Left Gable',  ex: ls.X + ls.DZ, ey: bot.Y + bot.DZ, isBack: false })
  if (rs && bot)
    seams.push({ key: 'bottom:right_side', label: 'Bottom → Right Gable', ex: rs.X,          ey: bot.Y + bot.DZ, isBack: false })

  if (topKey && ls && top)
    seams.push({ key: `${topKey}:left_side`,  label: 'Top → Left Gable',  ex: ls.X + ls.DZ, ey: top.Y, isBack: false })
  if (topKey && rs && top)
    seams.push({ key: `${topKey}:right_side`, label: 'Top → Right Gable', ex: rs.X,          ey: top.Y, isBack: false })

  if (ls && back)
    seams.push({ key: 'back:left_side',  label: 'Back → Left Gable',  ex: ls.X + ls.DZ, ey: ls.Y + ls.DY * 0.5, isBack: true })
  if (rs && back)
    seams.push({ key: 'back:right_side', label: 'Back → Right Gable', ex: rs.X,          ey: rs.Y + rs.DY * 0.5, isBack: true })
  if (back && bot)
    seams.push({ key: 'back:bottom', label: 'Back → Bottom', ex: bot.X + bot.DY * 0.5, ey: bot.Y + bot.DZ, isBack: true })

  return seams
}
