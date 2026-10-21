// Vector hidden-line capture of a three.js scene (z_shop_drawings S8).
// 1. Render eye-space depth of every solid mesh into a float target.
// 2. Take each mesh's crease edges (EdgesGeometry) in world space — very
//    heavy meshes (appliance / fixture models) are swapped for a bounding-box
//    stand-in for the whole capture, so they print as clean outlines.
// 3. Walk each edge in ~1px steps and keep the runs the depth buffer says are
//    visible. Output is 2D line segments in render-target pixels (y down),
//    ready to become SVG lines → crisp vector PDF output.
import {
  BoxGeometry, Color, DoubleSide, EdgesGeometry, FloatType, Matrix4, Mesh, NearestFilter, Object3D,
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
  /** Crease angle (deg) below which a shared edge isn't drawn. */
  creaseDeg?: number
  /** Meshes with more triangles than this draw as their bounding box. */
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

/** Solid, visible meshes that should both occlude and draw. */
function solidMeshes(scene: Scene): Mesh[] {
  const out: Mesh[] = []
  scene.traverseVisible(o => {
    const m = o as Mesh
    if (!m.isMesh || !m.geometry) return
    const mats = (Array.isArray(m.material) ? m.material : [m.material]) as Material[]
    // Ghosted (see-through) layer items neither hide nor draw.
    if (mats.every(x => !x.visible || (x.transparent && x.opacity < 0.5))) return
    out.push(m)
  })
  return out
}

function triCount(g: BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position')?.count ?? 0) / 3
}

const edgeCache = new WeakMap<BufferGeometry, Float32Array>()

/** Local-space edge positions for a mesh (cached per geometry). */
function localEdges(g: BufferGeometry, creaseDeg: number): Float32Array {
  let e = edgeCache.get(g)
  if (!e) {
    e = new EdgesGeometry(g, creaseDeg).getAttribute('position').array as Float32Array
    edgeCache.set(g, e)
  }
  return e
}

/** A box stand-in for a heavy mesh, in the same world place — it both draws and occludes as the box. */
function boxProxy(m: Mesh): Mesh {
  m.geometry.computeBoundingBox()
  const b = m.geometry.boundingBox!
  const size = b.getSize(new Vector3()), c = b.getCenter(new Vector3())
  const g = new BoxGeometry(Math.max(size.x, 0.01), Math.max(size.y, 0.01), Math.max(size.z, 0.01))
  g.translate(c.x, c.y, c.z)
  const p = new Mesh(g)
  p.matrixAutoUpdate = false
  p.matrix.copy(m.matrixWorld)   // added at the scene root, so matrix = world
  return p
}

export function captureHiddenLines(gl: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, opts: HiddenLineOptions = {}): HiddenLineResult {
  const W = opts.width ?? 2400, H = opts.height ?? 1800
  // Heavy meshes (appliance / fixture models) are swapped for their bounding box,
  // so they print as a clean outline rather than a smudge of tiny edges.
  const proxies: Mesh[] = []
  const meshes = solidMeshes(scene).map(m => {
    if (triCount(m.geometry) <= (opts.heavyTris ?? 1500)) return m
    const p = boxProxy(m)
    scene.add(p)
    proxies.push(p)
    return p
  })
  scene.updateMatrixWorld(true)

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

  // ── 2 + 3. Edges, sampled against the depth buffer ─────────────────────────
  const proj = new Matrix4().multiplyMatrices(camera.projectionMatrix, view)
  const segs: number[] = []
  const a = new Vector3(), b = new Vector3(), p = new Vector3(), s = new Vector3()
  const toScreen = (w: Vector3, out: Vector3) => {
    out.copy(w).applyMatrix4(proj)   // NDC (applyMatrix4 divides by w)
    out.set((out.x + 1) * 0.5 * W, (1 - out.y) * 0.5 * H, out.z)
    return out
  }
  const eyeDepth = (w: Vector3) => -(p.copy(w).applyMatrix4(view).z)

  for (const m of meshes) {
    const e = localEdges(m.geometry, opts.creaseDeg ?? 25)
    for (let i = 0; i < e.length; i += 6) {
      a.set(e[i], e[i + 1], e[i + 2]).applyMatrix4(m.matrixWorld)
      b.set(e[i + 3], e[i + 4], e[i + 5]).applyMatrix4(m.matrixWorld)
      if (eyeDepth(a) < camera.near || eyeDepth(b) < camera.near) continue
      const sa = toScreen(a, new Vector3()), sb = toScreen(b, new Vector3())
      const len = Math.hypot(sb.x - sa.x, sb.y - sa.y)
      if (len < 0.5) continue
      const n = Math.max(2, Math.ceil(len / 1.5) + 1)
      let runStart = -1, lastX = 0, lastY = 0, firstX = 0, firstY = 0
      for (let k = 0; k < n; k++) {
        const t = k / (n - 1)
        const w = s.copy(a).lerp(b, t)
        const z = eyeDepth(w)
        const sp = toScreen(w, p)
        const x = sp.x, y = sp.y
        const ix = Math.floor(x), iy = Math.floor(y)
        // Visible if any pixel around the sample is at (or behind) the edge: the
        // edge sits on its own faces; an occluder covers the whole neighbourhood.
        const tol = z * 0.004 + 2
        let vis = false
        for (let dy = -1; dy <= 1 && !vis; dy++) for (let dx = -1; dx <= 1 && !vis; dx++) {
          if (depthAt(ix + dx, iy + dy) >= z - tol) vis = true
        }
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) vis = false
        if (vis) {
          if (runStart < 0) { runStart = k; firstX = x; firstY = y }
          lastX = x; lastY = y
        }
        if ((!vis || k === n - 1) && runStart >= 0) {
          if (Math.hypot(lastX - firstX, lastY - firstY) >= 1) segs.push(firstX, firstY, lastX, lastY)
          runStart = -1
        }
      }
    }
  }

  for (const p of proxies) { scene.remove(p); p.geometry.dispose() }
  camera.near = near0
  camera.far = far0
  camera.updateProjectionMatrix()
  return { segs, width: W, height: H }
}
