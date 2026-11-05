// ============================================================
// Curved fixed-panel cabinet parts (z_curved_end/CURVED-END-SPEC.md, C2).
//
// The geometry is the kit engine (curvedEnd/geometry.ts); this maps its parts
// into the cabinet frame: X along the width (0 = left), Y up, Z from the wall
// (0) toward the room. Kit plan (x across, d from the front) → X = x (RH) or
// W − x (LH), Z = D − d.
//
//   crv:face                face board — exposed board. DX × DY = the flat
//                           blank, DY with the grain (decision 8); `wrap` = its
//                           bent plan shape for 3D / plan / elevation
//   crv:fix                 fixing panel (single ends) — upright, face-kind
//   crv:back                back — upright, face-kind
//   crv:bottom / crv:top /  formers — horizontal (box frame of `bottom`), true-
//   crv:rib_<n>             arc outline (+ fixing-block notches)
//   crv:rib_<n>_l / _r      rangehood support ribs under the shelf (C9), the
//                           rib split left / right of the hole
//   crv:rh_rail_l / _r      rangehood rails each side of the hole (C9) — upright,
//                           face-kind, the support ribs halved into them
//   crv:blk_side(_l|_r) /   fixing blocks — upright, face-kind
//   crv:blk_front
//
// Upright parts use the side:/back:<edge> face-kind frame (DY length, DX
// height, DZ thickness, turned AY about the outer start corner, local z = 0
// the outer face) — the same as the bulkhead's. No edge banding (the kit has
// none). Fixing holes come from the joints library in C3; the rib cut-out
// route and the face board pocket are C3 / C4.
// ============================================================

import type { CabinetInput, DeclaredSeam, DeclaredSeamGeom, ResolvedCasePart, ResolverError } from './types'
import { clipOutlineX, sampleOutline, type OutlinePt } from '../shapePath'
import { spliceNotch } from '../partCutouts'
import { betweenH, calcCurvedEnd, curvedEndParts, loopToOutline, mirLoop, type CurvedEndGeometry, type CurvedEndPart, type Loop } from '../curvedEnd/geometry'
import { calcCurvedKick, type CurvedKick, type CurvedKickParams, type KickRect } from '../curvedEnd/kick'
import { curvedEndKickH, curvedEndParams, curvedEndWallBuild, type CurvedEndSettings } from '../curvedEnd/settings'
import { splitThickness } from './resolveBulkhead'

/** Part key per engine part name. */
export function curvedEndPartKey(name: CurvedEndPart['name']): ResolvedCasePart['part_key'] {
  switch (name) {
    case 'FaceBoard':   return 'crv:face'
    case 'FixingPanel': return 'crv:fix'
    case 'Back':        return 'crv:back'
    case 'Top':         return 'crv:top'
    case 'Bottom':      return 'crv:bottom'
    case 'Block_Side':  return 'crv:blk_side'
    case 'Block_SideL': return 'crv:blk_side_l'
    case 'Block_SideR': return 'crv:blk_side_r'
    case 'Block_Front': return 'crv:blk_front'
    default:            return `crv:rib_${name.slice(3)}`
  }
}

const NO_BAND = { top: false, bottom: false, left: false, right: false }
const r2 = (v: number) => Math.round(v * 100) / 100

/**
 * Face board tape (Mark, 2026-10-20): only the gable end that butts into the
 * next cabinet — not the top / bottom edges, not the wall end (scribed /
 * trimmed). Single ends only; a gable overhang is trimmed after glue-up, so its
 * end stays raw. The gable end is at 0 along the wrap: the blank's x = 0 edge
 * when the wrap runs along DX (vertical grain), y = 0 when along DY — the
 * `bottom` / `left` flags in the optimiser's case-part frame (normalize ebFields).
 */
function gableBand(c: CurvedEndGeometry, grain: 'vertical' | 'horizontal', id?: string) {
  if (c.double || c.ovG > 0) return { ...NO_BAND }
  return gableTape(grain, id)
}
const gableTape = (grain: 'vertical' | 'horizontal', id?: string) =>
  ({ ...NO_BAND, ...(grain === 'vertical' ? { bottom: true } : { left: true }), id })

/**
 * How far a curved end's carcass sits up: its kick (C5, base / tall) and, on a
 * curved bulkhead (BHCRVFIXP, C7), the shadowline split rail under it (z_bulkhead
 * B7). The engine builds DY − both, and every part and seam lifts by both.
 * `cab` is the loaded input — absent (UI before the first resolve) = no split.
 */
