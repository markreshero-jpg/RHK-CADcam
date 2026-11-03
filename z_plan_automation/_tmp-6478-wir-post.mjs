// RHK6478 Master WIR post: fillers flush with the carcass fronts (Teak 16), BH 583.5 deep (fascia flush with the 600 fronts),
// butting ends = half-depth division at the back (footprint), 30 shadow strip on the two cabs dropped under the bulkhead (+ the filler beside #18)
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = 'e58340a6-4b68-4543-a1ca-a686b515a647', T16 = '67ecbeff-98ac-41e1-9b1a-618a5bf6a96b'
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,notes,dx,dz').eq('room_id', R))
const by = re => { const c = cabs.find(c => re.test(c.notes ?? '')); if (!c) throw new Error('no cab ' + re); return c }
// fillers
for (const c of cabs.filter(c => /30 Teak filler/.test(c.notes ?? '')))
  chk('fill', await sb.from('cabinet_custom_parts').update({ material_id: T16, expressions: { z: 'cab.d - t.exposed', dx: 'cab.w', dy: 'cab.h', dz: 't.exposed' } }).eq('cabinet_instance_id', c.id).eq('name', 'Filler'))
// butting ends: half-depth division at the back (y 0..300), front half open
const fp = side => {
  const V = side === 'left'
    ? [['back', '0', '0', 'back'], ['right', 'cab.w', '0', 'side'], ['front', 'cab.w', 'cab.d', 'front'], ['corner_open', '0', 'cab.d', 'open'], ['corner_div', '0', '300', 'side']]
    : [['back', '0', '0', 'back'], ['corner_div', 'cab.w', '0', 'side'], ['corner_open', 'cab.w', '300', 'open'], ['front', 'cab.w', 'cab.d', 'front'], ['left', '0', 'cab.d', 'side']]
  return V
}
const mk = (V, w, d) => {
  const ev = s => Function('cab', `return ${s}`)({ w, d })
  const pts = V.map(v => ({ x: ev(v[1]), y: ev(v[2]) }))
  return { preset: null, params: {}, from_preset: 'rectangle', segments: V.map((v, i) => ({ type: 'line', p0: pts[i], p1: pts[(i + 1) % V.length], p0_expr: { x: v[1], y: v[2] }, edge: { id: v[0], role: v[3] } })) }
}
const butt = [[by(/^# 26 /), 'left'], [by(/^# 14 /), 'right'], [by(/^Elev 1 open shelf/), 'right']]
for (const [c, side] of butt) chk('fp', await sb.from('cabinet_instances').update({ footprint: mk(fp(side), Number(c.dx), Number(c.dz)) }).eq('id', c.id))
// 30 shadow strips on the cabs dropped to 2370 (Elev 3 #18 incl. the 30 filler on its left, Elev 1 unit)
const strip = (c, x, dx) => ({ cabinet_instance_id: c.id, part_library_id: 'ecd95bb2-900b-4341-ab42-d6b98412f2e0', name: '30 Shadow', material_id: T16, orientation: 'front', sort_order: 9,
  x: 0, y: 2270, z: 583.5, dx: 0, dy: 30, dz: 16.5, edge_top: false, edge_bottom: true, edge_left: false, edge_right: false, visible: true, no_cnc: false,
  expressions: { x, y: 'cab.h', z: 'cab.d - t.exposed', dx, dy: '30', dz: 't.exposed' } })
for (const [c, x, dx] of [[by(/^# 18 /), '-30', 'cab.w + 30'], [by(/^Elev 1 open shelf/), '0', 'cab.w']]) {
  chk('del', await sb.from('cabinet_custom_parts').delete().eq('cabinet_instance_id', c.id).eq('name', '30 Shadow'))
  chk('ins', await sb.from('cabinet_custom_parts').insert(strip(c, x, dx)))
}
// BHs 583.5 deep: fascia front flush with the 600 carcass fronts
const bhs = cabs.filter(c => /^30 shadow/.test(c.notes ?? ''))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => d.dismiss())
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(5000)
  const api = (fn, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a])
  for (const c of cabs) { await api('updateCabinet', c.label, { dz: bhs.includes(c) ? 583.5 : Number(c.dz) }); await sleep(1200) }
  for (const [c] of butt) {
    const rp = await api('getResolved', c.label)
    console.log('==', c.label, c.notes.slice(0, 30))
    for (const p of [...rp.case_parts, ...rp.internal_parts]) if (!/rail_support|accessory/.test(p.part_key ?? p.part_type)) console.log('  ', p.part_key ?? p.part_type, 'X', p.X, 'Y', p.Y, 'Z', p.Z, 'DX', p.DX, 'DY', p.DY, 'DZ', p.DZ)
  }
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
