// O7: Room Reports → Edgeband Length on the RHK6581 kitchen. Screenshots the
// report and prints BC-09's raw banding rows so its metres can be hand-checked.
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
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) die(error.message) }

const job = process.env.JOB ?? 'RHK6581'
const { data: projs } = await sb.from('projects').select('id,name,job_number').ilike('job_number', `%${job}%`)
const proj = projs?.[0] ?? (await sb.from('projects').select('id,name,job_number').ilike('name', `%${job}%`)).data?.[0]
if (!proj) die('project not found')
const { data: rooms } = await sb.from('rooms').select('id,name').eq('project_id', proj.id).order('sort_order')
const room = rooms.find(r => /kitchen/i.test(r.name)) ?? rooms[0]
console.log('project:', proj.job_number, proj.name, '| room:', room.name)

const CAB = process.env.CAB ?? 'BC-09'
const { data: cab } = await sb.from('cabinet_instances').select('id,label,part_pos_overrides').eq('room_id', room.id).eq('label', CAB).maybeSingle()
if (cab) {
  const sel = 'part_key,dx,dy,dz,edge_band_top,edge_band_bottom,edge_band_left,edge_band_right,edge_band_id,outline'
  const { data: cp } = await sb.from('case_parts').select(sel).eq('cabinet_instance_id', cab.id)
  const { data: ip } = await sb.from('internal_parts').select('part_type,sort_order,dx,dy,dz,edge_band_top,edge_band_bottom,edge_band_back,edge_band_front,edge_band_id').eq('cabinet_instance_id', cab.id)
  const { data: fz } = await sb.from('face_zones').select('face_type,row_index,col_index,dx,dy,dz,edge_band_top,edge_band_bottom,edge_band_left,edge_band_right,edge_band_id').eq('cabinet_instance_id', cab.id)
  const f = r => ['top', 'bottom', 'left', 'right', 'back', 'front'].filter(k => r[`edge_band_${k}`]).join('/') || '-'
  console.log(`\n${CAB} raw rows (dx × dy, banded flags, outline pts):`)
  for (const r of cp) console.log('  case', r.part_key, r.dx, '×', r.dy, f(r), Array.isArray(r.outline) ? `outline ${r.outline.length}` : '')
  for (const r of ip) console.log('  int ', r.part_type, r.sort_order, r.dx, '×', r.dy, f(r))
  for (const r of fz) console.log('  face', r.face_type, r.row_index, r.col_index, r.dx, '×', r.dy, f(r))
  console.log('  overrides:', JSON.stringify(cab.part_pos_overrides ?? {}))
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run', '--disable-gpu'], defaultViewport: { width: 1500, height: 1000 } })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text().slice(0, 200)) })
  await page.goto(`http://localhost:${PORT}/canvas/${room.id}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 })
  await sleep(1500)
  const clickText = t => page.evaluate(t => {
    const b = [...document.querySelectorAll('button, [role=menuitem], div, span')].find(x => x.textContent.trim() === t && x.children.length === 0)
    if (!b) return false; (b.closest('button') ?? b).click(); return true
  }, t)
  if (!await page.evaluate(() => { const m = document.querySelector('[data-tour="menu-Reports"]'); if (!m) return false; m.click(); return true })) die('Reports menu not found')
  await sleep(600)
  if (!await clickText('Room Reports…') && !await clickText('Room Reports...')) die('Room Reports item not found')
  await sleep(1500)
  if (!await page.evaluate(() => { const b = document.querySelector('[data-tour="report-edgeband_length"]'); if (!b) return false; b.click(); return true })) die('Edgeband report button not found')
  await page.waitForFunction(() => !document.body.innerText.includes('Loading parts…'), { timeout: 60000 })
  await sleep(800)
  await page.screenshot({ path: 'z_plan_automation/o7-report.png' })
  const text = await page.evaluate(() => {
    const t = [...document.querySelectorAll('table')].map(tb => [...tb.querySelectorAll('tr')].map(tr => [...tr.children].map(c => c.textContent.trim()).join(' | ')).join('\n'))
    return t.join('\n---\n')
  })
  console.log('\nREPORT TABLES:\n' + text)
  // Waste change recomputes
  await page.evaluate(() => {
    const i = document.querySelector('[data-tour="edgeband-waste"] input')
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    set.call(i, '0'); i.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await sleep(400)
  const w0 = await page.evaluate(() => document.querySelector('table tr:nth-child(1)')?.parentElement?.parentElement?.querySelector('tbody tr')?.textContent)
  console.log('\nfirst line at 0% waste:', w0)
  await page.evaluate(() => {
    const i = document.querySelector('[data-tour="edgeband-waste"] input')
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    set.call(i, '10'); i.dispatchEvent(new Event('input', { bubbles: true }))
  })
} finally { await browser.close() }
