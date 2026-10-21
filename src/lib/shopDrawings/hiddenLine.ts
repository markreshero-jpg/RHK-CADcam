// Vector hidden-line capture of a three.js scene (z_shop_drawings S8).
// 1. Render eye-space depth of every solid mesh into a float target.
// 2. Pick each mesh's FEATURE edges, the way an illustrator would draw it:
//    boundaries, sharp creases, and silhouettes (where the surface turns away
//    from the camera). Smooth / curved models (appliances, taps, handles) then
//    print as their true outline + main creases, not their triangle mesh.
//    Heavy meshes use a higher crease angle and drop tiny crease fragments.
// 3. Walk each edge in ~1.5px steps and keep the runs the depth buffer says are
//    visible. Output is 2D line segments in render-target pixels (y down),
//    ready to become SVG lines → crisp vector PDF output.
import {
  Color, DoubleSide, FloatType, Matrix4, Mesh, NearestFilter, Object3D,
  PerspectiveCamera, RGBAFormat, Scene, ShaderMaterial, Vector3, WebGLRenderTarget, WebGLRenderer,
  type BufferGeometry, type Material,
} from 'three'

export interface HiddenLineResult {
  /** Flat [x0, y0, x1, y1, ...] in pixels, y down. */
  segs: number[]
  width: number
  height: number
}

export interface HiddenLineOptions {
  width?: number
  height?: number
  /** Crease angle (deg) above which a shared edge is drawn. */
  creaseDeg?: number
  /** Crease angle for heavy (detailed) meshes. */
  heavyCreaseDeg?: number
  /** Meshes with more triangles than this count as heavy. */
  heavyTris?: number
}

const DEPTH_VS = `
varying float vViewZ;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}`
const DEPTH_FS = `
varying float vViewZ;
void main() { gl_FragColor = vec4(vViewZ, 0.0, 0.0, 1.0); }`

/** Mesh-based line objects (drei <Edges> / Line2 "fat lines") — not surfaces. */
function isLineMesh(m: Mesh): boolean {
  const g = m.geometry as BufferGeometry & { isInstancedBufferGeometry?: boolean; isLineSegmentsGeometry?: boolean }
  const mats = (Array.isArray(m.material) ? m.material : [m.material]) as Material[]
  return !!(m as unknown as { isLineSegments2?: boolean; isLine2?: boolean }).isLineSegments2
    || !!(m as unknown as { isLine2?: boolean }).isLine2
    || !!g.isLineSegmentsGeometry || !!g.isInstancedBufferGeometry
    || mats.some(x => x.type === 'LineMaterial')
}

/** Solid, visible meshes that should both occlude and draw. */
function solidMeshes(scene: Scene): Mesh[] {
  const out: Mesh[] = []
  scene.traverseVisible(o => {
    const m = o as Mesh
    if (!m.isMesh || !m.geometry?.getAttribute('position') || isLineMesh(m)) return
    const mats = (Array.isArray(m.material) ? m.material : [m.material]) as Material[]
    // Ghosted (see-through) layer items neither hide nor draw.
    if (mats.every(x => !x.visible || (x.transparent && x.opacity < 0.5))) return
    out.push(m)
  })
  return out
}

// ── Edge topology (cached per geometry) ──────────────────────────────────────
// Vertices are welded by position (models split them at UV / normal seams), then
// each unique edge records its one or two faces and the dihedral between them.
interface Topo {
  pos: Float32Array        // welded vertex positions
  ea: Int32Array; eb: Int32Array   // edge vertex ids
  fa: Int32Array; fb: Int32Array   // face ids (fb = -1 → boundary)
  cosDihedral: Float32Array        // cos of the angle between the face normals
  fn: Float32Array         // face normals
  fp: Float32Array         // a point on each face
  tris: number
}
const topoCache = new WeakMap<BufferGeometry, Topo>()

