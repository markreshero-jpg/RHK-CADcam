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
import type { OutlinePt } from '../shapePath'
import { calcCurvedEnd, curvedEndParts, type CurvedEndGeometry, type CurvedEndPart } from '../curvedEnd/geometry'
import { curvedEndParams } from '../curvedEnd/settings'

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
  return { ...NO_BAND, ...(grain === 'vertical' ? { bottom: true } : { left: true }), id }
}

export function resolveCurvedEnd(cab: CabinetInput): { parts: ResolvedCasePart[]; seams: DeclaredSeam[]; errors: ResolverError[]; warnings: ResolverError[] } {
  const s = cab.curved_end
  if (!s) return { parts: [], seams: [], errors: [], warnings: [] }
  const FT = cab.exposed_material.DZ, T = cab.material.DZ
  const c = calcCurvedEnd(curvedEndParams(s, cab, FT, T))
  const errors: ResolverError[] = c.warnings.map(m => ({ code: 'CURVED_END', message: m, part: 'case' }))
  const warnings: ResolverError[] = c.notes.map(m => ({ code: 'CURVED_END_NOTE', message: m, part: 'case' }))
  return {
    parts: curvedEndCaseParts(c, cab.exposed_material.id, cab.material.id, s.grain, cab.exposed_edgeband_id),
    seams: curvedEndSeams(c), errors, warnings,
  }
}

/** Engine geometry → cabinet-frame case parts. Pure (tested without a DB). */
export function curvedEndCaseParts(
  c: CurvedEndGeometry, faceMat: string, carcassMat: string, grain: 'vertical' | 'horizontal' = 'vertical', faceEb?: string,
): ResolvedCasePart[] {
  const { W, D, H, T, FT, SK } = c.p
  const lh = c.p.hand === 'LH'
  const X = (x: number) => (lh ? W - x : x)
  const out: ResolvedCasePart[] = []

  // Upright panel from its kit plan rect + which face is outside, turned so
  // local z = 0 is that face (see the header).
  const upright = (key: ResolvedCasePart['part_key'], x0: number, x1: number, d0: number, d1: number,
    outer: '-x' | '+x' | '-d' | '+d') => {
    let xa = X(x0), xb = X(x1)
    if (xa > xb) [xa, xb] = [xb, xa]
    const ox = lh && (outer === '-x' || outer === '+x') ? (outer === '-x' ? '+x' : '-x') : outer
    const za = D - d1, zb = D - d0
    const t = { X: 0, Z: 0, AY: 0, len: 0 }
    if (ox === '-x')      Object.assign(t, { AY: 90,  X: xa, Z: zb, len: zb - za })
    else if (ox === '+x') Object.assign(t, { AY: -90, X: xb, Z: za, len: zb - za })
    else if (ox === '-d') Object.assign(t, { AY: 180, X: xb, Z: zb, len: xb - xa })   // outer = the front (+Z)
    else                  Object.assign(t, { AY: 0,   X: xa, Z: za, len: xb - xa })   // outer = the wall side (−Z)
    out.push({
      part_key: key, DX: c.Hc, DY: t.len, DZ: T, X: t.X, Y: c.y0, Z: t.Z, AX: 0, AY: t.AY, AZ: 0,
      material_id: carcassMat, edge_band: { ...NO_BAND },
    })
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
  upright('crv:back', c.backX0, c.backX0 + c.backW, c.Dc - T, c.Dc, '+d')
  for (const k of c.blocks) {
    const outer = k.face === 'front' ? '-d' : k.dir === 1 ? '+x' : '-x'
    upright(curvedEndPartKey(k.name), k.x0, k.x1, k.d0, k.d1, outer)
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

  for (const f of formers) {
    if (!c.double) add(CRV_SEAMS.fixFormer, f.key, 'crv:fix', {
      origin: P(T, FT, f.y), along: V(0, 1, 0), across: UP, toward: V(1, 0, 0), length: c.Dc - T - FT, width: T,
    })
    add(CRV_SEAMS.backFormer, f.key, 'crv:back', {
      origin: P(c.backX0, c.Dc - T, f.y), along: V(1, 0, 0), across: UP, toward: V(0, -1, 0), length: c.backW, width: T,
    })
  }
  if (!c.double) add(CRV_SEAMS.fixBack, 'crv:back', 'crv:fix', {
    origin: P(T, c.Dc, c.y0), along: UP, across: V(0, -1, 0), toward: V(1, 0, 0), length: c.Hc, width: T,
  })

  for (const k of c.blocks) {
    const key = curvedEndPartKey(k.name)
    if (k.face === 'side') {
      // outer face against the face board's flat side; inner face in the formers' notches
      const outerX = k.dir === 1 ? k.x1 : k.x0, innerX = k.dir === 1 ? k.x0 : k.x1
      add(CRV_SEAMS.blockFace, 'crv:face', key, {
        origin: P(outerX, k.d0, c.y0), along: UP, across: V(0, 1, 0), toward: V(k.dir, 0, 0), length: c.Hc, width: k.wb,
      })
      for (const f of formers) add(CRV_SEAMS.blockFormer, f.key, key, {
        origin: P(innerX, k.d0, f.y), along: V(0, 1, 0), across: UP, toward: V(-k.dir, 0, 0), length: k.wb, width: T,
      })
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
  faceThickness: number, carcassThickness: number,
): DeclaredSeam[] {
  return curvedEndSeams(calcCurvedEnd(curvedEndParams(s, box, faceThickness, carcassThickness)))
}

/** Display name of a curved-end part key, e.g. "Rib 2", "Face Board". */
export function curvedEndPartLabel(key: string): string | null {
  if (!key.startsWith('crv:')) return null
  const k = key.slice(4)
  const rib = /^rib_(\d+)$/.exec(k)
  if (rib) return `Curved End Rib ${rib[1]}`
  return ({
    face: 'Curved Face Board', fix: 'Curved End Fixing Panel', back: 'Curved End Back',
    top: 'Curved End Top', bottom: 'Curved End Bottom',
    blk_side: 'Curved End Fixing Block (side)', blk_side_l: 'Curved End Fixing Block (left)',
    blk_side_r: 'Curved End Fixing Block (right)', blk_front: 'Curved End Fixing Block (front)',
  } as Record<string, string>)[k] ?? null
}

