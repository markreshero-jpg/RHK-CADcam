// RHK6595 (Mark 2026-11-11): Kitchen spec block on the plan (library "Spec block" layout, colours only) + OVERHEADS 625 line.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'd113bd53-5e4a-4ded-9592-cc1f7bc0eecb', GENERAL = 'd189db92-71d7-47fb-adcc-425cc8a2eac4'
const ann = (await sb.from('room_annotations').select('id,text,sort_order').eq('room_id', R).eq('view', 'plan')).data
if (process.argv[2] !== 'bt' && ann.some(a => a.text?.startsWith('SPECIFICATIONS'))) throw new Error('spec block already there')
const text = [
  'SPECIFICATIONS - {room}', '{job}', '',
  'BENCHTOP', '{benchtop}', '',
  'FRONTS + PANELS', '{fronts}', 'Island back cupboards, wine rack + bulkheads: Sublime Teak', 'Kicks match the cupboards above', '',
  'HANDLES', 'Handle House C138 Maleny satin nickel, size TBC - supplied + drilled on site by the builder', 'Overheads + island back: push to open', '',
  'CARCASS', '{carcass}', '',
  'OVERHEADS', '625 above benchtop to underside',
].join('\n')
const r = process.argv[2] === 'bt' ? { data: [{ id: 'skip' }] } : await sb.from('room_annotations').insert({
  room_id: R, view: 'plan', kind: 'text', cad_layer_id: GENERAL, text,
  geom: { at: { x: 3700, y: -400 }, width: 80 },
  style: { src: 'markup-std', size: 2.5, bgPad: 2, block: 'Spec block', border: 'box', lineSpacing: 1.3, borderWeight: 0.35 },
  sort_order: Math.max(0, ...ann.map(a => a.sort_order ?? 0)) + 1,
}).select('id')
console.log('spec block', r.error?.message ?? r.data[0].id)
// Fix (same day): {benchtop} filled '-' for this room; typed instead (colour not given anywhere yet).
if (process.argv[2] === 'bt') {
  const { data: [a] } = await sb.from('room_annotations').select('id,text').eq('id', '8391e25d-eddc-4f98-8dd8-790f5da43bd9')
  const r2 = await sb.from('room_annotations').update({ text: a.text.replace('{benchtop}', '20mm Stone - colour TBC') }).eq('id', a.id)
  console.log('benchtop line', r2.error?.message ?? 'ok')
}
