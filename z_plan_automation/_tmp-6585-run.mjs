// RHK6585 Jojo: run bridge ops on a room, then dump state + resolved parts + issues.
//   node _tmp-6585-run.mjs <media|pantry|entry> '<json ops: [[fn, ...args], ...]>' [brief]
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
export const ROOMS = { media: 'e0e96be3-7615-413c-b4f8-2a07c728ec39', pantry: '7b416272-2861-4bf8-a60f-94f5632aa439', entry: 'e08d668d-d8b5-406a-bb2f-72671848b0a3' }
const R = ROOMS[process.argv[2]], ops = JSON.parse(process.argv[3] || '[]'), brief = process.argv[4] === 'brief'
const mats = Object.fromEntries((await sb.from('materials').select('id,name')).data.map(m => [m.id, m.name]))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(3000) }
  await open()
  const api = (f, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [f, a])
  for (const [fn, ...args] of ops) {
    if (fn === 'reload') { await open(); continue }
    if (fn === 'db') { // ['db', label, {columns}] or ['dbrule', label, {rules}]
      const st = await api('getState'); const c = st.cabinets.find(c => c.label === args[0]); if (!c) throw new Error('no cabinet ' + args[0])
      const r = await sb.from('cabinet_instances').update(args[1]).eq('id', c.id); console.log('db', args[0], r.error?.message ?? 'ok'); continue
    }
    if (fn === 'dbrule') {
      const st = await api('getState'); const c = st.cabinets.find(c => c.label === args[0]); if (!c) throw new Error('no cabinet ' + args[0])
      const row = (await sb.from('cabinet_instances').select('rule_overrides').eq('id', c.id).single()).data
      const r = await sb.from('cabinet_instances').update({ rule_overrides: { ...(row.rule_overrides ?? {}), ...args[1] } }).eq('id', c.id); console.log('dbrule', args[0], r.error?.message ?? 'ok'); continue
    }
    const r = await Promise.race([api(fn, ...args), sleep(60000).then(() => 'TIMEOUT 60s')])
    console.log(fn, JSON.stringify(args).slice(0, 120), '->', JSON.stringify(r)?.slice(0, 300)); await sleep(2500)
  }
  const st = await api('getState')
  for (const c of st.cabinets) {
    console.log('==', c.label, c.def ?? '', c.wall, JSON.stringify({ off: c.offset, dx: c.dx, dy: c.dy, dz: c.dz, pos_z: c.pos_z, x: c.pos_x, y: c.pos_y }))
    if (brief) continue
    const rp = await api('getResolved', c.label)
    for (const p of rp.case_parts ?? []) console.log('  case', p.part_key, p.DX, p.DY, p.DZ, 'X', p.X, 'Y', p.Y, 'Z', p.Z, mats[p.material_id])
    for (const p of rp.custom_parts ?? []) console.log('  custom', p.id, p.name, p.DX ?? p.dx, p.DY ?? p.dy, p.DZ ?? p.dz, 'xyz', p.X ?? p.x, p.Y ?? p.y, p.Z ?? p.z, mats[p.material_id], p.orientation ?? '')
    for (const p of rp.internal_parts ?? []) console.log('  int', p.part_type, p.DX, p.DY, p.DZ, 'Y', p.Y, mats[p.material_id])
    for (const z of rp.face_zones ?? []) console.log('  face', z.face_type, z.DX, z.DY, z.DZ, 'X', z.X, 'Y', z.Y, mats[z.material_id], z.handle_id ?? '', z.hinge_side ?? '')
    for (const p of rp.toekick_parts ?? []) if (!/spreader/.test(p.part_key)) console.log('  kick', p.part_key, p.DX, p.DY, mats[p.material_id])
  }
  for (const ci of await api('getIssues')) for (const e of [...ci.errors.map(e => ({ ...e, E: 'E' })), ...ci.warnings]) console.log(`  ${e.E ?? 'W'} ${ci.label} ${e.code}: ${e.message}`)
} finally { await browser.close() }
process.exit(0)
