// RHK6478 Study (Mark 2026-11-04): 10 wide x 6 deep rebate along the top front edge of the desk back strip (WC-25/26)
// so the glass back edge sits in it, flush with the top -> glass 510 deep.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'a04663c7-1402-4344-be00-3ad4ce3aeae9', T110 = '12163452-ea8f-407e-85a9-340204dc0e5f'
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,dx,dz').eq('room_id', R).in('label', ['WC-25', 'WC-26']))
for (const c of cabs) {
  const p = chk('cp', await sb.from('cabinet_custom_parts').select('id').eq('cabinet_instance_id', c.id))[0]
  chk('del', await sb.from('part_operations').delete().eq('source_cabinet_id', c.id))
  chk('ins', await sb.from('part_operations').insert({ source_table: 'custom_parts', source_cabinet_id: c.id, source_part_key: 'custom_' + p.id,
    operation_type: 'route', operation_action: 'pocket', operation_role: 'local', plane_kind: 'face_front',
    pos_x: c.dz - 10 + 8, pos_y: c.dx / 2, size_dx: 16, size_dy: c.dx + 12, size_dz: 6, depth: 6,
    router_tool_id: T110, auto_tool: false, output_to_cnc: true, fill_strategy: 'raster', raster_angle_deg: 90, raster_stepover_pct: 40,
    angle_ax: 0, angle_ay: 0, angle_az: 0, repeat_count: 1, sort_order: 0,
    parameters: { note: 'Glass rebate 10 wide x 6 deep along the top front edge (6 past the front edge and both ends)' } }))
  chk('notes', await sb.from('cabinet_instances').update({ notes: `Desk back strip 100 x 16.5 Sublime Teak at the wall, top flush with the glass, 10 x 6 glass rebate on the top front edge - piece ${c.label === 'WC-25' ? 1 : 2} of 2` }).eq('id', c.id))
  console.log(c.label, c.dx, c.dz)
}
const r = await sb.from('room_annotations').update({ text: '6mm TOUGHENED GLASS DESK TOP 510 deep (supplied by RHK), back edge in a 10 x 6 rebate in the back strip, 2 pieces, joint over BC-08 left gable. Top 760 AFF. 40x40 STEEL behind the front strip (by RHK), rebated 10 into the underside, 10 cover strip over it (hand cut). ~40 display space under the glass. 100 x 16.5 back strip at the wall' }).eq('room_id', R).like('text', '6mm TOUGHENED%').select('id')
console.log('note', r.error, r.data?.length)
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
try {
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await new Promise(r => setTimeout(r, 4000))
  for (const c of cabs) { await page.evaluate(([l, dz]) => window.__canvasApi.updateCabinet(l, { dz }), [c.label, c.dz]); await new Promise(r => setTimeout(r, 1500)) }
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
