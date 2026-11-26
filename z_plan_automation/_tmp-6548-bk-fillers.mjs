// RHK6548 Back Kitchen (Mark 2026-11-27): fillers either side of the whiteboard tall, cabinet adjusted to suit.
// 665 opening = 30 TFFW + 605 TC-01 + 30 TFFW (face fillers in the door plane, to the floor - no kicks on this job).
// node _tmp-6548-bk-fillers.mjs [filler width]
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const BK = 'e8b3c950-5be5-4e4a-9117-451395e9d2a1', OPEN = 665, F = Number(process.argv[2] ?? 30)
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const open = async () => {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${BK}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  return page
}
try {
  let page = await open()
  const api = (fn, ...a) => page.evaluate((fn, a) => window.__canvasApi[fn](...a), fn, a)
  const have = (await api('getState')).cabinets
  console.log(JSON.stringify(await api('updateCabinet', 'TC-01', { dx: OPEN - 2 * F, offset: F }))); await sleep(4000)
  const fillers = have.filter(c => c.label !== 'TC-01')
  if (!fillers.length) {
    console.log(JSON.stringify(await api('placeCabinet', { def: 'TFFW', wall: 'Wall 2', offset: 0, dx: F }))); await sleep(4000)
    console.log(JSON.stringify(await api('placeCabinet', { def: 'TFFW', wall: 'Wall 2', offset: OPEN - F, dx: F }))); await sleep(4000)
  }
  await page.close()
  // Fillers: full height, no kick
  for (const c of chk('f', await sb.from('cabinet_instances').select('id,label,dy,has_toekick,pos_z').eq('room_id', BK).neq('label', 'TC-01')))
    chk('fill', await sb.from('cabinet_instances').update({ dy: 2320, has_toekick: false, pos_z: 0, kick_run_id: null }).eq('id', c.id))
  page = await open()
  for (const ci of await page.evaluate(() => window.__canvasApi.getIssues())) console.log(ci.label, ci.dims, JSON.stringify([...ci.errors, ...ci.warnings].map(e => e.code + ' ' + e.message)))
  console.log(JSON.stringify((await page.evaluate(() => window.__canvasApi.getState())).cabinets.map(c => [c.label, c.offset, c.dx, c.dy, c.dz])))
  await page.close()
} finally { await browser.close() }
process.exit(0)
