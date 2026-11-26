// RHK6614 Upstairs Living Storage WC-02 (Mark 2026-11-26): every shelf double thickness = two 18 fixed shelves stacked
// (zero-height section between). Clear gaps from the bench 602 / 340 / 340 / 342 (drawn 600 / 339 / 339 / 340).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = '65c69db5-2aba-49e0-81c8-95c559968aa2'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const open = { type: 'open', fittings: [] }
const kid = size => ({ size, separator: 'fixed_shelf', section: open })
const tree = { type: 'hsplit', children: [kid(602), kid(0), kid(340), kid(0), kid(340), kid(0), { section: open }] }
const { data: cab } = await sb.from('cabinet_instances').select('id,notes').eq('room_id', R).eq('label', 'WC-02').single()
let r = await sb.from('cabinet_instances').update({ internal_grid: { tree },
  notes: '#2 open shelving on the bench, Elegant Oak inside, no bottom, 3 double shelves (2 x 18 fixed stacked = 36), clear gaps 602/340/340/342 from the bench' }).eq('id', cab.id)
if (r.error) throw new Error(r.error.message)
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 120000 }); await sleep(4000)
  const api = (fn, ...a) => page.evaluate((fn, a) => window.__canvasApi[fn](...a), fn, a)
  console.log(JSON.stringify(await api('updateCabinet', 'WC-02', { dz: 400 }))); await sleep(4000)
  const iss = await api('getIssues'); console.log('issues', JSON.stringify(iss.filter(i => i.errors.length || i.warnings.length)))
} finally { await browser.close() }
const { data: parts } = await sb.from('internal_parts').select('part_type,y,dx,dy,dz').eq('cabinet_instance_id', cab.id).order('y')
for (const p of parts) console.log(p.part_type, 'y', p.y, `${p.dx}x${p.dy}x${p.dz}`)
process.exit(0)
