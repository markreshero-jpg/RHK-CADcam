// RHK6547 Laundry after draw-plan (2026-11-16): join the kick under BC-01/BC-02, drop BC-02's top
// hinges under the upright sink rail, re-resolve, report issues + state.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '20601f2b-4fa7-49c1-bfff-36d1d53ed308'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const cabsNow = async () => chk('cabs', await sb.from('cabinet_instances').select('id,label,pos_x,pos_z,dx,dy,dz,kick_run_id,face_grid,internal_grid,bulkhead').eq('room_id', R))
const by = async l => (await cabsNow()).find(c => c.label === l)

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)))
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1500); return r }
try {
  await open()
  if (!(await by('BC-01')).kick_run_id) console.log('kick', JSON.stringify(await api('joinKicks', 'BC-01')))
  for (const l of ['BC-01', 'BC-02', 'WC-01']) { const c = await by(l); console.log(l, 'dy', c.dy, 'z', c.pos_z, 'kick', c.kick_run_id, 'zones', JSON.stringify(c.face_grid?.zones?.map(z => ({ t: z.face_type, h: z.hinge_side, hinges: z.hinges, handle: z.handle_id }))), 'int', JSON.stringify(c.internal_grid)) }
  const c = await by('BC-02'); const fg = structuredClone(c.face_grid)
  for (const z of fg.zones) z.hinges = [100, 646] // rail 700-780 carcass -> top hinge ~54 under it
  chk('bc02', await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', c.id))
  await open()
  console.log('re', JSON.stringify(await api('updateCabinet', 'BC-02', { dz: 580 })))
  const st = await api('getState')
  for (const x of st.cabinets) console.log(x.label, x.def ?? '', 'off', x.offset, 'dx', x.dx, 'dy', x.dy, 'dz', x.dz, 'z', x.pos_z)
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
process.exit(0)