export function curvedEndLift(
  s: Pick<CurvedEndSettings, 'kick'>, assemblyClass: string, cab: CabinetInput | undefined,
): { kickH: number; splitH: number } {
  const kickH = cab?.rules.FLOAT ? 0 : curvedEndKickH(s, assemblyClass, cab?.rules.TOEH ?? 150)
  return { kickH, splitH: cab?.bulkhead ? splitThickness(cab) : 0 }
}

export function resolveCurvedEnd(cab: CabinetInput): { parts: ResolvedCasePart[]; seams: DeclaredSeam[]; errors: ResolverError[]; warnings: ResolverError[] } {
  const s = cab.curved_end
  if (!s) return { parts: [], seams: [], errors: [], warnings: [] }
  const FT = cab.exposed_material.DZ, T = cab.material.DZ
  // On a kick (C5) / a split rail (C7) the engine builds the carcass above it and everything lifts.
  const { kickH, splitH } = curvedEndLift(s, cab.assembly_class, cab)
  const lift = kickH + splitH
  // Inside face panel (C8): the engine builds the rest of the width, moved off
  // the gable side by the panel + its scribe (RH: the gable is at X 0; LH: at X = DX).
  const { pT, inset, s: built } = curvedEndInnerFit(s, FT)
  const shiftX = s.hand === 'RH' ? inset : 0
  const c = calcCurvedEnd(curvedEndParams(built, { DX: cab.DX - inset, DY: cab.DY, DZ: cab.DZ }, FT, T, lift, cab.rangehood?.shelf_h,
    curvedEndWallBuild(cab.assembly_class, cab.bulkhead)))
  const errors: ResolverError[] = c.warnings.map(m => ({ code: 'CURVED_END', message: m, part: 'case' }))
  const warnings: ResolverError[] = c.notes.map(m => ({ code: 'CURVED_END_NOTE', message: m, part: 'case' }))
  const parts = curvedEndCaseParts(c, cab.exposed_material.id, cab.material.id, s.grain, cab.exposed_edgeband_id)
    .map(p => ({
      ...p, Y: p.Y + lift,
      // The face board runs over the inside panel's front edge: its gable end is
      // the finished edge, taped (the engine's overhang would leave it raw).
      ...(pT && p.part_key === 'crv:face' ? { edge_band: gableTape(s.grain, cab.exposed_edgeband_id) } : {}),
    }))
  const seams = curvedEndSeams(c).map(sm => ({ ...sm, geom: {
    ...sm.geom, origin: { ...sm.geom.origin, x: sm.geom.origin.x + shiftX, y: sm.geom.origin.y + lift },
    ...(sm.geom.bore_b ? { bore_b: { ...sm.geom.bore_b, at: sm.geom.bore_b.at + (sm.geom.bore_b.axis[0] === 'y' ? lift : sm.geom.bore_b.axis[0] === 'x' ? shiftX : 0) } } : {}),
  } }))
  if (splitH) {
    if (c.double) errors.push({ code: 'CURVED_END', message: 'A shadowline split rail follows a single curve only — not on a double curved end.', part: 'case' })
    else parts.push(curvedSplitRail(c, cab.bulkhead!.split, splitH, cab.split_material!.id))
  }
  if (kickH) {
    const kp = curvedKickParamsFor(cab, kickH)
    const k = calcCurvedKick(c, kp)
    if (k.ok) parts.push(...curvedKickParts(c, k, kp, cab.toekick_face_material.id, cab.toekick_interior_material.id))
    else errors.push(...k.warnings.map(m => ({ code: 'CURVED_END', message: m, part: 'toekick' as const })))
  }
  const out = shiftX ? parts.map(p => ({ ...p, X: p.X + shiftX, ...(p.wrap ? { wrap: { ...p.wrap, pts: p.wrap.pts.map(q => ({ ...q, x: q.x + shiftX })) } } : {}) })) : parts
  if (pT) out.push(curvedInnerPanel(s.hand === 'LH', pT, inset - pT, FT, cab.DX, cab.DZ, c.p.H, lift, cab.exposed_material.id))
  const split = splitSupportRibs(cab, c, out, seams)
  warnings.push(...split.notes.map(m => ({ code: 'CURVED_END_NOTE', message: m, part: 'case' as const })))
  return { parts: split.parts, seams: split.seams, errors, warnings }
}

/** Where a curved end's rangehood hole sits across the cabinet (C9): centred on
 *  the inside, + its offset. Null with no rangehood / no hole size yet. */
export function curvedRangehoodHoleX(cab: CabinetInput): { x0: number; x1: number } | null {
  const h = cab.rangehood?.hole
  if (!cab.curved_end || !h || h.w == null || h.d == null) return null
  const { x0: ix0, x1: ix1 } = curvedEndInterior(cab)
  const x0 = r2((ix0 + ix1) / 2 + h.offset - h.w / 2)
  return { x0, x1: r2(x0 + h.w) }
}

