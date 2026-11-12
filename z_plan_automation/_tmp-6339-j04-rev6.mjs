// RHK6339 J04 rev 6 (Mark 2026-11-12): same 31 x 220 door jamb at the Wall 3 end - mirror of BC-04:
// covers the right 14 lining edge (x 2257..2477), 700-731 off the back wall, 2212 high, display only / No CNC.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'b2252689-fdc9-4fd7-be9a-f29853f0391e'
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const cab = async l => (await sb.from('cabinet_instances').select('*').eq('room_id', R).eq('label', l).maybeSingle()).data
const left = await cab('BC-04')
const leftPart = chk('bc04 part', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', left.id).single())

const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => d.dismiss())
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message); await sleep(2500); return r }
try {
  await open()
  let jc = (await sb.from('cabinet_instances').select('id,label').eq('room_id', R).ilike('notes', 'DOOR JAMB%WALL 3%').maybeSingle()).data
  if (!jc) {
    const before = new Set((await api('getState')).cabinets.map(c => c.label))
    console.log(JSON.stringify(await api('placeCabinet', { def: 'BUP', wall: 'Wall 2', offset: 600 })))
    const lbl = (await api('getState')).cabinets.map(c => c.label).find(l => !before.has(l))
    jc = await cab(lbl)
  }
  console.log('jamb cabinet', jc.label)
  chk('jamb row', await sb.from('cabinet_instances').update({ dx: 220, dy: 2212, dz: 31, pos_x: 2257, pos_y: 700, pos_z: 0, no_cnc: true,
    notes: left.notes.replace('Covers the 14 lining edge.', 'Covers the 14 lining edge.') + ' WALL 3 end (mirror of BC-04).' }).eq('id', jc.id))
  const { id: _i, cabinet_instance_id: _c, created_at: _a, updated_at: _u, ...part } = leftPart
  const cps = chk('parts', await sb.from('cabinet_custom_parts').select('id').eq('cabinet_instance_id', jc.id))
  if (cps.length) { chk('upd', await sb.from('cabinet_custom_parts').update(part).eq('id', cps[0].id)); for (const p of cps.slice(1)) chk('del', await sb.from('cabinet_custom_parts').delete().eq('id', p.id)) }
  else chk('ins', await sb.from('cabinet_custom_parts').insert({ ...part, cabinet_instance_id: jc.id }))
  await open()
  console.log(JSON.stringify(await api('updateCabinet', jc.label, { dz: 31 })))
  await open()
  for (const c of (await api('getState')).cabinets) console.log(' ', c.label, 'off', c.offset, 'dx', c.dx, 'dy', c.dy, 'dz', c.dz)
  for (const ci of await api('getIssues')) for (const e of [...ci.errors, ...ci.warnings]) console.log('  !', ci.label, e.code, e.message)
  const j = await cab(jc.label); console.log('row', j.pos_x, j.pos_y, j.pos_z, j.dx, j.dy, j.dz, j.no_cnc)
} finally { await browser.close() }
