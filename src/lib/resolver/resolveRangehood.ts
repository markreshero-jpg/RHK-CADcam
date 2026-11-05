// ============================================================
// Undermount rangehood cabinet `WRH` (z_rangehood/RANGEHOOD-SPEC.md, R5).
//
// From `cab.rangehood`:
//   - the first fixed shelf sits with its underside `shelf_h` above the
//     cabinet's underside (the WUP's underside — the carcass scribes up over it);
//   - the rangehood hole through the bottom (cut-out source 'rangehood');
//   - the flue notch (w × d from the back edge) in that shelf and the top, lined
//     up in cabinet space;
//   - the flue box on the shelf, up to the top, in carcass board: two sides
//     standing on the notch edges (front edge taped) and a front piece across
//     them (both side edges taped);
//   - its joints as declared seams: the shelf and the top screwed into every
//     piece's edge, the front piece into each side's front edge — 5mm Dynamic
//     Holes by the construction method's defaults (RH_SEAMS).
//
// Cabinet frame: X across from the left, Y up from the underside, Z from the
// wall to the front. Upright parts use the bulkhead returns' frame (DY length,
// DX height, DZ thickness, turned AY about the outer start corner).
// ============================================================

import type { CabinetInput, DeclaredSeam, ResolvedCasePart, ResolvedInternalPart, ResolverError, Section, InternalFitting } from './types'
import type { Cutout, PartCutouts } from '../partCutouts'
import { RH_SEAMS } from '../rangehood'
import { curvedEndInterior, curvedRangehoodHoleX } from './resolveCurvedEnd'
import { sampleOutline, type OutlinePt } from '../shapePath'

/** Corners of a rect (part frame) inside a shaped outline, nothing of the
 *  outline reaching into it (arcs sampled every 2°). */
function rectInOutline(shape: OutlinePt[] | undefined, x0: number, y0: number, x1: number, y1: number): boolean {
  if (!shape?.length) return true
  const o = sampleOutline(shape, 2)   // true arcs (a chord would cut in front of a convex curve)
  const inside = (x: number, y: number) => {
    let r = false
    for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
      const a = o[i], b = o[j]
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) r = !r
    }
    return r
  }
  const e = 0.5
  return inside(x0 + e, y0 + e) && inside(x1 - e, y0 + e) && inside(x1 - e, y1 - e) && inside(x0 + e, y1 - e)
    && !o.some(q => q.x > x0 + e && q.x < x1 - e && q.y > y0 + e && q.y < y1 - e)
}

const r2 = (v: number) => Math.round(v * 100) / 100

/** The cabinet with its first fixed shelf locked at the rangehood's shelf height.
 *  Open compartments only (a split's separator shelf follows the split). */
export function withRangehoodShelf(cab: CabinetInput): CabinetInput {
  const h = cab.rangehood?.shelf_h
  if (!h || !cab.internal_tree) return cab
  let done = false
  const walk = (s: Section): Section => {
    if (done) return s
    if (s.type === 'open') {
      const i = s.fittings.findIndex(f => f.type === 'fixed_shelf')
      if (i < 0) return s
      done = true
      const fittings = s.fittings.map((f, k) => k === i ? { ...f, y_locked: true, y_position: h } as InternalFitting : f)
      return { ...s, fittings }
    }
    return { ...s, children: s.children.map(c => ({ ...c, section: walk(c.section) })) }
  }
  const tree = walk(cab.internal_tree)
  return done ? { ...cab, internal_tree: tree } : cab
}

export interface RangehoodResult {
  parts:    ResolvedCasePart[]
  seams:    DeclaredSeam[]
  cutouts:  PartCutouts            // generated cut-outs by part id (source 'rangehood')
  warnings: ResolverError[]
  hole?:    { x0: number; x1: number; z0: number; z1: number }   // cabinet frame, for the under panel
}

