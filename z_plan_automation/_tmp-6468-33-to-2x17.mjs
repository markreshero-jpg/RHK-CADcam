// RHK6468 (Mark 2026-11-25): every 33 American Oak veneer part -> 2 x 17 laminated (34). Where a full gable sits against
// a cabinet / fridge / wall / void, the hidden layer is only a 100 build-up strip at the front (119 with the door + 2).
// Kitchen: F = full layer, S = 100 strip; [layer at x 0, layer at x 17] in the carrier's own x.
// Carriers stay 33 wide where they are - the second layer runs 1 past (34). How each run takes up the 1 is open (JOB-NOTES).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DRY = process.argv[2] === 'dry'
const KIT = '58bac32f-cdca-4a86-a1a4-c29af7ef9430', WP = '00e46b73-13de-4df3-9235-871505d4ee81'
const V17 = '8afde358-4ab0-4a2e-bb3c-4bbc89de9c9e', V33 = 'a8ec07f1-50df-4440-9157-686efefa56c2'
const FF = ['BC-06', 'BC-08', 'BC-10', 'BC-12', 'BC-14', 'BC-20', 'BC-22', 'BC-35', 'BC-37', 'BC-42', 'BC-47', 'BC-49', 'BC-27', 'BC-28', 'BC-29', 'BC-30', 'TC-08']
const FS = ['BC-04', 'BC-18', 'BC-31', 'TC-01', 'TC-03', 'TC-05', 'BC-39', 'BC-40', 'BC-45'], SF = ['BC-16', 'TC-07', 'BC-44']
const PLAN = Object.fromEntries([...FF.map(l => [l, 'FF']), ...FS.map(l => [l, 'FS']), ...SF.map(l => [l, 'SF'])])
const touched = { [KIT]: [], [WP]: [] }
const strip0 = c => ({ dx: 119, z: c.dz - 100, expressions: { dy: 'cab.h', dz: 't.exposed' }, name: 'Applied Panel - 100 build-up strip' })

