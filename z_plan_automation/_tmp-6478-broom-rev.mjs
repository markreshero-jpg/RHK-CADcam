// RHK6478 Darby 2026-11-11 + Mark: US Broom + DS Linen - fillers 30 -> 18 (Satin Board 18 2pac), fillers + gables + back to the floor,
// door stays 150 up (REVB 150), shelves locked at their old heights (+150), no bottom still. US Hallway Linen - fillers 30 -> 18.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) { console.log('ERR', t, r.error.message); process.exit(1) } return r.data }
const PAC = 'b07a7e40-facd-4cdf-8856-60712e940b44', F = 18
const filler = async (c, v) => {
  chk(c.label, await sb.from('cabinet_instances').update(v).eq('id', c.id))
  chk(c.label + ' cp', await sb.from('cabinet_custom_parts').update({ material_id: PAC, dz: 18, dx: F, ...(v.dy ? { dy: v.dy } : {}) }).eq('cabinet_instance_id', c.id).eq('name', 'Filler'))
  console.log(' ', c.label, JSON.stringify(v))
}
for (const [R, W] of [['f1953ab4-a03b-4439-a777-d39476156f31', 483], ['02ce23c0-9b53-454f-8bcf-f0f81daa1dc8', 481]]) {
  const cabs = chk('cabs', await sb.from('cabinet_instances').select('*').eq('room_id', R))
  const by = l => cabs.find(c => c.label === l)
  const t = by('TC-02')
  if (t.pos_z === 0) { console.log(R, 'already done'); continue }
  console.log('room', R.slice(0, 8))
  const H = t.dy + 150
  const ips = chk('ip', await sb.from('internal_parts').select('part_type,y').eq('cabinet_instance_id', t.id).eq('part_type', 'adj_shelf').order('y'))
  const ig = structuredClone(t.internal_grid)
  const fits = ig.tree.children[0].section.fittings
  if (fits.length !== ips.length) { console.log('shelf count mismatch'); process.exit(1) }
  fits.forEach((f, i) => { f.y_locked = true; f.y_position = Math.round((ips[i].y + 150) * 10) / 10 })
  const ro = structuredClone(t.rule_overrides)
  ro.REVB = 150
  for (const k of ['back', 'left_side', 'right_side']) ro.EDGING[k] = ro.EDGING[k].filter(s => s !== 'bottom')
  const notes = `${W - 2 * F} T2D single door, carcass to the floor (Darby 2026-11-11), door 150 up (REVB 150) for the robo vac, no bottom, shelves locked at the old heights`
  chk('TC-02', await sb.from('cabinet_instances').update({ pos_x: F, dx: W - 2 * F, pos_z: 0, dy: H, rule_overrides: ro, internal_grid: ig, notes }).eq('id', t.id))
  console.log('  TC-02', W - 2 * F, 'x', H, 'shelves', fits.map(f => f.y_position).join('/'))
  await filler(by('TC-01'), { dx: F, pos_z: 0, dy: H, notes: '18 2pac filler to the floor' })
  await filler(by('TC-03'), { pos_x: W - F, dx: F, pos_z: 0, dy: H, notes: '18 2pac filler to the floor' })
  const anns = chk('ann', await sb.from('room_annotations').select('id,text').eq('room_id', R).like('text', 'SPECIFICATIONS%'))
  for (const a of anns) chk('spec', await sb.from('room_annotations').update({ text: a.text
    .replace('18mm 2pac - colour TBC', '18mm 2pac - Dulux White Beach Quarter (25W)')
    .replace('No kick: whole cupboard + fillers\n150 off the floor (robo vac gap)', 'No kick: 18 fillers, gables + back to the floor\nDoor 150 off the floor (robo vac gap)')
    .replace('No bottom - open underneath\nGables + back edged on bottoms', 'No bottom - open underneath') }).eq('id', a.id))
}
// US Hallway Linen: 18 | 1041 pair | 520 single | 18 (1597)
{
  const R = 'b6377e60-bed3-4e5c-af80-7ea320db6ff5'
  const cabs = chk('cabs', await sb.from('cabinet_instances').select('*').eq('room_id', R))
  const by = l => cabs.find(c => c.label === l)
  if (by('TC-01').dx === F) console.log('hallway already done')
  else {
    console.log('room hallway')
    await filler(by('TC-01'), { dx: F, notes: '18 2pac filler (Darby 2026-11-11)' })
    chk('TC-02', await sb.from('cabinet_instances').update({ pos_x: 18, dx: 1041 }).eq('id', by('TC-02').id))
    chk('TC-03', await sb.from('cabinet_instances').update({ pos_x: 1059, dx: 520 }).eq('id', by('TC-03').id))
    await filler(by('TC-04'), { pos_x: 1579, dx: F, notes: '18 2pac filler (Darby 2026-11-11)' })
    const anns = chk('ann', await sb.from('room_annotations').select('id,text,geom').eq('room_id', R))
    for (const a of anns) {
      if (a.text === 'PTO') { const x = a.geom.at.x; chk('pto', await sb.from('room_annotations').update({ geom: { ...a.geom, at: { ...a.geom.at, x: x > 1000 ? x + 8 : x - 4 } } }).eq('id', a.id)) }
      if (/^SPECIFICATIONS/.test(a.text ?? '')) chk('spec', await sb.from('room_annotations').update({ text: a.text.replace('18mm 2pac - colour TBC', '18mm 2pac - Dulux White Beach Quarter (25W)') }).eq('id', a.id))
    }
    console.log('  TC-02 18 x 1041, TC-03 1059 x 520, TC-04 1579')
  }
}
process.exit(0)
