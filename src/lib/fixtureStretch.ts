// ── Resizable fixture models (z_fixtures P11) ─────────────────────────────────
// A model can carry a "stretch" spec in its GLB scene extras: per native axis,
// the nominal length and the bands that absorb a size change. Extra length is
// shared equally between an axis's bands; points past a band shift by that
// band's share, points inside it are spread linearly; then re-centred. Rigid
// nodes (sink clips) are moved, never stretched.
//
// The same map drives the 3D model, the plan / elevation shapes (stored at the
// nominal size) and the benchtop cutout, so they all follow the stretch.
// Model units are native (metres for these GLBs); "box" = item-box mm.

import * as THREE from 'three'

export interface StretchAxis {
  nominal: number
  bands:   [number, number][]
  min?:    number
}

export interface StretchSpec {
  version:      number
  axes:         { x?: StretchAxis; z?: StretchAxis }
  recentre?:    boolean
  rigid_nodes?: string[]
}

/** The spec from a model's scene extras / a DB row, or null when it isn't one. */
export function readStretchSpec(raw: unknown): StretchSpec | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Partial<StretchSpec>
  if (!s.axes || typeof s.axes !== 'object') return null
  const ok = (a?: StretchAxis) => !a || (a.nominal > 0 && Array.isArray(a.bands)
    && a.bands.every(b => Array.isArray(b) && b.length === 2 && b[1] > b[0]))
  if (!ok(s.axes.x) || !ok(s.axes.z) || (!s.axes.x && !s.axes.z)) return null
  return {
    version: Number(s.version) || 1,
    axes: { x: s.axes.x, z: s.axes.z },
    recentre: s.recentre !== false,
    rigid_nodes: Array.isArray(s.rigid_nodes) ? s.rigid_nodes : [],
  }
}

/** Forward (nominal → stretched) and inverse map along one axis, in model units. */
export interface AxisMap { fwd: (c: number) => number; inv: (c: number) => number }

const IDENTITY: AxisMap = { fwd: c => c, inv: c => c }

export function axisMap(ax: StretchAxis | undefined, target: number, recentre = true): AxisMap {
  if (!ax || !ax.bands.length || !(target > 0)) return IDENTITY
  const t = Math.max(target, ax.min ?? 0)
  const share = (t - ax.nominal) / ax.bands.length
  const raw = (c: number) => {
    let o = 0
    for (const [b0, b1] of ax.bands) {
      if (c >= b1) o += share
      else if (c > b0) o += share * (c - b0) / (b1 - b0)
    }
    return c + o
  }
  const shift = recentre ? (raw(-ax.nominal / 2) + raw(ax.nominal / 2)) / 2 : 0
  const fwd = (c: number) => raw(c) - shift
  // Piecewise linear + monotone: invert segment by segment between band edges.
  const knots = ax.bands.flat().sort((p, q) => p - q)
  const inv = (y: number) => {
    let prev = knots[0], fPrev = fwd(prev)
    if (y <= fPrev) return prev + (y - fPrev)          // slope 1 before the first band
    for (let i = 1; i < knots.length; i++) {
      const k = knots[i], fk = fwd(k)
      if (y <= fk) return fk > fPrev ? prev + (k - prev) * (y - fPrev) / (fk - fPrev) : prev
      prev = k; fPrev = fk
    }
    return prev + (y - fPrev)
  }
  return { fwd, inv }
}

// ── Box ↔ native axes ─────────────────────────────────────────────────────────

/** What a fixture needs to know to stretch. */
export interface StretchFit {
  resizable?:  boolean | null
  stretch?:    unknown
  width:       number
  depth:       number
  model_scale?: number | null
  model_rot_x?: number | null
  model_rot_y?: number | null
}

