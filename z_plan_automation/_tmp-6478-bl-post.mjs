// RHK6478 Bath Linen: [setup] joins the kick; reports fronts (facing, handle), hinges, shelves, issues. Optional hinges JSON sets both doors' hinges.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'f98db01e-14e2-454d-8c80-a48567bcc20e'
const mode = process.argv[2] ?? 'check', hinges = process.argv[3] ? JSON.parse(process.argv[3]) : null
if (hinges) {
  const { data: c } = await sb.from('cabinet_instances').select('id,face_grid').eq('room_id', R).eq('label', 'TC-01').single()
  const fg = c.face_grid ?? { rows: [{ row_index: 0, height_locked: false }], cols: [{ col_index: 0, width_locked: false }, { col_index: 1, width_locked: false }],
    zones: [{ row_index: 0, col_index: 0, face_type: 'door', hinge_side: 'left' }, { row_index: 0, col_index: 1, face_type: 'door', hinge_side: 'right' }] }
  fg.zones = fg.zones.map(z => z.face_type === 'door' ? { ...z, hinges } : z)
  console.log('hinges set', (await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', c.id)).error?.message ?? 'ok')
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage()
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  let st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets) { await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [c.label, c.dz]); await sleep(1000) }
  if (mode === 'setup') { console.log(JSON.stringify(await page.evaluate(() => window.__canvasApi.joinKicks('TC-01')))); await sleep(3000) }
  st = await page.evaluate(() => window.__canvasApi.getState())
  for (const c of st.cabinets) console.log(c.label, c.dx, c.dy, c.dz, 'pos_z', c.pos_z)
  const rp = await page.evaluate(() => window.__canvasApi.getResolved('TC-01'))
  for (const z of rp.face_zones) console.log('zone', z.col_index, z.face_type, 'X', z.X, 'DX', z.DX, 'Y', z.Y, 'DY', z.DY, 'Z', z.Z, 'DZ', z.DZ, JSON.stringify(z.facing), 'mat', z.material_id, 'hinge', z.hinge_side,
    'handle', z.handle ? JSON.stringify([z.handle.name ?? z.handle.handle_id, Math.round(z.handle.x), Math.round(z.handle.y), z.handle.drilled]) : 'none')
  console.log('hinges', JSON.stringify(rp.hinge_instances.map(h => [h.col_index, h.y_position_mm])))
  console.log('shelves', JSON.stringify(rp.internal_parts.map(p => [p.part_type, Math.round(p.Y * 10) / 10])))
  const issues = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const c of issues) for (const e of [...c.errors, ...c.warnings]) console.log(`  ${c.label} ${e.code}: ${e.message}`)
} finally { await browser.close() }
