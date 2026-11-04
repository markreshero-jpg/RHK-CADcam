// Appliance spec block standard (Mark 2026-11-05): FRIDGE / FREEZER / MICROWAVE sections in the library block; empty fixture sections hide on fill.
// RHK6478 Kitchen MICROWAVE -> {microwaves}. Updates in place only.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (what, r) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data }
const B = '3b8c50df-f4de-4261-8153-c78cb9b6eb4f'
const blk = chk('blk', await sb.from('cad_blocks').select('items').eq('id', B).single())
const text = 'APPLIANCES + SINKS - {room}\n{job}\n\nSINK\n{sinks}\n\nTAPWARE\n{taps}\n\nOVENS\n{ovens}\n\nCOOKTOP\n{cooktops}\n\nRANGEHOOD\n{rangehoods}\n\nDISHWASHER\n{dishwashers}\n\nBIN\n{bins}\n\nFRIDGE\n{fridges}\n\nFREEZER\n{freezers}\n\nMICROWAVE\n{microwaves}\n\nOTHER APPLIANCES\n{appliances_other}'
chk('blk upd', await sb.from('cad_blocks').update({
  items: [{ ...blk.items[0], text }],
  description: 'Sinks + appliances spec for the plan: sink, tapware, ovens, cooktop, rangehood, dishwasher, bin, fridge, freezer, microwave, other. Live fields list the fixtures placed in the room (make, model, W x D x H); a section with nothing placed hides itself, typed text keeps it.',
}).eq('id', B))
const R = 'dd6c9440-6664-4e87-8ea9-4d88b7a9b1b6'
const ap = chk('ap', await sb.from('room_annotations').select('id,text').eq('room_id', R).eq('view', 'plan').contains('style', { block: 'Appliance spec block' }).single())
chk('ap upd', await sb.from('room_annotations').update({ text: ap.text.replace('MICROWAVE\n{appliances_other}', 'MICROWAVE\n{microwaves}') }).eq('id', ap.id))
console.log('ok')