/** Native axis + sign behind each box axis, for rot_x 0 and rot_y in 90° steps; null otherwise. */
function boxAxes(f: Pick<StretchFit, 'model_rot_x' | 'model_rot_y'>): { u: ['x' | 'z', 1 | -1]; v: ['x' | 'z', 1 | -1] } | null {
  if (Math.abs(Number(f.model_rot_x) || 0) > 0.01) return null
  const q = ((Math.round((Number(f.model_rot_y) || 0) / 90) % 4) + 4) % 4
  if (Math.abs((Number(f.model_rot_y) || 0) - Math.round((Number(f.model_rot_y) || 0) / 90) * 90) > 0.01) return null
  // Rotation about Y by q·90°: box x / z in terms of native x / z.
  return [
    { u: ['x', 1], v: ['z', 1] },
    { u: ['z', 1], v: ['x', -1] },
    { u: ['x', -1], v: ['z', -1] },
    { u: ['z', -1], v: ['x', 1] },
  ][q] as { u: ['x' | 'z', 1 | -1]; v: ['x' | 'z', 1 | -1] }
}

/** The fixture's spec when it's resizable and can stretch at its rotation. */
export function activeStretch(f: StretchFit): StretchSpec | null {
  if (!f.resizable) return null
  const spec = readStretchSpec(f.stretch)
  return spec && boxAxes(f) ? spec : null
}

/** Native target lengths (model units) for the fixture's box size. */
export function nativeTargets(f: StretchFit): { x: number; z: number } | null {
  const ax = boxAxes(f)
  if (!ax) return null
  const s = Number(f.model_scale) || 1
  const t = { x: 0, z: 0 }
  t[ax.u[0]] = f.width / s
  t[ax.v[0]] = f.depth / s
  return t
}

/** Nominal box size (mm) of a spec'd model — the size its plan / elev shapes are traced at. */
export function nominalBox(f: StretchFit, spec: StretchSpec): { width: number; depth: number } {
  const ax = boxAxes(f)!
  const s = Number(f.model_scale) || 1
  const len = (k: 'x' | 'z', fallback: number) => spec.axes[k] ? spec.axes[k]!.nominal * s : fallback
  return { width: len(ax.u[0], f.width), depth: len(ax.v[0], f.depth) }
}

/**
 * Maps along the box's width (u) and depth (v) axes, in mm measured from the
 * box centre: nominal → this fixture's size. Null when it doesn't stretch.
 */
export function boxMaps(f: StretchFit): { u: AxisMap; v: AxisMap } | null {
  const spec = activeStretch(f)
  if (!spec) return null
  const ax = boxAxes(f)!
  const t = nativeTargets(f)!
  const s = Number(f.model_scale) || 1
  const one = ([k, sign]: ['x' | 'z', 1 | -1]): AxisMap => {
    const m = axisMap(spec.axes[k], t[k], spec.recentre !== false)
    return {
      fwd: mm => sign * m.fwd((sign * mm) / s) * s,
      inv: mm => sign * m.inv((sign * mm) / s) * s,
    }
  }
  return { u: one(ax.u), v: one(ax.v) }
}

// ── Shapes (plan / elevation) ─────────────────────────────────────────────────

type Shape = { v: 1; lines: [number, number][][] }

/** Plan shape (normalised over the nominal box) re-normalised over the stretched box. */
export function stretchedPlanShape<S extends Shape | null>(shape: S, f: StretchFit): S {
  if (!shape) return shape
  const maps = boxMaps(f)
  if (!maps) return shape
  const nom = nominalBox(f, activeStretch(f)!)
  const lines = shape.lines.map(l => l.map(([u, v]) => [
    (maps.u.fwd(u * nom.width - nom.width / 2) + f.width / 2) / f.width,
    (maps.v.fwd(v * nom.depth - nom.depth / 2) + f.depth / 2) / f.depth,
  ] as [number, number]))
  return { ...shape, lines } as S
}

/** Elevation shape: only the across axis (u) stretches; v (height) stays. */
export function stretchedElevShape<S extends Shape | null>(shape: S, f: StretchFit): S {
  if (!shape) return shape
  const maps = boxMaps(f)
  if (!maps) return shape
  const nom = nominalBox(f, activeStretch(f)!)
  const lines = shape.lines.map(l => l.map(([u, v]) => [
    (maps.u.fwd(u * nom.width - nom.width / 2) + f.width / 2) / f.width, v,
  ] as [number, number]))
  return { ...shape, lines } as S
}

