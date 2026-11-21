import type { MetadataRoute } from 'next'

// Home-screen app details. start_url makes the phone icon always open on the main
// menu: without it the icon is a bookmark of whatever page was showing when it was
// added (a job), and the phone reloads that page whenever it has dropped the app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RHK CADcam',
    short_name: 'RHK CADcam',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    // Drawn in public/app-icon.svg; the iPhone icon is app/apple-icon.png (same picture, 180).
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
