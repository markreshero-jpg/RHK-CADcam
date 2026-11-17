// z_html_export H5/H6: the 3D viewer used by both the downloaded HTML file and the
// hosted share link. Bundled with three.js into one classic script
// (public/share3d/viewer.js, built by scripts/build-share3d-viewer.mjs) so it
// needs no internet, no import maps and no module support: it runs in any
// browser that has WebGL, older Safari included.
//
// Page contract (see buildViewerHtml / app/share/3d/[token]/route.ts):
//   #glb-room   <script type="application/octet-stream"> with the GLB as base64, OR
//   window.SHARE3D = { glbUrl, view? }   (hosted link)
//   window.SHARE3D.view / #view-json = the camera the file opens at
//   #hud, #bar (#wire #doors #reset), #load
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

type View = { pos: number[]; target: number[] } | null
type Cfg = { glbUrl?: string; view?: View }

const $ = (id: string) => document.getElementById(id)
const say = (msg: string) => { const l = $('load'); if (l) { l.textContent = msg; l.classList.add('err') } }

function webglOk() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
}

async function getGlb(cfg: Cfg): Promise<ArrayBuffer> {
  const el = $('glb-room')
  if (el?.textContent?.trim()) {
    const b64 = el.textContent.trim()
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out.buffer
  }
  if (cfg.glbUrl) {
    const r = await fetch(cfg.glbUrl)
    if (!r.ok) throw new Error(r.status === 404 || r.status === 400 ? 'This link has expired or been removed.' : `Download failed (${r.status})`)
    return r.arrayBuffer()
  }
  throw new Error('No model in this file.')
}

async function start() {
  const cfg: Cfg = (window as unknown as { SHARE3D?: Cfg }).SHARE3D ?? {}
  let startView: View = cfg.view ?? null
  const vj = $('view-json')
  if (!startView && vj?.textContent?.trim()) { try { startView = JSON.parse(vj.textContent) } catch { /* ignore */ } }

  if (!webglOk()) { say('This browser or device can\'t show 3D (WebGL is off). Try Safari, Chrome or Edge on a computer or phone.'); return }

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  document.body.appendChild(renderer.domElement)
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xeef0f2)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.6))
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); scene.add(sun)
  const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-1.5, 1, -1); scene.add(fill)
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 1, 1e6)
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true

  let home: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null
  let root: THREE.Object3D | null = null
  const doorNodes: THREE.Object3D[] = []
  let edgesBuilt = false, wireOn = false
  const lineMat = new THREE.LineBasicMaterial({ color: 0x222222 })
  type M = THREE.Material & { __op?: number; __tr?: boolean; __dw?: boolean }

  function setWire(on: boolean) {
    wireOn = on
    if (!root) return
    if (on && !edgesBuilt) {
      const meshes: THREE.Mesh[] = []; root.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh) })
      for (const m of meshes) { const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), lineMat); l.userData.__edge = true; m.add(l) }
      edgesBuilt = true
    }
    root.traverse(o => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as M[]
        for (const mt of mats) {
          if (mt.__op === undefined) { mt.__op = mt.opacity; mt.__tr = mt.transparent; mt.__dw = mt.depthWrite }
          mt.transparent = on || !!mt.__tr; mt.opacity = on ? 0.08 : mt.__op!; mt.depthWrite = on ? false : !!mt.__dw; mt.needsUpdate = true
        }
      }
      if (o.userData.__edge) o.visible = on
    })
    ;(scene.background as THREE.Color).set(on ? 0xffffff : 0xeef0f2)
    $('wire')?.classList.toggle('on', on)
  }
  function setDoors(on: boolean) { for (const n of doorNodes) n.visible = on; $('doors')?.classList.toggle('on', on) }
  function resetView() { if (!home) return; camera.position.copy(home.pos); controls.target.copy(home.target); controls.update() }

  const wireBtn = $('wire'), doorsBtn = $('doors'), resetBtn = $('reset')
  if (wireBtn) wireBtn.onclick = () => setWire(!wireOn)
  if (doorsBtn) doorsBtn.onclick = () => setDoors(!doorsBtn.classList.contains('on'))
  if (resetBtn) resetBtn.onclick = resetView
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight) })

  const buf = await getGlb(cfg)
  const gltf = await new GLTFLoader().parseAsync(buf, '')
  root = gltf.scene; scene.add(root)
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3())
  const r = size.length() / 2 || 1000
  camera.near = r / 200; camera.far = r * 50; camera.updateProjectionMatrix()
  sun.position.copy(c).add(new THREE.Vector3(r, r * 2, r * 1.5))
  // Reset view = the whole room from the front, a little above. The file opens at
  // the app's view when it was exported (if any).
  home = { pos: c.clone().add(new THREE.Vector3(r * 0.9, r * 0.7, r * 1.3)), target: c }
  const w = window as unknown as Record<string, unknown>
  w.__toggle = { setWire, setDoors, doors: () => doorNodes.length }
  w.__setView = (dx: number, dy: number, dz: number) => { camera.position.copy(c).add(new THREE.Vector3(dx * r, dy * r, dz * r)); controls.target.copy(c); controls.update() }
  // doors + drawer fronts are the face zones (partId zone_*)
  root.traverse(o => { if (/^zone_/.test(String(o.userData?.partId ?? ''))) doorNodes.push(o) })
  if (!doorNodes.length) doorsBtn?.remove()
  resetView()
  if (startView) { camera.position.set(...(startView.pos as [number, number, number])); controls.target.set(...(startView.target as [number, number, number])); controls.update() }
  $('load')?.remove()
  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera) })
  w.__ready = true
}

start().catch(e => say('Could not load the 3D model: ' + (e instanceof Error ? e.message : String(e))))
