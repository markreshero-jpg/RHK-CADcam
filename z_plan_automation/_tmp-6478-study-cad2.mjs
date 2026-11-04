// RHK6478 Study CAD (Mark 2026-11-04): Wall 1 + Wall 3 elevation height dims (open shelf openings, overall AFF chains),
// cupboard shelf notes, spec block (colours only, template order + extras) + SITE NOTES box (Site notes layer) on the plan.
// Elevation coords: x = offset along the wall, y = -AFF. Overall heights come from the auto dims. Re-runnable: clears its own rows first (the earlier Wall 3 notes stay).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'a04663c7-1402-4344-be00-3ad4ce3aeae9', SITE_LAYER = '2931a12f-666e-4f16-9840-8a8b4e09da50'
const walls = chk('walls', await sb.from('walls').select('id,name').eq('room_id', R)), W = Object.fromEntries(walls.map(w => [w.name, w.id]))
const DIM = { size: 1.8, weight: 0.18 }, NOTE = { size: 2.5, align: 'center' }
const box = { size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }
const rows = []
const el = w => ({ room_id: R, view: 'elevation', wall_id: W[w], wall_side: 'face' })
const vchain = (w, x, spans, style = DIM) => { for (const [a, b] of spans) rows.push({ ...el(w), kind: 'dim', geom: { p1: { x, y: -a }, p2: { x, y: -b }, offset: 0, axis: 'y' }, style }) }
const note = (w, left, width, aff, text) => rows.push({ ...el(w), kind: 'text', geom: { at: { x: left + 30, y: -aff }, width: (width - 60) / 20 }, text, style: NOTE })
// clear-opening spans of a shelf box: bottom panel at base, shelf bottoms (cabinet Y), top panel, all t thick
const openings = (base, shelfYs, topY, t = 16.5) => { const out = []; let y = base + t; for (const s of [...shelfYs, topY]) { out.push([y, base + s]); y = base + s + t } return out.map(([a, b]) => [+a.toFixed(1), +b.toFixed(1)]) }

// ── Wall 1 (offset 0 = nib end): cupboards 100-867, 33 bench to 900, splash 900-1483, open shelves 1483-2383
const W1_OPEN = openings(1483, [294.5, 589], 883.5)            // 278 / 278 / 278
for (const [left] of [[240], [1100], [1958]]) vchain('Wall 1', left + 60, W1_OPEN)
note('Wall 1', 1958, 858, 380, 'PRINTER CUPBOARD')
note('Wall 1', 240, 2576, 1400, 'SPLASH PANEL 2 PAC - COLOUR TBC (ONE PIECE 2656)')
for (const [l, w] of [[240, 860], [1100, 858], [1958, 858]]) note('Wall 1', l, w, 2300, 'OPEN SHELF')

// ── Wall 3 (offset 0 = window wall): desk top 750, overheads 1500-2353 (under panels 1500-1516.5), 30 BH to 2383
const W3_OPEN = openings(1500, [278.833, 557.667], 836.5)      // 262.3 x 3, bottom on the under panel line
for (const left of [30, 1614, 3200]) vchain('Wall 3', left + 150, W3_OPEN)
for (const [l, w] of [[30, 792], [1614, 794], [3200, 792]]) note('Wall 3', l, w, 2300, 'OPEN SHELF')

// ── Plan: spec block + site notes, clear of the dims (x = wall end + 700)
const spec = 'SPECIFICATIONS - {room}\n{job}\n\nBENCHTOP\n33mm LX Sublime Teak\n\nDESK TOP\n6mm toughened glass (by RHK)\n\nFRONTS + PANELS\nLX Sublime Teak\n\nCARCASS\nWhiteboard - open boxes Sublime Teak inside\n\nSPLASH PANEL\n2 Pac - colour TBC'
const site = 'SITE NOTES\nBlock wall 2656 window wall to nib, top 2383; nib 190 x 503, stone cladding both sides (30-40, by others) - 50 filler at the nib\nBack wall 4022, plaster bulkhead u/s 2383; right wall 2427; window wall 2227, window 802 (sill / head not measured)\nCeiling 2715 - 20 floor allowance = 2695\nLV wire @ 1500 back / right corner'
rows.push({ room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 4722, y: 0 }, width: 80 }, text: spec, style: { ...box, block: 'Spec block' } })
rows.push({ room_id: R, view: 'plan', kind: 'text', geom: { at: { x: 4722, y: 1300 }, width: 95 }, text: site, cad_layer_id: SITE_LAYER, style: box })

// clear this script's earlier rows: elevation dims on Wall 1 / 3, its notes, the plan spec / site boxes
const mine = [...rows.filter(r => r.kind === 'text').map(r => r.text), '1 ADJ SHELF', '2 ADJ SHELVES', 'OPEN - 2 FIXED', 'PRINTER CUPBOARD - ADJ SHELF 450 OFF THE BOTTOM']
const old = chk('old', await sb.from('room_annotations').select('id,view,kind,text,style').eq('room_id', R))
const drop = old.filter(a => (a.view === 'elevation' && a.kind === 'dim') || mine.includes(a.text) || a.style?.block === 'Spec block' || /^SITE NOTES/.test(a.text ?? '')).map(a => a.id)
if (drop.length) chk('del', await sb.from('room_annotations').delete().in('id', drop))
const maxSort = Math.max(0, ...old.filter(a => !drop.includes(a.id)).map(() => 4))
chk('ins', await sb.from('room_annotations').insert(rows.map((r, i) => ({ ...r, sort_order: maxSort + i + 1 }))))
console.log('dropped', drop.length, 'inserted', rows.length, 'W1', JSON.stringify(W1_OPEN), 'W3', JSON.stringify(W3_OPEN))
