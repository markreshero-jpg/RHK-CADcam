// RHK6478 US Main Ensuite: main drawer box 95 + 95 inner drawer behind each front (Dragon Pro 400x95), floating shelf full depth (495).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = '6e8f14c4-1325-4f07-b312-a6f9386d0245', DP95 = '8b86cf55-7a03-40e6-879d-08fde8e35b15', INNER_Y = Number(process.env.INNER_Y ?? 130)
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,face_grid').eq('room_id', R).in('label', ['BC-01', 'BC-02']))
for (const c of cabs) {
  const fg = c.face_grid; fg.zones = fg.zones.map(z => ({ ...z, drawer_type_config: { type: 'system', slide_product_id: DP95 } }))
  chk('upd', await sb.from('cabinet_instances').update({ face_grid: fg,
    internal_grid: { tree: { type: 'open', fittings: [{ type: 'inner_drawer', y_locked: true, y_position: INNER_Y, slide_product_id: DP95 }] }, stack_gap: 3 } }).eq('id', c.id))
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)))
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  for (const [l, p] of [['BC-01', { dz: 476.5 }], ['BC-02', { dz: 476.5 }], ['WC-01', { dz: 495 }]]) { await page.evaluate(([l, p]) => window.__canvasApi.updateCabinet(l, p), [l, p]); await sleep(1500) }
  await sleep(1500)
  const rp = await page.evaluate(() => window.__canvasApi.getResolved('BC-01'))
  console.log('zones', JSON.stringify(rp.face_zones.map(z => [z.face_type, z.Y, z.DY])))
  console.log('stack slides', JSON.stringify(rp.drawer_stacks.map(s => s.slides?.map(x => [x.Y, x.box_height, x.nominal_length])[0])))
  console.log('internal slides', JSON.stringify((rp.internal_slides ?? []).map(x => [x.Y, x.box_height ?? x.DY, x.nominal_length])))
  console.log('internal parts', JSON.stringify(rp.internal_parts.map(p => [p.part_key ?? p.name, 'Y', p.Y, 'Z', p.Z, p.DX, p.DY, p.DZ])))
  const ws = await page.evaluate(() => window.__canvasApi.getResolved('WC-01'))
  console.log('shelf', JSON.stringify(ws.case_parts.map(p => [p.part_key, p.DX, p.DY, p.DZ])))
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
