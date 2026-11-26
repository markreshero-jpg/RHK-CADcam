// RHK6586 Sliding Door Patches (Mark 2026-11-26): one piece only (qty set in the optimiser), top corners R47.5.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = 'af81945a-35e3-4de1-9342-8593ad96d376', W = 95, H = 115, T = 3, RAD = 47.5
const sleep = ms => new Promise(res => setTimeout(res, ms))
const cab = chk('cab', await sb.from('cabinet_instances').select('id').eq('room_id', R).eq('label', 'TC-01').single())
const parts = chk('parts', await sb.from('cabinet_custom_parts').select('id,sort_order').eq('cabinet_instance_id', cab.id).order('sort_order'))
const keep = parts[0], drop = parts.slice(1).map(p => p.id)
if (drop.length) {
  chk('del pso', await sb.from('part_shape_overrides').delete().eq('cabinet_id', cab.id).in('part_key', drop.map(id => 'custom_' + id)))
  chk('del parts', await sb.from('cabinet_custom_parts').delete().in('id', drop))
}
chk('keep', await sb.from('cabinet_custom_parts').update({ name: 'Sliding door patch', x: 0, y: 0, z: 0 }).eq('id', keep.id))
// display frame: x across, y down from the top; R47.5 on both top corners, clockwise on screen
const segs = [
  { type: 'line', p0: { x: 0, y: H }, p1: { x: 0, y: RAD } },
  { type: 'arc', p0: { x: 0, y: RAD }, p1: { x: RAD, y: 0 }, rx: RAD, ry: RAD, largeArc: 0, sweep: 1 },
  { type: 'line', p0: { x: RAD, y: 0 }, p1: { x: W - RAD, y: 0 } },
  { type: 'arc', p0: { x: W - RAD, y: 0 }, p1: { x: W, y: RAD }, rx: RAD, ry: RAD, largeArc: 0, sweep: 1 },
  { type: 'line', p0: { x: W, y: RAD }, p1: { x: W, y: H } },
  { type: 'line', p0: { x: W, y: H }, p1: { x: 0, y: H } },
].filter(s => s.type === 'arc' || Math.hypot(s.p1.x - s.p0.x, s.p1.y - s.p0.y) > 1e-6)
chk('pso', await sb.from('part_shape_overrides').update({ segments: segs, meta: { bounds: { minX: 0, minY: 0, maxX: W, maxY: H }, closed: true, sizeSlots: { up: 'dy', across: 'dx', custom: true }, baseAtSave: { w: W, h: H }, segmentCount: segs.length } }).eq('cabinet_id', cab.id).eq('part_key', 'custom_' + keep.id))
chk('cab', await sb.from('cabinet_instances').update({ notes: 'LOOSE: sliding door patch 95 W x 115 H, top corners R47.5, 3mm MDF - qty 30, set in the optimiser (Milross 109)' }).eq('id', cab.id))
chk('room', await sb.from('rooms').update({ notes: 'Sliding door patch 95 x 115, top corners R47.5, 3mm MDF. One piece drawn: Mark sets qty 30 in the optimiser (2026-11-26)' }).eq('id', R))
const ann = chk('ann', await sb.from('room_annotations').select('id').eq('room_id', R).eq('view', 'elevation').eq('kind', 'text'))
for (const a of ann) chk('note', await sb.from('room_annotations').update({ text: 'SLIDING DOOR PATCH\nQTY x30 (SET IN OPTIMISER)\n95W x 115H, TOP CORNERS R47.5\n3mm MDF', geom: { at: { x: 0, y: -(H + 260) }, width: 40 } }).eq('id', a.id))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  const api = async (fn, ...a) => { const x = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1500); return x }
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  console.log(JSON.stringify(await api('updateCabinet', 'TC-01', { dx: W, dy: H, dz: T })))
  const rp = await api('getResolved', 'TC-01')
  console.log('custom', JSON.stringify((rp.custom_parts ?? []).map(p => [p.name, p.dx ?? p.DX, p.dy ?? p.DY, p.dz ?? p.DZ])))
  const issues = await api('getIssues'); for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) console.log(ci.label, e.code, e.message)
} finally { await browser.close() }
process.exit(0)
