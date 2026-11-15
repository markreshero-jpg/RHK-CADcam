// RHK6478 Laundry PDR BC-07 (Mark 2026-11-16): drawer 350 long (Dragon Pro 350x178 Silk White, was 400) + shop-standard
// U plumbing cut-out in the bottom (180 w x 210 d from the back, R90, centred). Re-resolve via canvas, report the bottom outline.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const R = 'fc12bc7d-53ee-46ee-a302-3411f5129bcc', ID = '613185cc-1f68-4805-bd7b-866b83ea8bc9'
const { data: c } = await sb.from('cabinet_instances').select('hardware_overrides,part_cutouts,notes').eq('id', ID).single()
const u = { id: 'pl1', kind: 'notch', shape: 'rect', w: 180, d: 210, radius: 90, edge: 'back', x: { from: 'centre', off: 0 }, y: { from: 'back', off: 0 }, source: 'user' }
const { error } = await sb.from('cabinet_instances').update({
  hardware_overrides: { ...(c.hardware_overrides ?? {}), slide_id: '7bdc222b-4474-48a9-a056-7bd21846155c' },
  part_cutouts: { ...(c.part_cutouts ?? {}), db_0_0_db_bottom: [u] },
  notes: '# 22 PDR floating vanity drawer (no inner drawer), Chalk; 350 Dragon Pro + U plumbing cut-out 180 x 210 R90 (Mark 2026-11-16)',
}).eq('id', ID)
console.log('db', error?.message ?? 'ok')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 300000 })
const api = (page, fn, ...a) => page.evaluate((fn, a) => window.__canvasApi[fn](...a), fn, a)
try {
  const page = await browser.newPage(); page.on('dialog', d => d.dismiss())
  await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 120000 })
  await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(3000)
  await api(page, 'updateCabinet', 'BC-07', { dy: 340 }); await sleep(4000)
  const rp = await api(page, 'getResolved', 'BC-07')
  console.log('errors', JSON.stringify((rp?.errors ?? []).map(e => e.message)), 'warn', JSON.stringify((rp?.warnings ?? []).map(e => e.message)))
} finally { await browser.close() }
const { data: parts } = await sb.from('drawer_box_parts').select('part_key,DX:dx,DY:dy,outline').eq('cabinet_instance_id', ID)
for (const p of parts ?? []) console.log(p.part_key, p.DX, p.DY, p.outline ? `outline ${p.outline.length} pts` : '')
process.exit(0)
