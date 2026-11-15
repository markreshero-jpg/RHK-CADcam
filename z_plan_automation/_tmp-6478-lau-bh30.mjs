// RHK6478 Laundry (Mark 2026-11-16): no shadowlines - real BH bulkheads, 30 soffit + 10 past the ceiling (h_adjust 10, auto_h),
// like RHK6586 / RHK6595. Shadowlines WC-09/10/11 converted in place to BH (same returns); cabinet top line 2645 -> 2655
// (ceiling 2685 - 30), everything under it 10 taller, undersides kept (washer opening stays 1750).
// WC-10 sits over the Teak overheads -> Teak 16.5 bulkhead (bulkhead matches the cupboards under it); WC-09 / WC-11 2pac 18.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc', CH = 2685, SOFFIT = 30, TOP = CH - SOFFIT, OLD = 2645, D = TOP - OLD
const BH = '70066e18-9f84-4b53-bfb0-e0e2ff5fc4ee', TEAK = '67ecbeff-98ac-41e1-9b1a-618a5bf6a96b', SATIN18 = 'b07a7e40-facd-4cdf-8856-60712e940b44'
const chk = (w, r) => { if (r.error) { console.log('ERR', w, r.error.message); process.exit(1) } }
const { data: cabs } = await sb.from('cabinet_instances').select('id,label,dy,dz,notes,bulkhead').eq('room_id', R)
const L = Object.fromEntries(cabs.map(c => [c.label, c]))
const up = async (l, patch) => chk(l, await sb.from('cabinet_instances').update(patch).eq('id', L[l].id))
chk('room', await sb.from('rooms').update({ wall_cabinet_top: TOP }).eq('id', R))
const bh = (old) => ({ kind: 'bulkhead', left: { ...old.left }, right: { ...old.right }, bottom: { ...old.bottom, on: false }, cleat: true, front: 'carcase', grain: 'vertical',
  split: { on: false, width: 60, setback: 10, material_id: null }, width: 60, auto_h: true, h_adjust: 10 })
for (const [l, mat, what] of [['WC-09', SATIN18, 'over the tower (2pac)'], ['WC-10', TEAK, 'over the overheads (Sublime Teak, as the cupboards)'], ['WC-11', SATIN18, 'over the talls (2pac)']])
  await up(l, { cabinet_definition_id: BH, dy: SOFFIT, bulkhead: bh(L[l].bulkhead), material_overrides: { exposed: mat },
    notes: `BH bulkhead ${what}: 30 soffit ${TOP}-${CH} + 10 past the ceiling (Mark 2026-11-16)${l === 'WC-09' ? ', right return 400' : l === 'WC-11' ? ', left return at the end panel' : ''}` })
for (const l of ['TC-01', 'TC-02', 'TC-05', 'TC-09', 'TC-06', 'TC-04', 'WC-02', 'WC-03', 'WC-04', 'WC-05', 'WC-07', 'WC-08'])
  await up(l, { dy: Number(L[l].dy) + D, notes: (L[l].notes ?? '').replace(`2020-${OLD}`, `2020-${TOP}`) })
for (const l of ['TC-01', 'TC-02', 'TC-05', 'TC-09', 'TC-06', 'WC-05']) {
  const { data: ps } = await sb.from('cabinet_custom_parts').select('id,dy,outline').eq('cabinet_instance_id', L[l].id)
  for (const p of ps) {
    const H = Number(p.dy) + D
    const outline = p.outline ? p.outline.map(q => ({ ...q, y: q.y === Number(p.dy) ? H : q.y === Number(p.dy) - 70 ? H - 70 : q.y })) : p.outline
    chk(l + ' part', await sb.from('cabinet_custom_parts').update({ dy: H, outline }).eq('id', p.id))
  }
}
const { data: anns } = await sb.from('room_annotations').select('id,text').eq('room_id', R).ilike('text', '%40 bulkhead (30 + 10)%')
for (const a of anns) chk('note', await sb.from('room_annotations').update({ text: a.text.replace('40 bulkhead (30 + 10)', '30 bulkhead (+10 past the ceiling)') }).eq('id', a.id))
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
  for (const c of now.filter(c => ['WC-09', 'WC-10', 'WC-11', 'WC-05', 'TC-01', 'TC-02', 'TC-05', 'TC-06', 'TC-09'].includes(c.label))) { await api(page, 'updateCabinet', c.label, { dy: Number(c.dy) }); await sleep(2500) }
  for (const l of ['WC-09', 'WC-10', 'WC-11']) {
    const rp = await api(page, 'getResolved', l)
    console.log(l, (rp?.case_parts ?? []).map(p => `${p.part_key} ${Math.round(p.DX)}x${Math.round(p.DY)}`).join(', '), JSON.stringify((rp?.errors ?? []).map(e => e.message)))
  }
} finally { await browser.close() }
process.exit(0)
