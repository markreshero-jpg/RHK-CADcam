// RHK6595 (Mark 2026-11-11): WC-01 (Wall 1 end, beside the microwave column) -> new library WF straight filler, in place,
// 18 LX ABS Grain Sublime Teak (matches the column). Gap 16.5 -> 18: column WC-02 / WC-14 711 -> 709.5 (offset 16.5 -> 18,
// right side stays at 727.5 against WC-03). Before-state -> _tmp-6595-wc01-wf-before.json.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb', TEAK18 = 'd67d85b0-b12b-4b03-be3c-8bdbbf23cd11', WF = '2d34ae94-54b9-4b2a-a949-1579239bda13'
const WC01 = '6f2b1294-6358-4d8a-b487-bb94c9e76cb5', WC01_CP = 'e1c21a52-c91d-4a4e-ac0c-5ed06e20444b'
const BEFORE = 'z_plan_automation/_tmp-6595-wc01-wf-before.json'
const must = (l, r) => { if (r.error) throw new Error(l + ': ' + r.error.message); console.log('ok', l); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
if (!fs.existsSync(BEFORE)) {
  const cabs = (await sb.from('cabinet_instances').select('*').eq('room_id', R).in('label', ['WC-01', 'WC-02', 'WC-14'])).data
  const cp = (await sb.from('cabinet_custom_parts').select('*').eq('id', WC01_CP)).data
  fs.writeFileSync(BEFORE, JSON.stringify({ cabs, cp }, null, 1))
  const byL = Object.fromEntries(cabs.map(c => [c.label, c]))
  if (byL['WC-02'].pos_x !== 2753.5) throw new Error('WC-02 pos_x not 2753.5')
  const part = (await sb.from('cabinet_definitions').select('custom_parts').eq('id', WF)).data[0].custom_parts[0]
  must('WC-01 -> WF', await sb.from('cabinet_instances').update({ cabinet_definition_id: WF, material_overrides: { exposed: TEAK18 }, dx: 18,
    notes: 'Straight wall filler (WF) at Wall 1 beside the microwave column, 18 Sublime Teak, front flush with the doors (Mark 2026-11-11, was a WEP front filler)' }).eq('id', WC01).select('id'))
  must('WC-01 part', await sb.from('cabinet_custom_parts').update({ name: part.name, orientation: part.orientation, x: 0, y: 0, z: 450, dx: 70, dy: 1390, dz: 18,
    expressions: part.expressions, part_cutouts: [], edge_top: part.edge_top, edge_bottom: part.edge_bottom, edge_left: part.edge_left, edge_right: part.edge_right, outline: null }).eq('id', WC01_CP).select('id'))
  for (const l of ['WC-02', 'WC-14']) must(`${l} pos_x 2752`, await sb.from('cabinet_instances').update({ pos_x: 2752 }).eq('id', byL[l].id).select('id'))
}
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 300000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 300000 }); await sleep(6000)
  for (const [l, p] of [['WC-02', { dx: 709.5 }], ['WC-14', { dx: 709.5 }], ['WC-01', { dx: 18 }]]) {
    await page.evaluate(([l, p]) => window.__canvasApi.updateCabinet(l, p), [l, p]); await sleep(3000)
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), l)
    const s = (await page.evaluate(() => window.__canvasApi.getState())).cabinets.find(x => x.label === l)
    console.log(l, 'off', s.offset, 'dx', s.dx, 'zones', JSON.stringify((rp.face_zones ?? []).map(z => [z.face_type, z.DX, z.DY])),
      'custom', JSON.stringify((rp.custom_parts ?? []).map(p => [p.name, p.orientation, p.x, p.z, p.dx, p.dy, p.dz, p.material_id?.slice(0, 8)])),
      'err', JSON.stringify([...(rp.errors ?? []), ...(rp.warnings ?? [])].map(e => e.code + ' ' + e.message)))
  }
  for (const i of await page.evaluate(() => window.__canvasApi.getIssues())) if (i.errors.length || i.warnings.length) console.log('ISSUE', i.label, JSON.stringify([...i.errors, ...i.warnings].map(e => e.code)))
  // WC-10 bottom holes (pending check from earlier)
  const w10 = await page.evaluate(() => window.__canvasApi.getResolved('WC-10'))
  for (const s of w10.seam_joints ?? []) if (/divider_\d+:(bottom|top)/.test(s.seam_key)) console.log('WC-10', s.seam_key, s.joint_type_name, JSON.stringify(s.ops.map(o => [o.qty, o.offset_z_mm, o.spacing_mm])))
} finally { await browser.close() }
