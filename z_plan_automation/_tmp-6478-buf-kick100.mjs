// RHK6478 Buffet (Mark 2026-11-05):
// 1. Kick 140 -> 100: room TOEH override dropped (job TOEH 100); BC-03 / BC-04 drop 40 and grow 40 (tops stay 880), KICK 1 100 high.
// 2. Wall cleats at the back of the two bar fridge bays (0-620, 638-1258), top flush with the BC-03 carcass top (880 AFF):
//    a BEPF per bay with its Applied Panel turned flat on the wall (orientation front, z 0), 100 high, carcass board.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const R = '0df13af4-8a6f-438f-a10d-6a9b4754aa97', CH = 100, TOP = 880

const room = chk('room', await sb.from('rooms').select('rule_overrides').eq('id', R).single())
if (room.rule_overrides?.TOEH === 140) {
  const { TOEH, ...rest } = room.rule_overrides
  chk('room upd', await sb.from('rooms').update({ rule_overrides: rest }).eq('id', R))
  const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,pos_z,dy,is_kick_assembly').eq('room_id', R))
  for (const c of cabs) {
    let patch = null
    if (c.is_kick_assembly && c.dy === 140) patch = { dy: 100 }
    else if (c.pos_z === 140) patch = { pos_z: 100, dy: c.dy + 40 }
    if (patch) { chk(c.label, await sb.from('cabinet_instances').update(patch).eq('id', c.id)); console.log(c.label, JSON.stringify(patch)) }
  }
}
// carcass board = BC-03 gable material
const bc03 = chk('bc03', await sb.from('cabinet_instances').select('id').eq('room_id', R).eq('label', 'BC-03').single())
const gable = chk('gable', await sb.from('case_parts').select('part_key,material_id,dz').eq('cabinet_instance_id', bc03.id).ilike('part_key', '%left%'))[0]
console.log('carcass board', gable)

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
const open = async () => { await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(60000).then(() => 'TIMEOUT')]); await sleep(1500); return r }
try {
  await open()
  let st = await api('getState')
  for (const c of st.cabinets) await api('updateCabinet', c.label, { dy: c.dy })
  const wall2 = st.walls.find(w => w.name === 'Wall 2')
  const existing = chk('ex', await sb.from('cabinet_instances').select('id').eq('room_id', R).ilike('notes', 'Wall cleat%'))
  if (!existing.length) {
    const before = new Set(st.cabinets.map(c => c.id))
    for (const off of [0, 638]) console.log(JSON.stringify(await api('placeCabinet', { def: 'BEPF', wall: wall2.id, offset: off, dx: 620 })))
    st = await api('getState')
    const neu = st.cabinets.filter(c => !before.has(c.id)).sort((a, b) => a.offset - b.offset)
    for (const [i, c] of neu.entries()) {
      chk('cab', await sb.from('cabinet_instances').update({ dx: 620, dy: CH, dz: gable.dz, pos_z: TOP - CH, has_toekick: false,
        notes: `Wall cleat, back of bar fridge ${i + 1} bay: ${CH} x 620 x ${gable.dz} carcass board, top ${TOP} AFF flush with the BC-03 carcass top - carries the back of the benchtop` }).eq('id', c.id))
      const cp = chk('cp', await sb.from('cabinet_custom_parts').select('id').eq('cabinet_instance_id', c.id))
      if (cp.length !== 1) throw new Error(c.label + ' parts ' + cp.length)
      chk('cp upd', await sb.from('cabinet_custom_parts').update({ name: 'Wall cleat', orientation: 'front', x: 0, y: 0, z: 0, dx: 620, dy: CH, dz: gable.dz,
        expressions: { dx: 'cab.w', dy: 'cab.h' }, material_id: gable.material_id, material_override_id: gable.material_id,
        edge_top: false, edge_bottom: false, edge_left: false, edge_right: false }).eq('id', cp[0].id))
      chk('cmt', await sb.from('cabinet_instances').update({ part_comments: { ['custom_' + cp[0].id]: `WALL CLEAT - screw to the wall at the back of the fridge bay, top ${TOP} AFF flush with BC-03` } }).eq('id', c.id))
    }
  }
  await open()
  st = await api('getState')
  for (const c of st.cabinets) await api('updateCabinet', c.label, { dz: c.dz })
  await open()
  st = await api('getState')
  for (const c of st.cabinets) console.log(c.label, c.def ?? '', 'off', c.offset, c.dx, c.dy, c.dz)
  const db = chk('db', await sb.from('cabinet_instances').select('label,pos_z,dy').eq('room_id', R).order('label'))
  console.log(db.map(c => `${c.label} ${c.pos_z}+${c.dy}=${c.pos_z + c.dy}`).join(' | '))
  for (const c of st.cabinets.filter(c => /cleat/i.test(c.notes ?? '') || c.dy === CH && c.dx === 620)) {
    const rp = await api('getResolved', c.label)
    for (const p of rp.custom_parts ?? []) console.log('  ', c.label, p.name, p.orientation, p.x, p.y, p.z, p.dx, p.dy, p.dz)
  }
  const issues = await api('getIssues'); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