/**
 * Rangehood support ribs (C9, Mark 2026-11-04): each rib under the shelf is cut
 * into a left and a right piece at the hole's sides, clear of the rangehood
 * body — two parts (`crv:rib_<n>_l` / `_r`), true arcs kept. Their seams (back,
 * fixing panel, blocks) go to whichever piece they land on, those along the
 * width trimmed to it.
 */
function splitSupportRibs(cab: CabinetInput, c: CurvedEndGeometry, parts: ResolvedCasePart[], seams: DeclaredSeam[]) {
  const hx = curvedRangehoodHoleX(cab)
  const notes: string[] = []
  if (!hx || c.shelfLevel == null || c.shelfLevel < 2) return { parts, seams, notes }
  let P = parts, S = seams
  for (let i = 1; i < c.shelfLevel; i++) {
    const key = `crv:rib_${i}` as const
    const rib = P.find(p => p.part_key === key)
    if (!rib?.outline) continue
    const pieces: ResolvedCasePart[] = []
    for (const [tag, keep, at] of [['l', 'lt', hx.x0], ['r', 'gt', hx.x1]] as const) {
      const o = clipOutlineX(rib.outline, at - rib.X, keep)
      if (!o) continue
      const xs = o.map(q => q.x), ys = o.map(q => q.y)
      const mx = Math.min(...xs), my = Math.min(...ys), Mx = Math.max(...xs), My = Math.max(...ys)
      const { cutouts: _c, ...rest } = rib
      pieces.push({
        ...rest, part_key: `${key}_${tag}` as const,
        X: r2(rib.X + mx), DY: r2(Mx - mx), DX: r2(My - my), Z: r2(rib.Z + rib.DX - My),
        outline: o.map(q => ({ ...q, x: r2(q.x - mx), y: r2(q.y - my) })),
      })
    }
    P = P.flatMap(p => p === rib ? pieces : [p])
    S = S.flatMap(sm => {
      if (sm.part_a_key !== key && sm.part_b_key !== key) return [sm]
      const g = sm.geom
      return pieces.flatMap(pc => {
        const lo = pc.X, hi = pc.X + pc.DY
        const re = (geom: DeclaredSeamGeom) => {
          const a = sm.part_a_key === key ? pc.part_key : sm.part_a_key, b = sm.part_b_key === key ? pc.part_key : sm.part_b_key
          return [{ ...sm, seam_key: `${a}|${b}`, part_a_key: a, part_b_key: b, geom }]
        }
        if (Math.abs(g.along.x) > 0.5) {
          const e = g.origin.x + g.along.x * g.length
          const s0 = Math.max(Math.min(g.origin.x, e), lo), s1 = Math.min(Math.max(g.origin.x, e), hi)
          if (s1 - s0 < 1) return []
          return re({ ...g, origin: { ...g.origin, x: r2(g.along.x > 0 ? s0 : s1) }, length: r2(s1 - s0) })
        }
        return g.origin.x >= lo - 1 && g.origin.x <= hi + 1 ? re(g) : []
      })
    })
  }
  P = addRangehoodRails(c, P, hx, notes)
  return { parts: P, seams: S, notes }
}

/** Depth of a rangehood rail front to back (Mark's sketch on RHK6542 WC-01). */
export const RH_RAIL_D = 70

/** Front edge (smallest y) of a shape at x, true arcs sampled; Infinity off it. */
function frontAt(shape: OutlinePt[], x: number): number {
  const o = sampleOutline(shape, 1)
  let best = Infinity
  for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
    const a = o[j], b = o[i]
    if ((a.x - x) * (b.x - x) > 0 || a.x === b.x) continue
    best = Math.min(best, a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x))
  }
  return best
}

/**
 * Rangehood rails (C9, Mark 2026-11-04): the support rib pieces each side of the
 * hole are narrow, so a rail stands on edge against each side of the hole (never
 * into it), RH_RAIL_D front to back, as far forward as the curve lets it, from
 * the bottom former up to the shelf rib. Each support rib halves into it: an
 * 8.25 (half-thickness) housing across the rail's inner face (a `pockets` route,
 * open both ends), and the rib's cut edge notched back the same 8.25 over the
 * rail's depth. `crv:rh_rail_l` / `_r`, upright, inner face toward the rib.
 */
