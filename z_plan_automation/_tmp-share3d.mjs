// Build the shareable 3D HTML (template + embedded GLBs) and screenshot it.
// node _tmp-share3d.mjs <dir>   (dir holds template.html + the room GLBs)
import puppeteer from 'puppeteer-core'
import fs from 'fs'
const dir = process.argv[2]
const rooms = [['bed-2', 'Bed 2 Ensuite', 'Bed_2_Ensuite.glb'], ['bed-3', 'Bed 3 Ensuite', 'Bed_3_Ensuite.glb']]
const tpl = fs.readFileSync(`${dir}/template.html`, 'utf8')
const data = rooms.map(([id, name, f]) => `<script type="application/octet-stream" id="glb-${id}" data-name="${name}">${fs.readFileSync(`${dir}/${f}`).toString('base64')}</script>`).join('\n')
const out = `${dir}/RHK6570-3D.html`
fs.writeFileSync(out, tpl.replace('<!--GLB-->', data))
console.log('size', fs.statSync(out).size)
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage(); await p.setViewport({ width: 1400, height: 900 })
p.on('pageerror', e => console.log('ERR', e.message))
for (const h of ['bed-2', 'bed-3']) {
  await p.goto('file:///' + out + '#' + h, { waitUntil: 'networkidle0' })
  await p.reload({ waitUntil: 'networkidle0' })
  await new Promise(r => setTimeout(r, 4000)); await p.screenshot({ path: `${dir}/view-${h}.png` })
}
await b.close()
