// RHK6478 DS Linen: re-resolve TC-02, report parts / door / hinges / shelf holes / issues. Optional hinges JSON arg sets door hinges.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'f1953ab4-a03b-4439-a777-d39476156f31'
const hinges = process.argv[2] ? JSON.parse(process.argv[2]) : null
if (hinges) {
  const { data: c } = await sb.from('cabinet_instances').select('id,face_grid').eq('room_id', R).eq('label', 'TC-02').single()
  c.face_grid.zones = c.face_grid.zones.map(z => z.face_type === 'door' ? { ...z, hinges } : z)
  const { error } = await sb.from('cabinet_instances').update({ face_grid: c.face_grid }).eq('id', c.id)
  console.log('hinges set', error?.message ?? 'ok')
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage()
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  const st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets) { await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [c.label, c.dz]); await sleep(800) }
  for (const c of st.cabinets) console.log(c.label, c.dx, c.dy, c.dz, 'pos_z', c.pos_z)
  const rp = await page.evaluate(() => window.__canvasApi.getResolved('TC-02'))
  console.log('case', JSON.stringify(rp.case_parts.map(p => [p.part_key, p.DX, p.DY, p.Y, JSON.stringify(p.edge_band && Object.fromEntries(Object.entries(p.edge_band).filter(([k, v]) => v && k !== 'id')))])))
  console.log('removed?', JSON.stringify(rp.part_hide_views))
  console.log('zones', JSON.stringify(rp.face_zones.map(z => [z.row_index, z.face_type, 'Y', z.Y, 'DY', z.DY, z.hinge_side])))
  console.log('hinges', JSON.stringify(rp.hinge_instances.map(h => h.y_position_mm)))
  console.log('shelves', JSON.stringify(rp.internal_parts.map(p => [p.part_type, Math.round(p.Y)])))
  const holes = (rp.shelf_holes ?? rp.drilling ?? null)
  console.log('hole keys', Object.keys(rp).filter(k => /hole|drill/i.test(k)).join(','))
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const c of issues) for (const e of [...c.errors, ...c.warnings]) console.log(`  ${c.label} ${e.code}: ${e.message}`)
} finally { await browser.close() }
