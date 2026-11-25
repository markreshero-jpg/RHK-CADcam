// RHK6468 Wall Panelling (Mark 2026-11-25): the five 2690 cover strips on TC-01 made from 2 x 17 American Oak veneer
// (laminated, 34 on the face) instead of 33, so no long 33 sheet is needed. Each strip -> two 17 layers, centred where
// the 33 strip was (A0 stays flush at 0). TC-02 / TC-03 strips (2386) stay 33.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const ROOM = '00e46b73-13de-4df3-9235-871505d4ee81'
const V17 = '8afde358-4ab0-4a2e-bb3c-4bbc89de9c9e', V33 = 'a8ec07f1-50df-4440-9157-686efefa56c2'
const tc01 = chk('tc01', await sb.from('cabinet_instances').select('id,notes').eq('room_id', ROOM).eq('label', 'TC-01').single())
const parts = chk('parts', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', tc01.id))
const strips = parts.filter(p => p.name.startsWith('Cover strip') && p.dz === 33 && p.material_id === V33)
for (const p of strips) console.log('before', p.name, p.orientation, p.x, p.y, p.z, '|', p.dx, p.dy, p.dz, 'edges', p.edge_top, p.edge_bottom, p.edge_left, p.edge_right, 'sort', p.sort_order)
if (strips.length !== 5) throw new Error('expected 5 strips, got ' + strips.length)
if (process.argv[2] === 'dry') process.exit(0)
let sort = Math.max(...parts.map(p => p.sort_order ?? 0))
for (const p of strips) {
  const x0 = p.x === 0 ? 0 : p.x - 0.5
  chk('upd', await sb.from('cabinet_custom_parts').update({ name: p.name + ' - layer 1 of 2 x 17', x: x0, dz: 17, material_id: V17, material_override_id: V17 }).eq('id', p.id))
  const { id: _i, created_at: _c, updated_at: _u, ...base } = p
  chk('ins', await sb.from('cabinet_custom_parts').insert({ ...base, name: p.name + ' - layer 2 of 2 x 17', x: x0 + 17, dz: 17, material_id: V17, material_override_id: V17, sort_order: ++sort }))
}
const add = ' Mark 2026-11-25: the five 2690 cover strips on this wall = 2 x 17 AO laminated (34 on the face), not 33.'
if (!tc01.notes?.includes('2 x 17 AO laminated')) chk('note', await sb.from('cabinet_instances').update({ notes: (tc01.notes ?? '') + add }).eq('id', tc01.id))

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
  for (const p of rp?.custom_parts ?? []) if (/Cover strip/.test(p.name)) console.log('  ', p.name, p.x, p.y, p.z, '|', p.dx, p.dy, p.dz, p.material_id?.slice(0, 8))
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
