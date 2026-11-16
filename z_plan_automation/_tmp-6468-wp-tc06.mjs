// RHK6468 Wall Panelling TC-06 (Mark 2026-11-16 "make TC-06 door panel, split in middle"): 2220 wide = two equal leaves
// 1108.5 + 3 gap + 1108.5, each 2 x 9 American Oak veneer skins on the 19x38 RHS alu frame (56), 2335 high, 10 off the floor.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const R = '00e46b73-13de-4df3-9235-871505d4ee81', V9 = '8d025cc1-f49e-42e4-87d1-1408c82b0670'
const cabs = chk('c', await sb.from('cabinet_instances').select('id,label').eq('room_id', R).in('label', ['TC-01', 'TC-06']))
const tc06 = cabs.find(c => c.label === 'TC-06'), tc01 = cabs.find(c => c.label === 'TC-01')
if (chk('p', await sb.from('cabinet_custom_parts').select('id').eq('cabinet_instance_id', tc06.id)).length) throw new Error('TC-06 has parts')
const { id, created_at, updated_at, ...base } = chk('t', await sb.from('cabinet_custom_parts').select('*').eq('cabinet_instance_id', tc01.id).eq('name', 'Panel A1').single())
const W = 1108.5, rows = []
for (const [leaf, x] of [['left', 0], ['right', W + 3]]) for (const [face, z] of [['hall face', 47], ['media face', 0]])
  rows.push({ ...base, cabinet_instance_id: tc06.id, name: `Slider ${leaf} leaf skin - ${face}`, orientation: 'front', x, y: 10, z, dx: W, dy: 2335, dz: 9,
    expressions: {}, material_id: V9, material_override_id: V9, edge_top: false, edge_bottom: false, edge_left: false, edge_right: false, sort_order: rows.length })
chk('ins', await sb.from('cabinet_custom_parts').insert(rows))
chk('note', await sb.from('cabinet_instances').update({ notes: 'MEDIA CAVITY SLIDING DOOR (Mark 2026-11-16): 2220 wide, split in the middle = 2 leaves 1108.5 + 3 gap + 1108.5, 2335 high, 10 off the floor. Core = aluminium frame 19x38 RHS (not modelled), lined both faces in 9mm American Oak veneer = 56 thick. Face inset 60 behind the panel face. Track / edges TBC - Mark to draw the slider detail.' }).eq('id', tc06.id))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 600000 })
const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
page.on('dialog', d => d.dismiss())
try {
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  console.log(JSON.stringify(await page.evaluate(() => window.__canvasApi.updateCabinet('TC-06', { dz: 56 })))); await sleep(2000)
  const rp = await page.evaluate(id => window.__canvasApi.getResolved(id), tc06.id)
  for (const p of rp?.custom_parts ?? []) console.log('  ', p.name, p.x, p.y, p.z, '|', p.dx, p.dy, p.dz)
  const issues = await page.evaluate(() => window.__canvasApi.getIssues()); let n = 0
  for (const ci of issues) for (const e of [...ci.errors, ...ci.warnings]) { n++; console.log(`  ${ci.label} ${e.code}: ${e.message}`) }
  console.log('issues', n)
} finally { await browser.close() }
