// RHK6595 WC-10 (Mark 2026-11-11): full-width shelves, no middle divider: one half-checked 6 x 3 grid
// (2 shelves 818 full width, 5 dividers full height, squares 121.3) instead of two 3 x 3 blocks + a middle divider.
// Arg: show | go. Before-state -> _tmp-6595-wc10-full-before.json.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const ID = '4fe005a9-0d87-4364-a726-c91ad372724d'
const { data: [c] } = await sb.from('cabinet_instances').select('internal_grid').eq('id', ID)
if (process.argv[2] === 'show') { console.log(JSON.stringify(c.internal_grid, null, 1)); process.exit(0) }
const BEFORE = 'z_plan_automation/_tmp-6595-wc10-full-before.json'
if (fs.existsSync(BEFORE)) throw new Error('already applied')
fs.writeFileSync(BEFORE, JSON.stringify(c))
const g = structuredClone(c.internal_grid)
const block = g.tree.children[0].section                    // hsplit, half_check, 3 rows of 3-col vsplits
const six = () => ({ type: 'vsplit', children: Array.from({ length: 6 }, (_, i) => (i < 5 ? { divider: 'single', section: { type: 'open', fittings: [] } } : { section: { type: 'open', fittings: [] } })) })
g.tree = { ...block, children: block.children.map(r => ({ ...r, section: six() })) }
const r = await sb.from('cabinet_instances').update({ internal_grid: g,
  notes: 'Wine rack over the fridge: one half-checked 6 x 3 grid, square cubbies 121.3, 2 shelves full width (no middle divider). 480 deep external (shelves 462), front flush, back 210 off the closure. Carcass as panel' }).eq('id', ID)
console.log('WC-10 6 x 3 one grid', r.error?.message ?? 'ok', JSON.stringify(g.tree).slice(0, 300))