function addRangehoodRails(c: CurvedEndGeometry, parts: ResolvedCasePart[], hx: { x0: number; x1: number }, notes: string[]): ResolvedCasePart[] {
  const T = c.p.T, half = r2(T / 2)
  const bottom = parts.find(p => p.part_key === 'crv:bottom')
  const shelf = parts.find(p => p.part_key === `crv:rib_${c.shelfLevel}`)
  if (!bottom || !shelf) return parts
  let P = parts
  for (const tag of ['l', 'r'] as const) {
    const re = new RegExp(`^crv:rib_[0-9]+_${tag}$`)
    const pcs = P.filter(p => re.test(p.part_key)).sort((a, b) => a.Y - b.Y)
    const first = pcs[0]
    const side = tag === 'l' ? 'left' : 'right'
    if (!first?.outline) continue
    if (first.DY < T + 10) { notes.push(`No rangehood rail on the ${side} of the hole: the support rib there is only ${first.DY} wide.`); continue }
    // The rail across the piece: against its cut edge (left piece: x = DY; right: x = 0).
    const ra = tag === 'l' ? first.DY - T : 0, rb = tag === 'l' ? first.DY : T
    const yf = r2(Math.max(frontAt(first.outline, ra + 0.01), frontAt(first.outline, rb - 0.01)))
    const yb = r2(Math.min(yf + RH_RAIL_D, first.DX))
    if (!Number.isFinite(yf) || yb - yf < 20) { notes.push(`No rangehood rail on the ${side} of the hole: no room behind the curve.`); continue }
    const notch = { x0: tag === 'l' ? r2(first.DY - half) : 0, x1: tag === 'l' ? first.DY : half, y0: yf, y1: yb }
    const cut = pcs.map(pc => spliceNotch(pc.outline!, pc.DY, pc.DX, notch, tag === 'l' ? 'right' : 'left'))
    if (cut.some(o => !o)) { notes.push(`No rangehood rail on the ${side} of the hole: the rib couldn’t be notched for it.`); continue }
    P = P.map(p => { const k = pcs.indexOf(p); return k < 0 ? p : { ...p, outline: cut[k]! } })
    const zb = r2(first.Z + first.DX - yf), za = r2(first.Z + first.DX - yb)
    const y = r2(bottom.Y + T), h = r2(shelf.Y - y), len = r2(zb - za)
    P.push({
      part_key: `crv:rh_rail_${tag}`,
      DX: h, DY: len, DZ: T,
      // turnedPanel's frames: outer face toward the hole, the housings on the inner face.
      X: tag === 'l' ? hx.x0 : hx.x1, Y: y, Z: tag === 'l' ? za : zb, AX: 0, AY: tag === 'l' ? -90 : 90, AZ: 0,
      material_id: bottom.material_id, edge_band: { ...NO_BAND },
      // Housings in the pocket frame (x along DY, y down from the top over DX).
      pockets: pcs.map(pc => { const h0 = r2(pc.Y - y); return { x0: 0, x1: len, y0: r2(h - h0 - T), y1: r2(h - h0), depth: half } }),
    })
  }
  return P
}

/**
 * The clear span inside a curved end, across the cabinet (C9 rangehood: the
 * hole and flue centre on it): between the fixing panel's inner face (or the
 * left face board on a DOUBLE) and the face board's inside on the curved side.
 */
export function curvedEndInterior(cab: Pick<CabinetInput, 'DX' | 'curved_end' | 'exposed_material' | 'material'>): { x0: number; x1: number } {
  const s = cab.curved_end!
  const FT = cab.exposed_material.DZ, T = cab.material.DZ
  const { inset } = curvedEndInnerFit(s, FT)
  if (s.hand === 'DOUBLE') return { x0: FT, x1: cab.DX - FT }
  return s.hand === 'LH' ? { x0: FT, x1: cab.DX - inset - T } : { x0: inset + T, x1: cab.DX - FT }
}

/** Thickness of a curved end's inside face panel (C8): the exposed board when
 *  ticked on a single end, else 0. */
export function curvedEndInnerT(s: Pick<CurvedEndSettings, 'inner' | 'hand'>, exposedT: number): number {
  return s.inner && s.hand !== 'DOUBLE' ? exposedT : 0
}

/**
 * C8 fit (Mark, 2026-10-25, BC-03 J05): the inside panel sits behind the face
 * board, set in from the cabinet's gable edge by the gable overhang (OG — the
 * "gable scribe" while the panel is on). The engine builds DX − inset and its
 * face board runs the panel + scribe past the fixing panel, so its gable end
 * lands on the cabinet edge and covers the panel's front edge.
 */
export function curvedEndInnerFit(s: CurvedEndSettings, exposedT: number): { pT: number; inset: number; s: CurvedEndSettings } {
  const pT = curvedEndInnerT(s, exposedT)
  if (!pT) return { pT, inset: 0, s }
  const inset = pT + s.OG
  return { pT, inset, s: { ...s, OG: inset } }
}

