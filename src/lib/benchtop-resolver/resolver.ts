import type { BenchtopScheduleRow, BenchtopPartRole } from '@/src/lib/types'
import type { BenchtopResolverInput, ResolvedBenchtopPart } from './types'

// ── Geometry helpers ──────────────────────────────────────────────────────────

type Pt = { x: number; y: number }

function edgeLen(a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

// Approximate quadratic bezier arc length via subdivision (20 steps)
function arcLen(p0: Pt, cp: Pt, p1: Pt, steps = 20): number {
  let len = 0, px = p0.x, py = p0.y
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, u = 1 - t
    const x = u * u * p0.x + 2 * u * t * cp.x + t * t * p1.x
    const y = u * u * p0.y + 2 * u * t * cp.y + t * t * p1.y
    const dx = x - px, dy = y - py
    len += Math.sqrt(dx * dx + dy * dy)
    px = x; py = y
  }
  return len
}

interface BBoxResult {
  minX: number; maxX: number; minY: number; maxY: number
  bboxDx: number; bboxDy: number
}

function polygonBBox(polygon: Pt[]): BBoxResult {
  const xs = polygon.map(p => p.x), ys = polygon.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  return { minX, maxX, minY, maxY, bboxDx: maxX - minX, bboxDy: maxY - minY }
}

interface EdgeAnalysis {
  exposedFrontLength: number
  exposedBackLength:  number
  exposedEndEdges:    number[]
}

// Classifies each non-wall polygon edge into front/back (along primary axis)
// or end (perpendicular to primary axis), then sums/collects their lengths.
function analyzeEdges(
  polygon: Pt[],
  edgeTags: Array<{ edge_index: number; type: string }>,
  primaryIsX: boolean,
  midPerp: number,
  arcSegs: Array<{ edge_index: number; cpx: number; cpy: number }> = [],
): EdgeAnalysis {
  const n = polygon.length
  let exposedFrontLength = 0
  let exposedBackLength  = 0
  const exposedEndEdges: number[] = []

  for (let i = 0; i < n; i++) {
    const p    = polygon[i]
    const next = polygon[(i + 1) % n]
    const isWall = edgeTags.some(t => t.edge_index === i && t.type === 'wall')
    if (isWall) continue

    const arc = arcSegs.find(a => a.edge_index === i)
    const len = arc ? arcLen(p, { x: arc.cpx, y: arc.cpy }, next) : edgeLen(p, next)
    const absDx = Math.abs(next.x - p.x)
    const absDy = Math.abs(next.y - p.y)

    if (primaryIsX ? absDx > absDy : absDy > absDx) {
      // Along-primary edge → front or back based on position
      const midEdgePerp = primaryIsX ? (p.y + next.y) / 2 : (p.x + next.x) / 2
      if (midEdgePerp <= midPerp) {
        exposedFrontLength += len
      } else {
        exposedBackLength += len
      }
    } else {
      // Perpendicular edge → side fascia
      exposedEndEdges.push(len)
    }
  }

  return {
    exposedFrontLength: Math.round(exposedFrontLength),
    exposedBackLength:  Math.round(exposedBackLength),
    exposedEndEdges,
  }
}

// ── Material lookup helpers ───────────────────────────────────────────────────

function rowFor(scheduleRows: BenchtopScheduleRow[], role: BenchtopPartRole) {
  return scheduleRows.find(r => r.part_role === role)
}

function boardThickness(
  row: BenchtopScheduleRow | undefined,
  boardMaterials: Map<string, { name: string; dz: number }>,
  fallback = 18,
): number {
  if (!row?.material_id) return fallback
  return boardMaterials.get(row.material_id)?.dz ?? fallback
}

function surfaceThickness(
  row: BenchtopScheduleRow | undefined,
  surfaceMaterials: Map<string, { name: string; dz: number }>,
  fallback = 20,
): number {
  if (!row?.benchtop_material_id) return fallback
  return surfaceMaterials.get(row.benchtop_material_id)?.dz ?? fallback
}

function boardName(
  row: BenchtopScheduleRow | undefined,
  boardMaterials: Map<string, { name: string; dz: number }>,
): string | null {
  if (!row?.material_id) return null
  return boardMaterials.get(row.material_id)?.name ?? null
}

