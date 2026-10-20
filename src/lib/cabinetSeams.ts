import type { ResolvedCabinet, ResolvedCasePart, SeamJointAssign } from './resolver/types'
import { seamAssignJoint, seamAssignRows } from './resolver/types'

export interface ElevSeam {
  key: string
  label: string
  ex: number      // X in cabinet elevation space (from left edge)
  ey: number      // Y in cabinet elevation space (from bottom)
  isBack: boolean // involves the back panel (not front-visible)
}

// Maps actual part-key seam keys to generic keys used in CM joint_defaults.
// e.g. "front_rail:left_side" → "top:left_side". Internal seam instance keys
// (int_adj_shelf_0:left, int_divider_2:bottom, …) fold to one generic key per
// family — both sides of a shelf always drill the same joint.
export function toGenericSeamKey(key: string): string {
  if (/^int_adj_shelf_\d+:/.test(key))   return 'adj_shelf:side'
  if (/^int_fixed_shelf_\d+:/.test(key)) return 'fixed_shelf:side'
  // Shelf pins on an L corner's backs fall back to the side joint when the
  // method sets no back joint of its own.
  const back = key.match(/^(adj_shelf|fixed_shelf):back$/)
  if (back) return `${back[1]}:side`
  const div = key.match(/^int_divider_\d+:(top|bottom)$/)
  if (div) return `divider:${div[1]}`
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

// Internal parts with joinable edges (CM builder joint UI). Internal seams are
// per-instance at resolve time (int_adj_shelf_0:left, …) but the CM default is
// ONE joint per family edge — every shelf/division instance inherits it.
// partKey doubles as the 3D highlight key (matches ResolvedInternalPart.part_type).
export function internalSeamParts(): SeamPart[] {
  return [
    {
      partKey: 'adj_shelf', label: 'Adjustable Shelf',
      edges: [
        { edgeLabel: 'Side supports', seamKey: 'adj_shelf:side', joinsLabel: 'Gables / Divisions' },
        { edgeLabel: 'Back supports', seamKey: 'adj_shelf:back', joinsLabel: 'Backs (L corner)' },
      ],
    },
    {
      partKey: 'fixed_shelf', label: 'Fixed Shelf',
      edges: [
        { edgeLabel: 'Side supports', seamKey: 'fixed_shelf:side', joinsLabel: 'Gables / Divisions' },
      ],
    },
    {
      partKey: 'divider', label: 'Division',
      edges: [
        { edgeLabel: 'Bottom end', seamKey: 'divider:bottom', joinsLabel: 'Bottom / Fixed Shelf' },
        { edgeLabel: 'Top end',    seamKey: 'divider:top',    joinsLabel: 'Top / Fixed Shelf' },
      ],
    },
  ]
}

// Curved fixed-panel cabinets (z_curved_end C3): their generator declares
// these seams; one CM default per family (every former / block inherits it).
export function curvedEndSeamParts(): SeamPart[] {
  return [
    {
      partKey: 'crv:fix', label: 'Curved end fixing panel',
      edges: [
        { edgeLabel: 'Into the formers', seamKey: 'crv_fix:former', joinsLabel: 'Top / bottom / ribs' },
        { edgeLabel: 'Into the back',    seamKey: 'crv_fix:back',   joinsLabel: 'Back' },
      ],
    },
    {
      partKey: 'crv:back', label: 'Curved end back',
      edges: [
        { edgeLabel: 'Into the formers', seamKey: 'crv_back:former', joinsLabel: 'Top / bottom / ribs' },
      ],
    },
    {
      partKey: 'crv:blk', label: 'Curved end fixing blocks',
      edges: [
        { edgeLabel: 'Out into the face board', seamKey: 'crv_block:face',   joinsLabel: 'Face board' },
        { edgeLabel: 'Into the former notches', seamKey: 'crv_block:former', joinsLabel: 'Top / bottom / ribs' },
      ],
    },
  ]
}

// ── Per-cabinet seam assignment state (shared by JointsPanel / PartEdgeJoints) ─

export interface SeamAssignState {
  status:  'cabinet' | 'method' | 'suppressed' | 'none'
  jointId: string | null
  rows?:   number     // per-seam rows override (adj-shelf seams)
}

// Resolve one seam's display state from the cabinet's overrides + CM defaults.
export function getSeamAssignState(
  overrides: Record<string, SeamJointAssign>,
  defaults:  Record<string, string>,
  seamKey:   string,
  // Shaped-cabinet seams (part_a|part_b) inherit the legacy seam they play.
  genericKey?: string,
): SeamAssignState {
  const entry = Object.prototype.hasOwnProperty.call(overrides, seamKey) ? overrides[seamKey] : undefined
  const rows  = seamAssignRows(entry)
  const j     = seamAssignJoint(entry)
  if (j === null)   return { status: 'suppressed', jointId: null }
  if (j !== undefined) return { status: 'cabinet', jointId: j, rows }
  const inherited = defaults[seamKey]
    ?? (genericKey ? defaults[genericKey] ?? defaults[toGenericSeamKey(genericKey)] : undefined)
    ?? defaults[toGenericSeamKey(seamKey)] ?? null
  return inherited
    ? { status: 'method', jointId: inherited, rows }
    : { status: 'none',   jointId: null,      rows }
}

// Set / suppress / clear a seam's joint, preserving any rows-only override
// ('clear' reverts the whole entry; suppress drops rows too).
export function withSeamJoint(
  overrides: Record<string, SeamJointAssign>, seamKey: string, value: string | null | 'clear',
): Record<string, SeamJointAssign> {
  const next = { ...overrides }
  const rows = seamAssignRows(next[seamKey])
  if (value === 'clear') delete next[seamKey]
  else if (value === null) next[seamKey] = null
  else next[seamKey] = rows ? { joint: value, rows } : value
  return next
}

// Set / clear a seam's rows override, preserving any joint assignment and
// collapsing back to the compact string form when rows are cleared.
export function withSeamRows(
  overrides: Record<string, SeamJointAssign>, seamKey: string, rows: number | undefined,
): Record<string, SeamJointAssign> {
  const next  = { ...overrides }
  const joint = seamAssignJoint(next[seamKey])
  if (!rows || rows <= 0) {
    if (typeof joint === 'string') next[seamKey] = joint
    else if (joint === null)       next[seamKey] = null
    else                           delete next[seamKey]
  } else {
    next[seamKey] = joint !== undefined ? { joint, rows } : { rows }
  }
  return next
}

// Human label for any part key appearing in an internal seam — case supports
// (left_side, bottom, …) and internal instance keys (int_adj_shelf_0, …).
export function internalSeamPartLabel(key: string): string {
  const fixed: Record<string, string> = {
    left_side: 'Left Gable', right_side: 'Right Gable',
    bottom: 'Bottom Panel', full_top: 'Top Panel',
    front_rail: 'Front Rail', back_rail: 'Back Rail', back: 'Back Panel',
  }
  if (fixed[key]) return fixed[key]
  const m = key.match(/^int_(adj_shelf|fixed_shelf|divider)_(\d+)$/)
  if (!m) return key
  const n = Number(m[2]) + 1
  return m[1] === 'adj_shelf' ? `Adj Shelf ${n}` : m[1] === 'fixed_shelf' ? `Fixed Shelf ${n}` : `Division ${n}`
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
