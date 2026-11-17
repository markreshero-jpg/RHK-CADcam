// RHK6571 Kitchen: SITE QUESTIONS text box (plan view, Questions for Client layer), below the SITE NOTES box. Insert only; skips if one exists.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = '5a1ef0f2-d86e-4c67-8b0e-df4a80dd09c3', Q = '7eef1e0d-6dff-4b8d-a6fe-1c7ec974f676'
const box = { size: 2.5, bgPad: 2, border: 'box', lineSpacing: 1.3, borderWeight: 0.35 }
const text = `SITE QUESTIONS - KITCHEN
1. Full site measure - all drawn from the Bunnings plan (El A 2440, El B 2500, El C 1785)
2. Ceiling height (drawn 2400) + beams: positions, widths, underside 2190?
3. Walls plumb / square, floor level for the 140 kick - services capped after rip-out?
4. Sink Fienza Kuro U/M - position over BC-04 (centred on door, drawn 80 off wall) - confirm
5. Mixer = our standard gooseneck (Geraldine sent Linkware Elle) - client OK?
6. Sink waste + water positions - clear of the blind corner / drawers?
7. Fridge space 669 W (drawn) - fridge model + size, height clear under WC-09?
8. D/W space 610 - LG XD4B24PS power / water / waste positions
9. Oven + cooktop power - separate circuits / isolator location
10. Rangehood WRR626SB in WC-03 (600): duct route above the cabinet + power point in cupboard
11. El A 475 carcass on 500 top - walkway to stairs OK?
12. 3 waterfalls + El A fridge end (variation) - confirm ends
13. Splashback - tiles / glass / stone, by whom? Power points + switch positions
14. Temporary benchtop needed before 8/12? Install access (stairs)`
const rows = chk('a', await sb.from('room_annotations').select('id,geom,text').eq('room_id', R).eq('view', 'plan').eq('kind', 'text'))
if (rows.some(r => (r.text ?? '').startsWith('SITE QUESTIONS'))) { console.log('already has SITE QUESTIONS, skipped'); process.exit(0) }
const site = rows.find(r => (r.text ?? '').startsWith('SITE NOTES'))
const at = { x: site.geom.at.x, y: site.geom.at.y + (site.text.split('\n').length + 3) * 110 }
chk('ins', await sb.from('room_annotations').insert({ room_id: R, view: 'plan', kind: 'text', geom: { at, width: 80 }, text, cad_layer_id: Q, style: box, sort_order: 100 }))
console.log('inserted at', JSON.stringify(at))
