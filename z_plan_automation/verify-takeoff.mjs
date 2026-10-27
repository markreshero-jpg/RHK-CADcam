// z_takeoff: Job Reports → Hardware Pick List + Takeoff. Screenshots both and
// prints the report text. JOB=RHK6581 (default) picks the project; SCOPE=room|job.
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'

const REPO = 'C:/Projects/RHK-CADcam'
const PORT = process.env.DEV_PORT ?? '3001'
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = process.env.OUT ?? 'z_plan_automation'
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
const proj = process.env.PROJECT
  ? (await sb.from('projects').select('id,name,job_number').eq('id', process.env.PROJECT).single()).data
  : (await sb.from('projects').select('id,name,job_number').ilike('job_number', `%${job}%`)).data?.[0]
if (!proj) die('project not found')
const { data: rooms } = await sb.from('rooms').select('id,name').eq('project_id', proj.id).order('sort_order')
const room = rooms.find(r => /kitchen/i.test(r.name)) ?? rooms[0]
const scope = process.env.SCOPE ?? 'job'
console.log('project:', proj.job_number, proj.name, '| room:', room.name, '| scope:', scope)

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
  const item = scope === 'job' ? 'Job Reports' : 'Room Reports'
  if (!await clickText(`${item}…`) && !await clickText(`${item}...`)) die(`${item} item not found`)
  await sleep(2500)
  for (const id of ['hardware_pick', 'takeoff']) {
    if (!await page.evaluate(id => { const b = document.querySelector(`[data-tour="report-${id}"]`); if (!b) return false; b.click(); return true }, id)) die(`${id} button not found`)
    await page.waitForFunction(() => !/Loading…|Nesting…/.test(document.body.innerText), { timeout: 120000 })
    await sleep(800)
    await page.screenshot({ path: `${OUT}/takeoff-${id}.png` })
    const text = await page.evaluate(() => {
      const t = [...document.querySelectorAll('table')].map(tb => [...tb.querySelectorAll('tr')].map(tr => [...tr.children].map(c => c.textContent.trim()).join(' | ')).join('\n'))
      return t.join('\n---\n')
    })
    console.log(`\n===== ${id} =====\n` + text.slice(0, 6000))
    // Print / PDF: catch the HTML the report writes to its print window, render it to PDF.
    await page.evaluate(() => {
      window.__printed = ''
      window.open = () => ({ document: { write: h => { window.__printed += h }, close() {} }, focus() {}, print() {} })
    })
    await clickText('Print / PDF')
    await sleep(500)
    const html = await page.evaluate(() => window.__printed)
    const pp = await browser.newPage()
    await pp.setContent(html, { waitUntil: 'load' })
    await pp.pdf({ path: `${OUT}/takeoff-${id}.pdf`, format: 'A4', printBackground: true, margin: { top: '15mm', bottom: '20mm', left: '15mm', right: '15mm' } })
    await pp.setViewport({ width: 794, height: 1123 }); await pp.screenshot({ path: `${OUT}/takeoff-${id}-print.png` })
    await pp.close()
    console.log(`print → ${OUT}/takeoff-${id}.pdf (${html.length} chars)`)
  }
} finally { await browser.close() }
