// RHK6592 rev 17 (Mark 2026-11-05): kitchen WC-03 -> rangehood cabinet for the Bosch DHL555BAU (53cm half-integrated,
// recirculating DHZ5605). 380 deep (was 300), height kept (1505-2200). WRH rangehood block: hole 500 x 347 at 16.5 from the front, so the 380 flange sits flush with the carcass and the hole clears the back (Bosch
// cut-out 500-3 x 350-3, min 15 to the front), flue notch 200 x 250 in the fixed shelf + top, shelf 350.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (m, r) => { if (r.error) throw new Error(m + ': ' + r.error.message); console.log('ok', m); return r.data }
const KIT = 'dc7a22f3-ed0b-4771-a42e-4548fc4de1e1'
chk('WC-03 rangehood', await sb.from('cabinet_instances').update({
  rangehood: { hole: { w: 500, d: 347, setback: 16.5, offset: 0, radius: 0 }, flue: { w: 200, d: 250, offset: 0 }, shelf_h: 350 },
  internal_grid: { tree: { type: 'open', fittings: [{ type: 'fixed_shelf', y_locked: false }] } },
  notes: 'Rangehood cabinet: Bosch DHL555BAU 53cm half-integrated (recirculating, DHZ5605). Cut-out 500 x 347. 380 deep.',
}).eq('room_id', KIT).eq('label', 'WC-03'))

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
const sleep = ms => new Promise(r => setTimeout(r, ms))
try {
  const page = await browser.newPage()
  page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  const open = async () => { await page.goto(`http://localhost:3001/canvas/${KIT}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi'); await sleep(1500) }
  await open()
  console.log(JSON.stringify(await page.evaluate(() => window.__canvasApi.updateCabinet('WC-03', { dz: 380 }))))
  await sleep(1500); await open()
  const r = await page.evaluate(async () => { const x = await window.__canvasApi.getResolved('WC-03')
    return { dz: x?.DZ, case: (x?.case_parts ?? []).map(p => [p.part_key, p.DX, p.DY, p.DZ, (p.cutouts ?? []).length]), int: (x?.internal_parts ?? []).map(p => [p.part_type, p.Y, p.DX, p.DY]),
      hole: x?.rangehood_hole, err: [...(x?.errors ?? []), ...(x?.warnings ?? [])].map(e => e.code + ' ' + e.message) } })
  console.log(JSON.stringify(r, null, 1))
  for (const x of await page.evaluate(() => window.__canvasApi.getIssues())) if (x.errors.length || x.warnings.length) console.log(x.label, JSON.stringify([...x.errors, ...x.warnings].map(e => e.code + ' ' + e.message)))
} finally { await browser.close() }
