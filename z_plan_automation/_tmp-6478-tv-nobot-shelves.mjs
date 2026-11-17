// RHK6478 DS TV Unit (2026-11-18): after Bottom Type 'none' the floor dropped 16.5 and the fixed shelves / adj shelves / WC-06
// dividers moved down with it. Bottom section of every column +16.5 (483.5 -> 500, 1283.5 -> 1300) so they sit where they were.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const IDS = ['57ee6f6e-4dfb-4d13-903e-d768ef8feffe', 'c9642c43-143c-4155-b321-f20e91704123', '1b818c12-977d-4933-bfce-a7f76e0893bd']
const { data: cabs } = await sb.from('cabinet_instances').select('id,label,room_id,dz,internal_grid').in('id', IDS)
const bump = n => { if (n?.type === 'hsplit') { if (n.children[0].size !== 483.5 && n.children[0].size !== 1283.5) throw new Error('unexpected ' + n.children[0].size); n.children[0].size += 16.5 } for (const c of n?.children ?? []) bump(c.section) }
for (const c of cabs) { const ig = structuredClone(c.internal_grid); bump(ig.tree); const { error } = await sb.from('cabinet_instances').update({ internal_grid: ig }).eq('id', c.id); if (error) throw error; console.log(c.label, 'bumped') }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${cabs[0].room_id}`, { waitUntil: 'domcontentloaded', timeout: 240000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 240000 }); await sleep(4000)
  for (const c of cabs) { await page.evaluate(([i, z]) => window.__canvasApi.updateCabinet(i, { dz: z }), [c.id, c.dz]); await sleep(1500) }
  const iss = await page.evaluate(() => window.__canvasApi.getIssues())
  for (const x of iss) for (const e of x.errors) console.log('ERROR', x.label, e.code, e.message)
} finally { await browser.close() }
for (const c of cabs) {
  const { data: ip } = await sb.from('internal_parts').select('part_type,y,dy,sort_order').eq('cabinet_instance_id', c.id).order('part_type').order('sort_order')
  console.log(c.label, ip.map(p => `${p.part_type}#${p.sort_order} y${Math.round(p.y * 10) / 10}`).join(', '))
}
process.exit(0)
