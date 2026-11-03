// RHK6542 Danny's Robe post: half-mm widths, join kick, TV false panel, dump resolved parts.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '830e087b-d817-4843-b766-5fbdd8ee6c4a', WB = 'd081b2a1-38a8-472c-a415-f179699a1347'
const STEP = process.env.STEP ?? 'dump'
const sleep = ms => new Promise(r => setTimeout(r, ms))
if (STEP === 'fix') {
  for (const l of ['TC-02', 'TC-04', 'WC-01', 'WC-03']) chk(l, await sb.from('cabinet_instances').update({ dx: 902.5 }).eq('room_id', R).eq('label', l))
}
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500) }
  const api = (fn, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a])
  await open()
  if (STEP === 'fix') {
    for (const l of ['TC-02', 'TC-04', 'WC-01', 'WC-03']) { await api('updateCabinet', l, { dz: 580 }); await sleep(1500) }
    console.log('join', JSON.stringify(await api('joinKicks', 'TC-02'))); await sleep(3000)
    await open()
  }
  const st = await api('getState')
  for (const c of st.cabinets) console.log(c.label, c.wall, c.offset, c.dx, c.dy, c.dz, c.pos_z ?? '')
  for (const c of st.cabinets) {
    const rp = await api('getResolved', c.label); if (!rp) { console.log(c.label, 'no resolved'); continue }
    console.log('==', c.label, JSON.stringify([...rp.case_parts.map(p => [p.part_key, p.X, p.Y, p.Z, p.DX, p.DY, p.DZ, p.material_id?.slice(0, 8)]),
      ...(rp.custom_parts ?? []).map(p => [p.name, p.X ?? p.x, p.Y ?? p.y, p.Z ?? p.z, p.DX ?? p.dx, p.DY ?? p.dy, p.DZ ?? p.dz, p.material_id?.slice(0, 8)])]))
    if (rp.internal_parts?.length) console.log('   int', JSON.stringify(rp.internal_parts.map(p => [p.part_type, p.X, p.Y, p.Z, p.DX, p.DY, p.DZ, p.material_id?.slice(0, 8)])))
    if (rp.internal_slides?.length) console.log('   slides', JSON.stringify(rp.internal_slides.filter(s => s.side === 'left').map(s => [s.Y, s.box_height, s.nominal_length, s.slide_id?.slice(0, 8)])))
    if (rp.face_zones?.length) console.log('   zones', JSON.stringify(rp.face_zones.map(z => [z.face_type, z.Y, z.DY, z.DX, z.material_id?.slice(0, 8), z.hinges ?? z.hinge_positions])))
    if (rp.accessories?.length || rp.internal_accessories?.length) console.log('   acc', JSON.stringify((rp.accessories ?? rp.internal_accessories).map(a => [a.key ?? a.name, a.Y, a.DY])))
  }
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('errors', issues.reduce((a, c) => a + c.errors.length, 0), 'issues', n)
} finally { await browser.close() }
