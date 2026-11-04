// RHK6478 CAD (Mark 2026-11-05) - insert only, never touches existing CAD:
// 1. WIP: Appliance spec block (library template, live fields) under the SITE NOTES box.
// 2. Guest Robe: X across the plumbing void (TC-03 duct box-out 300 x 200, back right corner) + "PLUMBING VOID" note with arrow.
// 3. Spec block (colours / thickness, template style) + SITE NOTES box (Site notes layer) on the plan of Bed 2, Bed 3, Guest Robe, Master WIR.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const WIP = 'cb47d462-90eb-4ba0-8e6e-ca4d978628ae', GUEST = '19f84132-6ed5-49b5-a0da-0f916966dcbb'
const box = { size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }
const plan = (R, rows) => rows.map((r, i) => ({ room_id: R, view: 'plan', sort_order: 80 + i, ...r }))
const wipAnn = chk('wip', await sb.from('room_annotations').select('kind,geom,text,style,cad_layer_id').eq('room_id', WIP).eq('view', 'plan'))
const SITE_L = wipAnn.find(x => /^SITE NOTES/.test(x.text ?? '')).cad_layer_id
console.log('site layer', SITE_L)

// 1. WIP appliance block
if (!wipAnn.some(x => x.style?.block === 'Appliance spec block')) {
  const tpl = chk('tpl', await sb.from('cad_blocks').select('items').eq('name', 'Appliance spec block').single()).items[0]
  chk('wip ins', await sb.from('room_annotations').insert(plan(WIP, [{ kind: 'text', geom: { at: { x: 3050, y: 1800 }, width: tpl.geom.width }, text: tpl.text, style: { ...tpl.style, block: 'Appliance spec block' } }])))
  console.log('WIP appliance block added')
}

// 2. Guest Robe plumbing void (plan: Wall 2 along y = 0, room +y)
const gAnn = chk('g', await sb.from('room_annotations').select('text').eq('room_id', GUEST))
if (!gAnn.some(x => x.text === 'PLUMBING VOID')) {
  const x0 = 866.5 + 555, x1 = 866.5 + 855, y0 = 0, y1 = 200
  const ln = { dash: 'solid', weight: 0.18 }
  chk('void', await sb.from('room_annotations').insert(plan(GUEST, [
    { kind: 'line', geom: { pts: [{ x: x0, y: y0 }, { x: x1, y: y1 }] }, style: ln },
    { kind: 'line', geom: { pts: [{ x: x0, y: y1 }, { x: x1, y: y0 }] }, style: ln },
    { kind: 'text', geom: { at: { x: 1250, y: 800 }, width: 40, leader: [{ x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, { x: 1400, y: 790 }] }, text: 'PLUMBING VOID',
      style: { size: 2.5, arrowSize: 1, arrowStart: 'closed', weight: 0.18 } },
  ])))
  console.log('Guest void added')
}

// 3. robe spec blocks + site notes
const ROBE = 'SPECIFICATIONS - {room}\n{job}\n\nCARCASS\n16mm Whiteboard\n\nPANELS, PLATES + KICK\n16.5mm Lx Sublime Teak Chalk\n\nDRAWERS\nInner drawers, Whiteboard\nDrawer box: {drawer_box}\n\nSLIDING DOORS\nSublime Teak Chalk finish, mirror inserts\nSliding door handles TBC'
const WIR = 'SPECIFICATIONS - {room}\n{job}\n\nCARCASS\n16.5mm Lx Sublime Teak Chalk inside + out (open, no doors)\n\nKICK + SHADOWS\nLx Sublime Teak Chalk\n\nISLAND\nDrawer fronts Lx Sublime Teak Chalk\nHandles TBA\nTop 20mm stone TBC\nDrawer box: {drawer_box}'
const ROOMS = [
  ['Bed 2 Robe', '761f434a-cdc8-4cb8-b1dc-da69ae78f12a', ROBE, 'SITE NOTES\n2709 between walls, 603 returns\nCeiling 2389 off slab - 20 = 2369 (20 floor allowance TBC)\nSliding doors not drawn yet'],
  ['Bed 3 Robe', '3ff6e510-bc3c-4249-9206-8939e7b8938e', ROBE, 'SITE NOTES\n2178 between walls, returns 1000 L / 606 R\nCeiling 2391 off slab - 20 = 2371 (20 floor allowance TBC)\nSliding doors not drawn yet'],
  ['Guest Robe', GUEST, ROBE, 'SITE NOTES\n1738 between walls, 603 returns\nCeiling 2419 off slab - 20 = 2399 (20 floor allowance TBC)\nPlumbing void back right corner, TC-03 boxed out 300 x 200 full height\nBuilders bulkhead / A/C grille TBC\nSliding doors not drawn yet'],
  ['Master WIR', 'e58340a6-4b68-4543-a1ca-a686b515a647', WIR, 'SITE NOTES\n3982 x 3588, door wall 1176 / 844 / 1962\nCeiling 2704 off slab - 20 = 2684 (20 floor allowance TBC)\n609 bulkhead at 2418 along the Elev 2 wall'],
]
for (const [name, R, spec, site] of ROOMS) {
  const ex = chk('ex', await sb.from('room_annotations').select('text,style').eq('room_id', R).eq('view', 'plan'))
  if (ex.some(x => x.style?.block === 'Spec block')) { console.log(name, 'already has a spec block - skipped'); continue }
  const walls = chk('w', await sb.from('walls').select('length,angle,pos_x,pos_y,thickness').eq('room_id', R))
  const xs = walls.flatMap(w => [w.pos_x, w.pos_x + w.length * Math.cos(w.angle * Math.PI / 180)])
  const ys = walls.flatMap(w => [w.pos_y, w.pos_y + w.length * Math.sin(w.angle * Math.PI / 180)])
  const X = Math.round(Math.max(...xs) + 700), Y = Math.round(Math.min(...ys))
  const specH = spec.split('\n').length * 95 + 200
  chk('ins', await sb.from('room_annotations').insert(plan(R, [
    { kind: 'text', geom: { at: { x: X, y: Y }, width: 80 }, text: spec, style: { ...box, block: 'Spec block' } },
    { kind: 'text', geom: { at: { x: X, y: Y + specH }, width: 95 }, text: site, style: box, cad_layer_id: SITE_L },
  ])))
  console.log(name, 'spec at', X, Y, 'site at', X, Y + specH)
}
