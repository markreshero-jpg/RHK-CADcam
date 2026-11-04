// RHK6478 Study (Mark 2026-11-05): BC-08 file drawers - bottom front locked 350, top drawer takes the rest; kick back to 100 (TOEH).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'a04663c7-1402-4344-be00-3ad4ce3aeae9'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const c = chk('c', await sb.from('cabinet_instances').select('id,face_grid,dz,rule_overrides').eq('room_id', R).eq('label', 'BC-08'))[0]
const ro = { ...(c.rule_overrides ?? {}), TOEH: 100 }
const fg = { ...c.face_grid, rows: c.face_grid.rows.map(r => r.row_index === 0 ? { ...r, height_locked: true, height: 350 } : r) }
chk('fg', await sb.from('cabinet_instances').update({ face_grid: fg, rule_overrides: ro }).eq('id', c.id))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => d.dismiss())
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message); await sleep(1500); return r }
try {
  await open()
  console.log(JSON.stringify(await api('updateCabinet', 'BC-08', { dz: c.dz })))
  await open()
  const rp = await api('getResolved', 'BC-08')
  console.log(JSON.stringify(rp.face_zones.map(z => ['face', z.face_type, z.DX, z.DY, z.Y])))
  console.log(JSON.stringify((rp.drawer_boxes ?? rp.drawers ?? []).map(d => [d.height ?? d.DY, d.Y ?? d.y_position, d.slide_name ?? d.name])))
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
