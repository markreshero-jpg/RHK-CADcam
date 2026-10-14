// Display layers Phase 3c part 2: "ghost" style + opacity in 3D.
// Creates a temporary set whose 3D doors / drawer fronts are ghost and whose walls
// are 50% opacity, screenshots the room 3D view with Full parts and with the temp
// set, and compares the mean colour of a run of door fronts: ghost doors must read
// much paler (the carcase behind shows through).
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? 'daf9a3e4-0d95-4982-af11-ddee1a8e11c3'
const TEMP = 'ZZ 3d ghost'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
// No anonymous DB access (z_access_control) — sign in as the automation account.
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) { console.error("automation sign-in failed (AUTOMATION_EMAIL/PASSWORD in .env.local):", error.message); process.exit(1) } }

await sb.from('drawing_layer_sets').delete().eq('name', TEMP)
const { error: insErr } = await sb.from('drawing_layer_sets').insert({ name: TEMP, sort_order: 99, settings: {
  '3d': { items: {
    doors:         { style: 'ghost' },
    drawer_fronts: { style: 'ghost' },
    false_panels:  { style: 'ghost' },
    walls:         { opacity: 0.5 },
  } },
} })
if (insErr) throw insErr

let browser
try {
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'], defaultViewport: { width: 1500, height: 950 } })
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 60000 })
  await sleep(5000)
  const clickBtn = async t => { const ok = await page.evaluate(x => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === x && e.offsetParent !== null); if (b) { b.click(); return true } return false }, t); if (!ok) throw new Error('no button ' + t) }
  await clickBtn('3D')
  await sleep(9000)

  const layerSelect = async () => { for (const h of await page.$$('select')) if (await h.evaluate(el => [...el.options].some(o => o.value === '__manage__'))) return h }
  const pick = async name => { const s = await layerSelect(); await s.select(await s.evaluate((el, n) => [...el.options].find(o => o.text === n)?.value, name)); await sleep(6000) }
  // Mean colour of the wall-cabinet door run (screen coords for this fixed camera).
  const doorColour = async () => {
    const b64 = await page.screenshot({ encoding: 'base64' })
    return page.evaluate(async data => {
      const img = new Image(); img.src = 'data:image/png;base64,' + data
      await img.decode()
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
      const d = ctx.getImageData(990, 210, 200, 80).data
      let r = 0, g = 0, b = 0
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2] }
      const n = d.length / 4
      return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
    }, b64)
  }

  await pick('Full parts')
  const solid = await doorColour()
  console.log('Full parts door colour:', JSON.stringify(solid))
  await page.screenshot({ path: path.join(OUT, '3d-full.png') })
  await pick(TEMP)
  const ghost = await doorColour()
  console.log(TEMP + ' door colour:', JSON.stringify(ghost))
  await page.screenshot({ path: path.join(OUT, '3d-ghost.png') })
  const lighter = ghost[0] - solid[0]
  console.log(lighter > 60 ? `PASS — ghost doors are ${lighter} lighter (red channel)` : `FAIL — ghost doors barely changed (${lighter})`)
  // Manager: the 3D tab must now offer opacity + style (solid / ghost, no dashed).
  await (await layerSelect()).select('__manage__'); await sleep(1500)
  const tab = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '3D'))
  await tab.asElement()?.click(); await sleep(1000)
  console.log('3D tab selects per row:', await page.evaluate(() => {
    const row = [...document.querySelectorAll('div')].find(d => d.textContent.trim().startsWith('Doors') && d.querySelectorAll('select').length)
    return row ? [...row.querySelectorAll('select')].map(s => [...s.options].map(o => o.text).join('/')) : null
  }))
  await page.screenshot({ path: path.join(OUT, '3d-manager.png') })
} finally {
  await browser?.close()
  await sb.from('drawing_layer_sets').delete().eq('name', TEMP)
}
