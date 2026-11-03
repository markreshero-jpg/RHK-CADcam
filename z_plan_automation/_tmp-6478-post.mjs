// RHK6478 US Hallway Linen: PTO handle schedule on the room, join the kick, report hinges + shelf holes.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'b6377e60-bed3-4e5c-af80-7ea320db6ff5'
const mode = process.argv[2] ?? 'setup'
if (mode === 'setup') {
  const { error } = await sb.from('rooms').update({ handle_schedule_id: '9440a3f0-63db-4085-9042-1c728298b49a' }).eq('id', R)
  console.log('room handle schedule', error?.message ?? 'ok')
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage()
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  let st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets) { await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [c.label, c.dz]); await sleep(700) }
  if (mode === 'setup') { console.log(JSON.stringify(await page.evaluate(() => window.__canvasApi.joinKicks('TC-02')))); await sleep(3000) }
  st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets) console.log(c.label, c.dx, c.dy, c.pos_z)
  for (const l of ['TC-02', 'TC-03']) {
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    if (!rp) { console.log(l, 'no resolved'); continue }
    console.log(l, 'zones', JSON.stringify(rp.face_zones.map(z => [z.row_index, z.col_index, z.face_type, z.Y, z.DY, z.handle ? 'handle' : 'none'])))
    console.log(l, 'hinges', JSON.stringify(rp.hinge_instances.map(h => [h.col_index, h.y_position_mm])))
    console.log(l, 'shelves', JSON.stringify(rp.internal_parts.map(p => [p.part_type, Math.round(p.Y * 10) / 10])))
  }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const c of issues) for (const e of [...c.errors, ...c.warnings]) console.log(`  ${c.label} ${e.code}: ${e.message}`)
} finally { await browser.close() }
