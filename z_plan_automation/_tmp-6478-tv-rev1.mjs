// RHK6478 DS TV Unit rev 1 (Mark 2026-11-03): bottom LP row under the TV removed; the two centre drawer units
// lifted to fill it as 3 equal drawers (no D3-LLL in the library -> D3-SLL, rows unlocked = equal, as the Buffet).
// Centre box starts at the TV opening (995 AFF, 2690 line - 1695); 33 top under it at 962-995, so drawers dy 962
// incl the 100 kick. WC-01 top split: left col keeps 567, new WUP over BC-03 at 962.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = '46c02367-c556-489e-9907-67785eb2cd87', Y = 512.8, TOP = 2690, BOX_BOT = 995, BT = 33, DRW = BOX_BOT - BT
const TEAK33 = '8fae4f9c-02aa-4799-a46d-52be445d247d'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const cab = async l => chk(l, await sb.from('cabinet_instances').select('*').eq('room_id', R).eq('label', l).maybeSingle())
const three = { cols: [{ col_index: 0, width_locked: false }],
  rows: [0, 1, 2].map(i => ({ row_index: i, height_locked: false })),
  zones: [0, 1, 2].map(i => ({ col_index: 0, row_index: i, face_type: 'drawer_face', hinge_side: 'left' })) }

// Centre box: TV opening (flex) + top LP row, cubes unchanged.
const w6 = await cab('WC-06')
const g = w6.internal_grid
if (g.tree.children.length === 3) {
  g.tree.children.shift()
  delete g.tree.children[0].size
  chk('WC-06 grid', await sb.from('cabinet_instances').update({ internal_grid: g, notes: 'Centre 2035 int: TV opening 2035 x 1300 (TV 1725 x 1000) on the 33 top / 6 LP cubes over' }).eq('id', w6.id))
}
// Old centre drawers out (parts cascade); placed fresh as D3-SLL below.
for (const l of ['BC-03', 'BC-04']) { const c = await cab(l); if (c && c.dy < 900) chk('del ' + l, await sb.from('cabinet_instances').delete().eq('id', c.id)) }
chk('WC-01', await sb.from('cabinet_instances').update({ dx: 556 }).eq('label', 'WC-01').eq('room_id', R))

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
  const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 180000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 180000 }); await sleep(4000) }
  const api = (fn, ...a) => Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]), sleep(90000).then(() => 'TIMEOUT')])
  await open()
  const before = new Set((await api('getState')).cabinets.map(c => c.id))
  for (const [off, dx] of [[556, 1035], [1591, 1036]]) { console.log(JSON.stringify(await api('placeCabinet', { def: 'D3-SLL', wall: 'Wall 4', offset: off, dx }))); await sleep(1200) }
  console.log(JSON.stringify(await api('placeCabinet', { def: 'WUP', wall: 'Wall 4', offset: 556, dx: 1035 }))); await sleep(1200)
  let st = await api('getState')
  const fresh = st.cabinets.filter(c => !before.has(c.id))
  const d3 = fresh.filter(c => /^BC/.test(c.label)).sort((a, b) => a.offset - b.offset)
  const wup = fresh.find(c => /^WC/.test(c.label))
  for (const [i, c] of d3.entries())
    chk(c.label, await sb.from('cabinet_instances').update({ label: ['BC-03', 'BC-04'][i], face_grid: three, pos_y: Y,
      notes: `3 equal drawers under the TV, ${i ? 'centre right' : 'centre left'}` }).eq('id', c.id))
  chk('wup', await sb.from('cabinet_instances').update({ label: 'WC-12', pos_z: DRW, pos_y: Y, rule_overrides: { UNDER_PANEL: true },
    material_overrides: { exposed: TEAK33 }, notes: `33 top under the TV - LX Board 33mm Sublime Teak, ${BOX_BOT} AFF` }).eq('id', wup.id))
  chk('WC-02', await sb.from('cabinet_instances').update({ pos_z: DRW, notes: `33 top under the TV - LX Board 33mm Sublime Teak, ${BOX_BOT} AFF` }).eq('label', 'WC-02').eq('room_id', R))
  await open()
  for (const l of ['BC-03', 'BC-04']) { await api('updateCabinet', l, { dy: DRW, dz: 380 }); await sleep(1500) }
  for (const l of ['WC-12', 'WC-02', 'WC-01']) { await api('updateCabinet', l, { dy: BT, dz: 400 }); await sleep(1000) }
  await api('updateCabinet', 'WC-06', { dy: TOP - BOX_BOT }); await sleep(1500)
  st = await api('getState')
  for (const c of st.cabinets) console.log(c.label, c.offset, c.dx, c.dy, c.dz)
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
for (const c of chk('fin', await sb.from('cabinet_instances').select('label,pos_x,pos_y,pos_z,dx,dy,dz').eq('room_id', R).order('label'))) console.log(c.label, c.pos_x, c.pos_y, c.pos_z, `${c.dx}x${c.dy}x${c.dz}`)
