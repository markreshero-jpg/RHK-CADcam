// RHK6595 island back (Mark 2026-11-07): BFK 70 at the Wall 5 end of BC-01 (BC-01 616.5 -> 546.5),
// and BC-01 / 02 / 03 + the BFK in Sublime Teak: doors on the job's upper style + colour (LX Abs Grain 18 Sublime
// Teak), exposed board LX Abs Grain 18mm Sublime Teak.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ROOM = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb', W6 = 'a74ea87c-7876-436e-8bb8-2a88fceaffca'
const TEAK18 = 'd67d85b0-b12b-4b03-be3c-8bdbbf23cd11', STYLE = '28d45d84-3270-40ad-ae78-7df696bcc388', COLOUR = 'bd47d2f0-973a-492c-a383-d50dc2b599c7'
const BFK_DEF = 'dc9c76a6-d8b0-4b45-aed9-5b6d7d49111c'
const cabs = async () => (await sb.from('cabinet_instances').select('*').eq('room_id', ROOM)).data
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const api = (page, fn, ...a) => page.evaluate((fn, a) => window.__canvasApi[fn](...a), fn, a)
try {
  const page = await browser.newPage()
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  const load = async () => { await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'domcontentloaded', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 180000 }); await sleep(6000) }
  await load()
  let all = await cabs()
  let bfk = all.find(c => c.wall_id === W6 && c.cabinet_definition_id === BFK_DEF)
  if (!bfk) {
    const before = new Set(all.map(c => c.id))
    console.log('place', JSON.stringify(await api(page, 'placeCabinet', { def: 'BFK', wall: W6, offset: 0, dx: 70 })))
    await sleep(3000)
    all = await cabs()
    bfk = all.find(c => !before.has(c.id))
  }
  const bc01 = all.find(c => c.label === 'BC-01')
  console.log('BFK', bfk.label, 'placed at', bfk.pos_x, bfk.pos_y, 'rot', bfk.rotation)
  // Back row: rot 180, pos_x = its west (min) x, same line + depth as BC-01.
  const u = async (c, patch) => console.log(c.label, (await sb.from('cabinet_instances').update(patch).eq('id', c.id)).error?.message ?? 'ok')
  await u(bfk, { rotation: 180, pos_x: 990, pos_y: bc01.pos_y, pos_z: 0, dx: 70, dy: bc01.dy, dz: bc01.dz,
    left_neighbour_type: 'cabinet', right_neighbour_type: 'wall', rule_overrides: { ...(bfk.rule_overrides ?? {}), SCRBK: 0 }, material_overrides: { exposed: TEAK18 } })
  if (bc01.dx !== 546.5) await u(bc01, { dx: 546.5, pos_x: 1060, right_neighbour_type: 'cabinet' })
  for (const l of ['BC-01', 'BC-02', 'BC-03']) {
    const c = all.find(x => x.label === l)
    const fg = c.face_grid
    for (const z of fg.zones ?? []) if (z.face_type !== 'open') { z.door_style_id = STYLE; z.door_colour_id = COLOUR }
    await u(c, { face_grid: fg, material_overrides: { ...(c.material_overrides ?? {}), exposed: TEAK18 } })
  }
  await load()
  for (const l of [bfk.label, 'BC-01', 'BC-02', 'BC-03']) {
    const c = (await cabs()).find(x => x.label === l)
    await api(page, 'updateCabinet', l, { dy: c.dy }); await sleep(3000)
    const rp = await api(page, 'getResolved', l)
    const z = rp?.face_zones?.[0]
    console.log(l, 'dx', c.dx, 'pos_x', c.pos_x, 'rot', c.rotation, 'door', z?.material_name ?? z?.door_style?.name ?? z?.colour_name ?? '', 'custom', JSON.stringify((rp?.custom_parts ?? []).map(p => [p.name, p.material_id?.slice(0, 8)])),
      'warn', JSON.stringify((rp?.warnings ?? []).map(w => w.message)), 'err', JSON.stringify((rp?.errors ?? []).map(e => e.message)))
  }
} finally { await browser.close() }
