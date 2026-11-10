// Shareable 3D HTML: one GLB (from _tmp-export-3d.mjs) embedded in template.html.
// Toolbar: Wire (edges over see-through parts), Doors (hide face zones, partId zone_*), Reset view.
// node share3d/build.mjs <room.glb> <out.html> "<tab title>" "<heading>"
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const [glb, out, title, heading] = process.argv.slice(2)
const tpl = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'template.html'), 'utf8')
fs.writeFileSync(out, tpl.replace('{{TITLE}}', title).replace('{{HEADING}}', heading)
  .replace('<!--GLB-->', `<script type="application/octet-stream" id="glb-room">${fs.readFileSync(glb).toString('base64')}</script>`))
console.log(out, Math.round(fs.statSync(out).size / 1024), 'KB')