function topology(g: BufferGeometry): Topo {
  const hit = topoCache.get(g)
  if (hit) return hit
  const P = g.getAttribute('position')
  const idx = g.index
  const triCount = Math.floor((idx ? idx.count : P.count) / 3)
  // Weld by quantised position.
  const weld = new Map<string, number>()
  const remap = new Int32Array(P.count)
  const pos: number[] = []
  g.computeBoundingBox()
  const size = g.boundingBox!.getSize(new Vector3()).length()
  const q = Math.max(size * 1e-6, 1e-5)
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i)
    const k = `${Math.round(x / q)},${Math.round(y / q)},${Math.round(z / q)}`
    let id = weld.get(k)
    if (id === undefined) { id = pos.length / 3; weld.set(k, id); pos.push(x, y, z) }
    remap[i] = id
  }
  const fn = new Float32Array(triCount * 3), fp = new Float32Array(triCount * 3)
  const edgeMap = new Map<number, number>()   // key → edge index
  const ea: number[] = [], eb: number[] = [], fa: number[] = [], fb: number[] = []
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3(), t = new Vector3()
  const nV = pos.length / 3
  for (let f = 0; f < triCount; f++) {
    const i0 = remap[idx ? idx.getX(f * 3) : f * 3], i1 = remap[idx ? idx.getX(f * 3 + 1) : f * 3 + 1], i2 = remap[idx ? idx.getX(f * 3 + 2) : f * 3 + 2]
    a.fromArray(pos, i0 * 3); b.fromArray(pos, i1 * 3); c.fromArray(pos, i2 * 3)
    n.subVectors(c, b).cross(t.subVectors(a, b))
    if (n.lengthSq() < 1e-20) continue   // degenerate
    n.normalize()
    fn.set([n.x, n.y, n.z], f * 3); fp.set([a.x, a.y, a.z], f * 3)
    for (const [u, v] of [[i0, i1], [i1, i2], [i2, i0]]) {
      const lo = Math.min(u, v), hi = Math.max(u, v)
      const key = lo * nV + hi
      const e = edgeMap.get(key)
      if (e === undefined) { edgeMap.set(key, ea.length); ea.push(lo); eb.push(hi); fa.push(f); fb.push(-1) }
      else if (fb[e] === -1) fb[e] = f
    }
  }
  const cosD = new Float32Array(ea.length)
  for (let e = 0; e < ea.length; e++) {
    cosD[e] = fb[e] < 0 ? -1 : fn[fa[e] * 3] * fn[fb[e] * 3] + fn[fa[e] * 3 + 1] * fn[fb[e] * 3 + 1] + fn[fa[e] * 3 + 2] * fn[fb[e] * 3 + 2]
  }
  const topo: Topo = {
    pos: new Float32Array(pos), ea: Int32Array.from(ea), eb: Int32Array.from(eb),
    fa: Int32Array.from(fa), fb: Int32Array.from(fb), cosDihedral: cosD, fn, fp, tris: triCount,
  }
  topoCache.set(g, topo)
  return topo
}

/** Which side of face f the (local-space) eye is on. */
function facesEye(t: Topo, f: number, ex: number, ey: number, ez: number): boolean {
  const i = f * 3
  return t.fn[i] * (ex - t.fp[i]) + t.fn[i + 1] * (ey - t.fp[i + 1]) + t.fn[i + 2] * (ez - t.fp[i + 2]) > 0
}

