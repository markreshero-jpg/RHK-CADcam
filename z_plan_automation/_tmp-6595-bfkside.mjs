// RHK6595 BC-14 (BFK, Mark 2026-11-08): the filler is one board flat against Wall 5, standing side-on, seen on its
// front edge: 18 Sublime Teak, on the kick, as deep as BC-01 out to the door face, front edge taped.
// BC-14 70 -> 18, BC-01 546.5 -> 598.5 (pos_x 1060 -> 1008). The BFK library item is unchanged.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ROOM = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb', BC14 = 'a99a059f-30ad-4c7f-9d6f-3f04d5bb8da7'
const r = await sb.from('cabinet_custom_parts').update({
  orientation: 'side', x: 0, z: 0,
  expressions: { y: 'cab.kick', dx: 'cab.d + t.door + 2', dy: 'cab.h - cab.kick', dz: 't.exposed' },
  edge_top: false, edge_bottom: false, edge_left: false, edge_right: true,   // side panel: right = front edge
}).eq('cabinet_instance_id', BC14).eq('name', 'Filler').select('id')
console.log('part', r.error?.message ?? r.data.length)
const { data: [bc01] } = await sb.from('cabinet_instances').select('id,dx,pos_x').eq('room_id', ROOM).eq('label', 'BC-01')
console.log('BC-01', (await sb.from('cabinet_instances').update({ dx: 598.5, pos_x: 1008 }).eq('id', bc01.id)).error?.message ?? 'ok')
console.log('BC-14', (await sb.from('cabinet_instances').update({ dx: 18 }).eq('id', BC14)).error?.message ?? 'ok')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'domcontentloaded', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 180000 }); await sleep(6000)
  for (const l of ['BC-14', 'BC-01']) {
    const c = (await page.evaluate(() => window.__canvasApi.getState())).cabinets.find(c => c.label === l)
    await page.evaluate(([l, dy]) => window.__canvasApi.updateCabinet(l, { dy }), [l, c.dy]); await sleep(3000)
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    console.log(l, 'dx', c.dx, 'pos', c.pos_x, 'custom', JSON.stringify((rp.custom_parts ?? []).map(p => [p.orientation, p.x, p.y, p.z, p.dx, p.dy, p.dz, p.material_id?.slice(0, 8)])),
      'doors', JSON.stringify((rp.face_zones ?? []).map(z => Math.round(z.DX))), 'kick', JSON.stringify((rp.toekick_parts ?? []).map(k => [k.part_key, k.DX ?? k.dx, k.DY ?? k.dy])),
      'warn', JSON.stringify(rp.warnings.map(w => w.message)), 'err', JSON.stringify(rp.errors.map(e => e.message)))
  }
} finally { await browser.close() }