/**
 * Inside face panel (C8, Mark 2026-10-24: "the inside of them is going to be
 * seen … allowing a face panel to be added to the inside square edge"): an
 * exposed board on the square gable side, the face board's height, covering
 * the fixing panel. It stops behind the face board (D − FT) and sits `scribe`
 * in from the gable edge, so the face board's end covers its front edge — no
 * tape (Mark, 2026-10-25). Upright, face-kind (as a bulkhead side return): RH
 * at X = scribe turned +90 (front end = local `left`), LH at X = DX − scribe
 * turned −90 (front end = local `right`).
 */
export function curvedInnerPanel(
  lh: boolean, t: number, scribe: number, FT: number, W: number, D: number, H: number, y: number, mat: string,
): ResolvedCasePart {
  return {
    part_key: 'crv:inner', DX: H, DY: D - FT, DZ: t,
    X: lh ? W - scribe : scribe, Y: y, Z: lh ? 0 : D - FT, AX: 0, AY: lh ? -90 : 90, AZ: 0,
    material_id: mat,
    edge_band: { ...NO_BAND },
  }
}

/**
 * Shadowline split rail under a curved bulkhead (C7 / z_bulkhead B7): a flat
 * band `width` deep whose outer edge runs `setback` inside the face board's
 * outside — along the front from the gable end (x 0, butting the straight
 * bulkhead's rail), round the curve at R − setback and down the side to the
 * wall. A radius that leaves no room for the inner arc turns a square corner.
 * Horizontal shape frame like the formers: x across from X, y back from the
 * front edge; kit-frame bulges (LH mirrors).
 */
export function curvedSplitRail(
  c: CurvedEndGeometry, split: { width: number; setback: number }, thickness: number, mat: string,
): ResolvedCasePart {
  const { W, D, R } = c.p
  const sb = split.setback, w = split.width
  const CX = W - R, ro = R - sb, ri = R - sb - w
  const xo = W - sb, xi = W - sb - w
  const TBv = Math.tan(Math.PI / 8)
  // Kit plan frame (x across, d from the front face), anticlockwise.
  const loop: Loop = [[0, sb, 0]]
  if (ro > 0) loop.push([CX, sb, TBv], [xo, R, 0])
  else loop.push([xo, sb, 0])
  loop.push([xo, D, 0], [xi, D, 0])
  if (ri > 0) loop.push([xi, R, -TBv], [CX, sb + w, 0])
  else loop.push([xi, sb + w, 0])
  loop.push([0, sb + w, 0])
  let local: Loop = loop.map(([x, d, b]) => [x, d - sb, b])
  const lh = c.p.hand === 'LH'
  if (lh) local = mirLoop(local, xo)
  return {
    part_key: 'bh:split',
    DX: D - sb, DY: xo, DZ: thickness,
    X: lh ? sb : 0, Y: 0, Z: 0, AX: 0, AY: 0, AZ: 0,
    material_id: mat, edge_band: { ...NO_BAND },
    outline: loopToOutline(local),
  }
}

/** Kick sizes for a curved end on a kick: the cabinet's toe rules + kick boards. */
export function curvedKickParamsFor(cab: CabinetInput, kickH: number): CurvedKickParams {
  const r = cab.rules
  return { H: kickH, FC: r.TOEFC, s: r.TOESCF, sb: r.TOESCB, TF: cab.toekick_face_material.DZ, TI: cab.toekick_interior_material.DZ, SP: r.TOESP }
}

/** Upright panel from its kit plan rect + which face is outside, turned so
 *  local z = 0 is that face (see the header). LH mirrors x. */
function turnedPanel(
  c: CurvedEndGeometry, key: ResolvedCasePart['part_key'], r: KickRect, outer: '-x' | '+x' | '-d' | '+d',
  o: { h: number; y: number; t: number; mat: string },
): ResolvedCasePart {
  const { W, D } = c.p
  const lh = c.p.hand === 'LH'
  const X = (x: number) => (lh ? W - x : x)
  let xa = X(r.x0), xb = X(r.x1)
  if (xa > xb) [xa, xb] = [xb, xa]
  const ox = lh && (outer === '-x' || outer === '+x') ? (outer === '-x' ? '+x' : '-x') : outer
  const za = D - r.d1, zb = D - r.d0
  const t = { X: 0, Z: 0, AY: 0, len: 0 }
  if (ox === '-x')      Object.assign(t, { AY: 90,  X: xa, Z: zb, len: zb - za })
  else if (ox === '+x') Object.assign(t, { AY: -90, X: xb, Z: za, len: zb - za })
  else if (ox === '-d') Object.assign(t, { AY: 180, X: xb, Z: zb, len: xb - xa })   // outer = the front (+Z)
  else                  Object.assign(t, { AY: 0,   X: xa, Z: za, len: xb - xa })   // outer = the wall side (−Z)
  return {
    part_key: key, DX: o.h, DY: r2(t.len), DZ: o.t, X: t.X, Y: o.y, Z: t.Z, AX: 0, AY: t.AY, AZ: 0,
    material_id: o.mat, edge_band: { ...NO_BAND },
  }
}

