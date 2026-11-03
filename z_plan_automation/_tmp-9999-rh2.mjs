// RHK9999: BC-01 -> 600 single-door sink cupboard, run slides left 300, BC-05 / BC-06 -> 669 / 670 (right waterfall stays at 4225).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const R = process.argv[2]
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (l, r) => { if (r.error) { console.log(l, 'ERROR', r.error.message); process.exit(1) } return r.data }
const bc01 = chk('bc01', await sb.from('cabinet_instances').select('id').eq('room_id', R).eq('label', 'BC-01').single())
chk('fg', await sb.from('cabinet_instances').update({ face_grid: {
  cols: [{ col_index: 0, width_locked: false }], rows: [{ row_index: 0, height_locked: false }],
  zones: [{ col_index: 0, row_index: 0, face_type: 'door', hinge_side: 'left', finger_gap: 100 }],
} }).eq('id', bc01.id).select('id'))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage()
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2000)
  for (const [l, p] of [
    ['BC-01', { dx: 600 }], ['BC-02', { offset: 1700 }], ['BC-03', { offset: 2150 }], ['BC-04', { offset: 2768 }],
    ['BC-05', { offset: 2786, dx: 669 }], ['BC-06', { offset: 3455, dx: 670 }],
    ['KICK 1', { offset: 1100, dx: 1050 }], ['KICK 2', { offset: 2786, dx: 1339 }],
  ]) { console.log(l, JSON.stringify(await page.evaluate(([l, p]) => window.__canvasApi.updateCabinet(l, p), [l, p]))); await sleep(1500) }
} finally { await browser.close() }
// Sink + tap stay centred on BC-01 (1100 + 300)
for (const [name, x, lx] of [['Abi Seba Single Bowl 550 U/M Sink', 1400 - 275, 300], ['Abi Pull-out Sink Mixer', 1400 - 58.5, 300]])
  chk(name, await sb.from('room_fixtures').update({ x, link_x: lx }).eq('room_id', R).eq('name', name).select('id'))
const { data: c } = await sb.from('cabinet_instances').select('label,pos_x,dx,dy,pos_z').eq('room_id', R).order('pos_x')
for (const x of c) console.log(x.label, x.pos_x, x.dx, x.dy, x.pos_z)
