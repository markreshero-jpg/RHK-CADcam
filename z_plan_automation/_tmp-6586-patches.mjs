// RHK6586 Sliding Door Patches: 30 loose arch patches 95 W x 115 H, semicircle top R47.5, 3mm MDF,
// laid 6 x 5 on the TC-01 carrier (front orientation), each with a custom_<id> shape override.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = 'af81945a-35e3-4de1-9342-8593ad96d376', MDF3 = '9e6a1484-69e6-4f19-9365-93952a1f52a7'
const W = 95, H = 115, T = 3, N = 30, COLS = 6, GAP = 10, r = W / 2
const sleep = ms => new Promise(res => setTimeout(res, ms))
const cab = chk('cab', await sb.from('cabinet_instances').select('*').eq('room_id', R).eq('label', 'TC-01').single())
const parts = chk('parts', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', cab.id).order('sort_order'))
if (parts.length !== 1) throw new Error('expected 1 custom part, got ' + parts.length)
const base = parts[0]
// display frame: x across, y down from the top
const segs = [
  { type: 'line', p0: { x: 0, y: H }, p1: { x: 0, y: r } },
  { type: 'arc', p0: { x: 0, y: r }, p1: { x: W, y: r }, rx: r, ry: r, largeArc: 0, sweep: 1 },
  { type: 'line', p0: { x: W, y: r }, p1: { x: W, y: H } },
  { type: 'line', p0: { x: W, y: H }, p1: { x: 0, y: H } },
]
const meta = { bounds: { minX: 0, minY: 0, maxX: W, maxY: H }, closed: true, sizeSlots: { up: 'dy', across: 'dx', custom: true }, baseAtSave: { w: W, h: H }, segmentCount: segs.length }
const row = i => ({ name: `Sliding door patch ${i + 1} of ${N}`, expressions: {}, orientation: 'front', x: (i % COLS) * (W + GAP), y: Math.floor(i / COLS) * (H + GAP), z: 0,
  dx: W, dy: H, dz: T, material_id: MDF3, material_override_id: MDF3, grain_across: false, edge_top: false, edge_bottom: false, edge_left: false, edge_right: false, sort_order: i })
chk('p1', await sb.from('cabinet_custom_parts').update(row(0)).eq('id', base.id))
const { id, created_at, updated_at, ...tmpl } = base
const added = chk('ins', await sb.from('cabinet_custom_parts').insert(Array.from({ length: N - 1 }, (_, k) => ({ ...tmpl, ...row(k + 1) }))).select('id'))
const ids = [base.id, ...added.map(a => a.id)]
chk('del pso', await sb.from('part_shape_overrides').delete().eq('cabinet_id', cab.id))
chk('pso', await sb.from('part_shape_overrides').insert(ids.map(pid => ({ cabinet_id: cab.id, part_key: 'custom_' + pid, revision: 1, segments: segs, meta }))))
chk('cab', await sb.from('cabinet_instances').update({ notes: `LOOSE: ${N} x sliding door patch 95 W x 115 H, arch top R47.5, 3mm MDF (Milross 109)` }).eq('id', cab.id))
chk('room', await sb.from('rooms').update({ notes: 'Sliding door patches: 30 x 95 x 115 arch top, 3mm MDF, from Mark\'s sketch 2026-11-26', annotation_scale: 10 }).eq('id', R))

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  const api = async (fn, ...a) => { const x = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1500); return x }
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  console.log(JSON.stringify(await api('updateCabinet', 'TC-01', { dx: COLS * (W + GAP) - GAP, dy: 5 * (H + GAP) - GAP, dz: T })))
  const rp = await api('getResolved', 'TC-01')
  console.log('custom', (rp.custom_parts ?? []).length, JSON.stringify((rp.custom_parts ?? []).slice(0, 2).map(p => [p.name, p.dx ?? p.DX, p.dy ?? p.DY, p.dz ?? p.DZ, p.material_id])))
  const issues = await api('getIssues'); for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) console.log(ci.label, e.code, e.message)
} finally { await browser.close() }
const after = chk('chk', await sb.from('cabinet_custom_parts').select('id,dx,dy,dz,material_override_id').eq('cabinet_instance_id', cab.id))
console.log('rows', after.length, [...new Set(after.map(p => `${p.dx}x${p.dy}x${p.dz} ${p.material_override_id === MDF3 ? 'MDF3' : p.material_override_id}`))])
process.exit(0)