export function resolveRangehood(cab: CabinetInput, caseParts: ResolvedCasePart[], internalParts: ResolvedInternalPart[]): RangehoodResult {
  const out: RangehoodResult = { parts: [], seams: [], cutouts: {}, warnings: [] }
  const rh = cab.rangehood
  if (!rh) return out
  const warn = (message: string) => out.warnings.push({ code: 'RANGEHOOD', message: `Rangehood: ${message}` })
  const add = (id: string, c: Cutout) => { out.cutouts[id] = [...(out.cutouts[id] ?? []), c] }

  // A curved end (z_curved_end C9): its formers stand in — bottom former, a rib
  // locked at the shelf height (the engine, shelfAt), the top former. Hole and
  // flue centre on the clear span inside it; the hole sets back from the face
  // board's inside face (as a WRH's from the carcass front).
  if (cab.curved_end) return resolveCurvedRangehood(cab, caseParts, out, warn, add)

  // ── Hole through the bottom ────────────────────────────────────
  const bottom = caseParts.find(p => p.part_key === 'bottom')
  const { hole } = rh
  if (hole.w == null || hole.d == null) warn('the hole size isn’t set yet — no hole cut (set it in the sidebar)')
  else {
    // Where it sits: centred on the bottom and back from its front edge — or,
    // with no bottom (Bottom Type none: the hole is only in the under panel),
    // centred between the gables and back from their front edges.
    const L = caseParts.find(p => p.part_key === 'left_side'), R = caseParts.find(p => p.part_key === 'right_side')
    const cx = bottom ? bottom.X + bottom.DY / 2 : L && R ? (L.X + L.DZ + R.X) / 2 : cab.DX / 2
    const front = bottom ? bottom.Z + bottom.DX : L ? L.Z + L.DX : cab.DZ
    const x0 = r2(cx + hole.offset - hole.w / 2), z1 = r2(front - hole.setback)
    out.hole = { x0, x1: r2(x0 + hole.w), z0: r2(z1 - hole.d), z1 }
    if (bottom) add('case_bottom', {
      id: 'rh_hole', kind: 'hole', shape: 'rect', w: hole.w, d: hole.d, radius: hole.radius, depth: null, source: 'rangehood',
      x: { from: 'centre', off: hole.offset }, y: { from: 'front', off: hole.setback },
    })
  }

  // ── Flue: the first fixed shelf + the top ──────────────────────
  const shelves = internalParts.filter(p => p.part_type === 'fixed_shelf')
  const shelf = shelves.length ? shelves.reduce((a, b) => Math.abs(b.Y - rh.shelf_h) < Math.abs(a.Y - rh.shelf_h) ? b : a) : null
  const top = caseParts.find(p => p.part_key === 'full_top')
  if (!shelf) { warn('needs a fixed shelf (Interior tab) for the flue notch and box'); return out }
  if (Math.abs(shelf.Y - rh.shelf_h) > 0.5) warn(`the first fixed shelf is at ${r2(shelf.Y)}, not ${rh.shelf_h} — it’s set by its compartment split; move it in the Interior tab`)
  if (!top) { warn('needs a full top for the flue to go through'); return out }

  const T = cab.material.DZ
  const { flue } = rh
  const cx0 = r2(shelf.X + (shelf.DY - flue.w) / 2 + flue.offset), cx1 = r2(cx0 + flue.w)
  const zBack = shelf.Z, zFront = r2(shelf.Z + flue.d)
  const y0 = r2(shelf.Y + shelf.DZ), y1 = top.Y, H = r2(y1 - y0)
  if (cx0 - T < shelf.X - 0.5 || cx1 + T > shelf.X + shelf.DY + 0.5) { warn(`the flue box (${flue.w} + 2 × ${T}) doesn’t fit across the shelf`); return out }
  if (zFront + T > shelf.Z + shelf.DX + 0.5) { warn(`the flue box (${flue.d} + ${T} deep) runs off the front of the shelf`); return out }
  const topD = r2(zFront - top.Z)
  if (!(topD > 0) || topD >= top.DX) { warn('the flue notch doesn’t fit the top'); return out }
  if (!(H > 0)) { warn('no room between the shelf and the top for the flue box'); return out }

  const notch = (part: { X: number }, d: number): Cutout => ({
    id: 'rh_flue', kind: 'notch', shape: 'rect', w: flue.w, d, edge: 'back', source: 'rangehood',
    x: { from: 'left', off: r2(cx0 - part.X) }, y: { from: 'back', off: 0 },
  })
  const shelfId = `int_fixed_shelf_${shelf.sort_order}`
  add(shelfId, notch(shelf, flue.d))
  add('case_full_top', notch(top, topD))

  flueBox(cab, out, { cx0, cx1, zBack, zFront, y0, y1, H, T }, { key: shelfId, Y: shelf.Y }, { key: 'full_top', Y: top.Y, DZ: top.DZ })
  return out
}

