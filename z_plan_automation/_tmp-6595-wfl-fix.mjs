// RHK6595: size the two WF-L fillers (WC-15 left, WC-16 right) to WC-10 (436 high x 690 deep), 18 Sublime Teak,
// neighbour types (wall | filler | WC-10 | filler | wall), then resolve through the canvas API and report the cut L.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ROOM = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb', TEAK18 = 'd67d85b0-b12b-4b03-be3c-8bdbbf23cd11'
const id = { 'WC-15': '71c8d429-09ca-4a16-94ef-08954fd478fb', 'WC-16': '9f275edf-0e4c-43ae-9202-281293097ffa', 'WC-10': '4fe005a9-0d87-4364-a726-c91ad372724d' }
const up = async (l, patch) => console.log(l, (await sb.from('cabinet_instances').update(patch).eq('id', id[l])).error?.message ?? 'ok')
await up('WC-15', { material_overrides: { exposed: TEAK18 }, left_neighbour_type: 'wall', right_neighbour_type: 'cabinet' })
await up('WC-16', { material_overrides: { exposed: TEAK18 }, left_neighbour_type: 'cabinet', right_neighbour_type: 'wall' })
await up('WC-10', { left_neighbour_type: 'cabinet', right_neighbour_type: 'cabinet' })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const api = (page, fn, ...a) => page.evaluate((fn, a) => window.__canvasApi[fn](...a), fn, a)
try {
  const page = await browser.newPage()
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(3000)
  for (const l of ['WC-15', 'WC-16']) { await api(page, 'updateCabinet', l, { dy: 436, dz: 690 }); await sleep(3000) }
  await api(page, 'updateCabinet', 'WC-10', { dy: 436 }); await sleep(3000)
  for (const l of ['WC-15', 'WC-16', 'WC-10']) {
    const rp = await api(page, 'getResolved', l)
    const cp = rp?.custom_parts?.[0]
    console.log(l, cp ? `part ${cp.dx}x${cp.dy}x${cp.dz} ${cp.orientation} mat ${cp.material_id} outline ${JSON.stringify(cp.outline)}` : `case ${rp?.case_parts?.length}`,
      'warn', JSON.stringify((rp?.warnings ?? []).map(w => w.message)), 'err', JSON.stringify((rp?.errors ?? []).map(e => e.message)))
  }
} finally { await browser.close() }
