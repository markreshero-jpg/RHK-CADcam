import { CabinetInput, DeclaredSeam, ResolvedCasePart, ResolvedInternalPart, ResolvedSeamJoint, seamAssignJoint, seamAssignRows } from './types'
import { toGenericSeamKey, topSeamPartKeys, topSeamSibling } from '../cabinetSeams'
import { enumerateShapedSeams, partsTouch } from './shapedSeams'

// ── Internal seams (shelves & dividers ↔ their supports) ─────────────────────
// Enumerated geometrically from the resolved parts: a shelf's supports are
// whatever vertical panels (gables or dividers) its side edges sit against; a
// divider's anchors are whatever horizontal panels (bottom / top / fixed
// shelves) its ends meet. Pure — shared by the resolver and the canvasDB
// seam reconstruction so both paths agree on the same seam instances.

const FACE_TOL = 0.5   // co-planar tolerance (mm)
const MAX_GAP  = 30    // max clearance between a part edge and its support face (mm)

export interface InternalSeamCandidate {
  seam_key:    string                                // e.g. "int_adj_shelf_0:left"
  part_a_key:  string                                // e.g. "int_adj_shelf_0"
  part_b_key:  string                                // actual support: left_side | int_divider_1 | bottom | …
  edge:        'left' | 'right' | 'top' | 'bottom'
  generic_key: string                                // CM default key, e.g. "adj_shelf:side"
  // Full-bank mode only: vertical extent of the compartment (see ResolvedSeamJoint.bank)
  bank?:       { y0: number; y1: number }
}

