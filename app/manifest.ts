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
    icons: [{ src: '/favicon.ico', sizes: 'any', type: 'image/x-icon' }],
  }
}
