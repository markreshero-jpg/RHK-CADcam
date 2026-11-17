// z_html_export H5: bundle the 3D viewer (src/lib/export3d/viewer/main.ts) with
// three.js into one classic script, public/share3d/viewer.js. The exported HTML
// file inlines it (works offline), the hosted share link loads it.
// Run after changing the viewer or upgrading three:  npm run build:viewer
import { build } from 'vite'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
await build({
  root,
  configFile: false,
  logLevel: 'warn',
  publicDir: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: resolve(root, 'public/share3d'),
    emptyOutDir: false,
    minify: true,
    target: 'es2019',
    lib: {
      entry: resolve(root, 'src/lib/export3d/viewer/main.ts'),
      formats: ['iife'],
      name: 'Share3DViewer',
      fileName: () => 'viewer.js',
    },
  },
})
console.log('built public/share3d/viewer.js')
