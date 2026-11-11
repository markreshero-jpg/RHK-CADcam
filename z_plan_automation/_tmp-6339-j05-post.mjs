// RHK6339 J05: join the kick under BC-01 + BC-02, add the 35 solid timber top (waterfall left end).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'ab417075-b6e2-4189-93c5-c281e1f05f9b', WALL1 = '863581fd-8134-41c0-aded-c1440f85c1a3'
const WF = 'ec8720a4-d679-414f-8936-03679e555932', SCH = 'cadefc6c-ca21-4de4-b7ac-55b044a1bd15', METH = '58155ef3-dfc2-4ab1-96bd-a8b1c0400f73'

// Top: x 660-2830 along Wall 1, 700 deep, carcass top 879 (35 top -> 914 FFL).
const P = [{ x: 660, y: 0 }, { x: 2830, y: 0 }, { x: 2830, y: 700 }, { x: 660, y: 700 }]
const edges = [{ wall: true }, { wall: true }, { wall: false }, { wall: false, profile_id: WF, waterfall_join: 'mitre' }]
const segments = P.map((p0, i) => ({ type: 'line', p0, p1: P[(i + 1) % 4], edge: edges[i] }))
const { data: old } = await sb.from('benchtop_instances').select('id').eq('room_id', R)
if (!old?.length) {
  const r = await sb.from('benchtop_instances').insert({
    room_id: R, label: 'Benchtop 1', polygon: P, segments, edge_tags: [{ type: 'wall', edge_index: 0 }, { type: 'wall', edge_index: 1 }],
    join_types: [], joins: [], arc_segments: [], cutout_polygons: [], wall_id: WALL1, wall_side: 'face', height_mm: 879,
    benchtop_schedule_id: SCH, benchtop_build_method_id: METH,
    notes: '35 solid timber Blackbutt, clear matt lacquer, made by hand. 700 deep x 2170 incl 35 waterfall leg at the left end. Butts into the W16 window frame at the right. Top at 914 FFL (928 raw floor to window underside - 14 timber floor) TBC.',
  }).select('id').single()
  console.log('top', r.error?.message ?? r.data.id)
} else console.log('top exists', old[0].id)

const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  console.log('join', JSON.stringify(await page.evaluate(() => window.__canvasApi.joinKicks('BC-01'))))
  await sleep(4000)
  console.log('issues', JSON.stringify(await page.evaluate(() => window.__canvasApi.getIssues?.())).slice(0, 800))
} finally { await browser.close() }
const { data: cabs } = await sb.from('cabinet_instances').select('label,pos_x,pos_z,dx,dy,kick_run_id,is_kick_assembly').eq('room_id', R).order('label')
console.log(JSON.stringify(cabs))
