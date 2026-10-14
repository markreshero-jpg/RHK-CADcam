// O2 verification: shapes reach the optimiser snapshot — ⬠ marker on the
// shaped part in Stage 2, part still counted as nestable (fresh shape).
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
  .select('cabinet_id, part_key, revision, segments').order('revision', { ascending: false })
if (!shapeRows?.length) die('no shape overrides in DB')
const head = shapeRows[0]
const { data: cab } = await sb.from('cabinet_instances').select('id, room_id, label').eq('id', head.cabinet_id).single()
const { data: room } = await sb.from('rooms').select('project_id').eq('id', cab.room_id).single()
console.log('shaped cabinet:', cab.label, '| part:', head.part_key, '| r' + head.revision, '| segments:', head.segments.length)

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-first-run', '--disable-gpu'],
  defaultViewport: { width: 1720, height: 950 },
})
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  await page.goto(`http://localhost:${PORT}/projects/${room.project_id}/optimiser`, { waitUntil: 'networkidle2', timeout: 90000 })
  await sleep(1500)

  for (let i = 0; i < 12; i++) {
    const onParts = await page.evaluate(() => document.body.innerText.includes('Stage 2 of 6') || !!document.querySelector('table'))
    if (onParts) break
    await page.evaluate(() => {
      const byText = t => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === t)
      byText('Next →')?.click()
    })
    await sleep(1000)
  }

  const rows = await page.evaluate(label => {
    const out = []
    for (const tr of document.querySelectorAll('tr')) {
      if (!tr.textContent.includes(label)) continue
      const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim())
      if (!cells.length) continue
      const shapeMark = tr.querySelector('span[title*="Shaped part"]')
      out.push({
        cells: cells.join(' | '),
        shaped: !!shapeMark,
        stale: shapeMark ? /STALE/.test(shapeMark.getAttribute('title')) : false,
        title: shapeMark?.getAttribute('title') ?? null,
      })
    }
    return out
  }, cab.label)
  if (!rows.length) die(`no Stage 2 rows for ${cab.label}`)
  for (const r of rows) console.log((r.shaped ? (r.stale ? '⬠STALE ' : '⬠ ') : '  ') + r.cells)

  const shapedRows = rows.filter(r => r.shaped)
  console.log('\nshaped row title:', shapedRows[0]?.title)
  const pass = shapedRows.length >= 1 && shapedRows.every(r => !r.stale)
  console.log(pass ? 'O2 VERIFY: PASS (⬠ marker present, fresh shape not stale)' : 'O2 VERIFY: FAIL')
} finally {
  await browser.close()
}
