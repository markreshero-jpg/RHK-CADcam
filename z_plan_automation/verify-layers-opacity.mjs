// Display layers: per-item opacity. Creates a temporary set (plan: gables 25%,
// cabinet names 50%), reads the rendered opacity attributes, screenshots the plan
// and the Layer Manager row, then deletes the set.
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? 'daf9a3e4-0d95-4982-af11-ddee1a8e11c3'
const TEMP = 'ZZ opacity test'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

await sb.from('drawing_layer_sets').delete().eq('name', TEMP)
const { error: insErr } = await sb.from('drawing_layer_sets').insert({ name: TEMP, sort_order: 99, settings: {
  plan: { items: { carcass_gables: { opacity: 0.25 }, cabinet_labels: { opacity: 0.5 } } },
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
  const read = () => page.evaluate(() => ({
    gable: document.querySelector('polygon[data-part="left_side"]')?.getAttribute('opacity'),
    bottom: document.querySelector('polygon[data-part="bottom"]')?.getAttribute('opacity'),
    label: [...document.querySelectorAll('svg text')].find(t => /^BC-/.test(t.textContent.trim()))?.getAttribute('opacity'),
  }))
  const sel = await layerSelect()
  await sel.select(await sel.evaluate(el => [...el.options].find(o => o.text === 'Full parts')?.value)); await sleep(1500)
  console.log('Full parts opacities:', JSON.stringify(await read()))
  await sel.select(await sel.evaluate((el, n) => [...el.options].find(o => o.text === n)?.value, TEMP)); await sleep(2000)
  console.log(TEMP + ' opacities:', JSON.stringify(await read()))
  await page.screenshot({ path: path.join(OUT, 'opacity-plan.png') })
  await (await layerSelect()).select('__manage__'); await sleep(1500)
  await page.screenshot({ path: path.join(OUT, 'opacity-manager.png') })
} finally {
  await browser?.close()
  await sb.from('drawing_layer_sets').delete().eq('name', TEMP)
}