type BoxAt = { cx0: number; cx1: number; zBack: number; zFront: number; y0: number; y1: number; H: number; T: number }
/** The flue box (two sides + a front piece) and its seams into the shelf and the top. */
function flueBox(cab: CabinetInput, out: RangehoodResult, b: BoxAt, shelf: { key: string; Y: number }, top: { key: string; Y: number; DZ: number }) {
  const flue = cab.rangehood!.flue
  const { cx0, cx1, zBack, zFront, y0, y1, H, T } = b
  const shelfId = shelf.key
  // ── Flue box ───────────────────────────────────────────────────
  const mat = cab.material.id, eb = cab.interior_edgeband_id
  const band = (e: { left?: boolean; right?: boolean }) => ({ top: false, bottom: false, left: !!e.left, right: !!e.right, id: eb })
  // Left side: turned +90° (outer face at X, runs front → back) — front end = local x 0.
  out.parts.push({ part_key: 'rh:flue_l', DX: H, DY: flue.d, DZ: T, X: r2(cx0 - T), Y: y0, Z: zFront, AX: 0, AY: 90, AZ: 0, material_id: mat, edge_band: band({ left: true }) })
  // Right side: turned −90° (outer face at X, runs back → front) — front end = local x DY.
  out.parts.push({ part_key: 'rh:flue_r', DX: H, DY: flue.d, DZ: T, X: r2(cx1 + T), Y: y0, Z: zBack, AX: 0, AY: -90, AZ: 0, material_id: mat, edge_band: band({ right: true }) })
  // Front piece across both sides' front edges.
  out.parts.push({ part_key: 'rh:flue_front', DX: H, DY: r2(flue.w + 2 * T), DZ: T, X: r2(cx0 - T), Y: y0, Z: zFront, AX: 0, AY: 0, AZ: 0, material_id: mat, edge_band: band({ left: true, right: true }) })

  // ── Joints (A = screwed into its edge, B = drilled through) ─────
  const seam = (generic: string, a: string, b: string, geom: DeclaredSeam['geom']) =>
    out.seams.push({ seam_key: `${a}|${b}`, generic_key: generic, part_a_key: a, part_b_key: b, geom })
  const X = { x: 1, y: 0, z: 0 }, Z = { x: 0, y: 0, z: 1 }
  // Each piece's bottom / top edge strip: origin at its corner, along its length, across its thickness.
  const edges = [
    { key: 'rh:flue_l',     origin: { x: r2(cx0 - T), z: zBack },  along: Z, length: flue.d },
    { key: 'rh:flue_r',     origin: { x: cx1,         z: zBack },  along: Z, length: flue.d },
    { key: 'rh:flue_front', origin: { x: r2(cx0 - T), z: zFront }, along: X, length: r2(flue.w + 2 * T) },
  ]
  for (const e of edges) {
    const across = e.along === Z ? X : Z
    seam(RH_SEAMS.shelf, e.key, shelfId, {
      origin: { ...e.origin, y: y0 }, along: e.along, across, toward: { x: 0, y: 1, z: 0 }, length: e.length, width: T,
      // Bored down from the shelf's top face (a through hole, same hole): bored up
      // from below the optimiser mirrors the holes for a turned-over part but not
      // the notched outline, putting them at the wrong end (RHK6542-R4).
      bore_b: { axis: 'y-', at: y0 },   // y0 = the shelf's top face
    })
    seam(RH_SEAMS.top, e.key, top.key, {
      origin: { ...e.origin, y: y1 }, along: e.along, across, toward: { x: 0, y: -1, z: 0 }, length: e.length, width: T,
      bore_b: { axis: 'y-', at: r2(top.Y + top.DZ) },
    })
  }
  // Front piece → each side's front edge: up the height, bored back from its front face.
  for (const [key, x] of [['rh:flue_l', r2(cx0 - T)], ['rh:flue_r', cx1]] as const) {
    seam(RH_SEAMS.front, key, 'rh:flue_front', {
      origin: { x, y: y0, z: zFront }, along: { x: 0, y: 1, z: 0 }, across: X, toward: { x: 0, y: 0, z: -1 }, length: H, width: T,
    })
  }
}

