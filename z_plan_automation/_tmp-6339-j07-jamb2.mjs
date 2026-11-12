// RHK6339 J07 (Mark 2026-11-12): BC-04 becomes a whole door frame (display only, by others): near jamb on the
// 305 return end, 800 head across the top running away from the J07 wall (door in the Wall 4 line), far jamb at
// its end. BC-04 frame: x along Wall 3 (220 = wall thickness), y up, z = away from Wall 3 (0 at the back of the
// near jamb, 305 off the frame). Head 800 overall x 220 x 31 on top (2229-2260); jambs 31 x 220 x 2229 under it.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const R = '3bd26e44-cc9a-4c6f-bbae-a4fa0d59aeef', H = 2260, T = 31, W = 220, HEAD = 800
const jc = chk('bc04', await sb.from('cabinet_instances').select('id,label,notes').eq('room_id', R).eq('label', 'BC-04').single())
const cps = chk('parts', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', jc.id).order('sort_order'))
const { id: _i, created_at: _a, updated_at: _u, ...base } = cps[0]
const want = [
  { name: 'Door jamb 31 x 220 - near (existing, by others)', orientation: 'front', x: 0, y: 0, z: 0, dx: W, dy: H - T, dz: T },
  { name: 'Door head 31 x 220 x 800 (existing, by others)', orientation: 'flat', x: 0, y: H - T, z: 0, dx: HEAD, dy: W, dz: T },
  { name: 'Door jamb 31 x 220 - far (existing, by others)', orientation: 'front', x: 0, y: 0, z: HEAD - T, dx: W, dy: H - T, dz: T },
]
for (const [i, w] of want.entries()) {
  const row = { ...base, ...w, expressions: {}, sort_order: i }
  if (cps[i]) chk('upd', await sb.from('cabinet_custom_parts').update(row).eq('id', cps[i].id))
  else chk('ins', await sb.from('cabinet_custom_parts').insert(row))
}
chk('cab', await sb.from('cabinet_instances').update({ dz: HEAD,
  notes: 'DOOR FRAME timber 31 x 220 - existing, fitted on site (by others). Display only, No CNC. Near jamb on the end of the 305 return (Wall 4), 800 head across the top (2229-2260), far jamb at its end. Height 2260 TBC (door leaf top = beam U/S 2227). The J07 33 top butts the near jamb.' }).eq('id', jc.id))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => d.dismiss())
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message); await sleep(2500); return r }
try {
  await open()
  console.log(JSON.stringify(await api('updateCabinet', 'BC-04', { dz: HEAD })))
  await open()
  const rp = await api('getResolved', 'BC-04')
  console.log(JSON.stringify(rp?.custom_parts?.map(p => [p.name, p.orientation, p.x, p.y, p.z, p.DX ?? p.dx, p.DY ?? p.dy, p.DZ ?? p.dz])))
  for (const ci of await api('getIssues')) for (const e of [...ci.errors, ...ci.warnings]) console.log('  !', ci.label, e.code, e.message)
} finally { await browser.close() }
console.log(JSON.stringify(chk('p', await sb.from('cabinet_custom_parts').select('name,orientation,x,y,z,dx,dy,dz').eq('cabinet_instance_id', jc.id))))
