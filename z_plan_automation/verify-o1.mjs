// O1 verification: part_pos_overrides sw/sh/sd reach the optimiser snapshot.
// Finds the shaped cabinet, prints base row dims vs override, then loads the
// optimiser page headlessly and reads the part's Stage 2 row.
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

// Find any cabinet with an sw/sh/sd size override on a case part
const { data: allCabs } = await sb.from('cabinet_instances').select('id,room_id,label,part_pos_overrides').not('part_pos_overrides', 'eq', '{}')
let cab = null, shapedKey = null, ov = null
for (const c of allCabs ?? []) {
  const hit = Object.entries(c.part_pos_overrides ?? {}).find(([k, o]) =>
    k.startsWith('case_') && (o.sw != null || o.sh != null || o.sd != null))
  if (hit) { cab = c; shapedKey = hit[0]; ov = hit[1]; break }
}
if (!cab) die('no cabinet with a case-part size override found')
const { data: room } = await sb.from('rooms').select('project_id, name').eq('id', cab.room_id).single()
const cabId = cab.id
console.log('cabinet:', cab.label, '| part:', shapedKey, '| project:', room.project_id)
console.log('override:', JSON.stringify(ov))

// Base row dims (case part expected: shapedKey like case_right_side)
const caseKey = shapedKey.replace(/^case_/, '')
const { data: rowData } = await sb.from('case_parts')
  .select('part_key, dx, dy, dz').eq('cabinet_instance_id', cabId).eq('part_key', caseKey).single()
console.log('base row dims:', JSON.stringify(rowData))
// case side mapping: sw→dz, sh→dy, sd→dx ; back: sw→dy sh→dx sd→dz ; horiz: sw→dy sh→dz sd→dx
const isSide = caseKey === 'left_side' || caseKey === 'right_side'
const isBack = caseKey === 'back'
const eff = { dx: rowData.dx, dy: rowData.dy, dz: rowData.dz }
const ax = isSide ? ['dz', 'dy', 'dx'] : isBack ? ['dy', 'dx', 'dz'] : ['dy', 'dz', 'dx']
;[ov.sw, ov.sh, ov.sd].forEach((v, i) => { if (v != null) eff[ax[i]] = v })
console.log('expected effective dims:', JSON.stringify(eff), '→ OptiPart w=dx h=dy:', eff.dx, 'x', eff.dy)

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

  // Get to the Parts stage — retry until the table shows (first click can land
  // before hydration in dev)
  for (let i = 0; i < 12; i++) {
    const onParts = await page.evaluate(() => document.body.innerText.includes('Stage 2 of 6') || !!document.querySelector('table'))
    if (onParts) break
    await page.evaluate(() => {
      const byText = t => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === t)
      ;(byText('2Parts') ?? byText('Next →'))?.click()
      byText('Next →')?.click()
    })
    await sleep(1000)
  }

  // Find table rows for the target cabinet and dump their cells
  const rows = await page.evaluate(label => {
    const out = []
    for (const tr of document.querySelectorAll('tr')) {
      if (!tr.textContent.includes(label)) continue
      const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim())
      if (cells.length) out.push({ cells, hasDot: tr.innerHTML.includes('●') })
    }
    return out
  }, cab.label)
  if (!rows.length) {
    const dbg = await page.evaluate(() => ({
      url: location.href,
      buttons: [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => t && t.length < 30).slice(0, 40),
      text: document.body.innerText.slice(0, 600),
    }))
    console.log('DEBUG:', JSON.stringify(dbg, null, 2))
    await page.screenshot({ path: 'z_plan_automation/o1-debug.png' })
    die(`no Stage 2 rows found for cabinet ${cab.label} (see o1-debug.png)`)
  }
  for (const r of rows) console.log((r.hasDot ? '● ' : '  ') + r.cells.join(' | '))

  // Match on the overridden axis only — the other axes may display CUT size
  // (finished − edgeband) when the profile deducts, so exact match is wrong.
  const expectH = String(Math.round(eff.dy))
  const hit = rows.find(r => r.hasDot && r.cells.some(c => c.includes(expectH)))
  console.log(hit ? 'O1 VERIFY: PASS (marked row shows effective dims)' : 'O1 VERIFY: FAIL — no marked row with expected dims')
} finally {
  await browser.close()
}
