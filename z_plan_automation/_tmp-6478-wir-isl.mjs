// RHK6478 Master WIR island drawers: 2 x 120 shallow (top) / 3 x 130 mid / 3 deep (rest)
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = 'e58340a6-4b68-4543-a1ca-a686b515a647'
const SH = Number(process.argv[2] ?? 120), MID = Number(process.argv[3] ?? 130)
for (const c of chk('c', await sb.from('cabinet_instances').select('id,label,face_grid').eq('room_id', R).in('label', ['BC-01', 'BC-02']))) {
  const g = c.face_grid
  g.rows = g.rows.map(r => r.row_index >= 6 ? { ...r, height_locked: true, height: SH } : r.row_index >= 3 ? { ...r, height_locked: true, height: MID } : { row_index: r.row_index, height_locked: false })
  chk('u', await sb.from('cabinet_instances').update({ face_grid: g }).eq('id', c.id))
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = (fn, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a])
  for (const l of ['BC-01', 'BC-02']) { await api('updateCabinet', l, { dz: 481.5 }); await sleep(1500) }
  const rp = await api('getResolved', 'BC-01')
  console.log('fronts', rp.face_rows.map(r => r.height).join(' / '))
  for (const s of rp.drawer_stacks ?? []) console.log(' box', JSON.stringify((s.boxes ?? s.drawers ?? []).map(b => b.box_height ?? b.height ?? b.DY)))
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