/** A kit plan loop → cabinet-frame outline points. Z = D − d is a reflection
 *  (bulges flip); LH mirrors x as well (flips them back). */
function planPts(c: CurvedEndGeometry, loop: Loop): OutlinePt[] {
  const { W, D } = c.p
  const lh = c.p.hand === 'LH'
  return loop.map(([x, d, b]) => {
    const p: OutlinePt = { x: lh ? W - x : x, y: D - d }
    const bb = lh ? b : -b
    return bb ? { ...p, b: bb } : p
  })
}

/**
 * Curved kick parts (C5): the bent kick board (kick face material, grain along
 * the wrap, `wrap` like the face board so 3D / plan and the bend pockets come
 * for free), the kick back and the spreaders (kick interior material, lifted
 * TOEFC). Built from the floor up; the carcass sits on top at TOEH.
 */
export function curvedKickParts(
  c: CurvedEndGeometry, k: CurvedKick, kp: CurvedKickParams, faceMat: string, interiorMat: string,
): ResolvedCasePart[] {
  const pts = planPts(c, k.loop)
  const xs = pts.map(p => p.x), zs = pts.map(p => p.y)
  const out: ResolvedCasePart[] = [{
    part_key: 'crv:kick', DX: kp.H, DY: k.len, DZ: kp.TF,
    X: Math.min(...xs), Y: 0, Z: Math.min(...zs), AX: 0, AY: 0, AZ: 0,
    material_id: faceMat, edge_band: { ...NO_BAND }, grain_direction: 'horizontal',
    wrap: { pts, h: kp.H, bend: { at: k.pockets, depth: r2(kp.TF - c.p.SK) } },
  }]
  const low = { h: kp.H - kp.FC, y: kp.FC, t: kp.TI, mat: interiorMat }
  out.push(turnedPanel(c, 'crv:kick_back', k.back, '+d', low))
  k.spreaders.forEach((r, i) => out.push(turnedPanel(c, `crv:kick_spr_${i + 1}`, r, '-x', low)))
  return out
}

/** Engine geometry → cabinet-frame case parts. Pure (tested without a DB). */
export function curvedEndCaseParts(
  c: CurvedEndGeometry, faceMat: string, carcassMat: string, grain: 'vertical' | 'horizontal' = 'vertical', faceEb?: string,
): ResolvedCasePart[] {
  const { W, D, H, T, FT, SK } = c.p
  const lh = c.p.hand === 'LH'
  const X = (x: number) => (lh ? W - x : x)
  const out: ResolvedCasePart[] = []

  // Wall build (WCRVFIXP): the back + side blocks stand between the bottom and the top.
  const upright = (key: ResolvedCasePart['part_key'], x0: number, x1: number, d0: number, d1: number,
    outer: '-x' | '+x' | '-d' | '+d', what: 'back' | 'side' | 'front' | 'fix' = 'fix') => {
    const h = betweenH(c, what)
    out.push(turnedPanel(c, key, { x0, x1, d0, d1 }, outer, { h, y: c.y0 + (h < c.Hc ? T : 0), t: T, mat: carcassMat }))
  }

  // Face board: flat blank + its bent plan shape. Z = D − d is a reflection
  // (bulges flip); LH mirrors x as well (flips them back).
  const wrapPts: OutlinePt[] = c.wrapLoop.map(([x, d, b]) => {
    const p: OutlinePt = { x: X(x), y: D - d }
    const bb = lh ? b : -b
    return bb ? { ...p, b: bb } : p
  })
  const xs = wrapPts.map(p => p.x), zs = wrapPts.map(p => p.y)
  const len = r2(c.wrapLen)
  out.push({
    part_key: 'crv:face',
    ...(grain === 'vertical' ? { DX: len, DY: H } : { DX: H, DY: len }),
    DZ: FT, X: Math.min(...xs), Y: 0, Z: Math.min(...zs), AX: 0, AY: 0, AZ: 0,
    material_id: faceMat, edge_band: gableBand(c, grain, faceEb),
    grain_direction: grain,
    wrap: { pts: wrapPts, h: H, bend: { at: c.pockets.map(([a, b]) => [r2(a), r2(b)] as [number, number]), depth: r2(FT - SK) } },
  })

  if (!c.double) upright('crv:fix', 0, T, FT, c.Dc, '-x')
  upright('crv:back', c.backX0, c.backX0 + c.backW, c.Dc - T, c.Dc, '+d', 'back')
  for (const k of c.blocks) {
    const outer = k.face === 'front' ? '-d' : k.dir === 1 ? '+x' : '-x'
    upright(curvedEndPartKey(k.name), k.x0, k.x1, k.d0, k.d1, outer, k.face)
  }

  // Formers: the engine's part-local outline (front at y 0, already mirrored
  // for LH) is the horizontal shape frame (x across from X, y back from the front).
  for (const p of curvedEndParts(c)) {
    if (p.level == null) continue
    const x0 = lh ? W - c.formerX0 - c.formerW : c.formerX0
    out.push({
      part_key: curvedEndPartKey(p.name),
      DX: p.sizeY, DY: p.sizeX, DZ: T,
      X: x0, Y: c.y0 + c.levels[p.level], Z: D - SK - p.sizeY, AX: 0, AY: 0, AZ: 0,
      material_id: carcassMat, edge_band: { ...NO_BAND },
      outline: p.outline,
      // Rib cut-out (C4): cut inside the rib before its perimeter, leaving the onion skin.
      ...(p.cutout ? { cutouts: [{ pts: p.cutout.loop, skin: r2(T - p.cutout.depth) }] } : {}),
    })
  }
  return out
}

