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
      bore_b: { axis: 'y+', at: shelf.Y },
    })
    seam(RH_SEAMS.top, e.key, 'full_top', {
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
  return out
}