export function enumerateInternalSeams(
  caseParts: ResolvedCasePart[],
  internalParts: ResolvedInternalPart[],
  opts?: { adjFullBank?: boolean },
): InternalSeamCandidate[] {
  const out: InternalSeamCandidate[] = []
  const intKey = (p: ResolvedInternalPart) => `int_${p.part_type}_${p.sort_order}`

  // Vertical supports: gables (thickness = DZ along X) + dividers (same shape).
  const vSupports: { key: string; leftFace: number; rightFace: number; y0: number; y1: number }[] = []
  for (const p of caseParts) {
    if (p.part_key === 'left_side' || p.part_key === 'right_side')
      vSupports.push({ key: p.part_key, leftFace: p.X, rightFace: p.X + p.DZ, y0: p.Y, y1: p.Y + p.DY })
  }
  for (const p of internalParts) {
    if (p.part_type === 'divider')
      vSupports.push({ key: intKey(p), leftFace: p.X, rightFace: p.X + p.DZ, y0: p.Y, y1: p.Y + p.DY })
  }

  // Horizontal anchors for divider ends: full panels only (no rails).
  const hAnchors: { key: string; bottomFace: number; topFace: number; x0: number; x1: number }[] = []
  for (const p of caseParts) {
    if (p.part_key === 'bottom' || p.part_key === 'full_top')
      hAnchors.push({ key: p.part_key, bottomFace: p.Y, topFace: p.Y + p.DZ, x0: p.X, x1: p.X + p.DY })
  }
  for (const p of internalParts) {
    if (p.part_type === 'fixed_shelf')
      hAnchors.push({ key: intKey(p), bottomFace: p.Y, topFace: p.Y + p.DZ, x0: p.X, x1: p.X + p.DY })
  }

  // Full-bank mode: adj shelves sharing the same support pair (= same
  // compartment) collapse to ONE bank seam per side, anchored to the lowest-
  // sorted shelf, spanning the compartment's vertical extent.
  const bankGroups = new Map<string, {
    left: typeof vSupports[number] | null
    right: typeof vSupports[number] | null
    shelves: ResolvedInternalPart[]
  }>()

  for (const p of internalParts) {
    if (p.part_type === 'adj_shelf' || p.part_type === 'fixed_shelf') {
      const key  = intKey(p)
      const x0   = p.X, x1 = p.X + p.DY
      const midY = p.Y + p.DZ / 2
      const generic = `${p.part_type}:side`

      let left:  typeof vSupports[number] | null = null
      let right: typeof vSupports[number] | null = null
      for (const s of vSupports) {
        if (midY < s.y0 - FACE_TOL || midY > s.y1 + FACE_TOL) continue
        if (s.rightFace <= x0 + FACE_TOL && x0 - s.rightFace <= MAX_GAP && (!left || s.rightFace > left.rightFace)) left = s
        if (s.leftFace >= x1 - FACE_TOL && s.leftFace - x1 <= MAX_GAP && (!right || s.leftFace < right.leftFace))   right = s
      }
      if (opts?.adjFullBank && p.part_type === 'adj_shelf') {
        const gk = `${left?.key ?? ''}|${right?.key ?? ''}`
        const g = bankGroups.get(gk) ?? { left, right, shelves: [] }
        g.shelves.push(p)
        bankGroups.set(gk, g)
      } else {
        if (left)  out.push({ seam_key: `${key}:left`,  part_a_key: key, part_b_key: left.key,  edge: 'left',  generic_key: generic })
        if (right) out.push({ seam_key: `${key}:right`, part_a_key: key, part_b_key: right.key, edge: 'right', generic_key: generic })
      }
    }

    if (p.part_type === 'divider') {
      const key  = intKey(p)
      const y0   = p.Y, y1 = p.Y + p.DY
      const midX = p.X + p.DZ / 2

      let below: typeof hAnchors[number] | null = null
      let above: typeof hAnchors[number] | null = null
      for (const a of hAnchors) {
        if (a.key === key) continue
        if (midX < a.x0 - FACE_TOL || midX > a.x1 + FACE_TOL) continue
        if (a.topFace <= y0 + FACE_TOL && y0 - a.topFace <= MAX_GAP && (!below || a.topFace > below.topFace))          below = a
        if (a.bottomFace >= y1 - FACE_TOL && a.bottomFace - y1 <= MAX_GAP && (!above || a.bottomFace < above.bottomFace)) above = a
      }
      if (below) out.push({ seam_key: `${key}:bottom`, part_a_key: key, part_b_key: below.key, edge: 'bottom', generic_key: 'divider:bottom' })
      if (above) out.push({ seam_key: `${key}:top`,    part_a_key: key, part_b_key: above.key, edge: 'top',    generic_key: 'divider:top' })
    }
  }

  // Emit the bank seams: compartment extent = between the horizontal anchors
  // bounding the group's shelves (falling back to the supports' own span).
  for (const g of bankGroups.values()) {
    if ((!g.left && !g.right) || g.shelves.length === 0) continue
    const anchor = g.shelves.reduce((a, b) => (a.sort_order <= b.sort_order ? a : b))
    const key  = intKey(anchor)
    const midX = anchor.X + anchor.DY / 2
    const minBottom = Math.min(...g.shelves.map(s => s.Y))
    const maxTop    = Math.max(...g.shelves.map(s => s.Y + s.DZ))
    let below: number | null = null
    let above: number | null = null
    for (const a of hAnchors) {
      if (midX < a.x0 - FACE_TOL || midX > a.x1 + FACE_TOL) continue
      if (a.topFace <= minBottom + FACE_TOL && (below === null || a.topFace > below))    below = a.topFace
      if (a.bottomFace >= maxTop - FACE_TOL && (above === null || a.bottomFace < above)) above = a.bottomFace
    }
    const bank = {
      y0: below ?? Math.max(g.left?.y0 ?? -Infinity, g.right?.y0 ?? -Infinity),
      y1: above ?? Math.min(g.left?.y1 ?? Infinity,  g.right?.y1 ?? Infinity),
    }
    if (!Number.isFinite(bank.y0) || !Number.isFinite(bank.y1) || bank.y1 <= bank.y0) continue
    if (g.left)  out.push({ seam_key: `${key}:left`,  part_a_key: key, part_b_key: g.left.key,  edge: 'left',  generic_key: 'adj_shelf:side', bank })
    if (g.right) out.push({ seam_key: `${key}:right`, part_a_key: key, part_b_key: g.right.key, edge: 'right', generic_key: 'adj_shelf:side', bank })
  }

  return out
}

