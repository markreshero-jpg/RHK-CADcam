// RHK6571 Kitchen: overheads 600 clear off the bench (Mark 2026-11-18): bench 900 -> underside 1500, tops stay 2180
// = 680 high incl the 16.5 under panel. Under panels pos_z 1470 -> 1500. WC-03 duct hole centre 385 -> 380 up
// (hole 1780-1980 AFF: over the hood top ~1773, under the 2000 brick line); shelf stays 500 up.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '5a1ef0f2-d86e-4c67-8b0e-df4a80dd09c3'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const w3 = chk('q', await sb.from('cabinet_instances').select('id,rangehood').eq('room_id', R).eq('label', 'WC-03').single())
chk('wc03', await sb.from('cabinet_instances').update({ rangehood: { ...w3.rangehood, duct: { ...w3.rangehood.duct, h: 380 } } }).eq('id', w3.id))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(5000)
  const api = async (f, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [f, a]); await sleep(1800); return r }
  for (const l of ['WC-13', 'WC-14', 'WC-15', 'WC-16']) await api('updateCabinet', l, { pos_z: 1500 })
  for (const l of ['WC-01', 'WC-02', 'WC-03', 'WC-04', 'WC-05', 'WC-06', 'WC-07', 'WC-08', 'WC-09', 'WC-10', 'WC-11', 'WC-12']) await api('updateCabinet', l, { dy: 680 })
  for (const l of ['WC-13', 'WC-14', 'WC-15', 'WC-16']) await api('updateCabinet', l, { pos_z: 1500 })   // re-cut after the cabinets moved
  const r3 = await api('getResolved', 'WC-03')
  console.log('WC-03 back hole', JSON.stringify(r3.case_parts.filter(p => p.part_key === 'back').map(p => [p.DX, p.Y, JSON.stringify(p.cutouts)])), 'shelves', JSON.stringify(r3.internal_parts.map(p => [p.part_type, p.Y])), 'doors', JSON.stringify(r3.face_zones.map(z => [z.face_type, z.DY, z.Y])))
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) console.log('  ISSUE', ci.label, e.code, e.message)
} finally { await browser.close() }
// Note text follows.
const sn = chk('sn', await sb.from('room_annotations').select('id,text').eq('id', '0c85e031-51c7-428e-a8ed-d9353d7361c5').single())
chk('snu', await sb.from('room_annotations').update({ text: sn.text.replace('Overheads 1470 to 2180 (710 high), beams @ 2190', 'Overheads 1500 to 2180 (680 high) - 600 clear over the bench, beams @ 2190') }).eq('id', sn.id))
const sq = chk('sq', await sb.from('room_annotations').select('id,text').eq('id', '5eafff53-f20a-4e19-b5e8-2a063a29f95f').single())
chk('squ', await sb.from('room_annotations').update({ text: sq.text.replace('3. Overheads drop 10: tops 2180, 710 high', '3. Overheads: tops 2180, 600 clear over the bench (1500 underside, 680 high)').replace('8. Still open: mixer (Geraldine ordered Coriander, drawn as standard gooseneck)', '8. Mixer as drawn - fine') }).eq('id', sq.id))
console.log('done')
