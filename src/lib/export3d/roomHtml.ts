// z_html_export: export the room's live 3D scene three ways.
//  - HTML file (H1/H5): one self-contained file, GLB embedded as base64, the
//    viewer (three.js bundled, public/share3d/viewer.js) inlined, so it opens
//    offline in any browser with no import maps or modules.
//  - USDZ (H6): Apple's 3D format. Double-click opens on a Mac / iPhone in
//    Quick Look (and AR on iPhone / iPad). No scripts needed.
//  - Share link (H6): GLB + USDZ uploaded to the public `share-3d` bucket under a
//    random token; /share/3d/<roomId>/<token> serves the same viewer.
// The viewer source is src/lib/export3d/viewer/main.ts (npm run build:viewer).
import type { Scene } from 'three'

/** The live room 3D scene, set by Room3DScene's SceneExportBridge while mounted. */
export const room3dScene: { current: Scene | null } = { current: null }

export type View3D = { pos: number[]; target: number[] } | null

export async function sceneToGlb(scene: Scene): Promise<Uint8Array> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
  const buf = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true }) as ArrayBuffer
  return new Uint8Array(buf)
}

/** GLB → USDZ. Goes through GLTFLoader so every material is a MeshStandardMaterial
 *  (the only kind USDZ takes), and scales mm → metres so AR shows it life size. */
export async function glbToUsdz(glb: Uint8Array): Promise<Uint8Array> {
  const [{ GLTFLoader }, { USDZExporter }, THREE] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/exporters/USDZExporter.js'),
    import('three'),
  ])
  const buf = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer
  const gltf = await new GLTFLoader().parseAsync(buf, '')
  const scene = new THREE.Scene()
  const holder = new THREE.Group()
  holder.scale.setScalar(0.001)
  holder.add(gltf.scene)
  scene.add(holder)
  // Sit the model on the floor at the origin so Quick Look / AR frames it well.
  scene.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(holder)
  const c = box.getCenter(new THREE.Vector3())
  holder.position.set(-c.x, -box.min.y, -c.z)
  scene.updateMatrixWorld(true)
  const out = await new USDZExporter().parseAsync(scene, {
    quickLookCompatible: true,
    onlyVisible: true,
    maxTextureSize: 2048,
  } as Parameters<InstanceType<typeof USDZExporter>['parseAsync']>[1])
  return out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer)
}

export function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const scriptSafe = (s: string) => s.replace(/<\/(script)/gi, '<\\/$1')

/** File name: "<job> - <room> - 3D.<ext>", minus characters Windows won't take. */
export const exportFileName = (job: string, room: string, ext = 'html') =>
  `${job} - ${room} - 3D.${ext}`.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()

let viewerJsCache: Promise<string> | null = null
/** The bundled viewer script, fetched from the app once per session. */
export function loadViewerJs(): Promise<string> {
  viewerJsCache ??= fetch('/share3d/viewer.js').then(r => {
    if (!r.ok) throw new Error(`viewer script missing (${r.status})`)
    return r.text()
  }).catch(e => { viewerJsCache = null; throw e })
  return viewerJsCache
}

/** The viewer page around the model. `model` is either the inline GLB (file) or
 *  the hosted config (share link). `usdzUrl` adds an "Apple 3D / AR" button. */
