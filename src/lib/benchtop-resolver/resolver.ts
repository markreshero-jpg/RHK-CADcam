// ── Benchtop resolver (Phase 4) ──────────────────────────────────────────────
// Spec: z_benchtop_builder/BENCHTOP-SPEC.md (Phase 4, decisions Q-a … Q-h).
//
// Shape-true: the outline (segments) is cut into pieces by its join lines and
// every part comes from a piece's real edges — no bounding box of the whole
// top. Per piece:
//   worktop / stone / subtop   one panel, sized along the piece's long axis
//                              (outline kept when shaped)
//   build-up perimeter         a member along every edge (wall, exposed, join);
//                              butt corners: the member along the long axis runs
//                              through, the other is set back; mitre: full length
//   build-up cross members     across the long axis at the method spacing, each
//                              cut to the top's real width at that point
//   fascias                    front / back / side from the exposed edges
//   profile parts              waterfall legs + apron strips from edge profiles
// Outsourced construction: worktop / stone / profile parts are supply items
// carrying area, lineal metres per profile, cutouts and joins in `meta`.
// Sink / cooktop cutouts: the worktop and subtop panels carry them as `holes`
// (cut on the CNC for board tops); build-up members are never cut — a cross
// member that lands in a cutout moves across clear of it.

import type { BenchtopScheduleRow, BenchtopPartRole, BenchtopBuildMethod, BenchtopEdgeProfile } from '@/src/lib/types'
import type { BenchtopResolverInput, ResolvedBenchtopPart, BenchtopPartMeta } from './types'
import { DEFAULT_CROSS_MEMBER_SPACING, crossMemberPositions } from './construction'
import { btSegments, outwardNormal, effectiveProfileId, waterfallJoin, outlinePoints, WATERFALL_RETURN_MM } from '@/src/lib/benchtopGeometry'
import {
  splitIntoPieces, pieceFrame, pieceArea, isRectangle, crossIntervals, edgeLength, pieceContains,
  type PieceSeg, type PieceFrame,
} from './pieces'
import { tapeApplies, edgeTape, type BtPartBands, type BtBandSide } from '@/src/lib/benchtopEdgeband'

type Mat = Map<string, { name: string; dz: number }>
type P = { x: number; y: number }
const dot = (a: P, b: P) => a.x * b.x + a.y * b.y
const r1 = (n: number) => Math.round(n * 10) / 10

// ── Material lookup ──────────────────────────────────────────────────────────

const rowFor = (rows: BenchtopScheduleRow[], role: BenchtopPartRole) => rows.find(r => r.part_role === role)
const boardThickness = (row: BenchtopScheduleRow | undefined, m: Mat, fallback = 18) =>
  (row?.material_id ? m.get(row.material_id)?.dz : undefined) ?? fallback
const surfaceThickness = (row: BenchtopScheduleRow | undefined, m: Mat, fallback = 20) =>
  (row?.benchtop_material_id ? m.get(row.benchtop_material_id)?.dz : undefined) ?? fallback
const boardName = (row: BenchtopScheduleRow | undefined, m: Mat) => (row?.material_id ? m.get(row.material_id)?.name ?? null : null)
const surfaceName = (row: BenchtopScheduleRow | undefined, m: Mat) => (row?.benchtop_material_id ? m.get(row.benchtop_material_id)?.name ?? null : null)

// The schedule row the top itself is made from: the worktop row when the
// method makes a worktop panel, else the stone slab row.
export function topRow(method: BenchtopBuildMethod, rows: BenchtopScheduleRow[]): BenchtopScheduleRow | undefined {
  const order: BenchtopPartRole[] = method.active_part_roles.includes('worktop_panel') || !method.active_part_roles.includes('stone_slab')
    ? ['worktop_panel', 'stone_slab'] : ['stone_slab', 'worktop_panel']
  return rowFor(rows, order[0]) ?? rowFor(rows, order[1])
}

