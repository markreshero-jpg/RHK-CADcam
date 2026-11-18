// RHK6571 Kitchen rev 3 CAD: notes / dims follow the site measure changes (update in place; the two sink
// TBC clouds - automation-made, position now confirmed - removed). Mark's freehand site markups are left alone.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const U = async (id, patch) => chk(id.slice(0, 8), await sb.from('room_annotations').update(patch).eq('id', id))
const get = async id => chk('g', await sb.from('room_annotations').select('geom').eq('id', id).single()).geom

// D/W space moved up 485 (offset 1316.5 -> 1801.5).
const rect = await get('9cb58ac2-64d2-42d7-9809-268140cbc457')
await U('9cb58ac2-64d2-42d7-9809-268140cbc457', { geom: { ...rect, pts: rect.pts.map(p => ({ ...p, y: p.y - 485 })) } })
await U('ad7e5cef-1cd2-4c14-91f0-309e48400e5b', { geom: { ...(await get('ad7e5cef-1cd2-4c14-91f0-309e48400e5b')), at: { x: 2250, y: 1845 } } })
const er = await get('a446f9f5-3dcd-42aa-9b90-f2249a262576')
await U('a446f9f5-3dcd-42aa-9b90-f2249a262576', { geom: { ...er, pts: er.pts.map(p => ({ ...p, x: p.x + 485 })) } })
await U('fdc7c308-e98c-43fb-a067-567c85e65d2f', { geom: { ...(await get('fdc7c308-e98c-43fb-a067-567c85e65d2f')), at: { x: 1836.5, y: -700 } } })
// Sink: double bowl, centred on the BC-04 doors (confirmed) - clouds out.
await U('9ad4f7f7-9fae-4ac5-a7c9-1487a1261792', { text: 'U/M DOUBLE BOWL\nFIENZA KURO 68613\nCENTRED ON DOORS', geom: { ...(await get('9ad4f7f7-9fae-4ac5-a7c9-1487a1261792')), at: { x: 2250, y: 2700 } } })
await U('a9533050-abe1-4961-9ec2-10caa4673298', { text: 'U/M DOUBLE BOWL FIENZA KURO 68613\nCENTRED ON THE DOORS' })
for (const id of ['d768c511-7bdf-4e2d-af84-b505ed5c4a92', 'c210dc1f-8424-4cd6-9058-b57e98697aa6']) {
  const r = await sb.from('room_annotations').delete().eq('id', id); console.log('cloud', id.slice(0, 8), r.error?.message ?? 'deleted')
}
// Floor -> top of overheads dims: 2190 -> 2180.
for (const id of ['95df78b6-b50d-4bc9-9373-ba675472244a', '8d47d598-a22a-4ece-a333-7d09df76d05f', '8609f404-2c2e-4a8f-b331-f8031ccc6703']) {
  const g = await get(id); await U(id, { geom: { ...g, p2: { ...g.p2, y: -2180 } } })
}
// Rangehood: duct out the wall.
await U('28271d79-44aa-4eb1-9133-1439b85f001c', { text: 'SLIDE-OUT RANGEHOOD\nWESTINGHOUSE WRR626SB\nDUCT OUT THE WALL - 200 HOLE IN BACK' })
const ap = chk('ap', await sb.from('room_annotations').select('text').eq('id', '5eb158bd-9a0f-4b36-bee1-4d19302c932d').single()).text
await U('5eb158bd-9a0f-4b36-bee1-4d19302c932d', { text: ap.replace('Duct above the cabinet - by others', 'Duct out the back wall (200 hole in the cabinet back) - by others') })
// SITE NOTES + SITE QUESTIONS (answered).
await U('0c85e031-51c7-428e-a8ed-d9353d7361c5', { text: `SITE NOTES
Site measured 18/11/2026 (Mark)
El A 3977 wall to stairs, El B 2448 o/a
Bench 900: 140 kick + 740 carcass + 20 stone
Overheads 1470 to 2180 (710 high), beams @ 2190
No bulkheads, open above, ceiling 2400
El C brick line 2000 AFF - rangehood duct out the wall below it` })
await U('5eafff53-f20a-4e19-b5e8-2a063a29f95f', { text: `SITE QUESTIONS - KITCHEN - ANSWERED 18/11 (Mark on site)
1. Measured: El A 3977 wall to stairs (cabinets as drawn), El B 2448 o/a
2. Ceiling 2400 + beams @ 2190 - keep as drawn
3. Overheads drop 10: tops 2180, 710 high
4. Sink Fienza Kuro 68613 U/M double bowl, centred on BC-04 doors
5. El B: 450 drawers out, sink cabinet extended (2 doors), D/W next to the end panel
6. BC-09: inner drawer for cutlery
7. Rangehood duct out the wall below the 2000 brick line - 200 hole in WC-03 back
8. Still open: mixer (Geraldine ordered Coriander, drawn as standard gooseneck)` })
console.log('done')
