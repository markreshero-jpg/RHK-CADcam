// RHK6478 Laundry (Mark 2026-11-16): bulkheads 30 + 10 = 40 (shadowlines WC-09/10/11 28 -> 40), ceiling 2685 =>
// cabinet top line 2657 -> 2645; everything under it 12 shorter, undersides kept (TC-04 underside stays 2168 for the 1750 opening).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc', CH = 2685, BH = 40, TOP = CH - BH, OLD = 2657, D = OLD - TOP
const chk = (w, r) => { if (r.error) { console.log('ERR', w, r.error.message); process.exit(1) } }
const { data: cabs } = await sb.from('cabinet_instances').select('id,label,dy,notes').eq('room_id', R)
const L = Object.fromEntries(cabs.map(c => [c.label, c]))
const up = async (l, patch) => chk(l, await sb.from('cabinet_instances').update(patch).eq('id', L[l].id))
chk('room', await sb.from('rooms').update({ wall_cabinet_top: TOP }).eq('id', R))
for (const l of ['WC-09', 'WC-10', 'WC-11']) await up(l, { dy: BH, notes: L[l].notes.replace(/^28 (2pac )?shadowline/, '40 2pac bulkhead (30 + 10)').replace(`${OLD}-${CH}`, `${TOP}-${CH}`) })
for (const l of ['TC-01', 'TC-02', 'TC-05', 'TC-09', 'TC-06', 'TC-04', 'WC-02', 'WC-03', 'WC-04', 'WC-05', 'WC-07', 'WC-08'])
  await up(l, { dy: Number(L[l].dy) - D, notes: (L[l].notes ?? '').replace(`2020-${OLD}`, `2020-${TOP}`) })
for (const l of ['TC-01', 'TC-02', 'TC-05', 'TC-09', 'TC-06', 'WC-05']) {
  const { data: ps } = await sb.from('cabinet_custom_parts').select('id,dy,outline').eq('cabinet_instance_id', L[l].id)
  for (const p of ps) {
    const H = Number(p.dy) - D
    const outline = p.outline ? p.outline.map(q => ({ ...q, y: q.y === Number(p.dy) ? H : q.y === Number(p.dy) - 70 ? H - 70 : q.y })) : p.outline
    chk(l + ' part', await sb.from('cabinet_custom_parts').update({ dy: H, outline }).eq('id', p.id))
  }
}
const { data: anns } = await sb.from('room_annotations').select('id,text').eq('room_id', R).ilike('text', '%28 shadowline%')
for (const a of anns) chk('note', await sb.from('room_annotations').update({ text: a.text.replace('28 shadowline', '40 bulkhead (30 + 10)') }).eq('id', a.id))
console.log('db done')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const api = (page, fn, ...a) => page.evaluate((fn, a) => window.__canvasApi[fn](...a), fn, a)
try {
  const page = await browser.newPage(); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(3000)
  const { data: now } = await sb.from('cabinet_instances').select('label,dy').eq('room_id', R)
  for (const c of now.filter(c => ['WC-05', 'TC-01', 'TC-02', 'TC-05', 'TC-06', 'TC-09'].includes(c.label))) { await api(page, 'updateCabinet', c.label, { dy: Number(c.dy) }); await sleep(2500) }
} finally { await browser.close() }
process.exit(0)