export function viewerPageHtml(opts: {
  title: string; heading: string; sub?: string; view?: View3D
  model: { glbBase64: string } | { glbUrl: string }
  viewerJs?: string; viewerSrc?: string; usdzUrl?: string
}): string {
  const modelTag = 'glbBase64' in opts.model
    ? `<script type="application/octet-stream" id="glb-room">${opts.model.glbBase64}</script>`
    : `<script>window.SHARE3D=${scriptSafe(JSON.stringify({ glbUrl: opts.model.glbUrl }))}</script>`
  const viewerTag = opts.viewerJs != null
    ? `<script>${scriptSafe(opts.viewerJs)}</script>`
    : `<script src="${esc(opts.viewerSrc ?? '/share3d/viewer.js')}"></script>`
  const ar = opts.usdzUrl
    ? `<a id="ar" rel="ar" href="${esc(opts.usdzUrl)}" download title="Apple 3D file: opens in Quick Look on a Mac, AR on iPhone / iPad"><img alt="" width="1" height="1" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">Apple 3D / AR</a>`
    : ''
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.title)}</title>
<style>
html,body{margin:0;height:100%;background:#eef0f2;font-family:-apple-system,system-ui,"Segoe UI",sans-serif;overflow:hidden}
#hud{position:fixed;left:12px;top:10px;max-width:calc(100vw - 24px);box-sizing:border-box;background:rgba(255,255,255,.9);padding:8px 12px;border-radius:8px;font-size:13px;color:#222;box-shadow:0 1px 4px rgba(0,0,0,.15)}
#hud b{display:block;font-size:14px}#hud span{display:block;color:#444}#hud span:empty{display:none}#hud small{color:#666}
#bar{position:fixed;right:12px;bottom:12px;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
#bar button,#bar a{padding:8px 14px;border:1px solid #1d4ed8;border-radius:6px;background:#fff;color:#1d4ed8;font-size:14px;cursor:pointer;text-decoration:none;font-family:inherit}
#bar button.on{background:#1d4ed8;color:#fff}
#bar a img{display:none}
#load{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#555;text-align:center;padding:24px;box-sizing:border-box;line-height:1.5}
#load.err{color:#b91c1c}
#load em{font-style:normal;font-size:13px;color:#777;max-width:440px}
</style>
</head><body>
<div id="load"><div>Loading 3D model…</div><em>If this message stays, you are seeing a preview. Save the file, then open it in Safari, Chrome or Edge (on a Mac: right-click the file › Open With › Safari).</em></div>
<div id="hud"><b>${esc(opts.heading)}</b><span>${esc(opts.sub ?? '')}</span><small>Drag to rotate · scroll / pinch to zoom · right-drag or two fingers to pan</small></div>
<div id="bar"><button id="wire">Wire</button><button id="doors" class="on">Doors</button><button id="reset">Reset view</button>${ar}</div>
<script type="application/json" id="view-json">${scriptSafe(JSON.stringify(opts.view ?? null))}</script>
${modelTag}
${viewerTag}
</body></html>
`
}

/** Self-contained HTML file: model + viewer inlined, works offline. */
export async function buildViewerHtml(opts: { title: string; heading: string; sub?: string; glbBase64: string; view?: View3D }): Promise<string> {
  const viewerJs = await loadViewerJs()
  return viewerPageHtml({ ...opts, model: { glbBase64: opts.glbBase64 }, viewerJs })
}

export function downloadBlob(fileName: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = fileName
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export const downloadText = (fileName: string, text: string, type = 'text/html') => downloadBlob(fileName, text, type)

// ── Share links (H6) ──────────────────────────────────────────────────────────

export const SHARE_BUCKET = 'share-3d'
export type ShareMeta = { heading: string; sub: string; title: string; view: View3D; usdz: boolean; created: string }

type StorageLike = {
  storage: {
    from(bucket: string): {
      upload(path: string, body: Blob, opts: { contentType: string; upsert?: boolean; cacheControl?: string }): Promise<{ error: { message: string } | null }>
    }
  }
}

/** Uploads the model and returns the share path `/share/3d/<roomId>/<token>`. */
export async function uploadShare(supabase: StorageLike, roomId: string, glb: Uint8Array, usdz: Uint8Array | null, meta: Omit<ShareMeta, 'usdz' | 'created'>): Promise<string> {
  const token = crypto.randomUUID()
  const dir = `${roomId}/${token}`
  const bucket = supabase.storage.from(SHARE_BUCKET)
  const put = async (name: string, data: BlobPart, contentType: string) => {
    const { error } = await bucket.upload(`${dir}/${name}`, new Blob([data], { type: contentType }), { contentType, upsert: false, cacheControl: '31536000' })
    if (error) throw new Error(`${name}: ${error.message}`)
  }
  await put('model.glb', glb as BlobPart, 'model/gltf-binary')
  if (usdz) await put('model.usdz', usdz as BlobPart, 'model/vnd.usdz+zip')
  const full: ShareMeta = { ...meta, usdz: !!usdz, created: new Date().toISOString() }
  await put('meta.json', JSON.stringify(full), 'application/json')
  return `/share/3d/${roomId}/${token}`
}
