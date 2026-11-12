// RHK6339 J07: TC-02 middle hinge off the shelf holes after the +80; top edges + LED route; checks.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '3bd26e44-cc9a-4c6f-bbae-a4fa0d59aeef', MID = Number(process.argv[2] ?? 850)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const cabs = chk('c', await sb.from('cabinet_instances').select('id,label,pos_z,dy,face_grid').eq('room_id', R))
for (const c of cabs.filter(c => ['TC-01', 'TC-02', 'WC-01', 'WC-02', 'TC-03'].includes(c.label))) console.log(c.label, 'pos_z', c.pos_z, 'dy', c.dy)
const tc2 = cabs.find(c => c.label === 'TC-02')
const zones = tc2.face_grid.zones.map(z => ({ ...z, hinges: [z.hinges[0], MID, z.hinges[2]] }))
chk('fg', await sb.from('cabinet_instances').update({ face_grid: { ...tc2.face_grid, zones } }).eq('id', tc2.id))
const top = cabs.find(c => c.label === 'WC-02')
const cp = chk('cp', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', top.id))
for (const p of cp) console.log(JSON.stringify({ id: p.id, name: p.name, o: p.orientation, x: p.x, y: p.y, z: p.z, dx: p.dx, dy: p.dy, dz: p.dz, e: [p.edge_top, p.edge_bottom, p.edge_left, p.edge_right], ex: p.expressions, mo: p.material_override_id }))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
try {
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = (fn, ...a) => page.evaluate((fn, a) => window.__canvasApi[fn](...a), fn, a)
  await api('updateCabinet', 'TC-02', { dz: 286 }); await sleep(3000)
  for (const ci of await api('getIssues')) for (const e of [...ci.errors, ...ci.warnings]) console.log(' ', ci.label, e.code, e.message)
} finally { await browser.close() }
