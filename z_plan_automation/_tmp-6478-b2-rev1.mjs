// RHK6478 Bed 2 Robe rev 1 (Mark 2026-11-03): fillers 18 wide x 200 deep (LX Abs Grain 18 Sublime Teak), outset flush with the plates (front 600); carcasses 3 x 891
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '761f434a-cdc8-4cb8-b1dc-da69ae78f12a', TEAK18 = 'd67d85b0-b12b-4b03-be3c-8bdbbf23cd11'
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label').eq('room_id', R))
const id = Object.fromEntries(cabs.map(c => [c.label, c.id]))
for (const l of ['TC-01', 'TC-05']) {
  chk('ret', await sb.from('cabinet_custom_parts').delete().eq('cabinet_instance_id', id[l]).eq('name', 'Filler Return'))
  chk('fill', await sb.from('cabinet_custom_parts').update({ orientation: 'side', x: 0, z: 0, material_id: TEAK18, expressions: { dx: 'cab.d', dy: 'cab.h', dz: 't.exposed' } }).eq('cabinet_instance_id', id[l]).eq('name', 'Filler'))
  chk('mat', await sb.from('cabinet_instances').update({ material_overrides: { exposed: TEAK18 },
    notes: `# ${l === 'TC-01' ? 1 : 5} 18 x 200 deep Lx Sublime Teak (Abs Grain 18) filler panel at the wall, between the plates, front flush with the plates (600 OA)` }).eq('id', id[l]))
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
  const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
  const api = (fn, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a])
  await open()
  for (const [l, p] of [['TC-01', { dx: 18, dz: 200 }], ['TC-05', { offset: 2691, dx: 18, dz: 200 }], ['TC-04', { offset: 1800, dx: 891 }], ['TC-02', { offset: 18, dx: 891 }], ['TC-03', { offset: 909, dx: 891 }]]) {
    console.log(JSON.stringify(await api('updateCabinet', l, p))); await sleep(1500)
  }
  // outset the fillers like the plates (pos_y 400 = 400-600 off the wall), then re-resolve
  chk('pos', await sb.from('cabinet_instances').update({ pos_y: 400 }).in('id', [id['TC-01'], id['TC-05']]))
  await open()
  for (const l of ['TC-01', 'TC-05']) { await api('updateCabinet', l, { dz: 200 }); await sleep(1500) }
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
for (const c of chk('after', await sb.from('cabinet_instances').select('label,pos_x,pos_y,pos_z,dx,dy,dz').eq('room_id', R).order('label'))) console.log(JSON.stringify(c))
console.log(JSON.stringify(chk('cp', await sb.from('cabinet_custom_parts').select('name,x,z,dx,dy,dz,orientation,material_id').in('cabinet_instance_id', [id['TC-01'], id['TC-05']]))))