export function resolveJoints(
  cab: CabinetInput,
  caseParts: ResolvedCasePart[],
  internalParts: ResolvedInternalPart[] = [],
  // Generator-declared seams (z_curved_end C3) — same assignment cascade.
  declared: DeclaredSeam[] = [],
): ResolvedSeamJoint[] {
  if (!caseParts.length) return []

  const carcaseJoints  = cab.carcase_joints  ?? {}
  const jointDefaults  = cab.joint_defaults  ?? {}
  const jointTypeOps   = cab.joint_type_ops  ?? {}
  const jointTypeNames = cab.joint_type_names ?? {}

  // Build the set of active seam keys from whichever parts actually resolved
  const byKey: Partial<Record<string, ResolvedCasePart>> = {}
  for (const p of caseParts) byKey[p.part_key] = p

  const has = (k: string) => !!byKey[k]

  const seamKeys: string[] = []
  if (byKey['bottom'] && byKey['left_side'])  seamKeys.push('bottom:left_side')
  if (byKey['bottom'] && byKey['right_side']) seamKeys.push('bottom:right_side')
  for (const topKey of topSeamPartKeys(has)) {
    if (byKey['left_side'])  seamKeys.push(`${topKey}:left_side`)
    if (byKey['right_side']) seamKeys.push(`${topKey}:right_side`)
  }
  if (byKey['back']   && byKey['left_side'])  seamKeys.push('back:left_side')
  if (byKey['back']   && byKey['right_side']) seamKeys.push('back:right_side')
  if (byKey['back']   && byKey['bottom'])     seamKeys.push('back:bottom')

  const result: ResolvedSeamJoint[] = []

  for (const seamKey of seamKeys) {
    // A shaped cabinet's box parts may not meet (a clipped corner leaves the
    // back short of a gable): only drill a gable seam where they touch.
    if (cab.footprint && /:(left|right)_side$/.test(seamKey)) {
      const [a, b] = seamKey.split(':')
      if (!partsTouch(caseParts, a, b)) continue
    }
    const genericKey = toGenericSeamKey(seamKey)
    const sibling    = topSeamSibling(seamKey, has)
    const cabAssign  = (k: string | null) => k && Object.prototype.hasOwnProperty.call(carcaseJoints, k)
      ? seamAssignJoint(carcaseJoints[k])   // string = assigned, null = suppressed, undefined = rows-only entry
      : undefined

    // Resolve assignment: per-cabinet override wins, then CM default
    let jointTypeId: string | null | undefined
    let source: 'cabinet' | 'method' = 'method'

    const own      = cabAssign(seamKey)
    const assigned = own !== undefined ? own : cabAssign(sibling)
    if (assigned !== undefined) {
      jointTypeId = assigned
      source = 'cabinet'
    } else {
      // Prefer the exact part-specific key (e.g. full_top:left_side); fall back
      // to the generic top:… key for methods saved before the rail/top split.
      const inherited = jointDefaults[seamKey] ?? (sibling ? jointDefaults[sibling] : undefined) ?? jointDefaults[genericKey] ?? null
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
      bottom_back_join: seamKey === 'back:bottom' ? cab.rules?.BOTTOM_BACK_JOIN : undefined,
    })
  }

  // Shaped cabinets (z_cabinet_shape L3): seams on per-edge / turned panels and
  // shelves on them. Same cascade; the CM default comes from the legacy seam
  // the joint plays the part of (bottom:left_side, back:bottom, adj_shelf:side…).
  const adjFullBank = cab.rules?.ADJ_DRILL === 'full_bank'
  for (const cand of enumerateShapedSeams(caseParts, internalParts, { adjFullBank })) {
    const entry = Object.prototype.hasOwnProperty.call(carcaseJoints, cand.seam_key) ? carcaseJoints[cand.seam_key] : undefined
    const assigned = seamAssignJoint(entry)
    const jointTypeId = assigned !== undefined
      ? assigned
      : jointDefaults[cand.seam_key] ?? jointDefaults[cand.generic_key] ?? jointDefaults[toGenericSeamKey(cand.generic_key)] ?? null
    if (!jointTypeId) continue
    let rows = seamAssignRows(entry)
    if (rows === undefined && (cand.generic_key === 'adj_shelf:side' || cand.generic_key === 'adj_shelf:back')) {
      const r = cab.rules?.ADJ_ROWS
      if (r && r > 0) rows = r
    }
    result.push({
      seam_key:        cand.seam_key,
      joint_type_id:   jointTypeId,
      joint_type_name: jointTypeNames[jointTypeId] ?? 'Unknown',
      source:          assigned !== undefined ? 'cabinet' : 'method',
      part_a_key:      cand.part_a_key,
      part_b_key:      cand.part_b_key,
      ops:             jointTypeOps[jointTypeId] ?? [],
      shaped:          cand.shaped,
      ...(cand.shaped.kind === 'back_bottom' ? { bottom_back_join: cab.rules?.BOTTOM_BACK_JOIN } : {}),
      ...(cand.internal_edge ? { internal_edge: cand.internal_edge } : {}),
      ...(cand.bank ? { bank: cand.bank } : {}),
      ...(rows !== undefined ? { rows_override: rows } : {}),
    })
  }

  // Declared seams: per-cabinet override → exact key → the generator's generic key.
  for (const d of declared) {
    const entry = Object.prototype.hasOwnProperty.call(carcaseJoints, d.seam_key) ? carcaseJoints[d.seam_key] : undefined
    const assigned = seamAssignJoint(entry)
    const jointTypeId = assigned !== undefined ? assigned : jointDefaults[d.seam_key] ?? jointDefaults[d.generic_key] ?? null
    if (!jointTypeId) continue
    result.push({
      seam_key:        d.seam_key,
      joint_type_id:   jointTypeId,
      joint_type_name: jointTypeNames[jointTypeId] ?? 'Unknown',
      source:          assigned !== undefined ? 'cabinet' : 'method',
      part_a_key:      d.part_a_key,
      part_b_key:      d.part_b_key,
      ops:             jointTypeOps[jointTypeId] ?? [],
      declared:        d.geom,
    })
  }

  // Internal seams: shelves ↔ side supports, dividers ↔ horizontal anchors.
  // Same cascade as carcase seams; the CM default lives under the family's
  // generic key (adj_shelf:side, fixed_shelf:side, divider:top/bottom).
  for (const cand of enumerateInternalSeams(caseParts, internalParts, { adjFullBank })) {
    let jointTypeId: string | null | undefined
    let source: 'cabinet' | 'method' = 'method'

    const entry = Object.prototype.hasOwnProperty.call(carcaseJoints, cand.seam_key)
      ? carcaseJoints[cand.seam_key]
      : undefined
    const assigned = seamAssignJoint(entry)   // undefined = inherit (incl. rows-only entries)
    if (assigned !== undefined) {
      jointTypeId = assigned
      source = 'cabinet'
    } else {
      jointTypeId = jointDefaults[cand.seam_key] ?? jointDefaults[cand.generic_key] ?? null
    }
    if (!jointTypeId) continue

    // Rows cascade (adj-shelf seams): per-seam entry → cabinet ADJ_ROWS rule → auto.
    let rows = seamAssignRows(entry)
    if (rows === undefined && cand.generic_key === 'adj_shelf:side') {
      const r = cab.rules?.ADJ_ROWS
      if (r && r > 0) rows = r
    }

    result.push({
      seam_key:        cand.seam_key,
      joint_type_id:   jointTypeId,
      joint_type_name: jointTypeNames[jointTypeId] ?? 'Unknown',
      source,
      part_a_key:      cand.part_a_key,
      part_b_key:      cand.part_b_key,
      ops:             jointTypeOps[jointTypeId] ?? [],
      internal_edge:   cand.edge,
      bank:            cand.bank,
      rows_override:   rows,
    })
  }

  return result
}
