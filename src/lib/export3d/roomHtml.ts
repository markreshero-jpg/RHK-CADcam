// z_html_export H1: export the room's live 3D scene as one self-contained HTML
// file (GLB embedded as base64) with a Wire / Doors / Reset view toolbar.
// Static snapshot: doors and drawers can be hidden, not opened.
// Canonical viewer. z_plan_automation/share3d/template.html is the older copy the
// headless script uses.
import type { Scene } from 'three'

/** The live room 3D scene, set by Room3DScene's SceneExportBridge while mounted. */
export const room3dScene: { current: Scene | null } = { current: null }

export async function sceneToGlb(scene: Scene): Promise<Uint8Array> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
  const buf = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true }) as ArrayBuffer
  return new Uint8Array(buf)
}

export function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

/** File name: "<job> - <room> - 3D.html", minus characters Windows won't take. */
export const exportFileName = (job: string, room: string) =>
  `${job} - ${room} - 3D.html`.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()

/** `view` = the app's camera when exported; the file opens there. Reset view = the whole room. */
export function buildViewerHtml(opts: { title: string; heading: string; sub?: string; glbBase64: string; view?: { pos: number[]; target: number[] } | null }): string {
  return VIEWER
    .replace('{{VIEW}}', JSON.stringify(opts.view ?? null))
    .replace('{{TITLE}}', esc(opts.title))
    .replace('{{HEADING}}', esc(opts.heading))
    .replace('{{SUB}}', esc(opts.sub ?? ''))
    .replace('<!--GLB-->', () => `<script type="application/octet-stream" id="glb-room">${opts.glbBase64}</script>`)
}

export function downloadText(fileName: string, text: string, type = 'text/html') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = fileName
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

// three.js loads from jsDelivr, so the file needs internet the first time it opens.
const VIEWER = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{TITLE}}</title>
<style>
html,body{margin:0;height:100%;background:#eef0f2;font-family:system-ui,sans-serif;overflow:hidden}
#hud{position:fixed;left:12px;top:10px;max-width:calc(100vw - 24px);box-sizing:border-box;background:rgba(255,255,255,.9);padding:8px 12px;border-radius:8px;font-size:13px;color:#222;box-shadow:0 1px 4px rgba(0,0,0,.15)}
#hud b{display:block;font-size:14px}#hud span{display:block;color:#444}#hud span:empty{display:none}#hud small{color:#666}
#bar{position:fixed;right:12px;bottom:12px;display:flex;gap:6px}
#bar button{padding:8px 14px;border:1px solid #1d4ed8;border-radius:6px;background:#fff;color:#1d4ed8;font-size:14px;cursor:pointer}
#bar button.on{background:#1d4ed8;color:#fff}
#load{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#555}
</style>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>
</head><body>
<div id="load">Loading 3D model…</div>
<div id="hud"><b>{{HEADING}}</b><span>{{SUB}}</span><small>Drag to rotate · scroll / pinch to zoom · right-drag or two fingers to pan</small></div>
<div id="bar"><button id="wire">Wire</button><button id="doors" class="on">Doors</button><button id="reset">Reset view</button></div>
<!--GLB-->
<script type="module">
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xeef0f2)
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.6))
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(1, 2, 1.5); scene.add(sun)
const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-1.5, 1, -1); scene.add(fill)
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 1, 1e6)
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true
const el = document.getElementById('glb-room')
const bin = Uint8Array.from(atob(el.textContent.trim()), c => c.charCodeAt(0))
let home, root
const startView = {{VIEW}}
const doorNodes = []
let edgesBuilt = false, wireOn = false
const lineMat = new THREE.LineBasicMaterial({ color: 0x222222 })
function setWire(on) {
  wireOn = on
  if (!root) return
  if (on && !edgesBuilt) {
    const meshes = []; root.traverse(o => { if (o.isMesh) meshes.push(o) })
    for (const m of meshes) { const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), lineMat); l.userData.__edge = true; m.add(l) }
    edgesBuilt = true
  }
  root.traverse(o => {
    if (o.isMesh) { const mats = Array.isArray(o.material) ? o.material : [o.material]; for (const mt of mats) { if (mt.__op === undefined) { mt.__op = mt.opacity; mt.__tr = mt.transparent; mt.__dw = mt.depthWrite } mt.transparent = on || mt.__tr; mt.opacity = on ? 0.08 : mt.__op; mt.depthWrite = on ? false : mt.__dw; mt.needsUpdate = true } }
    if (o.userData.__edge) o.visible = on
  })
  scene.background.set(on ? 0xffffff : 0xeef0f2)
  document.getElementById('wire').classList.toggle('on', on)
}
function setDoors(on) { for (const n of doorNodes) n.visible = on; document.getElementById('doors').classList.toggle('on', on) }
document.getElementById('wire').onclick = () => setWire(!wireOn)
document.getElementById('doors').onclick = () => setDoors(!document.getElementById('doors').classList.contains('on'))
new GLTFLoader().parse(bin.buffer, '', gltf => {
  root = gltf.scene; scene.add(root)
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3())
  const r = size.length() / 2
  camera.near = r / 200; camera.far = r * 50; camera.updateProjectionMatrix()
  sun.position.copy(c).add(new THREE.Vector3(r, r * 2, r * 1.5))
  // Reset view = the whole room from the front, a little above. The file opens at
  // the app's view when it was exported (if any).
  home = { pos: c.clone().add(new THREE.Vector3(r * 0.9, r * 0.7, r * 1.3)), target: c }
  window.__toggle = { setWire, setDoors, doors: () => doorNodes.length }
  window.__setView = (dx, dy, dz) => { camera.position.copy(c).add(new THREE.Vector3(dx * r, dy * r, dz * r)); controls.target.copy(c); controls.update() }
  // doors + drawer fronts are the face zones (partId zone_*)
  root.traverse(o => { if (/^zone_/.test(o.userData?.partId ?? '')) doorNodes.push(o) })
  if (!doorNodes.length) document.getElementById('doors').remove()
  resetView()
  if (startView) { camera.position.set(...startView.pos); controls.target.set(...startView.target); controls.update() }
  document.getElementById('load').remove()
}, e => { document.getElementById('load').textContent = 'Could not load model: ' + e })
function resetView() { if (!home) return; camera.position.copy(home.pos); controls.target.copy(home.target); controls.update() }
document.getElementById('reset').onclick = resetView
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight) })
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera) })
</script></body></html>
`
