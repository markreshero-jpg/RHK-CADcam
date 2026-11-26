// RHK6478 Master WIR TC-14 (Mark 2026-11-26): dividers stop under the top cube row so they fit the 2415 Teak sheet.
// Interior tree -> hsplit [ 3 columns x 7 rows | full-width fixed shelf | 3 columns top row (locked 300.6875) ].
// Top-row dividers: screwed down from the top, biscuit-jointed into the shelf below by hand. Run: node ... go
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'e58340a6-4b68-4543-a1ca-a686b515a647'
const { data: c, error } = await sb.from('cabinet_instances').select('id,label,dy,dz,internal_grid,split').eq('room_id', R).eq('label', 'TC-14').single()
if (error) throw error
const tree = c.internal_grid.tree
if (tree.type !== 'vsplit' || tree.children.length !== 3 || tree.children.some(ch => ch.section.type !== 'hsplit' || ch.section.children.length !== 8)) { console.log('tree changed', JSON.stringify(tree).slice(0, 300)); process.exit(1) }
const open = () => ({ type: 'open', fittings: [] })
const lowerCols = tree.children.map(ch => {
  const rows = ch.section.children.slice(0, 7).map(r => ({ ...r }))
  delete rows[6].separator
  return { ...(ch.divider ? { divider: ch.divider } : {}), section: { type: 'hsplit', children: rows } }
})
const inner = c.dy - 2 * 16.5, row = (inner - 7 * 16.5) / 8
const newTree = { type: 'hsplit', children: [
  { section: { type: 'vsplit', children: lowerCols }, separator: 'fixed_shelf' },
  { section: { type: 'vsplit', children: tree.children.map(ch => ({ ...(ch.divider ? { divider: ch.divider } : {}), section: open() })) }, size: row },
] }
console.log('top row', row, JSON.stringify(newTree).slice(0, 400))
if (process.argv[2] !== 'go') { console.log('dry run - pass go'); process.exit(0) }
fs.writeFileSync('z_plan_automation/_tmp-6478-wir-tc14-div.backup.json', JSON.stringify(c.internal_grid))
const { error: e } = await sb.from('cabinet_instances').update({ internal_grid: { ...c.internal_grid, tree: newTree } }).eq('id', c.id)
if (e) throw e
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); page.on('dialog', d => d.dismiss()); page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)))
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 240000 }); await sleep(6000)
  await page.evaluate(([i, z]) => window.__canvasApi.updateCabinet(i, { dz: z }), [c.id, c.dz]); await sleep(5000)
  const rp = await page.evaluate(() => window.__canvasApi.getResolved('TC-14'))
  for (const p of rp.internal_parts.filter(p => /divider|shelf/.test(p.part_type)).sort((a, b) => a.Y - b.Y || a.X - b.X))
    console.log(p.part_type, 'X', +p.X.toFixed(1), 'Y', +p.Y.toFixed(2), 'DX', +p.DX.toFixed(1), 'DY', +p.DY.toFixed(2))
  const iss = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const x of iss) for (const e of [...x.errors, ...x.warnings]) console.log('ISSUE', x.label, e.code, e.message)
} finally { await browser.close() }
process.exit(0)
