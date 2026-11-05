// RHK6592 rev 12 (Mark 2026-11-05): BC-04's kick detached into its own kick assembly (KICK 3, as the canvas
// "Detach kick" does: kick_runs row + member detach transform + assembly row), extended 618 -> 520 to meet
// KICK 1's face, face only (sub / back / spreaders hidden = not made). Replaces rev 11's custom kick part.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (m, r) => { if (r.error) throw new Error(m + ': ' + r.error.message); console.log('ok', m); return r.data }
const BUT = '1c00eb19-09c1-41b8-8c7c-a6441ee0263d'
const bc04 = chk('BC-04', await sb.from('cabinet_instances').select('*').eq('room_id', BUT).eq('label', 'BC-04').single())

// undo rev 11 on BC-04 (my custom part + hidden face)
chk('drop rev11 part', await sb.from('cabinet_custom_parts').delete().eq('cabinet_instance_id', bc04.id).eq('name', 'Kick return face'))
if (!bc04.kick_run_id) {
  const run = chk('run', await sb.from('kick_runs').insert({ room_id: BUT, split_mode: 'equal', build_to_depth: Number(bc04.dz) }).select('id').single())
  chk('BC-04 detach', await sb.from('cabinet_instances').update({
    kick_run_id: run.id, dy: Number(bc04.dy) - 110, pos_z: Number(bc04.pos_z ?? 0) + 110, has_toekick: false,
    hidden_parts: (bc04.hidden_parts ?? []).filter(k => k !== 'tk_kick_front_face_0'),
    notes: 'Void corner return filler 58 (40 face + 18). Kick detached (KICK 3), run on to meet KICK 1.',
  }).eq('id', bc04.id))
  const asm = chk('KICK 3', await sb.from('cabinet_instances').insert({
    room_id: BUT, wall_id: bc04.wall_id, assembly_class: 'base', label: 'KICK 3',
    pos_x: Number(bc04.pos_x), pos_y: Number(bc04.pos_y), pos_z: 0, rotation: bc04.rotation,
    dx: 98, dy: 110, dz: Number(bc04.dz),
    has_carcass: false, has_internal: false, has_face: false, has_toekick: true, is_kick_assembly: true, kick_run_id: run.id,
    notes: 'BC-04 kick, face only, run on 40 past the filler to meet KICK 1 face (x 520 -> 618 to BC-05)',
  }).select('id').single())
  chk('run asm', await sb.from('kick_runs').update({ kick_cabinet_id: asm.id }).eq('id', run.id))
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage()
  page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  const open = async () => { await page.goto(`http://localhost:3001/canvas/${BUT}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi'); await sleep(1500) }
  const api = async (fn, ...args) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, args]); console.log(fn, JSON.stringify(args), JSON.stringify(r)?.slice(0, 160)); await sleep(700); return r }
  const tk = l => page.evaluate(async l => ((await window.__canvasApi.getResolved(l))?.toekick_parts ?? []).map(q => [q.part_key, q.X, q.Z, q.DY]), l)
  await open()
  await api('updateCabinet', 'BC-04', { dy: 770 })
  await api('updateCabinet', 'KICK 3', { dy: 110 })
  const parts = await tk('KICK 3')
  console.log('KICK 3 parts', JSON.stringify(parts))
  const hide = parts.map((p, i) => `tk_${p[0]}_${i}`).filter(k => !k.startsWith('tk_kick_front_face_'))
  chk('KICK 3 face only', await sb.from('cabinet_instances').update({ hidden_parts: hide }).eq('room_id', BUT).eq('label', 'KICK 3'))
  await open()
  await api('updateCabinet', 'KICK 3', { dy: 110 })
  console.log('BC-04', JSON.stringify(await tk('BC-04')), 'KICK 3', JSON.stringify(await tk('KICK 3')))
  for (const x of await page.evaluate(() => window.__canvasApi.getIssues())) if (x.errors.length || x.warnings.length) console.log(x.label, JSON.stringify([...x.errors, ...x.warnings].map(e => e.code + ' ' + e.message)))
  console.log('done')
} finally { await browser.close() }
