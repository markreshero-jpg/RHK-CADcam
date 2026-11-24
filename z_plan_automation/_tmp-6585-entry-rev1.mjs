// RHK6585 Entry Bench Seat rev 1 (Mark 2026-11-24): ply top (33) + 2 flap-down doors OK; hat hooks supplied + fitted by others;
// VJ panel full width; ceiling 2400 for now - check at site measure. Own markup text edited in place; the answered cloud removed.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = 'e08d668d-d8b5-406a-bb2f-72671848b0a3', P = 'b34da912-850c-4695-86a7-f33138d09cd3'
const mine = chk('a', await sb.from('room_annotations').select('id,kind,text,style,cad_layer_id').eq('room_id', R)).filter(a => a.style?.src === 'markup-std')
const G = chk('l', await sb.from('job_cad_layers').select('id').eq('project_id', P).eq('name', 'General').single()).id
const set = async (startsWith, fn, extra = {}) => {
  const hit = mine.filter(a => a.text?.startsWith(startsWith))
  if (hit.length !== 1) { console.log('SKIP (', hit.length, 'rows):', startsWith); return }
  const text = fn(hit[0].text)
  if (text === hit[0].text && !Object.keys(extra).length) { console.log('unchanged:', startsWith); return }
  chk('u', await sb.from('room_annotations').update({ text, ...extra }).eq('id', hit[0].id)); console.log('updated:', startsWith)
}
await set('SPECIFICATIONS', t => t.replace('Plywood - thickness TBC', '33mm plywood'))
await set('SITE NOTES', t => t.replace('Ceiling height NOT measured (2400 drawn) - check on site', 'Ceiling 2400 for now - CHECK CEILING HEIGHT AT SITE MEASURE')
  .replace('VJ panel for the wall above: supplied raw by RHK, no fitting, painted by others', 'VJ panel full width (1700) on the wall above: supplied raw by RHK, no fitting, painted by others\nHat hooks supplied + fitted by others'))
await set('VJ PANELLING', () => 'VJ PANELLING TO THE WALL ABOVE - FULL WIDTH\nSUPPLIED RAW BY RHK (NO FITTING) - PAINTED BY OTHERS')
await set('HAT HOOKS', () => 'HAT HOOKS SUPPLIED + FITTED BY OTHERS', { cad_layer_id: G })
await set('TO CONFIRM', () => 'TO CONFIRM\n1. VJ panel height')
const clouds = mine.filter(a => a.kind === 'cloud')
if (clouds.length) { chk('dc', await sb.from('room_annotations').delete().in('id', clouds.map(c => c.id))); console.log('removed clouds', clouds.length) }

const p = 'z_plan_automation/layouts/rhk6585-jojo-entry-bench-seat.json', j = JSON.parse(fs.readFileSync(p, 'utf8'))
if (!j._notes.some(n => n.startsWith('REV 1'))) {
  j._notes.push('REV 1 (Mark 2026-11-24): 33 ply top + 2 flap-down doors OK as drawn; hat hooks supplied + fitted by others; VJ panel full width; ceiling 2400 for now - check at the site measure (_tmp-6585-entry-rev1.mjs).')
  fs.writeFileSync(p, JSON.stringify(j, null, 1) + '\n')
}
const a = chk('p', await sb.from('projects').select('ai_notes').eq('id', P).single()).ai_notes
if (!a.includes('BENCH SEAT REV 1')) chk('ai', await sb.from('projects').update({ ai_notes: a + ' BENCH SEAT REV 1 (Mark 24/11/2026): 33 ply top + 2 flap-down doors OK; hat hooks supplied + fitted by others; VJ panel full width (height not given); ceiling 2400 for now - CHECK AT SITE MEASURE.' }).eq('id', P))
console.log('layout + ai_notes done'); process.exit(0)
