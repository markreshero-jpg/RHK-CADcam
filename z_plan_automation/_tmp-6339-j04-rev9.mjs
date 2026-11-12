// RHK6339 J04 rev 9 (Mark 2026-11-12): "DOOR JAMB" text up the side of each jamb (BC-04 / BC-05) on the Wall 2
// elevation, turned 90 (reads bottom to top), above the size labels and clear of Mark's leader arrows (1880 up).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'b2252689-fdc9-4fd7-be9a-f29853f0391e'
const chk = (t, r) => { if (r.error) throw new Error(t + ': ' + r.error.message); return r.data }
const ann = chk('ann', await sb.from('room_annotations').select('*').eq('room_id', R))
const tpl = ann.find(a => a.view === 'elevation' && (a.text ?? '').startsWith('A/C BOX'))
const TEXT = 'DOOR JAMB'
const old = ann.filter(a => a.text === TEXT || a.text === 'DOOR JAMB (EXISTING, BY OTHERS)')
const { id, created_at, updated_at, ...base } = tpl
const jambs = chk('j', await sb.from('cabinet_instances').select('label,pos_x,dx').eq('room_id', R).in('label', ['BC-04', 'BC-05']))
const rows = jambs.map(j => ({ ...base, text: TEXT, style: { ...(tpl.style ?? {}), size: 2.5, align: 'left' },
  // rot -90: text runs up from `at`, its height goes to the right -> at.x = jamb centre - half the text height (25).
  geom: { at: { x: Number(j.pos_x) + Number(j.dx) / 2 - 25, y: -1880 }, rot: -90 } }))
if (old.length) for (const [i, o] of old.entries()) chk('upd', await sb.from('room_annotations').update(rows[i]).eq('id', o.id))
else chk('ins', await sb.from('room_annotations').insert(rows))
console.log('ok', rows.map(r => JSON.stringify(r.geom)), 'tpl', tpl.view, tpl.wall_id, tpl.wall_side, JSON.stringify(tpl.style))
