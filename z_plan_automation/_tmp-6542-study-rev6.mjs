// RHK6542 Study rev 6 (Mark 2026-11-03): WC-07 bulkhead stops flush with TC-06's carcass
// (was running over the TC-05 16.5 end panel): left end 2860 -> 2843.5, dx 2860 -> 2843.5.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: env.AUTOMATION_EMAIL, password: env.AUTOMATION_PASSWORD })
const chk = (w, r) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data }
const R = 'a81555f3-22f3-4efd-947b-4e083bf49c94'
const sleep = ms => new Promise(r => setTimeout(r, ms))
chk('wc07', await sb.from('cabinet_instances').update({ pos_x: 2843.5, dx: 2843.5 }).eq('room_id', R).eq('label', 'WC-07'))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run', '--disable-gpu'], protocolTimeout: 900000 })
try {
  const page = await browser.newPage(); await page.setExtraHTTPHeaders({ 'x-dev-automation': '1' })
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200))); page.on('dialog', d => { console.log('DIALOG', d.message()); d.dismiss() })
  await page.goto(`http://localhost:3001/canvas/${R}`, { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForFunction('!!window.__canvasApi', { timeout: 60000 }); await sleep(2500)
  const api = (fn, ...a) => page.evaluate(([f, a]) => window.__canvasApi[f](...a), [fn, a])
  await api('updateCabinet', 'WC-07', { dx: 2843.5 }); await sleep(2000)
  const st = await api('getState')
  for (const c of st.cabinets.filter(c => c.wall === 'Wall 5')) console.log(c.label, c.offset, c.dx, c.dy, c.dz)
  const rp = await api('getResolved', 'WC-07')
  console.log(JSON.stringify(rp.case_parts.map(p => [p.part_key, p.X, p.Y, p.Z, p.DX, p.DY, p.DZ])))
  const issues = await api('getIssues')
  console.log('errors', issues.reduce((a, c) => a + c.errors.length, 0))
} finally { await browser.close() }
