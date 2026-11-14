// RHK CADcam service worker — offline step 2 (z_offline/OFFLINE-SPEC.md).
//
//  shell   /offline + /offline/canvas pages and the files they need. Kept fresh while online.
//  static  /_next/static/* (hashed, never change), models, fonts: cache-first, saved as used.
//  data    Supabase reads (REST GET + public storage): network-first. Every read the app makes
//          online is saved, and handed back when there's no signal.
//  Pages:  network-first. If /canvas/<room> can't load (no signal, or 15 s with bad
//          reception), go to the offline canvas for that room; other pages -> /offline.
// Writes are never touched: the app's own offline queue handles CAD / markups.

const SHELL = 'rhk-shell'
const STATIC = 'rhk-static'
const DATA = 'rhk-data'
const KEEP = [SHELL, STATIC, DATA]
const SHELL_PAGES = ['/offline', '/offline/canvas']
const NAV_TIMEOUT = 15000
const DATA_TIMEOUT = 8000

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(cacheShell().catch(() => {}))
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (!KEEP.includes(k)) await caches.delete(k)
    await self.clients.claim()
  })())
})

let lastShell = 0
self.addEventListener('message', event => {
  // 'refresh-shell!' (Take offline) = now; 'refresh-shell' (each page load) = at most every 5 min.
  if (event.data === 'refresh-shell!' || (event.data === 'refresh-shell' && Date.now() - lastShell > 5 * 60 * 1000)) {
    event.waitUntil(cacheShell().catch(() => {}))
  }
})

/** Fetch the offline pages and every file they reference; store the page only once all
 *  its files are stored, so the copy on the device always hangs together. */
async function cacheShell() {
  lastShell = Date.now()
  const shell = await caches.open(SHELL)
  const stat = await caches.open(STATIC)
  for (const page of SHELL_PAGES) {
    const res = await fetch(page, { cache: 'no-store', credentials: 'same-origin' })
    if (!res.ok || res.redirected || !(res.headers.get('content-type') || '').includes('text/html')) continue
    const html = await res.clone().text()
    const files = new Set()
    for (const m of html.matchAll(/(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\\\s)<>]+/g)) {
      files.add(m[0].startsWith('/_next/') ? m[0] : '/_next/' + m[0])
    }
    let ok = true
    for (const f of files) {
      if (await stat.match(f)) continue
      try {
        const r = await fetch(f, { credentials: 'same-origin' })
        if (r.ok) await stat.put(f, r); else ok = false
      } catch { ok = false }
    }
    if (ok) await shell.put(page, res)
  }
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
}

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(page(req, url))
    return
  }
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/_next/static/') || /^\/(fixture-models|hardware-models)\//.test(url.pathname) || url.pathname === '/favicon.ico') {
      event.respondWith(cacheFirst(req))
    }
    return
  }
  // Supabase reads.
  if (url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/storage/v1/object/public/')) {
    event.respondWith(networkFirst(req))
  }
})

async function page(req, url) {
  try {
    const res = await Promise.race([fetch(req), timeout(NAV_TIMEOUT)])
    // Keep the offline pages fresh whenever they're visited online.
    if (res.ok && SHELL_PAGES.includes(url.pathname) && !res.redirected) {
      const copy = res.clone()
      caches.open(SHELL).then(c => c.put(url.pathname, copy)).catch(() => {})
    }
    return res
  } catch {
    const room = url.pathname.match(/^\/canvas\/([0-9a-f-]{36})\/?$/i)
    if (room) return Response.redirect(new URL(`/offline/canvas?room=${room[1]}`, self.location.origin).href, 302)
    const shell = await caches.open(SHELL)
    const hit = SHELL_PAGES.includes(url.pathname) ? await shell.match(url.pathname) : null
    return hit || (await shell.match('/offline')) || new Response('No signal, and the offline pages are not on this device yet.', { status: 503, headers: { 'content-type': 'text/plain' } })
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(STATIC)
  const hit = await cache.match(req, { ignoreVary: true })
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) cache.put(req, res.clone()).catch(() => {})
  return res
}

async function networkFirst(req) {
  const cache = await caches.open(DATA)
  const key = req.url
  try {
    const res = await Promise.race([fetch(req), timeout(DATA_TIMEOUT)])
    if (res.status === 200) cache.put(key, res.clone()).catch(() => {})
    return res
  } catch (err) {
    const hit = await cache.match(key, { ignoreVary: true })
    if (hit) return hit
    throw err
  }
}
