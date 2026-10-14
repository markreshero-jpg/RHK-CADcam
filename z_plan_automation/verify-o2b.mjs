// O2b: run the REAL shape-save flow on the shaped cabinet (BC-09 right gable)
// so the part size syncs to the shape bbox (r2 + sd override), verifying the
// M7 grow-path write end-to-end. Then the optimiser should see a FRESH shape.
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'

const REPO = 'C:/Projects/RHK-CADcam'
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

const { data: shapeRows } = await sb.from('part_shape_overrides')
  .select('cabinet_id, part_key, revision').order('revision', { ascending: false }).limit(1)
const head = shapeRows?.[0]
if (!head) die('no shapes in DB')
const { data: cab } = await sb.from('cabinet_instances').select('id, room_id, label, part_pos_overrides').eq('id', head.cabinet_id).single()
console.log('target:', cab.label, head.part_key, 'head r' + head.revision)
console.log('override before:', JSON.stringify(cab.part_pos_overrides?.[head.part_key] ?? null))

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-first-run', '--disable-gpu'],
  defaultViewport: { width: 1720, height: 950 },
})
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  page.on('dialog', async d => { console.log('DIALOG:', d.message().slice(0, 120)); await d.accept() })
  await page.goto(`http://localhost:${PORT}/canvas/${cab.room_id}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 30000 })
  await sleep(1000)
  await page.evaluate(id => window.__canvasApi.openCabinet(id), cab.id)
  await sleep(2500)

  // Overrides tab → shape row ✎ Edit (opens Part Editor in shaping mode)
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Overrides')?.click()
  })
  await sleep(1500)
  const editOk = await page.evaluate(() => {
    const b = document.querySelector('button[title^="Edit shape"]')
    if (!b) return false
    b.click(); return true
  })
  if (!editOk) die('shape-row Edit button not found')
  await sleep(3000)

  // Header Save Shape → handleShapeSave (bbox→size write included)
  const saveOk = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Save Shape')
    if (!b) return false
    b.click(); return true
  })
  if (!saveOk) die('Save Shape button not found — shaping mode did not open?')
  await sleep(3500)
  await page.screenshot({ path: 'z_plan_automation/o2b-after-save.png' })

  // DB: new head revision + size override written?
  const { data: after } = await sb.from('part_shape_overrides')
    .select('revision, meta').eq('cabinet_id', cab.id).eq('part_key', head.part_key)
    .order('revision', { ascending: false }).limit(1)
  const { data: cab2 } = await sb.from('cabinet_instances').select('part_pos_overrides').eq('id', cab.id).single()
  const ovAfter = cab2.part_pos_overrides?.[head.part_key] ?? null
  console.log('head revision after:', after?.[0]?.revision, '| sizeSlots:', JSON.stringify(after?.[0]?.meta?.sizeSlots ?? null))
  console.log('override after:', JSON.stringify(ovAfter))
  const grew = ovAfter && (ovAfter.sw != null || ovAfter.sh != null || ovAfter.sd != null)
  console.log(after?.[0]?.revision > head.revision && grew
    ? 'O2b SAVE FLOW: PASS (new revision + size override written)'
    : 'O2b SAVE FLOW: FAIL — grow-path size write did not land')
} finally {
  await browser.close()
}
