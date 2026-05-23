import { CabinetInput, ResolvedCasePart, ResolvedSeamJoint } from './types'
import { toGenericSeamKey } from '../cabinetSeams'

export function resolveJoints(
  cab: CabinetInput,
  caseParts: ResolvedCasePart[],
): ResolvedSeamJoint[] {
  if (!caseParts.length) return []

  const carcaseJoints  = cab.carcase_joints  ?? {}
  const jointDefaults  = cab.joint_defaults  ?? {}
  const jointTypeOps   = cab.joint_type_ops  ?? {}
  const jointTypeNames = cab.joint_type_names ?? {}

  // Build the set of active seam keys from whichever parts actually resolved
  const byKey: Partial<Record<string, ResolvedCasePart>> = {}
  for (const p of caseParts) byKey[p.part_key] = p

  const topKey = byKey['full_top']   ? 'full_top'
               : byKey['front_rail'] ? 'front_rail'
               : byKey['back_rail']  ? 'back_rail'
               : null

  const seamKeys: string[] = []
  if (byKey['bottom'] && byKey['left_side'])  seamKeys.push('bottom:left_side')
  if (byKey['bottom'] && byKey['right_side']) seamKeys.push('bottom:right_side')
  if (topKey && byKey['left_side'])           seamKeys.push(`${topKey}:left_side`)
  if (topKey && byKey['right_side'])          seamKeys.push(`${topKey}:right_side`)
  if (byKey['back']   && byKey['left_side'])  seamKeys.push('back:left_side')
  if (byKey['back']   && byKey['right_side']) seamKeys.push('back:right_side')
  if (byKey['back']   && byKey['bottom'])     seamKeys.push('back:bottom')

  const result: ResolvedSeamJoint[] = []

  for (const seamKey of seamKeys) {
    const genericKey = toGenericSeamKey(seamKey)

    // Resolve assignment: per-cabinet override wins, then CM default
    let jointTypeId: string | null | undefined
    let source: 'cabinet' | 'method' = 'method'

    if (Object.prototype.hasOwnProperty.call(carcaseJoints, seamKey)) {
      jointTypeId = carcaseJoints[seamKey]   // string = assigned, null = suppressed
      source = 'cabinet'
    } else {
      const inherited = jointDefaults[genericKey] ?? jointDefaults[seamKey] ?? null
      jointTypeId = inherited
    }

    if (!jointTypeId) continue   // null (suppressed) or unassigned

    const ops = jointTypeOps[jointTypeId] ?? []

    const colonIdx = seamKey.indexOf(':')
    const partAKey = seamKey.slice(0, colonIdx)
    const partBKey = seamKey.slice(colonIdx + 1)

    result.push({
      seam_key:        seamKey,
      joint_type_id:   jointTypeId,
      joint_type_name: jointTypeNames[jointTypeId] ?? 'Unknown',
      source,
      part_a_key:      partAKey,
      part_b_key:      partBKey,
      ops,
    })
  }

  return result
}
