// RHK6595 (Mark 2026-11-08): join the island kicks - front row (BC-10..13) and back row (BC-14, BC-01..03) as two runs
// (detectKickRun now keeps a run to one facing). The back-row kick assembly gets the teak face (no fronts of its own).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ROOM = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb', TEAK18 = 'd67d85b0-b12b-4b03-be3c-8bdbbf23cd11'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
const state = page => page.evaluate(() => window.__canvasApi.getState())
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'domcontentloaded', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 180000 }); await sleep(6000)
  for (const l of ['BC-12', 'BC-02']) {
    const c = (await state(page)).cabinets.find(x => x.label === l)
    if (c.kick_run_id) { console.log(l, 'already joined'); continue }
    // A mixed-depth confirm would mean the run still mixes facings: bail out rather than click it.
    const r = await Promise.race([page.evaluate(l => window.__canvasApi.joinKicks(l), l), sleep(15000).then(() => 'TIMEOUT (modal?)')])
    console.log('join', l, JSON.stringify(r)); await sleep(4000)
  }
  const cabs = (await state(page)).cabinets
  const runOf = l => cabs.find(x => x.label === l)?.kick_run_id
  for (const l of ['BC-10', 'BC-11', 'BC-12', 'BC-13', 'BC-14', 'BC-01', 'BC-02', 'BC-03']) console.log(l, 'run', runOf(l)?.slice(0, 8))
  const asm = cabs.filter(c => c.is_kick_assembly)
  for (const a of asm) console.log(a.label, 'run', a.kick_run_id?.slice(0, 8), 'pos', a.pos_x, a.pos_y, 'rot', a.rotation, 'dx', a.dx, 'dz', a.dz)
  const backRun = runOf('BC-02'), backAsm = asm.find(a => a.kick_run_id === backRun)
  if (backAsm) {
    const { data: [row] } = await sb.from('cabinet_instances').select('toekick_overrides').eq('id', backAsm.id)
    console.log(backAsm.label, 'teak face', (await sb.from('cabinet_instances').update({ toekick_overrides: { ...(row.toekick_overrides ?? {}), face: TEAK18 } }).eq('id', backAsm.id)).error?.message ?? 'ok')
    await page.goto(`http://localhost:3001/canvas/${ROOM}`, { waitUntil: 'domcontentloaded', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 180000 }); await sleep(6000)
  }
  const { data: mats } = await sb.from('materials').select('id,name').in('id', [TEAK18, '38d56943-7040-460c-af14-289c172ed5e7'])
  for (const a of (await state(page)).cabinets.filter(c => c.is_kick_assembly)) {
    await page.evaluate(([l, dy]) => window.__canvasApi.updateCabinet(l, { dy }), [a.label, a.dy]); await sleep(3000)
    const rp = await page.evaluate(l => window.__canvasApi.getResolved(l), a.label)
    const faces = [...new Set((rp?.toekick_parts ?? []).filter(k => /face/.test(k.part_key)).map(k => mats.find(m => m.id === k.material_id)?.name ?? k.material_id))]
    console.log(a.label, 'face', faces.join(','), 'parts', (rp?.toekick_parts ?? []).length, 'warn', JSON.stringify((rp?.warnings ?? []).map(w => w.message)))
  }
} finally { await browser.close() }
