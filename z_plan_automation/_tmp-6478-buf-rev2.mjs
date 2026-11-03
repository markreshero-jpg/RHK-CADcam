// RHK6478 Buffet rev 2 (Mark 2026-11-02): WC-02 open unit has no bottom (gables + back to the bench); WC-03 3 bottom reveal
// (sits on the benchtop); WC-01 front filler in Sublime Teak timbergrain; job kick face = the 2pac board (was the schedule's MDF).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const P = 'fa0884a2-abd1-4370-adfa-a30044e88ef2', BUF = '0df13af4-8a6f-438f-a10d-6a9b4754aa97', LAU = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc'
const PAC_BOARD = 'b07a7e40-facd-4cdf-8856-60712e940b44', TEAK_AG18 = 'd67d85b0-b12b-4b03-be3c-8bdbbf23cd11'
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,rule_overrides,material_overrides,part_hide_views').eq('room_id', BUF))
const by = l => cabs.find(c => c.label === l)
// WC-02: bottom removed (not made), back runs down to the gable bottoms
const w2 = by('WC-02')
chk('WC-02', await sb.from('cabinet_instances').update({ part_hide_views: { ...(w2.part_hide_views ?? {}), case_bottom: ['plan', 'elevation', '3d'] },
  rule_overrides: { ...(w2.rule_overrides ?? {}), BOTTOM_BACK_JOIN: 'butts_into_back' },
  notes: 'Open shelf unit, LX Board 33mm Sublime Teak, NO bottom (gables + whiteboard back down to the bench), mirror backs by RHK, 3 fixed 33 shelves, flush with the doors' }).eq('id', w2.id))
// WC-03: 3 bottom reveal - it stands on the benchtop
const w3 = by('WC-03')
chk('WC-03', await sb.from('cabinet_instances').update({ rule_overrides: { ...(w3.rule_overrides ?? {}), REVB: 3 } }).eq('id', w3.id))
// WC-01: front filler beside the open unit in timbergrain (Lx Absolute Grain 18 Sublime Teak)
chk('WC-01', await sb.from('cabinet_instances').update({ material_overrides: { ...(by('WC-01').material_overrides ?? {}), exposed: TEAK_AG18 } }).eq('id', by('WC-01').id))
// job kick face = 2pac board (Bath Linen keeps its room Teak face)
chk('tk del', await sb.from('job_toekick_materials').delete().eq('project_id', P).eq('part_role', 'face'))
chk('tk', await sb.from('job_toekick_materials').insert({ project_id: P, part_role: 'face', material_id: PAC_BOARD }))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  const open = async R => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
  const api = (fn, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a])
  for (const R of [BUF, LAU]) {
    await open(R)
    let st = await api('getState')
    for (const c of st.cabinets) { await api('updateCabinet', c.label, { dz: c.dz }); await sleep(800) }
    if (R === BUF) for (const l of ['WC-02', 'WC-03', 'WC-01', 'BC-03']) {
      const rp = await api('getResolved', l)
      console.log(l, JSON.stringify({ case: rp.case_parts.map(p => [p.part_key, p.Y, p.DY, p.material_id?.slice(0, 8)]), custom: rp.custom_parts.map(p => [p.name, p.material_id?.slice(0, 8)]),
        faces: rp.face_zones.map(z => [z.Y, z.DY]), kick: (rp.toekick_parts ?? []).filter(p => /face/.test(p.part_key)).map(p => p.material_id?.slice(0, 8)), hide: rp.part_hide_views }))
    }
    const kicks = st.cabinets.filter(c => /KICK/.test(c.label))
    for (const k of kicks) { const rp = await api('getResolved', k.label); console.log(R === BUF ? 'Buffet' : 'Laundry', k.label, JSON.stringify((rp.toekick_parts ?? rp.case_parts).filter(p => /face/.test(p.part_key)).map(p => p.material_id?.slice(0, 8)))) }
    const issues = await api('getIssues'); let n = 0
    for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
    console.log('issues', n)
  }
} finally { await browser.close() }
