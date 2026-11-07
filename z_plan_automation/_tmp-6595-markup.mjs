// RHK6595 Kitchen: standard markup (z_CAD_tool/MARKUP-STANDARD.md) - appliances / fixtures not drawn,
// TBC queries, site + install notes, colour callouts. INSERT ONLY (never touches Mark's notes); re-runnable:
// rows tagged style.src = 'markup-std' are skipped if their text already exists.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb'
const W2 = 'c1be3640-632d-4a30-94be-117287719f6d', W4 = '4d1a2dba-ccef-4002-b756-74b77b0e6704', W6 = 'a74ea87c-7876-436e-8bb8-2a88fceaffca'
const L = { general: 'd189db92-71d7-47fb-adcc-425cc8a2eac4', elec: '7b2856f1-1387-4939-8900-db2333a69663',
  site: 'b0dfb81c-b977-478b-a48e-782ba878d181', q: 'f9049b93-dbee-4a32-9876-19ceb37298b7' }
const T = { size: 2.5, align: 'center', src: 'markup-std' }
const elev = (wall, layer, kind, geom, text, style = {}) => ({ room_id: R, view: 'elevation', wall_id: wall, wall_side: 'face', cad_layer_id: layer, kind, geom, text, style: { ...T, ...style } })
const plan = (layer, kind, geom, text, style = {}) => ({ room_id: R, view: 'plan', cad_layer_id: layer, kind, geom, text, style: { ...T, ...style } })
const dashBox = { src: 'markup-std', dash: 'dashed', weight: 0.25 }
const cloud = { src: 'markup-std', weight: 0.25, cloudBump: 4 }
const rectPts = (x1, y1, x2, y2) => [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]

// Elevation frame: x = mm along the wall from its start (Wall 2 starts at the east end), y = -height.
const rows = [
  // --- Appliances / fixtures not drawn (General) ---
  elev(W2, L.general, 'rect', { a: { x: 2160, y: -40 }, b: { x: 2758.5, y: -850 } }, null, dashBox),
  elev(W2, L.general, 'text', { at: { x: 2190, y: -620 }, width: 27 }, 'DISHWASHER 608.5 SPACE\nRE-USING EXISTING FREESTANDING 600'),
  elev(W2, L.general, 'text', { at: { x: 1450, y: -1330 }, width: 34 }, 'SINK ABEY LUA190PK LUCIA (DROP-IN, DRAWN U/M)\nTAP BLANCO LINUS-S 527700 SATIN PLATINUM'),
  elev(W6, L.general, 'text', { at: { x: 16.5, y: -1400 }, width: 30, leader: [{ x: 316.5, y: -650 }, { x: 316.5, y: -1180 }] }, 'OVEN WESTINGHOUSE WVEP6716SD 600'),
  elev(W4, L.general, 'text', { at: { x: 1000, y: -1400 }, width: 30, leader: [{ x: 445, y: -1000 }, { x: 990, y: -1290 }] }, 'FRIDGE - EXISTING / BY OWNER\n890 SPACE x 1730 H'),
  plan(L.general, 'rect', { a: { x: 16.5, y: 2151 }, b: { x: 625, y: 2711 } }, null, dashBox),
  plan(L.general, 'text', { at: { x: 45, y: 2380 }, width: 27.5 }, 'DW (EXISTING FS 600)'),
  // --- Colour callouts (not in the title block) ---
  elev(W4, L.general, 'text', { at: { x: 1000, y: -2000 }, width: 30, leader: [{ x: 600, y: -1950 }, { x: 990, y: -1950 }] }, 'OPEN BOX + CUBBIES: SUBLIME TEAK 18'),
  // --- TBC / questions (Questions for Client) ---
  elev(W2, L.q, 'cloud', { pts: rectPts(0, -2335, 2780, -2445) }, null, cloud),
  elev(W2, L.q, 'text', { at: { x: 890, y: -2760 }, width: 50 }, 'BULKHEAD COLOUR TBC - TEAK / WINTER SKY / WHITE?'),
  elev(W2, L.q, 'text', { at: { x: -1000, y: -700 }, width: 40 }, 'HANDLES: HANDLE HOUSE C138 MALENY SATIN NICKEL - SIZE TBC (DRAWN 128 CTS). BUILDER DRILLS + SUPPLIES'),
  elev(W4, L.q, 'cloud', { pts: rectPts(0, -2161, 890, -2445) }, null, cloud),
  elev(W4, L.q, 'text', { at: { x: 1000, y: -2420 }, width: 30 }, 'BULKHEAD COLOUR TBC'),
  // --- Site / install (Site notes) ---
  elev(W2, L.site, 'text', { at: { x: 890, y: -2620 }, width: 50 }, 'BULKHEADS OVERSIZED - CUT TO SIZE ON SITE'),
  elev(W4, L.site, 'text', { at: { x: 1000, y: -2280 }, width: 30 }, 'BULKHEAD OVERSIZED - CUT ON SITE'),
  elev(W2, L.site, 'text', { at: { x: 1000, y: -2000 }, width: 40 }, 'OVERHEADS PUSH TO OPEN'),
  // --- Electrical ---
  elev(W2, L.elec, 'text', { at: { x: 900, y: -1560 }, width: 50 }, 'RECESSED LED STRIP UNDER OVERHEADS'),
  plan(L.elec, 'text', { at: { x: 1250, y: 1150 }, width: 75 }, 'PENDANT LIGHTS OVER ISLAND - OWNER SUPPLIED'),
]
const { data: have } = await sb.from('room_annotations').select('text,kind,wall_id,view,style').eq('room_id', R)
const key = r => [r.view, r.wall_id ?? '', r.kind, r.text ?? JSON.stringify(r.geom)].join('|')
const seen = new Set(have.filter(h => h.style?.src === 'markup-std').map(h => [h.view, h.wall_id ?? '', h.kind, h.text ?? ''].join('|')))
const todo = rows.filter(r => r.text == null ? !have.some(h => h.style?.src === 'markup-std' && h.kind === r.kind && h.wall_id === (r.wall_id ?? null) && h.view === r.view) : !seen.has(key(r)))
if (!todo.length) { console.log('nothing new'); process.exit(0) }
const { error } = await sb.from('room_annotations').insert(todo)
console.log(error?.message ?? `inserted ${todo.length}`)
