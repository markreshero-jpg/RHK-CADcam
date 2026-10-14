// M8 verification: shaping mode hides the Part Editor side panels so the
// ShapeEditor canvas takes the full window width. Drives the dev app
// headlessly (same pattern as z_plan_automation/draw-plan.mjs).
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'

const REPO = 'C:/Projects/RHK-CADcam'
const OUT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const PORT = process.env.DEV_PORT ?? '3001'
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const die = msg => { console.error('ERROR:', msg); process.exit(1) }

const env = Object.fromEntries(
  fs.readFileSync(path.join(REPO, '.env.local'), 'utf8')
    .split('\n').filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
// No anonymous DB access (z_access_control) — sign in as the automation account.
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) { console.error("automation sign-in failed (AUTOMATION_EMAIL/PASSWORD in .env.local):", error.message); process.exit(1) } }

// Find a cabinet that actually HAS a shape override (prefer a BC-01)
const { data: shapeRows, error } = await sb.from('part_shape_overrides').select('cabinet_id, part_key')
if (error) die(error.message)
if (!shapeRows?.length) die('no rows in part_shape_overrides at all')
const shapedIds = [...new Set(shapeRows.map(r => r.cabinet_id))]
const { data: cabs } = await sb.from('cabinet_instances')
  .select('id, room_id, label').in('id', shapedIds)
if (!cabs?.length) die('shape overrides exist but no matching cabinet_instances')
for (const c of cabs) console.log('shaped cabinet:', c.label, c.id)
const target = cabs.find(c => c.label === 'BC-01') ?? cabs[0]
console.log('using cabinet', target.label, target.id, 'room', target.room_id)

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-first-run', '--disable-gpu'],
  defaultViewport: { width: 1720, height: 950 },
})
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  await page.goto(`http://localhost:${PORT}/canvas/${target.room_id}`, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 30000 })
  await sleep(1000)

  console.log('open cabinet:', JSON.stringify(await page.evaluate(id => window.__canvasApi.openCabinet(id), target.id)))
  await sleep(2500)   // modal mounts + resolve + shape load

  // Overrides tab
  const tabOk = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Overrides')
    if (!b) return false
    b.click(); return true
  })
  if (!tabOk) die('Overrides tab button not found')
  await sleep(1200)

  // Shape row ✎ Edit → Part Editor opens WITH shaping mode active
  await sleep(1800)
  const diag = await page.evaluate(() => ({
    hasPartShapes: document.body.innerText.includes('Part Shapes'),
    titles: [...document.querySelectorAll('button[title]')].map(b => b.getAttribute('title')).filter(t => /shape/i.test(t)),
    tabs: [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => t && t.length < 20).slice(0, 40),
  }))
  console.log('DIAG:', JSON.stringify(diag, null, 2))
  const editOk = await page.evaluate(() => {
    const b = document.querySelector('button[title^="Edit shape"]')
    if (!b) return false
    b.click(); return true
  })
  if (!editOk) {
    await page.screenshot({ path: path.join(OUT, 'm8-debug.png') })
    die('shape-row Edit button not found (see m8-debug.png)')
  }
  await sleep(3000)   // Part Editor mounts, shape loads, ShapeEditorPane mounts

  // ── Assertions: shaping mode layout ──
  const shaping = await page.evaluate(() => {
    const text = document.body.innerText
    const svgs = [...document.querySelectorAll('svg')].map(s => {
      const r = s.getBoundingClientRect(); return { w: r.width, h: r.height, left: r.left, right: r.right }
    }).sort((a, b) => b.w * b.h - a.w * a.h)
    return {
      innerWidth,
      shapingBadge: text.includes('Shaping'),
      saveShapeBtn: !!([...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Save Shape')),
      biggestSvg: svgs[0] ?? null,
    }
  })
  console.log('SHAPING MODE:', JSON.stringify(shaping, null, 2))
  await page.screenshot({ path: path.join(OUT, 'm8-shaping.png') })

  // ── Cancel → panels restore ──
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Cancel')?.click()
  })
  await sleep(1500)
  const normal = await page.evaluate(() => {
    const text = document.body.innerText
    return {
      shapingBadge: text.includes('Shaping'),
      viewToggles: ['3D', 'Top', 'Front', 'Side'].every(v =>
        [...document.querySelectorAll('button')].some(b => b.textContent.trim() === v)),
      editShapeBtn: !!([...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith('⬠ Edit Shape'))),
    }
  })
  console.log('AFTER CANCEL:', JSON.stringify(normal, null, 2))
  await page.screenshot({ path: path.join(OUT, 'm8-normal.png') })

  const fullWidth = shaping.biggestSvg && shaping.biggestSvg.right > shaping.innerWidth - 20 && shaping.biggestSvg.w > shaping.innerWidth - 200
  const pass = shaping.shapingBadge && shaping.saveShapeBtn && fullWidth
    && !normal.shapingBadge && normal.viewToggles
  console.log(pass ? 'M8 VERIFY: PASS' : 'M8 VERIFY: FAIL')
} finally {
  await browser.close()
}