/** Clearance each side of the flue box where it passes up through a rib (C9). */
export const RH_RIB_CLEAR = 1

/**
 * Rangehood on a curved end (WCRVFIXP, z_curved_end C9). Its formers are case
 * parts in the horizontal frame (x across from X, y back from the front edge at
 * Z + DX): the hole goes in `crv:bottom`, the flue notch in the rib at the
 * shelf height and `crv:top`, and every rib above the shelf is notched round
 * the flue box (box outside + RH_RIB_CLEAR) so the box runs shelf → top.
 */
function resolveCurvedRangehood(
  cab: CabinetInput, caseParts: ResolvedCasePart[], out: RangehoodResult,
  warn: (m: string) => void, add: (id: string, c: Cutout) => void,
): RangehoodResult {
  const rh = cab.rangehood!
  const T = cab.material.DZ, FT = cab.exposed_material.DZ
  const { x0: ix0, x1: ix1 } = curvedEndInterior(cab)
  const centre = (ix0 + ix1) / 2
  const bottom = caseParts.find(p => p.part_key === 'crv:bottom')
  const top = caseParts.find(p => p.part_key === 'crv:top')
  const ribs = caseParts.filter(p => /^crv:rib_\d+$/.test(p.part_key)).sort((a, b) => a.Y - b.Y)
  const front = (p: ResolvedCasePart) => p.Z + p.DX   // a former's front edge (frame y 0)

  // ── Hole through the bottom former ─────────────────────────────
  const { hole } = rh
  if (hole.w == null || hole.d == null) warn('the hole size isn’t set yet — no hole cut (set it in the sidebar)')
  else if (bottom) {
    const x0 = curvedRangehoodHoleX(cab)!.x0, z1 = r2(cab.DZ - FT - hole.setback), z0 = r2(z1 - hole.d)
    const fx = r2(x0 - bottom.X), fy = r2(front(bottom) - z1)
    if (!rectInOutline(bottom.outline, fx, fy, fx + hole.w, fy + hole.d)) warn('the hole runs past the bottom former (into the curve or the back) — no hole cut')
    else {
      out.hole = { x0, x1: r2(x0 + hole.w), z0, z1 }
      add('case_crv:bottom', {
        id: 'rh_hole', kind: 'hole', shape: 'rect', w: hole.w, d: hole.d, radius: hole.radius, depth: null, source: 'rangehood',
        x: { from: 'left', off: fx }, y: { from: 'front', off: fy },
      })
    }
  }

  // ── Flue: the shelf rib + the top former ───────────────────────
  const shelf = ribs.length ? ribs.reduce((a, b) => Math.abs(b.Y - rh.shelf_h) < Math.abs(a.Y - rh.shelf_h) ? b : a) : null
  if (!shelf || Math.abs(shelf.Y - rh.shelf_h) > 0.5) { warn(`no rib at the shelf height ${rh.shelf_h} — check the curved end’s height and scribes`); return out }
  if (!top) { warn('no top former for the flue to go through'); return out }
  const { flue } = rh
  const cx0 = r2(centre - flue.w / 2 + flue.offset), cx1 = r2(cx0 + flue.w)
  const zBack = shelf.Z, zFront = r2(shelf.Z + flue.d)
  const y0 = r2(shelf.Y + shelf.DZ), y1 = top.Y, H = r2(y1 - y0)
  if (cx0 - T < ix0 - 0.5 || cx1 + T > ix1 + 0.5) { warn(`the flue box (${flue.w} + 2 × ${T}) doesn’t fit across the inside`); return out }
  // Box outside (+ clearance) must sit on the formers' straight back, clear of the curve and the fixing blocks.
  const C = RH_RIB_CLEAR
  const bx0 = r2(cx0 - T - C), bx1 = r2(cx1 + T + C), bd = r2(flue.d + T + C)
  if (!rectInOutline(shelf.outline, bx0 - shelf.X, shelf.DX - bd, bx1 - shelf.X, shelf.DX)) {
    warn(`the flue box (${flue.d} + ${T} deep) runs into the curve or a fixing block`); return out
  }
  if (!(H > 0)) { warn('no room between the shelf and the top for the flue box'); return out }

  const notch = (id: string, part: ResolvedCasePart, x: number, w: number, d: number): Cutout => ({
    id, kind: 'notch', shape: 'rect', w, d, edge: 'back', source: 'rangehood',
    x: { from: 'left', off: r2(x - part.X) }, y: { from: 'back', off: 0 },
  })
  add(`case_${shelf.part_key}`, notch('rh_flue', shelf, cx0, flue.w, flue.d))
  add('case_crv:top', notch('rh_flue', top, cx0, flue.w, r2(zFront - top.Z)))
  for (const rib of ribs.filter(p => p.Y > shelf.Y + 0.5)) add(`case_${rib.part_key}`, notch('rh_flue_box', rib, bx0, r2(bx1 - bx0), bd))

  flueBox(cab, out, { cx0, cx1, zBack, zFront, y0, y1, H, T }, { key: shelf.part_key, Y: shelf.Y }, { key: 'crv:top', Y: top.Y, DZ: top.DZ })

  // Each box piece screwed into every rib it passes (Mark, 2026-11-05): one
  // hole centred along the piece, mid the rib's thickness, bored through the
  // piece from inside the box (part B = the piece, part A = the rib's notch edge).
  const UP = { x: 0, y: 1, z: 0 }, AX = { x: 1, y: 0, z: 0 }, AZ = { x: 0, y: 0, z: 1 }
  for (const rib of ribs.filter(p => p.Y > shelf.Y + 0.5 && p.Y < top.Y - 0.5)) {
    const pieces = [
      { key: 'rh:flue_l',     origin: { x: r2(cx0 - T), z: zBack },        along: AZ, length: flue.d,             toward: { x: -1, y: 0, z: 0 } },
      { key: 'rh:flue_r',     origin: { x: r2(cx1 + T), z: zBack },        along: AZ, length: flue.d,             toward: AX },
      { key: 'rh:flue_front', origin: { x: r2(cx0 - T), z: r2(zFront + T) }, along: AX, length: r2(flue.w + 2 * T), toward: AZ },
    ]
    for (const pc of pieces) out.seams.push({
      seam_key: `${rib.part_key}|${pc.key}`, generic_key: RH_SEAMS.rib, part_a_key: rib.part_key, part_b_key: pc.key,
      geom: { origin: { ...pc.origin, y: rib.Y }, along: pc.along, across: UP, toward: pc.toward, length: pc.length, width: rib.DZ },
    })
  }
  return out
}