// ── Seams (C3: holes via the joints library) ─────────────────────────────────
// Construction-method default keys for the curved end's joints.
export const CRV_SEAMS = {
  fixFormer:   'crv_fix:former',     // fixing panel → each former's edge
  backFormer:  'crv_back:former',    // back → each former's back edge
  fixBack:     'crv_fix:back',       // fixing panel → the back's edge
  blockFace:   'crv_block:face',     // fixing block → the face board (screws out)
  blockFormer: 'crv_block:former',   // fixing block → each former's notch edge
} as const

/**
 * Where the curved end's parts meet, as declared seams (part A = the part
 * screwed into, part B = the part drilled through). The lines are the kit's
 * (SPEC §5), so the seeded joints reproduce its holes exactly: the fixing panel
 * spreads from its front edge over Dc − T − FT, the back over its full width,
 * whatever block notches the formers carry.
 */
export function curvedEndSeams(c: CurvedEndGeometry): DeclaredSeam[] {
  const { W, D, T, FT } = c.p
  const sx = c.p.hand === 'LH' ? -1 : 1
  // kit plan point (x across, d from the front) at height y → cabinet
  const P = (x: number, d: number, y: number) => ({ x: c.p.hand === 'LH' ? W - x : x, y, z: D - d })
  // kit direction (+x across, +d toward the wall, +y up) → cabinet
  const V = (dx: number, dd: number, dy: number) => ({ x: sx * dx + 0, y: dy, z: -dd + 0 })
  const UP = V(0, 0, 1)
  const out: DeclaredSeam[] = []
  const add = (generic: string, a: string, b: string, geom: DeclaredSeamGeom) =>
    out.push({ seam_key: `${a}|${b}`, generic_key: generic, part_a_key: a, part_b_key: b, geom })

  const formers = c.levels.map((lv, i) => ({
    key: i === 0 ? 'crv:bottom' : i === c.levels.length - 1 ? 'crv:top' : `crv:rib_${i}`,
    y: c.y0 + lv,
  }))

  // Wall build (WCRVFIXP): the top / bottom run to the wall over / under the back
  // and the side blocks, which stand between them — screwed through the former
  // into their ends (as a wall cabinet's back into its top / bottom).
  const wb = !!c.p.wallBuild
  const isCap = (k: string) => wb && (k === 'crv:bottom' || k === 'crv:top')
  // Both caps are bored DOWN from their top face (through holes, so the same
  // hole either way). Bored up from below, the optimiser mirrors the holes for a
  // part turned over but not the curved outline — they landed at the curved
  // front instead of along the wall edge (RHK6542-R4, 2026-11-05).
  const capFace = (f: { key: string; y: number }) => f.key === 'crv:bottom'
    ? { y: f.y + T, toward: UP, bore_b: { axis: 'y-' as const, at: f.y + T } }
    : { y: f.y, toward: V(0, 0, -1), bore_b: { axis: 'y-' as const, at: f.y + T } }
  const lowY = c.y0 + (wb ? T : 0)   // where the back / side blocks start

  for (const f of formers) {
    if (!c.double) add(CRV_SEAMS.fixFormer, f.key, 'crv:fix', {
      origin: P(T, FT, f.y), along: V(0, 1, 0), across: UP, toward: V(1, 0, 0), length: c.Dc - (isCap(f.key) ? 0 : T) - FT, width: T,
    })
    if (isCap(f.key)) {
      const cf = capFace(f)
      add(CRV_SEAMS.backFormer, 'crv:back', f.key, {
        origin: P(c.backX0, c.Dc - T, cf.y), along: V(1, 0, 0), across: V(0, 1, 0), toward: cf.toward, length: c.backW, width: T, bore_b: cf.bore_b,
      })
    } else add(CRV_SEAMS.backFormer, f.key, 'crv:back', {
      origin: P(c.backX0, c.Dc - T, f.y), along: V(1, 0, 0), across: UP, toward: V(0, -1, 0), length: c.backW, width: T,
    })
  }
  if (!c.double) add(CRV_SEAMS.fixBack, 'crv:back', 'crv:fix', {
    origin: P(T, c.Dc, lowY), along: UP, across: V(0, -1, 0), toward: V(1, 0, 0), length: betweenH(c, 'back'), width: T,
  })

  for (const k of c.blocks) {
    const key = curvedEndPartKey(k.name)
    if (k.face === 'side') {
      // outer face against the face board's flat side; inner face in the formers' notches
      const outerX = k.dir === 1 ? k.x1 : k.x0, innerX = k.dir === 1 ? k.x0 : k.x1
      add(CRV_SEAMS.blockFace, 'crv:face', key, {
        origin: P(outerX, k.d0, lowY), along: UP, across: V(0, 1, 0), toward: V(k.dir, 0, 0), length: betweenH(c, 'side'), width: k.wb,
      })
      for (const f of formers) {
        if (isCap(f.key)) {
          const cf = capFace(f)
          add(CRV_SEAMS.blockFormer, key, f.key, {
            origin: P(k.x0, k.d0, cf.y), along: V(0, 1, 0), across: V(1, 0, 0), toward: cf.toward, length: k.wb, width: T, bore_b: cf.bore_b,
          })
        } else add(CRV_SEAMS.blockFormer, f.key, key, {
          origin: P(innerX, k.d0, f.y), along: V(0, 1, 0), across: UP, toward: V(-k.dir, 0, 0), length: k.wb, width: T,
        })
      }
    } else {
      add(CRV_SEAMS.blockFace, 'crv:face', key, {
        origin: P(k.x0, k.d0, c.y0), along: UP, across: V(1, 0, 0), toward: V(0, -1, 0), length: c.Hc, width: k.wb,
      })
      for (const f of formers) add(CRV_SEAMS.blockFormer, f.key, key, {
        origin: P(k.x0, k.d1, f.y), along: V(1, 0, 0), across: UP, toward: V(0, 1, 0), length: k.wb, width: T,
      })
    }
  }
  return out
}

