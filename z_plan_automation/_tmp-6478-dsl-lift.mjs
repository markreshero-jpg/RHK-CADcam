// DS Linen: lift the whole run 150 off the floor (Mark) - bottom back in, door full carcass height, fillers 150 up too.
// CAD: 150 robo vac gap dim + note, tundish note moved off the cupboard with a leader arrow to the tundish.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'f1953ab4-a03b-4439-a777-d39476156f31', LIFT = 150, DY = 2381 - LIFT
const { data: c } = await sb.from('cabinet_instances').select('id,face_grid').eq('room_id', R).eq('label', 'TC-02').single()
const door = c.face_grid.zones.find(z => z.face_type === 'door')
const face_grid = { ...c.face_grid, rows: [{ row_index: 0, height_locked: false }], zones: [{ ...door, row_index: 0 }] }
console.log('TC-02 bottom back + one door row', (await sb.from('cabinet_instances').update({ part_hide_views: {}, face_grid }).eq('id', c.id)).error?.message ?? 'ok')
console.log('pos_z', (await sb.from('cabinet_instances').update({ pos_z: LIFT }).eq('room_id', R)).error?.message ?? 'ok')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage()
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  for (const l of ['TC-01', 'TC-02', 'TC-03']) { console.log(JSON.stringify(await page.evaluate(([l, dy]) => window.__canvasApi.updateCabinet(l, { dy }), [l, DY]))); await sleep(1500) }
} finally { await browser.close() }
const { data: after } = await sb.from('cabinet_instances').select('label,dy,pos_z').eq('room_id', R).order('label')
console.log(JSON.stringify(after))
const wall2 = (await sb.from('walls').select('id').eq('room_id', R).eq('name', 'Wall 2').single()).data.id
const el = { room_id: R, view: 'elevation', wall_id: wall2, wall_side: 'face' }
const { data: old } = await sb.from('room_annotations').select('id,text').eq('room_id', R).eq('kind', 'text')
for (const o of old.filter(o => o.text?.startsWith('TUNDISH'))) await sb.from('room_annotations').delete().eq('id', o.id)
const spec = old.find(o => o.text?.startsWith('SPECIFICATIONS'))
await sb.from('room_annotations').update({ text: spec.text.replace('No kick: door 150 off the floor', 'No kick: whole cupboard + fillers\n150 off the floor (robo vac gap)').replace('No bottom (robot vacuum drives in)\n', '') }).eq('id', spec.id)
const { error } = await sb.from('room_annotations').insert([
  { ...el, kind: 'text', geom: { at: { x: 650, y: -1880 }, width: 40, leader: [{ x: 180, y: -1687 }, { x: 620, y: -1840 }] }, text: 'TUNDISH - keep visible\n1652-1722 H, 45-180 from LH wall', style: { size: 2.5 }, sort_order: 9 },
  { ...el, kind: 'dim', geom: { p1: { x: 483, y: 0 }, p2: { x: 483, y: -LIFT }, offset: 100, axis: 'y' }, style: {}, sort_order: 10 },
  { ...el, kind: 'text', geom: { at: { x: 650, y: -330 }, width: 40, leader: [{ x: 240, y: -75 }, { x: 620, y: -290 }] }, text: '150 GAP FOR ROBO VAC', style: { size: 2.5 }, sort_order: 11 },
])
console.log('cad', error?.message ?? 'ok')