function surfaceName(
  row: BenchtopScheduleRow | undefined,
  surfaceMaterials: Map<string, { name: string; dz: number }>,
): string | null {
  if (!row?.benchtop_material_id) return null
  return surfaceMaterials.get(row.benchtop_material_id)?.name ?? null
}

// ── Main resolver ─────────────────────────────────────────────────────────────

export function resolveBenchtopParts(input: BenchtopResolverInput): ResolvedBenchtopPart[] {
  const { benchtop, method, scheduleRows, boardMaterials, surfaceMaterials } = input
  const { polygon, edge_tags, arc_segments } = benchtop
  const {
    active_part_roles, buildup_rail_depth, drop_front_height,
    grain_direction, corner_join_type,
  } = method

  if (polygon.length < 3) return []

  const bbox      = polygonBBox(polygon)
  const primaryIsX = bbox.bboxDx >= bbox.bboxDy
  const runLength  = Math.round(Math.max(bbox.bboxDx, bbox.bboxDy))
  const benchDepth = Math.round(Math.min(bbox.bboxDx, bbox.bboxDy))
  const midPerp    = primaryIsX
    ? (bbox.minY + bbox.maxY) / 2
    : (bbox.minX + bbox.maxX) / 2

  const edges = analyzeEdges(polygon, edge_tags, primaryIsX, midPerp, arc_segments ?? [])

  const parts: ResolvedBenchtopPart[] = []

  function push(p: ResolvedBenchtopPart) { parts.push(p) }

  // ── worktop_panel ────────────────────────────────────────────────────────

  if (active_part_roles.includes('worktop_panel')) {
    const row = rowFor(scheduleRows, 'worktop_panel')
    const thick = surfaceThickness(row, surfaceMaterials, 33)
    push({
      part_role: 'worktop_panel',
      label: 'Worktop Panel',
      length_mm: runLength,
      width_mm: benchDepth,
      thickness_mm: thick,
      quantity: 1,
      grain_direction,
      material_id:            row?.material_id ?? null,
      material_name:          boardName(row, boardMaterials),
      benchtop_material_id:   row?.benchtop_material_id ?? null,
      benchtop_material_name: surfaceName(row, surfaceMaterials),
      edgeband_id:            row?.edgeband_id ?? null,
    })
  }

  // ── buildup_rail ─────────────────────────────────────────────────────────

  if (active_part_roles.includes('buildup_rail') && buildup_rail_depth) {
    const row   = rowFor(scheduleRows, 'buildup_rail')
    const thick = boardThickness(row, boardMaterials)
    const matId   = row?.material_id ?? null
    const matName = boardName(row, boardMaterials)
    const ebId    = row?.edgeband_id ?? null

    const common = {
      part_role: 'buildup_rail' as BenchtopPartRole,
      width_mm: buildup_rail_depth,
      thickness_mm: thick,
      grain_direction: 'length' as const,
      material_id: matId,
      material_name: matName,
      benchtop_material_id: null,
      benchtop_material_name: null,
      edgeband_id: ebId,
    }

    // Front and back rails run the full run length
    push({ ...common, label: 'Build-Up Rail — Front', length_mm: runLength, quantity: 1 })
    push({ ...common, label: 'Build-Up Rail — Back',  length_mm: runLength, quantity: 1 })

    // End rails: length depends on corner join type
    // Butt: shortened by front+back rail thickness; Mitre: full depth
    const endLength = corner_join_type === 'mitre'
      ? benchDepth
      : Math.max(0, benchDepth - 2 * thick)

    push({ ...common, label: 'Build-Up Rail — Ends', length_mm: Math.round(endLength), quantity: 2 })
  }

  // ── buildup_cross_member ─────────────────────────────────────────────────
  // Cross members are generated as structural intermediates; count and spacing
  // are method-dependent. Output one representative record flagged for layout.
  if (active_part_roles.includes('buildup_cross_member') && buildup_rail_depth) {
    const row   = rowFor(scheduleRows, 'buildup_cross_member')
    const thick = boardThickness(row, boardMaterials)
    // Inner span = benchDepth minus front/back rail thickness
    const spanLength = Math.max(0, benchDepth - 2 * thick)
    push({
      part_role: 'buildup_cross_member',
      label: 'Build-Up Cross Member',
      length_mm: Math.round(spanLength),
      width_mm: buildup_rail_depth,
      thickness_mm: thick,
      quantity: 2,  // minimum two; user can add more in cut list
      grain_direction: 'width',
      material_id:            row?.material_id ?? null,
      material_name:          boardName(row, boardMaterials),
      benchtop_material_id:   null,
      benchtop_material_name: null,
      edgeband_id:            row?.edgeband_id ?? null,
    })
  }

  // ── subtop ───────────────────────────────────────────────────────────────

  if (active_part_roles.includes('subtop')) {
    const row   = rowFor(scheduleRows, 'subtop')
    const thick = boardThickness(row, boardMaterials, 18)
    push({
      part_role: 'subtop',
      label: 'Subtop Panel',
      length_mm: runLength,
      width_mm: benchDepth,
      thickness_mm: thick,
      quantity: 1,
      grain_direction,
      material_id:            row?.material_id ?? null,
      material_name:          boardName(row, boardMaterials),
      benchtop_material_id:   null,
      benchtop_material_name: null,
      edgeband_id:            row?.edgeband_id ?? null,
    })
  }

  // ── stone_slab ───────────────────────────────────────────────────────────

  if (active_part_roles.includes('stone_slab')) {
    const row   = rowFor(scheduleRows, 'stone_slab')
    const thick = surfaceThickness(row, surfaceMaterials, 20)
    push({
      part_role: 'stone_slab',
      label: 'Stone Slab',
      length_mm: runLength,
      width_mm: benchDepth,
      thickness_mm: thick,
      quantity: 1,
      grain_direction: null,
      material_id:            null,
      material_name:          null,
      benchtop_material_id:   row?.benchtop_material_id ?? null,
      benchtop_material_name: surfaceName(row, surfaceMaterials),
      edgeband_id:            null,
    })
  }

  // ── drop_front_fascia ────────────────────────────────────────────────────

  if (active_part_roles.includes('drop_front_fascia') && drop_front_height && edges.exposedFrontLength > 0) {
    const row   = rowFor(scheduleRows, 'drop_front_fascia')
    const thick = boardThickness(row, boardMaterials)
    push({
      part_role: 'drop_front_fascia',
      label: 'Drop Front Fascia',
      length_mm: edges.exposedFrontLength,
      width_mm: drop_front_height,
      thickness_mm: thick,
      quantity: 1,
      grain_direction: 'length',
      material_id:            row?.material_id ?? null,
      material_name:          boardName(row, boardMaterials),
      benchtop_material_id:   null,
      benchtop_material_name: null,
      edgeband_id:            row?.edgeband_id ?? null,
    })
  }

  // ── back_fascia ──────────────────────────────────────────────────────────

  if (active_part_roles.includes('back_fascia') && drop_front_height && edges.exposedBackLength > 0) {
    const row   = rowFor(scheduleRows, 'back_fascia')
    const thick = boardThickness(row, boardMaterials)
    push({
      part_role: 'back_fascia',
      label: 'Back Fascia',
      length_mm: edges.exposedBackLength,
      width_mm: drop_front_height,
      thickness_mm: thick,
      quantity: 1,
      grain_direction: 'length',
      material_id:            row?.material_id ?? null,
      material_name:          boardName(row, boardMaterials),
      benchtop_material_id:   null,
      benchtop_material_name: null,
      edgeband_id:            row?.edgeband_id ?? null,
    })
  }

  // ── side_fascia ──────────────────────────────────────────────────────────

  if (active_part_roles.includes('side_fascia') && drop_front_height && edges.exposedEndEdges.length > 0) {
    const row   = rowFor(scheduleRows, 'side_fascia')
    const thick = boardThickness(row, boardMaterials)
    edges.exposedEndEdges.forEach(len => {
      push({
        part_role: 'side_fascia',
        label: 'Side Fascia',
        length_mm: Math.round(len),
        width_mm: drop_front_height,
        thickness_mm: thick,
        quantity: 1,
        grain_direction: 'width',
        material_id:            row?.material_id ?? null,
        material_name:          boardName(row, boardMaterials),
        benchtop_material_id:   null,
        benchtop_material_name: null,
        edgeband_id:            row?.edgeband_id ?? null,
      })
    })
  }

  return parts
}
