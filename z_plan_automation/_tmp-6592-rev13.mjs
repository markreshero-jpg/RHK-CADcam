// RHK6592 rev 13 (Mark 2026-11-05): BC-03 false panel shown + made again (zone_0_1 was hidden in all views = removed);
// TC-01 (PT end panel) lifted onto the kick (pos_z 110, 2090); KICK 2 runs west under TC-01 into KICK 1's face
// (offset 602 -> 520, dx 2472, inside corner butt at x 520).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const BUT = '1c00eb19-09c1-41b8-8c7c-a6441ee0263d'
const row = (await sb.from('cabinet_instances').select('id,part_hide_views').eq('room_id', BUT).eq('label', 'BC-03').single()).data
const phv = { ...(row.part_hide_views ?? {}) }; delete phv.zone_0_1
const u = await sb.from('cabinet_instances').update({ part_hide_views: phv }).eq('id', row.id); if (u.error) throw new Error(u.error.message)
console.log('BC-03 false panel unhidden')
await sb.from('cabinet_instances').update({ notes: 'PT 16 Classic White Matt panel, on the kick (110) to 2200, 300 OA; KICK 2 runs under it to KICK 1' }).eq('room_id', BUT).eq('label', 'TC-01')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' })
try {
  const p = await b.newPage(); await p.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await p.goto(`http://localhost:3001/canvas/${BUT}`, { waitUntil: 'networkidle2', timeout: 90000 }); await p.waitForFunction('!!window.__canvasApi'); await sleep(1500)
  const api = async (fn, ...a) => { const r = await p.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]); console.log(fn, JSON.stringify(a), JSON.stringify(r)); await sleep(800) }
  await api('updateCabinet', 'BC-03', { dy: 770 })
  await api('updateCabinet', 'TC-01', { dy: 2090, pos_z: 110 })
  await api('updateCabinet', 'KICK 2', { offset: 520, dx: 2472 })
  for (const l of ['TC-01', 'KICK 2']) console.log(l, JSON.stringify(await p.evaluate(async l => { const x = await window.__canvasApi.getResolved(l); return [...x.case_parts, ...x.toekick_parts, ...(x.custom_parts ?? [])].map(q => [q.part_key ?? q.name, q.X, q.Y, q.Z, q.DX, q.DY, q.DZ]) }, l)))
  for (const x of await p.evaluate(() => window.__canvasApi.getIssues())) if (x.errors.length || x.warnings.length) console.log(x.label, JSON.stringify([...x.errors, ...x.warnings].map(e => e.code + ' ' + e.message)))
  console.log('done')
} finally { await b.close() }