// ── Cutout ────────────────────────────────────────────────────────────────────

export interface CutoutFields {
  cutout_shape: 'rect' | 'round' | null
  cutout_w: number; cutout_d: number
  cutout_off_x: number; cutout_off_y: number
}

/**
 * The cutout after a resize from `before` to `after` (same fixture): its edges
 * (rect) or centre (round) go back to the nominal size, then out to the new one.
 * Empty when nothing changes.
 */
export function stretchedCutout(before: StretchFit & CutoutFields, after: StretchFit): Partial<CutoutFields> {
  if (!before.cutout_shape || !(Number(before.cutout_w) > 0)) return {}
  const a = boxMaps(before), b = boxMaps(after)
  if (!a || !b) return {}
  const move = (m0: AxisMap, m1: AxisMap, x: number) => m1.fwd(m0.inv(x))
  const r1 = (x: number) => Math.round(x * 10) / 10
  const ox = Number(before.cutout_off_x) || 0, oy = Number(before.cutout_off_y) || 0
  if (before.cutout_shape === 'round') {
    return { cutout_off_x: r1(move(a.u, b.u, ox)), cutout_off_y: r1(move(a.v, b.v, oy)) }
  }
  const hw = Number(before.cutout_w) / 2, hd = (Number(before.cutout_d) || 0) / 2
  const u0 = move(a.u, b.u, ox - hw), u1 = move(a.u, b.u, ox + hw)
  const v0 = move(a.v, b.v, oy - hd), v1 = move(a.v, b.v, oy + hd)
  return {
    cutout_w: r1(u1 - u0), cutout_off_x: r1((u0 + u1) / 2),
    ...(hd > 0 ? { cutout_d: r1(v1 - v0), cutout_off_y: r1((v0 + v1) / 2) } : {}),
  }
}

// ── 3D ────────────────────────────────────────────────────────────────────────

/**
 * A copy of `obj` (native space) with its vertices stretched to `target`
 * (native lengths). Geometry is cloned per mesh; materials are shared with `obj`.
 * Rigid nodes keep their shape and move with the map at their centre.
 */
export function stretchObject(obj: THREE.Object3D, spec: StretchSpec, target: { x: number; z: number }): THREE.Object3D {
  const recentre = spec.recentre !== false
  const mx = axisMap(spec.axes.x, target.x, recentre)
  const mz = axisMap(spec.axes.z, target.z, recentre)
  const rigid = new Set(spec.rigid_nodes ?? [])

  const root = obj.clone(true)
  root.updateMatrixWorld(true)
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const v = new THREE.Vector3()

  const rigidRoots: THREE.Object3D[] = []
  const isUnderRigid = (o: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (rigid.has(p.name)) return p
    return null
  }

  root.traverse(o => {
    const rr = isUnderRigid(o)
    if (rr) { if (rr === o) rigidRoots.push(o); return }
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.geometry?.attributes?.position) return
    const local = new THREE.Matrix4().multiplyMatrices(toRoot, m.matrixWorld)
    const back = local.clone().invert()
    const geo = m.geometry.clone()
    const pos = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(local)
      v.set(mx.fwd(v.x), v.y, mz.fwd(v.z)).applyMatrix4(back)
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
    geo.computeBoundingBox(); geo.computeBoundingSphere()
    m.geometry = geo
  })

  for (const n of rigidRoots) {
    const box = new THREE.Box3().setFromObject(n).applyMatrix4(toRoot)
    if (box.isEmpty()) continue
    const c = box.getCenter(new THREE.Vector3())
    const to = new THREE.Vector3(mx.fwd(c.x), c.y, mz.fwd(c.z))
    // The move is in root space; take both ends into the node's parent space.
    const pInv = new THREE.Matrix4().multiplyMatrices(toRoot, n.parent!.matrixWorld).invert()
    n.position.add(to.applyMatrix4(pInv).sub(c.applyMatrix4(pInv)))
  }
  root.updateMatrixWorld(true)
  return root
}
