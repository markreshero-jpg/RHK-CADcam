// RHK6339 J02 (Mark 2026-11-11): 35 shadow lines = set-back veneer fillers each side (TFKW 35, face flush with the
// carcass front, 19 behind the doors) + BH 35 at the ceiling, fascia flush with the carcass (set back). Kick joined.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '67a27d07-1012-4537-a58d-5d3b50764221', WALL2 = 'ee94609e-e7a3-4a3f-8f1d-2e6979a410eb'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const have = (await sb.from('cabinet_instances').select('label').eq('room_id', R)).data.map(c => c.label)
console.log('have', have)

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const want = [['TFKW', 0, 35, 2665, 421], ['TFKW', 785, 35, 2665, 421], ['BH', 0, 820, 35, 421]]
  const getCabs = async () => (await sb.from('cabinet_instances').select('id,label,cabinet_definition_id,dx,dy,dz').eq('room_id', R)).data
  const defId = Object.fromEntries((await sb.from('cabinet_definitions').select('id,name').in('name', ['TFKW', 'BH'])).data.map(d => [d.name, d.id]))
  let cabs = await getCabs()
  const used = new Set()
  for (const [def, offset, dx, dy, dz] of want) {
    let c = cabs.find(c => c.cabinet_definition_id === defId[def] && !used.has(c.id))
    if (!c) {
      const before = new Set(cabs.map(c => c.id))
      console.log('place', def, JSON.stringify(await page.evaluate((a) => window.__canvasApi.placeCabinet(a), { def, wall: WALL2, offset, dx }))); await sleep(2500)
      cabs = await getCabs(); c = cabs.find(c => !before.has(c.id))
    }
    used.add(c.id)
    console.log(' upd', c.label, JSON.stringify(await page.evaluate((l, d) => window.__canvasApi.updateCabinet(l, d), c.label, { dx, dy, dz, offset }))); await sleep(2500)
    cabs = await getCabs()
  }
  const st = await page.evaluate(() => window.__canvasApi.getState())
  console.log(JSON.stringify(st.cabinets.map(c => [c.label, c.def ?? c.definition_name, c.offset, c.dx, c.dy, c.dz])))
} finally { await browser.close() }
