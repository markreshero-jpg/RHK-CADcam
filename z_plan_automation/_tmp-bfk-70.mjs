// Mark 2026-11-08: a filler is 70 wide (planer blade 82 takes it in one pass) - not a full-depth panel.
// BFK board: side-on, 70 deep at the front (front edge flush with the door face), on the kick.
// Library BFK + RHK6595 BC-10 (front row, t.door) + BC-14 (back row, teak doors 18 -> +20). Edits in place.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ROOM = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb'
const ex = front => ({ y: 'cab.kick', z: `${front} - 70`, dx: '70', dy: 'cab.h - cab.kick', dz: 't.exposed' })
const bfk = (await sb.from('cabinet_definitions').select('id,custom_parts').eq('name', 'BFK').single()).data
const r = await sb.from('cabinet_definitions').update({
  custom_parts: [{ ...bfk.custom_parts[0], dx: 70, expressions: ex('cab.d + t.door + 2') }],
  description: 'Base filler at kick height, material thickness: a 70 strip (planer takes it in one pass) standing side-on between the cabinet and the wall, front edge flush with the door face and the only part seen. Set the width to the board thickness (18 / 16.5). Carries its own kick; sits on the kick: y = cab.kick, height = cabinet height less kick. Face filler in the door plane = BFKW.',
}).eq('id', bfk.id)
console.log('library BFK', r.error?.message ?? 'ok')
for (const [part, front] of [['f2f771b2-20a1-4462-844e-995d9f686fb0', 'cab.d + t.door + 2'], ['b1197731-3054-47e5-a3fd-a3118dd17f8a', 'cab.d + 20']])
  console.log(part.slice(0, 8), (await sb.from('cabinet_custom_parts').update({ expressions: ex(front) }).eq('id', part)).error?.message ?? 'ok')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'domcontentloaded', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 180000 }); await sleep(6000)
  for (const [l, nb] of [['BC-10', 'BC-11'], ['BC-14', 'BC-01']]) {
    const c = (await page.evaluate(() => window.__canvasApi.getState())).cabinets.find(c => c.label === l)
    await page.evaluate(([l, dy]) => window.__canvasApi.updateCabinet(l, { dy }), [l, c.dy]); await sleep(3000)
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    const n = await page.evaluate(l => window.__canvasApi.getResolved(l), nb)
    const door = n.face_zones[0]
    console.log(l, JSON.stringify((rp.custom_parts ?? []).map(p => ({ z: p.z, dx: p.dx, front: p.z + p.dx, dy: p.dy, dz: p.dz }))), `${nb} door front at`, door.Z + door.DZ,
      'warn', JSON.stringify(rp.warnings.map(w => w.message)))
  }
} finally { await browser.close() }
