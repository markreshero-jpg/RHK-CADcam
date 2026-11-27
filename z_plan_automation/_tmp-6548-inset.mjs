// RHK6548 Hard Coffee rev 4 (Mark 2026-11-27):
//  - FC BC-02: cup-dispenser false panels out, open with more shelving: fixed shelf kept (top 369), adj shelf below + above.
//  - FC BC-03: rubbish door INSET, flush with the carcass front (FACINS 0.01, new D-INS auto reveals = panel + 2).
//    Row 567 so the door top stays at 587 (150 below the 737 top); door 20-587.
//  - D-INS freeze: RHK6542 Danny's Robe TC-03 (per-front face_ins 3.5) keeps its 18.5 side reveals via ins_rev.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const FC = '09786d9b-378e-42ed-9fc7-1aed4c7b21ab'
const get = async (R, label) => chk(label, await sb.from('cabinet_instances').select('*').eq('room_id', R).eq('label', label).single())

// Danny's Robe TC-03 freeze (before anything re-resolves it on the new code)
const danny = chk('dr', await sb.from('rooms').select('id').eq('name', "Danny's Robe")).at(0)
if (danny) {
  const c = await get(danny.id, 'TC-03')
  const fg = structuredClone(c.face_grid)
  fg.zones = fg.zones.map(z => z.face_ins != null && !z.ins_rev ? { ...z, ins_rev: { left: 18.5, right: 18.5 } } : z)
  chk('danny', await sb.from('cabinet_instances').update({ face_grid: fg }).eq('id', c.id))
}

// FC BC-02: open + shelving
{ const c = await get(FC, 'BC-02')
  chk('bc02', await sb.from('cabinet_instances').update({
    face_grid: { cols: [{ col_index: 0, width_locked: false }], rows: [{ row_index: 0, height_locked: false }], zones: [{ row_index: 0, col_index: 0, face_type: 'open' }] },
    internal_grid: { ...(c.internal_grid ?? {}), tree: { type: 'hsplit', children: [
      { size: 333, separator: 'fixed_shelf', section: { type: 'open', fittings: [{ type: 'adj_shelf', y_locked: false }] } },
      { section: { type: 'open', fittings: [{ type: 'adj_shelf', y_locked: false }] } },
    ] } },
    notes: 'Open shelving (was cup dispensers - Mark 27/11): fixed shelf + adj shelf above and below',
  }).eq('id', c.id)) }

// FC BC-03: inset door, flush
{ const c = await get(FC, 'BC-03')
  const fg = structuredClone(c.face_grid); fg.rows[0].height = 567
  chk('bc03', await sb.from('cabinet_instances').update({ face_grid: fg, rule_overrides: { ...(c.rule_overrides ?? {}), FACINS: 0.01 } }).eq('id', c.id)) }

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  for (const [k, R, poke] of [['fc', FC, [['BC-02', { dz: 545 }], ['BC-03', { dz: 545 }]]], ...(danny ? [['danny', danny.id, [['TC-03', { dz: 580 }]]]] : [])]) {
    const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
    page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
    await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
    for (const [label, p] of poke) { console.log(k, label, JSON.stringify(await page.evaluate((l, p) => window.__canvasApi.updateCabinet(l, p), label, p))); await sleep(4000) }
    for (const ci of await page.evaluate(() => window.__canvasApi.getIssues())) for (const e of [...ci.errors, ...ci.warnings]) console.log(' ', k, ci.label, e.code, e.message)
    await page.close()
  }
} finally { await browser.close() }

for (const [R, labels] of [[FC, ['BC-02', 'BC-03']], ...(danny ? [[danny.id, ['TC-03']]] : [])]) for (const l of labels) {
  const c = await get(R, l)
  const fz = chk('fz', await sb.from('face_zones').select('face_type,x,y,z,dx,dy').eq('cabinet_instance_id', c.id))
  const ip = chk('ip', await sb.from('internal_parts').select('part_type,y,dy').eq('cabinet_instance_id', c.id))
  console.log(l, 'faces', JSON.stringify(fz), 'internal', JSON.stringify(ip.map(p => [p.part_type, p.y])))
}
process.exit(0)
