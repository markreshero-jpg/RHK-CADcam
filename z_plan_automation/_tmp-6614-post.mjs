// RHK6614 Upstairs Living Storage (Mark 2026-11-26): join the base kick, 20 stone top wall to wall 1020 x 600, then report.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '65c69db5-2aba-49e0-81c8-95c559968aa2'
const SCH = 'da288276-4dfc-4410-b6f6-d53d1b38c8fd', METH = 'fde097ae-d0e2-46dc-a549-9939ff7d8c28' // 20mm Stone
const walls = Object.fromEntries((await sb.from('walls').select('id,name').eq('room_id', R)).data.map(w => [w.name, w.id]))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const cabsOf = async () => (await sb.from('cabinet_instances').select('id,label,pos_x,pos_z,dx,dy,dz,kick_run_id,bottom_type').eq('room_id', R).order('label')).data

// Top: carcass top 855 (120 + 735) -> 875 FFL. Wall to wall, 600 deep, front edge only exposed.
{
  const { data: old } = await sb.from('benchtop_instances').select('id').eq('room_id', R)
  if (old?.length) console.log('top exists')
  else {
    const P = [{ x: 0, y: 0 }, { x: 1020, y: 0 }, { x: 1020, y: 600 }, { x: 0, y: 600 }]
    const wall = [true, true, false, true]
    const r = await sb.from('benchtop_instances').insert({
      room_id: R, label: 'Benchtop 1', polygon: P, segments: P.map((p0, i) => ({ type: 'line', p0, p1: P[(i + 1) % 4], edge: { wall: wall[i] } })),
      edge_tags: wall.map((w, i) => ({ type: w ? 'wall' : 'exposed', edge_index: i })), join_types: [], joins: [], arc_segments: [], cutout_polygons: [],
      wall_id: walls['Wall 2'], wall_side: 'face', height_mm: 855, benchtop_schedule_id: SCH, benchtop_build_method_id: METH,
      notes: 'ST1: 20mm SNB Stone Brecciata Primavera Dolomite. Wall to wall 1020 x 600, top 875 FFL.',
    }).select('id').single()
    console.log('top', r.error?.message ?? r.data.id)
  }
}

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = (fn, ...a) => page.evaluate((fn, a) => window.__canvasApi[fn](...a), fn, a)
  let cabs = await cabsOf()
  if (!cabs.some(c => c.label.startsWith('KICK'))) { console.log('join', JSON.stringify(await api('joinKicks', 'BC-02'))); await sleep(5000) }
  cabs = await cabsOf()
  for (const c of cabs) console.log(c.label.padEnd(8), 'x', c.pos_x, 'z', c.pos_z, `${c.dx}x${c.dy}x${c.dz}`, c.kick_run_id ? 'run' : '', c.bottom_type ?? '')
  const ids = cabs.map(c => c.id), lab = Object.fromEntries(cabs.map(c => [c.id, c.label]))
  for (const [t, k] of [['case_parts', 'part_key'], ['internal_parts', 'part_type'], ['face_zones', 'face_type'], ['cabinet_custom_parts', 'name'], ['toekick_parts', 'part_key']]) {
    const { data } = await sb.from(t).select(`cabinet_instance_id,${k},pos_y,dx,dy,dz`).in('cabinet_instance_id', ids)
    for (const p of data ?? []) console.log(' ', t.padEnd(20), lab[p.cabinet_instance_id].padEnd(8), String(p[k]).padEnd(26), 'y', p.pos_y, `${p.dx}x${p.dy}x${p.dz}`)
  }
  console.log('issues', JSON.stringify(await api('getIssues')).slice(0, 1500))
} finally { await browser.close() }
process.exit(0)
