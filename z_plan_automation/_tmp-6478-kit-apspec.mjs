// RHK6478 Kitchen: Appliance spec block under the finishes Spec block; SITE NOTES box moved to the right (update in place, no deletes).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const R = 'dd6c9440-6664-4e87-8ea9-4d88b7a9b1b6', SPEC = 'a7fef8bf-25cf-4a36-8cd4-acc2c97b1e69', SITE = '5818d006-96b7-4cab-8ea0-e433a3b9d013'
const spec = chk('spec', await sb.from('room_annotations').select('geom').eq('id', SPEC).single())
const site = chk('site', await sb.from('room_annotations').select('geom').eq('id', SITE).single())
const { x, y } = spec.geom.at
// appliance block takes the site notes' old slot under the spec block; site notes go right of the spec block (80 wide at 1:25 = 2000 + 300 gap)
const apAt = { x, y: site.geom.at.y }
chk('site move', await sb.from('room_annotations').update({ geom: { ...site.geom, at: { x: x + 2300, y } } }).eq('id', SITE))
const text = 'APPLIANCES + SINKS - {room}\n{job}\n\nSINK\n{sinks}\n\nTAPWARE\n{taps}\n\nOVENS\n{ovens}\nNeff Z912BDY0 combination kit\n\nCOOKTOP\n{cooktops}\n\nRANGEHOOD\nFalmec Milano+ 90 Deep FP3MLD90S2 undermount, cut-out 824 x 330\n\nDISHWASHER\n{dishwashers}\n\nBIN\n{bins}\n\nOTHER APPLIANCES\nLiebherr IRBH5120 fridge + SIFNH5128 freezer, integrated, niche 1772-1788\n{appliances_other}'
const ex = chk('ex', await sb.from('room_annotations').select('id').eq('room_id', R).eq('view', 'plan').contains('style', { block: 'Appliance spec block' }))
const row = { room_id: R, view: 'plan', kind: 'text', geom: { at: apAt, width: 80 }, text, style: { size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35, block: 'Appliance spec block' } }
if (ex.length) chk('upd', await sb.from('room_annotations').update(row).eq('id', ex[0].id))
else chk('ins', await sb.from('room_annotations').insert({ ...row, sort_order: 3 }))
console.log('spec at', x, y, '| appliance block at', apAt, '| site notes at', x + 2300, y)
