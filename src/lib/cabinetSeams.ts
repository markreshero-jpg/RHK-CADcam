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
