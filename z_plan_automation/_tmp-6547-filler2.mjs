// RHK6547: add the BFK 18 (BC-03) to KICK 1's run like Join Kicks does (dy 782 over the kick, pos_z 100), re-resolve.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '20601f2b-4fa7-49c1-bfff-36d1d53ed308'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const cabs = async () => chk('cabs', await sb.from('cabinet_instances').select('id,label,pos_x,pos_z,dx,dy,dz,kick_run_id,has_toekick,notes').eq('room_id', R))
const all = await cabs(), bc01 = all.find(c => c.label === 'BC-01'), fil = all.find(c => c.label === 'BC-03')
chk('fil', await sb.from('cabinet_instances').update({ kick_run_id: bc01.kick_run_id, has_toekick: false, pos_z: 100, dy: 782, notes: 'Wall filler 18 (side-on), right wall' }).eq('id', fil.id))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)))
const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1500); return r }
try {
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  for (const l of ['BC-03', 'BC-02', 'KICK 1']) console.log('re', l, JSON.stringify(await api('updateCabinet', l, { dz: l === 'BC-03' ? 560 : 580 })))
  const r = await api('getResolved', 'BC-03')
  console.log('parts', JSON.stringify((r?.parts ?? []).map(p => [p.name, p.x, p.y, p.z, p.dx, p.dy, p.dz])))
  const k = await api('getResolved', 'KICK 1')
  console.log('kick parts', JSON.stringify((k?.parts ?? []).map(p => [p.name, p.x, p.dx, p.dy, p.dz])))
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
for (const c of await cabs()) console.log(c.label, 'x', c.pos_x, 'z', c.pos_z, 'dx', c.dx, 'dy', c.dy, 'dz', c.dz, 'kick', !!c.kick_run_id)
process.exit(0)
