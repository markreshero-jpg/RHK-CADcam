// Display layers Phase 3b: added parts split into applied / end panels, fillers and
// other added parts. Creates a temporary set hiding applied panels (plan) and
// colouring fillers, counts plan outlines per item, then deletes the set.
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? '.'
const ROOM = process.env.ROOM_ID ?? 'daf9a3e4-0d95-4982-af11-ddee1a8e11c3'
const TEMP = 'ZZ 3b test'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

await sb.from('drawing_layer_sets').delete().eq('name', TEMP)
const { error: insErr } = await sb.from('drawing_layer_sets').insert({ name: TEMP, sort_order: 99, settings: {
  plan: { items: { applied_panels: { visible: false }, fillers: { color: '#16a34a', weight: 3 } } },
} })
if (insErr) throw insErr

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1720, height: 950 } })
try {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction(() => window.__canvasApi, { timeout: 60000 })
  await sleep(6000)
  const choose = async name => {
    for (const h of await page.$$('select')) {
      const v = await h.evaluate((el, n) => [...el.options].some(o => o.value === '__manage__') ? [...el.options].find(o => o.text === n)?.value : null, name)
      if (v) { await h.select(v); await sleep(2000); return }
    }
    throw new Error('no set ' + name)
  }
  const counts = () => page.evaluate(() => {
    const c = {}
    for (const p of document.querySelectorAll('polygon[data-part="applied_panels"], polygon[data-part="fillers"], polygon[data-part="custom_panels"]'))
      c[p.dataset.part] = (c[p.dataset.part] ?? 0) + 1
    const f = document.querySelector('polygon[data-part="fillers"]')
    return { ...c, fillerStroke: f?.getAttribute('stroke') ?? null }
  })
  await choose('Full parts')
  console.log('Full parts:', JSON.stringify(await counts()))
  await choose(TEMP)
  console.log(TEMP + ':', JSON.stringify(await counts()))
  await page.screenshot({ path: path.join(OUT, 'p3b-plan.png') })
  await (await (async () => { for (const h of await page.$$('select')) if (await h.evaluate(el => [...el.options].some(o => o.value === '__manage__'))) return h })()).select('__manage__')
  await sleep(1500)
  console.log('manager panel items:', await page.evaluate(() => ['Applied / end panels', 'Fillers', 'Other added parts'].map(t => document.body.innerText.includes(t))))
  await page.screenshot({ path: path.join(OUT, 'p3b-manager.png') })
} finally {
  await browser.close()
  await sb.from('drawing_layer_sets').delete().eq('name', TEMP)
}