/** Worktop thickness + finished edge thickness (worktop + build-up). Shared with the canvas display. */
export function topThickness(method: BenchtopBuildMethod, rows: BenchtopScheduleRow[], boards: Mat, surfaces: Mat): { top: number; total: number } {
  const wt = topRow(method, rows)
  const top = wt?.material_id ? boardThickness(wt, boards) : surfaceThickness(wt, surfaces, method.construction === 'outsourced' ? 20 : 33)
  if (method.construction === 'buildup_flat') return { top, total: top + boardThickness(rowFor(rows, 'buildup_rail'), boards, top) }
  if (method.construction === 'buildup_vertical') return { top, total: top + (Number(method.buildup_rail_depth) || top) }
  return { top, total: top }
}

// ── Main resolver ─────────────────────────────────────────────────────────────

export function resolveBenchtopParts(input: BenchtopResolverInput): ResolvedBenchtopPart[] {
  const { benchtop, method, scheduleRows, boardMaterials, surfaceMaterials } = input
  const profiles = input.profiles ?? new Map<string, BenchtopEdgeProfile>()
  const {
    construction, active_part_roles, buildup_rail_depth, strip_width_mm,
    cross_member_spacing_mm, drop_front_height, grain_direction, corner_join_type,
  } = method
  const outsourced = construction === 'outsourced'
  const roles = new Set(active_part_roles)

  const segs = btSegments(benchtop)
  if (segs.length < 3) return []
  const pieces = splitIntoPieces(segs, benchtop.joins ?? [])
  const multi = pieces.length > 1
  const thick = topThickness(method, scheduleRows, boardMaterials, surfaceMaterials)
  const sitsAt = benchtop.height_mm ?? input.baseHeight ?? 900

  const profileOf = (s: PieceSeg) => {
    if (s.join || s.edge?.wall) return undefined
    const id = effectiveProfileId(s, method.default_edge_profile_id)
    return id ? profiles.get(id) : undefined
  }

  const parts: ResolvedBenchtopPart[] = []
  const push = (p: Omit<ResolvedBenchtopPart, 'supply_item'> & { supply_item?: boolean }) =>
    parts.push({ supply_item: false, piece: null, outline: null, meta: null, ...p })

  // Worktop-material row: profile parts (waterfall legs, aprons) use it too.
  const wtRow = topRow(method, scheduleRows)
  const wtMaterial = {
    material_id:            wtRow?.material_id ?? null,
    material_name:          boardName(wtRow, boardMaterials),
    benchtop_material_id:   wtRow?.benchtop_material_id ?? null,
    benchtop_material_name: surfaceName(wtRow, surfaceMaterials),
  }

  // Edge tape (Phase 7): in-house board tops only; default = the top row's tape.
  const tapeOn = tapeApplies(method, wtRow)
  const defTape = tapeOn ? wtRow?.edgeband_id ?? null : null
  const tapeOf = (s: PieceSeg) => (tapeOn ? edgeTape(s, profileOf(s), defTape) : null)
  // Tape on the top's own edge (not an apron's bottom edge).
  const topTape = (s: PieceSeg) => (profileOf(s)?.generates === 'apron' ? null : tapeOf(s))

  pieces.forEach((piece, k) => {
    const ps = piece.segs
    const f = pieceFrame(ps)
    const pieceNo = multi ? k + 1 : null
    const sfx = multi ? ` — Piece ${k + 1}` : ''
    const rect = isRectangle(ps)
    const outline = rect ? null : outlinePoints(ps, 8).map(f.toLocal).map(p => ({ x: r1(p.x), y: r1(p.y) }))
    const normals = ps.map((_, i) => outwardNormal(ps, i))
    const isPar = (i: number) => ps[i].type === 'line' && Math.abs(dot(dirOf(ps[i]), f.u)) > 0.9

    // Front / back: exposed long-axis edges facing away from the wall are the
    // front. No wall edge (island): the side the longest exposed edge faces.
    const wallIdx = ps.map((s, i) => i).filter(i => ps[i].edge?.wall && isPar(i))
    const refN = wallIdx.length
      ? neg(normals[longest(ps, wallIdx)])
      : normals[longest(ps, ps.map((_, i) => i).filter(i => isPar(i) && !ps[i].join && !ps[i].edge?.wall))] ?? { x: 0, y: 1 }
    const kind = (i: number): 'Back' | 'Join' | 'Front' | 'Ends' => {
      const s = ps[i]
      if (s.join) return 'Join'
      if (s.edge?.wall) return 'Back'
      if (isPar(i)) return dot(normals[i], refN) > 0 ? 'Front' : 'Back'
      return 'Ends'
    }

    // ── Order / quoting detail for this piece ──
    const lineal: Record<string, number> = {}
    let waterfalls = 0
    ps.forEach(s => {
      const prof = profileOf(s)
      if (!prof) return
      const code = prof.code ?? prof.name
      lineal[code] = Math.round((lineal[code] ?? 0) + edgeLength(s))
      if (prof.generates === 'waterfall') waterfalls++
    })
    // This piece's cutouts in the part frame.
    const holes = (benchtop.cutout_polygons ?? [])
      .filter(c => c.length >= 3 && pieceContains(ps, centroidOf(c)))
      .map(c => ({ c, l: c.map(f.toLocal).map(p => ({ x: r1(p.x), y: r1(p.y) })) }))
    const cutouts = holes.map(({ c, l }) => {
      const xs = l.map(p => p.x), ys = l.map(p => p.y)
      return { w: Math.round(Math.max(...xs) - Math.min(...xs)), h: Math.round(Math.max(...ys) - Math.min(...ys)), round: isRound(c) }
    })
    const panelHoles = holes.length ? holes.map(h => h.l) : null
    const joins = ps.filter(s => s.join).map(s => ({ type: s.join!, length: Math.round(edgeLength(s)) }))
    const meta: BenchtopPartMeta = {
      area_m2: Math.round(pieceArea(ps) / 1e4) / 100, shaped: !rect, profiles: lineal, cutouts, waterfalls, joins,
    }
    const panel = { length_mm: Math.round(f.length), width_mm: Math.round(f.width), quantity: 1, piece: pieceNo, outline, meta }

    // Worktop tape: a side per taped edge when the piece is a rectangle (the
    // optimiser deducts it); a shaped piece carries the metres only.
    const worktopBands = (): BtPartBands | null => {
      const b: BtPartBands = { sides: {}, mm: {} }
      ps.forEach(s => {
        const id = topTape(s)
        if (!id) return
        b.mm![id] = Math.round((b.mm![id] ?? 0) + edgeLength(s))
        if (rect) { const side = sideOf(f, s); if (side) b.sides[side] = id }
      })
      return Object.keys(b.mm!).length ? b : null
    }

    // ── Worktop / stone / subtop ──
    if (roles.has('worktop_panel')) {
      const row = rowFor(scheduleRows, 'worktop_panel')
      push({
        ...panel, part_role: 'worktop_panel', label: `Worktop Panel${sfx}`,
        thickness_mm: row?.material_id ? boardThickness(row, boardMaterials) : surfaceThickness(row, surfaceMaterials, 33),
        grain_direction,
        material_id: row?.material_id ?? null, material_name: boardName(row, boardMaterials),
        benchtop_material_id: row?.benchtop_material_id ?? null, benchtop_material_name: surfaceName(row, surfaceMaterials),
        edgeband_id: row?.edgeband_id ?? null, supply_item: outsourced,
        edgebands: row?.material_id ? worktopBands() : null, holes: panelHoles,
      })
    }
    if (roles.has('stone_slab')) {
      const row = rowFor(scheduleRows, 'stone_slab')
      push({
        ...panel, part_role: 'stone_slab', label: `Stone Slab${sfx}`,
        thickness_mm: surfaceThickness(row, surfaceMaterials, 20), grain_direction: null,
        material_id: null, material_name: null,
        benchtop_material_id: row?.benchtop_material_id ?? null, benchtop_material_name: surfaceName(row, surfaceMaterials),
        edgeband_id: null, supply_item: outsourced,
      })
    }
    if (roles.has('subtop')) {
      const row = rowFor(scheduleRows, 'subtop')
      push({
        ...panel, part_role: 'subtop', label: `Subtop Panel${sfx}`, meta: null,
        thickness_mm: boardThickness(row, boardMaterials, 18), grain_direction,
        material_id: row?.material_id ?? null, material_name: boardName(row, boardMaterials),
        benchtop_material_id: null, benchtop_material_name: null, edgeband_id: row?.edgeband_id ?? null,
        holes: panelHoles,
      })
    }

    // ── Build-up ──
    const flat = construction === 'buildup_flat'
    const memberWidth = flat ? strip_width_mm : construction === 'buildup_vertical' ? buildup_rail_depth : null
    const memberLabel = flat ? 'Build-Up Strip' : 'Build-Up Rail'
    const railRow = rowFor(scheduleRows, 'buildup_rail')
    const railThick = boardThickness(railRow, boardMaterials)
    const setBack = flat ? Number(memberWidth) : railThick

    if (memberWidth && roles.has('buildup_rail')) {
      // At a butt corner one member runs through and the other stops against
      // it: the long-axis member wins, else the longer, else the earlier edge.
      const runsThrough = (i: number, j: number) => {
        if (corner_join_type === 'mitre') return true
        const pi = isPar(i), pj = isPar(j)
        if (pi !== pj) return pi
        const li = edgeLength(ps[i]), lj = edgeLength(ps[j])
        if (Math.abs(li - lj) > 0.5) return li > lj
        return i < j
      }
      const n = ps.length
      ps.forEach((s, i) => {
        const prev = (i - 1 + n) % n, next = (i + 1) % n
        const cut = (runsThrough(i, prev) ? 0 : setBack) + (runsThrough(i, next) ? 0 : setBack)
        const len = Math.max(0, edgeLength(s) - cut)
        if (len < 1) return
        // The tape over a taped edge runs down the member's outer face too, and
        // over its end where it runs through to a taped neighbour (x0 = p0 end).
        const sides: BtPartBands['sides'] = {}
        const out = topTape(s)
        if (out) sides.y0 = out
        const t0 = runsThrough(i, prev) ? topTape(ps[prev]) : null
        const t1 = runsThrough(i, next) ? topTape(ps[next]) : null
        if (t0) sides.x0 = t0
        if (t1) sides.xL = t1
        push({
          edgebands: Object.keys(sides).length ? { sides } : null,
          part_role: 'buildup_rail', label: `${memberLabel} — ${kind(i)}${s.type !== 'line' ? ' (curved)' : ''}${sfx}`,
          length_mm: Math.round(len), width_mm: Number(memberWidth), thickness_mm: railThick, quantity: 1,
          grain_direction: 'length', piece: pieceNo,
          material_id: railRow?.material_id ?? null, material_name: boardName(railRow, boardMaterials),
          benchtop_material_id: null, benchtop_material_name: null, edgeband_id: railRow?.edgeband_id ?? null,
        })
      })
    }

    if (memberWidth && roles.has('buildup_cross_member')) {
      const row = rowFor(scheduleRows, 'buildup_cross_member')
      const innerRun = Math.max(0, f.length - 2 * setBack)
      const spacing = cross_member_spacing_mm || DEFAULT_CROSS_MEMBER_SPACING
      const spans = holes.map(({ l }) => ({ x0: Math.min(...l.map(p => p.x)), x1: Math.max(...l.map(p => p.x)) }))
      for (const along of crossMemberPositions(innerRun, setBack, spacing, Number(memberWidth), spans)) {
        for (const span of crossIntervals(ps, f, along)) {
          const len = span - 2 * setBack
          if (len < 1) continue
          push({
            part_role: 'buildup_cross_member', label: `${flat ? 'Build-Up Strip — Cross' : 'Build-Up Cross Member'}${sfx}`,
            length_mm: Math.round(len), width_mm: Number(memberWidth), thickness_mm: boardThickness(row, boardMaterials),
            quantity: 1, grain_direction: 'length', piece: pieceNo,
            material_id: row?.material_id ?? null, material_name: boardName(row, boardMaterials),
            benchtop_material_id: null, benchtop_material_name: null, edgeband_id: row?.edgeband_id ?? null,
          })
        }
      }
    }

    // ── Fascias (method roles) from the exposed edges ──
    if (drop_front_height) {
      const fascia = (role: BenchtopPartRole, label: string, len: number, grain: 'length' | 'width') => {
        if (len < 1 || !roles.has(role)) return
        const row = rowFor(scheduleRows, role)
        push({
          part_role: role, label: `${label}${sfx}`, length_mm: Math.round(len), width_mm: drop_front_height,
          thickness_mm: boardThickness(row, boardMaterials), quantity: 1, grain_direction: grain, piece: pieceNo,
          material_id: row?.material_id ?? null, material_name: boardName(row, boardMaterials),
          benchtop_material_id: null, benchtop_material_name: null, edgeband_id: row?.edgeband_id ?? null,
        })
      }
      const sum = (want: string) => ps.reduce((a, s, i) => a + (!s.join && !s.edge?.wall && kind(i) === want ? edgeLength(s) : 0), 0)
      fascia('drop_front_fascia', 'Drop Front Fascia', sum('Front'), 'length')
      fascia('back_fascia', 'Back Fascia', sum('Back'), 'length')
      ps.forEach((s, i) => { if (kind(i) === 'Ends') fascia('side_fascia', 'Side Fascia', edgeLength(s), 'width') })
    }

    // ── Parts generated by edge profiles ──
    const np = ps.length
    ps.forEach((s, i) => {
      const prof = profileOf(s)
      if (!prof || s.type !== 'line') return
      const len = edgeLength(s)
      if (prof.generates === 'waterfall') {
        // Mitre: leg runs to the top surface (45° top end). Butt: the top sits
        // on the leg, so it stops at the underside.
        const join = waterfallJoin(s)
        const legLen = Math.round(join === 'mitre' ? sitsAt + thick.total : sitsAt)
        // Upright edges (y0 at the p0 end, yW at p1) take the neighbours' tape.
        const bands: BtPartBands = { sides: {}, mm: {} }
        const up = (side: 'y0' | 'yW', j: number) => {
          const id = topTape(ps[j])
          if (!id) return
          bands.sides[side] = id
          bands.mm![id] = (bands.mm![id] ?? 0) + legLen
        }
        up('y0', (i - 1 + np) % np); up('yW', (i + 1) % np)
        push({
          edgebands: Object.keys(bands.sides).length ? bands : null,
          ...wtMaterial, part_role: 'waterfall_panel',
          label: `Waterfall Leg — ${join === 'mitre' ? 'mitred' : 'butt'}${sfx}`,
          length_mm: legLen,
          width_mm: Math.round(len), thickness_mm: thick.top, quantity: 1,
          grain_direction: 'length', edgeband_id: wtRow?.edgeband_id ?? null,
          supply_item: outsourced, piece: pieceNo, meta: { waterfall_join: join },
        })
        // Built-up ends (benchtopGeometry waterfallBuildUp): where the leg meets a
        // straight mitred apron deeper than the top, a face piece the apron's drop
        // wide (floor to the top surface, 45° both ways) + a return behind it
        // (floor to the underside).
        for (const j of [i - 1, i + 1]) {
          const q = ps[(j + np) % np], qp = q.type === 'line' ? profileOf(q) : undefined
          const D = qp?.generates === 'apron' ? Number(qp.apron_drop_mm) || 0 : 0
          if (D <= thick.total) continue
          push({
            ...wtMaterial, part_role: 'waterfall_face', label: `Waterfall Face (${qp!.code ?? qp!.name})${sfx}`,
            length_mm: Math.round(sitsAt + thick.total), width_mm: D, thickness_mm: thick.top, quantity: 1,
            grain_direction: 'length', edgeband_id: wtRow?.edgeband_id ?? null,
            supply_item: outsourced, piece: pieceNo,
          })
          const R = Math.min(WATERFALL_RETURN_MM, Math.max(0, Math.round(len - 2 * thick.total)))
          if (R > 0) push({
            ...wtMaterial, part_role: 'waterfall_return', label: `Waterfall Return${sfx}`,
            length_mm: Math.round(sitsAt), width_mm: R, thickness_mm: thick.top, quantity: 1,
            grain_direction: 'length', edgeband_id: wtRow?.edgeband_id ?? null,
            supply_item: outsourced, piece: pieceNo,
          })
        }
      } else if (prof.generates === 'apron' && prof.apron_drop_mm) {
        const id = tapeOf(s)   // the apron's bottom edge
        push({
          edgebands: id ? { sides: { yW: id }, mm: { [id]: Math.round(len) } } : null,
          ...wtMaterial, part_role: 'apron_strip', label: `Apron Strip (${prof.code ?? prof.name})${sfx}`,
          length_mm: Math.round(len), width_mm: Number(prof.apron_drop_mm), thickness_mm: thick.top, quantity: 1,
          grain_direction: 'length', edgeband_id: wtRow?.edgeband_id ?? null,
          supply_item: outsourced, piece: pieceNo,
        })
      }
    })
  })

  return groupParts(parts)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function dirOf(s: PieceSeg): P {
  const L = Math.hypot(s.p1.x - s.p0.x, s.p1.y - s.p0.y) || 1
  return { x: (s.p1.x - s.p0.x) / L, y: (s.p1.y - s.p0.y) / L }
}
const neg = (p: P): P => ({ x: -p.x, y: -p.y })
// Which side of a rectangular piece (part frame) an edge lies on.
function sideOf(f: PieceFrame, s: PieceSeg): BtBandSide | null {
  const m = f.toLocal({ x: (s.p0.x + s.p1.x) / 2, y: (s.p0.y + s.p1.y) / 2 })
  if (Math.abs(m.y) < 1) return 'y0'
  if (Math.abs(m.y - f.width) < 1) return 'yW'
  if (Math.abs(m.x) < 1) return 'x0'
  if (Math.abs(m.x - f.length) < 1) return 'xL'
  return null
}
function longest(ps: PieceSeg[], idx: number[]): number {
  return idx.reduce((b, i) => (b < 0 || edgeLength(ps[i]) > edgeLength(ps[b]) ? i : b), -1)
}
// A circle: many points, all the same distance from the centroid. (A point count
// alone misreads rounded-corner rectangles, e.g. fixture sink cutouts.)
function isRound(c: P[]): boolean {
  if (c.length < 12) return false
  const m = centroidOf(c)
  // vertices and edge midpoints (a rounded rectangle has its points only at the
  // corners, so its straight edges' midpoints sit well inside)
  const ds = c.flatMap((p, i) => {
    const q = c[(i + 1) % c.length]
    return [Math.hypot(p.x - m.x, p.y - m.y), Math.hypot((p.x + q.x) / 2 - m.x, (p.y + q.y) / 2 - m.y)]
  })
  const lo = Math.min(...ds), hi = Math.max(...ds)
  return hi > 0 && (hi - lo) / hi < 0.03
}

function centroidOf(c: P[]): P {
  return { x: c.reduce((a, p) => a + p.x, 0) / c.length, y: c.reduce((a, p) => a + p.y, 0) / c.length }
}

// Identical cut parts (same role / label / size / material / piece, no shape
// or order detail) collapse into one line with a quantity.
function groupParts(parts: ResolvedBenchtopPart[]): ResolvedBenchtopPart[] {
  const out: ResolvedBenchtopPart[] = []
  const byKey = new Map<string, ResolvedBenchtopPart>()
  for (const p of parts) {
    if (p.outline || p.holes?.length || (p.meta && Object.keys(p.meta).length && p.part_role !== 'waterfall_panel')) { out.push(p); continue }
    const key = [p.part_role, p.label, p.length_mm, p.width_mm, p.thickness_mm, p.material_id, p.benchtop_material_id, p.piece, JSON.stringify(p.meta), JSON.stringify(p.edgebands ?? null)].join('|')
    const hit = byKey.get(key)
    if (hit) hit.quantity += p.quantity
    else { const q = { ...p }; byKey.set(key, q); out.push(q) }
  }
  return out
}

export type { PieceFrame }