export function captureHiddenLines(gl: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, opts: HiddenLineOptions = {}): HiddenLineResult {
  const W = opts.width ?? 2400, H = opts.height ?? 1800
  const heavyTris = opts.heavyTris ?? 1500
  const cosCrease = Math.cos((opts.creaseDeg ?? 25) * Math.PI / 180)
  const cosCreaseHeavy = Math.cos((opts.heavyCreaseDeg ?? 50) * Math.PI / 180)
  scene.updateMatrixWorld(true)
  const meshes = solidMeshes(scene)

  // Tight near / far for this shot (the live view's 10 → 500000 would waste precision).
  camera.aspect = W / H
  camera.updateMatrixWorld()
  const view = camera.matrixWorldInverse
  let zMin = Infinity, zMax = 0
  const v = new Vector3()
  for (const m of meshes) {
    m.geometry.computeBoundingSphere()
    const bs = m.geometry.boundingSphere!
    v.copy(bs.center).applyMatrix4(m.matrixWorld).applyMatrix4(view)
    const r = bs.radius * m.matrixWorld.getMaxScaleOnAxis()
    zMin = Math.min(zMin, -v.z - r)
    zMax = Math.max(zMax, -v.z + r)
  }
  const near0 = camera.near, far0 = camera.far
  camera.near = Math.max(1, zMin * 0.9)
  camera.far = Math.max(camera.near + 1, zMax * 1.1)
  camera.updateProjectionMatrix()

  // ── 1. Depth pass (only the solid meshes) ──────────────────────────────────
  const rt = new WebGLRenderTarget(W, H, { type: FloatType, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter })
  const depthMat = new ShaderMaterial({ vertexShader: DEPTH_VS, fragmentShader: DEPTH_FS, side: DoubleSide })
  const keep = new Set<Object3D>(meshes)
  const hidden: Object3D[] = []
  // Hide every other drawable leaf (ghosted meshes, text, edge lines) — never groups.
  scene.traverse(o => {
    const drawable = (o as Mesh).isMesh || o.type === 'LineSegments' || o.type === 'Line' || o.type === 'LineLoop' || o.type === 'Points' || o.type === 'Sprite'
    if (drawable && o.visible && !keep.has(o)) { o.visible = false; hidden.push(o) }
  })
  const prevOverride = scene.overrideMaterial, prevBg = scene.background
  const prevTarget = gl.getRenderTarget()
  const prevClear = gl.getClearColor(new Color()), prevAlpha = gl.getClearAlpha()
  scene.overrideMaterial = depthMat
  scene.background = null
  gl.setRenderTarget(rt)
  gl.setClearColor(0x000000, 0)
  gl.clear()
  gl.render(scene, camera)
  const buf = new Float32Array(W * H * 4)
  gl.readRenderTargetPixels(rt, 0, 0, W, H, buf)
  gl.setRenderTarget(prevTarget)
  gl.setClearColor(prevClear, prevAlpha)
  scene.overrideMaterial = prevOverride
  scene.background = prevBg
  for (const o of hidden) o.visible = true
  rt.dispose()
  depthMat.dispose()

  // Eye depth at a pixel (row 0 = top). 0 in the buffer = nothing there.
  const depthAt = (px: number, py: number) => {
    if (px < 0 || py < 0 || px >= W || py >= H) return Infinity
    const d = buf[((H - 1 - py) * W + px) * 4]
    return d > 0 ? d : Infinity
  }

  // ── 2 + 3. Feature edges, sampled against the depth buffer ──────────────────
  const proj = new Matrix4().multiplyMatrices(camera.projectionMatrix, view)
  const segs: number[] = []
  const a = new Vector3(), b = new Vector3(), p = new Vector3(), s = new Vector3()
  const sa = new Vector3(), sb = new Vector3()
  const eyeL = new Vector3(), inv = new Matrix4()
  const toScreen = (w: Vector3, out: Vector3) => {
    out.copy(w).applyMatrix4(proj)   // NDC (applyMatrix4 divides by w)
    out.set((out.x + 1) * 0.5 * W, (1 - out.y) * 0.5 * H, out.z)
    return out
  }
  const eyeDepth = (w: Vector3) => -(p.copy(w).applyMatrix4(view).z)

  for (const m of meshes) {
    const t = topology(m.geometry)
    const heavy = t.tris > heavyTris
    const cosC = heavy ? cosCreaseHeavy : cosCrease
    // Eye in the mesh's own space — silhouette tests stay valid under its transform.
    eyeL.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inv.copy(m.matrixWorld).invert())
    for (let e = 0; e < t.ea.length; e++) {
      const boundary = t.fb[e] < 0
      const crease = !boundary && t.cosDihedral[e] < cosC
      const silhouette = !boundary && !crease
        && facesEye(t, t.fa[e], eyeL.x, eyeL.y, eyeL.z) !== facesEye(t, t.fb[e], eyeL.x, eyeL.y, eyeL.z)
      if (!boundary && !crease && !silhouette) continue
      a.fromArray(t.pos, t.ea[e] * 3).applyMatrix4(m.matrixWorld)
      b.fromArray(t.pos, t.eb[e] * 3).applyMatrix4(m.matrixWorld)
      if (eyeDepth(a) < camera.near || eyeDepth(b) < camera.near) continue
      toScreen(a, sa); toScreen(b, sb)
      const len = Math.hypot(sb.x - sa.x, sb.y - sa.y)
      // Detailed models: tiny crease fragments are noise at print size; outlines stay.
      if (len < (heavy && !silhouette ? 2 : 0.5)) continue
      const n = Math.max(2, Math.ceil(len / 1.5) + 1)
      // A run survives up to MAX_GAP hidden samples (grazing-angle flicker). A
      // piece cut short by occlusion is dropped under MIN_RUN px (specks peeking
      // past an occluder); a fully visible edge is always kept, however short —
      // curved silhouettes are chains of short edges.
      const MAX_GAP = 2, MIN_RUN = 2
      let open = false, miss = 0, lastX = 0, lastY = 0, firstX = 0, firstY = 0, startK = 0, endK = 0
      const close = () => {
        const whole = startK === 0 && endK === n - 1
        if (whole || Math.hypot(lastX - firstX, lastY - firstY) >= MIN_RUN) segs.push(firstX, firstY, lastX, lastY)
        open = false
      }
      for (let k = 0; k < n; k++) {
        const w = s.copy(a).lerp(b, k / (n - 1))
        const z = eyeDepth(w)
        const sp = toScreen(w, p)
        const x = sp.x, y = sp.y
        const ix = Math.floor(x), iy = Math.floor(y)
        // Visible if any pixel around the sample is at (or behind) the edge: the edge
        // sits on its own faces; an occluder covers the whole neighbourhood. The
        // tolerance is a few mm, so parts just behind a front (drawer boxes, carcase
        // edges behind an 18mm front) stay hidden.
        const tol = 1 + z * 0.0004
        let vis = ix >= 0 && iy >= 0 && ix < W && iy < H
        if (vis) {
          vis = false
          for (let dy = -1; dy <= 1 && !vis; dy++) for (let dx = -1; dx <= 1 && !vis; dx++) {
            if (depthAt(ix + dx, iy + dy) >= z - tol) vis = true
          }
        }
        if (vis) {
          if (!open) { open = true; firstX = x; firstY = y; startK = k }
          lastX = x; lastY = y; endK = k
          miss = 0
        } else if (open && ++miss > MAX_GAP) close()
      }
      if (open) close()
    }
  }

  camera.near = near0
  camera.far = far0
  camera.updateProjectionMatrix()
  return { segs, width: W, height: H }
}
