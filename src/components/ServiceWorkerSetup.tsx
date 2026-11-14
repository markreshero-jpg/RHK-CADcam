'use client'
// Registers the offline service worker (public/sw.js, z_offline step 2). Production only;
// in dev set localStorage 'rhk.sw' = '1' to try it (dev chunks change on every edit).
// Renders nothing.

import { useEffect } from 'react'

export default function ServiceWorkerSetup() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let on = process.env.NODE_ENV === 'production'
    try { if (localStorage.getItem('rhk.sw') === '1') on = true; if (localStorage.getItem('rhk.sw') === '0') on = false } catch { /* private window */ }
    if (!on) return
    let timer: ReturnType<typeof setTimeout> | undefined
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(reg => {
      // Once the page has settled: refresh the offline pages (picks up a new deploy).
      timer = setTimeout(() => {
        if (navigator.onLine) (reg.active ?? navigator.serviceWorker.controller)?.postMessage('refresh-shell')
      }, 8000)
    }).catch(e => console.error('[offline] service worker', e))
    return () => clearTimeout(timer)
  }, [])
  return null
}
