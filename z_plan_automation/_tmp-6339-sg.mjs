// RHK6339 (Mark 2026-11-18): all veneer -> Spotted Gum, Qld Variety, FSC sourced, in every room.
// Native colour model (z_material_colours): new colour rows under the Veneer 17mm / Veneer 33mm boards + matching
// tapes, a Spotted Gum door colour in the Veneer 17mm Colour Range (job fronts), job exposed grid, cabinet
// material_overrides + custom parts repointed, every cabinet re-resolved, CAD text edited in place.
// Solid timber Blackbutt (35 tops, J02 timber pulls) is NOT veneer - left. Idempotent.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const P = 'cf31069b-1a56-49ee-91df-dade35f68fde', RANGE = '36a53373-209f-401e-8e71-cfe46c7cefd2', BB_DOOR = 'b5c7f263-7968-41e7-89be-2d9d36029aec'
const COLOUR = 'Spotted Gum Qld Variety FSC', FACE = '#a08466'
const SRC = [ // Blackbutt colour row + its matching tape
  { mat: '0bed0f26-d551-4c03-ba6a-fd7f3309b6ad', tape: 'c8046201-5e80-41a4-9696-d02d7ee10b32' },
  { mat: 'fca041dc-30b7-469e-9e14-d8d3aae38a57', tape: '579bc59a-744a-434c-8d36-0d74b29b98ce' },
]
const map = {}   // old id -> new id (materials + tapes)
for (const s of SRC) {
  const bb = chk('bb', await sb.from('materials').select('*').eq('id', s.mat).single())
  let sg = (await sb.from('materials').select('id,name').eq('parent_id', bb.parent_id).eq('colour_name', COLOUR).maybeSingle()).data
  if (!sg) {
    const { id: _i, created_at: _c, updated_at: _u, name: _n, ...row } = bb
    sg = chk('ins mat', await sb.from('materials').insert({ ...row, name: 'tmp', colour_name: COLOUR, colour_code: 'VEN_SPOTTEDGUM_QLD_FSC', is_default_colour: false,
      face_colour: FACE, back_colour: FACE, edge_colour: FACE, notes: 'Spotted Gum veneer, Queensland variety, FSC sourced (RHK6339, Mark 2026-11-18).' }).select('id,name').single())
  }
  map[s.mat] = sg.id
  const t = chk('tape', await sb.from('edge_banding').select('*').eq('id', s.tape).single())
  const tname = t.name.replace('Blackbutt', 'Spotted Gum Qld FSC')
  let nt = (await sb.from('edge_banding').select('id').eq('name', tname).maybeSingle()).data
  if (!nt) {
    const { id: _i, created_at: _c, updated_at: _u, ...row } = t
    nt = chk('ins tape', await sb.from('edge_banding').insert({ ...row, name: tname, color: FACE, material_match_id: sg.id, notes: (t.notes ?? '').replace('Blackbutt', 'Spotted Gum (Qld Variety, FSC sourced)') }).select('id').single())
  }
  map[s.tape] = nt.id
  console.log(sg.name, '<-', bb.name, '| tape', tname)
}
// door colour in the Veneer 17mm Colour Range -> the job's fronts
let dc = (await sb.from('door_schedule_materials').select('id').eq('schedule_id', RANGE).eq('colour_name', COLOUR).maybeSingle()).data
if (!dc) {
  const bb = chk('dc', await sb.from('door_schedule_materials').select('*').eq('id', BB_DOOR).single())
  const { id: _i, created_at: _c, updated_at: _u, ...row } = bb
  dc = chk('ins dc', await sb.from('door_schedule_materials').insert({ ...row, colour_name: COLOUR, colour_code: 'VEN17_SPOTTEDGUM_QLD_FSC', material_id: map[SRC[0].mat], edgeband_id: map[SRC[0].tape], is_default: false, sort_order: 30 }).select('id').single())
}
chk('proj', await sb.from('projects').update({ base_door_colour_id: dc.id, wall_door_colour_id: dc.id, tall_door_colour_id: dc.id }).eq('id', P))
const rooms = chk('rooms', await sb.from('rooms').select('id,name,base_door_colour_id,wall_door_colour_id,tall_door_colour_id').eq('project_id', P))
for (const r of rooms) {
  const u = Object.fromEntries(['base_door_colour_id', 'wall_door_colour_id', 'tall_door_colour_id'].filter(k => r[k] === BB_DOOR).map(k => [k, dc.id]))
  if (Object.keys(u).length) chk('room dc', await sb.from('rooms').update(u).eq('id', r.id))
}
// job / room exposed grid
const swap = v => map[v] ?? v
for (const t of ['job_materials', 'room_materials']) {
  const rows = chk(t, await sb.from(t).select('id,material_id').in('material_id', Object.keys(map)))
  for (const row of rows) chk(t, await sb.from(t).update({ material_id: swap(row.material_id) }).eq('id', row.id))
  console.log(t, rows.length)
}
// cabinet overrides + notes + custom parts
const cabs = chk('cabs', await sb.from('cabinet_instances').select('id,label,room_id,material_overrides,notes').in('room_id', rooms.map(r => r.id)))
for (const c of cabs) {
  const mo = Object.fromEntries(Object.entries(c.material_overrides ?? {}).map(([k, v]) => [k, swap(v)]))
  const notes = c.notes ? c.notes.replace(/veneer Blackbutt/gi, 'veneer Spotted Gum (Qld Variety, FSC)') : c.notes
  if (JSON.stringify(mo) !== JSON.stringify(c.material_overrides ?? {}) || notes !== c.notes) { chk('cab', await sb.from('cabinet_instances').update({ material_overrides: mo, notes }).eq('id', c.id)); console.log('cab', c.label) }
}
const cps = chk('cps', await sb.from('cabinet_custom_parts').select('id,name,material_id,material_override_id,edge_band_id').in('cabinet_instance_id', cabs.map(c => c.id)))
for (const p of cps) {
  const u = { material_id: swap(p.material_id), material_override_id: p.material_override_id && swap(p.material_override_id), edge_band_id: p.edge_band_id && swap(p.edge_band_id) }
  if (u.material_id !== p.material_id || u.material_override_id !== p.material_override_id || u.edge_band_id !== p.edge_band_id) { chk('cp', await sb.from('cabinet_custom_parts').update(u).eq('id', p.id)); console.log('custom part', p.name) }
}
// CAD text: veneer lines only (solid timber Blackbutt stays)
const VEN = 'Spotted Gum Qld Variety, FSC sourced'
const ann = chk('ann', await sb.from('room_annotations').select('id,text').in('room_id', rooms.map(r => r.id)).ilike('text', '%blackbutt%'))
for (const a of ann) {
  const t = a.text.replace(/Veneer Blackbutt/g, 'Veneer ' + VEN).replace(/VENEER BLACKBUTT/g, 'VENEER ' + VEN.toUpperCase())
  if (t !== a.text) { chk('ann', await sb.from('room_annotations').update({ text: t }).eq('id', a.id)); console.log('CAD', a.id.slice(0, 8)) }
}
// re-resolve every cabinet, room by room
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => d.dismiss())
try {
  for (const r of rooms) {
    await page.goto(`http://localhost:3001/canvas/${r.id}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
    const api = async (fn, ...a) => { const x = await page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a]).catch(e => 'ERR ' + e.message); await sleep(1200); return x }
    const st = await api('getState')
    for (const c of st.cabinets) await api('updateCabinet', c.label, { dz: c.dz })
    await sleep(3000)
    for (const ci of await api('getIssues')) for (const e of [...ci.errors, ...ci.warnings]) console.log('  !', r.name, ci.label, e.code, e.message.slice(0, 120))
    console.log(r.name, st.cabinets.length, 'cabinets re-resolved')
  }
} finally { await browser.close() }
console.log(JSON.stringify(map))
