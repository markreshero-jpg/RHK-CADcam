// Display layers: wall layers (walls / wall_fill / wall_names). Creates a temporary
// set (plan: cross-hatch red fill + thick dashed outline; elevation: solid fill, no
// wall names), reads the rendered wall attributes, screenshots plan, elevation and
// the Layer Manager, then deletes the set.
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? 'daf9a3e4-0d95-4982-af11-ddee1a8e11c3'
const TEMP = 'ZZ wall layers test'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
{ const { error } = await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD }); if (error) { console.error('automation sign-in failed:', error.message); process.exit(1) } }

await sb.from('drawing_layer_sets').delete().eq('name', TEMP)
const { error: insErr } = await sb.from('drawing_layer_sets').insert({ name: TEMP, sort_order: 99, settings: {
  plan: { items: { wall_fill: { pattern: 'cross', color: '#dc2626' }, walls: { weight: 3, style: 'dashed', color: '#22c55e' } } },
  elevation: { items: { wall_fill: { pattern: 'solid', color: '#7c3aed' }, wall_names: { visible: false } } },
} })
if (insErr) throw insErr

let browser
try {
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1720, height: 950 } })
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 60000 })
  await sleep(6000)
  const layerSelect = async () => { for (const h of await page.$$('select')) if (await h.evaluate(el => [...el.options].some(o => o.value === '__manage__'))) return h }
  const readPlan = () => page.evaluate(() => {
    const p = [...document.querySelectorAll('svg polygon')].find(el => el.getAttribute('onclick') === null && /url\(#plan-wall-fill\)|#1f2937|#1d3557/.test(el.getAttribute('fill') ?? ''))
    return { fill: p?.getAttribute('fill'), stroke: p?.getAttribute('stroke'), dash: p?.getAttribute('stroke-dasharray'), pattern: !!document.getElementById('plan-wall-fill'),
      crossLines: document.getElementById('plan-wall-fill')?.querySelectorAll('line').length ?? 0 }
  })
  const sel = await layerSelect()
  const pick = async name => { const s = await layerSelect(); await s.select(await s.evaluate((el, n) => [...el.options].find(o => o.text === n)?.value, name)); await sleep(2000) }
  console.log('Default set plan wall:', JSON.stringify(await readPlan()))
  await pick(TEMP)
  console.log(TEMP + ' plan wall:', JSON.stringify(await readPlan()))
  await page.screenshot({ path: path.join(OUT, 'wall-layers-plan.png') })
  // Elevation: click the Elevation view button, select the first wall
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Elevation')?.click()); await sleep(3000)
  console.log('elevation return rects:', JSON.stringify(await page.evaluate(() =>
    [...document.querySelectorAll('rect')].filter(r => /return-fill|#7c3aed/.test(r.getAttribute('fill') ?? '')).map(r => r.getAttribute('fill')))))
  await page.screenshot({ path: path.join(OUT, 'wall-layers-elev.png') })
  await (await layerSelect()).select('__manage__'); await sleep(1500)
  await page.screenshot({ path: path.join(OUT, 'wall-layers-manager.png') })
} finally {
  await browser?.close()
  await sb.from('drawing_layer_sets').delete().eq('name', TEMP)
}
