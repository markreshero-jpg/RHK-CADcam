// RHK6468 Wall Panelling (Mark 2026-11-17): TC-01 garage door leaf 33 -> 17 American Oak veneer, same as the panels.
// Face stays flush with the panel face (panels z 0..17, so the leaf now sits z 0..17).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const ROOM = '00e46b73-13de-4df3-9235-871505d4ee81'
const tc01 = chk('tc01', await sb.from('cabinet_instances').select('id,notes').eq('room_id', ROOM).eq('label', 'TC-01').single())
const parts = chk('parts', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', tc01.id))
const panel = parts.find(p => p.name === 'Panel A1'), door = parts.find(p => p.name.startsWith('Garage door'))
console.log('panel', panel.z, panel.dz, panel.material_id, panel.material_override_id)
console.log('door before', door.name, door.z, door.dz, door.material_id)
const DRY = process.argv[2] === 'dry'
if (DRY) process.exit(0)
chk('door', await sb.from('cabinet_custom_parts').update({ name: 'Garage door leaf (flush hinged, 17)', z: panel.z, dz: panel.dz,
  material_id: panel.material_id, material_override_id: panel.material_override_id ?? panel.material_id }).eq('id', door.id))
if (tc01.notes?.includes('33 American Oak veneer'))
  chk('note', await sb.from('cabinet_instances').update({ notes: tc01.notes.replace('FLUSH HINGED door, 33 American Oak veneer', 'FLUSH HINGED door, 17 American Oak veneer (same as the panels, Mark 2026-11-17)') }).eq('id', tc01.id))

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
const open = async () => { await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(90000).then(() => 'TIMEOUT')]); await sleep(1200); return r }
try {
  await open()
  const st = await api('getState')
  const c = st.cabinets.find(c => c.label === 'TC-01')
  console.log('re-resolve', JSON.stringify(await api('updateCabinet', c.id, { dz: c.dz })))
  await open()
  const rp = await api('getResolved', tc01.id)
  for (const p of rp?.custom_parts ?? []) if (/Garage|Panel A1$/.test(p.name)) console.log('  ', p.name, p.x, p.y, p.z, '|', p.dx, p.dy, p.dz, p.material_id)
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
