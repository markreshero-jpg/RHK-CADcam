// RHK6478 Study fix-up: Teak fronts are 16.5 -> carcasses 476.5 (495 o/a) / 576.5 (595 o/a); half-mm desk offsets;
// under panels 16.5 (Teak never 18) + overhead scribe 16.5.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'a04663c7-1402-4344-be00-3ad4ce3aeae9'
const cabsNow = async () => chk('cabs', await sb.from('cabinet_instances').select('id,label,rule_overrides,pos_x,pos_y,pos_z,dx,dy,dz').eq('room_id', R))
const sleep = ms => new Promise(r => setTimeout(r, ms))
let cabs = await cabsNow()
const C = l => cabs.find(c => c.label === l)
console.log('before', ['BC-08', 'BC-09', 'BC-10', 'WC-11', 'WC-19'].map(l => JSON.stringify(C(l))).join('\n'))
// half-mm desk offsets (Wall 3 runs +x from x 0)
for (const [l, x] of [['BC-08', 1258.5], ['BC-09', 1763.5], ['BC-10', 3005.5]]) chk(l, await sb.from('cabinet_instances').update({ pos_x: x }).eq('id', C(l).id))
for (const l of ['WC-11', 'WC-12', 'WC-13', 'WC-14', 'WC-15']) chk(l, await sb.from('cabinet_instances').update({ rule_overrides: { ...(C(l).rule_overrides ?? {}), SCRBT: 16.5 } }).eq('id', C(l).id))
for (const l of ['WC-19', 'WC-20']) chk(l, await sb.from('cabinet_instances').update({ dy: 16.5 }).eq('id', C(l).id))

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1200); return r }
try {
  await open()
  for (const l of ['BC-01', 'BC-02', 'BC-03', 'BC-04', 'BC-05', 'KICK 1']) console.log(l, JSON.stringify(await api('updateCabinet', l, { dz: 476.5 })))
  for (const l of ['BC-06', 'BC-07', 'BC-08', 'BC-09', 'BC-10']) console.log(l, JSON.stringify(await api('updateCabinet', l, { dz: 576.5 })))
  for (const l of ['WC-11', 'WC-12', 'WC-13', 'WC-14', 'WC-15', 'WC-19', 'WC-20']) await api('updateCabinet', l, { dz: (await cabsNow()).find(c => c.label === l).dz })
  await open()
  cabs = await cabsNow()
  for (const c of cabs.sort((a, b) => a.label.localeCompare(b.label))) console.log(c.label, c.pos_x, c.pos_y, c.pos_z, c.dx, c.dy, c.dz, JSON.stringify(c.rule_overrides ?? {}))
  for (const l of ['BC-02', 'BC-10', 'WC-11', 'WC-12', 'WC-19']) {
    const rp = await api('getResolved', l)
    console.log(l, JSON.stringify([...(rp.case_parts ?? []).map(p => [p.part_key, p.DX, p.DY, p.DZ]), ...(rp.face_zones ?? []).map(z => ['face', z.DX, z.DY, z.DZ]), ...(rp.custom_parts ?? []).map(p => [p.name, p.DX, p.DY, p.DZ, p.Z])]))
  }
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
