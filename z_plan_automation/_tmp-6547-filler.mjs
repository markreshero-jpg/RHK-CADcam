// RHK6547 Laundry rev 3 (Mark 2026-11-16): 18 wall filler (BFK, side-on board) at the right wall,
// BC-02 1000 -> 982, kick re-joined, sink + tap re-centred on BC-02 (1681).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '20601f2b-4fa7-49c1-bfff-36d1d53ed308'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const cabsNow = async () => chk('cabs', await sb.from('cabinet_instances').select('id,label,pos_x,pos_z,dx,dy,dz,kick_run_id,has_toekick,face_grid').eq('room_id', R))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)))
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1500); return r }
try {
  await open()
  const bc02 = (await cabsNow()).find(c => c.label === 'BC-02')
  if (bc02.dx !== 982) {
    console.log('bc02', JSON.stringify(await api('updateCabinet', 'BC-02', { dx: 982 })))
  }
  let fil = (await cabsNow()).find(c => c.dx === 18 && c.label.startsWith('BC') && c.label !== 'BC-01')
  if (!(await cabsNow()).some(c => Math.abs(c.dx - 18) < 0.1 && c.label.startsWith('BC'))) {
    console.log('place', JSON.stringify(await api('placeCabinet', { def: 'BFK', wall: 'Wall 2', offset: 2172, dx: 18 })))
  }
  await open()
  for (const c of await cabsNow()) console.log(c.label, 'x', c.pos_x, 'z', c.pos_z, 'dx', c.dx, 'dy', c.dy, 'dz', c.dz, 'kick', c.kick_run_id, c.has_toekick)
  console.log('join', JSON.stringify(await api('joinKicks', 'BC-01')))
  await open()
  const st = await api('getState')
  for (const x of st.cabinets) console.log(x.label, 'off', x.offset, 'dx', x.dx, 'dy', x.dy, 'dz', x.dz, 'z', x.pos_z)
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
// sink + tap re-centre on BC-02 (1190 + 491)
const CX = 1681
for (const f of chk('fx', await sb.from('room_fixtures').select('id,name,width').eq('room_id', R)))
  chk('mv', await sb.from('room_fixtures').update({ x: CX - f.width / 2 }).eq('id', f.id))
for (const c of await cabsNow()) console.log(c.label, 'z', c.pos_z, 'dx', c.dx, 'dy', c.dy, 'kick', c.kick_run_id)
process.exit(0)
