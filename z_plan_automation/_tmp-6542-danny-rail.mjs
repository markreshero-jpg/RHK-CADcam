// Hanging rails hang at the centre-pillar drop (Mark 2026-11-03, standard). Finista pillars: 71.5 overall,
// rail centre ~53.5 below the shelf (photo: ~3 wire ring around the 15 x 30 rail). Danny's Robe rails unlocked.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DROP = 53.5
for (const [id, extra] of [['4b8e3a1c-454e-4ea5-8767-d3b4d15c4743', ''], ['81583c05-d3b1-4ced-bf0c-9f8e3c36a0d2', '; closed end']]) {
  const r = await sb.from('hardware_accessories').update({ height_mm: DROP,
    notes: `Nominal 40 base, 71.5 overall (LS page), 28.5 hole centre. Rail centre ${DROP} below the shelf (height_mm) = 71.5 - ~3 ring wire - 15 half rail, read off the photo (no section drawing published) - check on a real one${extra}. Every hanging rail hangs at this drop (Mark 2026-11-03).` }).eq('id', id).select('name,height_mm')
  console.log(r.error?.message ?? JSON.stringify(r.data))
}
const R = '830e087b-d817-4843-b766-5fbdd8ee6c4a'
const cabs = (await sb.from('cabinet_instances').select('id,label,internal_grid').eq('room_id', R)).data
const labels = []
const walk = n => { if (!n) return 0; let k = 0
  for (const f of n.section?.fittings ?? n.fittings ?? []) if (f.key === 'HANGING_RAIL_OVAL') { f.y_locked = false; delete f.y_position; k++ }
  for (const c of n.children ?? []) k += walk(c); if (n.section && n.section !== n) k += walk(n.section.tree ?? null); return k }
for (const c of cabs) {
  if (!c.internal_grid?.tree) continue
  const g = structuredClone(c.internal_grid)
  if (walk(g.tree)) { labels.push(c.label); console.log(c.label, (await sb.from('cabinet_instances').update({ internal_grid: g }).eq('id', c.id)).error?.message ?? 'unlocked') }
}
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
const rails = {}
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' }); page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  for (const l of labels) { await page.evaluate(l => window.__canvasApi.updateCabinet(l, { dz: 580 }), l); await sleep(2500) }
  for (const l of labels) {
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    const top = rp.case_parts.find(p => p.part_key === 'top' || p.part_key === 'full_top' || /top/.test(p.part_key))
    for (const p of rp.internal_parts.filter(p => p.part_type === 'accessory' || p.part_type === 'rail_support')) console.log(l, p.part_type, p.accessory?.role ?? '', 'Y', p.Y, 'DZ', p.DZ, 'centre', p.Y + p.DZ / 2, 'top part', top?.part_key, top?.Y)
    const r = rp.internal_parts.find(p => p.part_type === 'accessory'); if (r) rails[l] = r.Y
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) console.log(`  ${ci.label} ${e.code}: ${e.message}`)
  console.log('errors', issues.reduce((a, c) => a + c.errors.length, 0))
} finally { await browser.close() }
// Move the HANGING RAIL notes with the rails (text top 20 under the rail bottom AFF, 80 kick).
const ys = Object.values(rails)
if (ys.length) {
  const y = -(ys[0] + 80 - 20)
  const notes = (await sb.from('room_annotations').select('id,geom').eq('room_id', R).eq('text', 'HANGING RAIL')).data
  for (const n of notes) await sb.from('room_annotations').update({ geom: { ...n.geom, at: { ...n.geom.at, y } } }).eq('id', n.id)
  console.log('notes', notes.length, 'y', y)
}