/** A placed curved end's declared seams from its settings (UI: per-part joint
 *  overrides list every seam, assigned or not). */
export function curvedEndSeamsFor(
  s: import('../curvedEnd/settings').CurvedEndSettings, box: { DX: number; DY: number; DZ: number },
  faceThickness: number, carcassThickness: number, kickH = 0, wallBuild = false,
): DeclaredSeam[] {
  return curvedEndSeams(calcCurvedEnd(curvedEndParams(s, box, faceThickness, carcassThickness, kickH, undefined, wallBuild)))
}

/** Display name of a curved-end part key, e.g. "Rib 2", "Face Board". */
export function curvedEndPartLabel(key: string): string | null {
  if (!key.startsWith('crv:')) return null
  const k = key.slice(4)
  const rib = /^rib_(\d+)(?:_([lr]))?$/.exec(k)
  if (rib) return `Curved End Rib ${rib[1]}${rib[2] ? (rib[2] === 'l' ? ' (left)' : ' (right)') : ''}`
  const spr = /^kick_spr_(\d+)$/.exec(k)
  if (spr) return `Curved Kick Spreader ${spr[1]}`
  return ({
    face: 'Curved Face Board', fix: 'Curved End Fixing Panel', inner: 'Curved End Inside Panel', back: 'Curved End Back',
    top: 'Curved End Top', bottom: 'Curved End Bottom',
    blk_side: 'Curved End Fixing Block (side)', blk_side_l: 'Curved End Fixing Block (left)',
    blk_side_r: 'Curved End Fixing Block (right)', blk_front: 'Curved End Fixing Block (front)',
    rh_rail_l: 'Curved End Rangehood Rail (left)', rh_rail_r: 'Curved End Rangehood Rail (right)',
    kick: 'Curved Kick', kick_back: 'Curved Kick Back',
  } as Record<string, string>)[k] ?? null
}

