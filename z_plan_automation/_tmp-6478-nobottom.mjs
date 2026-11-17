// RHK6478 (Mark 2026-11-18): "no bottom" done natively - Bottom Type 'none' (sidebar / Cabinet Edit) instead of the
// workaround (case_bottom hidden in all views + BOTTOM_BACK_JOIN butts_into_back), so the Cabinet Edit modal shows it.
// Cabinets: Buffet WC-02, DS Linen TC-02, US Broom TC-02, DS TV Unit WC-05 / WC-06 / WC-07.
// Prints part sizes, shelf + hinge positions before / after so any shift is visible.
// Run: node z_plan_automation/_tmp-6478-nobottom.mjs go <cabinet id> ... (no ids = all six)
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) { console.log('ERR', t, r.error.message); process.exit(1) } return r.data }
const ALL = ['b2a41d06-aebc-45af-ab76-8c4da4d2c7fc', '5851e4af-3529-41da-ab03-89d091b236d7', '01f735e4-1cb5-484e-aff9-bb02d49cfc60',
  '57ee6f6e-4dfb-4d13-903e-d768ef8feffe', 'c9642c43-143c-4155-b321-f20e91704123', '1b818c12-977d-4933-bfce-a7f76e0893bd']
const IDS = process.argv.slice(3).length ? process.argv.slice(3) : ALL
const snap = async () => {
  const out = {}
  const cabs = chk('c', await sb.from('cabinet_instances').select('id,label,room_id,dz,resolved_drawer_hw').in('id', IDS))
  for (const c of cabs) {
    const cp = chk('cp', await sb.from('case_parts').select('part_key,dx,dy,dz,y,z').eq('cabinet_instance_id', c.id).order('part_key'))
    const ip = chk('ip', await sb.from('internal_parts').select('part_type,dx,dy,dz,y,sort_order').eq('cabinet_instance_id', c.id).order('sort_order'))
    const hinges = (c.resolved_drawer_hw?.hinge_instances ?? []).map(h => h.y_position_mm)
    out[c.id] = { label: c.label, room: c.room_id, dz: c.dz, lines: [...cp.map(p => `case ${p.part_key} ${p.dx}x${p.dy}x${p.dz} y${p.y} z${p.z}`), ...ip.map(p => `int ${p.part_type}#${p.sort_order} ${p.dx}x${p.dy}x${p.dz} y${p.y}`), `hinges ${hinges.join(',')}`] }
  }
  return out
}
const before = await snap()
if (process.argv[2] !== 'go') { for (const v of Object.values(before)) console.log(v.label, '\n ' + v.lines.join('\n ')); process.exit(0) }

const rows = chk('rows', await sb.from('cabinet_instances').select('id,label,part_hide_views,rule_overrides').in('id', IDS))
for (const c of rows) {
  const { case_bottom, ...hide } = c.part_hide_views ?? {}
  const { BOTTOM_BACK_JOIN, ...rules } = c.rule_overrides ?? {}
  chk(c.label, await sb.from('cabinet_instances').update({ bottom_type: 'none', part_hide_views: hide, rule_overrides: rules }).eq('id', c.id))
  console.log(c.label, 'bottom_type none (was hide', JSON.stringify(case_bottom), '+ BBJ', BOTTOM_BACK_JOIN, ')')
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  for (const room of [...new Set(Object.values(before).map(v => v.room))]) {
    const page = await browser.newPage(); page.on('dialog', d => d.dismiss()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)))
    await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    await page.goto(`http://localhost:3001/canvas/${room}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
    await page.waitForFunction('!!window.__canvasApi', { timeout: 240000 }); await sleep(4000)
    for (const [id, v] of Object.entries(before).filter(([, v]) => v.room === room)) { await page.evaluate(([i, z]) => window.__canvasApi.updateCabinet(i, { dz: z }), [id, v.dz]); await sleep(1500) }
    const iss = await page.evaluate(() => window.__canvasApi.getIssues())
    for (const x of iss) for (const e of x.errors) console.log('  ERROR', x.label, e.code, e.message)
    await page.close()
  }
} finally { await browser.close() }
const after = await snap()
for (const [id, b] of Object.entries(before)) {
  const a = after[id]
  const gone = b.lines.filter(l => !a.lines.includes(l)), added = a.lines.filter(l => !b.lines.includes(l))
  console.log(`\n${b.label}: ${gone.length || added.length ? 'CHANGED' : 'no change'}`)
  for (const l of gone) console.log('  - ' + l)
  for (const l of added) console.log('  + ' + l)
}
process.exit(0)
