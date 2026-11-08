// Add a "Site measure" CAD layer: shop list (cad_layers) + Construct Building job. Insert only.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); console.log(w, 'ok'); return r.data }
const shop = chk('shop list', await sb.from('cad_layers').select('name,sort_order'))
const L = { name: 'Site measure', color: '#0891b2', visible: true, print: false, is_default: false }
if (!shop.some(l => l.name === L.name)) chk('shop add', await sb.from('cad_layers').insert({ ...L, sort_order: Math.max(...shop.map(l => l.sort_order)) + 1 }))
const P = '0a44fc08-b762-451e-bc6b-db385ee34682'
const job = chk('job list', await sb.from('job_cad_layers').select('*').eq('project_id', P))
if (!job.some(l => l.name === L.name)) chk('job add', await sb.from('job_cad_layers').insert({ project_id: P, ...L, sort_order: Math.max(...job.map(l => l.sort_order)) + 1 }))
console.log(JSON.stringify(chk('job now', await sb.from('job_cad_layers').select('name,print,sort_order').eq('project_id', P).order('sort_order'))))
