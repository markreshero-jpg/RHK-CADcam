// RHK6595 markup pass 2: reposition the markup-std notes that clashed (only rows tagged style.src = 'markup-std').
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb'
const M = 2960, MW = 30   // Wall 2 right margin (past Wall 3's hatch)
const geoms = {
  'BULKHEAD COLOUR TBC - TEAK / WINTER SKY / WHITE?': { at: { x: M, y: -2560 }, width: MW, leader: [{ x: 2600, y: -2390 }, { x: M - 40, y: -2535 }] },
  'BULKHEADS OVERSIZED - CUT TO SIZE ON SITE': { at: { x: M, y: -2300 }, width: MW },
  'OVERHEADS PUSH TO OPEN': { at: { x: M, y: -1900 }, width: MW, leader: [{ x: 2450, y: -1850 }, { x: M - 40, y: -1875 }] },
  'RECESSED LED STRIP UNDER OVERHEADS': { at: { x: M, y: -1650 }, width: MW, leader: [{ x: 2450, y: -1600 }, { x: M - 40, y: -1625 }] },
  'SINK ABEY LUA190PK LUCIA (DROP-IN, DRAWN U/M)\nTAP BLANCO LINUS-S 527700 SATIN PLATINUM': { at: { x: M, y: -1350 }, width: MW, leader: [{ x: 1790, y: -960 }, { x: M - 40, y: -1325 }] },
  'HANDLES: HANDLE HOUSE C138 MALENY SATIN NICKEL - SIZE TBC (DRAWN 128 CTS). BUILDER DRILLS + SUPPLIES': { at: { x: M, y: -720 }, width: MW, leader: [{ x: 1600, y: -880 }, { x: M - 40, y: -695 }] },
  'OVEN WESTINGHOUSE WVEP6716SD 600': { at: { x: 200, y: -1250 }, width: 30, leader: [{ x: 316, y: -700 }, { x: 150, y: -1225 }] },
  'DW (EXISTING FS 600)': { at: { x: 60, y: 2170 }, width: 25 },
}
const { data } = await sb.from('room_annotations').select('id,text,style').eq('room_id', R)
for (const r of data.filter(r => r.style?.src === 'markup-std' && geoms[r.text])) {
  const e = (await sb.from('room_annotations').update({ geom: geoms[r.text] }).eq('id', r.id)).error
  console.log(e?.message ?? 'moved ' + r.text.slice(0, 30))
}
