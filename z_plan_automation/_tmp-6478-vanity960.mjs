// RHK6478 vanities: basins finish at 960 AFF (Mark 2026-11-02) -> 115 basin on an 845 top: carcass 485-825,
// end panels / fillers / floating shelf / top all up 25. Re-resolve + report.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const ROOMS = ['6e8f14c4-1325-4f07-b312-a6f9386d0245', 'fbca7078-ae65-4e87-baf8-7bfe6ba55dda', '9c8f3cbf-5d9d-43b9-9f81-c409417dc84b']
const UP = 25
for (const R of ROOMS) {
  const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,pos_z').eq('room_id', R))
  for (const c of cabs) if (Number(c.pos_z) < 600) chk('z', await sb.from('cabinet_instances').update({ pos_z: Number(c.pos_z) + UP }).eq('id', c.id))
  chk('top', await sb.from('benchtop_instances').update({ height_mm: 825 }).eq('room_id', R))
  const tops = chk('tn', await sb.from('benchtop_instances').select('id,notes').eq('room_id', R))
  for (const t of tops) chk('tn2', await sb.from('benchtop_instances').update({ notes: (t.notes ?? '').replace('top 820 AFF', 'top 845 AFF, basins finish 960') }).eq('id', t.id))
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  for (const R of ROOMS) {
    const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)))
    await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
    await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
    let st = await page.evaluate(() => window.__canvasApi.getState())
    for (const f of st.fixtures) { await page.evaluate(id => window.__canvasApi.updateFixture(id, { z: 845 }), f.id); await sleep(900) }
    for (const c of st.cabinets) { await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [c.label, c.dz]); await sleep(1200) }
    st = await page.evaluate(() => window.__canvasApi.getState())
    console.log(st.room?.name ?? R.slice(0, 8))
    const { data } = await sb.from('cabinet_instances').select('label,pos_z,dy').eq('room_id', R).order('label')
    console.log('  ', data.map(c => `${c.label} ${c.pos_z}-${Number(c.pos_z) + Number(c.dy)}`).join(' | '))
    for (const f of st.fixtures) console.log('   fixture z', f.z, 'top', Number(f.z) + Number(f.height ?? 115), 'cab', f.cabinet, 'clash', JSON.stringify(f.clash))
    const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
    for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`   ${ci.label} ${e.code}: ${e.message}`) }
    console.log('   issues', n)
    await page.close()
  }
} finally { await browser.close() }
