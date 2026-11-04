// RHK6478 (Mark 2026-11-05): US Main Ensuite, US Powder, DS Powder - each 33 end panel (16.5 full-depth panel + 70 scribe
// strip, two TEPF cabinets) becomes ONE 33 TEPF assembly holding both parts, so it reads 33 not 16.5 + 16.5.
// Left: keep TC-01 (strip x 0, panel moved in at x 16.5), TC-02 deleted. Right: keep TC-03 (panel x 0, strip moved in at
// x 16.5), TC-04 deleted, TC-03 relabelled TC-02. Part comments on both: build up first, edge the 33 after.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const ROOMS = { 'US Main Ensuite': '6e8f14c4-1325-4f07-b312-a6f9386d0245', 'US Powder': '14b571e0-ba97-410c-988a-6950e6da5780', 'DS Powder': 'e2a2d342-8475-4967-b1be-8387919acd1c' }
const P = 16.5
const C_PANEL = 'BUILD UP FIRST: 70 scribe strip glued face to face onto the wall-side face at the front = 33 END PANEL. EDGE AFTER build-up - edge the 33 as one piece, not each 16.5'
const C_STRIP = 'BUILD UP FIRST: glue face to face onto the front 70 of the full-depth panel (wall side) = 33 END PANEL, scribe to wall. EDGE AFTER build-up - edge the 33 as one piece'

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
const open = async R => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1500); return r }
try {
  for (const [name, R] of Object.entries(ROOMS)) {
    console.log('==', name)
    const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,pos_x,pos_z,dy,notes,part_comments').eq('room_id', R).in('label', ['TC-01', 'TC-02', 'TC-03', 'TC-04']))
    const C = l => cabs.find(c => c.label === l)
    if (cabs.length !== 4) throw new Error(name + ': expected TC-01..04, got ' + cabs.map(c => c.label))
    const parts = chk('cp', await sb.from('cabinet_custom_parts').select('id,cabinet_instance_id,dx').in('cabinet_instance_id', cabs.map(c => c.id)))
    const partOf = l => { const ps = parts.filter(p => p.cabinet_instance_id === C(l).id); if (ps.length !== 1) throw new Error(`${name} ${l}: ${ps.length} parts`); return ps[0] }
    // sanity: TC-01 / TC-04 are the 70 strips, TC-02 / TC-03 the full-depth panels
    if (partOf('TC-01').dx !== 70 || partOf('TC-04').dx !== 70 || partOf('TC-02').dx === 70 || partOf('TC-03').dx === 70) throw new Error(name + ': unexpected part layout')
    const ann = chk('ann', await sb.from('room_annotations').select('*').eq('room_id', R))
    for (const del of ['TC-02', 'TC-04']) if (JSON.stringify(ann).includes(C(del).id)) throw new Error(`${name}: CAD references ${del}`)
    const AFF = `${C('TC-01').pos_z}-${C('TC-01').pos_z + C('TC-01').dy} AFF`

    // left: TC-01 = strip (x 0, wall side) + panel (x 16.5)
    const sL = partOf('TC-01'), pL = partOf('TC-02')
    chk('pL', await sb.from('cabinet_custom_parts').update({ cabinet_instance_id: C('TC-01').id, x: P, name: 'End panel 16.5 (full depth)' }).eq('id', pL.id))
    chk('sL', await sb.from('cabinet_custom_parts').update({ x: 0, name: 'Scribe strip 70 (wall side)' }).eq('id', sL.id))
    chk('TC-01', await sb.from('cabinet_instances').update({ dx: 2 * P, notes: `Left 33 END PANEL assembly (one piece): 16.5 full-depth panel + 70 scribe strip on the wall side, glued, then edged. ${AFF} under the apron`,
      part_comments: { ['custom_' + sL.id]: C_STRIP, ['custom_' + pL.id]: C_PANEL } }).eq('id', C('TC-01').id))
    chk('del TC-02', await sb.from('cabinet_instances').delete().eq('id', C('TC-02').id))

    // right: TC-03 = panel (x 0) + strip (x 16.5, wall side), relabelled TC-02
    const pR = partOf('TC-03'), sR = partOf('TC-04')
    chk('sR', await sb.from('cabinet_custom_parts').update({ cabinet_instance_id: C('TC-03').id, x: P, name: 'Scribe strip 70 (wall side)' }).eq('id', sR.id))
    chk('pR', await sb.from('cabinet_custom_parts').update({ x: 0, name: 'End panel 16.5 (full depth)' }).eq('id', pR.id))
    chk('TC-03', await sb.from('cabinet_instances').update({ label: 'TC-02', dx: 2 * P, notes: `Right 33 END PANEL assembly (one piece): 16.5 full-depth panel + 70 scribe strip on the wall side, glued, then edged. ${AFF} under the apron`,
      part_comments: { ['custom_' + pR.id]: C_PANEL, ['custom_' + sR.id]: C_STRIP } }).eq('id', C('TC-03').id))
    chk('del TC-04', await sb.from('cabinet_instances').delete().eq('id', C('TC-04').id))

    // re-resolve + report
    await open(R)
    let st = await api('getState')
    for (const cb of st.cabinets) await api('updateCabinet', cb.label, { dz: cb.dz })
    await open(R)
    st = await api('getState')
    for (const cb of st.cabinets.filter(c => /^TC/.test(c.label))) {
      console.log(cb.label, 'off', cb.offset, cb.dx, cb.dy, cb.dz, 'pos_z', cb.pos_z)
      const rp = await api('getResolved', cb.label)
      for (const p of rp.custom_parts ?? []) console.log('   ', p.name, p.orientation, 'x', p.x, 'z', p.z, p.dx, p.dy, p.dz)
    }
    const issues = await api('getIssues'); let n = 0
    for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
    console.log('issues', n)
  }
} finally { await browser.close() }