// ── Kitchen ──
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,dx,dy,dz,notes,material_overrides').eq('room_id', KIT))
for (const [label, plan] of Object.entries(PLAN)) {
  const c = cabs.find(x => x.label === label)
  if (!c || c.dx !== 33) throw new Error('unexpected carrier ' + label)
  const ps = chk('cp', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', c.id))
  if (ps.length !== 1 || ps[0].material_id !== V33 || ps[0].dz !== 33) { console.log(label, 'SKIP (already done?)', ps.length); touched[KIT].push(label); continue }
  const p = ps[0], { id: _i, created_at: _c, updated_at: _u, ...base } = p
  const layer = (kind, x) => ({ x, dz: 17, material_id: V17, ...(kind === 'S' ? strip0(c) : {}) })
  console.log(label, plan, 'cab dz', c.dz, '| x0', JSON.stringify(layer(plan[0], 0)), '| x17', JSON.stringify(layer(plan[1], 17)))
  touched[KIT].push(label)
  if (DRY) continue
  chk('cab', await sb.from('cabinet_instances').update({ material_overrides: { ...c.material_overrides, exposed: V17 },
    notes: (c.notes ?? '') + ` | 2 x 17 AO laminated (34), was 33 (Mark 2026-11-25)${plan === 'FF' ? '' : ' - full 17 + 100 build-up strip at the front on the hidden side'}` }).eq('id', c.id))
  chk('upd', await sb.from('cabinet_custom_parts').update(layer(plan[0], 0)).eq('id', p.id))
  chk('ins', await sb.from('cabinet_custom_parts').insert({ ...base, ...layer(plan[1], 17), sort_order: 1 }))
}

// ── Wall Panelling: TC-03 cover strips, TC-04 / TC-05 nib gables ──
const wc = chk('wc', await sb.from('cabinet_instances').select('id,label,notes').eq('room_id', WP).in('label', ['TC-03', 'TC-04', 'TC-05']))
for (const c of wc) {
  const ps = chk('cp', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', c.id))
  let sort = Math.max(...ps.map(p => p.sort_order ?? 0)), did = false
  for (const p of ps.filter(p => p.material_id === V33 && p.dz === 33)) {
    const { id: _i, created_at: _c, updated_at: _u, ...base } = p
    const m = { dz: 17, material_id: V17, material_override_id: V17 }
    let a, b, extra = null
    if (p.name.startsWith('Cover strip')) {
      const x0 = p.name.includes('corner') ? p.x - 1 : p.x - 0.5
      a = { ...m, x: x0, name: p.name + ' - layer 1 of 2 x 17' }; b = { ...m, x: x0 + 17, name: p.name + ' - layer 2 of 2 x 17' }
    } else if (p.name.startsWith('Nib gable')) {
      const panel = ps.find(q => q.name === 'Nib front panel')
      if (p.x === 0) {   // seen (recess) face at x 0: full at 0, strip at 17, front panel starts at 34
        a = { ...m, x: 0, name: 'Nib gable (recess side) - seen layer' }; b = { ...m, x: 17, z: 150, dx: 100, name: 'Nib gable - 100 build-up strip' }
        extra = { id: panel.id, patch: { x: 34, dx: 566 } }
      } else {            // seen face at x 600: strip at 566, full at 583, front panel 566
        a = { ...m, x: p.x + 16, name: 'Nib gable (recess side) - seen layer' }; b = { ...m, x: p.x - 1, z: 150, dx: 100, name: 'Nib gable - 100 build-up strip' }
        extra = { id: panel.id, patch: { dx: 566 } }
      }
    } else throw new Error('unexpected 33 part ' + c.label + ' ' + p.name)
    console.log(c.label, p.name, '->', JSON.stringify(a), JSON.stringify(b), extra ? JSON.stringify(extra.patch) : '')
    did = true
    if (DRY) continue
    chk('upd', await sb.from('cabinet_custom_parts').update(a).eq('id', p.id))
    chk('ins', await sb.from('cabinet_custom_parts').insert({ ...base, ...b, sort_order: ++sort }))
    if (extra) chk('panel', await sb.from('cabinet_custom_parts').update(extra.patch).eq('id', extra.id))
  }
  if (did) { touched[WP].push(c.label); if (!DRY) chk('note', await sb.from('cabinet_instances').update({ notes: (c.notes ?? '') + ' Mark 2026-11-25: 33 parts here = 2 x 17 AO laminated (34).' }).eq('id', c.id)) }
  else if (['TC-03', 'TC-04', 'TC-05'].includes(c.label)) touched[WP].push(c.label)
}
if (DRY) process.exit(0)

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => { console.log('dialog', d.message()); d.dismiss() })
const api = async (fn, ...a) => { const r = await Promise.race([page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message), sleep(90000).then(() => 'TIMEOUT')]); await sleep(1200); return r }
try {
  for (const [room, labels] of Object.entries(touched)) {
    const open = async () => { await page.goto(`http://localhost:3001/canvas/${room}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000) }
    await open()
    const st = await api('getState')
    for (const l of labels) { const c = st.cabinets.find(c => c.label === l); console.log('re-resolve', l, JSON.stringify(await api('updateCabinet', c.id, { dz: c.dz }))) }
    await open()
    for (const l of labels) {
      const c = st.cabinets.find(c => c.label === l), rp = await api('getResolved', c.id)
      for (const p of rp?.custom_parts ?? []) if (p.dz === 17 || p.dz === 33) console.log('  ', l, p.name, 'xyz', p.x, p.y, p.z, '|', p.dx, p.dy, p.dz, p.material_id?.slice(0, 8))
    }
    const issues = await api('getIssues'); let n = 0
    for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
    console.log('issues', n)
  }
} finally { await browser.close() }
